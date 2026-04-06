import { localDb } from "../db/local-db.js";

export type SyncState = "synced" | "pending" | "syncing" | "offline" | "error" | "not-configured";

// ─── Blob ↔ base64 helpers for image sync ───────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Strip the data:…;base64, prefix — we store the raw base64
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mimeType = "image/jpeg"): Blob {
  const bytes = atob(b64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new Blob([buf], { type: mimeType });
}

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
      credentials: "include",
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
    localDb.carImages.where("_dirty").equals(1).count(),
    localDb.trackFiles.where("_dirty").equals(1).count(),
    localDb.setupTemplates.where("_dirty").equals(1).count(),
    localDb.racers.where("_dirty").equals(1).count(),
    localDb.customPartCategories.where("_dirty").equals(1).count(),
    localDb.categoryImages.where("_dirty").equals(1).count(),
    localDb.partFiles.where("_dirty").equals(1).count(),
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
    localDb.carImages.toCollection().modify({ _dirty: 1 }),
    localDb.trackFiles.toCollection().modify({ _dirty: 1 }),
    localDb.setupTemplates.toCollection().modify({ _dirty: 1 }),
    localDb.racers.toCollection().modify({ _dirty: 1 }),
    localDb.customPartCategories.toCollection().modify({ _dirty: 1 }),
    localDb.categoryImages.toCollection().modify({ _dirty: 1 }),
    localDb.partFiles.toCollection().modify({ _dirty: 1 }),
  ]);
}

// ─── Push dirty records to server ───────────────────────────

