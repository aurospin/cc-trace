# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quality Gates
- 100% unit coverage on `src/` (excludes `frontend/`, `proxy/server.ts`, `proxy/forwarder.ts`, `live-server/server.ts` — covered by integration/E2E)
- No `any`, `@ts-ignore`, or `as unknown as X` — narrow `unknown` with type guards
- No `console.log` in `src/` — use `process.stdout.write` / `process.stderr.write`
- Public functions: JSDoc with `@param` / `@returns`
- Biome zero-warning, single-concern PRs, Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`)

Pre-commit: `npm run lint && npm run typecheck && npm run test:unit`

## Commands

```bash
npm run build         # tsc + copy template.html + vite (frontend) → dist/
npm run test          # unit + integration + e2e
npm run test:unit     # 100% coverage enforced
npm run test:watch    # unit watch mode
npm run lint[:fix]    # Biome check / auto-fix
npm run typecheck     # tsc --noEmit
npx vitest run tests/unit/<file>.test.ts   # single test file
```

## Architecture

`cc-trace attach` runs proxy + live server + spawned Claude in one Node process. Claude inherits `HTTPS_PROXY=http://localhost:<random>` and `NODE_EXTRA_CA_CERTS=~/.cc-trace/ca.crt`. The proxy terminates TLS with a CA-signed leaf cert per host (in-memory cache), forwards to upstream, and emits `'pair'` events consumed by the JSONL writer and WebSocket broadcaster. On Claude exit, `report/html-generator.ts` embeds JSONL + IIFE bundle into `template.html` → self-contained `.html`.

### Modules

| Module | Responsibility |
|---|---|
| `proxy/server.ts` | HTTP CONNECT handler; TLS termination; emits `'pair'` events |
| `proxy/cert-manager.ts` | `ensureCA()` + `getCert(host)` — pure Node `crypto`, no `openssl` CLI |
| `proxy/forwarder.ts` | Forward to upstream; gzip/deflate/br decode; SSE → `body_raw`, JSON → `body`; redacts `Authorization` to `bearer sk-ant-...XXXX` |
| `logger/session.ts` | Names files `session-YYYY-MM-DD-HH-MM-SS.{jsonl,html}` |
| `logger/jsonl-writer.ts` | Touches the file on construction (so empty sessions still produce a report); appends pairs synchronously |
| `live-server/{server,broadcaster}.ts` | Express + WS (`GET /`, `/api/pairs`, `/api/status`, `WS /ws`); in-memory history for reload |
| `report/html-generator.ts` | Base64-encode pairs into `dist/report/template.html`; inline minimal fallback if missing — keep `build:assets` in build |
| `shared/{types,conversation}.ts` | Imported by **both** backend and Vite frontend bundle — keep Node-free. `parseHttpPairs` groups by system+model; `assembleStreaming` parses SSE → `AssembledMessage` |
| `cli/options.ts` | `parseArgs` throws `CliHelpDisplayed` for `--help`/`--version` (caller exits 0); rethrows all other Commander errors (caller exits 1). **Never collapse the catch into "return defaults"** — that silently runs `attach` on typos |
| `frontend/styles.css` | Theming via CSS vars on `:root[data-mode="static"\|"live"]`. Components reference vars only — never literal colors |
| `frontend/App.tsx` | Sets `documentElement.dataset.mode` from `window.ccTraceData` presence |
| `frontend/components/*` | `ConversationView` (three-col transcript: global Turn #, per-turn `<TokenMeter>`, auto-labeled exhibits), `JsonView` (depth-indented collapsible tree + filter), `RawPairsView` (tabular pair list), `TokenMeter` (stacked bar from JSON or SSE usage) |
| `frontend/hooks/useWebSocket.ts` | No-op when `wsUrl === null` (static mode — `file://` has empty host) |

### Two filters (easy to confuse)
1. **Capture** (`attach.ts`): keep `/v1/messages` with `messages.length >= 1`. `--include-all-requests` disables.
2. **Display** (`parseHttpPairs`): defaults to `>= 3`; UI "Include single-message turns" checkbox flips this and **defaults on** so first prompts render. Pairs and JSON tabs ignore this filter.

### Two render modes (same component tree)

| `window.ccTraceData` | `data-mode` | WebSocket | Aesthetic |
|---|---|---|---|
| present (HTML report, `file://`) | `static` | hook returns null | Bound Transcript — paper, deep ink, grain |
| absent (live dashboard) | `live` | `ws://${location.host}` | Wire Room — graphite, phosphor amber, scanlines |

### Self-contained HTML report
Vite uses `assetsInlineLimit: 200kb` so all `@fontsource` woff2 files inline as data URIs into the IIFE — opens from `file://` with no external requests. Audit bundle size before raising the limit.

## Tests

```
tests/unit/         mock all I/O; 100% coverage required
tests/integration/  real HTTPS to local test servers; no Anthropic API
tests/e2e/          mock-claude.ts + mock-api.ts; full attach lifecycle
```

## Constraints

- **macOS only** (`"os": ["darwin"]`), **Node ≥ 20** (uses `node:crypto`)
- **Auth redaction** truncates `Authorization` before logging — never log full keys
- **No literal colors in components** — all colors via CSS vars in `styles.css`
- **No frontend runtime deps beyond React** — JSON tree, TokenMeter, transcript layout are hand-written. Don't add Tailwind / shadcn / react-json-view without approval

## Design Spec

`docs/superpowers/specs/2026-04-26-cc-trace-design.md`
