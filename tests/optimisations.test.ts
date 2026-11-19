import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateCoachOutput = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  generateCoachOutput: (...args: unknown[]) => generateCoachOutput(...args),
}));

import { POST as coachPOST } from "@/app/api/coach/route";
import { GET as statsGET } from "@/app/api/stats/route";
import { __resetCacheForTests, cacheKey, normalizeText } from "@/lib/coach/cache";
import { __resetStatsForTests, getStats } from "@/lib/coach/stats";
import { trimHistory } from "@/lib/coach/history";
import { SYSTEM_PROMPT, withReplyLanguage } from "@/lib/coach/prompt";
import { __resetHealthForTests } from "@/lib/llm/health";
import { coachRateLimiter } from "@/lib/rate-limit";
import type { LlmOutput } from "@/lib/coach/schema";

const OUTPUT: LlmOutput = {
  category: "everyday",
  summary: "Let's build a calm bedtime.",
  steps: ["Dim lights at 7pm."],
  checkIn: { kind: "question", text: "How did tonight go?" },
  notice: null,
};
const USAGE = { inputTokens: 1180, outputTokens: 214, cachedInputTokens: 1024 };
const ok = () => ({ output: OUTPUT, usage: USAGE });

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const user = (content: string) => ({ role: "user" as const, content });
async function post(body: unknown, headers?: Record<string, string>) {
  return (await coachPOST(req(body, headers))).json();
}

beforeEach(() => {
  for (const k of [
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY",
    "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_MODELS", "LLM_PROVIDER", "LLM_MODEL",
    "ANTHROPIC_MODELS", "RESPONSE_CACHE_TTL_SECONDS", "HISTORY_CHAR_BUDGET", "RATE_LIMIT_MAX",
    "TRUST_PROXY", "VERCEL",
  ]) vi.stubEnv(k, "");
  vi.stubEnv("ANTHROPIC_API_KEY", "a-test");
  __resetCacheForTests();
  __resetStatsForTests();
  __resetHealthForTests();
  coachRateLimiter.reset();
  generateCoachOutput.mockReset();
  generateCoachOutput.mockImplementation(async () => ok());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("response cache", () => {
  it("miss then hit (normalized text); hit reports 0 tokens and tokens saved", async () => {
    const a = await post({ messages: [user("My child won't sleep.")] });
    expect(a.source).toBe("llm");
    expect(a.meta).toMatchObject({ source: "llm", ...USAGE, provider: "anthropic" });
    const b = await post({ messages: [user("  my CHILD   won't sleep. ")] });
    expect(b.source).toBe("cache");
    expect(b.summary).toBe(a.summary);
    expect(b.meta).toMatchObject({
      source: "cache",
      inputTokens: 0,
      outputTokens: 0,
      tokensSaved: 1180 + 214,
    });
    expect(generateCoachOutput).toHaveBeenCalledTimes(1);
  });

  it("expires after the TTL", async () => {
    vi.stubEnv("RESPONSE_CACHE_TTL_SECONDS", "1");
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now);
    await post({ messages: [user("hello coach")] });
    spy.mockReturnValue(now + 500);
    expect((await post({ messages: [user("hello coach")] })).source).toBe("cache");
    spy.mockReturnValue(now + 1500);
    expect((await post({ messages: [user("hello coach")] })).source).toBe("llm");
    expect(generateCoachOutput).toHaveBeenCalledTimes(2);
  });

  it("TTL 0 disables the cache", async () => {
    vi.stubEnv("RESPONSE_CACHE_TTL_SECONDS", "0");
    await post({ messages: [user("hello")] });
    expect((await post({ messages: [user("hello")] })).source).toBe("llm");
  });

  it("key includes language, provider and model", () => {
    const base = { text: "Hi", language: "en", provider: "anthropic", model: "m1" };
    const k = cacheKey(base);
    expect(cacheKey({ ...base, text: "  hi " })).toBe(k);
    expect(cacheKey({ ...base, language: "ur-roman" })).not.toBe(k);
    expect(cacheKey({ ...base, provider: "gemini" })).not.toBe(k);
    expect(cacheKey({ ...base, model: "m2" })).not.toBe(k);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeText("  A \n b ")).toBe("a b");
  });

  it("different model → separate entries", async () => {
    await post({ messages: [user("hi")], provider: "anthropic", model: "claude-haiku-5-5" });
    const r = await post({ messages: [user("hi")], provider: "anthropic", model: "claude-opus-5-5" });
    expect(r.source).toBe("llm");
  });

  it("multi-turn requests are never cached", async () => {
    const msgs = [user("hi"), { role: "assistant", content: "Hello." }, user("again")];
    await post({ messages: msgs });
    expect((await post({ messages: msgs })).source).toBe("llm");
    expect(generateCoachOutput).toHaveBeenCalledTimes(2);
  });

  it("crisis is never cached and never calls the LLM", async () => {
    const m = { messages: [user("He stopped breathing")] };
    expect((await post(m)).source).toBe("precheck");
    expect((await post(m)).source).toBe("precheck");
    expect(generateCoachOutput).not.toHaveBeenCalled();
  });

  it("LLM-classified crisis and unavailable replies are not cached", async () => {
    generateCoachOutput.mockImplementation(async () => ({
      output: { ...OUTPUT, category: "crisis" },
      usage: USAGE,
    }));
    await post({ messages: [user("goodbye notes")] });
    expect((await post({ messages: [user("goodbye notes")] })).source).toBe("llm");

    generateCoachOutput.mockRejectedValue(new Error("down"));
    __resetHealthForTests();
    await post({ messages: [user("x1")] });
    __resetHealthForTests();
    expect((await post({ messages: [user("x1")] })).source).toBe("fallback");
  });

  it("x-cache-bypass: 1 skips the cache", async () => {
    await post({ messages: [user("hi")] });
    const r = await post({ messages: [user("hi")] }, { "x-cache-bypass": "1" });
    expect(r.source).toBe("llm");
    expect(generateCoachOutput).toHaveBeenCalledTimes(2);
  });

  it("identical concurrent requests share one LLM call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    generateCoachOutput.mockImplementation(async () => {
      await gate;
      return ok();
    });
    const p1 = post({ messages: [user("same question")] });
    const p2 = post({ messages: [user("same question")] });
    const p3 = post({ messages: [user("Same   question")] });
    release();
    const results = await Promise.all([p1, p2, p3]);
    expect(generateCoachOutput).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.source).sort()).toEqual(["cache", "cache", "llm"]);
  });
});

