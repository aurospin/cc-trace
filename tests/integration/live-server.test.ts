import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createBroadcaster } from "../../src/live-server/broadcaster.js";
import { startLiveServer } from "../../src/live-server/server.js";
import type { HttpPair, Session } from "../../src/shared/types.js";

const session: Session = {
  id: "test",
  startedAt: new Date(),
  jsonlPath: "/tmp/test.jsonl",
  htmlPath: "/tmp/test.html",
  outputDir: "/tmp",
};

const makePair = (): HttpPair => ({
  request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
  response: { timestamp: 2, status_code: 200, headers: {}, body: { ok: true }, body_raw: null },
  logged_at: new Date().toISOString(),
});

let liveServer: { port: number; close(): Promise<void> };
let broadcaster: ReturnType<typeof createBroadcaster>;

beforeAll(async () => {
  broadcaster = createBroadcaster();
  liveServer = await startLiveServer(0, broadcaster, session);
});

afterAll(async () => {
  await liveServer.close();
});

describe("live server", () => {
  it("GET /api/pairs returns empty array initially", async () => {
    const res = await fetch(`http://localhost:${liveServer.port}/api/pairs`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it("GET /api/status returns session metadata", async () => {
    const res = await fetch(`http://localhost:${liveServer.port}/api/status`);
    const data = (await res.json()) as { id: string };
    expect(data.id).toBe("test");
  });

  it("WebSocket receives pair pushed via broadcaster", async () => {
    const received = await new Promise<unknown>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
      ws.on("message", (msg: Buffer) => {
        const payload = JSON.parse(msg.toString()) as { type: string };
        if (payload.type === "pair") {
          ws.close();
          resolve(payload);
        }
      });
      ws.on("open", () => broadcaster.send(makePair()));
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    expect((received as { type: string }).type).toBe("pair");
  });
});
