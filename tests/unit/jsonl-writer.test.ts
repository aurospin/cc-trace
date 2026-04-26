import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriter } from "../../src/logger/jsonl-writer.js";
import type { HttpPair } from "../../src/shared/types.js";

const TMP = path.join(os.tmpdir(), `cc-trace-writer-${Date.now()}`);

const makePair = (url: string): HttpPair => ({
  request: { timestamp: 1000, method: "POST", url, headers: {}, body: null },
  response: { timestamp: 1001, status_code: 200, headers: {}, body: { ok: true }, body_raw: null },
  logged_at: new Date().toISOString(),
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
});
