import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "../db/index.js";
import { users, drivers, tracks, setupSnapshots, runSessions, runSegments } from "../db/schema.js";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSADMIN_USER = process.env.SYSADMIN_USER || "";
const SYSADMIN_TOKEN = process.env.SYSADMIN_USER_API_TOKEN || "";

// ─── Admin auth: verify sysadmin credentials via Bearer token ─

function adminAuth(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!SYSADMIN_USER || !SYSADMIN_TOKEN) {
    reply.status(503).send({ error: "Admin panel not configured" });
    return;
  }

  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Unauthorized" });
    return;
  }

  const token = auth.slice(7);
  // Token format: "username:apiToken" base64-encoded
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [user, apiToken] = decoded.split(":");
    if (user === SYSADMIN_USER && apiToken === SYSADMIN_TOKEN) {
      done();
      return;
    }
  } catch {
    // fall through to unauthorized
  }

  reply.status(401).send({ error: "Invalid credentials" });
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // ─── Login (validates sysadmin creds, returns token) ──────

  app.post("/admin/api/login", async function (request: FastifyRequest<{ Body: { username: string; apiToken: string } }>, reply: FastifyReply) {
    const { username, apiToken } = request.body || {};

    if (!SYSADMIN_USER || !SYSADMIN_TOKEN) {
      return reply.status(503).send({ error: "Admin panel not configured" });
    }

    if (username === SYSADMIN_USER && apiToken === SYSADMIN_TOKEN) {
      const token = Buffer.from(`${username}:${apiToken}`).toString("base64");
      return { token };
    }

    return reply.status(401).send({ error: "Invalid credentials" });
  });

  // ─── Users: List ──────────────────────────────────────────

  app.get("/admin/api/users", { preHandler: adminAuth }, async function () {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        apiToken: users.apiToken,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt);

    return allUsers;
  });

  // ─── Users: Create ────────────────────────────────────────

  app.post<{ Body: { username: string; displayName?: string } }>("/admin/api/users", { preHandler: adminAuth }, async function (request, reply) {
    const { username, displayName } = request.body;

    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return reply.status(400).send({ error: "Username must be at least 2 characters" });
    }

    const cleanUsername = username.trim().toLowerCase();

    const existing = await db.select().from(users).where(eq(users.username, cleanUsername)).limit(1);
    if (existing.length > 0) {
      return reply.status(409).send({ error: "Username already taken" });
    }

    const apiToken = randomBytes(32).toString("hex");

    try {
      const inserted = await db
        .insert(users)
        .values({
          email: `${cleanUsername}@token.local`,
          displayName: displayName?.trim() || cleanUsername,
          provider: "token",
          username: cleanUsername,
          apiToken,
        })
        .returning();

      return inserted[0];
    } catch (err: any) {
      request.log.error(err, "Failed to create user");
      return reply.status(500).send({ error: err.message || "Failed to create user" });
    }
  });

  // ─── Users: Delete ────────────────────────────────────────

  app.delete<{ Params: { id: string } }>("/admin/api/users/:id", { preHandler: adminAuth }, async function (request, reply) {
    const { id } = request.params;

    // Delete drivers first (FK constraint)
    await db.delete(drivers).where(eq(drivers.userId, id));
    const deleted = await db.delete(users).where(eq(users.id, id)).returning();

    if (deleted.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }

    return { ok: true };
  });

  // ─── Users: Regenerate API Token ──────────────────────────

  app.post<{ Params: { id: string } }>("/admin/api/users/:id/regenerate-token", { preHandler: adminAuth }, async function (request, reply) {
    const { id } = request.params;
    const newToken = randomBytes(32).toString("hex");

    const updated = await db
      .update(users)
      .set({ apiToken: newToken, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (updated.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }

    return { apiToken: newToken };
  });

  // ─── Drivers: List for a user ─────────────────────────────

  app.get<{ Params: { id: string } }>("/admin/api/users/:id/drivers", { preHandler: adminAuth }, async function (request) {
    const { id } = request.params;

    const userDrivers = await db
      .select()
      .from(drivers)
      .where(eq(drivers.userId, id))
      .orderBy(drivers.createdAt);

    return userDrivers;
  });

  // ─── Drivers: Add ─────────────────────────────────────────

  app.post<{ Params: { id: string }; Body: { name: string } }>("/admin/api/users/:id/drivers", { preHandler: adminAuth }, async function (request, reply) {
    const { id } = request.params;
    const { name } = request.body;

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return reply.status(400).send({ error: "Driver name is required" });
    }

    // Verify user exists
    const user = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (user.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }

    const inserted = await db
      .insert(drivers)
      .values({
        userId: id,
        name: name.trim(),
      })
      .returning();

    return inserted[0];
  });

  // ─── Drivers: Delete ──────────────────────────────────────

  app.delete<{ Params: { id: string } }>("/admin/api/drivers/:id", { preHandler: adminAuth }, async function (request, reply) {
    const { id } = request.params;

    const deleted = await db.delete(drivers).where(eq(drivers.id, id)).returning();

    if (deleted.length === 0) {
      return reply.status(404).send({ error: "Driver not found" });
    }

    return { ok: true };
  });

  // ─── Copy Demo Data to User ───────────────────────────────

  app.post<{ Body: { username: string } }>("/admin/api/copy-demo", { preHandler: adminAuth }, async function (request, reply) {
    const { username } = request.body;
    if (!username || typeof username !== "string") {
      return reply.status(400).send({ error: "username is required" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.username, cleanUsername)).limit(1);
    if (!user) {
      return reply.status(404).send({ error: `User '${cleanUsername}' not found` });
    }

    // Load build-data.json
    let buildData: any;
    try {
      const dataPath = path.resolve(__dirname, "data", "build-data.json");
      buildData = JSON.parse(readFileSync(dataPath, "utf-8"));
    } catch (err: any) {
      request.log.error(err, "Failed to read build-data.json");
      return reply.status(500).send({ error: "Could not read seed data file" });
    }

    const now = new Date();
    let tracksInserted = 0;
    let setupsInserted = 0;
    let sessionsInserted = 0;
    let segmentsInserted = 0;

    // ── Insert "The Cave" track ──
    try {
      await db.insert(tracks).values({
        id: "track-the-cave",
        userId: user.id,
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
      }).onConflictDoNothing();
      tracksInserted++;
    } catch (err: any) {
      request.log.warn(err, "Track insert skipped (may already exist)");
    }

    // ── Insert baseline setup ──
    try {
      await db.insert(setupSnapshots).values({
        id: "setup-mrx-me-baseline",
        userId: user.id,
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
          { position: "front", side: "left", wheelId: "wheel-sh-jud-85-p1", tireId: "tire-marka-v5-front-25" },
          { position: "front", side: "right", wheelId: "wheel-sh-jud-85-p1", tireId: "tire-marka-v5-front-25" },
          { position: "rear", side: "left", wheelId: "wheel-sh-jud-11-p3", tireId: "tire-marka-mzr-v1rr15" },
          { position: "rear", side: "right", wheelId: "wheel-sh-jud-11-p3", tireId: "tire-marka-mzr-v1rr15" },
        ],
        notes:
          "Built per MRX Master Edition manual. Practice motor (non-handout). " +
          "Silver Horse wheels — swap to PN Delrin for PNWC. " +
          "Ball diff: tighten fully, back off 1/8 to 1/4 turn.",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
      setupsInserted++;
    } catch (err: any) {
      request.log.warn(err, "Baseline setup insert skipped");
    }

    // ── Import historical sessions from build-data.json ──
    for (const session of buildData.sessions) {
      const sessionDate = new Date(`${session.date}T12:00:00.000Z`);

      // Session snapshot
      try {
        await db.insert(setupSnapshots).values({
          id: session.snapshotId,
          userId: user.id,
          carId: session.carId,
          name: session.snapshotName,
          entries: session.setupEntries.map((e: any) => ({
            capabilityId: e.capabilityId,
            value: e.value,
          })),
          wheelTireSetups: [],
          notes: `Baseline setup for test session ${session.date}`,
          createdAt: sessionDate,
          updatedAt: sessionDate,
        }).onConflictDoNothing();
        setupsInserted++;
      } catch (err: any) {
        request.log.warn(err, `Setup snapshot ${session.snapshotId} skipped`);
      }

      // Run session
      try {
        await db.insert(runSessions).values({
          id: session.sessionId,
          userId: user.id,
          carId: session.carId,
          trackId: session.trackId,
          notes: `Test ${session.date} — ${session.segments.length} segments, ${session.totalLaps} laps`,
          startedAt: sessionDate,
          endedAt: sessionDate,
        }).onConflictDoNothing();
        sessionsInserted++;
      } catch (err: any) {
        request.log.warn(err, `Session ${session.sessionId} skipped`);
      }

      // Segments
      for (const seg of session.segments) {
        try {
          await db.insert(runSegments).values({
            id: seg.id,
            sessionId: session.sessionId,
            setupSnapshotId: session.snapshotId,
            segmentNumber: seg.segmentNumber,
            feedback: {
              handling: seg.feedback ? [seg.feedback] : [],
              consistency: 0,
              notes: `${seg.description} | ${seg.repeat} | fast: ${seg.fastLapSec}s avg: ${seg.avgInfo}`,
            },
            lapTimes: seg.lapTimes.map((l: any) => ({
              lapNumber: l.lapNumber,
              timeMs: l.timeMs,
              isOutlier: l.timeMs > 60000,
            })),
            setupChanges: [
              { capabilityId: "setup-change", value: seg.description },
            ],
            startedAt: sessionDate,
            endedAt: sessionDate,
          }).onConflictDoNothing();
          segmentsInserted++;
        } catch (err: any) {
          request.log.warn(err, `Segment ${seg.id} skipped`);
        }
      }
    }

    return {
      ok: true,
      userId: user.id,
      username: cleanUsername,
      inserted: { tracks: tracksInserted, setups: setupsInserted, sessions: sessionsInserted, segments: segmentsInserted },
    };
  });
}
