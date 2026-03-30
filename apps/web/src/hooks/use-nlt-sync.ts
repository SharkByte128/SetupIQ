import { useState, useEffect, useCallback, useRef } from "react";
import { localDb, type LocalRaceResult } from "../db/local-db.js";
import { allCars } from "@setupiq/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const BASE_NLT_URL =
  "https://nextleveltiming.com/communities/piedmont-micro-rc-racing-club/races";
const POLL_INTERVAL_MS = 60_000; // 1 minute
const IDLE_TIMEOUT_MS = 60 * 60_000; // 60 minutes

interface NltRaceData {
  eventName: string;
  community: string;
  className: string;
  roundType: string;
  date: string;
  position: number;
  totalEntries?: number;
  totalLaps: number;
  totalTimeMs: number;
  fastLapMs: number;
  laps: { lapNumber: number; timeMs: number }[];
}

export interface NltSyncState {
  enabled: boolean;
  raceFolder: string;
  lastPollAt: string | null;
  lastNewDataAt: string | null;
  lastError: string | null;
  importedCount: number;
  updatedCount: number;
}

/**
 * Tries to match an NLT className to a car in the garage (predefined + custom).
 * Returns the carId or null if no match.
 */
async function matchCar(
  className: string,
): Promise<string | null> {
  const lower = className.toLowerCase();

  // Check predefined cars — exact or contains
  for (const car of allCars) {
    const carLower = car.name.toLowerCase();
    if (carLower === lower || lower.includes(carLower) || carLower.includes(lower)) {
      return car.id;
    }
  }

  // Check custom cars
  const customCars = await localDb.customCars.toArray();
  for (const car of customCars) {
    const carLower = car.name.toLowerCase();
    if (carLower === lower || lower.includes(carLower) || carLower.includes(lower)) {
      return car.id;
    }
  }

  return null;
}

export function useNltSync() {
  const [state, setState] = useState<NltSyncState>(() => ({
    enabled: false,
    raceFolder: localStorage.getItem("nlt_race_folder") ?? "",
    lastPollAt: null,
    lastNewDataAt: null,
    lastError: null,
    importedCount: 0,
    updatedCount: 0,
  }));

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNewDataRef = useRef<number>(Date.now());

  const pollOnce = useCallback(async (folder: string) => {
    const url = `${BASE_NLT_URL}/${folder}`;
    try {
      const res = await fetch(`${API_BASE}/api/nlt/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Poll failed" }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data: NltRaceData[] = await res.json();

      let imported = 0;
      let updated = 0;
      let hasNewData = false;

      for (const d of data) {
        // Only import results that match a car in the garage
        const carId = await matchCar(d.className);
        if (!carId) continue;

        // Dedup: check for existing result with same sourceUrl + className
        const existing = await localDb.raceResults
          .where("className")
          .equals(d.className)
          .filter((r) => r.sourceUrl === url)
          .first();

        if (existing) {
          // Update only if lap count or fast lap changed
          if (
            existing.totalLaps !== d.totalLaps ||
            existing.fastLapMs !== d.fastLapMs ||
            existing.totalTimeMs !== d.totalTimeMs
          ) {
            await localDb.raceResults.update(existing.id, {
              totalLaps: d.totalLaps,
              totalTimeMs: d.totalTimeMs,
              fastLapMs: d.fastLapMs,
              avgLapMs: d.totalLaps > 0 ? d.totalTimeMs / d.totalLaps : undefined,
              laps: d.laps,
              position: d.position,
              totalEntries: d.totalEntries,
              _dirty: 1 as const,
            });
            updated++;
            hasNewData = true;
          }
        } else {
          // New result
          const result: LocalRaceResult = {
            id: crypto.randomUUID(),
            userId: "local",
            carId,
            eventName: d.eventName,
            community: d.community || undefined,
            className: d.className,
            roundType: d.roundType,
            date: d.date,
            position: d.position,
            totalEntries: d.totalEntries,
            totalLaps: d.totalLaps,
            totalTimeMs: d.totalTimeMs,
            fastLapMs: d.fastLapMs,
            avgLapMs: d.totalLaps > 0 ? d.totalTimeMs / d.totalLaps : undefined,
            laps: d.laps,
            sourceUrl: url,
            createdAt: new Date().toISOString(),
            _dirty: 1,
          };
          await localDb.raceResults.add(result);
          imported++;
          hasNewData = true;
        }
      }

      const now = new Date().toISOString();
      if (hasNewData) {
        lastNewDataRef.current = Date.now();
      }

      setState((s) => ({
        ...s,
        lastPollAt: now,
        lastNewDataAt: hasNewData ? now : s.lastNewDataAt,
        lastError: null,
        importedCount: s.importedCount + imported,
        updatedCount: s.updatedCount + updated,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Poll failed";
      setState((s) => ({
        ...s,
        lastError: message,
        lastPollAt: new Date().toISOString(),
      }));
    }
  }, []);

  const enable = useCallback(
    (folder: string) => {
      if (!/^\d{4,8}$/.test(folder)) return;
      localStorage.setItem("nlt_race_folder", folder);
      lastNewDataRef.current = Date.now();
      setState((s) => ({
        ...s,
        enabled: true,
        raceFolder: folder,
        lastError: null,
        importedCount: 0,
        updatedCount: 0,
        lastPollAt: null,
        lastNewDataAt: null,
      }));
    },
    [],
  );

  const disable = useCallback(() => {
    setState((s) => ({ ...s, enabled: false }));
  }, []);

  const setRaceFolder = useCallback((folder: string) => {
    setState((s) => ({ ...s, raceFolder: folder }));
  }, []);

  // Polling effect
  useEffect(() => {
    if (!state.enabled || !state.raceFolder) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Poll immediately on enable
    pollOnce(state.raceFolder);

    intervalRef.current = setInterval(() => {
      // Check idle timeout — auto-disable if no new data for 60 min
      if (Date.now() - lastNewDataRef.current >= IDLE_TIMEOUT_MS) {
        setState((s) => ({ ...s, enabled: false }));
        return;
      }
      pollOnce(state.raceFolder);
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.enabled, state.raceFolder, pollOnce]);

  return { ...state, enable, disable, setRaceFolder };
}
