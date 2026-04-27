import type React from "react";
import { formatPairLabel } from "../../shared/pair-index.js";
import type { ContentBlock, HttpPair, ToolUseBlock } from "../../shared/types.js";
import { TokenMeter } from "./TokenMeter.js";
import { ToolCallList } from "./ToolCallList.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function getLastUserMessage(pair: HttpPair): { role: string; content: unknown } | null {
  const body = pair.request.body as {
    messages?: Array<{ role: string; content: unknown }>;
  } | null;
  const messages = body?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") return m;
  }
  return null;
}

function renderUserContent(content: unknown, toolUseLabels: Map<string, string>): React.ReactNode {
  if (typeof content === "string") return <p>{content}</p>;
  if (!Array.isArray(content)) return <p>{JSON.stringify(content)}</p>;
  return content.map((block, i) => {
    if (typeof block !== "object" || block === null) {
      return <p key={`b-${i}`}>{String(block)}</p>;
    }
    const b = block as {
      type?: string;
      text?: string;
      content?: unknown;
      tool_use_id?: string;
    };
    if (b.type === "text" && typeof b.text === "string") {
      return <p key={`b-${i}`}>{b.text}</p>;
    }
    if (b.type === "tool_result") {
      const label = toolUseLabels.get(b.tool_use_id ?? "") ?? "?";
      const inner = typeof b.content === "string" ? b.content : JSON.stringify(b.content, null, 2);
      return (
        <div key={`b-${i}`} style={{ marginBottom: 10 }}>
          <span className="tool-chip">tool_result {label}</span>
          <pre
            style={{
              margin: "6px 0 0",
              padding: 8,
              background: "var(--paper-edge)",
              fontSize: 11,
              borderRadius: 2,
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            {inner}
          </pre>
        </div>
      );
    }
    return (
      <pre key={`b-${i}`} style={{ fontSize: 11, color: "var(--ink-mid)" }}>
        {JSON.stringify(b, null, 2)}
      </pre>
    );
  });
}

interface Props {
  pair: HttpPair;
  pairIndex: number;
  labelWidth: number;
  assistantBlocks: ContentBlock[];
  turnToolCalls: { block: ToolUseBlock; label: string }[];
  toolUseLabels: Map<string, string>;
  isFolded: boolean;
  isFresh: boolean;
  onToggleFold: () => void;
}

/** Single transcript row: left rail (turn # + token meter), body, right tool call margin. */
export function TurnRow({
  pair,
  pairIndex,
  labelWidth,
  assistantBlocks,
  turnToolCalls,
  toolUseLabels,
  isFolded,
  isFresh,
  onToggleFold,
}: Props): React.ReactElement {
  const lastUser = getLastUserMessage(pair);
  const status = pair.response?.status_code ?? 0;
  const isError = status >= 400;

  return (
    <article className="turn">
      <aside className={`turn-rail${isError ? " error" : ""}${isFresh ? " fresh" : ""}`}>
        <button
          type="button"
          className="turn-fold"
          onClick={onToggleFold}
          title={isFolded ? "Expand turn" : "Collapse turn"}
        >
          {isFolded ? "▸" : "▾"} {formatPairLabel("Turn", pairIndex, labelWidth)}
        </button>
        <div className="turn-time">{formatDate(pair.request.timestamp)}</div>
        <div className="turn-time">{formatTime(pair.request.timestamp)}</div>
        {isError && (
          <div className="turn-time" style={{ color: "var(--accent)", marginTop: 6 }}>
            {status}
          </div>
        )}
        <TokenMeter pairs={[pair]} />
      </aside>

      {!isFolded && (
        <div className="turn-body">
          {lastUser && (
            <div className="speaker user">
              <span className="role">User</span>
              <div className="body">{renderUserContent(lastUser.content, toolUseLabels)}</div>
            </div>
          )}
          <div className="speaker assistant">
            <span className="role">Assistant {pair.response?.body_raw ? "· streamed" : ""}</span>
            <div className="body">
              {assistantBlocks.length === 0 && pair.response === null && (
                <em style={{ color: "var(--ink-soft)" }}>
                  No response (orphaned){pair.note ? ` — ${pair.note}` : ""}
                </em>
              )}
              {assistantBlocks.map((block, i) => {
                if (block.type === "text") {
                  return (
                    <p key={`t-${i}`} style={{ whiteSpace: "pre-wrap", margin: "0 0 10px" }}>
                      {block.text}
                    </p>
                  );
                }
                const label = toolUseLabels.get(block.id) ?? "?";
                return (
                  <span key={`u-${i}`} className="tool-chip">
                    tool_use {label} — {block.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!isFolded && <ToolCallList toolCalls={turnToolCalls} />}
    </article>
  );
}

export { formatDate, formatTime };
