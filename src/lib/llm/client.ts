import "server-only";

// Author: Fahad Ameen Rajput
// Thin server-only wrapper over the AI SDK. Uses explicit provider instances
// with keys from OUR env var names — never bare model strings (those would
// route through the Vercel AI Gateway, which this app does not use).

import { generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { ProviderId } from "./models";
import { getApiKey, type Env } from "./registry";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateReplyOptions {
  provider: ProviderId;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  env?: Env;
}

export interface GenerateReplyResult {
  text: string;
  provider: ProviderId;
  model: string;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: ProviderId) {
    super(`Provider "${provider}" has no API key configured`);
    this.name = "ProviderNotConfiguredError";
  }
}

/** Builds an AI SDK language model for (provider, modelId). Keys read per call. */
export function getModel(
  provider: ProviderId,
  modelId: string,
  env: Env = process.env,
): LanguageModel {
  const apiKey = getApiKey(provider, env);
  if (!apiKey) throw new ProviderNotConfiguredError(provider);

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "deepseek":
      return createDeepSeek({ apiKey })(modelId);
  }
}

/**
 * Lowest-latency reasoning setting per provider.
 *
 * - gemini / deepseek: the portable AI SDK `reasoning: "none"` option.
 *   * @ai-sdk/deepseek maps "none" to `thinking: { type: "disabled" }`
 *     (thinking fully off).
 *   * @ai-sdk/google maps "none" to the model's lowest supported
 *     `thinkingLevel` (e.g. "minimal" on Flash models), or a zero thinking
 *     budget where the model allows it; reasoning is never turned off on
 *     models that cannot disable it.
 * - anthropic: left at the provider default (not specified for this task).
 *
 * temperature / topP / topK are deliberately NOT set for any provider
 * (current Claude models reject non-default sampling values).
 */
function reasoningFor(provider: ProviderId) {
  return provider === "anthropic" ? undefined : ("none" as const);
}

export async function generateReply(
  opts: GenerateReplyOptions,
): Promise<GenerateReplyResult> {
  const { provider, model, system, messages, maxOutputTokens, env } = opts;
  const result = await generateText({
    model: getModel(provider, model, env),
    instructions: system,
    messages,
    maxOutputTokens,
    reasoning: reasoningFor(provider),
  });
  return { text: result.text, provider, model };
}
