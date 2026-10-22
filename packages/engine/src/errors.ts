/** Errors that map to an HTTP status and a message that is safe to show users. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Please sign in to continue.");
export const forbidden = (message = "You do not have access to this resource.") => new AppError(403, "FORBIDDEN", message);
/** Used for resources the user may not see, so IDs cannot be probed. */
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (message: string, details?: Record<string, unknown>) => new AppError(409, "CONFLICT", message, details);
export const tooLarge = (message: string) => new AppError(413, "PAYLOAD_TOO_LARGE", message);
export const rateLimited = (retryAfterSeconds: number) =>
  new AppError(429, "RATE_LIMITED", "Too many requests. Please slow down and try again shortly.", { retryAfterSeconds });
export const unavailable = (message: string) => new AppError(503, "UNAVAILABLE", message);
