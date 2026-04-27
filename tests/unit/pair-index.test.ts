import { describe, expect, it } from "vitest";
import { formatPairLabel, padWidth } from "../../src/shared/pair-index.js";

describe("padWidth", () => {
  it("returns 2 for indices 1–9", () => {
    for (const n of [1, 5, 9]) {
      expect(padWidth(n)).toBe(2);
    }
  });

  it("returns 2 for indices 10–99", () => {
    for (const n of [10, 50, 99]) {
      expect(padWidth(n)).toBe(2);
    }
  });

  it("returns 3 for indices 100–999", () => {
    for (const n of [100, 500, 999]) {
      expect(padWidth(n)).toBe(3);
    }
  });

  it("returns 4 for indices 1000–9999", () => {
    for (const n of [1000, 5000, 9999]) {
      expect(padWidth(n)).toBe(4);
    }
  });

  it("throws for highestIndex < 1", () => {
    expect(() => padWidth(0)).toThrow("must be >= 1");
    expect(() => padWidth(-5)).toThrow("must be >= 1");
  });
});

describe("formatPairLabel", () => {
  it("formats Turn label with width 2", () => {
    expect(formatPairLabel("Turn", 3, 2)).toBe("Turn 03");
  });

  it("formats Pair label with width 3", () => {
    expect(formatPairLabel("Pair", 42, 3)).toBe("Pair 042");
  });

  it("formats label with exact width match", () => {
    expect(formatPairLabel("Turn", 99, 2)).toBe("Turn 99");
    expect(formatPairLabel("Pair", 100, 3)).toBe("Pair 100");
  });

  it("throws for idx < 1", () => {
    expect(() => formatPairLabel("Turn", 0, 2)).toThrow("idx must be >= 1");
    expect(() => formatPairLabel("Pair", -1, 2)).toThrow("idx must be >= 1");
  });

  it("throws for width < 2", () => {
    expect(() => formatPairLabel("Turn", 1, 1)).toThrow("width must be >= 2");
    expect(() => formatPairLabel("Pair", 1, 0)).toThrow("width must be >= 2");
  });
});
