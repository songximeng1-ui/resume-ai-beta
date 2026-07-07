# V0.4 Provider Adapter and Kimi Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect V0.4 model roles to a provider adapter and add the Kimi long-text extraction path without leaking provider details to users.

**Architecture:** Keep product workflow above provider details. `modelProvider.ts` resolves role-specific provider config and performs JSON calls; `modelOrchestrator.ts` uses roles; `taskPackage.ts` accepts optional Kimi extracts; `index.ts` wires extraction before report modules where needed.

**Tech Stack:** TypeScript, Express, Vitest, OpenAI-compatible JSON responses, existing `openai` SDK and `undici` proxy support.

## Global Constraints

- DeepSeek is the primary generation role.
- Qwen is the backup generation role for the current module.
- Qwen receives the same complete task package and prompt as DeepSeek, not a partial answer.
- Kimi is only called for long-text structured extraction.
- Kimi output can be used as evidence organization, but never as judgment, recommendation, or resume rewriting.
- Rule templates remain the final fallback.
- Browser/API responses continue hiding provider names, model names, token usage, cost, base URLs, schema details, and raw provider errors.
- Existing `OPENAI_API_KEY`, `OPENAI_MODEL_SMALL`, `OPENAI_MODEL_REPORT`, and `OPENAI_PROXY_URL` must remain usable as development fallback during migration.
- `.env.example` must document new variables without real keys.
- Run `npm test` and `npm run build` before claiming completion.

---

## File Structure

- Create `server/modelProvider.ts`: role-specific config resolution and OpenAI-compatible JSON transport.
- Create `server/modelProvider.test.ts`: provider config, missing config, role mapping, and redaction tests.
- Modify `server/openaiClient.ts`: reuse existing error/usage helpers from the provider adapter; avoid duplicating classification logic.
- Modify `server/modelOrchestrator.ts`: call role JSON functions instead of hard-coding `callReportModelJson` / `callSmallModelJson`.
- Modify `server/modelOrchestrator.test.ts`: assert primary and backup use role configs and preserve same prompt.
- Modify `server/taskPackage.ts`: accept `kimiExtract` and add it to the task package as `kimiExtract`.
- Modify `server/taskPackage.test.ts`: verify Kimi extract is included and unconfirmed info remains pending.
- Modify `server/index.ts`: run optional Kimi extraction before report generation when trigger conditions match; continue without blocking on extractor failure.
- Modify `server/index.test.ts`: report endpoint tests for extractor skip, trigger, failure fallback, and client response redaction.
- Modify `server/prompts.ts`: add Kimi extractor prompt builder or constant.
- Modify `.env.example`: add role-specific provider variables.
- Modify `docs/v0.4/version-record.md`: record this implementation.

---

### Task 1: Provider Adapter

**Files:**
- Create: `server/modelProvider.ts`
- Create: `server/modelProvider.test.ts`
- Modify: `server/openaiClient.ts`

**Interfaces:**
- Consumes: `AiServiceError`, `classifyAiError`, `redactSensitiveText`, `runWithRetry`, `buildAiUsage`, `JsonCallOptions`, `AiTaskResult`.
- Produces:
  - `type ProviderRole = 'primary' | 'backup' | 'extractor'`
  - `interface ProviderRoleConfig { role: ProviderRole; provider: string; apiKey: string; baseUrl: string; model: string; configured: boolean; timeoutMs: number; proxyUrl: string }`
  - `function getProviderRoleConfig(role: ProviderRole): ProviderRoleConfig`
  - `function getConfiguredProviderRoles(): Record<ProviderRole, ProviderRoleConfig>`
  - `async function callProviderRoleJson<T>(role: ProviderRole, options: Omit<JsonCallOptions<T>, 'model'>): Promise<AiTaskResult<T>>`

- [ ] **Step 1: Write failing provider config tests**

Add tests in `server/modelProvider.test.ts`:

