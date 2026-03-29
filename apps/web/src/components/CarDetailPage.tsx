import { useState, useEffect, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCarById } from "@setupiq/shared";
import { localDb } from "../db/local-db.js";
import { SetupsPage } from "./SetupsPage.js";
import { resizeImage } from "../lib/resize-image.js";
import { v4 as uuid } from "uuid";

type Tab = "setup" | "details";

interface CarDetailPageProps {
  carId: string;
  onBack: () => void;
}

/** Count total laps for a car across run segments and race results. */
async function countTotalLaps(carId: string): Promise<number> {
  // Laps from run sessions → segments
  const sessions = await localDb.runSessions.where("carId").equals(carId).toArray();
  let laps = 0;
  for (const session of sessions) {
    const segments = await localDb.runSegments.where("sessionId").equals(session.id).toArray();
    for (const seg of segments) {
      laps += seg.lapTimes?.length ?? 0;
    }
  }
  // Laps from race results
  const races = await localDb.raceResults.where("carId").equals(carId).toArray();
  for (const race of races) {
    laps += race.totalLaps ?? 0;
  }
  return laps;
}

export function CarDetailPage({ carId, onBack }: CarDetailPageProps) {
  const [tab, setTab] = useState<Tab>("setup");
  const [totalLaps, setTotalLaps] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve car definition — predefined or custom
  const predefined = getCarById(carId);
  const customCar = useLiveQuery(() =>
    predefined ? undefined : localDb.customCars.get(carId),
    [carId],
  );

  const carName = predefined?.name ?? customCar?.name ?? "Unknown Car";
  const manufacturer = predefined?.manufacturer ?? customCar?.manufacturer ?? "";
  const scale = predefined?.scale ?? customCar?.scale ?? "";
  const driveType = predefined?.driveType ?? customCar?.driveType ?? "";
  const isCustom = !predefined;

  // Load car image
  useEffect(() => {
    let cancelled = false;
    localDb.carImages.where("carId").equals(carId).first().then((img) => {
      if (cancelled) return;
      setImageUrl(img ? URL.createObjectURL(img.blob) : null);
    });
    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId]);

  // Count laps
  useEffect(() => {
    countTotalLaps(carId).then(setTotalLaps);
  }, [carId]);

  // ─── Details tab state ──────────────────────────────
  const [editName, setEditName] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editScale, setEditScale] = useState("");
  const [editDriveType, setEditDriveType] = useState<"RWD" | "AWD" | "FWD">("RWD");
  const [editNotes, setEditNotes] = useState("");
  const [detailsDirty, setDetailsDirty] = useState(false);

  // Sync edit fields when customCar loads
  useEffect(() => {
    if (customCar) {
      setEditName(customCar.name);
      setEditManufacturer(customCar.manufacturer);
      setEditScale(customCar.scale);
      setEditDriveType(customCar.driveType);
      setEditNotes(customCar.notes ?? "");
    }
  }, [customCar]);

  const handlePhotoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const resized = await resizeImage(file, 400);
      const existing = await localDb.carImages.where("carId").equals(carId).first();
      if (existing) await localDb.carImages.delete(existing.id);
      await localDb.carImages.put({
        id: uuid(),
        carId,
        blob: resized,
        name: file.name,
        mimeType: resized.type || file.type,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _dirty: 1,
      });
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(resized));
      e.target.value = "";
    },
    [carId, imageUrl],
  );

  const handleSaveDetails = useCallback(async () => {
    if (!customCar) return;
    await localDb.customCars.update(carId, {
      name: editName.trim() || customCar.name,
      manufacturer: editManufacturer.trim(),
      scale: editScale.trim() || "1:28",
      driveType: editDriveType,
      notes: editNotes.trim() || undefined,
      updatedAt: new Date().toISOString(),
      _dirty: 1 as const,
    });
    setDetailsDirty(false);
  }, [carId, customCar, editName, editManufacturer, editScale, editDriveType, editNotes]);

  const handleDeleteCar = useCallback(async () => {
    if (!confirm("Delete this car and all its setups?")) return;
    // Remove setups
    const setups = await localDb.setupSnapshots.where("carId").equals(carId).toArray();
    await localDb.setupSnapshots.bulkDelete(setups.map((s) => s.id));
    // Remove image
    const img = await localDb.carImages.where("carId").equals(carId).first();
    if (img) await localDb.carImages.delete(img.id);
    // Remove custom car record
    await localDb.customCars.delete(carId);
    onBack();
  }, [carId, onBack]);

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="px-4 pt-3 pb-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
          ← Back to Garage
        </button>
      </div>

      {/* Car banner: image + name + laps */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-neutral-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt={carName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-neutral-600">🏎️</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{carName}</p>
          <p className="text-xs text-neutral-500">{manufacturer} · {scale} {driveType}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{totalLaps.toLocaleString()} total laps</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 flex gap-1 border-b border-neutral-800">
        {(["setup", "details"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "setup" && <SetupsPage forcedCarId={carId} />}

        {tab === "details" && (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Photo */}
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Photo</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {imageUrl ? "Change photo" : "Add photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            {isCustom && customCar ? (
              <>
                {/* Editable fields for custom cars */}
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Car Name</label>
                  <input
                    className={inputClass}
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Manufacturer</label>
                  <input
                    className={inputClass}
                    value={editManufacturer}
                    onChange={(e) => { setEditManufacturer(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Scale</label>
                  <input
                    className={inputClass}
                    value={editScale}
                    onChange={(e) => { setEditScale(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Drive Type</label>
                  <div className="flex gap-2">
                    {(["RWD", "AWD", "FWD"] as const).map((dt) => (
                      <button
                        key={dt}
                        onClick={() => { setEditDriveType(dt); setDetailsDirty(true); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          editDriveType === dt
                            ? "bg-blue-600 text-white"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                      >
                        {dt}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
                  <textarea
                    className={inputClass + " min-h-[80px]"}
                    value={editNotes}
                    onChange={(e) => { setEditNotes(e.target.value); setDetailsDirty(true); }}
                  />
                </div>

                {/* Save */}
                {detailsDirty && (
                  <button
                    onClick={handleSaveDetails}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                  >
                    Save Changes
                  </button>
                )}

                {/* Danger zone */}
                <div className="mt-6 border-t border-neutral-800 pt-4">
                  <p className="text-xs text-neutral-500 mb-2">Danger Zone</p>
                  <button
                    onClick={handleDeleteCar}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Delete Car
                  </button>
                </div>
              </>
            ) : (
              /* Read-only info for predefined cars */
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-neutral-500">Name</p>
                  <p className="text-sm">{carName}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Manufacturer</p>
                  <p className="text-sm">{manufacturer}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Scale</p>
                  <p className="text-sm">{scale}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Drive Type</p>
                  <p className="text-sm">{driveType}</p>
                </div>
                <p className="text-xs text-neutral-600 mt-2">
                  Built-in cars cannot be renamed or deleted.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
