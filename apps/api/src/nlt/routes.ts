import type { FastifyInstance } from "fastify";

// ─── NLT JSON API Types ──────────────────────────────────────

interface NltApiParticipant {
  id: number;
  rank: number;
  community_id: number;
  race_id: number;
  class_id: number | null;
  racer_name: string;
  elapsed_time: number;   // ms
  laps: number;
  fast_lap: number;       // ms
  status: string;
  racer_class: { name: string } | null;
  created_at: string;
  updated_at: string;
}

interface NltApiEvent {
  id: number;
  type: string;           // "race_started" | "racer_passed_gate"
  race_id: number;
  race_participant_id: number | null;
  race_time: number;      // cumulative ms from race start
  created_at: string;
  deleted_at: string | null;
}

interface NltApiRace {
  id: number;
  community_id: number;
  name: string;
  status: string;
  mode: string;
  started_at: string;
  completed_at: string | null;
  participants: NltApiParticipant[];
  events: NltApiEvent[];
}

// ─── Public result type ──────────────────────────────────────

export interface NltRaceData {
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

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Extract the race ID from a nextleveltiming.com URL.
 * Supports: /communities/.../races/171034 or /api/races/171034
 */
function extractRaceId(url: string): number | null {
  const match = url.match(/\/races\/(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Compute individual lap times from cumulative gate-pass events.
 */
function eventsToLaps(events: NltApiEvent[], participantId: number): { lapNumber: number; timeMs: number }[] {
  const gates = events
    .filter((e) => e.type === "racer_passed_gate" && e.race_participant_id === participantId && !e.deleted_at)
    .sort((a, b) => a.race_time - b.race_time);

  // First gate pass is the start reference (transponder detection), not a lap.
  // Laps are measured from the 2nd gate pass onward.
  const laps: { lapNumber: number; timeMs: number }[] = [];
  for (let i = 1; i < gates.length; i++) {
    laps.push({
      lapNumber: i,
      timeMs: gates[i].race_time - gates[i - 1].race_time,
    });
  }
  return laps;
}

/**
 * Fetch race data from the NLT JSON API and return structured results.
 */
export async function fetchNltRaceData(url: string): Promise<NltRaceData[]> {
  const raceId = extractRaceId(url);
  if (!raceId) throw new Error("Could not extract race ID from URL");

  // Extract community slug from URL for display
  const communityMatch = url.match(/\/communities\/([^/]+)/);
  const communitySlug = communityMatch?.[1]?.replace(/-/g, " ") ?? "";
  const community = communitySlug.replace(/\b\w/g, (c) => c.toUpperCase());

  const apiUrl = `https://nextleveltiming.com/api/races/${raceId}`;
  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "SetupIQ/1.0 (RC race result import)",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`NLT API returned HTTP ${res.status}`);
  }

  const json = await res.json() as { data: NltApiRace };
  const race = json.data;

  // Determine round type from mode
  let roundType = "custom";
  const mode = (race.mode ?? "").toLowerCase();
  if (mode === "practice") roundType = "practice";
  else if (mode.includes("qualif")) roundType = "qualifying";
  else if (mode.includes("main") || mode.includes("final")) roundType = "main";

  const eventName = race.name || "Race";
  const dateStr = race.started_at || new Date().toISOString();
  const totalEntries = race.participants.length;

  const results: NltRaceData[] = [];

  for (const p of race.participants) {
    const laps = eventsToLaps(race.events, p.id);

    results.push({
      eventName,
      community,
      className: p.racer_name,
      roundType,
      date: dateStr,
      position: p.rank,
      totalEntries,
      totalLaps: p.laps,
      totalTimeMs: p.elapsed_time,
      fastLapMs: p.fast_lap,
      laps,
    });
  }

  return results;
}

// ─── Route registration ──────────────────────────────────────

export async function registerNltRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { url: string } }>("/api/nlt/scrape", {
    schema: {
      body: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { url } = request.body;

    // Validate URL is from nextleveltiming.com
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reply.status(400).send({ error: "Invalid URL" });
    }

    if (parsed.hostname !== "nextleveltiming.com" && parsed.hostname !== "www.nextleveltiming.com") {
      return reply.status(400).send({ error: "URL must be from nextleveltiming.com" });
    }

    try {
      const data = await fetchNltRaceData(url);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      return reply.status(502).send({ error: message });
    }
  });
}
