/** Provider errors with retry semantics shared by every AI provider. */

export class ProviderError extends Error {
  /** Whether retrying the same request may succeed (429, 5xx, network). */
  readonly retryable: boolean;
  /** Server-advised wait before retrying, when the provider supplies it. */
  readonly retryAfterMs: number | null;
  readonly status: number | null;

  constructor(
    message: string,
    options: { retryable: boolean; retryAfterMs?: number | null; status?: number | null }
  ) {
    super(message);
    this.name = "ProviderError";
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.status = options.status ?? null;
  }
}

/** Classify an arbitrary thrown value into retryable / permanent. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderError) return error.retryable;
  // Validation failures (bad model output) are not transient.
  if (error instanceof Error && error.name === "ClassificationValidationError") return false;
  // Unknown errors default to retryable: a transient blip should not lose a reaction.
  return true;
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}
