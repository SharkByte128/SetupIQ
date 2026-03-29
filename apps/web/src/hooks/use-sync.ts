import { useEffect, useState } from "react";
import { getSyncState, onSyncStateChange, initSync, type SyncState } from "../sync/engine.js";

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    const unsub = onSyncStateChange(setState);
    initSync();
    return unsub;
  }, []);

  return state;
}
