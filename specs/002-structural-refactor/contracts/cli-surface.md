# CLI Surface Contract — FROZEN by FR-009

This contract is the binding behavioral surface that every refactor PR MUST preserve. The `tests/e2e/attach.test.ts` suite exercises this contract; if any item below changes, the e2e suite fails — that failure is the gate.

## Commands

| Command | Behavior | Exit code |
|---|---|---|
| `cc-trace attach -- <claude-cmd...>` | Spawn `<claude-cmd>` with `HTTPS_PROXY=http://localhost:<random>` and `NODE_EXTRA_CA_CERTS=~/.cc-trace/ca.crt` set. Capture `/v1/messages` traffic (default filter: `messages.length >= 1`), append to `~/.cc-trace/sessions/session-YYYY-MM-DD-HH-MM-SS.jsonl`, render HTML report on Claude exit. | 0 on clean Claude exit; non-zero if proxy start fails. |
| `cc-trace --help` | Print help text via Commander; do not start proxy or spawn anything. | 0 |
| `cc-trace --version` | Print `package.json` version; do not start proxy. | 0 |
| `cc-trace <unrecognized>` | Print Commander error; do NOT silently fall through to `attach`. | non-zero (Principle V) |

## Flags on `attach`

- `--include-all-requests` — disables the `messages.length >= 1` capture filter. *(Renamed to `--conversations-only` with inverted default in v0.3.4: capture-all is now the default; the flag opts into the filter.)*
- (any other current flag) — preserved verbatim. The exhaustive list lives in `src/cli/options.ts`; the e2e suite enumerates the ones it asserts on.

## Environment variables (set on spawned Claude process)

- `HTTPS_PROXY=http://localhost:<random>` — random port chosen by the proxy at start.
- `NODE_EXTRA_CA_CERTS=<path-to-CA>` — points at the cc-trace CA cert (created by `proxy/cert-manager.ts:ensureCA()` on first run).

## On-disk artifacts

- `~/.cc-trace/ca.crt` and `~/.cc-trace/ca.key` — created on first run, reused thereafter.
- `~/.cc-trace/sessions/session-YYYY-MM-DD-HH-MM-SS.jsonl` — append-only during session.
- `~/.cc-trace/sessions/session-YYYY-MM-DD-HH-MM-SS.html` — written once on Claude exit; self-contained.

## What MAY change in this refactor

Internal implementation: file paths, function names, module boundaries, type guards. Nothing user-observable.

## What MUST NOT change

Every row in this document. Verified by `tests/e2e/attach.test.ts`.
