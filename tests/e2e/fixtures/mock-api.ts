import * as https from "node:https";
import forge from "node-forge";

/** SSE event sequence emulating an Anthropic streaming response with one text block */
const SSE_RESPONSE = [
  `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream","role":"assistant","model":"claude-sonnet-4-6","content":[],"usage":{"input_tokens":12,"output_tokens":0}}}`,
  `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
  `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}`,
  `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world"}}`,
  `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}`,
  `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}`,
  `event: message_stop\ndata: {"type":"message_stop"}`,
  "",
].join("\n\n");

const JSON_RESPONSE = JSON.stringify({
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello from mock API" }],
  model: "claude-sonnet-4-6",
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
});

/**
 * Starts a local HTTPS server that returns Anthropic-shaped responses.
 * If the request body has `"stream": true`, returns SSE; otherwise returns JSON.
 * @returns server URL and close function
 */
export async function startMockApi(): Promise<{ url: string; close(): Promise<void> }> {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "10";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  cert.setSubject([{ name: "commonName", value: "localhost" }]);
  cert.setIssuer([{ name: "commonName", value: "localhost" }]);
  cert.setExtensions([{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const server = https.createServer(
    {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    },
    (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        let stream = false;
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
            stream?: boolean;
          };
          stream = parsed.stream === true;
        } catch {
          /* fall through to JSON response */
        }
        if (stream) {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.end(SSE_RESPONSE);
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON_RESPONSE);
        }
      });
    },
  );

  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      resolve({
        url: `https://localhost:${port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
