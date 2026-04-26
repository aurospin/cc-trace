import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "../shared/types.js";

export interface SessionOpts {
  /** Defaults to .cc-trace/ in process.cwd() */
  outputDir?: string;
  /** Defaults to session-YYYY-MM-DD-HH-MM-SS */
  name?: string;
}

/**
 * Starts a new capture session by resolving output paths and creating the output directory.
 * @param opts - optional outputDir and session name
 * @returns Session with resolved paths
 */
export function startSession(opts: SessionOpts = {}): Session {
  const outputDir = opts.outputDir ?? path.join(process.cwd(), ".cc-trace");
  fs.mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace("T", "-").replace(/:/g, "-").slice(0, 19);
  const baseName = opts.name ?? `session-${ts}`;

  return {
    id: baseName,
    startedAt: now,
    jsonlPath: path.join(outputDir, `${baseName}.jsonl`),
    htmlPath: path.join(outputDir, `${baseName}.html`),
    outputDir,
  };
}
