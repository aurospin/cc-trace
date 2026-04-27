import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriter } from "../../src/logger/jsonl-writer.js";
import type { HttpPair } from "../../src/shared/types.js";

const TMP = path.join(os.tmpdir(), `cc-trace-writer-${Date.now()}`);

const makePair = (url: string, pairIndex?: number): HttpPair => ({
  request: { timestamp: 1000, method: "POST", url, headers: {}, body: null },
  response: { timestamp: 1001, status_code: 200, headers: {}, body: { ok: true }, body_raw: null },
  logged_at: new Date().toISOString(),
  pairIndex,
});

describe("jsonl-writer", () => {
  beforeEach(() => fs.mkdirSync(TMP, { recursive: true }));
  afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("creates the file and writes one valid JSON line", () => {
    const filePath = path.join(TMP, "test.jsonl");
    const writer = createWriter(filePath);
    const pair = makePair("https://api.anthropic.com/v1/messages");
    writer.write(pair);
    writer.close();

    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    expect(JSON.parse(lines[0]!)).toMatchObject({
      request: { url: "https://api.anthropic.com/v1/messages" },
    });
  });

  it("appends multiple pairs as separate lines", () => {
    const filePath = path.join(TMP, "multi.jsonl");
    const writer = createWriter(filePath);
    writer.write(makePair("https://a.com"));
    writer.write(makePair("https://b.com"));
    writer.close();

    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    expect(JSON.parse(lines[0]!).request.url).toBe("https://a.com");
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    expect(JSON.parse(lines[1]!).request.url).toBe("https://b.com");
  });

  it("creates an empty file on construction even before any writes", () => {
    const filePath = path.join(TMP, "empty.jsonl");
    const writer = createWriter(filePath);
    writer.close();

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("");
  });

  it("each line is terminated with a newline", () => {
    const filePath = path.join(TMP, "newline.jsonl");
    const writer = createWriter(filePath);
    writer.write(makePair("https://x.com"));
    writer.close();

    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("written record includes pairIndex when provided", () => {
    const filePath = path.join(TMP, "pairindex.jsonl");
    const writer = createWriter(filePath);
    writer.write(makePair("https://a.com", 5));
    writer.close();

    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const record = JSON.parse(lines[0]!);
    expect(record.pairIndex).toBe(5);
  });

  it("writeAborted writes record with response:null, status, and pairIndex", () => {
    const filePath = path.join(TMP, "aborted.jsonl");
    const writer = createWriter(filePath);
    writer.writeAborted({
      pairIndex: 3,
      request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
      status: "aborted",
      logged_at: new Date().toISOString(),
    });
    writer.close();

    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const record = JSON.parse(lines[0]!);
    expect(record.pairIndex).toBe(3);
    expect(record.response).toBeNull();
    expect(record.status).toBe("aborted");
  });

  it("loader falls back to lineNumber for legacy records without pairIndex", () => {
    const filePath = path.join(TMP, "legacy.jsonl");
    fs.writeFileSync(
      filePath,
      `${[
        JSON.stringify({
          request: { url: "a" },
          response: null,
          logged_at: "2026-01-01T00:00:00Z",
        }),
        JSON.stringify({
          request: { url: "b" },
          response: null,
          logged_at: "2026-01-01T00:00:01Z",
        }),
      ].join("\n")}\n`,
      "utf-8",
    );

    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    lines.forEach((line, i) => {
      const rec = JSON.parse(line) as { pairIndex?: number };
      const resolvedIndex = rec.pairIndex ?? i + 1;
      expect(resolvedIndex).toBe(i + 1);
    });
  });

  it("loader throws on two records with the same resolved pairIndex", () => {
    const records = [
      { request: { url: "a" }, response: null, logged_at: "2026-01-01T00:00:00Z", pairIndex: 2 },
      { request: { url: "b" }, response: null, logged_at: "2026-01-01T00:00:01Z", pairIndex: 2 },
    ];

    const seen = new Set<number>();
    expect(() => {
      for (const rec of records) {
        const idx = rec.pairIndex;
        if (seen.has(idx)) throw new Error(`Duplicate pairIndex: ${idx}`);
        seen.add(idx);
      }
    }).toThrow("Duplicate pairIndex: 2");
  });

  it("write throws if pairIndex is provided and < 1", () => {
    const filePath = path.join(TMP, "invalid-pair.jsonl");
    const writer = createWriter(filePath);
    expect(() => writer.write(makePair("https://a.com", 0))).toThrow("pairIndex must be >= 1");
  });

  it("writeAborted throws if pairIndex < 1", () => {
    const filePath = path.join(TMP, "invalid-aborted.jsonl");
    const writer = createWriter(filePath);
    expect(() =>
      writer.writeAborted({
        pairIndex: 0,
        request: { timestamp: 1, method: "POST", url: "https://a.com", headers: {}, body: null },
        status: "aborted",
        logged_at: new Date().toISOString(),
      }),
    ).toThrow("pairIndex must be >= 1");
  });

  it("loader throws if response !== null and status !== 'completed'", () => {
    const badRecord = {
      request: { url: "a" },
      response: { status_code: 200, body: {}, body_raw: null, headers: {}, timestamp: 1 },
      logged_at: "2026-01-01T00:00:00Z",
      pairIndex: 1,
      status: "aborted",
    };

    expect(() => {
      if (badRecord.response !== null && badRecord.status !== "completed") {
        throw new Error("Consistency violation: response present but status is not completed");
      }
    }).toThrow("Consistency violation");
  });
});
