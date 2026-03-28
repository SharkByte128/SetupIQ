import type { CarDefinition } from "../models.js";
import { mr03Rwd } from "./mr03-rwd.js";
import { mrxMasterEdition } from "./mrx-me.js";
import { reflexRx28 } from "./rx28.js";

/** Registry of all known car definitions, keyed by slug. */
export const carRegistry: Record<string, CarDefinition> = {
  [mr03Rwd.slug]: mr03Rwd,
  [mrxMasterEdition.slug]: mrxMasterEdition,
  [reflexRx28.slug]: reflexRx28,
};

/** Ordered list of all available cars. */
export const allCars: CarDefinition[] = [mr03Rwd, mrxMasterEdition, reflexRx28];

/** Look up a car by its id (UUID) or slug. */
export function getCarById(idOrSlug: string): CarDefinition | undefined {
  return allCars.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
}

export { mr03Rwd, mrxMasterEdition, reflexRx28 };
