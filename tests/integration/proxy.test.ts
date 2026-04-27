import type { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import * as tls from "node:tls";
import forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), `cc-trace-proxy-test-${Date.now()}`);
process.env.CC_TRACE_DIR = TEST_DIR;

import { clearCertCache, ensureCA, getDomainCert } from "../../src/proxy/cert-manager.js";
import { startProxy } from "../../src/proxy/server.js";
import type { HttpPair } from "../../src/shared/types.js";

let targetServer: https.Server;
let targetPort: number;
let proxyInstance: { port: number; emitter: EventEmitter; close(): Promise<void> };

beforeAll(async () => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const ca = ensureCA();

  // Build a self-signed cert for the local target server
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  cert.setSubject([{ name: "commonName", value: "localhost" }]);
  cert.setIssuer([{ name: "commonName", value: "localhost" }]);
  cert.setExtensions([{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  targetServer = https.createServer(
    {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    },
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ hello: "world" }));
    },
  );

  await new Promise<void>((resolve) => targetServer.listen(0, resolve));
  targetPort = (targetServer.address() as { port: number }).port;

  proxyInstance = await startProxy(0, ca, { rejectUnauthorized: false });
}, 30000);

afterAll(async () => {
  await proxyInstance.close();
  await new Promise<void>((resolve) => targetServer.close(() => resolve()));
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

async function sendRequest(proxyPort: number, targetPort: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "CONNECT",
      path: `localhost:${targetPort}`,
    });

    req.on("connect", (_res, socket) => {
      const tlsSocket = tls.connect({
        socket,
        servername: "localhost",
        rejectUnauthorized: false,
      });

      tlsSocket.on("secureConnect", () => {
        tlsSocket.write("GET /test HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
      });

      tlsSocket.on("data", () => {});
      tlsSocket.on("end", () => resolve());
      tlsSocket.on("error", reject);
    });

    req.on("error", reject);
    req.end();
  });
}

describe("ensureCA", () => {
  it("reads existing CA from disk on second call (no regeneration)", () => {
    const first = ensureCA();
    const second = ensureCA();
    expect(second.cert).toBe(first.cert);
    expect(second.key).toBe(first.key);
    expect(second.certPath).toBe(first.certPath);
    expect(second.keyPath).toBe(first.keyPath);
  });

  it("clearCertCache forces new domain cert generation on next getDomainCert call", () => {
    const ca = ensureCA();
    const first = getDomainCert("test-clear.local", ca);
    clearCertCache();
    const second = getDomainCert("test-clear.local", ca);
    expect(second.cert).not.toBe(first.cert);
  });
});

describe("proxy server", () => {
  it("intercepts HTTPS CONNECT and emits an HttpPair", async () => {
    const pairPromise = new Promise<HttpPair>((resolve) => {
      proxyInstance.emitter.once("pair", resolve);
    });

    await sendRequest(proxyInstance.port, targetPort);

    const pair = await pairPromise;
    expect(pair.request.method).toBe("GET");
    expect(pair.request.url).toContain("localhost");
    expect(pair.response?.status_code).toBe(200);
    expect(pair.response?.body).toMatchObject({ hello: "world" });
  }, 10000);

  it("pair-pending fires synchronously before forwardRequest resolves", async () => {
    const pendingPromise = new Promise<{ pairIndex: number }>((resolve) => {
      proxyInstance.emitter.once("pair-pending", resolve);
    });
    const pairPromise = new Promise<HttpPair>((resolve) => {
      proxyInstance.emitter.once("pair", resolve);
    });

    const requestPromise = sendRequest(proxyInstance.port, targetPort);
    const pending = await pendingPromise;

    expect(typeof pending.pairIndex).toBe("number");
    expect(pending.pairIndex).toBeGreaterThanOrEqual(1);

    await requestPromise;
    const pair = await pairPromise;
    expect(pair.pairIndex).toBe(pending.pairIndex);
  }, 10000);

  it("pairIndex increments monotonically across multiple requests", async () => {
    const indices: number[] = [];
    const collect = (p: HttpPair) => indices.push(p.pairIndex ?? -1);
    proxyInstance.emitter.on("pair", collect);

    await sendRequest(proxyInstance.port, targetPort);
    await sendRequest(proxyInstance.port, targetPort);
    await sendRequest(proxyInstance.port, targetPort);

    proxyInstance.emitter.off("pair", collect);

    expect(indices).toHaveLength(3);
    const [a, b, c] = indices;
    if (a !== undefined && b !== undefined && c !== undefined) {
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
    }
  }, 15000);

  it("pair event carries the same pairIndex as its preceding pair-pending", async () => {
    const pendingIdx = await new Promise<number>((resolve) => {
      proxyInstance.emitter.once("pair-pending", (p: { pairIndex: number }) => {
        resolve(p.pairIndex);
      });
      sendRequest(proxyInstance.port, targetPort).catch(() => {});
    });

    const completedIdx = await new Promise<number>((resolve) => {
      proxyInstance.emitter.once("pair", (p: HttpPair) => resolve(p.pairIndex ?? -1));
    });

    expect(completedIdx).toBe(pendingIdx);
  }, 10000);
});
