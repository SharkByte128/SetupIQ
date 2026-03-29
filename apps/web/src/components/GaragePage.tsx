import { useState, useEffect, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { allCars } from "@setupiq/shared";
import type { CarDefinition } from "@setupiq/shared";
import { localDb, type LocalCarImage, type LocalCustomCar } from "../db/local-db.js";
import { SetupsPage } from "./SetupsPage.js";
import { PartsBinPage } from "./PartsBinPage.js";
import { AddCarPage } from "./AddCarPage.js";
import { resizeImage } from "../lib/resize-image.js";
import { v4 as uuid } from "uuid";

type GarageView = "cars" | "setups" | "parts" | "addCar" | "editCar";

/** Unified shape for displaying both predefined and custom cars. */
type GarageCar =
  | { kind: "predefined"; car: CarDefinition }
  | { kind: "custom"; car: LocalCustomCar };

export function GaragePage() {
  const [garageView, setGarageView] = useState<GarageView>("cars");
  const [selectedCar, setSelectedCar] = useState<CarDefinition | null>(null);
  const [editingCustomCar, setEditingCustomCar] = useState<LocalCustomCar | undefined>();
  const [images, setImages] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetCarId, setUploadTargetCarId] = useState<string | null>(null);

  // Live-query custom cars from Dexie
  const customCars = useLiveQuery(() => localDb.customCars.toArray()) ?? [];

  // Merge predefined + custom into unified list
  const garageCars: GarageCar[] = [
    ...allCars.map((car): GarageCar => ({ kind: "predefined", car })),
    ...customCars.map((car): GarageCar => ({ kind: "custom", car })),
  ];

  // Load thumbnail URLs from IndexedDB
  useEffect(() => {
    let cancelled = false;
    async function loadImages() {
      const all = await localDb.carImages.toArray();
      if (cancelled) return;
      const urls: Record<string, string> = {};
      for (const img of all) {
        urls[img.carId] = URL.createObjectURL(img.blob);
      }
      setImages(urls);
    }
    loadImages();
    return () => {
      cancelled = true;
      // Revoke old object URLs
      Object.values(images).forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUploadClick = useCallback((carId: string) => {
    setUploadTargetCarId(carId);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !uploadTargetCarId) return;

      // Resize to thumbnail (max 400px) to save IndexedDB space
      const resized = await resizeImage(file, 400);

      // Remove old image for this car if it exists
      const existing = await localDb.carImages.where("carId").equals(uploadTargetCarId).first();
      if (existing) {
        await localDb.carImages.delete(existing.id);
      }

      const record: LocalCarImage = {
        id: uuid(),
        carId: uploadTargetCarId,
        blob: resized,
        name: file.name,
        createdAt: new Date().toISOString(),
      };
      await localDb.carImages.put(record);

      // Update displayed image
      setImages((prev) => {
        if (prev[uploadTargetCarId]) URL.revokeObjectURL(prev[uploadTargetCarId]);
        return { ...prev, [uploadTargetCarId]: URL.createObjectURL(resized) };
      });

      // Reset input so the same file can be re-selected
      e.target.value = "";
      setUploadTargetCarId(null);
    },
    [uploadTargetCarId],
  );

  // If a car is selected, show its setup page
  if (selectedCar) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-2">
          <button
            onClick={() => { setSelectedCar(null); setGarageView("cars"); }}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            ← Back to Garage
          </button>
        </div>
        <SetupsPage forcedCarId={selectedCar.id} />
      </div>
    );
  }

  // Parts Bin view
  if (garageView === "parts") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-2">
          <button
            onClick={() => setGarageView("cars")}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            ← Back to Garage
          </button>
        </div>
        <PartsBinPage />
      </div>
    );
  }

  // Add / Edit Car views
  if (garageView === "addCar" || garageView === "editCar") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-2">
          <button
            onClick={() => { setGarageView("cars"); setEditingCustomCar(undefined); }}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            ← Back to Garage
          </button>
        </div>
        <AddCarPage
          editCar={editingCustomCar}
          onSaved={() => { setGarageView("cars"); setEditingCustomCar(undefined); }}
          onCancel={() => { setGarageView("cars"); setEditingCustomCar(undefined); }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-xl font-semibold mb-4">Garage</h2>

      {/* Parts Bin button */}
      <button
        onClick={() => setGarageView("parts")}
        className="w-full mb-4 bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 flex items-center justify-between hover:border-neutral-600 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🗃️</span>
          <div className="text-left">
            <p className="font-medium text-sm">Parts Bin</p>
            <p className="text-xs text-neutral-500">Browse & manage parts by vendor</p>
          </div>
        </div>
        <span className="text-neutral-500 text-sm">→</span>
      </button>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {garageCars.map((gc) => {
          const carId = gc.car.id;
          const carName = gc.car.name;
          const manufacturer = gc.car.manufacturer;
          const scale = gc.car.scale;
          const driveType = gc.car.driveType;

          return (
            <div
              key={carId}
              className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col"
            >
              {/* Thumbnail */}
              <button
                onClick={() => {
                  if (gc.kind === "predefined") {
                    setSelectedCar(gc.car);
                  }
                }}
                className="relative aspect-[4/3] bg-neutral-800 flex items-center justify-center overflow-hidden group"
              >
                {images[carId] ? (
                  <img
                    src={images[carId]}
                    alt={carName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="text-neutral-600 text-3xl">🏎️</div>
                )}
              </button>

              {/* Info + actions */}
              <div className="p-3 flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (gc.kind === "predefined") {
                      setSelectedCar(gc.car);
                    }
                  }}
                  className="text-left"
                >
                  <p className="font-medium text-sm leading-tight">{carName}</p>
                  <p className="text-xs text-neutral-500">{manufacturer} · {scale} {driveType}</p>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUploadClick(carId);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 text-left"
                  >
                    {images[carId] ? "Change photo" : "Add photo"}
                  </button>
                  {gc.kind === "custom" && (
                    <>
                      <span className="text-neutral-700">·</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCustomCar(gc.car);
                          setGarageView("editCar");
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Edit
                      </button>
                      <span className="text-neutral-700">·</span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await localDb.customCars.delete(gc.car.id);
                          // Also remove image if exists
                          const img = await localDb.carImages.where("carId").equals(gc.car.id).first();
                          if (img) await localDb.carImages.delete(img.id);
                        }}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Car card */}
        <button
          onClick={() => setGarageView("addCar")}
          className="bg-neutral-900 border border-dashed border-neutral-700 rounded-lg overflow-hidden flex flex-col items-center justify-center aspect-auto min-h-[160px] hover:border-neutral-500 transition-colors group"
        >
          <span className="text-3xl text-neutral-600 group-hover:text-neutral-400 transition-colors">+</span>
          <span className="text-sm text-neutral-500 group-hover:text-neutral-300 mt-1 transition-colors">Add Car</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
