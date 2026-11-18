/** Simple fixed-window rate limiter (in-memory, per server instance). */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const nowMs = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < nowMs) {
    const resetAt = nowMs + windowSeconds * 1000;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/** Periodically drop expired buckets to bound memory. */
export function sweepRateLimiter(): void {
  const nowMs = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < nowMs) buckets.delete(key);
  }
}
