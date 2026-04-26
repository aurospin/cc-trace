import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateHTML } from "../../src/report/html-generator.js";
import type { HttpPair } from "../../src/shared/types.js";

const TMP = path.join(os.tmpdir(), `cc-trace-html-${Date.now()}`);

const pair: HttpPair = {
  request: {
    timestamp: 1,
    method: "POST",
    url: "https://api.anthropic.com/v1/messages",
    headers: {},
    body: { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] },
  },
  response: {
    timestamp: 2,
    status_code: 200,
    headers: {},
    body: { id: "msg_1", content: [{ type: "text", text: "Hello" }] },
    body_raw: null,
  },
  logged_at: "2026-04-26T00:00:00.000Z",
};

beforeEach(() => fs.mkdirSync(TMP, { recursive: true }));
afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe("html-generator", () => {
  it("generates an HTML file at the specified path", async () => {
    const jsonlPath = path.join(TMP, "test.jsonl");
    const htmlPath = path.join(TMP, "test.html");
    fs.writeFileSync(jsonlPath, `${JSON.stringify(pair)}\n`, "utf-8");

    await generateHTML(jsonlPath, htmlPath);
    expect(fs.existsSync(htmlPath)).toBe(true);
  });

  it("HTML file contains base64-encoded pair data", async () => {
    const jsonlPath = path.join(TMP, "test.jsonl");
    const htmlPath = path.join(TMP, "test.html");
    fs.writeFileSync(jsonlPath, `${JSON.stringify(pair)}\n`, "utf-8");

    await generateHTML(jsonlPath, htmlPath);
    const html = fs.readFileSync(htmlPath, "utf-8");
    expect(html).toContain("<script");
    expect(html).toContain("window.ccTraceData");
  });

  it("skips invalid JSON lines with a warning", async () => {
    const jsonlPath = path.join(TMP, "bad.jsonl");
    const htmlPath = path.join(TMP, "bad.html");
    fs.writeFileSync(jsonlPath, `NOT JSON\n${JSON.stringify(pair)}\n`, "utf-8");

    await generateHTML(jsonlPath, htmlPath);
    expect(fs.existsSync(htmlPath)).toBe(true);
  });

  it("throws if JSONL file does not exist", async () => {
    await expect(generateHTML("/nonexistent/path.jsonl", "/tmp/out.html")).rejects.toThrow();
  });
});
