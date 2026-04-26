import type React from "react";
import { useState } from "react";
import { assembleStreaming, parseHttpPairs } from "../../shared/conversation.js";
import type { ContentBlock, HttpPair, ToolUseBlock } from "../../shared/types.js";
import { TokenMeter } from "./TokenMeter.js";

interface Props {
  pairs: HttpPair[];
  includeAll: boolean;
}

const EXHIBIT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function exhibitLabel(i: number): string {
  if (i < 26) return EXHIBIT_LABELS[i] ?? `${i}`;
  return `${EXHIBIT_LABELS[Math.floor(i / 26) - 1] ?? ""}${EXHIBIT_LABELS[i % 26] ?? ""}`;
}

function getAssistantBlocks(pair: HttpPair): ContentBlock[] {
  const resp = pair.response;
  if (!resp) return [];
  if (resp.body_raw) return assembleStreaming(resp.body_raw).content;
  const body = resp.body as { content?: ContentBlock[] } | null;
  return body?.content ?? [];
}

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

function renderUserContent(content: unknown, exhibits: Map<string, string>): React.ReactNode {
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
      const label = exhibits.get(b.tool_use_id ?? "") ?? "?";
      const inner = typeof b.content === "string" ? b.content : JSON.stringify(b.content, null, 2);
      return (
        <div key={`b-${i}`} style={{ marginBottom: 10 }}>
          <span className="exhibit-chip">re: Exhibit {label}</span>
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

export function ConversationView({ pairs, includeAll }: Props) {
  const conversations = parseHttpPairs(pairs, { includeAll });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [foldedTurns, setFoldedTurns] = useState<Set<string>>(new Set());

  if (conversations.length === 0) {
    return (
      <div className="transcript-empty">
        Awaiting traffic. The transcript will assemble itself as Claude speaks.
      </div>
    );
  }

  const lastPairLoggedAt = pairs[pairs.length - 1]?.logged_at;

  const toggleConv = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTurn = (key: string) => {
    setFoldedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Global turn counter across the entire transcript, so users see Turn 01,
  // 02, 03… even if pairs land in separate conversation groups.
  let globalTurn = 0;

  return (
    <div className="transcript">
      {conversations.map((conv) => {
        const isCollapsed = collapsed.has(conv.id);
        // Build the exhibit index for this conversation: tool_use_id → label
        const exhibitIds: string[] = [];
        const exhibitsByTurn: { turnIdx: number; block: ToolUseBlock; label: string }[] = [];
        conv.pairs.forEach((pair, turnIdx) => {
          const blocks = getAssistantBlocks(pair);
          for (const b of blocks) {
            if (b.type === "tool_use") {
              const label = exhibitLabel(exhibitIds.length);
              exhibitIds.push(b.id);
              exhibitsByTurn.push({ turnIdx, block: b, label });
            }
          }
        });
        const exhibitMap = new Map<string, string>();
        exhibitIds.forEach((id, i) => exhibitMap.set(id, exhibitLabel(i)));

        return (
          <section key={conv.id} className="conversation">
            <button
              type="button"
              className="conversation-head"
              onClick={() => toggleConv(conv.id)}
              title={isCollapsed ? "Expand conversation" : "Collapse conversation"}
            >
              <span className="fold-toggle" aria-hidden>
                {isCollapsed ? "▸" : "▾"}
              </span>
              <h2 className="serif">{conv.model}</h2>
              <span className="smallcaps">
                {conv.pairs.length} turn{conv.pairs.length === 1 ? "" : "s"} ·{" "}
                {formatDate(conv.startedAt.getTime() / 1000)}{" "}
                {formatTime(conv.startedAt.getTime() / 1000)}
              </span>
            </button>

            {!isCollapsed &&
              conv.pairs.map((pair, turnIdx) => {
                globalTurn += 1;
                const turnKey = `${conv.id}::${pair.logged_at}`;
                const isFolded = foldedTurns.has(turnKey);
                const lastUser = getLastUserMessage(pair);
                const assistantBlocks = getAssistantBlocks(pair);
                const status = pair.response?.status_code ?? 0;
                const isError = status >= 400;
                const isFresh =
                  pair.logged_at === lastPairLoggedAt && turnIdx === conv.pairs.length - 1;
                const turnExhibits = exhibitsByTurn.filter((x) => x.turnIdx === turnIdx);

                return (
                  <article key={pair.logged_at} className="turn">
                    <aside
                      className={`turn-rail${isError ? " error" : ""}${isFresh ? " fresh" : ""}`}
                    >
                      <button
                        type="button"
                        className="turn-fold"
                        onClick={() => toggleTurn(turnKey)}
                        title={isFolded ? "Expand turn" : "Collapse turn"}
                      >
                        {isFolded ? "▸" : "▾"} Turn {pad2(globalTurn)}
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
                            <div className="body">
                              {renderUserContent(lastUser.content, exhibitMap)}
                            </div>
                          </div>
                        )}
                        <div className="speaker assistant">
                          <span className="role">
                            Assistant {pair.response?.body_raw ? "· streamed" : ""}
                          </span>
                          <div className="body">
                            {assistantBlocks.length === 0 && pair.response === null && (
                              <em style={{ color: "var(--ink-soft)" }}>
                                No response (orphaned){pair.note ? ` — ${pair.note}` : ""}
                              </em>
                            )}
                            {assistantBlocks.map((block, i) => {
                              if (block.type === "text") {
                                return (
                                  <p
                                    key={`t-${i}`}
                                    style={{ whiteSpace: "pre-wrap", margin: "0 0 10px" }}
                                  >
                                    {block.text}
                                  </p>
                                );
                              }
                              const label = exhibitMap.get(block.id) ?? "?";
                              return (
                                <span key={`u-${i}`} className="exhibit-chip">
                                  Exhibit {label} — {block.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {!isFolded && (
                      <aside className="turn-margin">
                        {turnExhibits.length === 0 && (
                          <span style={{ color: "var(--ink-soft)" }}>—</span>
                        )}
                        {turnExhibits.map(({ block, label }) => (
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
                    )}
                  </article>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
