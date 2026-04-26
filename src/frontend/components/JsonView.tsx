import type React from "react";
import { useMemo, useState } from "react";
import type { HttpPair } from "../../shared/types.js";

interface Props {
  pairs: HttpPair[];
}

interface NodeProps {
  data: unknown;
  path: string;
  name: string | number | null;
  depth: number;
  filter: string;
  onPath: (p: string) => void;
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
  // Tree indentation: each level adds INDENT_PX of left padding.
  return { paddingLeft: `${depth * INDENT_PX}px` };
}

function ToggleSpacer(): React.ReactElement {
  return <span className="toggle-spacer" aria-hidden />;
}

function JsonNode({ data, path, name, depth, filter, onPath }: NodeProps): React.ReactElement {
  const [open, setOpen] = useState(depth < 2);
  const isMatch = matchesFilter(data, name, filter);
  const style = rowStyle(depth);

  const renderKey =
    name !== null ? (
      <span className="json-key">{typeof name === "number" ? name : name}</span>
    ) : null;

  if (data === null) {
    return (
      <div
        className={`json-row${isMatch ? " match" : ""}`}
        style={style}
        onMouseEnter={() => onPath(path)}
      >
        <ToggleSpacer />
        {renderKey}
        <span className="json-null">null</span>
      </div>
    );
  }

  if (typeof data === "string") {
    return (
      <div
        className={`json-row${isMatch ? " match" : ""}`}
        style={style}
        onMouseEnter={() => onPath(path)}
      >
        <ToggleSpacer />
        {renderKey}
        <span className="json-string">{data.length > 200 ? `${data.slice(0, 200)}…` : data}</span>
      </div>
    );
  }

  if (typeof data === "number") {
    return (
      <div
        className={`json-row${isMatch ? " match" : ""}`}
        style={style}
        onMouseEnter={() => onPath(path)}
      >
        <ToggleSpacer />
        {renderKey}
        <span className="json-number">{data}</span>
      </div>
    );
  }

  if (typeof data === "boolean") {
    return (
      <div
        className={`json-row${isMatch ? " match" : ""}`}
        style={style}
        onMouseEnter={() => onPath(path)}
      >
        <ToggleSpacer />
        {renderKey}
        <span className="json-bool">{String(data)}</span>
      </div>
    );
  }

  if (Array.isArray(data)) {
    const empty = data.length === 0;
    return (
      <div onMouseEnter={() => onPath(path)}>
        <div className={`json-row${isMatch ? " match" : ""}`} style={style}>
          {empty ? (
            <ToggleSpacer />
          ) : (
            <button type="button" className="toggle" onClick={() => setOpen(!open)}>
              {open ? "▾" : "▸"}
            </button>
          )}
          {renderKey}
          <span className="json-bracket">
            [{empty ? "" : open ? "" : ` ${data.length} items …`}]
          </span>
        </div>
        {open && !empty && (
          <div>
            {data.map((v, i) => (
              <JsonNode
                key={i}
                data={v}
                path={`${path}[${i}]`}
                name={i}
                depth={depth + 1}
                filter={filter}
                onPath={onPath}
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
      <div onMouseEnter={() => onPath(path)}>
        <div className={`json-row${isMatch ? " match" : ""}`} style={style}>
          {empty ? (
            <ToggleSpacer />
          ) : (
            <button type="button" className="toggle" onClick={() => setOpen(!open)}>
              {open ? "▾" : "▸"}
            </button>
          )}
          {renderKey}
          <span className="json-bracket">
            {`{${empty ? "" : open ? "" : ` ${keys.length} keys …`}}`}
          </span>
        </div>
        {open && !empty && (
          <div>
            {keys.map((k) => (
              <JsonNode
                key={k}
                data={data[k]}
                path={`${path}.${k}`}
                name={k}
                depth={depth + 1}
                filter={filter}
                onPath={onPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return <div className="json-row">{String(data)}</div>;
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
  const [hoveredPath, setHoveredPath] = useState("pairs");

  const matchCount = useMemo(() => countMatches(pairs, filter), [pairs, filter]);

  const copyPath = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(hoveredPath).catch(() => {
        /* clipboard denied — silent */
      });
    }
  };

  return (
    <div className="json-shell">
      <div className="json-toolbar">
        <input
          type="text"
          placeholder="Filter — keys or values"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && (
          <span className="count">
            {matchCount} match{matchCount === 1 ? "" : "es"}
          </span>
        )}
      </div>
      <button type="button" className="json-path" onClick={copyPath} title="click to copy path">
        {hoveredPath}
      </button>
      <div className="json-tree">
        <JsonNode
          data={pairs}
          path="pairs"
          name={null}
          depth={0}
          filter={filter}
          onPath={setHoveredPath}
        />
      </div>
    </div>
  );
}
