import * as fs from "node:fs";
import * as http from "node:http";
import type * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

const TEST_DIR = path.join(os.tmpdir(), `cc-trace-e2e-${Date.now()}`);

process.env.CC_TRACE_DIR = path.join(TEST_DIR, "ca");

import { createBroadcaster } from "../../src/live-server/broadcaster.js";
import { startLiveServer } from "../../src/live-server/server.js";
import { createWriter } from "../../src/logger/jsonl-writer.js";
import { startSession } from "../../src/logger/session.js";
import { ensureCA } from "../../src/proxy/cert-manager.js";
import { startProxy } from "../../src/proxy/server.js";
import { generateHTML } from "../../src/report/html-generator.js";
import { parseHttpPairs } from "../../src/shared/conversation.js";
import type { HttpPair } from "../../src/shared/types.js";
import { startMockApi } from "./fixtures/mock-api.js";

beforeAll(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

interface RequestBody {
  model: string;
  max_tokens: number;
  stream?: boolean;
  system?: unknown;
  messages: Array<{ role: string; content: unknown }>;
}

/** Sends a single HTTPS request through the proxy to a target localhost server. */
async function sendThroughProxy(
  proxyPort: number,
  targetPort: number,
  body: RequestBody,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "CONNECT",
      path: `localhost:${targetPort}`,
    });

    req.on("connect", (_res: unknown, socket: net.Socket) => {
      const tlsSocket = tls.connect({
        socket,
        servername: "localhost",
        rejectUnauthorized: false,
      });

      tlsSocket.on("secureConnect", () => {
        tlsSocket.write(
          [
            "POST /v1/messages HTTP/1.1",
            "Host: localhost",
            "Content-Type: application/json",
            `Content-Length: ${Buffer.byteLength(bodyStr)}`,
            "Connection: close",
            "",
            bodyStr,
          ].join("\r\n"),
        );
      });

      tlsSocket.on("data", () => {});
      tlsSocket.on("end", resolve);
      tlsSocket.on("error", reject);
    });

    req.on("error", reject);
    req.end();
  });
}

const SYSTEM_BLOCKS = [
  { type: "text", text: "You are Claude Code", cache_control: { type: "ephemeral" } },
];

const TURN_1_INITIAL: RequestBody = {
  model: "claude-sonnet-4-6",
  max_tokens: 100,
  system: SYSTEM_BLOCKS,
  messages: [{ role: "user", content: "List files" }],
};

const TURN_2_TOOL_RESULT: RequestBody = {
  model: "claude-sonnet-4-6",
  max_tokens: 100,
  system: SYSTEM_BLOCKS,
  messages: [
    { role: "user", content: "List files" },
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "tu_1", name: "ls", input: { path: "." } }],
    },
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu_1", content: "file1\nfile2" }],
    },
  ],
};

const TURN_3_STREAMING: RequestBody = {
  model: "claude-sonnet-4-6",
  max_tokens: 100,
  stream: true,
  system: SYSTEM_BLOCKS,
  messages: [
    { role: "user", content: "List files" },
    { role: "assistant", content: "Done." },
    { role: "user", content: "Thanks" },
  ],
};

