import { useState, useEffect, useCallback } from "react";
import {
  searchCatalog,
  getCatalogPart,
  addToPartsBin,
  apiUrl,
  getVendorSources,
  searchVendor,
  type CatalogPart,
  type CatalogPartDetail,
  type VendorSource,
  type VendorSearchResult,
} from "../api/client.js";
import { localDb } from "../db/local-db.js";
import { allCars, vendors } from "@setupiq/shared";
import { v4 as uuid } from "uuid";
import { useAuth } from "../hooks/use-auth.js";

// ─── Vendor Name → ID Matcher ─────────────────────────────────

function matchVendorId(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().trim();
  return vendors.find(
    (v) => v.name.toLowerCase() === lower || v.slug === lower || v.id === lower,
  )?.id;
}

// ─── HTML Sanitizer (admin-authored content) ──────────────────

const ALLOWED_TAGS = new Set([
  "b", "i", "u", "em", "strong", "p", "br", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "a", "img", "div", "span", "blockquote",
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "style"]),
};

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  function clean(node: Node): void {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }
      const el = child as Element;
      if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
        // Keep children, remove the wrapper tag
        while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el);
        el.remove();
        continue;
      }
      // Strip disallowed attributes
      const allowed = ALLOWED_ATTRS[el.tagName.toLowerCase()];
      for (const attr of Array.from(el.attributes)) {
        if (!allowed?.has(attr.name)) el.removeAttribute(attr.name);
      }
      // Force safe link targets
      if (el.tagName === "A") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
      clean(el);
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
}

// ─── Category Options ─────────────────────────────────────────

const categories = [
  { value: "", label: "All Categories" },
  { value: "chassis", label: "Chassis" },
  { value: "suspension", label: "Suspension" },
  { value: "tires", label: "Tires" },
  { value: "wheels", label: "Wheels" },
  { value: "electronics", label: "Electronics" },
  { value: "servo", label: "Servo" },
  { value: "esc", label: "ESC" },
  { value: "receiver", label: "Receiver" },
  { value: "drivetrain", label: "Drivetrain" },
  { value: "body", label: "Body" },
  { value: "other", label: "Other" },
];

// ─── View Types ───────────────────────────────────────────────

type View =
  | { kind: "search" }
  | { kind: "detail"; partId: string }
  | { kind: "vendor-search" };

// ─── Main Component ───────────────────────────────────────────

export function CatalogPage({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>({ kind: "search" });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2">
        {view.kind === "detail" ? (
          <button
            onClick={() => setView({ kind: "search" })}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            ← Back to Catalog
          </button>
        ) : (
          <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
            ← Back to Garage
          </button>
        )}
      </div>

      {/* Tabs */}
      {view.kind !== "detail" && (
        <div className="flex gap-1 px-4 mb-2">
          <button
            onClick={() => setView({ kind: "search" })}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              view.kind === "search"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Parts Catalog
          </button>
          <button
            onClick={() => setView({ kind: "vendor-search" })}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              view.kind === "vendor-search"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Vendor Search
          </button>
        </div>
      )}

      {view.kind === "search" && (
        <CatalogSearch onSelect={(id) => setView({ kind: "detail", partId: id })} />
      )}
      {view.kind === "detail" && (
        <CatalogDetail partId={view.partId} />
      )}
      {view.kind === "vendor-search" && (
        <VendorSearchView />
      )}
    </div>
  );
}

// ─── Catalog Search / Browse ──────────────────────────────────