```ts
import { afterEach, expect, test } from 'vitest';
import { getProviderRoleConfig } from './modelProvider.ts';

const keys = [
  'AI_PRIMARY_PROVIDER',
  'AI_PRIMARY_API_KEY',
  'AI_PRIMARY_BASE_URL',
  'AI_PRIMARY_MODEL',
  'AI_BACKUP_PROVIDER',
  'AI_BACKUP_API_KEY',
  'AI_BACKUP_BASE_URL',
  'AI_BACKUP_MODEL',
  'AI_EXTRACTOR_PROVIDER',
  'AI_EXTRACTOR_API_KEY',
  'AI_EXTRACTOR_BASE_URL',
  'AI_EXTRACTOR_MODEL',
  'AI_REQUEST_TIMEOUT_MS',
  'OPENAI_API_KEY',
  'OPENAI_MODEL_SMALL',
  'OPENAI_MODEL_REPORT',
  'OPENAI_PROXY_URL'
];

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

test('resolves role-specific provider config without exposing secrets', () => {
  process.env.AI_PRIMARY_PROVIDER = 'deepseek';
  process.env.AI_PRIMARY_API_KEY = 'sk-deepseek-secret';
  process.env.AI_PRIMARY_BASE_URL = 'https://api.deepseek.example/v1';
  process.env.AI_PRIMARY_MODEL = 'deepseek-chat';
  process.env.AI_REQUEST_TIMEOUT_MS = '90000';

  expect(getProviderRoleConfig('primary')).toEqual({
    role: 'primary',
    provider: 'deepseek',
    apiKey: 'sk-deepseek-secret',
    baseUrl: 'https://api.deepseek.example/v1',
    model: 'deepseek-chat',
    configured: true,
    timeoutMs: 90000,
    proxyUrl: ''
  });
});

test('falls back to current OpenAI-compatible development config', () => {
  process.env.OPENAI_API_KEY = 'sk-openai-dev';
  process.env.OPENAI_MODEL_REPORT = 'gpt-report-dev';
  process.env.OPENAI_MODEL_SMALL = 'gpt-small-dev';

  expect(getProviderRoleConfig('primary')).toMatchObject({
    role: 'primary',
    provider: 'openai',
    apiKey: 'sk-openai-dev',
    model: 'gpt-report-dev',
    configured: true
  });
  expect(getProviderRoleConfig('backup')).toMatchObject({
    role: 'backup',
    provider: 'openai',
    apiKey: 'sk-openai-dev',
    model: 'gpt-small-dev',
    configured: true
  });
});

test('extractor is unconfigured when neither Kimi nor fallback config exists', () => {
  expect(getProviderRoleConfig('extractor')).toMatchObject({
    role: 'extractor',
    provider: 'kimi',
    apiKey: '',
    model: '',
    configured: false
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- server/modelProvider.test.ts`

Expected: FAIL because `server/modelProvider.ts` does not exist.

- [ ] **Step 3: Implement provider config and JSON role call**

Create `server/modelProvider.ts` with these exports:

