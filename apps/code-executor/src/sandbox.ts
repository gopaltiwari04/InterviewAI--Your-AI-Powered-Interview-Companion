/**
 * Thin wrapper around the Docker CLI that runs untrusted code in a locked-down
 * container. Arguments are always passed as an array (never through a shell on
 * the host), and every container is created with:
 *
 *   --network none                 no network access at all
 *   --read-only                    immutable root filesystem
 *   --tmpfs /box, /tmp             small writable scratch space, nothing from the host is mounted
 *   --user 65534:65534             runs as "nobody", never root
 *   --cap-drop ALL                 no Linux capabilities
 *   --security-opt no-new-privileges
 *   --memory / --memory-swap       hard memory cap without swap
 *   --cpus, --pids-limit           CPU share and fork-bomb protection
 *   --ulimit nofile/fsize/core     file descriptor, file size and core dump limits
 *   SANDBOX_RUNTIME (optional)     e.g. "runsc" for gVisor, a much stronger boundary
 *
 * Docker on its own is NOT a complete security boundary (the kernel is shared);
 * see docs/SECURITY.md for the remaining risks and how to harden further.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export const SANDBOX_LABEL = "interviewai.sandbox";
const CREATED_LABEL = "interviewai.created";

export interface SandboxConfig {
  dockerBin: string;
  runtime?: string;
  cpus: number;
  pidsLimit: number;
  lifetimeSeconds: number;
}

export interface ExecOptions {
  stdin?: string;
  /** Hard wall-clock limit enforced inside the container with `timeout -s KILL`. */
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes?: number;
}

export interface ExecOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timeMs: number;
  /** The process printed more than maxStdoutBytes; the sandbox was destroyed. */
  outputLimitExceeded: boolean;
  /** The docker client itself had to be killed (the in-container timeout did not fire). */
  watchdogFired: boolean;
}

export class SandboxError extends Error {}

interface RawResult {
  code: number | null;
  stdout: string;
  stderr: string;
  stdoutOverflow: boolean;
  timedOut: boolean;
}

function runDocker(
  bin: string,
  args: string[],
  opts: { stdin?: string; timeoutMs: number; maxStdout?: number; maxStderr?: number },
): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const maxStdout = opts.maxStdout ?? 1024 * 1024;
    const maxStderr = opts.maxStderr ?? 64 * 1024;
    let stdout = "";
    let stderr = "";
    let stdoutOverflow = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    let stdoutBytes = 0;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      if (stdoutOverflow) return;
      stdoutBytes += Buffer.byteLength(chunk);
      stdout += chunk;
      if (stdoutBytes > maxStdout) {
        stdoutOverflow = true;
        stdout = stdout.slice(0, maxStdout);
        child.kill("SIGKILL");
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      if (stderr.length < maxStderr) stderr += chunk.slice(0, maxStderr - stderr.length);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new SandboxError(`docker could not be started: ${err.message}`));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr, stdoutOverflow, timedOut });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(opts.stdin ?? "");
  });
}

export class Sandbox {
  private destroyed = false;

  private constructor(
    readonly name: string,
    private readonly config: SandboxConfig,
  ) {}

  static async create(image: string, memoryMb: number, config: SandboxConfig): Promise<Sandbox> {
    const name = `ia-sbx-${randomUUID()}`;
    const args = [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "--label",
      `${SANDBOX_LABEL}=1`,
      "--label",
      `${CREATED_LABEL}=${Date.now()}`,
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/box:rw,exec,nosuid,nodev,size=64m,mode=1777",
      "--tmpfs",
      "/tmp:rw,exec,nosuid,nodev,size=64m,mode=1777",
      "--workdir",
      "/box",
      "--user",
      "65534:65534",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      `${memoryMb}m`,
      "--memory-swap",
      `${memoryMb}m`,
      "--cpus",
      String(config.cpus),
      "--pids-limit",
      String(config.pidsLimit),
      "--ulimit",
      "nofile=256:256",
      "--ulimit",
      "fsize=67108864:67108864",
      "--ulimit",
      "core=0:0",
      "--ulimit",
      "stack=67108864:67108864",
      "--env",
      "HOME=/tmp",
      "--env",
      "PYTHONDONTWRITEBYTECODE=1",
      "--env",
      "PYTHONUNBUFFERED=1",
      ...(config.runtime ? ["--runtime", config.runtime] : []),
      image,
      "sleep",
      String(config.lifetimeSeconds),
    ];
    // Generous timeout: the first run on a fresh host may pull the image.
    const res = await runDocker(config.dockerBin, args, { timeoutMs: 180_000 });
    if (res.code !== 0) {
      throw new SandboxError(`could not start sandbox (${image}): ${res.stderr.trim().slice(0, 500) || `exit ${res.code}`}`);
    }
    return new Sandbox(name, config);
  }

