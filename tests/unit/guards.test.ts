import { describe, expect, it } from "vitest";
import {
  isAddressInfo,
  isContentBody,
  isErrorWithCode,
  isHttpPair,
  isHttpPairArray,
  isMessagesBody,
  isModelBody,
  isPackageJson,
  isPairWsFrame,
  isPendingPair,
  isStatusMeta,
  isStreamContentBlock,
  isStreamContentBlockDelta,
  isStreamMessage,
  isStreamMessageDelta,
  isStreamUsage,
} from "../../src/shared/guards.js";

describe("isStatusMeta", () => {
  it("accepts valid shape", () => {
    expect(isStatusMeta({ version: "1.2.3", startedAtIso: "2026-04-26T00:00:00Z" })).toBe(true);
  });
  it("rejects missing fields", () => {
    expect(isStatusMeta({ version: "1.2.3" })).toBe(false);
    expect(isStatusMeta({ startedAtIso: "x" })).toBe(false);
  });
  it("rejects wrong types", () => {
    expect(isStatusMeta({ version: 1, startedAtIso: "x" })).toBe(false);
    expect(isStatusMeta({ version: "x", startedAtIso: 0 })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isStatusMeta(null)).toBe(false);
    expect(isStatusMeta(undefined)).toBe(false);
    expect(isStatusMeta("x")).toBe(false);
    expect(isStatusMeta(42)).toBe(false);
  });
});

describe("isPairWsFrame", () => {
  it("accepts type=pair with pair object", () => {
    expect(isPairWsFrame({ type: "pair", pair: { request: {}, response: null } })).toBe(true);
  });
  it("rejects wrong type value", () => {
    expect(isPairWsFrame({ type: "other", pair: {} })).toBe(false);
  });
  it("rejects missing pair", () => {
    expect(isPairWsFrame({ type: "pair" })).toBe(false);
  });
  it("rejects null and non-object", () => {
    expect(isPairWsFrame(null)).toBe(false);
    expect(isPairWsFrame("pair")).toBe(false);
  });
});

describe("isMessagesBody", () => {
  it("accepts {messages: []}", () => {
    expect(isMessagesBody({ messages: [] })).toBe(true);
    expect(isMessagesBody({ messages: [{ role: "user" }] })).toBe(true);
  });
  it("rejects missing messages", () => {
    expect(isMessagesBody({})).toBe(false);
  });
  it("rejects non-array messages", () => {
    expect(isMessagesBody({ messages: "x" })).toBe(false);
    expect(isMessagesBody({ messages: 5 })).toBe(false);
  });
  it("rejects null and primitive", () => {
    expect(isMessagesBody(null)).toBe(false);
    expect(isMessagesBody(42)).toBe(false);
  });
});

describe("isModelBody", () => {
  it("accepts plain object", () => {
    expect(isModelBody({})).toBe(true);
    expect(isModelBody({ model: "claude-sonnet-4-6" })).toBe(true);
    expect(isModelBody({ system: "anything" })).toBe(true);
    expect(isModelBody({ model: "x", system: { type: "text" } })).toBe(true);
  });
  it("rejects null", () => {
    expect(isModelBody(null)).toBe(false);
  });
  it("rejects primitives", () => {
    expect(isModelBody("x")).toBe(false);
    expect(isModelBody(42)).toBe(false);
    expect(isModelBody(true)).toBe(false);
  });
});

describe("isContentBody", () => {
  it("accepts {content: []}", () => {
    expect(isContentBody({ content: [] })).toBe(true);
    expect(isContentBody({ content: [{ type: "text", text: "hi" }] })).toBe(true);
  });
  it("rejects missing content", () => {
    expect(isContentBody({})).toBe(false);
  });
  it("rejects non-array content", () => {
    expect(isContentBody({ content: "x" })).toBe(false);
  });
  it("rejects null and primitive", () => {
    expect(isContentBody(null)).toBe(false);
    expect(isContentBody("x")).toBe(false);
  });
});

