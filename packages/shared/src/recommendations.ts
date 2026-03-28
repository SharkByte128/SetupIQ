import type {
  HandlingCharacteristic,
  RecommendationContext,
  RecommendationPriority,
  SetupChange,
  SetupEntry,
  CarDefinition,
} from "./models.js";

// ─── Rule Definitions ─────────────────────────────────────────

interface SetupRule {
  id: string;
  /** Handling symptoms that trigger this rule */
  triggers: HandlingCharacteristic[];
  /** Short user-facing title */
  title: string;
  /** Human-readable explanation */
  reasoning: string;
  priority: RecommendationPriority;
  /** Given current setup, return suggested changes (or empty if N/A) */
  suggest: (
    entries: SetupEntry[],
    car: CarDefinition
  ) => SetupChange[];
}

// ─── Helpers ──────────────────────────────────────────────────

function getEntry(
  entries: SetupEntry[],
  capId: string
): SetupEntry | undefined {
  return entries.find((e) => e.capabilityId === capId);
}

function getCapName(car: CarDefinition, capId: string): string {
  return car.capabilities.find((c) => c.id === capId)?.name ?? capId;
}

/** For "pick" capabilities, get the next softer or harder option index */
function shiftPickValue(
  car: CarDefinition,
  capId: string,
  current: string | number | boolean,
  direction: "softer" | "harder"
): string | number | boolean | null {
  const cap = car.capabilities.find((c) => c.id === capId);
  if (!cap?.options) return null;
  const idx = cap.options.findIndex((o) => o.value === current);
  if (idx === -1) return null;
  const nextIdx = direction === "softer" ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= cap.options.length) return null;
  return cap.options[nextIdx].value;
}

// ─── Rule Library ─────────────────────────────────────────────

