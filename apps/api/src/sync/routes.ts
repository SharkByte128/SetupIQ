import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/index.js";
import { setupSnapshots, runSessions, runSegments, tracks, components, measurements, parts, raceResults, customCars, carImages, trackImages, setupTemplates, racers, customPartCategories, categoryImages, partFiles } from "../db/schema.js";
import { eq, gt, and, inArray } from "drizzle-orm";

type AuthUser = { id: string; email: string; displayName: string };

interface SyncRecord {
  id: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

interface SyncPushBody {
  setupSnapshots?: SyncRecord[];
  runSessions?: SyncRecord[];
  runSegments?: SyncRecord[];
  tracks?: SyncRecord[];
  components?: SyncRecord[];
  measurements?: SyncRecord[];
  parts?: SyncRecord[];
  raceResults?: SyncRecord[];
  customCars?: SyncRecord[];
  carImages?: SyncRecord[];
  trackImages?: SyncRecord[];
  setupTemplates?: SyncRecord[];
  racers?: SyncRecord[];
  partCategories?: SyncRecord[];
  categoryImages?: SyncRecord[];
  partFiles?: SyncRecord[];
}

interface SyncPullQuery {
  since?: string;
}

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

    try {
      const [userSetups, userTracks, userComponents, userSessions, , , userParts, userRaceResults, userCustomCars, userCarImages, userTrackImages, userSetupTemplates, userRacers, userPartCategories, userCategoryImages, userPartFiles] = await Promise.all([
        db.select().from(setupSnapshots).where(
          and(eq(setupSnapshots.userId, user.id), gt(setupSnapshots.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] setupSnapshots query failed"); return []; }),
        db.select().from(tracks).where(
          and(eq(tracks.userId, user.id), gt(tracks.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] tracks query failed"); return []; }),
        db.select().from(components).where(
          eq(components.userId, user.id)
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] components query failed"); return []; }),
        db.select().from(runSessions).where(
          eq(runSessions.userId, user.id)
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] runSessions query failed"); return []; }),
        Promise.resolve([]), // placeholder — segments queried below
        Promise.resolve([]), // placeholder — measurements queried below
        db.select().from(parts).where(
          and(eq(parts.userId, user.id), gt(parts.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] parts query failed"); return []; }),
        db.select().from(raceResults).where(
          eq(raceResults.userId, user.id)
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] raceResults query failed"); return []; }),
        db.select().from(customCars).where(
          and(eq(customCars.userId, user.id), gt(customCars.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] customCars query failed"); return []; }),
        db.select().from(carImages).where(
          and(eq(carImages.userId, user.id), gt(carImages.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] carImages query failed"); return []; }),
        db.select().from(trackImages).where(
          and(eq(trackImages.userId, user.id), gt(trackImages.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] trackImages query failed"); return []; }),
        db.select().from(setupTemplates).where(
          and(eq(setupTemplates.userId, user.id), gt(setupTemplates.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] setupTemplates query failed"); return []; }),
        db.select().from(racers).where(
          and(eq(racers.userId, user.id), gt(racers.updatedAt, since))
        ).catch((e) => { request.log.warn({ err: e }, "[sync/pull] racers query failed"); return []; }),
        db.select().from(customPartCategories).where(
          and(eq(customPartCategories.userId, user.id), gt(customPartCategories.updatedAt, since))
        ).catch(() => []),
        db.select().from(categoryImages).where(
          and(eq(categoryImages.userId, user.id), gt(categoryImages.updatedAt, since))
        ).catch(() => []),
        db.select().from(partFiles).where(
          and(eq(partFiles.userId, user.id), gt(partFiles.updatedAt, since))
        ).catch(() => []),
      ]);

      // Segments & measurements scoped to user's sessions/setups
      let userSegments: any[] = [];
      try {
        const allUserSessions = await db.select({ id: runSessions.id }).from(runSessions).where(eq(runSessions.userId, user.id));
        const sessionIds = allUserSessions.map((s) => s.id);
        userSegments = sessionIds.length > 0
          ? await db.select().from(runSegments).where(
              inArray(runSegments.sessionId, sessionIds)
            )
          : [];
      } catch (e) {
        request.log.warn({ err: e }, "[sync/pull] runSegments query failed");
      }

      let userMeasurements: any[] = [];
      try {
        const allUserSetups = await db.select({ id: setupSnapshots.id }).from(setupSnapshots).where(eq(setupSnapshots.userId, user.id));
        const setupIds = allUserSetups.map((s) => s.id);
        userMeasurements = setupIds.length > 0
          ? await db.select().from(measurements).where(
              inArray(measurements.setupId, setupIds)
            )
          : [];
      } catch (e) {
        request.log.warn({ err: e }, "[sync/pull] measurements query failed");
      }

      return {
        setupSnapshots: userSetups,
        tracks: userTracks,
        components: userComponents,
        runSessions: userSessions,
        runSegments: userSegments,
        measurements: userMeasurements,
        parts: userParts,
        raceResults: userRaceResults,
        customCars: userCustomCars,
        carImages: userCarImages,
        trackImages: userTrackImages,
        setupTemplates: userSetupTemplates,
        racers: userRacers,
        partCategories: userPartCategories,
        categoryImages: userCategoryImages,
        partFiles: userPartFiles,
        serverTime: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      request.log.error({ err }, "[sync/pull] DB query failed");
      return reply.status(500).send({ error: "Sync pull failed", message });
    }
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
    const errors: Record<string, string> = {};

    // Upsert setup snapshots
    if (body.setupSnapshots?.length) {
      try {
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
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: setupSnapshots.id,
            set: {
              name: (record.data.name as string) || "Untitled",
              entries: (record.data.entries as any) || [],
              wheelTireSetups: (record.data.wheelTireSetups as any) || [],
              notes: record.data.notes as string | undefined,
              updatedAt: new Date(),
            },
          });
      }
      results.setupSnapshots = body.setupSnapshots.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] setupSnapshots upsert failed");
        errors.setupSnapshots = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert tracks
    if (body.tracks?.length) {
      try {
      for (const record of body.tracks) {
        await db
          .insert(tracks)
          .values({
            id: record.id,
            userId: user.id,
            name: (record.data.name as string) || "Untitled",
            location: record.data.location as string | undefined,
            address: record.data.address as string | undefined,
            phone: record.data.phone as string | undefined,
            hours: record.data.hours as string | undefined,
            timingSystem: record.data.timingSystem as string | undefined,
            timingFeedUrl: record.data.timingFeedUrl as string | undefined,
            nltCommunityId: record.data.nltCommunityId as number | undefined,
            surfaceType: (record.data.surfaceType as string) || "other",
            tileType: record.data.tileType as string | undefined,
            dimensions: record.data.dimensions as string | undefined,
            layoutDescription: record.data.layoutDescription as string | undefined,
            notes: record.data.notes as string | undefined,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: tracks.id,
            set: {
              name: (record.data.name as string) || "Untitled",
              location: record.data.location as string | undefined,
              address: record.data.address as string | undefined,
              phone: record.data.phone as string | undefined,
              hours: record.data.hours as string | undefined,
              timingSystem: record.data.timingSystem as string | undefined,
              timingFeedUrl: record.data.timingFeedUrl as string | undefined,
              nltCommunityId: record.data.nltCommunityId as number | undefined,
              surfaceType: (record.data.surfaceType as string) || "other",
              tileType: record.data.tileType as string | undefined,
              dimensions: record.data.dimensions as string | undefined,
              layoutDescription: record.data.layoutDescription as string | undefined,
              notes: record.data.notes as string | undefined,
              updatedAt: new Date(),
            },
          });
      }
      results.tracks = body.tracks.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] tracks upsert failed");
        errors.tracks = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert run sessions
    if (body.runSessions?.length) {
      try {
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
      } catch (err) {
        request.log.warn({ err }, "[sync/push] runSessions upsert failed");
        errors.runSessions = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert run segments
    if (body.runSegments?.length) {
      try {
      for (const record of body.runSegments) {
        await db
          .insert(runSegments)
          .values({
            id: record.id,
            sessionId: (record.data.sessionId as string) || "",
            setupSnapshotId: (record.data.setupSnapshotId as string) || "",
            segmentNumber: (record.data.segmentNumber as number) || 1,
            feedback: record.data.feedback as any,
            lapTimes: record.data.lapTimes as any,
            setupChanges: record.data.setupChanges as any,
            startedAt: new Date(record.data.startedAt as string || record.updatedAt),
            endedAt: record.data.endedAt ? new Date(record.data.endedAt as string) : null,
          })
          .onConflictDoUpdate({
            target: runSegments.id,
            set: {
              feedback: record.data.feedback as any,
              lapTimes: record.data.lapTimes as any,
              setupChanges: record.data.setupChanges as any,
              endedAt: record.data.endedAt ? new Date(record.data.endedAt as string) : null,
            },
          });
      }
      results.runSegments = body.runSegments.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] runSegments upsert failed");
        errors.runSegments = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert components
    if (body.components?.length) {
      try {
      for (const record of body.components) {
        await db
          .insert(components)
          .values({
            id: record.id,
            userId: user.id,
            type: (record.data.type as string) || "",
            brand: (record.data.brand as string) || "",
            name: (record.data.name as string) || "",
            sku: record.data.sku as string | undefined,
            position: record.data.position as string | undefined,
            widthMm: record.data.widthMm as number | undefined,
            offset: record.data.offset as number | undefined,
            compound: record.data.compound as string | undefined,
            diameterMm: record.data.diameterMm as number | undefined,
            color: record.data.color as string | undefined,
            notes: record.data.notes as string | undefined,
          })
          .onConflictDoUpdate({
            target: components.id,
            set: {
              type: (record.data.type as string) || "",
              brand: (record.data.brand as string) || "",
              name: (record.data.name as string) || "",
              sku: record.data.sku as string | undefined,
              position: record.data.position as string | undefined,
              widthMm: record.data.widthMm as number | undefined,
              offset: record.data.offset as number | undefined,
              compound: record.data.compound as string | undefined,
              diameterMm: record.data.diameterMm as number | undefined,
              color: record.data.color as string | undefined,
              notes: record.data.notes as string | undefined,
            },
          });
      }
      results.components = body.components.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] components upsert failed");
        errors.components = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert measurements
    if (body.measurements?.length) {
      try {
      for (const record of body.measurements) {
        await db
          .insert(measurements)
          .values({
            id: record.id,
            setupId: (record.data.setupId as string) || "",
            runSessionId: record.data.runSessionId as string | undefined,
            cornerWeights: record.data.cornerWeights as any,
            totalWeight: record.data.totalWeight as number | undefined,
            frontBiasPercent: record.data.frontBiasPercent as number | undefined,
            leftBiasPercent: record.data.leftBiasPercent as number | undefined,
            crossWeightPercent: record.data.crossWeightPercent as number | undefined,
            measuredAt: new Date(record.data.measuredAt as string || record.updatedAt),
            source: (record.data.source as string) || "manual",
          })
          .onConflictDoUpdate({
            target: measurements.id,
            set: {
              cornerWeights: record.data.cornerWeights as any,
              totalWeight: record.data.totalWeight as number | undefined,
              frontBiasPercent: record.data.frontBiasPercent as number | undefined,
              leftBiasPercent: record.data.leftBiasPercent as number | undefined,
              crossWeightPercent: record.data.crossWeightPercent as number | undefined,
            },
          });
      }
      results.measurements = body.measurements.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] measurements upsert failed");
        errors.measurements = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert parts
    if (body.parts?.length) {
      try {
      for (const record of body.parts) {
        await db
          .insert(parts)
          .values({
            id: record.id,
            userId: user.id,
            vendorId: (record.data.vendorId as string) || "",
            categoryId: (record.data.categoryId as string) || "",
            name: (record.data.name as string) || "Untitled",
            sku: record.data.sku as string | undefined,
            compatibleChassisIds: (record.data.compatibleChassisIds as any) || [],
            attributes: (record.data.attributes as any) || {},
            notes: record.data.notes as string | undefined,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: parts.id,
            set: {
              vendorId: (record.data.vendorId as string) || "",
              categoryId: (record.data.categoryId as string) || "",
              name: (record.data.name as string) || "Untitled",
              sku: record.data.sku as string | undefined,
              compatibleChassisIds: (record.data.compatibleChassisIds as any) || [],
              attributes: (record.data.attributes as any) || {},
              notes: record.data.notes as string | undefined,
              updatedAt: new Date(),
            },
          });
      }
      results.parts = body.parts.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] parts upsert failed");
        errors.parts = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert race results
    if (body.raceResults?.length) {
      try {
      for (const record of body.raceResults) {
        await db
          .insert(raceResults)
          .values({
            id: record.id,
            userId: user.id,
            carId: (record.data.carId as string) || "",
            trackId: record.data.trackId as string | undefined,
            eventName: (record.data.eventName as string) || "",
            community: record.data.community as string | undefined,
            className: (record.data.className as string) || "",
            roundType: (record.data.roundType as string) || "custom",
            roundNumber: record.data.roundNumber as number | undefined,
            date: (record.data.date as string) || "",
            position: (record.data.position as number) || 0,
            totalEntries: record.data.totalEntries as number | undefined,
            totalLaps: (record.data.totalLaps as number) || 0,
            totalTimeMs: (record.data.totalTimeMs as number) || 0,
            fastLapMs: (record.data.fastLapMs as number) || 0,
            avgLapMs: record.data.avgLapMs as number | undefined,
            laps: (record.data.laps as any) || [],
            sourceUrl: record.data.sourceUrl as string | undefined,
            setupSnapshotId: record.data.setupSnapshotId as string | undefined,
            notes: record.data.notes as string | undefined,
            hidden: Boolean(record.data.hidden),
          })
          .onConflictDoUpdate({
            target: raceResults.id,
            set: {
              eventName: (record.data.eventName as string) || "",
              className: (record.data.className as string) || "",
              roundType: (record.data.roundType as string) || "custom",
              position: (record.data.position as number) || 0,
              totalLaps: (record.data.totalLaps as number) || 0,
              totalTimeMs: (record.data.totalTimeMs as number) || 0,
              fastLapMs: (record.data.fastLapMs as number) || 0,
              laps: (record.data.laps as any) || [],
              notes: record.data.notes as string | undefined,
              hidden: Boolean(record.data.hidden),
            },
          });
      }
      results.raceResults = body.raceResults.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] raceResults upsert failed");
        errors.raceResults = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert custom cars
    if (body.customCars?.length) {
      try {
      for (const record of body.customCars) {
        await db
          .insert(customCars)
          .values({
            id: record.id,
            userId: user.id,
            name: (record.data.name as string) || "Untitled",
            chassisId: (record.data.chassisId as string) || "chassis-other",
            manufacturer: (record.data.manufacturer as string) || "",
            scale: (record.data.scale as string) || "",
            driveType: (record.data.driveType as string) || "RWD",
            notes: record.data.notes as string | undefined,
            setupTemplateId: (record.data.setupTemplateId as string) || null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: customCars.id,
            set: {
              name: (record.data.name as string) || "Untitled",
              chassisId: (record.data.chassisId as string) || "chassis-other",
              manufacturer: (record.data.manufacturer as string) || "",
              scale: (record.data.scale as string) || "",
              driveType: (record.data.driveType as string) || "RWD",
              notes: record.data.notes as string | undefined,
              setupTemplateId: (record.data.setupTemplateId as string) || null,
              updatedAt: new Date(),
            },
          });
      }
      results.customCars = body.customCars.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] customCars upsert failed");
        errors.customCars = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert car images
    if (body.carImages?.length) {
      try {
      for (const record of body.carImages) {
        await db
          .insert(carImages)
          .values({
            id: record.id,
            userId: user.id,
            carId: (record.data.carId as string) || "",
            imageBase64: (record.data.imageBase64 as string) || "",
            name: record.data.name as string | undefined,
            mimeType: record.data.mimeType as string | undefined,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: carImages.id,
            set: {
              carId: (record.data.carId as string) || "",
              imageBase64: (record.data.imageBase64 as string) || "",
              name: record.data.name as string | undefined,
              mimeType: record.data.mimeType as string | undefined,
              updatedAt: new Date(),
            },
          });
      }
      results.carImages = body.carImages.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] carImages upsert failed");
        errors.carImages = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert track images
    if (body.trackImages?.length) {
      try {
      for (const record of body.trackImages) {
        await db
          .insert(trackImages)
          .values({
            id: record.id,
            userId: user.id,
            trackId: (record.data.trackId as string) || "",
            imageBase64: (record.data.imageBase64 as string) || "",
            name: record.data.name as string | undefined,
            mimeType: record.data.mimeType as string | undefined,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: trackImages.id,
            set: {
              trackId: (record.data.trackId as string) || "",
              imageBase64: (record.data.imageBase64 as string) || "",
              name: record.data.name as string | undefined,
              mimeType: record.data.mimeType as string | undefined,
              updatedAt: new Date(),
            },
          });
      }
      results.trackImages = body.trackImages.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] trackImages upsert failed");
        errors.trackImages = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert setup templates
    if (body.setupTemplates?.length) {
      try {
      for (const record of body.setupTemplates) {
        await db
          .insert(setupTemplates)
          .values({
            id: record.id,
            userId: user.id,
            name: (record.data.name as string) || "Untitled",
            compatibleChassisIds: (record.data.compatibleChassisIds as string[]) || [],
            capabilities: (record.data.capabilities as Record<string, unknown>[]) || [],
            builtIn: Boolean(record.data.builtIn),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: setupTemplates.id,
            set: {
              name: (record.data.name as string) || "Untitled",
              compatibleChassisIds: (record.data.compatibleChassisIds as string[]) || [],
              capabilities: (record.data.capabilities as Record<string, unknown>[]) || [],
              builtIn: Boolean(record.data.builtIn),
              updatedAt: new Date(),
            },
          });
      }
      results.setupTemplates = body.setupTemplates.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] setupTemplates upsert failed");
        errors.setupTemplates = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert racers
    if (body.racers?.length) {
      try {
      for (const record of body.racers) {
        await db
          .insert(racers)
          .values({
            id: record.id,
            userId: user.id,
            name: (record.data.name as string) || "Unnamed",
            active: Boolean(record.data.active),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: racers.id,
            set: {
              name: (record.data.name as string) || "Unnamed",
              active: Boolean(record.data.active),
              updatedAt: new Date(),
            },
          });
      }
      results.racers = body.racers.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] racers upsert failed");
        errors.racers = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert part categories
    if (body.partCategories?.length) {
      try {
      for (const record of body.partCategories) {
        await db
          .insert(customPartCategories)
          .values({
            id: record.id,
            userId: user.id,
            name: (record.data.name as string) || "Untitled",
            icon: (record.data.icon as string) || "📦",
            description: record.data.description as string | undefined,
            attributes: (record.data.attributes as Record<string, unknown>[]) || [],
            builtIn: Boolean(record.data.builtIn),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: customPartCategories.id,
            set: {
              name: (record.data.name as string) || "Untitled",
              icon: (record.data.icon as string) || "📦",
              description: record.data.description as string | undefined,
              attributes: (record.data.attributes as Record<string, unknown>[]) || [],
              builtIn: Boolean(record.data.builtIn),
              updatedAt: new Date(),
            },
          });
      }
      results.partCategories = body.partCategories.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] partCategories upsert failed");
        errors.partCategories = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert category images
    if (body.categoryImages?.length) {
      try {
      for (const record of body.categoryImages) {
        await db
          .insert(categoryImages)
          .values({
            id: record.id,
            userId: user.id,
            categoryId: (record.data.categoryId as string) || "",
            imageBase64: (record.data.imageBase64 as string) || "",
            name: record.data.name as string | undefined,
            mimeType: record.data.mimeType as string | undefined,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: categoryImages.id,
            set: {
              categoryId: (record.data.categoryId as string) || "",
              imageBase64: (record.data.imageBase64 as string) || "",
              name: record.data.name as string | undefined,
              mimeType: record.data.mimeType as string | undefined,
              updatedAt: new Date(),
            },
          });
      }
      results.categoryImages = body.categoryImages.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] categoryImages upsert failed");
        errors.categoryImages = err instanceof Error ? err.message : String(err);
      }
    }

    // Upsert part files
    if (body.partFiles?.length) {
      try {
      for (const record of body.partFiles) {
        await db
          .insert(partFiles)
          .values({
            id: record.id,
            userId: user.id,
            partId: (record.data.partId as string) || "",
            fileBase64: (record.data.fileBase64 as string) || "",
            name: record.data.name as string | undefined,
            mimeType: record.data.mimeType as string | undefined,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: partFiles.id,
            set: {
              partId: (record.data.partId as string) || "",
              fileBase64: (record.data.fileBase64 as string) || "",
              name: record.data.name as string | undefined,
              mimeType: record.data.mimeType as string | undefined,
              updatedAt: new Date(),
            },
          });
      }
      results.partFiles = body.partFiles.length;
      } catch (err) {
        request.log.warn({ err }, "[sync/push] partFiles upsert failed");
        errors.partFiles = err instanceof Error ? err.message : String(err);
      }
    }

    return { ok: true, upserted: results, ...(Object.keys(errors).length > 0 ? { errors } : {}) };
  });
}
