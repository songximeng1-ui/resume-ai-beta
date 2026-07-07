# V0.4 Provider Adapter and Kimi Extractor Design

## Background

The previous V0.4 slice added a product-level model role layer:

- `primary`: DeepSeek role.
- `backup`: Qwen role.
- `extractor`: Kimi role.
- `rule`: rule-template fallback.

That slice intentionally did not connect real DeepSeek, Qwen, or Kimi APIs. The next slice should connect the role layer to a provider boundary without leaking provider details into the product workflow or user-facing responses.

## Goal

Build a stable provider adapter layer and Kimi extraction execution path for V0.4.

The implementation should let the report workflow call role-based model tasks while preserving the product promise:

- DeepSeek is the primary generation role.
- Qwen is the backup generation role for the current module.
- Qwen receives the same complete task package and prompt as DeepSeek, not a partial answer.
- Kimi is only called for long-text structured extraction.
- Kimi output can be used as evidence organization, but never as judgment, recommendation, or resume rewriting.
- Rule templates remain the final fallback.
- Browser/API responses continue hiding provider names, model names, token usage, cost, base URLs, schema details, and raw provider errors.

## Non-Goals

This slice will not build a complex multi-tenant provider console.

It will not expose provider/model selection to users.

It will not add local large-model deployment.

It will not make Kimi decide job fit, write resume bullets, rank directions, or produce interview answers.

It will not replace the existing report module schema validators, quality checks, or basic report fallback.

## Recommended Architecture

Add a thin provider adapter below `modelOrchestrator`.

The layers should be:

1. Product workflow: report modules, dynamic questions, task package construction.
2. Role orchestration: primary, backup, extractor, rule.
3. Provider adapter: maps a role to provider configuration and JSON-call transport.
4. Provider transport: OpenAI-compatible HTTP JSON call, with provider-specific base URL, key, model, timeout, and error mapping.

The business workflow should call roles, not providers. For example, report generation asks for `primary` and `backup`; Kimi extraction asks for `extractor`.

## Provider Configuration

The first implementation should use environment variables and keep defaults compatible with current development.

Recommended variables:

- `AI_PRIMARY_PROVIDER=deepseek`
- `AI_PRIMARY_API_KEY=`
- `AI_PRIMARY_BASE_URL=`
- `AI_PRIMARY_MODEL=`
- `AI_BACKUP_PROVIDER=qwen`
- `AI_BACKUP_API_KEY=`
- `AI_BACKUP_BASE_URL=`
- `AI_BACKUP_MODEL=`
- `AI_EXTRACTOR_PROVIDER=kimi`
- `AI_EXTRACTOR_API_KEY=`
- `AI_EXTRACTOR_BASE_URL=`
- `AI_EXTRACTOR_MODEL=`
- `AI_REQUEST_TIMEOUT_MS=120000`

Backward compatibility:

- Existing `OPENAI_API_KEY`, `OPENAI_MODEL_SMALL`, `OPENAI_MODEL_REPORT`, and `OPENAI_PROXY_URL` can remain as development fallback during migration.
- If role-specific config is missing, the app may keep demo mode or use the current OpenAI-compatible fallback depending on existing behavior.
- `.env.example` must document the new variables without real keys.

## Provider Adapter Contract

The adapter should expose a small interface:

```ts
type ModelRole = 'primary' | 'backup' | 'extractor';

interface RoleJsonRequest<T> {
  role: ModelRole;
  task: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  prompt: string;
  validate: (value: unknown) => T;
  maxAttempts?: number;
}

interface RoleJsonResponse<T> {
  data: T;
  usage: AiUsage | null;
}
```

The adapter may internally use OpenAI-compatible responses, but the rest of the app should not depend on OpenAI-specific client objects.

## Error Handling

Provider errors must be normalized into existing AI error codes:

