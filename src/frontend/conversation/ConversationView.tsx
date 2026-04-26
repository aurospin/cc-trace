import { useState } from "react";
import type { ContentBlock, HttpPair, ToolUseBlock } from "../../shared/types.js";
import { exhibitLabel } from "./ExhibitList.js";
import { TurnRow, formatDate, formatTime } from "./TurnRow.js";
import { assembleStreaming, parseHttpPairs } from "./conversation.js";

interface Props {
  pairs: HttpPair[];
  includeAll: boolean;
}

function getAssistantBlocks(pair: HttpPair): ContentBlock[] {
  const resp = pair.response;
  if (!resp) return [];
  if (resp.body_raw) return assembleStreaming(resp.body_raw).content;
  const body = resp.body as { content?: ContentBlock[] } | null;
  return body?.content ?? [];
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

  let globalTurn = 0;

  return (
    <div className="transcript">
      {conversations.map((conv) => {
        const isCollapsed = collapsed.has(conv.id);
        const exhibitIds: string[] = [];
        const exhibitsByTurn: { turnIdx: number; block: ToolUseBlock; label: string }[] = [];
        const blocksByTurn: ContentBlock[][] = [];
        conv.pairs.forEach((pair, turnIdx) => {
          const blocks = getAssistantBlocks(pair);
          blocksByTurn.push(blocks);
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
                const isFresh =
                  pair.logged_at === lastPairLoggedAt && turnIdx === conv.pairs.length - 1;
                const turnExhibits = exhibitsByTurn
                  .filter((x) => x.turnIdx === turnIdx)
                  .map(({ block, label }) => ({ block, label }));

                return (
                  <TurnRow
                    key={pair.logged_at}
                    pair={pair}
                    globalTurn={globalTurn}
                    assistantBlocks={blocksByTurn[turnIdx] ?? []}
                    turnExhibits={turnExhibits}
                    exhibitMap={exhibitMap}
                    isFolded={isFolded}
                    isFresh={isFresh}
                    onToggleFold={() => toggleTurn(turnKey)}
                  />
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
