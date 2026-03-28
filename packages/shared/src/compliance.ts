import type { SetupEntry, CarDefinition, WheelTireSetup } from "./models.js";

export interface ComplianceViolation {
  rule: string;
  description: string;
  severity: "critical" | "warning";
}

export interface ComplianceResult {
  compliant: boolean;
  violations: ComplianceViolation[];
  carId: string;
  ruleSet: string;
}

interface PnwcRule {
  id: string;
  description: string;
  severity: "critical" | "warning";
  check: (entries: SetupEntry[], wheelTires: WheelTireSetup[], car: CarDefinition) => boolean;
}

// ─── PNWC F1 Class Rules ─────────────────────────────────────

const pnwcF1Rules: PnwcRule[] = [
  {
    id: "pnwc-gearing-pinion",
    description: "PNWC requires 12T pinion (64 pitch)",
    severity: "critical",
    check: (entries) => {
      const pinion = entries.find((e) => e.capabilityId === "pinion-gear");
      return pinion?.value === "12";
    },
  },
  {
    id: "pnwc-gearing-spur",
    description: "PNWC requires 53T spur gear (64 pitch)",
    severity: "critical",
    check: (entries) => {
      const spur = entries.find((e) => e.capabilityId === "spur-gear");
      return spur?.value === "53";
    },
  },
  {
    id: "pnwc-motor-handout",
    description: "PNWC requires handout PN V4 Anima 2500kv motor",
    severity: "warning",
    check: (entries) => {
      const motor = entries.find((e) => e.capabilityId === "motor");
      if (!motor || typeof motor.value !== "string") return false;
      const v = motor.value.toLowerCase();
      return v.includes("anima") && v.includes("2500");
    },
  },
  {
    id: "pnwc-no-gyro",
    description: "PNWC does not allow gyro usage",
    severity: "critical",
    check: () => true, // Can't check this from setup data; always passes
  },
  {
    id: "pnwc-battery-2s",
    description: "PNWC requires 2S LiPo (max 8.40V)",
    severity: "warning",
    check: (entries) => {
      const battery = entries.find((e) => e.capabilityId === "battery");
      if (!battery || typeof battery.value !== "string") return false;
      return battery.value.toLowerCase().includes("2s");
    },
  },
  {
    id: "pnwc-min-weight",
    description: "PNWC minimum weight: 140 g",
    severity: "critical",
    check: (entries) => {
      const weight = entries.find((e) => e.capabilityId === "total-weight");
      if (!weight || typeof weight.value !== "number") return true; // Can't verify if not recorded
      return weight.value >= 140;
    },
  },
];

// ─── Generic MR-03 Rules ─────────────────────────────────────

const pnwcMiniZRules: PnwcRule[] = [
  {
    id: "pnwc-miniz-motor",
    description: "PNWC Mini-Z requires handout motor",
    severity: "warning",
    check: (entries) => {
      const motor = entries.find((e) => e.capabilityId === "motor");
      return motor !== undefined; // Just flagging—always requires handout
    },
  },
];

// ─── Public API ───────────────────────────────────────────────

const ruleSetMap: Record<string, PnwcRule[]> = {
  "car-mrx-me": pnwcF1Rules,
  "car-mr03-rwd": pnwcMiniZRules,
};

export function checkPnwcCompliance(
  carId: string,
  entries: SetupEntry[],
  wheelTires: WheelTireSetup[],
  car: CarDefinition
): ComplianceResult {
  const rules = ruleSetMap[carId] ?? [];
  const violations: ComplianceViolation[] = [];

  for (const rule of rules) {
    if (!rule.check(entries, wheelTires, car)) {
      violations.push({
        rule: rule.id,
        description: rule.description,
        severity: rule.severity,
      });
    }
  }

  return {
    compliant: violations.filter((v) => v.severity === "critical").length === 0,
    violations,
    carId,
    ruleSet: "PNWC",
  };
}