  async writeFile(fileName: string, content: string): Promise<void> {
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(fileName)) throw new SandboxError(`invalid file name ${fileName}`);
    // The file name is passed as a positional argument ($1), never interpolated into the script.
    const res = await runDocker(this.config.dockerBin, ["exec", "-i", this.name, "sh", "-c", 'cat > "/box/$1"', "sh", fileName], {
      stdin: content,
      timeoutMs: 15_000,
    });
    if (res.code !== 0) throw new SandboxError(`could not write ${fileName}: ${res.stderr.trim().slice(0, 300)}`);
  }

  async exec(command: string[], opts: ExecOptions): Promise<ExecOutcome> {
    if (this.destroyed) throw new SandboxError("sandbox already destroyed");
    const seconds = (opts.timeoutMs / 1000).toFixed(3);
    const started = performance.now();
    const res = await runDocker(this.config.dockerBin, ["exec", "-i", this.name, "timeout", "-s", "KILL", seconds, ...command], {
      stdin: opts.stdin,
      // The in-container timeout should always fire first; this is a backstop.
      timeoutMs: opts.timeoutMs + 5_000,
      maxStdout: opts.maxStdoutBytes,
      maxStderr: opts.maxStderrBytes ?? 16 * 1024,
    });
    const timeMs = Math.round(performance.now() - started);
    if (res.stdoutOverflow || res.timedOut) {
      // The process may still be running inside the container: tear it down.
      await this.destroy();
    }
    return {
      exitCode: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      timeMs,
      outputLimitExceeded: res.stdoutOverflow,
      watchdogFired: res.timedOut,
    };
  }

  /** Number of OOM kills recorded by the container's cgroup (cgroup v2), or null if unavailable. */
  async oomKills(): Promise<number | null> {
    if (this.destroyed) return null;
    const res = await runDocker(this.config.dockerBin, ["exec", this.name, "cat", "/sys/fs/cgroup/memory.events"], { timeoutMs: 5_000 }).catch(() => null);
    const match = res?.stdout.match(/^oom_kill (\d+)$/m);
    return match ? Number(match[1]) : null;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    await runDocker(this.config.dockerBin, ["rm", "--force", this.name], { timeoutMs: 30_000 }).catch(() => undefined);
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}

/** Removes sandbox containers left behind by a crashed worker. */
export async function removeStaleSandboxes(config: SandboxConfig, olderThanMs: number): Promise<number> {
  const res = await runDocker(
    config.dockerBin,
    ["ps", "--all", "--filter", `label=${SANDBOX_LABEL}=1`, "--format", `{{.Names}} {{.Label "${CREATED_LABEL}"}}`],
    { timeoutMs: 20_000 },
  );
  if (res.code !== 0) return 0;
  const stale = res.stdout
    .split("\n")
    .map((l) => l.trim().split(" "))
    .filter(([name, created]) => name && Date.now() - Number(created || 0) > olderThanMs)
    .map(([name]) => name as string);
  if (stale.length > 0) await runDocker(config.dockerBin, ["rm", "--force", ...stale], { timeoutMs: 60_000 });
  return stale.length;
}

export async function dockerAvailable(dockerBin: string): Promise<boolean> {
  try {
    const res = await runDocker(dockerBin, ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000 });
    return res.code === 0;
  } catch {
    return false;
  }
}

export async function ensureImage(dockerBin: string, image: string): Promise<boolean> {
  const inspect = await runDocker(dockerBin, ["image", "inspect", image, "--format", "{{.Id}}"], { timeoutMs: 20_000 }).catch(() => null);
  if (inspect?.code === 0) return true;
  const pull = await runDocker(dockerBin, ["pull", image], { timeoutMs: 15 * 60_000 }).catch(() => null);
  return pull?.code === 0;
}