- missing config -> `config_missing`
- 401/403 -> `auth_error`
- 404/model-not-found -> `model_error`
- 429 -> `rate_limit`
- timeout -> `timeout`
- network failure -> `network_error`
- 5xx -> `server_error`
- empty response -> `empty_response`
- invalid JSON -> `invalid_json`
- schema mismatch -> `schema_validation`

Raw provider messages must be redacted before they can reach client responses, logs, or report task metadata.

The fallback policy stays the same:

- primary retry/repair first where applicable;
- backup receives the same complete prompt/task package;
- backup failure goes to rule/basic fallback;
- basic report is a conservative deliverable, not a failure page.

## Kimi Extraction Flow

Kimi extraction happens before the final module prompt is built when long-text conditions are met.

Trigger conditions:

- JD text length is greater than 5000 Chinese characters.
- User material length is greater than 8000 Chinese characters.
- Estimated task package size is over the safe threshold.
- Primary model failed once with `context_length_exceeded`.

Flow:

1. Inspect raw JD, user material, confirmed assets, and estimated package size.
2. If no trigger matches, skip extractor.
3. If triggered, call the `extractor` role with a Kimi-only extraction prompt and strict schema.
4. Validate with `validateKimiExtract`.
5. Add the result to `kimi_extract` in the AI Task Package.
6. Mark any uncertain extracted item as pending verification.
7. Downstream modules can cite Kimi source snippets as organized evidence only.

Kimi output must include:

- source snippets;
- verification notes;
- structured fields.

Kimi output must not include:

- job fit judgment;
- direction recommendation;
- resume rewrite;
- delivery decision;
- match level;
- interview answer.

If Kimi fails, the workflow should keep running with original input and conservative truncation or rule fallback. Kimi failure must not block the user from receiving a report.

## Prompt Boundary

Kimi extractor prompt must say:

- only extract and organize source information;
- do not infer capability;
- do not recommend jobs;
- do not rewrite resume content;
- mark uncertain information as pending verification;
- preserve short source snippets for traceability.

Generation prompts for DeepSeek/Qwen may receive `kimi_extract`, but must treat it as evidence notes, not as verified user experience unless it is already confirmed or user-verified.

## User-Facing Behavior

The browser must not show:

- DeepSeek, Qwen, Kimi, OpenAI, provider labels, or model IDs;
- token counts;
- cost;
- base URLs;
- raw provider error bodies;
- schema validation internals.

Allowed user-facing language:

- "真实 AI 已连接。"
- "正在整理长文本材料，预计需要更久一点。"
- "当前生成较慢，系统正在换一种稳定方式继续处理。"
- "当前已为你生成基础版报告。"

## Testing Plan

Add focused tests for:

- provider config resolves role-specific settings without leaking secrets;
- missing role config is classified as configuration missing;
- primary calls DeepSeek role config and backup calls Qwen role config;
- backup receives the same prompt as primary;
- extractor is skipped by default;
- extractor is called only when trigger conditions match;
- Kimi output with forbidden judgment/recommendation/rewrite fields is rejected;
- Kimi failure does not block report fallback;
- API responses still omit usage, model, provider, token, cost, base URL, and schema details.

Full verification after implementation:

- `npm test`
- `npm run build`

## Documentation Updates

Update these after implementation:

- `.env.example`: add role-specific provider variables.
- `docs/v0.4/version-record.md`: record provider adapter and Kimi extractor work.
- Prompt documentation if extractor prompt is moved into a dedicated prompt file.
- README only if setup instructions change for local running.

## Acceptance Criteria

- Provider-specific details live behind a provider adapter.
- Product workflow calls model roles, not hard-coded providers.
- DeepSeek primary and Qwen backup can be configured independently.
- Kimi extractor can run only under approved trigger conditions.
- Kimi extract result enters the task package as structured evidence notes.
- Kimi cannot output judgment, recommendation, or rewrite content.
- If provider calls fail, the user still receives a usable basic or mixed report.
- User-facing responses continue hiding all model/provider/token/cost details.

