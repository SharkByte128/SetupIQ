import Dexie, { type Table } from "dexie";

// ─── Local record types (mirror shared models + sync metadata) ──

export interface LocalSetupSnapshot {
  id: string;
  userId: string;
  carId: string;
  name: string;
  entries: { capabilityId: string; value: string | number | boolean }[];
  wheelTireSetups: {
    position: string;
    side: string;
    wheelId?: string;
    tireId?: string;
    mount?: { method: string; edgeGlue: string };
  }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _dirty: 0 | 1;
}

export interface LocalRunSession {
  id: string;
  userId: string;
  carId: string;
  trackId?: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
  _dirty: 0 | 1;
}

export interface LocalRunSegment {
  id: string;
  sessionId: string;
  setupSnapshotId: string;
  segmentNumber: number;
  feedback?: {
    handling: string[];
    consistency: number;
    notes?: string;
  };
  lapTimes?: { lapNumber: number; timeMs: number; isOutlier?: boolean }[];
  setupChanges?: { capabilityId: string; value: string | number | boolean }[];
  startedAt: string;
  endedAt?: string;
  _dirty: 0 | 1;
}

export interface LocalTrack {
  id: string;
  userId: string;
  name: string;
  location?: string;
  address?: string;
  phone?: string;
  hours?: string;
  timingSystem?: string;
  surfaceType: string;
  tileType?: string;
  dimensions?: string;
  layoutDescription?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _dirty: 0 | 1;
}

export interface LocalComponent {
  id: string;
  userId: string;
  type: string;
  brand: string;
  name: string;
  sku?: string;
  position?: string;
  widthMm?: number;
  offset?: number;
  compound?: string;
  diameterMm?: number;
  color?: string;
  notes?: string;
  createdAt: string;
  _dirty: 0 | 1;
}

export interface LocalMeasurement {
  id: string;
  setupId: string;
  runSessionId?: string;
  cornerWeights?: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
    unit: string;
  };
  totalWeight?: number;
  frontBiasPercent?: number;
  leftBiasPercent?: number;
  crossWeightPercent?: number;
  measuredAt: string;
  source: string;
  _dirty: 0 | 1;
}

export interface LocalRecommendation {
  id: string;
  sessionId: string;
  source: string; // "rule" | "llm"
  priority: string; // "high" | "medium" | "low"
  title: string;
  reasoning: string;
  changes: {
    capabilityId: string;
    capabilityName: string;
    currentValue: string | number | boolean;
    suggestedValue: string | number | boolean;
  }[];
  status: string; // "pending" | "accepted" | "rejected" | "tried"
  outcome?: {
    improved: boolean;
    notes?: string;
    resultSessionId?: string;
  };
  createdAt: string;
  _dirty: 0 | 1;
}

export interface SyncMeta {
  key: string;
  value: string;
}

export interface LocalCarImage {
  id: string;
  carId: string;
  blob: Blob;
  name: string;
  mimeType?: string;
  createdAt: string;
  updatedAt: string;
  _dirty: 0 | 1;
}

export interface LocalRaceResult {
  id: string;
  userId: string;
  carId: string;
  trackId?: string;
  eventName: string;
  community?: string;
  className: string;
  roundType: string; // "practice" | "qualifying" | "main" | "custom"
  roundNumber?: number;
  date: string;
  position: number;
  totalEntries?: number;
  totalLaps: number;
  totalTimeMs: number;
  fastLapMs: number;
  avgLapMs?: number;
  laps: { lapNumber: number; timeMs: number }[];
  sourceUrl?: string;
  setupSnapshotId?: string;
  notes?: string;
  hidden?: 0 | 1;
  createdAt: string;
  _dirty: 0 | 1;
}

export interface LocalPart {
  id: string;
  userId: string;
  vendorId: string;
  categoryId: string;
  name: string;
  sku?: string;
  compatibleChassisIds: string[];
  attributes: Record<string, string | number>;
  notes?: string;
  /** Link to server-side catalog part (null = manual / unlinked) */
  catalogPartId?: string;
  createdAt: string;
  updatedAt: string;
  _dirty: 0 | 1;
}

export interface LocalPartFile {
  id: string;
  partId: string;
  blob: Blob;
  name: string;
  mimeType: string; // "image/*" or "application/pdf"
  createdAt: string;
}

export interface LocalCustomCar {
  id: string;
  userId: string;
  name: string;
  manufacturer: string;
  scale: string;
  driveType: "RWD" | "AWD" | "FWD";
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _dirty: 0 | 1;
}

export interface LocalTrackFile {
  id: string;
  trackId: string;
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: string;
}

export interface LocalRacer {
  id: string;
  name: string;
  active: 0 | 1;
  createdAt: string;
}

