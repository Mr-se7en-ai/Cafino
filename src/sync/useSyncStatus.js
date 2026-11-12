import { useEffect, useState } from "react";
import { syncQueue } from "./index.js";

// Re-renders when the queue changes; returns {stats, ops}.
export function useSyncStatus() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = syncQueue.subscribe(() => setTick((t) => (t + 1) % 1e9));
    const onNet = () => setTick((t) => (t + 1) % 1e9);
    window.addEventListener("online", onNet); window.addEventListener("offline", onNet);
    return () => { off(); window.removeEventListener("online", onNet); window.removeEventListener("offline", onNet); };
  }, []);
  return { stats: syncQueue.stats(), ops: syncQueue.list() };
}
