import { useState } from "react";
import { useRecommendations } from "../hooks/use-recommendations.js";
import type { LocalRecommendation } from "../db/local-db.js";

interface RecommendationsPanelProps {
  sessionId: string | undefined;
}

const priorityColor: Record<string, string> = {
  high: "text-red-400 bg-red-400/10 border-red-400/30",
  medium: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  low: "text-blue-400 bg-blue-400/10 border-blue-400/30",
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  tried: "Tried",
};

const statusColor: Record<string, string> = {
  pending: "text-neutral-400",
  accepted: "text-green-400",
  rejected: "text-neutral-500",
  tried: "text-blue-400",
};

export function RecommendationsPanel({ sessionId }: RecommendationsPanelProps) {
  const { recommendations, loading, error, generate, updateStatus } =
    useRecommendations(sessionId);

  if (!sessionId) {
    return (
      <div className="p-4 text-neutral-500 text-sm">
        Complete a run session to get setup recommendations.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Setup Recommendations
        </h2>
        <button
          onClick={generate}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Analyzing…" : recommendations.length > 0 ? "Refresh" : "Generate"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">
          {error}
        </p>
      )}

      {recommendations.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">
          No recommendations yet. Tap "Generate" after completing a session with
          feedback.
        </p>
      )}

      <div className="space-y-3">
        {(recommendations ?? []).map((rec) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            onUpdateStatus={updateStatus}
          />
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  onUpdateStatus,
}: {
  rec: LocalRecommendation;
  onUpdateStatus: (
    id: string,
    status: "accepted" | "rejected" | "tried",
    outcome?: { improved: boolean; notes?: string }
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);

  const pColor = priorityColor[rec.priority] ?? priorityColor.medium;
  const sColor = statusColor[rec.status] ?? statusColor.pending;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left"
      >
        <span
          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${pColor}`}
        >
          {rec.priority}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{rec.title}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {rec.source === "llm" ? "AI" : "Rule"} •{" "}
            <span className={sColor}>{statusLabel[rec.status]}</span>
          </p>
        </div>
        <span className="text-neutral-500 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Reasoning */}
          <p className="text-xs text-neutral-400 leading-relaxed">
            {rec.reasoning}
          </p>

          {/* Changes */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase text-neutral-500 font-semibold">
              Suggested Changes
            </p>
            {rec.changes.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs bg-neutral-800/50 rounded px-3 py-2"
              >
                <span className="text-neutral-400">{c.capabilityName}</span>
                <span className="text-red-400 line-through">
                  {String(c.currentValue)}
                </span>
                <span className="text-neutral-500">→</span>
                <span className="text-green-400 font-medium">
                  {String(c.suggestedValue)}
                </span>
              </div>
            ))}
          </div>

          {/* Outcome display */}
          {rec.outcome && (
            <div
              className={`text-xs rounded px-3 py-2 ${
                rec.outcome.improved
                  ? "bg-green-400/10 text-green-400"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {rec.outcome.improved ? "✓ Improved" : "— No improvement"}
              {rec.outcome.notes && (
                <span className="ml-2 text-neutral-500">
                  ({rec.outcome.notes})
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          {rec.status === "pending" && (
            <div className="flex gap-2">
              <button
                onClick={() => onUpdateStatus(rec.id, "accepted")}
                className="text-xs px-3 py-1.5 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => onUpdateStatus(rec.id, "rejected")}
                className="text-xs px-3 py-1.5 rounded bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700 transition-colors"
              >
                Reject
              </button>
            </div>
          )}

          {rec.status === "accepted" && !rec.outcome && (
            <div>
              {!showOutcomeForm ? (
                <button
                  onClick={() => setShowOutcomeForm(true)}
                  className="text-xs px-3 py-1.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                >
                  Record Outcome
                </button>
              ) : (
                <OutcomeForm
                  onSubmit={(improved, notes) => {
                    onUpdateStatus(rec.id, "tried", { improved, notes });
                    setShowOutcomeForm(false);
                  }}
                  onCancel={() => setShowOutcomeForm(false)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OutcomeForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (improved: boolean, notes: string) => void;
  onCancel: () => void;
}) {
  const [improved, setImproved] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-2 bg-neutral-800/50 rounded p-3">
      <p className="text-xs text-neutral-400 font-medium">Did this change help?</p>
      <div className="flex gap-2">
        <button
          onClick={() => setImproved(true)}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            improved === true
              ? "bg-green-600 text-white"
              : "bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700"
          }`}
        >
          Yes, improved
        </button>
        <button
          onClick={() => setImproved(false)}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            improved === false
              ? "bg-red-600 text-white"
              : "bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700"
          }`}
        >
          No improvement
        </button>
      </div>
      <input
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 text-neutral-200 placeholder-neutral-600"
      />
      <div className="flex gap-2">
        <button
          onClick={() => improved !== null && onSubmit(improved, notes)}
          disabled={improved === null}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
