import { allCars } from "@setupiq/shared";
import { localDb } from "./local-db.js";
import buildData from "./build-data.json";

/**
 * Seed the local database with default data on first use.
 * Keyed by a "seeded" flag in syncMeta to avoid re-seeding.
 */
export async function seedDefaults(): Promise<void> {
  const seeded = await localDb.syncMeta.get("db-seeded-v3");
  if (seeded) return;

  const now = new Date().toISOString();

  // ── The Cave — basement test track ──
  await localDb.tracks.put({
    id: "track-the-cave",
    userId: "local",
    name: "The Cave",
    location: "Basement garage",
    surfaceType: "rcp",
    tileType: "RCP 30 cm tiles, smooth side up",
    dimensions: "12 ft × 24 ft",
    layoutDescription:
      "Two 12 ft straights, one 24 ft straight. Road course style layout. " +
      "Long enough to expose stability issues, narrow enough to punish sloppy steering, " +
      "consistent enough to track setup changes.",
    notes:
      "Perfect for F1 chassis testing — FX28 + MRX tuning, consistency testing, setup validation.",
    createdAt: now,
    updatedAt: now,
    _dirty: 0 as const,
  });

  // ── MRX Master Edition — Baseline Setup (from AtomicMRXME.md) ──
  await localDb.setupSnapshots.put({
    id: "setup-mrx-me-baseline",
    userId: "local",
    carId: "car-mrx-me",
    name: "MRX ME — Manual Baseline",
    entries: [
      { capabilityId: "chassis", value: "plastic" },
      { capabilityId: "side-wing", value: "none" },
      { capabilityId: "front-ride-height", value: 2.1 },
      { capabilityId: "front-daa-spring", value: "super-soft-red" },
      { capabilityId: "front-damper-grease", value: "atomic-25000" },
      { capabilityId: "front-toe", value: 4 },
      { capabilityId: "front-caster", value: "2" },
      { capabilityId: "top-kingpin-shim", value: 0 },
      { capabilityId: "bottom-kingpin-shim", value: 2 },
      { capabilityId: "front-damper-shim", value: 1 },
      { capabilityId: "front-knuckle", value: "aluminum-v2" },
      { capabilityId: "rear-ride-height", value: 3.2 },
      { capabilityId: "rear-spring-style", value: "horizontal" },
      { capabilityId: "vertical-side-spring", value: "na" },
      { capabilityId: "rear-top-spring", value: "medium-yellow" },
      { capabilityId: "center-damper-grease", value: "atomic-25000" },
      { capabilityId: "side-spring-damper-grease", value: "atomic-25000" },
      { capabilityId: "center-damper", value: "standard" },
      { capabilityId: "center-damper-mount", value: "standard" },
      { capabilityId: "pinion-gear", value: "12" },
      { capabilityId: "spur-gear", value: "53" },
      { capabilityId: "diff-type", value: "gear-diff" },
      { capabilityId: "diff-tension", value: "tight" },
      { capabilityId: "front-tire", value: "marka-v5-front-25-11" },
      { capabilityId: "rear-tire", value: "marka-mzr-v1rr15-14" },
      { capabilityId: "front-wheel", value: "sh-jud-85-p1" },
      { capabilityId: "rear-wheel", value: "sh-jud-11-p3" },
      { capabilityId: "tire-glue", value: "none" },
      { capabilityId: "motor", value: "PN Anima V4 2500kv" },
      { capabilityId: "esc", value: "Hobbywing EZRun Mini28" },
      { capabilityId: "servo", value: "AGFRC A06CLS v2" },
      { capabilityId: "battery", value: "Silver Horse RC 450mAh 2S 7.4V 60C" },
      { capabilityId: "radio", value: "Flysky Noble 4 Plus" },
      { capabilityId: "receiver", value: "Micro 4-channel" },
      { capabilityId: "transponder", value: "EasyLap Transponder" },
      { capabilityId: "ballast-total", value: 0 },
    ],
    wheelTireSetups: [
      {
        position: "front",
        side: "left",
        wheelId: "wheel-sh-jud-85-p1",
        tireId: "tire-marka-v5-front-25",
      },
      {
        position: "front",
        side: "right",
        wheelId: "wheel-sh-jud-85-p1",
        tireId: "tire-marka-v5-front-25",
      },
      {
        position: "rear",
        side: "left",
        wheelId: "wheel-sh-jud-11-p3",
        tireId: "tire-marka-mzr-v1rr15",
      },
      {
        position: "rear",
        side: "right",
        wheelId: "wheel-sh-jud-11-p3",
        tireId: "tire-marka-mzr-v1rr15",
      },
    ],
    notes:
      "Built per MRX Master Edition manual. Practice motor (non-handout). " +
      "Silver Horse wheels — swap to PN Delrin for PNWC. " +
      "Ball diff: tighten fully, back off 1/8 to 1/4 turn.",
    createdAt: now,
    updatedAt: now,
    _dirty: 0 as const,
  });

  // ── Import historical test sessions from build docs ──
  for (const session of buildData.sessions) {
    const sessionDate = `${session.date}T12:00:00.000Z`;

    // Create setup snapshot for this session's baseline
    await localDb.setupSnapshots.put({
      id: session.snapshotId,
      userId: "local",
      carId: session.carId,
      name: session.snapshotName,
      entries: session.setupEntries.map((e) => ({
        capabilityId: e.capabilityId,
        value: e.value,
      })),
      wheelTireSetups: [],
      notes: `Baseline setup for test session ${session.date}`,
      createdAt: sessionDate,
      updatedAt: sessionDate,
      _dirty: 0 as const,
    });

    // Create run session
    await localDb.runSessions.put({
      id: session.sessionId,
      userId: "local",
      carId: session.carId,
      trackId: session.trackId,
      notes: `Test ${session.date} — ${session.segments.length} segments, ${session.totalLaps} laps`,
      startedAt: sessionDate,
      endedAt: sessionDate,
      _dirty: 0 as const,
    });

    // Create run segments
    for (const seg of session.segments) {
      await localDb.runSegments.put({
        id: seg.id,
        sessionId: session.sessionId,
        setupSnapshotId: session.snapshotId,
        segmentNumber: seg.segmentNumber,
        feedback: {
          handling: seg.feedback ? [seg.feedback] : [],
          consistency: 0,
          notes: `${seg.description} | ${seg.repeat} | fast: ${seg.fastLapSec}s avg: ${seg.avgInfo}`,
        },
        lapTimes: seg.lapTimes.map((l) => ({
          lapNumber: l.lapNumber,
          timeMs: l.timeMs,
          isOutlier: l.timeMs > 60000,
        })),
        setupChanges: [
          {
            capabilityId: "setup-change",
            value: seg.description,
          },
        ],
        startedAt: sessionDate,
        endedAt: sessionDate,
        _dirty: 0 as const,
      });
    }
  }

  await localDb.syncMeta.put({ key: "db-seeded-v3", value: now });
}

