// Author: Fahad Ameen Rajput
// Builds the /api/providers payload: every configured provider (in default
// order) with its models and an in-memory health flag. Never includes keys.

import { isHealthy } from "./health";
import { resolveDefaults, type Env } from "./registry";
import type { ProviderId } from "./models";

export interface ProviderOptionPayload {
  id: ProviderId;
  label: string;
  models: { id: string; label: string }[];
  defaultModel: string;
  healthy: boolean;
}

export interface ProvidersPayload {
  providers: ProviderOptionPayload[];
  defaultProvider: ProviderId | null;
}

export function buildProviderOptions(
  env: Env = process.env,
  now = Date.now(),
): ProvidersPayload {
  const { providers, defaultProvider } = resolveDefaults(env);
  const options = providers.map((p) => ({
    id: p.id,
    label: p.label,
    models: p.models.map((m) => ({ id: m.id, label: m.label })),
    defaultModel: p.defaultModel,
    healthy: isHealthy(p.id, now),
  }));
  // Preselect a healthy provider when the configured default is unhealthy.
  const preferred = options.find((p) => p.id === defaultProvider);
  const selected =
    preferred && !preferred.healthy
      ? (options.find((p) => p.healthy) ?? preferred)
      : preferred;
  return { providers: options, defaultProvider: selected?.id ?? null };
}
