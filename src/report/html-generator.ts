import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { HttpPair } from "../shared/types.js";

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
    const line = lines[i];
    if (line === undefined) continue;
    try {
      pairs.push(JSON.parse(line) as HttpPair);
    } catch {
      process.stderr.write(`Warning: skipping invalid JSON on line ${i + 1}\n`);
    }
  }

  // Read template — fall back to inline minimal template if not built yet
  let template: string;
  if (fs.existsSync(TEMPLATE_PATH)) {
    template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  } else {
    template = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>cc-trace — __CC_TRACE_TITLE__</title><script>window.ccTraceData = JSON.parse(decodeURIComponent(escape(atob('__CC_TRACE_DATA__'))));</script></head><body><div id="root"></div><script>__CC_TRACE_BUNDLE__</script></body></html>`;
  }

  const dataB64 = Buffer.from(unescape(encodeURIComponent(JSON.stringify(pairs)))).toString(
    "base64",
  );

  let bundle = "";
  if (fs.existsSync(BUNDLE_PATH)) {
    bundle = fs.readFileSync(BUNDLE_PATH, "utf-8");
  }

  const title = path.basename(jsonlPath, ".jsonl");
  const html = template
    .split("__CC_TRACE_DATA__")
    .join(dataB64)
    .split("__CC_TRACE_BUNDLE__")
    .join(bundle)
    .split("__CC_TRACE_TITLE__")
    .join(title);

  fs.writeFileSync(outputPath, html, "utf-8");
}
