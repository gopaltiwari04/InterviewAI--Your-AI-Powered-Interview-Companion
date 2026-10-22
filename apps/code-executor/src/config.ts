import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  REDIS_URL: z.string().optional(),
  EXECUTOR_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  EXECUTOR_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(8090),
  EXECUTOR_HEALTH_HOST: z.string().default("0.0.0.0"),
  DOCKER_BIN: z.string().default("docker"),
  /** Optional OCI runtime such as "runsc" (gVisor) for stronger isolation. */
  SANDBOX_RUNTIME: z.string().optional(),
  SANDBOX_CPUS: z.coerce.number().min(0.25).max(4).default(1),
  SANDBOX_PIDS_LIMIT: z.coerce.number().int().min(16).max(1024).default(128),
  /** Sandboxes kill themselves after this many seconds even if the worker dies. */
  SANDBOX_LIFETIME_SECONDS: z.coerce.number().int().min(30).max(900).default(240),
  /** Set to "false" to skip pulling images at startup. */
  SANDBOX_PREPULL: z.enum(["true", "false"]).default("true"),
});

export type ExecutorConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ExecutorConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid code-executor configuration: ${issues}`);
  }
  return parsed.data;
}
