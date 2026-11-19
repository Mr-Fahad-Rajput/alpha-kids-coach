// Author: Fahad Ameen Rajput
// Best-effort fixed-window rate limiter kept in process memory.
// NOTE: per-instance only — counters are not shared across replicas/containers
// and reset on restart. Good enough to blunt accidental abuse of a demo.

export interface RateLimiter {
  /** Returns true if the request is allowed (and counts it). */
  check(key: string, now?: number): boolean;
  reset(): void;
}

export function createRateLimiter(
  limit: number | (() => number),
  windowMs: number,
): RateLimiter {
  const hits = new Map<string, { count: number; windowStart: number }>();
  const max = typeof limit === "function" ? limit : () => limit;

  return {
    check(key, now = Date.now()) {
      // Opportunistic cleanup so the map cannot grow without bound.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (now - v.windowStart >= windowMs) hits.delete(k);
        }
      }
      const entry = hits.get(key);
      if (!entry || now - entry.windowStart >= windowMs) {
        hits.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= max()) return false;
      entry.count += 1;
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

/**
 * Rate-limit key. Proxy headers are client-controlled, so they are trusted
 * only behind a known proxy (VERCEL=1 or TRUST_PROXY=1); otherwise every
 * request shares one global bucket.
 */
export function clientKey(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.VERCEL !== "1" && env.TRUST_PROXY !== "1") return "global";
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export const DEFAULT_RATE_LIMIT_MAX = 30;

export function rateLimitMax(env: Record<string, string | undefined> = process.env) {
  const n = Number.parseInt(env.RATE_LIMIT_MAX ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RATE_LIMIT_MAX;
}

/** /api/coach limiter: RATE_LIMIT_MAX (default 30) requests / 10 minutes. */
export const coachRateLimiter = createRateLimiter(() => rateLimitMax(), 10 * 60 * 1000);
