import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProviderOptions } from "@/lib/llm/provider-options";
import { __resetHealthForTests, markUnhealthy } from "@/lib/llm/health";
import { GET as providersGET } from "@/app/api/providers/route";
import { isDiagnosisStatement, stripDiagnoses } from "@/lib/coach/diagnosis";
import { enforce, guardDiagnoses } from "@/lib/coach/enforce";
import { DEFAULT_NOTICE } from "@/lib/coach/copy";
import type { LlmOutput } from "@/lib/coach/schema";

const KEYS = { GEMINI_API_KEY: "g-test", ANTHROPIC_API_KEY: "a-test" };

beforeEach(() => __resetHealthForTests());
afterEach(() => {
  vi.unstubAllEnvs();
  __resetHealthForTests();
});

describe("provider options", () => {
  it("lists every configured provider with healthy flags", () => {
    const p = buildProviderOptions({
      ...KEYS,
      OPENAI_COMPATIBLE_BASE_URL: "http://localhost:11434/v1",
      OPENAI_COMPATIBLE_MODELS: "llama3.3",
    });
    expect(p.providers.map((x) => [x.id, x.healthy])).toEqual([
      ["gemini", true],
      ["anthropic", true],
      ["openai-compatible", true],
    ]);
    expect(p.providers[1].models.length).toBe(3);
    expect(p.defaultProvider).toBe("gemini");
  });

  it("unhealthy default stays listed but the first healthy one is preselected", () => {
    const now = Date.now();
    markUnhealthy("gemini", now);
    const p = buildProviderOptions(KEYS, now + 1000);
    expect(p.providers.map((x) => [x.id, x.healthy])).toEqual([
      ["gemini", false],
      ["anthropic", true],
    ]);
    expect(p.defaultProvider).toBe("anthropic");
    // Recovers after 60 s.
    expect(buildProviderOptions(KEYS, now + 61_000).providers[0].healthy).toBe(true);
  });

  it("all unhealthy → keeps the configured default", () => {
    markUnhealthy("gemini");
    markUnhealthy("anthropic");
    expect(buildProviderOptions(KEYS).defaultProvider).toBe("gemini");
  });

  it("GET /api/providers returns healthy per provider and no key values", async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    for (const k of ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "LLM_PROVIDER"])
      vi.stubEnv(k, "");
    markUnhealthy("anthropic");
    const text = await providersGET().text();
    expect(text).not.toContain("g-test");
    expect(text).not.toContain("a-test");
    const body = JSON.parse(text);
    expect(body.providers.map((p: { id: string; healthy: boolean }) => [p.id, p.healthy])).toEqual([
      ["gemini", true],
      ["anthropic", false],
    ]);
  });
});

describe("diagnosis guard", () => {
  const flagged = [
    "Your son has ADHD.",
    "He has ADHD.",
    "She probably has autism.",
    "He is likely to have ADHD.",
    "This doesn't mean he has ADHD.",
    "It does not mean your child is autistic.",
    "The teacher says he has ADHD, but kids differ.",
    'His teacher said "he has ADHD".',
    "She may have OCD.",
    "Your daughter might be dealing with depression.",
    "He could have ODD.",
    "Usay ADHD hai.",
    "Kya usay autism hai? Zaroori nahi.",
    "Isko ADHD nahi hai.",
    "Woh autistic nahi hai.",
    "اسے آٹزم نہیں ہے۔",
  ];
  const allowed = [
    "Only a qualified professional, such as a paediatrician or child psychologist, can assess attention concerns.",
    "Keep instructions short and give one task at a time.",
    "He is an odd eater, and that's fine.",
    "Many children find sitting still hard at this age.",
    "Use a calm voice and a visual timer.",
    "Doctor se jaiza karwana behtar hoga.",
  ];

  it.each(flagged)("flags: %s", (s) => expect(isDiagnosisStatement(s)).toBe(true));
  it.each(allowed)("allows: %s", (s) => expect(isDiagnosisStatement(s)).toBe(false));

  it("strips only the offending sentence", () => {
    const r = stripDiagnoses(
      "Sitting still is hard at five. This doesn't mean he has ADHD. A paediatrician can help.",
    );
    expect(r.removed).toBe(true);
    expect(r.text).toBe("Sitting still is hard at five. A paediatrician can help.");
  });

  const base: LlmOutput = {
    category: "developmental",
    summary: "Many 5-year-olds find sitting still hard. Your teacher may think he has ADHD.",
    steps: ["Give short tasks.", "Do not assume he has ADHD.", "Praise effort."],
    checkIn: { kind: "question", text: "How was school this week?" },
    notice: "This doesn't mean your son has ADHD.",
  };

  it("removes diagnosis sentences/steps and ensures the default notice (en)", () => {
    const r = enforce(base, "en", { provider: "anthropic", model: "m" });
    expect(r.type).toBe("redirect");
    expect(r.summary).toBe("Many 5-year-olds find sitting still hard.");
    expect(r.steps).toEqual(["Give short tasks.", "Praise effort."]);
    expect(r.notice).toBe(DEFAULT_NOTICE.developmental.en);
    const all = [r.summary, ...r.steps, r.notice, r.checkIn?.text].join(" ");
    expect(all).not.toMatch(/\b(he|she|your (son|daughter|child)) (has|have|is likely to have|probably has) (adhd|autism)\b/i);
  });

  it("everyday plan with a diagnosis becomes a developmental redirect (ur-roman)", () => {
    const r = enforce(
      { ...base, category: "everyday", summary: "Usay ADHD hai.", notice: null, steps: ["Chhote kaam dein."] },
      "ur-roman",
      { provider: null, model: null },
    );
    expect(r).toMatchObject({
      type: "redirect",
      category: "developmental",
      steps: ["Chhote kaam dein."],
      notice: DEFAULT_NOTICE.developmental["ur-roman"],
    });
    expect(r.summary).toBe(DEFAULT_NOTICE.developmental["ur-roman"]);
  });

  it("keeps a clean notice and appends the default", () => {
    const g = guardDiagnoses(
      { ...base, notice: "Please talk to your paediatrician." },
      "en",
    );
    expect(g.notice).toBe(`Please talk to your paediatrician. ${DEFAULT_NOTICE.developmental.en}`);
  });

  it("leaves clean output untouched", () => {
    const clean: LlmOutput = { ...base, summary: "Sitting still is hard.", steps: ["Short tasks."], notice: "See a paediatrician." };
    expect(guardDiagnoses(clean, "en")).toBe(clean);
  });
});