const rules: SetupRule[] = [
  // ── Understeer ──
  {
    id: "understeer-front-spring",
    triggers: ["understeer", "push-entry"],
    title: "Soften front spring",
    reasoning:
      "Understeer / push on entry often means the front end lacks grip. A softer front spring lets the front load transfer more, improving turn-in.",
    priority: "high",
    suggest(entries, car) {
      const e = getEntry(entries, "front-spring");
      if (!e) return [];
      const next = shiftPickValue(car, "front-spring", e.value, "softer");
      if (!next) return [];
      return [
        {
          capabilityId: "front-spring",
          capabilityName: getCapName(car, "front-spring"),
          currentValue: e.value,
          suggestedValue: next,
        },
      ];
    },
  },
  {
    id: "understeer-front-camber",
    triggers: ["understeer"],
    title: "Increase front camber",
    reasoning:
      "More negative front camber increases the tire contact patch in corners, improving front grip.",
    priority: "medium",
    suggest(entries, car) {
      const e = getEntry(entries, "front-camber");
      if (!e || typeof e.value !== "number") return [];
      const cap = car.capabilities.find((c) => c.id === "front-camber");
      const min = cap?.min ?? -3;
      if (e.value <= min) return [];
      return [
        {
          capabilityId: "front-camber",
          capabilityName: getCapName(car, "front-camber"),
          currentValue: e.value,
          suggestedValue: e.value - 0.5,
        },
      ];
    },
  },
  {
    id: "understeer-front-tplate",
    triggers: ["understeer", "push-entry"],
    title: "Soften front T-plate",
    reasoning:
      "A softer front T-plate allows more front suspension flex, transferring weight to the front tires in corners.",
    priority: "medium",
    suggest(entries, car) {
      const e = getEntry(entries, "front-t-plate");
      if (!e) return [];
      const next = shiftPickValue(car, "front-t-plate", e.value, "softer");
      if (!next) return [];
      return [
        {
          capabilityId: "front-t-plate",
          capabilityName: getCapName(car, "front-t-plate"),
          currentValue: e.value,
          suggestedValue: next,
        },
      ];
    },
  },
  {
    id: "understeer-front-toe",
    triggers: ["understeer"],
    title: "Increase front toe-out",
    reasoning:
      "More toe-out improves turn-in response, reducing the push feeling on corner entry.",
    priority: "low",
    suggest(entries, car) {
      const e = getEntry(entries, "front-toe");
      if (!e || typeof e.value !== "number") return [];
      const cap = car.capabilities.find((c) => c.id === "front-toe");
      const max = cap?.max ?? 4;
      if (e.value >= max) return [];
      return [
        {
          capabilityId: "front-toe",
          capabilityName: getCapName(car, "front-toe"),
          currentValue: e.value,
          suggestedValue: e.value + 0.5,
        },
      ];
    },
  },

  // ── Oversteer / Loose Exit ──
  {
    id: "oversteer-rear-spring",
    triggers: ["oversteer", "loose-exit"],
    title: "Soften rear spring",
    reasoning:
      "Oversteer / loose exit can mean the rear is too stiff, causing it to break traction. A softer rear spring plants the rear.",
    priority: "high",
    suggest(entries, car) {
      const e = getEntry(entries, "rear-spring");
      if (!e) return [];
      const next = shiftPickValue(car, "rear-spring", e.value, "softer");
      if (!next) return [];
      return [
        {
          capabilityId: "rear-spring",
          capabilityName: getCapName(car, "rear-spring"),
          currentValue: e.value,
          suggestedValue: next,
        },
      ];
    },
  },
  {
    id: "oversteer-rear-camber",
    triggers: ["oversteer", "loose-exit"],
    title: "Increase rear camber",
    reasoning:
      "More negative rear camber widens the rear tire contact patch in turns, improving rear grip.",
    priority: "medium",
    suggest(entries, car) {
      const e = getEntry(entries, "rear-camber");
      if (!e || typeof e.value !== "number") return [];
      const cap = car.capabilities.find((c) => c.id === "rear-camber");
      const min = cap?.min ?? -3;
      if (e.value <= min) return [];
      return [
        {
          capabilityId: "rear-camber",
          capabilityName: getCapName(car, "rear-camber"),
          currentValue: e.value,
          suggestedValue: e.value - 0.5,
        },
      ];
    },
  },
  {
    id: "oversteer-rear-damper",
    triggers: ["oversteer", "loose-exit"],
    title: "Use heavier rear friction plate",
    reasoning:
      "A heavier rear friction plate slows rear weight transfer, reducing snap oversteer on exit.",
    priority: "medium",
    suggest(entries, car) {
      const e = getEntry(entries, "rear-damper");
      if (!e) return [];
      const next = shiftPickValue(car, "rear-damper", e.value, "harder");
      if (!next) return [];
      return [
        {
          capabilityId: "rear-damper",
          capabilityName: getCapName(car, "rear-damper"),
          currentValue: e.value,
          suggestedValue: next,
        },
      ];
    },
  },

  // ── Traction Roll ──
  {
    id: "traction-roll-front-spring",
    triggers: ["traction-roll"],
    title: "Stiffen front spring to reduce roll",
    reasoning:
      "Traction roll means the chassis is flexing too much. A stiffer front spring reduces roll at the cost of some turn-in.",
    priority: "high",
    suggest(entries, car) {
      const e = getEntry(entries, "front-spring");
      if (!e) return [];
      const next = shiftPickValue(car, "front-spring", e.value, "harder");
      if (!next) return [];
      return [
        {
          capabilityId: "front-spring",
          capabilityName: getCapName(car, "front-spring"),
          currentValue: e.value,
          suggestedValue: next,
        },
      ];
    },
  },
  {
    id: "traction-roll-ride-height",
    triggers: ["traction-roll"],
    title: "Lower ride height",
    reasoning:
      "Lowering ride height lowers the center of gravity, reducing the tendency to traction roll.",
    priority: "medium",
    suggest(entries, car) {
      const changes: SetupChange[] = [];
      for (const capId of ["front-ride-height", "rear-ride-height"]) {
        const e = getEntry(entries, capId);
        if (!e || typeof e.value !== "number") continue;
        const cap = car.capabilities.find((c) => c.id === capId);
        const min = cap?.min ?? 0;
        if (e.value <= min + 0.2) continue;
        changes.push({
          capabilityId: capId,
          capabilityName: getCapName(car, capId),
          currentValue: e.value,
          suggestedValue: Math.max(min, e.value - 0.3),
        });
      }
      return changes;
    },
  },
  {
    id: "traction-roll-tplate",
    triggers: ["traction-roll"],
    title: "Stiffen front T-plate",
    reasoning:
      "A stiffer T-plate reduces chassis flex through the front end, helping prevent traction roll.",
    priority: "medium",
    suggest(entries, car) {
      const e = getEntry(entries, "front-t-plate");
      if (!e) return [];
      const next = shiftPickValue(car, "front-t-plate", e.value, "harder");
      if (!next) return [];
      return [
        {
          capabilityId: "front-t-plate",
          capabilityName: getCapName(car, "front-t-plate"),
          currentValue: e.value,
          suggestedValue: next,
        },
      ];
    },
  },

  // ── Inconsistency ──
  {
    id: "inconsistent-diff",
    triggers: ["inconsistent"],
    title: "Switch to ball differential",
    reasoning:
      "A spool (locked diff) can cause inconsistent behavior in tight corners. A ball diff allows the wheels to turn at different speeds, improving predictability.",
    priority: "medium",
    suggest(entries, car) {
      const e = getEntry(entries, "diff-type");
      if (!e || e.value === "ball-diff") return [];
      return [
        {
          capabilityId: "diff-type",
          capabilityName: getCapName(car, "diff-type"),
          currentValue: e.value,
          suggestedValue: "ball-diff",
        },
      ];
    },
  },

  // ── Weight Distribution ──
  {
    id: "weight-bias-rear-heavy",
    triggers: ["understeer"],
    title: "Add front ballast",
    reasoning:
      "If the car is rear-heavy, adding ballast to the front improves front grip and reduces understeer.",
    priority: "low",
    suggest(entries, car) {
      const e = getEntry(entries, "ballast-total");
      if (!e || typeof e.value !== "number") return [];
      return [
        {
          capabilityId: "ballast-total",
          capabilityName: getCapName(car, "ballast-total"),
          currentValue: e.value,
          suggestedValue: e.value + 2,
        },
        {
          capabilityId: "ballast-position",
          capabilityName: getCapName(car, "ballast-position"),
          currentValue: getEntry(entries, "ballast-position")?.value ?? "",
          suggestedValue: "front bumper area",
        },
      ];
    },
  },
];

