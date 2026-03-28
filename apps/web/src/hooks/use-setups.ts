import { useState, useEffect, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { localDb as db } from "../db/local-db.js";
import type { LocalSetupSnapshot } from "../db/local-db.js";
import type { SetupSnapshot, SetupEntry, WheelTireSetup, CarDefinition } from "@setupiq/shared";

export function useSetups(carId?: string) {
  const [setups, setSetups] = useState<SetupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let rows: LocalSetupSnapshot[];
    if (carId) {
      rows = await db.setupSnapshots.where("carId").equals(carId).reverse().sortBy("updatedAt");
    } else {
      rows = await db.setupSnapshots.reverse().sortBy("updatedAt");
    }
    // Cast the loosely-typed local records to the strict shared types
    setSetups(rows as unknown as SetupSnapshot[]);
    setLoading(false);
  }, [carId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const createSetup = useCallback(
    async (
      car: CarDefinition,
      name: string,
      entries: SetupEntry[],
      wheelTireSetups: WheelTireSetup[],
      notes?: string,
    ): Promise<SetupSnapshot> => {
      const now = new Date().toISOString();
      const setup = {
        id: uuid(),
        userId: "local",
        carId: car.id,
        name,
        entries,
        wheelTireSetups,
        notes,
        createdAt: now,
        updatedAt: now,
        _dirty: 1 as const,
      };
      await db.setupSnapshots.add(setup as unknown as LocalSetupSnapshot);
      await reload();
      return setup as unknown as SetupSnapshot;
    },
    [reload],
  );

  const updateSetup = useCallback(
    async (
      id: string,
      patch: Partial<Pick<SetupSnapshot, "name" | "entries" | "wheelTireSetups" | "notes">>,
    ) => {
      await db.setupSnapshots.update(id, {
        ...patch,
        updatedAt: new Date().toISOString(),
        _dirty: 1 as const,
      });
      await reload();
    },
    [reload],
  );

  const cloneSetup = useCallback(
    async (source: SetupSnapshot, newName: string): Promise<SetupSnapshot> => {
      const now = new Date().toISOString();
      const cloned = {
        ...source,
        id: uuid(),
        name: newName,
        createdAt: now,
        updatedAt: now,
        _dirty: 1 as const,
      };
      await db.setupSnapshots.add(cloned as unknown as LocalSetupSnapshot);
      await reload();
      return cloned as unknown as SetupSnapshot;
    },
    [reload],
  );

  const deleteSetup = useCallback(
    async (id: string) => {
      await db.setupSnapshots.delete(id);
      await reload();
    },
    [reload],
  );

  return { setups, loading, createSetup, updateSetup, cloneSetup, deleteSetup, reload };
}
