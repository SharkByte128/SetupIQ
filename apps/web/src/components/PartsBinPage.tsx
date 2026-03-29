import { useState, useEffect, useCallback } from "react";
import {
  vendors,
  partCategories,
  chassisPlatforms,
  getCategoryById,
  getVendorById,
  type Vendor,
  type PartCategory,
} from "@setupiq/shared";
import { localDb, type LocalPart } from "../db/local-db.js";
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

// ── View Types ────────────────────────────────────────────────

type View =
  | { type: "vendors" }
  | { type: "categories"; vendor: Vendor }
  | { type: "parts"; vendor: Vendor; category: PartCategory }
  | { type: "add"; vendor: Vendor; category: PartCategory; editPart?: LocalPart }
  | { type: "detail"; part: LocalPart };

// ── Main Component ────────────────────────────────────────────

export function PartsBinPage() {
  const [view, setView] = useState<View>({ type: "vendors" });

  const goBack = useCallback(() => {
    switch (view.type) {
      case "categories":
        setView({ type: "vendors" });
        break;
      case "parts":
        setView({ type: "categories", vendor: view.vendor });
        break;
      case "add":
        setView({ type: "parts", vendor: view.vendor, category: view.category });
        break;
      case "detail":
        {
          const v = getVendorById(view.part.vendorId);
          const c = getCategoryById(view.part.categoryId);
          if (v && c) setView({ type: "parts", vendor: v, category: c });
          else setView({ type: "vendors" });
        }
        break;
      default:
        break;
    }
  }, [view]);

  return (
    <div className="px-4 py-4">
      {view.type !== "vendors" && (
        <button
          onClick={goBack}
          className="text-sm text-blue-400 hover:text-blue-300 mb-3"
        >
          ← Back
        </button>
      )}

      {view.type === "vendors" && (
        <VendorGrid onSelect={(v) => setView({ type: "categories", vendor: v })} />
      )}
      {view.type === "categories" && (
        <CategoryList
          vendor={view.vendor}
          onSelect={(c) => setView({ type: "parts", vendor: view.vendor, category: c })}
        />
      )}
      {view.type === "parts" && (
        <PartsList
          vendor={view.vendor}
          category={view.category}
          onAdd={() => setView({ type: "add", vendor: view.vendor, category: view.category })}
          onDetail={(p) => setView({ type: "detail", part: p })}
          onEdit={(p) => setView({ type: "add", vendor: view.vendor, category: view.category, editPart: p })}
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
    </div>
  );
}

// ── Vendor Grid ───────────────────────────────────────────────

function VendorGrid({ onSelect }: { onSelect: (v: Vendor) => void }) {
  return (
    <>
      <h2 className="text-xl font-semibold mb-4">Parts Bin</h2>
      <p className="text-sm text-neutral-400 mb-4">Choose a vendor to browse or add parts</p>
      <div className="grid grid-cols-3 gap-3">
        {vendors.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex flex-col items-center gap-2 hover:border-neutral-600 transition-colors"
          >
            <VendorLogo slug={v.slug} size={48} />
            <span className="text-xs font-medium text-neutral-300">{v.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ── Category List ─────────────────────────────────────────────

function CategoryList({
  vendor,
  onSelect,
}: {
  vendor: Vendor;
  onSelect: (c: PartCategory) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    localDb.parts
      .where("vendorId")
      .equals(vendor.id)
      .toArray()
      .then((parts) => {
        const c: Record<string, number> = {};
        for (const p of parts) {
          c[p.categoryId] = (c[p.categoryId] || 0) + 1;
        }
        setCounts(c);
      });
  }, [vendor.id]);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <VendorLogo slug={vendor.slug} size={32} />
        <h2 className="text-xl font-semibold">{vendor.name}</h2>
      </div>
      <div className="flex flex-col gap-2">
        {partCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 flex items-center justify-between hover:border-neutral-600 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{cat.icon}</span>
              <span className="font-medium text-sm">{cat.name}</span>
            </div>
            <span className="text-xs text-neutral-500">
              {counts[cat.id] || 0} parts
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ── Parts List ────────────────────────────────────────────────

function PartsList({
  vendor,
  category,
  onAdd,
  onDetail,
  onEdit,
}: {
  vendor: Vendor;
  category: PartCategory;
  onAdd: () => void;
  onDetail: (p: LocalPart) => void;
  onEdit: (p: LocalPart) => void;
}) {
  const [parts, setParts] = useState<LocalPart[]>([]);

  useEffect(() => {
    localDb.parts
      .where("[vendorId+categoryId]")
      .equals([vendor.id, category.id])
      .toArray()
      .then(setParts)
      .catch(() => {
        // Fallback if compound index not found
        localDb.parts
          .where("vendorId")
          .equals(vendor.id)
          .filter((p) => p.categoryId === category.id)
          .toArray()
          .then(setParts);
      });
  }, [vendor.id, category.id]);

  return (
    <>
      <div className="flex items-center gap-3 mb-1">
        <VendorLogo slug={vendor.slug} size={24} />
        <h2 className="text-lg font-semibold">{vendor.name}</h2>
      </div>
      <h3 className="text-sm text-neutral-400 mb-4">{category.icon} {category.name}</h3>

      {parts.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">
          <p className="text-sm">No {category.name.toLowerCase()} from {vendor.name} yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {parts.map((part) => (
            <div
              key={part.id}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 flex items-center justify-between"
            >
              <button
                onClick={() => onDetail(part)}
                className="flex-1 text-left"
              >
                <p className="font-medium text-sm">{part.name}</p>
                <p className="text-xs text-neutral-500">
                  {part.sku && <span className="mr-2">SKU: {part.sku}</span>}
                  {part.compatibleChassisIds.length > 0 &&
                    part.compatibleChassisIds
                      .map((id) => chassisPlatforms.find((c) => c.id === id)?.name)
                      .filter(Boolean)
                      .join(", ")}
                </p>
              </button>
              <button
                onClick={() => onEdit(part)}
                className="text-xs text-blue-400 hover:text-blue-300 px-2"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onAdd}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
      >
        + Add {category.name.replace(/s$/, "")}
      </button>
    </>
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

        {/* SKU */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">SKU / Part Number</label>
          <input
            className={inputClass}
            placeholder="e.g. MZW-38"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>

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
      </div>
    </>
  );
}
