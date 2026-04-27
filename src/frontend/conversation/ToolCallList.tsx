import type React from "react";
import type { ToolUseBlock } from "../../shared/types.js";

/** Map a 0-based call index to a 1-based numeric label (#1, #2, …). */
export function toolCallLabel(i: number): string {
  return `#${i + 1}`;
}

interface Props {
  toolCalls: { block: ToolUseBlock; label: string }[];
}

/** Right-margin tool call list for a single turn. */
export function ToolCallList({ toolCalls }: Props): React.ReactElement {
  return (
    <aside className="turn-margin">
      {toolCalls.length === 0 && <span style={{ color: "var(--ink-soft)" }}>—</span>}
      {toolCalls.map(({ block, label }) => (
        <div key={block.id} className="tool-call-card">
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
