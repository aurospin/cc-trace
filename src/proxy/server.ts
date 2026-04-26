import { EventEmitter } from "node:events";
import * as http from "node:http";
import type * as net from "node:net";
import * as tls from "node:tls";
import type { HttpPair } from "../shared/types.js";
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
  /** Emits 'pair' events for each captured request/response */
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
 * 'pair' events for each captured request/response.
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

  // Internal HTTP server handles decrypted traffic from TLS-terminated connections
  const interceptServer = http.createServer((req, res) => {
    const socket = req.socket as ProxySocket;
    const hostname = socket._proxyHostname ?? "unknown";
    const targetPort = socket._proxyPort ?? 443;

    forwardRequest(req, res, hostname, targetPort, rejectUnauthorized)
      .then((pair: HttpPair) => emitter.emit("pair", pair))
      .catch(() => {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end("Bad Gateway");
        }
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

  return new Promise((resolve, reject) => {
    proxyServer.listen(port, "127.0.0.1", () => {
      const addr = proxyServer.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        emitter,
        close: () =>
          new Promise<void>((res, rej) => proxyServer.close((err) => (err ? rej(err) : res()))),
      });
    });
    proxyServer.on("error", reject);
  });
}
