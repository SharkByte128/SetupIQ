import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { SetupSnapshot, CarDefinition, SetupEntry, Capability, WheelTireSetup } from "@setupiq/shared";
import { allTires, allWheels, getAllowedValues } from "@setupiq/shared";
import { exportSetupCsv, downloadCsv } from "../utils/export.js";
import { WheelTireSelector } from "./WheelTireSelector.js";

interface Props {
  setup: SetupSnapshot;
  car: CarDefinition;
  allSetups: SetupSnapshot[];
  onClone: () => void;
  onDelete: () => void;
  onBack: () => void;
  onAutoSave?: (patch: Partial<Pick<SetupSnapshot, "name" | "entries" | "wheelTireSetups" | "notes">>) => void;
}

export function SetupDetail({ setup, car, allSetups, onClone, onDelete, onBack, onAutoSave }: Props) {
  const [compareId, setCompareId] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [expandedCap, setExpandedCap] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [nameVal, setNameVal] = useState(setup.name);
  const [notesVal, setNotesVal] = useState(setup.notes ?? "");

  // Live entries state for inline editing
  const [liveEntries, setLiveEntries] = useState<SetupEntry[]>(() => [...setup.entries]);
  const [liveWts, setLiveWts] = useState<Record<string, WheelTireSetup>>(() => {
    const m: Record<string, WheelTireSetup> = {};
    for (const wts of setup.wheelTireSetups) {
      m[`${wts.position}-${wts.side}`] = wts;
    }
    return m;
  });

  // Reset when setup prop changes (e.g. navigating between setups)
  useEffect(() => {
    setLiveEntries([...setup.entries]);
    setNameVal(setup.name);
    setNotesVal(setup.notes ?? "");
    const m: Record<string, WheelTireSetup> = {};
    for (const wts of setup.wheelTireSetups) {
      m[`${wts.position}-${wts.side}`] = wts;
    }
    setLiveWts(m);
  }, [setup.id]);

  const compareSetup = compareId ? allSetups.find((s) => s.id === compareId) : null;

  const valueMap = useMemo(() => new Map(liveEntries.map((e) => [e.capabilityId, e.value])), [liveEntries]);
  const compareMap = compareSetup
    ? new Map(compareSetup.entries.map((e: SetupEntry) => [e.capabilityId, e.value]))
    : null;

  const tireMap = new Map(allTires.map((t) => [t.id, t]));
  const wheelMap = new Map(allWheels.map((w) => [w.id, w]));

  // Group capabilities by category
  const categories = useMemo(() => {
    const cats = new Map<string, typeof car.capabilities>();
    for (const cap of car.capabilities) {
      if (!cats.has(cap.category)) cats.set(cap.category, []);
      cats.get(cap.category)!.push(cap);
    }
    return cats;
  }, [car]);

  const otherSetups = allSetups.filter((s) => s.id !== setup.id);

  const doAutoSave = useCallback(
    (patch: Partial<Pick<SetupSnapshot, "name" | "entries" | "wheelTireSetups" | "notes">>) => {
      onAutoSave?.(patch);
    },
    [onAutoSave],
  );

  // Inline capability change + autosave
  const handleCapChange = useCallback(
    (capId: string, value: string | number | boolean) => {
      setLiveEntries((prev) => {
        const next = prev.filter((e) => e.capabilityId !== capId);
        next.push({ capabilityId: capId, value });
        doAutoSave({ entries: next });
        return next;
      });
    },
    [doAutoSave],
  );

  const handleWheelTireChange = useCallback(
    (wts: WheelTireSetup) => {
      setLiveWts((prev) => {
        const next = { ...prev, [`${wts.position}-${wts.side}`]: wts };
        doAutoSave({ wheelTireSetups: Object.values(next) });
        return next;
      });
    },
    [doAutoSave],
  );

  const handleNameBlur = () => {
    setEditingName(false);
    if (nameVal.trim() && nameVal.trim() !== setup.name) {
      doAutoSave({ name: nameVal.trim() });
    }
  };

  const handleNotesBlur = () => {
    setEditingNotes(false);
    const trimmed = notesVal.trim() || undefined;
    if (trimmed !== (setup.notes ?? undefined)) {
      doAutoSave({ notes: trimmed });
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-300">← Back</button>
        <div className="flex-1">
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              className="text-base font-semibold text-neutral-200 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <h2
              onClick={() => setEditingName(true)}
              className="text-base font-semibold text-neutral-200 cursor-pointer hover:text-blue-400 transition-colors"
            >
              {nameVal}
            </h2>
          )}
        </div>
        {/* Admin toggle */}
        <button
          onClick={() => setAdminMode((p) => !p)}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            adminMode
              ? "bg-red-900/50 text-red-300 border border-red-700"
              : "bg-neutral-800 text-neutral-500 border border-neutral-700"
          }`}
        >
          {adminMode ? "🔓 Admin" : "⚙️"}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 text-xs">
        <button onClick={onClone} className="rounded bg-neutral-800 text-neutral-300 px-2.5 py-1 hover:bg-neutral-700">Clone</button>
        {adminMode && (
          <>
            <button
              onClick={() => downloadCsv(exportSetupCsv(setup, car), `${setup.name}.csv`)}
              className="rounded bg-neutral-800 text-neutral-300 px-2.5 py-1 hover:bg-neutral-700"
            >
              Export CSV
            </button>
            <button onClick={onDelete} className="rounded bg-red-900 text-red-300 px-2.5 py-1 hover:bg-red-800">
              Delete
            </button>
          </>
        )}
      </div>

      {/* Compare selector */}
      {otherSetups.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">Compare with:</label>
          <select
            value={compareId ?? ""}
            onChange={(e) => setCompareId(e.target.value || null)}
            className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
          >
            <option value="">— none —</option>
            {otherSetups.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Settings by category */}
      {Array.from(categories.entries()).map(([category, caps]) => (
        <section key={category}>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">{category}</h3>
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800">
            {caps.map((cap) => {
              const val = valueMap.get(cap.id);
              const cmpVal = compareMap?.get(cap.id);
              const isDiff = compareMap !== null && String(val) !== String(cmpVal);
              const displayVal = formatValue(cap, val);
              const displayCmp = cmpVal !== undefined ? formatValue(cap, cmpVal) : null;
              const isExpanded = expandedCap === cap.id;

              return (
                <div key={cap.id}>
                  {/* View row — always visible */}
                  <button
                    onClick={() => setExpandedCap(isExpanded ? null : cap.id)}
                    className={`w-full px-3 py-2.5 flex items-center justify-between text-left transition-colors ${
                      isDiff ? "bg-yellow-950/30" : isExpanded ? "bg-neutral-800/50" : "hover:bg-neutral-800/30"
                    }`}
                  >
                    <span className="text-xs text-neutral-400">{cap.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${isDiff ? "text-yellow-300" : "text-neutral-200"}`}>
                        {displayVal ?? "—"}
                      </span>
                      {isDiff && displayCmp !== null && (
                        <span className="text-xs text-neutral-600">was {displayCmp}</span>
                      )}
                      <span className={`text-xs text-neutral-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        ▾
                      </span>
                    </div>
                  </button>

                  {/* Edit row — expanded */}
                  {isExpanded && (
                    <div className="px-3 py-3 bg-neutral-950/50 border-t border-neutral-800">
                      <InlineCapabilityEditor
                        capability={cap}
                        value={val}
                        entries={liveEntries}
                        car={car}
                        onChange={handleCapChange}
                        onDone={() => setExpandedCap(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Wheel / Tire summary */}
      <section>
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Wheels & Tires</h3>
        {expandedSection === "wheels" ? (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <WheelTireSelector position="front" side="left" setup={liveWts["front-left"]} onChange={handleWheelTireChange} />
              <WheelTireSelector position="front" side="right" setup={liveWts["front-right"]} onChange={handleWheelTireChange} />
              <WheelTireSelector position="rear" side="left" setup={liveWts["rear-left"]} onChange={handleWheelTireChange} />
              <WheelTireSelector position="rear" side="right" setup={liveWts["rear-right"]} onChange={handleWheelTireChange} />
            </div>
            <button
              onClick={() => setExpandedSection(null)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              Done
            </button>
          </div>
        ) : (
          <button
            onClick={() => setExpandedSection("wheels")}
            className="w-full text-left"
          >
            <div className="grid grid-cols-2 gap-2">
              {(setup.wheelTireSetups.length > 0 ? setup.wheelTireSetups : [
                { position: "front", side: "left" },
                { position: "front", side: "right" },
                { position: "rear", side: "left" },
                { position: "rear", side: "right" },
              ] as WheelTireSetup[]).map((wts) => {
                const key = `${wts.position}-${wts.side}`;
                const live = liveWts[key] ?? wts;
                return (
                  <div key={key} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2.5 hover:bg-neutral-800/50 transition-colors">
                    <p className="text-xs font-semibold text-neutral-500 uppercase">{live.position} {live.side}</p>
                    <p className="text-xs text-neutral-300 mt-1">
                      {live.wheelId ? wheelMap.get(live.wheelId)?.name ?? "—" : "—"}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {live.tireId ? tireMap.get(live.tireId)?.name ?? "—" : "—"}
                    </p>
                    {live.mount && (
                      <p className="text-xs text-neutral-600 mt-0.5">
                        {live.mount.method}{live.mount.method === "glued" ? `, ${live.mount.edgeGlue} edge` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </button>
        )}
      </section>

      {/* Notes */}
      <section>
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Notes</h3>
        {editingNotes ? (
          <textarea
            autoFocus
            value={notesVal}
            onChange={(e) => setNotesVal(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-[40px] hover:bg-neutral-800/50 transition-colors"
          >
            <p className="text-sm text-neutral-300 whitespace-pre-line">
              {notesVal || <span className="text-neutral-600">Tap to add notes…</span>}
            </p>
          </button>
        )}
      </section>

      <p className="text-xs text-neutral-600">
        Created {new Date(setup.createdAt).toLocaleString()} · Updated {new Date(setup.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}

// ── Inline Capability Editor ──────────────────────────────────

function InlineCapabilityEditor({
  capability,
  value,
  entries,
  car,
  onChange,
  onDone,
}: {
  capability: Capability;
  value: string | number | boolean | undefined;
  entries: SetupEntry[];
  car: CarDefinition;
  onChange: (capId: string, value: string | number | boolean) => void;
  onDone: () => void;
}) {
  const allowed = getAllowedValues(car, entries, capability.id);

  switch (capability.valueType) {
    case "pick":
      return (
        <InlinePick
          capability={capability}
          value={value as string | undefined}
          allowed={allowed}
          onChange={(v) => { onChange(capability.id, v); onDone(); }}
        />
      );
    case "numeric":
      return (
        <InlineNumeric
          capability={capability}
          value={value as number | undefined}
          onChange={(v) => onChange(capability.id, v)}
          onDone={onDone}
        />
      );
    case "toggle":
      return (
        <InlineToggle
          value={value as boolean | undefined}
          onChange={(v) => { onChange(capability.id, v); onDone(); }}
        />
      );
    case "text":
      return (
        <InlineText
          capability={capability}
          value={value as string | undefined}
          onChange={(v) => onChange(capability.id, v)}
          onDone={onDone}
        />
      );
  }
}

function InlinePick({
  capability,
  value,
  allowed,
  onChange,
}: {
  capability: Capability;
  value?: string;
  allowed: (string | number)[] | null;
  onChange: (v: string) => void;
}) {
  const options = capability.options ?? [];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isDisabled = allowed !== null && !allowed.includes(opt.value);
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
      {capability.description && (
        <p className="w-full text-xs text-neutral-600 mt-1">{capability.description}</p>
      )}
    </div>
  );
}

function InlineNumeric({
  capability,
  value,
  onChange,
  onDone,
}: {
  capability: Capability;
  value?: number;
  onChange: (v: number) => void;
  onDone: () => void;
}) {
  const [localValue, setLocalValue] = useState(value?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const n = parseFloat(localValue);
    if (!isNaN(n)) onChange(n);
    onDone();
  };

  return (
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
        ref={inputRef}
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
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
      {capability.unit && (
        <span className="text-xs text-neutral-500">{capability.unit}</span>
      )}
    </div>
  );
}

function InlineToggle({
  value,
  onChange,
}: {
  value?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
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
  );
}

function InlineText({
  capability,
  value,
  onChange,
  onDone,
}: {
  capability: Capability;
  value?: string;
  onChange: (v: string) => void;
  onDone: () => void;
}) {
  const [localVal, setLocalVal] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    onChange(localVal);
    onDone();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      placeholder={capability.description ?? capability.name}
      className="w-full rounded bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

function formatValue(
  cap: { valueType: string; options?: { value: string | number; label: string }[]; unit?: string },
  val: string | number | boolean | undefined,
): string | null {
  if (val === undefined) return null;
  if (cap.valueType === "pick" && cap.options) {
    const opt = cap.options.find((o) => String(o.value) === String(val));
    return opt?.label ?? String(val);
  }
  if (cap.valueType === "numeric" && cap.unit) {
    return `${val} ${cap.unit}`;
  }
  if (cap.valueType === "toggle") {
    return val ? "On" : "Off";
  }
  return String(val);
}
