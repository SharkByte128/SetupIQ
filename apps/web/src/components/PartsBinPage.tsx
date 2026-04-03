import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  vendors,
  partCategories,
  chassisPlatforms,
  getCategoryById,
  getVendorById,
  type Vendor,
  type PartCategory,
} from "@setupiq/shared";
import { allCars } from "@setupiq/shared";
import { localDb, type LocalPart, type LocalPartFile } from "../db/local-db.js";
import { lookupPartBySku, suggestPartsForChassis, type PartLookupResult, type SuggestedPart } from "../lib/gemini-parts.js";
import { resizeImage } from "../lib/resize-image.js";
import { v4 as uuid } from "uuid";

// ── Vendor Logo SVGs ──────────────────────────────────────────

function VendorLogo({ slug, size = 48 }: { slug: string; size?: number }) {
  const s = { width: size, height: size };
  switch (slug) {
    case "kyosho":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#c41e3a" />
          <text x="24" y="29" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">K</text>
          <text x="24" y="40" textAnchor="middle" fill="white" fontSize="7" fontFamily="Arial, sans-serif">KYOSHO</text>
        </svg>
      );
    case "pn-racing":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#1a1a2e" />
          <text x="24" y="28" textAnchor="middle" fill="#f5c518" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">PN</text>
          <text x="24" y="40" textAnchor="middle" fill="#f5c518" fontSize="6" fontFamily="Arial, sans-serif">RACING</text>
        </svg>
      );
    case "nexx-racing":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#0d0d0d" />
          <text x="24" y="30" textAnchor="middle" fill="#00bfff" fontSize="12" fontWeight="bold" fontFamily="Arial, sans-serif">NEXX</text>
          <text x="24" y="40" textAnchor="middle" fill="#00bfff" fontSize="6" fontFamily="Arial, sans-serif">RACING</text>
        </svg>
      );
    case "silver-horse":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#2c2c2c" />
          <text x="24" y="26" textAnchor="middle" fill="#c0c0c0" fontSize="9" fontWeight="bold" fontFamily="Arial, sans-serif">SILVER</text>
          <text x="24" y="38" textAnchor="middle" fill="#c0c0c0" fontSize="9" fontWeight="bold" fontFamily="Arial, sans-serif">HORSE</text>
        </svg>
      );
    case "atomic-rc":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#1a1a1a" />
          <circle cx="24" cy="22" r="8" fill="none" stroke="#ff4444" strokeWidth="1.5" />
          <circle cx="24" cy="22" r="2" fill="#ff4444" />
          <line x1="24" y1="14" x2="24" y2="30" stroke="#ff4444" strokeWidth="1" />
          <line x1="16" y1="22" x2="32" y2="22" stroke="#ff4444" strokeWidth="1" />
          <text x="24" y="42" textAnchor="middle" fill="#ff4444" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">ATOMIC</text>
        </svg>
      );
    case "reflex-racing":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#003366" />
          <text x="24" y="28" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="Arial, sans-serif">RR</text>
          <text x="24" y="40" textAnchor="middle" fill="#ffffff" fontSize="5.5" fontFamily="Arial, sans-serif">REFLEX</text>
        </svg>
      );
    default:
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#333" />
          <text x="24" y="30" textAnchor="middle" fill="#999" fontSize="12">?</text>
        </svg>
      );
  }
}

// ── SKU Lookup Field ──────────────────────────────────────────

