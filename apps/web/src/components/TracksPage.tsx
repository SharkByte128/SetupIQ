import { useState } from "react";
import { useTracks } from "../hooks/use-tracks.js";
import type { SurfaceType } from "@setupiq/shared";

type View =
  | { kind: "list" }
  | { kind: "edit"; trackId?: string };

const surfaceTypes: { value: SurfaceType; label: string }[] = [
  { value: "rcp", label: "RCP Tiles" },
  { value: "carpet", label: "Carpet" },
  { value: "wood", label: "Wood" },
  { value: "concrete", label: "Concrete" },
  { value: "asphalt", label: "Asphalt" },
  { value: "other", label: "Other" },
];

export function TracksPage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const { tracks, loading, saving, createTrack, updateTrack, deleteTrack } =
    useTracks();

  if (view.kind === "edit") {
    const existing = view.trackId
      ? tracks.find((t) => t.id === view.trackId)
      : undefined;

    return (
      <TrackForm
        existing={
          existing
            ? {
                name: existing.name,
                location: existing.location ?? "",
                surfaceType: existing.surfaceType as SurfaceType,
                tileType: existing.tileType ?? "",
                dimensions: existing.dimensions ?? "",
                layoutDescription: existing.layoutDescription ?? "",
                notes: existing.notes ?? "",
              }
            : undefined
        }
        saving={saving}
        onSave={async (data) => {
          if (view.trackId) {
            await updateTrack(view.trackId, data);
          } else {
            await createTrack(data);
          }
          setView({ kind: "list" });
        }}
        onCancel={() => setView({ kind: "list" })}
        onDelete={
          view.trackId
            ? async () => {
                await deleteTrack(view.trackId!);
                setView({ kind: "list" });
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Tracks</h2>
        <button
          onClick={() => setView({ kind: "edit" })}
          className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-500"
        >
          + New Track
        </button>
      </div>

      {loading && (
        <p className="text-center text-neutral-500 text-sm py-8">Loading…</p>
      )}

      {!loading && tracks.length === 0 && (
        <p className="text-center text-neutral-500 text-sm py-8">
          No tracks yet. Add your first track.
        </p>
      )}

      {tracks.map((track) => (
        <button
          key={track.id}
          onClick={() => setView({ kind: "edit", trackId: track.id })}
          className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 p-3 hover:border-neutral-700 transition-colors"
        >
          <p className="text-sm font-medium text-neutral-200">{track.name}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {surfaceTypes.find((s) => s.value === track.surfaceType)?.label ??
              track.surfaceType}
            {track.location && ` • ${track.location}`}
            {track.dimensions && ` • ${track.dimensions}`}
          </p>
          {track.notes && (
            <p className="text-xs text-neutral-600 mt-1 truncate">
              {track.notes}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function TrackForm({
  existing,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  existing?: {
    name: string;
    location: string;
    surfaceType: SurfaceType;
    tileType: string;
    dimensions: string;
    layoutDescription: string;
    notes: string;
  };
  saving: boolean;
  onSave: (data: {
    name: string;
    location: string;
    surfaceType: SurfaceType;
    tileType: string;
    dimensions: string;
    layoutDescription: string;
    notes: string;
  }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [surfaceType, setSurfaceType] = useState<SurfaceType>(
    existing?.surfaceType ?? "rcp"
  );
  const [tileType, setTileType] = useState(existing?.tileType ?? "");
  const [dimensions, setDimensions] = useState(existing?.dimensions ?? "");
  const [layoutDescription, setLayoutDescription] = useState(
    existing?.layoutDescription ?? ""
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const inputClass =
    "w-full text-sm bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-neutral-200 placeholder-neutral-600";

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">
          {existing ? "Edit Track" : "New Track"}
        </h2>
        <button
          onClick={onCancel}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Track name"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City / venue"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Surface Type
          </label>
          <select
            value={surfaceType}
            onChange={(e) => setSurfaceType(e.target.value as SurfaceType)}
            className={inputClass}
          >
            {surfaceTypes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Tile Type
          </label>
          <input
            type="text"
            value={tileType}
            onChange={(e) => setTileType(e.target.value)}
            placeholder="e.g. RCP 30 cm smooth side up"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Dimensions
          </label>
          <input
            type="text"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="e.g. 12 ft × 24 ft"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Layout Description
          </label>
          <textarea
            value={layoutDescription}
            onChange={(e) => setLayoutDescription(e.target.value)}
            placeholder="Describe the layout, straights, corners…"
            rows={3}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Setup tips, tire recommendations…"
            rows={3}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            name.trim() &&
            onSave({
              name: name.trim(),
              location,
              surfaceType,
              tileType,
              dimensions,
              layoutDescription,
              notes,
            })
          }
          disabled={!name.trim() || saving}
          className="flex-1 rounded-md bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Update" : "Create"}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="rounded-md bg-red-600/20 text-red-400 px-3 py-2 text-sm font-medium hover:bg-red-600/30"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
