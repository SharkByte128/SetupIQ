import type { TireComponent, WheelComponent } from "../models.js";

// ── Front Tires ──────────────────────────────────────────────

export const frontTires: TireComponent[] = [
  {
    id: "tire-kyosho-30-front",
    type: "tire",
    brand: "Kyosho",
    name: "Kyosho 30",
    position: "front",
    compound: "hard",
    widthMm: 8.5,
    color: "Yellow",
    notes: "Medium/Hard — stock option",
  },
  {
    id: "tire-marka-v5-front-25",
    type: "tire",
    brand: "Marka",
    name: "Marka V5 Front 25° / 11 mm",
    position: "front",
    compound: "medium",
    widthMm: 11,
    color: "White",
  },
  {
    id: "tire-gekko-fm-gk002",
    type: "tire",
    brand: "Gekko",
    name: "Gekko FM-GK-002",
    sku: "FM-GK-002",
    position: "front",
    compound: "medium",
    widthMm: 8.5,
    color: "Red",
  },
  {
    id: "tire-gekko-fs-gk001",
    type: "tire",
    brand: "Gekko",
    name: "Gekko FS-GK-001",
    sku: "FS-GK-001",
    position: "front",
    compound: "soft",
    widthMm: 8.5,
    color: "Black",
  },
];

// ── Rear Tires ───────────────────────────────────────────────

export const rearTires: TireComponent[] = [
  {
    id: "tire-kyosho-30-rear",
    type: "tire",
    brand: "Kyosho",
    name: "Kyosho 30",
    position: "rear",
    compound: "hard",
    widthMm: 11,
    color: "Yellow",
    notes: "Medium/Hard — stock option",
  },
  {
    id: "tire-kyosho-20-rear",
    type: "tire",
    brand: "Kyosho",
    name: "Kyosho 20",
    position: "rear",
    compound: "medium",
    widthMm: 11,
    color: "Red",
  },
  {
    id: "tire-gekko-rm1-gk004",
    type: "tire",
    brand: "Gekko",
    name: "Gekko RM1-GK-004",
    sku: "RM1-GK-004",
    position: "rear",
    compound: "medium",
    widthMm: 11,
    color: "Gray",
  },
  {
    id: "tire-marka-mzr-v1rr15",
    type: "tire",
    brand: "Marka",
    name: "Marka MZR V1RR15",
    sku: "MZR-V1RR15",
    position: "rear",
    compound: "medium",
    widthMm: 14,
    color: "White",
    notes: "Medium/Soft",
  },
  {
    id: "tire-gekko-rs1-gk003",
    type: "tire",
    brand: "Gekko",
    name: "Gekko RS1 GK-003",
    sku: "RS1-GK-003",
    position: "rear",
    compound: "soft",
    widthMm: 11,
    color: "Black",
  },
];

// ── Front Wheels ─────────────────────────────────────────────

export const frontWheels: WheelComponent[] = [
  {
    id: "wheel-sh-jud-85-p1",
    type: "wheel",
    brand: "Silver Horse",
    name: 'EVO "JUD" 8.5 mm +1',
    position: "front",
    widthMm: 8.5,
    offset: 1,
  },
  {
    id: "wheel-sh-jud-85-p0",
    type: "wheel",
    brand: "Silver Horse",
    name: 'EVO "JUD" 8.5 mm +0',
    position: "front",
    widthMm: 8.5,
    offset: 0,
  },
  {
    id: "wheel-sh-jud-85-n1",
    type: "wheel",
    brand: "Silver Horse",
    name: 'EVO "JUD" 8.5 mm -1',
    position: "front",
    widthMm: 8.5,
    offset: -1,
  },
];

// ── Rear Wheels ──────────────────────────────────────────────

export const rearWheels: WheelComponent[] = [
  {
    id: "wheel-sh-jud-11-p3",
    type: "wheel",
    brand: "Silver Horse",
    name: 'EVO "JUD" 11 mm +3',
    position: "rear",
    widthMm: 11,
    offset: 3,
  },
  {
    id: "wheel-sh-jud-11-p2",
    type: "wheel",
    brand: "Silver Horse",
    name: 'EVO "JUD" 11 mm +2',
    position: "rear",
    widthMm: 11,
    offset: 2,
  },
  {
    id: "wheel-sh-jud-11-p1",
    type: "wheel",
    brand: "Silver Horse",
    name: 'EVO "JUD" 11 mm +1',
    position: "rear",
    widthMm: 11,
    offset: 1,
  },
  {
    id: "wheel-sh-jud-11-p0",
    type: "wheel",
    brand: "Silver Horse",
    name: 'EVO "JUD" 11 mm +0',
    position: "rear",
    widthMm: 11,
    offset: 0,
  },
];

// ── Aggregates ───────────────────────────────────────────────

export const allTires: TireComponent[] = [...frontTires, ...rearTires];
export const allWheels: WheelComponent[] = [...frontWheels, ...rearWheels];
