// ─── Parts Bin — Vendors, Categories, Chassis Platforms, Part Catalog ──

// ── Vendor Definitions ────────────────────────────────────────

export interface Vendor {
  id: string;
  name: string;
  /** Short slug for CSS classes / icon lookup */
  slug: string;
}

export const vendors: Vendor[] = [
  { id: "vendor-kyosho", name: "Kyosho", slug: "kyosho" },
  { id: "vendor-pn-racing", name: "PN Racing", slug: "pn-racing" },
  { id: "vendor-nexx-racing", name: "NEXX Racing", slug: "nexx-racing" },
  { id: "vendor-silver-horse", name: "Silver Horse", slug: "silver-horse" },
  { id: "vendor-atomic-rc", name: "ATOMIC RC", slug: "atomic-rc" },
  { id: "vendor-reflex-racing", name: "Reflex Racing", slug: "reflex-racing" },
  { id: "vendor-gl-racing", name: "GL Racing", slug: "gl-racing" },
  { id: "vendor-mpower", name: "MPower", slug: "mpower" },
  { id: "vendor-hobby-plus", name: "Hobby Plus", slug: "hobby-plus" },
  { id: "vendor-yeah-racing", name: "Yeah Racing", slug: "yeah-racing" },
  { id: "vendor-3racing", name: "3Racing", slug: "3racing" },
  { id: "vendor-futaba", name: "Futaba", slug: "futaba" },
  { id: "vendor-ko-propo", name: "KO Propo", slug: "ko-propo" },
  { id: "vendor-spektrum", name: "Spektrum", slug: "spektrum" },
  { id: "vendor-hobbywing", name: "Hobbywing", slug: "hobbywing" },
  { id: "vendor-other", name: "Other", slug: "other" },
];

export function getVendorById(id: string): Vendor | undefined {
  return vendors.find((v) => v.id === id);
}

// ── Chassis Platforms ─────────────────────────────────────────

export interface ChassisPlatform {
  id: string;
  name: string;
  manufacturer: string;
}

export const chassisPlatforms: ChassisPlatform[] = [
  { id: "chassis-kyosho-mr03", name: "Kyosho MR-03", manufacturer: "Kyosho" },
  { id: "chassis-kyosho-mr04", name: "Kyosho MR-04", manufacturer: "Kyosho" },
  { id: "chassis-pn-25", name: "PN 2.5 Chassis", manufacturer: "PN Racing" },
  { id: "chassis-mr04-evo2", name: "MR-04 Evo2", manufacturer: "GL Racing" },
];

// ── Part Categories ───────────────────────────────────────────

export type PartCategoryId =
  | "chassis-models"
  | "front-springs"
  | "rear-springs"
  | "motors"
  | "motor-mounts"
  | "diff"
  | "front-tires"
  | "rear-tires"
  | "kingpins"
  | "batteries"
  | "knuckles";

/** Extra fields required when adding a part of this category */
export interface PartAttribute {
  key: string;
  label: string;
  type: "text" | "number" | "pick";
  options?: string[];
  unit?: string;
  required?: boolean;
}

export interface PartCategory {
  id: PartCategoryId;
  name: string;
  icon: string; // emoji for simple mobile display
  attributes: PartAttribute[];
}

