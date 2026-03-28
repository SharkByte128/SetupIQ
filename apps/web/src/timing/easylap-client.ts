/**
 * EasyLap timing system integration.
 *
 * EasyLap can output data via:
 *  1. USB serial to a connected PC (serial-port bridge needed)
 *  2. Direct LAN broadcast (if newer model)
 *  3. CSV file export (manual import)
 *
 * This module implements:
 *  - A WebSocket/polling client that connects to an API bridge endpoint
 *  - A CSV import parser
 *  - Real-time lap event streaming
 */

export interface EasyLapEvent {
  transponderId: string;
  lapNumber: number;
  timeMs: number;
  timestamp: number;
}

export type TimingConnectionState = "disconnected" | "connecting" | "connected" | "error";

type LapListener = (event: EasyLapEvent) => void;
type StateListener = (state: TimingConnectionState) => void;

class EasyLapClient {
  private ws: WebSocket | null = null;
  private lapListeners = new Set<LapListener>();
  private stateListeners = new Set<StateListener>();
  private _state: TimingConnectionState = "disconnected";
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  get state() {
    return this._state;
  }

  private setState(state: TimingConnectionState) {
    this._state = state;
    this.stateListeners.forEach((fn) => fn(state));
  }

  /**
   * Connect to the EasyLap bridge.
   * Tries WebSocket first, falls back to polling.
   */
  async connect(apiBaseUrl: string): Promise<void> {
    this.setState("connecting");

    const wsUrl = apiBaseUrl.replace(/^http/, "ws") + "/api/timing/ws";
    try {
      await this.connectWebSocket(wsUrl);
      return;
    } catch {
      // Fall back to polling
      this.startPolling(apiBaseUrl);
    }
  }

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        this.setState("connected");
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as EasyLapEvent;
          this.lapListeners.forEach((fn) => fn(data));
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        this.ws = null;
        this.setState("disconnected");
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        reject(new Error("WebSocket error"));
      };
    });
  }

  private startPolling(apiBaseUrl: string) {
    let lastTimestamp = Date.now();

    this.pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`${apiBaseUrl}/api/timing/laps?since=${lastTimestamp}`, {
          credentials: "include",
        });
        if (!resp.ok) {
          this.setState("error");
          return;
        }
        this.setState("connected");
        const laps: EasyLapEvent[] = await resp.json();
        for (const lap of laps) {
          this.lapListeners.forEach((fn) => fn(lap));
          if (lap.timestamp > lastTimestamp) lastTimestamp = lap.timestamp;
        }
      } catch {
        this.setState("error");
      }
    }, 2000);

    this.setState("connected");
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.setState("disconnected");
  }

  onLap(fn: LapListener): () => void {
    this.lapListeners.add(fn);
    return () => this.lapListeners.delete(fn);
  }

  onStateChange(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }
}

export const easyLapClient = new EasyLapClient();

// ── CSV Import ───────────────────────────────────────────────

/**
 * Parse an EasyLap CSV export.
 * Expected columns: TransponderID, LapNumber, LapTime(ms), Timestamp
 * Flexible enough to handle slight variations.
 */
export function parseEasyLapCsv(csv: string): EasyLapEvent[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Skip header
  const events: EasyLapEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 3) continue;

    const transponderId = cols[0];
    const lapNumber = parseInt(cols[1], 10);
    const timeMs = parseFloat(cols[2]);
    const timestamp = cols[3] ? new Date(cols[3]).getTime() : Date.now();

    if (!isNaN(lapNumber) && !isNaN(timeMs)) {
      events.push({ transponderId, lapNumber, timeMs, timestamp });
    }
  }

  return events;
}

/**
 * Calculate session timing stats from an array of lap times.
 */
export function calcTimingStats(laps: { timeMs: number }[]) {
  if (laps.length === 0) return null;

  const times = laps.map((l) => l.timeMs);
  const best = Math.min(...times);
  const worst = Math.max(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((a, t) => a + (t - avg) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);

  // Flag outliers (> 2 standard deviations from mean)
  const outlierThreshold = avg + 2 * stdDev;

  return {
    best,
    worst,
    avg,
    stdDev,
    consistency: stdDev / avg, // lower = more consistent
    lapCount: laps.length,
    outlierThreshold,
  };
}
