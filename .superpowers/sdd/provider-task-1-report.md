Status: DONE

Commit(s)
- `02f1394` - `Add V0.4 provider role adapter`

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

---

Fix follow-up: reviewer findings addressed on 2026-07-07

Scope
- Updated only `server/modelProvider.ts` and `server/modelProvider.test.ts`.

Fixes
- Tightened `getProviderRoleConfig` so `AI_PRIMARY_API_KEY` / `AI_BACKUP_API_KEY` / `AI_EXTRACTOR_API_KEY` require their matching `AI_*_MODEL`; `OPENAI_MODEL_*` fallback now applies only when primary/backup are using `OPENAI_API_KEY` development fallback.
- Stopped leaking real provider model names through retry error context by passing role-safe labels (`primary-role`, `backup-role`, `extractor-role`) into `runWithRetry`.
- Added regression coverage for both issues.

Tests run with exact results
- Command: `npm.cmd test -- server/modelProvider.test.ts`
  - Result: FAIL before fix
  - Exact failing assertions:
    - `configured: true` / `model: "gpt-report-dev"` was returned where the test expected `configured: false` / `model: ""`
    - `rate limit (task: report, model: deepseek-chat)` was returned where the test expected a role-safe label containing `primary-role`
- Command: `npm.cmd test -- server/modelProvider.test.ts`
  - Result: PASS after fix
  - Exact summary:
    - `Test Files  1 passed (1)`
    - `Tests  5 passed (5)`
- Command: `npm.cmd test -- server/modelProvider.test.ts server/openaiClient.test.ts`
  - Result: PASS after fix
  - Exact summary:
    - `Test Files  2 passed (2)`
    - `Tests  12 passed (12)`
