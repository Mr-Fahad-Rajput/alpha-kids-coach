// Author: Fahad Ameen Rajput
// POST /api/coach: validate → detectLanguage → crisis pre-check (no LLM) →
// one structured LLM call (with retry + provider fallback) → server-side
// rule enforcement → respond.

import { z } from "zod";
import { generateCoachOutput } from "@/lib/llm/client";
import { StructuredOutputError } from "@/lib/llm/errors";
import { isHealthy, markUnhealthy } from "@/lib/llm/health";
import { isProviderId, type ProviderId } from "@/lib/llm/models";
import { isAllowed, resolveDefaults } from "@/lib/llm/registry";
import { clientKey, coachRateLimiter } from "@/lib/rate-limit";
import { detectLanguage } from "@/lib/safety/language";
import { precheck } from "@/lib/safety/precheck";
import { buildSystemPrompt } from "@/lib/coach/prompt";
import {
  enforce,
  escalationResponse,
  unavailableResponse,
} from "@/lib/coach/enforce";
import {
  HISTORY_LIMIT,
  MessageSchema,
  type ChatMessage,
  type CoachResponse,
  type LlmOutput,
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

/** Last HISTORY_LIMIT messages, starting with a user turn. */
function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-HISTORY_LIMIT);
  const firstUser = recent.findIndex((m) => m.role === "user");
  return recent.slice(firstUser);
}

export async function POST(request: Request) {
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

  // Deterministic crisis check first: no LLM, no rate limit, no keys needed.
  if (precheck(latest).crisis) {
    return json(escalationResponse(language, "precheck"));
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

  // Attempt plan: chosen provider/model, then other providers (default
  // order, their default model), skipping ones marked unhealthy.
  const ordered: { provider: ProviderId; model: string }[] = [
    { provider, model },
    ...defaults.providers
      .filter((p) => p.id !== provider)
      .map((p) => ({ provider: p.id, model: p.defaultModel })),
  ];
  const healthy = ordered.filter((a) => isHealthy(a.provider));
  const attempts = (healthy.length > 0 ? healthy : ordered.slice(0, 1)).slice(
    0,
    1 + MAX_FALLBACKS,
  );

  const system = buildSystemPrompt(language);
  const history = trimHistory(messages);
  let lastUsed: { provider: ProviderId; model: string } | null = null;

  for (const attempt of attempts) {
    lastUsed = attempt;
    const meta = {
      provider: attempt.provider,
      model: attempt.model,
      ...(attempt.provider !== provider ? { fallbackFrom: provider } : {}),
    };
    let output: LlmOutput | null = null;
    try {
      output = await callWithSchemaRetry(attempt, system, history);
    } catch (err) {
      if (err instanceof StructuredOutputError) {
        // Provider is up but output stays invalid: safe "unavailable".
        logError(`schema failure from ${attempt.provider}`, err);
        return json(unavailableResponse(language, meta));
      }
      logError(`provider ${attempt.provider} failed`, err);
      markUnhealthy(attempt.provider);
      continue;
    }
    const body: CoachResponse = enforce(output, language, meta);
    return json(body);
  }

  return json(
    unavailableResponse(language, {
      provider: lastUsed?.provider ?? null,
      model: lastUsed?.model ?? null,
      ...(lastUsed && lastUsed.provider !== provider
        ? { fallbackFrom: provider }
        : {}),
    }),
  );
}

/** One call, retried once only when the output fails schema validation. */
async function callWithSchemaRetry(
  attempt: { provider: ProviderId; model: string },
  system: string,
  messages: ChatMessage[],
): Promise<LlmOutput> {
  const call = () =>
    generateCoachOutput({ ...attempt, system, messages, env: process.env });
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof StructuredOutputError)) throw err;
    return call();
  }
}
