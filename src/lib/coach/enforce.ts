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
import type { CoachMeta, CoachResponse, LlmOutput } from "./schema";
import { isDiagnosisStatement, stripDiagnoses } from "./diagnosis";

export const MAX_STEPS = 5;

type Meta = Pick<CoachResponse, "provider" | "model" | "fallbackFrom">;
type Body = Omit<CoachResponse, "meta">;

/** Placeholder meta; the route fills in latency and usage before replying. */
function baseMeta(source: CoachMeta["source"], meta: Meta): CoachMeta {
  return {
    source,
    latencyMs: 0,
    inputTokens: source === "precheck" ? 0 : null,
    outputTokens: source === "precheck" ? 0 : null,
    cachedInputTokens: null,
    provider: meta.provider,
    model: meta.model,
    ...(meta.fallbackFrom ? { fallbackFrom: meta.fallbackFrom } : {}),
  };
}

function withMeta(body: Body): CoachResponse {
  return {
    ...body,
    meta: baseMeta(body.source, {
      provider: body.provider,
      model: body.model,
      fallbackFrom: body.fallbackFrom,
    }),
  };
}

export function escalationResponse(
  language: Language,
  source: "precheck" | "llm",
  meta: Meta = { provider: null, model: null },
): CoachResponse {
  const e = getEscalation(language);
  return withMeta({
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
  });
}

export function unavailableResponse(
  language: Language,
  meta: Meta = { provider: null, model: null },
): CoachResponse {
  const u = UNAVAILABLE[language];
  return withMeta({
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
  });
}

const clean = (s: string | null | undefined) => s?.trim() || null;

/**
 * Removes any sentence/step that attributes a condition to the child. When
 * something was removed, the reply becomes a developmental redirect so the
 * professional-assessment notice is always shown.
 */
export function guardDiagnoses(out: LlmOutput, language: Language): LlmOutput {
  const summary = stripDiagnoses(out.summary);
  const notice = out.notice ? stripDiagnoses(out.notice) : { text: null, removed: false };
  const steps = out.steps.filter((s) => !isDiagnosisStatement(s));
  const checkInHit = !!out.checkIn && isDiagnosisStatement(out.checkIn.text);
  const removed =
    summary.removed || notice.removed || steps.length !== out.steps.length || checkInHit;
  if (!removed) return out;

  const defaultNotice = DEFAULT_NOTICE.developmental[language];
  const keptNotice = clean(notice.text);
  return {
    category:
      out.category === "everyday" || out.category === "offtopic"
        ? "developmental"
        : out.category,
    summary: clean(summary.text) ?? defaultNotice,
    steps,
    checkIn: checkInHit ? null : out.checkIn,
    notice:
      keptNotice && keptNotice !== defaultNotice
        ? `${keptNotice} ${defaultNotice}`
        : defaultNotice,
  };
}

export function enforce(
  raw: LlmOutput,
  language: Language,
  meta: Meta,
): CoachResponse {
  if (raw.category === "crisis") return escalationResponse(language, "llm", meta);
  const out = guardDiagnoses(raw, language);
  if (out.category === "crisis") return escalationResponse(language, "llm", meta);

  const steps = out.steps
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
  const base = { language, ...meta, source: "llm" as const, emergency: null };

  if (out.category === "offtopic") {
    const d = OFFTOPIC[language];
    return withMeta({
      ...base,
      type: "redirect",
      category: "offtopic",
      summary: clean(out.summary) ?? d.summary,
      steps: [],
      checkIn: out.checkIn && clean(out.checkIn.text) ? out.checkIn : d.checkIn,
      notice: null,
    });
  }

  if (out.category === "everyday") {
    return withMeta({
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
    });
  }

  // medical | legal | developmental
  return withMeta({
    ...base,
    type: "redirect",
    category: out.category,
    summary: out.summary.trim(),
    steps,
    checkIn: out.checkIn && clean(out.checkIn.text) ? out.checkIn : null,
    notice: clean(out.notice) ?? DEFAULT_NOTICE[out.category][language],
  });
}
