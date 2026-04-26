import * as fs from "node:fs";
import type { HttpPair } from "../shared/types.js";

export interface JsonlWriter {
  /** Append one pair as a JSON line */
  write(pair: HttpPair): void;
  /** No-op for sync writer; here for interface compatibility */
  close(): void;
}

/**
 * Creates a writer that appends HttpPair records as JSON lines to the given file.
 * @param filePath - absolute path to the .jsonl file
 * @returns JsonlWriter
 */
export function createWriter(filePath: string): JsonlWriter {
  return {
    write(pair: HttpPair): void {
      fs.appendFileSync(filePath, `${JSON.stringify(pair)}\n`, "utf-8");
    },
    /* v8 ignore next */
    close(): void {
      // synchronous writes need no explicit flush
    },
  };
}
