// Author: Fahad Ameen Rajput
// Best-effort fixed-window rate limiter kept in process memory.
// NOTE: per-instance only — counters are not shared across replicas/containers
// and reset on restart. Good enough to blunt accidental abuse of a demo.

export interface RateLimiter {
  /** Returns true if the request is allowed (and counts it). */
  check(key: string, now?: number): boolean;
  reset(): void;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; windowStart: number }>();

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
      if (entry.count >= limit) return false;
      entry.count += 1;
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

/** Best-effort client IP from proxy headers; "unknown" if none present. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** /api/coach limiter: 30 requests / 10 minutes per client IP (per-instance only). */
export const coachRateLimiter = createRateLimiter(30, 10 * 60 * 1000);
