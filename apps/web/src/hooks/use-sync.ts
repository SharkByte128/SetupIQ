import { useEffect, useState } from "react";
import { getSyncState, onSyncStateChange, startAutoSync, type SyncState } from "../sync/engine.js";

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    const unsub = onSyncStateChange(setState);
    startAutoSync();
    return unsub;
  }, []);

  return state;
}