async function pushDirtyRecords(): Promise<void> {
  const [dirtySetups, dirtyTracks, dirtySessions, dirtySegments, dirtyParts, dirtyRaceResults, dirtyCustomCars, dirtyCarImages, dirtyTrackImages, dirtyComponents, dirtyMeasurements, dirtySetupTemplates, dirtyRacers, dirtyPartCategories, dirtyCategoryImages, dirtyPartFiles] = await Promise.all([
    localDb.setupSnapshots.where("_dirty").equals(1).toArray(),
    localDb.tracks.where("_dirty").equals(1).toArray(),
    localDb.runSessions.where("_dirty").equals(1).toArray(),
    localDb.runSegments.where("_dirty").equals(1).toArray(),
    localDb.parts.where("_dirty").equals(1).toArray(),
    localDb.raceResults.where("_dirty").equals(1).toArray(),
    localDb.customCars.where("_dirty").equals(1).toArray(),
    localDb.carImages.where("_dirty").equals(1).toArray(),
    localDb.trackFiles.where("_dirty").equals(1).toArray(),
    localDb.components.where("_dirty").equals(1).toArray(),
    localDb.measurements.where("_dirty").equals(1).toArray(),
    localDb.setupTemplates.where("_dirty").equals(1).toArray(),
    localDb.racers.where("_dirty").equals(1).toArray(),
    localDb.customPartCategories.where("_dirty").equals(1).toArray(),
    localDb.categoryImages.where("_dirty").equals(1).toArray(),
    localDb.partFiles.where("_dirty").equals(1).toArray(),
  ]);

  const hasAny = dirtySetups.length || dirtyTracks.length || dirtySessions.length || dirtySegments.length ||
    dirtyParts.length || dirtyRaceResults.length || dirtyCustomCars.length || dirtyCarImages.length ||
    dirtyTrackImages.length || dirtyComponents.length || dirtyMeasurements.length || dirtySetupTemplates.length || dirtyRacers.length ||
    dirtyPartCategories.length || dirtyCategoryImages.length || dirtyPartFiles.length;
  if (!hasAny) return;

  const body: Record<string, { id: string; updatedAt: string; data: Record<string, unknown> }[]> = {};

  if (dirtySetups.length > 0) {
    body.setupSnapshots = dirtySetups.map((s) => ({
      id: s.id,
      updatedAt: s.updatedAt,
      data: { carId: s.carId, name: s.name, entries: s.entries, wheelTireSetups: s.wheelTireSetups, sections: s.sections, notes: s.notes },
    }));
  }

  if (dirtyTracks.length > 0) {
    body.tracks = dirtyTracks.map((t) => ({
      id: t.id,
      updatedAt: t.updatedAt,
      data: {
        name: t.name, location: t.location, address: t.address, phone: t.phone,
        hours: t.hours, timingSystem: t.timingSystem, timingFeedUrl: t.timingFeedUrl, nltCommunityId: t.nltCommunityId, surfaceType: t.surfaceType,
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

  if (dirtySegments.length > 0) {
    body.runSegments = dirtySegments.map((seg) => ({
      id: seg.id,
      updatedAt: seg.startedAt,
      data: {
        sessionId: seg.sessionId, setupSnapshotId: seg.setupSnapshotId,
        segmentNumber: seg.segmentNumber, feedback: seg.feedback,
        lapTimes: seg.lapTimes, setupChanges: seg.setupChanges,
        startedAt: seg.startedAt, endedAt: seg.endedAt,
      },
    }));
  }

  if (dirtyParts.length > 0) {
    body.parts = dirtyParts.map((p) => ({
      id: p.id,
      updatedAt: p.updatedAt,
      data: {
        vendorId: p.vendorId, categoryId: p.categoryId, name: p.name, sku: p.sku,
        compatibleChassisIds: p.compatibleChassisIds, attributes: p.attributes, notes: p.notes,
        sortOrder: p.sortOrder, setupTemplateIds: p.setupTemplateIds,
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
        setupSnapshotId: r.setupSnapshotId, notes: r.notes, hidden: r.hidden ?? 0,
      },
    }));
  }

  if (dirtyCustomCars.length > 0) {
    body.customCars = dirtyCustomCars.map((c) => ({
      id: c.id,
      updatedAt: c.updatedAt,
      data: { name: c.name, chassisId: c.chassisId, manufacturer: c.manufacturer, scale: c.scale, driveType: c.driveType, notes: c.notes, setupTemplateId: c.setupTemplateId },
    }));
  }

  if (dirtyComponents.length > 0) {
    body.components = dirtyComponents.map((c) => ({
      id: c.id,
      updatedAt: c.createdAt,
      data: {
        type: c.type, brand: c.brand, name: c.name, sku: c.sku,
        position: c.position, widthMm: c.widthMm, offset: c.offset,
        compound: c.compound, diameterMm: c.diameterMm, color: c.color, notes: c.notes,
      },
    }));
  }

  if (dirtyMeasurements.length > 0) {
    body.measurements = dirtyMeasurements.map((m) => ({
      id: m.id,
      updatedAt: m.measuredAt,
      data: {
        setupId: m.setupId, runSessionId: m.runSessionId,
        cornerWeights: m.cornerWeights, totalWeight: m.totalWeight,
        frontBiasPercent: m.frontBiasPercent, leftBiasPercent: m.leftBiasPercent,
        crossWeightPercent: m.crossWeightPercent, measuredAt: m.measuredAt, source: m.source,
      },
    }));
  }

  if (dirtyCarImages.length > 0) {
    body.carImages = await Promise.all(
      dirtyCarImages.map(async (img) => {
        const base64 = await blobToBase64(img.blob);
        return {
          id: img.id,
          updatedAt: img.updatedAt,
          data: { carId: img.carId, imageBase64: base64, name: img.name, mimeType: img.mimeType || img.blob.type },
        };
      }),
    );
  }

  if (dirtyTrackImages.length > 0) {
    body.trackImages = await Promise.all(
      dirtyTrackImages.map(async (img) => {
        const base64 = await blobToBase64(img.blob);
        return {
          id: img.id,
          updatedAt: img.updatedAt,
          data: { trackId: img.trackId, imageBase64: base64, name: img.name, mimeType: img.mimeType || img.blob.type },
        };
      }),
    );
  }

  if (dirtySetupTemplates.length > 0) {
    body.setupTemplates = dirtySetupTemplates.map((t) => ({
      id: t.id,
      updatedAt: t.updatedAt,
      data: {
        name: t.name, compatibleChassisIds: t.compatibleChassisIds,
        capabilities: t.capabilities, builtIn: t.builtIn,
      },
    }));
  }

  if (dirtyRacers.length > 0) {
    body.racers = dirtyRacers.map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      data: { name: r.name, active: r.active },
    }));
  }

  if (dirtyPartCategories.length > 0) {
    body.partCategories = dirtyPartCategories.map((c) => ({
      id: c.id,
      updatedAt: c.updatedAt,
      data: {
        name: c.name, icon: c.icon, description: c.description,
        attributes: c.attributes, builtIn: c.builtIn,
      },
    }));
  }

  if (dirtyCategoryImages.length > 0) {
    body.categoryImages = await Promise.all(
      dirtyCategoryImages.map(async (img) => {
        const base64 = await blobToBase64(img.blob);
        return {
          id: img.id,
          updatedAt: img.updatedAt,
          data: { categoryId: img.categoryId, imageBase64: base64, name: img.name, mimeType: img.mimeType || img.blob.type },
        };
      }),
    );
  }

  if (dirtyPartFiles.length > 0) {
    body.partFiles = await Promise.all(
      dirtyPartFiles.map(async (f) => {
        const base64 = await blobToBase64(f.blob);
        return {
          id: f.id,
          updatedAt: f.updatedAt,
          data: { partId: f.partId, fileBase64: base64, name: f.name, mimeType: f.mimeType || f.blob.type },
        };
      }),
    );
  }

  const pushRes = await syncFetch<{ ok: boolean; upserted: Record<string, number>; errors?: Record<string, string> }>("/api/sync/push", { method: "POST", body: JSON.stringify(body) });

  if (pushRes.errors && Object.keys(pushRes.errors).length > 0) {
    console.warn("[sync] partial push failures:", pushRes.errors);
  }

  // Mark pushed records as clean — only for record types the server confirmed
  const u = pushRes.upserted;
  await Promise.all([
    ...(u.setupSnapshots ? dirtySetups.map((s) => localDb.setupSnapshots.update(s.id, { _dirty: 0 })) : []),
    ...(u.tracks ? dirtyTracks.map((t) => localDb.tracks.update(t.id, { _dirty: 0 })) : []),
    ...(u.runSessions ? dirtySessions.map((r) => localDb.runSessions.update(r.id, { _dirty: 0 })) : []),
    ...(u.runSegments ? dirtySegments.map((seg) => localDb.runSegments.update(seg.id, { _dirty: 0 })) : []),
    ...(u.parts ? dirtyParts.map((p) => localDb.parts.update(p.id, { _dirty: 0 })) : []),
    ...(u.raceResults ? dirtyRaceResults.map((r) => localDb.raceResults.update(r.id, { _dirty: 0 })) : []),
    ...(u.customCars ? dirtyCustomCars.map((c) => localDb.customCars.update(c.id, { _dirty: 0 })) : []),
    ...(u.carImages ? dirtyCarImages.map((img) => localDb.carImages.update(img.id, { _dirty: 0 })) : []),
    ...(u.trackImages ? dirtyTrackImages.map((img) => localDb.trackFiles.update(img.id, { _dirty: 0 })) : []),
    ...(u.components ? dirtyComponents.map((c) => localDb.components.update(c.id, { _dirty: 0 })) : []),
    ...(u.measurements ? dirtyMeasurements.map((m) => localDb.measurements.update(m.id, { _dirty: 0 })) : []),
    ...(u.setupTemplates ? dirtySetupTemplates.map((t) => localDb.setupTemplates.update(t.id, { _dirty: 0 })) : []),
    ...(u.racers ? dirtyRacers.map((r) => localDb.racers.update(r.id, { _dirty: 0 })) : []),
    ...(u.partCategories ? dirtyPartCategories.map((c) => localDb.customPartCategories.update(c.id, { _dirty: 0 })) : []),
    ...(u.categoryImages ? dirtyCategoryImages.map((img) => localDb.categoryImages.update(img.id, { _dirty: 0 })) : []),
    ...(u.partFiles ? dirtyPartFiles.map((f) => localDb.partFiles.update(f.id, { _dirty: 0 })) : []),
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
  carImages: any[];
  trackImages: any[];
  setupTemplates: any[];
  racers: any[];
  partCategories: any[];
  categoryImages: any[];
  partFiles: any[];
  serverTime: string;
}

async function pullFromServer(): Promise<void> {
  const lastSync = await localDb.syncMeta.get("lastSyncTime");
  const since = lastSync?.value || new Date(0).toISOString();

  const data = await syncFetch<PullResponse>(`/api/sync/pull?since=${encodeURIComponent(since)}`);

  await localDb.transaction("rw",
    [localDb.setupSnapshots, localDb.tracks, localDb.components, localDb.runSessions,
     localDb.runSegments, localDb.measurements, localDb.parts, localDb.raceResults,
     localDb.customCars, localDb.carImages, localDb.trackFiles, localDb.setupTemplates, localDb.racers,
     localDb.customPartCategories, localDb.categoryImages, localDb.partFiles, localDb.syncMeta],
    async () => {
      try { for (const setup of (data.setupSnapshots || [])) {
        const local = await localDb.setupSnapshots.get(setup.id);
        if (!local || new Date(setup.updated_at || setup.updatedAt) > new Date(local.updatedAt)) {
          await localDb.setupSnapshots.put({
            id: setup.id,
            userId: setup.user_id || setup.userId,
            carId: setup.car_id || setup.carId,
            name: setup.name,
            entries: setup.entries,
            wheelTireSetups: setup.wheel_tire_setups || setup.wheelTireSetups,
            sections: setup.sections,
            notes: setup.notes,
            createdAt: setup.created_at || setup.createdAt,
            updatedAt: setup.updated_at || setup.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] setupSnapshots import failed", e); }

      try { for (const track of (data.tracks || [])) {
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
            timingFeedUrl: track.timing_feed_url || track.timingFeedUrl,
            nltCommunityId: track.nlt_community_id ?? track.nltCommunityId ?? undefined,
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
      } } catch (e) { console.warn("[sync/pull] tracks import failed", e); }

      try { for (const session of (data.runSessions || [])) {
        const local = await localDb.runSessions.get(session.id);
        const serverStartedAt = session.started_at || session.startedAt;
        const serverEndedAt = session.ended_at || session.endedAt;
        if (!local) {
          await localDb.runSessions.put({
            id: session.id,
            userId: session.user_id || session.userId,
            carId: session.car_id || session.carId,
            trackId: session.track_id || session.trackId,
            notes: session.notes,
            startedAt: serverStartedAt,
            endedAt: serverEndedAt,
            _dirty: 0,
          });
        } else if (!local._dirty) {
          // Update local record if server has newer data (e.g. endedAt, notes)
          const changed = (serverEndedAt && !local.endedAt) || (session.notes && session.notes !== local.notes);
          if (changed) {
            await localDb.runSessions.update(session.id, {
              notes: session.notes ?? local.notes,
              endedAt: serverEndedAt ?? local.endedAt,
              _dirty: 0,
            });
          }
        }
      } } catch (e) { console.warn("[sync/pull] runSessions import failed", e); }

      try { for (const seg of (data.runSegments || [])) {
        const local = await localDb.runSegments.get(seg.id);
        if (!local) {
          await localDb.runSegments.put({
            id: seg.id,
            sessionId: seg.session_id || seg.sessionId,
            setupSnapshotId: seg.setup_snapshot_id || seg.setupSnapshotId,
            segmentNumber: seg.segment_number ?? seg.segmentNumber,
            feedback: seg.feedback,
            lapTimes: seg.lap_times || seg.lapTimes,
            setupChanges: seg.setup_changes || seg.setupChanges,
            startedAt: seg.started_at || seg.startedAt,
            endedAt: seg.ended_at || seg.endedAt,
            _dirty: 0,
          });
        } else if (!local._dirty) {
          // Update with server data (feedback, lapTimes, endedAt may have changed)
          await localDb.runSegments.update(seg.id, {
            feedback: seg.feedback ?? local.feedback,
            lapTimes: (seg.lap_times || seg.lapTimes) ?? local.lapTimes,
            setupChanges: (seg.setup_changes || seg.setupChanges) ?? local.setupChanges,
            endedAt: (seg.ended_at || seg.endedAt) ?? local.endedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] runSegments import failed", e); }

      try { for (const part of (data.parts || [])) {
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
            sortOrder: part.sort_order ?? part.sortOrder,
            setupTemplateIds: part.setup_template_ids || part.setupTemplateIds || [],
            createdAt: part.created_at || part.createdAt,
            updatedAt: part.updated_at || part.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] parts import failed", e); }

      try { for (const result of (data.raceResults || [])) {
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
            hidden: result.hidden ? 1 : 0,
            createdAt: result.created_at || result.createdAt,
            _dirty: 0,
          });
        } else if (!local._dirty) {
          // Update existing record with server data
          await localDb.raceResults.update(result.id, {
            eventName: result.event_name || result.eventName || local.eventName,
            className: result.class_name || result.className || local.className,
            position: result.position ?? local.position,
            totalLaps: (result.total_laps || result.totalLaps) ?? local.totalLaps,
            totalTimeMs: (result.total_time_ms || result.totalTimeMs) ?? local.totalTimeMs,
            fastLapMs: (result.fast_lap_ms || result.fastLapMs) ?? local.fastLapMs,
            avgLapMs: (result.avg_lap_ms || result.avgLapMs) ?? local.avgLapMs,
            laps: result.laps || local.laps,
            notes: result.notes ?? local.notes,
            hidden: result.hidden !== undefined ? (result.hidden ? 1 : 0) : local.hidden,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] raceResults import failed", e); }

      try { for (const car of (data.customCars || [])) {
        const local = await localDb.customCars.get(car.id);
        if (!local || new Date(car.updated_at || car.updatedAt) > new Date(local.updatedAt)) {
          await localDb.customCars.put({
            id: car.id,
            userId: car.user_id || car.userId,
            name: car.name,
            chassisId: car.chassis_id || car.chassisId || "chassis-other",
            manufacturer: car.manufacturer,
            scale: car.scale,
            driveType: car.drive_type || car.driveType,
            notes: car.notes,
            setupTemplateId: car.setup_template_id || car.setupTemplateId,
            createdAt: car.created_at || car.createdAt,
            updatedAt: car.updated_at || car.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] customCars import failed", e); }

      try { for (const img of (data.carImages || [])) {
        const local = await localDb.carImages.get(img.id);
        if (!local || new Date(img.updated_at || img.updatedAt) > new Date(local.updatedAt)) {
          const mimeType = img.mime_type || img.mimeType || "image/jpeg";
          const blob = base64ToBlob(img.image_base64 || img.imageBase64, mimeType);
          await localDb.carImages.put({
            id: img.id,
            carId: img.car_id || img.carId,
            blob,
            name: img.name || "",
            mimeType,
            createdAt: img.created_at || img.createdAt,
            updatedAt: img.updated_at || img.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] carImages import failed", e); }

      try { for (const img of (data.trackImages || [])) {
        const local = await localDb.trackFiles.get(img.id);
        if (!local || new Date(img.updated_at || img.updatedAt) > new Date(local.updatedAt)) {
          const mimeType = img.mime_type || img.mimeType || "image/jpeg";
          const blob = base64ToBlob(img.image_base64 || img.imageBase64, mimeType);
          await localDb.trackFiles.put({
            id: img.id,
            trackId: img.track_id || img.trackId,
            blob,
            name: img.name || "",
            mimeType,
            createdAt: img.created_at || img.createdAt,
            updatedAt: img.updated_at || img.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] trackImages import failed", e); }

      try { for (const tmpl of (data.setupTemplates || [])) {
        const local = await localDb.setupTemplates.get(tmpl.id);
        if (!local || new Date(tmpl.updated_at || tmpl.updatedAt) > new Date(local.updatedAt)) {
          await localDb.setupTemplates.put({
            id: tmpl.id,
            userId: tmpl.user_id || tmpl.userId,
            name: tmpl.name,
            compatibleChassisIds: tmpl.compatible_chassis_ids || tmpl.compatibleChassisIds || [],
            capabilities: tmpl.capabilities || [],
            builtIn: tmpl.built_in ?? tmpl.builtIn ?? false,
            createdAt: tmpl.created_at || tmpl.createdAt,
            updatedAt: tmpl.updated_at || tmpl.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] setupTemplates import failed", e); }

      try { for (const racer of (data.racers || [])) {
        const local = await localDb.racers.get(racer.id);
        if (!local || new Date(racer.updated_at || racer.updatedAt) > new Date(local.updatedAt)) {
          await localDb.racers.put({
            id: racer.id,
            userId: racer.user_id || racer.userId,
            name: racer.name,
            active: racer.active ?? false,
            createdAt: racer.created_at || racer.createdAt,
            updatedAt: racer.updated_at || racer.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] racers import failed", e); }

      try { for (const cat of (data.partCategories || [])) {
        const local = await localDb.customPartCategories.get(cat.id);
        if (!local || new Date(cat.updated_at || cat.updatedAt) > new Date(local.updatedAt)) {
          await localDb.customPartCategories.put({
            id: cat.id,
            name: cat.name,
            icon: cat.icon || "📦",
            description: cat.description,
            attributes: cat.attributes || [],
            builtIn: (cat.built_in ?? cat.builtIn) ? 1 : 0,
            createdAt: cat.created_at || cat.createdAt,
            updatedAt: cat.updated_at || cat.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] partCategories import failed", e); }

      try { for (const img of (data.categoryImages || [])) {
        const local = await localDb.categoryImages.get(img.id);
        if (!local || new Date(img.updated_at || img.updatedAt) > new Date(local.updatedAt)) {
          const mimeType = img.mime_type || img.mimeType || "image/jpeg";
          const blob = base64ToBlob(img.image_base64 || img.imageBase64, mimeType);
          await localDb.categoryImages.put({
            id: img.id,
            categoryId: img.category_id || img.categoryId,
            blob,
            name: img.name || "",
            mimeType,
            createdAt: img.created_at || img.createdAt,
            updatedAt: img.updated_at || img.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] categoryImages import failed", e); }

      try { for (const f of (data.partFiles || [])) {
        const local = await localDb.partFiles.get(f.id);
        if (!local || new Date(f.updated_at || f.updatedAt) > new Date(local.updatedAt)) {
          const mimeType = f.mime_type || f.mimeType || "image/jpeg";
          const blob = base64ToBlob(f.file_base64 || f.fileBase64, mimeType);
          await localDb.partFiles.put({
            id: f.id,
            partId: f.part_id || f.partId,
            blob,
            name: f.name || "",
            mimeType,
            createdAt: f.created_at || f.createdAt,
            updatedAt: f.updated_at || f.updatedAt,
            _dirty: 0,
          });
        }
      } } catch (e) { console.warn("[sync/pull] partFiles import failed", e); }

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

// ─── Wipe local data and re-sync from server ────────────────

export async function wipeAndResync(): Promise<void> {
  // Clear all data tables but preserve sync credentials
  await Promise.all([
    localDb.setupSnapshots.clear(),
    localDb.runSessions.clear(),
    localDb.runSegments.clear(),
    localDb.tracks.clear(),
    localDb.components.clear(),
    localDb.measurements.clear(),
    localDb.raceResults.clear(),
    localDb.parts.clear(),
    localDb.customCars.clear(),
    localDb.carImages.clear(),
    localDb.trackFiles.clear(),
    localDb.setupTemplates.clear(),
    localDb.racers.clear(),
    localDb.partFiles.clear(),
  ]);
  // Reset sync cursor so pull fetches everything
  await localDb.syncMeta.delete("lastSyncTime");
  // Pull all data from server
  await performSync();
}
