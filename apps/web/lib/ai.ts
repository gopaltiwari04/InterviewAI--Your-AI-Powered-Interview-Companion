import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// Override on Vercel with GEMINI_MODEL / GEMINI_FALLBACK_MODEL if needed.
export const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// Used when the primary model is overloaded (HTTP 503) or rate limited (HTTP 429).
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";

export const interviewModel = (name: string = PRIMARY_MODEL): LanguageModel => google(name);

export function isGeminiConfigured() {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function getStatusCode(error: unknown): number | undefined {
  const err = error as { statusCode?: number; lastError?: { statusCode?: number } };
  return err?.statusCode ?? err?.lastError?.statusCode;
}

export function isRetryableModelError(error: unknown) {
  const status = getStatusCode(error);
  return status === 429 || status === 503 || status === 500;
}
