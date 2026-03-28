// ─── Base Types ───────────────────────────────────────────────

export type UUID = string;
export type ISODateString = string;

// ─── User ─────────────────────────────────────────────────────

export interface UserProfile {
  id: UUID;
  email: string;
  displayName: string;
  provider: "google" | "microsoft";
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─── Car Definition & Capabilities ────────────────────────────

export type ValueType = "pick" | "numeric" | "toggle" | "text";

export interface CapabilityOption {
  label: string;
  value: string | number;
  color?: string;
  sku?: string;
}

export interface Capability {
  id: string;
  name: string;
  category: string;
  valueType: ValueType;
  options?: CapabilityOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue?: string | number | boolean;
  description?: string;
}

export interface CompatibilityRule {
  id: string;
  description: string;
  /** Capability ID that triggers the rule */
  when: { capabilityId: string; value: string | number | boolean };
  /** What must or must not be true */
  then:
    | { allow: { capabilityId: string; values: (string | number)[] } }
    | { deny: { capabilityId: string; values: (string | number)[] } };
}

export type WheelPosition = "front" | "rear";

export interface CarDefinition {
  id: UUID;
  slug: string;
  name: string;
  manufacturer: string;
  scale: string;
  driveType: "RWD" | "AWD" | "FWD";
  capabilities: Capability[];
  compatibilityRules: CompatibilityRule[];
  defaultSetup?: Record<string, string | number | boolean>;
}

// ─── Shared Components ────────────────────────────────────────

export type TireCompound = "super-soft" | "soft" | "medium" | "hard";
export type TireMountMethod = "glued" | "taped";
export type EdgeGlue = "outside" | "inside" | "both" | "none";

export interface TireMount {
  method: TireMountMethod;
  edgeGlue: EdgeGlue;
}

export interface SharedComponent {
  id: UUID;
  type: "tire" | "wheel" | "motor" | "esc" | "servo" | "battery" | "body" | "other";
  brand: string;
  name: string;
  sku?: string;
  notes?: string;
}

export interface TireComponent extends SharedComponent {
  type: "tire";
  position: WheelPosition;
  compound: TireCompound;
  widthMm: number;
  diameterMm?: number;
  color?: string;
}

export interface WheelComponent extends SharedComponent {
  type: "wheel";
  position: WheelPosition;
  widthMm: number;
  /** Signed decimal offset (e.g., -1, 0, +1, +3) */
  offset: number;
  color?: string;
}

// ─── Setup Snapshot ───────────────────────────────────────────

export interface SetupEntry {
  capabilityId: string;
  value: string | number | boolean;
}

export interface WheelTireSetup {
  position: WheelPosition;
  side: "left" | "right";
  wheelId?: UUID;
  tireId?: UUID;
  mount?: TireMount;
}

export interface SetupSnapshot {
  id: UUID;
  userId: UUID;
  carId: UUID;
  name: string;
  entries: SetupEntry[];
  wheelTireSetups: WheelTireSetup[];
  notes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─── Measurements ─────────────────────────────────────────────

export interface CornerWeights {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
  unit: "g" | "oz";
}

export interface Measurement {
  id: UUID;
  setupId: UUID;
  runSessionId?: UUID;
  cornerWeights?: CornerWeights;
  totalWeight?: number;
  frontBiasPercent?: number;
  leftBiasPercent?: number;
  crossWeightPercent?: number;
  measuredAt: ISODateString;
  source: "manual" | "bluetooth";
}

// ─── Run Sessions ─────────────────────────────────────────────

export type HandlingCharacteristic =
  | "understeer"
  | "oversteer"
  | "traction-roll"
  | "push-entry"
  | "loose-exit"
  | "stable"
  | "inconsistent";

export interface DriverFeedback {
  handling: HandlingCharacteristic[];
  consistency: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

export interface LapTime {
  lapNumber: number;
  timeMs: number;
  isOutlier?: boolean;
}

export interface RunSegment {
  id: UUID;
  sessionId: UUID;
  setupSnapshotId: UUID;
  segmentNumber: number;
  feedback?: DriverFeedback;
  lapTimes?: LapTime[];
  setupChanges?: SetupEntry[];
  startedAt: ISODateString;
  endedAt?: ISODateString;
}

export interface RunSession {
  id: UUID;
  userId: UUID;
  carId: UUID;
  trackId?: UUID;
  segments: RunSegment[];
  notes?: string;
  startedAt: ISODateString;
  endedAt?: ISODateString;
}

// ─── Track ────────────────────────────────────────────────────

export type SurfaceType = "rcp" | "carpet" | "wood" | "concrete" | "asphalt" | "other";

export interface Track {
  id: UUID;
  userId: UUID;
  name: string;
  location?: string;
  surfaceType: SurfaceType;
  tileType?: string;
  dimensions?: string;
  layoutDescription?: string;
  notes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ─── Sync ─────────────────────────────────────────────────────

export type SyncStatus = "synced" | "pending" | "conflict";

export interface SyncMeta {
  localUpdatedAt: ISODateString;
  serverUpdatedAt?: ISODateString;
  syncStatus: SyncStatus;
  dirty: boolean;
}
