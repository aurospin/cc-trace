import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateHTML } from "../../src/report/html-generator.js";
import type { HttpPair } from "../../src/shared/types.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8"),
).version as string;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

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

  it("C-V-01: embeds window.ccTraceMeta with package version and ISO-8601 timestamp", async () => {
    const jsonlPath = path.join(TMP, "v01.jsonl");
    const htmlPath = path.join(TMP, "v01.html");
    fs.writeFileSync(jsonlPath, `${JSON.stringify(pair)}\n`, "utf-8");

    await generateHTML(jsonlPath, htmlPath);
    const html = fs.readFileSync(htmlPath, "utf-8");
    expect(html).toContain("window.ccTraceMeta");
    expect(html).toContain(`version: "${PKG_VERSION}"`);
    const m = html.match(/generatedAt:\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    expect((m as RegExpMatchArray)[1]).toMatch(ISO_REGEX);
  });

  it("C-V-02: two consecutive generations share version, timestamps may differ", async () => {
    const jsonlPath = path.join(TMP, "v02.jsonl");
    const out1 = path.join(TMP, "v02-a.html");
    const out2 = path.join(TMP, "v02-b.html");
    fs.writeFileSync(jsonlPath, `${JSON.stringify(pair)}\n`, "utf-8");

    await generateHTML(jsonlPath, out1);
    await new Promise((r) => setTimeout(r, 10));
    await generateHTML(jsonlPath, out2);

    const h1 = fs.readFileSync(out1, "utf-8");
    const h2 = fs.readFileSync(out2, "utf-8");
    expect(h1).toContain(`version: "${PKG_VERSION}"`);
    expect(h2).toContain(`version: "${PKG_VERSION}"`);
    const t1 = (h1.match(/generatedAt:\s*"([^"]+)"/) as RegExpMatchArray)[1];
    const t2 = (h2.match(/generatedAt:\s*"([^"]+)"/) as RegExpMatchArray)[1];
    expect(t1).toMatch(ISO_REGEX);
    expect(t2).toMatch(ISO_REGEX);
    // Timestamps may equal if generated in the same millisecond — only assert shape, not strict difference.
  });

  it("C-V-03: inline-fallback template (no template.html on disk) still embeds ccTraceMeta", async () => {
    const jsonlPath = path.join(TMP, "v03.jsonl");
    const htmlPath = path.join(TMP, "v03.html");
    fs.writeFileSync(jsonlPath, `${JSON.stringify(pair)}\n`, "utf-8");

    // Move the template aside to force the inline-fallback branch.
    const templatePath = path.join(__dirname, "..", "..", "dist", "report", "template.html");
    const backupPath = `${templatePath}.bak-v03`;
    const templateExists = fs.existsSync(templatePath);
    if (templateExists) fs.renameSync(templatePath, backupPath);
    try {
      await generateHTML(jsonlPath, htmlPath);
      const html = fs.readFileSync(htmlPath, "utf-8");
      expect(html).toContain("window.ccTraceMeta");
      expect(html).toContain(`version: "${PKG_VERSION}"`);
      expect(html).toMatch(/generatedAt:\s*"[^"]+"/);
    } finally {
      if (templateExists) fs.renameSync(backupPath, templatePath);
    }
  });

  // Regression: when Claude exits before issuing any API calls the JSONL file
  // is created (touched) but contains zero lines. The report must still
  // generate a valid self-contained HTML — no "JSONL file not found" error,
  // no missing template markers.
  it("produces a valid HTML report from an empty JSONL (no captured pairs)", async () => {
    const jsonlPath = path.join(TMP, "empty.jsonl");
    const htmlPath = path.join(TMP, "empty.html");
    fs.writeFileSync(jsonlPath, "", "utf-8");

    await generateHTML(jsonlPath, htmlPath);
    expect(fs.existsSync(htmlPath)).toBe(true);
    const html = fs.readFileSync(htmlPath, "utf-8");
    expect(html).toContain("window.ccTraceData");
    expect(html).not.toContain("__CC_TRACE_DATA__");
    expect(html).not.toContain("__CC_TRACE_TITLE__");
  });
});
