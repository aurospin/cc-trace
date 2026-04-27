import type { HttpPair } from "../../shared/types.js";
import { formatNumber } from "./stats.js";
import { useThrottledStats } from "./useThrottledStats.js";

interface Props {
  pairs: HttpPair[];
  live: boolean;
  includeAll?: boolean;
}

interface PillProps {
  label: string;
  value: number;
  title: string;
  className?: string;
}

function Pill({ label, value, title, className }: PillProps) {
  return (
    <span className={`stats-pill${className ? ` ${className}` : ""}`} title={title}>
      <span className="stats-pill-label">{label}</span>
      <span className="stats-pill-value">{formatNumber(value)}</span>
    </span>
  );
}

export function StatsBlock({ pairs, live, includeAll = true }: Props) {
  const stats = useThrottledStats(pairs, live, 250, includeAll);
  const methods = Object.entries(stats.requestsByMethod)
    .filter(([m, n]) => m === "POST" || m === "GET" || n > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const t = stats.tokens;
  // Legacy `cache_creation_input_tokens` and the nested ephemeral split report
  // the same tokens two ways. Prefer the legacy total; fall back to the sum
  // when only the nested shape is present so we never undercount.
  const cacheCreate = t.cacheCreationInput || t.cacheCreation5m + t.cacheCreation1h;
  const inTotal = t.input + t.cacheRead + cacheCreate;
  const outTotal = t.output;

  return (
    <div className="stats-block" aria-label="session statistics">
      <Pill
        label="turns"
        value={stats.turnCount}
        title="Conversational turns (always includes single-message turns)"
      />
      <Pill
        label="requests"
        value={stats.requestCount}
        title="Total captured request/response pairs"
      />
      <span className="stats-method-group">
        {methods.map(([method, n]) => (
          <Pill
            key={method}
            label={method}
            value={n}
            title={`Requests with method ${method}`}
            className="stats-pill-method"
          />
        ))}
      </span>
      <div className="stats-tokens">
        <div className="stats-tokens-row">
          <Pill
            label="↑ IN"
            value={inTotal}
            title="Total: input + cacheRead + cacheCreate"
            className="stats-pill-total"
          />
          <span className="stats-eq" aria-hidden="true">
            =
          </span>
          <Pill label="input" value={t.input} title="usage.input_tokens" />
          <span className="stats-eq" aria-hidden="true">
            +
          </span>
          <Pill label="cacheRead" value={t.cacheRead} title="usage.cache_read_input_tokens" />
          <span className="stats-eq" aria-hidden="true">
            +
          </span>
          <Pill
            label="cacheCreate"
            value={cacheCreate}
            title="usage.cache_creation_input_tokens (legacy) — falls back to ephemeral_5m + ephemeral_1h"
          />
        </div>
        <div className="stats-tokens-row">
          <Pill
            label="↓ OUT"
            value={outTotal}
            title="Total: usage.output_tokens"
            className="stats-pill-total"
          />
        </div>
        <div
          className="stats-ephemeral"
          title="Per-request cache_creation tokens split by TTL bucket. Already counted inside cacheCreate."
        >
          Ephemeral_5m/1h_input ({formatNumber(t.cacheCreation5m)},{" "}
          {formatNumber(t.cacheCreation1h)})
        </div>
      </div>
    </div>
  );
}
