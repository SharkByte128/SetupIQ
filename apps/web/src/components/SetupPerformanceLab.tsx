import { useMemo, useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { RunSession, HandlingCharacteristic } from "@setupiq/shared";
import { getCarById } from "@setupiq/shared";
import { localDb, type LocalRaceResult } from "../db/local-db.js";

interface Props {
  sessions: RunSession[];
  raceResults: LocalRaceResult[];
  /** Lap filter that respects per-car min/max & hidden flags. */
  filterRaceLaps: (r: LocalRaceResult) => { lapNumber: number; timeMs: number }[];
}

interface SetupPerf {
  setupId: string;
  setupName: string;
  bestLapMs: number;
  avgLapMs: number;
  lapCount: number;
  sessionCount: number;
  raceCount: number;
  handlingCounts: Map<HandlingCharacteristic, number>;
  consistencyAvg: number | null;
  notes: string[];
  lastUsedAt: string;
}

const HANDLING_HINTS: Record<HandlingCharacteristic, string> = {
  understeer: "Try softer front springs, more front camber, or stickier front tires.",
  "push-entry": "Add front mechanical grip — softer front, more steering throw, or front toe-out.",
  oversteer: "Stiffen rear or soften front; add rear toe-in; try wider/softer rear tires.",
  "loose-exit": "Reduce rear roll (stiffer rear) or add rear traction (softer rear shocks).",
  "traction-roll": "Lower front ride height, narrower front track, or wider rear tire stance.",
  inconsistent: "Inspect for play in suspension; verify ride heights and tire trueness between runs.",
  stable: "Setup feels balanced — push pace and consider small experiments to find the limit.",
};

export function SetupPerformanceLab({ sessions, raceResults, filterRaceLaps }: Props) {
  const tracks = useLiveQuery(() => localDb.tracks.toArray(), []) ?? [];
  const setupSnapshots = useLiveQuery(() => localDb.setupSnapshots.toArray(), []) ?? [];

  // Build the set of (carId, trackId) combos that actually have data
  const carOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) if (s.carId) ids.add(s.carId);
    for (const r of raceResults) if (r.carId) ids.add(r.carId);
    return [...ids]
      .map((id) => ({ id, name: getCarById(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, raceResults]);

  const [carId, setCarId] = useState<string>("");
  const [trackId, setTrackId] = useState<string>("");
  const [expanded, setExpanded] = useState(false);

  // Default to first car when options first appear
  useEffect(() => {
    if (!carId && carOptions.length > 0) setCarId(carOptions[0].id);
  }, [carId, carOptions]);

  // Tracks that have data for this car
  const trackOptions = useMemo(() => {
    if (!carId) return [];
    const ids = new Set<string>();
    for (const s of sessions) if (s.carId === carId && s.trackId) ids.add(s.trackId);
    for (const r of raceResults) if (r.carId === carId && r.trackId) ids.add(r.trackId);
    const named = [...ids].map((id) => ({
      id,
      name: tracks.find((t) => t.id === id)?.name ?? "Unknown track",
    }));
    named.sort((a, b) => a.name.localeCompare(b.name));
    return named;
  }, [carId, sessions, raceResults, tracks]);

  // Default track to first available when car changes
  useEffect(() => {
    if (trackOptions.length === 0) { setTrackId(""); return; }
    if (!trackOptions.find((t) => t.id === trackId)) setTrackId(trackOptions[0].id);
  }, [trackOptions, trackId]);

  const setupNameOf = (id: string) =>
    setupSnapshots.find((s) => s.id === id)?.name ?? "Setup (deleted)";

  const perf = useMemo<SetupPerf[]>(() => {
    if (!carId || !trackId) return [];

    const map = new Map<string, {
      laps: number[];
      handling: Map<HandlingCharacteristic, number>;
      consistency: number[];
      sessions: Set<string>;
      races: number;
      notes: string[];
      lastUsedAt: string;
    }>();

    const get = (sid: string) => {
      let e = map.get(sid);
      if (!e) {
        e = { laps: [], handling: new Map(), consistency: [], sessions: new Set(), races: 0, notes: [], lastUsedAt: "" };
        map.set(sid, e);
      }
      return e;
    };

    // Sessions for this car/track
    for (const s of sessions) {
      if (s.carId !== carId || s.trackId !== trackId) continue;
      for (const seg of s.segments) {
        const sid = seg.setupSnapshotId;
        if (!sid) continue;
        const e = get(sid);
        e.sessions.add(s.id);
        if (s.startedAt > e.lastUsedAt) e.lastUsedAt = s.startedAt;
        for (const l of seg.lapTimes ?? []) {
          if (l.isOutlier) continue;
          e.laps.push(l.timeMs);
        }
        if (seg.feedback) {
          for (const h of seg.feedback.handling) {
            e.handling.set(h, (e.handling.get(h) ?? 0) + 1);
          }
          e.consistency.push(seg.feedback.consistency);
          if (seg.feedback.notes?.trim()) e.notes.push(seg.feedback.notes.trim());
        }
      }
    }

    // Race results for this car/track
    for (const r of raceResults) {
      if (r.carId !== carId || r.trackId !== trackId) continue;
      const filtered = filterRaceLaps(r);
      // Group laps by per-lap setupSnapshotId if present, otherwise the race-level one
      const fallbackSid = r.setupSnapshotId;
      const byLapSid = new Map<string, number[]>();
      for (const l of filtered) {
        const sid = (l as { setupSnapshotId?: string }).setupSnapshotId ?? fallbackSid;
        if (!sid) continue;
        const arr = byLapSid.get(sid) ?? [];
        arr.push(l.timeMs);
        byLapSid.set(sid, arr);
      }
      for (const [sid, laps] of byLapSid) {
        const e = get(sid);
        e.races++;
        if (r.date > e.lastUsedAt) e.lastUsedAt = r.date;
        for (const t of laps) e.laps.push(t);
        if (r.notes?.trim()) e.notes.push(r.notes.trim());
      }
    }

    const out: SetupPerf[] = [];
    for (const [sid, e] of map) {
      if (e.laps.length === 0) continue;
      const best = Math.min(...e.laps);
      const avg = Math.round(e.laps.reduce((t, x) => t + x, 0) / e.laps.length);
      const cAvg = e.consistency.length > 0
        ? e.consistency.reduce((t, x) => t + x, 0) / e.consistency.length
        : null;
      out.push({
        setupId: sid,
        setupName: setupNameOf(sid),
        bestLapMs: best,
        avgLapMs: avg,
        lapCount: e.laps.length,
        sessionCount: e.sessions.size,
        raceCount: e.races,
        handlingCounts: e.handling,
        consistencyAvg: cAvg,
        notes: e.notes.slice(0, 3),
        lastUsedAt: e.lastUsedAt,
      });
    }
    out.sort((a, b) => a.bestLapMs - b.bestLapMs);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId, trackId, sessions, raceResults, filterRaceLaps, setupSnapshots]);

  const winner = perf[0];

  // Setups that exist for this car but haven't been tried at this track
  const untriedSetups = useMemo(() => {
    if (!carId || !trackId) return [];
    const usedIds = new Set(perf.map((p) => p.setupId));
    return setupSnapshots
      .filter((s) => s.carId === carId && !usedIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }));
  }, [carId, trackId, perf, setupSnapshots]);

  const suggestions = useMemo(() => {
    if (!winner) return [] as string[];
    const tips: string[] = [];
    // Pull dominant complaint from winner (excluding "stable")
    const ranked = [...winner.handlingCounts.entries()]
      .filter(([k]) => k !== "stable")
      .sort((a, b) => b[1] - a[1]);
    if (ranked.length > 0) {
      tips.push(`Address "${ranked[0][0]}" on the leading setup — ${HANDLING_HINTS[ranked[0][0]]}`);
      if (ranked[1]) tips.push(`Then look at "${ranked[1][0]}" — ${HANDLING_HINTS[ranked[1][0]]}`);
    } else {
      tips.push(HANDLING_HINTS.stable);
    }
    if (winner.consistencyAvg != null && winner.consistencyAvg < 3.5) {
      tips.push("Consistency is below 3.5/5 — focus on repeatable inputs and verify tire grip between runs before changing setup.");
    }
    if (untriedSetups.length > 0) {
      const names = untriedSetups.slice(0, 2).map((s) => `"${s.name}"`).join(", ");
      tips.push(`You have ${untriedSetups.length} setup${untriedSetups.length === 1 ? "" : "s"} for this car not yet tried here — try ${names} for comparison.`);
    }
    if (perf.length === 1) {
      tips.push("Only one setup tested at this track — clone it, change one variable (e.g. front springs or tire compound), and run a back-to-back.");
    }
    return tips;
  }, [winner, untriedSetups, perf.length]);

  if (carOptions.length === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-neutral-800/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">Lab</span>
          <h3 className="text-sm font-semibold text-neutral-200">Setup Performance</h3>
        </div>
        <span className="text-xs text-neutral-500">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-neutral-800">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <label className="text-xs text-neutral-400 space-y-1">
              <span>Car</span>
              <select
                value={carId}
                onChange={(e) => setCarId(e.target.value)}
                className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
              >
                {carOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-400 space-y-1">
              <span>Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={trackOptions.length === 0}
                className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
              >
                {trackOptions.length === 0 ? (
                  <option value="">No tracked sessions</option>
                ) : trackOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Empty state */}
          {(!carId || !trackId) && (
            <p className="text-xs text-neutral-500 py-2">
              Tag your sessions and race results with a track to compare setup performance here.
            </p>
          )}

          {/* Ranked setup list */}
          {perf.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                Setups ranked by best lap ({perf.length})
              </p>
              {perf.map((p, i) => {
                const isWinner = i === 0;
                const handlingTags = [...p.handlingCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4);
                return (
                  <div
                    key={p.setupId}
                    className={`rounded border p-2.5 ${
                      isWinner
                        ? "border-emerald-700/60 bg-emerald-900/10"
                        : "border-neutral-800 bg-neutral-950"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-bold w-5 text-center ${isWinner ? "text-emerald-400" : "text-neutral-500"}`}>
                          #{i + 1}
                        </span>
                        <span className="text-sm font-medium text-neutral-200 truncate">{p.setupName}</span>
                        {isWinner && (
                          <span className="text-[9px] uppercase font-bold bg-emerald-700/40 text-emerald-300 px-1.5 py-0.5 rounded">Best</span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-neutral-100 tabular-nums">
                          {(p.bestLapMs / 1000).toFixed(3)}s
                        </div>
                        <div className="text-[10px] text-neutral-500 tabular-nums">
                          avg {(p.avgLapMs / 1000).toFixed(3)}s
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-500">
                      <span>{p.lapCount} laps</span>
                      {p.sessionCount > 0 && <span>{p.sessionCount} session{p.sessionCount !== 1 ? "s" : ""}</span>}
                      {p.raceCount > 0 && <span>{p.raceCount} race{p.raceCount !== 1 ? "s" : ""}</span>}
                      {p.consistencyAvg != null && (
                        <span>consistency {p.consistencyAvg.toFixed(1)}/5</span>
                      )}
                      <span>last {new Date(p.lastUsedAt).toLocaleDateString()}</span>
                    </div>
                    {handlingTags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {handlingTags.map(([h, c]) => (
                          <span
                            key={h}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              h === "stable"
                                ? "bg-emerald-900/30 text-emerald-400"
                                : "bg-neutral-800 text-neutral-300"
                            }`}
                          >
                            {h} ×{c}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.notes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {p.notes.map((n, ni) => (
                          <li key={ni} className="text-[10px] text-neutral-500 italic line-clamp-2">
                            “{n}”
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* What to try next */}
          {suggestions.length > 0 && (
            <div className="rounded border border-blue-900/40 bg-blue-950/20 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold">
                What to try next
              </p>
              <ul className="mt-1.5 space-y-1">
                {suggestions.map((tip, i) => (
                  <li key={i} className="text-xs text-neutral-300 flex gap-1.5">
                    <span className="text-blue-500 shrink-0">→</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty (filters set but no data) */}
          {carId && trackId && perf.length === 0 && (
            <p className="text-xs text-neutral-500 py-2">
              No lap data yet for this car at this track. Tag a session or race result with this track to see analysis.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
