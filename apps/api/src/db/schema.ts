import { pgTable, uuid, text, timestamp, jsonb, varchar, integer, real, boolean, decimal } from "drizzle-orm/pg-core";

// ─── Users ────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  username: text("username").unique(),
  apiToken: text("api_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Drivers (multiple per user) ──────────────────────────────

export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Tracks ───────────────────────────────────────────────────

export const tracks = pgTable("tracks", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  location: text("location"),
  address: text("address"),
  phone: text("phone"),
  hours: text("hours"),
  timingSystem: text("timing_system"),
  surfaceType: varchar("surface_type", { length: 20 }).notNull(),
  tileType: text("tile_type"),
  dimensions: text("dimensions"),
  layoutDescription: text("layout_description"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Shared Components ────────────────────────────────────────

export const components = pgTable("components", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 20 }).notNull(),
  brand: text("brand").notNull(),
  name: text("name").notNull(),
  sku: text("sku"),
  position: varchar("position", { length: 10 }),
  widthMm: real("width_mm"),
  offset: real("offset"),
  compound: varchar("compound", { length: 20 }),
  diameterMm: real("diameter_mm"),
  color: text("color"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Setup Snapshots ──────────────────────────────────────────

export const setupSnapshots = pgTable("setup_snapshots", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  carId: text("car_id").notNull(),
  name: text("name").notNull(),
  entries: jsonb("entries").notNull().$type<{ capabilityId: string; value: string | number | boolean }[]>(),
  wheelTireSetups: jsonb("wheel_tire_setups").notNull().$type<{
    position: string;
    side: string;
    wheelId?: string;
    tireId?: string;
    mount?: { method: string; edgeGlue: string };
  }[]>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Run Sessions ─────────────────────────────────────────────

export const runSessions = pgTable("run_sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  carId: text("car_id").notNull(),
  trackId: text("track_id").references(() => tracks.id),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const runSegments = pgTable("run_segments", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => runSessions.id),
  setupSnapshotId: text("setup_snapshot_id").notNull().references(() => setupSnapshots.id),
  segmentNumber: integer("segment_number").notNull(),
  feedback: jsonb("feedback").$type<{
    handling: string[];
    consistency: number;
    notes?: string;
  }>(),
  lapTimes: jsonb("lap_times").$type<{ lapNumber: number; timeMs: number; isOutlier?: boolean }[]>(),
  setupChanges: jsonb("setup_changes").$type<{ capabilityId: string; value: string | number | boolean }[]>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

// ─── Measurements ─────────────────────────────────────────────

export const measurements = pgTable("measurements", {
  id: text("id").primaryKey(),
  setupId: text("setup_id").notNull().references(() => setupSnapshots.id),
  runSessionId: text("run_session_id").references(() => runSessions.id),
  cornerWeights: jsonb("corner_weights").$type<{
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
    unit: string;
  }>(),
  totalWeight: real("total_weight"),
  frontBiasPercent: real("front_bias_percent"),
  leftBiasPercent: real("left_bias_percent"),
  crossWeightPercent: real("cross_weight_percent"),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
});

// ─── Parts ────────────────────────────────────────────────────

export const parts = pgTable("parts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  vendorId: text("vendor_id").notNull(),
  categoryId: text("category_id").notNull(),
  name: text("name").notNull(),
  sku: text("sku"),
  compatibleChassisIds: jsonb("compatible_chassis_ids").notNull().$type<string[]>(),
  attributes: jsonb("attributes").notNull().$type<Record<string, string | number>>(),
  notes: text("notes"),
  catalogPartId: uuid("catalog_part_id").references(() => catalogParts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Race Results ─────────────────────────────────────────────

export const raceResults = pgTable("race_results", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  carId: text("car_id").notNull(),
  trackId: text("track_id"),
  eventName: text("event_name").notNull(),
  community: text("community"),
  className: text("class_name").notNull(),
  roundType: varchar("round_type", { length: 20 }).notNull(),
  roundNumber: integer("round_number"),
  date: text("date").notNull(),
  position: integer("position").notNull(),
  totalEntries: integer("total_entries"),
  totalLaps: integer("total_laps").notNull(),
  totalTimeMs: integer("total_time_ms").notNull(),
  fastLapMs: integer("fast_lap_ms").notNull(),
  avgLapMs: integer("avg_lap_ms"),
  laps: jsonb("laps").notNull().$type<{ lapNumber: number; timeMs: number }[]>(),
  sourceUrl: text("source_url"),
  setupSnapshotId: text("setup_snapshot_id"),
  notes: text("notes"),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Custom Cars ──────────────────────────────────────────────

export const customCars = pgTable("custom_cars", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  scale: text("scale").notNull(),
  driveType: varchar("drive_type", { length: 10 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Car Images ───────────────────────────────────────────────

export const carImages = pgTable("car_images", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  carId: text("car_id").notNull(),
  imageBase64: text("image_base64").notNull(),
  name: text("name"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// ─── Parts Catalog (global, server-only) ──────────────────────
// ═══════════════════════════════════════════════════════════════

export const catalogParts = pgTable("catalog_parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  brand: text("brand"),
  category: varchar("category", { length: 40 }).notNull(),
  baseSku: text("base_sku").notNull().unique(),
  description: text("description"),
  primaryImageUrl: text("primary_image_url"),
  instructionsPdfUrl: text("instructions_pdf_url"),
  tags: jsonb("tags").$type<string[]>().default([]),
  /** Text to show on the setup page when this part is selected */
  setupDisplayText: text("setup_display_text"),
  /** Which setup capability IDs this part maps to (e.g. ["front-spring", "rear-spring"]) */
  setupFieldIds: jsonb("setup_field_ids").$type<string[]>().default([]),
  /** Attribute values for this part (compound, rate, kv, etc.) */
  attributes: jsonb("attributes").$type<Record<string, string | number>>().default({}),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Car Platform Compatibility ───────────────────────────────

export const catalogPartCompatibility = pgTable("catalog_part_compatibility", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogPartId: uuid("catalog_part_id").notNull().references(() => catalogParts.id, { onDelete: "cascade" }),
  /** References CarDefinition.id from shared package (e.g. "car-mrx-me") */
  carPlatformId: text("car_platform_id").notNull(),
  notes: text("notes"),
});

// ─── Part Images (stored in DB) ───────────────────────────────

export const catalogPartImages = pgTable("catalog_part_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogPartId: uuid("catalog_part_id").notNull().references(() => catalogParts.id, { onDelete: "cascade" }),
  imageBase64: text("image_base64").notNull(),
  mimeType: varchar("mime_type", { length: 60 }).notNull().default("image/jpeg"),
  sortOrder: integer("sort_order").notNull().default(0),
  /** When set, image only applies to variants matching these attribute values (e.g. { color: "gold" }) */
  variantFilter: jsonb("variant_filter").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Part Variants (individual SKUs within a parent part) ─────

export const catalogPartVariants = pgTable("catalog_part_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogPartId: uuid("catalog_part_id").notNull().references(() => catalogParts.id, { onDelete: "cascade" }),
  sku: text("sku").notNull().unique(),
  label: text("label").notNull(),
  variantAttributes: jsonb("variant_attributes").$type<Record<string, string>>().default({}),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Vendor Sources (where we ingest from) ────────────────────

export const vendorSources = pgTable("vendor_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  baseUrl: text("base_url").notNull(),
  ingestionRules: jsonb("ingestion_rules").$type<Record<string, unknown>>().default({}),
  enabled: boolean("enabled").notNull().default(true),
  robotsCompliant: boolean("robots_compliant").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Vendor Offers (product listings per vendor) ──────────────

export const vendorOffers = pgTable("vendor_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogPartId: uuid("catalog_part_id").references(() => catalogParts.id, { onDelete: "set null" }),
  vendorSourceId: uuid("vendor_source_id").notNull().references(() => vendorSources.id, { onDelete: "cascade" }),
  vendorSku: text("vendor_sku"),
  productName: text("product_name").notNull(),
  productUrl: text("product_url"),
  imageUrl: text("image_url"),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  /** null = pending review, linked = matched to catalog part */
  matchStatus: varchar("match_status", { length: 20 }).notNull().default("pending"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── User Parts Bin (catalog-linked ownership) ────────────────

export const userPartsBin = pgTable("user_parts_bin", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  catalogPartId: uuid("catalog_part_id").notNull().references(() => catalogParts.id),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
