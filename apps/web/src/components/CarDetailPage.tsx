import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCarById } from "@setupiq/shared";
import { localDb, type LocalRunSession, type LocalRunSegment } from "../db/local-db.js";
import { useShowHiddenRuns } from "../hooks/use-demo-filter.js";
import { SetupsPage } from "./SetupsPage.js";
import { resizeImage } from "../lib/resize-image.js";
import { v4 as uuid } from "uuid";

type Tab = "setup" | "runs" | "details";

interface CarDetailPageProps {
  carId: string;
  onBack: () => void;
}

/** Count total laps for a car across run segments and race results. */
async function countTotalLaps(carId: string): Promise<number> {
  // Laps from run sessions → segments
  const sessions = await localDb.runSessions.where("carId").equals(carId).toArray();
  let laps = 0;
  for (const session of sessions) {
    const segments = await localDb.runSegments.where("sessionId").equals(session.id).toArray();
    for (const seg of segments) {
      laps += seg.lapTimes?.length ?? 0;
    }
  }
  // Laps from race results
  const races = await localDb.raceResults.where("carId").equals(carId).toArray();
  for (const race of races) {
    laps += race.totalLaps ?? 0;
  }
  return laps;
}

export function CarDetailPage({ carId, onBack }: CarDetailPageProps) {
  const [tab, setTab] = useState<Tab>("setup");
  const [totalLaps, setTotalLaps] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve car definition — predefined or custom
  const predefined = getCarById(carId);
  const customCar = useLiveQuery(() =>
    predefined ? undefined : localDb.customCars.get(carId),
    [carId],
  );

  const carName = predefined?.name ?? customCar?.name ?? "Unknown Car";
  const manufacturer = predefined?.manufacturer ?? customCar?.manufacturer ?? "";
  const scale = predefined?.scale ?? customCar?.scale ?? "";
  const driveType = predefined?.driveType ?? customCar?.driveType ?? "";
  const isCustom = !predefined;

  // Load car image
  useEffect(() => {
    let cancelled = false;
    localDb.carImages.where("carId").equals(carId).first().then((img) => {
      if (cancelled) return;
      setImageUrl(img ? URL.createObjectURL(img.blob) : null);
    });
    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId]);

  // Count laps
  useEffect(() => {
    countTotalLaps(carId).then(setTotalLaps);
  }, [carId]);

  // ─── Details tab state ──────────────────────────────
  const [editName, setEditName] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editScale, setEditScale] = useState("");
  const [editDriveType, setEditDriveType] = useState<"RWD" | "AWD" | "FWD">("RWD");
  const [editNotes, setEditNotes] = useState("");
  const [detailsDirty, setDetailsDirty] = useState(false);

  // Sync edit fields when customCar loads
  useEffect(() => {
    if (customCar) {
      setEditName(customCar.name);
      setEditManufacturer(customCar.manufacturer);
      setEditScale(customCar.scale);
      setEditDriveType(customCar.driveType);
      setEditNotes(customCar.notes ?? "");
    }
  }, [customCar]);

  const handlePhotoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const resized = await resizeImage(file, 400);
      const existing = await localDb.carImages.where("carId").equals(carId).first();
      if (existing) await localDb.carImages.delete(existing.id);
      await localDb.carImages.put({
        id: uuid(),
        carId,
        blob: resized,
        name: file.name,
        mimeType: resized.type || file.type,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _dirty: 1,
      });
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(resized));
      e.target.value = "";
    },
    [carId, imageUrl],
  );

  const handleSaveDetails = useCallback(async () => {
    if (!customCar) return;
    await localDb.customCars.update(carId, {
      name: editName.trim() || customCar.name,
      manufacturer: editManufacturer.trim(),
      scale: editScale.trim() || "1:28",
      driveType: editDriveType,
      notes: editNotes.trim() || undefined,
      updatedAt: new Date().toISOString(),
      _dirty: 1 as const,
    });
    setDetailsDirty(false);
  }, [carId, customCar, editName, editManufacturer, editScale, editDriveType, editNotes]);

  const handleDeleteCar = useCallback(async () => {
    if (!confirm("Delete this car and all its setups?")) return;
    // Remove setups
    const setups = await localDb.setupSnapshots.where("carId").equals(carId).toArray();
    await localDb.setupSnapshots.bulkDelete(setups.map((s) => s.id));
    // Remove image
    const img = await localDb.carImages.where("carId").equals(carId).first();
    if (img) await localDb.carImages.delete(img.id);
    // Remove custom car record
    await localDb.customCars.delete(carId);
    onBack();
  }, [carId, onBack]);

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="px-4 pt-3 pb-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
          ← Back to Garage
        </button>
      </div>

      {/* Car banner: image + name + laps */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-neutral-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt={carName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-neutral-600">🏎️</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{carName}</p>
          <p className="text-xs text-neutral-500">{manufacturer} · {scale} {driveType}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{totalLaps.toLocaleString()} total laps</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 flex gap-1 border-b border-neutral-800">
        {(["setup", "runs", "details"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "setup" && <SetupsPage forcedCarId={carId} />}

        {tab === "runs" && <CarRunsTab carId={carId} />}

        {tab === "details" && (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Photo */}
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Photo</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {imageUrl ? "Change photo" : "Add photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            {isCustom && customCar ? (
              <>
                {/* Editable fields for custom cars */}
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Car Name</label>
                  <input
                    className={inputClass}
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Manufacturer</label>
                  <input
                    className={inputClass}
                    value={editManufacturer}
                    onChange={(e) => { setEditManufacturer(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Scale</label>
                  <input
                    className={inputClass}
                    value={editScale}
                    onChange={(e) => { setEditScale(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Drive Type</label>
                  <div className="flex gap-2">
                    {(["RWD", "AWD", "FWD"] as const).map((dt) => (
                      <button
                        key={dt}
                        onClick={() => { setEditDriveType(dt); setDetailsDirty(true); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          editDriveType === dt
                            ? "bg-blue-600 text-white"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                      >
                        {dt}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
                  <textarea
                    className={inputClass + " min-h-[80px]"}
                    value={editNotes}
                    onChange={(e) => { setEditNotes(e.target.value); setDetailsDirty(true); }}
                  />
                </div>

                {/* Save */}
                {detailsDirty && (
                  <button
                    onClick={handleSaveDetails}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                  >
                    Save Changes
                  </button>
                )}

                {/* Danger zone */}
                <div className="mt-6 border-t border-neutral-800 pt-4">
                  <p className="text-xs text-neutral-500 mb-2">Danger Zone</p>
                  <button
                    onClick={handleDeleteCar}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Delete Car
                  </button>
                </div>
              </>
            ) : (
              /* Read-only info for predefined cars */
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-neutral-500">Name</p>
                  <p className="text-sm">{carName}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Manufacturer</p>
                  <p className="text-sm">{manufacturer}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Scale</p>
                  <p className="text-sm">{scale}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Drive Type</p>
                  <p className="text-sm">{driveType}</p>
                </div>
                <p className="text-xs text-neutral-600 mt-2">
                  Built-in cars cannot be renamed or deleted.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────

type RunsView =
  | { kind: "list" }
  | { kind: "race-detail"; raceId: string }
  | { kind: "session-detail"; sessionId: string };

function computeLapStats(laps: { timeMs: number }[]) {
  if (laps.length === 0) return null;
  const times = laps.map((l) => l.timeMs);
  const best = Math.min(...times);
  const worst = Math.max(...times);
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / times.length;
  const variance = times.reduce((sum, t) => sum + (t - avg) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  const consistency = avg > 0 ? (1 - stdDev / avg) * 100 : 0;
  // Median
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return { best, worst, avg, median, total, stdDev, consistency, count: times.length };
}

function fmt(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

function fmtTotal(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(2).padStart(5, "0")}` : `${sec.toFixed(2)}s`;
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-center">
      <p className={`text-sm font-semibold ${highlight ? "text-green-400" : "text-neutral-200"}`}>{value}</p>
      <p className="text-[10px] text-neutral-500 uppercase">{label}</p>
    </div>
  );
}

function LapTable({ laps, bestMs }: { laps: { lapNumber: number; timeMs: number }[]; bestMs: number }) {
  return (
    <div className="max-h-64 overflow-y-auto space-y-0.5">
      {laps.map((lap, i) => {
        const isBest = lap.timeMs === bestMs;
        return (
          <div
            key={`${lap.lapNumber}-${i}`}
            className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
              isBest
                ? "bg-green-950/40 border border-green-800/50 text-green-300"
                : "bg-neutral-900/50 text-neutral-300"
            }`}
          >
            <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
            <span className="font-mono">{fmt(lap.timeMs)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CarRunsTab({ carId }: { carId: string }) {
  const [view, setView] = useState<RunsView>({ kind: "list" });
  const [showHidden] = useShowHiddenRuns();

  const raceResults = useLiveQuery(
    () => localDb.raceResults.where("carId").equals(carId).reverse().sortBy("date")
      .then((rows) => showHidden ? rows : rows.filter((r) => !r.hidden)),
    [carId, showHidden],
  );

  const sessions = useLiveQuery(async () => {
    const rows = await localDb.runSessions.where("carId").equals(carId).reverse().sortBy("startedAt");
    const results: (LocalRunSession & { segments: LocalRunSegment[] })[] = [];
    for (const row of rows) {
      const segs = await localDb.runSegments.where("sessionId").equals(row.id).sortBy("segmentNumber");
      results.push({ ...row, segments: segs });
    }
    return results;
  }, [carId]);

  const loading = raceResults === undefined || sessions === undefined;

  if (loading) {
    return <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>;
  }

  if (view.kind === "race-detail") {
    const race = raceResults.find((r) => r.id === view.raceId);
    if (!race) return <p className="px-4 py-6 text-sm text-neutral-500">Race not found.</p>;
    return <RaceRunDetail race={race} onBack={() => setView({ kind: "list" })} />;
  }

  if (view.kind === "session-detail") {
    const session = sessions.find((s) => s.id === view.sessionId);
    if (!session) return <p className="px-4 py-6 text-sm text-neutral-500">Session not found.</p>;
    return <SessionRunDetail session={session} onBack={() => setView({ kind: "list" })} />;
  }

  const hasRaces = raceResults.length > 0;
  const hasSessions = sessions.length > 0;

  if (!hasRaces && !hasSessions) {
    return <p className="px-4 py-6 text-sm text-neutral-500">No runs or race results for this car yet.</p>;
  }

  return (
    <div className="px-4 py-4 space-y-6">
      {hasRaces && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Race Results</h3>
          {raceResults.map((r) => (
            <button
              key={r.id}
              onClick={() => setView({ kind: "race-detail", raceId: r.id })}
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
                <span>Fast: {fmt(r.fastLapMs)}</span>
                {r.avgLapMs && <span>Avg: {fmt(r.avgLapMs)}</span>}
              </div>
              {r.community && (
                <p className="text-xs text-neutral-600 mt-1">{r.community}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {hasSessions && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Practice Sessions</h3>
          {sessions.map((s) => {
            const segCount = s.segments.length;
            const totalLaps = s.segments.reduce(
              (sum, seg) => sum + (seg.lapTimes?.length ?? 0),
              0,
            );
            const allLapTimes = s.segments.flatMap((seg) => seg.lapTimes ?? []);
            const bestLap = allLapTimes.length > 0
              ? Math.min(...allLapTimes.map((l) => l.timeMs))
              : null;

            return (
              <button
                key={s.id}
                onClick={() => setView({ kind: "session-detail", sessionId: s.id })}
                className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 p-3 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-200">
                    {new Date(s.startedAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {s.endedAt ? "Completed" : "In Progress"}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                  <span>{segCount} segment{segCount !== 1 ? "s" : ""}</span>
                  <span>{totalLaps} laps</span>
                  {bestLap && <span>Best: {fmt(bestLap)}</span>}
                </div>
                {s.notes && <p className="text-xs text-neutral-600 mt-1">{s.notes}</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Race Detail View ─────────────────────────────────────────

function RaceRunDetail({
  race,
  onBack,
}: {
  race: { id: string; eventName: string; className: string; roundType: string; roundNumber?: number; date: string; community?: string; position: number; totalEntries?: number; totalLaps: number; totalTimeMs: number; fastLapMs: number; avgLapMs?: number; laps: { lapNumber: number; timeMs: number }[]; sourceUrl?: string; notes?: string };
  onBack: () => void;
}) {
  const stats = useMemo(() => computeLapStats(race.laps), [race.laps]);

  return (
    <div className="px-4 py-4 space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back to Runs</button>

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-neutral-200">{race.eventName}</h2>
        <div className="flex gap-3 text-xs text-neutral-400 mt-1">
          <span>{race.className}</span>
          <span>{race.roundType}{race.roundNumber ? ` #${race.roundNumber}` : ""}</span>
          <span>{new Date(race.date).toLocaleDateString()}</span>
        </div>
        {race.community && <p className="text-xs text-neutral-500 mt-0.5">{race.community}</p>}
      </div>

      {/* Analytics grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Position" value={`P${race.position}${race.totalEntries ? `/${race.totalEntries}` : ""}`} />
        <StatBox label="Laps" value={String(race.totalLaps)} />
        <StatBox label="Total Time" value={fmtTotal(race.totalTimeMs)} />
        <StatBox label="Fast Lap" value={fmt(race.fastLapMs)} highlight />
        {stats && <StatBox label="Avg Lap" value={fmt(stats.avg)} />}
        {stats && <StatBox label="Median" value={fmt(stats.median)} />}
        {stats && <StatBox label="Worst Lap" value={fmt(stats.worst)} />}
        {stats && <StatBox label="Std Dev" value={fmt(stats.stdDev)} />}
        {stats && <StatBox label="Consistency" value={`${stats.consistency.toFixed(1)}%`} />}
      </div>

      {/* Lap times */}
      {race.laps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Lap Times</h3>
          <LapTable laps={race.laps} bestMs={race.fastLapMs} />
        </div>
      )}

      {race.sourceUrl && (
        <a
          href={race.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 underline"
        >
          View on Next Level Timing →
        </a>
      )}

      {race.notes && <p className="text-xs text-neutral-400">{race.notes}</p>}
    </div>
  );
}

// ─── Session Detail View ──────────────────────────────────────

function SessionRunDetail({
  session,
  onBack,
}: {
  session: LocalRunSession & { segments: LocalRunSegment[] };
  onBack: () => void;
}) {
  const allLaps = useMemo(
    () => session.segments.flatMap((seg) => seg.lapTimes ?? []),
    [session.segments],
  );
  const overallStats = useMemo(() => computeLapStats(allLaps), [allLaps]);

  return (
    <div className="px-4 py-4 space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back to Runs</button>

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-neutral-200">
          Practice — {new Date(session.startedAt).toLocaleDateString()}
        </h2>
        <div className="flex gap-3 text-xs text-neutral-400 mt-1">
          <span>{new Date(session.startedAt).toLocaleTimeString()}</span>
          {session.endedAt && <span>→ {new Date(session.endedAt).toLocaleTimeString()}</span>}
          <span>{session.endedAt ? "Completed" : "In Progress"}</span>
        </div>
      </div>

      {/* Overall analytics */}
      {overallStats && (
        <>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Overall</h3>
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Total Laps" value={String(overallStats.count)} />
            <StatBox label="Total Time" value={fmtTotal(overallStats.total)} />
            <StatBox label="Fast Lap" value={fmt(overallStats.best)} highlight />
            <StatBox label="Avg Lap" value={fmt(overallStats.avg)} />
            <StatBox label="Median" value={fmt(overallStats.median)} />
            <StatBox label="Worst Lap" value={fmt(overallStats.worst)} />
            <StatBox label="Std Dev" value={fmt(overallStats.stdDev)} />
            <StatBox label="Consistency" value={`${overallStats.consistency.toFixed(1)}%`} />
          </div>
        </>
      )}

      {/* Per-segment breakdown */}
      {session.segments.map((seg) => {
        const segLaps = seg.lapTimes ?? [];
        const segStats = computeLapStats(segLaps);

        return (
          <div key={seg.id} className="space-y-2 border-t border-neutral-800 pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase">
                Segment {seg.segmentNumber}
              </h3>
              {segStats && (
                <span className="text-[10px] text-neutral-500">
                  {segStats.count} laps · Best {fmt(segStats.best)} · Avg {fmt(segStats.avg)}
                </span>
              )}
            </div>

            {/* Segment feedback */}
            {seg.feedback && (
              <div className="flex flex-wrap gap-1.5">
                {seg.feedback.handling.map((h) => (
                  <span key={h} className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                    {h}
                  </span>
                ))}
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                  Consistency: {seg.feedback.consistency}/5
                </span>
                {seg.feedback.notes && (
                  <p className="text-xs text-neutral-500 w-full mt-1">{seg.feedback.notes}</p>
                )}
              </div>
            )}

            {/* Setup changes */}
            {seg.setupChanges && seg.setupChanges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {seg.setupChanges.map((c) => (
                  <span key={c.capabilityId} className="rounded bg-blue-900/40 px-2 py-0.5 text-[10px] text-blue-300">
                    {c.capabilityId}: {String(c.value)}
                  </span>
                ))}
              </div>
            )}

            {/* Lap times */}
            {segLaps.length > 0 && (
              <LapTable laps={segLaps} bestMs={segStats?.best ?? 0} />
            )}
          </div>
        );
      })}

      {session.notes && <p className="text-xs text-neutral-400 mt-2">{session.notes}</p>}
    </div>
  );
}
