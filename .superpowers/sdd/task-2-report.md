status: DONE
commit: 30c78e14204a690a817f3a28ad536f5cdd5822d1
files_changed:
  - server/modelOrchestrator.ts
  - server/modelOrchestrator.test.ts
commands_run:
  - npm.cmd test -- server/modelOrchestrator.test.ts
    result: failed as expected with "callJsonWithPrimaryBackup is not a function"
  - npm.cmd test -- server/modelOrchestrator.test.ts
    result: passed (9 tests)
  - npm.cmd test
    result: passed (8 files, 90 tests)
concerns: none

fix_report:
  date: 2026-07-07
  summary:
    - Tightened unwrapRuntimeResult() so only AiTaskResult-shaped values with both data and usage are unwrapped.
    - Added regression coverage for raw object payloads that contain a data field.
    - Added regression coverage that auth_error does not trigger backup.
  commands_run:
    - npm.cmd test -- server/modelOrchestrator.test.ts
      result: failed as expected with raw object result regression
    - npm.cmd test -- server/modelOrchestrator.test.ts
      result: passed (11 tests)
