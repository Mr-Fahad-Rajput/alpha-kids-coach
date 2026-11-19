// Author: Fahad Ameen Rajput
// Curated model lists per provider. The first entry is the provider default.

export const PROVIDER_IDS = [
  "gemini",
  "deepseek",
  "anthropic",
  "openai",
  "openai-compatible",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ModelInfo {
  id: string;
  label: string;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  "openai-compatible": "OpenAI-compatible",
};

export const CURATED_MODELS: Record<ProviderId, readonly ModelInfo[]> = {
  gemini: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
    { id: "gemini-4-argon", label: "Gemini 4 Argon" },
  ],
  deepseek: [
    { id: "deepseek-flash", label: "DeepSeek Flash" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  ],
  anthropic: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  ],
  openai: [
    { id: "gpt-6-luna", label: "GPT-6 Luna" },
    { id: "gpt-6.2-sol", label: "GPT-6.2 Sol" },
    { id: "gpt-6.2-astra", label: "GPT-6.2 Astra" },
  ],
  // No curated list: models come only from OPENAI_COMPATIBLE_MODELS.
  "openai-compatible": [],
};

/** Label for a model id; falls back to the id itself for env-supplied models. */
export function modelLabel(provider: ProviderId, id: string): string {
  return CURATED_MODELS[provider].find((m) => m.id === id)?.label ?? id;
}

export function isProviderId(value: unknown): value is ProviderId {
  return (
    typeof value === "string" &&
    (PROVIDER_IDS as readonly string[]).includes(value)
  );
}