/**
 * Seed built-in setup templates from car definitions.
 * Runs independently of main seed so existing users also get templates.
 */
export async function seedSetupTemplates(): Promise<void> {
  const seeded = await localDb.syncMeta.get("templates-seeded-v2");
  if (seeded) return;

  const now = new Date().toISOString();

  // Map car IDs to their matching chassis platform IDs
  const carToChassisMap: Record<string, string[]> = {
    "car-mr03-rwd":    ["chassis-kyosho-mr03"],
    "car-mrx-me":      ["chassis-atomic-mrx"],
    "car-rx28":        ["chassis-reflex-rx28"],
    "car-evo2-5600kv": ["chassis-kyosho-mr04-evo2"],
  };

  for (const car of allCars) {
    const existing = await localDb.setupTemplates.get(car.id);
    if (existing) {
      // Update existing built-in template with chassis IDs if missing
      if (existing.builtIn && (!existing.compatibleChassisIds || existing.compatibleChassisIds.length === 0)) {
        await localDb.setupTemplates.update(car.id, {
          compatibleChassisIds: carToChassisMap[car.id] ?? [],
          updatedAt: now,
        });
      }
      continue;
    }

    await localDb.setupTemplates.put({
      id: car.id,
      userId: "local",
      name: `${car.manufacturer} ${car.name}`,
      compatibleChassisIds: carToChassisMap[car.id] ?? [],
      capabilities: car.capabilities.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        valueType: c.valueType,
      })),
      builtIn: true,
      createdAt: now,
      updatedAt: now,
      _dirty: 1,
    });
  }

  await localDb.syncMeta.put({ key: "templates-seeded-v2", value: now });
}
