/**
 * Provider-agnostic text generation with timeouts, bounded retries,
 * exponential backoff and a fallback model. The API key is read on the server
 * only and never reaches the browser.
 */
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getEnv } from "../env";
import { logger } from "../infra";
import { mockComplete } from "./mock";

export type AiErrorCode = "NOT_CONFIGURED" | "RATE_LIMITED" | "UNAVAILABLE" | "TIMEOUT" | "AUTH" | "INVALID_OUTPUT" | "UNKNOWN";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }

  get retryable(): boolean {
    return this.code === "RATE_LIMITED" || this.code === "UNAVAILABLE" || this.code === "TIMEOUT" || this.code === "UNKNOWN";
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  /** Short task label, also used by the mock provider to pick a response. */
  task: string;
  system: string;
  prompt?: string;
  messages?: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
}

export interface Completion {
  text: string;
  model: string;
  attempts: number;
  latencyMs: number;
}

export type CompleteFn = (req: CompletionRequest, model: string, signal: AbortSignal) => Promise<string>;

function statusOf(error: unknown): number | undefined {
  const e = error as { statusCode?: number; status?: number; lastError?: { statusCode?: number }; cause?: { statusCode?: number } };
  return e?.statusCode ?? e?.status ?? e?.lastError?.statusCode ?? e?.cause?.statusCode;
}

export function classifyError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  const name = (error as Error)?.name;
  const message = (error as Error)?.message ?? String(error);
  if (name === "AbortError" || name === "TimeoutError" || /timed out|aborted/i.test(message)) return new AiError("TIMEOUT", "The AI provider took too long to respond.");
  const status = statusOf(error);
  if (status === 429) return new AiError("RATE_LIMITED", "The AI provider rate limit was reached.");
  if (status === 500 || status === 502 || status === 503 || status === 504) return new AiError("UNAVAILABLE", "The AI provider is temporarily unavailable.");
  if (status === 400 || status === 401 || status === 403) return new AiError("AUTH", "The AI provider rejected the request (check the server API key and model name).");
  return new AiError("UNKNOWN", "The AI provider request failed.");
}

const geminiComplete: CompleteFn = async (req, model, signal) => {
  const result = await generateText({
    model: google(model),
    system: req.system,
    ...(req.messages ? { messages: req.messages } : { prompt: req.prompt ?? "" }),
    maxOutputTokens: req.maxOutputTokens ?? 2048,
    temperature: req.temperature ?? 0.4,
    maxRetries: 0,
    abortSignal: signal,
    providerOptions: {
      google: {
        // Gemini 2.5 "thinking" tokens count against maxOutputTokens and can leave the visible
        // answer empty. Budget 0 disables thinking (supported by Flash models); raise it with
        // GEMINI_THINKING_BUDGET for models that require thinking, such as Pro.
        thinkingConfig: { thinkingBudget: getEnv().GEMINI_THINKING_BUDGET },
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    },
  });
  return result.text;
};

export interface AiClient {
  /** Identifier recorded with evaluations, e.g. "gemini:gemini-2.5-flash". */
  readonly id: string;
  complete(req: CompletionRequest): Promise<Completion>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAiClient(options: {
  provider: string;
  primaryModel: string;
  fallbackModel?: string;
  complete: CompleteFn;
  maxAttempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}): AiClient {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelay = options.baseDelayMs ?? 800;
  return {
    id: `${options.provider}:${options.primaryModel}`,
    async complete(req) {
      const started = Date.now();
      let lastError: AiError = new AiError("UNKNOWN", "No attempt was made.");
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Switch to the fallback model after the primary is rate limited or overloaded.
        const model =
          attempt > 1 && options.fallbackModel && (lastError.code === "RATE_LIMITED" || lastError.code === "UNAVAILABLE") ? options.fallbackModel : options.primaryModel;
        const signal = AbortSignal.timeout(req.timeoutMs ?? options.timeoutMs ?? 30_000);
        try {
          const text = await options.complete(req, model, signal);
          if (!text || !text.trim()) throw new AiError("INVALID_OUTPUT", "The AI provider returned an empty response.");
          return { text, model: `${options.provider}:${model}`, attempts: attempt, latencyMs: Date.now() - started };
        } catch (err) {
          lastError = classifyError(err);
          logger.warn("ai request failed", { task: req.task, model, attempt, code: lastError.code });
          if (!lastError.retryable && lastError.code !== "INVALID_OUTPUT") break;
          if (attempt < maxAttempts) await sleep(baseDelay * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
        }
      }
      throw lastError;
    },
  };
}

let cachedClient: AiClient | null | undefined;

/** The configured AI client, or null when no provider is configured. */
export function getAiClient(): AiClient | null {
  if (cachedClient !== undefined) return cachedClient;
  const env = getEnv();
  if (env.AI_PROVIDER === "mock") {
    cachedClient = createAiClient({ provider: "mock", primaryModel: "deterministic", complete: mockComplete, baseDelayMs: 1 });
  } else if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    cachedClient = createAiClient({
      provider: "gemini",
      primaryModel: env.GEMINI_MODEL,
      fallbackModel: env.GEMINI_FALLBACK_MODEL !== env.GEMINI_MODEL ? env.GEMINI_FALLBACK_MODEL : undefined,
      complete: geminiComplete,
      timeoutMs: env.AI_TIMEOUT_MS,
    });
  } else {
    cachedClient = null;
  }
  return cachedClient;
}

export function resetAiClient(): void {
  cachedClient = undefined;
}
