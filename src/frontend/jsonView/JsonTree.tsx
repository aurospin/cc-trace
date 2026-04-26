import type React from "react";
import { useReducer } from "react";
import { JsonNode } from "./JsonNode.js";
import { reducer } from "./jsonViewReducer.js";

interface JsonTreeProps {
  label: string;
  data: unknown;
  filter: string;
  onFocus: (segments: ReadonlyArray<string | number>) => void;
}

/**
 * Per-tree wrapper: owns expand/collapse state and renders the labeled section header.
 * @param label - sticky header label (e.g. "Request" / "Response")
 * @param data - JSON tree to render
 * @param filter - lower-cased filter string passed down to highlight matches
 * @param onFocus - hover callback to bubble up the focused path
 * @returns a section element wrapping a recursive `<JsonNode>`
 */
export function JsonTree({ label, data, filter, onFocus }: JsonTreeProps): React.ReactElement {
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
