"use client";

// Author: Fahad Ameen Rajput
// Minimal coach page. Conversation history lives only in React state;
// nothing is stored server-side.

import { useEffect, useState } from "react";
import ProviderPicker, { type ProviderOption } from "@/components/ProviderPicker";

interface Message {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
}

interface ProvidersResponse {
  providers: ProviderOption[];
  defaultProvider: string | null;
}

const ERROR_TEXT: Record<string, string> = {
  invalid_request: "That message could not be sent. Please check its length.",
  invalid_provider_or_model: "That provider or model is not available.",
  no_provider_configured: "No LLM provider is configured.",
  rate_limited: "Too many requests. Please wait a few minutes.",
  llm_unavailable: "The coach is unavailable right now. Please try again.",
};

export default function Home() {
  const [providers, setProviders] = useState<ProviderOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<ProvidersResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setProviders(data.providers);
        const def =
          data.providers.find((p) => p.id === data.defaultProvider) ??
          data.providers[0];
        if (def) {
          setProvider(def.id);
          setModel(def.defaultModel);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleProviderChange(id: string) {
    setProvider(id);
    const p = providers?.find((x) => x.id === id);
    setModel(p?.defaultModel ?? "");
  }

  async function send() {
    const content = input.trim();
    if (!content || pending) return;
    const history: Message[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          provider,
          model,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_TEXT[data?.error] ?? "Something went wrong.");
        return;
      }
      setMessages([
        ...history,
        {
          role: "assistant",
          content: data.text,
          provider: data.provider,
          model: data.model,
        },
      ]);
    } catch {
      setError(ERROR_TEXT.llm_unavailable);
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setMessages([]);
    setInput("");
    setError(null);
  }

  if (loadError) {
    return (
      <main>
        <p>Could not load providers.</p>
      </main>
    );
  }
  if (providers === null) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }
  if (providers.length === 0) {
    return (
      <main>
        <p>
          No LLM provider configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY or
          DEEPSEEK_API_KEY.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Alpha Kids Coach</h1>
      <ProviderPicker
        providers={providers}
        provider={provider}
        model={model}
        onProviderChange={handleProviderChange}
        onModelChange={setModel}
        disabled={pending}
      />

      <ol>
        {messages.map((m, i) => (
          <li key={i}>
            <strong>{m.role === "user" ? "You" : "Coach"}:</strong> {m.content}
            {m.role === "assistant" && m.provider && (
              <div>
                <small>
                  {m.provider} / {m.model}
                </small>
              </div>
            )}
          </li>
        ))}
      </ol>

      {error && <p role="alert">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Describe your parenting concern…"
          disabled={pending}
        />
        <div>
          <button type="submit" disabled={pending || !input.trim()}>
            {pending ? "Sending…" : "Send"}
          </button>{" "}
          <button type="button" onClick={reset} disabled={pending}>
            Reset
          </button>
        </div>
      </form>
    </main>
  );
}
