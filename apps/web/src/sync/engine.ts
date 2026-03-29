import { localDb } from "../db/local-db.js";

export type SyncState = "synced" | "pending" | "syncing" | "offline" | "error" | "not-configured";

type SyncListener = (state: SyncState) => void;

let currentState: SyncState = "not-configured";
const listeners = new Set<SyncListener>();

// Cached sync config
let serverUrl: string | null = null;
let syncJwt: string | null = null;

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

// ─── Sync config management ─────────────────────────────────

export async function loadSyncConfig(): Promise<boolean> {
  const urlMeta = await localDb.syncMeta.get("sync_server_url");
  const jwtMeta = await localDb.syncMeta.get("sync_jwt");
  serverUrl = urlMeta?.value || null;
  syncJwt = jwtMeta?.value || null;
  return !!(serverUrl && syncJwt);
}

export function isSyncConfigured(): boolean {
  return !!(serverUrl && syncJwt);
}

export function clearSyncConfig(): void {
  serverUrl = null;
  syncJwt = null;
}

// ─── Authenticated fetch for sync ───────────────────────────

async function syncFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!serverUrl || !syncJwt) throw new Error("Sync not configured");

  let res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${syncJwt}`,
      ...options.headers,
    },
  });

  // JWT expired — try to re-login with stored credentials
  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (!refreshed) throw new Error("Auth expired");
    res = await fetch(`${serverUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${syncJwt}`,
        ...options.headers,
      },
    });
  }

  if (!res.ok) throw new Error(`Sync API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function refreshToken(): Promise<boolean> {
  const usernameMeta = await localDb.syncMeta.get("sync_username");
  const tokenMeta = await localDb.syncMeta.get("sync_api_token");
  if (!usernameMeta?.value || !tokenMeta?.value || !serverUrl) return false;

  try {
    const res = await fetch(`${serverUrl}/auth/token-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameMeta.value, apiToken: tokenMeta.value }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { token: string };
    syncJwt = data.token;
    await localDb.syncMeta.put({ key: "sync_jwt", value: data.token });
    return true;
  } catch {
    return false;
  }
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
    localDb.parts.where("_dirty").equals(1).count(),
    localDb.raceResults.where("_dirty").equals(1).count(),
    localDb.customCars.where("_dirty").equals(1).count(),
  ]);
  return counts.some((c) => c > 0);
}

// ─── Mark all records dirty (for initial sync) ─────────────

export async function markAllDirty(): Promise<void> {
  await Promise.all([
    localDb.setupSnapshots.toCollection().modify({ _dirty: 1 }),
    localDb.tracks.toCollection().modify({ _dirty: 1 }),
    localDb.runSessions.toCollection().modify({ _dirty: 1 }),
    localDb.runSegments.toCollection().modify({ _dirty: 1 }),
    localDb.components.toCollection().modify({ _dirty: 1 }),
    localDb.measurements.toCollection().modify({ _dirty: 1 }),
    localDb.parts.toCollection().modify({ _dirty: 1 }),
    localDb.raceResults.toCollection().modify({ _dirty: 1 }),
    localDb.customCars.toCollection().modify({ _dirty: 1 }),
  ]);
}

// ─── Push dirty records to server ───────────────────────────

async function pushDirtyRecords(): Promise<void> {
  const [dirtySetups, dirtyTracks, dirtySessions, dirtyParts, dirtyRaceResults, dirtyCustomCars] = await Promise.all([
    localDb.setupSnapshots.where("_dirty").equals(1).toArray(),
    localDb.tracks.where("_dirty").equals(1).toArray(),
    localDb.runSessions.where("_dirty").equals(1).toArray(),
    localDb.parts.where("_dirty").equals(1).toArray(),
    localDb.raceResults.where("_dirty").equals(1).toArray(),
    localDb.customCars.where("_dirty").equals(1).toArray(),
  ]);

  const hasAny = dirtySetups.length || dirtyTracks.length || dirtySessions.length ||
    dirtyParts.length || dirtyRaceResults.length || dirtyCustomCars.length;
  if (!hasAny) return;

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
        name: t.name, location: t.location, address: t.address, phone: t.phone,
        hours: t.hours, timingSystem: t.timingSystem, surfaceType: t.surfaceType,
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

  if (dirtyParts.length > 0) {
    body.parts = dirtyParts.map((p) => ({
      id: p.id,
      updatedAt: p.updatedAt,
      data: {
        vendorId: p.vendorId, categoryId: p.categoryId, name: p.name, sku: p.sku,
        compatibleChassisIds: p.compatibleChassisIds, attributes: p.attributes, notes: p.notes,
      },
    }));
  }

  if (dirtyRaceResults.length > 0) {
    body.raceResults = dirtyRaceResults.map((r) => ({
      id: r.id,
      updatedAt: r.createdAt,
      data: {
        carId: r.carId, trackId: r.trackId, eventName: r.eventName, community: r.community,
        className: r.className, roundType: r.roundType, roundNumber: r.roundNumber,
        date: r.date, position: r.position, totalEntries: r.totalEntries,
        totalLaps: r.totalLaps, totalTimeMs: r.totalTimeMs, fastLapMs: r.fastLapMs,
        avgLapMs: r.avgLapMs, laps: r.laps, sourceUrl: r.sourceUrl,
        setupSnapshotId: r.setupSnapshotId, notes: r.notes,
      },
    }));
  }

  if (dirtyCustomCars.length > 0) {
    body.customCars = dirtyCustomCars.map((c) => ({
      id: c.id,
      updatedAt: c.updatedAt,
      data: { name: c.name, manufacturer: c.manufacturer, scale: c.scale, driveType: c.driveType, notes: c.notes },
    }));
  }

  await syncFetch("/api/sync/push", { method: "POST", body: JSON.stringify(body) });

  // Mark pushed records as clean
  await Promise.all([
    ...dirtySetups.map((s) => localDb.setupSnapshots.update(s.id, { _dirty: 0 })),
    ...dirtyTracks.map((t) => localDb.tracks.update(t.id, { _dirty: 0 })),
    ...dirtySessions.map((r) => localDb.runSessions.update(r.id, { _dirty: 0 })),
    ...dirtyParts.map((p) => localDb.parts.update(p.id, { _dirty: 0 })),
    ...dirtyRaceResults.map((r) => localDb.raceResults.update(r.id, { _dirty: 0 })),
    ...dirtyCustomCars.map((c) => localDb.customCars.update(c.id, { _dirty: 0 })),
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
  parts: any[];
  raceResults: any[];
  customCars: any[];
  serverTime: string;
}

async function pullFromServer(): Promise<void> {
  const lastSync = await localDb.syncMeta.get("lastSyncTime");
  const since = lastSync?.value || new Date(0).toISOString();

  const data = await syncFetch<PullResponse>(`/api/sync/pull?since=${encodeURIComponent(since)}`);

  await localDb.transaction("rw",
    [localDb.setupSnapshots, localDb.tracks, localDb.components, localDb.runSessions,
     localDb.runSegments, localDb.measurements, localDb.parts, localDb.raceResults,
     localDb.customCars, localDb.syncMeta],
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
            address: track.address,
            phone: track.phone,
            hours: track.hours,
            timingSystem: track.timing_system || track.timingSystem,
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

      for (const part of (data.parts || [])) {
        const local = await localDb.parts.get(part.id);
        if (!local || new Date(part.updated_at || part.updatedAt) > new Date(local.updatedAt)) {
          await localDb.parts.put({
            id: part.id,
            userId: part.user_id || part.userId,
            vendorId: part.vendor_id || part.vendorId,
            categoryId: part.category_id || part.categoryId,
            name: part.name,
            sku: part.sku,
            compatibleChassisIds: part.compatible_chassis_ids || part.compatibleChassisIds || [],
            attributes: part.attributes || {},
            notes: part.notes,
            createdAt: part.created_at || part.createdAt,
            updatedAt: part.updated_at || part.updatedAt,
            _dirty: 0,
          });
        }
      }

      for (const result of (data.raceResults || [])) {
        const local = await localDb.raceResults.get(result.id);
        if (!local) {
          await localDb.raceResults.put({
            id: result.id,
            userId: result.user_id || result.userId,
            carId: result.car_id || result.carId,
            trackId: result.track_id || result.trackId,
            eventName: result.event_name || result.eventName,
            community: result.community,
            className: result.class_name || result.className,
            roundType: result.round_type || result.roundType,
            roundNumber: result.round_number || result.roundNumber,
            date: result.date,
            position: result.position,
            totalEntries: result.total_entries || result.totalEntries,
            totalLaps: result.total_laps || result.totalLaps,
            totalTimeMs: result.total_time_ms || result.totalTimeMs,
            fastLapMs: result.fast_lap_ms || result.fastLapMs,
            avgLapMs: result.avg_lap_ms || result.avgLapMs,
            laps: result.laps || [],
            sourceUrl: result.source_url || result.sourceUrl,
            setupSnapshotId: result.setup_snapshot_id || result.setupSnapshotId,
            notes: result.notes,
            createdAt: result.created_at || result.createdAt,
            _dirty: 0,
          });
        }
      }

      for (const car of (data.customCars || [])) {
        const local = await localDb.customCars.get(car.id);
        if (!local || new Date(car.updated_at || car.updatedAt) > new Date(local.updatedAt)) {
          await localDb.customCars.put({
            id: car.id,
            userId: car.user_id || car.userId,
            name: car.name,
            manufacturer: car.manufacturer,
            scale: car.scale,
            driveType: car.drive_type || car.driveType,
            notes: car.notes,
            createdAt: car.created_at || car.createdAt,
            updatedAt: car.updated_at || car.updatedAt,
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
  if (!isSyncConfigured()) {
    setState("not-configured");
    return;
  }
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
    if (isSyncConfigured()) performSync();
  });
  window.addEventListener("offline", () => setState("offline"));

  syncInterval = setInterval(() => {
    if (navigator.onLine && isSyncConfigured()) performSync();
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
  if (!isSyncConfigured()) {
    setState("not-configured");
    return;
  }
  const dirty = await hasDirtyRecords();
  setState(dirty ? "pending" : "synced");
}

// ─── Init: load config and start if configured ──────────────

export async function initSync(): Promise<void> {
  const configured = await loadSyncConfig();
  if (configured) {
    startAutoSync();
  } else {
    setState("not-configured");
  }
}
