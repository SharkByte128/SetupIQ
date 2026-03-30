import { db } from "./db/index.js";
import { raceResults } from "./db/schema.js";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { fetchNltRaceData, type NltRaceData } from "./nlt/routes.js";

// ─── Types ────────────────────────────────────────────────────

export interface NltPollerConfig {
  /** Full URL to the NLT race page */
  raceUrl: string;
  /** Racer name to track on the page */
  racerName: string;
  /** Car ID to associate with stored results */
  carId: string;
  /** Setup snapshot ID to link to this run */
  setupSnapshotId?: string;
  /** User ID for database ownership */
  userId: string;
}

interface PollerState {
  config: NltPollerConfig;
  intervalId: ReturnType<typeof setInterval> | null;
  lastLapCount: number;
  lastActivityAt: number;
  snoozed: boolean;
}

// ─── Constants ────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2 * 60 * 1000;       // 2 minutes
const SNOOZE_THRESHOLD_MS = 90 * 60 * 1000;   // 90 minutes of no new laps

// Singleton poller state
let pollerState: PollerState | null = null;

// ─── Fetch + Dedup + Store ────────────────────────────────────

async function fetchAndStore(config: NltPollerConfig): Promise<{ newLaps: number; totalLaps: number }> {
  const allResults = await fetchNltRaceData(config.raceUrl);

  // Find the specific racer
  const racerData = allResults.find(
    (r) => r.className.toLowerCase() === config.racerName.toLowerCase()
  );

  if (!racerData || racerData.laps.length === 0) {
    return { newLaps: 0, totalLaps: 0 };
  }

  // Build a stable source key from the race URL to deduplicate
  const sourceUrl = config.raceUrl;

  // Check for existing record for this race URL + user
  const existing = await db
    .select()
    .from(raceResults)
    .where(and(eq(raceResults.userId, config.userId), eq(raceResults.sourceUrl, sourceUrl)))
    .limit(1);

  const storedLapCount = existing.length > 0 ? (existing[0].laps as { lapNumber: number; timeMs: number }[]).length : 0;
  const newLapCount = racerData.laps.length - storedLapCount;

  const avgLapMs = racerData.laps.length > 0
    ? Math.round(racerData.laps.reduce((s, l) => s + l.timeMs, 0) / racerData.laps.length)
    : 0;

  const record = {
    carId: config.carId,
    eventName: racerData.eventName,
    community: racerData.community,
    className: racerData.className,
    roundType: racerData.roundType,
    date: racerData.date,
    position: racerData.position,
    totalLaps: racerData.totalLaps,
    totalTimeMs: racerData.totalTimeMs,
    fastLapMs: racerData.fastLapMs,
    avgLapMs,
    laps: racerData.laps,
    sourceUrl,
    setupSnapshotId: config.setupSnapshotId ?? null,
    notes: `Auto-imported from NLT poller`,
  };

  if (existing.length > 0) {
    // Update in place — only if there are new laps
    if (newLapCount > 0) {
      await db
        .update(raceResults)
        .set(record)
        .where(eq(raceResults.id, existing[0].id));
    }
  } else {
    // Insert new record
    await db.insert(raceResults).values({
      id: crypto.randomUUID(),
      userId: config.userId,
      ...record,
    });
  }

  return { newLaps: Math.max(newLapCount, 0), totalLaps: racerData.laps.length };
}

// ─── Poll Tick ────────────────────────────────────────────────

async function pollTick(): Promise<void> {
  if (!pollerState || pollerState.snoozed) return;

  try {
    const { newLaps, totalLaps } = await fetchAndStore(pollerState.config);

    if (newLaps > 0) {
      pollerState.lastLapCount = totalLaps;
      pollerState.lastActivityAt = Date.now();
      console.log(`[NLT Poller] ${newLaps} new laps (total: ${totalLaps})`);
    } else {
      // Check snooze threshold
      const idle = Date.now() - pollerState.lastActivityAt;
      if (idle >= SNOOZE_THRESHOLD_MS) {
        pollerState.snoozed = true;
        if (pollerState.intervalId) {
          clearInterval(pollerState.intervalId);
          pollerState.intervalId = null;
        }
        console.log("[NLT Poller] No activity for 90 min — snoozed. Trigger from app to resume.");
      } else {
        console.log(`[NLT Poller] No new laps. Idle ${Math.round(idle / 60000)}m / 90m`);
      }
    }
  } catch (err) {
    console.error("[NLT Poller] Error:", err instanceof Error ? err.message : err);
  }
}

// ─── Public API ───────────────────────────────────────────────

export function startNltPoller(config: NltPollerConfig): void {
  // Stop any existing poller
  stopNltPoller();

  pollerState = {
    config,
    intervalId: null,
    lastLapCount: 0,
    lastActivityAt: Date.now(),
    snoozed: false,
  };

  // Run immediately, then every 2 min
  pollTick();
  pollerState.intervalId = setInterval(pollTick, POLL_INTERVAL_MS);
  console.log(`[NLT Poller] Started — polling ${config.raceUrl} every 2 min`);
}

export function stopNltPoller(): void {
  if (pollerState?.intervalId) {
    clearInterval(pollerState.intervalId);
  }
  pollerState = null;
  console.log("[NLT Poller] Stopped");
}

export function triggerNltPoller(): boolean {
  if (!pollerState) return false;
  pollerState.snoozed = false;
  pollerState.lastActivityAt = Date.now();

  // Restart interval if it was cleared during snooze
  if (!pollerState.intervalId) {
    pollTick();
    pollerState.intervalId = setInterval(pollTick, POLL_INTERVAL_MS);
  }
  console.log("[NLT Poller] Triggered — resumed polling");
  return true;
}

export function getNltPollerStatus(): { active: boolean; snoozed: boolean; lastLapCount: number; lastActivityAt: number; raceUrl?: string; racerName?: string } {
  if (!pollerState) {
    return { active: false, snoozed: false, lastLapCount: 0, lastActivityAt: 0 };
  }
  return {
    active: pollerState.intervalId !== null,
    snoozed: pollerState.snoozed,
    lastLapCount: pollerState.lastLapCount,
    lastActivityAt: pollerState.lastActivityAt,
    raceUrl: pollerState.config.raceUrl,
    racerName: pollerState.config.racerName,
  };
}
