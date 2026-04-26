#!/usr/bin/env node
import { runAttach } from "./commands/attach.js";
import { runIndex } from "./commands/index-cmd.js";
import { runReport } from "./commands/report.js";
import { parseArgs } from "./options.js";

const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case "attach":
    runAttach(args).catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
    break;
  case "report":
    runReport(args).catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
    break;
  case "index":
    runIndex(args).catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
    break;
}
