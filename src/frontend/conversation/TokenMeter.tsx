import type React from "react";
import type { HttpPair } from "../../shared/types.js";

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

/**
 * Extracts token usage from a captured HTTP pair, supporting both JSON and
 * streaming (SSE) Anthropic response shapes. Returns zeros when usage is
 * missing.
 */
export function extractUsage(pair: HttpPair): Usage {
  const empty: Usage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  const resp = pair.response;
  if (!resp) return empty;

  if (resp.body_raw) {
    return parseStreamingUsage(resp.body_raw);
  }

  const body = resp.body as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  } | null;
  const u = body?.usage;
  if (!u) return empty;
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheCreate: u.cache_creation_input_tokens ?? 0,
  };
}

function parseStreamingUsage(bodyRaw: string): Usage {
  const out: Usage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  const lines = bodyRaw.split("\n").filter((l) => l.startsWith("data: "));
  for (const line of lines) {
    if (line === "data: [DONE]") continue;
    try {
      const event = JSON.parse(line.slice(6)) as {
        type?: string;
        message?: {
          usage?: {
            input_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
        };
        usage?: { output_tokens?: number };
      };
      if (event.type === "message_start" && event.message?.usage) {
        const u = event.message.usage;
        out.input = u.input_tokens ?? 0;
        out.cacheRead = u.cache_read_input_tokens ?? 0;
        out.cacheCreate = u.cache_creation_input_tokens ?? 0;
      } else if (event.type === "message_delta" && event.usage) {
        out.output = event.usage.output_tokens ?? out.output;
      }
    } catch {
      /* skip malformed event */
    }
  }
  return out;
}

interface MeterProps {
  pairs: HttpPair[];
}

/**
 * Renders a 6px stacked bar of token usage across all pairs of a conversation.
 * Segments: cache_read | cache_creation | input | output.
 */
export function TokenMeter({ pairs }: MeterProps): React.ReactElement {
  const total = pairs.reduce<Usage>(
    (acc, p) => {
      const u = extractUsage(p);
      return {
        input: acc.input + u.input,
        output: acc.output + u.output,
        cacheRead: acc.cacheRead + u.cacheRead,
        cacheCreate: acc.cacheCreate + u.cacheCreate,
      };
    },
    { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
  );

  const sum = total.input + total.output + total.cacheRead + total.cacheCreate;
  const pct = (n: number) => (sum === 0 ? 0 : (n / sum) * 100);
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

  return (
    <div
      className="meter"
      title={`input ${total.input}  output ${total.output}  cache-read ${total.cacheRead}  cache-create ${total.cacheCreate}`}
    >
      <div className="meter-bar">
        <div className="meter-seg cache-read" style={{ width: `${pct(total.cacheRead)}%` }} />
        <div className="meter-seg cache-create" style={{ width: `${pct(total.cacheCreate)}%` }} />
        <div className="meter-seg input" style={{ width: `${pct(total.input)}%` }} />
        <div className="meter-seg output" style={{ width: `${pct(total.output)}%` }} />
      </div>
      <div className="meter-legend">
        <span>
          <strong>↑ {fmt(total.input + total.cacheRead + total.cacheCreate)}</strong> in
        </span>
        <span>
          <strong>↓ {fmt(total.output)}</strong> out
        </span>
        {total.cacheRead > 0 && (
          <span>◐ {Math.round((total.cacheRead / (sum - total.output || 1)) * 100)}% cache</span>
        )}
      </div>
    </div>
  );
}
