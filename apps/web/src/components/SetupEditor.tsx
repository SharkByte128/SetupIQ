import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CarDefinition, SetupEntry, WheelTireSetup, SetupSnapshot, TireComponent, WheelPosition, Capability, CapabilityOption } from "@setupiq/shared";
import { validateSetup, capabilityPartsBinMap, capabilityPartsBinMap } from "@setupiq/shared";
import { CapabilityField } from "./CapabilityField.js";
import { WheelTireSelector } from "./WheelTireSelector.js";
import { RichNotesEditor } from "./RichNotesEditor.js";
import { localDb } from "../db/local-db.js";

interface Props {
  car: CarDefinition;
  /** If provided, we're editing an existing setup */
  existing?: SetupSnapshot;
  onSave: (name: string, entries: SetupEntry[], wts: WheelTireSetup[], notes?: string) => void;
  onCancel: () => void;
}

/** Map predefined car IDs to chassis platform IDs for parts filtering. */
const predefinedChassisMap: Record<string, string> = {
  "car-mr03-rwd": "chassis-kyosho-mr03",
  "car-mrx-me": "chassis-atomic-mrx",
  "car-rx28": "chassis-reflex-rx28",
  "car-evo2-5600kv": "chassis-kyosho-mr04-evo2",
};

export function SetupEditor({ car, existing, onSave, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  // Parts bin tires for WheelTireSelector
  const allParts = useLiveQuery(() => localDb.parts.toArray()) ?? [];
  const resolvedChassisId = predefinedChassisMap[car.id] ?? null;

  const partsBinTires = useMemo(() => {
    return allParts
      .filter((p) => p.categoryId === "front-tires" || p.categoryId === "rear-tires")
      .filter((p) =>
        !resolvedChassisId ||
        p.compatibleChassisIds.length === 0 ||
        p.compatibleChassisIds.includes(resolvedChassisId),
      )
      .map((p): TireComponent => ({
        id: `partsbin-${p.id}`,
        type: "tire",
        brand: "",
        name: p.name,
        position: (p.categoryId === "front-tires" ? "front" : "rear") as WheelPosition,
        compound: (String(p.attributes.compound ?? "medium").toLowerCase()) as TireComponent["compound"],
        widthMm: Number(p.attributes.widthMm ?? p.attributes["width__mm_"]) || 0,
        color: String(p.attributes.color ?? ""),
        shore: p.attributes.shore !== undefined && p.attributes.shore !== "" ? Number(p.attributes.shore) : undefined,
      }));
  }, [allParts, resolvedChassisId]);

  // All parts bin tires available in every corner — user picks by width
  const partsBinFrontTires = partsBinTires;
  const partsBinRearTires = partsBinTires;

  // Build initial values from existing or defaults
  const initEntries = useMemo(() => {
    const map = new Map<string, string | number | boolean>();
    if (existing) {
      for (const e of existing.entries) map.set(e.capabilityId, e.value);
    } else if (car.defaultSetup) {
      for (const [k, v] of Object.entries(car.defaultSetup)) map.set(k, v);
    }
    return map;
  }, [existing, car]);

  const [values, setValues] = useState<Map<string, string | number | boolean>>(initEntries);

  const [wheelTire, setWheelTire] = useState<Record<string, WheelTireSetup>>(() => {
    const m: Record<string, WheelTireSetup> = {};
    if (existing) {
      for (const wts of existing.wheelTireSetups) {
        m[`${wts.position}-${wts.side}`] = wts;
      }
    }
    return m;
  });

  const entries: SetupEntry[] = useMemo(
    () => Array.from(values.entries()).map(([capabilityId, value]) => ({ capabilityId, value })),
    [values],
  );

  const errors = useMemo(() => validateSetup(car, entries), [car, entries]);
  const errorByCapability = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of errors) m.set(e.capabilityId, e.description);
    return m;
  }, [errors]);

  // Enrich capabilities whose options come from the Parts Bin
  const enrichedCapabilities = useMemo(() => {
    return car.capabilities.map((cap) => {
      const binCatId = capabilityPartsBinMap[cap.id];
      if (!binCatId || cap.valueType !== "pick") return cap;
      const binParts = allParts
        .filter((p) => p.categoryId === binCatId)
        .filter((p) =>
          !resolvedChassisId ||
          p.compatibleChassisIds.length === 0 ||
          p.compatibleChassisIds.includes(resolvedChassisId),
        );
      if (binParts.length === 0) return cap;
      const existingValues = new Set((cap.options ?? []).map((o) => String(o.value)));
      const extraOptions: CapabilityOption[] = binParts
        .filter((p) => !existingValues.has(`partsbin-${p.id}`))
        .map((p) => ({
          label: p.name + (p.attributes.stiffness ? ` (${p.attributes.stiffness})` : ""),
          value: `partsbin-${p.id}`,
        }));
      return { ...cap, options: [...extraOptions, ...(cap.options ?? [])] };
    });
  }, [car.capabilities, allParts, resolvedChassisId]);

  // Group capabilities by category
  const categories = useMemo(() => {
    const cats = new Map<string, Capability[]>();
    for (const cap of enrichedCapabilities) {
      if (!cats.has(cap.category)) cats.set(cap.category, []);
      cats.get(cap.category)!.push(cap);
    }
    return cats;
  }, [enrichedCapabilities]);

  const handleChange = (capId: string, value: string | number | boolean) => {
    setValues((prev) => {
      const next = new Map(prev);
      next.set(capId, value);
      return next;
    });
  };

  const handleWheelTire = (wts: WheelTireSetup) => {
    setWheelTire((prev) => ({ ...prev, [`${wts.position}-${wts.side}`]: wts }));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (errors.length > 0) return;
    const wtsArray = Object.values(wheelTire);
    onSave(name.trim(), entries, wtsArray, notes.trim() || undefined);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-400">Setup Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Baseline RCP"
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
      </div>

      {/* Capability categories */}
      {Array.from(categories.entries()).map(([category, caps]) => (
        <section key={category}>
          <h3 className="text-sm font-semibold text-neutral-300 mb-3 border-b border-neutral-800 pb-1">
            {category}
          </h3>
          <div className="grid gap-4">
            {caps.map((cap) => (
              <CapabilityField
                key={cap.id}
                capability={cap}
                value={values.get(cap.id)}
                entries={entries}
                car={car}
                onChange={handleChange}
                error={errorByCapability.get(cap.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Wheel / Tire Setup */}
      <section>
        <h3 className="text-sm font-semibold text-neutral-300 mb-3 border-b border-neutral-800 pb-1">
          Wheels & Tires
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <WheelTireSelector position="front" side="left" setup={wheelTire["front-left"]} onChange={handleWheelTire} extraTires={partsBinFrontTires} />
          <WheelTireSelector position="front" side="right" setup={wheelTire["front-right"]} onChange={handleWheelTire} extraTires={partsBinFrontTires} />
          <WheelTireSelector position="rear" side="left" setup={wheelTire["rear-left"]} onChange={handleWheelTire} extraTires={partsBinRearTires} />
          <WheelTireSelector position="rear" side="right" setup={wheelTire["rear-right"]} onChange={handleWheelTire} extraTires={partsBinRearTires} />
        </div>
      </section>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-400">Notes</label>
        <RichNotesEditor
          value={notes}
          onChange={setNotes}
          placeholder="Optional notes about this setup…"
          minHeight={100}
        />
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-md bg-red-950 border border-red-800 p-3">
          <p className="text-xs font-semibold text-red-400 mb-1">Incompatible settings:</p>
          <ul className="text-xs text-red-300 space-y-0.5">
            {errors.map((e) => (
              <li key={e.ruleId}>• {e.description}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions — sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-neutral-950 border-t border-neutral-800 px-4 py-3 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md bg-neutral-800 text-neutral-300 py-2.5 text-sm font-medium hover:bg-neutral-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || errors.length > 0}
          className="flex-1 rounded-md bg-blue-600 text-white py-2.5 text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {existing ? "Update" : "Save"} Setup
        </button>
      </div>
    </div>
  );
}
