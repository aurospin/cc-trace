import { describe, expect, it } from "vitest";
import { assembleStreaming, parseHttpPairs } from "../../src/shared/conversation.js";
import type { HttpPair } from "../../src/shared/types.js";

const TOOL_SSE = [
  `data: {"type":"message_start","message":{"id":"msg_2","role":"assistant","model":"claude-sonnet-4-6","content":[],"usage":{"input_tokens":20,"output_tokens":0}}}`,
  `data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"bash"}}`,
  `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"cmd\\":\\"ls\\"}"}}`,
  `data: {"type":"content_block_stop","index":0}`,
  `data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":5}}`,
  `data: {"type":"message_stop"}`,
  "",
].join("\n\n");

const TOOL_SSE_INVALID_JSON = [
  `data: {"type":"message_start","message":{"id":"msg_3","role":"assistant","model":"claude-sonnet-4-6","content":[],"usage":{"input_tokens":5,"output_tokens":0}}}`,
  `data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_2","name":"read"}}`,
  `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"INVALID{"}}`,
  `data: {"type":"content_block_stop","index":0}`,
  `data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":2}}`,
  `data: {"type":"message_stop"}`,
  "",
].join("\n\n");

// Covers: data: [DONE] filter, missing id/name on tool_use, missing text/partial_json,
// orphan deltas (textByIndex/toolByIndex false branches), message_delta without stop_reason or usage
const SSE_EDGE = [
  `data: {"type":"message_start","message":{"id":"msg_5","role":"assistant","model":"claude-sonnet-4-6","content":[],"usage":{"input_tokens":5,"output_tokens":0}}}`,
  `data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use"}}`,
  `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta"}}`,
  `data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}`,
  `data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta"}}`,
  `data: {"type":"content_block_delta","index":99,"delta":{"type":"text_delta","text":"orphan"}}`,
  `data: {"type":"content_block_delta","index":98,"delta":{"type":"input_json_delta","partial_json":"x"}}`,
  `data: {"type":"content_block_stop","index":0}`,
  `data: {"type":"content_block_stop","index":1}`,
  `data: {"type":"message_delta","delta":{}}`,
  `data: {"type":"message_stop"}`,
  "data: [DONE]",
  "",
].join("\n\n");

