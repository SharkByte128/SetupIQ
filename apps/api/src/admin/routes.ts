import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { users, drivers } from "../db/schema.js";
import { eq } from "drizzle-orm";

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
}
