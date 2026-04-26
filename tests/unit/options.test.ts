import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/options.js";

describe("parseArgs", () => {
  it("attach subcommand sets command=attach", () => {
    const result = parseArgs(["attach"]);
    expect(result.command).toBe("attach");
  });

  it("report subcommand with file sets command=report and jsonlPath", () => {
    const result = parseArgs(["report", "session.jsonl"]);
    expect(result.command).toBe("report");
    expect(result.jsonlPath).toBe("session.jsonl");
  });

  it("report --output sets reportOutput", () => {
    const result = parseArgs(["report", "session.jsonl", "--output", "/tmp/out.html"]);
    expect(result.reportOutput).toBe("/tmp/out.html");
  });

  it("index subcommand sets command=index", () => {
    const result = parseArgs(["index"]);
    expect(result.command).toBe("index");
  });

  it("index --output-dir sets outputDir", () => {
    const result = parseArgs(["index", "--output-dir", "/tmp/traces"]);
    expect(result.outputDir).toBe("/tmp/traces");
  });

  it("--output-dir sets outputDir", () => {
    const result = parseArgs(["attach", "--output-dir", "/tmp/traces"]);
    expect(result.outputDir).toBe("/tmp/traces");
  });

  it("--port sets livePort", () => {
    const result = parseArgs(["attach", "--port", "4000"]);
    expect(result.livePort).toBe(4000);
  });

  it("--include-all-requests sets includeAllRequests", () => {
    const result = parseArgs(["attach", "--include-all-requests"]);
    expect(result.includeAllRequests).toBe(true);
  });

  it("--no-open sets openBrowser=false", () => {
    const result = parseArgs(["attach", "--no-open"]);
    expect(result.openBrowser).toBe(false);
  });

  it("--claude-path sets claudePath", () => {
    const result = parseArgs(["attach", "--claude-path", "/usr/local/bin/claude"]);
    expect(result.claudePath).toBe("/usr/local/bin/claude");
  });

  it("--run-with captures remaining args as claudeArgs", () => {
    const result = parseArgs(["attach", "--run-with", "chat", "--model", "claude-sonnet-4-6"]);
    expect(result.claudeArgs).toEqual(["chat", "--model", "claude-sonnet-4-6"]);
  });

  it("defaults: openBrowser=true, livePort=3000, includeAllRequests=false", () => {
    const result = parseArgs(["attach"]);
    expect(result.openBrowser).toBe(true);
    expect(result.livePort).toBe(3000);
    expect(result.includeAllRequests).toBe(false);
  });

  it("--help triggers Commander throw and returns defaults", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBe("attach");
  });
});
