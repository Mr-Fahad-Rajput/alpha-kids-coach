// Author: Fahad Ameen Rajput
// Renders one coach response: plan, redirect, escalation or unavailable.

import type { CoachResponse } from "@/lib/coach/schema";
import {
  AlertIcon,
  ChatIcon,
  ClockIcon,
  InfoIcon,
  PhoneIcon,
  RetryIcon,
} from "./icons";

type Emergency = NonNullable<CoachResponse["emergency"]>;

function langProps(language: CoachResponse["language"]) {
  return language === "ur"
    ? ({ dir: "rtl", lang: "ur" } as const)
    : ({ dir: "ltr", lang: "en" } as const);
}

function Numbers({ emergency, compact }: { emergency: Emergency; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {emergency.countries.map((c) => (
        <div key={c.country}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
            {c.country}
          </p>
          <ul className={compact ? "mt-1 flex flex-wrap gap-2" : "mt-1.5 grid gap-2 sm:grid-cols-2"}>
            {c.lines.map((l) => (
              <li key={l.number}>
                <a
                  href={`tel:${l.number}`}
                  className={
                    compact
                      ? "inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-backdrop hover:ring-accent"
                      : "flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-escalation-border transition-shadow hover:ring-accent"
                  }
                  aria-label={`${l.label}: ${l.number}`}
                >
                  {!compact && (
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
                      <PhoneIcon width={16} height={16} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <bdi dir="ltr" className={compact ? "font-semibold" : "block text-lg font-extrabold leading-tight text-ink"}>
                      {l.number}
                    </bdi>
                    <span className={compact ? "ms-1 text-muted-ink" : "block text-xs text-muted-ink"}>
                      {l.label}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-sm text-muted-ink">{emergency.elsewhere}</p>
    </div>
  );
}

function CheckInChip({ checkIn }: { checkIn: NonNullable<CoachResponse["checkIn"]> }) {
  const Icon = checkIn.kind === "time" ? ClockIcon : ChatIcon;
  return (
    <p className="mt-4 inline-flex items-start gap-2 rounded-2xl bg-surface px-3 py-2 text-sm ring-1 ring-backdrop">
      <Icon width={16} height={16} className="mt-[0.2em] shrink-0 text-success" />
      <span>{checkIn.text}</span>
    </p>
  );
}

export default function CoachCard({
  response,
  onRetry,
}: {
  response: CoachResponse;
  onRetry?: () => void;
}) {
  const lp = langProps(response.language);

  if (response.type === "escalation") {
    return (
      <div
        {...lp}
        role="alert"
        className="rounded-[20px] border border-escalation-border bg-escalation p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white">
            <AlertIcon width={18} height={18} />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-extrabold leading-snug">{response.summary}</p>
            {response.notice && <p className="text-[15px]">{response.notice}</p>}
          </div>
        </div>
        {response.emergency && (
          <div className="mt-4">
            <Numbers emergency={response.emergency} />
          </div>
        )}
        {response.checkIn && (
          <p className="mt-4 text-[15px] font-semibold">{response.checkIn.text}</p>
        )}
      </div>
    );
  }

  if (response.type === "unavailable") {
    return (
      <div {...lp} className="rounded-[20px] bg-bubble p-5 text-muted-ink">
        <p className="font-semibold text-ink">{response.summary}</p>
        {response.notice && <p className="mt-1 text-sm">{response.notice}</p>}
        {response.emergency && (
          <div className="mt-3">
            <Numbers emergency={response.emergency} compact />
          </div>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-1.5 text-sm font-semibold text-ink ring-1 ring-backdrop transition-colors hover:ring-accent"
          >
            <RetryIcon width={14} height={14} /> Retry
          </button>
        )}
      </div>
    );
  }

  // plan | redirect
  return (
    <div {...lp} className="rounded-[20px] bg-bubble p-5">
      {response.type === "redirect" && response.notice && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-notice-border bg-notice px-3 py-2.5 text-sm">
          <InfoIcon width={16} height={16} className="mt-[0.2em] shrink-0 text-[#92400E]" />
          <p>{response.notice}</p>
        </div>
      )}
      <p className="font-semibold">{response.summary}</p>
      {response.steps.length > 0 && (
        <ol className="mt-3 space-y-2.5">
          {response.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-ink">
                {i + 1}
              </span>
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ol>
      )}
      {response.checkIn && <CheckInChip checkIn={response.checkIn} />}
    </div>
  );
}
