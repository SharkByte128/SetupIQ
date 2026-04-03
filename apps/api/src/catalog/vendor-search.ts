/**
 * Live vendor search adapters.
 *
 * Given a vendor source config (type + baseUrl), queries the store's
 * public search API and returns normalised results.
 */

// ─── Result type ──────────────────────────────────────────────

export interface VendorSearchResult {
  vendorSku: string;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  price: string | null;
  currency: string;
  description: string;
  inStock: boolean;
  vendor: string;
  category: string;
  rawData: Record<string, unknown>;
}

// ─── Dispatcher ───────────────────────────────────────────────

interface VendorSourceConfig {
  type: string;
  baseUrl: string;
  ingestionRules: Record<string, unknown> | null;
}

export async function searchVendorStore(
  source: VendorSourceConfig,
  query: string,
  limit = 20,
): Promise<VendorSearchResult[]> {
  switch (source.type) {
    case "shopify":
      return searchShopify(source.baseUrl, query, limit);
    case "woocommerce":
      return searchWooCommerce(source.baseUrl, query, limit);
    default:
      throw new Error(`Live search not supported for vendor type "${source.type}"`);
  }
}

// ─── Shopify search (public /search/suggest.json) ─────────────

async function searchShopify(
  baseUrl: string,
  query: string,
  limit: number,
): Promise<VendorSearchResult[]> {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=${limit}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "SetupIQ-Catalog-Bot/1.0 (+https://setupiq.app)" },
  });

  if (!res.ok) {
    throw new Error(`Shopify search failed: HTTP ${res.status}`);
  }

  const data = await res.json() as {
    resources?: {
      results?: {
        products?: Array<{
          id: number;
          title: string;
          url: string;
          image?: string;
          featured_image?: { url: string };
          price: string;
          available: boolean;
          body?: string;
          vendor?: string;
          product_type?: string;
          variants?: Array<{ sku?: string }>;
        }>;
      };
    };
  };

  const products = data?.resources?.results?.products ?? [];

  return products.map((p) => ({
    vendorSku: p.variants?.[0]?.sku || String(p.id),
    productName: p.title ?? "",
    productUrl: `${base}${p.url ?? ""}`,
    imageUrl: p.image ?? p.featured_image?.url ?? null,
    price: p.price ? (parseInt(p.price, 10) / 100).toFixed(2) : null,
    currency: "USD",
    description: (p.body ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
    inStock: p.available ?? true,
    vendor: p.vendor ?? "",
    category: p.product_type ?? "",
    rawData: p as unknown as Record<string, unknown>,
  }));
}

// ─── WooCommerce search (Store API) ──────────────────────────

async function searchWooCommerce(
  baseUrl: string,
  query: string,
  limit: number,
): Promise<VendorSearchResult[]> {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query)}&per_page=${limit}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "SetupIQ-Catalog-Bot/1.0 (+https://setupiq.app)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`WooCommerce search failed: HTTP ${res.status}`);
  }

  const products = (await res.json()) as Array<{
    id: number;
    name: string;
    slug: string;
    sku: string;
    permalink: string;
    short_description?: string;
    description?: string;
    is_in_stock?: boolean;
    prices?: {
      price: string;
      currency_code: string;
      currency_minor_unit: number;
    };
    images?: Array<{ src: string }>;
    categories?: Array<{ name: string }>;
  }>;

  return products.map((p) => {
    const minorUnit = p.prices?.currency_minor_unit ?? 2;
    const rawPrice = p.prices?.price ?? "0";
    const price = (parseInt(rawPrice, 10) / Math.pow(10, minorUnit)).toFixed(2);

    return {
      vendorSku: p.sku || `woo-${p.id}`,
      productName: p.name ?? "",
      productUrl: p.permalink ?? "",
      imageUrl: p.images?.[0]?.src ?? null,
      price,
      currency: p.prices?.currency_code ?? "USD",
      description: (p.short_description ?? p.description ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
      inStock: p.is_in_stock ?? true,
      vendor: "",
      category: p.categories?.[0]?.name ?? "",
      rawData: p as unknown as Record<string, unknown>,
    };
  });
}
