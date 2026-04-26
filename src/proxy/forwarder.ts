import type * as http from "node:http";
import * as https from "node:https";
import * as zlib from "node:zlib";
import type { HttpPair } from "../shared/types.js";

const SENSITIVE = new Set(["authorization", "x-api-key", "cookie", "set-cookie"]);

/**
 * Decodes a response body buffer based on the upstream Content-Encoding header.
 * Falls back to the raw buffer if decoding fails or the encoding is unknown.
 * @param buf - concatenated raw response chunks as received from the upstream
 * @param encoding - lowercased Content-Encoding header value (e.g. "gzip")
 * @returns decoded buffer suitable for utf-8 decoding
 */
export function decodeBody(buf: Buffer, encoding: string): Buffer {
  try {
    if (encoding === "gzip") return zlib.gunzipSync(buf);
    if (encoding === "deflate") return zlib.inflateSync(buf);
    if (encoding === "br") return zlib.brotliDecompressSync(buf);
  } catch {
    /* fall through to raw bytes */
  }
  return buf;
}

/**
 * Redacts sensitive header values, keeping first 20 and last 4 characters.
 * @param headers - raw header map
 * @returns redacted header map safe for logging
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => {
      if (!SENSITIVE.has(k.toLowerCase())) return [k, v];
      if (v.length <= 8) return [k, "***"];
      return [k, `${v.slice(0, 20)}...${v.slice(-4)}`];
    }),
  );
}

function headersToRecord(raw: http.IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : (v as string)]),
  );
}

/**
 * Forwards a decrypted HTTP request to the upstream HTTPS host and returns the captured pair.
 * @param req - incoming HTTP request from the proxy TLS socket
 * @param res - outgoing HTTP response to send back to the client
 * @param hostname - upstream hostname (e.g. "api.anthropic.com")
 * @param port - upstream port (default 443)
 * @param rejectUnauthorized - whether to reject self-signed upstream certs (default true)
 * @returns Promise resolving to the captured HttpPair
 */
export function forwardRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  hostname: string,
  port: number,
  rejectUnauthorized = true,
): Promise<HttpPair> {
  return new Promise((resolve, reject) => {
    const requestTimestamp = Date.now() / 1000;

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("error", reject);

    req.on("end", () => {
      const bodyBuf = Buffer.concat(chunks);
      let requestBody: unknown = null;
      try {
        requestBody = JSON.parse(bodyBuf.toString("utf-8"));
      } catch {
        // non-JSON body stays null
      }

      const forwardOptions: https.RequestOptions = {
        hostname,
        port,
        path: req.url ?? "/",
        method: req.method ?? "GET",
        headers: { ...req.headers, host: hostname },
        rejectUnauthorized,
      };

      const upstreamReq = https.request(forwardOptions, (upstreamRes) => {
        const responseTimestamp = Date.now() / 1000;
        const isSSE = (upstreamRes.headers["content-type"] ?? "").includes("text/event-stream");

        const responseHeaders = headersToRecord(upstreamRes.headers);
        res.writeHead(upstreamRes.statusCode ?? 200, responseHeaders);

        const responseChunks: Buffer[] = [];
        upstreamRes.on("data", (chunk: Buffer) => {
          res.write(chunk);
          responseChunks.push(chunk);
        });

        upstreamRes.on("error", reject);

        upstreamRes.on("end", () => {
          res.end();
          const encoding = (upstreamRes.headers["content-encoding"] ?? "").toLowerCase();
          const decoded = decodeBody(Buffer.concat(responseChunks), encoding);
          const responseText = decoded.toString("utf-8");

          let parsedBody: unknown = null;
          let bodyRaw: string | null = null;

          if (isSSE) {
            bodyRaw = responseText;
          } else {
            try {
              parsedBody = JSON.parse(responseText);
            } catch {
              parsedBody = responseText || null;
            }
          }

          resolve({
            request: {
              timestamp: requestTimestamp,
              method: req.method ?? "GET",
              url: `https://${hostname}${req.url ?? "/"}`,
              headers: redactHeaders(headersToRecord(req.headers)),
              body: requestBody,
            },
            response: {
              timestamp: responseTimestamp,
              status_code: upstreamRes.statusCode ?? 0,
              headers: responseHeaders,
              body: parsedBody,
              body_raw: bodyRaw,
            },
            logged_at: new Date().toISOString(),
          });
        });
      });

      upstreamReq.on("error", reject);
      if (bodyBuf.length > 0) upstreamReq.write(bodyBuf);
      upstreamReq.end();
    });
  });
}
