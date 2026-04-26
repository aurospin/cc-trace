import * as zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeBody, redactHeaders } from "../../src/proxy/forwarder.js";

describe("forwarder — redactHeaders", () => {
  it("leaves non-sensitive headers unchanged", () => {
    const result = redactHeaders({ "content-type": "application/json" });
    expect(result["content-type"]).toBe("application/json");
  });

  it("redacts Authorization header", () => {
    const result = redactHeaders({ authorization: "Bearer sk-ant-api03-verylongsecretkey1234" });
    expect(result.authorization).not.toContain("verylongsecretkey");
    expect(result.authorization?.endsWith("1234")).toBe(true);
  });

  it("redacts x-api-key header", () => {
    const result = redactHeaders({ "x-api-key": "sk-ant-api03-anotherlongkey5678" });
    expect(result["x-api-key"]).not.toContain("anotherlongkey");
    expect(result["x-api-key"]?.endsWith("5678")).toBe(true);
  });

  it("handles short sensitive header values gracefully", () => {
    const result = redactHeaders({ authorization: "abc" });
    expect(typeof result.authorization).toBe("string");
  });

  it("preserves all header keys", () => {
    const headers = { "content-type": "application/json", authorization: "Bearer tok" };
    const result = redactHeaders(headers);
    expect(Object.keys(result)).toEqual(["content-type", "authorization"]);
  });
});

describe("forwarder — decodeBody", () => {
  const PAYLOAD = "hello cc-trace";

  it("decompresses gzip-encoded buffers", () => {
    const compressed = zlib.gzipSync(Buffer.from(PAYLOAD, "utf-8"));
    expect(decodeBody(compressed, "gzip").toString("utf-8")).toBe(PAYLOAD);
  });

  it("decompresses deflate-encoded buffers", () => {
    const compressed = zlib.deflateSync(Buffer.from(PAYLOAD, "utf-8"));
    expect(decodeBody(compressed, "deflate").toString("utf-8")).toBe(PAYLOAD);
  });

  it("decompresses brotli-encoded buffers", () => {
    const compressed = zlib.brotliCompressSync(Buffer.from(PAYLOAD, "utf-8"));
    expect(decodeBody(compressed, "br").toString("utf-8")).toBe(PAYLOAD);
  });

  it("returns the buffer unchanged for unknown encodings", () => {
    const raw = Buffer.from(PAYLOAD, "utf-8");
    expect(decodeBody(raw, "identity").toString("utf-8")).toBe(PAYLOAD);
  });

  it("returns the buffer unchanged for empty encoding", () => {
    const raw = Buffer.from(PAYLOAD, "utf-8");
    expect(decodeBody(raw, "").toString("utf-8")).toBe(PAYLOAD);
  });

  it("falls back to raw bytes when decompression fails", () => {
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(decodeBody(garbage, "gzip")).toEqual(garbage);
  });
});
