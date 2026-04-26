import * as https from "node:https";
import forge from "node-forge";

/**
 * Starts a local HTTPS server that returns Anthropic-shaped JSON responses.
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
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Hello from mock API" }],
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      );
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
