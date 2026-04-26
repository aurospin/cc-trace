import * as fs from "node:fs";
import * as path from "node:path";
import type { ParsedArgs } from "../options.js";

/**
 * Scans the output directory for .jsonl files and lists session count.
 * Full AI-powered indexing is a future feature.
 * @param args - resolved CLI arguments
 */
export async function runIndex(args: ParsedArgs): Promise<void> {
  const dir = args.outputDir ?? path.join(process.cwd(), ".cc-trace");

  if (!fs.existsSync(dir)) {
    process.stderr.write(`Directory not found: ${dir}\n`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl") && f.startsWith("session-"));

  if (files.length === 0) {
    process.stdout.write("No session files found.\n");
    return;
  }

  process.stdout.write(`Found ${files.length} session(s). Indexing is not yet implemented.\n`);
  process.stdout.write("Run cc-trace attach to capture sessions first.\n");
}
