# 📦 Parts Catalog Specification
_RC Car Setup App_

## Purpose

The Parts Catalog is a **global, read-only catalog** of RC car parts available to all users of the system.  
Users browse the catalog and add items to their **personal Parts Bin**.  
Only parts in a user’s Parts Bin are available as selectable options in the **Setup Form**.

This system enables:
- Consistent part definitions (SKU-based)
- Platform compatibility filtering
- Setup-form option generation based on owned parts
- Future expansion into referral / affiliate links (out of scope for now)

---

## Core Concepts

### Catalog Part
A canonical representation of a physical RC part (e.g., springs, tires, chassis options).

A catalog part:
- Has **one base SKU**
- May have multiple vendor listings
- May apply to one or more car platforms
- May map to one or more setup form fields

---

### Parts Bin
A **user-owned collection** of catalog parts.

Rules:
- Users must own a part (in Parts Bin) to select it in a setup
- Quantity is tracked but does not affect setup logic (yet)

---

### Setup Form Integration
Setup form fields dynamically populate **only** from:
1. Parts in the user’s Parts Bin
2. Parts compatible with the selected car platform
3. Parts explicitly mapped to that setup field

---

## Data Model

### `catalog_parts`
Canonical parts table.

| Field | Type | Notes |
|-----|-----|------|
| id | uuid | Primary key |
| name | string | Display name |
| brand | string | Optional |
| category | enum | chassis, suspension, tires, wheels, electronics |
| base_sku | string | Canonical SKU (required, unique) |
| description | text | Optional |
| primary_image_url | string | Optional |
| instructions_pdf_url | string | Optional |
| tags | string[] | Optional |
| created_at | datetime | |
| updated_at | datetime | |

---

### `car_platforms`

| Field | Type | Notes |
|-----|-----|------|
| id | uuid | |
| name | string | e.g. “Atomic RC MRX Master Edition” |
| platform_code | string | Optional internal identifier |

---

### `catalog_part_compatibility`

Defines which parts fit which platforms.

| Field | Type |
|-----|-----|
| id | uuid |
| catalog_part_id | fk |
| car_platform_id | fk |
| notes | text |

---

### `setup_fields`

Defines all possible setup form fields.

| Field | Type | Example |
|-----|-----|--------|
| id | uuid | |
| key | string | `front_spring`, `rear_tire` |
| label | string | “Front Spring” |
| input_type | enum | select, number, text |
| category | string | suspension, tires |

---

### `catalog_part_setup_mapping`

Controls how a part appears in the setup form.

| Field | Type | Notes |
|-----|-----|------|
| id | uuid | |
| catalog_part_id | fk | |
| setup_field_id | fk | |
| option_label | string | User-facing label |
| option_value | string | Stored value (SKU or normalized token) |
| sort_order | int | |
| constraints | json | Optional conditional logic |

> A single catalog part may generate **multiple setup options**
> (example: spring set with soft / medium / hard variants).

---

### `user_parts_bin`

User-owned parts.

| Field | Type |
|-----|-----|
| id | uuid |
| user_id | fk |
| catalog_part_id | fk |
| quantity | int |
| notes | text |
| created_at | datetime |

---

### `vendor_sources`

Defines approved ingestion sources.

| Field | Type | Notes |
|-----|-----|------|
| id | uuid | |
| name | string | Vendor name |
| type | enum | shopify, api, html, manual |
| base_url | string | |
| ingestion_rules | json | Selectors / mappings |
| enabled | boolean | |
| robots_compliant | boolean | Must be true |

---

### `vendor_offers`

Vendor-specific listings for catalog parts.

| Field | Type |
|-----|-----|
| id | uuid |
| catalog_part_id | fk |
| vendor_source_id | fk |
| vendor_sku | string |
| product_url | string |
| image_url | string |
| price | decimal |
| currency | string |
| last_seen_at | datetime |

---

## User Workflows

### Browse Catalog
- Filter by car platform
- Filter by category
- Search by name or SKU
- View part details (images, PDFs, compatibility)

---

### Add to Parts Bin
- Adds catalog part to user’s bin
- Increases quantity if already owned

---

### Setup Form Resolution Logic

For each setup field:

1. Identify selected car platform
2. Find setup field by key
3. Return options where:
   - Part exists in user’s Parts Bin
   - Part is compatible with the car platform
   - Part is mapped to the setup field

If no options exist:
- Show “No compatible parts in your bin”
- Provide link to browse catalog (no purchase links)

---

## Ingestion / Scraping Rules

⚠️ **Compliance-first design**

Catalog ingestion MUST:
- Prefer official APIs (Shopify, vendor feeds)
- Respect robots.txt and site terms
- Never scrape restricted or disallowed pages

### Ingestion Pipeline

1. Fetch products from vendor source
2. Normalize fields
3. Match or create catalog parts using `base_sku`
4. Attach vendor offers
5. Flag unmatched items for admin review

---

## Admin Responsibilities (MVP)

- Approve new catalog parts
- Assign base SKU
- Set platform compatibility
- Map parts to setup fields
- Upload images and PDFs

---

## API Contracts (Example)

### Catalog
- `GET /catalog/parts`
- `GET /catalog/parts/{id}`

### Parts Bin
- `GET /users/me/parts-bin`
- `POST /users/me/parts-bin`
- `PATCH /users/me/parts-bin/{id}`
- `DELETE /users/me/parts-bin/{id}`

### Setup Options
- `GET /setup/options?carPlatformId=...`

Returns:
```json
{
  "front_spring": [
    { "label": "Soft – Green", "value": "MRXMEUP01S" }
  ]
}

---

If you want next-level polish, I can next:
- ✅ Convert this into **GitHub Issues automatically**
- ✅ Generate **Prisma / Sequelize models**
- ✅ Create **example seed data** from your Atomic / Reflex inventories
- ✅ Write **Copilot prompt files** (`.copilot-instructions.md`) that reference this spec

Just tell me what you want to generate next.