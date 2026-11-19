"use client";

// Author: Fahad Ameen Rajput
// Alpha Kids Coach chat. History lives only in React state; Reset clears it.

import { useCallback, useEffect, useRef, useState } from "react";
import CoachCard from "@/components/CoachCard";
import ModelPicker, { type ProviderOption } from "@/components/ModelPicker";
import { ArrowUpIcon, ResetIcon } from "@/components/icons";
import {
  CoachResponseSchema,
  HISTORY_LIMIT,
  type ChatMessage,
  type CoachResponse,
} from "@/lib/coach/schema";
import { detectLanguage } from "@/lib/safety/language";

type Turn =
  | { id: number; role: "user"; content: string }
  | { id: number; role: "assistant"; response: CoachResponse }
  | { id: number; role: "error"; text: string };

interface ProvidersResponse {
  providers: ProviderOption[];
  defaultProvider: string | null;
}

const ERROR_TEXT: Record<string, string> = {
  invalid_request: "That message couldn't be sent. Please keep it under 2,000 characters.",
  invalid_provider_or_model: "That model isn't available. Pick another one from the menu.",
  no_provider_configured:
    "No AI provider is configured on the server yet. In an emergency, call your local emergency number.",
  rate_limited: "Too many messages right now. Please wait a few minutes and try again.",
  network: "Couldn't reach the coach. Check your connection and try again.",
};

const SUGGESTIONS = [
  "My 4-year-old won't stay in bed at night.",
  "My 8-year-old melts down when screen time ends.",
  "میرا بیٹا ہوم ورک کرنے سے انکار کرتا ہے۔",
  "میری بیٹی کھانے کے وقت بہت ضد کرتی ہے۔",
];

let nextId = 1;

/** Assistant turns go back to the model as summary + steps text. */
function toApiMessages(turns: Turn[]): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (const t of turns) {
    if (t.role === "user") msgs.push({ role: "user", content: t.content });
    else if (t.role === "assistant" && t.response.type !== "unavailable") {
      const r = t.response;
      const text = [r.summary, ...r.steps.map((s, i) => `${i + 1}. ${s}`)]
        .join("\n")
        .slice(0, 2000);
      msgs.push({ role: "assistant", content: text });
    }
  }
  const recent = msgs.slice(-HISTORY_LIMIT);
  const firstUser = recent.findIndex((m) => m.role === "user");
  return firstUser < 0 ? [] : recent.slice(firstUser);
}

function langAttrs(text: string) {
  return detectLanguage(text) === "ur"
    ? ({ dir: "rtl", lang: "ur" } as const)
    : ({ dir: "auto" } as const);
}

