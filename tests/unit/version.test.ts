import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { PKG_VERSION } from "../../src/shared/version.js";

describe("PKG_VERSION", () => {
  it("matches package.json version at module load", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
      version: string;
    };
    expect(PKG_VERSION).toBe(pkg.version);
  });

  it("is a non-empty string", () => {
    expect(typeof PKG_VERSION).toBe("string");
    expect(PKG_VERSION.length).toBeGreaterThan(0);
  });
});
