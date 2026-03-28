import { useState, useEffect, useCallback } from "react";
import { easyLapClient, type EasyLapEvent, type TimingConnectionState, parseEasyLapCsv, calcTimingStats } from "../timing/easylap-client.js";
import type { LapTime } from "@setupiq/shared";

export function useTiming() {
  const [connectionState, setConnectionState] = useState<TimingConnectionState>(easyLapClient.state);
  const [liveLaps, setLiveLaps] = useState<EasyLapEvent[]>([]);

  useEffect(() => {
    const unsub1 = easyLapClient.onStateChange(setConnectionState);
    const unsub2 = easyLapClient.onLap((event) => {
      setLiveLaps((prev) => [...prev, event]);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const connect = useCallback(async (apiBaseUrl: string) => {
    await easyLapClient.connect(apiBaseUrl);
  }, []);

  const disconnect = useCallback(() => {
    easyLapClient.disconnect();
  }, []);

  const clearLaps = useCallback(() => {
    setLiveLaps([]);
  }, []);

  const importCsv = useCallback((csv: string): EasyLapEvent[] => {
    const events = parseEasyLapCsv(csv);
    setLiveLaps((prev) => [...prev, ...events]);
    return events;
  }, []);

  /** Convert live laps to the LapTime format used by run segments */
  const toLapTimes = useCallback((): LapTime[] => {
    return liveLaps.map((e, i) => ({
      lapNumber: i + 1,
      timeMs: e.timeMs,
      isOutlier: false,
    }));
  }, [liveLaps]);

  const stats = liveLaps.length > 0 ? calcTimingStats(liveLaps) : null;

  return { connectionState, liveLaps, stats, connect, disconnect, clearLaps, importCsv, toLapTimes };
}
