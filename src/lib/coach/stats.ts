// Author: Fahad Ameen Rajput
// In-memory telemetry counters (per instance; reset on restart). Numbers
// only — never message text.

import type { CoachMeta } from "./schema";

type Source = CoachMeta["source"];
const SOURCES: Source[] = ["precheck", "cache", "llm", "fallback"];

function empty() {
  return {
    requests: 0,
    precheckHits: 0,
    cacheHits: 0,
    llmCalls: 0,
    fallbacks: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    tokensSavedByCache: 0,
    latency: Object.fromEntries(SOURCES.map((s) => [s, { total: 0, count: 0 }])) as Record<
      Source,
      { total: number; count: number }
    >,
  };
}

let s = empty();

/** Counts one actual LLM call (including failed calls and schema retries). */
export function recordLlmCall() {
  s.llmCalls += 1;
}

/** Records one /api/coach reply. */
export function recordReply(meta: CoachMeta) {
  s.requests += 1;
  if (meta.source === "precheck") s.precheckHits += 1;
  if (meta.source === "cache") {
    s.cacheHits += 1;
    s.tokensSavedByCache += meta.tokensSaved ?? 0;
  }
  if (meta.fallbackFrom) s.fallbacks += 1;
  if (meta.source === "llm" || meta.source === "fallback") {
    s.inputTokens += meta.inputTokens ?? 0;
    s.outputTokens += meta.outputTokens ?? 0;
    s.cachedInputTokens += meta.cachedInputTokens ?? 0;
  }
  const l = s.latency[meta.source];
  l.total += meta.latencyMs;
  l.count += 1;
}

export function getStats() {
  const avgLatencyMs = Object.fromEntries(
    SOURCES.map((src) => {
      const l = s.latency[src];
      return [src, l.count ? Math.round(l.total / l.count) : null];
    }),
  ) as Record<Source, number | null>;
  const { latency: _latency, ...totals } = s;
  void _latency;
  return { ...totals, avgLatencyMs };
}

export type Stats = ReturnType<typeof getStats>;

export function __resetStatsForTests() {
  s = empty();
}
