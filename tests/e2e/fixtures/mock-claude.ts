#!/usr/bin/env npx tsx
/**
 * Simulates Claude Code making 3 HTTPS requests through the proxy then exiting.
 * Used in E2E tests as the --claude-path target.
 */
import * as http from "node:http";
import * as tls from "node:tls";

const PROXY = process.env.HTTPS_PROXY;

if (!PROXY) {
  process.stderr.write("mock-claude: HTTPS_PROXY not set\n");
  process.exit(1);
}

const withoutProtocol = PROXY.replace("http://", "");
const colonIdx = withoutProtocol.lastIndexOf(":");
const proxyHost = withoutProtocol.slice(0, colonIdx);
const proxyPort = Number.parseInt(withoutProtocol.slice(colonIdx + 1), 10);

async function makeRequest(urlPath: string, messageCount: number): Promise<void> {
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
      host: proxyHost,
      port: proxyPort,
      method: "CONNECT",
      path: "api.anthropic.com:443",
    });

    req.on("connect", (_res, socket) => {
      const tlsSocket = tls.connect({
        socket,
        servername: "api.anthropic.com",
        rejectUnauthorized: false,
      });

      tlsSocket.on("secureConnect", () => {
        tlsSocket.write(
          [
            `POST ${urlPath} HTTP/1.1`,
            "Host: api.anthropic.com",
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

(async () => {
  // 2 requests with enough messages to be logged, 1 too short (filtered by default)
  await makeRequest("/v1/messages", 4);
  await makeRequest("/v1/messages", 4);
  await makeRequest("/v1/messages", 1);
  process.exit(0);
})();
