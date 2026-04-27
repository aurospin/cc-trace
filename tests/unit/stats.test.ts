import { describe, expect, it } from "vitest";
import { computeStats, formatNumber } from "../../src/frontend/stats/stats.js";
import type { HttpPair } from "../../src/shared/types.js";

const ZERO_TOKENS = {
  cacheRead: 0,
  cacheCreationInput: 0,
  cacheCreation5m: 0,
  cacheCreation1h: 0,
  input: 0,
  output: 0,
};

function makePair(
  overrides: Partial<HttpPair> & { request?: Partial<HttpPair["request"]> },
): HttpPair {
  const baseRequest: HttpPair["request"] = {
    timestamp: 0,
    method: "POST",
    url: "https://api.anthropic.com/v1/messages",
    headers: {},
    body: {
      model: "claude-sonnet-4-6",
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
    },
  };
  return {
    request: { ...baseRequest, ...(overrides.request ?? {}) },
    response: overrides.response ?? null,
    logged_at: overrides.logged_at ?? "2026-04-26T00:00:00Z",
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
  };
}

function jsonResponse(body: unknown, status = 200): HttpPair["response"] {
  return {
    timestamp: 1,
    status_code: status,
    headers: {},
    body,
    body_raw: null,
  };
}

function streamResponse(bodyRaw: string): HttpPair["response"] {
  return {
    timestamp: 1,
    status_code: 200,
    headers: {},
    body: null,
    body_raw: bodyRaw,
  };
}