```ts
import OpenAI from 'openai';
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { careerCoachSystemPrompt } from './prompts.ts';
import {
  AiServiceError,
  buildAiUsage,
  redactSensitiveText,
  runWithRetry,
  type AiTaskResult,
  type JsonCallOptions
} from './openaiClient.ts';

export type ProviderRole = 'primary' | 'backup' | 'extractor';

export interface ProviderRoleConfig {
  role: ProviderRole;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  configured: boolean;
  timeoutMs: number;
  proxyUrl: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function readEnv(name: string) {
  return process.env[name]?.trim() || '';
}

function readTimeout() {
  const value = Number(readEnv('AI_REQUEST_TIMEOUT_MS'));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function fallbackModel(role: ProviderRole) {
  if (role === 'primary') return readEnv('OPENAI_MODEL_REPORT') || 'gpt-5.4';
  if (role === 'backup') return readEnv('OPENAI_MODEL_SMALL') || 'gpt-5.4-mini';
  return '';
}

function defaultProvider(role: ProviderRole) {
  if (role === 'primary') return 'deepseek';
  if (role === 'backup') return 'qwen';
  return 'kimi';
}

function rolePrefix(role: ProviderRole) {
  if (role === 'primary') return 'AI_PRIMARY';
  if (role === 'backup') return 'AI_BACKUP';
  return 'AI_EXTRACTOR';
}

export function getProviderRoleConfig(role: ProviderRole): ProviderRoleConfig {
  const prefix = rolePrefix(role);
  const roleApiKey = readEnv(`${prefix}_API_KEY`);
  const fallbackApiKey = role === 'extractor' ? '' : readEnv('OPENAI_API_KEY');
  const apiKey = roleApiKey || fallbackApiKey;
  const provider = readEnv(`${prefix}_PROVIDER`) || (roleApiKey ? defaultProvider(role) : fallbackApiKey ? 'openai' : defaultProvider(role));
  const model = readEnv(`${prefix}_MODEL`) || (roleApiKey || fallbackApiKey ? fallbackModel(role) : '');

  return {
    role,
    provider,
    apiKey,
    baseUrl: readEnv(`${prefix}_BASE_URL`),
    model,
    configured: Boolean(apiKey && model),
    timeoutMs: readTimeout(),
    proxyUrl: readEnv('OPENAI_PROXY_URL') || readEnv('HTTPS_PROXY') || readEnv('HTTP_PROXY')
  };
}

export function getConfiguredProviderRoles() {
  return {
    primary: getProviderRoleConfig('primary'),
    backup: getProviderRoleConfig('backup'),
    extractor: getProviderRoleConfig('extractor')
  };
}

function userMessageForMissingConfig(role: ProviderRole) {
  return `AI ${role} provider is not configured.`;
}

function extractOutputText(response: OpenAIResponse) {
  if (response.output_text?.trim()) return response.output_text;
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type === 'output_text' && part.text.trim()) return part.text;
    }
  }
  throw new AiServiceError({
    code: 'empty_response',
    message: 'AI returned an empty response.',
    detail: 'provider returned an empty response',
    retryable: true
  });
}

export async function callProviderRoleJson<T>(
  role: ProviderRole,
  options: Omit<JsonCallOptions<T>, 'model'>
): Promise<AiTaskResult<T>> {
  const config = getProviderRoleConfig(role);
  if (!config.configured) {
    throw new AiServiceError({
      code: 'config_missing',
      message: userMessageForMissingConfig(role),
      detail: `${role} provider config missing`,
      retryable: false
    });
  }

  return runWithRetry(
    async () => {
      const proxyAgent = config.proxyUrl ? new ProxyAgent(config.proxyUrl) : null;
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || undefined,
        timeout: config.timeoutMs,
        fetch: proxyAgent
          ? ((input, init) => undiciFetch(input as never, { ...(init as object), dispatcher: proxyAgent } as never) as unknown as Promise<Response>)
          : undefined
      });
      const response = await client.responses.create({
        model: config.model,
        instructions: careerCoachSystemPrompt,
        input: options.prompt,
        text: {
          format: {
            type: 'json_schema',
            name: options.schemaName,
            schema: options.jsonSchema,
            strict: true
          }
        }
      });
      const text = extractOutputText(response);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new AiServiceError({
          code: 'invalid_json',
          message: 'AI returned invalid JSON.',
          detail: error instanceof Error ? redactSensitiveText(error.message) : 'unknown parse error',
          retryable: true
        });
      }
      try {
        return {
          data: options.validate(parsed),
          usage: buildAiUsage(response, { model: config.model, task: options.task })
        };
      } catch (error) {
        throw new AiServiceError({
          code: 'schema_validation',
          message: 'AI returned data that does not match schema.',
          detail: error instanceof Error ? redactSensitiveText(error.message) : 'unknown schema error',
          retryable: true
        });
      }
    },
    { task: options.task, model: config.model, maxAttempts: options.maxAttempts || 2 }
  );
}
```

