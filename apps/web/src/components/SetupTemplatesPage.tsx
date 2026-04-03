import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { chassisPlatforms } from "@setupiq/shared";
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
                      {t.compatibleChassisIds.length > 0 && ` · ${t.compatibleChassisIds.map(id => chassisPlatforms.find(c => c.id === id)?.name ?? id).join(", ")}`}
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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{template.name}</h2>
          <p className="text-xs text-neutral-500">
            {template.capabilities.length} fields
          </p>
          {template.compatibleChassisIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {template.compatibleChassisIds.map((id) => {
                const chassis = chassisPlatforms.find((c) => c.id === id);
                return (
                  <span key={id} className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                    {chassis?.name ?? id}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClone}
            className="text-sm text-neutral-400 hover:text-neutral-300"
          >
            Clone
          </button>
          <button
            onClick={onEdit}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Edit
          </button>
        </div>
      </div>

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
  const [selectedChassisIds, setSelectedChassisIds] = useState<string[]>(
    template?.compatibleChassisIds ?? [],
  );
  const [capabilities, setCapabilities] = useState(
    template?.capabilities ?? [],
  );

  // Explicit section ordering (derived from initial capabilities, maintained manually)
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const cap of template?.capabilities ?? []) {
      if (!seen.has(cap.category)) {
        seen.add(cap.category);
        order.push(cap.category);
      }
    }
    return order;
  });

  // Section rename state
  const [editingSectionIdx, setEditingSectionIdx] = useState<number | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");

  // Add-section state
  const [showAddSection, setShowAddSection] = useState(false);
  const [addingSectionName, setAddingSectionName] = useState("");

  // Per-section inline add-field state
  const [addFieldSection, setAddFieldSection] = useState<string | null>(null);
  const [newCapName, setNewCapName] = useState("");
  const [newCapType, setNewCapType] = useState("pick");

  const toggleChassis = (id: string) => {
    setSelectedChassisIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  // ── Section operations ──

  const addSection = () => {
    const trimmed = addingSectionName.trim();
    if (!trimmed || sectionOrder.includes(trimmed)) return;
    setSectionOrder((prev) => [...prev, trimmed]);
    setAddingSectionName("");
    setShowAddSection(false);
  };

  const renameSection = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || (trimmed !== oldName && sectionOrder.includes(trimmed))) return;
    setSectionOrder((prev) => prev.map((s) => (s === oldName ? trimmed : s)));
    setCapabilities((prev) =>
      prev.map((c) => (c.category === oldName ? { ...c, category: trimmed } : c)),
    );
    setEditingSectionIdx(null);
  };

  const deleteSection = (sectionName: string) => {
    setSectionOrder((prev) => prev.filter((s) => s !== sectionName));
    setCapabilities((prev) => prev.filter((c) => c.category !== sectionName));
  };

  const moveSectionUp = (idx: number) => {
    if (idx <= 0) return;
    setSectionOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveSectionDown = (idx: number) => {
    setSectionOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  // ── Capability operations ──

  const addCapability = (section: string) => {
    if (!newCapName.trim()) return;
    setCapabilities((prev) => [
      ...prev,
      {
        id: newCapName.trim().toLowerCase().replace(/\s+/g, "-"),
        name: newCapName.trim(),
        category: section,
        valueType: newCapType,
      },
    ]);
    setNewCapName("");
    setNewCapType("pick");
  };

  const removeCapability = (id: string) => {
    setCapabilities((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    // Reorder capabilities to match section order
    const ordered: typeof capabilities = [];
    for (const section of sectionOrder) {
      ordered.push(...capabilities.filter((c) => c.category === section));
    }

    const now = new Date().toISOString();
    const saved: LocalSetupTemplate = {
      id: template?.id ?? uuid(),
      name: name.trim(),
      compatibleChassisIds: selectedChassisIds,
      capabilities: ordered,
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

        {/* Compatible Chassis Models */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Compatible Chassis Models</label>
          <div className="flex flex-wrap gap-1.5">
            {chassisPlatforms.map((cp) => {
              const selected = selectedChassisIds.includes(cp.id);
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => toggleChassis(cp.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selected
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  {cp.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sections & Fields */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">
            Sections & Fields ({capabilities.length} fields in {sectionOrder.length} sections)
          </label>

          {sectionOrder.length === 0 ? (
            <p className="text-xs text-neutral-600 mb-2">No sections yet — add one below.</p>
          ) : (
            <div className="flex flex-col gap-2 mb-3 max-h-[28rem] overflow-y-auto">
              {sectionOrder.map((section, idx) => {
                const caps = grouped.get(section) ?? [];
                const isEditing = editingSectionIdx === idx;
                return (
                  <div
                    key={section}
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2"
                  >
                    {/* Section header */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {isEditing ? (
                        <input
                          className="bg-neutral-800 border border-blue-500 rounded px-2 py-0.5 text-xs text-neutral-100 flex-1 focus:outline-none"
                          value={editingSectionName}
                          onChange={(e) => setEditingSectionName(e.target.value)}
                          onBlur={() => renameSection(section, editingSectionName)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameSection(section, editingSectionName);
                            if (e.key === "Escape") setEditingSectionIdx(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <p
                          className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide flex-1 cursor-pointer hover:text-neutral-300"
                          onClick={() => {
                            setEditingSectionIdx(idx);
                            setEditingSectionName(section);
                          }}
                          title="Click to rename"
                        >
                          {section}
                        </p>
                      )}
                      <button
                        onClick={() => moveSectionUp(idx)}
                        disabled={idx === 0}
                        className="text-neutral-600 hover:text-neutral-300 disabled:opacity-30 text-xs"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveSectionDown(idx)}
                        disabled={idx === sectionOrder.length - 1}
                        className="text-neutral-600 hover:text-neutral-300 disabled:opacity-30 text-xs"
                        title="Move down"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => deleteSection(section)}
                        className="text-red-500/60 hover:text-red-400 text-xs"
                        title="Delete section and all its fields"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Capabilities in this section */}
                    <div className="flex flex-wrap gap-1">
                      {caps.map((cap) => (
                        <span
                          key={cap.id}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300"
                        >
                          {cap.name}
                          <span className="text-neutral-600 text-[10px]">({cap.valueType})</span>
                          <button
                            onClick={() => removeCapability(cap.id)}
                            className="text-red-500 hover:text-red-400 ml-0.5"
                            title="Remove"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {caps.length === 0 && (
                        <span className="text-[10px] text-neutral-600 italic">Empty section</span>
                      )}
                    </div>

                    {/* Inline add field for this section */}
                    {addFieldSection === section ? (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-800">
                        <input
                          className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                          placeholder="Field name"
                          value={newCapName}
                          onChange={(e) => setNewCapName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newCapName.trim()) addCapability(section);
                          }}
                          autoFocus
                        />
                        <select
                          className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                          value={newCapType}
                          onChange={(e) => setNewCapType(e.target.value)}
                        >
                          {VALUE_TYPES.map((vt) => (
                            <option key={vt.value} value={vt.value}>{vt.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => addCapability(section)}
                          disabled={!newCapName.trim()}
                          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddFieldSection(null); setNewCapName(""); }}
                          className="text-xs text-neutral-500 hover:text-neutral-300"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddFieldSection(section); setNewCapName(""); setNewCapType("pick"); }}
                        className="text-[10px] text-blue-400/70 hover:text-blue-300 mt-1.5"
                      >
                        + Add field
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add section */}
          {showAddSection ? (
            <div className="flex items-center gap-2">
              <input
                className={inputClass}
                placeholder="Section name (e.g. Suspension, Tires)"
                value={addingSectionName}
                onChange={(e) => setAddingSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSection();
                  if (e.key === "Escape") { setShowAddSection(false); setAddingSectionName(""); }
                }}
                autoFocus
              />
              <button
                onClick={addSection}
                disabled={!addingSectionName.trim()}
                className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-40 whitespace-nowrap"
              >
                Add
              </button>
              <button
                onClick={() => { setShowAddSection(false); setAddingSectionName(""); }}
                className="text-sm text-neutral-500 hover:text-neutral-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + Add Section
            </button>
          )}
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
