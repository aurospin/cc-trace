import { parseHttpPairs } from "./conversation.js";
import type { HttpPair, SessionStats, SessionTokenTotals } from "./types.js";

const NUMBER_FMT = new Intl.NumberFormat("en-US");

/**
 * Renders a non-negative integer with `en-US` thousands separators.
 * Locale is hardcoded so reports render identically across viewer locales.
 * @param n - non-negative integer
 * @returns formatted string (e.g., 1234567 → "1,234,567")
 */
export function formatNumber(n: number): string {
  return NUMBER_FMT.format(n);
}

interface UsageObj {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readUsage(value: unknown): UsageObj | null {
  if (!isObject(value)) return null;
  const u = value.usage;
  if (!isObject(u)) return null;
  return u as UsageObj;
}

function addNum(target: number, source: unknown): number {
  return typeof source === "number" ? target + source : target;
}

function accumulate(totals: SessionTokenTotals, usage: UsageObj): void {
  totals.input = addNum(totals.input, usage.input_tokens);
  totals.output = addNum(totals.output, usage.output_tokens);
  totals.cacheRead = addNum(totals.cacheRead, usage.cache_read_input_tokens);
  totals.cacheCreationInput = addNum(totals.cacheCreationInput, usage.cache_creation_input_tokens);
  if (isObject(usage.cache_creation)) {
    const cc = usage.cache_creation;
    totals.cacheCreation5m = addNum(totals.cacheCreation5m, cc.ephemeral_5m_input_tokens);
    totals.cacheCreation1h = addNum(totals.cacheCreation1h, cc.ephemeral_1h_input_tokens);
  }
}

function parseSseUsage(bodyRaw: string, totals: SessionTokenTotals): void {
  const lines = bodyRaw.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    let event: unknown;
    try {
      event = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (!isObject(event)) continue;
    if (event.type === "message_start") {
      const u = readUsage(event.message);
      if (u) accumulate(totals, u);
    } else if (event.type === "message_delta") {
      const u = isObject(event.usage) ? (event.usage as UsageObj) : null;
      if (u) {
        // For message_delta only output_tokens advances; reuse accumulator.
        totals.output = addNum(totals.output, u.output_tokens);
      }
    }
  }
}

/**
 * Computes session-wide aggregate counts and token totals.
 * Pure: same input always yields the same output. No I/O.
 * @param pairs - all captured pairs (any URL, any status; filtering is internal)
 * @returns SessionStats — see specs/001-stats-version-json-ui/data-model.md
 */
export function computeStats(pairs: HttpPair[]): SessionStats {
  const tokens: SessionTokenTotals = {
    cacheRead: 0,
    cacheCreationInput: 0,
    cacheCreation5m: 0,
    cacheCreation1h: 0,
    input: 0,
    output: 0,
  };
  const requestsByMethod: Record<string, number> = { POST: 0, GET: 0 };

  for (const pair of pairs) {
    const method = pair.request.method;
    requestsByMethod[method] = (requestsByMethod[method] ?? 0) + 1;

    const resp = pair.response;
    if (resp === null) continue;
    if (resp.status_code < 200 || resp.status_code >= 300) continue;
    if (!pair.request.url.includes("/v1/messages")) continue;

    if (resp.body_raw !== null) {
      parseSseUsage(resp.body_raw, tokens);
    } else {
      const u = readUsage(resp.body);
      if (u) accumulate(tokens, u);
    }
  }

  const conversations = parseHttpPairs(pairs, { includeAll: true });
  const turnCount = conversations.reduce((acc, conv) => acc + conv.pairs.length, 0);

  return {
    turnCount,
    requestCount: pairs.length,
    requestsByMethod,
    tokens,
  };
}
