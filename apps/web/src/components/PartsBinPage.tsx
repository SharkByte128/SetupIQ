import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  partCategories,
  chassisPlatforms,
  getCategoryById,
  type Vendor,
  type PartCategory,
  type PartAttribute,
} from "@setupiq/shared";
import {
  localDb,
  type LocalPart,
  type LocalPartFile,
  type LocalPartCategory,
  type LocalCategoryImage,
  type LocalCustomVendor,
} from "../db/local-db.js";
import { lookupPartBySku, suggestPartsForChassis, type PartLookupResult, type SuggestedPart } from "../lib/gemini-parts.js";
import { resizeImage } from "../lib/resize-image.js";
import { useAllVendors } from "../hooks/use-vendors.js";
import { v4 as uuid } from "uuid";
import { RichNotesEditor, MarkdownDisplay } from "./RichNotesEditor.js";

// ── Vendor Logo SVGs ──────────────────────────────────────────

// Built-in vendor visual config for slugs without custom SVGs
const builtInVendorVisuals: Record<string, { abbr: string; color: string }> = {
  "gl-racing": { abbr: "GL", color: "#2d5a27" },
  "mpower": { abbr: "MP", color: "#4a1a6b" },
  "hobby-plus": { abbr: "H+", color: "#1a4a4a" },
  "yeah-racing": { abbr: "YR", color: "#8b6914" },
  "3racing": { abbr: "3R", color: "#1a3a5c" },
  "futaba": { abbr: "FU", color: "#1a1a8b" },
  "ko-propo": { abbr: "KO", color: "#2c1a1a" },
  "spektrum": { abbr: "SP", color: "#ff6600" },
  "hobbywing": { abbr: "HW", color: "#005b33" },
  "other": { abbr: "?", color: "#333" },
};

function VendorLogo({ slug, size = 48, abbreviation, color }: { slug: string; size?: number; abbreviation?: string; color?: string }) {
  const customVendors: LocalCustomVendor[] = useLiveQuery(() => localDb.customVendors.toArray()) ?? [];
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
    default: {
      const vis = builtInVendorVisuals[slug];
      const cv = customVendors.find(v => v.slug === slug);
      const abbr = abbreviation ?? vis?.abbr ?? cv?.abbreviation ?? slug.slice(0, 2).toUpperCase();
      const bg = color ?? vis?.color ?? cv?.color ?? "#333";
      const fs = abbr.length > 2 ? 10 : abbr.length > 1 ? 14 : 16;
      return (
        <svg {...s} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="8" fill={bg} />
          <text x="24" y="30" textAnchor="middle" fill="white" fontSize={fs} fontWeight="bold" fontFamily="Arial, sans-serif">{abbr}</text>
        </svg>
      );
    }
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

// ── Merged categories hook ────────────────────────────────────

/** Merge built-in partCategories with user's custom overrides & additions */
function getHiddenCategoryIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("hiddenPartCategories") || "[]"));
  } catch { return new Set(); }
}

function setHiddenCategoryIds(ids: Set<string>) {
  localStorage.setItem("hiddenPartCategories", JSON.stringify([...ids]));
}

function useAllCategories(includeHidden = false): PartCategory[] {
  const customCats = useLiveQuery(() => localDb.customPartCategories.toArray()) ?? [];
  const [hiddenIds, setHiddenIds] = useState(() => getHiddenCategoryIds());

  // Listen for changes from other calls to toggleHideCategory
  useEffect(() => {
    const handler = () => setHiddenIds(getHiddenCategoryIds());
    window.addEventListener("hidden-categories-changed", handler);
    return () => window.removeEventListener("hidden-categories-changed", handler);
  }, []);

  return useMemo(() => {
    const overrideMap = new Map(customCats.filter(c => c.builtIn).map(c => [c.id, c]));
    const merged = partCategories.map((cat) => {
      const ov = overrideMap.get(cat.id);
      if (ov) {
        // Built-in attributes are authoritative (preserves keys like widthMm).
        // Append override-only attributes the user added, skipping duplicates
        // that match a built-in key or label.
        const builtInKeys = new Set(cat.attributes.map(a => a.key));
        const builtInLabels = new Set(cat.attributes.map(a => a.label.toLowerCase().trim()));
        const extraAttrs = (ov.attributes as PartAttribute[]).filter(
          a => !builtInKeys.has(a.key) && !builtInLabels.has(a.label.toLowerCase().trim()),
        );
        return { ...cat, name: ov.name, icon: ov.icon, description: ov.description, attributes: [...cat.attributes, ...extraAttrs] };
      }
      return cat;
    });
    const custom = customCats
      .filter(c => !c.builtIn)
      .map(c => ({ id: c.id as PartCategory["id"], name: c.name, icon: c.icon, description: c.description, attributes: c.attributes as PartAttribute[] }));
    const all = [...merged, ...custom];
    if (includeHidden) return all;
    return all.filter(c => !hiddenIds.has(c.id));
  }, [customCats, hiddenIds, includeHidden]);
}

function toggleHideCategory(id: string) {
  const ids = getHiddenCategoryIds();
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  setHiddenCategoryIds(ids);
  window.dispatchEvent(new Event("hidden-categories-changed"));
}

// ── Category image hook ───────────────────────────────────────

function useCategoryImages(): Map<string, string> {
  const images = useLiveQuery(() => localDb.categoryImages.toArray()) ?? [];
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const next = new Map<string, string>();
    for (const img of images) {
      next.set(img.categoryId, URL.createObjectURL(img.blob));
    }
    setUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return next;
    });
    return () => { next.forEach((url) => URL.revokeObjectURL(url)); };
  }, [images]);

  return urls;
}

// ── Part thumbnail hook (first image per part) ────────────────

function usePartThumbnails(partIds: string[]): Map<string, string> {
  const key = partIds.join(",");
  const files = useLiveQuery(
    () => localDb.partFiles.where("partId").anyOf(partIds).toArray(),
    [key],
  ) ?? [];

  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const next = new Map<string, string>();
    for (const f of files) {
      if (f.mimeType.startsWith("image/") && !next.has(f.partId)) {
        next.set(f.partId, URL.createObjectURL(f.blob));
      }
    }
    setUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return next;
    });
    return () => { next.forEach((url) => URL.revokeObjectURL(url)); };
  }, [files]);

  return urls;
}

