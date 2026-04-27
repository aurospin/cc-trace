import type React from "react";
import type { ToolUseBlock } from "../../shared/types.js";

/** Map a 0-based call index to a 1-based numeric label (#1, #2, …). */
export function exhibitLabel(i: number): string {
  return `#${i + 1}`;
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
          <span className="label">tool_use {label}</span>
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