describe("isAddressInfo", () => {
  it("accepts {port: number}", () => {
    expect(isAddressInfo({ port: 0 })).toBe(true);
    expect(isAddressInfo({ port: 8080, family: "IPv4" })).toBe(true);
  });
  it("rejects null", () => {
    expect(isAddressInfo(null)).toBe(false);
  });
  it("rejects string", () => {
    expect(isAddressInfo("/tmp/sock")).toBe(false);
  });
  it("rejects missing port", () => {
    expect(isAddressInfo({})).toBe(false);
  });
  it("rejects non-number port", () => {
    expect(isAddressInfo({ port: "8080" })).toBe(false);
  });
});

describe("isErrorWithCode", () => {
  it("accepts {code: string}", () => {
    expect(isErrorWithCode({ code: "ENOENT" })).toBe(true);
  });
  it("accepts empty object (code is optional)", () => {
    expect(isErrorWithCode({})).toBe(true);
  });
  it("accepts Error instances (objects)", () => {
    expect(isErrorWithCode(new Error("oops"))).toBe(true);
  });
  it("rejects null and primitives", () => {
    expect(isErrorWithCode(null)).toBe(false);
    expect(isErrorWithCode(undefined)).toBe(false);
    expect(isErrorWithCode("err")).toBe(false);
    expect(isErrorWithCode(42)).toBe(false);
  });
  it("rejects non-string code", () => {
    expect(isErrorWithCode({ code: 42 })).toBe(false);
  });
});

describe("isPackageJson", () => {
  it("accepts {version: string}", () => {
    expect(isPackageJson({ version: "0.3.0" })).toBe(true);
    expect(isPackageJson({ version: "1.0.0", name: "x" })).toBe(true);
  });
  it("rejects missing version", () => {
    expect(isPackageJson({})).toBe(false);
  });
  it("rejects non-string version", () => {
    expect(isPackageJson({ version: 1 })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isPackageJson(null)).toBe(false);
    expect(isPackageJson("0.3.0")).toBe(false);
  });
});

describe("isStreamMessage", () => {
  it("accepts well-formed message_start.message", () => {
    expect(isStreamMessage({ id: "msg_1", model: "claude", usage: { input_tokens: 10 } })).toBe(
      true,
    );
  });
  it("rejects missing fields", () => {
    expect(isStreamMessage({ id: "x", model: "y" })).toBe(false);
    expect(isStreamMessage({ id: "x", usage: { input_tokens: 1 } })).toBe(false);
  });
  it("rejects malformed usage", () => {
    expect(isStreamMessage({ id: "x", model: "y", usage: {} })).toBe(false);
    expect(isStreamMessage({ id: "x", model: "y", usage: { input_tokens: "n" } })).toBe(false);
    expect(isStreamMessage({ id: "x", model: "y", usage: null })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isStreamMessage(null)).toBe(false);
    expect(isStreamMessage("x")).toBe(false);
  });
});

describe("isStreamContentBlock", () => {
  it("accepts {type: string} with optional id/name", () => {
    expect(isStreamContentBlock({ type: "text" })).toBe(true);
    expect(isStreamContentBlock({ type: "tool_use", id: "tu_1", name: "ls" })).toBe(true);
  });
  it("rejects missing type", () => {
    expect(isStreamContentBlock({})).toBe(false);
  });
  it("rejects non-string type/id/name", () => {
    expect(isStreamContentBlock({ type: 1 })).toBe(false);
    expect(isStreamContentBlock({ type: "x", id: 5 })).toBe(false);
    expect(isStreamContentBlock({ type: "x", name: 5 })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isStreamContentBlock(null)).toBe(false);
    expect(isStreamContentBlock("text")).toBe(false);
  });
});

