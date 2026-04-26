import React from "react";
import type { HttpPair } from "../../shared/types.js";

interface Props {
  pairs: HttpPair[];
}

export function JsonView({ pairs }: Props) {
  return (
    <pre
      style={{
        background: "#1e1e1e",
        padding: 16,
        borderRadius: 4,
        fontSize: 11,
        overflow: "auto",
        maxHeight: "80vh",
      }}
    >
      {JSON.stringify(pairs, null, 2)}
    </pre>
  );
}