// ── Admin toggle component ────────────────────────────────────

function AdminToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
        enabled
          ? "bg-amber-600/20 border-amber-500 text-amber-400"
          : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500"
      }`}
    >
      <span className="text-[10px]">{enabled ? "🔓" : "🔒"}</span>
      Admin
    </button>
  );
}

// ── View Types ────────────────────────────────────────────────

type MergedCategory = PartCategory;

type View =
  | { type: "categories" }
  | { type: "parts"; category: MergedCategory }
  | { type: "add"; category: MergedCategory; vendor?: Vendor; editPart?: LocalPart }
  | { type: "detail"; part: LocalPart }
  | { type: "editCategory"; category: MergedCategory }
  | { type: "newCategory"; cloneFrom?: MergedCategory }
  | { type: "quickAdd" }
  | { type: "suggest" };

// ── Main Component ────────────────────────────────────────────

export function PartsBinPage() {
  const [view, setView] = useState<View>({ type: "categories" });
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem("partsBinAdmin") === "1");
  const allVendors = useAllVendors();
  const allCategories = useAllCategories();

  const toggleAdmin = useCallback((v: boolean) => {
    setAdminMode(v);
    localStorage.setItem("partsBinAdmin", v ? "1" : "0");
  }, []);

  const findCategory = useCallback((id: string) => {
    return allCategories.find(c => c.id === id) ?? getCategoryById(id);
  }, [allCategories]);

  const goBack = useCallback(() => {
    switch (view.type) {
      case "parts":
        setView({ type: "categories" });
        break;
      case "add":
        setView({ type: "parts", category: view.category });
        break;
      case "detail":
        {
          const c = findCategory(view.part.categoryId);
          if (c) setView({ type: "parts", category: c });
          else setView({ type: "categories" });
        }
        break;
      case "editCategory":
        setView({ type: "parts", category: view.category });
        break;
      case "newCategory":
        setView({ type: "categories" });
        break;
      case "quickAdd":
      case "suggest":
        setView({ type: "categories" });
        break;
      default:
        break;
    }
  }, [view, findCategory]);

  return (
    <div className="px-4 py-4">
      {view.type !== "categories" && (
        <button
          onClick={goBack}
          className="text-sm text-blue-400 hover:text-blue-300 mb-3"
        >
          ← Back
        </button>
      )}

      {view.type === "categories" && (
        <CategoryGrid
          adminMode={adminMode}
          onToggleAdmin={toggleAdmin}
          onSelect={(c) => setView({ type: "parts", category: c })}
          onQuickAdd={() => setView({ type: "quickAdd" })}
          onSuggest={() => setView({ type: "suggest" })}
          onNewCategory={(cloneFrom) => setView({ type: "newCategory", cloneFrom })}
        />
      )}
      {view.type === "parts" && (
        <CategoryPartsGrid
          category={view.category}
          adminMode={adminMode}
          onToggleAdmin={toggleAdmin}
          onAdd={(vendor) => setView({ type: "add", category: view.category, vendor })}
          onDetail={(p) => setView({ type: "detail", part: p })}
          onEdit={(p) => {
            const v = allVendors.find(v => v.id === p.vendorId);
            setView({ type: "add", category: view.category, vendor: v, editPart: p });
          }}
          onClonePart={(p) => {
            const clone = { ...p, id: uuid(), name: `${p.name} (copy)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), _dirty: 1 as const };
            localDb.parts.put(clone);
          }}
          onManageForm={() => setView({ type: "editCategory", category: view.category })}
        />
      )}
      {view.type === "add" && (
        <AddPartForm
          category={view.category}
          presetVendor={view.vendor}
          editPart={view.editPart}
          onSaved={(p) => setView({ type: "detail", part: p })}
          onCancel={goBack}
          onDeleted={() => setView({ type: "parts", category: view.category })}
        />
      )}
      {view.type === "detail" && (
        <PartDetail
          part={view.part}
          onEdit={() => {
            const v = allVendors.find(v => v.id === view.part.vendorId);
            const c = findCategory(view.part.categoryId);
            if (c) setView({ type: "add", category: c, vendor: v, editPart: view.part });
          }}
        />
      )}
      {view.type === "editCategory" && (
        <CategoryFormEditor
          category={view.category}
          onSaved={(updated) => setView({ type: "parts", category: updated })}
          onCancel={goBack}
          onDeleted={() => setView({ type: "categories" })}
        />
      )}
      {view.type === "newCategory" && (
        <CategoryCreator
          cloneFrom={view.cloneFrom}
          onCreated={(cat) => setView({ type: "parts", category: cat })}
          onCancel={goBack}
        />
      )}
      {view.type === "quickAdd" && (
        <QuickAddPart
          onSaved={(p) => setView({ type: "detail", part: p })}
          onCancel={goBack}
        />
      )}
      {view.type === "suggest" && (
        <SuggestPartsView onDone={() => setView({ type: "categories" })} />
      )}
    </div>
  );
}

// ── Category Grid (Main View) ─────────────────────────────────

