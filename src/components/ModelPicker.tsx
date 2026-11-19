"use client";

// Author: Fahad Ameen Rajput
// Header model pill + popover: provider selector (only if > 1) and model selector.

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderOption {
  id: string;
  label: string;
  models: ModelOption[];
  defaultModel: string;
}

interface Props {
  providers: ProviderOption[] | null;
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

const selectClass =
  "w-full appearance-none rounded-xl border border-backdrop bg-bubble px-3 py-2 text-sm text-ink focus-visible:outline-accent";

export default function ModelPicker({
  providers,
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = providers?.find((p) => p.id === provider);
  const modelLabel =
    current?.models.find((m) => m.id === model)?.label ?? model;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (providers === null) {
    return (
      <span className="h-8 w-28 animate-pulse rounded-full bg-bubble" aria-hidden />
    );
  }
  if (providers.length === 0) {
    return (
      <span className="rounded-full bg-bubble px-3 py-1.5 text-xs font-semibold text-muted-ink">
        No model configured
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Model: ${modelLabel}. Change model`}
        className="flex max-w-[11rem] items-center gap-1 rounded-full bg-bubble px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-backdrop disabled:opacity-60 sm:max-w-[16rem]"
      >
        <span className="truncate">{modelLabel}</span>
        <ChevronDownIcon width={14} height={14} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose model"
          className="animate-rise absolute right-0 top-full z-30 mt-2 w-64 space-y-3 rounded-2xl border border-backdrop bg-surface p-4 shadow-xl"
        >
          {providers.length > 1 && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-ink">Provider</span>
              <select
                className={selectClass}
                value={provider}
                onChange={(e) => onProviderChange(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {current && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-ink">Model</span>
              <select
                className={selectClass}
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
              >
                {current.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
