import type WebSocket from "ws";
import type { AbortedRecord, HttpPair, PendingPair } from "../shared/types.js";

export interface Broadcaster {
  /** Register a new WebSocket client */
  addClient(ws: WebSocket): void;
  /** Unregister a WebSocket client */
  removeClient(ws: WebSocket): void;
  /** Track a pending pair and broadcast pair-pending to all OPEN clients */
  sendPending(pending: PendingPair): void;
  /** Complete a pending pair, remove from pending set, broadcast pair to all OPEN clients */
  send(pair: HttpPair): void;
  /** Handle an aborted in-flight pair: remove from pending, broadcast as pair with response: null */
  sendAborted(record: AbortedRecord): void;
  /** Returns all completed pairs sent so far, for page-reload recovery (excludes in-flight pending) */
  getPairs(): HttpPair[];
  /** Returns all currently in-flight pending pairs */
  getPendingPairs(): PendingPair[];
}

function broadcast(clients: Set<WebSocket>, message: string): void {
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message);
    }
  }
}

/**
 * Creates a broadcaster that fans out captured pairs to all connected WebSocket clients.
 * @returns Broadcaster
 */
export function createBroadcaster(): Broadcaster {
  const clients = new Set<WebSocket>();
  const history: HttpPair[] = [];
  const pendingMap = new Map<number, PendingPair>();

  return {
    addClient(ws: WebSocket): void {
      clients.add(ws);
    },
    removeClient(ws: WebSocket): void {
      clients.delete(ws);
    },
    sendPending(pending: PendingPair): void {
      pendingMap.set(pending.pairIndex, pending);
      broadcast(clients, JSON.stringify({ type: "pair-pending", data: pending }));
    },
    send(pair: HttpPair): void {
      pendingMap.delete(pair.pairIndex ?? -1);
      history.push(pair);
      broadcast(clients, JSON.stringify({ type: "pair", data: pair }));
    },
    sendAborted(record: AbortedRecord): void {
      pendingMap.delete(record.pairIndex);
      const abortedPair: HttpPair = {
        request: record.request,
        response: null,
        logged_at: record.logged_at,
        pairIndex: record.pairIndex,
        status: record.status,
      };
      history.push(abortedPair);
      broadcast(clients, JSON.stringify({ type: "pair", data: abortedPair }));
    },
    getPairs(): HttpPair[] {
      return [...history];
    },
    getPendingPairs(): PendingPair[] {
      return Array.from(pendingMap.values());
    },
  };
}
