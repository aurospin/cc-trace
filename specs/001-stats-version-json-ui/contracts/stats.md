# Contract: Session Stats Derivation

**Module**: `src/shared/stats.ts`
**Consumers**: `src/frontend/components/StatsBlock.tsx` (live + static)
**Test**: `tests/unit/stats.test.ts` (100% coverage required)

## Public API

```ts
import type { HttpPair, SessionStats } from "./types.js";

/**
 * Computes session-wide aggregate counts and token totals from raw HttpPair[].
 * Pure: same input always yields the same output. No I/O, no Date.now().
 *
 * @param pairs - all captured pairs (any URL, any status; filtering is internal)
 * @returns SessionStats — see data-model.md for field semantics
 */
export function computeStats(pairs: HttpPair[]): SessionStats;

/**
 * Renders a SessionStats numeric value as `en-US`-grouped digits.
 * Locale is hardcoded so reports render identically across viewer locales.
 *
 * @param n - non-negative integer
 * @returns formatted string, e.g., 1234567 → "1,234,567"
 */
export function formatNumber(n: number): string;
```

## Behavioral guarantees (testable)

### computeStats

| ID | Given | Expect |
|---|---|---|
| C-S-01 | `[]` | `{ turnCount: 0, requestCount: 0, requestsByMethod: { POST: 0, GET: 0 }, tokens: <all zeros> }` |
| C-S-02 | One pair with `request.method = "POST"`, valid `/v1/messages`, JSON response with full `usage` (all six fields populated) | `requestCount: 1`, `requestsByMethod.POST: 1`, `tokens.*` matches the six fields exactly |
| C-S-03 | One pair with `request.method = "GET"` to non-`/v1/messages` URL | `requestCount: 1`, `requestsByMethod.GET: 1`, all `tokens.*` remain `0` |
| C-S-04 | One pair with `response.status_code = 500` and a `usage`-shaped error body | `requestCount: 1`, `tokens.*` all `0` (FR-106a) |
| C-S-05 | One pair with `response = null` | `requestCount: 1`, `tokens.*` all `0`; no throw |
| C-S-06 | Streaming pair (`body_raw` set) with `message_start` carrying `cache_creation.ephemeral_5m_input_tokens: 100` and `cache_creation.ephemeral_1h_input_tokens: 50` and `cache_creation_input_tokens: 25`; `message_delta` with `output_tokens: 10` | `tokens.cacheCreation5m: 100`, `tokens.cacheCreation1h: 50`, `tokens.cacheCreationInput: 25`, `tokens.output: 10` (no merging across the three cache-creation buckets) |
| C-S-07 | JSON pair with only legacy `cache_creation_input_tokens: 42` and no `cache_creation` object | `tokens.cacheCreationInput: 42`, both ephemeral fields `0` |
| C-S-08 | Two streaming pairs each contributing `output_tokens: 5` | `tokens.output: 10` (summed once per message — FR-105) |
| C-S-09 | Mixed: one streaming + one JSON pair, both with full usage | All six token totals are the per-pair sums |
| C-S-10 | Pair with method `"PUT"` (uncommon) | `requestsByMethod.PUT: 1`, `requestsByMethod.POST: 0`, `requestsByMethod.GET: 0` (POST/GET zero baseline preserved) |
| C-S-11 | `parseHttpPairs` would yield 5 turns total (across one or more conversations) | `turnCount: 5` |
| C-S-12 | Streaming body_raw with malformed `data:` lines interleaved with valid events | Malformed lines are skipped silently; valid event totals still summed (mirrors existing `assembleStreaming` tolerance) |

### formatNumber

| ID | Given | Expect |
|---|---|---|
| C-F-01 | `0` | `"0"` |
| C-F-02 | `999` | `"999"` |
| C-F-03 | `1000` | `"1,000"` |
| C-F-04 | `1234567` | `"1,234,567"` |
| C-F-05 | `1000000000` | `"1,000,000,000"` |

## Out of scope

- Cost-in-dollars conversion.
- Per-conversation breakdown (the existing `<TokenMeter>` already serves that).
- Negative or fractional numerics (Anthropic `usage` fields are non-negative integers; defensive checks not required).
