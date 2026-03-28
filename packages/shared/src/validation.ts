import type { CarDefinition, SetupEntry, CompatibilityRule } from "./models.js";

export interface ValidationError {
  ruleId: string;
  description: string;
  capabilityId: string;
  invalidValue: string | number | boolean;
}

/**
 * Validates a set of setup entries against a car definition's compatibility rules.
 * Returns an array of validation errors (empty = valid setup).
 */
export function validateSetup(
  car: CarDefinition,
  entries: SetupEntry[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const valueMap = new Map<string, string | number | boolean>();

  for (const entry of entries) {
    valueMap.set(entry.capabilityId, entry.value);
  }

  for (const rule of car.compatibilityRules) {
    const triggerValue = valueMap.get(rule.when.capabilityId);

    // Rule only fires when the trigger matches
    if (triggerValue === undefined || triggerValue !== rule.when.value) continue;

    if ("deny" in rule.then) {
      const constrained = valueMap.get(rule.then.deny.capabilityId);
      if (constrained !== undefined && rule.then.deny.values.includes(constrained as never)) {
        errors.push({
          ruleId: rule.id,
          description: rule.description,
          capabilityId: rule.then.deny.capabilityId,
          invalidValue: constrained,
        });
      }
    }

    if ("allow" in rule.then) {
      const constrained = valueMap.get(rule.then.allow.capabilityId);
      if (constrained !== undefined && !rule.then.allow.values.includes(constrained as never)) {
        errors.push({
          ruleId: rule.id,
          description: rule.description,
          capabilityId: rule.then.allow.capabilityId,
          invalidValue: constrained,
        });
      }
    }
  }

  return errors;
}

/**
 * Given a car definition, current entries, and the capability being edited,
 * returns the set of allowed values for pick-type capabilities (filtered by rules).
 */
export function getAllowedValues(
  car: CarDefinition,
  entries: SetupEntry[],
  targetCapabilityId: string,
): (string | number)[] | null {
  const cap = car.capabilities.find((c) => c.id === targetCapabilityId);
  if (!cap || cap.valueType !== "pick" || !cap.options) return null;

  let allowed = cap.options.map((o) => o.value);
  const valueMap = new Map<string, string | number | boolean>();
  for (const entry of entries) {
    valueMap.set(entry.capabilityId, entry.value);
  }

  for (const rule of car.compatibilityRules) {
    const triggerValue = valueMap.get(rule.when.capabilityId);
    if (triggerValue === undefined || triggerValue !== rule.when.value) continue;

    if ("deny" in rule.then && rule.then.deny.capabilityId === targetCapabilityId) {
      const denied = rule.then.deny.values;
      allowed = allowed.filter((v) => !denied.includes(v as never));
    }

    if ("allow" in rule.then && rule.then.allow.capabilityId === targetCapabilityId) {
      const permitted = rule.then.allow.values;
      allowed = allowed.filter((v) => permitted.includes(v as never));
    }
  }

  return allowed;
}
