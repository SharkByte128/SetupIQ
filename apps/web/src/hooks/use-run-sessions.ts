import { useState, useEffect, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { localDb as db } from "../db/local-db.js";
import type { LocalRunSession, LocalRunSegment } from "../db/local-db.js";
import type { RunSession, RunSegment, DriverFeedback, SetupEntry, LapTime } from "@setupiq/shared";

export function useRunSessions(carId?: string) {
  const [sessions, setSessions] = useState<RunSession[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let rows: LocalRunSession[];
    if (carId) {
      rows = await db.runSessions.where("carId").equals(carId).reverse().sortBy("startedAt");
    } else {
      rows = await db.runSessions.reverse().sortBy("startedAt");
    }

    // Attach segments to each session
    const results: RunSession[] = [];
    for (const row of rows) {
      const segs = await db.runSegments.where("sessionId").equals(row.id).sortBy("segmentNumber");
      results.push({
        ...(row as unknown as RunSession),
        segments: segs as unknown as RunSegment[],
      });
    }
    setSessions(results);
    setLoading(false);
  }, [carId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const startSession = useCallback(
    async (carId: string, setupSnapshotId: string, trackId?: string): Promise<RunSession> => {
      const now = new Date().toISOString();
      const sessionId = uuid();

      const session: LocalRunSession = {
        id: sessionId,
        userId: "local",
        carId,
        trackId,
        notes: undefined,
        startedAt: now,
        endedAt: undefined,
        _dirty: 1,
      };
      await db.runSessions.add(session);

      // Create first segment
      const segment: LocalRunSegment = {
        id: uuid(),
        sessionId,
        setupSnapshotId,
        segmentNumber: 1,
        feedback: undefined,
        lapTimes: undefined,
        setupChanges: undefined,
        startedAt: now,
        endedAt: undefined,
        _dirty: 1,
      };
      await db.runSegments.add(segment);

      await reload();
      return {
        ...(session as unknown as RunSession),
        segments: [segment as unknown as RunSegment],
      };
    },
    [reload],
  );

  const addSegment = useCallback(
    async (sessionId: string, setupSnapshotId: string, setupChanges?: SetupEntry[]): Promise<RunSegment> => {
      // End the previous segment
      const existing = await db.runSegments.where("sessionId").equals(sessionId).sortBy("segmentNumber");
      const prevSeg = existing[existing.length - 1];
      const now = new Date().toISOString();
      if (prevSeg && !prevSeg.endedAt) {
        await db.runSegments.update(prevSeg.id, { endedAt: now, _dirty: 1 as const });
      }

      const segment: LocalRunSegment = {
        id: uuid(),
        sessionId,
        setupSnapshotId,
        segmentNumber: (prevSeg?.segmentNumber ?? 0) + 1,
        feedback: undefined,
        lapTimes: undefined,
        setupChanges: setupChanges as LocalRunSegment["setupChanges"],
        startedAt: now,
        endedAt: undefined,
        _dirty: 1,
      };
      await db.runSegments.add(segment);
      await reload();
      return segment as unknown as RunSegment;
    },
    [reload],
  );

  const updateSegmentFeedback = useCallback(
    async (segmentId: string, feedback: DriverFeedback) => {
      await db.runSegments.update(segmentId, {
        feedback: feedback as unknown as LocalRunSegment["feedback"],
        _dirty: 1 as const,
      });
      await reload();
    },
    [reload],
  );

  const updateSegmentLapTimes = useCallback(
    async (segmentId: string, lapTimes: LapTime[]) => {
      await db.runSegments.update(segmentId, {
        lapTimes: lapTimes as unknown as LocalRunSegment["lapTimes"],
        _dirty: 1 as const,
      });
      await reload();
    },
    [reload],
  );

  const endSession = useCallback(
    async (sessionId: string, notes?: string) => {
      const now = new Date().toISOString();
      // End last segment
      const segments = await db.runSegments.where("sessionId").equals(sessionId).sortBy("segmentNumber");
      const last = segments[segments.length - 1];
      if (last && !last.endedAt) {
        await db.runSegments.update(last.id, { endedAt: now, _dirty: 1 as const });
      }
      await db.runSessions.update(sessionId, { endedAt: now, notes, _dirty: 1 as const });
      await reload();
    },
    [reload],
  );

  return {
    sessions,
    loading,
    startSession,
    addSegment,
    updateSegmentFeedback,
    updateSegmentLapTimes,
    endSession,
    reload,
  };
}
