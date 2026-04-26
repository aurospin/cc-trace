import type { HttpPair } from "../../shared/types.js";
import { formatNumber } from "./stats.js";
import { useThrottledStats } from "./useThrottledStats.js";

interface Props {
  pairs: HttpPair[];
  live: boolean;
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

const TOKEN_PILLS: {
  label: string;
  title: string;
  key: keyof import("../../shared/types.js").SessionTokenTotals;
}[] = [
  { label: "cache_read", title: "usage.cache_read_input_tokens", key: "cacheRead" },
  {
    label: "cache_create",
    title: "usage.cache_creation_input_tokens (legacy flat)",
    key: "cacheCreationInput",
  },
  {
    label: "ephemeral_5m",
    title: "usage.cache_creation.ephemeral_5m_input_tokens",
    key: "cacheCreation5m",
  },
  {
    label: "ephemeral_1h",
    title: "usage.cache_creation.ephemeral_1h_input_tokens",
    key: "cacheCreation1h",
  },
  { label: "input", title: "usage.input_tokens", key: "input" },
  { label: "output", title: "usage.output_tokens", key: "output" },
];

export function StatsBlock({ pairs, live }: Props) {
  const stats = useThrottledStats(pairs, live);
  const methods = Object.entries(stats.requestsByMethod)
    .filter(([m, n]) => m === "POST" || m === "GET" || n > 0)
    .sort(([a], [b]) => a.localeCompare(b));

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
      <span className="stats-token-group">
        {TOKEN_PILLS.map((p) => (
          <Pill
            key={p.key}
            label={p.label}
            value={stats.tokens[p.key]}
            title={p.title}
            className="stats-pill-token"
          />
        ))}
      </span>
    </div>
  );
}
