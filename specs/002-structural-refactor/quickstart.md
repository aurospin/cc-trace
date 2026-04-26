# Quickstart — Per-PR Validation Checklist

Run this checklist on each user-story PR before requesting merge into `002-structural-refactor`. Every box must be checked. The list is short by design — the test suite is the binding contract; this checklist catches the few things tests can't.

## Every PR (US1, US2, US3, US4)

- [ ] `npm run lint` exits 0 with zero warnings.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:unit` exits 0; coverage stays at 100% line+branch on `src/` (with the exclusions `vitest.config.ts` enumerates).
- [ ] `npm run test` exits 0 (unit + integration + e2e); pass count equals or exceeds the merge-base pass count on `002-structural-refactor`.
- [ ] No test assertion was modified (only `import` paths). Verified by `git diff --stat origin/002-structural-refactor -- tests/` showing only path-line changes in non-`describe`/`it` lines, OR by an explicit PR-description note for any deviation (per Edge Cases in spec).
- [ ] `grep -rnE "^import .* from \"\.\./\.\./" tests/` produces no broken imports (run the suite to confirm).
- [ ] No new runtime dependencies in `package.json`.
- [ ] PR description identifies which user story this is (US1, US2, US3, or US4) so SC-007 holds.

## US1-specific

- [ ] `wc -l $(git ls-files 'src/**/*.ts' 'src/**/*.tsx')` shows no file exceeding 300 LOC; for any file in 251–300, the PR description names the irreducible responsibility.
- [ ] `tests/e2e/bundle-size.test.ts` exists and is green.
- [ ] `spec.md` Assumptions section's `Bundle-size baseline (FR-011 / SC-006)` placeholder has been replaced with `Baseline: NNNNN bytes (commit <sha>, fixture <path>)`.

## US2-specific

- [ ] `grep -rn "PKG_PATH\|JSON.parse(fs.readFileSync.*package.json" src/` returns matches in exactly one file (`src/shared/version.ts`).
- [ ] `grep -rn "split(\"__CC_TRACE" src/` returns zero matches (substitution chain replaced by `substituteTokens` call).
- [ ] `src/shared/version.ts` and `src/shared/template.ts` have unit tests reaching 100% line+branch.
- [ ] `substituteTokens` unit tests cover: empty map, single token, multiple tokens including overlapping substrings (FR-005).

## US3-specific

- [ ] `ls src/frontend/components/ src/frontend/hooks/` returns "no such file or directory" — both folders deleted.
- [ ] `ls src/shared/` shows only `types.ts`, `version.ts`, `template.ts` (and `guards.ts` after US4).
- [ ] Each of `src/frontend/{conversation,jsonView,rawPairs,stats,versionLabel}/` exists and contains the files listed in `data-model.md` US3 table.
- [ ] `npm run build` succeeds and produces the report bundle; the bundle-size assertion stays green.
- [ ] `vitest.config.ts` exclusion list updated per FR-014 if any moved file changed coverage tier.

## US4-specific

- [ ] `grep -rnE "\bas \{[^}]" src/` (excluding test files) returns zero matches.
- [ ] `src/shared/guards.ts` exists and exports each guard listed in `data-model.md` US4 table.
- [ ] Every guard has a paired accept-and-reject unit test in `tests/unit/guards.test.ts` (or equivalent), reaching 100% line+branch.
- [ ] `npm run typecheck` confirms guard predicates correctly narrow at every former `as`-cast site.

## Final merge to `main` (after all four story PRs land)

- [ ] `npm run test` green.
- [ ] `npm run build` green.
- [ ] Manual smoke: `node dist/cli/index.js attach -- echo hello` produces a valid `.html` report that opens from `file://` with no missing assets.
- [ ] Squash-merge `002-structural-refactor` into `main` per FR-012.
