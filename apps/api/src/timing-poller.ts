import { db } from "./db/index.js";
import { raceResults } from "./db/schema.js";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";

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

interface ParsedLap {
  lapNumber: number;
  timeMs: number;
  streak?: number;
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

// ─── Time Parsing ─────────────────────────────────────────────

function parseTimeToMs(raw: string): number {
  raw = raw.trim();
  const parts = raw.split(":");
  if (parts.length === 2) {
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    return Math.round((min * 60 + sec) * 1000);
  }
  if (parts.length === 3) {
    const hr = Number(parts[0]);
    const min = Number(parts[1]);
    const sec = Number(parts[2]);
    return Math.round((hr * 3600 + min * 60 + sec) * 1000);
  }
  return Math.round(Number(raw) * 1000);
}

// ─── HTML Scraping ────────────────────────────────────────────

function parseRacerLaps(html: string, racerName: string): { laps: ParsedLap[]; totalLaps: number; elapsedMs: number; fastLapMs: number; position: number; date: string } {
  // Extract date
  let dateStr = new Date().toISOString();
  const dateMatch = html.match(/Date:\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})/i);
  if (dateMatch) {
    const cleaned = dateMatch[1].replace(/(st|nd|rd|th)/i, "");
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) dateStr = parsed.toISOString();
  }

  // Extract position and summary for this racer
  // Format: "1st MS Evo2 5600kv 99 33:47.856 0:06.904 99 Active"
  const nameEscaped = racerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const summaryRegex = new RegExp(
    `(\\d+)(?:st|nd|rd|th)\\s+${nameEscaped}\\s+(\\d+)\\s+([\\d:]+\\.\\d+)\\s+([\\d:]+\\.\\d+)`,
    "i"
  );
  const summaryMatch = summaryRegex.exec(html);

  const position = summaryMatch ? Number(summaryMatch[1]) : 1;
  const totalLaps = summaryMatch ? Number(summaryMatch[2]) : 0;
  const elapsedMs = summaryMatch ? parseTimeToMs(summaryMatch[3]) : 0;
  const fastLapMs = summaryMatch ? parseTimeToMs(summaryMatch[4]) : 0;

  // Parse individual laps: "N) M:SS.mmm" optionally followed by a streak number
  const laps: ParsedLap[] = [];
  const lapPattern = /(\d+)\)\s*([\d:.]+)\s*(\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = lapPattern.exec(html)) !== null) {
    laps.push({
      lapNumber: Number(match[1]),
      timeMs: parseTimeToMs(match[2]),
      streak: match[3] ? Number(match[3]) : undefined,
    });
  }
  laps.sort((a, b) => a.lapNumber - b.lapNumber);

  return { laps, totalLaps: totalLaps || laps.length, elapsedMs, fastLapMs, position, date: dateStr };
}

// ─── Fetch + Dedup + Store ────────────────────────────────────

async function fetchAndStore(config: NltPollerConfig): Promise<{ newLaps: number; totalLaps: number }> {
  const res = await fetch(config.raceUrl, {
    headers: {
      "User-Agent": "SetupIQ/1.0 (NLT timing poller)",
      "Accept": "text/html",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`NLT returned HTTP ${res.status}`);
  }

  const html = await res.text();
  const { laps, totalLaps, elapsedMs, fastLapMs, position, date } = parseRacerLaps(html, config.racerName);

  if (laps.length === 0) {
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

  const storedLapCount = existing.length > 0 ? (existing[0].laps as ParsedLap[]).length : 0;
  const newLapCount = laps.length - storedLapCount;

  // Extract community + event name from URL
  const communityMatch = config.raceUrl.match(/\/communities\/([^/]+)/);
  const communitySlug = communityMatch?.[1]?.replace(/-/g, " ") ?? "";
  const community = communitySlug.replace(/\b\w/g, (c) => c.toUpperCase());
  const eventName = `NLT ${date.slice(0, 10)}`;

  const avgLapMs = laps.length > 0
    ? Math.round(laps.reduce((s, l) => s + l.timeMs, 0) / laps.length)
    : 0;

  const record = {
    carId: config.carId,
    eventName,
    community,
    className: config.racerName,
    roundType: "practice" as const,
    date,
    position,
    totalLaps,
    totalTimeMs: elapsedMs,
    fastLapMs: fastLapMs || Math.min(...laps.map((l) => l.timeMs)),
    avgLapMs,
    laps: laps.map((l) => ({ lapNumber: l.lapNumber, timeMs: l.timeMs })),
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

  return { newLaps: Math.max(newLapCount, 0), totalLaps: laps.length };
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
