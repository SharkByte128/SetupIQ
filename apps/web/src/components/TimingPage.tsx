import { useState, useRef } from "react";
import { useTiming } from "../hooks/use-timing.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function TimingPage() {
  const { connectionState, liveLaps, stats, connect, disconnect, clearLaps, importCsv } = useTiming();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    try {
      await connect(API_BASE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const events = importCsv(text);
    if (events.length === 0) {
      setError("No valid lap data found in CSV");
    } else {
      setError(null);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="px-4 py-4 space-y-6">
      <h2 className="text-base font-semibold text-neutral-200">EasyLap Timing</h2>

      {/* Connection */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-2 h-2 rounded-full ${
            connectionState === "connected" ? "bg-green-500" :
            connectionState === "connecting" ? "bg-yellow-500 animate-pulse" :
            connectionState === "error" ? "bg-red-500" :
            "bg-neutral-600"
          }`} />
          <span className="text-xs text-neutral-400 capitalize">{connectionState}</span>
          {connectionState === "disconnected" || connectionState === "error" ? (
            <button onClick={handleConnect} className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-500">
              Connect
            </button>
          ) : connectionState === "connected" ? (
            <button onClick={disconnect} className="rounded bg-neutral-800 text-neutral-300 px-3 py-1 text-xs hover:bg-neutral-700">
              Disconnect
            </button>
          ) : null}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* CSV Import */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-400">Import CSV</label>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleImport}
            className="text-xs text-neutral-400 file:mr-2 file:rounded file:bg-neutral-800 file:text-neutral-300 file:border-0 file:px-3 file:py-1.5 file:text-xs file:cursor-pointer"
          />
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Session Stats</h3>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Best" value={`${(stats.best / 1000).toFixed(2)}s`} highlight />
            <StatCard label="Average" value={`${(stats.avg / 1000).toFixed(2)}s`} />
            <StatCard label="Worst" value={`${(stats.worst / 1000).toFixed(2)}s`} />
            <StatCard label="Laps" value={String(stats.lapCount)} />
            <StatCard label="Std Dev" value={`${(stats.stdDev / 1000).toFixed(3)}s`} />
            <StatCard label="Consistency" value={`${(stats.consistency * 100).toFixed(1)}%`} />
          </div>
        </div>
      )}

      {/* Live lap feed */}
      {liveLaps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase">Laps ({liveLaps.length})</h3>
            <button onClick={clearLaps} className="text-xs text-neutral-600 hover:text-neutral-400">
              Clear
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {[...liveLaps].reverse().map((lap, i) => {
              const isOutlier = stats && lap.timeMs > stats.outlierThreshold;
              return (
                <div
                  key={`${lap.transponderId}-${lap.lapNumber}-${i}`}
                  className={`flex justify-between rounded px-2.5 py-1.5 text-xs ${
                    isOutlier ? "bg-red-950/30 text-red-300" : "bg-neutral-900 text-neutral-300"
                  }`}
                >
                  <span>Lap {lap.lapNumber}</span>
                  <span className="font-mono">{(lap.timeMs / 1000).toFixed(2)}s</span>
                  {isOutlier && <span className="text-red-500 text-xs">⚠</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {liveLaps.length === 0 && connectionState !== "connected" && (
        <div className="text-center py-12 space-y-2">
          <p className="text-neutral-500 text-sm">Connect to EasyLap or import a CSV to start.</p>
          <p className="text-neutral-600 text-xs">Lap data will appear here in real time.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${
      highlight ? "bg-green-950/30 border-green-800" : "bg-neutral-900 border-neutral-800"
    }`}>
      <p className={`text-sm font-bold ${highlight ? "text-green-300" : "text-neutral-200"}`}>{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}
