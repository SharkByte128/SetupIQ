import { useState } from "react";
import { useRacers } from "../hooks/use-racers.js";

export function RacersManager() {
  const { racers, addRacer, renameRacer, deleteRacer, setActiveRacer } = useRacers();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addRacer(newName);
    setNewName("");
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitEdit = async () => {
    if (editingId && editName.trim()) {
      await renameRacer(editingId, editName);
    }
    setEditingId(null);
  };

  const inputClass =
    "w-full text-sm bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-sm mb-1">Racers</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Add racers and switch between them. The active racer is shown in the header.
        </p>
      </div>

      {/* Racer list */}
      <div className="space-y-2">
        {racers.map((racer) => (
          <div
            key={racer.id}
            className={`flex items-center gap-2 rounded-lg border p-2.5 transition-colors ${
              racer.active === 1
                ? "bg-blue-950/30 border-blue-800"
                : "bg-neutral-900 border-neutral-800"
            }`}
          >
            {editingId === racer.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                className={inputClass + " flex-1"}
              />
            ) : (
              <>
                <button
                  onClick={() => setActiveRacer(racer.id)}
                  className={`flex-1 text-left text-sm ${
                    racer.active === 1 ? "text-blue-300 font-medium" : "text-neutral-300"
                  }`}
                >
                  {racer.active === 1 && <span className="mr-1.5">✓</span>}
                  {racer.name}
                </button>
                <button
                  onClick={() => startEdit(racer.id, racer.name)}
                  className="text-xs text-neutral-500 hover:text-neutral-300 px-1.5"
                >
                  Edit
                </button>
                {racers.length > 1 && (
                  <button
                    onClick={() => deleteRacer(racer.id)}
                    className="text-xs text-red-500 hover:text-red-400 px-1.5"
                  >
                    Remove
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add new racer */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New racer name"
          className={inputClass + " flex-1"}
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="rounded-md bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}
