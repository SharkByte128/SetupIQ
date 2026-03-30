import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { allCars, getCarById } from "@setupiq/shared";
import { localDb, type LocalRaceResult } from "../db/local-db.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type View =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "import" }
  | { kind: "detail"; result: LocalRaceResult };

export function RacesPage() {
  const [view, setView] = useState<View>({ kind: "list" });

  const results = useLiveQuery(() =>
    localDb.raceResults.orderBy("date").reverse().toArray(),
  );

  return (
    <div className="px-4 py-4">
      {view.kind === "list" && (
        <RaceList
          results={results ?? []}
          onAdd={() => setView({ kind: "add" })}
          onImport={() => setView({ kind: "import" })}
          onSelect={(r) => setView({ kind: "detail", result: r })}
        />
      )}
      {view.kind === "add" && (
        <ManualRaceEntry
          onSave={() => setView({ kind: "list" })}
          onCancel={() => setView({ kind: "list" })}
        />
      )}
      {view.kind === "import" && (
        <NltImport
          onDone={() => setView({ kind: "list" })}
          onCancel={() => setView({ kind: "list" })}
        />
      )}
      {view.kind === "detail" && (
        <RaceDetail
          result={view.result}
          onBack={() => setView({ kind: "list" })}
          onDelete={async () => {
            await localDb.raceResults.delete(view.result.id);
            setView({ kind: "list" });
          }}
        />
      )}
    </div>
  );
}

// ─── Race List ────────────────────────────────────────────────

