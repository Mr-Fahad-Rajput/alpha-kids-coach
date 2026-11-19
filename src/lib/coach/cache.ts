// Author: Fahad Ameen Rajput
// In-memory response cache (per instance, never written to disk) with LRU
// eviction, TTL and in-flight dedupe. Keys are SHA-256 hashes; message text
// is never stored as a key and never logged.

import { createHash } from "node:crypto";
import type { CoachResponse } from "./schema";

export const CACHE_MAX_ENTRIES = 200;
export const DEFAULT_CACHE_TTL_SECONDS = 600;

export function cacheTtlMs(env: Record<string, string | undefined> = process.env) {
  const raw = env.RESPONSE_CACHE_TTL_SECONDS?.trim();
  if (!raw) return DEFAULT_CACHE_TTL_SECONDS * 1000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n * 1000 : 0;
}

export function normalizeText(text: string) {
  return text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

export function cacheKey(parts: {
  text: string;
  language: string;
  provider: string;
  model: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        normalizeText(parts.text),
        parts.language,
        parts.provider,
        parts.model,
      ]),
    )
    .digest("hex");
}

interface Entry {
  value: CoachResponse;
  expiresAt: number;
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<CoachResponse>>();

function getFresh(key: string, now: number): CoachResponse | undefined {
  const e = entries.get(key);
  if (!e) return undefined;
  if (now >= e.expiresAt) {
    entries.delete(key);
    return undefined;
  }
  // LRU: move to the most-recent end.
  entries.delete(key);
  entries.set(key, e);
  return e.value;
}

function set(key: string, value: CoachResponse, ttlMs: number, now: number) {
  entries.delete(key);
  entries.set(key, { value, expiresAt: now + ttlMs });
  while (entries.size > CACHE_MAX_ENTRIES) {
    entries.delete(entries.keys().next().value!);
  }
}

export interface CacheResult {
  response: CoachResponse;
  /** true when served from cache or shared from an identical in-flight request. */
  hit: boolean;
}

/**
 * Returns a cached response, joins an identical in-flight request, or runs
 * `compute`. Only responses passing `cacheable` are stored or reported as hits.
 */
export async function getOrCompute(
  key: string,
  compute: () => Promise<CoachResponse>,
  cacheable: (r: CoachResponse) => boolean,
  ttlMs = cacheTtlMs(),
): Promise<CacheResult> {
  if (ttlMs <= 0) return { response: await compute(), hit: false };

  const cached = getFresh(key, Date.now());
  if (cached) return { response: cached, hit: true };

  const pending = inflight.get(key);
  if (pending) {
    const response = await pending;
    return { response, hit: cacheable(response) };
  }

  const promise = compute();
  inflight.set(key, promise);
  try {
    const response = await promise;
    if (cacheable(response)) set(key, response, ttlMs, Date.now());
    return { response, hit: false };
  } finally {
    inflight.delete(key);
  }
}

export function cacheSize() {
  return entries.size;
}

export function __resetCacheForTests() {
  entries.clear();
  inflight.clear();
}
