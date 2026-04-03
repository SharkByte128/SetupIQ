import { useState, useEffect } from "react";
import { localDb } from "../db/local-db.js";
import { allCars } from "@setupiq/shared";

/** Set of predefined car IDs from the shared package. */
const PREDEFINED_CAR_IDS = new Set(allCars.map((c) => c.id));

/** Read the "hide demo data" preference from syncMeta. */
export function useHideDemoData(): boolean {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    localDb.syncMeta.get("hide_demo_data").then((row) => {
      if (row?.value === "true") setHide(true);
    });
  }, []);

  return hide;
}

/** Returns true if a car ID belongs to a built-in / predefined car. */
export function isPredefinedCar(carId: string): boolean {
  return PREDEFINED_CAR_IDS.has(carId);
}

/**
 * Returns true if a record is "demo/seed data" that should be hidden
 * when the user has enabled "Hide Demo Data" or treated as read-only.
 *
 * Seed data = userId "local" AND _dirty 0 (pre-seeded, never user-modified).
 * User-created offline records also have userId "local" but _dirty 1,
 * so they are NOT considered demo data and are freely editable.
 * Synced records have a real UUID for userId regardless of _dirty.
 */
export function isDemoRecord(record: { userId?: string; _dirty?: number }): boolean {
  return record.userId === "local" && (record._dirty ?? 0) === 0;
}

/**
 * Returns the current sync username from syncMeta (lowercase).
 * Used to check if the current user is the demo data owner.
 */
export async function getSyncUsername(): Promise<string | null> {
  const row = await localDb.syncMeta.get("sync_username");
  return row?.value?.toLowerCase() ?? null;
}

/** Read the "show hidden runs" preference from localStorage. */
export function useShowHiddenRuns(): [boolean, (v: boolean) => void] {
  const [show, setShow] = useState(() => localStorage.getItem("show_hidden_runs") === "true");
  const toggle = (v: boolean) => {
    localStorage.setItem("show_hidden_runs", v ? "true" : "false");
    setShow(v);
  };
  return [show, toggle];
}
