import { EventEmitter } from "node:events";
import * as http from "node:http";
import type * as net from "node:net";
import * as tls from "node:tls";
import type { HttpPair, PendingPair } from "../shared/types.js";
import type { CA } from "./cert-manager.js";
import { getDomainCert } from "./cert-manager.js";
import { forwardRequest } from "./forwarder.js";

/** Extended TLS socket that carries routing metadata set during CONNECT */
interface ProxySocket extends tls.TLSSocket {
  _proxyHostname?: string;
  _proxyPort?: number;
}

export interface ProxyServer {
  /** The TCP port the proxy is listening on */
  port: number;
  /** Emits 'pair-pending', 'pair', and 'pair-aborted' events for each captured request */
  emitter: EventEmitter;
  /** Gracefully close the proxy server */
  close(): Promise<void>;
}

/** Options for startProxy */
export interface StartProxyOptions {
  /** Whether to reject self-signed upstream TLS certs (default true) */
  rejectUnauthorized?: boolean;
}

/**
 * Starts an HTTP CONNECT proxy server that performs TLS termination and emits
 * 'pair-pending', 'pair', and 'pair-aborted' events for each captured request.
 * @param port - 0 for a random available port
 * @param ca - CA from ensureCA(), used to sign per-domain leaf certs
 * @param options - optional proxy configuration
 * @returns ProxyServer with port, emitter, and close()
 */
export function startProxy(
  port: number,
  ca: CA,
  options: StartProxyOptions = {},
): Promise<ProxyServer> {
  const { rejectUnauthorized = true } = options;
  const emitter = new EventEmitter();

  let pairCounter = 0;
  const pendingIndices = new Set<number>();

  // Internal HTTP server handles decrypted traffic from TLS-terminated connections
  const interceptServer = http.createServer((req, res) => {
    const socket = req.socket as ProxySocket;
    const hostname = socket._proxyHostname ?? "unknown";
    const targetPort = socket._proxyPort ?? 443;

    const pairIndex = ++pairCounter;
    const startedAt = new Date().toISOString();

    const capturedRequest: HttpPair["request"] = {
      timestamp: Date.now() / 1000,
      method: req.method ?? "GET",
      url: `https://${hostname}${req.url ?? "/"}`,
      headers: {},
      body: null,
    };

    const pendingPair: PendingPair = { pairIndex, request: capturedRequest, startedAt };
    pendingIndices.add(pairIndex);
    emitter.emit("pair-pending", pendingPair);

    forwardRequest(req, res, hostname, targetPort, rejectUnauthorized)
      .then((pair: HttpPair) => {
        pendingIndices.delete(pairIndex);
        const completedPair: HttpPair = { ...pair, pairIndex, status: "completed" };
        emitter.emit("pair", completedPair);
      })
      .catch(() => {
        pendingIndices.delete(pairIndex);
        if (!res.headersSent) {
          res.writeHead(502);
          res.end("Bad Gateway");
        }
        emitter.emit("pair-aborted", {
          pairIndex,
          request: capturedRequest,
          status: "aborted",
          logged_at: new Date().toISOString(),
        });
      });
  });

  const proxyServer = http.createServer();

  proxyServer.on("connect", (req: http.IncomingMessage, clientSocket: net.Socket) => {
    const [hostname = "", portStr = "443"] = (req.url ?? "").split(":");
    const targetPort = Number.parseInt(portStr, 10);

    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

    const domainCert = getDomainCert(hostname, ca);

    const tlsSocket: ProxySocket = new tls.TLSSocket(clientSocket, {
      isServer: true,
      key: domainCert.key,
      cert: domainCert.cert,
    });

    tlsSocket._proxyHostname = hostname;
    tlsSocket._proxyPort = targetPort;

    tlsSocket.on("secure", () => {
      interceptServer.emit("connection", tlsSocket);
    });

    tlsSocket.on("error", () => {
      /* ignore client-side disconnects */
    });
  });

  function flushPending(): void {
    for (const pairIndex of pendingIndices) {
      emitter.emit("pair-aborted", {
        pairIndex,
        request: {
          timestamp: Date.now() / 1000,
          method: "UNKNOWN",
          url: "",
          headers: {},
          body: null,
        },
        status: "aborted",
        logged_at: new Date().toISOString(),
      });
    }
    pendingIndices.clear();
  }

  return new Promise((resolve, reject) => {
    proxyServer.listen(port, "127.0.0.1", () => {
      const addr = proxyServer.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        emitter,
        close: () =>
          new Promise<void>((res, rej) => {
            flushPending();
            proxyServer.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    proxyServer.on("error", reject);
  });
}
