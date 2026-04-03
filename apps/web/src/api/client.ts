const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Build a full API URL (useful for image src attributes) */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    return await apiFetch<AuthUser>("/auth/me");
  } catch {
    return null;
  }
}

export function getGoogleLoginUrl(): string {
  return `${API_BASE}/auth/google`;
}

export function getMicrosoftLoginUrl(): string {
  return `${API_BASE}/auth/microsoft`;
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
}

// ─── Catalog API ──────────────────────────────────────────────

export interface CatalogPart {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  baseSku: string;
  description: string | null;
  setupDisplayText: string | null;
  primaryImageUrl: string | null;
  instructionsPdfUrl: string | null;
  tags: string[];
  setupFieldIds: string[];
  attributes: Record<string, string | number>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogPartDetail extends CatalogPart {
  compatibility: { id: string; catalogPartId: string; carPlatformId: string; notes: string | null }[];
  offers: { id: string; vendorSku: string; productUrl: string | null; imageUrl: string | null; price: string | null; currency: string }[];
  images: { id: string; mimeType: string; sortOrder: number; variantFilter: Record<string, string> | null; createdAt: string }[];
  variants: { id: string; sku: string; label: string; variantAttributes: Record<string, string>; status: string; createdAt: string; updatedAt: string }[];
}

export interface CatalogSearchResult {
  parts: CatalogPart[];
  total: number;
  page: number;
  limit: number;
}

export interface PartsBinItem {
  id: string;
  catalogPartId: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  partName: string;
  partBrand: string | null;
  partCategory: string;
  partBaseSku: string;
  partImageUrl: string | null;
  partSetupFieldIds: string[];
  partAttributes: Record<string, string | number>;
}

export async function searchCatalog(params: {
  q?: string;
  category?: string;
  brand?: string;
  carPlatformId?: string;
  page?: number;
  limit?: number;
}): Promise<CatalogSearchResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.brand) qs.set("brand", params.brand);
  if (params.carPlatformId) qs.set("carPlatformId", params.carPlatformId);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<CatalogSearchResult>(`/api/catalog/parts?${qs}`);
}

export async function getCatalogPart(id: string): Promise<CatalogPartDetail> {
  return apiFetch<CatalogPartDetail>(`/api/catalog/parts/${id}`);
}

export async function getPartsBin(): Promise<{ items: PartsBinItem[] }> {
  return apiFetch<{ items: PartsBinItem[] }>("/api/users/me/parts-bin");
}

export async function addToPartsBin(catalogPartId: string, quantity = 1): Promise<{ id: string; action: string }> {
  return apiFetch("/api/users/me/parts-bin", {
    method: "POST",
    body: JSON.stringify({ catalogPartId, quantity }),
  });
}

export async function updatePartsBinItem(id: string, data: { quantity?: number; notes?: string }): Promise<void> {
  await apiFetch(`/api/users/me/parts-bin/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function removeFromPartsBin(id: string): Promise<void> {
  await apiFetch(`/api/users/me/parts-bin/${id}`, { method: "DELETE" });
}

export async function getSetupOptions(carPlatformId: string): Promise<{
  options: Record<string, { label: string; value: string; partId: string; attributes: Record<string, string | number> }[]>;
}> {
  return apiFetch(`/api/setup/options?carPlatformId=${encodeURIComponent(carPlatformId)}`);
}

// ─── Vendor Search API ────────────────────────────────────────

export interface VendorSource {
  id: string;
  name: string;
  type: string;
}

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
}

export async function getVendorSources(): Promise<{ sources: VendorSource[] }> {
  return apiFetch("/api/catalog/vendor-sources");
}

export async function searchVendor(
  vendorSourceId: string,
  q: string,
): Promise<{ results: VendorSearchResult[]; vendorName: string; vendorSourceId: string }> {
  const qs = new URLSearchParams({ vendorSourceId, q });
  return apiFetch(`/api/catalog/vendor-search?${qs}`);
}
