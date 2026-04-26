#!/usr/bin/env npx tsx
/**
 * Mock claude binary for E2E tests. Reads HTTPS_PROXY from env and makes a sequence of
 * requests that mirrors a real Claude Code session:
 *   1. Single user message (1 message — filtered by default)
 *   2. Tool-use turn: array-form tool_result content (3 messages — captured)
 *   3. Streaming request (3 messages, stream:true — captured, response is SSE)
 * Used by E2E tests as the --claude-path target.
 */
import * as http from "node:http";
import * as tls from "node:tls";

const PROXY = process.env.HTTPS_PROXY;
const TARGET_HOST = process.env.MOCK_TARGET_HOST ?? "api.anthropic.com";
const TARGET_PORT = Number.parseInt(process.env.MOCK_TARGET_PORT ?? "443", 10);

if (!PROXY) {
  process.stderr.write("mock-claude: HTTPS_PROXY not set\n");
  process.exit(1);
}

const withoutProtocol = PROXY.replace("http://", "");
const colonIdx = withoutProtocol.lastIndexOf(":");
const proxyHost = withoutProtocol.slice(0, colonIdx);
const proxyPort = Number.parseInt(withoutProtocol.slice(colonIdx + 1), 10);

interface RequestBody {
  model: string;
  max_tokens: number;
  stream?: boolean;
  system?: unknown;
  messages: Array<{ role: string; content: unknown }>;
}

async function makeRequest(urlPath: string, body: RequestBody): Promise<void> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = http.request({
      host: proxyHost,
      port: proxyPort,
      method: "CONNECT",
      path: `${TARGET_HOST}:${TARGET_PORT}`,
    });

    req.on("connect", (_res, socket) => {
      const tlsSocket = tls.connect({
        socket,
        servername: TARGET_HOST,
        rejectUnauthorized: false,
      });

      tlsSocket.on("secureConnect", () => {
        tlsSocket.write(
          [
            `POST ${urlPath} HTTP/1.1`,
            `Host: ${TARGET_HOST}`,
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

(async () => {
  // Turn 1: initial single-message request (filtered by messageCount<1, captured by includeAll)
  await makeRequest("/v1/messages", {
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    system: SYSTEM_BLOCKS,
    messages: [{ role: "user", content: "List files" }],
  });

  // Turn 2: tool-result with array-form content (real Claude Code shape)
  await makeRequest("/v1/messages", {
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
  });

  // Turn 3: streaming request — response is SSE (mock-api returns SSE when stream:true)
  await makeRequest("/v1/messages", {
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    stream: true,
    system: SYSTEM_BLOCKS,
    messages: [
      { role: "user", content: "List files" },
      { role: "assistant", content: "Done." },
      { role: "user", content: "Thanks" },
    ],
  });

  process.exit(0);
})();
