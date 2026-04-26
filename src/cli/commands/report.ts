import { generateHTML } from "../../report/html-generator.js";
import type { ParsedArgs } from "../options.js";

/**
 * Generates an HTML report from an existing JSONL file.
 * @param args - resolved CLI arguments, must have jsonlPath set
 */
export async function runReport(args: ParsedArgs): Promise<void> {
  const jsonlPath = args.jsonlPath;
  if (!jsonlPath) {
    process.stderr.write("Error: jsonlPath is required for the report command\n");
    process.exit(1);
  }
  const outputPath = args.reportOutput ?? jsonlPath.replace(/\.jsonl$/, ".html");

  process.stdout.write(`Generating HTML from ${jsonlPath}\u2026\n`);
  await generateHTML(jsonlPath, outputPath);
  process.stdout.write(`Report written to ${outputPath}\n`);
}