// ─── Public API ───────────────────────────────────────────────

export interface RuleRecommendation {
  ruleId: string;
  title: string;
  reasoning: string;
  priority: RecommendationPriority;
  changes: SetupChange[];
}

/**
 * Generate rule-based recommendations from a recommendation context.
 * Returns at most `limit` suggestions, sorted by priority.
 */
export function generateRuleRecommendations(
  ctx: RecommendationContext,
  car: CarDefinition,
  limit = 5
): RuleRecommendation[] {
  // Aggregate handling characteristics from recent sessions
  const handlingCounts = new Map<HandlingCharacteristic, number>();
  for (const s of ctx.recentSessions) {
    if (!s.feedback) continue;
    for (const h of s.feedback.handling) {
      handlingCounts.set(h, (handlingCounts.get(h) ?? 0) + 1);
    }
  }

  if (handlingCounts.size === 0) return [];

  // Get the dominant characteristics (reported in ≥50% of recent sessions)
  const threshold = Math.max(1, Math.floor(ctx.recentSessions.length / 2));
  const dominantHandling: HandlingCharacteristic[] = [];
  for (const [h, count] of handlingCounts) {
    if (count >= threshold) dominantHandling.push(h);
  }
  // Fall back to all reported if nothing passes threshold
  const activeHandling =
    dominantHandling.length > 0
      ? dominantHandling
      : Array.from(handlingCounts.keys());

  // Track already-tried recommendations to avoid re-suggesting
  const triedTitles = new Set(
    ctx.previousRecommendations
      .filter((r) => r.status === "tried" || r.status === "rejected")
      .map((r) => r.title)
  );

  const results: RuleRecommendation[] = [];

  for (const rule of rules) {
    // Does this rule match any active handling issue?
    if (!rule.triggers.some((t) => activeHandling.includes(t))) continue;

    // Skip if already tried/rejected
    if (triedTitles.has(rule.title)) continue;

    const changes = rule.suggest(ctx.currentSetup, car);
    if (changes.length === 0) continue;

    results.push({
      ruleId: rule.id,
      title: rule.title,
      reasoning: rule.reasoning,
      priority: rule.priority,
      changes,
    });
  }

  // Sort by priority: high > medium > low
  const priorityOrder: Record<RecommendationPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  results.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return results.slice(0, limit);
}

