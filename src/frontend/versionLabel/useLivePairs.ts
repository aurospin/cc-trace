import { useEffect, useState } from "react";
import { isHttpPair, isHttpPairArray, isPendingPair } from "../../shared/guards.js";
import type { HttpPair } from "../../shared/types.js";

interface LivePairsState {
  pairs: HttpPair[];
  pendingIndices: Set<number>;
}

/**
 * Connects to the cc-trace WebSocket server and tracks pairs + in-flight pending state.
 * Handles the three-message protocol: history, pair-pending, pair.
 * When wsUrl is null, returns empty state (static HTML report mode).
 * @param wsUrl - WebSocket URL or null to disable
 * @returns current pairs and set of in-flight pairIndex values
 */
export function useLivePairs(wsUrl: string | null): LivePairsState {
  const [state, setState] = useState<LivePairsState>({ pairs: [], pendingIndices: new Set() });

  useEffect(() => {
    if (wsUrl === null) return;
    let ws: WebSocket;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(wsUrl as string);

      ws.onmessage = (event: MessageEvent<string>) => {
        const raw: unknown = JSON.parse(event.data);
        if (typeof raw !== "object" || raw === null) return;
        const msg = raw as { type: string; data: unknown };

        if (msg.type === "history" && isHttpPairArray(msg.data)) {
          setState({ pairs: msg.data, pendingIndices: new Set() });
        } else if (msg.type === "pair-pending" && isPendingPair(msg.data)) {
          const idx = (msg.data as { pairIndex: number }).pairIndex;
          setState((prev) => {
            const next = new Set(prev.pendingIndices);
            next.add(idx);
            return { pairs: prev.pairs, pendingIndices: next };
          });
        } else if (msg.type === "pair" && isHttpPair(msg.data)) {
          const incoming = msg.data as HttpPair;
          setState((prev) => {
            const next = new Set(prev.pendingIndices);
            next.delete(incoming.pairIndex ?? -1);
            return { pairs: [...prev.pairs, incoming], pendingIndices: next };
          });
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          setState((prev) => ({ pairs: prev.pairs, pendingIndices: new Set() }));
          setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        /* ignore */
      };
    }

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [wsUrl]);

  return state;
}
