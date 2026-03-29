import { useSyncState } from "../hooks/use-sync.js";
import type { SyncState } from "../sync/engine.js";

const LABELS: Record<SyncState, string> = {
  synced: "Synced",
  pending: "Pending",
  syncing: "Syncing…",
  offline: "Offline",
  error: "Sync Error",
  "not-configured": "Not Connected",
};

const COLORS: Record<SyncState, string> = {
  synced: "bg-green-500",
  pending: "bg-yellow-500",
  syncing: "bg-blue-500 animate-pulse",
  offline: "bg-neutral-500",
  error: "bg-red-500",
  "not-configured": "bg-neutral-600",
};

export function SyncIndicator() {
  const state = useSyncState();

  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
      <span className={`inline-block h-2 w-2 rounded-full ${COLORS[state]}`} />
      <span>{LABELS[state]}</span>
    </div>
  );
}
