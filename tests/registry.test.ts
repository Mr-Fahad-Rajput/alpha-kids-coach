import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetWarningsForTests,
  getAvailableProviders,
  isAllowed,
  resolveDefaults,
} from "@/lib/llm/registry";

const ALL = {
  ANTHROPIC_API_KEY: "a-test",
  GEMINI_API_KEY: "g-test",
  DEEPSEEK_API_KEY: "d-test",
};

describe("registry", () => {
  beforeEach(() => {
    __resetWarningsForTests();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("1. no keys → no providers, defaultProvider null", () => {
    expect(getAvailableProviders({})).toEqual([]);
    const d = resolveDefaults({});
    expect(d.providers).toEqual([]);
    expect(d.defaultProvider).toBeNull();
    expect(d.defaultModel).toBeNull();
  });

  it("2. only ANTHROPIC_API_KEY → anthropic, default claude-sonnet-5-5", () => {
    const env = { ANTHROPIC_API_KEY: "a-test" };
    expect(getAvailableProviders(env)).toEqual(["anthropic"]);
    const d = resolveDefaults(env);
    expect(d.defaultProvider).toBe("anthropic");
    expect(d.defaultModel).toBe("claude-sonnet-5-5");
  });

  it("3. all keys → fixed order, default gemini / gemini-3.8-flash", () => {
    expect(getAvailableProviders(ALL)).toEqual([
      "gemini",
      "deepseek",
      "anthropic",
    ]);
    const d = resolveDefaults(ALL);
    expect(d.defaultProvider).toBe("gemini");
    expect(d.defaultModel).toBe("gemini-3.8-flash");
  });

  it("4. LLM_PROVIDER=anthropic with all keys → anthropic", () => {
    const d = resolveDefaults({ ...ALL, LLM_PROVIDER: "anthropic" });
    expect(d.defaultProvider).toBe("anthropic");
    expect(d.defaultModel).toBe("claude-sonnet-5-5");
  });

  it("5. LLM_PROVIDER=deepseek without its key → first available, warns once by name only", () => {
    const env = {
      ANTHROPIC_API_KEY: "a-test",
      GEMINI_API_KEY: "g-test",
      LLM_PROVIDER: "deepseek",
    };
    expect(resolveDefaults(env).defaultProvider).toBe("gemini");
    resolveDefaults(env);
    expect(console.warn).toHaveBeenCalledTimes(1);
    const msg = String(vi.mocked(console.warn).mock.calls[0][0]);
    expect(msg).toContain("LLM_PROVIDER");
    expect(msg).not.toContain("a-test");
    expect(msg).not.toContain("g-test");
  });

  it("6. ANTHROPIC_MODELS replaces the list; first is default", () => {
    const d = resolveDefaults({
      ANTHROPIC_API_KEY: "a-test",
      ANTHROPIC_MODELS: "claude-haiku-5-5,claude-sonnet-5-5",
    });
    const p = d.providers[0];
    expect(p.models.map((m) => m.id)).toEqual([
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
    ]);
    expect(p.defaultModel).toBe("claude-haiku-5-5");
    expect(d.defaultModel).toBe("claude-haiku-5-5");
  });

  it("7. LLM_MODEL=custom-id → appended and default", () => {
    const env = { ANTHROPIC_API_KEY: "a-test", LLM_MODEL: "custom-id" };
    const d = resolveDefaults(env);
    const ids = d.providers[0].models.map((m) => m.id);
    expect(ids).toEqual([
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "claude-opus-5-5",
      "custom-id",
    ]);
    expect(d.defaultModel).toBe("custom-id");
    expect(isAllowed("anthropic", "custom-id", env)).toBe(true);
    // Curated list itself is not mutated.
    expect(
      resolveDefaults({ ANTHROPIC_API_KEY: "a-test" }).providers[0].models,
    ).toHaveLength(3);
  });

  it("8. whitespace-only key → provider not available", () => {
    expect(
      getAvailableProviders({ ANTHROPIC_API_KEY: "   ", GEMINI_API_KEY: "\t\n" }),
    ).toEqual([]);
  });

  it("9. GOOGLE_GENERATIVE_AI_API_KEY alone enables gemini", () => {
    expect(
      getAvailableProviders({ GOOGLE_GENERATIVE_AI_API_KEY: "g-test" }),
    ).toEqual(["gemini"]);
  });

  it("10. isAllowed rejects unknown provider, unavailable provider, unlisted model", () => {
    const env = { ANTHROPIC_API_KEY: "a-test" };
    expect(isAllowed("anthropic", "claude-sonnet-5-5", env)).toBe(true);
    expect(isAllowed("openai", "gpt-x", env)).toBe(false);
    expect(isAllowed("gemini", "gemini-3.8-flash", env)).toBe(false);
    expect(isAllowed("anthropic", "not-a-model", env)).toBe(false);
  });

  it("11. OPENAI_API_KEY enables openai; default gpt-6-luna; OPENAI_MODELS overrides", () => {
    expect(getAvailableProviders({ OPENAI_API_KEY: "o-test" })).toEqual(["openai"]);
    expect(resolveDefaults({ OPENAI_API_KEY: "o-test" }).defaultModel).toBe("gpt-6-luna");
    const d = resolveDefaults({ OPENAI_API_KEY: "o-test", OPENAI_MODELS: "gpt-6.2-sol, x" });
    expect(d.providers[0].models.map((m) => m.id)).toEqual(["gpt-6.2-sol", "x"]);
    expect(d.defaultModel).toBe("gpt-6.2-sol");
  });

  it("12. openai-compatible needs base URL AND models; key optional; label from NAME", () => {
    expect(
      getAvailableProviders({ OPENAI_COMPATIBLE_BASE_URL: "http://localhost:11434/v1" }),
    ).toEqual([]);
    expect(getAvailableProviders({ OPENAI_COMPATIBLE_MODELS: "llama3.3" })).toEqual([]);
    expect(
      getAvailableProviders({ OPENAI_COMPATIBLE_API_KEY: "k-test", OPENAI_COMPATIBLE_MODELS: "m" }),
    ).toEqual([]);
    const env = {
      OPENAI_COMPATIBLE_BASE_URL: "http://localhost:11434/v1",
      OPENAI_COMPATIBLE_MODELS: "llama3.3,qwen3",
    };
    const d = resolveDefaults(env);
    expect(d.defaultProvider).toBe("openai-compatible");
    expect(d.defaultModel).toBe("llama3.3");
    expect(d.providers[0].label).toBe("OpenAI-compatible");
    expect(isAllowed("openai-compatible", "qwen3", env)).toBe(true);
    expect(
      resolveDefaults({ ...env, OPENAI_COMPATIBLE_NAME: "Groq" }).providers[0].label,
    ).toBe("Groq");
  });

  it("13. full default order with all five providers", () => {
    expect(
      getAvailableProviders({
        ...ALL,
        OPENAI_API_KEY: "o-test",
        OPENAI_COMPATIBLE_BASE_URL: "https://openrouter.ai/api/v1",
        OPENAI_COMPATIBLE_MODELS: "m",
      }),
    ).toEqual(["gemini", "deepseek", "anthropic", "openai", "openai-compatible"]);
  });
});
