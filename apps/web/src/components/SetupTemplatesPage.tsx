import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, type LocalSetupTemplate } from "../db/local-db.js";
import { v4 as uuid } from "uuid";

// ── View Types ────────────────────────────────────────────────

type View =
  | { type: "list" }
  | { type: "detail"; template: LocalSetupTemplate }
  | { type: "edit"; template: LocalSetupTemplate }
  | { type: "create" };

// ── Main Component ────────────────────────────────────────────

export function SetupTemplatesPage() {
  const [view, setView] = useState<View>({ type: "list" });

  return (
    <div className="px-4 py-4">
      {view.type !== "list" && (
        <button
          onClick={() => setView({ type: "list" })}
          className="text-sm text-blue-400 hover:text-blue-300 mb-3"
        >
          ← Back
        </button>
      )}

      {view.type === "list" && (
        <TemplateList
          onSelect={(t) => setView({ type: "detail", template: t })}
          onCreate={() => setView({ type: "create" })}
        />
      )}

      {view.type === "detail" && (
        <TemplateDetail
          template={view.template}
          onEdit={() => setView({ type: "edit", template: view.template })}
          onClone={async () => {
            const now = new Date().toISOString();
            const cloned: LocalSetupTemplate = {
              ...view.template,
              id: uuid(),
              name: `${view.template.name} (Copy)`,
              builtIn: false,
              createdAt: now,
              updatedAt: now,
            };
            await localDb.setupTemplates.put(cloned);
            setView({ type: "edit", template: cloned });
          }}
          onDelete={async () => {
            await localDb.setupTemplates.delete(view.template.id);
            setView({ type: "list" });
          }}
        />
      )}

      {view.type === "edit" && (
        <TemplateEditor
          template={view.template}
          onSaved={(t) => setView({ type: "detail", template: t })}
          onCancel={() => setView({ type: "detail", template: view.template })}
        />
      )}

      {view.type === "create" && (
        <TemplateEditor
          onSaved={(t) => setView({ type: "detail", template: t })}
          onCancel={() => setView({ type: "list" })}
        />
      )}
    </div>
  );
}

// ── Template List ─────────────────────────────────────────────