function CategoryGrid({
  adminMode,
  onToggleAdmin,
  onSelect,
  onQuickAdd,
  onSuggest,
  onNewCategory,
}: {
  adminMode: boolean;
  onToggleAdmin: (v: boolean) => void;
  onSelect: (c: MergedCategory) => void;
  onQuickAdd: () => void;
  onSuggest: () => void;
  onNewCategory: (cloneFrom?: MergedCategory) => void;
}) {
  const [showHiddenCats, setShowHiddenCats] = useState(false);
  const allCategories = useAllCategories(adminMode && showHiddenCats);
  const hiddenIds = useMemo(() => getHiddenCategoryIds(), [allCategories]); // re-derive when categories change
  const categoryImages = useCategoryImages();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [chassisFilter, setChassisFilter] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Count parts per category
  useEffect(() => {
    localDb.parts.toArray().then((parts) => {
      const c: Record<string, number> = {};
      for (const p of parts) {
        c[p.categoryId] = (c[p.categoryId] || 0) + 1;
      }
      setCounts(c);
    });
  }, []);

  // Filter categories by chassis compatibility
  const [compatCategoryIds, setCompatCategoryIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!chassisFilter) {
      setCompatCategoryIds(null);
      return;
    }
    localDb.parts.toArray().then((parts) => {
      const ids = new Set<string>();
      for (const p of parts) {
        if (p.compatibleChassisIds.includes(chassisFilter)) {
          ids.add(p.categoryId);
        }
      }
      // Always show categories even if no parts yet
      setCompatCategoryIds(ids.size > 0 ? ids : null);
    });
  }, [chassisFilter]);

  const filteredCategories = compatCategoryIds
    ? allCategories.filter((c) => compatCategoryIds.has(c.id))
    : allCategories;

  // Upload thumbnail for a category
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetCatId, setUploadTargetCatId] = useState<string | null>(null);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetCatId) return;
    const resized = await resizeImage(file, 400);
    // Remove old image for this category
    const old = await localDb.categoryImages.where("categoryId").equals(uploadTargetCatId).toArray();
    if (old.length > 0) await localDb.categoryImages.bulkDelete(old.map(o => o.id));
    const record: LocalCategoryImage = {
      id: uuid(),
      categoryId: uploadTargetCatId,
      blob: resized,
      name: file.name,
      mimeType: "image/webp",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _dirty: 1,
    };
    await localDb.categoryImages.add(record);
    e.target.value = "";
    setUploadTargetCatId(null);
  }, [uploadTargetCatId]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold">Parts Bin</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Browse parts by category</p>
        </div>
        <div className="flex items-center gap-2">
          <AdminToggle enabled={adminMode} onChange={onToggleAdmin} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
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
        {adminMode && (
          <button
            onClick={() => setShowHiddenCats(v => !v)}
            className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap border ${
              showHiddenCats
                ? "bg-amber-600/20 border-amber-500 text-amber-400"
                : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
            }`}
          >
            {showHiddenCats ? "Hide Hidden" : "Show Hidden"}
          </button>
        )}
      </div>

      {/* Setup template / chassis filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setChassisFilter(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            !chassisFilter
              ? "bg-blue-600 border-blue-500 text-white"
              : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
          }`}
        >
          All
        </button>
        {chassisPlatforms.map((cp) => (
          <button
            key={cp.id}
            onClick={() => setChassisFilter(cp.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              chassisFilter === cp.id
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
            }`}
          >
            {cp.name}
          </button>
        ))}
      </div>

      {/* Category thumbnail grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {filteredCategories.map((cat) => {
          const thumbUrl = categoryImages.get(cat.id);
          return (
            <div key={cat.id} className="relative group">
              <button
                onClick={() => onSelect(cat)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col hover:border-neutral-600 transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-full aspect-square bg-neutral-800 flex items-center justify-center overflow-hidden">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={cat.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl text-neutral-600">📦</span>
                  )}
                </div>
                {/* Label */}
                <div className="px-1.5 py-1.5 text-left">
                  <p className="text-xs font-medium truncate">{cat.name}</p>
                  <p className="text-[10px] text-neutral-500">{counts[cat.id] || 0} parts</p>
                </div>
              </button>
              {/* Upload thumbnail — always visible */}
              <button
                onClick={(e) => { e.stopPropagation(); setUploadTargetCatId(cat.id); fileInputRef.current?.click(); }}
                className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-7 h-7 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Change thumbnail"
              >
                📷
              </button>
              {/* Admin: clone category */}
              {adminMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); onNewCategory(cat); }}
                  className="absolute top-1 left-1 bg-black/70 text-amber-400 rounded-full w-7 h-7 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clone category"
                >
                  📋
                </button>
              )}
              {/* Admin: remove / hide category */}
              {adminMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const isBuiltIn = partCategories.some(c => c.id === cat.id);
                    if (isBuiltIn) {
                      // Toggle hide for built-in categories
                      toggleHideCategory(cat.id);
                    } else {
                      // Custom category — confirm delete
                      setConfirmDeleteId(cat.id);
                    }
                  }}
                  className={`absolute bottom-8 right-1 bg-black/70 rounded-full w-7 h-7 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
                    hiddenIds.has(cat.id) ? "text-green-400" : "text-red-400"
                  }`}
                  title={partCategories.some(c => c.id === cat.id)
                    ? (hiddenIds.has(cat.id) ? "Unhide category" : "Hide category")
                    : "Delete category"
                  }
                >
                  {partCategories.some(c => c.id === cat.id)
                    ? (hiddenIds.has(cat.id) ? "👁" : "🙈")
                    : "🗑"}
                </button>
              )}
              {/* Admin: dim hidden categories */}
              {adminMode && hiddenIds.has(cat.id) && (
                <div className="absolute inset-0 bg-black/50 rounded-lg pointer-events-none flex items-center justify-center">
                  <span className="text-xs text-neutral-400 font-medium">Hidden</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Admin: create new category card */}
        {adminMode && (
          <button
            onClick={() => onNewCategory()}
            className="w-full bg-neutral-900 border-2 border-dashed border-neutral-700 rounded-lg overflow-hidden flex flex-col items-center justify-center aspect-square hover:border-amber-500 transition-colors"
          >
            <span className="text-3xl text-neutral-600 mb-1">+</span>
            <span className="text-xs text-neutral-500">New Category</span>
          </button>
        )}
      </div>

      {/* Confirm delete dialog for custom categories */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-400 mb-2">Delete Category</h3>
            <p className="text-xs text-neutral-300 mb-4">
              This will permanently delete the category and all its parts. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="text-xs px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const catId = confirmDeleteId;
                  setConfirmDeleteId(null);
                  try {
                    const catParts = await localDb.parts.where("categoryId").equals(catId).toArray();
                    for (const p of catParts) {
                      const files = await localDb.partFiles.where("partId").equals(p.id).toArray();
                      if (files.length) await localDb.partFiles.bulkDelete(files.map(f => f.id));
                    }
                    if (catParts.length) await localDb.parts.bulkDelete(catParts.map(p => p.id));
                    const imgs = await localDb.categoryImages.where("categoryId").equals(catId).toArray();
                    if (imgs.length) await localDb.categoryImages.bulkDelete(imgs.map(i => i.id));
                    await localDb.customPartCategories.delete(catId);
                  } catch (err) {
                    console.error("Failed to delete category:", err);
                  }
                }}
                className="text-xs bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for category thumbnail */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Uncategorized parts at the bottom */}
      <UncategorizedPartsTable allCategories={allCategories} />
    </>
  );
}

// ── Uncategorized Parts Table ─────────────────────────────────

function UncategorizedPartsTable({ allCategories }: { allCategories: MergedCategory[] }) {
  const categoryIds = useMemo(() => new Set<string>(allCategories.map(c => c.id)), [allCategories]);
  const allParts = useLiveQuery(() => localDb.parts.toArray()) ?? [];
  const uncategorized = useMemo(
    () => allParts.filter(p => !categoryIds.has(p.categoryId)),
    [allParts, categoryIds],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (uncategorized.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-neutral-300 mb-2">
        Uncategorized ({uncategorized.length})
      </h3>
      <div className="border border-neutral-800 rounded-lg overflow-hidden divide-y divide-neutral-800">
        {uncategorized.map(part => (
          <UncategorizedPartRow
            key={part.id}
            part={part}
            expanded={expandedId === part.id}
            onToggle={() => setExpandedId(prev => prev === part.id ? null : part.id)}
            allCategories={allCategories}
          />
        ))}
      </div>
    </div>
  );
}

function UncategorizedPartRow({
  part,
  expanded,
  onToggle,
  allCategories,
}: {
  part: LocalPart;
  expanded: boolean;
  onToggle: () => void;
  allCategories: MergedCategory[];
}) {
  const [name, setName] = useState(part.name);
  const [sku, setSku] = useState(part.sku ?? "");
  const [categoryId, setCategoryId] = useState(part.categoryId);
  const [vendorId, setVendorId] = useState(part.vendorId);
  const [notes, setNotes] = useState(part.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset form when a different part is expanded
  useEffect(() => {
    setName(part.name);
    setSku(part.sku ?? "");
    setCategoryId(part.categoryId);
    setVendorId(part.vendorId);
    setNotes(part.notes ?? "");
    setConfirmDelete(false);
  }, [part.id, part.name, part.sku, part.categoryId, part.vendorId, part.notes]);

  const save = useCallback(async (overrides?: Partial<LocalPart>) => {
    const updates: Partial<LocalPart> = {
      name: name.trim() || part.name,
      sku: sku.trim() || undefined,
      categoryId,
      vendorId,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
      _dirty: 1,
      ...overrides,
    };
    await localDb.parts.update(part.id, updates);
  }, [part.id, part.name, name, sku, categoryId, vendorId, notes]);

  const handleDelete = async () => {
    await localDb.parts.delete(part.id);
    // Also delete attached files
    const files = await localDb.partFiles.where("partId").equals(part.id).toArray();
    if (files.length) await localDb.partFiles.bulkDelete(files.map(f => f.id));
  };

  const allVendors = useAllVendors();
  const vendor = allVendors.find(v => v.id === part.vendorId);
  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <div className="bg-neutral-900">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-800/50 transition-colors"
      >
        <span className="text-xs text-neutral-500 flex-shrink-0">{expanded ? "▾" : "▸"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{part.name}</p>
          <p className="text-[10px] text-neutral-500 truncate">
            {vendor?.name ?? "Unknown vendor"}
            {part.sku ? ` · ${part.sku}` : ""}
            {part.categoryId ? ` · cat: ${part.categoryId}` : ""}
          </p>
        </div>
      </button>

      {/* Expanded edit form */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-neutral-800">
          {/* Name */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Name</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} onBlur={() => save()} />
          </div>

          {/* SKU */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">SKU</label>
            <input className={inputClass} value={sku} onChange={e => setSku(e.target.value)} onBlur={() => save()} placeholder="Part number" />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Category</label>
            <select
              className={inputClass}
              value={categoryId}
              onChange={e => { setCategoryId(e.target.value); save({ categoryId: e.target.value }); }}
            >
              <option value={part.categoryId}>— {part.categoryId || "None"} (current) —</option>
              {allCategories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          {/* Vendor */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Vendor</label>
            <select
              className={inputClass}
              value={vendorId}
              onChange={e => { setVendorId(e.target.value); save({ vendorId: e.target.value }); }}
            >
              <option value="">— None —</option>
              {allVendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
            <RichNotesEditor value={notes} onChange={setNotes} onBlur={() => save()} placeholder="Notes — paste images from clipboard" minHeight={80} />
          </div>

          {/* Delete */}
          <div className="pt-1">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                🗑 Delete Part
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete permanently?</span>
                <button onClick={handleDelete} className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded transition-colors">Yes, delete</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tire Columns View (grouped by width, sorted by shore) ─────

const TIRE_WIDTH_COLUMNS = [
  { key: "8.5", label: "8.5 mm" },
  { key: "11", label: "11 mm" },
  { key: "14", label: "14 mm" },
];

function parseShore(val: unknown): number {
  if (val === undefined || val === null || val === "") return -Infinity;
  const n = parseFloat(String(val));
  return isNaN(n) ? -Infinity : n;
}

function TireColumnsView({
  parts,
  thumbnails,
  allVendors,
  catThumb,
  adminMode,
  onDetail,
  onEdit,
  onClonePart,
}: {
  parts: LocalPart[];
  thumbnails: Map<string, string>;
  allVendors: Vendor[];
  catThumb: string | undefined;
  adminMode: boolean;
  onDetail: (p: LocalPart) => void;
  onEdit: (p: LocalPart) => void;
  onClonePart: (p: LocalPart) => void;
}) {
  // Group by width, then sort each group descending by shore.
  // Look for widthMm first, then fall back to width__mm_ (legacy key
  // generated when users added the field via the category form editor).
  const columns = useMemo(() => {
    const buckets = new Map<string, LocalPart[]>();
    const otherParts: LocalPart[] = [];

    for (const part of parts) {
      const w = part.attributes.widthMm ?? part.attributes["width__mm_"];
      const wNum = w !== undefined && w !== "" ? Number(w) : NaN;
      const col = !isNaN(wNum) ? TIRE_WIDTH_COLUMNS.find(c => Number(c.key) === wNum) : null;
      if (col) {
        const list = buckets.get(col.key) ?? [];
        list.push(part);
        buckets.set(col.key, list);
      } else {
        otherParts.push(part);
      }
    }

    // Sort each bucket descending by shore
    const sortByShore = (a: LocalPart, b: LocalPart) =>
      parseShore(b.attributes.shore) - parseShore(a.attributes.shore);

    const result = TIRE_WIDTH_COLUMNS.map(col => ({
      ...col,
      parts: (buckets.get(col.key) ?? []).sort(sortByShore),
    }));

    if (otherParts.length > 0) {
      result.push({ key: "other", label: "Other", parts: otherParts.sort(sortByShore) });
    }

    return result;
  }, [parts]);

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {columns.map(col => (
        <div key={col.key} className="flex flex-col">
          <h3 className="text-xs font-semibold text-neutral-400 text-center mb-2 border-b border-neutral-800 pb-1">
            {col.label}
          </h3>
          <div className="flex flex-col gap-2">
            {col.parts.length === 0 ? (
              <p className="text-[10px] text-neutral-600 text-center py-4">—</p>
            ) : col.parts.map(part => {
              const thumbUrl = thumbnails.get(part.id);
              const vendor = allVendors.find(v => v.id === part.vendorId);
              const shore = part.attributes.shore;
              const compound = part.attributes.compound;
              return (
                <div key={part.id} className="relative group">
                  <button
                    onClick={() => onDetail(part)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col hover:border-neutral-600 transition-colors text-left"
                  >
                    <div className="w-full aspect-square bg-neutral-800 flex items-center justify-center overflow-hidden">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={part.name} className="w-full h-full object-cover" />
                      ) : vendor ? (
                        <VendorLogo slug={vendor.slug} size={32} />
                      ) : catThumb ? (
                        <img src={catThumb} alt="" className="w-full h-full object-cover opacity-40" />
                      ) : (
                        <span className="text-xl text-neutral-600">🟢</span>
                      )}
                    </div>
                    <div className="px-1.5 py-1">
                      <p className="text-[10px] font-medium truncate">{part.name}</p>
                      {shore && (
                        <p className="text-[10px] text-blue-400 font-semibold">Shore {shore}</p>
                      )}
                      {compound && (
                        <p className="text-[10px] text-neutral-500 truncate">{compound}</p>
                      )}
                      {part.sku && (
                        <p className="text-[9px] text-neutral-600 font-mono truncate">{part.sku}</p>
                      )}
                    </div>
                  </button>
                  {adminMode && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(part); }}
                        className="absolute top-1 right-1 bg-black/70 text-amber-400 rounded-full w-5 h-5 text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onClonePart(part); }}
                        className="absolute top-1 left-1 bg-black/70 text-amber-400 rounded-full w-5 h-5 text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Clone"
                      >📋</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Category Parts Grid ───────────────────────────────────────

function CategoryPartsGrid({
  category,
  adminMode,
  onToggleAdmin,
  onAdd,
  onDetail,
  onEdit,
  onClonePart,
  onManageForm,
}: {
  category: MergedCategory;
  adminMode: boolean;
  onToggleAdmin: (v: boolean) => void;
  onAdd: (vendor?: Vendor) => void;
  onDetail: (p: LocalPart) => void;
  onEdit: (p: LocalPart) => void;
  onClonePart: (p: LocalPart) => void;
  onManageForm: () => void;
}) {
  const parts = useLiveQuery(
    () => localDb.parts.where("categoryId").equals(category.id).toArray(),
    [category.id],
  ) ?? [];
  const thumbnails = usePartThumbnails(parts.map(p => p.id));
  const allVendors = useAllVendors();
  const categoryImages = useCategoryImages();
  const catThumb = categoryImages.get(category.id);
  const isTireCategory = category.id === "front-tires" || category.id === "rear-tires";

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {catThumb && (
            <img src={catThumb} alt="" className="w-7 h-7 rounded object-cover" />
          )}
          <div>
            <h2 className="text-lg font-semibold">{category.name}</h2>
            <p className="text-xs text-neutral-500">{parts.length} parts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdminToggle enabled={adminMode} onChange={onToggleAdmin} />
        </div>
      </div>

      {/* Category description */}
      {category.description && (
        <div className="mb-3">
          <MarkdownDisplay content={category.description} />
        </div>
      )}

      {/* Admin action bar */}
      {adminMode && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={onManageForm}
            className="bg-amber-600/20 border border-amber-600 text-amber-400 text-xs font-medium px-3 py-2 rounded-lg transition-colors hover:bg-amber-600/30"
          >
            ⚙️ Manage Form
          </button>
          <button
            onClick={() => onAdd()}
            className="bg-amber-600/20 border border-amber-600 text-amber-400 text-xs font-medium px-3 py-2 rounded-lg transition-colors hover:bg-amber-600/30"
          >
            + Add Part
          </button>
        </div>
      )}

      {/* Parts thumbnail grid */}
      {parts.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          {catThumb ? (
            <img src={catThumb} alt="" className="w-10 h-10 rounded object-cover mx-auto mb-1" />
          ) : (
            <p className="text-lg mb-1">📦</p>
          )}
          <p className="text-sm">No {category.name.toLowerCase()} yet</p>
          <button
            onClick={() => onAdd()}
            className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            + Add First Part
          </button>
        </div>
      ) : isTireCategory ? (
        <TireColumnsView
          parts={parts}
          thumbnails={thumbnails}
          allVendors={allVendors}
          catThumb={catThumb}
          adminMode={adminMode}
          onDetail={onDetail}
          onEdit={onEdit}
          onClonePart={onClonePart}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 mb-4">
          {parts.map((part) => {
            const thumbUrl = thumbnails.get(part.id);
            const vendor = allVendors.find(v => v.id === part.vendorId);
            const attrs = category.attributes;
            const firstAttr = attrs.length > 0 ? part.attributes[attrs[0].key] : undefined;
            return (
              <div key={part.id} className="relative group">
                <button
                  onClick={() => onDetail(part)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col hover:border-neutral-600 transition-colors text-left"
                >
                  {/* Thumbnail */}
                  <div className="w-full aspect-square bg-neutral-800 flex items-center justify-center overflow-hidden">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={part.name} className="w-full h-full object-cover" />
                    ) : vendor ? (
                      <VendorLogo slug={vendor.slug} size={36} />
                    ) : catThumb ? (
                      <img src={catThumb} alt="" className="w-full h-full object-cover opacity-40" />
                    ) : (
                      <span className="text-2xl text-neutral-600">📦</span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-1.5 py-1.5">
                    <p className="text-[11px] font-medium truncate">{part.name}</p>
                    <p className="text-[10px] text-neutral-500 truncate">
                      {vendor?.name}
                      {firstAttr ? ` · ${firstAttr}` : ""}
                    </p>
                    {part.sku && (
                      <p className="text-[10px] text-neutral-600 font-mono truncate">{part.sku}</p>
                    )}
                  </div>
                </button>
                {/* Admin overlays */}
                {adminMode && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(part); }}
                      className="absolute top-1 right-1 bg-black/70 text-amber-400 rounded-full w-6 h-6 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onClonePart(part); }}
                      className="absolute top-1 left-1 bg-black/70 text-amber-400 rounded-full w-6 h-6 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Clone part"
                    >
                      📋
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add button (always visible if there are parts) */}
      {!adminMode && parts.length > 0 && (
        <button
          onClick={() => onAdd()}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
        >
          + Add {category.name.replace(/s$/, "")}
        </button>
      )}
    </>
  );
}

// ── Category Form Editor (Admin) ──────────────────────────────

function CategoryFormEditor({
  category,
  onSaved,
  onCancel,
  onDeleted,
}: {
  category: MergedCategory;
  onSaved: (updated: MergedCategory) => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const isBuiltIn = partCategories.some(c => c.id === category.id);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(false);
  const [catName, setCatName] = useState(category.name);
  const [catIcon] = useState(category.icon);
  const [description, setDescription] = useState(category.description ?? "");
  const [fields, setFields] = useState<PartAttribute[]>(() =>
    category.attributes.map((a) => ({ ...a })),
  );

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { key: `field_${Date.now()}`, label: "", type: "text" },
    ]);
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, patch: Partial<PartAttribute>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  };

  const handleSave = async () => {
    if (!catName.trim()) return;
    const now = new Date().toISOString();
    const record: LocalPartCategory = {
      id: category.id,
      name: catName.trim(),
      icon: catIcon || "📦",
      description: description.trim() || undefined,
      attributes: fields.filter(f => f.label.trim()),
      builtIn: isBuiltIn ? 1 : 0,
      createdAt: now,
      updatedAt: now,
      _dirty: 1,
    };
    await localDb.customPartCategories.put(record);
    const updated: MergedCategory = {
      ...category,
      name: record.name,
      icon: record.icon,
      description: record.description,
      attributes: record.attributes as PartAttribute[],
    };
    onSaved(updated);
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">⚙️ Manage Form — {category.name}</h2>

      <div className="flex flex-col gap-4">
        {/* Category name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Category Name</label>
          <input className={inputClass} value={catName} onChange={(e) => setCatName(e.target.value)} />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Description</label>
          <RichNotesEditor value={description} onChange={setDescription} placeholder="Category description — paste images from clipboard" minHeight={120} />
        </div>

        {/* Fields */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-neutral-400">Form Fields</label>
            <button onClick={addField} className="text-xs text-blue-400 hover:text-blue-300">+ Add Field</button>
          </div>

          {fields.length === 0 && (
            <p className="text-xs text-neutral-600 text-center py-4">No fields yet — add your first field above</p>
          )}

          <div className="flex flex-col gap-2">
            {fields.map((field, i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  {/* Reorder */}
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveField(i, -1)} className="text-[10px] text-neutral-500 hover:text-neutral-300 leading-none" disabled={i === 0}>▲</button>
                    <button onClick={() => moveField(i, 1)} className="text-[10px] text-neutral-500 hover:text-neutral-300 leading-none" disabled={i === fields.length - 1}>▼</button>
                  </div>
                  {/* Label */}
                  <input
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder-neutral-500"
                    placeholder="Field label"
                    value={field.label}
                    onChange={(e) => updateField(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "_") || field.key })}
                  />
                  {/* Type */}
                  <select
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
                    value={field.type}
                    onChange={(e) => updateField(i, { type: e.target.value as PartAttribute["type"] })}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="pick">Dropdown</option>
                  </select>
                  {/* Required */}
                  <button
                    onClick={() => updateField(i, { required: !field.required })}
                    className={`text-[10px] px-1.5 py-1 rounded border ${field.required ? "bg-blue-600/20 border-blue-500 text-blue-400" : "border-neutral-700 text-neutral-500"}`}
                    title="Required"
                  >
                    Req
                  </button>
                  {/* Delete */}
                  <button onClick={() => removeField(i)} className="text-red-400 text-xs hover:text-red-300">✕</button>
                </div>

                {/* Type-specific config */}
                {field.type === "number" && (
                  <div className="mt-1">
                    <input
                      className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder-neutral-500 w-24"
                      placeholder="Unit (mm, kv...)"
                      value={field.unit ?? ""}
                      onChange={(e) => updateField(i, { unit: e.target.value || undefined })}
                    />
                  </div>
                )}
                {field.type === "pick" && (
                  <div className="mt-1">
                    <input
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder-neutral-500"
                      placeholder="Options (comma-separated)"
                      value={(field.options ?? []).join(", ")}
                      onChange={(e) => updateField(i, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!catName.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
          >
            Save Form
          </button>
          <button onClick={onCancel} className="px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            Cancel
          </button>
        </div>

        {/* Delete Category */}
        {!isBuiltIn && (
        <div className="border-t border-neutral-800 pt-4 mt-2">
          {!confirmDeleteCat ? (
            <button
              onClick={() => setConfirmDeleteCat(true)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              🗑 Delete Category
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Delete this category and all its parts?</span>
              <button
                onClick={async () => {
                  try {
                    // Delete all parts in this category
                    const catParts = await localDb.parts.where("categoryId").equals(category.id).toArray();
                    for (const p of catParts) {
                      const files = await localDb.partFiles.where("partId").equals(p.id).toArray();
                      if (files.length) await localDb.partFiles.bulkDelete(files.map(f => f.id));
                    }
                    if (catParts.length) await localDb.parts.bulkDelete(catParts.map(p => p.id));
                    // Delete category image
                    const imgs = await localDb.categoryImages.where("categoryId").equals(category.id).toArray();
                    if (imgs.length) await localDb.categoryImages.bulkDelete(imgs.map(i => i.id));
                    // Delete the category
                    await localDb.customPartCategories.delete(category.id);
                    onDeleted();
                  } catch (err) {
                    console.error("Failed to delete category:", err);
                    setConfirmDeleteCat(false);
                  }
                }}
                className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded transition-colors"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDeleteCat(false)}
                className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  );
}

// ── Category Creator (Admin) ──────────────────────────────────

function CategoryCreator({
  cloneFrom,
  onCreated,
  onCancel,
}: {
  cloneFrom?: MergedCategory;
  onCreated: (cat: MergedCategory) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(cloneFrom ? `${cloneFrom.name} (copy)` : "");
  const [icon, setIcon] = useState(cloneFrom?.icon ?? "📦");
  const [description, setDescription] = useState(cloneFrom?.description ?? "");
  const [fields, setFields] = useState<PartAttribute[]>(
    cloneFrom ? cloneFrom.attributes.map(a => ({ ...a })) : [],
  );

  const addField = () => {
    setFields(prev => [...prev, { key: `field_${Date.now()}`, label: "", type: "text" }]);
  };

  const removeField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, patch: Partial<PartAttribute>) => {
    setFields(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const id = `custom-${uuid()}`;
    const record: LocalPartCategory = {
      id,
      name: name.trim(),
      icon: icon || "📦",
      description: description.trim() || undefined,
      attributes: fields.filter(f => f.label.trim()),
      builtIn: 0,
      createdAt: now,
      updatedAt: now,
      _dirty: 1,
    };
    await localDb.customPartCategories.add(record);
    const cat: MergedCategory = {
      id: id as PartCategory["id"],
      name: record.name,
      icon: record.icon,
      description: record.description,
      attributes: record.attributes as PartAttribute[],
    };
    onCreated(cat);
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">
        {cloneFrom ? `Clone Category — ${cloneFrom.name}` : "New Category"}
      </h2>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Category Name *</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wheels" />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Icon</label>
            <input className={inputClass + " text-center"} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📦" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Description</label>
          <RichNotesEditor value={description} onChange={setDescription} placeholder="Category description — paste images from clipboard" minHeight={120} />
        </div>

        {/* Fields */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-neutral-400">Form Fields</label>
            <button onClick={addField} className="text-xs text-blue-400 hover:text-blue-300">+ Add Field</button>
          </div>
          <div className="flex flex-col gap-2">
            {fields.map((field, i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex items-center gap-2">
                <input
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder-neutral-500"
                  placeholder="Field label"
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "_") || field.key })}
                />
                <select
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
                  value={field.type}
                  onChange={(e) => updateField(i, { type: e.target.value as PartAttribute["type"] })}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="pick">Dropdown</option>
                </select>
                <button onClick={() => removeField(i)} className="text-red-400 text-xs hover:text-red-300">✕</button>
              </div>
            ))}
          </div>
          {fields.length === 0 && (
            <p className="text-xs text-neutral-600 text-center py-4">No fields — add fields above or save empty</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
          >
            {cloneFrom ? "Clone Category" : "Create Category"}
          </button>
          <button onClick={onCancel} className="px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── Add / Edit Part Form ──────────────────────────────────────

function AddPartForm({
  category,
  presetVendor,
  editPart,
  onSaved,
  onCancel,
  onDeleted,
}: {
  category: MergedCategory;
  presetVendor?: Vendor;
  editPart?: LocalPart;
  onSaved: (p: LocalPart) => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [confirmDeletePart, setConfirmDeletePart] = useState(false);
  const allCategories = useAllCategories();
  const allVendors = useAllVendors();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(category.id);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(
    presetVendor ?? null,
  );
  const [name, setName] = useState(editPart?.name ?? "");
  const [sku, setSku] = useState(editPart?.sku ?? "");
  const [notes, setNotes] = useState(editPart?.notes ?? "");
  const [selectedChassis, setSelectedChassis] = useState<string[]>(
    editPart?.compatibleChassisIds ?? [],
  );
  const [attrs, setAttrs] = useState<Record<string, string | number>>(
    editPart?.attributes ?? {},
  );

  // Resolve the current category from allCategories for correct attrs
  const resolvedCategory = allCategories.find(c => c.id === selectedCategoryId) ?? category;

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
    if (!name.trim() || !selectedVendor) return;

    const now = new Date().toISOString();
    const part: LocalPart = {
      id: editPart?.id ?? uuid(),
      userId: "local",
      vendorId: selectedVendor.id,
      categoryId: selectedCategoryId,
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
        {editPart ? "Edit" : "Add"} {resolvedCategory.name.replace(/s$/, "")}
      </h2>

      <div className="flex flex-col gap-4">
        {/* Vendor picker */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Vendor *</label>
          <div className="grid grid-cols-3 gap-2">
            {allVendors.map((v) => (
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

        {/* Category */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Category</label>
          <select
            className={inputClass}
            value={selectedCategoryId}
            onChange={async (e) => {
              const val = e.target.value;
              if (val === "__new__") {
                const catName = prompt("New category name:");
                if (!catName?.trim()) return;
                const now = new Date().toISOString();
                const id = `custom-${uuid()}`;
                const record: LocalPartCategory = {
                  id,
                  name: catName.trim(),
                  icon: "📦",
                  attributes: [],
                  builtIn: 0,
                  createdAt: now,
                  updatedAt: now,
                  _dirty: 1,
                };
                await localDb.customPartCategories.add(record);
                setSelectedCategoryId(id);
              } else {
                setSelectedCategoryId(val);
              }
            }}
          >
            {allCategories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
            <option value="__new__">+ New Category…</option>
          </select>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Part Name *</label>
          <input
            className={inputClass}
            placeholder={`e.g. ${resolvedCategory.name.replace(/s$/, "")} ...`}
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
        {resolvedCategory.attributes.length > 0 && (
          <div>
            <label className="text-xs text-neutral-400 mb-2 block">Specifications</label>
            <div className="flex flex-col gap-3">
              {resolvedCategory.attributes.map((attr) => (
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
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : attr.type === "number" ? (
                    <input
                      type="number"
                      className={inputClass}
                      placeholder={attr.unit ? `(${attr.unit})` : ""}
                      value={attrs[attr.key] ?? ""}
                      onChange={(e) => setAttr(attr.key, e.target.value ? Number(e.target.value) : "")}
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
          <RichNotesEditor
            value={notes}
            onChange={setNotes}
            placeholder="Any additional notes..."
            minHeight={80}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!name.trim() || !selectedVendor}
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

        {/* Delete Part (edit mode only) */}
        {editPart && (
          <div className="border-t border-neutral-800 pt-4 mt-2">
            {!confirmDeletePart ? (
              <button
                onClick={() => setConfirmDeletePart(true)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                🗑 Delete Part
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete this part permanently?</span>
                <button
                  onClick={async () => {
                    const files = await localDb.partFiles.where("partId").equals(editPart.id).toArray();
                    if (files.length) await localDb.partFiles.bulkDelete(files.map(f => f.id));
                    await localDb.parts.delete(editPart.id);
                    onDeleted();
                  }}
                  className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDeletePart(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
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
  const allCategories = useAllCategories();
  const allVendors = useAllVendors();
  const vendor = allVendors.find(v => v.id === part.vendorId);
  const category = allCategories.find(c => c.id === part.categoryId) ?? getCategoryById(part.categoryId);
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string; url: string }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

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
        updatedAt: new Date().toISOString(),
        _dirty: 1,
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
        updatedAt: new Date().toISOString(),
        _dirty: 1,
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

        {category && Object.keys(part.attributes).length > 0 && (() => {
          const definedKeys = new Set(category.attributes.map(a => a.key));
          const extraAttrs = Object.entries(part.attributes).filter(([k, v]) => !definedKeys.has(k) && v !== undefined && v !== "");
          return (
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
              {extraAttrs.map(([key, val]) => (
                <div key={key}>
                  <p className="text-xs text-neutral-500">{key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                  <p className="text-sm">{val}</p>
                </div>
              ))}
            </div>
          </div>
          );
        })()}

        {part.notes && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
            <p className="text-xs text-neutral-500 mb-1">Notes</p>
            <MarkdownDisplay content={part.notes} />
          </div>
        )}

        {/* Photos */}
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
                  <button onClick={() => setViewingImage(img.url)} className="w-full">
                    <img src={img.url} alt={img.name} className="w-full h-20 object-cover rounded-lg" />
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

        {/* Documents */}
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
                <div key={pdf.id} className="flex items-center justify-between bg-neutral-800 rounded-lg px-3 py-2 group">
                  <button onClick={() => setViewingPdf(pdf.url)} className="flex items-center gap-2 text-left flex-1 min-w-0">
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
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />

      {/* Fullscreen image viewer */}
      {viewingImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
          <img src={viewingImage} alt="Part photo" className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-4 right-4 text-white text-2xl" onClick={() => setViewingImage(null)}>✕</button>
        </div>
      )}

      {/* Fullscreen PDF viewer */}
      {viewingPdf && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4">
          <div className="flex justify-end mb-2">
            <button className="text-white text-2xl" onClick={() => setViewingPdf(null)}>✕</button>
          </div>
          <iframe src={viewingPdf} title="PDF Document" className="flex-1 rounded-lg bg-white" />
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
  const allCategories = useAllCategories();
  const allVendors = useAllVendors();
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MergedCategory | null>(null);
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

  const handleCategoryChange = (cat: MergedCategory | null) => {
    setSelectedCategory(cat);
    setAttrs({});
  };

  const applyLookup = (r: PartLookupResult) => {
    if (r.name) setName(r.name);
    if (r.vendorId) {
      const v = allVendors.find((v) => v.id === r.vendorId);
      if (v) setSelectedVendor(v);
    }
    if (r.categoryId) {
      const c = allCategories.find((c) => c.id === r.categoryId);
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
            {allVendors.map((v) => (
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
            {allCategories.map((cat) => (
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
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : attr.type === "number" ? (
                    <input
                      type="number"
                      className={inputClass}
                      placeholder={attr.unit ? `(${attr.unit})` : ""}
                      value={attrs[attr.key] ?? ""}
                      onChange={(e) => setAttr(attr.key, e.target.value ? Number(e.target.value) : "")}
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
          <RichNotesEditor
            value={notes}
            onChange={setNotes}
            placeholder="Any additional notes..."
            minHeight={80}
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
                updatedAt: now,
                _dirty: 1,
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
                updatedAt: now,
                _dirty: 1,
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

  const allVendors = useAllVendors();
  const getVendorName = (id: string) => allVendors.find(v => v.id === id)?.name ?? id;
  const getCategoryName = (id: string) => getCategoryById(id)?.name ?? id;

  return (
    <>
      <h2 className="text-xl font-semibold mb-1">✨ AI Suggest Parts</h2>
      <p className="text-sm text-neutral-400 mb-4">
        Pick a chassis and let AI suggest optional & upgrade parts
      </p>

      <div className="flex gap-2 mb-4">
        <select
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
          value={chassis}
          onChange={(e) => setChassis(e.target.value)}
        >
          <option value="">Select chassis...</option>
          {chassisPlatforms.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
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

      {loading && (
        <div className="text-center py-12 text-neutral-400 text-sm">
          <div className="animate-pulse">Asking Gemini for parts...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {results.length > 0 && savedCount === null && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-300">
              {results.length} parts found — {selected.size} selected
            </span>
            <button onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
              {selected.size === results.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="flex flex-col gap-2 mb-4 max-h-[55vh] overflow-y-auto">
            {results.map((part, i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`text-left bg-neutral-900 border rounded-lg px-3 py-2.5 transition-colors ${
                  selected.has(i) ? "border-purple-500 bg-purple-900/20" : "border-neutral-800"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-xs ${
                      selected.has(i) ? "bg-purple-600 border-purple-600 text-white" : "border-neutral-600"
                    }`}
                  >
                    {selected.has(i) && "✓"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{part.name}</div>
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
            <button onClick={onDone} className="px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
              Cancel
            </button>
          </div>
        </>
      )}

      {savedCount !== null && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-lg font-semibold text-white mb-1">
            {savedCount} parts added!
          </div>
          <p className="text-sm text-neutral-400 mb-1">Browse categories to see them</p>
          {filesFound > 0 && (
            <p className="text-sm text-purple-400 mb-6">
              📎 {filesFound} image{filesFound !== 1 ? "s" : ""} / doc{filesFound !== 1 ? "s" : ""} attached
            </p>
          )}
          {filesFound === 0 && (
            <p className="text-xs text-neutral-500 mb-6">No downloadable images or docs found</p>
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
