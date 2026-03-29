import { useState, useEffect, useCallback } from "react";
import {
  searchCatalog,
  getCatalogPart,
  addToPartsBin,
  type CatalogPart,
  type CatalogPartDetail,
} from "../api/client.js";
import { allCars } from "@setupiq/shared";

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
  { value: "drivetrain", label: "Drivetrain" },
  { value: "body", label: "Body" },
  { value: "other", label: "Other" },
];

// ─── View Types ───────────────────────────────────────────────

type View =
  | { kind: "search" }
  | { kind: "detail"; partId: string };

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

      {view.kind === "search" && (
        <CatalogSearch onSelect={(id) => setView({ kind: "detail", partId: id })} />
      )}
      {view.kind === "detail" && (
        <CatalogDetail partId={view.partId} />
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
      {/* Image */}
      {part.primaryImageUrl && (
        <img
          src={part.primaryImageUrl}
          alt={part.name}
          className="w-full max-h-56 object-contain rounded-lg bg-neutral-900 border border-neutral-800"
        />
      )}

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