function CatalogSearch({ onSelect }: { onSelect: (partId: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [carPlatformId, setCarPlatformId] = useState("");
  const [results, setResults] = useState<CatalogPart[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await searchCatalog({
        q: query || undefined,
        category: category || undefined,
        carPlatformId: carPlatformId || undefined,
        page: p,
        limit: 30,
      });
      setResults(data.parts);
      setTotal(data.total);
      setPage(p);
    } catch (err: any) {
      setError(err.message || "Failed to search catalog");
    } finally {
      setLoading(false);
    }
  }, [query, category, carPlatformId]);

  // Search on mount and filter changes
  useEffect(() => {
    doSearch(1);
  }, [category, carPlatformId]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputClass = "w-full text-sm bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-neutral-200 placeholder-neutral-600";

  return (
    <div className="px-4 py-2 space-y-3 flex-1 overflow-y-auto">
      <h2 className="text-lg font-semibold text-neutral-200">Parts Catalog</h2>

      {/* Search bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); doSearch(1); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or SKU…"
          className={inputClass + " flex-1"}
        />
        <button
          type="submit"
          className="rounded bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-500"
        >
          Search
        </button>
      </form>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass + " flex-1"}
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <select
          value={carPlatformId}
          onChange={(e) => setCarPlatformId(e.target.value)}
          className={inputClass + " flex-1"}
        >
          <option value="">All Platforms</option>
          {allCars.map((car) => (
            <option key={car.id} value={car.id}>{car.name}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {loading && (
        <p className="text-center text-neutral-500 text-sm py-8">Searching…</p>
      )}

      {!loading && results.length === 0 && (
        <p className="text-center text-neutral-500 text-sm py-8">
          No parts found. Try adjusting your search or filters.
        </p>
      )}

      <div className="space-y-2">
        {results.map((part) => (
          <CatalogPartCard
            key={part.id}
            part={part}
            onSelect={() => onSelect(part.id)}
          />
        ))}
      </div>

      {/* Pagination */}
      {total > 30 && (
        <div className="flex justify-center gap-2 py-2">
          <button
            onClick={() => doSearch(page - 1)}
            disabled={page <= 1}
            className="text-xs text-blue-400 disabled:text-neutral-600 px-2 py-1"
          >
            ← Prev
          </button>
          <span className="text-xs text-neutral-500">
            Page {page} of {Math.ceil(total / 30)}
          </span>
          <button
            onClick={() => doSearch(page + 1)}
            disabled={page * 30 >= total}
            className="text-xs text-blue-400 disabled:text-neutral-600 px-2 py-1"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Catalog Part Card ────────────────────────────────────────

function CatalogPartCard({ part, onSelect }: { part: CatalogPart; onSelect: () => void }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    try {
      await addToPartsBin(part.id);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-neutral-900 border border-neutral-800 rounded-lg p-3 hover:border-neutral-600 transition-colors flex gap-3"
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded bg-neutral-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {part.primaryImageUrl ? (
          <img src={part.primaryImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-neutral-600 text-xl">📦</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-200 truncate">{part.name}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {part.brand && `${part.brand} · `}{part.category} · {part.baseSku}
        </p>
        {part.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {part.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] bg-neutral-800 text-neutral-400 rounded px-1.5 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="flex-shrink-0 self-center">
        <button
          onClick={handleAdd}
          disabled={adding}
          className={`rounded text-xs font-medium px-2.5 py-1.5 transition-colors ${
            added
              ? "bg-green-600/20 text-green-400"
              : "bg-blue-600 text-white hover:bg-blue-500"
          }`}
        >
          {adding ? "…" : added ? "✓ Added" : "+ Add"}
        </button>
      </div>
    </button>
  );
}

// ─── Catalog Part Detail ──────────────────────────────────────

function CatalogDetail({ partId }: { partId: string }) {
  const [part, setPart] = useState<CatalogPartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setLoading(true);
    getCatalogPart(partId)
      .then(setPart)
      .finally(() => setLoading(false));
  }, [partId]);

  const handleAdd = async () => {
    setAdding(true);
    try {
      await addToPartsBin(partId);
      setAdded(true);
      setTimeout(() => setAdded(false), 3000);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return <p className="text-center text-neutral-500 text-sm py-8 px-4">Loading…</p>;
  }

  if (!part) {
    return <p className="text-center text-red-400 text-sm py-8 px-4">Part not found.</p>;
  }

  return (
    <div className="px-4 py-2 space-y-4 flex-1 overflow-y-auto">
      {/* Images — DB images first, fallback to primaryImageUrl */}
      {(part.images?.length > 0) ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {part.images.map((img) => (
            <img
              key={img.id}
              src={apiUrl(`/api/catalog/parts/${part.id}/images/${img.id}`)}
              alt={part.name}
              className="h-40 rounded-lg bg-neutral-900 border border-neutral-800 object-contain flex-shrink-0"
            />
          ))}
        </div>
      ) : part.primaryImageUrl ? (
        <img
          src={part.primaryImageUrl}
          alt={part.name}
          className="w-full max-h-56 object-contain rounded-lg bg-neutral-900 border border-neutral-800"
        />
      ) : null}

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-200">{part.name}</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          {part.brand && `${part.brand} · `}{part.category} · SKU: {part.baseSku}
        </p>
      </div>

      {/* Add to Bin */}
      <button
        onClick={handleAdd}
        disabled={adding}
        className={`w-full rounded-md py-2.5 text-sm font-medium transition-colors ${
          added
            ? "bg-green-600/20 text-green-400 border border-green-700"
            : "bg-blue-600 text-white hover:bg-blue-500"
        }`}
      >
        {adding ? "Adding…" : added ? "✓ Added to Parts Bin" : "+ Add to Parts Bin"}
      </button>

      {/* Description */}
      {part.description && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase mb-1">Description</h3>
          <div
            className="text-sm text-neutral-300 prose prose-invert prose-sm max-w-none [&_img]:rounded [&_img]:max-w-full [&_a]:text-blue-400"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(part.description) }}
          />
        </div>
      )}

      {/* Attributes */}
      {Object.keys(part.attributes ?? {}).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase mb-1">Specifications</h3>
          <div className="space-y-1">
            {Object.entries(part.attributes).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-neutral-500 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="text-neutral-200">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compatibility */}
      {part.compatibility?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase mb-1">Compatible Platforms</h3>
          <div className="flex flex-wrap gap-1.5">
            {part.compatibility.map((c) => {
              const car = allCars.find((a) => a.id === c.carPlatformId);
              return (
                <span
                  key={c.id}
                  className="text-xs bg-neutral-800 text-neutral-300 rounded px-2 py-1"
                >
                  {car?.name ?? c.carPlatformId}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Variants */}
      {part.variants?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase mb-1">Variants</h3>
          <div className="space-y-1">
            {part.variants.map((v) => (
              <div key={v.id} className="flex justify-between text-sm bg-neutral-800/50 rounded px-2 py-1.5">
                <span className="text-neutral-200">{v.label}</span>
                <code className="text-xs text-neutral-500">{v.sku}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {part.tags?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase mb-1">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {part.tags.map((tag) => (
              <span key={tag} className="text-xs bg-neutral-800 text-neutral-400 rounded px-2 py-1">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Instructions PDF */}
      {part.instructionsPdfUrl && (
        <a
          href={part.instructionsPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-blue-400 hover:text-blue-300"
        >
          📄 View Instructions (PDF)
        </a>
      )}
    </div>
  );
}

// ─── Vendor Search View ───────────────────────────────────────

function VendorSearchView() {
  const { user } = useAuth();
  const [sources, setSources] = useState<VendorSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorSearchResult[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [addedSkus, setAddedSkus] = useState<Set<string>>(new Set());

  // Load vendor sources on mount (only when logged in)
  useEffect(() => {
    if (!user) return;
    getVendorSources()
      .then((data) => {
        setSources(data.sources);
        if (data.sources.length > 0) setSelectedSourceId(data.sources[0].id);
      })
      .catch(() => setError("Failed to load vendor sources"));
  }, [user]);

  const doSearch = useCallback(async () => {
    if (!selectedSourceId || !query.trim()) return;
    setLoading(true);
    setError(null);
    setExpandedIdx(null);
    try {
      const data = await searchVendor(selectedSourceId, query.trim());
      setResults(data.results);
      setVendorName(data.vendorName);
    } catch (err: any) {
      setError(err.message || "Vendor search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSourceId, query]);

  const handleAddToBin = async (item: VendorSearchResult) => {
    const now = new Date().toISOString();
    const part = {
      id: uuid(),
      userId: "",
      vendorId: matchVendorId(vendorName) || matchVendorId(item.vendor) || "vendor-other",
      categoryId: item.category || "other",
      name: item.productName,
      sku: item.vendorSku,
      compatibleChassisIds: [] as string[],
      attributes: {
        ...(item.price ? { price: item.price } : {}),
        ...(item.currency ? { currency: item.currency } : {}),
        ...(item.vendor ? { brand: item.vendor } : {}),
        ...(item.category ? { vendorCategory: item.category } : {}),
      } as Record<string, string | number>,
      notes: [
        item.productUrl ? `URL: ${item.productUrl}` : "",
        item.description || "",
      ].filter(Boolean).join("\n"),
      catalogPartId: undefined,
      createdAt: now,
      updatedAt: now,
      _dirty: 1 as const,
    };

    await localDb.parts.add(part);
    setAddedSkus((prev) => new Set(prev).add(item.vendorSku));
  };

  const inputClass = "w-full text-sm bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-neutral-200 placeholder-neutral-600";

  return (
    <div className="px-4 py-2 space-y-3 flex-1 overflow-y-auto">
      <h2 className="text-lg font-semibold text-neutral-200">Vendor Search</h2>

      {!user && (
        <p className="text-sm text-neutral-500">Sign in to use Vendor Search.</p>
      )}

      {/* Vendor selector */}
      {user && sources.length === 0 && !error && (
        <p className="text-sm text-neutral-500">
          No vendor sources configured. Add vendors in the{" "}
          <a href="/admin" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            Admin Panel
          </a>.
        </p>
      )}

      {sources.length > 0 && (
        <>
          <div className="flex gap-2">
            <select
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className={inputClass + " flex-shrink-0 w-auto max-w-[12rem]"}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <form
              onSubmit={(e) => { e.preventDefault(); doSearch(); }}
              className="flex gap-2 flex-1"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search vendor store…"
                className={inputClass + " flex-1"}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="rounded bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "…" : "Search"}
              </button>
            </form>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && (
        <p className="text-center text-neutral-500 text-sm py-8">Searching {vendorName || "vendor"}…</p>
      )}

      {!loading && results.length === 0 && query && !error && (
        <p className="text-center text-neutral-500 text-sm py-8">No results found.</p>
      )}

      {/* Results */}
      <div className="space-y-2">
        {results.map((item, idx) => {
          const isExpanded = expandedIdx === idx;
          const isAdded = addedSkus.has(item.vendorSku);

          return (
            <div
              key={`${item.vendorSku}-${idx}`}
              className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden"
            >
              {/* Collapsed row */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full text-left p-3 flex gap-3 hover:bg-neutral-800/50 transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded bg-neutral-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-neutral-600 text-xl">📦</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-200 truncate">{item.productName}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {item.vendor && `${item.vendor} · `}
                    {item.vendorSku}
                    {item.price && ` · $${item.price}`}
                  </p>
                  <div className="flex gap-1.5 mt-1">
                    {item.inStock ? (
                      <span className="text-[10px] bg-green-900/40 text-green-400 rounded px-1.5 py-0.5">In Stock</span>
                    ) : (
                      <span className="text-[10px] bg-red-900/40 text-red-400 rounded px-1.5 py-0.5">Out of Stock</span>
                    )}
                    {item.category && (
                      <span className="text-[10px] bg-neutral-800 text-neutral-400 rounded px-1.5 py-0.5">{item.category}</span>
                    )}
                  </div>
                </div>

                {/* Expand chevron */}
                <span className="text-neutral-600 self-center text-sm">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-neutral-800 p-3 space-y-3">
                  {/* Larger image */}
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      className="w-full max-h-48 object-contain rounded bg-neutral-800"
                    />
                  )}

                  {/* Description */}
                  {item.description && (
                    <div>
                      <h4 className="text-xs font-semibold text-neutral-400 uppercase mb-1">Description</h4>
                      <p className="text-sm text-neutral-300">{item.description}</p>
                    </div>
                  )}

                  {/* Specs grid */}
                  <div className="space-y-1">
                    {item.price && (
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Price</span>
                        <span className="text-neutral-200 font-medium">${item.price} {item.currency}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">SKU</span>
                      <span className="text-neutral-200">{item.vendorSku}</span>
                    </div>
                    {item.vendor && (
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Brand</span>
                        <span className="text-neutral-200">{item.vendor}</span>
                      </div>
                    )}
                    {item.category && (
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Category</span>
                        <span className="text-neutral-200">{item.category}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Availability</span>
                      <span className={item.inStock ? "text-green-400" : "text-red-400"}>
                        {item.inStock ? "In Stock" : "Out of Stock"}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAddToBin(item)}
                      disabled={isAdded}
                      className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                        isAdded
                          ? "bg-green-600/20 text-green-400 border border-green-700"
                          : "bg-blue-600 text-white hover:bg-blue-500"
                      }`}
                    >
                      {isAdded ? "✓ Added to Parts Bin" : "+ Add to Parts Bin"}
                    </button>
                    {item.productUrl && (
                      <a
                        href={item.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md py-2 px-3 text-sm font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
                      >
                        View ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
