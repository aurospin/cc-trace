# Quickstart: Verifying Session Stats, Version, and JSON Tab Improvements

This is the manual smoke test for the feature, run after `/speckit-implement` produces a build. It pairs with the unit tests in `tests/unit/stats.test.ts` and `tests/unit/json-path.test.ts` and the integration assertion in `tests/integration/live-server.test.ts`.

## Prerequisites

```bash
nvm use            # Node ≥ 20
npm install
npm run build      # tsc + copy template.html + vite (frontend)
```

## 1 — Static HTML report

Use any existing `.jsonl` from a prior `cc-trace attach` session, or capture a quick one:

```bash
# Generate a fresh session
./dist/cli/index.js attach -- claude --print "say hi"
# (let it complete; .cc-trace/session-*.html will be written on exit)

open .cc-trace/session-*.html
```

**Verify:**

- [ ] Header shows a stats block (one line) with: turn count, request count, per-method breakdown (`POST: N / GET: M`), and six token pills (`cache_read`, `cache_creation_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `input`, `output`).
- [ ] All numeric values use `en-US` thousands separators (e.g., `1,234`, never `1.2k`).
- [ ] The version label `<version> · <iso-timestamp>` appears in the masthead (e.g., `0.2.2 · 2026-04-26T14:33:01Z`).
- [ ] Switching tabs (Transcript / Pairs / JSON) does NOT hide the stats block or the version label.
- [ ] Open DevTools → Network. Reload. There MUST be zero outbound requests after the file:// load completes.

## 2 — Live dashboard

```bash
./dist/cli/index.js attach -- claude --print "summarize the spec at specs/001-stats-version-json-ui/spec.md"
```

The dashboard auto-opens. **Verify:**

- [ ] Stats block appears at the top with the same layout as the static report.
- [ ] As pairs stream in, counts and token totals update live.
- [ ] Updates throttle to roughly 4/second during the streaming response (no UI thrash).
- [ ] On stream completion, the final snapshot exactly matches the static report's totals.
- [ ] The version label shows the same `<version> · <iso-timestamp>` format. Visit `http://localhost:<port>/api/status` directly — the JSON includes `version` and `startedAtIso` fields.

## 3 — JSON tab improvements

In either the static report or the live dashboard, click the **JSON** tab.

**Verify:**

- [ ] Persistent breadcrumb bar at the top shows `$` initially. Hover any node — the bar updates to that node's dot/bracket path. Click the bar — the path is copied (paste anywhere to confirm).
- [ ] Layout: per pair, **Request** tree appears above **Response** tree. Each has a sticky label header that remains visible while scrolling.
- [ ] Each tree has its own **Expand all** / **Collapse all** buttons. Operating the Request tree's controls does NOT change the Response tree's state, and vice versa.
- [ ] Single filter input + target toggle (`Both` / `Request` / `Response`). Switch between targets — the filter expression persists; the unscoped tree shows fully (no de-emphasis).
- [ ] Hover any leaf row — a copy button appears. Click it — the raw value is copied (strings without quotes, numbers/booleans/null as JSON literals).
- [ ] Hover any object/array row — copy button appears. Click — pretty-printed JSON (2-space indent, trailing newline) is copied.
- [ ] Selecting a different pair resets that pair's expand/collapse state; the filter expression and target toggle persist.

## 4 — Edge cases

- [ ] **Empty session**: capture nothing (Ctrl-C immediately). Open the generated `.html`. Stats block renders with all-zero values; version label still shows.
- [ ] **Missing usage fields**: confirm with an older payload (or a synthetic JSONL line) that any token pill missing from the payload renders as `0`, not blank.
- [ ] **Failed request**: capture with `--include-all-requests` against a URL that returns 4xx/5xx. The pair counts toward `requestCount` and the per-method breakdown but contributes `0` to all six token totals. *(Flag renamed to `--conversations-only` in v0.3.4; default is now capture-all so this scenario fires without any flag.)*
- [ ] **Large body**: navigate to the JSON tab on a pair > 1 MB pretty-printed. Click Expand all on the Response tree — UI remains responsive (no lockup beyond ~1 s).
- [ ] **Live reconnect**: stop and restart the dashboard's WebSocket (e.g., temporarily kill the proxy). On reconnect, stats reconcile to the same totals a fresh page load would show; no double-counting.

## 5 — Quality gates

```bash
npm run lint
npm run typecheck
npm run test:unit          # 100% coverage on src/, must pass
npm run test:integration   # /api/status payload assertion
npm run test:e2e           # generated .html embeds version
```

All five MUST be green before declaring the feature done.
