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
