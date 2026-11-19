import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the LLM client so no network calls are ever made.
const generateCoachOutput = vi.fn();
// Tests may resolve a bare LlmOutput; wrap it as { output, usage }.
vi.mock("@/lib/llm/client", () => ({
  generateCoachOutput: async (...args: unknown[]) => {
    const r = await generateCoachOutput(...args);
    return r && "output" in r
      ? r
      : { output: r, usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: null } };
  },
}));

import { GET as providersGET } from "@/app/api/providers/route";
import { POST as coachPOST } from "@/app/api/coach/route";
import { GET as healthGET } from "@/app/api/health/route";
import { StructuredOutputError } from "@/lib/llm/errors";
import { __resetHealthForTests } from "@/lib/llm/health";
import { CoachResponseSchema, type LlmOutput } from "@/lib/coach/schema";
import { DEFAULT_CHECKIN, DEFAULT_NOTICE } from "@/lib/coach/copy";
import { coachRateLimiter } from "@/lib/rate-limit";
import { __resetCacheForTests } from "@/lib/coach/cache";
import { __resetStatsForTests } from "@/lib/coach/stats";

const ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_MODELS",
  "OPENAI_COMPATIBLE_NAME",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "ANTHROPIC_MODELS",
  "GEMINI_MODELS",
  "DEEPSEEK_MODELS",
  "OPENAI_MODELS",
  "TRUST_PROXY",
  "VERCEL",
  "RATE_LIMIT_MAX",
  "HISTORY_CHAR_BUDGET",
];

function coachRequest(body: unknown, ip = "203.0.113.1") {
  return new Request("http://localhost/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const userMsg = (content = "My child won't sleep.") => ({
  role: "user" as const,
  content,
});

const everyday = (over: Partial<LlmOutput> = {}): LlmOutput => ({
  category: "everyday",
  summary: "Let's build a calm bedtime.",
  steps: ["Dim lights at 7pm.", "Read one story."],
  checkIn: { kind: "question", text: "How did tonight go?" },
  notice: null,
  ...over,
});

async function post(body: unknown, ip?: string) {
  const res = await coachPOST(coachRequest(body, ip));
  return { res, body: await res.json() };
}

beforeEach(() => {
  for (const k of ENV_VARS) vi.stubEnv(k, "");
  // Response cache is covered in tests/optimisations.test.ts.
  vi.stubEnv("RESPONSE_CACHE_TTL_SECONDS", "0");
  __resetCacheForTests();
  __resetStatsForTests();
  coachRateLimiter.reset();
  __resetHealthForTests();
  generateCoachOutput.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/api/health", () => {
  it("returns ok", async () => {
    expect(await healthGET().json()).toEqual({ status: "ok" });
  });
});

describe("/api/providers", () => {
  it("never leaks key values", async () => {
    const secret = "test-secret-value-123";
    vi.stubEnv("ANTHROPIC_API_KEY", secret);
    vi.stubEnv("GEMINI_API_KEY", secret);
    vi.stubEnv("DEEPSEEK_API_KEY", secret);
    vi.stubEnv("OPENAI_API_KEY", secret);
    vi.stubEnv("OPENAI_COMPATIBLE_API_KEY", secret);
    vi.stubEnv("OPENAI_COMPATIBLE_BASE_URL", "http://localhost:11434/v1");
    vi.stubEnv("OPENAI_COMPATIBLE_MODELS", "llama3.3");
    const text = await providersGET().text();
    expect(text).not.toContain(secret);
    const body = JSON.parse(text);
    expect(body.defaultProvider).toBe("gemini");
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual([
      "gemini",
      "deepseek",
      "anthropic",
      "openai",
      "openai-compatible",
    ]);
  });
});

describe("/api/coach validation", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "a-test"));

  it("400 on a model not in the list", async () => {
    const { res, body } = await post({
      messages: [userMsg()],
      provider: "anthropic",
      model: "nope",
    });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "invalid_provider_or_model" });
  });

  it("400 on 21 messages, on 2001 chars, and when last is not user", async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "hi",
    }));
    expect((await post({ messages: many })).res.status).toBe(400);
    expect((await post({ messages: [userMsg("x".repeat(2001))] })).res.status).toBe(400);
    expect(
      (await post({ messages: [userMsg(), { role: "assistant", content: "ok" }] })).res.status,
    ).toBe(400);
  });

  it("503 with no providers for a non-crisis message", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { res, body } = await post({ messages: [userMsg()] });
    expect(res.status).toBe(503);
    expect(body).toEqual({ error: "no_provider_configured" });
  });
});

describe("/api/coach safety", () => {
  it("crisis pre-check escalates without calling the LLM (even with no keys)", async () => {
    generateCoachOutput.mockRejectedValue(new Error("must not be called"));
    const { res, body } = await post({
      messages: [userMsg("My husband hits our 6-year-old with a belt when he is angry.")],
    });
    expect(res.status).toBe(200);
    expect(CoachResponseSchema.parse(body)).toMatchObject({
      type: "escalation",
      category: "crisis",
      language: "en",
      steps: [],
      source: "precheck",
      provider: null,
    });
    expect(body.emergency.countries).toHaveLength(3);
    expect(generateCoachOutput).not.toHaveBeenCalled();
  });

  it("crisis with keys and a throwing LLM still escalates (Urdu)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
    generateCoachOutput.mockRejectedValue(new Error("down"));
    const { body } = await post({
      messages: [userMsg("میرا چودہ سال کا بیٹا کہتا ہے کہ وہ مر جانا چاہتا ہے۔")],
    });
    expect(body).toMatchObject({ type: "escalation", language: "ur", source: "precheck" });
    expect(generateCoachOutput).not.toHaveBeenCalled();
  });

  it("LLM-classified crisis → templated escalation, no generated steps", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
    generateCoachOutput.mockResolvedValue(
      everyday({ category: "crisis", steps: ["generated step"] }),
    );
    const { body } = await post({
      messages: [userMsg("My daughter wrote goodbye notes to her friends.")],
    });
    expect(body).toMatchObject({ type: "escalation", steps: [], source: "llm" });
    expect(JSON.stringify(body)).not.toContain("generated step");
  });
});

