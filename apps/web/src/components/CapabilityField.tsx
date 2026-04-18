import { useState } from "react";
import type { Capability, SetupEntry } from "@setupiq/shared";
import { getAllowedValues } from "@setupiq/shared";
import type { CarDefinition } from "@setupiq/shared";

interface Props {
  capability: Capability;
  value: string | number | boolean | undefined;
  entries: SetupEntry[];
  car: CarDefinition;
  onChange: (capId: string, value: string | number | boolean) => void;
  error?: string;
}

export function CapabilityField({ capability, value, entries, car, onChange, error }: Props) {
  const allowed = getAllowedValues(car, entries, capability.id);

  switch (capability.valueType) {
    case "pick":
      return (
        <PickField
          capability={capability}
          value={value as string | undefined}
          allowed={allowed}
          onChange={(v) => onChange(capability.id, v)}
          error={error}
        />
      );
    case "numeric":
      return (
        <NumericField
          capability={capability}
          value={value as number | undefined}
          onChange={(v) => onChange(capability.id, v)}
          error={error}
        />
      );
    case "toggle":
      return (
        <ToggleField
          capability={capability}
          value={value as boolean | undefined}
          onChange={(v) => onChange(capability.id, v)}
          error={error}
        />
      );
    case "text":
      return (
        <TextField
          capability={capability}
          value={value as string | undefined}
          onChange={(v) => onChange(capability.id, v)}
          error={error}
        />
      );
  }
}

function PickField({
  capability,
  value,
  allowed,
  onChange,
  error,
}: {
  capability: Capability;
  value?: string;
  allowed: (string | number)[] | null;
  onChange: (v: string) => void;
  error?: string;
}) {
  const options = capability.options ?? [];

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-400">{capability.name}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isDisabled = allowed !== null && !allowed.includes(opt.value) && !String(opt.value).startsWith("partsbin-");
          const isSelected = String(value) === String(opt.value);
          return (
            <button
              key={String(opt.value)}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(String(opt.value))}
              className={`
                rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors
                ${isSelected
                  ? "bg-blue-600 text-white ring-1 ring-blue-400"
                  : isDisabled
                    ? "bg-neutral-900 text-neutral-700 cursor-not-allowed"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }
              `}
              title={isDisabled ? "Not compatible with current setup" : undefined}
            >
              {opt.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1"
                  style={{ backgroundColor: opt.color }}
                />
              )}
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {capability.description && !error && (
        <p className="text-xs text-neutral-600">{capability.description}</p>
      )}
    </div>
  );
}

function NumericField({
  capability,
  value,
  onChange,
  error,
}: {
  capability: Capability;
  value?: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const [localValue, setLocalValue] = useState(value?.toString() ?? "");

  const commit = () => {
    const n = parseFloat(localValue);
    if (!isNaN(n)) onChange(n);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-400">
        {capability.name}
        {capability.unit && <span className="text-neutral-600 ml-1">({capability.unit})</span>}
      </label>
      <div className="flex items-center gap-2">
        {capability.min !== undefined && capability.step && (
          <button
            type="button"
            onClick={() => {
              const n = (value ?? capability.defaultValue ?? capability.min ?? 0) as number;
              const next = Math.max(capability.min!, n - capability.step!);
              setLocalValue(String(next));
              onChange(next);
            }}
            className="w-8 h-8 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 text-sm font-bold"
          >
            −
          </button>
        )}
        <input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={commit}
          min={capability.min}
          max={capability.max}
          step={capability.step}
          className="w-20 rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-100 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {capability.max !== undefined && capability.step && (
          <button
            type="button"
            onClick={() => {
              const n = (value ?? capability.defaultValue ?? capability.min ?? 0) as number;
              const next = Math.min(capability.max!, n + capability.step!);
              setLocalValue(String(next));
              onChange(next);
            }}
            className="w-8 h-8 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 text-sm font-bold"
          >
            +
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {capability.description && !error && (
        <p className="text-xs text-neutral-600">{capability.description}</p>
      )}
    </div>
  );
}

function ToggleField({
  capability,
  value,
  onChange,
  error,
}: {
  capability: Capability;
  value?: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-400">{capability.name}</label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`
          rounded-md px-3 py-1.5 text-xs font-medium transition-colors
          ${value
            ? "bg-blue-600 text-white"
            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
          }
        `}
      >
        {value ? "On" : "Off"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TextField({
  capability,
  value,
  onChange,
  error,
}: {
  capability: Capability;
  value?: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-400">{capability.name}</label>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={capability.description ?? capability.name}
        className="w-full rounded bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
