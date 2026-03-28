import { useState, useEffect, useCallback, useRef } from "react";
import { allCars } from "@setupiq/shared";
import type { CarDefinition } from "@setupiq/shared";
import { localDb, type LocalCarImage } from "../db/local-db.js";
import { SetupsPage } from "./SetupsPage.js";
import { v4 as uuid } from "uuid";

export function GaragePage() {
  const [selectedCar, setSelectedCar] = useState<CarDefinition | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetCarId, setUploadTargetCarId] = useState<string | null>(null);

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
            onClick={() => setSelectedCar(null)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            ← Back to Garage
          </button>
        </div>
        <SetupsPage forcedCarId={selectedCar.id} />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-xl font-semibold mb-4">Garage</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {allCars.map((car) => (
          <div
            key={car.id}
            className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col"
          >
            {/* Thumbnail */}
            <button
              onClick={() => setSelectedCar(car)}
              className="relative aspect-[4/3] bg-neutral-800 flex items-center justify-center overflow-hidden group"
            >
              {images[car.id] ? (
                <img
                  src={images[car.id]}
                  alt={car.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="text-neutral-600 text-3xl">🏎️</div>
              )}
            </button>

            {/* Info + actions */}
            <div className="p-3 flex flex-col gap-2">
              <button
                onClick={() => setSelectedCar(car)}
                className="text-left"
              >
                <p className="font-medium text-sm leading-tight">{car.name}</p>
                <p className="text-xs text-neutral-500">{car.manufacturer} · {car.scale} {car.driveType}</p>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUploadClick(car.id);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 text-left"
              >
                {images[car.id] ? "Change photo" : "Add photo"}
              </button>
            </div>
          </div>
        ))}
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

/** Resize an image file to fit within maxSize px, returns a Blob. */
async function resizeImage(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob!),
        "image/webp",
        0.8,
      );
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}
