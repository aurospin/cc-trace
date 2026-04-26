# Contract: Version + Generated-At Surface

**Modules**:
- `src/report/html-generator.ts` (static-mode embed)
- `src/report/template.html` (static-mode template)
- `src/live-server/server.ts` (live-mode `/api/status`)
- `src/frontend/components/VersionLabel.tsx` (single render component)
**Tests**:
- `tests/unit/html-generator.test.ts` — assert version + generatedAt embedded
- `tests/integration/live-server.test.ts` — assert `/api/status` payload shape

## Static-mode contract

### Template placeholders (`src/report/template.html`)

Two new placeholders are added alongside the existing `__CC_TRACE_DATA__`, `__CC_TRACE_BUNDLE__`, `__CC_TRACE_TITLE__`:

- `__CC_TRACE_VERSION__` — the literal value of `version` from `package.json` at generation time.
- `__CC_TRACE_GENERATED_AT__` — the ISO-8601 UTC timestamp at the moment `generateHTML()` runs.

A new `<script>` block is added inside `<head>`:

```html
<script>
  window.ccTraceMeta = { version: "__CC_TRACE_VERSION__", generatedAt: "__CC_TRACE_GENERATED_AT__" };
</script>
```

### `generateHTML()` behavior

| ID | Given | Expect |
|---|---|---|
| C-V-01 | `package.json` has `"version": "0.2.2"` and `generateHTML()` is called at 2026-04-26T14:33:01Z | Output HTML contains `window.ccTraceMeta = { version: "0.2.2", generatedAt: "2026-04-26T14:33:01Z" };` (or a timestamp matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$` for tests that mock or skip exact-time assertions) |
| C-V-02 | `generateHTML()` runs twice with the same JSONL | Both outputs embed the same `version` value (deterministic) and embed timestamps that may differ (each captured at its own call time) |
| C-V-03 | Template missing on disk (fallback inline path) | Inline-template fallback also includes a `window.ccTraceMeta` script with the same shape (no silent omission) |

## Live-mode contract

### `GET /api/status` response shape

Existing fields are preserved; two are added:

```json
{
  "id": "...",
  "startedAt": "2026-04-26T14:33:01.000Z",
  "pairCount": 42,
  "jsonlPath": "...",
  "htmlPath": "...",
  "version": "0.2.2",
  "startedAtIso": "2026-04-26T14:33:01.000Z"
}
```

Note: `startedAt` (existing) is the `Session.startedAt` ISO string (capture session start). `startedAtIso` (new) is the live-server start time. They MAY be equal in normal runs but are conceptually distinct; the spec ties version display to live-server start, not capture start.

### Behavior

| ID | Given | Expect |
|---|---|---|
| C-V-04 | Live server started, no captures yet | `GET /api/status` returns `version` matching `package.json` and `startedAtIso` matching the start time |
| C-V-05 | Live server restarted | `startedAtIso` reflects the new start time |
| C-V-06 | Frontend mounts in live mode (no `window.ccTraceMeta`) | `<VersionLabel>` fetches `/api/status` once, hydrates `window.ccTraceMeta`, and renders `<version> · <timestamp>` |

## Frontend rendering contract

### `<VersionLabel>` component

Single component used by both modes.

- Reads `window.ccTraceMeta` synchronously on first render.
- If absent (live mode, pre-fetch), renders an empty placeholder element (no flash of `undefined`), then fetches `/api/status` and re-renders once meta is hydrated.
- Renders text: `${version} · ${generatedAt}` inside a `.version-label` element.
- Location in the DOM: inside `<header className="masthead">` `masthead-meta` block, alongside the existing "Listening / Archived" label.

### Visual

- All colors and spacing via existing or new CSS variables in `frontend/styles.css`.
- The label is a non-interactive text element in v1 (no click target). Acceptance Scenario 3 of US2 is satisfied because hovering shows the full text natively (no truncation in v1).

## Privacy

Neither `version` nor `generatedAt` contains user-identifying data. Constitution Principle I is satisfied without further redaction.
