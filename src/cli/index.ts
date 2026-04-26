#!/usr/bin/env node
import { runAttach } from "./commands/attach.js";
import { runReport } from "./commands/report.js";
import { CliHelpDisplayed, parseArgs } from "./options.js";

let args: ReturnType<typeof parseArgs>;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  // --help / --version printed cleanly: exit 0.
  // Any other parse error: Commander already wrote to stderr — just exit 1.
  process.exit(err instanceof CliHelpDisplayed ? 0 : 1);
}

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
}
