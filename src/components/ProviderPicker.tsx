"use client";

// Author: Fahad Ameen Rajput
// Minimal, unstyled provider/model selectors (B-07 themes this).

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
  providers: ProviderOption[];
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

export default function ProviderPicker({
  providers,
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled,
}: Props) {
  const current = providers.find((p) => p.id === provider);

  return (
    <div>
      {providers.length > 1 && (
        <label>
          Provider{" "}
          <select
            value={provider}
            disabled={disabled}
            onChange={(e) => onProviderChange(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}{" "}
      {current && current.models.length > 1 && (
        <label>
          Model{" "}
          <select
            value={model}
            disabled={disabled}
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
  );
}
