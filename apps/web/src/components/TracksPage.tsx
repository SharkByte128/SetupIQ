import { useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTracks } from "../hooks/use-tracks.js";
import { useHideDemoData, useIsDemoDataOwner, isDemoRecord } from "../hooks/use-demo-filter.js";
import { localDb, type LocalTrackFile } from "../db/local-db.js";
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
  const hideDemoData = useHideDemoData();
  const isDemoOwner = useIsDemoDataOwner();
  const { tracks, loading, saving, createTrack, updateTrack, deleteTrack } =
    useTracks(hideDemoData);

  if (view.kind === "edit") {
    const existing = view.trackId
      ? tracks.find((t) => t.id === view.trackId)
      : undefined;
    const readOnly = existing ? isDemoRecord(existing) && !isDemoOwner : false;

    return (
      <TrackForm
        trackId={view.trackId}
        existing={
          existing
            ? {
                name: existing.name,
                location: existing.location ?? "",
                address: existing.address ?? "",
                phone: existing.phone ?? "",
                hours: existing.hours ?? "",
                timingSystem: existing.timingSystem ?? "",
                surfaceType: existing.surfaceType as SurfaceType,
                tileType: existing.tileType ?? "",
                dimensions: existing.dimensions ?? "",
                layoutDescription: existing.layoutDescription ?? "",
                notes: existing.notes ?? "",
              }
            : undefined
        }
        saving={saving}
        onSave={readOnly ? undefined : async (data) => {
          if (view.trackId) {
            await updateTrack(view.trackId, data);
          } else {
            const created = await createTrack(data);
            // If there's a pending layout photo, save it after creation
            if (data._pendingPhoto) {
              await localDb.trackFiles.put({
                id: crypto.randomUUID(),
                trackId: created.id,
                blob: data._pendingPhoto,
                name: data._pendingPhotoName ?? "layout.jpg",
                mimeType: data._pendingPhoto.type,
                createdAt: new Date().toISOString(),
              });
            }
          }
          setView({ kind: "list" });
        }}
        onCancel={() => setView({ kind: "list" })}
        onDelete={
          readOnly ? undefined :
          view.trackId
            ? async () => {
                // Delete layout photos too
                const files = await localDb.trackFiles.where("trackId").equals(view.trackId!).toArray();
                for (const f of files) await localDb.trackFiles.delete(f.id);
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
        <TrackCard
          key={track.id}
          track={track}
          onClick={() => setView({ kind: "edit", trackId: track.id })}
        />
      ))}
    </div>
  );
}

function TrackCard({ track, onClick }: { track: { id: string; name: string; surfaceType: string; location?: string; dimensions?: string; notes?: string }; onClick: () => void }) {
  const layoutPhoto = useLiveQuery(
    () => localDb.trackFiles.where("trackId").equals(track.id).first(),
    [track.id],
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (layoutPhoto) {
      const url = URL.createObjectURL(layoutPhoto.blob);
      setPhotoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPhotoUrl(null);
  }, [layoutPhoto]);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden hover:border-neutral-700 transition-colors"
    >
      {photoUrl && (
        <img src={photoUrl} alt="Track layout" className="w-full h-32 object-cover" />
      )}
      <div className="p-3">
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
      </div>
    </button>
  );
}

// ── Layout Photo Section ──────────────────────────────────────

