# Phase 0 — Research

Three open layout questions remained after `/speckit-clarify`. Each is resolved here so Phase 1 has unambiguous inputs.

## R1 — Where do `useWebSocket.ts` and `useWsReconnects.ts` live?

**Question**: By the strict-shared rule (clarification Q2 → A), a single-consumer module moves into the owner's feature folder. Today `useWebSocket` is consumed only by `useWsReconnects`, and `useWsReconnects` is consumed only by `VersionLabel`. Strict reading → both move into `src/frontend/versionLabel/`. But `useWebSocket` is a generic primitive (WebSocket connection + reconnect counter) that is plausibly the next thing a future feature would import.

**Decision**: Move both into `src/frontend/versionLabel/`. Apply the rule literally as Q2 dictated. If a future feature needs the WebSocket primitive, that feature's PR promotes it to `src/shared/` (or `src/frontend/shared/`) at the moment a second importer actually exists — not in anticipation.

**Rationale**: The clarification answer was explicit ("anticipated future use does not qualify"). Promoting now to "maybe-shared" purgatory contradicts the rule and creates a folder ambiguity (is `frontend/hooks/` a feature folder or not?). Better to delete `frontend/hooks/` entirely and force the next contributor to make the explicit promotion decision.

**Alternatives considered**:
- *Keep `frontend/hooks/`*: Contradicts strict rule; perpetuates a kind-folder under a feature-folder layout.
- *Move to `src/shared/`*: Violates "actual second importer required."
- *Introduce `src/frontend/shared/` for frontend-only multi-feature primitives*: Premature — there is no second importer.

## R2 — Where does `frontend/window.d.ts` live?

**Question**: It declares ambient typings for `window.ccTraceData` (used by `App.tsx`) and `window.ccTraceMeta` (used by `VersionLabel.tsx`). Two consumers across two features — does it move, split, or stay?

**Decision**: Stays at `src/frontend/window.d.ts`. It is a TypeScript ambient declaration scoped to the entire frontend bundle, not a runtime module. Treating it as feature-owned would force an ambient declaration into a feature folder where TypeScript's automatic discovery rules are surprising.

**Rationale**: Ambient `.d.ts` files are infrastructure for the whole compilation unit — they are not "imported" in the normal sense and don't fit the feature-folder rule's "single importer" criterion. The `tsconfig.json` `include` glob picks them up regardless of location, but contributor convention is to keep ambient declarations near the entry point.

**Alternatives considered**:
- *Split per feature (`versionLabel/window.d.ts`, etc.)*: Hides global state across folders; harder to audit "what does cc-trace put on `window`?"
- *Move to `src/shared/`*: It's frontend-only by definition (declares browser globals); doesn't belong in cross-boundary shared.

## R3 — How is CSS organized after feature folders exist?

**Question**: Constitution Principle III mandates a single component tree with theming via CSS variables on `:root[data-mode]`. Today all CSS lives in `src/frontend/styles.css` (one global file). Should US3 split it into `feature/feature.css` partials imported by each component?

**Decision**: Keep `src/frontend/styles.css` as a single global file. US3 does NOT split CSS. Each feature folder MAY contain a one-line comment in its README-equivalent location (just a comment at the top of the main component file is fine) noting "Styles for this feature live in `../styles.css` under the `.feature-class-prefix-*` rules."

**Rationale**:
- The current CSS uses cascade rules (e.g., `.json-row:hover .json-copy { opacity: 1 }`) and CSS-variable inheritance from `:root[data-mode]`. Splitting risks accidentally creating mode-specific stylesheets, which violates Principle III.
- Vite's CSS handling would inline each `*.css` import as a separate `<style>` block in dev and concatenate in prod — fine functionally but more files for no behavior win.
- `styles.css` is currently ~600 LOC and is not on the FR-003 list (FR-003 excludes non-source assets — `template.html` and bundles — and stylesheets are similar infrastructure).

**Alternatives considered**:
- *CSS Modules*: Adds a frontend dependency (vetoed by `CLAUDE.md`).
- *Per-feature `.css` partial imported by the component*: Risks fragmenting the single themer; minor benefit.
- *Tailwind*: Explicitly forbidden by `CLAUDE.md`.

---

## Re-evaluated Constitution Check (post-Phase-0)

| Principle | Compliance | Change since pre-Phase-0 |
|---|---|---|
| I. Privacy at the Boundary | PASS | None. |
| II. Self-Contained Artifacts | PASS | R3 keeps a single CSS file → bundle structure unchanged. |
| III. One Component Tree, Theme via Variables | PASS | R3 explicitly preserves the single themer. |
| IV. Test Tiers Have Contracts | PASS | None. |
| V. Fail Loud, Never Silently Default | PASS | None. |
| VI. Cautious by Default | PASS | R1, R2, R3 each pick the option that defers anticipatory abstraction. |

**Post-Phase-0 Constitution Check: PASS — proceed to Phase 1 design.**
