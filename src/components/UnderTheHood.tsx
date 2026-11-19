// Author: Fahad Ameen Rajput
// "Under the hood" telemetry: one line per reply + a small stats strip.
// Shows only numbers reported by the server (from provider usage data).

import type { CoachMeta } from "@/lib/coach/schema";
import type { Stats } from "@/lib/coach/stats";

const fmt = (n: number) => n.toLocaleString("en-US");

export function formatLatency(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function telemetryLine(
  meta: CoachMeta,
  label: (provider: string | null, model: string | null) => string,
): string {
  const time = formatLatency(meta.latencyMs);
  if (meta.source === "precheck") return `Safety check · 0 tokens · ${time}`;
  if (meta.source === "cache") {
    const saved = meta.tokensSaved ? ` · saved ${fmt(meta.tokensSaved)}` : "";
    return `Cache hit · 0 tokens${saved} · ${time}`;
  }
  const parts = [meta.source === "fallback" ? "Unavailable" : label(meta.provider, meta.model)];
  if (meta.source === "fallback" && meta.provider) parts.push(label(meta.provider, meta.model));
  if (meta.inputTokens !== null) {
    const cached = meta.cachedInputTokens ? ` (${fmt(meta.cachedInputTokens)} cached)` : "";
    parts.push(`${fmt(meta.inputTokens)} in${cached}`);
  }
  if (meta.outputTokens !== null) parts.push(`${fmt(meta.outputTokens)} out`);
  parts.push(time);
  if (meta.fallbackFrom) parts.push(`fell back from ${label(meta.fallbackFrom, null)}`);
  return parts.join(" · ");
}

export function StatsStrip({ stats }: { stats: Stats | null }) {
  const items: [string, string][] = stats
    ? [
        ["requests", fmt(stats.requests)],
        ["LLM calls", fmt(stats.llmCalls)],
        ["cache hits", fmt(stats.cacheHits)],
        ["tokens saved", fmt(stats.tokensSavedByCache)],
      ]
    : [];
  return (
    <div
      className="animate-rise flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-bubble px-3 py-2 text-[11px] text-muted-ink"
      aria-label="Server stats"
    >
      {stats ? (
        items.map(([k, v], i) => (
          <span key={k}>
            {i > 0 && <span aria-hidden className="me-3">·</span>}
            <span className="font-semibold text-ink">{v}</span> {k}
          </span>
        ))
      ) : (
        <span>Stats unavailable</span>
      )}
    </div>
  );
}
