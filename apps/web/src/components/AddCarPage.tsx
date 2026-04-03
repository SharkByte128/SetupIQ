import { useState } from "react";
import { localDb, type LocalCustomCar } from "../db/local-db.js";
import { chassisPlatforms, getChassisPlatformById } from "@setupiq/shared";
import { v4 as uuid } from "uuid";

interface AddCarPageProps {
  editCar?: LocalCustomCar;
  onSaved: (car: LocalCustomCar) => void;
  onCancel: () => void;
}

export function AddCarPage({ editCar, onSaved, onCancel }: AddCarPageProps) {
  const [chassisId, setChassisId] = useState(editCar?.chassisId ?? "");
  const [name, setName] = useState(editCar?.name ?? "");
  const [scale, setScale] = useState(editCar?.scale ?? "1:28");
  const [driveType, setDriveType] = useState<"RWD" | "AWD" | "FWD">(
    editCar?.driveType ?? "RWD",
  );
  const [notes, setNotes] = useState(editCar?.notes ?? "");

  const selectedChassis = chassisId ? getChassisPlatformById(chassisId) : undefined;

  const handleChassisChange = (id: string) => {
    setChassisId(id);
    const cp = getChassisPlatformById(id);
    if (cp) {
      setScale(cp.scale);
      setDriveType(cp.driveType);
      if (!name.trim() || chassisPlatforms.some((c) => c.name === name.trim())) {
        setName(cp.name);
      }
    }
  };

  const handleSave = async () => {
    if (!chassisId) return;

    const chassis = getChassisPlatformById(chassisId);
    const now = new Date().toISOString();
    const car: LocalCustomCar = {
      id: editCar?.id ?? uuid(),
      userId: "local",
      name: name.trim() || chassis?.name || "Unnamed Car",
      chassisId,
      manufacturer: chassis?.manufacturer ?? "Other",
      scale: scale.trim() || "1:28",
      driveType,
      notes: notes.trim() || undefined,
      createdAt: editCar?.createdAt ?? now,
      updatedAt: now,
      _dirty: 1 as const,
    };

    await localDb.customCars.put(car);
    onSaved(car);
  };

  // Group chassis models by manufacturer for the selector
  const chassisByManufacturer = chassisPlatforms.reduce<Record<string, typeof chassisPlatforms>>((acc, cp) => {
    (acc[cp.manufacturer] ??= []).push(cp);
    return acc;
  }, {});

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  const driveOptions: ("RWD" | "AWD" | "FWD")[] = ["RWD", "AWD", "FWD"];
  const scaleOptions = ["1:28", "1:27", "1:24", "1:18", "1:10"];

  return (
    <div className="px-4 py-4">
      <h2 className="text-lg font-semibold mb-4">
        {editCar ? "Edit Car" : "Add Car"}
      </h2>

      <div className="flex flex-col gap-4">
        {/* Chassis Model — primary selector */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">
            Chassis Model *
          </label>
          <select
            className={inputClass}
            value={chassisId}
            onChange={(e) => handleChassisChange(e.target.value)}
          >
            <option value="">Select a chassis model…</option>
            {Object.entries(chassisByManufacturer).map(([mfr, models]) => (
              <optgroup key={mfr} label={mfr}>
                {models.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.name} — {cp.scale} {cp.driveType}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedChassis && (
            <p className="text-xs text-neutral-500 mt-1">
              {selectedChassis.manufacturer} · {selectedChassis.scale} · {selectedChassis.driveType}
            </p>
          )}
        </div>

        {/* Build Name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">
            Build Name
          </label>
          <input
            className={inputClass}
            placeholder="e.g. Competition Build, Practice Car…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-xs text-neutral-600 mt-1">
            Give this build a custom name, or leave as the chassis name.
          </p>
        </div>

        {/* Scale */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">Scale</label>
          <div className="flex flex-wrap gap-2">
            {scaleOptions.map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  scale === s
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Drive Type */}
        <div>
          <label className="text-xs text-neutral-400 mb-2 block">
            Drive Type
          </label>
          <div className="flex gap-2">
            {driveOptions.map((dt) => (
              <button
                key={dt}
                onClick={() => setDriveType(dt)}
                className={`flex-1 text-sm py-2 rounded-lg border transition-colors font-medium ${
                  driveType === dt
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {dt}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
          <textarea
            className={inputClass + " min-h-[60px] resize-y"}
            placeholder="Any details about this build..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={!chassisId}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-3 rounded-lg transition-colors"
          >
            {editCar ? "Save Changes" : "Add Car"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
