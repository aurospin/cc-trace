import { describe, expect, it } from "vitest";
import { assembleStreaming, parseHttpPairs } from "../../src/shared/conversation.js";
import type { HttpPair } from "../../src/shared/types.js";

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
});
