import type React from "react";
import type { ToolUseBlock } from "../../shared/types.js";

const EXHIBIT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Map a 0-based exhibit index to a human label (A, B, …, Z, AA, AB, …). */
export function exhibitLabel(i: number): string {
  if (i < 26) return EXHIBIT_LABELS[i] ?? `${i}`;
  return `${EXHIBIT_LABELS[Math.floor(i / 26) - 1] ?? ""}${EXHIBIT_LABELS[i % 26] ?? ""}`;
}

interface Props {
  exhibits: { block: ToolUseBlock; label: string }[];
}

/**
 * Right-margin exhibit list for a single turn.
 * Renders one card per `tool_use` block with the labeled chip + collapsible input JSON.
 */
export function ExhibitList({ exhibits }: Props): React.ReactElement {
  return (
    <aside className="turn-margin">
      {exhibits.length === 0 && <span style={{ color: "var(--ink-soft)" }}>—</span>}
      {exhibits.map(({ block, label }) => (
        <div key={block.id} className="exhibit-card">
          <span className="label">Exhibit {label}</span>
          <div className="name">{block.name}</div>
          <details>
            <summary>input</summary>
            <pre>{JSON.stringify(block.input, null, 2)}</pre>
          </details>
        </div>
      ))}
    </aside>
  );
}