- [ ] **Step 4: Preserve current `openaiClient.ts` exports**

Modify `server/openaiClient.ts` so existing `callSmallModelJson` and `callReportModelJson` still work. Keep public exports unchanged. The simplest acceptable implementation is:

```ts
export async function callSmallModelJson<T>(options: JsonCallOptions<T>): Promise<AiTaskResult<T>> {
  return callModelJson({ ...options, model: options.model || getOpenAiConfig().smallModel });
}

export async function callReportModelJson<T>(options: JsonCallOptions<T>): Promise<AiTaskResult<T>> {
  return callModelJson({ ...options, model: options.model || getOpenAiConfig().reportModel });
}
```

Do not remove current tests in this task.

- [ ] **Step 5: Run tests**

Run: `npm.cmd test -- server/modelProvider.test.ts server/openaiClient.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/modelProvider.ts server/modelProvider.test.ts server/openaiClient.ts
git commit -m "Add V0.4 provider role adapter"
```

---

### Task 2: Role Orchestrator Uses Provider Adapter

**Files:**
- Modify: `server/modelOrchestrator.ts`
- Modify: `server/modelOrchestrator.test.ts`

**Interfaces:**
- Consumes: `callProviderRoleJson(role, options)` from Task 1.
- Produces:
  - `async function callJsonWithPrimaryBackup<T>(runtime: AiRuntime, options: RoleJsonCallOptions<T>): Promise<RoleJsonCallResult<T>>` remains backward compatible for existing tests.
  - `async function callRoleJsonWithPrimaryBackup<T>(options: RoleJsonTaskOptions<T>): Promise<RoleJsonCallResult<T>>`

- [ ] **Step 1: Add failing tests for provider role calls**

In `server/modelOrchestrator.test.ts`, add:

```ts
import { vi } from 'vitest';
import * as modelProvider from './modelProvider.ts';

test('role orchestrator calls primary and backup provider roles with the same prompt', async () => {
  const calls: string[] = [];
  vi.spyOn(modelProvider, 'callProviderRoleJson').mockImplementation(async (role, options) => {
    calls.push(`${role}:${options.task}:${options.prompt}`);
    if (role === 'primary') {
      throw new AiServiceError({
        code: 'schema_validation',
        message: 'schema invalid',
        detail: 'schema invalid',
        retryable: true,
        attempts: 1
      });
    }
    return { data: options.validate({ source: 'real', value: 'backup' }), usage: null };
  });

  const result = await callRoleJsonWithPrimaryBackup({
    task: 'module-test',
    schemaName: 'module_test',
    jsonSchema: {},
    prompt: 'same complete task package',
    validate: (value) => value as { source: string; value: string }
  });

  expect(result).toMatchObject({ role: 'backup', data: { value: 'backup' } });
  expect(calls).toEqual([
    'primary:module-test:same complete task package',
    'backup:module-test:same complete task package'
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- server/modelOrchestrator.test.ts`

Expected: FAIL because `callRoleJsonWithPrimaryBackup` does not exist.

- [ ] **Step 3: Implement role-based orchestrator helper**

Add this interface and function in `server/modelOrchestrator.ts`:

```ts
export interface RoleJsonTaskOptions<T> extends Omit<JsonCallOptions<T>, 'model'> {}

export async function callRoleJsonWithPrimaryBackup<T>(
  options: RoleJsonTaskOptions<T>
): Promise<RoleJsonCallResult<T>> {
  try {
    const primary = unwrapRuntimeResult(await callProviderRoleJson('primary', options));
    return { ...primary, role: 'primary' };
  } catch (error) {
    if (!shouldUseBackup(error)) throw error;
  }

  const backup = unwrapRuntimeResult(await callProviderRoleJson('backup', options));
  return { ...backup, role: 'backup' };
}
```

Import `callProviderRoleJson` from `./modelProvider.ts`.

- [ ] **Step 4: Run tests**

