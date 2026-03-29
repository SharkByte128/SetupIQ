import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/index.js";
import {
  catalogParts,
  catalogPartCompatibility,
  vendorOffers,
  vendorSources,
  userPartsBin,
} from "../db/schema.js";
import { eq, and, ilike, or, inArray, sql } from "drizzle-orm";

type AuthUser = { id: string; email: string; displayName: string };

// ─── Helper: require JWT ───────────────────────────────────────

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  try {
    await request.jwtVerify();
    return request.user as AuthUser;
  } catch {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
}

// ─── Helper: require sysadmin ──────────────────────────────────

function requireSysadmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const expectedUser = process.env.SYSADMIN_USER;
  const expectedToken = process.env.SYSADMIN_USER_API_TOKEN;
  if (!expectedUser || !expectedToken) {
    reply.status(503).send({ error: "Admin not configured" });
    return false;
  }

  // Accept X-Api-Token header (CLI / direct calls)
  const directToken = (request.headers["x-api-token"] ?? "") as string;
  if (directToken === expectedToken) return true;

  // Accept Bearer base64(user:token) (admin panel)
  const auth = (request.headers.authorization ?? "") as string;
  if (auth.startsWith("Bearer ")) {
    try {
      const decoded = Buffer.from(auth.slice(7), "base64").toString("utf-8");
      const [user, apiToken] = decoded.split(":");
      if (user === expectedUser && apiToken === expectedToken) return true;
    } catch { /* fall through */ }
  }

  reply.status(403).send({ error: "Forbidden" });
  return false;
}

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  // ═══════════════════════════════════════════════════════════
  // PUBLIC CATALOG (read-only, requires auth)
  // ═══════════════════════════════════════════════════════════

  // ─── Browse / Search catalog parts ──────────────────────────

  app.get("/api/catalog/parts", async (request: FastifyRequest<{
    Querystring: {
      q?: string;
      category?: string;
      brand?: string;
      carPlatformId?: string;
      page?: string;
      limit?: string;
    };
  }>, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { q, category, brand, carPlatformId } = request.query;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "50", 10)));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [eq(catalogParts.status, "active")];
    if (category) conditions.push(eq(catalogParts.category, category));
    if (brand) conditions.push(ilike(catalogParts.brand, brand));
    if (q) {
      conditions.push(
        or(
          ilike(catalogParts.name, `%${q}%`),
          ilike(catalogParts.baseSku, `%${q}%`),
          ilike(catalogParts.description, `%${q}%`),
        )!,
      );
    }

    let partIds: string[] | undefined;

    // If filtering by car platform, get compatible part IDs first
    if (carPlatformId) {
      const compat = await db
        .select({ catalogPartId: catalogPartCompatibility.catalogPartId })
        .from(catalogPartCompatibility)
        .where(eq(catalogPartCompatibility.carPlatformId, carPlatformId));
      partIds = compat.map((c) => c.catalogPartId);
      if (partIds.length === 0) {
        return reply.send({ parts: [], total: 0, page, limit });
      }
    }

    // Count
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(catalogParts)
      .where(and(...conditions));

    // Fetch
    let query = db
      .select()
      .from(catalogParts)
      .where(and(...conditions))
      .orderBy(catalogParts.name)
      .limit(limit)
      .offset(offset);

    if (partIds) {
      const partIdCondition = inArray(catalogParts.id, partIds);
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(catalogParts)
        .where(and(...conditions, partIdCondition));
      const rows = await db
        .select()
        .from(catalogParts)
        .where(and(...conditions, partIdCondition))
        .orderBy(catalogParts.name)
        .limit(limit)
        .offset(offset);
      return reply.send({ parts: rows, total: countResult[0]?.count ?? 0, page, limit });
    }

    const [countResult, rows] = await Promise.all([countQuery, query]);
    return reply.send({ parts: rows, total: countResult[0]?.count ?? 0, page, limit });
  });

  // ─── Get single catalog part with compatibility + offers ────

  app.get("/api/catalog/parts/:id", async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { id } = request.params;
    const [part] = await db.select().from(catalogParts).where(eq(catalogParts.id, id)).limit(1);
    if (!part) return reply.status(404).send({ error: "Part not found" });

    const [compat, offers] = await Promise.all([
      db.select().from(catalogPartCompatibility).where(eq(catalogPartCompatibility.catalogPartId, id)),
      db.select().from(vendorOffers).where(eq(vendorOffers.catalogPartId, id)),
    ]);

    return reply.send({ ...part, compatibility: compat, offers });
  });

  // ═══════════════════════════════════════════════════════════
  // USER PARTS BIN
  // ═══════════════════════════════════════════════════════════

  // ─── List user's parts bin ──────────────────────────────────

  app.get("/api/users/me/parts-bin", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const rows = await db
      .select({
        id: userPartsBin.id,
        catalogPartId: userPartsBin.catalogPartId,
        quantity: userPartsBin.quantity,
        notes: userPartsBin.notes,
        createdAt: userPartsBin.createdAt,
        updatedAt: userPartsBin.updatedAt,
        partName: catalogParts.name,
        partBrand: catalogParts.brand,
        partCategory: catalogParts.category,
        partBaseSku: catalogParts.baseSku,
        partImageUrl: catalogParts.primaryImageUrl,
        partSetupFieldIds: catalogParts.setupFieldIds,
        partAttributes: catalogParts.attributes,
      })
      .from(userPartsBin)
      .innerJoin(catalogParts, eq(userPartsBin.catalogPartId, catalogParts.id))
      .where(eq(userPartsBin.userId, user.id))
      .orderBy(catalogParts.category, catalogParts.name);

    return reply.send({ items: rows });
  });

  // ─── Add catalog part to bin (or increment qty) ─────────────

  app.post("/api/users/me/parts-bin", async (request: FastifyRequest<{
    Body: { catalogPartId: string; quantity?: number; notes?: string };
  }>, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { catalogPartId, quantity = 1, notes } = request.body;

    // Verify catalog part exists
    const [part] = await db.select().from(catalogParts).where(eq(catalogParts.id, catalogPartId)).limit(1);
    if (!part) return reply.status(404).send({ error: "Catalog part not found" });

    // Check if already in bin
    const [existing] = await db
      .select()
      .from(userPartsBin)
      .where(and(eq(userPartsBin.userId, user.id), eq(userPartsBin.catalogPartId, catalogPartId)))
      .limit(1);

    if (existing) {
      // Increment quantity
      await db
        .update(userPartsBin)
        .set({
          quantity: sql`${userPartsBin.quantity} + ${quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(userPartsBin.id, existing.id));
      return reply.send({ id: existing.id, action: "incremented" });
    }

    // Insert new
    const [row] = await db
      .insert(userPartsBin)
      .values({ userId: user.id, catalogPartId, quantity, notes })
      .returning({ id: userPartsBin.id });

    return reply.status(201).send({ id: row.id, action: "added" });
  });

  // ─── Update bin entry (qty, notes) ──────────────────────────

  app.patch("/api/users/me/parts-bin/:id", async (request: FastifyRequest<{
    Params: { id: string };
    Body: { quantity?: number; notes?: string };
  }>, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { id } = request.params;
    const { quantity, notes } = request.body;

    const [existing] = await db
      .select()
      .from(userPartsBin)
      .where(and(eq(userPartsBin.id, id), eq(userPartsBin.userId, user.id)))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (quantity !== undefined) updates.quantity = quantity;
    if (notes !== undefined) updates.notes = notes;

    await db.update(userPartsBin).set(updates).where(eq(userPartsBin.id, id));
    return reply.send({ ok: true });
  });

  // ─── Remove from bin ────────────────────────────────────────

  app.delete("/api/users/me/parts-bin/:id", async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { id } = request.params;
    const result = await db
      .delete(userPartsBin)
      .where(and(eq(userPartsBin.id, id), eq(userPartsBin.userId, user.id)));

    return reply.send({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════
  // SETUP OPTIONS RESOLVER
  // ═══════════════════════════════════════════════════════════

  app.get("/api/setup/options", async (request: FastifyRequest<{
    Querystring: { carPlatformId: string };
  }>, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { carPlatformId } = request.query;
    if (!carPlatformId) return reply.status(400).send({ error: "carPlatformId required" });

    // Get user's bin part IDs
    const binItems = await db
      .select({ catalogPartId: userPartsBin.catalogPartId })
      .from(userPartsBin)
      .where(eq(userPartsBin.userId, user.id));
    const ownedPartIds = new Set(binItems.map((b) => b.catalogPartId));

    if (ownedPartIds.size === 0) return reply.send({ options: {} });

    // Get compatible parts for this platform that user owns
    const compatParts = await db
      .select({
        catalogPartId: catalogPartCompatibility.catalogPartId,
      })
      .from(catalogPartCompatibility)
      .where(eq(catalogPartCompatibility.carPlatformId, carPlatformId));

    const compatIds = new Set(compatParts.map((c) => c.catalogPartId));

    // Intersect: owned AND compatible
    const eligibleIds = [...ownedPartIds].filter((id) => compatIds.has(id));
    if (eligibleIds.length === 0) return reply.send({ options: {} });

    // Fetch the catalog parts
    const parts = await db
      .select()
      .from(catalogParts)
      .where(and(eq(catalogParts.status, "active"), inArray(catalogParts.id, eligibleIds)));

    // Group by setup field
    const options: Record<string, { label: string; value: string; partId: string; attributes: Record<string, string | number> }[]> = {};
    for (const part of parts) {
      const fieldIds = (part.setupFieldIds as string[]) ?? [];
      for (const fieldId of fieldIds) {
        if (!options[fieldId]) options[fieldId] = [];
        options[fieldId].push({
          label: `${part.brand ? part.brand + " " : ""}${part.name}`,
          value: part.baseSku,
          partId: part.id,
          attributes: (part.attributes as Record<string, string | number>) ?? {},
        });
      }
    }

    return reply.send({ options });
  });

  // ═══════════════════════════════════════════════════════════
  // ADMIN: Catalog Management (sysadmin only)
  // ═══════════════════════════════════════════════════════════

  // ─── List catalog parts (admin) ─────────────────────────────

  app.get("/api/admin/catalog/parts", async (request: FastifyRequest<{
    Querystring: { baseSku?: string };
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    const conditions = [];
    if (request.query.baseSku) {
      conditions.push(eq(catalogParts.baseSku, request.query.baseSku));
    }

    const rows = await db
      .select()
      .from(catalogParts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(catalogParts.name)
      .limit(500);

    return reply.send({ parts: rows });
  });

  // ─── Create catalog part ────────────────────────────────────

  app.post("/api/admin/catalog/parts", async (request: FastifyRequest<{
    Body: {
      name: string;
      brand?: string;
      category: string;
      baseSku: string;
      description?: string;
      primaryImageUrl?: string;
      instructionsPdfUrl?: string;
      tags?: string[];
      setupFieldIds?: string[];
      attributes?: Record<string, string | number>;
      compatibility?: { carPlatformId: string; notes?: string }[];
    };
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    const body = request.body;
    try {
      const [part] = await db
        .insert(catalogParts)
        .values({
          name: body.name,
          brand: body.brand,
          category: body.category,
          baseSku: body.baseSku,
          description: body.description,
          primaryImageUrl: body.primaryImageUrl,
          instructionsPdfUrl: body.instructionsPdfUrl,
          tags: body.tags ?? [],
          setupFieldIds: body.setupFieldIds ?? [],
          attributes: body.attributes ?? {},
        })
        .returning();

      // Add compatibility entries
      if (body.compatibility?.length) {
        await db.insert(catalogPartCompatibility).values(
          body.compatibility.map((c) => ({
            catalogPartId: part.id,
            carPlatformId: c.carPlatformId,
            notes: c.notes,
          })),
        );
      }

      return reply.status(201).send(part);
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(409).send({ error: "A part with that SKU already exists" });
      }
      throw err;
    }
  });

  // ─── Update catalog part ────────────────────────────────────

  app.patch("/api/admin/catalog/parts/:id", async (request: FastifyRequest<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      brand: string;
      category: string;
      baseSku: string;
      description: string;
      primaryImageUrl: string;
      instructionsPdfUrl: string;
      tags: string[];
      setupFieldIds: string[];
      attributes: Record<string, string | number>;
      status: string;
    }>;
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    const { id } = request.params;
    const updates = { ...request.body, updatedAt: new Date() };

    await db.update(catalogParts).set(updates).where(eq(catalogParts.id, id));
    return reply.send({ ok: true });
  });

  // ─── Set compatibility for a part ───────────────────────────

  app.put("/api/admin/catalog/parts/:id/compatibility", async (request: FastifyRequest<{
    Params: { id: string };
    Body: { compatibility: { carPlatformId: string; notes?: string }[] };
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    const { id } = request.params;
    // Replace all
    await db.delete(catalogPartCompatibility).where(eq(catalogPartCompatibility.catalogPartId, id));
    if (request.body.compatibility.length) {
      await db.insert(catalogPartCompatibility).values(
        request.body.compatibility.map((c) => ({
          catalogPartId: id,
          carPlatformId: c.carPlatformId,
          notes: c.notes,
        })),
      );
    }
    return reply.send({ ok: true });
  });

  // ─── List vendor sources ────────────────────────────────────

  app.get("/api/admin/catalog/vendor-sources", async (request, reply) => {
    if (!requireSysadmin(request, reply)) return;
    const rows = await db.select().from(vendorSources).orderBy(vendorSources.name);
    return reply.send({ sources: rows });
  });

  // ─── Create vendor source ──────────────────────────────────

  app.post("/api/admin/catalog/vendor-sources", async (request: FastifyRequest<{
    Body: {
      name: string;
      type: string;
      baseUrl: string;
      ingestionRules?: Record<string, unknown>;
    };
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    const [row] = await db
      .insert(vendorSources)
      .values({
        name: request.body.name,
        type: request.body.type,
        baseUrl: request.body.baseUrl,
        ingestionRules: request.body.ingestionRules ?? {},
      })
      .returning();
    return reply.status(201).send(row);
  });

  // ─── List vendor offers (pending review) ────────────────────

  app.get("/api/admin/catalog/vendor-offers", async (request: FastifyRequest<{
    Querystring: { status?: string; vendorSourceId?: string };
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    const conditions = [];
    if (request.query.status) conditions.push(eq(vendorOffers.matchStatus, request.query.status));
    if (request.query.vendorSourceId) conditions.push(eq(vendorOffers.vendorSourceId, request.query.vendorSourceId));

    const rows = await db
      .select()
      .from(vendorOffers)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(vendorOffers.createdAt)
      .limit(200);

    return reply.send({ offers: rows });
  });

  // ─── Link vendor offer to catalog part ──────────────────────

  app.patch("/api/admin/catalog/vendor-offers/:id/link", async (request: FastifyRequest<{
    Params: { id: string };
    Body: { catalogPartId: string };
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    await db
      .update(vendorOffers)
      .set({
        catalogPartId: request.body.catalogPartId,
        matchStatus: "linked",
      })
      .where(eq(vendorOffers.id, request.params.id));

    return reply.send({ ok: true });
  });

  // ─── Trigger ingestion for a vendor source ──────────────────

  app.post("/api/admin/catalog/vendor-sources/:id/ingest", async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    if (!requireSysadmin(request, reply)) return;

    const { ingestVendorSource } = await import("./ingest.js");
    try {
      const result = await ingestVendorSource(request.params.id);
      return reply.send({ ok: true, fetched: result.fetched, upserted: result.upserted });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
