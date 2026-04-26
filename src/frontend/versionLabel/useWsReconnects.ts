import { useEffect, useState } from "react";
import { getWsReconnectCount, subscribeWsReconnects } from "./useWebSocket.js";

/**
 * Returns a counter that increments on every WebSocket connect attempt
 * (initial connect + every auto-reconnect). Used by `<VersionLabel>` to
 * re-fetch `/api/status` after a transient failure.
 */
export function useWsReconnects(): number {
  const [n, setN] = useState<number>(getWsReconnectCount());
  useEffect(() => subscribeWsReconnects(setN), []);
  return n;
}
