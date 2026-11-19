import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the LLM client so no network calls are ever made.
const generateReply = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  generateReply: (...args: unknown[]) => generateReply(...args),
}));

import { GET as providersGET } from "@/app/api/providers/route";
import { POST as coachPOST } from "@/app/api/coach/route";
import { GET as healthGET } from "@/app/api/health/route";
import { coachRateLimiter } from "@/lib/rate-limit";

const KEY_VARS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DEEPSEEK_API_KEY",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "ANTHROPIC_MODELS",
  "GEMINI_MODELS",
  "DEEPSEEK_MODELS",
];

function clearEnv() {
  for (const k of KEY_VARS) vi.stubEnv(k, "");
}

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

beforeEach(() => {
  clearEnv();
  coachRateLimiter.reset();
  generateReply.mockReset();
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
  it("11. never leaks key values", async () => {
    const secret = "test-secret-value-123";
    vi.stubEnv("ANTHROPIC_API_KEY", secret);
    vi.stubEnv("GEMINI_API_KEY", secret);
    vi.stubEnv("DEEPSEEK_API_KEY", secret);
    const res = providersGET();
    const text = await res.text();
    expect(text).not.toContain(secret);
    const body = JSON.parse(text);
    expect(body.defaultProvider).toBe("gemini");
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual([
      "gemini",
      "deepseek",
      "anthropic",
    ]);
    expect(body.providers[2]).toMatchObject({
      id: "anthropic",
      defaultModel: "claude-sonnet-5-5",
    });
  });
});

describe("/api/coach", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "a-test"));

  it("12a. 400 on a model not in the list", async () => {
    const res = await coachPOST(
      coachRequest({
        messages: [userMsg()],
        provider: "anthropic",
        model: "nope",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_provider_or_model" });
  });

  it("12a'. 400 on an unavailable provider", async () => {
    const res = await coachPOST(
      coachRequest({
        messages: [userMsg()],
        provider: "gemini",
        model: "gemini-3.8-flash",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_provider_or_model" });
  });

  it("12b. 400 on 21 messages", async () => {
    const messages = Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "hi",
    }));
    const res = await coachPOST(coachRequest({ messages }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("12c. 400 on 2001-char content", async () => {
    const res = await coachPOST(
      coachRequest({ messages: [userMsg("x".repeat(2001))] }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("400 when last message is not from the user", async () => {
    const res = await coachPOST(
      coachRequest({
        messages: [userMsg(), { role: "assistant", content: "ok" }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("12d. 503 with no keys", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await coachPOST(coachRequest({ messages: [userMsg()] }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_provider_configured" });
  });

  it("12e. 200 returns {text, provider, model} with mocked client", async () => {
    generateReply.mockResolvedValue({
      text: "Try a calm bedtime routine.",
      provider: "anthropic",
      model: "claude-haiku-5-5",
    });
    const res = await coachPOST(
      coachRequest({
        messages: [userMsg()],
        provider: "anthropic",
        model: "claude-haiku-5-5",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: "Try a calm bedtime routine.",
      provider: "anthropic",
      model: "claude-haiku-5-5",
    });
    const call = generateReply.mock.calls[0][0];
    expect(call).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-5-5",
      maxOutputTokens: 300,
    });
    expect(call).not.toHaveProperty("temperature");
  });

  it("200 uses defaults when provider/model omitted", async () => {
    generateReply.mockImplementation(async (o: { provider: string; model: string }) => ({
      text: "ok",
      provider: o.provider,
      model: o.model,
    }));
    const res = await coachPOST(coachRequest({ messages: [userMsg()] }));
    expect(await res.json()).toEqual({
      text: "ok",
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
  });

  it("12f. 502 when mocked client throws, without leaking keys", async () => {
    generateReply.mockRejectedValue(new Error("boom"));
    const res = await coachPOST(coachRequest({ messages: [userMsg()] }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "llm_unavailable" });
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("boom");
    expect(logged).not.toContain("a-test");
  });

  it("429 after 30 requests from the same IP", async () => {
    generateReply.mockResolvedValue({ text: "ok", provider: "anthropic", model: "claude-sonnet-5-5" });
    for (let i = 0; i < 30; i++) {
      const r = await coachPOST(coachRequest({ messages: [userMsg()] }, "198.51.100.7"));
      expect(r.status).toBe(200);
    }
    const res = await coachPOST(coachRequest({ messages: [userMsg()] }, "198.51.100.7"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    const other = await coachPOST(coachRequest({ messages: [userMsg()] }, "198.51.100.8"));
    expect(other.status).toBe(200);
  });
});
