// Author: Fahad Ameen Rajput
// Pure provider/model resolution from an env object (default: process.env).
// Never returns or logs env values — only variable / provider names.

import {
  CURATED_MODELS,
  PROVIDER_IDS,
  PROVIDER_LABELS,
  isProviderId,
  modelLabel,
  type ModelInfo,
  type ProviderId,
} from "./models";

export type Env = Record<string, string | undefined>;

/** Env var names that hold each provider's API key (first non-empty wins). */
export const KEY_VARS: Record<ProviderId, readonly string[]> = {
  gemini: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
};

const MODEL_LIST_VARS: Record<ProviderId, string> = {
  gemini: "GEMINI_MODELS",
  deepseek: "DEEPSEEK_MODELS",
  anthropic: "ANTHROPIC_MODELS",
};

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  models: ModelInfo[];
  defaultModel: string;
}

export interface ResolvedDefaults {
  providers: ProviderInfo[];
  defaultProvider: ProviderId | null;
  defaultModel: string | null;
}

function nonEmpty(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/** Returns the API key for a provider, or undefined. Server-side use only. */
export function getApiKey(provider: ProviderId, env: Env = process.env) {
  for (const name of KEY_VARS[provider]) {
    const v = nonEmpty(env[name]);
    if (v) return v;
  }
  return undefined;
}

function modelIdsFor(provider: ProviderId, env: Env): string[] {
  const override = nonEmpty(env[MODEL_LIST_VARS[provider]]);
  if (override) {
    const ids = [
      ...new Set(
        override
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length > 0) return ids;
  }
  // Fresh array each call: callers may append LLM_MODEL to it.
  return CURATED_MODELS[provider].map((m) => m.id);
}

/** Available provider ids in fixed order: gemini, deepseek, anthropic. */
export function getAvailableProviders(env: Env = process.env): ProviderId[] {
  return PROVIDER_IDS.filter((p) => getApiKey(p, env) !== undefined);
}

let warnedUnavailablePreferred = false;

function pickDefaultProvider(
  available: ProviderId[],
  env: Env,
): ProviderId | null {
  const preferred = nonEmpty(env.LLM_PROVIDER);
  if (preferred) {
    if (isProviderId(preferred) && available.includes(preferred)) {
      return preferred;
    }
    if (!warnedUnavailablePreferred) {
      warnedUnavailablePreferred = true;
      // Name only — never log values of key variables.
      console.warn(
        "LLM_PROVIDER is set to an unknown or unavailable provider; falling back to the first available provider.",
      );
    }
  }
  return available[0] ?? null;
}

/** Full resolution: providers with model lists and the default provider/model. */
export function resolveDefaults(env: Env = process.env): ResolvedDefaults {
  const available = getAvailableProviders(env);
  const defaultProvider = pickDefaultProvider(available, env);
  const llmModel = nonEmpty(env.LLM_MODEL);

  const providers: ProviderInfo[] = available.map((id) => {
    const ids = modelIdsFor(id, env);
    let defaultModel = ids[0];
    if (id === defaultProvider && llmModel) {
      if (!ids.includes(llmModel)) ids.push(llmModel);
      defaultModel = llmModel;
    }
    return {
      id,
      label: PROVIDER_LABELS[id],
      models: ids.map((m) => ({ id: m, label: modelLabel(id, m) })),
      defaultModel,
    };
  });

  const defaultModel =
    providers.find((p) => p.id === defaultProvider)?.defaultModel ?? null;

  return { providers, defaultProvider, defaultModel };
}

/** True only if provider is known, available, and model is in its list. */
export function isAllowed(
  provider: string,
  model: string,
  env: Env = process.env,
): boolean {
  if (!isProviderId(provider)) return false;
  const info = resolveDefaults(env).providers.find((p) => p.id === provider);
  return !!info && info.models.some((m) => m.id === model);
}

/** Test helper: reset the once-only warning latch. */
export function __resetWarningsForTests() {
  warnedUnavailablePreferred = false;
}
