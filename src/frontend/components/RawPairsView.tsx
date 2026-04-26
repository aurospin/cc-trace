import React, { useState } from "react";
import type { HttpPair } from "../../shared/types.js";

interface Props {
  pairs: HttpPair[];
}

export function RawPairsView({ pairs }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (pairs.length === 0) {
    return <p style={{ color: "#888", padding: 16 }}>No requests captured yet.</p>;
  }

  return (
    <div>
      {pairs.map((pair, i) => (
        <div key={i} style={{ borderBottom: "1px solid #333", padding: "8px 0" }}>
          <button
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{
              background: "none",
              border: "none",
              color: "#569cd6",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            [{pair.response?.status_code ?? "\u2014"}] {pair.request.method} {pair.request.url}
            <small style={{ color: "#888", marginLeft: 8 }}>{pair.logged_at}</small>
          </button>
          {expanded === i && (
            <pre
              style={{
                background: "#1e1e1e",
                padding: 8,
                borderRadius: 4,
                fontSize: 11,
                overflow: "auto",
              }}
            >
              {JSON.stringify(pair, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
