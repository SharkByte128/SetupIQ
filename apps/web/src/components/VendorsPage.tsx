import { useState, useCallback } from "react";
import { vendors } from "@setupiq/shared";
import { localDb, type LocalCustomVendor } from "../db/local-db.js";
import { useCustomVendors } from "../hooks/use-vendors.js";
import { v4 as uuid } from "uuid";

// Preset color palette
const colorOptions = [
  "#c41e3a", "#1a1a2e", "#0d0d0d", "#2c2c2c", "#003366",
  "#2d5a27", "#4a1a6b", "#1a4a4a", "#8b6914", "#1a3a5c",
  "#1a1a8b", "#ff6600", "#005b33", "#6b1a1a", "#1a6b5a",
  "#5c1a3a", "#3a1a5c", "#5c3a1a", "#1a5c1a", "#333333",
];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ── Inline VendorLogo (duplicated from PartsBinPage to avoid circular deps) ──
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

function MiniVendorLogo({ slug, size = 40, abbreviation, color }: { slug: string; size?: number; abbreviation?: string; color?: string }) {
  const s = { width: size, height: size };

  if (slug === "kyosho") return <svg {...s} viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#c41e3a" /><text x="24" y="32" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">K</text></svg>;
  if (slug === "pn-racing") return <svg {...s} viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#1a1a2e" /><text x="24" y="32" textAnchor="middle" fill="#f5c518" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">PN</text></svg>;
  if (slug === "nexx-racing") return <svg {...s} viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#0d0d0d" /><text x="24" y="32" textAnchor="middle" fill="#00bfff" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">NX</text></svg>;
  if (slug === "silver-horse") return <svg {...s} viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#2c2c2c" /><text x="24" y="32" textAnchor="middle" fill="#c0c0c0" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">SH</text></svg>;
  if (slug === "atomic-rc") return <svg {...s} viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#1a1a1a" /><text x="24" y="32" textAnchor="middle" fill="#ff4444" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">AT</text></svg>;
  if (slug === "reflex-racing") return <svg {...s} viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#003366" /><text x="24" y="32" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">RR</text></svg>;

  const vis = builtInVendorVisuals[slug];
  const abbr = abbreviation ?? vis?.abbr ?? slug.slice(0, 2).toUpperCase();
  const bg = color ?? vis?.color ?? "#333";
  const fs = abbr.length > 2 ? 10 : abbr.length > 1 ? 14 : 16;
  return (
    <svg {...s} viewBox="0 0 48 48">
      <rect width="48" height="48" rx="8" fill={bg} />
      <text x="24" y="32" textAnchor="middle" fill="white" fontSize={fs} fontWeight="bold" fontFamily="Arial, sans-serif">{abbr}</text>
    </svg>
  );
}

// ── Types ──
type ViewState =
  | { type: "list" }
  | { type: "add" }
  | { type: "edit"; vendor: LocalCustomVendor };

export function VendorsPage({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ViewState>({ type: "list" });
  const customVendors = useCustomVendors();

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this vendor? Parts using it will show as unknown vendor.")) return;
    await localDb.customVendors.delete(id);
  }, []);

  if (view.type === "add") {
    return (
      <VendorForm
        onSave={async (data) => {
          const now = new Date().toISOString();
          await localDb.customVendors.add({
            id: `vendor-${slugify(data.name)}-${uuid().slice(0, 6)}`,
            name: data.name,
            slug: slugify(data.name),
            abbreviation: data.abbreviation,
            color: data.color,
            createdAt: now,
            updatedAt: now,
            _dirty: 1,
          });
          setView({ type: "list" });
        }}
        onCancel={() => setView({ type: "list" })}
      />
    );
  }

  if (view.type === "edit") {
    return (
      <VendorForm
        initial={view.vendor}
        onSave={async (data) => {
          await localDb.customVendors.update(view.vendor.id, {
            name: data.name,
            slug: slugify(data.name),
            abbreviation: data.abbreviation,
            color: data.color,
            updatedAt: new Date().toISOString(),
            _dirty: 1,
          });
          setView({ type: "list" });
        }}
        onCancel={() => setView({ type: "list" })}
      />
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-sm">
            ← Back
          </button>
          <h2 className="text-lg font-semibold">Vendors</h2>
        </div>
        <button
          onClick={() => setView({ type: "add" })}
          className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          + Add Vendor
        </button>
      </div>

      {/* Built-in vendors */}
      <div className="mb-6">
        <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wider">Built-in ({vendors.length})</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {vendors.map((v) => (
            <div
              key={v.id}
              className="flex flex-col items-center gap-1.5 p-2 bg-neutral-900 border border-neutral-800 rounded-lg"
            >
              <MiniVendorLogo slug={v.slug} size={36} />
              <span className="text-[10px] text-neutral-400 text-center truncate w-full">{v.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom vendors */}
      <div>
        <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wider">Custom ({customVendors.length})</p>
        {customVendors.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-2xl mb-2">🏭</p>
            <p className="text-sm text-neutral-500">No custom vendors yet</p>
            <p className="text-xs text-neutral-600 mt-1">Add vendors that aren't in the built-in list</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {customVendors.map((cv) => (
              <div
                key={cv.id}
                className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5"
              >
                <MiniVendorLogo slug={cv.slug} size={36} abbreviation={cv.abbreviation} color={cv.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cv.name}</p>
                  <p className="text-[10px] text-neutral-500">{cv.abbreviation} · {cv.slug}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setView({ type: "edit", vendor: cv })}
                    className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(cv.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add/Edit Form ──

function VendorForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: LocalCustomVendor;
  onSave: (data: { name: string; abbreviation: string; color: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(initial?.abbreviation ?? "");
  const [color, setColor] = useState(initial?.color ?? "#333333");
  const [saving, setSaving] = useState(false);

  const autoAbbr = getInitials(name || "??");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      abbreviation: (abbreviation.trim() || autoAbbr).slice(0, 3),
      color,
    });
    setSaving(false);
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-300 text-sm">
            ← Back
          </button>
          <h2 className="text-lg font-semibold">{initial ? "Edit Vendor" : "Add Vendor"}</h2>
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center justify-center mb-6">
        <div className="flex flex-col items-center gap-2">
          <MiniVendorLogo
            slug={slugify(name || "new")}
            size={64}
            abbreviation={(abbreviation.trim() || autoAbbr).slice(0, 3)}
            color={color}
          />
          <p className="text-xs text-neutral-500">Preview</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Vendor Name *</label>
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. Tamiya"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Abbreviation */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">
            Abbreviation (1-3 chars for logo)
          </label>
          <input
            type="text"
            className={inputClass}
            placeholder={autoAbbr}
            value={abbreviation}
            onChange={(e) => setAbbreviation(e.target.value.slice(0, 3))}
            maxLength={3}
          />
          <p className="text-[10px] text-neutral-600 mt-1">
            Leave blank to auto-generate from name
          </p>
        </div>

        {/* Color picker */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Logo Color</label>
          <div className="grid grid-cols-10 gap-1.5">
            {colorOptions.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-colors ${
                  color === c ? "border-white" : "border-transparent hover:border-neutral-600"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <label className="text-[10px] text-neutral-500">Custom:</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
            />
            <span className="text-[10px] text-neutral-600 font-mono">{color}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Vendor"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
