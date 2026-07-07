Status: DONE

Commit(s)
- `f66147a` - `Add V0.4 provider role adapter`

Files changed
- `server/modelProvider.ts`
- `server/modelProvider.test.ts`

Tests run with exact results
- Command: `npm.cmd test -- server/modelProvider.test.ts`
  - Result: FAIL as expected before implementation
  - Key failure: `Failed to resolve import "./modelProvider.ts" from "server/modelProvider.test.ts". Does the file exist?`
- Command: `npm.cmd test -- server/modelProvider.test.ts server/openaiClient.test.ts`
  - Result: PASS
  - Exact summary:
    - `Test Files  2 passed (2)`
    - `Tests  10 passed (10)`

Self-review notes
- Kept scope inside Task 1 only: added provider-role config plus role-based JSON call boundary.
- Preserved existing `openaiClient.ts` public API and did not wire provider selection into orchestrator or server entrypoints.
- Maintained OpenAI development fallback behavior for primary/backup roles and left extractor fallback disabled unless explicitly configured.
- Reused existing error handling, retry, redaction, and usage-building helpers so browser/API sanitization behavior stays aligned with current module behavior.

Concerns, if any
- `server/openaiClient.ts` did not need code changes because its current `callSmallModelJson` / `callReportModelJson` compatibility behavior already matches the brief.
