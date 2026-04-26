import { describe, expect, it } from "vitest";
import { formatForClipboard, formatJsonPath } from "../../src/frontend/jsonView/json-path.js";

describe("formatForClipboard", () => {
  it("C-J-01: object → pretty 2-space JSON with trailing newline", () => {
    expect(formatForClipboard({ a: 1, b: [2, 3] })).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n',
    );
  });

  it("C-J-02: array → pretty 2-space JSON with trailing newline", () => {
    expect(formatForClipboard([1, 2, 3])).toBe("[\n  1,\n  2,\n  3\n]\n");
  });

  it("C-J-03: string → raw value, no surrounding quotes", () => {
    expect(formatForClipboard("hello")).toBe("hello");
  });

  it("C-J-04: string with newline → preserved verbatim, no escape transformation", () => {
    expect(formatForClipboard("line\nbreak")).toBe("line\nbreak");
  });

  it("C-J-05: number → JSON literal", () => {
    expect(formatForClipboard(42)).toBe("42");
  });

  it("C-J-06: true → 'true'", () => {
    expect(formatForClipboard(true)).toBe("true");
  });

  it("C-J-07: false → 'false'", () => {
    expect(formatForClipboard(false)).toBe("false");
  });

  it("C-J-08: null → 'null'", () => {
    expect(formatForClipboard(null)).toBe("null");
  });

  it("C-J-09: empty object → '{}\\n'", () => {
    expect(formatForClipboard({})).toBe("{}\n");
  });

  it("C-J-10: empty array → '[]\\n'", () => {
    expect(formatForClipboard([])).toBe("[]\n");
  });

  it("undefined → 'undefined' (defensive fallback for non-JSON values)", () => {
    expect(formatForClipboard(undefined)).toBe("undefined");
  });
});

describe("formatJsonPath", () => {
  it("C-J-11: empty segments → '$'", () => {
    expect(formatJsonPath([])).toBe("$");
  });

  it("C-J-12: single key segment → bare key", () => {
    expect(formatJsonPath(["messages"])).toBe("messages");
  });

  it("C-J-13: key + index → 'key[idx]'", () => {
    expect(formatJsonPath(["messages", 0])).toBe("messages[0]");
  });

  it("C-J-14: nested keys + indexes", () => {
    expect(formatJsonPath(["messages", 0, "content", 1, "text"])).toBe(
      "messages[0].content[1].text",
    );
  });

  it("C-J-15: leading index → '[0]'", () => {
    expect(formatJsonPath([0])).toBe("[0]");
  });
});
