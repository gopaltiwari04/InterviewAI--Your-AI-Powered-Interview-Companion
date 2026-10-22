import { z } from "zod";

/**
 * Server configuration, validated once on first use. Optional integrations
 * (Redis, Gemini) degrade gracefully when unset, but anything that is set
 * must be well-formed, and production refuses unsafe settings.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z
      .string()
      .regex(/^rediss?:\/\//, "REDIS_URL must start with redis:// or rediss://")
      .optional(),
    REALTIME_JWT_SECRET: z.string().min(32, "REALTIME_JWT_SECRET must be at least 32 characters").optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_FALLBACK_MODEL: z.string().default("gemini-2.5-flash-lite"),
    GEMINI_THINKING_BUDGET: z.coerce.number().int().min(0).max(24_576).default(0),
    /** "mock" returns deterministic responses for tests; never allowed in production. */
    AI_PROVIDER: z.enum(["gemini", "mock"]).default("gemini"),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
    /** "inline" runs evaluations in the web process; "queue" requires apps/worker; "auto" picks based on the worker heartbeat. */
    EVALUATION_MODE: z.enum(["auto", "queue", "inline"]).default("auto"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AI_PROVIDER === "mock") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "AI_PROVIDER=mock is not allowed in production", path: ["AI_PROVIDER"] });
    }
  });

export type EngineEnv = z.infer<typeof schema>;

let cached: EngineEnv | null = null;

/** Treats empty strings as unset so a blank line in .env does not break validation. */
function cleaned(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""));
}

export function getEnv(): EngineEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(cleaned(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests that change process.env between cases. */
export function resetEnvCache(): void {
  cached = null;
}