function RaceList({
  results,
  onAdd,
  onImport,
  onSelect,
}: {
  results: LocalRaceResult[];
  onAdd: () => void;
  onImport: () => void;
  onSelect: (r: LocalRaceResult) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Race Results</h2>
        <div className="flex gap-2">
          <button
            onClick={onImport}
            className="rounded bg-neutral-800 text-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-700"
          >
            Import NLT
          </button>
          <button
            onClick={onAdd}
            className="rounded bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-500"
          >
            + Add
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-neutral-500">No race results yet. Add one manually or import from Next Level Timing.</p>
      ) : (
        <div className="space-y-2">
          {results.map((r) => {
            const car = getCarById(r.carId);
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r)}
                className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 p-3 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-neutral-200">{r.eventName}</span>
                    <span className="text-xs text-neutral-500 ml-2">{r.className}</span>
                  </div>
                  <span className="text-xs text-neutral-500">{new Date(r.date).toLocaleDateString()}</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                  <span>P{r.position}{r.totalEntries ? `/${r.totalEntries}` : ""}</span>
                  <span>{r.totalLaps} laps</span>
                  <span>Fast: {(r.fastLapMs / 1000).toFixed(3)}s</span>
                  {car && <span className="text-neutral-600">{car.name}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Manual Entry ─────────────────────────────────────────────

function ManualRaceEntry({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    eventName: "",
    community: "",
    className: "",
    roundType: "main" as string,
    roundNumber: 1,
    date: new Date().toISOString().slice(0, 10),
    carId: allCars[0]?.id ?? "",
    position: 1,
    totalEntries: undefined as number | undefined,
    totalLaps: 0,
    totalTimeMs: 0,
    fastLapMs: 0,
    lapsText: "",
    notes: "",
  });

  const handleSubmit = async () => {
    const laps = parseLapTimesText(form.lapsText);
    const fastLapMs = laps.length > 0
      ? Math.min(...laps.map((l) => l.timeMs))
      : form.fastLapMs;
    const totalTimeMs = laps.length > 0
      ? laps.reduce((s, l) => s + l.timeMs, 0)
      : form.totalTimeMs;
    const totalLaps = laps.length > 0 ? laps.length : form.totalLaps;
    const avgLapMs = totalLaps > 0 ? totalTimeMs / totalLaps : undefined;

    const result: LocalRaceResult = {
      id: crypto.randomUUID(),
      userId: "local",
      carId: form.carId,
      eventName: form.eventName || "Race",
      community: form.community || undefined,
      className: form.className || "Open",
      roundType: form.roundType,
      roundNumber: form.roundNumber,
      date: new Date(form.date).toISOString(),
      position: form.position,
      totalEntries: form.totalEntries,
      totalLaps,
      totalTimeMs,
      fastLapMs,
      avgLapMs,
      laps,
      notes: form.notes || undefined,
      createdAt: new Date().toISOString(),
      _dirty: 1,
    };

    await localDb.raceResults.add(result);
    onSave();
  };

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Add Race Result</h2>
        <button onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-300">Cancel</button>
      </div>

      <div className="space-y-3">
        <Field label="Event Name" value={form.eventName} onChange={(v) => set("eventName", v)} placeholder="e.g. Saturday Night Race" />
        <Field label="Community / Club" value={form.community} onChange={(v) => set("community", v)} placeholder="e.g. Piedmont Micro RC Racing Club" />
        <Field label="Class Name" value={form.className} onChange={(v) => set("className", v)} placeholder="e.g. Evo2 5600kv" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-400 block mb-1">Round Type</label>
            <select
              value={form.roundType}
              onChange={(e) => set("roundType", e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200"
            >
              <option value="practice">Practice</option>
              <option value="qualifying">Qualifying</option>
              <option value="main">Main</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <Field label="Round #" value={String(form.roundNumber)} onChange={(v) => set("roundNumber", Number(v) || 1)} type="number" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" value={form.date} onChange={(v) => set("date", v)} type="date" />
          <div>
            <label className="text-xs font-medium text-neutral-400 block mb-1">Car</label>
            <select
              value={form.carId}
              onChange={(e) => set("carId", e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200"
            >
              {allCars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Position" value={String(form.position)} onChange={(v) => set("position", Number(v) || 1)} type="number" />
          <Field label="Entries" value={form.totalEntries != null ? String(form.totalEntries) : ""} onChange={(v) => set("totalEntries", v ? Number(v) : undefined)} type="number" placeholder="#" />
          <Field label="Fast Lap (s)" value={form.fastLapMs ? String(form.fastLapMs / 1000) : ""} onChange={(v) => set("fastLapMs", Number(v) * 1000 || 0)} type="number" placeholder="6.861" />
        </div>

        <div>
          <label className="text-xs font-medium text-neutral-400 block mb-1">Lap Times (one per line, in seconds)</label>
          <textarea
            value={form.lapsText}
            onChange={(e) => set("lapsText", e.target.value)}
            rows={4}
            placeholder={"7.236\n7.352\n6.861\n7.419"}
            className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200 font-mono"
          />
          <p className="text-xs text-neutral-600 mt-0.5">
            Paste lap times from results. Leave empty if you only have totals.
          </p>
        </div>

        <Field label="Notes" value={form.notes} onChange={(v) => set("notes", v)} placeholder="Optional notes" />

        <button
          onClick={handleSubmit}
          className="w-full rounded bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-500"
        >
          Save Result
        </button>
      </div>
    </div>
  );
}

// ─── NLT Import ───────────────────────────────────────────────

function NltImport({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NltRaceData[] | null>(null);
  const [selectedCars, setSelectedCars] = useState<Record<number, string>>({});

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/nlt/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: NltRaceData[] = await res.json();
      setPreview(data);
      // Default car mapping
      const defaults: Record<number, string> = {};
      data.forEach((_, i) => { defaults[i] = allCars[0]?.id ?? ""; });
      setSelectedCars(defaults);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    for (let i = 0; i < preview.length; i++) {
      const d = preview[i];
      const result: LocalRaceResult = {
        id: crypto.randomUUID(),
        userId: "local",
        carId: selectedCars[i] ?? allCars[0]?.id ?? "",
        eventName: d.eventName,
        community: d.community || undefined,
        className: d.className,
        roundType: d.roundType,
        date: d.date,
        position: d.position,
        totalEntries: d.totalEntries,
        totalLaps: d.totalLaps,
        totalTimeMs: d.totalTimeMs,
        fastLapMs: d.fastLapMs,
        avgLapMs: d.totalLaps > 0 ? Math.round(d.totalTimeMs / d.totalLaps) : undefined,
        laps: d.laps,
        sourceUrl: url,
        createdAt: new Date().toISOString(),
        _dirty: 1,
      };
      await localDb.raceResults.add(result);
    }
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Import from Next Level Timing</h2>
        <button onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-300">Cancel</button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-400 block">Race URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://nextleveltiming.com/communities/.../races/..."
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200"
        />
        <button
          onClick={handleFetch}
          disabled={loading || !url}
          className="rounded bg-blue-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch Results"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Preview ({preview.length} result{preview.length > 1 ? "s" : ""})</h3>
          {preview.map((d, i) => (
            <div key={i} className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-neutral-200">{d.className}</span>
                <span className="text-xs text-neutral-500">P{d.position} — {d.totalLaps} laps</span>
              </div>
              <div className="flex gap-3 text-xs text-neutral-400">
                <span>Fast: {(d.fastLapMs / 1000).toFixed(3)}s</span>
                <span>Total: {formatTotalTime(d.totalTimeMs)}</span>
                <span>{d.roundType}</span>
              </div>
              <div>
                <label className="text-xs text-neutral-500">Assign car:</label>
                <select
                  value={selectedCars[i] ?? ""}
                  onChange={(e) => setSelectedCars((s) => ({ ...s, [i]: e.target.value }))}
                  className="ml-2 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs text-neutral-200"
                >
                  {allCars.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button
            onClick={handleSave}
            className="w-full rounded bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-500"
          >
            Save {preview.length} Result{preview.length > 1 ? "s" : ""}
          </button>
        </div>
      )}
      {preview && preview.length === 0 && (
        <p className="text-sm text-neutral-500">No results found at that URL.</p>
      )}
    </div>
  );
}

// ─── Race Detail ──────────────────────────────────────────────

function RaceDetail({
  result,
  onBack,
  onDelete,
}: {
  result: LocalRaceResult;
  onBack: () => void;
  onDelete: () => void;
}) {
  const car = getCarById(result.carId);
  const avgMs = result.avgLapMs ?? (result.totalLaps > 0 ? result.totalTimeMs / result.totalLaps : 0);

  const fastIdx = useMemo(() => {
    if (result.laps.length === 0) return -1;
    let minMs = Infinity;
    let idx = 0;
    result.laps.forEach((l, i) => { if (l.timeMs < minMs) { minMs = l.timeMs; idx = i; } });
    return idx;
  }, [result.laps]);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back to Results</button>

      <div>
        <h2 className="text-base font-semibold text-neutral-200">{result.eventName}</h2>
        <div className="flex gap-3 text-xs text-neutral-400 mt-1">
          <span>{result.className}</span>
          <span>{result.roundType}{result.roundNumber ? ` #${result.roundNumber}` : ""}</span>
          <span>{new Date(result.date).toLocaleDateString()}</span>
        </div>
        {result.community && <p className="text-xs text-neutral-500 mt-0.5">{result.community}</p>}
        {car && <p className="text-xs text-neutral-600 mt-0.5">Car: {car.manufacturer} {car.name}</p>}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Position" value={`P${result.position}${result.totalEntries ? `/${result.totalEntries}` : ""}`} />
        <StatCard label="Laps" value={String(result.totalLaps)} />
        <StatCard label="Total Time" value={formatTotalTime(result.totalTimeMs)} />
        <StatCard label="Fast Lap" value={`${(result.fastLapMs / 1000).toFixed(3)}s`} highlight />
        <StatCard label="Avg Lap" value={avgMs > 0 ? `${(avgMs / 1000).toFixed(3)}s` : "–"} />
        <StatCard label="Pace" value={result.totalLaps > 0 ? `${result.totalLaps}` : "–"} />
      </div>

      {/* Lap times */}
      {result.laps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Lap Times</h3>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {result.laps.map((lap, i) => (
              <div
                key={lap.lapNumber}
                className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                  i === fastIdx
                    ? "bg-green-950/40 border border-green-800/50 text-green-300"
                    : "bg-neutral-900/50 text-neutral-300"
                }`}
              >
                <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
                <span className="font-mono">{(lap.timeMs / 1000).toFixed(3)}s</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.sourceUrl && (
        <a
          href={result.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 underline"
        >
          View on Next Level Timing →
        </a>
      )}

      {result.notes && <p className="text-xs text-neutral-400">{result.notes}</p>}

      <button
        onClick={onDelete}
        className="text-xs text-red-500 hover:text-red-400"
      >
        Delete Result
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-400 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200"
      />
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2 text-center">
      <p className={`text-sm font-semibold ${highlight ? "text-green-400" : "text-neutral-200"}`}>{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function formatTotalTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(2).padStart(5, "0")}` : `${sec.toFixed(2)}s`;
}

function parseLapTimesText(text: string): { lapNumber: number; timeMs: number }[] {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      // Supports "7.236" or "0:07.236" or "7236" (ms)
      const colonMatch = line.match(/^(\d+):(\d+\.?\d*)$/);
      if (colonMatch) {
        const min = Number(colonMatch[1]);
        const sec = Number(colonMatch[2]);
        return { lapNumber: i + 1, timeMs: Math.round((min * 60 + sec) * 1000) };
      }
      const num = Number(line);
      if (isNaN(num)) return null;
      // If > 1000, assume ms already; else assume seconds
      const timeMs = num > 100 ? Math.round(num) : Math.round(num * 1000);
      return { lapNumber: i + 1, timeMs };
    })
    .filter((l): l is { lapNumber: number; timeMs: number } => l !== null);
}

/** Shape returned by the NLT scrape API */
interface NltRaceData {
  eventName: string;
  community: string;
  className: string;
  roundType: string;
  date: string;
  position: number;
  totalEntries?: number;
  totalLaps: number;
  totalTimeMs: number;
  fastLapMs: number;
  laps: { lapNumber: number; timeMs: number }[];
}
