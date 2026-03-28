import { localDb } from "../db/local-db.js";
import { apiFetch } from "../api/client.js";

export type SyncState = "synced" | "pending" | "syncing" | "offline" | "error";

type SyncListener = (state: SyncState) => void;

let currentState: SyncState = "offline";
const listeners = new Set<SyncListener>();

function setState(next: SyncState): void {
  if (next !== currentState) {
    currentState = next;
    listeners.forEach((fn) => fn(next));
  }
}

export function getSyncState(): SyncState {
  return currentState;
}

export function onSyncStateChange(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ─── Check for dirty records ────────────────────────────────

async function hasDirtyRecords(): Promise<boolean> {
  const counts = await Promise.all([
    localDb.setupSnapshots.where("_dirty").equals(1).count(),
    localDb.runSessions.where("_dirty").equals(1).count(),
    localDb.runSegments.where("_dirty").equals(1).count(),
    localDb.tracks.where("_dirty").equals(1).count(),
    localDb.components.where("_dirty").equals(1).count(),
    localDb.measurements.where("_dirty").equals(1).count(),
  ]);
  return counts.some((c) => c > 0);
}

// ─── Push dirty records to server ───────────────────────────

async function pushDirtyRecords(): Promise<void> {
  const [dirtySetups, dirtyTracks, dirtySessions] = await Promise.all([
    localDb.setupSnapshots.where("_dirty").equals(1).toArray(),
    localDb.tracks.where("_dirty").equals(1).toArray(),
    localDb.runSessions.where("_dirty").equals(1).toArray(),
  ]);

  if (dirtySetups.length === 0 && dirtyTracks.length === 0 && dirtySessions.length === 0) {
    return;
  }

  const body: Record<string, { id: string; updatedAt: string; data: Record<string, unknown> }[]> = {};

  if (dirtySetups.length > 0) {
    body.setupSnapshots = dirtySetups.map((s) => ({
      id: s.id,
      updatedAt: s.updatedAt,
      data: { carId: s.carId, name: s.name, entries: s.entries, wheelTireSetups: s.wheelTireSetups, notes: s.notes },
    }));
  }

  if (dirtyTracks.length > 0) {
    body.tracks = dirtyTracks.map((t) => ({
      id: t.id,
      updatedAt: t.updatedAt,
      data: {
        name: t.name, location: t.location, surfaceType: t.surfaceType,
        tileType: t.tileType, dimensions: t.dimensions,
        layoutDescription: t.layoutDescription, notes: t.notes,
      },
    }));
  }

  if (dirtySessions.length > 0) {
    body.runSessions = dirtySessions.map((r) => ({
      id: r.id,
      updatedAt: r.startedAt,
      data: { carId: r.carId, trackId: r.trackId, notes: r.notes, startedAt: r.startedAt, endedAt: r.endedAt },
    }));
  }

  await apiFetch("/api/sync/push", { method: "POST", body: JSON.stringify(body) });

  // Mark pushed records as clean
  await Promise.all([
    ...dirtySetups.map((s) => localDb.setupSnapshots.update(s.id, { _dirty: 0 })),
    ...dirtyTracks.map((t) => localDb.tracks.update(t.id, { _dirty: 0 })),
    ...dirtySessions.map((r) => localDb.runSessions.update(r.id, { _dirty: 0 })),
  ]);
}

// ─── Pull server records into local DB ──────────────────────

interface PullResponse {
  setupSnapshots: any[];
  tracks: any[];
  components: any[];
  runSessions: any[];
  runSegments: any[];
  measurements: any[];
  serverTime: string;
}

async function pullFromServer(): Promise<void> {
  const lastSync = await localDb.syncMeta.get("lastSyncTime");
  const since = lastSync?.value || new Date(0).toISOString();

  const data = await apiFetch<PullResponse>(`/api/sync/pull?since=${encodeURIComponent(since)}`);

  // Upsert into local DB — only if server version is newer (last-write-wins)
  await localDb.transaction("rw",
    [localDb.setupSnapshots, localDb.tracks, localDb.components, localDb.runSessions, localDb.runSegments, localDb.measurements, localDb.syncMeta],
    async () => {
      for (const setup of data.setupSnapshots) {
        const local = await localDb.setupSnapshots.get(setup.id);
        if (!local || new Date(setup.updated_at || setup.updatedAt) > new Date(local.updatedAt)) {
          await localDb.setupSnapshots.put({
            id: setup.id,
            userId: setup.user_id || setup.userId,
            carId: setup.car_id || setup.carId,
            name: setup.name,
            entries: setup.entries,
            wheelTireSetups: setup.wheel_tire_setups || setup.wheelTireSetups,
            notes: setup.notes,
            createdAt: setup.created_at || setup.createdAt,
            updatedAt: setup.updated_at || setup.updatedAt,
            _dirty: 0,
          });
        }
      }

      for (const track of data.tracks) {
        const local = await localDb.tracks.get(track.id);
        if (!local || new Date(track.updated_at || track.updatedAt) > new Date(local.updatedAt)) {
          await localDb.tracks.put({
            id: track.id,
            userId: track.user_id || track.userId,
            name: track.name,
            location: track.location,
            surfaceType: track.surface_type || track.surfaceType,
            tileType: track.tile_type || track.tileType,
            dimensions: track.dimensions,
            layoutDescription: track.layout_description || track.layoutDescription,
            notes: track.notes,
            createdAt: track.created_at || track.createdAt,
            updatedAt: track.updated_at || track.updatedAt,
            _dirty: 0,
          });
        }
      }

      for (const session of data.runSessions) {
        const local = await localDb.runSessions.get(session.id);
        if (!local) {
          await localDb.runSessions.put({
            id: session.id,
            userId: session.user_id || session.userId,
            carId: session.car_id || session.carId,
            trackId: session.track_id || session.trackId,
            notes: session.notes,
            startedAt: session.started_at || session.startedAt,
            endedAt: session.ended_at || session.endedAt,
            _dirty: 0,
          });
        }
      }

      await localDb.syncMeta.put({ key: "lastSyncTime", value: data.serverTime });
    }
  );
}

// ─── Full sync cycle ────────────────────────────────────────

export async function performSync(): Promise<void> {
  setState("syncing");
  try {
    await pushDirtyRecords();
    await pullFromServer();
    const dirty = await hasDirtyRecords();
    setState(dirty ? "pending" : "synced");
  } catch (err) {
    console.error("[sync] failed:", err);
    setState("error");
  }
}

// ─── Online/offline detection + auto-sync ───────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(intervalMs: number = 30_000): void {
  updateOnlineState();

  window.addEventListener("online", () => {
    updateOnlineState();
    performSync();
  });
  window.addEventListener("offline", () => setState("offline"));

  syncInterval = setInterval(() => {
    if (navigator.onLine) performSync();
  }, intervalMs);
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

async function updateOnlineState(): Promise<void> {
  if (!navigator.onLine) {
    setState("offline");
    return;
  }
  const dirty = await hasDirtyRecords();
  setState(dirty ? "pending" : "synced");
}
