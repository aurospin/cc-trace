import { describe, expect, it } from "vitest";
import { substituteTokens } from "../../src/shared/template.js";

describe("substituteTokens", () => {
  it("returns the template unchanged when the replacements map is empty", () => {
    const template = "hello __FOO__ world";
    expect(substituteTokens(template, {})).toBe("hello __FOO__ world");
  });

  it("substitutes a single token", () => {
    expect(substituteTokens("hello __NAME__", { __NAME__: "world" })).toBe("hello world");
  });

  it("substitutes multiple tokens", () => {
    const template = "__A__ + __B__ = __C__";
    const out = substituteTokens(template, { __A__: "1", __B__: "2", __C__: "3" });
    expect(out).toBe("1 + 2 = 3");
  });

  it("substitutes overlapping substrings without crosstalk (longer wins per pass)", () => {
    const template = "[__FOO__][__FOOBAR__]";
    const out = substituteTokens(template, {
      __FOOBAR__: "BAR",
      __FOO__: "FOO",
    });
    expect(out).toBe("[FOO][BAR]");
  });

  it("replaces every occurrence of a token", () => {
    expect(substituteTokens("__X__-__X__-__X__", { __X__: "y" })).toBe("y-y-y");
  });

  it("leaves unknown tokens untouched", () => {
    expect(substituteTokens("__KNOWN__ __OTHER__", { __KNOWN__: "ok" })).toBe("ok __OTHER__");
  });
});
