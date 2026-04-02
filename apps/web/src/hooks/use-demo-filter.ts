import { useState, useEffect } from "react";
import { localDb } from "../db/local-db.js";
import { allCars } from "@setupiq/shared";

/** Set of predefined car IDs from the shared package. */
const PREDEFINED_CAR_IDS = new Set(allCars.map((c) => c.id));

/** The username that owns demo/built-in data and may edit it. */
export const DEMO_DATA_OWNER = "sharkbyte128";

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

/**
 * Returns true if the current sync user is the demo data owner.
 * Non-connected users return false (they can view but not edit demo data).
 */
export function useIsDemoDataOwner(): boolean {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    localDb.syncMeta.get("sync_username").then((row) => {
      setIsOwner(row?.value?.toLowerCase() === DEMO_DATA_OWNER);
    });
  }, []);

  return isOwner;
}

/** Returns true if a car ID belongs to a built-in / predefined car. */
export function isPredefinedCar(carId: string): boolean {
  return PREDEFINED_CAR_IDS.has(carId);
}

/**
 * Returns true if a record is "demo data" that should be hidden
 * when the user has enabled "Hide Demo Data".
 *
 * Demo data = userId "local" (seed data that hasn't been synced yet).
 * Once synced (userId is a real user UUID), data is owned by that user
 * and is no longer considered demo regardless of carId.
 */
export function isDemoRecord(record: { userId?: string; carId?: string }): boolean {
  return record.userId === "local";
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
