import { useState, useCallback } from "react";
import type { RunSession, RunSegment, SetupSnapshot, LapTime } from "@setupiq/shared";
import { allCars } from "@setupiq/shared";
import { useSetups } from "../hooks/use-setups.js";
import { useRunSessions } from "../hooks/use-run-sessions.js";
import { useHideDemoData } from "../hooks/use-demo-filter.js";
import { DriverFeedbackForm } from "./DriverFeedbackForm.js";
import { RecommendationsPanel } from "./RecommendationsPanel.js";
import { exportSessionCsv, downloadCsv } from "../utils/export.js";

const defaultCar = allCars[0];

type View =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "active"; session: RunSession }
  | { kind: "feedback"; session: RunSession; segment: RunSegment }
  | { kind: "summary"; session: RunSession };

export function RunsPage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const hideDemoData = useHideDemoData();
  const { setups } = useSetups(defaultCar.id, hideDemoData);
  const { sessions, loading, startSession, addSegment, updateSegmentFeedback, updateSegmentLapTimes, endSession } =
    useRunSessions(defaultCar.id, hideDemoData);

  const handleStartSession = useCallback(
    async (setupId: string) => {
      const s = await startSession(defaultCar.id, setupId);
      setView({ kind: "active", session: s });
    },
    [startSession],
  );

  const handleEndSession = useCallback(
    async (sessionId: string, notes?: string) => {
      await endSession(sessionId, notes);
      // Find the completed session
      const updated = sessions.find((s) => s.id === sessionId);
      if (updated) setView({ kind: "summary", session: updated });
      else setView({ kind: "list" });
    },
    [endSession, sessions],
  );

  return (
    <div className="px-4 py-4">
      {view.kind === "list" && (
        <RunSessionList
          sessions={sessions}
          loading={loading}
          onNew={() => setView({ kind: "new" })}
          onSelect={(s) => (s.endedAt ? setView({ kind: "summary", session: s }) : setView({ kind: "active", session: s }))}
        />
      )}

      {view.kind === "new" && (
        <NewRunFlow
          setups={setups}
          onStart={handleStartSession}
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
            // Reload — session list will update on next render
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
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function RunSessionList({
  sessions,
  loading,
  onNew,
  onSelect,
}: {
  sessions: RunSession[];
  loading: boolean;
  onNew: () => void;
  onSelect: (s: RunSession) => void;
}) {
  if (loading) return <p className="text-center text-neutral-500 text-sm py-8">Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Runs</h2>
        <button onClick={onNew} className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-500">
          + New Run
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="text-center text-neutral-500 text-sm py-12">No run sessions yet.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s)}
                className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 p-3 hover:border-neutral-700"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-200">
                    {new Date(s.startedAt).toLocaleDateString()}
                  </span>
                  <span className={`text-xs ${s.endedAt ? "text-green-500" : "text-yellow-500"}`}>
                    {s.endedAt ? "Completed" : "Active"}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {s.segments.length} segment{s.segments.length !== 1 ? "s" : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
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
  onStart: (setupId: string) => void;
  onCancel: () => void;
}) {
  const [selectedSetup, setSelectedSetup] = useState<string>("");

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-neutral-200">Start New Run</h2>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-400">Select Setup</label>
        <select
          value={selectedSetup}
          onChange={(e) => setSelectedSetup(e.target.value)}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
        >
          <option value="">— choose setup —</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {setups.length === 0 && (
        <p className="text-xs text-neutral-500">Create a setup first before starting a run.</p>
      )}
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 rounded-md bg-neutral-800 text-neutral-300 py-2.5 text-sm font-medium hover:bg-neutral-700">
          Cancel
        </button>
        <button
          onClick={() => selectedSetup && onStart(selectedSetup)}
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
