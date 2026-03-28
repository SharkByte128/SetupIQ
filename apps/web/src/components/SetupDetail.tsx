import { useState } from "react";
import type { SetupSnapshot, CarDefinition, SetupEntry } from "@setupiq/shared";
import { allTires, allWheels } from "@setupiq/shared";
import { exportSetupCsv, downloadCsv } from "../utils/export.js";

interface Props {
  setup: SetupSnapshot;
  car: CarDefinition;
  allSetups: SetupSnapshot[];
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export function SetupDetail({ setup, car, allSetups, onEdit, onClone, onDelete, onBack }: Props) {
  const [compareId, setCompareId] = useState<string | null>(null);
  const compareSetup = compareId ? allSetups.find((s) => s.id === compareId) : null;

  const valueMap = new Map(setup.entries.map((e) => [e.capabilityId, e.value]));
  const compareMap = compareSetup
    ? new Map(compareSetup.entries.map((e: SetupEntry) => [e.capabilityId, e.value]))
    : null;

  const tireMap = new Map(allTires.map((t) => [t.id, t]));
  const wheelMap = new Map(allWheels.map((w) => [w.id, w]));

  // Group capabilities by category
  const categories = new Map<string, typeof car.capabilities>();
  for (const cap of car.capabilities) {
    if (!categories.has(cap.category)) categories.set(cap.category, []);
    categories.get(cap.category)!.push(cap);
  }

  const otherSetups = allSetups.filter((s) => s.id !== setup.id);

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-300">← Back</button>
        <h2 className="text-base font-semibold text-neutral-200 flex-1">{setup.name}</h2>
      </div>
      <div className="flex gap-2 text-xs">
        <button onClick={onEdit} className="rounded bg-neutral-800 text-neutral-300 px-2.5 py-1 hover:bg-neutral-700">Edit</button>
        <button onClick={onClone} className="rounded bg-neutral-800 text-neutral-300 px-2.5 py-1 hover:bg-neutral-700">Clone</button>
        <button
          onClick={() => downloadCsv(exportSetupCsv(setup, car), `${setup.name}.csv`)}
          className="rounded bg-neutral-800 text-neutral-300 px-2.5 py-1 hover:bg-neutral-700"
        >
          Export CSV
        </button>
        <button onClick={onDelete} className="rounded bg-red-900 text-red-300 px-2.5 py-1 hover:bg-red-800">Delete</button>
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

              return (
                <div key={cap.id} className={`px-3 py-2 flex items-center justify-between ${isDiff ? "bg-yellow-950/30" : ""}`}>
                  <span className="text-xs text-neutral-400">{cap.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${isDiff ? "text-yellow-300" : "text-neutral-200"}`}>
                      {displayVal ?? "—"}
                    </span>
                    {isDiff && displayCmp !== null && (
                      <span className="text-xs text-neutral-600">was {displayCmp}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Wheel / Tire summary */}
      <section>
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Wheels & Tires</h3>
        <div className="grid grid-cols-2 gap-2">
          {setup.wheelTireSetups.map((wts) => (
            <div key={`${wts.position}-${wts.side}`} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2.5">
              <p className="text-xs font-semibold text-neutral-500 uppercase">{wts.position} {wts.side}</p>
              <p className="text-xs text-neutral-300 mt-1">
                {wts.wheelId ? wheelMap.get(wts.wheelId)?.name ?? wts.wheelId : "—"}
              </p>
              <p className="text-xs text-neutral-400">
                {wts.tireId ? tireMap.get(wts.tireId)?.name ?? wts.tireId : "—"}
              </p>
              {wts.mount && (
                <p className="text-xs text-neutral-600 mt-0.5">
                  {wts.mount.method}{wts.mount.method === "glued" ? `, ${wts.mount.edgeGlue} edge` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      {setup.notes && (
        <section>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Notes</h3>
          <p className="text-sm text-neutral-300 whitespace-pre-line">{setup.notes}</p>
        </section>
      )}

      <p className="text-xs text-neutral-600">
        Created {new Date(setup.createdAt).toLocaleString()} · Updated {new Date(setup.updatedAt).toLocaleString()}
      </p>
    </div>
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