class SetupIQDatabase extends Dexie {
  setupSnapshots!: Table<LocalSetupSnapshot, string>;
  runSessions!: Table<LocalRunSession, string>;
  runSegments!: Table<LocalRunSegment, string>;
  tracks!: Table<LocalTrack, string>;
  components!: Table<LocalComponent, string>;
  measurements!: Table<LocalMeasurement, string>;
  recommendations!: Table<LocalRecommendation, string>;
  carImages!: Table<LocalCarImage, string>;
  raceResults!: Table<LocalRaceResult, string>;
  parts!: Table<LocalPart, string>;
  partFiles!: Table<LocalPartFile, string>;
  customCars!: Table<LocalCustomCar, string>;
  trackFiles!: Table<LocalTrackFile, string>;
  racers!: Table<LocalRacer, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super("setupiq");

    this.version(1).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      syncMeta: "key",
    });

    this.version(2).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      syncMeta: "key",
    });

    this.version(3).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId",
      syncMeta: "key",
    });

    this.version(4).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId",
      raceResults: "id, userId, carId, date, className, _dirty",
      syncMeta: "key",
    });

    this.version(5).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId",
      raceResults: "id, userId, carId, date, className, _dirty",
      parts: "id, userId, vendorId, categoryId, _dirty",
      syncMeta: "key",
    });

    this.version(6).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId",
      raceResults: "id, userId, carId, date, className, _dirty",
      parts: "id, userId, vendorId, categoryId, _dirty",
      customCars: "id, userId, manufacturer, _dirty",
      syncMeta: "key",
    });

    this.version(7).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId",
      raceResults: "id, userId, carId, date, className, _dirty",
      parts: "id, userId, vendorId, categoryId, _dirty",
      partFiles: "id, partId",
      customCars: "id, userId, manufacturer, _dirty",
      syncMeta: "key",
    });

    this.version(8).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId",
      raceResults: "id, userId, carId, date, className, _dirty",
      parts: "id, userId, vendorId, categoryId, _dirty",
      partFiles: "id, partId",
      trackFiles: "id, trackId",
      customCars: "id, userId, manufacturer, _dirty",
      syncMeta: "key",
    });

    this.version(9).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId",
      raceResults: "id, userId, carId, date, className, _dirty",
      parts: "id, userId, vendorId, categoryId, _dirty",
      partFiles: "id, partId",
      trackFiles: "id, trackId",
      customCars: "id, userId, manufacturer, _dirty",
      racers: "id, name, active",
      syncMeta: "key",
    });

    this.version(10).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId, updatedAt, _dirty",
      raceResults: "id, userId, carId, date, className, _dirty",
      parts: "id, userId, vendorId, categoryId, _dirty",
      partFiles: "id, partId",
      trackFiles: "id, trackId",
      customCars: "id, userId, manufacturer, _dirty",
      racers: "id, name, active",
      syncMeta: "key",
    }).upgrade(tx => {
      // Add _dirty and updatedAt to existing carImages records
      return tx.table("carImages").toCollection().modify(img => {
        if (img._dirty === undefined) img._dirty = 1;
        if (!img.updatedAt) img.updatedAt = img.createdAt || new Date().toISOString();
      });
    });

    this.version(11).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId, updatedAt, _dirty",
      raceResults: "id, userId, carId, date, className, hidden, _dirty",
      parts: "id, userId, vendorId, categoryId, catalogPartId, _dirty",
      partFiles: "id, partId",
      trackFiles: "id, trackId",
      customCars: "id, userId, manufacturer, _dirty",
      racers: "id, name, active",
      syncMeta: "key",
    }).upgrade(tx => {
      return tx.table("raceResults").toCollection().modify(r => {
        if (r.hidden === undefined) r.hidden = 0;
      });
    });

    this.version(12).stores({
      setupSnapshots: "id, userId, carId, updatedAt, _dirty",
      runSessions: "id, userId, carId, trackId, startedAt, _dirty",
      runSegments: "id, sessionId, setupSnapshotId, _dirty",
      tracks: "id, userId, updatedAt, _dirty",
      components: "id, userId, type, _dirty",
      measurements: "id, setupId, runSessionId, _dirty",
      recommendations: "id, sessionId, status, _dirty",
      carImages: "id, carId, updatedAt, _dirty",
      raceResults: "id, userId, carId, date, className, hidden, _dirty",
      parts: "id, userId, vendorId, categoryId, catalogPartId, _dirty",
      partFiles: "id, partId",
      trackFiles: "id, trackId",
      customCars: "id, userId, manufacturer, _dirty",
      racers: "id, name, active",
      syncMeta: "key",
    });
  }
}

export const localDb = new SetupIQDatabase();