describe("stable prompt prefix", () => {
  it("system prompt is identical for en / ur / ur-roman requests", async () => {
    vi.stubEnv("RESPONSE_CACHE_TTL_SECONDS", "0");
    const texts = [
      "My son won't eat dinner.",
      "میرا بیٹا رات کا کھانا نہیں کھاتا۔",
      "Mera beta raat ka khana nahi khata hai.",
    ];
    for (const t of texts) await post({ messages: [user(t)] });
    const calls = generateCoachOutput.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.messages.at(-1).content.split("\n").at(-1))).toEqual([
      "Reply language: en",
      "Reply language: ur",
      "Reply language: ur-roman",
    ]);
    // The route never passes a per-request system prompt; the client always
    // uses the one static SYSTEM_PROMPT constant.
    for (const c of calls) expect(c).not.toHaveProperty("system");
    expect(SYSTEM_PROMPT).not.toMatch(/\{\{|\$\{/);
  });

  it("system prompt has the 4 few-shot examples", () => {
    expect(SYSTEM_PROMPT.match(/^→ \{"category":"(everyday|medical|developmental|offtopic)"/gm)).toHaveLength(4);
  });

  it("withReplyLanguage only touches the last user message", () => {
    const msgs = [user("a"), { role: "assistant" as const, content: "b" }, user("c")];
    const out = withReplyLanguage(msgs, "ur");
    expect(out.slice(0, 2)).toEqual(msgs.slice(0, 2));
    expect(out[2].content).toBe("c\n\nReply language: ur");
    expect(msgs[2].content).toBe("c");
  });
});

describe("context budget", () => {
  it("drops oldest turns first when over budget, keeps the latest user message", () => {
    const msgs = [
      user("a".repeat(400)),
      { role: "assistant" as const, content: "b".repeat(400) },
      user("c".repeat(400)),
      { role: "assistant" as const, content: "d".repeat(400) },
      user("e".repeat(100)),
    ];
    const out = trimHistory(msgs, 1000);
    expect(out.map((m) => m.content[0])).toEqual(["c", "d", "e"]);
    expect(trimHistory(msgs, 50).map((m) => m.content[0])).toEqual(["e"]);
    expect(trimHistory(msgs, 10_000)).toHaveLength(5);
  });

  it("route applies HISTORY_CHAR_BUDGET", async () => {
    vi.stubEnv("HISTORY_CHAR_BUDGET", "100");
    await post({
      messages: [user("x".repeat(500)), { role: "assistant", content: "y" }, user("latest")],
    });
    const sent = generateCoachOutput.mock.calls[0][0].messages;
    expect(sent).toHaveLength(1);
    expect(sent[0].content.startsWith("latest")).toBe(true);
  });
});

describe("stats", () => {
  it("counts requests, precheck, cache hits, LLM calls, tokens and latency", async () => {
    await post({ messages: [user("He stopped breathing")] });
    await post({ messages: [user("bedtime help")] });
    await post({ messages: [user("bedtime help")] });
    const s = getStats();
    expect(s).toMatchObject({
      requests: 3,
      precheckHits: 1,
      cacheHits: 1,
      llmCalls: 1,
      fallbacks: 0,
      inputTokens: 1180,
      outputTokens: 214,
      cachedInputTokens: 1024,
      tokensSavedByCache: 1394,
    });
    expect(s.avgLatencyMs.precheck).toBeTypeOf("number");
    expect(s.avgLatencyMs.llm).toBeTypeOf("number");
    expect(s.avgLatencyMs.fallback).toBeNull();
  });

  it("counts fallbacks and every LLM attempt; GET /api/stats is no-store", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    generateCoachOutput.mockImplementation(async (o: { provider: string }) => {
      if (o.provider === "gemini") throw new Error("429 quota");
      return ok();
    });
    const r = await post({ messages: [user("tantrums")] });
    expect(r.meta.fallbackFrom).toBe("gemini");
    const res = statsGET();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ requests: 1, llmCalls: 2, fallbacks: 1 });
  });
});
