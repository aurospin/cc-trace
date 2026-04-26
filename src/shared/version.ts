import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PKG_PATH = path.join(__dirname, "..", "..", "package.json");

/**
 * Package version resolved from `package.json` once at module load.
 * Single source of truth for backend code that exposes the build version.
 */
export const PKG_VERSION: string = (
  JSON.parse(fs.readFileSync(PKG_PATH, "utf-8")) as { version: string }
).version;