export const partCategories: PartCategory[] = [
  {
    id: "chassis-models",
    name: "Chassis Models",
    icon: "🏗️",
    attributes: [
      { key: "material", label: "Material", type: "pick", options: ["Plastic", "Aluminum", "Carbon Fiber", "Brass"] },
      { key: "width", label: "Width (mm)", type: "number", unit: "mm" },
    ],
  },
  {
    id: "front-springs",
    name: "Front Springs",
    icon: "🔵",
    attributes: [
      { key: "rate", label: "Rate / Stiffness", type: "pick", options: ["Super Soft", "Soft", "Medium", "Hard", "Super Hard"] },
      { key: "color", label: "Color", type: "text" },
      { key: "length", label: "Length (mm)", type: "number", unit: "mm" },
    ],
  },
  {
    id: "rear-springs",
    name: "Rear Springs",
    icon: "🔴",
    attributes: [
      { key: "rate", label: "Rate / Stiffness", type: "pick", options: ["Super Soft", "Soft", "Medium", "Hard", "Super Hard"] },
      { key: "color", label: "Color", type: "text" },
      { key: "style", label: "Style", type: "pick", options: ["Vertical", "Horizontal", "Top Spring"] },
    ],
  },
  {
    id: "motors",
    name: "Motors",
    icon: "⚡",
    attributes: [
      { key: "kv", label: "KV Rating", type: "number", unit: "kv", required: true },
      { key: "motorType", label: "Type", type: "pick", options: ["Brushless", "Brushed"] },
      { key: "canSize", label: "Can Size", type: "text" },
    ],
  },
  {
    id: "motor-mounts",
    name: "Motor Mounts",
    icon: "🔧",
    attributes: [
      { key: "material", label: "Material", type: "pick", options: ["Aluminum", "Carbon Fiber", "Plastic"] },
      { key: "mountType", label: "Mount Type", type: "text" },
    ],
  },
  {
    id: "diff",
    name: "Diff",
    icon: "⚙️",
    attributes: [
      { key: "diffType", label: "Type", type: "pick", options: ["Ball Diff", "Gear Diff", "Spool", "One-Way"] },
      { key: "material", label: "Material", type: "text" },
    ],
  },
  {
    id: "front-tires",
    name: "Front Tires",
    icon: "🟢",
    attributes: [
      { key: "compound", label: "Compound", type: "pick", options: ["Super Soft", "Soft", "Medium", "Hard"], required: true },
      { key: "widthMm", label: "Width (mm)", type: "number", unit: "mm" },
      { key: "diameterMm", label: "Diameter (mm)", type: "number", unit: "mm" },
      { key: "color", label: "Color", type: "text" },
      { key: "shore", label: "Shore Rating", type: "text" },
    ],
  },
  {
    id: "rear-tires",
    name: "Rear Tires",
    icon: "🔵",
    attributes: [
      { key: "compound", label: "Compound", type: "pick", options: ["Super Soft", "Soft", "Medium", "Hard"], required: true },
      { key: "widthMm", label: "Width (mm)", type: "number", unit: "mm" },
      { key: "diameterMm", label: "Diameter (mm)", type: "number", unit: "mm" },
      { key: "color", label: "Color", type: "text" },
      { key: "shore", label: "Shore Rating", type: "text" },
    ],
  },
  {
    id: "kingpins",
    name: "Kingpins",
    icon: "📌",
    attributes: [
      { key: "material", label: "Material", type: "pick", options: ["Steel", "Titanium", "Aluminum"] },
      { key: "length", label: "Length (mm)", type: "number", unit: "mm" },
    ],
  },
  {
    id: "batteries",
    name: "Batteries",
    icon: "🔋",
    attributes: [
      { key: "capacity", label: "Capacity (mAh)", type: "number", unit: "mAh", required: true },
      { key: "voltage", label: "Voltage", type: "pick", options: ["3.7V (1S)", "7.4V (2S)"] },
      { key: "cRating", label: "C Rating", type: "number" },
      { key: "chemistry", label: "Chemistry", type: "pick", options: ["LiPo", "LiFe", "LiHV"] },
    ],
  },
  {
    id: "knuckles",
    name: "Knuckles",
    icon: "🦴",
    attributes: [
      { key: "material", label: "Material", type: "pick", options: ["Aluminum", "Plastic", "Carbon Composite"] },
      { key: "casterAngle", label: "Caster Angle (°)", type: "number", unit: "°" },
      { key: "version", label: "Version", type: "text" },
    ],
  },
];

export function getCategoryById(id: string): PartCategory | undefined {
  return partCategories.find((c) => c.id === id);
}

// ── Part Model (user-created parts) ──────────────────────────

export interface Part {
  id: string;
  vendorId: string;
  categoryId: PartCategoryId;
  name: string;
  sku?: string;
  /** Which chassis platforms this part is compatible with */
  compatibleChassisIds: string[];
  /** Category-specific attribute values, keyed by attribute key */
  attributes: Record<string, string | number>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
