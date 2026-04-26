import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import * as url from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import type { Session } from "../shared/types.js";
import type { Broadcaster } from "./broadcaster.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, "..", "..", "dist", "frontend");

export interface LiveServer {
  /** The TCP port the server is listening on */
  port: number;
  /** Gracefully shut down the server */
  close(): Promise<void>;
}

/**
 * Starts an Express + WebSocket server that serves the React UI and streams pairs in real time.
 * @param port - TCP port (0 for random)
 * @param broadcaster - receives pairs to push to WebSocket clients
 * @param session - current session metadata for /api/status
 * @returns LiveServer with port and close()
 */
export function startLiveServer(
  port: number,
  broadcaster: Broadcaster,
  session: Session,
): Promise<LiveServer> {
  const app = express();

  if (fs.existsSync(FRONTEND_DIR)) {
    app.use(express.static(FRONTEND_DIR));
  }

  app.get("/api/pairs", (_req, res) => {
    res.json(broadcaster.getPairs());
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      pairCount: broadcaster.getPairs().length,
      jsonlPath: session.jsonlPath,
      htmlPath: session.htmlPath,
    });
  });

  if (fs.existsSync(path.join(FRONTEND_DIR, "index.html"))) {
    app.get("*", (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIR, "index.html"));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    broadcaster.addClient(ws);
    ws.send(JSON.stringify({ type: "history", data: broadcaster.getPairs() }));
    ws.on("close", () => broadcaster.removeClient(ws));
    ws.on("error", () => broadcaster.removeClient(ws));
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
    server.on("error", reject);
  });
}
