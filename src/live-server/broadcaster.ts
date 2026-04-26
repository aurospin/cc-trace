import type WebSocket from "ws";
import type { HttpPair } from "../shared/types.js";

export interface Broadcaster {
  /** Register a new WebSocket client */
  addClient(ws: WebSocket): void;
  /** Unregister a WebSocket client */
  removeClient(ws: WebSocket): void;
  /** Send a pair to all OPEN clients and store in history */
  send(pair: HttpPair): void;
  /** Returns all pairs sent so far, for page-reload recovery */
  getPairs(): HttpPair[];
}

/**
 * Creates a broadcaster that fans out captured pairs to all connected WebSocket clients.
 * @returns Broadcaster
 */
export function createBroadcaster(): Broadcaster {
  const clients = new Set<WebSocket>();
  const history: HttpPair[] = [];

  return {
    addClient(ws: WebSocket): void {
      clients.add(ws);
    },
    removeClient(ws: WebSocket): void {
      clients.delete(ws);
    },
    send(pair: HttpPair): void {
      history.push(pair);
      const message = JSON.stringify({ type: "pair", data: pair });
      for (const client of clients) {
        if (client.readyState === 1 /* OPEN */) {
          client.send(message);
        }
      }
    },
    getPairs(): HttpPair[] {
      return [...history];
    },
  };
}