Run: `npm.cmd test -- server/modelOrchestrator.test.ts server/modelProvider.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/modelOrchestrator.ts server/modelOrchestrator.test.ts
git commit -m "Route model roles through provider adapter"
```

---

### Task 3: Kimi Extract Enters AI Task Package

**Files:**
- Modify: `server/taskPackage.ts`
- Modify: `server/taskPackage.test.ts`
- Modify: `server/prompts.ts`

**Interfaces:**
- Consumes: `KimiExtract` from `server/schemas.ts`.
- Produces:
  - `buildTaskPackage(input)` includes `kimiExtract: KimiExtract | null`.
  - `kimiExtractPrompt(input: unknown): string` in `server/prompts.ts`.

- [ ] **Step 1: Add failing task package test**

In `server/taskPackage.test.ts`, add:

```ts
test('buildTaskPackage includes Kimi extract as evidence notes without confirming uncertain info', () => {
  const taskPackage = buildTaskPackage({
    mode: 'jd',
    module: 'report',
    jdText: 'long jd',
    kimiExtract: {
      source: 'real',
      sourceSnippets: ['负责社群维护和用户反馈整理'],
      verificationNotes: ['社群规模需要用户确认'],
      structuredFields: [
        {
          field: 'jd_requirement',
          value: '社群维护',
          sourceSnippet: '负责社群维护和用户反馈整理'
        }
      ]
    }
  });

  expect(taskPackage.kimiExtract).toEqual({
    source: 'real',
    sourceSnippets: ['负责社群维护和用户反馈整理'],
    verificationNotes: ['社群规模需要用户确认'],
    structuredFields: [
      {
        field: 'jd_requirement',
        value: '社群维护',
        sourceSnippet: '负责社群维护和用户反馈整理'
      }
    ]
  });
  expect(taskPackage.pendingOrUnverifiedInfo).toContain('社群规模需要用户确认');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- server/taskPackage.test.ts`

Expected: FAIL because `kimiExtract` is not included.

- [ ] **Step 3: Implement Kimi extract package inclusion**

In `server/taskPackage.ts`, import and validate:

```ts
import { validateKimiExtract, type KimiExtract } from './schemas.ts';
```

Add:

```ts
function normalizeKimiExtract(value: unknown): KimiExtract | null {
  if (!value) return null;
  return validateKimiExtract(value);
}
```

Inside `buildTaskPackage`, compute:

```ts
const kimiExtract = normalizeKimiExtract(input.kimiExtract);
```

Return:

```ts
kimiExtract,
pendingOrUnverifiedInfo: kimiExtract?.verificationNotes || [],
```

- [ ] **Step 4: Add Kimi extractor prompt**

In `server/prompts.ts`, add:

```ts
export function kimiExtractPrompt(payload: unknown) {
  return JSON.stringify(
    {
      role: 'kimi_extractor',
      instruction: [
        '只做长文本结构化摘录。',
        '不要判断岗位匹配。',
        '不要推荐岗位或投递策略。',
        '不要改写简历。',
        '保留来源片段。',
        '不确定的信息放入 verificationNotes。'
      ],
      payload
    },
    null,
    2
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm.cmd test -- server/taskPackage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/taskPackage.ts server/taskPackage.test.ts server/prompts.ts
git commit -m "Add Kimi extract to V0.4 task package"
```

---

### Task 4: Wire Extractor Into Report Flow

**Files:**
- Modify: `server/index.ts`
- Modify: `server/index.test.ts`

**Interfaces:**
- Consumes: `shouldUseExtractor`, `callProviderRoleJson`, `kimiExtractJsonSchema`, `validateKimiExtract`, `kimiExtractPrompt`.
- Produces:
  - `async function maybeBuildKimiExtract(body, aiRuntime, config): Promise<KimiExtract | null>` or equivalent internal helper.
  - Report generation passes `{ ...body, kimiExtract }` to module prompts/task package when extraction succeeds.

- [ ] **Step 1: Add failing skip/trigger/failure tests**

In `server/index.test.ts`, add three tests:

