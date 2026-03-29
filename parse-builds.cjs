/**
 * parse-builds.cjs — Parses the docx file (via mammoth HTML) into structured JSON
 * for seeding into SetupIQ's local database.
 *
 * Input:  docs/MyBuild-AtomicRC-MRX-MasterEdition.docx
 * Output: apps/web/src/db/build-data.json
 *
 * Uses HTML extraction for table data (clean cell boundaries)
 * and text extraction for lap times (easier regex parsing).
 */
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const docxPath = path.join(__dirname, "docs/MyBuild-AtomicRC-MRX-MasterEdition.docx");

// ── Helpers ───────────────────────────────────────────────────

function parseTimeToMs(raw) {
  raw = raw.trim();
  const parts = raw.split(":");
  if (parts.length === 2) {
    return Math.round((Number(parts[0]) * 60 + Number(parts[1])) * 1000);
  }
  return Math.round(Number(raw) * 1000);
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Parse HTML table rows ─────────────────────────────────────

function parseHtmlTable(tableHtml) {
  const rows = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(tableHtml)) !== null) {
    const cellRegex = /<td>([\s\S]*?)<\/td>/g;
    let c;
    const cells = [];
    while ((c = cellRegex.exec(m[1])) !== null) {
      cells.push(stripHtml(c[1]));
    }
    rows.push(cells);
  }
  return rows;
}

// ── Parse baseline setup from plain text ───────────────────

function parseBaselineSetupFromText(block) {
  const entries = {};
  const lines = block.split("\n");
  for (const line of lines) {
    const l = line.trim();
    const kv = l.match(/^(.+?):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const val = kv[2].trim();
    if (key === "Front Ride Height") entries["front-ride-height"] = Number(val) || val;
    else if (key === "Front Damper Grease") entries["front-damper-grease"] = val;
    else if (key === "Front DAA Springs") entries["daa-spring"] = val;
    else if (key === "Toe Angle") entries["front-toe"] = val;
    else if (key.includes("Top Kingpin")) entries["top-kingpin-shim"] = val;
    else if (key.includes("Bottom Kingpin")) entries["bottom-kingpin-shim"] = val;
    else if (key === "Caster" || key === "Camber") entries[key.toLowerCase()] = val;
    else if (key === "Damper Shim") entries["damper-shim"] = val;
    else if (key === "Rear Ride Height") entries["rear-ride-height"] = Number(val) || val;
    else if (key === "Style") entries["rear-spring-style"] = val;
    else if (key === "Center Damper Grease") entries["center-damper-grease"] = val;
    else if (key === "Side Spring Damper Grease") entries["side-spring-damper-grease"] = val;
    else if (key === "Vertical Side Springs") entries["vertical-side-spring"] = val;
    else if (key === "Rear Top Spring") entries["rear-top-spring"] = val;
    else if (key === "Pinion") entries["pinion-gear"] = val;
    else if (key === "Spur Gear") entries["spur-gear"] = val;
    else if (key === "Diff") entries["diff-type"] = val;
    else if (key === "Motor") entries["motor"] = val;
    else if (key === "Axles") entries["axles"] = val;
  }
  return entries;
}

// ── Parse summary table into segments ─────────────────────────

function parseSummaryTable(tableHtml) {
  const rows = parseHtmlTable(tableHtml);
  const segments = [];

  // Skip header row (row 0: Setup Change, Start, End, Repeat, Fast, Avg, Feedback)
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length < 7) continue;

    const description = cells[0] || `Segment ${i}`;
    const startLap = Number(cells[1]) || 0;
    const endLap = Number(cells[2]) || 0;
    const repeat = cells[3] || "";
    const fastStr = cells[4] || "n/a";
    const fastLap = fastStr === "n/a" ? 0 : Number(fastStr) || 0;
    const avg = cells[5] || "n/a";
    const feedback = cells[6] || "";

    segments.push({
      description,
      startLap,
      endLap,
      repeat,
      fastLap,
      avg,
      feedback,
    });
  }

  return segments;
}

// ── Parse lap times from plain text ───────────────────────────

