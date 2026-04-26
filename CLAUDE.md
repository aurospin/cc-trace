# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quality Gates
- Every new function in `src/` must have a unit test — no exceptions
- Unit test coverage must remain at 100% — run `npm run test:unit` before committing
- Never use `any` in TypeScript — use `unknown` and narrow with type guards
- No `console.log` in `src/` — use `process.stdout.write` or structured output only in CLI entry
- All public functions must have JSDoc with `@param` and `@returns`
- Biome must pass with zero warnings — run `npm run lint` before committing
- All tests must pass locally before pushing — run `npm test`
- Commits follow Conventional Commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`
- PRs must be single-concern — one feature or fix per PR
- No `@ts-ignore`, no `as unknown as X` escape hatches

## Commands

```bash
npm run build           # tsc (backend) + vite (frontend) → dist/
npm run test            # unit + integration + E2E
npm run test:unit       # unit tests with 100% coverage enforcement
npm run test:integration
npm run test:e2e
npm run test:watch      # watch mode for unit tests
npm run lint            # Biome lint + format check
npm run lint:fix        # auto-fix lint/format issues
npm run typecheck       # tsc --noEmit
```

To run a single test file:
```bash
npx vitest run tests/unit/conversation.test.ts
```

## Architecture

cc-trace is a single-process MITM proxy that intercepts HTTPS traffic between Claude Code and `api.anthropic.com`. Everything runs in one Node process: proxy, live server, and the spawned Claude child.

**Data flow for `cc-trace attach`:**

```
Claude binary
  → HTTPS_PROXY=http://localhost:<random>
  → NODE_EXTRA_CA_CERTS=~/.cc-trace/ca.crt
      ↓
  proxy/server.ts      HTTP CONNECT → TLS termination via per-domain leaf cert
  proxy/cert-manager.ts              CA lives in ~/.cc-trace/; leaf certs cached in-memory
  proxy/forwarder.ts   forward decrypted request to api.anthropic.com, capture pair
      ↓ emits 'pair' event
  logger/jsonl-writer.ts   atomic append (write tmp → rename) to session-*.jsonl
  live-server/broadcaster.ts   push to all WebSocket clients
      ↓ on Claude exit
  report/html-generator.ts   embed JSONL data + React bundle → self-contained HTML
```

**Module responsibilities:**

| Module | Responsibility |
|---|---|
| `proxy/server.ts` | HTTP CONNECT handler; TLS termination; emits `EventEmitter` with `'pair'` events |
| `proxy/cert-manager.ts` | `ensureCA()` + `getCert(hostname)` — no `openssl` CLI, pure Node `crypto` |
| `proxy/forwarder.ts` | Forward to upstream; handle SSE (`body_raw`) vs JSON (`body`); redact `Authorization` header |
| `logger/session.ts` | `startSession()` — resolve output dir, name files `session-YYYY-MM-DD-HH-MM-SS.{jsonl,html}` |
| `logger/jsonl-writer.ts` | `createWriter(path)` — atomic JSONL append factory |
| `live-server/server.ts` | Express + WS: `GET /`, `GET /api/pairs`, `GET /api/status`, `WS /ws` |
| `live-server/broadcaster.ts` | `createBroadcaster()` — fan-out to WS clients + in-memory history for page reload |
| `shared/types.ts` | Central types: `HttpPair`, `Session`, `Config`, `Conversation`, `AssembledMessage` |
| `shared/conversation.ts` | `parseHttpPairs()` groups pairs into conversations; `assembleStreaming()` parses SSE → `AssembledMessage` |
| `report/html-generator.ts` | Base64-encode pairs, inject into React template → single `.html` file |
| `cli/commands/attach.ts` | Orchestrates full capture lifecycle (see design spec for exact sequence) |
| `src/frontend/` | React SPA; `useWebSocket` hook for live streaming; tabs: Conversations / Raw / JSON |

**Filtering:** By default only pairs where the request body has ≥3 messages are logged (filters out single-turn tool setup calls). `--include-all-requests` disables this.

**Shared between backend and frontend:** `src/shared/conversation.ts` and `src/shared/types.ts` are imported by both the Node backend and the Vite-bundled React frontend — keep them free of Node-only APIs.

## Test Structure

```
tests/
├── unit/          # Pure function tests; 100% coverage required; mock all I/O
├── integration/   # Real HTTPS connections to local test servers; no Anthropic API
└── e2e/
    ├── fixtures/
    │   ├── mock-claude.ts   # Minimal script that makes real HTTPS requests then exits
    │   └── mock-api.ts      # Local HTTPS server with Anthropic-shaped responses
    └── attach.e2e.ts        # Full attach lifecycle: assert JSONL + HTML produced
```

Coverage excludes `src/frontend/**` (React components), `src/proxy/server.ts`, `src/proxy/forwarder.ts`, and `src/live-server/server.ts` from the unit threshold — those are covered by integration/E2E tests.

## Key Design Constraints

- **macOS only** at launch (arm64 + x64); `"os": ["darwin"]` in `package.json`
- **Node ≥ 20** required; uses `node:crypto` for cert generation (no `openssl` CLI)
- **JSONL format** is backward-compatible with `claude-trace` (same field names/structure)
- **Auth redaction:** `Authorization` header value is truncated to `bearer sk-ant-...XXXX` before logging — never log full API keys
- **Atomic JSONL writes:** write to `<file>.tmp` then `fs.rename` to avoid corrupt lines on crash

## Design Spec

Full architecture decisions and component specs: `docs/superpowers/specs/2026-04-26-cc-trace-design.md`
