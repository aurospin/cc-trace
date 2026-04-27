# Quickstart: Cross-Tab Pair-Number Correlation

End-to-end manual verification recipe. Use after `/speckit-implement` to confirm SC-001…SC-005 hold.

## Prerequisites

- macOS with Node ≥ 20
- `cc-trace` built locally (`npm run build`)
- A working Claude binary on PATH (or `--claude-path` ready)

## Setup

```sh
cd ~/path/to/cc-trace
npm run build
mkdir -p /tmp/cc-trace-qa && cd /tmp/cc-trace-qa
```

## Scenario 1 — Static report cross-tab navigation (SC-001, SC-002)

1. **Capture** a session with at least 5 conversation turns, including at least one single-message warm-up:
   ```sh
   cc-trace attach --output-dir .
   # In the spawned Claude session: ask 5+ questions, then exit
   ```
2. Open the generated `.html` report in a browser.
3. **Transcript tab** — note any visible Turn label (e.g. `Turn 03`).
4. **Pairs tab** — confirm a row labelled `Pair 03` is visible. Confirm its URL/status matches what Transcript showed.
5. **JSON tab** — confirm a section header `Pair 03`. Confirm its request body matches.
6. **PASS** if all three labels match and resolution is < 3 s of visual scan.

## Scenario 2 — Filter toggle stability (SC-004)

1. With the same report open, switch to Transcript tab.
2. Note the current visible Turn labels (e.g. `Turn 02, 03, 05, 06`).
3. Toggle "Include single-message turns" ON.
4. **PASS** if previously hidden turns appear with their pre-assigned numbers (e.g. `Turn 01, 04, 07`) and **no** existing turn's number changes.
5. Toggle the checkbox OFF again. PASS if numbers revert to step 2 exactly.

## Scenario 3 — StatsBlock alignment (SC-003)

1. With the same report open, look at the StatsBlock `turns` value at the top of the page.
2. Count visible Transcript rows with the filter ON.
3. **PASS** if `turns` equals that count.
4. Toggle the filter to OFF.
5. **PASS** if `turns` updates to the new visible row count.

## Scenario 4 — Pairs/JSON show pairs hidden from Transcript (FR-007)

1. With the filter ON in Transcript (single-message warm-ups hidden), note that Transcript shows a non-contiguous Turn sequence.
2. Switch to Pairs tab. **PASS** if Pairs shows EVERY captured pair, including those missing from Transcript, with a contiguous `Pair 01, 02, ...` sequence.
3. Switch to JSON tab. **PASS** if every section is present with matching `Pair NN` headers.

## Scenario 5 — Live-mode pending/hydrate (FR-011)

1. Start a live session in one terminal:
   ```sh
   cc-trace attach --output-dir .
   ```
2. In the spawned Claude, send a request that produces a slow streaming response (e.g. ask for a long essay).
3. Immediately switch to the live dashboard browser tab.
4. **PASS** if the Pairs tab shows a row with `Pair NN` and a "pending" placeholder *before* the response completes in Transcript.
5. **PASS** if the same row hydrates in place when streaming finishes — the index does NOT change between pending and hydrated states.

## Scenario 6 — Aborted in-flight pair (FR-012)

1. Start a live session.
2. In the spawned Claude, send a long-running request, then immediately Ctrl+C to abort the Claude process while the request is in-flight.
3. Restart `cc-trace attach` with a new `--output-dir`.
4. Open the report from the *aborted* session (the JSONL written to disk).
5. **PASS** if the Pairs/JSON tabs show the in-flight pair as `Pair NN — aborted`.
6. **PASS** if the assigned index is permanently allocated (next captured session continues from the next number — there should be a JSONL record for the aborted pair with `status: "aborted"`).

## Scenario 7 — Round-trip parity (SC-005)

1. View any session live in the dashboard. Note the highest `Pair NN` shown.
2. Exit the Claude process — the HTML report is generated.
3. Open the HTML report.
4. **PASS** if every pair has the same `Pair NN` label as it had live.

## Scenario 8 — Legacy JSONL compatibility (back-compat)

1. Take a JSONL file from a v0.3.x capture (no `pairIndex` field).
2. Run `cc-trace report old-session.jsonl --output /tmp/old.html`.
3. Open `/tmp/old.html`.
4. **PASS** if every pair has a `Pair NN` label derived from line order (`Pair 01` for line 1, etc.).

## Failure modes to watch for

| Symptom | Likely cause |
|---------|--------------|
| Toggle changes existing Turn numbers | Transcript renumbering instead of skipping (FR-005 violation) |
| Pairs tab missing a row Transcript skipped | Filter applied incorrectly to Pairs/JSON (FR-007 violation) |
| StatsBlock says `turns: 18` but Transcript shows 12 rows | `stats.ts` still using `includeAll: true` (FR-009 / SC-003 violation) |
| Pending row in Pairs disappears when response arrives instead of hydrating in place | Broadcaster sending a fresh row instead of the same `pairIndex` (FR-011 violation) |
| Aborted pair shows no record in JSONL after Ctrl+C | Shutdown handler not flushing pending pairs (proxy-events contract Decision 3 violation) |
| Two records share a `pairIndex` | Counter reset bug or concatenated files; loader MUST throw (Principle V) |
