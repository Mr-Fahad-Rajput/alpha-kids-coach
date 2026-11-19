import "server-only";

// Author: Fahad Ameen Rajput
// Thin server-only wrapper over the AI SDK. Uses explicit provider instances
// with keys from OUR env var names — never bare model strings (those would
// route through the Vercel AI Gateway, which this app does not use).

import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModel,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LlmOutputSchema, type ChatMessage, type LlmOutput } from "@/lib/coach/schema";
import { SYSTEM_PROMPT } from "@/lib/coach/prompt";
import { ProviderNotConfiguredError, StructuredOutputError } from "./errors";
import type { ProviderId } from "./models";
import {
  getApiKey,
  getCompatBaseUrl,
  isProviderAvailable,
  type Env,
} from "./registry";

export { ProviderNotConfiguredError, StructuredOutputError };

/** Builds an AI SDK language model for (provider, modelId). Keys read per call. */
export function getModel(
  provider: ProviderId,
  modelId: string,
  env: Env = process.env,
): LanguageModel {
  if (!isProviderAvailable(provider, env)) {
    throw new ProviderNotConfiguredError(provider);
  }
  const apiKey = getApiKey(provider, env);

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "deepseek":
      return createDeepSeek({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "openai-compatible":
      return createOpenAICompatible({
        name: "openai-compatible",
        baseURL: getCompatBaseUrl(env)!,
        apiKey,
      }).chatModel(modelId);
  }
}

/**
 * Output budget. Anthropic thinking cannot be disabled on current Claude
 * models and counts toward maxOutputTokens, so it gets more room (≥ 1500)
 * to make sure the reply itself is never cut off / empty.
 */
export function maxOutputTokensFor(provider: ProviderId) {
  return provider === "anthropic" ? 2000 : 1200;
}

/**
 * Lowest-latency reasoning setting per provider.
 * - anthropic: `reasoning: "none"` maps to the model's lowest thinking mode
 *   (adaptive-only models cannot turn it off) plus `effort: "low"` in
 *   providerOptions, per the installed @ai-sdk/anthropic docs.
 * - gemini / deepseek / openai: portable `reasoning: "none"` (rounded to the
 *   lowest supported level where it can't be disabled).
 * - openai-compatible: left at the endpoint default — unknown servers may
 *   reject reasoning parameters.
 * temperature / topP / topK are deliberately NOT set for any provider.
 */
function reasoningOptions(provider: ProviderId) {
  if (provider === "openai-compatible") return {};
  if (provider === "anthropic") {
    return {
      reasoning: "none" as const,
      providerOptions: { anthropic: { effort: "low" as const } },
    };
  }
  return { reasoning: "none" as const };
}

/** Providers without guaranteed native JSON-schema output: JSON text + zod. */
const JSON_TEXT_PROVIDERS: ReadonlySet<ProviderId> = new Set([
  "deepseek",
  "openai-compatible",
]);

/** Extracts and validates the first JSON object in a model's text reply. */
export function parseJsonOutput(text: string): LlmOutput {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new StructuredOutputError("no JSON object");
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new StructuredOutputError("invalid JSON");
  }
  const parsed = LlmOutputSchema.safeParse(data);
  if (!parsed.success) throw new StructuredOutputError("schema mismatch");
  return parsed.data;
}

export interface CoachCallOptions {
  provider: ProviderId;
  model: string;
  /** History ending with the latest user message (reply-language line included). */
  messages: ChatMessage[];
  env?: Env;
}

export interface CoachUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

export interface CoachCallResult {
  output: LlmOutput;
  usage: CoachUsage;
}

/** Extra line for JSON-text providers; kept constant so the prefix stays cacheable. */
const JSON_ONLY = "\nRespond with the JSON object only, no other text.";

/**
 * Static instructions. Anthropic gets an explicit cache breakpoint on the
 * system prompt; OpenAI, DeepSeek and Gemini cache identical prefixes
 * automatically.
 */
function instructionsFor(provider: ProviderId) {
  const content = JSON_TEXT_PROVIDERS.has(provider)
    ? SYSTEM_PROMPT + JSON_ONLY
    : SYSTEM_PROMPT;
  if (provider !== "anthropic") return content;
  return {
    role: "system" as const,
    content,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
  };
}

function toUsage(u: {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  inputTokenDetails?: { cacheReadTokens: number | undefined };
}): CoachUsage {
  return {
    inputTokens: u.inputTokens ?? null,
    outputTokens: u.outputTokens ?? null,
    cachedInputTokens: u.inputTokenDetails?.cacheReadTokens ?? null,
  };
}

/** One structured coach call. Throws StructuredOutputError on bad output. */
export async function generateCoachOutput(
  opts: CoachCallOptions,
): Promise<CoachCallResult> {
  const { provider, model, messages, env } = opts;
  const common = {
    model: getModel(provider, model, env),
    instructions: instructionsFor(provider),
    messages,
    maxOutputTokens: maxOutputTokensFor(provider),
    ...reasoningOptions(provider),
  };

  if (JSON_TEXT_PROVIDERS.has(provider)) {
    const result = await generateText(common);
    return { output: parseJsonOutput(result.text), usage: toUsage(result.usage) };
  }

  try {
    const result = await generateText({
      ...common,
      output: Output.object({ schema: LlmOutputSchema }),
    });
    return { output: result.output, usage: toUsage(result.usage) };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      throw new StructuredOutputError(err.message);
    }
    throw err;
  }
}
