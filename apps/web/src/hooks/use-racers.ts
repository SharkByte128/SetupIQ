import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "../db/local-db.js";

export function useRacers() {
  const racers = useLiveQuery(() => localDb.racers.toArray()) ?? [];
  const activeRacer = useLiveQuery(() => localDb.racers.where("active").equals(1).first()) ?? null;

  const addRacer = useCallback(async (name: string) => {
    const isFirst = (await localDb.racers.count()) === 0;
    const now = new Date().toISOString();
    await localDb.racers.put({
      id: crypto.randomUUID(),
      userId: "local",
      name: name.trim(),
      active: isFirst ? 1 : 0,
      createdAt: now,
      updatedAt: now,
      _dirty: 1,
    });
  }, []);

  const renameRacer = useCallback(async (id: string, name: string) => {
    await localDb.racers.update(id, { name: name.trim(), updatedAt: new Date().toISOString(), _dirty: 1 });
  }, []);

  const deleteRacer = useCallback(async (id: string) => {
    const racer = await localDb.racers.get(id);
    await localDb.racers.delete(id);
    // If we deleted the active one, activate another
    if (racer?.active === 1) {
      const remaining = await localDb.racers.toArray();
      if (remaining.length > 0) {
        await localDb.racers.update(remaining[0].id, { active: 1, updatedAt: new Date().toISOString(), _dirty: 1 });
      }
    }
  }, []);

  const setActiveRacer = useCallback(async (id: string) => {
    await localDb.transaction("rw", localDb.racers, async () => {
      // Deactivate all
      const all = await localDb.racers.toArray();
      for (const r of all) {
        if (r.active === 1) await localDb.racers.update(r.id, { active: 0, updatedAt: new Date().toISOString(), _dirty: 1 });
      }
      // Activate selected
      await localDb.racers.update(id, { active: 1, updatedAt: new Date().toISOString(), _dirty: 1 });
    });
  }, []);

  return { racers, activeRacer, addRacer, renameRacer, deleteRacer, setActiveRacer };
}
