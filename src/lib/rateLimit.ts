import "server-only";

/**
 * Best-effort in-memory sliding-window limiter. Good enough for a two-person
 * household app on a small number of serverless instances; the PIN lockout
 * (profiles.failed_attempts / locked_until, see lib/pinAuth.ts) is the
 * authoritative brute-force defense since it lives in the DB.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfterMs = windowMs - (now - hits[0]);
    buckets.set(key, hits);
    return { ok: false, retryAfterMs };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
