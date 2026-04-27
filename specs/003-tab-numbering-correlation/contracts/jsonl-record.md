# Contract: JSONL Record Shape

This contract governs the on-disk format of `.cc-trace/session-*.jsonl` files for any session captured by cc-trace v0.4.0+. It is **additive** to the spec-002 / v0.3.x format — every legacy file remains readable.

## Schema

One line per pair. Each line is a JSON object:

```json
{
  "request":  { /* HttpRequest, unchanged */ },
  "response": { /* HttpResponse */ } | null,
  "logged_at": "2026-04-26T12:34:56.789Z",
  "pairIndex": 5,
  "status":   "completed" | "aborted" | "timeout"   // optional; default "completed"
}
```

## Required fields (writer side)

For every record written by this version onward:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `request` | `HttpRequest` | yes | Unchanged shape |
| `response` | `HttpResponse \| null` | yes | `null` iff `status !== "completed"` |
| `logged_at` | string (ISO 8601) | yes | Unchanged |
| `pairIndex` | integer ≥ 1 | **yes (NEW)** | Unique within file |
| `status` | enum | optional | Absent ⇒ `"completed"` |
| `note` | string | optional | Unchanged |

## Loader contract

A loader (HTML report generator, frontend parser, or external tool) MUST:

1. Parse each line as JSON. Discard blank lines.
2. **Index resolution**:
   - If `pairIndex` is present and is an integer ≥ 1: use it.
   - Else (legacy file): assign `pairIndex = lineNumber` where `lineNumber` is the 1-based line position of the record in the file (header-less; blank lines skipped).
3. **Status resolution**:
   - If `status` is absent: treat as `"completed"`.
   - If `status` is present, MUST be one of `"completed" | "aborted" | "timeout"`. Unknown values are a hard error.
4. **Uniqueness check** (after all lines are read):
   - If any two records share the same resolved `pairIndex`, throw — do not silently dedup, do not pick the latest.
   - This catches both writer bugs and concatenated-file accidents.
5. **Consistency check**:
   - If `response === null` and resolved `status === "completed"`: throw.
   - If `response !== null` and resolved `status !== "completed"`: throw.

## Backwards compatibility

| Scenario | Behavior |
|----------|----------|
| Open a v0.3.x file with v0.4.0 viewer | Loads cleanly; `pairIndex` derived from line order; all rows render labelled. |
| Open a v0.4.0 file with v0.3.x viewer | Loads cleanly; extra fields ignored; numbering is absent (old viewer). |
| Concatenate two v0.4.0 files | Loader throws on duplicate `pairIndex`. **Intentional** — concatenation must be done with a re-numbering tool, not raw `cat`. |

## Forward compatibility

`status` is an open enum at the wire level — readers MUST reject unknown values rather than silently coercing. Future statuses (e.g. `"client_disconnected"`) require a schema bump and a viewer release.

## Security

`pairIndex` is a number; it cannot carry credential or markup. It MAY appear in error messages, in the UI, and in shared reports without redaction review.
