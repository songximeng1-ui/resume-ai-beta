Status
- Completed Task 2 only: role orchestrator now routes primary and backup calls through the provider adapter.

Commits
- HEAD (Route orchestrator roles through provider adapter)

Files changed
- server/modelOrchestrator.ts
- server/modelOrchestrator.test.ts
- .superpowers/sdd/provider-task-2-report.md

Exact tests
- npm.cmd test -- server/modelOrchestrator.test.ts
- npm.cmd test -- server/modelOrchestrator.test.ts server/modelProvider.test.ts

Self-review
- Added `callRoleJsonWithPrimaryBackup` as a new helper that accepts task-level JSON options without model selection and calls `callProviderRoleJson('primary', options)` first.
- Preserved existing `callJsonWithPrimaryBackup(runtime, options)` behavior for backward compatibility.
- Reused existing `shouldUseBackup` logic so Task 2 stays aligned with current fallback semantics.
- Added a focused regression test proving that primary and backup receive the same full prompt payload and that backup is invoked only after a retryable primary failure.

Concerns
- This task does not yet wire extractor or rule fallback behavior; those remain for later tasks by design.
