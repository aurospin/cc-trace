import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { HttpPair } from "../shared/types.js";
import { PKG_VERSION } from "../shared/version.js";
import { substituteTokens } from "./template.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "template.html");
const BUNDLE_PATH = path.join(__dirname, "..", "..", "dist", "frontend", "index.js");

/**
 * Generates a self-contained HTML report from a JSONL log file.
 * Skips invalid JSON lines with a warning to stderr. Embeds all data and JS in one file.
 * @param jsonlPath - path to the .jsonl session log
 * @param outputPath - path to write the .html report
 */
export async function generateHTML(jsonlPath: string, outputPath: string): Promise<void> {
  if (!fs.existsSync(jsonlPath)) {
    throw new Error(`JSONL file not found: ${jsonlPath}`);
  }

  const lines = fs.readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean);
  const pairs: HttpPair[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      pairs.push(JSON.parse(lines[i] as string) as HttpPair);
    } catch {
      process.stderr.write(`Warning: skipping invalid JSON on line ${i + 1}\n`);
    }
  }

  // Read template — fall back to inline minimal template if not built yet
  let template: string;
  if (fs.existsSync(TEMPLATE_PATH)) {
    template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    /* v8 ignore next 3 */
  } else {
    template = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>cc-trace — __CC_TRACE_TITLE__</title><script>window.ccTraceData = JSON.parse(decodeURIComponent(escape(atob('__CC_TRACE_DATA__'))));</script><script>window.ccTraceMeta = { version: "__CC_TRACE_VERSION__", generatedAt: "__CC_TRACE_GENERATED_AT__" };</script></head><body><div id="root"></div><script>__CC_TRACE_BUNDLE__</script></body></html>`;
  }

  const dataB64 = Buffer.from(unescape(encodeURIComponent(JSON.stringify(pairs)))).toString(
    "base64",
  );

  let bundle = "";
  if (fs.existsSync(BUNDLE_PATH)) {
    bundle = fs.readFileSync(BUNDLE_PATH, "utf-8");
  }

  const title = path.basename(jsonlPath, ".jsonl");
  const generatedAt = new Date().toISOString();
  const html = substituteTokens(template, {
    __CC_TRACE_DATA__: dataB64,
    __CC_TRACE_BUNDLE__: bundle,
    __CC_TRACE_TITLE__: title,
    __CC_TRACE_VERSION__: PKG_VERSION,
    __CC_TRACE_GENERATED_AT__: generatedAt,
  });

  fs.writeFileSync(outputPath, html, "utf-8");
}