function LayoutPhotoSection({
  trackId,
  pendingPhoto,
  onPendingPhoto,
}: {
  trackId?: string;
  pendingPhoto?: Blob | null;
  onPendingPhoto?: (blob: Blob | null, name: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // For existing tracks, query from DB
  const dbPhotos = useLiveQuery(
    () => (trackId ? localDb.trackFiles.where("trackId").equals(trackId).toArray() : Promise.resolve([] as LocalTrackFile[])),
    [trackId],
  ) ?? [];

  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [dbUrls, setDbUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (pendingPhoto) {
      const url = URL.createObjectURL(pendingPhoto);
      setPendingUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPendingUrl(null);
  }, [pendingPhoto]);

  useEffect(() => {
    const urls = new Map<string, string>();
    for (const f of dbPhotos) {
      urls.set(f.id, URL.createObjectURL(f.blob));
    }
    setDbUrls(urls);
    return () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
  }, [dbPhotos]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (trackId) {
      // Save directly to DB for existing tracks
      await localDb.trackFiles.put({
        id: crypto.randomUUID(),
        trackId,
        blob: file,
        name: file.name,
        mimeType: file.type,
        createdAt: new Date().toISOString(),
      });
    } else {
      // New track — hold as pending
      onPendingPhoto?.(file, file.name);
    }
    e.target.value = "";
  };

  const handleDelete = async (fileId: string) => {
    await localDb.trackFiles.delete(fileId);
  };

  const photos = trackId ? dbPhotos : [];
  const hasPhoto = photos.length > 0 || pendingUrl;

  return (
    <div>
      <label className="text-xs text-neutral-400 block mb-1">
        Track Layout Photo
      </label>
      {hasPhoto ? (
        <div className="space-y-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <img
                src={dbUrls.get(p.id)}
                alt="Track layout"
                className="w-full rounded-lg border border-neutral-700 object-cover max-h-64"
              />
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="absolute top-2 right-2 bg-red-600/80 text-white rounded-full w-6 h-6 text-xs hover:bg-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          {pendingUrl && (
            <div className="relative">
              <img
                src={pendingUrl}
                alt="Track layout (pending)"
                className="w-full rounded-lg border border-neutral-700 object-cover max-h-64"
              />
              <button
                type="button"
                onClick={() => onPendingPhoto?.(null, "")}
                className="absolute top-2 right-2 bg-red-600/80 text-white rounded-full w-6 h-6 text-xs hover:bg-red-500"
              >
                ✕
              </button>
            </div>
          )}
          {/* Allow replacing */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Replace photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-neutral-700 py-6 text-center text-neutral-500 hover:border-neutral-600 hover:text-neutral-400 transition-colors"
        >
          <span className="block text-2xl mb-1">📷</span>
          <span className="text-xs">Tap to add layout photo</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

// ── Track Form ────────────────────────────────────────────────

interface TrackFormData {
  name: string;
  location: string;
  address: string;
  phone: string;
  hours: string;
  timingSystem: string;
  surfaceType: SurfaceType;
  tileType: string;
  dimensions: string;
  layoutDescription: string;
  notes: string;
  _pendingPhoto?: Blob;
  _pendingPhotoName?: string;
}

function TrackForm({
  trackId,
  existing,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  trackId?: string;
  existing?: Omit<TrackFormData, "_pendingPhoto" | "_pendingPhotoName">;
  saving: boolean;
  onSave?: (data: TrackFormData) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [hours, setHours] = useState(existing?.hours ?? "");
  const [timingSystem, setTimingSystem] = useState(existing?.timingSystem ?? "");
  const [surfaceType, setSurfaceType] = useState<SurfaceType>(
    existing?.surfaceType ?? "rcp"
  );
  const [tileType, setTileType] = useState(existing?.tileType ?? "");
  const [dimensions, setDimensions] = useState(existing?.dimensions ?? "");
  const [layoutDescription, setLayoutDescription] = useState(
    existing?.layoutDescription ?? ""
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null);
  const [pendingPhotoName, setPendingPhotoName] = useState("");

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
          <label className="text-xs text-neutral-400 block mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Track name"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City / venue"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, State ZIP"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Hours</label>
          <input
            type="text"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="e.g. Mon-Fri 4pm-10pm, Sat-Sun 10am-10pm"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Timing System</label>
          <input
            type="text"
            value={timingSystem}
            onChange={(e) => setTimingSystem(e.target.value)}
            placeholder="e.g. RC Scoring Pro, MyLaps, ZRound"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Surface Type</label>
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
          <label className="text-xs text-neutral-400 block mb-1">Tile Type</label>
          <input
            type="text"
            value={tileType}
            onChange={(e) => setTileType(e.target.value)}
            placeholder="e.g. RCP 30 cm smooth side up"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Dimensions</label>
          <input
            type="text"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="e.g. 12 ft × 24 ft"
            className={inputClass}
          />
        </div>

        {/* Layout Photo */}
        <LayoutPhotoSection
          trackId={trackId}
          pendingPhoto={pendingPhoto}
          onPendingPhoto={(blob, name) => {
            setPendingPhoto(blob);
            setPendingPhotoName(name);
          }}
        />

        <div>
          <label className="text-xs text-neutral-400 block mb-1">Layout Description</label>
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
        {onSave && <button
          onClick={() =>
            name.trim() &&
            onSave({
              name: name.trim(),
              location,
              address,
              phone,
              hours,
              timingSystem,
              surfaceType,
              tileType,
              dimensions,
              layoutDescription,
              notes,
              _pendingPhoto: pendingPhoto ?? undefined,
              _pendingPhotoName: pendingPhotoName || undefined,
            })
          }
          disabled={!name.trim() || saving}
          className="flex-1 rounded-md bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Update" : "Create"}
        </button>}
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
