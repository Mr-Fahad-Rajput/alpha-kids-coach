import { beforeEach, describe, expect, it, vi } from "vitest";

// Intercept generateText so no network call is made; keep the rest of `ai`.
const generateText = vi.fn();
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: (...args: unknown[]) => generateText(...args),
}));

import { generateCoachOutput } from "@/lib/llm/client";
import { SYSTEM_PROMPT, withReplyLanguage } from "@/lib/coach/prompt";

const OUTPUT = {
  category: "everyday",
  summary: "s",
  steps: [],
  checkIn: null,
  notice: null,
};
const ENV = { ANTHROPIC_API_KEY: "a-test", GEMINI_API_KEY: "g-test", DEEPSEEK_API_KEY: "d-test" };

beforeEach(() => {
  generateText.mockReset();
  generateText.mockResolvedValue({
    output: OUTPUT,
    text: JSON.stringify(OUTPUT),
    usage: {
      inputTokens: 1500,
      outputTokens: 90,
      inputTokenDetails: { cacheReadTokens: 1200, noCacheTokens: 300, cacheWriteTokens: 0 },
    },
  });
});

describe("generateCoachOutput", () => {
  it("sends byte-identical instructions for every language; language only in the last message", async () => {
    for (const lang of ["en", "ur", "ur-roman"] as const) {
      await generateCoachOutput({
        provider: "gemini",
        model: "gemini-3.8-flash",
        messages: withReplyLanguage([{ role: "user", content: "hi" }], lang),
        env: ENV,
      });
    }
    const instr = generateText.mock.calls.map((c) => c[0].instructions);
    expect(instr).toEqual([SYSTEM_PROMPT, SYSTEM_PROMPT, SYSTEM_PROMPT]);
  });

  it("Anthropic: system prompt marked with ephemeral cacheControl, effort low", async () => {
    await generateCoachOutput({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      messages: [{ role: "user", content: "hi" }],
      env: ENV,
    });
    const args = generateText.mock.calls[0][0];
    expect(args.instructions).toEqual({
      role: "system",
      content: SYSTEM_PROMPT,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
    expect(args.providerOptions).toEqual({ anthropic: { effort: "low" } });
    expect(args.maxOutputTokens).toBeGreaterThanOrEqual(1500);
    for (const k of ["temperature", "topP", "topK"]) expect(args).not.toHaveProperty(k);
  });

  it("reports usage incl. cached input tokens from provider usage", async () => {
    const r = await generateCoachOutput({
      provider: "deepseek",
      model: "deepseek-flash",
      messages: [{ role: "user", content: "hi" }],
      env: ENV,
    });
    expect(r.usage).toEqual({ inputTokens: 1500, outputTokens: 90, cachedInputTokens: 1200 });
    expect(r.output.category).toBe("everyday");
    // JSON-text providers get a constant suffix, still identical across requests.
    expect(generateText.mock.calls[0][0].instructions.startsWith(SYSTEM_PROMPT)).toBe(true);
  });
});
