// Author: Fahad Ameen Rajput
// Server-side rule enforcement on top of the LLM's classification.
// The LLM never decides escalation copy, step limits or default notices.

import type { Language } from "@/lib/safety/language";
import { getEscalation } from "@/lib/safety/escalation";
import { getEmergencyNumbers } from "@/lib/safety/numbers";
import {
  DEFAULT_CHECKIN,
  DEFAULT_NOTICE,
  OFFTOPIC,
  UNAVAILABLE,
} from "./copy";
import type { CoachResponse, LlmOutput } from "./schema";

export const MAX_STEPS = 5;

type Meta = Pick<CoachResponse, "provider" | "model" | "fallbackFrom">;

export function escalationResponse(
  language: Language,
  source: "precheck" | "llm",
  meta: Meta = { provider: null, model: null },
): CoachResponse {
  const e = getEscalation(language);
  return {
    type: "escalation",
    language,
    category: "crisis",
    summary: e.headline,
    steps: [],
    checkIn: { kind: "time", text: e.closing },
    notice: e.sentences.join(" "),
    emergency: e.emergency,
    ...meta,
    source,
  };
}

export function unavailableResponse(
  language: Language,
  meta: Meta = { provider: null, model: null },
): CoachResponse {
  const u = UNAVAILABLE[language];
  return {
    type: "unavailable",
    language,
    category: "everyday",
    summary: u.summary,
    steps: [],
    checkIn: null,
    notice: u.notice,
    emergency: getEmergencyNumbers(language),
    ...meta,
    source: "fallback",
  };
}

const clean = (s: string | null | undefined) => s?.trim() || null;

export function enforce(
  out: LlmOutput,
  language: Language,
  meta: Meta,
): CoachResponse {
  if (out.category === "crisis") return escalationResponse(language, "llm", meta);

  const steps = out.steps
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
  const base = { language, ...meta, source: "llm" as const, emergency: null };

  if (out.category === "offtopic") {
    const d = OFFTOPIC[language];
    return {
      ...base,
      type: "redirect",
      category: "offtopic",
      summary: clean(out.summary) ?? d.summary,
      steps: [],
      checkIn: out.checkIn && clean(out.checkIn.text) ? out.checkIn : d.checkIn,
      notice: null,
    };
  }

  if (out.category === "everyday") {
    return {
      ...base,
      type: "plan",
      category: "everyday",
      summary: out.summary.trim(),
      steps,
      checkIn:
        out.checkIn && clean(out.checkIn.text)
          ? out.checkIn
          : DEFAULT_CHECKIN[language],
      notice: null,
    };
  }

  // medical | legal | developmental
  return {
    ...base,
    type: "redirect",
    category: out.category,
    summary: out.summary.trim(),
    steps,
    checkIn: out.checkIn && clean(out.checkIn.text) ? out.checkIn : null,
    notice: clean(out.notice) ?? DEFAULT_NOTICE[out.category][language],
  };
}