describe("/api/coach providers and fallback", () => {
  it("everyday with all providers throwing → 200 unavailable with numbers", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    generateCoachOutput.mockRejectedValue(new Error("503 overloaded"));
    const { res, body } = await post({ messages: [userMsg()] });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ type: "unavailable", source: "fallback" });
    expect(body.emergency.countries.length).toBe(3);
    expect(generateCoachOutput).toHaveBeenCalledTimes(2);
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("a-test");
  });

  it("first provider throws → second used, fallbackFrom set, first skipped next time", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
    generateCoachOutput.mockImplementation(async (o: { provider: string }) => {
      if (o.provider === "gemini") throw new Error("401 invalid key");
      return everyday();
    });
    const { body } = await post({ messages: [userMsg()] });
    expect(body).toMatchObject({
      type: "plan",
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      fallbackFrom: "gemini",
    });
    generateCoachOutput.mockClear();
    await post({ messages: [userMsg()] });
    expect(generateCoachOutput.mock.calls.map((c) => c[0].provider)).toEqual(["anthropic"]);
  });

  it("at most 2 extra providers are tried", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("DEEPSEEK_API_KEY", "d");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("OPENAI_API_KEY", "o");
    generateCoachOutput.mockRejectedValue(new Error("network"));
    await post({ messages: [userMsg()] });
    expect(generateCoachOutput).toHaveBeenCalledTimes(3);
  });

  it("schema failure is retried once on the same provider, then unavailable", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
    generateCoachOutput.mockRejectedValueOnce(new StructuredOutputError());
    generateCoachOutput.mockResolvedValueOnce(everyday());
    expect((await post({ messages: [userMsg()] })).body.type).toBe("plan");

    generateCoachOutput.mockReset();
    generateCoachOutput.mockRejectedValue(new StructuredOutputError());
    const { body } = await post({ messages: [userMsg()] });
    expect(body.type).toBe("unavailable");
    expect(generateCoachOutput).toHaveBeenCalledTimes(2);
  });

  it("never sends temperature/topP/topK; sends last 12 messages starting with user", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
    generateCoachOutput.mockResolvedValue(everyday());
    const messages = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    await post({ messages });
    const call = generateCoachOutput.mock.calls[0][0];
    expect(call).not.toHaveProperty("temperature");
    expect(call.messages.length).toBeLessThanOrEqual(12);
    expect(call.messages[0].role).toBe("user");
    expect(call.messages.at(-1).content).toBe("m14\n\nReply language: en");
    expect(call).not.toHaveProperty("system");
  });
});

describe("/api/coach enforcement", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "a-test"));

  it("caps steps at 5 and adds a default check-in", async () => {
    generateCoachOutput.mockResolvedValue(
      everyday({ steps: ["1", "2", "3", "4", "5", "6"], checkIn: null }),
    );
    const { body } = await post({ messages: [userMsg()] });
    expect(body.type).toBe("plan");
    expect(body.steps).toHaveLength(5);
    expect(body.checkIn).toEqual(DEFAULT_CHECKIN.en);
  });

  it("medical with empty notice → redirect with default notice in reply language", async () => {
    generateCoachOutput.mockResolvedValue(
      everyday({ category: "medical", notice: "  ", checkIn: null }),
    );
    const { body } = await post({
      messages: [userMsg("Mere bete ko 3 din se dast lag rahe hain, konsi dawai dun?")],
    });
    expect(body).toMatchObject({
      type: "redirect",
      category: "medical",
      language: "ur-roman",
      notice: DEFAULT_NOTICE.medical["ur-roman"],
    });
  });

  it("offtopic → redirect, no steps, no notice", async () => {
    generateCoachOutput.mockResolvedValue(
      everyday({ category: "offtopic", steps: ["x"], notice: "n" }),
    );
    const { body } = await post({ messages: [userMsg("Write me a Python script.")] });
    expect(body).toMatchObject({ type: "redirect", category: "offtopic", steps: [], notice: null });
  });
});

describe("rate limit", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
    generateCoachOutput.mockResolvedValue(everyday());
  });

  it("one global bucket when proxy headers are not trusted", async () => {
    vi.stubEnv("RATE_LIMIT_MAX", "3");
    for (let i = 0; i < 3; i++) {
      expect((await post({ messages: [userMsg()] }, `198.51.100.${i}`)).res.status).toBe(200);
    }
    const { res, body } = await post({ messages: [userMsg()] }, "198.51.100.99");
    expect(res.status).toBe(429);
    expect(body).toEqual({ error: "rate_limited" });
  });

  it("per-IP buckets with TRUST_PROXY=1; default max 30", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    for (let i = 0; i < 30; i++) {
      expect((await post({ messages: [userMsg()] }, "198.51.100.7")).res.status).toBe(200);
    }
    expect((await post({ messages: [userMsg()] }, "198.51.100.7")).res.status).toBe(429);
    expect((await post({ messages: [userMsg()] }, "198.51.100.8")).res.status).toBe(200);
  });

  it("crisis messages are never rate limited", async () => {
    vi.stubEnv("RATE_LIMIT_MAX", "1");
    await post({ messages: [userMsg()] });
    expect((await post({ messages: [userMsg()] })).res.status).toBe(429);
    const { body } = await post({ messages: [userMsg("He stopped breathing")] });
    expect(body.type).toBe("escalation");
  });
});