```ts
test('report generation skips Kimi extractor for normal sized inputs', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.AI_EXTRACTOR_API_KEY = 'kimi-key';
  process.env.AI_EXTRACTOR_MODEL = 'kimi-test';

  const extractorCalls: string[] = [];
  const server = await withServer({
    callSmallModelJson: async (options) => {
      extractorCalls.push(options.task);
      throw new Error(`unexpected small task ${options.task}`);
    },
    callReportModelJson: async (options) => {
      if (options.task === 'report-highlights') return { data: { source: 'real', highlights: validInventoryReport().highlights }, usage: null };
      if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: validInventoryReport().directionOptions }, usage: null };
      if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: validInventoryReport().rewrites }, usage: null };
      throw new Error(`unexpected task ${options.task}`);
    }
  });

  try {
    await requestReport(server, { mode: 'inventory', jdText: 'short jd' });
    expect(extractorCalls).not.toContain('kimi-extract');
  } finally {
    await server.close();
  }
});

test('report generation calls Kimi extractor for long JD and hides extractor diagnostics', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.AI_EXTRACTOR_API_KEY = 'kimi-key';
  process.env.AI_EXTRACTOR_MODEL = 'kimi-test';

  const smallCalls: string[] = [];
  const valid = validInventoryReport();
  const server = await withServer({
    callSmallModelJson: async (options) => {
      smallCalls.push(options.task);
      if (options.task === 'kimi-extract') {
        return {
          data: {
            source: 'real',
            sourceSnippets: ['负责社群维护和用户反馈整理'],
            verificationNotes: ['社群规模需要用户确认'],
            structuredFields: [{ field: 'jd_requirement', value: '社群维护', sourceSnippet: '负责社群维护和用户反馈整理' }]
          },
          usage: { model: 'kimi-test', task: 'kimi-extract', inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: null }
        };
      }
      throw new Error(`unexpected small task ${options.task}`);
    },
    callReportModelJson: async (options) => {
      expect(options.prompt).toContain('kimiExtract');
      if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
      if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
      if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: null };
      throw new Error(`unexpected task ${options.task}`);
    }
  });

  try {
    const body = await requestReport(server, { mode: 'inventory', jdText: '长'.repeat(5001) });
    expect(smallCalls).toContain('kimi-extract');
    expect(JSON.stringify(body)).not.toMatch(/kimi-test|inputTokens|outputTokens|estimatedCostUsd|provider|baseUrl/i);
  } finally {
    await server.close();
  }
});

test('Kimi extractor failure does not block basic or deep report generation', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.AI_EXTRACTOR_API_KEY = 'kimi-key';
  process.env.AI_EXTRACTOR_MODEL = 'kimi-test';

  const valid = validInventoryReport();
  const server = await withServer({
    callSmallModelJson: async (options) => {
      if (options.task === 'kimi-extract') throw new Error('Kimi timeout sk-secret');
      throw new Error(`unexpected small task ${options.task}`);
    },
    callReportModelJson: async (options) => {
      expect(options.prompt).not.toContain('Kimi timeout');
      if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
      if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
      if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: null };
      throw new Error(`unexpected task ${options.task}`);
    }
  });

  try {
    const body = await requestReport(server, { mode: 'inventory', jdText: '长'.repeat(5001) });
    expect(body.summary).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('sk-secret');
  } finally {
    await server.close();
  }
});
```

