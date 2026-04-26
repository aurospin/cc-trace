import { Command } from "commander";

export interface ParsedArgs {
  command: "attach" | "report" | "index";
  outputDir?: string;
  outputName?: string;
  livePort: number;
  includeAllRequests: boolean;
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
  const [filteredArgv, runWithArgs] = extractRunWith(argv);

  let result: ParsedArgs = {
    command: "attach",
    livePort: 3000,
    includeAllRequests: false,
    openBrowser: true,
    claudeArgs: [],
  };

  const program = new Command();
  program.exitOverride(); // throw instead of process.exit in tests

  program
    .command("attach")
    .option("--output-dir <dir>", "output directory for logs")
    .option("--port <number>", "live server port", "3000")
    .option("--include-all-requests", "log all requests, not just conversations")
    .option("--no-open", "do not open browser automatically")
    .option("--claude-path <path>", "path to claude binary")
    .action(
      (opts: {
        outputDir?: string;
        port: string;
        includeAllRequests?: boolean;
        open: boolean;
        claudePath?: string;
      }) => {
        result = {
          command: "attach",
          ...(opts.outputDir !== undefined && { outputDir: opts.outputDir }),
          livePort: Number.parseInt(opts.port, 10),
          includeAllRequests: opts.includeAllRequests ?? false,
          openBrowser: opts.open,
          ...(opts.claudePath !== undefined && { claudePath: opts.claudePath }),
          claudeArgs: runWithArgs,
        };
      },
    );

  program
    .command("report <jsonlPath>")
    .option("--output <path>", "output HTML path")
    .action((jsonlPath: string, opts: { output?: string }) => {
      result = {
        command: "report",
        livePort: 3000,
        includeAllRequests: false,
        openBrowser: false,
        claudeArgs: [],
        jsonlPath,
        ...(opts.output !== undefined && { reportOutput: opts.output }),
      };
    });

  program
    .command("index")
    .option("--output-dir <dir>", "directory to scan for .jsonl files")
    .action((opts: { outputDir?: string }) => {
      result = {
        command: "index",
        livePort: 3000,
        includeAllRequests: false,
        openBrowser: false,
        claudeArgs: [],
        ...(opts.outputDir !== undefined && { outputDir: opts.outputDir }),
      };
    });

  try {
    program.parse(["node", "cc-trace", ...filteredArgv]);
  } catch {
    // Commander throws on --help or unknown commands; return defaults
  }

  return result;
}
