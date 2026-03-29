import { useState } from "react";
import { localDb, type LocalCustomCar } from "../db/local-db.js";
import { v4 as uuid } from "uuid";

interface AddCarPageProps {
  editCar?: LocalCustomCar;
  onSaved: (car: LocalCustomCar) => void;
  onCancel: () => void;
}

export function AddCarPage({ editCar, onSaved, onCancel }: AddCarPageProps) {
  const [name, setName] = useState(editCar?.name ?? "");
  const [manufacturer, setManufacturer] = useState(editCar?.manufacturer ?? "");
  const [scale, setScale] = useState(editCar?.scale ?? "1:28");
  const [driveType, setDriveType] = useState<"RWD" | "AWD" | "FWD">(
    editCar?.driveType ?? "RWD",
  );
  const [notes, setNotes] = useState(editCar?.notes ?? "");

  const handleSave = async () => {
    if (!name.trim()) return;

    const now = new Date().toISOString();
    const car: LocalCustomCar = {
      id: editCar?.id ?? uuid(),
      userId: "local",
      name: name.trim(),
      manufacturer: manufacturer.trim(),
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

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  const driveOptions: ("RWD" | "AWD" | "FWD")[] = ["RWD", "AWD", "FWD"];
  const scaleOptions = ["1:28", "1:27", "1:24", "1:18", "1:10"];
  const popularManufacturers = [
    "Kyosho",
    "GL Racing",
    "Atomic RC",
    "PN Racing",
    "NEXX Racing",
    "Reflex Racing",
  ];

  return (
    <div className="px-4 py-4">
      <h2 className="text-lg font-semibold mb-4">
        {editCar ? "Edit Car" : "Add Car"}
      </h2>

      <div className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">
            Car Name *
          </label>
          <input
            className={inputClass}
            placeholder="e.g. Kyosho MR-03 EVO"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Manufacturer */}
        <div>
          <label className="text-xs text-neutral-400 mb-1 block">
            Manufacturer
          </label>
          <input
            className={inputClass}
            placeholder="e.g. Kyosho"
            list="manufacturers"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          />
          <datalist id="manufacturers">
            {popularManufacturers.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
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
            disabled={!name.trim()}
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
