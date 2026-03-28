import type { CarDefinition } from "../models.js";
import { mr03Rwd } from "./mr03-rwd.js";
import { mrxMasterEdition } from "./mrx-me.js";
import { reflexRx28 } from "./rx28.js";
import { evo2_5600kv } from "./evo2-5600kv.js";

/** Registry of all known car definitions, keyed by slug. */
export const carRegistry: Record<string, CarDefinition> = {
  [mr03Rwd.slug]: mr03Rwd,
  [mrxMasterEdition.slug]: mrxMasterEdition,
  [reflexRx28.slug]: reflexRx28,
  [evo2_5600kv.slug]: evo2_5600kv,
};

/** Ordered list of all available cars. */
export const allCars: CarDefinition[] = [mr03Rwd, mrxMasterEdition, reflexRx28, evo2_5600kv];

/** Look up a car by its id (UUID) or slug. */
export function getCarById(idOrSlug: string): CarDefinition | undefined {
  return allCars.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
}

export { mr03Rwd, mrxMasterEdition, reflexRx28, evo2_5600kv };
