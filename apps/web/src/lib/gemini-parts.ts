import { localDb } from "../db/local-db.js";
import {
  vendors,
  partCategories,
  chassisPlatforms,
  type PartCategoryId,
} from "@setupiq/shared";

/**
 * Result returned by Gemini for a part SKU lookup.
 * All fields are optional — the AI fills in what it can.
 */
export interface PartLookupResult {
  name?: string;
  vendorId?: string;
  categoryId?: PartCategoryId;
  compatibleChassisIds?: string[];
  attributes?: Record<string, string | number>;
  notes?: string;
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = `You are an expert on 1:28-scale RC car parts (Mini-Z, Atomic RC, PN Racing, NEXX Racing, Reflex Racing, GL Racing, Silver Horse, etc.).

Given a part number / SKU, return a JSON object with as many of these fields as you can determine:
- "name": Full product name
- "vendorSlug": One of: ${vendors.map((v) => `"${v.slug}"`).join(", ")}
- "categoryId": One of: ${partCategories.map((c) => `"${c.id}"`).join(", ")}
- "compatibleChassis": Array of compatible chassis from: ${chassisPlatforms.map((c) => `"${c.id}"`).join(", ")}
- "attributes": Object with category-specific fields. Known attribute keys by category:
${partCategories.map((c) => `  ${c.id}: ${c.attributes.map((a) => a.key).join(", ")}`).join("\n")}
- "notes": Any relevant details about the part

Return ONLY valid JSON, no markdown fences, no extra text. If you cannot identify the part, return {"error": "Unknown part number"}.`;

export async function lookupPartBySku(
  sku: string,
): Promise<{ result?: PartLookupResult; error?: string }> {
  const keyRow = await localDb.syncMeta.get("gemini_api_key");
  const apiKey = keyRow?.value?.trim();

  if (!apiKey) {
    return { error: "No Gemini API key configured. Add one in Settings." };
  }

  if (!sku.trim()) {
    return { error: "Enter a SKU / part number first." };
  }

  try {
    const resp = await fetch(
      `${GEMINI_API_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              parts: [
                {
                  text: `Look up this RC part number: "${sku.trim()}". Return the JSON details.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      if (resp.status === 400 || resp.status === 403) {
        return { error: "Invalid Gemini API key. Check Settings." };
      }
      return { error: `Gemini API error (${resp.status}): ${errBody.slice(0, 200)}` };
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      return { error: "Empty response from Gemini." };
    }

    const parsed = JSON.parse(text);

    if (parsed.error) {
      return { error: parsed.error };
    }

    // Map vendorSlug → vendorId
    const result: PartLookupResult = {};

    if (parsed.name) result.name = parsed.name;
    if (parsed.notes) result.notes = parsed.notes;

    if (parsed.vendorSlug) {
      const v = vendors.find((v) => v.slug === parsed.vendorSlug);
      if (v) result.vendorId = v.id;
    }

    if (parsed.categoryId) {
      const c = partCategories.find((c) => c.id === parsed.categoryId);
      if (c) result.categoryId = c.id as PartCategoryId;
    }

    if (Array.isArray(parsed.compatibleChassis)) {
      result.compatibleChassisIds = parsed.compatibleChassis.filter(
        (id: string) => chassisPlatforms.some((c) => c.id === id),
      );
    }

    if (parsed.attributes && typeof parsed.attributes === "object") {
      result.attributes = {};
      for (const [k, v] of Object.entries(parsed.attributes)) {
        if (v !== null && v !== undefined && v !== "") {
          result.attributes[k] = v as string | number;
        }
      }
    }

    return { result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Lookup failed: ${msg}` };
  }
}

// ─── Bulk Suggest Parts for a Chassis ─────────────────────────

export interface SuggestedPart {
  name: string;
  sku?: string;
  vendorId: string;
  categoryId: PartCategoryId;
  compatibleChassisIds: string[];
  attributes: Record<string, string | number>;
  notes?: string;
}

const SUGGEST_SYSTEM_PROMPT = `You are an expert on 1:28-scale RC car parts (Mini-Z, Atomic RC, PN Racing, NEXX Racing, Reflex Racing, GL Racing, Silver Horse, etc.).

Given a chassis/car name, return a JSON object with a "parts" array of popular optional/upgrade parts available for that car. Include parts from ALL relevant vendors.

Each part object must have:
- "name": Full product name
- "sku": Part number if known (optional)
- "vendorSlug": One of: ${vendors.map((v) => `"${v.slug}"`).join(", ")}
- "categoryId": One of: ${partCategories.map((c) => `"${c.id}"`).join(", ")}
- "compatibleChassis": Array from: ${chassisPlatforms.map((c) => `"${c.id}"`).join(", ")}
- "attributes": Object with category-specific fields. Known keys:
${partCategories.map((c) => `  ${c.id}: ${c.attributes.map((a) => a.key).join(", ")}`).join("\n")}
- "notes": Brief info about the part (optional)

Include parts across all relevant categories: springs, motors, motor mounts, tires, diffs, kingpins, batteries, knuckles, chassis upgrades, etc.
Aim for 20-40 parts covering a good variety.
Return ONLY valid JSON: {"parts": [...]}. No markdown fences.`;

export async function suggestPartsForChassis(
  chassisName: string,
): Promise<{ parts?: SuggestedPart[]; error?: string }> {
  const keyRow = await localDb.syncMeta.get("gemini_api_key");
  const apiKey = keyRow?.value?.trim();

  if (!apiKey) {
    return { error: "No Gemini API key configured. Add one in Settings." };
  }

  try {
    const resp = await fetch(
      `${GEMINI_API_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SUGGEST_SYSTEM_PROMPT }] },
          contents: [
            {
              parts: [
                {
                  text: `List all popular optional and upgrade parts for the "${chassisName}" RC car. Include parts from multiple vendors across all categories.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      if (resp.status === 400 || resp.status === 403) {
        return { error: "Invalid Gemini API key. Check Settings." };
      }
      return { error: `Gemini API error (${resp.status}): ${errBody.slice(0, 200)}` };
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      return { error: "Empty response from Gemini." };
    }

    const parsed = JSON.parse(text);
    const rawParts = Array.isArray(parsed) ? parsed : parsed.parts ?? [];

    if (!Array.isArray(rawParts) || rawParts.length === 0) {
      return { error: "No parts returned by AI." };
    }

    const suggestedParts: SuggestedPart[] = [];

    for (const raw of rawParts) {
      if (!raw.name || !raw.vendorSlug || !raw.categoryId) continue;

      const vendor = vendors.find((v) => v.slug === raw.vendorSlug);
      const category = partCategories.find((c) => c.id === raw.categoryId);
      if (!vendor || !category) continue;

      const attrs: Record<string, string | number> = {};
      if (raw.attributes && typeof raw.attributes === "object") {
        for (const [k, v] of Object.entries(raw.attributes)) {
          if (v !== null && v !== undefined && v !== "") {
            attrs[k] = v as string | number;
          }
        }
      }

      suggestedParts.push({
        name: raw.name,
        sku: raw.sku || undefined,
        vendorId: vendor.id,
        categoryId: category.id as PartCategoryId,
        compatibleChassisIds: Array.isArray(raw.compatibleChassis)
          ? raw.compatibleChassis.filter((id: string) =>
              chassisPlatforms.some((c) => c.id === id),
            )
          : [],
        attributes: attrs,
        notes: raw.notes || undefined,
      });
    }

    return { parts: suggestedParts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Suggestion failed: ${msg}` };
  }
}
