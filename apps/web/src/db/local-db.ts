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
  createdAt: string;
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
  }
}

export const localDb = new SetupIQDatabase();
