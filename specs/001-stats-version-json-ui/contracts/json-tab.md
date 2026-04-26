# Contract: JSON Tab UI Improvements

**Modules**:
- `src/frontend/components/JsonView.tsx` (modify)
- `src/shared/json-path.ts` (new — pure formatters)
**Tests**:
- `tests/unit/json-path.test.ts` — 100% coverage of `formatJsonPath` + `formatForClipboard`
- Manual UI verification for v1 (per Phase 0 R9)

## Pure formatter contract (`src/shared/json-path.ts`)

### `formatForClipboard(node: unknown): string`

| ID | Given | Expect |
|---|---|---|
| C-J-01 | `{ a: 1, b: [2, 3] }` | `'{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n'` (pretty + trailing newline) |
| C-J-02 | `[1, 2, 3]` | `'[\n  1,\n  2,\n  3\n]\n'` |
| C-J-03 | `"hello"` | `"hello"` (no quotes) |
| C-J-04 | `"line\nbreak"` | `"line\nbreak"` (raw value, no escape transformation per FR-302) |
| C-J-05 | `42` | `"42"` |
| C-J-06 | `true` | `"true"` |
| C-J-07 | `false` | `"false"` |
| C-J-08 | `null` | `"null"` |
| C-J-09 | `{}` | `"{}\n"` |
| C-J-10 | `[]` | `"[]\n"` |

### `formatJsonPath(segments: ReadonlyArray<string | number>): string`

| ID | Given | Expect |
|---|---|---|
| C-J-11 | `[]` | `"$"` |
| C-J-12 | `["messages"]` | `"messages"` |
| C-J-13 | `["messages", 0]` | `"messages[0]"` |
| C-J-14 | `["messages", 0, "content", 1, "text"]` | `"messages[0].content[1].text"` |
| C-J-15 | `[0]` | `"[0]"` |

## Component contract (`<JsonView>`)

### Layout (FR-304)

- Top region: filter input + target toggle (`Both` / `Request` / `Response`) + breadcrumb bar.
- Below: a list of pair sections. Each pair section contains:
  - `<JsonTree label="Request" />` — request payload tree, sticky header reading "Request"
  - `<JsonTree label="Response" />` — response payload tree, sticky header reading "Response"
- Single page scroll context. Each tree's sticky label remains visible while the user scrolls past its body.

### Filter + target toggle (FR-305)

- Single `<input>` for the filter expression.
- Three-button toggle next to it. Default `Both`. State lives in `JsonView`.
- Tree visibility/de-emphasis behavior matches the existing `matchesFilter` rules.
- Switching the target re-applies the existing filter expression to the new scope (no retype required).
- A tree that is not in scope receives `filter=""` and renders fully (no de-emphasis).

### Per-tree expand-all / collapse-all (FR-301)

- Each `<JsonTree>` exposes a small toolbar with two buttons: "Expand all" and "Collapse all".
- The two trees in a pair section maintain independent expansion state. Operating one MUST NOT alter the other.
- State is owned by a `useReducer` per `<JsonTree>` instance.

### Breadcrumb bar (FR-303)

- Persistent button-styled bar at the top of `<JsonView>`.
- Displays the path of the last node hovered or clicked across either tree.
- Clicking the bar copies the displayed path to the clipboard via `navigator.clipboard.writeText`.
- Empty state (no node focused yet): renders `$`.

### Copy controls (FR-302)

- Hover-revealed `<button>` per row inside both trees.
- Click → `navigator.clipboard.writeText(formatForClipboard(node))`.
- Visual: small icon-button styled via CSS vars; revealed by `:hover` on the row.
- Mouse-only for v1 (keyboard support explicitly out of scope per spec clarification).

### Per-pair isolation (FR-306)

- Each pair section is rendered with `key={pair.logged_at + ":" + pairIndex}`.
- Expand/collapse and any tree-derived state reset when a different pair is selected.
- The filter input and target toggle persist (owned by `<JsonView>`).

## Out of scope (deferred)

- Keyboard shortcuts (expand/collapse, copy, focus navigation).
- Expand-to-depth-N controls.
- Persisting expand/collapse preferences across sessions.
- Two filter inputs (rejected in spec clarification).
- Side-by-side req/resp layout (rejected in spec clarification).
- Component-level unit tests (deferred per Phase 0 R9).
