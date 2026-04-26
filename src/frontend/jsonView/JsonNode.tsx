import type React from "react";
import { formatForClipboard } from "../../shared/json-path.js";
import { type JsonViewAction, type JsonViewState, lookupExpanded } from "./jsonViewReducer.js";

const INDENT_PX = 14;

function rowStyle(depth: number): React.CSSProperties {
  return { paddingLeft: `${depth * INDENT_PX}px` };
}

function ToggleSpacer(): React.ReactElement {
  return <span className="toggle-spacer" aria-hidden />;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function matchesFilter(
  value: unknown,
  name: string | number | null,
  filter: string,
): boolean {
  if (!filter) return false;
  const f = filter.toLowerCase();
  if (name !== null && String(name).toLowerCase().includes(f)) return true;
  if (typeof value === "string" && value.toLowerCase().includes(f)) return true;
  if (typeof value === "number" && String(value).includes(f)) return true;
  return false;
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

/** Recursively renders one JSON node (primitive, array, or object) with collapse + copy controls. */
export function JsonNode({
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
