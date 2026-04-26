# cc-trace

## Quality Gates
- Every new function in src/ must have a unit test — no exceptions
- Unit test coverage must remain at 100% — run `npm run test:unit` before committing
- Never use `any` in TypeScript — use `unknown` and narrow with type guards
- No `console.log` in src/ — use process.stdout.write or structured output only in CLI entry
- All public functions must have JSDoc with @param and @returns
- Biome must pass with zero warnings — run `npm run lint` before committing
- All tests must pass locally before pushing — run `npm test`
- Commits follow Conventional Commits: feat:, fix:, test:, chore:, docs:
- PRs must be single-concern — one feature or fix per PR
- No `@ts-ignore`, no `as unknown as X` escape hatches

## Commands
- `npm run test:unit` — unit tests with 100% coverage enforcement
- `npm run test:integration` — integration tests (no Anthropic API needed)
- `npm run test:e2e` — full pipeline with mock claude + mock API
- `npm run lint` — Biome lint + format check
- `npm run typecheck` — TypeScript type check
- `npm run build` — compile TypeScript + bundle frontend

## Architecture
See docs/superpowers/specs/2026-04-26-cc-trace-design.md
