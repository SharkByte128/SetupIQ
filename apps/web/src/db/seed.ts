import { localDb } from "./local-db.js";

/**
 * Seed the local database with default data on first use.
 * Keyed by a "seeded" flag in syncMeta to avoid re-seeding.
 */
export async function seedDefaults(): Promise<void> {
  const seeded = await localDb.syncMeta.get("db-seeded");
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

  await localDb.syncMeta.put({ key: "db-seeded", value: now });
}
