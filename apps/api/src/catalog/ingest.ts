/**
 * Vendor Ingestion Adapters
 *
 * Fetches products from vendor stores and upserts them into vendor_offers
 * for admin review / catalog linking.
 *
 * Supported platforms:
 *   - shopify: Public /products.json endpoint
 *   - woocommerce: WooCommerce Store API /wp-json/wc/store/v1/products
 *
 * Usage (CLI):
 *   npx tsx apps/api/src/catalog/ingest.ts --source-id <uuid>
 *
 * Or call programmatically:
 *   import { ingestVendorSource } from "./ingest.js";
 *   await ingestVendorSource(sourceId);
 */

import { db } from "../db/index.js";
import { vendorSources, vendorOffers } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  images: { src: string }[];
  variants: {
    id: number;
    sku: string;
    title: string;
    price: string;
    available: boolean;
  }[];
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

// ─── Shopify Adapter ──────────────────────────────────────────

async function fetchShopifyProducts(baseUrl: string): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let page = 1;
  const perPage = 250;

  // Shopify's public /products.json supports pagination
  while (true) {
    const url = `${baseUrl.replace(/\/$/, "")}/products.json?limit=${perPage}&page=${page}`;
    console.log(`  Fetching page ${page}: ${url}`);

    const res = await fetch(url, {
      headers: { "User-Agent": "SetupIQ-Catalog-Bot/1.0 (+https://setupiq.app)" },
    });

    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
        console.log(`  Rate limited, waiting ${retryAfter}s...`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data: ShopifyProductsResponse = await res.json();
    if (!data.products?.length) break;

    products.push(...data.products);
    if (data.products.length < perPage) break;
    page++;

    // Be polite — 1s between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  return products;
}

function normalizeShopifyProduct(
  product: ShopifyProduct,
  vendorSourceId: string,
  baseUrl: string,
): {
  vendorSourceId: string;
  vendorSku: string;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  price: string | null;
  currency: string;
  rawData: Record<string, unknown>;
  matchStatus: string;
  lastSeenAt: Date;
}[] {
  const storeUrl = baseUrl.replace(/\/$/, "");

  return product.variants.map((variant) => ({
    vendorSourceId,
    vendorSku: variant.sku || `shopify-${product.id}-${variant.id}`,
    productName: product.variants.length > 1
      ? `${product.title} - ${variant.title}`
      : product.title,
    productUrl: `${storeUrl}/products/${product.handle}`,
    imageUrl: product.images[0]?.src ?? null,
    price: variant.price || null,
    currency: "USD",
    rawData: {
      shopifyProductId: product.id,
      shopifyVariantId: variant.id,
      vendor: product.vendor,
      productType: product.product_type,
      tags: product.tags,
      available: variant.available,
      description: product.body_html ?? "",
    },
    matchStatus: "pending" as const,
    lastSeenAt: new Date(),
  }));
}

// ─── Main Ingestion Function ──────────────────────────────────

interface NormalizedOffer {
  vendorSourceId: string;
  vendorSku: string;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  price: string | null;
  currency: string;
  rawData: Record<string, unknown>;
  matchStatus: string;
  lastSeenAt: Date;
}

// ─── WooCommerce Types ────────────────────────────────────────

interface WooProduct {
  id: number;
  name: string;
  slug: string;
  sku: string;
  permalink: string;
  description: string;
  prices: {
    price: string;
    currency_code: string;
    currency_minor_unit: number;
  };
  images: { id: number; src: string; name: string; alt: string }[];
  categories: { id: number; name: string; slug: string }[];
  tags: { id: number; name: string; slug: string }[];
  variations: {
    id: number;
    attributes: { name: string; value: string }[];
  }[];
}

// ─── WooCommerce Adapter ──────────────────────────────────────

async function fetchWooProducts(baseUrl: string): Promise<WooProduct[]> {
  const products: WooProduct[] = [];
  let page = 1;
  const perPage = 100; // WC Store API max

  while (true) {
    const url = `${baseUrl.replace(/\/$/, "")}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}`;
    console.log(`  Fetching page ${page}: ${url}`);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "SetupIQ-Catalog-Bot/1.0 (+https://setupiq.app)",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
        console.log(`  Rate limited, waiting ${retryAfter}s...`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data: WooProduct[] = await res.json();
    if (!data?.length) break;

    products.push(...data);

    // Check if there are more pages via X-WP-TotalPages header
    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
    if (page >= totalPages || data.length < perPage) break;
    page++;

    // Be polite
    await new Promise((r) => setTimeout(r, 1000));
  }

  return products;
}

function normalizeWooProduct(
  product: WooProduct,
  vendorSourceId: string,
): NormalizedOffer[] {
  const minorUnit = product.prices?.currency_minor_unit ?? 2;
  const rawPrice = product.prices?.price ?? "0";
  const price = (parseInt(rawPrice, 10) / Math.pow(10, minorUnit)).toFixed(2);

  return [{
    vendorSourceId,
    vendorSku: product.sku || `woo-${product.id}`,
    productName: product.name,
    productUrl: product.permalink,
    imageUrl: product.images?.[0]?.src ?? null,
    price,
    currency: product.prices?.currency_code ?? "USD",
    rawData: {
      wooProductId: product.id,
      categories: product.categories?.map((c) => c.name) ?? [],
      tags: product.tags?.map((t) => t.name) ?? [],
      description: product.description ?? "",
    },
    matchStatus: "pending",
    lastSeenAt: new Date(),
  }];
}

// ─── Main Ingestion Function (continued) ──────────────────────

export async function ingestVendorSource(sourceId: string): Promise<{ fetched: number; upserted: number }> {
  // Load source config
  const [source] = await db
    .select()
    .from(vendorSources)
    .where(eq(vendorSources.id, sourceId))
    .limit(1);

  if (!source) throw new Error(`Vendor source not found: ${sourceId}`);
  if (!source.enabled) throw new Error(`Vendor source is disabled: ${source.name}`);
  if (!source.robotsCompliant) throw new Error(`Vendor source is not robots-compliant: ${source.name}`);

  console.log(`\nIngesting: ${source.name} (${source.type})`);
  console.log(`  URL: ${source.baseUrl}`);

  let allOffers: NormalizedOffer[] = [];

  if (source.type === "shopify") {
    const products = await fetchShopifyProducts(source.baseUrl);
    console.log(`  Fetched ${products.length} products`);
    for (const product of products) {
      allOffers.push(...normalizeShopifyProduct(product, sourceId, source.baseUrl));
    }
  } else if (source.type === "woocommerce") {
    const products = await fetchWooProducts(source.baseUrl);
    console.log(`  Fetched ${products.length} products`);
    for (const product of products) {
      allOffers.push(...normalizeWooProduct(product, sourceId));
    }
  } else {
    throw new Error(`Unsupported source type: ${source.type}. Supported: "shopify", "woocommerce". Note: "amain" type supports live search only, not bulk ingestion.`);
  }

  // Upsert offers
  let upserted = 0;
  for (const offer of allOffers) {
    // Check if this exact SKU already exists for this source
    const existingBySku = await db
      .select({ id: vendorOffers.id, matchStatus: vendorOffers.matchStatus })
      .from(vendorOffers)
      .where(eq(vendorOffers.vendorSku, offer.vendorSku))
      .limit(1);

    if (existingBySku.length > 0) {
      // Update price, image, last_seen — but don't change match_status if already linked
      await db.update(vendorOffers).set({
        productName: offer.productName,
        productUrl: offer.productUrl,
        imageUrl: offer.imageUrl,
        price: offer.price,
        rawData: offer.rawData,
        lastSeenAt: new Date(),
      }).where(eq(vendorOffers.id, existingBySku[0].id));
    } else {
      await db.insert(vendorOffers).values(offer);
    }
    upserted++;
  }

  console.log(`  Upserted ${upserted} offers`);
  return { fetched: allOffers.length, upserted };
}

// ─── CLI Entry Point ──────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes("--source-id")) {
  const idx = args.indexOf("--source-id");
  const sourceId = args[idx + 1];
  if (!sourceId) {
    console.error("Usage: npx tsx apps/api/src/catalog/ingest.ts --source-id <uuid>");
    process.exit(1);
  }
  ingestVendorSource(sourceId)
    .then((result) => {
      console.log(`\nDone. Fetched ${result.fetched} products, upserted ${result.upserted} offers.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Ingestion failed:", err.message);
      process.exit(1);
    });
}
