import { Command } from "commander";
import { isErrorWithCode } from "../shared/guards.js";
import { PKG_VERSION } from "../shared/version.js";

/**
 * Thrown by parseArgs when Commander has already printed --help or --version
 * output. The caller should exit 0 — there is no command to run.
 */
export class CliHelpDisplayed extends Error {
  constructor() {
    super("help displayed");
    this.name = "CliHelpDisplayed";
  }
}

export interface ParsedArgs {
  command: "attach" | "report";
  outputDir?: string;
  outputName?: string;
  livePort: number;
  conversationsOnly: boolean;
  openBrowser: boolean;
  claudePath?: string;
  claudeArgs: string[];
  jsonlPath?: string;
  reportOutput?: string;
}

/**
 * Extracts the --run-with trailing args from argv before Commander parsing.
 * Returns the args before --run-with and the captured run-with args separately.
 * @param argv - raw argument array
 * @returns tuple of [argsWithoutRunWith, runWithArgs]
 */
function extractRunWith(argv: string[]): [string[], string[]] {
  const idx = argv.indexOf("--run-with");
  if (idx === -1) {
    return [argv, []];
  }
  return [argv.slice(0, idx), argv.slice(idx + 1)];
}

/**
 * Parses CLI arguments into a structured ParsedArgs object.
 * @param argv - argument array (typically process.argv.slice(2))
 * @returns ParsedArgs with resolved command and options
 */
export function parseArgs(argv: string[]): ParsedArgs {
  // Treat bare `cc-trace` as `cc-trace attach` — attach is the primary use
  // case. Without this, Commander would print --help and exit.
  const normalized = argv.length === 0 ? ["attach"] : argv;
  const [filteredArgv, runWithArgs] = extractRunWith(normalized);

  let result: ParsedArgs = {
    command: "attach",
    livePort: 3000,
    conversationsOnly: false,
    openBrowser: true,
    claudeArgs: [],
  };

  const program = new Command();
  program.exitOverride(); // throw instead of process.exit in tests

  program
    .name("cc-trace")
    .description("MITM proxy logger for Claude Code API traffic")
    .version(PKG_VERSION, "-v, --version", "print version and exit");

  program
    .command("attach")
    .description(
      "capture a Claude Code session through the local MITM proxy (default if no command given)",
    )
    .option("--output-dir <dir>", "output directory for logs (default: .cc-trace/ in CWD)")
    .option("--port <number>", "live dashboard port", "3000")
    .option(
      "--conversations-only",
      "capture only multi-turn /v1/messages requests (default: capture all)",
    )
    .option("--no-open", "do not open the browser automatically")
    .option("--claude-path <path>", "path to the claude binary (default: resolved from PATH)")
    .option("--run-with <args...>", "forward all trailing args verbatim to claude (must be last)")
    .action(
      (opts: {
        outputDir?: string;
        port: string;
        conversationsOnly?: boolean;
        open: boolean;
        claudePath?: string;
      }) => {
        result = {
          command: "attach",
          ...(opts.outputDir !== undefined && { outputDir: opts.outputDir }),
          livePort: Number.parseInt(opts.port, 10),
          conversationsOnly: opts.conversationsOnly ?? false,
          openBrowser: opts.open,
          ...(opts.claudePath !== undefined && { claudePath: opts.claudePath }),
          claudeArgs: runWithArgs,
        };
      },
    );

  program
    .command("report <jsonlPath>")
    .description("convert an existing JSONL log into a self-contained HTML report")
    .option("--output <path>", "output HTML path (default: alongside input, .html extension)")
    .action((jsonlPath: string, opts: { output?: string }) => {
      result = {
        command: "report",
        livePort: 3000,
        conversationsOnly: false,
        openBrowser: false,
        claudeArgs: [],
        jsonlPath,
        ...(opts.output !== undefined && { reportOutput: opts.output }),
      };
    });

  try {
    program.parse(["node", "cc-trace", ...filteredArgv]);
  } catch (err) {
    // --help / --version: Commander has already printed output to stdout.
    // Signal the caller via a sentinel so it can exit 0 without running a
    // command. (Returning defaults here would silently fall through to attach.)
    const helpCodes = new Set(["commander.helpDisplayed", "commander.help", "commander.version"]);
    if (isErrorWithCode(err) && err.code !== undefined && helpCodes.has(err.code)) {
      throw new CliHelpDisplayed();
    }
    // Real input errors (unknown command/flag, missing arg) propagate so the
    // CLI entry exits non-zero with Commander's already-printed message.
    throw err;
  }

  return result;
}
