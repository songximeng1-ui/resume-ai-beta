Status: DONE
Commit: a9c5c8f

Files changed:
- server/index.ts
- server/index.test.ts
- .superpowers/sdd/task-3-report.md

Commands run with results:
- `npm.cmd test -- server/index.test.ts`
  - RED: failed on `report module backup regenerates current module from the same complete prompt` because backup prompt did not match the repaired primary prompt.
- `npm.cmd test -- server/index.test.ts`
  - RED: failed on the same regression after correcting the test target from a small-tier module to a report-tier module.
- `npm.cmd test -- server/index.test.ts server/modelOrchestrator.test.ts`
  - FAIL: exposed the incorrect `callJsonWithPrimaryBackup` import and outdated retry-count expectations.
- `npm.cmd test -- server/index.test.ts server/modelOrchestrator.test.ts`
  - GREEN: 42 tests passed.

Summary:
- Routed report-tier report modules through `callJsonWithPrimaryBackup` while preserving small-tier direct calls and rule-based modules.
- Kept the primary schema-repair pass, then reused the same full repaired prompt for backup fallback.
- Preserved basic-report fallback when both roles fail.

Concerns:
- None.

---

Fix review follow-up (2026-07-07)

Status: DONE

Findings fixed:
- `callReportModule` now propagates the final backup failure from `callJsonWithPrimaryBackup` instead of rethrowing the earlier primary failure.
- Added regression coverage for report basic fallback metadata when primary fails retryably and backup fails non-retryably.

Files changed:
- server/index.ts
- server/index.test.ts
- .superpowers/sdd/task-3-report.md

Commands run with results:
- `npm.cmd test -- server/index.test.ts`
  - RED: failed on `report task basic fallback reflects final backup failure metadata` because `reportTask.retryable` was still `true`, showing the primary failure leaked through.
- `npm.cmd test -- server/index.test.ts server/modelOrchestrator.test.ts`
  - FAIL: existing `report module schema repair failure returns basic report without leaking API key` test still expected the old leaked-primary behavior.
- `npm.cmd test -- server/index.test.ts server/modelOrchestrator.test.ts`
  - GREEN: 43 tests passed.

Commit:
- 36efeef
