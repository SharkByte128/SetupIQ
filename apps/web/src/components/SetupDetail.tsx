import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { SetupSnapshot, CarDefinition, SetupEntry, SetupSection, Capability, WheelTireSetup, TireComponent, WheelPosition } from "@setupiq/shared";
import { allTires, allWheels, getAllowedValues, partCategories } from "@setupiq/shared";
import { exportSetupCsv, downloadCsv } from "../utils/export.js";
import { WheelTireSelector } from "./WheelTireSelector.js";
import { localDb, type LocalPart } from "../db/local-db.js";
import { v4 as uuid } from "uuid";
import { RichNotesEditor } from "./RichNotesEditor.js";
import { useAllVendors } from "../hooks/use-vendors.js";

interface Props {
  setup: SetupSnapshot;
  car: CarDefinition;
  chassisId?: string;
  allSetups: SetupSnapshot[];
  onClone?: () => void;
  onDelete?: () => void;
  onBack: () => void;
  onAutoSave?: (patch: Partial<Pick<SetupSnapshot, "name" | "entries" | "wheelTireSetups" | "sections" | "notes">>) => void;
}

/** Map predefined car IDs to chassis platform IDs for parts filtering. */
const predefinedChassisMap: Record<string, string> = {
  "car-mr03-rwd": "chassis-kyosho-mr03",
  "car-mrx-me": "chassis-atomic-mrx",
  "car-rx28": "chassis-reflex-rx28",
  "car-evo2-5600kv": "chassis-kyosho-mr04-evo2",
};