describe("isStreamContentBlockDelta", () => {
  it("accepts {type, text?, partial_json?}", () => {
    expect(isStreamContentBlockDelta({ type: "text_delta", text: "hi" })).toBe(true);
    expect(isStreamContentBlockDelta({ type: "input_json_delta", partial_json: '{"a":1}' })).toBe(
      true,
    );
    expect(isStreamContentBlockDelta({ type: "text_delta" })).toBe(true);
  });
  it("rejects missing type", () => {
    expect(isStreamContentBlockDelta({ text: "hi" })).toBe(false);
  });
  it("rejects non-string fields", () => {
    expect(isStreamContentBlockDelta({ type: 1 })).toBe(false);
    expect(isStreamContentBlockDelta({ type: "x", text: 1 })).toBe(false);
    expect(isStreamContentBlockDelta({ type: "x", partial_json: 1 })).toBe(false);
  });
  it("rejects null", () => {
    expect(isStreamContentBlockDelta(null)).toBe(false);
  });
});

describe("isStreamMessageDelta", () => {
  it("accepts {} or {stop_reason?: string}", () => {
    expect(isStreamMessageDelta({})).toBe(true);
    expect(isStreamMessageDelta({ stop_reason: "end_turn" })).toBe(true);
  });
  it("rejects non-string stop_reason", () => {
    expect(isStreamMessageDelta({ stop_reason: 5 })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isStreamMessageDelta(null)).toBe(false);
    expect(isStreamMessageDelta("x")).toBe(false);
  });
});

describe("isStreamUsage", () => {
  it("accepts {} or {output_tokens?: number}", () => {
    expect(isStreamUsage({})).toBe(true);
    expect(isStreamUsage({ output_tokens: 42 })).toBe(true);
  });
  it("rejects non-number output_tokens", () => {
    expect(isStreamUsage({ output_tokens: "42" })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isStreamUsage(null)).toBe(false);
    expect(isStreamUsage(42)).toBe(false);
  });
});

describe("isHttpPair", () => {
  it("accepts valid pair shape", () => {
    expect(
      isHttpPair({
        request: { method: "POST" },
        response: { status_code: 200 },
        logged_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });
  it("accepts pair with null response", () => {
    expect(
      isHttpPair({ request: { method: "GET" }, response: null, logged_at: "2026-01-01T00:00:00Z" }),
    ).toBe(true);
  });
  it("rejects missing logged_at", () => {
    expect(isHttpPair({ request: {}, response: null })).toBe(false);
  });
  it("rejects missing request", () => {
    expect(isHttpPair({ response: null, logged_at: "x" })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isHttpPair(null)).toBe(false);
    expect(isHttpPair("x")).toBe(false);
  });
});

describe("isHttpPairArray", () => {
  it("accepts empty array", () => {
    expect(isHttpPairArray([])).toBe(true);
  });
  it("accepts array of valid pairs", () => {
    expect(
      isHttpPairArray([
        { request: {}, response: null, logged_at: "x" },
        { request: {}, response: {}, logged_at: "y" },
      ]),
    ).toBe(true);
  });
  it("rejects array with an invalid pair", () => {
    expect(isHttpPairArray([{ request: {}, logged_at: "x" }, { notAPair: true }])).toBe(false);
  });
  it("rejects non-array", () => {
    expect(isHttpPairArray(null)).toBe(false);
    expect(isHttpPairArray({ length: 0 })).toBe(false);
  });
});

describe("isPendingPair", () => {
  it("accepts valid pending pair", () => {
    expect(
      isPendingPair({
        pairIndex: 3,
        request: { method: "POST" },
        startedAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });
  it("rejects missing pairIndex", () => {
    expect(isPendingPair({ request: {}, startedAt: "x" })).toBe(false);
  });
  it("rejects non-number pairIndex", () => {
    expect(isPendingPair({ pairIndex: "1", request: {}, startedAt: "x" })).toBe(false);
  });
  it("rejects missing startedAt", () => {
    expect(isPendingPair({ pairIndex: 1, request: {} })).toBe(false);
  });
  it("rejects null and primitives", () => {
    expect(isPendingPair(null)).toBe(false);
    expect(isPendingPair(42)).toBe(false);
  });
});
