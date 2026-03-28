import type { FastifyInstance } from "fastify";

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

/**
 * Parses a time string like "27662:01.919" or "0:07.236" into milliseconds.
 * Supports formats: "MM:SS.mmm", "SS.mmm", "H:MM:SS.mmm"
 */
function parseTimeToMs(raw: string): number {
  raw = raw.trim();
  // Handle "M:SS.mmm" or "MM:SS.mmm" or "HH:MM:SS.mmm"
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
  // Plain seconds
  return Math.round(Number(raw) * 1000);
}

/**
 * Scrapes a Next Level Timing race page and returns structured results.
 *
 * NLT page structure (from observed HTML):
 * - Race metadata in a table or header area (date, format, mode, etc.)
 * - Results table with: Position, Racer, Laps, Elapsed, Fast Lap, Pace, Status
 * - Per-racer lap breakdown: "N) M:SS.mmm" lines
 */
function parseNltHtml(html: string, url: string): NltRaceData[] {
  const results: NltRaceData[] = [];

  // Extract community name from URL path
  const communityMatch = url.match(/\/communities\/([^/]+)/);
  const communitySlug = communityMatch?.[1]?.replace(/-/g, " ") ?? "";
  const community = communitySlug.replace(/\b\w/g, (c) => c.toUpperCase());

  // Extract date — look for "Date: ..." text
  let dateStr = new Date().toISOString();
  const dateMatch = html.match(/Date:\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})/i);
  if (dateMatch) {
    const cleaned = dateMatch[1].replace(/(st|nd|rd|th)/i, "");
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) dateStr = parsed.toISOString();
  }

  // Extract race format/mode
  let roundType = "custom";
  const modeMatch = html.match(/Mode:\s*([\w-]+)/i);
  if (modeMatch) {
    const mode = modeMatch[1].toLowerCase();
    if (mode === "practice") roundType = "practice";
    else if (mode.includes("qualif")) roundType = "qualifying";
    else if (mode.includes("main") || mode.includes("final")) roundType = "main";
  }

  // Extract event name from page title or race header
  let eventName = "Race";
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const parts = titleMatch[1].split("|").map((s) => s.trim());
    eventName = parts[0] || "Race";
  }

  // Parse results table rows
  // NLT format: "Position Racer Laps Elapsed Fast Lap Pace Status"
  // Each row in text: "1st ClassName Laps Elapsed FastLap Pace Status"
  // The text rendering shows: "1st MS Evo2 5600kv 69 27662:01.919 0:06.861 69 Active"
  const resultPattern = /(\d+)(?:st|nd|rd|th)\s+(.+?)\s+(\d+)\s+([\d:]+\.?\d*)\s+([\d:]+\.?\d*)\s+(\d+)\s+(Active|Finished|DNF|DNS)/gi;
  let match: RegExpExecArray | null;

  while ((match = resultPattern.exec(html)) !== null) {
    const position = Number(match[1]);
    const className = match[2].trim();
    const totalLaps = Number(match[3]);
    const elapsedStr = match[4];
    const fastLapStr = match[5];

    const totalTimeMs = parseTimeToMs(elapsedStr);
    const fastLapMs = parseTimeToMs(fastLapStr);

    // Try to find individual lap times for this racer
    // NLT format: "N) M:SS.mmm" lines after the racer row
    const laps: { lapNumber: number; timeMs: number }[] = [];
    const nameEscaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Look for lap data block after this racer's entry
    const lapBlockRegex = new RegExp(nameEscaped + "[\\s\\S]*?((?:\\d+\\)\\s*[\\d:.]+[\\s]*)+)", "i");
    const lapBlock = lapBlockRegex.exec(html);
    if (lapBlock) {
      const lapPattern = /(\d+)\)\s*([\d:.]+)/g;
      let lapMatch: RegExpExecArray | null;
      while ((lapMatch = lapPattern.exec(lapBlock[1])) !== null) {
        laps.push({
          lapNumber: Number(lapMatch[1]),
          timeMs: parseTimeToMs(lapMatch[2]),
        });
      }
      // Sort by lap number ascending
      laps.sort((a, b) => a.lapNumber - b.lapNumber);
    }

    results.push({
      eventName,
      community,
      className,
      roundType,
      date: dateStr,
      position,
      totalLaps,
      totalTimeMs,
      fastLapMs,
      laps,
    });
  }

  // If regex-based approach didn't work, try a simpler text-based fallback
  if (results.length === 0) {
    // Fallback: look for individual lap time blocks formatted as "N) 0:SS.mmm"
    const lapLinePattern = /(\d+)\)\s*([\d:.]+)/g;
    const allLaps: { lapNumber: number; timeMs: number }[] = [];
    let lapLineMatch: RegExpExecArray | null;
    while ((lapLineMatch = lapLinePattern.exec(html)) !== null) {
      allLaps.push({
        lapNumber: Number(lapLineMatch[1]),
        timeMs: parseTimeToMs(lapLineMatch[2]),
      });
    }

    if (allLaps.length > 0) {
      allLaps.sort((a, b) => a.lapNumber - b.lapNumber);
      const fastLapMs = Math.min(...allLaps.map((l) => l.timeMs));
      const totalTimeMs = allLaps.reduce((s, l) => s + l.timeMs, 0);

      // Try to extract class name from page text
      let className = "Unknown Class";
      // Look for text near "Position Racer" header
      const classMatch = html.match(/1st\s+(.+?)\s+\d+\s+[\d:]/i);
      if (classMatch) className = classMatch[1].trim();

      results.push({
        eventName,
        community,
        className,
        roundType,
        date: dateStr,
        position: 1,
        totalLaps: allLaps.length,
        totalTimeMs,
        fastLapMs,
        laps: allLaps,
      });
    }
  }

  // Count total entries
  if (results.length > 0) {
    const total = results.length;
    results.forEach((r) => { r.totalEntries = total; });
  }

  return results;
}

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
      const res = await fetch(url, {
        headers: {
          "User-Agent": "SetupIQ/1.0 (RC race result import)",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return reply.status(502).send({ error: `NLT returned HTTP ${res.status}` });
      }

      const html = await res.text();
      const data = parseNltHtml(html, url);

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scrape failed";
      return reply.status(502).send({ error: message });
    }
  });
}