describe("full attach pipeline (E2E)", () => {
  it("captures JSON, SSE, and array-content pairs and produces a valid HTML report", async () => {
    const ca = ensureCA();
    const mockApi = await startMockApi();
    const targetPort = Number.parseInt(new URL(mockApi.url).port, 10);

    const proxy = await startProxy(0, ca, { rejectUnauthorized: false });
    const session = startSession({ outputDir: TEST_DIR, name: "e2e-pipeline" });
    const broadcaster = createBroadcaster();
    const writer = createWriter(session.jsonlPath);
    const captured: HttpPair[] = [];

    proxy.emitter.on("pair", (pair: HttpPair) => {
      const body = pair.request.body as { messages?: unknown[] } | null;
      const messageCount = body?.messages?.length ?? 0;
      // Mirror attach.ts logic: capture /v1/messages with >=1 messages
      if (pair.request.url.includes("/v1/messages") && messageCount >= 1) {
        writer.write(pair);
        broadcaster.send(pair);
        captured.push(pair);
      }
    });

    await sendThroughProxy(proxy.port, targetPort, TURN_1_INITIAL);
    await sendThroughProxy(proxy.port, targetPort, TURN_2_TOOL_RESULT);
    await sendThroughProxy(proxy.port, targetPort, TURN_3_STREAMING);

    writer.close();

    // All three requests should have been captured
    expect(captured).toHaveLength(3);

    // Turn 2: array-form tool_result content survives the round-trip without crashing
    const turn2 = captured[1];
    const turn2Body = turn2?.request.body as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(Array.isArray(turn2Body.messages[2]?.content)).toBe(true);

    // Turn 3: SSE response captured as body_raw
    const turn3 = captured[2];
    expect(turn3?.response?.body_raw).toContain("event: message_start");
    expect(turn3?.response?.body_raw).toContain("text_delta");
    expect(turn3?.response?.body).toBeNull();

    // Conversation grouping must not crash on array-form system or array user content
    const convos = parseHttpPairs(captured);
    expect(convos.length).toBeGreaterThanOrEqual(1);
    expect(convos.every((c) => c.model === "claude-sonnet-4-6")).toBe(true);

    // Generate HTML report and assert it is self-contained (data + bundle markers replaced)
    await generateHTML(session.jsonlPath, session.htmlPath);
    expect(fs.existsSync(session.htmlPath)).toBe(true);
    const html = fs.readFileSync(session.htmlPath, "utf-8");
    expect(html).not.toContain("__CC_TRACE_DATA__");
    expect(html).not.toContain("__CC_TRACE_TITLE__");
    expect(html).toContain('<div id="root"></div>');

    // When the frontend bundle is built, the StatsBlock container marker must
    // appear in the embedded JS (proves <StatsBlock> wired into the tree).
    const bundlePath = path.join(process.cwd(), "dist", "frontend", "index.js");
    if (fs.existsSync(bundlePath)) {
      expect(html).toContain("stats-block");
    }

    // US2: window.ccTraceMeta is embedded with the package.json version literal.
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
      version: string;
    };
    expect(html).toContain("window.ccTraceMeta");
    expect(html).toContain(`version: "${pkg.version}"`);

    await proxy.close();
    await mockApi.close();
  }, 30000);

  // Regression: a session that captures zero pairs (e.g. Claude exits before
  // issuing any API calls) must still seal a JSONL and generate a valid HTML
  // report — not crash with "JSONL file not found".
  it("produces JSONL + HTML even when no pairs are captured (empty session)", async () => {
    const session = startSession({ outputDir: TEST_DIR, name: "e2e-empty" });
    const writer = createWriter(session.jsonlPath);

    // Simulate Claude exiting immediately without any traffic.
    writer.close();

    expect(fs.existsSync(session.jsonlPath)).toBe(true);
    expect(fs.readFileSync(session.jsonlPath, "utf-8")).toBe("");

    await generateHTML(session.jsonlPath, session.htmlPath);
    expect(fs.existsSync(session.htmlPath)).toBe(true);
    const html = fs.readFileSync(session.htmlPath, "utf-8");
    expect(html).not.toContain("__CC_TRACE_DATA__");
    expect(html).not.toContain("__CC_TRACE_TITLE__");
    expect(html).toContain('<div id="root"></div>');
  });

  it("streams pairs to a connected WebSocket client in real time", async () => {
    const ca = ensureCA();
    const mockApi = await startMockApi();
    const targetPort = Number.parseInt(new URL(mockApi.url).port, 10);

    const proxy = await startProxy(0, ca, { rejectUnauthorized: false });
    const session = startSession({ outputDir: TEST_DIR, name: "e2e-ws" });
    const broadcaster = createBroadcaster();
    const liveServer = await startLiveServer(0, broadcaster, session);
    const writer = createWriter(session.jsonlPath);

    proxy.emitter.on("pair", (pair: HttpPair) => {
      writer.write(pair);
      broadcaster.send(pair);
    });

    const ws = new WebSocket(`ws://127.0.0.1:${liveServer.port}`);
    const received: Array<{ type: string }> = [];
    ws.on("message", (data: WebSocket.RawData) => {
      received.push(JSON.parse(data.toString()) as { type: string });
    });
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));

    await sendThroughProxy(proxy.port, targetPort, TURN_2_TOOL_RESULT);

    // Allow the broadcast to propagate
    await new Promise((r) => setTimeout(r, 150));

    expect(received.some((m) => m.type === "history")).toBe(true);
    expect(received.some((m) => m.type === "pair")).toBe(true);

    ws.close();
    writer.close();
    await proxy.close();
    await liveServer.close();
    await mockApi.close();
  }, 20000);
});
