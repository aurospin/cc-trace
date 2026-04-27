import * as child_process from "node:child_process";
import { execSync } from "node:child_process";
import { createBroadcaster } from "../../live-server/broadcaster.js";
import { startLiveServer } from "../../live-server/server.js";
import { createWriter } from "../../logger/jsonl-writer.js";
import { startSession } from "../../logger/session.js";
import { ensureCA } from "../../proxy/cert-manager.js";
import { startProxy } from "../../proxy/server.js";
import { generateHTML } from "../../report/html-generator.js";
import { isMessagesBody } from "../../shared/guards.js";
import type { ParsedArgs } from "../options.js";

function findClaudePath(custom?: string): string {
  if (custom) return custom;
  try {
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    process.stderr.write(
      "Error: claude binary not found in PATH. Install Claude Code or use --claude-path.\n",
    );
    process.exit(1);
  }
}

function openBrowser(url: string): void {
  try {
    execSync(`open "${url}"`, { stdio: "ignore" });
  } catch {
    process.stdout.write(`Open your browser at: ${url}\n`);
  }
}

/**
 * Orchestrates a full cc-trace capture session:
 * starts proxy + live server, spawns claude, captures pairs, generates report on exit.
 * @param args - resolved CLI arguments
 */
export async function runAttach(args: ParsedArgs): Promise<void> {
  const ca = ensureCA();
  process.stdout.write(`CA certificate: ${ca.certPath}\n`);

  const proxy = await startProxy(0, ca);
  process.stdout.write(`Proxy listening on port ${proxy.port}\n`);

  const session = startSession({
    ...(args.outputDir !== undefined && { outputDir: args.outputDir }),
    ...(args.outputName !== undefined && { name: args.outputName }),
  });
  process.stdout.write(`\nLogs:\n  JSONL: ${session.jsonlPath}\n  HTML:  ${session.htmlPath}\n\n`);

  const broadcaster = createBroadcaster();
  const liveServer = await startLiveServer(args.livePort, broadcaster, session);
  process.stdout.write(`Live UI: http://localhost:${liveServer.port}\n`);

  if (args.openBrowser) {
    openBrowser(`http://localhost:${liveServer.port}`);
  }

  const writer = createWriter(session.jsonlPath);

  proxy.emitter.on("pair-pending", (pending) => {
    broadcaster.sendPending(pending);
  });

  proxy.emitter.on("pair", (pair) => {
    const messageCount = isMessagesBody(pair.request.body) ? pair.request.body.messages.length : 0;
    const isMessages = pair.request.url.includes("/v1/messages");
    const shouldLog = !args.conversationsOnly || (isMessages && messageCount >= 1);
    if (shouldLog) {
      writer.write(pair);
      process.stdout.write(
        `  [captured] ${pair.request.method} ${pair.request.url} (${messageCount} messages)\n`,
      );
    } else {
      process.stdout.write(
        `  [skipped]  ${pair.request.method} ${pair.request.url} (${messageCount} messages)\n`,
      );
    }
    broadcaster.send(pair);
  });

  proxy.emitter.on("pair-aborted", (record) => {
    writer.writeAborted(record);
    broadcaster.sendAborted(record);
    process.stdout.write(
      `  [aborted]  ${record.request.method} ${record.request.url} (pairIndex ${record.pairIndex})\n`,
    );
  });

  const claudePath = findClaudePath(args.claudePath);
  const claudeEnv = {
    ...process.env,
    HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`,
    NODE_EXTRA_CA_CERTS: ca.certPath,
  };

  await new Promise<void>((resolve) => {
    const child = child_process.spawn(claudePath, args.claudeArgs, {
      env: claudeEnv,
      stdio: "inherit",
      cwd: process.cwd(),
    });

    child.on("exit", (code) => {
      process.stdout.write(`\nClaude exited with code ${code ?? 0}\n`);
      resolve();
    });

    child.on("error", (err) => {
      process.stderr.write(`Failed to spawn claude: ${err.message}\n`);
      resolve();
    });
  });

  writer.close();
  process.stdout.write("Generating HTML report\u2026\n");
  await generateHTML(session.jsonlPath, session.htmlPath);
  process.stdout.write(`Report: ${session.htmlPath}\n`);

  if (args.openBrowser) {
    openBrowser(session.htmlPath);
  }

  await proxy.close();
  await liveServer.close();
}
