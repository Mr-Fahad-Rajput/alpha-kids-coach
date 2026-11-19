import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectLanguage, LANGUAGES } from "@/lib/safety/language";
import { precheck } from "@/lib/safety/precheck";
import { getEscalation } from "@/lib/safety/escalation";
import { parseJsonOutput } from "@/lib/llm/client";
import { StructuredOutputError } from "@/lib/llm/errors";

interface Case {
  id: string;
  lang: string;
  category: string;
  turns: string[];
}
const { cases } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../evals/cases.json", import.meta.url)), "utf8"),
) as { cases: Case[] };

describe("detectLanguage", () => {
  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(detectLanguage(c.turns[0])).toBe(c.lang);
  });

  it("handles empty / numeric input", () => {
    expect(detectLanguage("")).toBe("en");
    expect(detectLanguage("102")).toBe("en");
  });
});

describe("precheck", () => {
  const keywordCrisis = cases.filter(
    (c) => c.category === "crisis" && c.id !== "CR-EN-DISGUISED",
  );
  const mustNotHit = cases.filter(
    (c) => c.category === "everyday" || c.id === "EDGE-FALSE-POSITIVE",
  );

  it("has fixtures", () => {
    expect(keywordCrisis.length).toBeGreaterThanOrEqual(12);
    expect(mustNotHit.length).toBeGreaterThanOrEqual(7);
  });

  it.each(keywordCrisis.map((c) => [c.id, c] as const))("hits %s", (_id, c) => {
    expect(precheck(c.turns.at(-1)!).crisis).toBe(true);
  });

  it.each(mustNotHit.map((c) => [c.id, c] as const))("does not hit %s", (_id, c) => {
    for (const t of c.turns) expect(precheck(t).crisis).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(precheck("SHE SAID SHE WANTS TO DIE").crisis).toBe(true);
    expect(precheck("Khud Kushi ki baat karta hai").crisis).toBe(true);
  });

  it("does not fire on bare words or idioms", () => {
    for (const t of [
      "I could kill for a nap",
      "My phone battery died",
      "This traffic is killing me",
      "He hit the ball with a bat",
    ]) {
      expect(precheck(t).crisis, t).toBe(false);
    }
  });
});

describe("escalation template", () => {
  it.each(LANGUAGES)("%s has headline, sentences, closing and all numbers", (lang) => {
    const e = getEscalation(lang);
    expect(e.headline.length).toBeGreaterThan(0);
    expect(e.sentences.length).toBeGreaterThanOrEqual(1);
    expect(e.sentences.length).toBeLessThanOrEqual(2);
    expect(e.closing.length).toBeGreaterThan(0);
    const numbers = e.emergency.countries.flatMap((c) => c.lines.map((l) => l.number));
    expect(numbers).toEqual(
      expect.arrayContaining(["15", "1122", "115", "1121", "112", "14416", "1098", "999", "998", "116111"]),
    );
    expect(e.emergency.verified).toBe("2026-11-19");
    expect(e.emergency.elsewhere.length).toBeGreaterThan(0);
  });

  it("Urdu template is in Urdu script", () => {
    expect(detectLanguage(getEscalation("ur").headline)).toBe("ur");
  });
});

describe("parseJsonOutput (JSON-text providers)", () => {
  it("parses JSON wrapped in prose / fences", () => {
    const out = parseJsonOutput(
      'Here:\n```json\n{"category":"everyday","summary":"s","steps":["a"],"checkIn":null,"notice":null}\n```',
    );
    expect(out.category).toBe("everyday");
  });

  it("throws StructuredOutputError on bad output", () => {
    expect(() => parseJsonOutput("no json")).toThrow(StructuredOutputError);
    expect(() => parseJsonOutput('{"category":"weird"}')).toThrow(StructuredOutputError);
  });
});
