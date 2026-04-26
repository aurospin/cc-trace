import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateHTML } from "../../src/report/html-generator.js";

const BASELINE_BYTES = 862531;
const TOLERANCE = 0.02;
const FIXTURE = path.join(process.cwd(), "tests/e2e/fixtures/bundle-baseline.jsonl");
const TMP_DIR = path.join(os.tmpdir(), `cc-trace-bundle-size-${Date.now()}`);
const OUT = path.join(TMP_DIR, "baseline.html");

beforeAll(() => fs.mkdirSync(TMP_DIR, { recursive: true }));
afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

describe("HTML report bundle size (FR-011 / SC-006)", () => {
  it(`stays within ±${TOLERANCE * 100}% of ${BASELINE_BYTES} bytes`, async () => {
    await generateHTML(FIXTURE, OUT);
    const size = fs.statSync(OUT).size;
    const delta = Math.abs(size - BASELINE_BYTES) / BASELINE_BYTES;
    expect
      .soft(delta, `actual ${size} bytes vs baseline ${BASELINE_BYTES}`)
      .toBeLessThanOrEqual(TOLERANCE);
    expect(delta).toBeLessThanOrEqual(TOLERANCE);
  });
});