If helper names differ in existing tests, adapt only the wrapper names, not the assertions.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd test -- server/index.test.ts`

Expected: FAIL because extraction is not wired.

- [ ] **Step 3: Implement report extraction helper**

In `server/index.ts`, import:

```ts
import { shouldUseExtractor } from './modelOrchestrator.ts';
import { kimiExtractJsonSchema, validateKimiExtract, type KimiExtract } from './schemas.ts';
import { kimiExtractPrompt } from './prompts.ts';
```

Add helper:

```ts
async function maybeBuildKimiExtract(body: unknown, aiRuntime: AiRuntime): Promise<KimiExtract | null> {
  if (!isRecord(body)) return null;
  if (!shouldUseExtractor({
    jdText: readString(body.jdText),
    profile: isRecord(body.profile) ? body.profile : {},
    assets: Array.isArray(body.assets) ? body.assets : []
  })) {
    return null;
  }

  try {
    const result = await unwrapAiResult(
      await aiRuntime.callSmallModelJson({
        model: '',
        task: 'kimi-extract',
        schemaName: 'kimi_extract',
        jsonSchema: kimiExtractJsonSchema,
        prompt: kimiExtractPrompt(body),
        validate: validateKimiExtract
      })
    );
    return result.data;
  } catch {
    return null;
  }
}
```

Before report modules run, compute:

```ts
const kimiExtract = await maybeBuildKimiExtract(body, aiRuntime);
const bodyWithExtract = isRecord(body) && kimiExtract ? { ...body, kimiExtract } : body;
```

Use `bodyWithExtract` for report module prompts and task-package construction.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- server/index.test.ts server/modelOrchestrator.test.ts server/taskPackage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/index.test.ts
git commit -m "Wire Kimi extraction into report flow"
```

---

### Task 5: Environment Docs and Final Verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/v0.4/version-record.md`
- Modify: `README.md` only if startup instructions change

**Interfaces:**
- Consumes: implemented provider adapter and extractor flow.
- Produces: migration-ready documentation.

- [ ] **Step 1: Update `.env.example`**

Add these lines:

```env
AI_PRIMARY_PROVIDER=deepseek
AI_PRIMARY_API_KEY=
AI_PRIMARY_BASE_URL=
AI_PRIMARY_MODEL=
AI_BACKUP_PROVIDER=qwen
AI_BACKUP_API_KEY=
AI_BACKUP_BASE_URL=
AI_BACKUP_MODEL=
AI_EXTRACTOR_PROVIDER=kimi
AI_EXTRACTOR_API_KEY=
AI_EXTRACTOR_BASE_URL=
AI_EXTRACTOR_MODEL=
AI_REQUEST_TIMEOUT_MS=120000
```

Keep existing `OPENAI_*` values for development fallback.

- [ ] **Step 2: Update version record**

Add a new top entry in `docs/v0.4/version-record.md`:

```md
## 2026-07-07：Provider Adapter 与 Kimi 摘录链路

改动类型：智能体工作流、后端接口、数据结构、提示词、测试、文档。

本次完成 V0.4 真实模型接入前后的工程边界：

- 新增 role-based provider adapter，DeepSeek/Qwen/Kimi 可通过独立环境变量配置。
- primary/backup 继续保持同一份完整任务输入，不续写半成品。
- Kimi 仅在长文本触发条件下做结构化摘录，并进入 AI Task Package 作为证据整理。
- Kimi 失败不阻断报告生成。
- 用户端继续隐藏 provider、模型名、token、成本、schema 和原始错误细节。

验证结果：

- `npm test`：通过，记录本次命令输出中的测试文件数和测试数。
- `npm run build`：通过。

本次新增 provider 环境变量，已更新 `.env.example`；README 如启动方式未变化则无需更新。
```

- [ ] **Step 3: Run full verification**

Run: `npm.cmd test`

Expected: all test files pass.

Run: `npm.cmd run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Replace version record test evidence**

After `npm.cmd test`, replace the version-record verification line with the exact command output counts, for example:

```md
- `npm test`：通过，9 个测试文件、118 个测试通过。
```

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/v0.4/version-record.md README.md
git commit -m "Document V0.4 provider adapter setup"
```

If README did not change, omit it from `git add`.

- [ ] **Step 6: Final review**

Dispatch final review over the implementation range and ask the reviewer to check:

- provider secrets are not exposed;
- user-facing responses hide provider/model/token/cost/schema details;
- Kimi is extraction-only;
- fallback still produces basic/mixed reports;
- `.env.example` has no real keys.

Fix Critical or Important findings before reporting completion.
