import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/options.js";

describe("parseArgs — defaults (no args)", () => {
  it("empty argv falls back to attach defaults", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("attach");
    expect(result.livePort).toBe(3000);
    expect(result.includeAllRequests).toBe(false);
    expect(result.openBrowser).toBe(true);
    expect(result.claudeArgs).toEqual([]);
    expect(result.outputDir).toBeUndefined();
    expect(result.claudePath).toBeUndefined();
    expect(result.jsonlPath).toBeUndefined();
    expect(result.reportOutput).toBeUndefined();
  });

  it("attach with no options sets command=attach with defaults", () => {
    const result = parseArgs(["attach"]);
    expect(result.command).toBe("attach");
    expect(result.livePort).toBe(3000);
    expect(result.includeAllRequests).toBe(false);
    expect(result.openBrowser).toBe(true);
    expect(result.outputDir).toBeUndefined();
    expect(result.claudePath).toBeUndefined();
    expect(result.claudeArgs).toEqual([]);
  });
});

describe("parseArgs — attach: --output-dir", () => {
  it("positive: --output-dir <path> sets outputDir", () => {
    const result = parseArgs(["attach", "--output-dir", "/tmp/traces"]);
    expect(result.outputDir).toBe("/tmp/traces");
  });

  it("positive: relative path is preserved verbatim", () => {
    const result = parseArgs(["attach", "--output-dir", "./logs"]);
    expect(result.outputDir).toBe("./logs");
  });

  it("positive: empty string value is preserved (no path validation)", () => {
    const result = parseArgs(["attach", "--output-dir", ""]);
    expect(result.outputDir).toBe("");
  });

  it("negative: option absent leaves outputDir undefined", () => {
    const result = parseArgs(["attach"]);
    expect(result.outputDir).toBeUndefined();
  });

  it("negative: --output-dir without a value throws in Commander → defaults returned", () => {
    const result = parseArgs(["attach", "--output-dir"]);
    expect(result.outputDir).toBeUndefined();
    expect(result.command).toBe("attach");
  });
});

describe("parseArgs — attach: --port", () => {
  it("positive: --port 4000 sets livePort=4000", () => {
    const result = parseArgs(["attach", "--port", "4000"]);
    expect(result.livePort).toBe(4000);
  });

  it("positive: --port 0 sets livePort=0 (random port)", () => {
    const result = parseArgs(["attach", "--port", "0"]);
    expect(result.livePort).toBe(0);
  });

  it("positive: --port 65535 sets livePort=65535 (max valid port)", () => {
    const result = parseArgs(["attach", "--port", "65535"]);
    expect(result.livePort).toBe(65535);
  });

  it("negative: option absent uses default livePort=3000", () => {
    const result = parseArgs(["attach"]);
    expect(result.livePort).toBe(3000);
  });

  it("negative: --port abc results in NaN (no validation today)", () => {
    const result = parseArgs(["attach", "--port", "abc"]);
    expect(Number.isNaN(result.livePort)).toBe(true);
  });

  it("negative: --port without value throws in Commander → defaults returned", () => {
    const result = parseArgs(["attach", "--port"]);
    expect(result.livePort).toBe(3000);
  });
});

describe("parseArgs — attach: --include-all-requests", () => {
  it("positive: flag present sets includeAllRequests=true", () => {
    const result = parseArgs(["attach", "--include-all-requests"]);
    expect(result.includeAllRequests).toBe(true);
  });

  it("negative: flag absent leaves includeAllRequests=false", () => {
    const result = parseArgs(["attach"]);
    expect(result.includeAllRequests).toBe(false);
  });
});

describe("parseArgs — attach: --no-open", () => {
  it("positive: --no-open sets openBrowser=false", () => {
    const result = parseArgs(["attach", "--no-open"]);
    expect(result.openBrowser).toBe(false);
  });

  it("negative: flag absent leaves openBrowser=true", () => {
    const result = parseArgs(["attach"]);
    expect(result.openBrowser).toBe(true);
  });
});

describe("parseArgs — attach: --claude-path", () => {
  it("positive: --claude-path absolute path is preserved", () => {
    const result = parseArgs(["attach", "--claude-path", "/usr/local/bin/claude"]);
    expect(result.claudePath).toBe("/usr/local/bin/claude");
  });

  it("positive: --claude-path with relative path is preserved", () => {
    const result = parseArgs(["attach", "--claude-path", "./claude"]);
    expect(result.claudePath).toBe("./claude");
  });

  it("negative: option absent leaves claudePath undefined", () => {
    const result = parseArgs(["attach"]);
    expect(result.claudePath).toBeUndefined();
  });

  it("negative: --claude-path without value throws in Commander → defaults returned", () => {
    const result = parseArgs(["attach", "--claude-path"]);
    expect(result.claudePath).toBeUndefined();
  });
});

