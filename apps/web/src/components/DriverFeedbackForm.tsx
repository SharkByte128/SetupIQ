import { useState } from "react";
import type { DriverFeedback, HandlingCharacteristic } from "@setupiq/shared";

const HANDLING_OPTIONS: { value: HandlingCharacteristic; label: string; emoji: string }[] = [
  { value: "understeer", label: "Understeer", emoji: "↗" },
  { value: "oversteer", label: "Oversteer", emoji: "↩" },
  { value: "traction-roll", label: "Traction Roll", emoji: "🔄" },
  { value: "push-entry", label: "Push Entry", emoji: "➡" },
  { value: "loose-exit", label: "Loose Exit", emoji: "↪" },
  { value: "stable", label: "Stable", emoji: "✓" },
  { value: "inconsistent", label: "Inconsistent", emoji: "~" },
];

interface Props {
  initial?: DriverFeedback;
  onSubmit: (feedback: DriverFeedback) => void;
  onCancel: () => void;
}

export function DriverFeedbackForm({ initial, onSubmit, onCancel }: Props) {
  const [handling, setHandling] = useState<HandlingCharacteristic[]>(initial?.handling ?? []);
  const [consistency, setConsistency] = useState<1 | 2 | 3 | 4 | 5>(initial?.consistency ?? 3);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const toggleHandling = (h: HandlingCharacteristic) => {
    setHandling((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
    );
  };

  return (
    <div className="space-y-5">
      {/* Handling tags */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-400">Handling Feel</label>
        <div className="flex flex-wrap gap-2">
          {HANDLING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleHandling(opt.value)}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                handling.includes(opt.value)
                  ? "bg-blue-600 text-white ring-1 ring-blue-400"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Consistency 1-5 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-400">Consistency</label>
        <div className="flex gap-2">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConsistency(n)}
              className={`w-12 h-12 rounded-lg text-base font-bold transition-colors ${
                consistency === n
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-neutral-600 px-1">
          <span>Very Poor</span>
          <span>Excellent</span>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-400">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What did the car feel like? Any observations…"
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2.5 text-sm text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md bg-neutral-800 text-neutral-300 py-2.5 text-sm font-medium hover:bg-neutral-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              handling,
              consistency,
              notes: notes.trim() || undefined,
            })
          }
          className="flex-1 rounded-md bg-blue-600 text-white py-2.5 text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Save Feedback
        </button>
      </div>
    </div>
  );
}