const SSE = [
  `data: {"type":"message_start","message":{"id":"msg_1","role":"assistant","model":"claude-sonnet-4-6","content":[],"usage":{"input_tokens":10,"output_tokens":0}}}`,
  `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
  `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}`,
  `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}`,
  `data: {"type":"content_block_stop","index":0}`,
  `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}`,
  `data: {"type":"message_stop"}`,
  "",
].join("\n\n");

describe("assembleStreaming", () => {
  it("assembles text blocks from SSE deltas", () => {
    const msg = assembleStreaming(SSE);
    expect(msg.content[0]).toMatchObject({ type: "text", text: "Hello world" });
  });

  it("captures model from message_start", () => {
    const msg = assembleStreaming(SSE);
    expect(msg.model).toBe("claude-sonnet-4-6");
  });

  it("merges token usage from message_start and message_delta", () => {
    const msg = assembleStreaming(SSE);
    expect(msg.usage.input_tokens).toBe(10);
    expect(msg.usage.output_tokens).toBe(2);
  });

  it("sets stop_reason from message_delta", () => {
    const msg = assembleStreaming(SSE);
    expect(msg.stop_reason).toBe("end_turn");
  });

  it("skips malformed data lines gracefully", () => {
    const badSSE = `data: NOT_JSON\n\n${SSE}`;
    const msg = assembleStreaming(badSSE);
    expect(msg.content[0]).toMatchObject({ type: "text", text: "Hello world" });
  });

  it("assembles tool_use blocks from SSE input_json_delta events", () => {
    const msg = assembleStreaming(TOOL_SSE);
    expect(msg.content[0]).toMatchObject({ type: "tool_use", name: "bash", input: { cmd: "ls" } });
  });

  it("handles tool_use block with invalid JSON input gracefully", () => {
    const msg = assembleStreaming(TOOL_SSE_INVALID_JSON);
    expect(msg.content[0]).toMatchObject({ type: "tool_use", name: "read", input: {} });
  });

  it("handles edge cases: [DONE] filter, missing fields, orphan deltas, no stop_reason/usage", () => {
    const msg = assembleStreaming(SSE_EDGE);
    expect(msg.content[0]).toMatchObject({ type: "tool_use", id: "", name: "" });
    expect(msg.content[1]).toMatchObject({ type: "text", text: "" });
    expect(msg.stop_reason).toBeNull();
    expect(msg.usage.output_tokens).toBe(0);
  });
});

const makePair = (model: string, system: string, msgs: number): HttpPair => ({
  request: {
    timestamp: Date.now() / 1000,
    method: "POST",
    url: "https://api.anthropic.com/v1/messages",
    headers: {},
    body: {
      model,
      system,
      messages: Array.from({ length: msgs }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `msg ${i}`,
      })),
    },
  },
  response: {
    timestamp: Date.now() / 1000,
    status_code: 200,
    headers: {},
    body: { content: [] },
    body_raw: null,
  },
  logged_at: new Date().toISOString(),
});

describe("parseHttpPairs", () => {
  it("groups pairs by model + system prompt into conversations", () => {
    const pairs = [
      makePair("claude-sonnet-4-6", "You are helpful", 3),
      makePair("claude-sonnet-4-6", "You are helpful", 3),
      makePair("claude-opus-4-5", "Different system", 3),
    ];
    const convos = parseHttpPairs(pairs);
    expect(convos).toHaveLength(2);
  });

  it("filters out pairs with fewer than 3 messages by default", () => {
    const pairs = [makePair("claude-sonnet-4-6", "sys", 1)];
    const convos = parseHttpPairs(pairs);
    expect(convos).toHaveLength(0);
  });

  it("includes all pairs when includeAll=true", () => {
    const pairs = [makePair("claude-sonnet-4-6", "sys", 1)];
    const convos = parseHttpPairs(pairs, { includeAll: true });
    expect(convos).toHaveLength(1);
  });

  it("filters pairs whose URL does not contain /v1/messages", () => {
    const pair = makePair("claude-sonnet-4-6", "sys", 5);
    pair.request.url = "https://api.anthropic.com/v1/other";
    const convos = parseHttpPairs([pair], { includeAll: true });
    expect(convos).toHaveLength(0);
  });

  it("handles pairs with null request body", () => {
    const pair = makePair("claude-sonnet-4-6", "sys", 5);
    pair.request.body = null;
    // Without includeAll: getMessageCount called with null body → returns 0 → filtered out
    expect(parseHttpPairs([pair])).toHaveLength(0);
    // With includeAll: getConversationKey called with null body → model falls back to "unknown"
    const convos = parseHttpPairs([pair], { includeAll: true });
    expect(convos[0].model).toBe("unknown");
  });

  it("groups pairs with array-form system prompts (cache_control blocks) stably", () => {
    // Real Claude Code requests send `system` as an array of text blocks with cache_control.
    // Two requests with the same array system should group together; different systems should not.
    const arrSysA = [{ type: "text", text: "You are A", cache_control: { type: "ephemeral" } }];
    const arrSysB = [{ type: "text", text: "You are B", cache_control: { type: "ephemeral" } }];
    const a1 = makePair("claude-sonnet-4-6", "ignored", 3);
    (a1.request.body as { system: unknown }).system = arrSysA;
    const a2 = makePair("claude-sonnet-4-6", "ignored", 3);
    (a2.request.body as { system: unknown }).system = arrSysA;
    const b1 = makePair("claude-sonnet-4-6", "ignored", 3);
    (b1.request.body as { system: unknown }).system = arrSysB;
    const convos = parseHttpPairs([a1, a2, b1]);
    expect(convos).toHaveLength(2);
  });

  it("does not crash when user message content is an array of content blocks (tool_result)", () => {
    // After the first tool call, Claude Code sends user messages with array content.
    const pair = makePair("claude-sonnet-4-6", "sys", 3);
    const body = pair.request.body as { messages: Array<{ role: string; content: unknown }> };
    body.messages[2] = {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu_1", content: "ok" }],
    };
    const convos = parseHttpPairs([pair]);
    expect(convos).toHaveLength(1);
    expect(convos[0].pairs[0]).toBe(pair);
  });
});
