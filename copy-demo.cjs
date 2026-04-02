#!/usr/bin/env node
/**
 * Generate SQL to copy demo data to a user.
 * Usage: node copy-demo.cjs > copy-demo.sql
 * Then on server: docker exec -i setupiq-postgres-1 psql -U setupiq setupiq < copy-demo.sql
 */
const buildData = require("./apps/web/src/db/build-data.json");

const esc = (s) => s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const jsonEsc = (obj) => `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;

console.log(`-- Copy demo data to sharkbyte128
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM users WHERE username = 'sharkbyte128';
  IF uid IS NULL THEN
    RAISE EXCEPTION 'User sharkbyte128 not found';
  END IF;

  -- Track: The Cave
  INSERT INTO tracks (id, user_id, name, location, surface_type, tile_type, dimensions, layout_description, notes, created_at, updated_at)
  VALUES ('track-the-cave', uid, 'The Cave', 'Basement garage', 'rcp', 'RCP 30 cm tiles, smooth side up', '12 ft × 24 ft',
    'Two 12 ft straights, one 24 ft straight. Road course style layout. Long enough to expose stability issues, narrow enough to punish sloppy steering, consistent enough to track setup changes.',
    'Perfect for F1 chassis testing — FX28 + MRX tuning, consistency testing, setup validation.',
    NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Baseline setup
  INSERT INTO setup_snapshots (id, user_id, car_id, name, entries, wheel_tire_setups, notes, created_at, updated_at)
  VALUES ('setup-mrx-me-baseline', uid, 'car-mrx-me', 'MRX ME — Manual Baseline',
    ${jsonEsc([
      {capabilityId:"chassis",value:"plastic"},{capabilityId:"side-wing",value:"none"},
      {capabilityId:"front-ride-height",value:2.1},{capabilityId:"front-daa-spring",value:"super-soft-red"},
      {capabilityId:"front-damper-grease",value:"atomic-25000"},{capabilityId:"front-toe",value:4},
      {capabilityId:"front-caster",value:"2"},{capabilityId:"top-kingpin-shim",value:0},
      {capabilityId:"bottom-kingpin-shim",value:2},{capabilityId:"front-damper-shim",value:1},
      {capabilityId:"front-knuckle",value:"aluminum-v2"},{capabilityId:"rear-ride-height",value:3.2},
      {capabilityId:"rear-spring-style",value:"horizontal"},{capabilityId:"vertical-side-spring",value:"na"},
      {capabilityId:"rear-top-spring",value:"medium-yellow"},{capabilityId:"center-damper-grease",value:"atomic-25000"},
      {capabilityId:"side-spring-damper-grease",value:"atomic-25000"},{capabilityId:"center-damper",value:"standard"},
      {capabilityId:"center-damper-mount",value:"standard"},{capabilityId:"pinion-gear",value:"12"},
      {capabilityId:"spur-gear",value:"53"},{capabilityId:"diff-type",value:"gear-diff"},
      {capabilityId:"diff-tension",value:"tight"},{capabilityId:"front-tire",value:"marka-v5-front-25-11"},
      {capabilityId:"rear-tire",value:"marka-mzr-v1rr15-14"},{capabilityId:"front-wheel",value:"sh-jud-85-p1"},
      {capabilityId:"rear-wheel",value:"sh-jud-11-p3"},{capabilityId:"tire-glue",value:"none"},
      {capabilityId:"motor",value:"PN Anima V4 2500kv"},{capabilityId:"esc",value:"Hobbywing EZRun Mini28"},
      {capabilityId:"servo",value:"AGFRC A06CLS v2"},{capabilityId:"battery",value:"Silver Horse RC 450mAh 2S 7.4V 60C"},
      {capabilityId:"radio",value:"Flysky Noble 4 Plus"},{capabilityId:"receiver",value:"Micro 4-channel"},
      {capabilityId:"transponder",value:"EasyLap Transponder"},{capabilityId:"ballast-total",value:0}
    ])},
    ${jsonEsc([
      {position:"front",side:"left",wheelId:"wheel-sh-jud-85-p1",tireId:"tire-marka-v5-front-25"},
      {position:"front",side:"right",wheelId:"wheel-sh-jud-85-p1",tireId:"tire-marka-v5-front-25"},
      {position:"rear",side:"left",wheelId:"wheel-sh-jud-11-p3",tireId:"tire-marka-mzr-v1rr15"},
      {position:"rear",side:"right",wheelId:"wheel-sh-jud-11-p3",tireId:"tire-marka-mzr-v1rr15"}
    ])},
    'Built per MRX Master Edition manual. Practice motor (non-handout). Silver Horse wheels — swap to PN Delrin for PNWC. Ball diff: tighten fully, back off 1/8 to 1/4 turn.',
    NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
`);

// Sessions + snapshots + segments from build-data.json
for (const session of buildData.sessions) {
  const sessionDate = `${session.date}T12:00:00.000Z`;
  const entries = session.setupEntries.map(e => ({ capabilityId: e.capabilityId, value: e.value }));

  console.log(`
  -- Session snapshot: ${session.snapshotName}
  INSERT INTO setup_snapshots (id, user_id, car_id, name, entries, wheel_tire_setups, notes, created_at, updated_at)
  VALUES (${esc(session.snapshotId)}, uid, ${esc(session.carId)}, ${esc(session.snapshotName)},
    ${jsonEsc(entries)}, '[]'::jsonb,
    ${esc(`Baseline setup for test session ${session.date}`)},
    ${esc(sessionDate)}::timestamptz, ${esc(sessionDate)}::timestamptz)
  ON CONFLICT (id) DO NOTHING;

  -- Run session: ${session.date}
  INSERT INTO run_sessions (id, user_id, car_id, track_id, notes, started_at, ended_at)
  VALUES (${esc(session.sessionId)}, uid, ${esc(session.carId)}, ${esc(session.trackId)},
    ${esc(`Test ${session.date} — ${session.segments.length} segments, ${session.totalLaps} laps`)},
    ${esc(sessionDate)}::timestamptz, ${esc(sessionDate)}::timestamptz)
  ON CONFLICT (id) DO NOTHING;`);

  for (const seg of session.segments) {
    const feedback = {
      handling: seg.feedback ? [seg.feedback] : [],
      consistency: 0,
      notes: `${seg.description} | ${seg.repeat} | fast: ${seg.fastLapSec}s avg: ${seg.avgInfo}`,
    };
    const lapTimes = seg.lapTimes.map(l => ({
      lapNumber: l.lapNumber,
      timeMs: l.timeMs,
      isOutlier: l.timeMs > 60000,
    }));
    const setupChanges = [{ capabilityId: "setup-change", value: seg.description }];

    console.log(`
  INSERT INTO run_segments (id, session_id, setup_snapshot_id, segment_number, feedback, lap_times, setup_changes, started_at, ended_at)
  VALUES (${esc(seg.id)}, ${esc(session.sessionId)}, ${esc(session.snapshotId)}, ${seg.segmentNumber},
    ${jsonEsc(feedback)}, ${jsonEsc(lapTimes)}, ${jsonEsc(setupChanges)},
    ${esc(sessionDate)}::timestamptz, ${esc(sessionDate)}::timestamptz)
  ON CONFLICT (id) DO NOTHING;`);
  }
}

console.log(`
  RAISE NOTICE 'Demo data copied to sharkbyte128 (user_id: %)', uid;
END $$;`);