/**
 * Build a structured context object for recommendation generation.
 * Used both by rule engine directly and as LLM prompt input.
 */
export function buildRecommendationPrompt(ctx: RecommendationContext): string {
  const lines: string[] = [];
  lines.push(`Car: ${ctx.car.name} (${ctx.car.driveType})`);
  lines.push("");

  lines.push("Current Setup:");
  for (const e of ctx.currentSetup) {
    lines.push(`  ${e.capabilityId}: ${e.value}`);
  }
  lines.push("");

  if (ctx.cornerWeights) {
    const cw = ctx.cornerWeights;
    const total =
      cw.frontLeft + cw.frontRight + cw.rearLeft + cw.rearRight;
    const frontPct =
      (((cw.frontLeft + cw.frontRight) / total) * 100).toFixed(1);
    lines.push(
      `Corner Weights: FL=${cw.frontLeft}${cw.unit} FR=${cw.frontRight}${cw.unit} RL=${cw.rearLeft}${cw.unit} RR=${cw.rearRight}${cw.unit} (${frontPct}% front)`
    );
    lines.push("");
  }

  lines.push(`Recent Sessions (${ctx.recentSessions.length}):`);
  for (const s of ctx.recentSessions) {
    const parts: string[] = [];
    if (s.feedback) {
      parts.push(`handling=[${s.feedback.handling.join(", ")}]`);
      parts.push(`consistency=${s.feedback.consistency}/5`);
      if (s.feedback.notes) parts.push(`notes="${s.feedback.notes}"`);
    }
    if (s.lapStats) {
      parts.push(
        `best=${s.lapStats.bestMs}ms avg=${s.lapStats.avgMs}ms stddev=${s.lapStats.stdDevMs}ms laps=${s.lapStats.lapCount}`
      );
    }
    lines.push(`  - ${parts.join(", ")}`);
  }
  lines.push("");

  if (ctx.previousRecommendations.length > 0) {
    lines.push("Previous Recommendations:");
    for (const r of ctx.previousRecommendations) {
      const changesStr = r.changes
        .map((c) => `${c.capabilityName}: ${c.currentValue}→${c.suggestedValue}`)
        .join("; ");
      const outcomeStr = r.outcome
        ? ` → ${r.outcome.improved ? "improved" : "no improvement"}${r.outcome.notes ? ` (${r.outcome.notes})` : ""}`
        : "";
      lines.push(`  - [${r.status}] ${r.title}: ${changesStr}${outcomeStr}`);
    }
    lines.push("");
  }

  lines.push(
    "Based on the handling feedback and lap data, suggest specific setup changes with reasoning."
  );
  lines.push(
    "Format each suggestion with: title, reasoning, capability changes (id, current, suggested), and priority (high/medium/low)."
  );

  return lines.join("\n");
}
