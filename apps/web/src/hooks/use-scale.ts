import { useState, useEffect, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { scaleDriver, type CornerWeightReading, type ScaleConnectionState } from "../bluetooth/scale-driver.js";
import { localDb as db } from "../db/local-db.js";
import type { LocalMeasurement } from "../db/local-db.js";
import type { Measurement } from "@setupiq/shared";

export function useScale() {
  const [connectionState, setConnectionState] = useState<ScaleConnectionState>(scaleDriver.state);
  const [liveReading, setLiveReading] = useState<CornerWeightReading | null>(null);

  useEffect(() => {
    const unsub1 = scaleDriver.onStateChange(setConnectionState);
    const unsub2 = scaleDriver.onReading(setLiveReading);
    return () => { unsub1(); unsub2(); };
  }, []);

  const connect = useCallback(async () => {
    await scaleDriver.connect();
  }, []);

  const disconnect = useCallback(() => {
    scaleDriver.disconnect();
    setLiveReading(null);
  }, []);

  const captureMeasurement = useCallback(
    async (setupId: string, runSessionId?: string): Promise<Measurement | null> => {
      if (!liveReading) return null;

      const now = new Date().toISOString();
      const total = liveReading.frontLeft + liveReading.frontRight + liveReading.rearLeft + liveReading.rearRight;
      const frontTotal = liveReading.frontLeft + liveReading.frontRight;
      const leftTotal = liveReading.frontLeft + liveReading.rearLeft;
      const cross = liveReading.frontLeft + liveReading.rearRight;

      const measurement: LocalMeasurement = {
        id: uuid(),
        setupId,
        runSessionId,
        cornerWeights: {
          frontLeft: liveReading.frontLeft,
          frontRight: liveReading.frontRight,
          rearLeft: liveReading.rearLeft,
          rearRight: liveReading.rearRight,
          unit: "g",
        },
        totalWeight: total,
        frontBiasPercent: total > 0 ? (frontTotal / total) * 100 : 0,
        leftBiasPercent: total > 0 ? (leftTotal / total) * 100 : 0,
        crossWeightPercent: total > 0 ? (cross / total) * 100 : 0,
        measuredAt: now,
        source: "bluetooth",
        _dirty: 1,
      };

      await db.measurements.add(measurement);
      return measurement as unknown as Measurement;
    },
    [liveReading],
  );

  return { connectionState, liveReading, connect, disconnect, captureMeasurement };
}

export function useMeasurements(setupId?: string) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let rows;
    if (setupId) {
      rows = await db.measurements.where("setupId").equals(setupId).reverse().sortBy("measuredAt");
    } else {
      rows = await db.measurements.reverse().sortBy("measuredAt");
    }
    setMeasurements(rows as unknown as Measurement[]);
    setLoading(false);
  }, [setupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { measurements, loading, reload };
}
