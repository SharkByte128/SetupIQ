import { useState, useCallback, useEffect } from "react";
import { allCars } from "@setupiq/shared";
import type { CarDefinition, SetupSnapshot, SetupEntry, WheelTireSetup } from "@setupiq/shared";
import { useSetups } from "../hooks/use-setups.js";
import { useHideDemoData, isDemoRecord } from "../hooks/use-demo-filter.js";
import { localDb } from "../db/local-db.js";
import { SetupList } from "./SetupList.js";
import { SetupEditor } from "./SetupEditor.js";
import { SetupDetail } from "./SetupDetail.js";

type View =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "edit"; setup: SetupSnapshot }
  | { kind: "detail"; setup: SetupSnapshot };

// Default to first car (MR-03 RWD)
const defaultCar = allCars[0];

interface SetupsPageProps {
  forcedCarId?: string;
}

export function SetupsPage({ forcedCarId }: SetupsPageProps) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [selectedCarId, setSelectedCarId] = useState(forcedCarId ?? defaultCar.id);
  const [resolvedCar, setResolvedCar] = useState<CarDefinition | null>(null);
  const hideDemoData = useHideDemoData();

  // Resolve the car: check predefined cars first, then look up custom car + template
  useEffect(() => {
    const predefined = allCars.find((c) => c.id === selectedCarId);
    if (predefined) {
      setResolvedCar(predefined);
      return;
    }
    // Look up custom car from local DB
    let cancelled = false;
    (async () => {
      const customCar = await localDb.customCars.get(selectedCarId);
      if (cancelled || !customCar) {
        if (!cancelled) setResolvedCar(defaultCar);
        return;
      }
      let capabilities: CarDefinition["capabilities"] = [];
      let defaultSetup: Record<string, string | number | boolean> | undefined;
      if (customCar.setupTemplateId) {
        const template = await localDb.setupTemplates.get(customCar.setupTemplateId);
        if (!cancelled && template) {
          capabilities = template.capabilities.map((c) => ({
            id: c.id,
            name: c.name,
            category: c.category,
            valueType: c.valueType as CarDefinition["capabilities"][0]["valueType"],
            options: c.options,
            defaultValue: c.defaultValue,
          }));
          const ds: Record<string, string | number | boolean> = {};
          for (const c of template.capabilities) {
            if (c.defaultValue !== undefined) ds[c.id] = c.defaultValue;
          }
          if (Object.keys(ds).length > 0) defaultSetup = ds;
        }
      }
      if (!cancelled) {
        setResolvedCar({
          id: customCar.id,
          slug: customCar.id,
          name: customCar.name,
          manufacturer: customCar.manufacturer,
          scale: customCar.scale,
          driveType: customCar.driveType,
          capabilities,
          compatibilityRules: [],
          defaultSetup,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCarId]);

  const car = resolvedCar ?? defaultCar;

  const { setups, loading, createSetup, updateSetup, cloneSetup, deleteSetup } = useSetups(car.id, hideDemoData);

  const handleSaveNew = useCallback(
    async (name: string, entries: SetupEntry[], wts: WheelTireSetup[], notes?: string) => {
      await createSetup(car, name, entries, wts, notes);
      setView({ kind: "list" });
    },
    [car, createSetup],
  );

  const handleSaveEdit = useCallback(
    async (name: string, entries: SetupEntry[], wts: WheelTireSetup[], notes?: string) => {
      if (view.kind !== "edit") return;
      await updateSetup(view.setup.id, { name, entries, wheelTireSetups: wts, notes });
      setView({ kind: "list" });
    },
    [view, updateSetup],
  );

  const handleAutoSave = useCallback(
    async (setupId: string, patch: Partial<Pick<SetupSnapshot, "name" | "entries" | "wheelTireSetups" | "sections" | "notes">>) => {
      await updateSetup(setupId, patch);
      // Refresh the view.setup reference with updated data
      const updated = setups.find((s) => s.id === setupId);
      if (updated && view.kind === "detail") {
        setView({ kind: "detail", setup: updated });
      }
    },
    [updateSetup, setups, view],
  );

  const handleClone = useCallback(
    async (source: SetupSnapshot) => {
      const cloned = await cloneSetup(source, `${source.name} (copy)`);
      setView({ kind: "edit", setup: cloned });
    },
    [cloneSetup],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSetup(id);
      setView({ kind: "list" });
    },
    [deleteSetup],
  );

  return (
    <div className="px-4 py-4">
      {/* Car selector (if > 1 car available and not forced from garage) */}
      {!forcedCarId && allCars.length > 1 && view.kind === "list" && (
        <div className="mb-4">
          <select
            value={selectedCarId}
            onChange={(e) => setSelectedCarId(e.target.value)}
            className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
          >
            {allCars.map((c) => (
              <option key={c.id} value={c.id}>{c.manufacturer} {c.name}</option>
            ))}
          </select>
        </div>
      )}

      {view.kind === "list" && (
        <>
          <div className="mb-2 text-xs text-neutral-500">
            {car.manufacturer} {car.name} — {car.scale} {car.driveType}
          </div>
          <SetupList
            setups={setups}
            loading={loading}
            onSelect={(s) => setView({ kind: "detail", setup: s })}
            onNew={() => setView({ kind: "new" })}
          />
        </>
      )}

      {view.kind === "new" && (
        <>
          <h2 className="text-base font-semibold text-neutral-200 mb-4">New Setup — {car.name}</h2>
          <SetupEditor
            car={car}
            onSave={handleSaveNew}
            onCancel={() => setView({ kind: "list" })}
          />
        </>
      )}

      {view.kind === "edit" && (
        <>
          <h2 className="text-base font-semibold text-neutral-200 mb-4">Edit Setup — {view.setup.name}</h2>
          <SetupEditor
            car={car}
            existing={view.setup}
            onSave={handleSaveEdit}
            onCancel={() => setView({ kind: "detail", setup: view.setup })}
          />
        </>
      )}

      {view.kind === "detail" && (() => {
        const setupReadOnly = isDemoRecord(view.setup as { userId?: string; _dirty?: number });
        return (
          <SetupDetail
            setup={view.setup}
            car={car}
            allSetups={setups}
            onClone={() => handleClone(view.setup)}
            onDelete={setupReadOnly ? undefined : () => handleDelete(view.setup.id)}
            onBack={() => setView({ kind: "list" })}
            onAutoSave={setupReadOnly ? undefined : (patch) => handleAutoSave(view.setup.id, patch)}
          />
        );
      })()}
    </div>
  );
}
