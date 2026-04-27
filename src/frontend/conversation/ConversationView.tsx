import { useMemo, useState } from "react";
import { isContentBody } from "../../shared/guards.js";
import { labelWidthForPairs } from "../../shared/pair-index.js";
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
  return isContentBody(resp.body) ? (resp.body.content as ContentBlock[]) : [];
}

export function ConversationView({ pairs, includeAll }: Props) {
  const conversations = useMemo(() => parseHttpPairs(pairs, { includeAll }), [pairs, includeAll]);
  // Unfiltered view used only for exhibit map construction — ensures tool_result
  // labels resolve even when the originating tool_use turn is hidden by the filter.
  const allConvById = useMemo(
    () => new Map(parseHttpPairs(pairs, { includeAll: true }).map((c) => [c.id, c])),
    [pairs],
  );

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
  const labelWidth = labelWidthForPairs(pairs);

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

  return (
    <div className="transcript">
      {conversations.map((conv) => {
        const isCollapsed = collapsed.has(conv.id);

        // Build exhibitMap from ALL pairs (including display-filtered ones) so
        // tool_result labels resolve when the originating tool_use turn is hidden.
        const allPairs = allConvById.get(conv.id)?.pairs ?? conv.pairs;
        let exhibitCounter = 0;
        const exhibitMap = new Map<string, string>();
        for (const pair of allPairs) {
          for (const b of getAssistantBlocks(pair)) {
            if (b.type === "tool_use") {
              exhibitMap.set(b.id, exhibitLabel(exhibitCounter++));
            }
          }
        }

        // Sidebar cards indexed by turnIdx for O(1) lookup at render time.
        const exhibitsByTurnMap = new Map<number, { block: ToolUseBlock; label: string }[]>();
        conv.pairs.forEach((pair, turnIdx) => {
          for (const b of getAssistantBlocks(pair)) {
            if (b.type === "tool_use") {
              const label = exhibitMap.get(b.id) ?? exhibitLabel(exhibitCounter++);
              const entry = exhibitsByTurnMap.get(turnIdx) ?? [];
              entry.push({ block: b, label });
              exhibitsByTurnMap.set(turnIdx, entry);
            }
          }
        });

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
                const turnKey = `${conv.id}::${pair.logged_at}`;
                const isFolded = foldedTurns.has(turnKey);
                const isFresh =
                  pair.logged_at === lastPairLoggedAt && turnIdx === conv.pairs.length - 1;
                const turnExhibits = exhibitsByTurnMap.get(turnIdx) ?? [];

                return (
                  <TurnRow
                    key={pair.logged_at}
                    pair={pair}
                    pairIndex={pair.pairIndex ?? turnIdx + 1}
                    labelWidth={labelWidth}
                    assistantBlocks={getAssistantBlocks(pair)}
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
