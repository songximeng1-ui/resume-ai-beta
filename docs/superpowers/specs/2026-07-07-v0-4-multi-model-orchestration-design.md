# V0.4 Multi-Model Orchestration Design

## Background

V0.4 has already shipped the core report flow, task package builder, strict schemas, module-level retries, basic report fallback, and V0.4 report field migrations. The next work should prepare the project for the confirmed product direction:

- DeepSeek is the primary model for full workflow generation.
- Qwen is the backup model for the current module.
- Qwen must receive the same complete AI Task Package and regenerate the current module from scratch.
- Kimi is only a long-text structured extractor.
- Rule templates are the final fallback and must produce a conservative basic report.

The current code still exposes an OpenAI-shaped runtime with `small` and `report` model tiers. It can retry and fall back between tiers for report modules, but the code does not yet express the product roles DeepSeek, Qwen, Kimi, and rule template.

## Goal

Build a testable multi-model orchestration abstraction before connecting real DeepSeek, Qwen, or Kimi APIs.

This slice should make the workflow architecture explicit without changing the user-facing promise:

- models may fail, but the user gets a result;
- all outputs stay schema-validated;
- fallback never continues another model's half-finished answer;
- Kimi never judges, recommends, or rewrites;
- the user does not see model names, tokens, cost, or provider details.

## Non-Goals

This slice will not connect real DeepSeek, Qwen, or Kimi endpoints yet.

It will not add provider-specific API keys, base URLs, pricing tables, or user-visible model diagnostics.

It will not rewrite the full report pipeline. Existing module generation, validation, quality checks, and basic report fallback should keep working.

## Recommended Approach

Introduce a thin model role layer above the existing runtime.

The layer should define product roles:

- `primary`: DeepSeek role, used first for normal generation.
- `backup`: Qwen role, used when primary fails, times out, or returns invalid schema.
- `extractor`: Kimi role, used only for long-text structured extraction.
- `rule`: rule template fallback, used when model generation cannot produce a valid module.

For V0.4, these roles can still be backed by the existing OpenAI-compatible runtime in development and tests. The important part is that the call path and tests now describe the product workflow.

## Data Flow

For a normal generation module:

1. Build the complete AI Task Package for the module.
2. Call the primary role with the complete package and strict schema.
3. If primary output is valid, return it.
4. If primary fails because of timeout, network/server error, or schema validation failure, call the backup role with the same complete package.
5. If backup output is valid, return it.
6. If backup also fails, fall back to the rule template for that module or to the basic report assembly path.

For Kimi extraction:

1. Check trigger conditions before building the final package:
   - JD over about 5000 Chinese characters;
   - user material over about 8000 Chinese characters;
   - estimated task package size over the safety threshold;
   - primary model failed once because context was too long.
2. If no trigger matches, do not call extractor.
3. If triggered, call extractor with a schema that only allows source snippets, structured fields, and verification notes.
4. Store the extractor result as `kimi_extract` inside the task package.
5. Downstream modules may use `kimi_extract` as evidence, but Kimi output cannot contain judgments, recommendations, or rewritten resume text.

## Interfaces

The implementation should add explicit role-oriented types, for example:

- `ModelRole = 'primary' | 'backup' | 'extractor' | 'rule'`
- `ModelRoleConfig` with role, provider label, model id, and timeout metadata
- `ModelOrchestrator` or equivalent helper that calls role-based JSON tasks
- `shouldUseExtractor(payload, failureContext?)` for Kimi trigger decisions

The existing `AiRuntime` can remain as the low-level transport boundary for now.

## Error Handling

Primary to backup fallback should occur for:

- timeout;
- network error;
- server error;
- schema validation failure;
- invalid JSON or empty response after retries.

Backup should not receive the primary model's partial response. It receives the same prompt/task package and schema.

Rule fallback should remain the final safety net. A basic report is not an error page and must continue using confirmed user information only.

## Testing

Add tests before implementation:

- primary success does not call backup;
- primary schema failure calls backup with the same prompt/package;
- backup failure falls back to rule/basic output where applicable;
- extractor is not called by default;
- extractor is triggered by long JD or long user material;
- extractor schema does not allow judgment, recommendation, or rewrite fields;
- user-facing API responses still hide provider/model/token/cost details.

Existing full tests and build must remain green:

- `npm test`
- `npm run build`

## Documentation Updates

After implementation, update:

- `docs/v0.4/version-record.md`
- `.env.example` only when real provider configuration is introduced, not in this abstraction slice
- README only if setup or local startup changes

## Acceptance Criteria

- Code has product-level role names for primary, backup, extractor, and rule fallback.
- Report module fallback is expressed as primary -> backup -> rule.
- Backup receives the same complete task input, not a partial primary answer.
- Kimi extractor trigger logic exists and is tested, but real Kimi API is not required yet.
- Existing report generation, basic fallback, quality checks, and mobile/user-facing constraints continue to pass.
