import * as fs from "node:fs";
import * as http from "node:http";
import type * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), `cc-trace-e2e-${Date.now()}`);

process.env.CC_TRACE_DIR = path.join(TEST_DIR, "ca");

import { createBroadcaster } from "../../src/live-server/broadcaster.js";
import { createWriter } from "../../src/logger/jsonl-writer.js";
import { startSession } from "../../src/logger/session.js";
import { ensureCA } from "../../src/proxy/cert-manager.js";
import { startProxy } from "../../src/proxy/server.js";
import type { HttpPair } from "../../src/shared/types.js";
import { startMockApi } from "./fixtures/mock-api.js";

beforeAll(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

/**
 * Simulates one HTTPS request through the proxy targeting a local server.
 * Uses HTTP CONNECT tunneling, then sends an HTTP POST over TLS.
 */
async function simulateRequest(
  proxyPort: number,
  targetPort: number,
  messageCount: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: Array.from({ length: messageCount }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `message ${i}`,
      })),
    });

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
            `Content-Length: ${Buffer.byteLength(body)}`,
            "Connection: close",
            "",
            body,
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

describe("full attach pipeline (E2E)", () => {
  it("captures pairs from simulated requests and writes JSONL", async () => {
    const ca = ensureCA();
    const mockApi = await startMockApi();
    const targetPort = Number.parseInt(new URL(mockApi.url).port, 10);

    const proxy = await startProxy(0, ca, { rejectUnauthorized: false });
    const session = startSession({ outputDir: TEST_DIR, name: "e2e-test" });
    const broadcaster = createBroadcaster();
    const writer = createWriter(session.jsonlPath);
    const captured: HttpPair[] = [];

    proxy.emitter.on("pair", (pair: HttpPair) => {
      const body = pair.request.body as { messages?: unknown[] } | null;
      if (pair.request.url.includes("/v1/messages") && (body?.messages?.length ?? 0) > 2) {
        writer.write(pair);
        broadcaster.send(pair);
        captured.push(pair);
      }
    });

    // Make 3 simulated requests: 2 with enough messages, 1 too short (filtered)
    await simulateRequest(proxy.port, targetPort, 4);
    await simulateRequest(proxy.port, targetPort, 4);
    await simulateRequest(proxy.port, targetPort, 1);

    writer.close();
    await proxy.close();
    await mockApi.close();

    // Assertions
    expect(fs.existsSync(session.jsonlPath)).toBe(true);
    expect(captured.length).toBeGreaterThanOrEqual(2);

    const lines = fs.readFileSync(session.jsonlPath, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const firstPair = JSON.parse(lines[0] ?? "") as HttpPair;
    expect(firstPair.request.method).toBe("POST");
    expect(firstPair.request.url).toContain("/v1/messages");
    expect(firstPair.response?.status_code).toBeDefined();
  }, 25000);
});
