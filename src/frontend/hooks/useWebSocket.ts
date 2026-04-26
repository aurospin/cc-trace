import { useEffect, useState } from "react";

interface WsMessage<T> {
  type: string;
  data: T;
}

/**
 * Connects to the cc-trace WebSocket server and returns accumulated pairs.
 * Automatically reconnects on disconnect. When wsUrl is null, the hook is a no-op
 * (used by static HTML reports loaded via file://, where no live server exists).
 * @param wsUrl - WebSocket URL to connect to, or null to disable
 * @returns accumulated items received via WebSocket
 */
export function useWebSocket<T>(wsUrl: string | null): T[] {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    if (wsUrl === null) return;
    let ws: WebSocket;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(wsUrl as string);

      ws.onmessage = (event: MessageEvent<string>) => {
        const msg = JSON.parse(event.data) as WsMessage<T | T[]>;
        if (msg.type === "history") {
          setItems(msg.data as T[]);
        } else if (msg.type === "pair") {
          setItems((prev) => [...prev, msg.data as T]);
        }
      };

      ws.onclose = () => {
        if (!cancelled) setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [wsUrl]);

  return items;
}
