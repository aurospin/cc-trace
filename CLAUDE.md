# CLAUDE.md

Operational guidance for Claude Code in this repo. Principles and rationale live in `.specify/memory/constitution.md`; this file holds the *what* — commands, paths, numbers.

## Quality Gates

Every test tier MUST pass 100%. Coverage:
- **Unit**: 100% on `src/`. Exclusions (`.tsx`, React hooks/reducers, I/O entry points) live in `vitest.config.ts` — the source of truth; do not duplicate the list here.
- **Integration**: 100% on what unit excludes.
- **E2E**: ≥70%.

Code rules:
- No `any`, `@ts-ignore`, `as unknown as X`, or inline `as { ... }` shape casts — narrow `unknown` via the named guards in `src/shared/guards.ts` (add new guards with paired accept/reject tests)
- No `console.log` in `src/` — use `process.stdout.write` / `process.stderr.write`
- Public functions: JSDoc `@param` / `@returns`
- Biome: zero warnings
- Commits: Conventional prefixes (`feat:`, `fix:`, `test:`, `chore:`, `docs:`)

Pre-commit: `npm run lint && npm run typecheck && npm run test:unit`

## Working Norms

Follow the four norms in [Constitution Principle VI](.specify/memory/constitution.md): think first, simplicity, surgical changes, goal-driven execution.

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
| `report/template.ts` | `substituteTokens(tpl, repl)` — sorts keys by length desc to avoid `__FOO__` / `__FOOBAR__` crosstalk |
| `shared/types.ts` | Cross-tier type declarations — Node-free, no runtime code |
| `shared/version.ts` | Reads `package.json` once and exports `PKG_VERSION` literal — single source for live server + HTML report |
| `shared/guards.ts` | `(x: unknown) => x is T` type guards used at every module boundary in lieu of inline `as { ... }` casts. Each guard has paired accept/reject unit tests |
| `cli/options.ts` | `parseArgs` throws `CliHelpDisplayed` for `--help`/`--version` (caller exits 0); rethrows all other Commander errors (caller exits 1). **Never collapse the catch into "return defaults"** — that silently runs `attach` on typos |
| `frontend/styles.css` | Theming via CSS vars on `:root[data-mode="static"\|"live"]`. Components reference vars only — never literal colors |
| `frontend/App.tsx` | Sets `documentElement.dataset.mode` from `window.ccTraceData` presence |
| `frontend/conversation/*` | `ConversationView` container + `TurnRow` + `ExhibitList` + `TokenMeter`. `conversation.ts` (pure): `parseHttpPairs` groups by system+model, `assembleStreaming` parses SSE → `AssembledMessage` |
| `frontend/jsonView/*` | `JsonView` container + `JsonTree` + `JsonNode` (recursive renderer) + `JsonBreadcrumb` + `jsonViewReducer`. `json-path.ts` (pure): segment formatting + clipboard payload |
| `frontend/stats/*` | `StatsBlock` + `useThrottledStats` hook. `stats.ts` + `throttle.ts` (pure): `computeStats`, `nextRecompute` scheduler |
| `frontend/rawPairs/RawPairsView.tsx` | Tabular pair list |
| `frontend/versionLabel/*` | `VersionLabel` + `useWebSocket` (no-op when `wsUrl === null`, e.g. `file://`) + `useWsReconnects` |

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
tests/unit/         mock all I/O
tests/integration/  real HTTPS to local test servers; no Anthropic API
tests/e2e/          mock-claude.ts + mock-api.ts; full attach lifecycle
```

## Constraints

- **macOS only** (`"os": ["darwin"]`), **Node ≥ 20** (uses `node:crypto`)
- **No literal colors in components** — all colors via CSS vars in `styles.css`
- **No frontend runtime deps beyond React** — JSON tree, TokenMeter, transcript layout are hand-written. Don't add Tailwind / shadcn / react-json-view without approval

## Security

- **Credential redaction**: `Authorization` and `x-api-key` truncated in `proxy/forwarder.ts` before any sink (verified by `forwarder.test.ts`).
- **Untrusted-payload rendering**: HTML report embeds pairs as base64 → `atob()` → `JSON.parse()` in a single `<script>`. Never interpolate captured strings into HTML, attributes, or `eval`-equivalents — a captured `<script>` in tool input is stored XSS against any reader.
- **CA custody**: `~/.cc-trace/ca.key` MUST be `0600` (enforced in `proxy/cert-manager.ts`). Compromise = host-wide TLS forgery; never embed in JSONL, reports, logs, or error messages.
- **Dependency review**: new runtime dep → justify in spec, run `npm audit`, resolve High/Critical, audit install-scripts and ownership churn before merge.

### Repo & release hygiene

- **Captures stay out of git**: `.gitignore` excludes `.cc-trace/`, `.env*`, `dist/`, `.claude/` — keep them so. Don't `git add -A` after running the proxy in-repo.
- **Fixtures are synthetic**: any `tests/**/fixtures/*.jsonl` MUST be hand-built or redacted, never a verbatim capture.
- **npm publish surface**: `package.json` `"files"` is the allowlist (`dist`, `README.md`, `LICENSE`). Verify with `npm pack --dry-run` before every release — zero matches for `tests/`, `specs/`, `.specify/`, `CLAUDE.md`.
- **Pre-publish sweep**: grep working tree for `sk-ant-…`, `Bearer …`, real customer names in `specs/`.
- **Signed tags + scoped CI**: `git tag -s` for releases. Future GitHub Actions on fork PRs MUST use `pull_request` (no secrets), never `pull_request_target` with PR checkout.

## Design Spec

`docs/superpowers/specs/2026-04-26-cc-trace-design.md`

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/002-structural-refactor/plan.md`
<!-- SPECKIT END -->
