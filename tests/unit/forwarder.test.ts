import { describe, expect, it } from "vitest";
import { redactHeaders } from "../../src/proxy/forwarder.js";

describe("forwarder — redactHeaders", () => {
  it("leaves non-sensitive headers unchanged", () => {
    const result = redactHeaders({ "content-type": "application/json" });
    expect(result["content-type"]).toBe("application/json");
  });

  it("redacts Authorization header", () => {
    const result = redactHeaders({ authorization: "Bearer sk-ant-api03-verylongsecretkey1234" });
    expect(result.authorization).not.toContain("verylongsecretkey");
    expect(result.authorization?.endsWith("1234")).toBe(true);
  });

  it("redacts x-api-key header", () => {
    const result = redactHeaders({ "x-api-key": "sk-ant-api03-anotherlongkey5678" });
    expect(result["x-api-key"]).not.toContain("anotherlongkey");
    expect(result["x-api-key"]?.endsWith("5678")).toBe(true);
  });

  it("handles short sensitive header values gracefully", () => {
    const result = redactHeaders({ authorization: "abc" });
    expect(typeof result.authorization).toBe("string");
  });

  it("preserves all header keys", () => {
    const headers = { "content-type": "application/json", authorization: "Bearer tok" };
    const result = redactHeaders(headers);
    expect(Object.keys(result)).toEqual(["content-type", "authorization"]);
  });
});
