import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "../db/local-db.js";
import type { Track, SurfaceType } from "@setupiq/shared";
import { isDemoRecord } from "./use-demo-filter.js";

export function useTracks(hideDemoData = false) {
  const [saving, setSaving] = useState(false);

  const allTracks = useLiveQuery(() => localDb.tracks.toArray()) ?? [];
  const tracks = hideDemoData ? allTracks.filter((t) => !isDemoRecord(t)) : allTracks;
  const loading = allTracks === undefined;

  const createTrack = useCallback(
    async (data: {
      name: string;
      location?: string;
      address?: string;
      phone?: string;
      hours?: string;
      timingSystem?: string;
      surfaceType: SurfaceType;
      tileType?: string;
      dimensions?: string;
      layoutDescription?: string;
      notes?: string;
    }): Promise<Track> => {
      setSaving(true);
      const now = new Date().toISOString();
      const track = {
        id: crypto.randomUUID(),
        userId: "local",
        name: data.name,
        location: data.location,
        address: data.address,
        phone: data.phone,
        hours: data.hours,
        timingSystem: data.timingSystem,
        surfaceType: data.surfaceType,
        tileType: data.tileType,
        dimensions: data.dimensions,
        layoutDescription: data.layoutDescription,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
        _dirty: 1 as const,
      };
      await localDb.tracks.put(track);
      setSaving(false);
      return track as unknown as Track;
    },
    []
  );

  const updateTrack = useCallback(
    async (
      id: string,
      data: Partial<{
        name: string;
        location: string;
        address: string;
        phone: string;
        hours: string;
        timingSystem: string;
        surfaceType: SurfaceType;
        tileType: string;
        dimensions: string;
        layoutDescription: string;
        notes: string;
      }>
    ) => {
      setSaving(true);
      await localDb.tracks.update(id, {
        ...data,
        updatedAt: new Date().toISOString(),
        _dirty: 1 as const,
      });
      setSaving(false);
    },
    []
  );

  const deleteTrack = useCallback(async (id: string) => {
    await localDb.tracks.delete(id);
  }, []);

  return { tracks, loading, saving, createTrack, updateTrack, deleteTrack };
}
