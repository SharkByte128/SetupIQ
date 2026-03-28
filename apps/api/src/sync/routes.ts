import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/index.js";
import { setupSnapshots, runSessions, runSegments, tracks, components, measurements } from "../db/schema.js";
import { eq, gt, and } from "drizzle-orm";

type AuthUser = { id: string; email: string; displayName: string };

interface SyncPushBody {
  setupSnapshots?: SyncRecord[];
  runSessions?: SyncRecord[];
  runSegments?: SyncRecord[];
  tracks?: SyncRecord[];
  components?: SyncRecord[];
  measurements?: SyncRecord[];
}

interface SyncRecord {
  id: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

interface SyncPullQuery {
  since?: string;
}

// Map of table name → drizzle table + userId column + updatedAt column
const SYNC_TABLES = {
  setupSnapshots: { table: setupSnapshots, userCol: setupSnapshots.userId, timeCol: setupSnapshots.updatedAt },
  tracks: { table: tracks, userCol: tracks.userId, timeCol: tracks.updatedAt },
  components: { table: components, userCol: components.userId, timeCol: components.createdAt },
  runSessions: { table: runSessions, userCol: runSessions.userId, timeCol: runSessions.startedAt },
  measurements: { table: measurements, userCol: measurements.setupId, timeCol: measurements.measuredAt },
} as const;

export async function registerSyncRoutes(app: FastifyInstance): Promise<void> {
  // ─── Pull: Get all records updated after `since` ──────────

  app.get("/api/sync/pull", async function (request: FastifyRequest<{ Querystring: SyncPullQuery }>, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = request.user as AuthUser;
    const since = request.query.since ? new Date(request.query.since) : new Date(0);

    const [userSetups, userTracks, userComponents, userSessions, userSegments, userMeasurements] = await Promise.all([
      db.select().from(setupSnapshots).where(
        and(eq(setupSnapshots.userId, user.id), gt(setupSnapshots.updatedAt, since))
      ),
      db.select().from(tracks).where(
        and(eq(tracks.userId, user.id), gt(tracks.updatedAt, since))
      ),
      db.select().from(components).where(
        and(eq(components.userId, user.id), gt(components.createdAt, since))
      ),
      db.select().from(runSessions).where(
        and(eq(runSessions.userId, user.id), gt(runSessions.startedAt, since))
      ),
      // Segments don't have userId direct — pull via sessions
      db.select().from(runSegments).where(gt(runSegments.startedAt, since)),
      db.select().from(measurements).where(gt(measurements.measuredAt, since)),
    ]);

    return {
      setupSnapshots: userSetups,
      tracks: userTracks,
      components: userComponents,
      runSessions: userSessions,
      runSegments: userSegments,
      measurements: userMeasurements,
      serverTime: new Date().toISOString(),
    };
  });

  // ─── Push: Upsert records from client ─────────────────────

  app.post("/api/sync/push", async function (request: FastifyRequest<{ Body: SyncPushBody }>, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = request.user as AuthUser;
    const body = request.body;
    const results: Record<string, number> = {};

    // Upsert setup snapshots
    if (body.setupSnapshots?.length) {
      for (const record of body.setupSnapshots) {
        await db
          .insert(setupSnapshots)
          .values({
            id: record.id,
            userId: user.id,
            carId: (record.data.carId as string) || "",
            name: (record.data.name as string) || "Untitled",
            entries: (record.data.entries as any) || [],
            wheelTireSetups: (record.data.wheelTireSetups as any) || [],
            notes: record.data.notes as string | undefined,
            updatedAt: new Date(record.updatedAt),
          })
          .onConflictDoUpdate({
            target: setupSnapshots.id,
            set: {
              name: (record.data.name as string) || "Untitled",
              entries: (record.data.entries as any) || [],
              wheelTireSetups: (record.data.wheelTireSetups as any) || [],
              notes: record.data.notes as string | undefined,
              updatedAt: new Date(record.updatedAt),
            },
          });
      }
      results.setupSnapshots = body.setupSnapshots.length;
    }

    // Upsert tracks
    if (body.tracks?.length) {
      for (const record of body.tracks) {
        await db
          .insert(tracks)
          .values({
            id: record.id,
            userId: user.id,
            name: (record.data.name as string) || "Untitled",
            location: record.data.location as string | undefined,
            surfaceType: (record.data.surfaceType as string) || "other",
            tileType: record.data.tileType as string | undefined,
            dimensions: record.data.dimensions as string | undefined,
            layoutDescription: record.data.layoutDescription as string | undefined,
            notes: record.data.notes as string | undefined,
            updatedAt: new Date(record.updatedAt),
          })
          .onConflictDoUpdate({
            target: tracks.id,
            set: {
              name: (record.data.name as string) || "Untitled",
              location: record.data.location as string | undefined,
              surfaceType: (record.data.surfaceType as string) || "other",
              tileType: record.data.tileType as string | undefined,
              dimensions: record.data.dimensions as string | undefined,
              layoutDescription: record.data.layoutDescription as string | undefined,
              notes: record.data.notes as string | undefined,
              updatedAt: new Date(record.updatedAt),
            },
          });
      }
      results.tracks = body.tracks.length;
    }

    // Upsert run sessions
    if (body.runSessions?.length) {
      for (const record of body.runSessions) {
        await db
          .insert(runSessions)
          .values({
            id: record.id,
            userId: user.id,
            carId: (record.data.carId as string) || "",
            trackId: record.data.trackId as string | undefined,
            notes: record.data.notes as string | undefined,
            startedAt: new Date(record.data.startedAt as string || record.updatedAt),
            endedAt: record.data.endedAt ? new Date(record.data.endedAt as string) : null,
          })
          .onConflictDoUpdate({
            target: runSessions.id,
            set: {
              notes: record.data.notes as string | undefined,
              endedAt: record.data.endedAt ? new Date(record.data.endedAt as string) : null,
            },
          });
      }
      results.runSessions = body.runSessions.length;
    }

    return { ok: true, upserted: results };
  });
}
