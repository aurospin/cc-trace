import React, { useState } from "react";
import type { HttpPair } from "../../shared/types.js";

interface Props {
  pairs: HttpPair[];
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

export function RawPairsView({ pairs }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (pairs.length === 0) {
    return <div className="transcript-empty">No requests captured yet.</div>;
  }

  return (
    <div className="raw-list">
      {pairs.map((pair, i) => {
        const status = pair.response?.status_code ?? 0;
        const cls = status >= 400 ? "err" : "ok";
        return (
          <div key={pair.logged_at}>
            <button
              type="button"
              className="raw-row"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span className={`status ${cls}`}>{status || "—"}</span>
              <span className="method">{pair.request.method}</span>
              <span className="url">{shortenUrl(pair.request.url)}</span>
              <span className="time">{pair.logged_at.slice(11, 19)}</span>
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