function SkuLookupField({
  sku,
  onSkuChange,
  onLookupResult,
  inputClass,
}: {
  sku: string;
  onSkuChange: (v: string) => void;
  onLookupResult: (r: PartLookupResult) => void;
  inputClass: string;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const handleLookup = async () => {
    setLoading(true);
    setStatus(null);
    const { result, error } = await lookupPartBySku(sku);
    setLoading(false);

    if (error) {
      setStatus({ type: "error", msg: error });
      return;
    }
    if (result) {
      onLookupResult(result);
      setStatus({ type: "success", msg: "Fields updated from AI lookup" });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div>
      <label className="text-xs text-neutral-400 mb-1 block">SKU / Part Number</label>
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="e.g. MZW-38"
          value={sku}
          onChange={(e) => onSkuChange(e.target.value)}
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={!sku.trim() || loading}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-xs font-medium px-3 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1"
        >
          {loading ? (
            <span className="animate-pulse">✨ Looking up…</span>
          ) : (
            <>✨ Lookup</>
          )}
        </button>
      </div>
      {status && (
        <p className={`text-[11px] mt-1 ${status.type === "error" ? "text-red-400" : "text-green-400"}`}>
          {status.msg}
        </p>
      )}
    </div>
  );
}

// ── View Types ────────────────────────────────────────────────

type View =
  | { type: "list" }
  | { type: "add"; vendor: Vendor; category: PartCategory; editPart?: LocalPart }
  | { type: "quickAdd" }
  | { type: "suggest" }
  | { type: "detail"; part: LocalPart };

// ── Responsive helper ─────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

// ── Main Component ────────────────────────────────────────────

export function PartsBinPage() {
  const [view, setView] = useState<View>({ type: "list" });

  const goBack = useCallback(() => {
    setView({ type: "list" });
  }, []);

  return (
    <div className="px-4 py-4">
      {view.type !== "list" && (
        <button
          onClick={goBack}
          className="text-sm text-blue-400 hover:text-blue-300 mb-3"
        >
          ← Back
        </button>
      )}

      {view.type === "list" && (
        <PartsBinListView
          onQuickAdd={() => setView({ type: "quickAdd" })}
          onSuggest={() => setView({ type: "suggest" })}
          onDetail={(p) => setView({ type: "detail", part: p })}
          onEdit={(p) => {
            const v = getVendorById(p.vendorId);
            const c = getCategoryById(p.categoryId);
            if (v && c) setView({ type: "add", vendor: v, category: c, editPart: p });
          }}
        />
      )}
      {view.type === "add" && (
        <AddPartForm
          vendor={view.vendor}
          category={view.category}
          editPart={view.editPart}
          onSaved={(p) => setView({ type: "detail", part: p })}
          onCancel={goBack}
        />
      )}
      {view.type === "detail" && (
        <PartDetail
          part={view.part}
          onEdit={() => {
            const v = getVendorById(view.part.vendorId);
            const c = getCategoryById(view.part.categoryId);
            if (v && c) setView({ type: "add", vendor: v, category: c, editPart: view.part });
          }}
        />
      )}
      {view.type === "quickAdd" && (
        <QuickAddPart
          onSaved={(p) => setView({ type: "detail", part: p })}
          onCancel={goBack}
        />
      )}
      {view.type === "suggest" && (
        <SuggestPartsView
          onDone={() => setView({ type: "list" })}
        />
      )}
    </div>
  );
}

// ── Parts Bin List View (flat list + filters) ─────────────────

function PartsBinListView({
  onQuickAdd,
  onSuggest,
  onDetail,
  onEdit,
}: {
  onQuickAdd: () => void;
  onSuggest: () => void;
  onDetail: (p: LocalPart) => void;
  onEdit: (p: LocalPart) => void;
}) {
  const isMobile = useIsMobile();
  const allParts = useLiveQuery(() => localDb.parts.toArray()) ?? [];
  const customCars = useLiveQuery(() => localDb.customCars.toArray()) ?? [];

  // Garage cars: predefined + custom
  const garageCars = useMemo(() => {
    const predefined = allCars.map((c) => ({ id: c.id, name: `${c.manufacturer} ${c.name}` }));
    const custom = customCars.map((c) => ({ id: c.id, name: c.name }));
    return [...predefined, ...custom];
  }, [customCars]);

  // Filter state
  const [vendorFilters, setVendorFilters] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [carFilters, setCarFilters] = useState<Set<string>>(new Set());

  // Expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Compute vendor counts
  const vendorCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of allParts) m[p.vendorId] = (m[p.vendorId] || 0) + 1;
    return m;
  }, [allParts]);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of allParts) m[p.categoryId] = (m[p.categoryId] || 0) + 1;
    return m;
  }, [allParts]);

  // Filter toggle helpers
  const toggleVendor = (id: string) => {
    setVendorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleCategory = (id: string) => {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleCar = (id: string) => {
    setCarFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Apply filters
  const filteredParts = useMemo(() => {
    return allParts.filter((p) => {
      if (vendorFilters.size > 0 && !vendorFilters.has(p.vendorId)) return false;
      if (categoryFilters.size > 0 && !categoryFilters.has(p.categoryId)) return false;
      if (carFilters.size > 0) {
        // Part must be compatible with at least one selected car
        // compatibleChassisIds stores chassis platform IDs, but we also support car IDs
        const partCarIds = new Set(p.compatibleChassisIds ?? []);
        const hasMatch = [...carFilters].some((carId) => partCarIds.has(carId));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [allParts, vendorFilters, categoryFilters, carFilters]);

  // Inline edit save handler
  const handleSavePart = useCallback(async (part: LocalPart) => {
    await localDb.parts.put({ ...part, updatedAt: new Date().toISOString(), _dirty: 1 as const });
  }, []);

  // Inline toggle compatible car on a part
  const handleToggleCarCompat = useCallback(async (part: LocalPart, carId: string) => {
    const current = part.compatibleChassisIds ?? [];
    const next = current.includes(carId)
      ? current.filter((id) => id !== carId)
      : [...current, carId];
    const updated = { ...part, compatibleChassisIds: next, updatedAt: new Date().toISOString(), _dirty: 1 as const };
    await localDb.parts.put(updated);
  }, []);

  // Only show vendors that have parts
  const activeVendors = useMemo(() =>
    vendors.filter((v) => (vendorCounts[v.id] ?? 0) > 0),
    [vendorCounts],
  );

  // Only show categories that have parts
  const activeCategories = useMemo(() =>
    partCategories.filter((c) => (categoryCounts[c.id] ?? 0) > 0),
    [categoryCounts],
  );

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Parts Bin</h2>
          <p className="text-sm text-neutral-400 mt-0.5">{allParts.length} parts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSuggest}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            ✨ AI Suggest
          </button>
          <button
            onClick={onQuickAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            + Add Part
          </button>
        </div>
      </div>

      {/* ── Vendor Filters ───────────────────────────── */}
      {activeVendors.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">Vendors</p>
          <div className="flex flex-wrap gap-2">
            {activeVendors.map((v) => {
              const active = vendorFilters.has(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggleVendor(v.id)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "border-green-500 bg-green-900/20 text-green-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  <VendorLogo slug={v.slug} size={16} />
                  {v.name}
                  <span className="text-neutral-600 ml-0.5">{vendorCounts[v.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Category Filters ─────────────────────────── */}
      {activeCategories.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">Categories</p>
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((c) => {
              const active = categoryFilters.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "border-green-500 bg-green-900/20 text-green-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  {c.icon} {c.name}
                  <span className="text-neutral-600 ml-1">{categoryCounts[c.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Car Filters ──────────────────────────────── */}
      {garageCars.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-neutral-500 mb-1.5">Cars</p>
          <div className="flex flex-wrap gap-2">
            {garageCars.map((car) => {
              const active = carFilters.has(car.id);
              return (
                <button
                  key={car.id}
                  onClick={() => toggleCar(car.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "border-green-500 bg-green-900/20 text-green-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  🏎️ {car.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active filter summary */}
      {(vendorFilters.size > 0 || categoryFilters.size > 0 || carFilters.size > 0) && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-neutral-500">
            Showing {filteredParts.length} of {allParts.length} parts
          </p>
          <button
            onClick={() => { setVendorFilters(new Set()); setCategoryFilters(new Set()); setCarFilters(new Set()); }}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* ── Parts List ───────────────────────────────── */}
      {filteredParts.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-sm">{allParts.length === 0 ? "No parts yet — add some!" : "No parts match your filters."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredParts.map((part) => (
            <PartRow
              key={part.id}
              part={part}
              isExpanded={expandedId === part.id}
              onToggle={() => setExpandedId(expandedId === part.id ? null : part.id)}
              isMobile={isMobile}
              garageCars={garageCars}
              onSave={handleSavePart}
              onToggleCarCompat={handleToggleCarCompat}
              onDetail={onDetail}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Part Row (expandable, inline-edit on PC) ──────────────────

function PartRow({
  part,
  isExpanded,
  onToggle,
  isMobile,
  garageCars,
  onSave,
  onToggleCarCompat,
  onDetail,
  onEdit,
}: {
  part: LocalPart;
  isExpanded: boolean;
  onToggle: () => void;
  isMobile: boolean;
  garageCars: { id: string; name: string }[];
  onSave: (part: LocalPart) => Promise<void>;
  onToggleCarCompat: (part: LocalPart, carId: string) => Promise<void>;
  onDetail: (p: LocalPart) => void;
  onEdit: (p: LocalPart) => void;
}) {
  const vendor = getVendorById(part.vendorId);
  const category = getCategoryById(part.categoryId);

  // Local edit state (only used on PC)
  const [editName, setEditName] = useState(part.name);
  const [editSku, setEditSku] = useState(part.sku ?? "");
  const [editNotes, setEditNotes] = useState(part.notes ?? "");

  // Sync local state when part changes from DB (e.g., after car compat toggle)
  useEffect(() => {
    setEditName(part.name);
    setEditSku(part.sku ?? "");
    setEditNotes(part.notes ?? "");
  }, [part.name, part.sku, part.notes]);

  const handleBlurSave = useCallback(async (field: "name" | "sku" | "notes", value: string) => {
    const trimmed = value.trim();
    const currentVal = field === "name" ? part.name : field === "sku" ? (part.sku ?? "") : (part.notes ?? "");
    if (trimmed === currentVal) return;
    const updated = { ...part, [field]: trimmed || (field === "name" ? part.name : undefined) };
    await onSave(updated);
  }, [part, onSave]);

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-blue-500";

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
      {/* Collapsed row */}
      <button
        onClick={onToggle}
        className="w-full text-left p-3 flex gap-3 hover:bg-neutral-800/50 transition-colors"
      >
        {/* Vendor icon */}
        <div className="flex-shrink-0 self-center">
          {vendor && <VendorLogo slug={vendor.slug} size={28} />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-200 truncate">{part.name}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {vendor?.name && `${vendor.name} · `}
            {category && `${category.icon} ${category.name}`}
            {part.sku && ` · ${part.sku}`}
          </p>
          {/* Car compatibility pills (compact in collapsed view) */}
          {part.compatibleChassisIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {part.compatibleChassisIds.slice(0, 3).map((id) => {
                const car = garageCars.find((c) => c.id === id);
                const cp = chassisPlatforms.find((c) => c.id === id);
                const label = car?.name ?? cp?.name ?? id;
                return (
                  <span key={id} className="text-[10px] bg-green-900/30 text-green-400 rounded-full px-1.5 py-0.5">
                    {label}
                  </span>
                );
              })}
              {part.compatibleChassisIds.length > 3 && (
                <span className="text-[10px] text-neutral-500">+{part.compatibleChassisIds.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Expand chevron */}
        <span className="text-neutral-600 self-center text-sm">
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-neutral-800 p-3 space-y-3">
          {isMobile ? (
            /* ── Mobile: Read-only view ────────────────── */
            <>
              {part.sku && (
                <div>
                  <p className="text-xs text-neutral-500">SKU</p>
                  <p className="text-sm font-mono text-neutral-200">{part.sku}</p>
                </div>
              )}

              {/* Attributes */}
              {category && Object.keys(part.attributes).length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {category.attributes.map((attr) => {
                    const val = part.attributes[attr.key];
                    if (val === undefined || val === "") return null;
                    return (
                      <div key={attr.key}>
                        <p className="text-xs text-neutral-500">{attr.label}</p>
                        <p className="text-sm text-neutral-200">{val}{attr.unit ? ` ${attr.unit}` : ""}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {part.notes && (
                <div>
                  <p className="text-xs text-neutral-500">Notes</p>
                  <p className="text-sm text-neutral-300">{part.notes}</p>
                </div>
              )}

              {/* Car compatibility (read-only) */}
              <div>
                <p className="text-xs text-neutral-500 mb-1.5">Compatible Cars</p>
                <div className="flex flex-wrap gap-1.5">
                  {garageCars.map((car) => {
                    const compat = part.compatibleChassisIds.includes(car.id);
                    return (
                      <span
                        key={car.id}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          compat
                            ? "border-green-500 bg-green-900/20 text-green-300"
                            : "border-neutral-700 bg-neutral-900 text-neutral-600"
                        }`}
                      >
                        {car.name}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onDetail(part)}
                  className="flex-1 text-sm py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                  View Details
                </button>
                <button
                  onClick={() => onEdit(part)}
                  className="flex-1 text-sm py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                  Edit
                </button>
              </div>
            </>
          ) : (
            /* ── Desktop: Inline edit (save on blur) ───── */
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Name</label>
                  <input
                    className={inputClass}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleBlurSave("name", editName)}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">SKU</label>
                  <input
                    className={inputClass}
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    onBlur={() => handleBlurSave("sku", editSku)}
                  />
                </div>
              </div>

              {/* Attributes (read-only in inline, go to full edit for changes) */}
              {category && Object.keys(part.attributes).length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {category.attributes.map((attr) => {
                    const val = part.attributes[attr.key];
                    if (val === undefined || val === "") return null;
                    return (
                      <div key={attr.key}>
                        <p className="text-xs text-neutral-500">{attr.label}</p>
                        <p className="text-sm text-neutral-200">{val}{attr.unit ? ` ${attr.unit}` : ""}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Notes</label>
                <textarea
                  className={inputClass + " min-h-[40px] resize-y"}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={() => handleBlurSave("notes", editNotes)}
                />
              </div>

              {/* Car compatibility pills (interactive) */}
              <div>
                <p className="text-xs text-neutral-500 mb-1.5">Compatible Cars</p>
                <div className="flex flex-wrap gap-1.5">
                  {garageCars.map((car) => {
                    const compat = part.compatibleChassisIds.includes(car.id);
                    return (
                      <button
                        key={car.id}
                        onClick={() => onToggleCarCompat(part, car.id)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          compat
                            ? "border-green-500 bg-green-900/20 text-green-300"
                            : "border-neutral-700 bg-neutral-900 text-neutral-600 hover:border-neutral-500"
                        }`}
                      >
                        {car.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Link to full detail (photos/PDFs) */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onDetail(part)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Photos & Documents →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add / Edit Part Form ──────────────────────────────────────

function AddPartForm({
  vendor,
  category,
  editPart,
  onSaved,
  onCancel,
}: {
  vendor: Vendor;
  category: PartCategory;
  editPart?: LocalPart;
  onSaved: (p: LocalPart) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editPart?.name ?? "");
  const [sku, setSku] = useState(editPart?.sku ?? "");
  const [notes, setNotes] = useState(editPart?.notes ?? "");
  const [selectedChassis, setSelectedChassis] = useState<string[]>(
    editPart?.compatibleChassisIds ?? [],
  );
  const [attrs, setAttrs] = useState<Record<string, string | number>>(
    editPart?.attributes ?? {},
  );

  const toggleChassis = (id: string) => {
    setSelectedChassis((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const setAttr = (key: string, value: string | number) => {
    setAttrs((prev) => ({ ...prev, [key]: value }));
  };

  const applyLookup = (r: PartLookupResult) => {
    if (r.name) setName(r.name);
    if (r.compatibleChassisIds?.length) setSelectedChassis(r.compatibleChassisIds);
    if (r.notes) setNotes(r.notes);
    if (r.attributes) setAttrs((prev) => ({ ...prev, ...r.attributes }));
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    const now = new Date().toISOString();
    const part: LocalPart = {
      id: editPart?.id ?? uuid(),
      userId: "local",
      vendorId: vendor.id,
      categoryId: category.id,
      name: name.trim(),
      sku: sku.trim() || undefined,
      compatibleChassisIds: selectedChassis,
      attributes: attrs,
      notes: notes.trim() || undefined,
      createdAt: editPart?.createdAt ?? now,
      updatedAt: now,
      _dirty: 1 as const,
    };

    await localDb.parts.put(part);
    onSaved(part);
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">
        {editPart ? "Edit" : "Add"} {category.name.replace(/s$/, "")}
      </h2>

      <div className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Part Name *</label>
          <input
            className={inputClass}
            placeholder={`e.g. ${vendor.name} ${category.name.replace(/s$/, "")} ...`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* SKU + AI Lookup */}
        <SkuLookupField
          sku={sku}
          onSkuChange={setSku}
          onLookupResult={applyLookup}
          inputClass={inputClass}
        />

        {/* Compatible Chassis */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Compatible Chassis</label>
          <div className="flex flex-wrap gap-2">
            {chassisPlatforms.map((cp) => (
              <button
                key={cp.id}
                onClick={() => toggleChassis(cp.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedChassis.includes(cp.id)
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {cp.name}
              </button>
            ))}
          </div>
        </div>

        {/* Category-specific attributes */}
        {category.attributes.length > 0 && (
          <div>
            <label className="text-xs text-neutral-400 mb-2 block">Specifications</label>
            <div className="flex flex-col gap-3">
              {category.attributes.map((attr) => (
                <div key={attr.key}>
                  <label className="text-xs text-neutral-500 mb-1 block">
                    {attr.label}
                    {attr.required && " *"}
                  </label>
                  {attr.type === "pick" && attr.options ? (
                    <select
                      className={inputClass}
                      value={(attrs[attr.key] as string) ?? ""}
                      onChange={(e) => setAttr(attr.key, e.target.value)}
                    >
                      <option value="">Select...</option>
                      {attr.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : attr.type === "number" ? (
                    <input
                      type="number"
                      className={inputClass}
                      placeholder={attr.unit ? `(${attr.unit})` : ""}
                      value={attrs[attr.key] ?? ""}
                      onChange={(e) =>
                        setAttr(attr.key, e.target.value ? Number(e.target.value) : "")
                      }
                    />
                  ) : (
                    <input
                      className={inputClass}
                      placeholder={attr.label}
                      value={(attrs[attr.key] as string) ?? ""}
                      onChange={(e) => setAttr(attr.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
          <textarea
            className={inputClass + " min-h-[60px] resize-y"}
            placeholder="Any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
          >
            {editPart ? "Save Changes" : "Add Part"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── Part Detail ───────────────────────────────────────────────

function PartDetail({
  part,
  onEdit,
}: {
  part: LocalPart;
  onEdit: () => void;
}) {
  const vendor = getVendorById(part.vendorId);
  const category = getCategoryById(part.categoryId);
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string; url: string }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Load files on mount / part change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const records = await localDb.partFiles.where("partId").equals(part.id).toArray();
      if (cancelled) return;
      setFiles(
        records.map((r) => ({
          id: r.id,
          name: r.name,
          mimeType: r.mimeType,
          url: URL.createObjectURL(r.blob),
        })),
      );
    }
    load();
    return () => {
      cancelled = true;
      files.forEach((f) => URL.revokeObjectURL(f.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.id]);

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const resized = await resizeImage(file, 800);
      const record: LocalPartFile = {
        id: uuid(),
        partId: part.id,
        blob: resized,
        name: file.name,
        mimeType: "image/webp",
        createdAt: new Date().toISOString(),
      };
      await localDb.partFiles.add(record);
      setFiles((prev) => [
        ...prev,
        { id: record.id, name: record.name, mimeType: record.mimeType, url: URL.createObjectURL(resized) },
      ]);
      e.target.value = "";
    },
    [part.id],
  );

  const handlePdfUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const record: LocalPartFile = {
        id: uuid(),
        partId: part.id,
        blob: file,
        name: file.name,
        mimeType: file.type || "application/pdf",
        createdAt: new Date().toISOString(),
      };
      await localDb.partFiles.add(record);
      setFiles((prev) => [
        ...prev,
        { id: record.id, name: record.name, mimeType: record.mimeType, url: URL.createObjectURL(file) },
      ]);
      e.target.value = "";
    },
    [part.id],
  );

  const handleDeleteFile = useCallback(async (fileId: string) => {
    const f = files.find((x) => x.id === fileId);
    if (f) URL.revokeObjectURL(f.url);
    await localDb.partFiles.delete(fileId);
    setFiles((prev) => prev.filter((x) => x.id !== fileId));
  }, [files]);

  const images = files.filter((f) => f.mimeType.startsWith("image/"));
  const pdfs = files.filter((f) => f.mimeType === "application/pdf");

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {vendor && <VendorLogo slug={vendor.slug} size={32} />}
          <div>
            <h2 className="text-lg font-semibold">{part.name}</h2>
            <p className="text-xs text-neutral-500">
              {vendor?.name} · {category?.name}
            </p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Edit
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {part.sku && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
            <p className="text-xs text-neutral-500">SKU</p>
            <p className="text-sm font-mono">{part.sku}</p>
          </div>
        )}

        {part.compatibleChassisIds.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
            <p className="text-xs text-neutral-500 mb-2">Compatible Chassis</p>
            <div className="flex flex-wrap gap-1.5">
              {part.compatibleChassisIds.map((id) => {
                const cp = chassisPlatforms.find((c) => c.id === id);
                return cp ? (
                  <span
                    key={id}
                    className="text-xs px-2 py-1 bg-neutral-800 rounded-full text-neutral-300"
                  >
                    {cp.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {category && Object.keys(part.attributes).length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
            <p className="text-xs text-neutral-500 mb-2">Specifications</p>
            <div className="grid grid-cols-2 gap-2">
              {category.attributes.map((attr) => {
                const val = part.attributes[attr.key];
                if (val === undefined || val === "") return null;
                return (
                  <div key={attr.key}>
                    <p className="text-xs text-neutral-500">{attr.label}</p>
                    <p className="text-sm">
                      {val}
                      {attr.unit ? ` ${attr.unit}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {part.notes && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
            <p className="text-xs text-neutral-500">Notes</p>
            <p className="text-sm text-neutral-300">{part.notes}</p>
          </div>
        )}

        {/* ── Photos ─────────────────────────────────── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-neutral-500">Photos</p>
            <button
              onClick={() => imageInputRef.current?.click()}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + Add Photo
            </button>
          </div>
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative group">
                  <button
                    onClick={() => setViewingImage(img.url)}
                    className="w-full"
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-20 object-cover rounded-lg"
                    />
                  </button>
                  <button
                    onClick={() => handleDeleteFile(img.id)}
                    className="absolute top-1 right-1 bg-black/60 text-red-400 rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-600">No photos yet</p>
          )}
        </div>

        {/* ── Documents ──────────────────────────────── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-neutral-500">Documents</p>
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + Add PDF
            </button>
          </div>
          {pdfs.length > 0 ? (
            <div className="flex flex-col gap-2">
              {pdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  className="flex items-center justify-between bg-neutral-800 rounded-lg px-3 py-2 group"
                >
                  <button
                    onClick={() => setViewingPdf(pdf.url)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    <span className="text-lg">📄</span>
                    <span className="text-sm text-neutral-300 truncate">{pdf.name}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteFile(pdf.id)}
                    className="text-red-400 text-xs ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-600">No documents yet</p>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handlePdfUpload}
      />

      {/* ── Fullscreen image viewer ────────────────── */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <img
            src={viewingImage}
            alt="Part photo"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <button
            className="absolute top-4 right-4 text-white text-2xl"
            onClick={() => setViewingImage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Fullscreen PDF viewer ──────────────────── */}
      {viewingPdf && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4"
        >
          <div className="flex justify-end mb-2">
            <button
              className="text-white text-2xl"
              onClick={() => setViewingPdf(null)}
            >
              ✕
            </button>
          </div>
          <iframe
            src={viewingPdf}
            title="PDF Document"
            className="flex-1 rounded-lg bg-white"
          />
        </div>
      )}
    </>
  );
}

// ── Quick Add Part (vendor + category pickers in one form) ────

function QuickAddPart({
  onSaved,
  onCancel,
}: {
  onSaved: (p: LocalPart) => void;
  onCancel: () => void;
}) {
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PartCategory | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedChassis, setSelectedChassis] = useState<string[]>([]);
  const [attrs, setAttrs] = useState<Record<string, string | number>>({});

  const toggleChassis = (id: string) => {
    setSelectedChassis((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const setAttr = (key: string, value: string | number) => {
    setAttrs((prev) => ({ ...prev, [key]: value }));
  };

  // Reset attrs when category changes
  const handleCategoryChange = (cat: PartCategory | null) => {
    setSelectedCategory(cat);
    setAttrs({});
  };

  const applyLookup = (r: PartLookupResult) => {
    if (r.name) setName(r.name);
    if (r.vendorId) {
      const v = vendors.find((v) => v.id === r.vendorId);
      if (v) setSelectedVendor(v);
    }
    if (r.categoryId) {
      const c = partCategories.find((c) => c.id === r.categoryId);
      if (c) setSelectedCategory(c);
    }
    if (r.compatibleChassisIds?.length) setSelectedChassis(r.compatibleChassisIds);
    if (r.notes) setNotes(r.notes);
    if (r.attributes) setAttrs((prev) => ({ ...prev, ...r.attributes }));
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedVendor || !selectedCategory) return;

    const now = new Date().toISOString();
    const part: LocalPart = {
      id: uuid(),
      userId: "local",
      vendorId: selectedVendor.id,
      categoryId: selectedCategory.id,
      name: name.trim(),
      sku: sku.trim() || undefined,
      compatibleChassisIds: selectedChassis,
      attributes: attrs,
      notes: notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      _dirty: 1 as const,
    };

    await localDb.parts.put(part);
    onSaved(part);
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">Add Part</h2>

      <div className="flex flex-col gap-4">
        {/* Vendor picker */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Vendor *</label>
          <div className="grid grid-cols-3 gap-2">
            {vendors.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVendor(v)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                  selectedVendor?.id === v.id
                    ? "bg-blue-600/20 border-blue-500"
                    : "bg-neutral-900 border-neutral-800 hover:border-neutral-600"
                }`}
              >
                <VendorLogo slug={v.slug} size={32} />
                <span className="text-[10px] text-neutral-400">{v.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category picker */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Category *</label>
          <div className="flex flex-wrap gap-2">
            {partCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedCategory?.id === cat.id
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Part Name *</label>
          <input
            className={inputClass}
            placeholder="e.g. PN Racing 53T Spur Gear"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* SKU + AI Lookup */}
        <SkuLookupField
          sku={sku}
          onSkuChange={setSku}
          onLookupResult={applyLookup}
          inputClass={inputClass}
        />

        {/* Compatible Chassis */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Compatible Chassis</label>
          <div className="flex flex-wrap gap-2">
            {chassisPlatforms.map((cp) => (
              <button
                key={cp.id}
                onClick={() => toggleChassis(cp.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedChassis.includes(cp.id)
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {cp.name}
              </button>
            ))}
          </div>
        </div>

        {/* Category-specific attributes */}
        {selectedCategory && selectedCategory.attributes.length > 0 && (
          <div>
            <label className="text-xs text-neutral-400 mb-2 block">Specifications</label>
            <div className="flex flex-col gap-3">
              {selectedCategory.attributes.map((attr) => (
                <div key={attr.key}>
                  <label className="text-xs text-neutral-500 mb-1 block">
                    {attr.label}
                    {attr.required && " *"}
                  </label>
                  {attr.type === "pick" && attr.options ? (
                    <select
                      className={inputClass}
                      value={(attrs[attr.key] as string) ?? ""}
                      onChange={(e) => setAttr(attr.key, e.target.value)}
                    >
                      <option value="">Select...</option>
                      {attr.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : attr.type === "number" ? (
                    <input
                      type="number"
                      className={inputClass}
                      placeholder={attr.unit ? `(${attr.unit})` : ""}
                      value={attrs[attr.key] ?? ""}
                      onChange={(e) =>
                        setAttr(attr.key, e.target.value ? Number(e.target.value) : "")
                      }
                    />
                  ) : (
                    <input
                      className={inputClass}
                      placeholder={attr.label}
                      value={(attrs[attr.key] as string) ?? ""}
                      onChange={(e) => setAttr(attr.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
          <textarea
            className={inputClass + " min-h-[60px] resize-y"}
            placeholder="Any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!name.trim() || !selectedVendor || !selectedCategory}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
          >
            Add Part
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── AI Suggest Parts ──────────────────────────────────────────

function SuggestPartsView({ onDone }: { onDone: () => void }) {
  const [chassis, setChassis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SuggestedPart[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [filesFound, setFilesFound] = useState(0);

  const handleGenerate = async () => {
    if (!chassis.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSelected(new Set());
    setSavedCount(null);

    const res = await suggestPartsForChassis(chassis.trim());
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.parts && res.parts.length > 0) {
      setResults(res.parts);
      setSelected(new Set(res.parts.map((_, i) => i)));
    } else {
      setError("No parts returned.");
    }
  };

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((_, i) => i)));
    }
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);

    const toSave = results.filter((_, i) => selected.has(i));
    const now = new Date().toISOString();
    const parts = toSave.map((s) => ({
      id: uuid(),
      userId: "local",
      vendorId: s.vendorId,
      categoryId: s.categoryId,
      name: s.name,
      sku: s.sku ?? "",
      compatibleChassisIds: s.compatibleChassisIds,
      attributes: s.attributes,
      notes: s.notes ?? "",
      createdAt: now,
      updatedAt: now,
      _dirty: 1 as const,
    }));

    await localDb.parts.bulkAdd(parts);

    // Attempt to fetch images and PDFs in the background
    let filesAttached = 0;
    for (let i = 0; i < toSave.length; i++) {
      const suggested = toSave[i];
      const partId = parts[i].id;

      if (suggested.imageUrl) {
        try {
          const resp = await fetch(suggested.imageUrl, { mode: "cors" });
          if (resp.ok) {
            const blob = await resp.blob();
            if (blob.type.startsWith("image/")) {
              const resized = await resizeImage(new File([blob], "image.webp", { type: blob.type }), 800);
              await localDb.partFiles.add({
                id: uuid(),
                partId,
                blob: resized,
                name: `${suggested.name}.webp`,
                mimeType: "image/webp",
                createdAt: now,
              });
              filesAttached++;
            }
          }
        } catch { /* CORS or network - skip silently */ }
      }

      if (suggested.pdfUrl) {
        try {
          const resp = await fetch(suggested.pdfUrl, { mode: "cors" });
          if (resp.ok) {
            const blob = await resp.blob();
            if (blob.type === "application/pdf" || suggested.pdfUrl.endsWith(".pdf")) {
              await localDb.partFiles.add({
                id: uuid(),
                partId,
                blob,
                name: `${suggested.name}.pdf`,
                mimeType: "application/pdf",
                createdAt: now,
              });
              filesAttached++;
            }
          }
        } catch { /* CORS or network - skip silently */ }
      }
    }

    setSaving(false);
    setSavedCount(parts.length);
    setFilesFound(filesAttached);
  };

  const getVendorName = (id: string) => getVendorById(id)?.name ?? id;
  const getCategoryName = (id: string) => getCategoryById(id)?.name ?? id;

  return (
    <>
      <h2 className="text-xl font-semibold mb-1">✨ AI Suggest Parts</h2>
      <p className="text-sm text-neutral-400 mb-4">
        Pick a chassis and let AI suggest optional & upgrade parts
      </p>

      {/* Chassis picker */}
      <div className="flex gap-2 mb-4">
        <select
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
          value={chassis}
          onChange={(e) => setChassis(e.target.value)}
        >
          <option value="">Select chassis...</option>
          {chassisPlatforms.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleGenerate}
          disabled={!chassis || loading}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {loading ? "Thinking..." : "Generate"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-neutral-400 text-sm">
          <div className="animate-pulse">Asking Gemini for parts...</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && savedCount === null && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-300">
              {results.length} parts found — {selected.size} selected
            </span>
            <button
              onClick={toggleAll}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {selected.size === results.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="flex flex-col gap-2 mb-4 max-h-[55vh] overflow-y-auto">
            {results.map((part, i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`text-left bg-neutral-900 border rounded-lg px-3 py-2.5 transition-colors ${
                  selected.has(i)
                    ? "border-purple-500 bg-purple-900/20"
                    : "border-neutral-800"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-xs ${
                      selected.has(i)
                        ? "bg-purple-600 border-purple-600 text-white"
                        : "border-neutral-600"
                    }`}
                  >
                    {selected.has(i) && "✓"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {part.name}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {getVendorName(part.vendorId)} · {getCategoryName(part.categoryId)}
                      {part.sku && ` · ${part.sku}`}
                      {part.imageUrl && " 🖼️"}
                      {part.pdfUrl && " 📄"}
                    </div>
                    {part.notes && (
                      <div className="text-xs text-neutral-500 mt-1">{part.notes}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={selected.size === 0 || saving}
              className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
            >
              {saving ? "Saving & fetching files..." : `Add ${selected.size} Parts`}
            </button>
            <button
              onClick={onDone}
              className="px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Success */}
      {savedCount !== null && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-lg font-semibold text-white mb-1">
            {savedCount} parts added!
          </div>
          <p className="text-sm text-neutral-400 mb-1">
            Browse your vendors to see them
          </p>
          {filesFound > 0 && (
            <p className="text-sm text-purple-400 mb-6">
              📎 {filesFound} image{filesFound !== 1 ? "s" : ""} / doc{filesFound !== 1 ? "s" : ""} attached
            </p>
          )}
          {filesFound === 0 && (
            <p className="text-xs text-neutral-500 mb-6">
              No downloadable images or docs found
            </p>
          )}
          <button
            onClick={onDone}
            className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </>
  );
}
