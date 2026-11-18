// Author: Fahad Ameen Rajput
// Placeholder coach endpoint (B-05 replaces the prompt and output shape).

import { z } from "zod";
import { generateReply } from "@/lib/llm/client";
import { isProviderId } from "@/lib/llm/models";
import { isAllowed, resolveDefaults } from "@/lib/llm/registry";
import { clientIp, coachRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You are a placeholder coach for a parenting app. Reply in one short sentence, in the same language and script as the user.";
const MAX_OUTPUT_TOKENS = 300;

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20)
    .refine((msgs) => msgs[msgs.length - 1]?.role === "user", {
      message: "last message must be from the user",
    }),
  provider: z.string().optional(),
  model: z.string().optional(),
});

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!coachRateLimiter.check(clientIp(request.headers))) {
    return json({ error: "rate_limited" }, 429);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const { messages, provider: reqProvider, model: reqModel } = parsed.data;

  const env = process.env;
  const defaults = resolveDefaults(env);
  if (!defaults.defaultProvider) {
    return json({ error: "no_provider_configured" }, 503);
  }

  // Resolve provider/model: explicit values must be allowed; omitted ones
  // fall back to the default provider and/or that provider's default model.
  const provider = reqProvider ?? defaults.defaultProvider;
  const model =
    reqModel ??
    defaults.providers.find((p) => p.id === provider)?.defaultModel ??
    "";
  if (!isProviderId(provider) || !isAllowed(provider, model, env)) {
    return json({ error: "invalid_provider_or_model" }, 400);
  }

  try {
    const result = await generateReply({
      provider,
      model,
      system: SYSTEM_PROMPT,
      messages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      env,
    });
    return json(
      { text: result.text, provider: result.provider, model: result.model },
      200,
    );
  } catch (err) {
    // Log only the error name + message; never request headers or keys.
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[coach] LLM call failed: ${e.name}: ${e.message}`);
    return json({ error: "llm_unavailable" }, 502);
  }
}
