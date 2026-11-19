// Author: Fahad Ameen Rajput
// POST /api/coach: validate → detectLanguage → crisis pre-check (no LLM) →
// rate limit → response cache (first turn only) → one structured LLM call
// (schema retry + provider fallback) → server-side rule enforcement → reply
// with per-reply telemetry in `meta`.

import { z } from "zod";
import { generateCoachOutput, type CoachUsage } from "@/lib/llm/client";
import { StructuredOutputError } from "@/lib/llm/errors";
import { isHealthy, markUnhealthy } from "@/lib/llm/health";
import { isProviderId, type ProviderId } from "@/lib/llm/models";
import { isAllowed, resolveDefaults } from "@/lib/llm/registry";
import { clientKey, coachRateLimiter } from "@/lib/rate-limit";
import { detectLanguage, type Language } from "@/lib/safety/language";
import { precheck } from "@/lib/safety/precheck";
import { withReplyLanguage } from "@/lib/coach/prompt";
import { trimHistory } from "@/lib/coach/history";
import { cacheKey, getOrCompute } from "@/lib/coach/cache";
import { recordLlmCall, recordReply } from "@/lib/coach/stats";
import {
  enforce,
  escalationResponse,
  unavailableResponse,
} from "@/lib/coach/enforce";
import {
  MessageSchema,
  type ChatMessage,
  type CoachResponse,
} from "@/lib/coach/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Max extra providers tried after the chosen one fails. */
const MAX_FALLBACKS = 2;

const RequestSchema = z.object({
  messages: z
    .array(MessageSchema)
    .min(1)
    .max(20)
    .refine((msgs) => msgs[msgs.length - 1]?.role === "user", {
      message: "last message must be from the user",
    }),
  provider: z.string().optional(),
  model: z.string().optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function logError(prefix: string, err: unknown) {
  // Name + message only; never request content, headers or keys.
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`[coach] ${prefix}: ${e.name}: ${e.message}`);
}

/** Stamps latency, records stats, and sends the reply. */
function reply(body: CoachResponse, startedAt: number) {
  const out: CoachResponse = {
    ...body,
    meta: { ...body.meta, latencyMs: Math.round(performance.now() - startedAt) },
  };
  recordReply(out.meta);
  return json(out);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const { messages, provider: reqProvider, model: reqModel } = parsed.data;

  const latest = messages[messages.length - 1].content;
  const language = detectLanguage(latest);

  // Deterministic crisis check first: no LLM, no cache, no rate limit, no keys.
  if (precheck(latest).crisis) {
    return reply(escalationResponse(language, "precheck"), startedAt);
  }

  if (!coachRateLimiter.check(clientKey(request.headers))) {
    return json({ error: "rate_limited" }, 429);
  }

  const env = process.env;
  const defaults = resolveDefaults(env);
  if (!defaults.defaultProvider) {
    return json({ error: "no_provider_configured" }, 503);
  }

  const provider = reqProvider ?? defaults.defaultProvider;
  const model =
    reqModel ??
    defaults.providers.find((p) => p.id === provider)?.defaultModel ??
    "";
  if (!isProviderId(provider) || !isAllowed(provider, model, env)) {
    return json({ error: "invalid_provider_or_model" }, 400);
  }

  const run = () =>
    runCoach({
      provider,
      model,
      language,
      messages,
      fallbacks: defaults.providers
        .filter((p) => p.id !== provider)
        .map((p) => ({ provider: p.id, model: p.defaultModel })),
    });

  // Response cache: first-turn only (crisis already returned above).
  const firstTurn = messages.length === 1;
  const bypass = request.headers.get("x-cache-bypass") === "1";
  if (!firstTurn || bypass) return reply(await run(), startedAt);

  const key = cacheKey({ text: latest, language, provider, model });
  const { response, hit } = await getOrCompute(
    key,
    run,
    (r) => r.source === "llm" && (r.type === "plan" || r.type === "redirect"),
  );
  if (!hit) return reply(response, startedAt);

  const saved =
    (response.meta.inputTokens ?? 0) + (response.meta.outputTokens ?? 0);
  return reply(
    {
      ...response,
      source: "cache",
      meta: {
        source: "cache",
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: null,
        provider: response.provider,
        model: response.model,
        tokensSaved: saved,
      },
    },
    startedAt,
  );
}

interface Attempt {
  provider: ProviderId;
  model: string;
}

/** LLM path: chosen provider, then up to MAX_FALLBACKS healthy others. */
async function runCoach(opts: {
  provider: ProviderId;
  model: string;
  language: Language;
  messages: ChatMessage[];
  fallbacks: Attempt[];
}): Promise<CoachResponse> {
  const { provider, model, language } = opts;
  const ordered: Attempt[] = [{ provider, model }, ...opts.fallbacks];
  const healthy = ordered.filter((a) => isHealthy(a.provider));
  const attempts = (healthy.length > 0 ? healthy : ordered.slice(0, 1)).slice(
    0,
    1 + MAX_FALLBACKS,
  );
  const history = withReplyLanguage(trimHistory(opts.messages), language);
  let lastUsed: Attempt | null = null;

  for (const attempt of attempts) {
    lastUsed = attempt;
    const meta = {
      provider: attempt.provider,
      model: attempt.model,
      ...(attempt.provider !== provider ? { fallbackFrom: provider } : {}),
    };
    try {
      const { output, usage } = await callWithSchemaRetry(attempt, history);
      return withUsage(enforce(output, language, meta), usage);
    } catch (err) {
      if (err instanceof StructuredOutputError) {
        // Provider is up but output stays invalid: safe "unavailable".
        logError(`schema failure from ${attempt.provider}`, err);
        return unavailableResponse(language, meta);
      }
      logError(`provider ${attempt.provider} failed`, err);
      markUnhealthy(attempt.provider);
    }
  }

  return unavailableResponse(language, {
    provider: lastUsed?.provider ?? null,
    model: lastUsed?.model ?? null,
    ...(lastUsed && lastUsed.provider !== provider
      ? { fallbackFrom: provider }
      : {}),
  });
}

function withUsage(r: CoachResponse, usage: CoachUsage): CoachResponse {
  return { ...r, meta: { ...r.meta, ...usage } };
}

/** One call, retried once only when the output fails schema validation. */
async function callWithSchemaRetry(attempt: Attempt, messages: ChatMessage[]) {
  const call = () => {
    recordLlmCall();
    return generateCoachOutput({ ...attempt, messages, env: process.env });
  };
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof StructuredOutputError)) throw err;
    return call();
  }
}
