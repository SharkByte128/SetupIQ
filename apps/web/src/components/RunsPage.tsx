import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { RunSession, RunSegment, SetupSnapshot, LapTime } from "@setupiq/shared";
import { allCars, getCarById } from "@setupiq/shared";
import { localDb, type LocalRaceResult, type CarTimingName } from "../db/local-db.js";
import { useSetups } from "../hooks/use-setups.js";
import { useRunSessions } from "../hooks/use-run-sessions.js";
import { useHideDemoData, useShowHiddenRuns } from "../hooks/use-demo-filter.js";
import { DriverFeedbackForm } from "./DriverFeedbackForm.js";
import { RecommendationsPanel } from "./RecommendationsPanel.js";
import { exportSessionCsv, downloadCsv } from "../utils/export.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type View =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "addRace" }
  | { kind: "active"; session: RunSession }
  | { kind: "feedback"; session: RunSession; segment: RunSegment }
  | { kind: "summary"; session: RunSession }
  | { kind: "raceDetail"; result: LocalRaceResult }
  | { kind: "liveDashboard"; result: LocalRaceResult };

export function RunsPage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const hideDemoData = useHideDemoData();
  const [showHidden] = useShowHiddenRuns();
  // Load setups and sessions across ALL cars
  const { setups } = useSetups(undefined, hideDemoData);
  const { sessions, loading, startSession, addSegment, updateSegmentFeedback, updateSegmentLapTimes, endSession } =
    useRunSessions(undefined, hideDemoData);

  // Race results (all cars), filter hidden unless "show hidden" is on
  const raceResults = useLiveQuery(
    () => localDb.raceResults.orderBy("date").reverse().toArray()
      .then((rows) => showHidden ? rows : rows.filter((r) => !r.hidden)),
    [showHidden],
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const handleStartSession = useCallback(
    async (carId: string, setupId: string) => {
      const s = await startSession(carId, setupId);
      setView({ kind: "active", session: s });
    },
    [startSession],
  );

  const handleEndSession = useCallback(
    async (sessionId: string, notes?: string) => {
      await endSession(sessionId, notes);
      const updated = sessions.find((s) => s.id === sessionId);
      if (updated) setView({ kind: "summary", session: updated });
      else setView({ kind: "list" });
    },
    [endSession, sessions],
  );

  return (
    <div className="px-4 py-4">
      {view.kind === "list" && (
        <AnalyticsDashboard
          sessions={sessions}
          raceResults={raceResults ?? []}
          loading={loading}
          addMenuOpen={addMenuOpen}
          onToggleAddMenu={() => setAddMenuOpen((o) => !o)}
          onNewRun={() => { setAddMenuOpen(false); setView({ kind: "new" }); }}
          onAddRace={() => { setAddMenuOpen(false); setView({ kind: "addRace" }); }}
          onSelectSession={(s) => (s.endedAt ? setView({ kind: "summary", session: s }) : setView({ kind: "active", session: s }))}
          onSelectRace={(r) => setView({ kind: "liveDashboard", result: r })}
        />
      )}

      {view.kind === "new" && (
        <NewRunFlow
          setups={setups}
          onStart={handleStartSession}
          onCancel={() => setView({ kind: "list" })}
        />
      )}

      {view.kind === "addRace" && (
        <ManualRaceEntry
          onSave={() => setView({ kind: "list" })}
          onCancel={() => setView({ kind: "list" })}
        />
      )}

      {view.kind === "active" && (
        <ActiveSession
          session={view.session}
          setups={setups}
          onFeedback={(seg) => setView({ kind: "feedback", session: view.session, segment: seg })}
          onSetupChange={async (setupId, changes) => {
            await addSegment(view.session.id, setupId, changes);
            setView({ kind: "list" });
          }}
          onEnd={(notes) => handleEndSession(view.session.id, notes)}
          onAddLapTime={async (segId, laps) => {
            await updateSegmentLapTimes(segId, laps);
          }}
        />
      )}

      {view.kind === "feedback" && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-200">
            Segment {view.segment.segmentNumber} Feedback
          </h2>
          <DriverFeedbackForm
            initial={view.segment.feedback}
            onSubmit={async (fb) => {
              await updateSegmentFeedback(view.segment.id, fb);
              setView({ kind: "active", session: view.session });
            }}
            onCancel={() => setView({ kind: "active", session: view.session })}
          />
        </div>
      )}

      {view.kind === "summary" && (
        <SessionSummary session={view.session} onBack={() => setView({ kind: "list" })} />
      )}

      {view.kind === "raceDetail" && (
        <RaceDetail
          result={view.result}
          onBack={() => setView({ kind: "list" })}
          onDelete={async () => {
            await localDb.raceResults.delete(view.result.id);
            setView({ kind: "list" });
          }}
        />
      )}

      {view.kind === "liveDashboard" && (
        <LiveRunDashboard
          resultId={view.result.id}
          onBack={() => setView({ kind: "list" })}
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function AnalyticsDashboard({
  sessions,
  raceResults,
  loading,
  addMenuOpen,
  onToggleAddMenu,
  onNewRun,
  onAddRace,
  onSelectSession,
  onSelectRace,
}: {
  sessions: RunSession[];
  raceResults: LocalRaceResult[];
  loading: boolean;
  addMenuOpen: boolean;
  onToggleAddMenu: () => void;
  onNewRun: () => void;
  onAddRace: () => void;
  onSelectSession: (s: RunSession) => void;
  onSelectRace: (r: LocalRaceResult) => void;
}) {
  // Per-car min/max lap filter
  const carTimingNames = useLiveQuery(() => localDb.carTimingNames.toArray(), []);
  const timingMap = useMemo(() => {
    const m = new Map<string, CarTimingName>();
    for (const t of carTimingNames ?? []) m.set(t.carId, t);
    return m;
  }, [carTimingNames]);

  const GAP_MS = 60000;
  const filterRaceLaps = useCallback((r: LocalRaceResult) => {
    const t = timingMap.get(r.carId);
    return r.laps.filter((l) => {
      if (l.hidden) return false;
      if (l.timeMs >= GAP_MS) return false;
      if (t?.minLapMs != null && l.timeMs < t.minLapMs) return false;
      if (t?.maxLapMs != null && l.timeMs > t.maxLapMs) return false;
      return true;
    });
  }, [timingMap]);

  // Aggregate stats
  const totalSessions = sessions.length;
  const totalRaces = raceResults.length;
  const allFilteredRaceLaps = useMemo(() => raceResults.flatMap(filterRaceLaps), [raceResults, filterRaceLaps]);
  const allSessionLaps = sessions.reduce(
    (t, s) => t + s.segments.reduce((st, seg) => st + (seg.lapTimes?.length ?? 0), 0),
    0,
  );
  const totalLaps = allFilteredRaceLaps.length + allSessionLaps;

  const allFastLaps = [
    ...allFilteredRaceLaps.map((l) => l.timeMs),
    ...sessions.flatMap((s) =>
      s.segments.flatMap((seg) => (seg.lapTimes ?? []).map((l) => l.timeMs)),
    ),
  ];
  const bestLap = allFastLaps.length > 0 ? Math.min(...allFastLaps) : null;

  // Enhanced analytics
  const linkedRaces = raceResults.filter((r) => r.carId);
  const avgPosition = linkedRaces.length > 0
    ? (linkedRaces.reduce((t, r) => t + r.position, 0) / linkedRaces.length).toFixed(1)
    : null;
  const avgLapMs = useMemo(() => {
    if (allFilteredRaceLaps.length === 0) return null;
    const total = allFilteredRaceLaps.reduce((t, l) => t + l.timeMs, 0);
    return Math.round(total / allFilteredRaceLaps.length);
  }, [allFilteredRaceLaps]);

  // Per-car breakdown
  const perCarStats = useMemo(() => {
    const map = new Map<string, { name: string; races: number; bestLap: number; totalLaps: number }>();
    for (const r of raceResults) {
      if (!r.carId) continue;
      const car = getCarById(r.carId);
      const filtered = filterRaceLaps(r);
      const entry = map.get(r.carId) ?? { name: car?.name ?? r.carId, races: 0, bestLap: Infinity, totalLaps: 0 };
      entry.races++;
      entry.totalLaps += filtered.length;
      const best = filtered.length > 0 ? Math.min(...filtered.map((l) => l.timeMs)) : Infinity;
      if (best < entry.bestLap) entry.bestLap = best;
      map.set(r.carId, entry);
    }
    return [...map.values()].sort((a, b) => b.races - a.races);
  }, [raceResults, filterRaceLaps]);

  // Build unified timeline
  type TimelineEntry =
    | { type: "session"; date: string; item: RunSession }
    | { type: "race"; date: string; item: LocalRaceResult };

  const timeline: TimelineEntry[] = [
    ...sessions.map((s) => ({ type: "session" as const, date: s.startedAt, item: s })),
    ...raceResults.map((r) => ({ type: "race" as const, date: r.date, item: r })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) return <p className="text-center text-neutral-500 text-sm py-8">Loading…</p>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Runs</h2>
        <div className="relative">
          <button
            onClick={onToggleAddMenu}
            className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-500"
          >
            + Add Run
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg bg-neutral-800 border border-neutral-700 shadow-lg z-20 overflow-hidden">
              <button
                onClick={onNewRun}
                className="w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-700"
              >
                New Practice Session
              </button>
              <button
                onClick={onAddRace}
                className="w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-700"
              >
                Add Race Result
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NLT Sync mini form */}
      <NltSyncMini />

      {/* Stats overview */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Sessions" value={String(totalSessions)} />
        <StatCard label="Races" value={String(totalRaces)} />
        <StatCard label="Total Laps" value={String(totalLaps)} />
        <StatCard label="Best Lap" value={bestLap ? `${(bestLap / 1000).toFixed(3)}s` : "—"} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Avg Lap" value={avgLapMs ? `${(avgLapMs / 1000).toFixed(3)}s` : "—"} />
        <StatCard label="Avg Position" value={avgPosition ?? "—"} />
        <StatCard label="Linked" value={`${linkedRaces.length}/${totalRaces}`} />
      </div>

      {/* Per-car breakdown */}
      {perCarStats.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-neutral-400">Per Car</h3>
          <div className="grid gap-1.5">
            {perCarStats.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded bg-neutral-900 border border-neutral-800 px-3 py-2">
                <span className="text-xs font-medium text-neutral-200">{c.name}</span>
                <div className="flex gap-3 text-[10px] text-neutral-500">
                  <span>{c.races} race{c.races !== 1 ? "s" : ""}</span>
                  <span>{c.totalLaps} laps</span>
                  <span>Best: {c.bestLap < Infinity ? `${(c.bestLap / 1000).toFixed(3)}s` : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unified timeline */}
      {timeline.length === 0 ? (
        <p className="text-center text-neutral-500 text-sm py-12">No runs or race results yet.</p>
      ) : (
        <ul className="space-y-2">
          {timeline.map((entry) => {
            if (entry.type === "session") {
              const s = entry.item;
              const car = getCarById(s.carId);
              const lapCount = s.segments.reduce((t, seg) => t + (seg.lapTimes?.length ?? 0), 0);
              return (
                <li key={`s-${s.id}`}>
                  <button
                    onClick={() => onSelectSession(s)}
                    className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 p-3 hover:border-neutral-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">Session</span>
                        <span className="text-sm font-medium text-neutral-200">
                          {new Date(s.startedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span className={`text-xs ${s.endedAt ? "text-green-500" : "text-yellow-500"}`}>
                        {s.endedAt ? "Completed" : "Active"}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                      {car && <span>{car.name}</span>}
                      <span>{s.segments.length} segment{s.segments.length !== 1 ? "s" : ""}</span>
                      {lapCount > 0 && <span>{lapCount} laps</span>}
                    </div>
                  </button>
                </li>
              );
            } else {
              const r = entry.item;
              const car = getCarById(r.carId);
              const isUnlinked = !r.carId;
              const filteredLaps = filterRaceLaps(r);
              const bestMs = filteredLaps.length > 0 ? Math.min(...filteredLaps.map((l) => l.timeMs)) : 0;
              return (
                <li key={`r-${r.id}`}>
                  <button
                    onClick={() => onSelectRace(r)}
                    className={`w-full text-left rounded-lg bg-neutral-900 border p-3 hover:border-neutral-700 ${isUnlinked ? "border-amber-800/50" : "border-neutral-800"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded">Race</span>
                        <span className="text-sm font-medium text-neutral-200">{r.eventName}</span>
                      </div>
                      <span className="text-xs text-neutral-500">{new Date(r.date).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                      <span>P{r.position}{r.totalEntries ? `/${r.totalEntries}` : ""}</span>
                      <span>{filteredLaps.length} laps</span>
                      <span>Fast: {bestMs > 0 ? `${(bestMs / 1000).toFixed(3)}s` : "—"}</span>
                      {car && <span className="text-neutral-600">{car.name}</span>}
                      {isUnlinked && <span className="text-amber-500/70 italic">Unlinked</span>}
                    </div>
                  </button>
                  {isUnlinked && (
                    <div className="flex items-center gap-2 mt-1 px-1" onClick={(e) => e.stopPropagation()}>
                      <select
                        defaultValue=""
                        onChange={async (e) => {
                          const carId = e.target.value;
                          if (!carId) return;
                          await localDb.raceResults.update(r.id, { carId, hidden: 0, _dirty: 1 });
                          e.target.value = "";
                        }}
                        className="flex-1 rounded bg-neutral-800 border border-neutral-700 px-1.5 py-1 text-[10px] text-neutral-300"
                      >
                        <option value="">Link to car…</option>
                        {allCars.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          await localDb.raceResults.update(r.id, { hidden: 1, _dirty: 1 });
                        }}
                        className="rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-[10px] text-red-400 hover:bg-red-900/30"
                      >
                        Hide
                      </button>
                    </div>
                  )}
                </li>
              );
            }
          })}
        </ul>
      )}
    </div>
  );
}

// ─── NLT Sync Mini Form ──────────────────────────────────────

interface NltRaceSummary {
  id: number;
  name: string;
  status: string;
  mode: string;
  startedAt: string | null;
}

function NltSyncMini() {
  const [expanded, setExpanded] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(() => localStorage.getItem("nlt_last_track_id") ?? "");
  const [raceNumber, setRaceNumber] = useState(() => localStorage.getItem("nlt_last_race_number") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NltRaceData[] | null>(null);
  // "ignore" means hidden, any car id means linked
  const [selectedCars, setSelectedCars] = useState<Record<number, string | "ignore">>({});

  // Race listing from NLT community
  const [races, setRaces] = useState<NltRaceSummary[]>([]);
  const [racesLoading, setRacesLoading] = useState(false);
  const [racesError, setRacesError] = useState<string | null>(null);

  // Live sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNewLapAtRef = useRef<number>(Date.now());
  const lastLapTotalRef = useRef<number>(0);
  const syncStartedAtRef = useRef<number>(Date.now());

  // Timing→car mappings (saved from Timing to Car Match)
  const carTimingNames = useLiveQuery(() => localDb.carTimingNames.toArray()) ?? [];
  const timingNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ctn of carTimingNames) {
      if (ctn.timingName) map.set(ctn.timingName.toLowerCase(), ctn.carId);
    }
    return map;
  }, [carTimingNames]);

  const tracks = useLiveQuery(() => localDb.tracks.toArray()) ?? [];
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const feedUrl = selectedTrack?.timingFeedUrl;
  const nltCommunityId = selectedTrack?.nltCommunityId;

  const selectedRaceObj = races.find((r) => String(r.id) === raceNumber);
  const isLiveRace = selectedRaceObj?.status === "active";

  // Cleanup sync interval on unmount
  useEffect(() => {
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, []);

  // Stop sync when track/race selection changes
  useEffect(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
      setIsSyncing(false);
      setSyncStatus(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceNumber, selectedTrackId]);

  // Fetch race list when track changes and has a feed URL
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
      .then((data) => {
        setRaces(data.races);
        const lastRace = localStorage.getItem("nlt_last_race_number") ?? "";
        if (data.races.some((r: NltRaceSummary) => String(r.id) === lastRace)) {
          setRaceNumber(lastRace);
        } else {
          setRaceNumber("");
        }
      })
      .catch((err) => {
        setRacesError(err instanceof Error ? err.message : "Failed to load races");
        setRaces([]);
      })
      .finally(() => setRacesLoading(false));
  }, [feedUrl, nltCommunityId]);

  /** Build the full NLT race URL from current raceNumber + feedUrl */
  const buildUrl = useCallback((): string | null => {
    const trimmed = raceNumber.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http")) return trimmed;
    if (feedUrl) {
      const base = feedUrl.endsWith("/") ? feedUrl : feedUrl + "/";
      return base + trimmed;
    }
    // Numeric race ID without feed URL — construct minimal valid URL
    if (/^\d+$/.test(trimmed)) return `https://nextleveltiming.com/races/${trimmed}`;
    return null;
  }, [raceNumber, feedUrl]);

  /** Upsert race results for one live-sync tick. Returns true if any change. */
  const doSyncTick = useCallback(async (): Promise<boolean> => {
    const url = buildUrl();
    if (!url) return false;
    try {
      const res = await fetch(`${API_BASE}/api/nlt/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return false;
      const data: NltRaceData[] = await res.json();
      if (!data.length) return false;

      let newTotal = 0;
      for (const d of data) newTotal += d.totalLaps;

      let hasNew = false;
      for (const d of data) {
        const racerLower = d.className.toLowerCase();
        const mappedCarId = timingNameMap.get(racerLower) ?? allCars.find((c) => c.name.toLowerCase() === racerLower)?.id ?? "";
        const existingRows = await localDb.raceResults
          .filter((r) => r.sourceUrl === url && r.className === d.className)
          .toArray();
        const existing = existingRows[0];
        if (existing) {
          if (existing.totalLaps !== d.totalLaps || existing.fastLapMs !== d.fastLapMs) {
            await localDb.raceResults.update(existing.id, {
              totalLaps: d.totalLaps,
              totalTimeMs: d.totalTimeMs,
              fastLapMs: d.fastLapMs,
              avgLapMs: d.totalLaps > 0 ? Math.round(d.totalTimeMs / d.totalLaps) : undefined,
              laps: d.laps,
              position: d.position,
              _dirty: 1,
            });
            hasNew = true;
          }
        } else {
          await localDb.raceResults.add({
            id: crypto.randomUUID(),
            userId: "local",
            carId: mappedCarId,
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
            hidden: mappedCarId ? 0 : 1,
            createdAt: new Date().toISOString(),
            _dirty: 1,
          });
          hasNew = true;
        }
      }

      if (newTotal > lastLapTotalRef.current) {
        lastLapTotalRef.current = newTotal;
        lastNewLapAtRef.current = Date.now();
      }
      return hasNew;
    } catch {
      return false;
    }
  }, [buildUrl, timingNameMap]);

  const stopSync = useCallback(() => {
    if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
    setIsSyncing(false);
    setIsPaused(false);
  }, []);

  const startSync = useCallback(async () => {
    const url = buildUrl();
    if (!url) return;
    localStorage.setItem("nlt_last_race_number", raceNumber.trim());
    if (selectedTrackId) localStorage.setItem("nlt_last_track_id", selectedTrackId);
    setIsSyncing(true);
    setIsPaused(false);
    setPreview(null);
    setError(null);
    lastNewLapAtRef.current = Date.now();
    lastLapTotalRef.current = 0;
    syncStartedAtRef.current = Date.now();
    setSyncStatus(`Started · ${new Date().toLocaleTimeString()}`);

    await doSyncTick();
    setSyncStatus(`Last check: ${new Date().toLocaleTimeString()}`);

    syncIntervalRef.current = setInterval(async () => {
      const now = Date.now();
      const idleMins = (now - lastNewLapAtRef.current) / 60000;
      const totalHrs = (now - syncStartedAtRef.current) / 3600000;

      // 1 hour total idle → stop completely
      if (totalHrs >= 1 && idleMins >= 60) {
        stopSync();
        setSyncStatus("Auto-stopped · no activity in 1 hour");
        return;
      }

      // 5 min idle → pause for 5 min
      if (idleMins >= 5) {
        setIsPaused(true);
        setSyncStatus(`Paused · no new laps in ${Math.floor(idleMins)}min · resumes at ${new Date(lastNewLapAtRef.current + 10 * 60000).toLocaleTimeString()}`);
        // If we've been paused for 5 min (10 min since last lap), resume
        if (idleMins >= 10) {
          setIsPaused(false);
          lastNewLapAtRef.current = now; // reset idle timer
          await doSyncTick();
          setSyncStatus(`Resumed · ${new Date().toLocaleTimeString()}`);
        }
        return;
      }

      setIsPaused(false);
      await doSyncTick();
      setSyncStatus(`Last check: ${new Date().toLocaleTimeString()}`);
    }, 8000);
  }, [buildUrl, raceNumber, selectedTrackId, doSyncTick, stopSync]);

  const handleImport = async () => {
    const url = buildUrl();
    if (!url) return;
    localStorage.setItem("nlt_last_race_number", raceNumber.trim());
    if (selectedTrackId) localStorage.setItem("nlt_last_track_id", selectedTrackId);
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(`${API_BASE}/api/nlt/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({ error: "Sync failed" }));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const data: NltRaceData[] = await res.json();
      if (data.length === 0) { setError("No results found for that race."); return; }
      setPreview(data);
      // Auto-match using saved timing→car mappings, then fall back to car name
      const defaults: Record<number, string | "ignore"> = {};
      data.forEach((d, i) => {
        const racerLower = d.className.toLowerCase();
        const mapped = timingNameMap.get(racerLower);
        defaults[i] = mapped ?? allCars.find((c) => c.name.toLowerCase() === racerLower)?.id ?? "ignore";
      });
      setSelectedCars(defaults);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    if (!preview) return;
    const url = buildUrl() ?? raceNumber.trim();
    for (let i = 0; i < preview.length; i++) {
      const d = preview[i];
      const choice = selectedCars[i] ?? "ignore";
      const isIgnored = choice === "ignore";
      await localDb.raceResults.add({
        id: crypto.randomUUID(),
        userId: "local",
        carId: isIgnored ? "" : choice,
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
        hidden: isIgnored ? 1 : 0,
        createdAt: new Date().toISOString(),
        _dirty: 1,
      });
    }
    setPreview(null);
    setExpanded(false);
  };

  const linkedCount = preview ? Object.values(selectedCars).filter((v) => v !== "ignore").length : 0;
  const canAct = !!(raceNumber.trim() && (raceNumber.trim().startsWith("http") || feedUrl || /^\d+$/.test(raceNumber.trim())));

  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
      >
        <span>NLT Sync{isSyncing ? " 🔴" : ""}</span>
        <span className="text-neutral-600">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-neutral-800 pt-2">
          <div className="space-y-1.5">
            <select
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              disabled={isSyncing}
              className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
            >
              <option value="">— select track —</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.timingFeedUrl ? " ✓" : ""}</option>
              ))}
            </select>
            {selectedTrack && !feedUrl && (
              <p className="text-[10px] text-amber-500">This track has no timing feed URL — set it in Tracks settings, or paste a full URL below.</p>
            )}
          </div>
          <div className="flex gap-2">
            {(racesLoading || races.length > 0) ? (
              <select
                value={raceNumber}
                onChange={(e) => setRaceNumber(e.target.value)}
                disabled={racesLoading || isSyncing}
                className="flex-1 rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
              >
                <option value="">{racesLoading ? "Loading races…" : "— select race —"}</option>
                {races.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}{r.startedAt ? ` (${new Date(r.startedAt).toLocaleDateString()})` : ""}{r.status === "active" ? " 🔴 LIVE" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={raceNumber}
                onChange={(e) => setRaceNumber(e.target.value)}
                disabled={isSyncing}
                placeholder={feedUrl ? "Race / run number" : "Race number or full URL"}
                className="flex-1 rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
              />
            )}
            {isSyncing ? (
              <button
                onClick={stopSync}
                className="rounded bg-neutral-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-600 whitespace-nowrap"
              >
                Stop
              </button>
            ) : isLiveRace ? (
              <button
                onClick={startSync}
                disabled={!canAct}
                className="rounded bg-red-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
              >
                🔴 Sync
              </button>
            ) : (
              <button
                onClick={handleImport}
                disabled={loading || !canAct}
                className="rounded bg-blue-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "…" : "Import"}
              </button>
            )}
          </div>

          {/* Sync status */}
          {isSyncing && syncStatus && (
            <p className={`text-[10px] ${isPaused ? "text-amber-400" : "text-green-400"}`}>
              {isPaused ? "⏸" : "🔴"} {isPaused ? "Paused" : "Live sync (8s)"} · {syncStatus}
            </p>
          )}
          {!isSyncing && syncStatus && (
            <p className="text-[10px] text-neutral-500">{syncStatus}</p>
          )}

          {racesError && <p className="text-[10px] text-amber-500">{racesError}</p>}
          {feedUrl && raceNumber.trim() && !raceNumber.trim().startsWith("http") && !isSyncing && (
            <p className="text-[10px] text-neutral-600 truncate">
              {(feedUrl.endsWith("/") ? feedUrl : feedUrl + "/") + raceNumber.trim()}
            </p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {preview && preview.length > 0 && (
            <div className="space-y-2">
              {preview.map((d, i) => {
                const choice = selectedCars[i] ?? "ignore";
                const isIgnored = choice === "ignore";
                return (
                  <div key={i} className={`rounded p-2 space-y-1 ${isIgnored ? "bg-neutral-800/30 opacity-60" : "bg-neutral-800/50"}`}>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-200 font-medium">{d.className}</span>
                      <span className="text-neutral-500">P{d.position} · {d.totalLaps} laps · Fast {(d.fastLapMs / 1000).toFixed(3)}s</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={choice}
                        onChange={(e) => setSelectedCars((s) => ({ ...s, [i]: e.target.value }))}
                        className="flex-1 rounded bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-200"
                      >
                        <option value="ignore">Ignore (hide)</option>
                        {allCars.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={handleSaveAll}
                className="w-full rounded bg-blue-600 text-white py-1.5 text-xs font-medium hover:bg-blue-500"
              >
                Save {preview.length} Result{preview.length > 1 ? "s" : ""} ({linkedCount} linked, {preview.length - linkedCount} hidden)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewRunFlow({
  setups,
  onStart,
  onCancel,
}: {
  setups: import("@setupiq/shared").SetupSnapshot[];
  onStart: (carId: string, setupId: string) => void;
  onCancel: () => void;
}) {
  const [selectedCar, setSelectedCar] = useState<string>(allCars[0]?.id ?? "");
  const [selectedSetup, setSelectedSetup] = useState<string>("");

  const carSetups = useMemo(
    () => setups.filter((s) => s.carId === selectedCar),
    [setups, selectedCar],
  );

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-neutral-200">Start New Run</h2>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-400">Car</label>
        <select
          value={selectedCar}
          onChange={(e) => { setSelectedCar(e.target.value); setSelectedSetup(""); }}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
        >
          {allCars.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-400">Select Setup</label>
        <select
          value={selectedSetup}
          onChange={(e) => setSelectedSetup(e.target.value)}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
        >
          <option value="">— choose setup —</option>
          {carSetups.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {carSetups.length === 0 && (
        <p className="text-xs text-neutral-500">No setups for this car. Create a setup first.</p>
      )}
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 rounded-md bg-neutral-800 text-neutral-300 py-2.5 text-sm font-medium hover:bg-neutral-700">
          Cancel
        </button>
        <button
          onClick={() => selectedSetup && onStart(selectedCar, selectedSetup)}
          disabled={!selectedSetup}
          className="flex-1 rounded-md bg-blue-600 text-white py-2.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
        >
          Start Session
        </button>
      </div>
    </div>
  );
}

function ActiveSession({
  session,
  setups,
  onFeedback,
  onSetupChange,
  onEnd,
  onAddLapTime,
}: {
  session: RunSession;
  setups: SetupSnapshot[];
  onFeedback: (seg: RunSegment) => void;
  onSetupChange: (setupId: string, changes?: import("@setupiq/shared").SetupEntry[]) => void;
  onEnd: (notes?: string) => void;
  onAddLapTime: (segId: string, laps: LapTime[]) => void;
}) {
  const [manualLap, setManualLap] = useState("");
  const [endNotes, setEndNotes] = useState("");
  const currentSeg = session.segments[session.segments.length - 1];

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Active Session</h2>
        <span className="text-xs text-yellow-500 animate-pulse">● Live</span>
      </div>

      <p className="text-xs text-neutral-500">
        Started {new Date(session.startedAt).toLocaleTimeString()} · {session.segments.length} segment(s)
      </p>

      {/* Current segment */}
      {currentSeg && (
        <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-300">Segment {currentSeg.segmentNumber}</span>
            <button
              onClick={() => onFeedback(currentSeg)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + Add Feedback
            </button>
          </div>

          {/* Manual lap time entry */}
          <div className="flex gap-2">
            <input
              type="number"
              value={manualLap}
              onChange={(e) => setManualLap(e.target.value)}
              placeholder="Lap time (sec)"
              step="0.01"
              className="flex-1 rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
            />
            <button
              onClick={() => {
                const ms = parseFloat(manualLap) * 1000;
                if (!isNaN(ms) && ms > 0) {
                  const existing = currentSeg.lapTimes ?? [];
                  const lap: LapTime = { lapNumber: existing.length + 1, timeMs: ms };
                  onAddLapTime(currentSeg.id, [...existing, lap]);
                  setManualLap("");
                }
              }}
              className="rounded bg-neutral-800 text-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-700"
            >
              Add Lap
            </button>
          </div>

          {/* Lap list */}
          {currentSeg.lapTimes && currentSeg.lapTimes.length > 0 && (
            <div className="space-y-0.5">
              {currentSeg.lapTimes.map((l) => (
                <div key={l.lapNumber} className="flex justify-between text-xs text-neutral-400">
                  <span>Lap {l.lapNumber}</span>
                  <span>{(l.timeMs / 1000).toFixed(2)}s</span>
                </div>
              ))}
            </div>
          )}

          {/* Feedback summary */}
          {currentSeg.feedback && (
            <div className="text-xs text-neutral-500">
              Feedback: {currentSeg.feedback.handling.join(", ")} · Consistency {currentSeg.feedback.consistency}/5
            </div>
          )}
        </div>
      )}

      {/* Setup change */}
      <div className="space-y-1.5">
        <label className="text-xs text-neutral-500">Change setup mid-session:</label>
        <select
          onChange={(e) => {
            if (e.target.value) onSetupChange(e.target.value);
            e.target.value = "";
          }}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
        >
          <option value="">— switch to different setup —</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* End session */}
      <div className="fixed bottom-0 left-0 right-0 bg-neutral-950 border-t border-neutral-800 px-4 py-3 space-y-2">
        <textarea
          value={endNotes}
          onChange={(e) => setEndNotes(e.target.value)}
          rows={2}
          placeholder="Session notes (optional)…"
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-xs text-neutral-100 resize-none"
        />
        <button
          onClick={() => onEnd(endNotes.trim() || undefined)}
          className="w-full rounded-md bg-red-600 text-white py-2.5 text-sm font-medium hover:bg-red-500"
        >
          End Session
        </button>
      </div>
    </div>
  );
}

function SessionSummary({ session, onBack }: { session: RunSession; onBack: () => void }) {
  const totalLaps = session.segments.reduce((t, s) => t + (s.lapTimes?.length ?? 0), 0);
  const allLaps = session.segments.flatMap((s) => s.lapTimes ?? []);
  const bestLap = allLaps.length > 0 ? Math.min(...allLaps.map((l) => l.timeMs)) : null;
  const avgLap = allLaps.length > 0 ? allLaps.reduce((t, l) => t + l.timeMs, 0) / allLaps.length : null;

  // Aggregate handling tags across all segments
  const handlingCounts = new Map<string, number>();
  for (const seg of session.segments) {
    if (seg.feedback) {
      for (const h of seg.feedback.handling) {
        handlingCounts.set(h, (handlingCounts.get(h) ?? 0) + 1);
      }
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-300">← Back</button>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Session Summary</h2>
        <button
          onClick={() =>
            downloadCsv(
              exportSessionCsv(session),
              `session-${session.startedAt.slice(0, 10)}.csv`
            )
          }
          className="text-xs px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Duration" value={formatDuration(session.startedAt, session.endedAt)} />
        <StatCard label="Segments" value={String(session.segments.length)} />
        <StatCard label="Total Laps" value={String(totalLaps)} />
        <StatCard label="Best Lap" value={bestLap ? `${(bestLap / 1000).toFixed(2)}s` : "—"} />
        <StatCard label="Avg Lap" value={avgLap ? `${(avgLap / 1000).toFixed(2)}s` : "—"} />
      </div>

      {handlingCounts.size > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Handling Summary</h3>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(handlingCounts.entries()).map(([tag, count]) => (
              <span key={tag} className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
                {tag} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-segment details */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase">Segments</h3>
        {session.segments.map((seg) => (
          <div key={seg.id} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2.5">
            <p className="text-xs font-medium text-neutral-300">Segment {seg.segmentNumber}</p>
            {seg.feedback && (
              <p className="text-xs text-neutral-500 mt-0.5">
                {seg.feedback.handling.join(", ")} · {seg.feedback.consistency}/5
                {seg.feedback.notes && ` · "${seg.feedback.notes}"`}
              </p>
            )}
            {seg.lapTimes && seg.lapTimes.length > 0 && (
              <p className="text-xs text-neutral-600 mt-0.5">
                {seg.lapTimes.length} laps — best {(Math.min(...seg.lapTimes.map((l) => l.timeMs)) / 1000).toFixed(2)}s
              </p>
            )}
          </div>
        ))}
      </div>

      {session.notes && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Notes</h3>
          <p className="text-sm text-neutral-300 whitespace-pre-line mt-1">{session.notes}</p>
        </div>
      )}

      {/* AI / Rule-based recommendations */}
      <RecommendationsPanel sessionId={session.id} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2.5 text-center">
      <p className="text-lg font-bold text-neutral-200">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function formatDuration(start: string, end?: string): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const mins = Math.floor((e - s) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

// ─── Manual Race Entry (migrated from RacesPage) ─────────────

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
    const avgLapMs = totalLaps > 0 ? Math.round(totalTimeMs / totalLaps) : undefined;

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

// ─── Race Detail (migrated from RacesPage) ───────────────────

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

  // Per-car min/max lap filter
  const timingRec = useLiveQuery(
    () => result.carId ? localDb.carTimingNames.get(result.carId) : undefined,
    [result.carId],
  );
  const GAP_MS = 60000;
  const filteredLaps = useMemo(() => result.laps.filter((l) => {
    if (l.hidden) return false;
    if (l.timeMs >= GAP_MS) return false;
    if (timingRec?.minLapMs != null && l.timeMs < timingRec.minLapMs) return false;
    if (timingRec?.maxLapMs != null && l.timeMs > timingRec.maxLapMs) return false;
    return true;
  }), [result.laps, timingRec]);

  const bestMs = filteredLaps.length > 0 ? Math.min(...filteredLaps.map((l) => l.timeMs)) : 0;
  const avgMs = filteredLaps.length > 0
    ? filteredLaps.reduce((t, l) => t + l.timeMs, 0) / filteredLaps.length
    : 0;

  const fastIdx = useMemo(() => {
    if (filteredLaps.length === 0) return -1;
    let minMs = Infinity;
    let idx = -1;
    result.laps.forEach((l, i) => {
      if (filteredLaps.includes(l) && l.timeMs < minMs) { minMs = l.timeMs; idx = i; }
    });
    return idx;
  }, [result.laps, filteredLaps]);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back</button>

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

      <div className="grid grid-cols-3 gap-2">
        <RaceStatCard label="Position" value={`P${result.position}${result.totalEntries ? `/${result.totalEntries}` : ""}`} />
        <RaceStatCard label="Laps" value={String(filteredLaps.length)} />
        <RaceStatCard label="Total Time" value={formatTotalTime(filteredLaps.reduce((t, l) => t + l.timeMs, 0))} />
        <RaceStatCard label="Fast Lap" value={bestMs > 0 ? `${(bestMs / 1000).toFixed(3)}s` : "–"} highlight />
        <RaceStatCard label="Avg Lap" value={avgMs > 0 ? `${(avgMs / 1000).toFixed(3)}s` : "–"} />
        <RaceStatCard label="Pace" value={filteredLaps.length > 0 ? `${filteredLaps.length}` : "–"} />
      </div>

      {result.laps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Lap Times</h3>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {result.laps.map((lap, i) => {
              const excluded = !filteredLaps.includes(lap);
              return (
              <div
                key={lap.lapNumber}
                className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                  excluded
                    ? "bg-neutral-900/30 text-neutral-600 line-through"
                    : i === fastIdx
                      ? "bg-green-950/40 border border-green-800/50 text-green-300"
                      : "bg-neutral-900/50 text-neutral-300"
                }`}
              >
                <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
                <span className="font-mono">{(lap.timeMs / 1000).toFixed(3)}s</span>
              </div>
              );
            })}
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

// ─── Live Run Dashboard ──────────────────────────────────────

function LiveRunDashboard({ resultId, onBack }: { resultId: string; onBack: () => void }) {
  // Live-query so we re-render whenever sync updates this record
  const result = useLiveQuery(() => localDb.raceResults.get(resultId), [resultId]);

  // Per-car min/max lap filter — must be called unconditionally (hooks rule)
  const carId = result?.carId;
  const timingRec = useLiveQuery(
    () => carId ? localDb.carTimingNames.get(carId) : undefined,
    [carId],
  );

  const GAP_MS = 60000;

  // All laps for display (including hidden/ignored)
  const allLaps = result?.laps ?? [];

  // Filtered laps for KPIs only
  const kpiLaps = useMemo(() => allLaps.filter((l) => {
    if (l.hidden) return false;
    if (l.timeMs >= GAP_MS) return false;
    if (timingRec?.minLapMs != null && l.timeMs < timingRec.minLapMs) return false;
    if (timingRec?.maxLapMs != null && l.timeMs > timingRec.maxLapMs) return false;
    return true;
  }), [allLaps, timingRec]);

  const bestMs = kpiLaps.length > 0 ? Math.min(...kpiLaps.map((l) => l.timeMs)) : 0;
  const avgMs = kpiLaps.length > 0
    ? kpiLaps.reduce((t, l) => t + l.timeMs, 0) / kpiLaps.length
    : 0;
  const worstMs = kpiLaps.length > 0 ? Math.max(...kpiLaps.map((l) => l.timeMs)) : 0;
  const stdDev = useMemo(() => {
    if (kpiLaps.length < 2) return 0;
    const mean = avgMs;
    const variance = kpiLaps.reduce((t, l) => t + (l.timeMs - mean) ** 2, 0) / kpiLaps.length;
    return Math.sqrt(variance);
  }, [kpiLaps, avgMs]);

  // Determine which laps are "ignored" for display styling
  const isIgnored = (l: { timeMs: number; hidden?: boolean }) => {
    if (l.hidden) return true;
    if (l.timeMs >= GAP_MS) return true;
    if (timingRec?.minLapMs != null && l.timeMs < timingRec.minLapMs) return true;
    if (timingRec?.maxLapMs != null && l.timeMs > timingRec.maxLapMs) return true;
    return false;
  };

  if (!result) return <p className="text-center text-neutral-500 text-sm py-8">Loading…</p>;

  const car = getCarById(result.carId);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back</button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-neutral-200">{result.eventName}</h2>
          <span className="text-xs text-red-400 animate-pulse">● LIVE</span>
        </div>
        <div className="flex gap-3 text-xs text-neutral-400 mt-1">
          <span>{result.className}</span>
          <span>{result.roundType}</span>
          {car && <span>{car.name}</span>}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2">
        <RaceStatCard label="Position" value={`P${result.position}${result.totalEntries ? `/${result.totalEntries}` : ""}`} />
        <RaceStatCard label="Laps" value={String(kpiLaps.length)} />
        <RaceStatCard label="Fast Lap" value={bestMs > 0 ? `${(bestMs / 1000).toFixed(3)}s` : "–"} highlight />
        <RaceStatCard label="Avg Lap" value={avgMs > 0 ? `${(avgMs / 1000).toFixed(3)}s` : "–"} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <RaceStatCard label="Worst" value={worstMs > 0 ? `${(worstMs / 1000).toFixed(3)}s` : "–"} />
        <RaceStatCard label="Std Dev" value={stdDev > 0 ? `${(stdDev / 1000).toFixed(3)}s` : "–"} />
        <RaceStatCard label="Total Time" value={formatTotalTime(kpiLaps.reduce((t, l) => t + l.timeMs, 0))} />
      </div>

      {/* Line chart */}
      {kpiLaps.length >= 2 && <LapTimeChart laps={kpiLaps} />}

      {/* Lap table — shows ALL laps including ignored */}
      {allLaps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">
            All Laps <span className="text-neutral-600 font-normal">({allLaps.length} total, {allLaps.length - kpiLaps.length} ignored)</span>
          </h3>
          <div className="max-h-80 overflow-y-auto space-y-0.5">
            {allLaps.map((lap, i) => {
              const ignored = isIgnored(lap);
              const isBest = lap.timeMs === bestMs && !ignored;
              return (
                <div
                  key={lap.lapNumber}
                  className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                    ignored
                      ? "bg-neutral-900/30 text-neutral-600"
                      : isBest
                        ? "bg-green-950/40 border border-green-800/50 text-green-300"
                        : "bg-neutral-900/50 text-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
                    {ignored && <span className="text-[9px] text-neutral-600 italic">ignored</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono ${ignored ? "line-through" : ""}`}>
                      {(lap.timeMs / 1000).toFixed(3)}s
                    </span>
                    {!ignored && bestMs > 0 && lap.timeMs !== bestMs && (
                      <span className="text-[10px] text-neutral-600">
                        +{((lap.timeMs - bestMs) / 1000).toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}

// ─── Lap Time SVG Chart ──────────────────────────────────────

function LapTimeChart({ laps }: { laps: { lapNumber: number; timeMs: number }[] }) {
  const W = 360;
  const H = 180;
  const PAD_L = 48;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const times = laps.map((l) => l.timeMs);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  // Y axis: min lap → max lap × 2  (clamped so chart isn't absurd if all laps are similar)
  const yMin = minTime;
  const yMax = Math.max(maxTime, minTime * 2);

  const xScale = (i: number) => PAD_L + (i / Math.max(laps.length - 1, 1)) * plotW;
  const yScale = (ms: number) => PAD_T + plotH - ((ms - yMin) / (yMax - yMin || 1)) * plotH;

  // Build polyline points
  const points = laps.map((l, i) => `${xScale(i)},${yScale(l.timeMs)}`).join(" ");

  // Y-axis ticks (5 lines)
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);

  // X-axis: show every N laps so labels don't overlap
  const xStep = Math.max(1, Math.ceil(laps.length / 8));

  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase mb-2">Lap Times</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} y1={yScale(t)} x2={W - PAD_R} y2={yScale(t)}
              stroke="#333" strokeWidth="0.5"
            />
            <text x={PAD_L - 4} y={yScale(t) + 3} textAnchor="end" className="fill-neutral-600" fontSize="8">
              {(t / 1000).toFixed(2)}s
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {laps.map((l, i) =>
          i % xStep === 0 ? (
            <text key={i} x={xScale(i)} y={H - 6} textAnchor="middle" className="fill-neutral-600" fontSize="8">
              {l.lapNumber}
            </text>
          ) : null,
        )}

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Best lap marker */}
        {(() => {
          const bestIdx = times.indexOf(minTime);
          return (
            <circle
              cx={xScale(bestIdx)}
              cy={yScale(minTime)}
              r="3"
              className="fill-green-400"
            />
          );
        })()}

        {/* Data points */}
        {laps.map((l, i) => (
          <circle
            key={i}
            cx={xScale(i)}
            cy={yScale(l.timeMs)}
            r="2"
            className="fill-blue-400"
            opacity={0.6}
          />
        ))}
      </svg>
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

function RaceStatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
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
