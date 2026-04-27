import React, { useState } from "react";
import { padWidth as calcPadWidth, formatPairLabel } from "../../shared/pair-index.js";
import type { HttpPair } from "../../shared/types.js";

interface Props {
  pairs: HttpPair[];
  pendingIndices?: Set<number>;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Formats an ISO `logged_at` string (YYYY-MM-DDTHH:MM:SS.sssZ) as
 * `MM/DD HH:MM:SS` for the Pairs tab time column.
 */
function formatLoggedAt(loggedAt: string): string {
  // Defensive slicing: if the string is shorter than expected, fall back to
  // whatever is available rather than throwing.
  const mm = loggedAt.slice(5, 7);
  const dd = loggedAt.slice(8, 10);
  const time = loggedAt.slice(11, 19);
  return mm && dd ? `${mm}/${dd} ${time}` : time;
}

export function RawPairsView({ pairs, pendingIndices = new Set() }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (pairs.length === 0) {
    return <div className="transcript-empty">No requests captured yet.</div>;
  }

  const highestIndex = Math.max(1, ...pairs.map((p) => p.pairIndex ?? 1));
  const labelWidth = calcPadWidth(highestIndex);

  return (
    <div className="raw-list">
      {pairs.map((pair, i) => {
        const idx = pair.pairIndex ?? i + 1;
        const isPending = pendingIndices.has(idx);
        const status = pair.response?.status_code ?? 0;
        const cls = status >= 400 ? "err" : "ok";
        return (
          <div
            key={pair.logged_at}
            style={isPending ? { backgroundColor: "var(--pair-row-pending-bg)" } : undefined}
          >
            <button
              type="button"
              className="raw-row"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span className="pair-label">{formatPairLabel("Pair", idx, labelWidth)}</span>
              <span className={`status ${cls}`}>{status || (isPending ? "…" : "—")}</span>
              <span className="method">{pair.request.method}</span>
              <span className="url">{shortenUrl(pair.request.url)}</span>
              <span className="time">{formatLoggedAt(pair.logged_at)}</span>
            </button>
            {expanded === i && (
              <pre className="raw-detail mono" style={{ fontSize: 11, overflow: "auto" }}>
                {JSON.stringify(pair, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