export default function Home() {
  const [providers, setProviders] = useState<ProviderOption[] | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ProvidersResponse>) : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        setProviders(data.providers);
        const def =
          data.providers.find((p) => p.id === data.defaultProvider) ?? data.providers[0];
        if (def) {
          setProvider(def.id);
          setModel(def.defaultModel);
        }
      })
      .catch(() => !cancelled && setProviders([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [turns, pending]);

  // Auto-grow the composer up to ~6 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  const providerLabel = useCallback(
    (id: string | null | undefined) =>
      providers?.find((p) => p.id === id)?.label ?? id ?? "",
    [providers],
  );

  async function request(history: Turn[]) {
    setPending(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: toApiMessages(history),
          ...(provider ? { provider, model } : {}),
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      const parsed = CoachResponseSchema.safeParse(data);
      if (res.ok && parsed.success) {
        setTurns([...history, { id: nextId++, role: "assistant", response: parsed.data }]);
      } else {
        const code = (data as { error?: string } | null)?.error ?? "network";
        setTurns([
          ...history,
          { id: nextId++, role: "error", text: ERROR_TEXT[code] ?? ERROR_TEXT.network },
        ]);
      }
    } catch {
      setTurns([...history, { id: nextId++, role: "error", text: ERROR_TEXT.network }]);
    } finally {
      setPending(false);
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    setInput("");
    setConfirmReset(false);
    const history: Turn[] = [...turns, { id: nextId++, role: "user", content }];
    setTurns(history);
    void request(history);
  }

  function retry(turnId: number) {
    if (pending) return;
    const history = turns.filter((t) => t.id !== turnId);
    setTurns(history);
    void request(history);
  }

  function reset() {
    setTurns([]);
    setInput("");
    setConfirmReset(false);
    inputRef.current?.focus();
  }

  function onProviderChange(id: string) {
    setProvider(id);
    setModel(providers?.find((p) => p.id === id)?.defaultModel ?? "");
  }

  const lastId = turns[turns.length - 1]?.id;

  return (
    <div className="flex min-h-dvh justify-center sm:px-4 sm:py-6">
      <div className="flex h-dvh w-full max-w-[720px] flex-col overflow-hidden bg-surface sm:h-[calc(100dvh-3rem)] sm:rounded-[24px] sm:shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink/[0.06] bg-surface/80 px-5 py-3 backdrop-blur-xl">
          <h1 className="text-lg font-extrabold tracking-tight">Alpha Kids Coach</h1>
          <div className="flex items-center gap-2">
            <ModelPicker
              providers={providers}
              provider={provider}
              model={model}
              onProviderChange={onProviderChange}
              onModelChange={setModel}
              disabled={pending}
            />
            {confirmReset ? (
              <div className="animate-rise flex items-center gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full bg-accent px-3 py-1.5 text-white transition-colors hover:bg-accent-hover"
                >
                  Clear chat
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded-full px-2 py-1.5 text-muted-ink hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={pending || turns.length === 0}
                aria-label="Reset conversation"
                title="Reset conversation"
                className="grid size-8 place-items-center rounded-full text-muted-ink transition-colors hover:bg-bubble hover:text-ink disabled:opacity-40"
              >
                <ResetIcon width={16} height={16} />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div aria-live="polite" aria-relevant="additions" className="space-y-4">
            <div className="animate-rise max-w-[85%] rounded-[20px] bg-bubble px-4 py-3 font-semibold">
              How can I help you today?
            </div>
            {turns.length === 0 && (
              <div className="animate-rise space-y-3">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      disabled={pending}
                      {...langAttrs(s)}
                      className="rounded-full border border-backdrop bg-surface px-3.5 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-ink">Ask in English or Urdu.</p>
              </div>
            )}

            {turns.map((t) => {
              if (t.role === "user") {
                return (
                  <div key={t.id} className="animate-rise flex justify-end">
                    <p
                      {...langAttrs(t.content)}
                      className="max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-ink px-4 py-2.5 text-white"
                    >
                      {t.content}
                    </p>
                  </div>
                );
              }
              if (t.role === "error") {
                return (
                  <div key={t.id} className="animate-rise rounded-[20px] bg-bubble p-5 text-sm text-muted-ink">
                    <p>{t.text}</p>
                    {t.id === lastId && (
                      <button
                        type="button"
                        onClick={() => retry(t.id)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-1.5 font-semibold text-ink ring-1 ring-backdrop hover:ring-accent"
                      >
                        <ResetIcon width={14} height={14} /> Retry
                      </button>
                    )}
                  </div>
                );
              }
              const r = t.response;
              return (
                <div key={t.id} className="animate-rise">
                  <CoachCard
                    response={r}
                    onRetry={t.id === lastId ? () => retry(t.id) : undefined}
                  />
                  {r.model && (
                    <p className="mt-1.5 px-2 text-[11px] text-muted-ink">
                      {providerLabel(r.provider)} · {r.model}
                      {r.fallbackFrom && ` · fell back from ${providerLabel(r.fallbackFrom)}`}
                    </p>
                  )}
                </div>
              );
            })}

            {pending && (
              <div
                className="animate-rise inline-flex items-center gap-1 rounded-[20px] bg-bubble px-4 py-3.5"
                role="status"
                aria-label="Coach is typing"
              >
                <span className="typing-dot size-2 rounded-full bg-muted" />
                <span className="typing-dot size-2 rounded-full bg-muted" />
                <span className="typing-dot size-2 rounded-full bg-muted" />
              </div>
            )}
            <div ref={endRef} />
          </div>
        </main>

        <div className="border-t border-ink/[0.06] bg-surface/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-[24px] bg-bubble p-1.5 ps-4 ring-1 ring-transparent transition-shadow focus-within:ring-accent"
          >
            <label htmlFor="composer" className="sr-only">
              Your message
            </label>
            <textarea
              id="composer"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              dir="auto"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Describe what's happening…"
              className="max-h-[168px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-ink placeholder:text-muted-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send message"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-muted"
            >
              <ArrowUpIcon width={18} height={18} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-ink">
            General parenting guidance, not medical or legal advice. In an emergency, call your
            local emergency number.
          </p>
        </div>
      </div>
    </div>
  );
}