function parseLapTimes(plainText, sessionDate) {
  const laps = [];
  // Find the session block in the text
  const sessionStart = plainText.indexOf(`Test ${sessionDate}`);
  if (sessionStart === -1) return laps;

  // Find "Run Data" within this session
  const sessionText = plainText.slice(sessionStart);
  const dataStart = sessionText.indexOf("Run Data");
  if (dataStart === -1) return laps;

  // Find next session or end
  const nextSession = sessionText.indexOf("\nTest 20", dataStart);
  const relevantText = nextSession !== -1
    ? sessionText.slice(dataStart, nextSession)
    : sessionText.slice(dataStart);

  const lapPattern = /(\d+)\)\s*([\d:.]+)/g;
  let m;
  while ((m = lapPattern.exec(relevantText)) !== null) {
    laps.push({ lapNumber: Number(m[1]), timeMs: parseTimeToMs(m[2]) });
  }

  return laps;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  // Extract HTML for table parsing
  const htmlResult = await mammoth.convertToHtml({ path: docxPath });
  const html = htmlResult.value;

  // Extract plain text for lap times
  const textResult = await mammoth.extractRawText({ path: docxPath });
  const plainText = textResult.value;

  // Find all tables
  const tableRegex = /<table>([\s\S]*?)<\/table>/g;
  const tables = [];
  let m;
  while ((m = tableRegex.exec(html)) !== null) {
    tables.push(m[0]);
  }

  console.log(`Found ${tables.length} tables in docx`);

  // Identify summary tables (have "Setup Change" header)
  const summaryTables = [];
  for (const t of tables) {
    if (t.includes("Setup Change") && t.includes("Start") && t.includes("Feedback")) {
      summaryTables.push(t);
    }
  }

  console.log(`Summary tables: ${summaryTables.length}`);

  // Session dates from text
  const sessionDates = [];
  const dateRegex = /Test (\d{4}-\d{2}-\d{2})/g;
  while ((m = dateRegex.exec(plainText)) !== null) {
    sessionDates.push(m[1]);
  }

  console.log(`Session dates: ${sessionDates.join(", ")}`);

  const CARID = "car-mrx-me";
  const TRACKID = "track-the-cave";
  const output = { sessions: [] };

  for (let si = 0; si < sessionDates.length; si++) {
    const date = sessionDates[si];
    console.log(`\nProcessing session: ${date}`);

    // Parse baseline setup from plain text
    const sessionStart = plainText.indexOf(`Test ${date}`);
    let baselineSetup = {};
    if (sessionStart !== -1) {
      const sessionText = plainText.slice(sessionStart);
      const baselineIdx = sessionText.indexOf("Run Baseline Setup:");
      const summaryIdx = sessionText.indexOf("Run Summary:");
      if (baselineIdx !== -1 && summaryIdx !== -1) {
        baselineSetup = parseBaselineSetupFromText(sessionText.slice(baselineIdx, summaryIdx));
      }
    }
    console.log(`  Setup entries: ${Object.keys(baselineSetup).length}`);

    // Parse summary table, filtering empty trailing rows
    const rawSegments = si < summaryTables.length
      ? parseSummaryTable(summaryTables[si])
      : [];
    const segments = rawSegments.filter((s) => s.startLap > 0 || s.endLap > 0);
    console.log(`  Segments: ${segments.length}`);

    // Parse lap times from plain text
    const allLaps = parseLapTimes(plainText, date);
    console.log(`  Total laps: ${allLaps.length}`);

    // Assign laps to segments
    const sessionSegments = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segmentLaps = allLaps.filter(
        (l) => l.lapNumber >= seg.startLap && l.lapNumber <= seg.endLap,
      );

      sessionSegments.push({
        id: uuid(),
        segmentNumber: i + 1,
        description: seg.description,
        startLap: seg.startLap,
        endLap: seg.endLap,
        repeat: seg.repeat,
        fastLapSec: seg.fastLap,
        avgInfo: seg.avg,
        feedback: seg.feedback || undefined,
        lapTimes: segmentLaps,
      });
    }

    const sessionId = uuid();
    const snapshotId = uuid();

    const setupEntries = Object.entries(baselineSetup).map(([k, v]) => ({
      capabilityId: k,
      value: v,
    }));

    output.sessions.push({
      sessionId,
      date,
      carId: CARID,
      trackId: TRACKID,
      snapshotId,
      snapshotName: `MRX ME — ${date}`,
      setupEntries,
      segments: sessionSegments,
      totalLaps: allLaps.length,
    });
  }

  // Write output
  const outPath = path.join(__dirname, "apps/web/src/db/build-data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${outPath}`);
  console.log(`Sessions: ${output.sessions.length}`);
  for (const s of output.sessions) {
    console.log(`  ${s.date}: ${s.segments.length} segments, ${s.totalLaps} laps`);
  }
}

main().catch(console.error);
