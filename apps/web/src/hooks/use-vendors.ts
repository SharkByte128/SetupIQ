import { useLiveQuery } from "dexie-react-hooks";
import { vendors, type Vendor } from "@setupiq/shared";
import { localDb, type LocalCustomVendor } from "../db/local-db.js";

/**
 * Returns the merged list of built-in + custom vendors, live-updating from Dexie.
 * Custom vendors are appended after built-in ones (excluding "Other" which stays last).
 */
export function useAllVendors(): Vendor[] {
  const custom = useLiveQuery(() =>
    localDb.customVendors.toArray().catch(() => [] as LocalCustomVendor[]),
  ) ?? [];
  if (custom.length === 0) return vendors;

  const other = vendors.find((v) => v.id === "vendor-other");
  const builtIn = vendors.filter((v) => v.id !== "vendor-other");
  const mapped: Vendor[] = custom.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  return [...builtIn, ...mapped, ...(other ? [other] : [])];
}

/**
 * Resolve a vendor ID to a Vendor object, checking both built-in and custom vendors.
 */
export function useVendorLookup(): (id: string) => Vendor | undefined {
  const custom = useLiveQuery(() =>
    localDb.customVendors.toArray().catch(() => [] as LocalCustomVendor[]),
  ) ?? [];
  const customMap = new Map(custom.map((c) => [c.id, { id: c.id, name: c.name, slug: c.slug } as Vendor]));
  return (id: string) => vendors.find((v) => v.id === id) ?? customMap.get(id);
}

/**
 * Returns the raw custom vendor records from Dexie (with abbreviation, color, etc.)
 */
export function useCustomVendors(): LocalCustomVendor[] {
  return useLiveQuery(() =>
    localDb.customVendors.toArray().then(arr => arr.sort((a, b) => a.name.localeCompare(b.name))).catch(() => [] as LocalCustomVendor[]),
  ) ?? [];
}
