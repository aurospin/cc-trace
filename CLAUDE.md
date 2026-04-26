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
npm run build           # tsc (backend) + copy template.html + vite (frontend) → dist/
npm run build:assets    # copy src/report/template.html → dist/report/ (run by build)
npm run build:frontend  # vite build only (IIFE bundle, fonts inlined)
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
| `proxy/forwarder.ts` | Forward to upstream; `decodeBody()` handles `gzip`/`deflate`/`br`; SSE (`body_raw`) vs JSON (`body`); redact `Authorization` header |
| `logger/session.ts` | `startSession()` — resolve output dir, name files `session-YYYY-MM-DD-HH-MM-SS.{jsonl,html}` |
| `logger/jsonl-writer.ts` | `createWriter(path)` — atomic JSONL append factory |
| `live-server/server.ts` | Express + WS: `GET /`, `GET /api/pairs`, `GET /api/status`, `WS /ws` |
| `live-server/broadcaster.ts` | `createBroadcaster()` — fan-out to WS clients + in-memory history for page reload |
| `shared/types.ts` | Central types: `HttpPair`, `Session`, `Config`, `Conversation`, `AssembledMessage` |
| `shared/conversation.ts` | `parseHttpPairs()` groups pairs into conversations; `assembleStreaming()` parses SSE → `AssembledMessage` |
| `report/html-generator.ts` | Base64-encode pairs, inject into `template.html` → single `.html` file. Falls back to inline template if `dist/report/template.html` is missing — keep `build:assets` in the build pipeline so the real template is used |
| `cli/commands/attach.ts` | Orchestrates full capture lifecycle (see design spec for exact sequence) |
| `frontend/styles.css` | Single source of truth for theming: CSS variables under `:root[data-mode="static"\|"live"]`. Components reference variables only — never literal colors |
| `frontend/App.tsx` | Sets `document.documentElement.dataset.mode` once at boot based on `window.ccTraceData`; renders masthead, tabs, error boundary |
| `frontend/components/ConversationView.tsx` | Three-column transcript: left rail (turn # + per-turn `<TokenMeter>`), center body (speaker rules), right margin (auto-labeled "Exhibit A/B/…" for `tool_use` blocks; `tool_result` shows `re: Exhibit X`) |
| `frontend/components/TokenMeter.tsx` | `extractUsage(pair)` reads usage from JSON or SSE `message_start`/`message_delta`. Renders stacked bar: cache_read \| cache_creation \| input \| output |
| `frontend/components/JsonView.tsx` | Custom collapsible JSON tree; live filter with match count; hover-reveals JS path; click-to-copy. No external deps |
| `frontend/components/RawPairsView.tsx` | Tabular pair list (status · method · URL · time); click row to expand raw JSON |
| `frontend/hooks/useWebSocket.ts` | Null-safe live stream hook — when `wsUrl === null` the hook is a no-op (used in static mode where `file://` has empty host) |

**Two independent filters** — easy to confuse:

1. **Capture filter** (CLI, `attach.ts`): `pair.request.url.includes("/v1/messages") && messageCount >= 1`. Skips MCP/auth bootstrap pairs that have no `messages`. `--include-all-requests` disables and writes every pair to JSONL.
2. **Display filter** (UI, `parseHttpPairs` in `shared/conversation.ts`): defaults to `messageCount >= 3`; the UI's "Include single-message turns" checkbox flips this and **defaults to on** so first prompts render. The Pairs and JSON tabs ignore this filter entirely.

**Two render modes** — same component tree, different skin:

| `STATIC_DATA` (i.e. `window.ccTraceData`) | `data-mode` | WebSocket | Aesthetic |
|---|---|---|---|
| present (HTML report opened from `file://`) | `static` | disabled (hook receives `null`) | Bound Transcript — paper, deep ink, grain overlay |
| absent (live dashboard) | `live` | `ws://${window.location.host}` | Wire Room — graphite, phosphor amber, scanlines, fresh-pair sweep |

**Shared between backend and frontend:** `src/shared/conversation.ts` and `src/shared/types.ts` are imported by both the Node backend and the Vite-bundled React frontend — keep them free of Node-only APIs.

**Self-contained HTML report:** Vite is configured with `assetsInlineLimit: 200kb` so all `@fontsource` woff2 files are inlined as data URIs into the IIFE. The report opens directly from `file://` with no external requests. If you add larger assets, audit the bundle size before raising the limit.

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
- **No literal colors in frontend components** — every color must come through a CSS variable in `styles.css`. A new theme is a CSS-only change
- **Frontend has no runtime deps beyond React** — JSON tree, token meter, transcript layout are all hand-written. Don't add Tailwind, shadcn, react-json-view, etc. without explicit approval; they would dilute the bundle and the aesthetic

## Design Spec

Full architecture decisions and component specs: `docs/superpowers/specs/2026-04-26-cc-trace-design.md`
