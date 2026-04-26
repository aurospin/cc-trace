export interface JsonViewState {
  expanded: Record<string, boolean>;
}

export type JsonViewAction =
  | { type: "toggle"; path: string; depth: number }
  | { type: "expandAll" }
  | { type: "collapseAll" };

export const ALL = "__all__";

function defaultOpen(depth: number): boolean {
  return depth < 2;
}

/**
 * Reducer for per-tree expand/collapse state.
 * @param state - current expansion map
 * @param action - toggle a path, or set the global expand/collapse override
 * @returns next state
 */
export function reducer(state: JsonViewState, action: JsonViewAction): JsonViewState {
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

/**
 * Resolves whether a given node is expanded.
 * Per-path entry wins; otherwise the `__all__` sentinel; otherwise depth-based default.
 * @param state - current expansion map
 * @param path - slash-joined node path
 * @param depth - node depth (root = 0)
 * @returns true if the node should render expanded
 */
export function lookupExpanded(state: JsonViewState, path: string, depth: number): boolean {
  if (Object.hasOwn(state.expanded, path)) return state.expanded[path] as boolean;
  if (Object.hasOwn(state.expanded, ALL)) return state.expanded[ALL] as boolean;
  return defaultOpen(depth);
}
