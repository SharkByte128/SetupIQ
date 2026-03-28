import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "../db/local-db.js";
import {
  generateRuleRecommendations,
  getCarById,
  type RecommendationContext,
  type DriverFeedback,
  type SetupEntry,
  type HandlingCharacteristic,
} from "@setupiq/shared";
import { apiFetch } from "../api/client.js";
import type { Recommendation } from "@setupiq/shared";

/**
 * Build a RecommendationContext from local data for a given session.
 */
async function buildLocalContext(
  sessionId: string
): Promise<RecommendationContext | null> {
  const session = await localDb.runSessions.get(sessionId);
  if (!session) return null;

  const car = getCarById(session.carId);
  if (!car) return null;

  // Get latest setup for this car
  const setups = await localDb.setupSnapshots
    .where("carId")
    .equals(session.carId)
    .sortBy("updatedAt");
  const latestSetup = setups[setups.length - 1];
  if (!latestSetup) return null;

  // Get segments for this and recent sessions
  const allSessions = await localDb.runSessions
    .where("carId")
    .equals(session.carId)
    .sortBy("startedAt");
  const recentSessions = allSessions.slice(-5);

  const recentSessionData: RecommendationContext["recentSessions"] = [];
  for (const s of recentSessions) {
    const segments = await localDb.runSegments
      .where("sessionId")
      .equals(s.id)
      .toArray();

    // Aggregate feedback from last segment
    const lastSeg = segments[segments.length - 1];
    const feedback: DriverFeedback | undefined = lastSeg?.feedback
      ? {
          handling: lastSeg.feedback.handling as HandlingCharacteristic[],
          consistency: lastSeg.feedback.consistency as 1 | 2 | 3 | 4 | 5,
          notes: lastSeg.feedback.notes,
        }
      : undefined;

    // Aggregate lap stats
    const allLaps = segments.flatMap((seg) => seg.lapTimes ?? []);
    const times = allLaps.filter((l) => !l.isOutlier).map((l) => l.timeMs);
    const lapStats =
      times.length > 0
        ? {
            bestMs: Math.min(...times),
            avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
            stdDevMs: Math.round(
              Math.sqrt(
                times.reduce(
                  (sum, t) =>
                    sum +
                    Math.pow(
                      t - times.reduce((a, b) => a + b, 0) / times.length,
                      2
                    ),
                  0
                ) / times.length
              )
            ),
            lapCount: times.length,
          }
        : undefined;

    recentSessionData.push({
      sessionId: s.id,
      feedback,
      lapStats,
    });
  }

  // Get previous recommendations
  const prevRecs = await localDb.recommendations
    .where("sessionId")
    .anyOf(recentSessions.map((s) => s.id))
    .toArray();

  // Get latest corner weights
  const measurements = await localDb.measurements
    .where("setupId")
    .equals(latestSetup.id)
    .sortBy("measuredAt");
  const latestMeasurement = measurements[measurements.length - 1];

  return {
    car: { id: car.id, name: car.name, driveType: car.driveType },
    currentSetup: latestSetup.entries as SetupEntry[],
    recentSessions: recentSessionData,
    previousRecommendations: prevRecs.map((r) => ({
      title: r.title,
      changes: r.changes,
      status: r.status as Recommendation["status"],
      outcome: r.outcome as Recommendation["outcome"],
    })),
    cornerWeights: latestMeasurement?.cornerWeights as RecommendationContext["cornerWeights"],
  };
}

export function useRecommendations(sessionId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recommendations = useLiveQuery(async () => {
    if (!sessionId) return [];
    return localDb.recommendations
      .where("sessionId")
      .equals(sessionId)
      .toArray();
  }, [sessionId]);

  const generate = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    try {
      const ctx = await buildLocalContext(sessionId);
      if (!ctx) {
        setError("Could not build recommendation context");
        return;
      }

      let recs: Recommendation[] = [];

      // Try API first (has LLM support), fall back to local rules
      try {
        recs = await apiFetch<Recommendation[]>("/api/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ctx),
        });
      } catch {
        // Offline or API unavailable — use local rule engine
        const car = getCarById(ctx.car.id);
        if (car) {
          const ruleResults = generateRuleRecommendations(ctx, car);
          recs = ruleResults.map((r) => ({
            id: crypto.randomUUID(),
            sessionId,
            source: "rule" as const,
            priority: r.priority,
            title: r.title,
            reasoning: r.reasoning,
            changes: r.changes,
            status: "pending" as const,
            createdAt: new Date().toISOString(),
          }));
        }
      }

      // Store in local DB
      for (const rec of recs) {
        const existing = await localDb.recommendations.get(rec.id);
        if (!existing) {
          await localDb.recommendations.put({
            ...rec,
            status: rec.status,
            _dirty: 1 as const,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate recommendations");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const updateStatus = useCallback(
    async (
      recId: string,
      status: "accepted" | "rejected" | "tried",
      outcome?: { improved: boolean; notes?: string; resultSessionId?: string }
    ) => {
      await localDb.recommendations.update(recId, {
        status,
        outcome,
        _dirty: 1 as const,
      });
    },
    []
  );

  return {
    recommendations: recommendations ?? [],
    loading,
    error,
    generate,
    updateStatus,
  };
}
