import type React from "react";
import { useMemo, useReducer, useState } from "react";
import { formatForClipboard, formatJsonPath } from "../../shared/json-path.js";
import type { HttpPair } from "../../shared/types.js";

interface Props {
  pairs: HttpPair[];
}

type JsonFilterTarget = "both" | "request" | "response";

interface JsonViewState {
  expanded: Record<string, boolean>;
}

type JsonViewAction =
  | { type: "toggle"; path: string; depth: number }
  | { type: "expandAll" }
  | { type: "collapseAll" };

const ALL = "__all__";

function defaultOpen(depth: number): boolean {
  return depth < 2;
}

function reducer(state: JsonViewState, action: JsonViewAction): JsonViewState {
  switch (action.type) {
    case "toggle": {
      const cur = lookupExpanded(state, action.path, action.depth);
      return { expanded: { ...state.expanded, [action.path]: !cur } };
    }
    case "expandAll":
      return { expanded: { [ALL]: true } };
    case "collapseAll":
      return { expanded: { [ALL]: false } };
  }
}

function lookupExpanded(state: JsonViewState, path: string, depth: number): boolean {
  if (Object.hasOwn(state.expanded, path)) return state.expanded[path] as boolean;
  if (Object.hasOwn(state.expanded, ALL)) return state.expanded[ALL] as boolean;
  return defaultOpen(depth);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function matchesFilter(value: unknown, name: string | number | null, filter: string): boolean {
  if (!filter) return false;
  const f = filter.toLowerCase();
  if (name !== null && String(name).toLowerCase().includes(f)) return true;
  if (typeof value === "string" && value.toLowerCase().includes(f)) return true;
  if (typeof value === "number" && String(value).includes(f)) return true;
  return false;
}

const INDENT_PX = 14;

function rowStyle(depth: number): React.CSSProperties {
  return { paddingLeft: `${depth * INDENT_PX}px` };
}

function ToggleSpacer(): React.ReactElement {
  return <span className="toggle-spacer" aria-hidden />;
}

interface NodeProps {
  data: unknown;
  segments: ReadonlyArray<string | number>;
  name: string | number | null;
  depth: number;
  filter: string;
  state: JsonViewState;
  dispatch: React.Dispatch<JsonViewAction>;
  onFocus: (segments: ReadonlyArray<string | number>) => void;
}

function JsonNode({
  data,
  segments,
  name,
  depth,
  filter,
  state,
  dispatch,
  onFocus,
}: NodeProps): React.ReactElement {
  const path = segments.join("/");
  const open = lookupExpanded(state, path, depth);
  const isMatch = matchesFilter(data, name, filter);
  const style = rowStyle(depth);

  const renderKey =
    name !== null ? (
      <span className="json-key">{typeof name === "number" ? name : name}</span>
    ) : null;

  const focus = () => onFocus(segments);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(formatForClipboard(data)).catch(() => {
        /* clipboard denied — silent */
      });
    }
  };

  const renderCopy = (
    <button type="button" className="json-copy" onClick={copy} title="copy value">
      ⎘
    </button>
  );

  if (data === null) {
    return (
      <div className={`json-row${isMatch ? " match" : ""}`} style={style} onMouseEnter={focus}>
        <ToggleSpacer />
        {renderKey}
        <span className="json-null">null</span>
        {renderCopy}
      </div>
    );
  }

  if (typeof data === "string") {
    return (
      <div className={`json-row${isMatch ? " match" : ""}`} style={style} onMouseEnter={focus}>
        <ToggleSpacer />
        {renderKey}
        <span className="json-string">{data.length > 200 ? `${data.slice(0, 200)}…` : data}</span>
        {renderCopy}
      </div>
    );
  }

  if (typeof data === "number") {
    return (
      <div className={`json-row${isMatch ? " match" : ""}`} style={style} onMouseEnter={focus}>
        <ToggleSpacer />
        {renderKey}
        <span className="json-number">{data}</span>
        {renderCopy}
      </div>
    );
  }

  if (typeof data === "boolean") {
    return (
      <div className={`json-row${isMatch ? " match" : ""}`} style={style} onMouseEnter={focus}>
        <ToggleSpacer />
        {renderKey}
        <span className="json-bool">{String(data)}</span>
        {renderCopy}
      </div>
    );
  }

  if (Array.isArray(data)) {
    const empty = data.length === 0;
    return (
      <div onMouseEnter={focus}>
        <div className={`json-row${isMatch ? " match" : ""}`} style={style}>
          {empty ? (
            <ToggleSpacer />
          ) : (
            <button
              type="button"
              className="toggle"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "toggle", path, depth });
              }}
            >
              {open ? "▾" : "▸"}
            </button>
          )}
          {renderKey}
          <span className="json-bracket">
            [{empty ? "" : open ? "" : ` ${data.length} items …`}]
          </span>
          {renderCopy}
        </div>
        {open && !empty && (
          <div>
            {data.map((v, i) => (
              <JsonNode
                key={i}
                data={v}
                segments={[...segments, i]}
                name={i}
                depth={depth + 1}
                filter={filter}
                state={state}
                dispatch={dispatch}
                onFocus={onFocus}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isObject(data)) {
    const keys = Object.keys(data);
    const empty = keys.length === 0;
    return (
      <div onMouseEnter={focus}>
        <div className={`json-row${isMatch ? " match" : ""}`} style={style}>
          {empty ? (
            <ToggleSpacer />
          ) : (
            <button
              type="button"
              className="toggle"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "toggle", path, depth });
              }}
            >
              {open ? "▾" : "▸"}
            </button>
          )}
          {renderKey}
          <span className="json-bracket">
            {`{${empty ? "" : open ? "" : ` ${keys.length} keys …`}}`}
          </span>
          {renderCopy}
        </div>
        {open && !empty && (
          <div>
            {keys.map((k) => (
              <JsonNode
                key={k}
                data={data[k]}
                segments={[...segments, k]}
                name={k}
                depth={depth + 1}
                filter={filter}
                state={state}
                dispatch={dispatch}
                onFocus={onFocus}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return <div className="json-row">{String(data)}</div>;
}

interface JsonTreeProps {
  label: string;
  data: unknown;
  filter: string;
  onFocus: (segments: ReadonlyArray<string | number>) => void;
}

function JsonTree({ label, data, filter, onFocus }: JsonTreeProps): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, { expanded: {} });
  return (
    <section className="json-tree-section">
      <header className="json-tree-label">
        <span>{label}</span>
        <div className="json-tree-toolbar">
          <button type="button" onClick={() => dispatch({ type: "expandAll" })}>
            Expand all
          </button>
          <button type="button" onClick={() => dispatch({ type: "collapseAll" })}>
            Collapse all
          </button>
        </div>
      </header>
      <div className="json-tree">
        <JsonNode
          data={data}
          segments={[]}
          name={null}
          depth={0}
          filter={filter}
          state={state}
          dispatch={dispatch}
          onFocus={onFocus}
        />
      </div>
    </section>
  );
}

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
  const breadcrumb = formatJsonPath(lastFocused);

  const copyPath = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(breadcrumb).catch(() => {
        /* clipboard denied — silent */
      });
    }
  };

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
      <button
        type="button"
        className="json-breadcrumb"
        onClick={copyPath}
        title="click to copy path"
      >
        {breadcrumb}
      </button>
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
