import { pgTable, uuid, text, timestamp, jsonb, varchar, integer, real, boolean } from "drizzle-orm/pg-core";

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

// ─── Tracks ───────────────────────────────────────────────────

export const tracks = pgTable("tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  id: uuid("id").primaryKey().defaultRandom(),
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
  id: uuid("id").primaryKey().defaultRandom(),
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
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  carId: text("car_id").notNull(),
  trackId: uuid("track_id").references(() => tracks.id),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const runSegments = pgTable("run_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => runSessions.id),
  setupSnapshotId: uuid("setup_snapshot_id").notNull().references(() => setupSnapshots.id),
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
  id: uuid("id").primaryKey().defaultRandom(),
  setupId: uuid("setup_id").notNull().references(() => setupSnapshots.id),
  runSessionId: uuid("run_session_id").references(() => runSessions.id),
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
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  vendorId: text("vendor_id").notNull(),
  categoryId: text("category_id").notNull(),
  name: text("name").notNull(),
  sku: text("sku"),
  compatibleChassisIds: jsonb("compatible_chassis_ids").notNull().$type<string[]>(),
  attributes: jsonb("attributes").notNull().$type<Record<string, string | number>>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Race Results ─────────────────────────────────────────────

export const raceResults = pgTable("race_results", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Custom Cars ──────────────────────────────────────────────

export const customCars = pgTable("custom_cars", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  scale: text("scale").notNull(),
  driveType: varchar("drive_type", { length: 10 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
