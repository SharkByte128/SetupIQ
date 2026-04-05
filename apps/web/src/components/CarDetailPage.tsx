import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCarById, getChassisPlatformById, chassisPlatforms } from "@setupiq/shared";
import { localDb, type LocalRunSession, type LocalRunSegment, type LocalRaceResult, type LocalSetupSnapshot } from "../db/local-db.js";
import { useShowHiddenRuns } from "../hooks/use-demo-filter.js";
import { SetupsPage } from "./SetupsPage.js";
import { resizeImage } from "../lib/resize-image.js";
import { v4 as uuid } from "uuid";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
  const chassisModel = customCar?.chassisId ? getChassisPlatformById(customCar.chassisId) : undefined;
  const bannerSubtitle = chassisModel
    ? `${chassisModel.name} · ${predefined?.scale ?? customCar?.scale ?? ""} ${predefined?.driveType ?? customCar?.driveType ?? ""}`
    : `${manufacturer} · ${predefined?.scale ?? customCar?.scale ?? ""} ${predefined?.driveType ?? customCar?.driveType ?? ""}`;
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
  const [editChassisId, setEditChassisId] = useState("");
  const [editScale, setEditScale] = useState("");
  const [editDriveType, setEditDriveType] = useState<"RWD" | "AWD" | "FWD">("RWD");
  const [editNotes, setEditNotes] = useState("");
  const [editSetupTemplateId, setEditSetupTemplateId] = useState("");
  const [detailsDirty, setDetailsDirty] = useState(false);

  // Setup templates for the selector
  const allTemplates = useLiveQuery(() => localDb.setupTemplates.toArray()) ?? [];

  // Notes for predefined cars (stored in carNotes table)
  const predefinedCarNote = useLiveQuery(
    () => predefined ? localDb.carNotes.get(carId) : undefined,
    [carId],
  );
  const [predefinedNotes, setPredefinedNotes] = useState("");
  const [predefinedNotesDirty, setPredefinedNotesDirty] = useState(false);

  // Sync predefined notes when loaded
  useEffect(() => {
    if (predefined) {
      setPredefinedNotes(predefinedCarNote?.notes ?? "");
      setPredefinedNotesDirty(false);
    }
  }, [predefined, predefinedCarNote]);

  // Sync edit fields when customCar loads
  useEffect(() => {
    if (customCar) {
      setEditName(customCar.name);
      setEditChassisId(customCar.chassisId ?? "chassis-other");
      setEditScale(customCar.scale);
      setEditDriveType(customCar.driveType);
      setEditNotes(customCar.notes ?? "");
      setEditSetupTemplateId(customCar.setupTemplateId ?? "");
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
    const chassis = getChassisPlatformById(editChassisId);
    await localDb.customCars.update(carId, {
      name: editName.trim() || customCar.name,
      chassisId: editChassisId,
      manufacturer: chassis?.manufacturer ?? "Other",
      scale: editScale.trim() || "1:28",
      driveType: editDriveType,
      notes: editNotes.trim() || undefined,
      setupTemplateId: editSetupTemplateId || undefined,
      updatedAt: new Date().toISOString(),
      _dirty: 1 as const,
    });
    setDetailsDirty(false);
  }, [carId, customCar, editName, editChassisId, editScale, editDriveType, editNotes, editSetupTemplateId]);

  const handleSavePredefinedNotes = useCallback(async () => {
    await localDb.carNotes.put({
      carId,
      notes: predefinedNotes.trim(),
      updatedAt: new Date().toISOString(),
    });
    setPredefinedNotesDirty(false);
  }, [carId, predefinedNotes]);

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
          <p className="text-xs text-neutral-500">{bannerSubtitle}</p>
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
                  <label className="text-xs text-neutral-400 mb-1 block">Chassis Model</label>
                  <select
                    className={inputClass}
                    value={editChassisId}
                    onChange={(e) => {
                      setEditChassisId(e.target.value);
                      const cp = getChassisPlatformById(e.target.value);
                      if (cp) { setEditScale(cp.scale); setEditDriveType(cp.driveType); }
                      setDetailsDirty(true);
                    }}
                  >
                    <option value="">Select…</option>
                    {Object.entries(
                      chassisPlatforms.reduce<Record<string, typeof chassisPlatforms>>((acc, cp) => {
                        (acc[cp.manufacturer] ??= []).push(cp);
                        return acc;
                      }, {})
                    ).map(([mfr, models]) => (
                      <optgroup key={mfr} label={mfr}>
                        {models.map((cp) => (
                          <option key={cp.id} value={cp.id}>
                            {cp.name} — {cp.scale} {cp.driveType}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
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

                {/* Setup Template */}
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Setup Template</label>
                  <select
                    className={inputClass}
                    value={editSetupTemplateId}
                    onChange={(e) => { setEditSetupTemplateId(e.target.value); setDetailsDirty(true); }}
                  >
                    <option value="">None</option>
                    {(() => {
                      // Show compatible templates first, then others
                      const compatible = allTemplates.filter(
                        (t) => t.compatibleChassisIds.length === 0 || t.compatibleChassisIds.includes(editChassisId),
                      );
                      const other = allTemplates.filter(
                        (t) => t.compatibleChassisIds.length > 0 && !t.compatibleChassisIds.includes(editChassisId),
                      );
                      return (
                        <>
                          {compatible.length > 0 && (
                            <optgroup label="Compatible">
                              {compatible.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.capabilities.length} fields)
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {other.length > 0 && (
                            <optgroup label="Other Templates">
                              {other.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.capabilities.length} fields)
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <p className="text-[10px] text-neutral-600 mt-1">
                    Defines which fields appear on this car's setup sheet.
                  </p>
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
              /* Predefined car: show specs + editable notes */
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
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
                  <textarea
                    className={inputClass + " min-h-[80px]"}
                    placeholder="Add personal notes for this car…"
                    value={predefinedNotes}
                    onChange={(e) => { setPredefinedNotes(e.target.value); setPredefinedNotesDirty(true); }}
                  />
                </div>
                {predefinedNotesDirty && (
                  <button
                    onClick={handleSavePredefinedNotes}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                  >
                    Save Notes
                  </button>
                )}
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
  | { kind: "addRace" }
  | { kind: "race-detail"; raceId: string };

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
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

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

  // Load setup snapshots for this car to resolve names
  const snapshots = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).toArray(),
    [carId],
  );

  const loading = raceResults === undefined || sessions === undefined;

  if (loading) {
    return <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>;
  }

  if (view.kind === "addRace") {
    return (
      <div className="px-4 py-4">
        <CarManualRaceEntry carId={carId} onSave={() => setView({ kind: "list" })} onCancel={() => setView({ kind: "list" })} />
      </div>
    );
  }

  if (view.kind === "race-detail") {
    const race = raceResults.find((r) => r.id === view.raceId);
    if (!race) return <p className="px-4 py-6 text-sm text-neutral-500">Race not found.</p>;
    return <RaceRunDetail race={race} onBack={() => setView({ kind: "list" })} />;
  }

  const hasRaces = raceResults.length > 0;
  const hasSessions = sessions.length > 0;
  const snapshotMap = new Map((snapshots ?? []).map((s) => [s.id, s]));

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header with + Add Run */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase">Run Results</h3>
        <div className="relative">
          <button
            onClick={() => setAddMenuOpen((o) => !o)}
            className="rounded-md bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-500"
          >
            + Add Run
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg bg-neutral-800 border border-neutral-700 shadow-lg z-20 overflow-hidden">
              <button
                onClick={() => { setAddMenuOpen(false); setView({ kind: "addRace" }); }}
                className="w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-700"
              >
                Add Race Result
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NLT Sync */}
      <TimingToCarMatch carId={carId} />

      {!hasRaces && !hasSessions && (
        <p className="text-center text-neutral-500 text-sm py-8">No runs or race results for this car yet.</p>
      )}

      {/* Race results */}
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

      {/* Sessions — expandable cards */}
      {hasSessions && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Sessions</h3>
          {sessions.map((s) => {
            const allLaps = s.segments.flatMap((seg) => (seg.lapTimes ?? []).filter((l) => !l.hidden));
            const sessionStats = computeLapStats(allLaps);
            const isExpanded = expandedSessionId === s.id;

            return (
              <div key={s.id} className="rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
                {/* Session card header */}
                <button
                  onClick={() => setExpandedSessionId(isExpanded ? null : s.id)}
                  className="w-full text-left p-3 hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-200">
                      {new Date(s.startedAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">
                        {s.endedAt ? "Completed" : "In Progress"}
                      </span>
                      <span className="text-neutral-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {sessionStats && (
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                      <MiniStat label="Fast Lap" value={fmt(sessionStats.best)} highlight />
                      <MiniStat label="Avg Lap" value={fmt(sessionStats.avg)} />
                      <MiniStat label="Consistency" value={`${sessionStats.consistency.toFixed(1)}%`} />
                      <MiniStat label="Track Time" value={fmtTotal(sessionStats.total)} />
                    </div>
                  )}
                  {!sessionStats && (
                    <p className="mt-1 text-xs text-neutral-500">No lap data</p>
                  )}
                </button>

                {/* Expanded: setup rows */}
                {isExpanded && (
                  <SessionSetupBreakdown
                    session={s}
                    snapshotMap={snapshotMap}
                    carId={carId}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-xs font-semibold ${highlight ? "text-green-400" : "text-neutral-200"}`}>{value}</p>
      <p className="text-[9px] text-neutral-500 uppercase">{label}</p>
    </div>
  );
}

// ─── Session → Setup Breakdown (expandable within session card) ──

interface SetupGroup {
  setupSnapshotId: string;
  setupName: string;
  laps: { lap: { lapNumber: number; timeMs: number; isOutlier?: boolean; hidden?: boolean; setupSnapshotId?: string }; segmentId: string; indexInSegment: number }[];
}

function groupLapsBySetup(
  session: LocalRunSession & { segments: LocalRunSegment[] },
  snapshotMap: Map<string, LocalSetupSnapshot>,
): SetupGroup[] {
  const groupMap = new Map<string, SetupGroup>();

  for (const seg of session.segments) {
    const segLaps = seg.lapTimes ?? [];
    for (let i = 0; i < segLaps.length; i++) {
      const lap = segLaps[i];
      const effectiveSetupId = lap.setupSnapshotId ?? seg.setupSnapshotId;
      let group = groupMap.get(effectiveSetupId);
      if (!group) {
        const snap = snapshotMap.get(effectiveSetupId);
        group = { setupSnapshotId: effectiveSetupId, setupName: snap?.name ?? "Unknown Setup", laps: [] };
        groupMap.set(effectiveSetupId, group);
      }
      group.laps.push({ lap, segmentId: seg.id, indexInSegment: i });
    }
  }

  return Array.from(groupMap.values());
}

function SessionSetupBreakdown({
  session,
  snapshotMap,
  carId,
}: {
  session: LocalRunSession & { segments: LocalRunSegment[] };
  snapshotMap: Map<string, LocalSetupSnapshot>;
  carId: string;
}) {
  const [expandedSetupId, setExpandedSetupId] = useState<string | null>(null);
  const setupGroups = useMemo(() => groupLapsBySetup(session, snapshotMap), [session, snapshotMap]);

  return (
    <div className="border-t border-neutral-800">
      {setupGroups.length === 0 && (
        <p className="px-3 py-3 text-xs text-neutral-500">No lap data in this session.</p>
      )}
      {setupGroups.map((group) => {
        const visibleLaps = group.laps.filter((l) => !l.lap.hidden);
        const stats = computeLapStats(visibleLaps.map((l) => l.lap));
        const isExpanded = expandedSetupId === group.setupSnapshotId;

        return (
          <div key={group.setupSnapshotId}>
            {/* Setup row */}
            <button
              onClick={() => setExpandedSetupId(isExpanded ? null : group.setupSnapshotId)}
              className="w-full text-left px-3 py-2.5 hover:bg-neutral-800/50 transition-colors border-t border-neutral-800/50 first:border-t-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-300 truncate max-w-[45%]">{group.setupName}</span>
                <span className="text-neutral-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
              </div>
              {stats && (
                <div className="mt-1 grid grid-cols-5 gap-1.5">
                  <MiniStat label="Laps" value={String(stats.count)} />
                  <MiniStat label="Best" value={fmt(stats.best)} highlight />
                  <MiniStat label="Avg" value={fmt(stats.avg)} />
                  <MiniStat label="Consistency" value={`${stats.consistency.toFixed(1)}%`} />
                  <MiniStat label="Std Dev" value={fmt(stats.stdDev)} />
                </div>
              )}
            </button>

            {/* Expanded: individual laps */}
            {isExpanded && (
              <SetupLapsList
                group={group}
                snapshotMap={snapshotMap}
                carId={carId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Laps list within a setup group ───────────────────────────

function SetupLapsList({
  group,
  snapshotMap,
  carId,
}: {
  group: SetupGroup;
  snapshotMap: Map<string, LocalSetupSnapshot>;
  carId: string;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const bestMs = Math.min(...group.laps.filter((l) => !l.lap.hidden).map((l) => l.lap.timeMs));

  return (
    <div className="px-3 pb-2 space-y-0.5">
      {group.laps.map((entry, idx) => {
        const { lap } = entry;
        const isBest = lap.timeMs === bestMs && !lap.hidden;
        const isEditing = editingIdx === idx;

        return (
          <div key={`${entry.segmentId}-${entry.indexInSegment}`}>
            <button
              onClick={() => setEditingIdx(isEditing ? null : idx)}
              className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
                lap.hidden
                  ? "bg-neutral-900/30 text-neutral-600 line-through"
                  : isBest
                    ? "bg-green-950/40 border border-green-800/50 text-green-300"
                    : "bg-neutral-900/50 text-neutral-300 hover:bg-neutral-800/50"
              }`}
            >
              <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
              <span className="font-mono">{fmt(lap.timeMs)}</span>
              <span className="text-neutral-600 text-[10px]">{isEditing ? "▲" : "✎"}</span>
            </button>

            {isEditing && (
              <LapEditForm
                entry={entry}
                snapshotMap={snapshotMap}
                carId={carId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Lap Edit Form (autosave on blur) ─────────────────────────

function LapEditForm({
  entry,
  snapshotMap: _snapshotMap,
  carId,
}: {
  entry: { lap: { lapNumber: number; timeMs: number; isOutlier?: boolean; hidden?: boolean; setupSnapshotId?: string }; segmentId: string; indexInSegment: number };
  snapshotMap: Map<string, LocalSetupSnapshot>;
  carId: string;
}) {
  const [hidden, setHidden] = useState(!!entry.lap.hidden);
  const [setupId, setSetupId] = useState(entry.lap.setupSnapshotId ?? "");

  // All snapshots for this car (for the dropdown)
  const allSnapshots = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).reverse().sortBy("updatedAt"),
    [carId],
  );

  const save = useCallback(async (newHidden: boolean, newSetupId: string) => {
    const seg = await localDb.runSegments.get(entry.segmentId);
    if (!seg || !seg.lapTimes) return;
    const updated = [...seg.lapTimes];
    if (entry.indexInSegment < updated.length) {
      updated[entry.indexInSegment] = {
        ...updated[entry.indexInSegment],
        hidden: newHidden || undefined,
        setupSnapshotId: newSetupId || undefined,
      };
      await localDb.runSegments.update(entry.segmentId, { lapTimes: updated, _dirty: 1 as const });
    }
  }, [entry.segmentId, entry.indexInSegment]);

  const handleHiddenChange = (checked: boolean) => {
    setHidden(checked);
    save(checked, setupId);
  };

  const handleSetupChange = (id: string) => {
    setSetupId(id);
    save(hidden, id);
  };

  return (
    <div className="ml-3 mr-1 my-1 p-2 rounded bg-neutral-800 border border-neutral-700 space-y-2">
      {/* Setup selector */}
      <div>
        <label className="text-[10px] text-neutral-500 block mb-0.5">Car Setup</label>
        <select
          value={setupId}
          onChange={(e) => handleSetupChange(e.target.value)}
          onBlur={() => save(hidden, setupId)}
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
        >
          <option value="">— segment default —</option>
          {(allSnapshots ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {/* Hide toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <div
          role="switch"
          aria-checked={hidden}
          onClick={() => handleHiddenChange(!hidden)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${hidden ? "bg-red-600" : "bg-neutral-700"}`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${hidden ? "translate-x-4" : "translate-x-0"}`} />
        </div>
        <span className="text-xs text-neutral-400">Hide / exclude from KPIs</span>
      </label>
    </div>
  );
}

// ─── Timing to Car Match ──────────────────────────────────────

function TimingToCarMatch({ carId }: { carId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(() => localStorage.getItem("nlt_last_track_id") ?? "");
  const [raceNumber, setRaceNumber] = useState("");
  const [saved, setSaved] = useState(false);
  const [minLapSec, setMinLapSec] = useState("");
  const [maxLapSec, setMaxLapSec] = useState("");

  // Race listing
  interface NltRaceSummary { id: number; name: string; status: string; mode: string; startedAt: string | null; }
  const [races, setRaces] = useState<NltRaceSummary[]>([]);
  const [racesLoading, setRacesLoading] = useState(false);
  const [racesError, setRacesError] = useState<string | null>(null);

  // Participants from selected race
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);

  // Current saved timing→car match
  const timingNameRecord = useLiveQuery(() => localDb.carTimingNames.get(carId), [carId]);
  const [selectedTimingName, setSelectedTimingName] = useState("");

  useEffect(() => {
    setSelectedTimingName(timingNameRecord?.timingName ?? "");
    if (timingNameRecord?.minLapMs != null) setMinLapSec(String(timingNameRecord.minLapMs / 1000));
    if (timingNameRecord?.maxLapMs != null) setMaxLapSec(String(timingNameRecord.maxLapMs / 1000));
  }, [timingNameRecord]);

  const car = getCarById(carId);
  const carName = car?.name ?? "";

  const tracks = useLiveQuery(() => localDb.tracks.toArray()) ?? [];
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const feedUrl = selectedTrack?.timingFeedUrl;
  const nltCommunityId = selectedTrack?.nltCommunityId;

  // Is the selected race still active/live?
  const selectedRace = races.find((r) => String(r.id) === raceNumber);
  const isRaceLive = selectedRace?.status === "active";

  // Fetch race list when track changes
  useEffect(() => {
    if (!feedUrl && !nltCommunityId) { setRaces([]); return; }
    setRacesLoading(true);
    setRacesError(null);
    const body: Record<string, unknown> = {};
    if (nltCommunityId) body.communityId = nltCommunityId;
    else body.feedUrl = feedUrl;
    fetch(`${API_BASE}/api/nlt/races`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ races: NltRaceSummary[] }>;
      })
      .then((data) => { setRaces(data.races); setRaceNumber(""); setParticipants([]); })
      .catch((err) => {
        setRacesError(err instanceof Error ? err.message : "Failed to load races");
        setRaces([]);
      })
      .finally(() => setRacesLoading(false));
  }, [feedUrl, nltCommunityId]);

  // Fetch participants when race changes
  useEffect(() => {
    if (!raceNumber) { setParticipants([]); return; }
    setParticipantsLoading(true);
    setParticipantsError(null);
    fetch(`${API_BASE}/api/nlt/participants/${raceNumber}`)
      .then(async (res) => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ participants: string[] }>;
      })
      .then((data) => { setParticipants(data.participants); })
      .catch((err) => {
        setParticipantsError(err instanceof Error ? err.message : "Failed to load racers");
        setParticipants([]);
      })
      .finally(() => setParticipantsLoading(false));
  }, [raceNumber]);

  const handleSave = async () => {
    if (!selectedTimingName) return;
    const minMs = minLapSec ? parseFloat(minLapSec) * 1000 : undefined;
    const maxMs = maxLapSec ? parseFloat(maxLapSec) * 1000 : undefined;
    await localDb.carTimingNames.put({ carId, timingName: selectedTimingName, minLapMs: minMs, maxLapMs: maxMs });
    if (selectedTrackId) localStorage.setItem("nlt_last_track_id", selectedTrackId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    await localDb.carTimingNames.delete(carId);
    setSelectedTimingName("");
    setMinLapSec("");
    setMaxLapSec("");
  };

  const buttonLabel = saved ? "Saved ✓" : isRaceLive ? "Sync" : "Import";

  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
      >
        <span>Timing to Car Match</span>
        <span className="text-neutral-600">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-neutral-800 pt-2">
          {/* Current saved match */}
          {timingNameRecord?.timingName && (
            <div className="flex items-center justify-between rounded bg-green-950/40 border border-green-800/40 px-2 py-1.5">
              <span className="text-[10px] text-green-400">✓ Matched as <strong>{timingNameRecord.timingName}</strong> on import/sync</span>
              <button onClick={handleClear} className="text-[10px] text-neutral-500 hover:text-red-400 ml-2">Clear</button>
            </div>
          )}
          {/* Track selector */}
          <select
            value={selectedTrackId}
            onChange={(e) => { setSelectedTrackId(e.target.value); setRaceNumber(""); setParticipants([]); }}
            className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
          >
            <option value="">— select track —</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.timingFeedUrl ? " ✓" : ""}</option>
            ))}
          </select>
          {racesError && <p className="text-[10px] text-amber-500">{racesError}</p>}
          {/* Race selector */}
          {selectedTrackId && (racesLoading || races.length > 0) && (
            <select
              value={raceNumber}
              onChange={(e) => { setRaceNumber(e.target.value); setParticipants([]); }}
              disabled={racesLoading}
              className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
            >
              <option value="">{racesLoading ? "Loading races…" : "— select race —"}</option>
              {races.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}{r.startedAt ? ` (${new Date(r.startedAt).toLocaleDateString()})` : ""}{r.status === "active" ? " 🔴" : ""}
                </option>
              ))}
            </select>
          )}
          {/* Min/Max lap filter */}
          {selectedTrackId && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-neutral-500 block mb-0.5">Min Lap (sec)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={minLapSec}
                  onChange={(e) => setMinLapSec(e.target.value)}
                  placeholder="e.g. 5.0"
                  className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-neutral-500 block mb-0.5">Max Lap (sec)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={maxLapSec}
                  onChange={(e) => setMaxLapSec(e.target.value)}
                  placeholder="e.g. 15.0"
                  className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                />
              </div>
            </div>
          )}
          {/* Racer name selector */}
          {raceNumber && (
            <div className="flex gap-2">
              <select
                value={selectedTimingName}
                onChange={(e) => setSelectedTimingName(e.target.value)}
                disabled={participantsLoading}
                className="flex-1 rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
              >
                <option value="">{participantsLoading ? "Loading racers…" : "— select your name —"}</option>
                {participants.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                onClick={handleSave}
                disabled={!selectedTimingName || saved}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${saved ? "bg-green-700 text-white" : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"}`}
              >
                {buttonLabel}
              </button>
            </div>
          )}
          {participantsError && <p className="text-[10px] text-amber-500">{participantsError}</p>}
          {!selectedTrackId && !timingNameRecord?.timingName && (
            <p className="text-[10px] text-neutral-600">
              Select a track and race, then pick your racer name to auto-match on import/sync.{carName ? ` Car: ${carName}.` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual Race Entry (for car) ──────────────────────────────

function CarManualRaceEntry({ carId, onSave, onCancel }: { carId: string; onSave: () => void; onCancel: () => void }) {
  const car = getCarById(carId);
  const [form, setForm] = useState({
    eventName: "",
    community: "",
    className: "",
    roundType: "main" as string,
    roundNumber: 1,
    date: new Date().toISOString().slice(0, 10),
    position: 1,
    totalEntries: undefined as number | undefined,
    fastLapMs: 0,
    lapsText: "",
    notes: "",
  });

  const handleSubmit = async () => {
    const laps = parseLapTimesText(form.lapsText);
    const fastLapMs = laps.length > 0 ? Math.min(...laps.map((l) => l.timeMs)) : form.fastLapMs;
    const totalTimeMs = laps.length > 0 ? laps.reduce((s, l) => s + l.timeMs, 0) : 0;
    const totalLaps = laps.length > 0 ? laps.length : 0;
    const avgLapMs = totalLaps > 0 ? Math.round(totalTimeMs / totalLaps) : undefined;

    const result: LocalRaceResult = {
      id: crypto.randomUUID(),
      userId: "local",
      carId,
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
      {car && <p className="text-xs text-neutral-500">Car: {car.name}</p>}
      <div className="space-y-3">
        <CarField label="Event Name" value={form.eventName} onChange={(v) => set("eventName", v)} placeholder="e.g. Saturday Night Race" />
        <CarField label="Community / Club" value={form.community} onChange={(v) => set("community", v)} placeholder="e.g. Piedmont Micro RC" />
        <CarField label="Class Name" value={form.className} onChange={(v) => set("className", v)} placeholder="e.g. Evo2 5600kv" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-400 block mb-1">Round Type</label>
            <select value={form.roundType} onChange={(e) => set("roundType", e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200">
              <option value="practice">Practice</option>
              <option value="qualifying">Qualifying</option>
              <option value="main">Main</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <CarField label="Round #" value={String(form.roundNumber)} onChange={(v) => set("roundNumber", Number(v) || 1)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CarField label="Date" value={form.date} onChange={(v) => set("date", v)} type="date" />
          <CarField label="Position" value={String(form.position)} onChange={(v) => set("position", Number(v) || 1)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CarField label="Entries" value={form.totalEntries != null ? String(form.totalEntries) : ""} onChange={(v) => set("totalEntries", v ? Number(v) : undefined)} type="number" placeholder="#" />
          <CarField label="Fast Lap (s)" value={form.fastLapMs ? String(form.fastLapMs / 1000) : ""} onChange={(v) => set("fastLapMs", Number(v) * 1000 || 0)} type="number" placeholder="6.861" />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-400 block mb-1">Lap Times (one per line, in seconds)</label>
          <textarea value={form.lapsText} onChange={(e) => set("lapsText", e.target.value)} rows={4}
            placeholder={"7.236\n7.352\n6.861\n7.419"}
            className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200 font-mono" />
        </div>
        <CarField label="Notes" value={form.notes} onChange={(v) => set("notes", v)} placeholder="Optional notes" />
        <button onClick={handleSubmit} className="w-full rounded bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-500">
          Save Result
        </button>
      </div>
    </div>
  );
}

function CarField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-400 block mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200" />
    </div>
  );
}

function parseLapTimesText(text: string): { lapNumber: number; timeMs: number }[] {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      const colonMatch = line.match(/^(\d+):(\d+\.?\d*)$/);
      if (colonMatch) {
        const min = Number(colonMatch[1]);
        const sec = Number(colonMatch[2]);
        return { lapNumber: i + 1, timeMs: Math.round((min * 60 + sec) * 1000) };
      }
      const num = Number(line);
      if (isNaN(num)) return null;
      const timeMs = num > 100 ? Math.round(num) : Math.round(num * 1000);
      return { lapNumber: i + 1, timeMs };
    })
    .filter((l): l is { lapNumber: number; timeMs: number } => l !== null);
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