export function SetupDetail({ setup, car, chassisId: chassisIdProp, allSetups, onClone, onDelete, onBack, onAutoSave }: Props) {
  const allVendors = useAllVendors();
  const [compareId, setCompareId] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [expandedCap, setExpandedCap] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(setup.name);
  const [notesVal, setNotesVal] = useState(setup.notes ?? "");
  const [managingSections, setManagingSections] = useState(false);

  // Section state
  const [liveSections, setLiveSections] = useState<SetupSection[]>(
    () => [...(setup.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  );

  // Resolve chassis ID for parts filtering
  const resolvedChassisId = chassisIdProp ?? predefinedChassisMap[car.id] ?? null;

  // Fetch user's parts from the Parts Bin
  const allParts = useLiveQuery(() => localDb.parts.toArray()) ?? [];

  // Convert parts-bin tires into TireComponent format for WheelTireSelector
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
        brand: "", // vendor resolved below if needed
        name: p.name,
        position: (p.categoryId === "front-tires" ? "front" : "rear") as WheelPosition,
        compound: (String(p.attributes.compound ?? "medium").toLowerCase()) as TireComponent["compound"],
        widthMm: Number(p.attributes.widthMm) || 0,
        color: String(p.attributes.color ?? ""),
      }));
  }, [allParts, resolvedChassisId]);

  // All parts bin tires available in every corner — user picks by width
  const partsBinFrontTires = partsBinTires;
  const partsBinRearTires = partsBinTires;

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
    setLiveSections([...(setup.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
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

  const tireMap = useMemo(() => {
    const m = new Map(allTires.map((t) => [t.id, t]));
    for (const t of partsBinTires) m.set(t.id, t);
    return m;
  }, [partsBinTires]);
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
    (patch: Partial<Pick<SetupSnapshot, "name" | "entries" | "wheelTireSetups" | "sections" | "notes">>) => {
      onAutoSave?.(patch);
    },
    [onAutoSave],
  );

  // ── Section management handlers ─────────────────────
  const handleAddSection = useCallback(() => {
    const newSection: SetupSection = {
      id: uuid(),
      name: "New Section",
      columns: 1,
      sortOrder: liveSections.length,
      capabilityCategories: [],
      partCategoryIds: [],
    };
    const next = [...liveSections, newSection];
    setLiveSections(next);
    doAutoSave({ sections: next });
  }, [liveSections, doAutoSave]);

  const handleUpdateSection = useCallback((id: string, patch: Partial<SetupSection>) => {
    setLiveSections((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      doAutoSave({ sections: next });
      return next;
    });
  }, [doAutoSave]);

  const handleRemoveSection = useCallback((id: string) => {
    setLiveSections((prev) => {
      const next = prev.filter((s) => s.id !== id);
      doAutoSave({ sections: next });
      return next;
    });
  }, [doAutoSave]);

  const handleMoveSection = useCallback((id: string, dir: -1 | 1) => {
    setLiveSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      const reordered = next.map((s, i) => ({ ...s, sortOrder: i }));
      doAutoSave({ sections: reordered });
      return reordered;
    });
  }, [doAutoSave]);

  /** Part categories handled by the Wheels & Tires 4-corner selector instead of sections. */
  const tireCategoryIds = new Set(["front-tires", "rear-tires"]);

  /** Filter parts for a given set of part-category IDs and the car's chassis. */
  const getPartsForCategories = useCallback((partCatIds: string[]): LocalPart[] => {
    // Exclude tire categories — those are shown in the Wheels & Tires selector
    const filtered = partCatIds.filter((id) => !tireCategoryIds.has(id));
    if (filtered.length === 0) return [];
    return allParts
      .filter((p) => filtered.includes(p.categoryId))
      .filter((p) =>
        !resolvedChassisId ||
        p.compatibleChassisIds.length === 0 ||
        p.compatibleChassisIds.includes(resolvedChassisId),
      )
      .sort((a, b) => {
        const sa = a.sortOrder ?? Infinity;
        const sb = b.sortOrder ?? Infinity;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
  }, [allParts, resolvedChassisId]);

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

  const handleNotesChange = useCallback((md: string) => {
    setNotesVal(md);
    const trimmed = md.trim() || undefined;
    if (trimmed !== (setup.notes ?? undefined)) {
      doAutoSave({ notes: trimmed });
    }
  }, [setup.notes, doAutoSave]);

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
        {onClone && <button onClick={onClone} className="rounded bg-neutral-800 text-neutral-300 px-2.5 py-1 hover:bg-neutral-700">Clone</button>}
        {adminMode && (
          <>
            <button
              onClick={() => downloadCsv(exportSetupCsv(setup, car), `${setup.name}.csv`)}
              className="rounded bg-neutral-800 text-neutral-300 px-2.5 py-1 hover:bg-neutral-700"
            >
              Export CSV
            </button>
            {onDelete && <button onClick={onDelete} className="rounded bg-red-900 text-red-300 px-2.5 py-1 hover:bg-red-800">
              Delete
            </button>}
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

      {/* Manage Sections toggle */}
      {adminMode && (
        <button
          onClick={() => setManagingSections((p) => !p)}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${
            managingSections
              ? "bg-blue-600 text-white"
              : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          }`}
        >
          {managingSections ? "Done Managing" : "Manage Sections"}
        </button>
      )}

      {/* Section management panel */}
      {managingSections && (
        <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-300">Sections</h3>
            <button
              onClick={handleAddSection}
              className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-500"
            >
              + Add Section
            </button>
          </div>

          {liveSections.length === 0 && (
            <p className="text-xs text-neutral-500">No sections yet. Add a section to organize capabilities and parts.</p>
          )}

          {liveSections.map((sec, idx) => (
            <div key={sec.id} className="rounded-lg bg-neutral-800 border border-neutral-700 p-3 space-y-2">
              {/* Section header: name + column count */}
              <div className="flex items-center gap-2">
                <input
                  value={sec.name}
                  onChange={(e) => handleUpdateSection(sec.id, { name: e.target.value })}
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                />
                <select
                  value={sec.columns}
                  onChange={(e) => handleUpdateSection(sec.id, { columns: parseInt(e.target.value) })}
                  className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n} col{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleMoveSection(sec.id, -1)}
                  disabled={idx === 0}
                  className="text-xs text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 px-1"
                >↑</button>
                <button
                  onClick={() => handleMoveSection(sec.id, 1)}
                  disabled={idx === liveSections.length - 1}
                  className="text-xs text-neutral-400 hover:text-neutral-200 disabled:text-neutral-700 px-1"
                >↓</button>
                <button
                  onClick={() => handleRemoveSection(sec.id)}
                  className="text-xs text-red-400 hover:text-red-300 px-1"
                >✕</button>
              </div>

              {/* Capability categories assignment */}
              <div>
                <p className="text-xs text-neutral-500 mb-1">Capability Categories:</p>
                <div className="flex flex-wrap gap-1">
                  {Array.from(categories.keys()).map((cat) => {
                    const isAssigned = sec.capabilityCategories.includes(cat);
                    const assignedElsewhere = !isAssigned && liveSections.some((s) => s.id !== sec.id && s.capabilityCategories.includes(cat));
                    return (
                      <button
                        key={cat}
                        disabled={assignedElsewhere}
                        onClick={() => {
                          const next = isAssigned
                            ? sec.capabilityCategories.filter((c) => c !== cat)
                            : [...sec.capabilityCategories, cat];
                          handleUpdateSection(sec.id, { capabilityCategories: next });
                        }}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          isAssigned
                            ? "bg-blue-600/20 border-blue-500 text-blue-300"
                            : assignedElsewhere
                              ? "bg-neutral-900 border-neutral-800 text-neutral-700 cursor-not-allowed"
                              : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                        }`}
                        title={assignedElsewhere ? `Already in another section` : undefined}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Parts categories assignment */}
              <div>
                <p className="text-xs text-neutral-500 mb-1">Parts Categories:</p>
                <div className="flex flex-wrap gap-1">
                  {partCategories.filter((pc) => !tireCategoryIds.has(pc.id)).map((pc) => {
                    const isAssigned = sec.partCategoryIds.includes(pc.id);
                    const assignedElsewhere = !isAssigned && liveSections.some((s) => s.id !== sec.id && s.partCategoryIds.includes(pc.id));
                    return (
                      <button
                        key={pc.id}
                        disabled={assignedElsewhere}
                        onClick={() => {
                          const next = isAssigned
                            ? sec.partCategoryIds.filter((c) => c !== pc.id)
                            : [...sec.partCategoryIds, pc.id];
                          handleUpdateSection(sec.id, { partCategoryIds: next });
                        }}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          isAssigned
                            ? "bg-green-600/20 border-green-500 text-green-300"
                            : assignedElsewhere
                              ? "bg-neutral-900 border-neutral-800 text-neutral-700 cursor-not-allowed"
                              : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                        }`}
                        title={assignedElsewhere ? `Already in another section` : undefined}
                      >
                        {pc.icon} {pc.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Section-based layout (if sections exist) ── */}
      {liveSections.length > 0 ? (
        <>
          {liveSections.map((sec) => {
            const sectionParts = getPartsForCategories(sec.partCategoryIds);
            const hasCaps = sec.capabilityCategories.some((catName) => categories.has(catName));
            // Hide sections that are empty after excluding tire categories
            if (!hasCaps && sectionParts.length === 0) return null;
            const colClass =
              sec.columns === 2 ? "grid-cols-2"
              : sec.columns === 3 ? "grid-cols-3"
              : sec.columns === 4 ? "grid-cols-4"
              : "";

            return (
              <section key={sec.id}>
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  {sec.name}
                  {sec.columns > 1 && <span className="text-neutral-600 ml-1">({sec.columns} col)</span>}
                </h3>

                {/* Capability categories in this section */}
                <div className={sec.columns > 1 ? `grid ${colClass} gap-3` : ""}>
                  {sec.capabilityCategories.map((catName) => {
                    const caps = categories.get(catName);
                    if (!caps) return null;
                    return (
                      <div key={catName}>
                        <p className="text-xs text-neutral-500 mb-1 font-medium">{catName}</p>
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
                                    <span className={`text-xs text-neutral-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                                  </div>
                                </button>
                                {isExpanded && (
                                  <div className="px-3 py-3 bg-neutral-950/50 border-t border-neutral-800">
                                    <InlineCapabilityEditor capability={cap} value={val} entries={liveEntries} car={car} onChange={handleCapChange} onDone={() => setExpandedCap(null)} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Parts from Parts Bin in this section */}
                {sectionParts.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-neutral-500 mb-1 font-medium">Parts Inventory</p>
                    <div className={sec.columns > 1 ? `grid ${colClass} gap-2` : "space-y-1"}>
                      {sectionParts.map((part) => {
                        const vendor = allVendors.find(v => v.id === part.vendorId);
                        const partCat = partCategories.find((c) => c.id === part.categoryId);
                        return (
                          <div key={part.id} className="rounded bg-neutral-900 border border-neutral-800 px-3 py-2 flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-neutral-200 truncate">
                                {part.sortOrder != null && <span className="text-neutral-600 mr-1">#{part.sortOrder}</span>}
                                {part.name}
                              </p>
                              <p className="text-xs text-neutral-500 truncate">
                                {vendor?.name ?? "Unknown"} · {partCat?.name ?? part.categoryId}
                                {part.sku && <span className="ml-1 text-neutral-600">({part.sku})</span>}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {/* Unsectioned capabilities (categories not assigned to any section) */}
          {(() => {
            const assignedCats = new Set(liveSections.flatMap((s) => s.capabilityCategories));
            const unsectioned = Array.from(categories.entries()).filter(([catName]) => !assignedCats.has(catName));
            if (unsectioned.length === 0) return null;
            return unsectioned.map(([category, caps]) => (
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
                            <span className={`text-xs text-neutral-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-3 py-3 bg-neutral-950/50 border-t border-neutral-800">
                            <InlineCapabilityEditor capability={cap} value={val} entries={liveEntries} car={car} onChange={handleCapChange} onDone={() => setExpandedCap(null)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ));
          })()}
        </>
      ) : (
        /* ── Original flat category layout (no sections defined) ── */
        <>
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
                          <span className={`text-xs text-neutral-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 py-3 bg-neutral-950/50 border-t border-neutral-800">
                          <InlineCapabilityEditor capability={cap} value={val} entries={liveEntries} car={car} onChange={handleCapChange} onDone={() => setExpandedCap(null)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {/* Wheel / Tire summary */}
      <section>
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Wheels & Tires</h3>
        {expandedSection === "wheels" ? (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <WheelTireSelector position="front" side="left" setup={liveWts["front-left"]} onChange={handleWheelTireChange} extraTires={partsBinFrontTires} />
              <WheelTireSelector position="front" side="right" setup={liveWts["front-right"]} onChange={handleWheelTireChange} extraTires={partsBinFrontTires} />
              <WheelTireSelector position="rear" side="left" setup={liveWts["rear-left"]} onChange={handleWheelTireChange} extraTires={partsBinRearTires} />
              <WheelTireSelector position="rear" side="right" setup={liveWts["rear-right"]} onChange={handleWheelTireChange} extraTires={partsBinRearTires} />
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
                    <p className="text-xs font-semibold text-neutral-500 uppercase">
                      {live.position} {live.side}
                      {live.widthMm && <span className="text-neutral-600 ml-1 normal-case">{live.widthMm}mm</span>}
                    </p>
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
        <RichNotesEditor
          value={notesVal}
          onChange={handleNotesChange}
          placeholder="Tap to add notes…"
          minHeight={60}
        />
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
