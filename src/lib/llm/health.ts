// Author: Fahad Ameen Rajput
// In-memory provider health (per instance). A failed provider is skipped for
// 60 s so fallbacks don't keep hitting a dead endpoint.

import type { ProviderId } from "./models";

export const UNHEALTHY_MS = 60_000;
const unhealthyUntil = new Map<ProviderId, number>();

export function markUnhealthy(p: ProviderId, now = Date.now()) {
  unhealthyUntil.set(p, now + UNHEALTHY_MS);
}

export function isHealthy(p: ProviderId, now = Date.now()) {
  const until = unhealthyUntil.get(p);
  return until === undefined || now >= until;
}

export function __resetHealthForTests() {
  unhealthyUntil.clear();
}
