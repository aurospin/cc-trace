import { useMemo, useState } from "react";
import type { HttpPair } from "../../shared/types.js";
import { JsonBreadcrumb } from "./JsonBreadcrumb.js";
import { isObject, matchesFilter } from "./JsonNode.js";
import { JsonTree } from "./JsonTree.js";

interface Props {
  pairs: HttpPair[];
}

type JsonFilterTarget = "both" | "request" | "response";

function countMatches(data: unknown, filter: string, name: string | number | null = null): number {
  if (!filter) return 0;
  let n = matchesFilter(data, name, filter) ? 1 : 0;
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      n += countMatches(data[i], filter, i);
    }
  } else if (isObject(data)) {
    for (const k of Object.keys(data)) {
      n += countMatches(data[k], filter, k);
    }
  }
  return n;
}

export function JsonView({ pairs }: Props) {
  const [filter, setFilter] = useState("");
  const [filterTarget, setFilterTarget] = useState<JsonFilterTarget>("both");
  const [lastFocused, setLastFocused] = useState<ReadonlyArray<string | number>>([]);

  const matchCount = useMemo(() => countMatches(pairs, filter), [pairs, filter]);

  const requestFilter = filterTarget === "both" || filterTarget === "request" ? filter : "";
  const responseFilter = filterTarget === "both" || filterTarget === "response" ? filter : "";

  const targets: { id: JsonFilterTarget; label: string }[] = [
    { id: "both", label: "Both" },
    { id: "request", label: "Request" },
    { id: "response", label: "Response" },
  ];

  return (
    <div className="json-shell">
      <div className="json-toolbar">
        <input
          type="text"
          placeholder="Filter — keys or values"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="json-target-toggle" aria-label="filter target">
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={filterTarget === t.id}
              className={filterTarget === t.id ? "active" : ""}
              onClick={() => setFilterTarget(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {filter && (
          <span className="count">
            {matchCount} match{matchCount === 1 ? "" : "es"}
          </span>
        )}
      </div>
      <JsonBreadcrumb lastFocused={lastFocused} />
      <div className="json-pair-list">
        {pairs.map((pair, idx) => (
          <article
            key={`${pair.logged_at}:${idx}`}
            className="json-pair-section"
            aria-label={`pair ${idx + 1}`}
          >
            <JsonTree
              label="Request"
              data={pair.request}
              filter={requestFilter}
              onFocus={setLastFocused}
            />
            <JsonTree
              label="Response"
              data={pair.response}
              filter={responseFilter}
              onFocus={setLastFocused}
            />
          </article>
        ))}
      </div>
    </div>
  );
}
