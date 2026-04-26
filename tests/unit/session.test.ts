import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startSession } from "../../src/logger/session.js";

const TMP = path.join(os.tmpdir(), `cc-trace-session-${Date.now()}`);

describe("session", () => {
  afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("creates outputDir if it does not exist", () => {
    const dir = path.join(TMP, "newdir");
    startSession({ outputDir: dir });
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("returns jsonlPath and htmlPath inside outputDir", () => {
    const session = startSession({ outputDir: TMP });
    expect(session.jsonlPath.startsWith(TMP)).toBe(true);
    expect(session.htmlPath.startsWith(TMP)).toBe(true);
    expect(session.jsonlPath.endsWith(".jsonl")).toBe(true);
    expect(session.htmlPath.endsWith(".html")).toBe(true);
  });

  it("uses custom name when provided", () => {
    const session = startSession({ outputDir: TMP, name: "my-session" });
    expect(path.basename(session.jsonlPath)).toBe("my-session.jsonl");
    expect(path.basename(session.htmlPath)).toBe("my-session.html");
  });

  it("default name contains session- prefix", () => {
    const session = startSession({ outputDir: TMP });
    expect(path.basename(session.jsonlPath)).toMatch(/^session-/);
  });

  it("startedAt is a Date", () => {
    const session = startSession({ outputDir: TMP });
    expect(session.startedAt).toBeInstanceOf(Date);
  });
});
