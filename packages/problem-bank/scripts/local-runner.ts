/**
 * Runs trusted reference solutions on the developer machine (no sandbox).
 * Only ever used by the dataset build scripts, never for candidate code.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface LocalRun {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

export function runProcess(cmd: string, args: string[], cwd: string, input: string, timeoutMs = 20_000): Promise<LocalRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

export async function withProgramDir<T>(files: Record<string, string>, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "ia-ref-"));
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(path.join(dir, name), content);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const PYTHON = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

/** Runs tasks with bounded concurrency, preserving result order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}