describe("parseArgs — attach: --run-with", () => {
  it("positive: captures all trailing args verbatim", () => {
    const result = parseArgs(["attach", "--run-with", "chat", "--model", "claude-sonnet-4-6"]);
    expect(result.claudeArgs).toEqual(["chat", "--model", "claude-sonnet-4-6"]);
  });

  it("positive: trailing args may include flags that look like cc-trace flags", () => {
    const result = parseArgs(["attach", "--run-with", "--port", "9999"]);
    // --port 9999 is consumed by --run-with, not by cc-trace
    expect(result.claudeArgs).toEqual(["--port", "9999"]);
    expect(result.livePort).toBe(3000);
  });

  it("positive: --run-with with no trailing args yields empty claudeArgs", () => {
    const result = parseArgs(["attach", "--run-with"]);
    expect(result.claudeArgs).toEqual([]);
  });

  it("positive: cc-trace flags before --run-with are still parsed", () => {
    const result = parseArgs(["attach", "--port", "4000", "--no-open", "--run-with", "chat"]);
    expect(result.livePort).toBe(4000);
    expect(result.openBrowser).toBe(false);
    expect(result.claudeArgs).toEqual(["chat"]);
  });

  it("negative: --run-with absent leaves claudeArgs empty", () => {
    const result = parseArgs(["attach"]);
    expect(result.claudeArgs).toEqual([]);
  });
});

describe("parseArgs — attach: combinations", () => {
  it("positive: all attach options together produce coherent ParsedArgs", () => {
    const result = parseArgs([
      "attach",
      "--output-dir",
      "/tmp/o",
      "--port",
      "4321",
      "--include-all-requests",
      "--no-open",
      "--claude-path",
      "/bin/claude",
      "--run-with",
      "chat",
      "--debug",
    ]);
    expect(result.command).toBe("attach");
    expect(result.outputDir).toBe("/tmp/o");
    expect(result.livePort).toBe(4321);
    expect(result.includeAllRequests).toBe(true);
    expect(result.openBrowser).toBe(false);
    expect(result.claudePath).toBe("/bin/claude");
    expect(result.claudeArgs).toEqual(["chat", "--debug"]);
  });
});

describe("parseArgs — report subcommand", () => {
  it("positive: report <jsonlPath> sets command and jsonlPath", () => {
    const result = parseArgs(["report", "session.jsonl"]);
    expect(result.command).toBe("report");
    expect(result.jsonlPath).toBe("session.jsonl");
    expect(result.reportOutput).toBeUndefined();
  });

  it("positive: report --output sets reportOutput", () => {
    const result = parseArgs(["report", "session.jsonl", "--output", "/tmp/out.html"]);
    expect(result.reportOutput).toBe("/tmp/out.html");
    expect(result.jsonlPath).toBe("session.jsonl");
  });

  it("positive: report has openBrowser=false by default (different from attach)", () => {
    const result = parseArgs(["report", "session.jsonl"]);
    expect(result.openBrowser).toBe(false);
  });

  it("negative: report without jsonlPath fails parsing → defaults (command=attach)", () => {
    const result = parseArgs(["report"]);
    expect(result.command).toBe("attach");
    expect(result.jsonlPath).toBeUndefined();
  });

  it("negative: report --output without value throws → defaults", () => {
    const result = parseArgs(["report", "session.jsonl", "--output"]);
    expect(result.reportOutput).toBeUndefined();
  });
});

describe("parseArgs — index subcommand", () => {
  it("positive: index sets command=index", () => {
    const result = parseArgs(["index"]);
    expect(result.command).toBe("index");
    expect(result.outputDir).toBeUndefined();
  });

  it("positive: index --output-dir sets outputDir", () => {
    const result = parseArgs(["index", "--output-dir", "/tmp/traces"]);
    expect(result.command).toBe("index");
    expect(result.outputDir).toBe("/tmp/traces");
  });

  it("positive: index has openBrowser=false (different from attach)", () => {
    const result = parseArgs(["index"]);
    expect(result.openBrowser).toBe(false);
  });

  it("negative: index --output-dir without value throws → defaults", () => {
    const result = parseArgs(["index", "--output-dir"]);
    expect(result.command).toBe("attach");
  });
});

describe("parseArgs — error paths and edge cases", () => {
  it("negative: --help triggers Commander throw → defaults returned", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBe("attach");
  });

  it("negative: unknown command throws → defaults returned", () => {
    const result = parseArgs(["frobnicate"]);
    expect(result.command).toBe("attach");
  });

  it("negative: unknown flag on attach throws → defaults returned", () => {
    const result = parseArgs(["attach", "--unknown-flag"]);
    expect(result.command).toBe("attach");
    expect(result.outputDir).toBeUndefined();
  });

  it("negative: option from a different subcommand is rejected", () => {
    // --output is a `report` flag, not an `attach` flag
    const result = parseArgs(["attach", "--output", "x.html"]);
    expect(result.reportOutput).toBeUndefined();
  });
});
