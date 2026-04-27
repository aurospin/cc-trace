import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createBroadcaster } from "../../src/live-server/broadcaster.js";
import { startLiveServer } from "../../src/live-server/server.js";
import type { HttpPair, PendingPair, Session } from "../../src/shared/types.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8"),
).version as string;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const session: Session = {
  id: "test",
  startedAt: new Date(),
  jsonlPath: "/tmp/test.jsonl",
  htmlPath: "/tmp/test.html",
  outputDir: "/tmp",
};

const makePair = (pairIndex = 1): HttpPair => ({
  request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
  response: { timestamp: 2, status_code: 200, headers: {}, body: { ok: true }, body_raw: null },
  logged_at: new Date().toISOString(),
  pairIndex,
});

const makePending = (pairIndex = 1): PendingPair => ({
  pairIndex,
  request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
  startedAt: new Date().toISOString(),
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
  it("GET /api/pairs returns completed and pending arrays initially", async () => {
    const res = await fetch(`http://localhost:${liveServer.port}/api/pairs`);
    expect(res.ok).toBe(true);
    const data = (await res.json()) as { completed: unknown[]; pending: unknown[] };
    expect(Array.isArray(data.completed)).toBe(true);
    expect(Array.isArray(data.pending)).toBe(true);
    expect(data.completed).toHaveLength(0);
    expect(data.pending).toHaveLength(0);
  });

  it("GET /api/status returns session metadata", async () => {
    const res = await fetch(`http://localhost:${liveServer.port}/api/status`);
    const data = (await res.json()) as { id: string };
    expect(data.id).toBe("test");
  });

  it("C-V-04: GET /api/status includes version (matches package.json) and ISO startedAtIso", async () => {
    const res = await fetch(`http://localhost:${liveServer.port}/api/status`);
    const data = (await res.json()) as { version: string; startedAtIso: string };
    expect(data.version).toBe(PKG_VERSION);
    expect(data.startedAtIso).toMatch(ISO_REGEX);
  });

  it("C-V-05: restarting the live server advances startedAtIso", async () => {
    const res1 = await fetch(`http://localhost:${liveServer.port}/api/status`);
    const first = (await res1.json()) as { startedAtIso: string };

    // Wait long enough that the second startedAtIso is observably distinct.
    await new Promise((r) => setTimeout(r, 20));

    const broadcaster2 = createBroadcaster();
    const server2 = await startLiveServer(0, broadcaster2, session);
    try {
      const res2 = await fetch(`http://localhost:${server2.port}/api/status`);
      const second = (await res2.json()) as { startedAtIso: string };
      expect(second.startedAtIso).toMatch(ISO_REGEX);
      expect(new Date(second.startedAtIso).getTime()).toBeGreaterThan(
        new Date(first.startedAtIso).getTime(),
      );
    } finally {
      await server2.close();
    }
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

  it("WS client receives pair-pending before pair for the same pairIndex", async () => {
    const messages: Array<{ type: string; data: { pairIndex?: number } }> = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
      ws.on("message", (msg: Buffer) => {
        const payload = JSON.parse(msg.toString()) as {
          type: string;
          data: { pairIndex?: number };
        };
        if (payload.type === "pair-pending" || payload.type === "pair") {
          messages.push(payload);
          if (messages.length === 2) {
            ws.close();
            resolve();
          }
        }
      });
      ws.on("open", () => {
        broadcaster.sendPending(makePending(10));
        broadcaster.send(makePair(10));
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    expect(messages[0]?.type).toBe("pair-pending");
    expect(messages[0]?.data.pairIndex).toBe(10);
    expect(messages[1]?.type).toBe("pair");
    expect(messages[1]?.data.pairIndex).toBe(10);
  });

  it("pending row hydrates in place (same pairIndex in both messages)", async () => {
    const pendingMsg = await new Promise<{ type: string; data: { pairIndex?: number } }>(
      (resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
        ws.on("message", (msg: Buffer) => {
          const payload = JSON.parse(msg.toString()) as {
            type: string;
            data: { pairIndex?: number };
          };
          if (payload.type === "pair-pending") {
            ws.close();
            resolve(payload);
          }
        });
        ws.on("open", () => broadcaster.sendPending(makePending(20)));
        ws.on("error", reject);
        setTimeout(() => reject(new Error("timeout")), 3000);
      },
    );

    const pairMsg = await new Promise<{ type: string; data: { pairIndex?: number } }>(
      (resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
        ws.on("message", (msg: Buffer) => {
          const payload = JSON.parse(msg.toString()) as {
            type: string;
            data: { pairIndex?: number };
          };
          if (payload.type === "pair" && payload.data.pairIndex === 20) {
            ws.close();
            resolve(payload);
          }
        });
        ws.on("open", () => broadcaster.send(makePair(20)));
        ws.on("error", reject);
        setTimeout(() => reject(new Error("timeout")), 3000);
      },
    );

    expect(pendingMsg.data.pairIndex).toBe(pairMsg.data.pairIndex);
  });

  it("send() with no pairIndex falls back gracefully (removes -1 key from pendingMap)", async () => {
    const received = await new Promise<{ type: string; data: HttpPair }>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
      ws.on("message", (msg: Buffer) => {
        const payload = JSON.parse(msg.toString()) as { type: string; data: HttpPair };
        if (payload.type === "pair" && payload.data.request.url === "https://no-index.com") {
          ws.close();
          resolve(payload);
        }
      });
      ws.on("open", () => {
        const pairNoIndex: HttpPair = {
          request: {
            timestamp: 1,
            method: "GET",
            url: "https://no-index.com",
            headers: {},
            body: null,
          },
          response: { timestamp: 2, status_code: 200, headers: {}, body: null, body_raw: null },
          logged_at: new Date().toISOString(),
        };
        broadcaster.send(pairNoIndex);
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    expect(received.type).toBe("pair");
    expect(received.data.pairIndex).toBeUndefined();
  });

  it("sendAborted broadcasts pair with response: null and preserves status", async () => {
    const received = await new Promise<{ type: string; data: HttpPair }>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
      ws.on("message", (msg: Buffer) => {
        const payload = JSON.parse(msg.toString()) as { type: string; data: HttpPair };
        if (payload.type === "pair" && payload.data.pairIndex === 99) {
          ws.close();
          resolve(payload);
        }
      });
      ws.on("open", () => {
        broadcaster.sendAborted({
          pairIndex: 99,
          request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
          status: "aborted",
          logged_at: new Date().toISOString(),
        });
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    expect(received.type).toBe("pair");
    expect(received.data.pairIndex).toBe(99);
    expect(received.data.response).toBeNull();
    expect(received.data.status).toBe("aborted");
  });

  it("client connecting mid-session receives only completed pairs in history (no pending)", async () => {
    broadcaster.sendPending(makePending(30));
    broadcaster.send(makePair(31));

    const history = await new Promise<HttpPair[]>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${liveServer.port}`);
      ws.on("message", (msg: Buffer) => {
        const payload = JSON.parse(msg.toString()) as { type: string; data: HttpPair[] };
        if (payload.type === "history") {
          ws.close();
          resolve(payload.data);
        }
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });

    const indices = history.map((p) => p.pairIndex);
    expect(indices).not.toContain(30);
    expect(indices).toContain(31);
  });
});
