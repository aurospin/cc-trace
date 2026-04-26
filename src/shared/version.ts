import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { isPackageJson } from "./guards.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PKG_PATH = path.join(__dirname, "..", "..", "package.json");

function readPkgVersion(): string {
  const parsed: unknown = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
  /* v8 ignore next 3 — Fail-loud guard against a malformed package.json; unreachable while the repo's own package.json ships with a string `version`. */
  if (!isPackageJson(parsed)) {
    throw new Error(`package.json at ${PKG_PATH} is missing a string "version" field`);
  }
  return parsed.version;
}

/**
 * Package version resolved from `package.json` once at module load.
 * Single source of truth for backend code that exposes the build version.
 */
export const PKG_VERSION: string = readPkgVersion();