describe("computeStats", () => {
  it("C-S-01: empty pairs yields all-zero stats with POST/GET baseline", () => {
    expect(computeStats([])).toEqual({
      turnCount: 0,
      requestCount: 0,
      requestsByMethod: { POST: 0, GET: 0 },
      tokens: ZERO_TOKENS,
    });
  });

  it("C-S-02: single POST /v1/messages JSON pair sums all six tokens exactly", () => {
    const pair = makePair({
      request: {
        body: {
          model: "claude-sonnet-4-6",
          system: "sys",
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "user", content: "c" },
          ],
        },
      },
      response: jsonResponse({
        usage: {
          input_tokens: 11,
          output_tokens: 22,
          cache_read_input_tokens: 33,
          cache_creation_input_tokens: 44,
          cache_creation: {
            ephemeral_5m_input_tokens: 55,
            ephemeral_1h_input_tokens: 66,
          },
        },
      }),
    });
    const stats = computeStats([pair]);
    expect(stats.requestCount).toBe(1);
    expect(stats.requestsByMethod).toEqual({ POST: 1, GET: 0 });
    expect(stats.tokens).toEqual({
      cacheRead: 33,
      cacheCreationInput: 44,
      cacheCreation5m: 55,
      cacheCreation1h: 66,
      input: 11,
      output: 22,
    });
  });

  it("C-S-03: GET to non-/v1/messages URL counts the request but no tokens", () => {
    const pair = makePair({
      request: {
        method: "GET",
        url: "https://example.com/health",
        body: null,
      },
      response: jsonResponse({ usage: { input_tokens: 999 } }),
    });
    const stats = computeStats([pair]);
    expect(stats.requestCount).toBe(1);
    expect(stats.requestsByMethod).toEqual({ POST: 0, GET: 1 });
    expect(stats.tokens).toEqual(ZERO_TOKENS);
  });

  it("C-S-04: 5xx response with usage-shaped error body contributes zero tokens", () => {
    const pair = makePair({
      response: jsonResponse({ usage: { input_tokens: 100, output_tokens: 200 } }, 500),
    });
    const stats = computeStats([pair]);
    expect(stats.requestCount).toBe(1);
    expect(stats.tokens).toEqual(ZERO_TOKENS);
  });

  it("C-S-05: pair with response=null counts the request but no tokens, no throw", () => {
    const pair = makePair({ response: null });
    const stats = computeStats([pair]);
    expect(stats.requestCount).toBe(1);
    expect(stats.tokens).toEqual(ZERO_TOKENS);
  });

  it("C-S-06: streaming pair with cache buckets and output_tokens sums separately", () => {
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":7,"cache_read_input_tokens":3,"cache_creation_input_tokens":25,"cache_creation":{"ephemeral_5m_input_tokens":100,"ephemeral_1h_input_tokens":50}}}}`,
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}`,
      `data: {"type":"message_stop"}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    const stats = computeStats([pair]);
    expect(stats.tokens).toEqual({
      cacheRead: 3,
      cacheCreationInput: 25,
      cacheCreation5m: 100,
      cacheCreation1h: 50,
      input: 7,
      output: 10,
    });
  });

  it("C-S-07: JSON pair with only legacy cache_creation_input_tokens; ephemerals stay 0", () => {
    const pair = makePair({
      response: jsonResponse({
        usage: { cache_creation_input_tokens: 42 },
      }),
    });
    const stats = computeStats([pair]);
    expect(stats.tokens.cacheCreationInput).toBe(42);
    expect(stats.tokens.cacheCreation5m).toBe(0);
    expect(stats.tokens.cacheCreation1h).toBe(0);
  });

  it("C-S-08: two streaming pairs each with output_tokens=5 sum to 10", () => {
    const sse = (id: string) =>
      [
        `data: {"type":"message_start","message":{"id":"${id}","role":"assistant","model":"x","content":[],"usage":{"input_tokens":0}}}`,
        `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}`,
        `data: {"type":"message_stop"}`,
        "",
      ].join("\n\n");
    const pairs = [
      makePair({ response: streamResponse(sse("a")) }),
      makePair({ response: streamResponse(sse("b")) }),
    ];
    expect(computeStats(pairs).tokens.output).toBe(10);
  });

  it("C-S-09: mixed streaming + JSON pairs sum all six totals per-pair", () => {
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":5,"cache_read_input_tokens":1,"cache_creation":{"ephemeral_5m_input_tokens":2,"ephemeral_1h_input_tokens":3}}}}`,
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}`,
      "",
    ].join("\n\n");
    const pairs = [
      makePair({ response: streamResponse(sse) }),
      makePair({
        response: jsonResponse({
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 40,
            cache_creation: { ephemeral_5m_input_tokens: 50, ephemeral_1h_input_tokens: 60 },
          },
        }),
      }),
    ];
    expect(computeStats(pairs).tokens).toEqual({
      cacheRead: 31,
      cacheCreationInput: 40,
      cacheCreation5m: 52,
      cacheCreation1h: 63,
      input: 15,
      output: 24,
    });
  });

  it("C-S-10: uncommon method like PUT keeps POST/GET zero baseline", () => {
    const pair = makePair({
      request: { method: "PUT" },
      response: jsonResponse({}),
    });
    const stats = computeStats([pair]);
    expect(stats.requestsByMethod).toEqual({ POST: 0, GET: 0, PUT: 1 });
  });

  it("US2-S-01: computeStats with includeAll:false counts only multi-message turns", () => {
    const multiMsg = makePair({
      request: {
        body: {
          model: "m1",
          system: "s1",
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "user", content: "c" },
          ],
        },
      },
      response: jsonResponse({ usage: { input_tokens: 1 } }),
    });
    const singleMsg = makePair({
      request: {
        body: { model: "m1", system: "s1", messages: [{ role: "user", content: "warmup" }] },
      },
      response: jsonResponse({ usage: { input_tokens: 1 } }),
    });
    const stats = computeStats([singleMsg, multiMsg], { includeAll: false });
    expect(stats.turnCount).toBe(1);
  });

  it("US2-S-02: computeStats with includeAll:true counts all turns", () => {
    const multiMsg = makePair({
      request: {
        body: {
          model: "m1",
          system: "s1",
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "user", content: "c" },
          ],
        },
      },
      response: jsonResponse({ usage: { input_tokens: 1 } }),
    });
    const singleMsg = makePair({
      request: {
        body: { model: "m1", system: "s1", messages: [{ role: "user", content: "warmup" }] },
      },
      response: jsonResponse({ usage: { input_tokens: 1 } }),
    });
    const stats = computeStats([singleMsg, multiMsg], { includeAll: true });
    expect(stats.turnCount).toBe(2);
  });

  it("US2-S-03: computeStats with no opts defaults to includeAll:true", () => {
    const singleMsg = makePair({
      request: {
        body: { model: "m1", system: "s1", messages: [{ role: "user", content: "warmup" }] },
      },
      response: jsonResponse({ usage: { input_tokens: 1 } }),
    });
    const stats = computeStats([singleMsg]);
    expect(stats.turnCount).toBe(1);
  });

  it("US2-S-04: 10 pairs with 3 single-message warm-ups: filter OFF=7, ON=10", () => {
    const makeMulti = () =>
      makePair({
        request: {
          body: {
            model: "m1",
            system: "s1",
            messages: [
              { role: "user", content: "q" },
              { role: "assistant", content: "a" },
              { role: "user", content: "q2" },
            ],
          },
        },
        response: jsonResponse({ usage: { input_tokens: 1 } }),
      });
    const makeSingle = () =>
      makePair({
        request: {
          body: { model: "m1", system: "s1", messages: [{ role: "user", content: "warmup" }] },
        },
        response: jsonResponse({ usage: { input_tokens: 1 } }),
      });
    const pairs = [
      makeSingle(),
      makeMulti(),
      makeMulti(),
      makeSingle(),
      makeMulti(),
      makeMulti(),
      makeMulti(),
      makeSingle(),
      makeMulti(),
      makeMulti(),
    ];
    expect(computeStats(pairs, { includeAll: false }).turnCount).toBe(7);
    expect(computeStats(pairs, { includeAll: true }).turnCount).toBe(10);
  });

  it("C-S-11: turnCount sums pairs across conversations via parseHttpPairs(includeAll)", () => {
    const pairs = [
      makePair({
        request: {
          body: { model: "m1", system: "s1", messages: [{ role: "user", content: "a" }] },
        },
      }),
      makePair({
        request: {
          body: { model: "m1", system: "s1", messages: [{ role: "user", content: "b" }] },
        },
      }),
      makePair({
        request: {
          body: { model: "m2", system: "s2", messages: [{ role: "user", content: "c" }] },
        },
      }),
      makePair({
        request: {
          body: {
            model: "m2",
            system: "s2",
            messages: [
              { role: "user", content: "c" },
              { role: "assistant", content: "d" },
              { role: "user", content: "e" },
            ],
          },
        },
      }),
      makePair({
        request: {
          body: { model: "m2", system: "s2", messages: [{ role: "user", content: "f" }] },
        },
      }),
    ];
    expect(computeStats(pairs).turnCount).toBe(5);
  });

  it("C-S-12: streaming body with malformed data: lines still sums valid events", () => {
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":5}}}`,
      "data: {not-json",
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    const stats = computeStats([pair]);
    expect(stats.tokens.input).toBe(5);
    expect(stats.tokens.output).toBe(7);
  });

  it("interrupted streaming (message_start without message_delta) yields output=0, input populated", () => {
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":12}}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    const stats = computeStats([pair]);
    expect(stats.tokens.input).toBe(12);
    expect(stats.tokens.output).toBe(0);
  });

  it("non-/v1/messages POST does not contribute tokens", () => {
    const pair = makePair({
      request: { url: "https://api.anthropic.com/v1/other", body: null },
      response: jsonResponse({ usage: { input_tokens: 9 } }),
    });
    expect(computeStats([pair]).tokens).toEqual(ZERO_TOKENS);
  });

  it("JSON response with non-object body is ignored gracefully", () => {
    const pair = makePair({ response: jsonResponse("not an object") });
    expect(computeStats([pair]).tokens).toEqual(ZERO_TOKENS);
  });

  it("JSON response missing usage is ignored gracefully", () => {
    const pair = makePair({ response: jsonResponse({ id: "x" }) });
    expect(computeStats([pair]).tokens).toEqual(ZERO_TOKENS);
  });

  it("SSE data: line that parses to a non-object (e.g. null) is skipped", () => {
    const sse = [
      "data: null",
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":5}}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    expect(computeStats([pair]).tokens.input).toBe(5);
  });

  it("SSE multiple message_delta events: output_tokens is last-wins, not summed", () => {
    // Anthropic streams the running cumulative output_tokens on every delta.
    // Old buggy behavior summed them: 1 + 50 + 120 + 180 = 351. Correct: 180.
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":7,"output_tokens":1}}}`,
      `data: {"type":"message_delta","delta":{"stop_reason":null},"usage":{"output_tokens":50}}`,
      `data: {"type":"message_delta","delta":{"stop_reason":null},"usage":{"output_tokens":120}}`,
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":180}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    const stats = computeStats([pair]);
    expect(stats.tokens.input).toBe(7);
    expect(stats.tokens.output).toBe(180);
  });

  it("SSE message_start with output_tokens but no message_delta: keeps message_start value", () => {
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":4,"output_tokens":3}}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    const stats = computeStats([pair]);
    expect(stats.tokens.input).toBe(4);
    expect(stats.tokens.output).toBe(3);
  });

  it("SSE with only message_delta events (no message_start) contributes no tokens", () => {
    const sse = [
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    expect(computeStats([pair]).tokens).toEqual(ZERO_TOKENS);
  });

  it("SSE message_delta with non-number output_tokens is ignored", () => {
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":2,"output_tokens":1}}}`,
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":"nope"}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    expect(computeStats([pair]).tokens.output).toBe(1);
  });

  it("SSE message_delta without usage object is ignored", () => {
    const sse = [
      `data: {"type":"message_start","message":{"id":"m","role":"assistant","model":"x","content":[],"usage":{"input_tokens":3}}}`,
      `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}`,
      "",
    ].join("\n\n");
    const pair = makePair({ response: streamResponse(sse) });
    expect(computeStats([pair]).tokens.output).toBe(0);
    expect(computeStats([pair]).tokens.input).toBe(3);
  });
});

describe("formatNumber", () => {
  it("C-F-01: 0 → '0'", () => expect(formatNumber(0)).toBe("0"));
  it("C-F-02: 999 → '999'", () => expect(formatNumber(999)).toBe("999"));
  it("C-F-03: 1000 → '1,000'", () => expect(formatNumber(1000)).toBe("1,000"));
  it("C-F-04: 1234567 → '1,234,567'", () => expect(formatNumber(1234567)).toBe("1,234,567"));
  it("C-F-05: 1000000000 → '1,000,000,000'", () =>
    expect(formatNumber(1000000000)).toBe("1,000,000,000"));
});