function TemplateList({
  onSelect,
  onCreate,
}: {
  onSelect: (t: LocalSetupTemplate) => void;
  onCreate: () => void;
}) {
  const templates = useLiveQuery(() => localDb.setupTemplates.toArray()) ?? [];

  const sorted = useMemo(() => {
    return [...templates].sort((a, b) => {
      // Built-in first, then alphabetical
      if (a.builtIn && !b.builtIn) return -1;
      if (!a.builtIn && b.builtIn) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [templates]);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Setup Sheet Templates</h2>
        <button
          onClick={onCreate}
          className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          + New Template
        </button>
      </div>

      <p className="text-xs text-neutral-500 mb-4">
        Templates define which fields appear on a setup sheet. Parts are compatible with templates.
      </p>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-sm">No templates yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((t) => {
            const categories = [...new Set(t.capabilities.map((c) => c.category))];
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-left hover:border-neutral-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {t.capabilities.length} fields · {categories.length} categories
                      {t.manufacturer && ` · ${t.manufacturer}`}
                      {t.scale && ` · ${t.scale}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.builtIn && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500 border border-neutral-700">
                        Built-in
                      </span>
                    )}
                    <span className="text-neutral-500 text-sm">→</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Template Detail ───────────────────────────────────────────

function TemplateDetail({
  template,
  onEdit,
  onClone,
  onDelete,
}: {
  template: LocalSetupTemplate;
  onEdit: () => void;
  onClone: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Group capabilities by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof template.capabilities>();
    for (const cap of template.capabilities) {
      const list = map.get(cap.category) ?? [];
      list.push(cap);
      map.set(cap.category, list);
    }
    return map;
  }, [template.capabilities]);

  // Count parts using this template
  const partCount = useLiveQuery(async () => {
    const parts = await localDb.parts.toArray();
    return parts.filter((p) => p.compatibleChassisIds.includes(template.id)).length;
  }, [template.id]) ?? 0;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{template.name}</h2>
          <p className="text-xs text-neutral-500">
            {template.capabilities.length} fields
            {template.manufacturer && ` · ${template.manufacturer}`}
            {template.scale && ` · ${template.scale}`}
            {template.driveType && ` · ${template.driveType}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClone}
            className="text-sm text-neutral-400 hover:text-neutral-300"
          >
            Clone
          </button>
          {!template.builtIn && (
            <button
              onClick={onEdit}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {partCount > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 mb-3">
          <p className="text-xs text-neutral-400">
            {partCount} part{partCount !== 1 ? "s" : ""} compatible with this template
          </p>
        </div>
      )}

      {/* Capabilities grouped by category */}
      <div className="flex flex-col gap-3">
        {[...grouped.entries()].map(([category, caps]) => (
          <div
            key={category}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3"
          >
            <p className="text-xs text-neutral-500 font-medium mb-2">{category}</p>
            <div className="flex flex-wrap gap-1.5">
              {caps.map((cap) => (
                <span
                  key={cap.id}
                  className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300"
                  title={`Type: ${cap.valueType}`}
                >
                  {cap.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Delete */}
      {!template.builtIn && (
        <div className="border-t border-neutral-800 pt-4 mt-4">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-400">Delete this template?</span>
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
              Delete Template
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ── Template Editor ───────────────────────────────────────────

const VALUE_TYPES = [
  { value: "pick", label: "Pick (dropdown)" },
  { value: "numeric", label: "Numeric" },
  { value: "toggle", label: "Toggle (on/off)" },
  { value: "text", label: "Text" },
];

function TemplateEditor({
  template,
  onSaved,
  onCancel,
}: {
  template?: LocalSetupTemplate;
  onSaved: (t: LocalSetupTemplate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [manufacturer, setManufacturer] = useState(template?.manufacturer ?? "");
  const [scale, setScale] = useState(template?.scale ?? "1:28");
  const [driveType, setDriveType] = useState(template?.driveType ?? "RWD");
  const [capabilities, setCapabilities] = useState(
    template?.capabilities ?? [],
  );

  // New capability form
  const [newCapName, setNewCapName] = useState("");
  const [newCapCategory, setNewCapCategory] = useState("");
  const [newCapType, setNewCapType] = useState("pick");

  const existingCategories = useMemo(() => {
    return [...new Set(capabilities.map((c) => c.category))].sort();
  }, [capabilities]);

  const addCapability = () => {
    if (!newCapName.trim() || !newCapCategory.trim()) return;
    setCapabilities((prev) => [
      ...prev,
      {
        id: newCapName.trim().toLowerCase().replace(/\s+/g, "-"),
        name: newCapName.trim(),
        category: newCapCategory.trim(),
        valueType: newCapType,
      },
    ]);
    setNewCapName("");
  };

  const removeCapability = (id: string) => {
    setCapabilities((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    const now = new Date().toISOString();
    const saved: LocalSetupTemplate = {
      id: template?.id ?? uuid(),
      name: name.trim(),
      manufacturer: manufacturer.trim() || undefined,
      scale: scale.trim() || undefined,
      driveType: driveType.trim() || undefined,
      capabilities,
      builtIn: false,
      createdAt: template?.createdAt ?? now,
      updatedAt: now,
    };

    await localDb.setupTemplates.put(saved);
    onSaved(saved);
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  // Group capabilities by category for display
  const grouped = useMemo(() => {
    const map = new Map<string, typeof capabilities>();
    for (const cap of capabilities) {
      const list = map.get(cap.category) ?? [];
      list.push(cap);
      map.set(cap.category, list);
    }
    return map;
  }, [capabilities]);

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">
        {template ? "Edit Template" : "New Template"}
      </h2>

      <div className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Template Name *</label>
          <input
            className={inputClass}
            placeholder="e.g. Kyosho MR-03 RWD"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Manufacturer</label>
            <input
              className={inputClass}
              placeholder="e.g. Kyosho"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Scale</label>
            <input
              className={inputClass}
              placeholder="e.g. 1:28"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Drive Type</label>
            <select
              className={inputClass}
              value={driveType}
              onChange={(e) => setDriveType(e.target.value)}
            >
              <option value="RWD">RWD</option>
              <option value="AWD">AWD</option>
              <option value="FWD">FWD</option>
            </select>
          </div>
        </div>

        {/* Current capabilities */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">
            Setup Fields ({capabilities.length})
          </label>

          {capabilities.length === 0 ? (
            <p className="text-xs text-neutral-600 mb-2">No fields yet — add some below.</p>
          ) : (
            <div className="flex flex-col gap-2 mb-3 max-h-80 overflow-y-auto">
              {[...grouped.entries()].map(([category, caps]) => (
                <div
                  key={category}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2"
                >
                  <p className="text-[10px] text-neutral-500 font-medium mb-1.5 uppercase tracking-wide">
                    {category}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {caps.map((cap) => (
                      <span
                        key={cap.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300"
                      >
                        {cap.name}
                        <span className="text-neutral-600 text-[10px]">({cap.valueType})</span>
                        {!template?.builtIn && (
                          <button
                            onClick={() => removeCapability(cap.id)}
                            className="text-red-500 hover:text-red-400 ml-0.5"
                            title="Remove"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add new capability */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
          <p className="text-xs text-neutral-400 mb-2">Add Setup Field</p>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input
              className={inputClass}
              placeholder="Field name"
              value={newCapName}
              onChange={(e) => setNewCapName(e.target.value)}
            />
            <div>
              <input
                className={inputClass}
                placeholder="Category"
                value={newCapCategory}
                onChange={(e) => setNewCapCategory(e.target.value)}
                list="cap-categories"
              />
              <datalist id="cap-categories">
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <select
              className={inputClass}
              value={newCapType}
              onChange={(e) => setNewCapType(e.target.value)}
            >
              {VALUE_TYPES.map((vt) => (
                <option key={vt.value} value={vt.value}>{vt.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={addCapability}
            className="text-xs text-blue-400 hover:text-blue-300"
            disabled={!newCapName.trim() || !newCapCategory.trim()}
          >
            + Add Field
          </button>
        </div>

        {/* Save / Cancel */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            Save Template
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
