"use client";

// Author: Fahad Ameen Rajput
// Header pill "<Provider> · <Model>" + popover with two custom radio groups
// (no native <select>, which some browsers render outside the page DOM).
// Keyboard: arrows move + select, Enter/Space select, Escape closes and
// returns focus to the pill. Closes on pointerdown outside the popover.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  healthy: boolean;
}

interface Props {
  providers: ProviderOption[] | null;
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onOpen?: () => void;
  disabled?: boolean;
}

interface RadioItem {
  id: string;
  label: string;
  hint?: string;
  dot?: "ok" | "warn";
}

function RadioGroup({
  label,
  items,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  items: RadioItem[];
  value: string;
  onChange: (id: string) => void;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((i) => i.id === value),
  );

  useEffect(() => {
    if (autoFocus) refs.current[selectedIndex]?.focus();
    // Only on mount: focus the selected option when the popover opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function move(from: number, delta: number) {
    const next = (from + delta + items.length) % items.length;
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>, index: number) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        move(index, 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        move(index, -1);
        break;
      case "Home":
        e.preventDefault();
        move(0, 0);
        break;
      case "End":
        e.preventDefault();
        move(items.length - 1, 0);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onChange(items[index].id);
        break;
    }
  }

  const labelId = `rg-${label.toLowerCase()}`;
  return (
    <div>
      <p id={labelId} className="mb-1.5 text-xs font-semibold text-muted-ink">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="space-y-1">
        {items.map((item, i) => {
          const checked = item.id === value;
          return (
            <div
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="radio"
              aria-checked={checked}
              tabIndex={i === selectedIndex ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                checked ? "bg-accent-soft text-ink" : "text-ink hover:bg-bubble"
              }`}
            >
              <span
                aria-hidden
                className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                  checked ? "border-accent" : "border-muted"
                }`}
              >
                {checked && <span className="size-1.5 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={checked ? "font-semibold" : undefined}>{item.label}</span>
                {item.hint && (
                  <span className="block text-[11px] text-muted-ink">{item.hint}</span>
                )}
              </span>
              {item.dot && (
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${
                    item.dot === "ok" ? "bg-success" : "bg-[#F59E0B]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ModelPicker({
  providers,
  provider,
  model,
  onProviderChange,
  onModelChange,
  onOpen,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const current = providers?.find((p) => p.id === provider);
  const modelLabel = current?.models.find((m) => m.id === model)?.label ?? model;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      // Only a pointerdown on a real node outside both the popover and the
      // pill closes it (the pill toggles itself).
      if (
        target instanceof Node &&
        document.contains(target) &&
        !popoverRef.current?.contains(target) &&
        !pillRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        pillRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (providers === null) {
    return <span className="h-8 w-28 animate-pulse rounded-full bg-bubble" aria-hidden />;
  }
  if (providers.length === 0) {
    return (
      <span className="rounded-full bg-bubble px-3 py-1.5 text-xs font-semibold text-muted-ink">
        No model configured
      </span>
    );
  }

  const pillText = current ? `${current.label} · ${modelLabel}` : modelLabel;

  return (
    <div className="relative">
      <button
        ref={pillRef}
        type="button"
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Model: ${pillText}. Change provider or model`}
        className="flex max-w-[12rem] items-center gap-1 rounded-full bg-bubble px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-backdrop disabled:opacity-60 sm:max-w-[20rem]"
      >
        {current && !current.healthy && (
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
        )}
        <span className="truncate">{pillText}</span>
        <ChevronDownIcon width={14} height={14} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Choose provider and model"
          className="animate-rise absolute right-0 top-full z-30 mt-2 max-h-[70dvh] w-72 space-y-4 overflow-y-auto rounded-2xl border border-backdrop bg-surface p-3 shadow-xl"
        >
          <RadioGroup
            label="Provider"
            autoFocus
            value={provider}
            onChange={onProviderChange}
            items={providers.map((p) => ({
              id: p.id,
              label: p.label,
              dot: p.healthy ? "ok" : "warn",
              hint: p.healthy ? undefined : "unavailable, using fallback",
            }))}
          />
          {current && current.models.length > 0 && (
            <RadioGroup
              key={current.id}
              label="Model"
              value={model}
              onChange={onModelChange}
              items={current.models.map((m) => ({ id: m.id, label: m.label }))}
            />
          )}
        </div>
      )}
    </div>
  );
}
