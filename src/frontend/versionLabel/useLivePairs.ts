import { useEffect, useState } from "react";
import { isHttpPair, isHttpPairArray, isPendingPair, isWsEnvelope } from "../../shared/guards.js";
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
        if (!isWsEnvelope(raw)) return;

        if (raw.type === "history" && isHttpPairArray(raw.data)) {
          setState({ pairs: raw.data, pendingIndices: new Set() });
        } else if (raw.type === "pair-pending" && isPendingPair(raw.data)) {
          const idx = raw.data.pairIndex;
          setState((prev) => {
            const next = new Set(prev.pendingIndices);
            next.add(idx);
            return { pairs: prev.pairs, pendingIndices: next };
          });
        } else if (raw.type === "pair" && isHttpPair(raw.data)) {
          const incoming = raw.data;
          setState((prev) => {
            const next = new Set(prev.pendingIndices);
            next.delete(incoming.pairIndex ?? -1);
            return { pairs: [...prev.pairs, incoming], pendingIndices: next };
          });
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          setState((prev) => {
            if (prev.pendingIndices.size === 0) return prev;
            return { pairs: prev.pairs, pendingIndices: new Set() };
          });
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
