import * as fs from "node:fs";
import type { AbortedRecord, HttpPair } from "../shared/types.js";

export interface JsonlWriter {
  /** Append one completed pair as a JSON line */
  write(pair: HttpPair): void;
  /** Append an aborted pair record with response: null and status set */
  writeAborted(record: AbortedRecord): void;
  /** No-op for sync writer; here for interface compatibility */
  close(): void;
}

/**
 * Creates a writer that appends HttpPair records as JSON lines to the given file.
 * @param filePath - absolute path to the .jsonl file
 * @returns JsonlWriter
 */
export function createWriter(filePath: string): JsonlWriter {
  // Ensure the file exists immediately so downstream consumers (e.g. report
  // generation) succeed even when no pairs are captured.
  fs.appendFileSync(filePath, "", "utf-8");
  return {
    write(pair: HttpPair): void {
      if (pair.pairIndex !== undefined && pair.pairIndex < 1) {
        throw new Error(`jsonl-writer: pairIndex must be >= 1, got ${pair.pairIndex}`);
      }
      fs.appendFileSync(filePath, `${JSON.stringify(pair)}\n`, "utf-8");
    },
    writeAborted(record: AbortedRecord): void {
      if (record.pairIndex < 1) {
        throw new Error(`jsonl-writer: pairIndex must be >= 1, got ${record.pairIndex}`);
      }
      const entry = {
        request: record.request,
        response: null,
        logged_at: record.logged_at,
        pairIndex: record.pairIndex,
        status: record.status,
      };
      fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    },
    /* v8 ignore next */
    close(): void {
      // synchronous writes need no explicit flush
    },
  };
}
