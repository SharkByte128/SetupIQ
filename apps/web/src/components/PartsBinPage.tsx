import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  vendors,
  getVendorById,
} from "@setupiq/shared";
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
    case "gl-racing":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#1a3a1a" />
          <text x="24" y="28" textAnchor="middle" fill="#4ade80" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">GL</text>
          <text x="24" y="40" textAnchor="middle" fill="#4ade80" fontSize="6" fontFamily="Arial, sans-serif">RACING</text>
        </svg>
      );
    case "mpower":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#2d1a4e" />
          <text x="24" y="28" textAnchor="middle" fill="#c084fc" fontSize="13" fontWeight="bold" fontFamily="Arial, sans-serif">MP</text>
          <text x="24" y="40" textAnchor="middle" fill="#c084fc" fontSize="5.5" fontFamily="Arial, sans-serif">MPOWER</text>
        </svg>
      );
    case "hobby-plus":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#1a1a3a" />
          <text x="24" y="28" textAnchor="middle" fill="#60a5fa" fontSize="10" fontWeight="bold" fontFamily="Arial, sans-serif">H+</text>
          <text x="24" y="40" textAnchor="middle" fill="#60a5fa" fontSize="5" fontFamily="Arial, sans-serif">HOBBY+</text>
        </svg>
      );
    case "yeah-racing":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#3a2a0a" />
          <text x="24" y="28" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold" fontFamily="Arial, sans-serif">YR</text>
          <text x="24" y="40" textAnchor="middle" fill="#fbbf24" fontSize="5" fontFamily="Arial, sans-serif">YEAH</text>
        </svg>
      );
    case "3racing":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#0a2a3a" />
          <text x="24" y="28" textAnchor="middle" fill="#22d3ee" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">3R</text>
          <text x="24" y="40" textAnchor="middle" fill="#22d3ee" fontSize="5.5" fontFamily="Arial, sans-serif">3RACING</text>
        </svg>
      );
    case "futaba":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#1a2e1a" />
          <text x="24" y="30" textAnchor="middle" fill="#86efac" fontSize="9" fontWeight="bold" fontFamily="Arial, sans-serif">FUTABA</text>
        </svg>
      );
    case "ko-propo":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#2a2a2a" />
          <text x="24" y="28" textAnchor="middle" fill="#e5e5e5" fontSize="12" fontWeight="bold" fontFamily="Arial, sans-serif">KO</text>
          <text x="24" y="40" textAnchor="middle" fill="#e5e5e5" fontSize="5.5" fontFamily="Arial, sans-serif">PROPO</text>
        </svg>
      );
    case "spektrum":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#3a1a0a" />
          <text x="24" y="30" textAnchor="middle" fill="#fb923c" fontSize="8" fontWeight="bold" fontFamily="Arial, sans-serif">SPEKTRUM</text>
        </svg>
      );
    case "hobbywing":
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill="#0a1a3a" />
          <text x="24" y="28" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="bold" fontFamily="Arial, sans-serif">HW</text>
          <text x="24" y="40" textAnchor="middle" fill="#38bdf8" fontSize="4.5" fontFamily="Arial, sans-serif">HOBBYWING</text>
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
  | { type: "add"; editPart?: LocalPart; isClone?: boolean }
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
            setView({ type: "add", editPart: p });
          }}
          onClone={(p) => {
            setView({ type: "add", editPart: p, isClone: true });
          }}
        />
      )}
      {view.type === "add" && (
        <AddPartForm
          editPart={view.editPart}
          isClone={view.isClone}
          onSaved={(p) => setView({ type: "detail", part: p })}
          onCancel={goBack}
        />
      )}
      {view.type === "detail" && (
        <PartDetail
          part={view.part}
          onEdit={() => {
            setView({ type: "add", editPart: view.part });
          }}
          onDelete={async () => {
            await localDb.partFiles.where("partId").equals(view.part.id).delete();
            await localDb.parts.delete(view.part.id);
            setView({ type: "list" });
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
  onClone,
}: {
  onQuickAdd: () => void;
  onSuggest: () => void;
  onDetail: (p: LocalPart) => void;
  onEdit: (p: LocalPart) => void;
  onClone: (p: LocalPart) => void;
}) {
  const isMobile = useIsMobile();
  const allParts = useLiveQuery(() => localDb.parts.toArray()) ?? [];
  const setupTemplates = useLiveQuery(() => localDb.setupTemplates.toArray()) ?? [];

  // Filter state
  const [vendorFilters, setVendorFilters] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [templateFilters, setTemplateFilters] = useState<Set<string>>(new Set());

  // Expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Derive categories from setup template capabilities
  const templateCategories = useMemo(() => {
    const catSet = new Set<string>();
    // If template filter is active, only derive categories from those templates
    const source = templateFilters.size > 0
      ? setupTemplates.filter((t) => templateFilters.has(t.id))
      : setupTemplates;
    for (const t of source) {
      for (const cap of t.capabilities) catSet.add(cap.category);
    }
    return [...catSet].sort();
  }, [setupTemplates, templateFilters]);

  // Compute vendor counts over FILTERED parts (respecting category + template filters)
  const vendorCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of allParts) {
      if (categoryFilters.size > 0 && !categoryFilters.has(p.categoryId)) continue;
      if (templateFilters.size > 0 && !templateCategories.includes(p.categoryId)) continue;
      m[p.vendorId] = (m[p.vendorId] || 0) + 1;
    }
    return m;
  }, [allParts, categoryFilters, templateFilters, templateCategories]);

  // Compute category counts over FILTERED parts (respecting vendor + template filters)
  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of allParts) {
      if (vendorFilters.size > 0 && !vendorFilters.has(p.vendorId)) continue;
      if (templateFilters.size > 0 && !templateCategories.includes(p.categoryId)) continue;
      m[p.categoryId] = (m[p.categoryId] || 0) + 1;
    }
    return m;
  }, [allParts, vendorFilters, templateFilters, templateCategories]);

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
  const toggleTemplate = (id: string) => {
    setTemplateFilters((prev) => {
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
      if (templateFilters.size > 0 && !templateCategories.includes(p.categoryId)) return false;
      return true;
    });
  }, [allParts, vendorFilters, categoryFilters, templateFilters, templateCategories]);

  // Inline edit save handler
  const handleSavePart = useCallback(async (part: LocalPart) => {
    await localDb.parts.put({ ...part, updatedAt: new Date().toISOString(), _dirty: 1 as const });
  }, []);

  // Manufacturer pills: ≥5 parts = own pill, <5 = "Other"
  const MIN_VENDOR_COUNT = 5;
  const { prominentVendors, otherVendorCount } = useMemo(() => {
    const prominent: typeof vendors[number][] = [];
    let otherCount = 0;
    for (const v of vendors) {
      const count = vendorCounts[v.id] ?? 0;
      if (count === 0) continue;
      if (count >= MIN_VENDOR_COUNT) {
        prominent.push(v);
      } else {
        otherCount += count;
      }
    }
    // Also count any vendorIds not in the known vendors list
    for (const [vid, count] of Object.entries(vendorCounts)) {
      if (!vendors.some((v) => v.id === vid)) {
        otherCount += count;
      }
    }
    return { prominentVendors: prominent, otherVendorCount: otherCount };
  }, [vendorCounts]);

  // Collect "other" vendor IDs for filtering
  const otherVendorIds = useMemo(() => {
    const prominentIds = new Set(prominentVendors.map((v) => v.id));
    return new Set(
      Object.keys(vendorCounts).filter((vid) => !prominentIds.has(vid)),
    );
  }, [vendorCounts, prominentVendors]);

  // Only show categories that have parts (considering active filters)
  const activeCategories = useMemo(() =>
    templateCategories.filter((c) => (categoryCounts[c] ?? 0) > 0),
    [templateCategories, categoryCounts],
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

      {/* ── Setup Template Filters ──────────────────── */}
      {setupTemplates.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">Setup Templates</p>
          <div className="flex flex-wrap gap-2">
            {setupTemplates.map((t) => {
              const active = templateFilters.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTemplate(t.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "border-green-500 bg-green-900/20 text-green-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  📋 {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Manufacturer Filters ────────────────────── */}
      {(prominentVendors.length > 0 || otherVendorCount > 0) && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">Manufacturers</p>
          <div className="flex flex-wrap gap-2">
            {prominentVendors.map((v) => {
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
            {otherVendorCount > 0 && (
              <button
                onClick={() => {
                  // Toggle all "other" vendor IDs at once
                  setVendorFilters((prev) => {
                    const next = new Set(prev);
                    const allSelected = [...otherVendorIds].every((id) => next.has(id));
                    if (allSelected) {
                      otherVendorIds.forEach((id) => next.delete(id));
                    } else {
                      otherVendorIds.forEach((id) => next.add(id));
                    }
                    return next;
                  });
                }}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  [...otherVendorIds].every((id) => vendorFilters.has(id))
                    ? "border-green-500 bg-green-900/20 text-green-300"
                    : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                Other
                <span className="text-neutral-600 ml-1">{otherVendorCount}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Category Filters ─────────────────────────── */}
      {activeCategories.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">Categories</p>
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((cat) => {
              const active = categoryFilters.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "border-green-500 bg-green-900/20 text-green-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  {cat}
                  <span className="text-neutral-600 ml-1">{categoryCounts[cat] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active filter summary */}
      {(vendorFilters.size > 0 || categoryFilters.size > 0 || templateFilters.size > 0) && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-neutral-500">
            Showing {filteredParts.length} of {allParts.length} parts
          </p>
          <button
            onClick={() => { setVendorFilters(new Set()); setCategoryFilters(new Set()); setTemplateFilters(new Set()); }}
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
              templateCategories={templateCategories}
              onSave={handleSavePart}
              onDetail={onDetail}
              onEdit={onEdit}
              onClone={onClone}
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
  templateCategories,
  onSave,
  onDetail,
  onEdit,
  onClone,
}: {
  part: LocalPart;
  isExpanded: boolean;
  onToggle: () => void;
  isMobile: boolean;
  templateCategories: string[];
  onSave: (part: LocalPart) => Promise<void>;
  onDetail: (p: LocalPart) => void;
  onEdit: (p: LocalPart) => void;
  onClone: (p: LocalPart) => void;
}) {
  const vendor = getVendorById(part.vendorId);

  // Local edit state (only used on PC)
  const [editName, setEditName] = useState(part.name);
  const [editSku, setEditSku] = useState(part.sku ?? "");
  const [editNotes, setEditNotes] = useState(part.notes ?? "");
  const [editVendorId, setEditVendorId] = useState(part.vendorId);
  const [editCategoryId, setEditCategoryId] = useState(part.categoryId);

  // Sync local state when part changes from DB (e.g., after car compat toggle)
  useEffect(() => {
    setEditName(part.name);
    setEditSku(part.sku ?? "");
    setEditNotes(part.notes ?? "");
    setEditVendorId(part.vendorId);
    setEditCategoryId(part.categoryId);
  }, [part.name, part.sku, part.notes, part.vendorId, part.categoryId]);

  const handleBlurSave = useCallback(async (field: "name" | "sku" | "notes", value: string) => {
    const trimmed = value.trim();
    const currentVal = field === "name" ? part.name : field === "sku" ? (part.sku ?? "") : (part.notes ?? "");
    if (trimmed === currentVal) return;
    const updated = { ...part, [field]: trimmed || (field === "name" ? part.name : undefined) };
    await onSave(updated);
  }, [part, onSave]);

  const handleSelectSave = useCallback(async (field: "vendorId" | "categoryId", value: string) => {
    if (value === part[field]) return;
    const updated = { ...part, [field]: value };
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
            {part.categoryId}
            {part.sku && ` · ${part.sku}`}
          </p>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-neutral-500">Manufacturer</p>
                  <p className="text-sm text-neutral-200">{vendor?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Category</p>
                  <p className="text-sm text-neutral-200">{part.categoryId || "—"}</p>
                </div>
              </div>

              {part.sku && (
                <div>
                  <p className="text-xs text-neutral-500">SKU</p>
                  <p className="text-sm font-mono text-neutral-200">{part.sku}</p>
                </div>
              )}

              {part.notes && (
                <div>
                  <p className="text-xs text-neutral-500">Notes</p>
                  <p className="text-sm text-neutral-300">{part.notes}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onDetail(part)}
                  className="flex-1 text-sm py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                  View Details
                </button>
                <button
                  onClick={() => onClone(part)}
                  className="flex-1 text-sm py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                  Clone
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Manufacturer</label>
                  <select
                    className={inputClass}
                    value={editVendorId}
                    onChange={(e) => { setEditVendorId(e.target.value); handleSelectSave("vendorId", e.target.value); }}
                  >
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Category</label>
                  <select
                    className={inputClass}
                    value={editCategoryId}
                    onChange={(e) => { setEditCategoryId(e.target.value); handleSelectSave("categoryId", e.target.value); }}
                  >
                    {templateCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {/* Show current value even if not in template categories */}
                    {!templateCategories.includes(editCategoryId) && (
                      <option value={editCategoryId}>{editCategoryId}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Notes</label>
                <textarea
                  className={inputClass + " min-h-[40px] resize-y"}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={() => handleBlurSave("notes", editNotes)}
                />
              </div>

              {/* Link to full detail (photos/PDFs) */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onDetail(part)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Photos & Documents →
                </button>
                <button
                  onClick={() => onClone(part)}
                  className="text-xs text-neutral-400 hover:text-neutral-300"
                >
                  Clone
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
  editPart,
  isClone,
  onSaved,
  onCancel,
}: {
  editPart?: LocalPart;
  isClone?: boolean;
  onSaved: (p: LocalPart) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(
    isClone && editPart ? `${editPart.name} (Copy)` : (editPart?.name ?? ""),
  );
  const [selectedVendorId, setSelectedVendorId] = useState(editPart?.vendorId ?? "");
  const [selectedCategoryId, setSelectedCategoryId] = useState(editPart?.categoryId ?? "");
  const [sku, setSku] = useState(editPart?.sku ?? "");
  const [notes, setNotes] = useState(editPart?.notes ?? "");
  const [attrs, setAttrs] = useState<Record<string, string | number>>(
    editPart?.attributes ?? {},
  );

  const setupTemplates = useLiveQuery(() => localDb.setupTemplates.toArray()) ?? [];

  // Derive categories from templates
  const templateCategories = useMemo(() => {
    const catSet = new Set<string>();
    for (const t of setupTemplates) {
      for (const cap of t.capabilities) catSet.add(cap.category);
    }
    return [...catSet].sort();
  }, [setupTemplates]);

  const applyLookup = (r: PartLookupResult) => {
    if (r.name) setName(r.name);
    if (r.vendorId) setSelectedVendorId(r.vendorId);
    if (r.notes) setNotes(r.notes);
    if (r.attributes) setAttrs((prev) => ({ ...prev, ...r.attributes }));
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedVendorId || !selectedCategoryId) return;

    const now = new Date().toISOString();
    const isEdit = editPart && !isClone;
    const part: LocalPart = {
      id: isEdit ? editPart.id : uuid(),
      userId: "local",
      vendorId: selectedVendorId,
      categoryId: selectedCategoryId,
      name: name.trim(),
      sku: sku.trim() || undefined,
      compatibleChassisIds: [],
      attributes: attrs,
      notes: notes.trim() || undefined,
      createdAt: isEdit ? editPart.createdAt : now,
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
        {isClone ? "Clone Part" : editPart ? "Edit Part" : "Add Part"}
      </h2>

      <div className="flex flex-col gap-4">
        {/* Manufacturer */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Manufacturer *</label>
          <select
            className={inputClass}
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
          >
            <option value="">Select manufacturer...</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Category *</label>
          <div className="flex flex-wrap gap-2">
            {templateCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoryId(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedCategoryId === cat
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {cat}
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
            disabled={!name.trim() || !selectedVendorId || !selectedCategoryId}
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
  onDelete,
}: {
  part: LocalPart;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const vendor = getVendorById(part.vendorId);
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string; url: string }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
              {vendor?.name} · {part.categoryId}
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

        {Object.keys(part.attributes).length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
            <p className="text-xs text-neutral-500 mb-2">Specifications</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(part.attributes).map(([key, val]) => {
                if (val === undefined || val === "") return null;
                return (
                  <div key={key}>
                    <p className="text-xs text-neutral-500">{key}</p>
                    <p className="text-sm">{val}</p>
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

      {/* ── Delete Part ────────────────────────────── */}
      <div className="border-t border-neutral-800 pt-4 mt-2">
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-400">Delete this part and all its files?</span>
            <button
              onClick={() => { setConfirmDelete(false); onDelete(); }}
              className="text-sm px-4 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-sm px-4 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Delete Part
          </button>
        )}
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
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [notes, setNotes] = useState("");

  const setupTemplates = useLiveQuery(() => localDb.setupTemplates.toArray()) ?? [];

  // Derive categories from templates
  const templateCategories = useMemo(() => {
    const catSet = new Set<string>();
    for (const t of setupTemplates) {
      for (const cap of t.capabilities) catSet.add(cap.category);
    }
    return [...catSet].sort();
  }, [setupTemplates]);

  const applyLookup = (r: PartLookupResult) => {
    if (r.name) setName(r.name);
    if (r.vendorId) setSelectedVendorId(r.vendorId);
    if (r.categoryId) setSelectedCategoryId(r.categoryId);
    if (r.notes) setNotes(r.notes);
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedVendorId || !selectedCategoryId) return;

    const now = new Date().toISOString();
    const part: LocalPart = {
      id: uuid(),
      userId: "local",
      vendorId: selectedVendorId,
      categoryId: selectedCategoryId,
      name: name.trim(),
      sku: sku.trim() || undefined,
      compatibleChassisIds: [],
      attributes: {},
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
        {/* Manufacturer picker */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Manufacturer *</label>
          <select
            className={inputClass}
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
          >
            <option value="">Select manufacturer...</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        {/* Category picker */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Category *</label>
          <div className="flex flex-wrap gap-2">
            {templateCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoryId(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedCategoryId === cat
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {cat}
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
            disabled={!name.trim() || !selectedVendorId || !selectedCategoryId}
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

  const setupTemplates = useLiveQuery(() => localDb.setupTemplates.toArray()) ?? [];

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
      compatibleChassisIds: [],
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
  const getCategoryName = (id: string) => id;

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
          <option value="">Select template...</option>
          {setupTemplates.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
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
