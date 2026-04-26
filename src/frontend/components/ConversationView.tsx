import type React from "react";
import { assembleStreaming, parseHttpPairs } from "../../shared/conversation.js";
import type { HttpPair } from "../../shared/types.js";

interface Props {
  pairs: HttpPair[];
  includeAll: boolean;
}

/** Renders an Anthropic-shaped message content (string or content-block array) safely. */
function renderUserContent(content: unknown): React.ReactNode {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content.map((block, i) => {
    if (typeof block !== "object" || block === null) {
      return <span key={`b-${i}`}>{String(block)}</span>;
    }
    const b = block as { type?: string; text?: string; content?: unknown; tool_use_id?: string };
    if (b.type === "text" && typeof b.text === "string") {
      return (
        <span key={`b-${i}`} style={{ whiteSpace: "pre-wrap" }}>
          {b.text}
        </span>
      );
    }
    if (b.type === "tool_result") {
      const inner = typeof b.content === "string" ? b.content : JSON.stringify(b.content, null, 2);
      return (
        <pre
          key={`b-${i}`}
          style={{ background: "#1e1e1e", padding: 8, borderRadius: 4, fontSize: 11 }}
        >{`[tool_result ${b.tool_use_id ?? ""}]\n${inner}`}</pre>
      );
    }
    return (
      <pre
        key={`b-${i}`}
        style={{ background: "#1e1e1e", padding: 8, borderRadius: 4, fontSize: 11 }}
      >
        {JSON.stringify(b, null, 2)}
      </pre>
    );
  });
}

function renderBody(pair: HttpPair): React.ReactNode {
  const resp = pair.response;
  if (!resp) return <em style={{ color: "#888" }}>No response (orphaned)</em>;
  if (resp.body_raw) {
    const msg = assembleStreaming(resp.body_raw);
    return (
      <div>
        {msg.content.map((block, i) =>
          block.type === "text" ? (
            <p key={`text-${i}`} style={{ whiteSpace: "pre-wrap" }}>
              {block.text}
            </p>
          ) : (
            <pre
              key={`tool-${i}`}
              style={{ background: "#1e1e1e", padding: 8, borderRadius: 4 }}
            >{`[tool: ${block.name}]\n${JSON.stringify(block.input, null, 2)}`}</pre>
          ),
        )}
        <small style={{ color: "#888" }}>
          {`\u2191 ${msg.usage.input_tokens} tokens  \u2193 ${msg.usage.output_tokens} tokens`}
        </small>
      </div>
    );
  }
  return (
    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(resp.body, null, 2)}</pre>
  );
}

export function ConversationView({ pairs, includeAll }: Props) {
  const conversations = parseHttpPairs(pairs, { includeAll });

  if (conversations.length === 0) {
    return <p style={{ color: "#888", padding: 16 }}>No conversations captured yet.</p>;
  }

  return (
    <div>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          style={{ marginBottom: 32, borderBottom: "1px solid #333", paddingBottom: 16 }}
        >
          <h3 style={{ color: "#569cd6", marginBottom: 8 }}>{conv.model}</h3>
          {conv.pairs.map((pair, i) => {
            const reqBody = pair.request.body as {
              messages?: Array<{ role: string; content: unknown }>;
            } | null;
            const messages = reqBody?.messages ?? [];
            const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
            return (
              <div key={`pair-${i}`} style={{ marginBottom: 16 }}>
                {lastUserMsg && (
                  <div
                    style={{
                      background: "#252526",
                      padding: 8,
                      borderRadius: 4,
                      marginBottom: 8,
                    }}
                  >
                    <strong style={{ color: "#9cdcfe" }}>User: </strong>
                    {renderUserContent(lastUserMsg.content)}
                  </div>
                )}
                <div style={{ padding: 8 }}>
                  <strong style={{ color: "#4ec9b0" }}>Assistant: </strong>
                  {renderBody(pair)}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
