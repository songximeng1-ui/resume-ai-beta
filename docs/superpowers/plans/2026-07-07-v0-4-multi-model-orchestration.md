# V0.4 Multi-Model Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a testable model-role orchestration layer so V0.4 can express DeepSeek primary, Qwen backup, Kimi extractor, and rule fallback before real provider APIs are connected.

**Architecture:** Keep `server/openaiClient.ts` as the low-level JSON transport for now. Add a focused `server/modelOrchestrator.ts` that maps product roles to existing runtime calls, decides primary-to-backup fallback, and exposes Kimi trigger helpers. Wire report module generation through this role layer without changing user-facing responses.

**Tech Stack:** TypeScript, Node/Express server, Vitest, existing strict JSON schemas, existing `AiRuntime` and `AiServiceError` types.

## Global Constraints

- DeepSeek is the primary model role for normal generation.
- Qwen is the backup model role for the current module.
- Qwen must receive the same complete AI Task Package and regenerate the current module from scratch.
- Kimi is only a long-text structured extractor.
- Kimi must not judge, recommend, or rewrite.
- Rule templates are the final fallback and must produce a conservative basic report.
- User-facing UI/API responses must not expose model names, token counts, cost, or provider details.
- This slice must not connect real DeepSeek, Qwen, or Kimi endpoints yet.
- Update `docs/v0.4/version-record.md` after implementation.
- Do not update `.env.example` or README unless setup or environment variables change.
- Run `npm test` and `npm run build` before completion.

---

## File Structure

- Create `server/modelOrchestrator.ts`
  - Owns `ModelRole`, role metadata, fallback decision helpers, role-based JSON task calling, and Kimi trigger checks.
- Create `server/modelOrchestrator.test.ts`
  - Tests primary/backup behavior and extractor trigger rules without calling real network APIs.
- Modify `server/index.ts`
  - Replace report-module tier fallback logic with orchestrator calls while preserving existing schemas, prompts, validation, and usage aggregation.
- Modify `server/openaiClient.ts`
  - Only if needed to export existing types; do not add new real provider config in this slice.
- Modify `docs/v0.4/version-record.md`
  - Record orchestration abstraction and verification commands.

---

### Task 1: Add Model Role Types And Extractor Trigger Logic

**Files:**
- Create: `server/modelOrchestrator.ts`
- Test: `server/modelOrchestrator.test.ts`

**Interfaces:**
- Produces:
  - `export type ModelRole = 'primary' | 'backup' | 'extractor' | 'rule'`
  - `export interface ModelRoleConfig { role: ModelRole; productName: 'DeepSeek' | 'Qwen' | 'Kimi' | 'RuleTemplate'; runtimeTier: 'small' | 'report' | 'none'; }`
  - `export function defaultModelRoles(): Record<ModelRole, ModelRoleConfig>`
  - `export interface ExtractorTriggerInput { jdText?: string; profile?: Record<string, unknown>; assets?: unknown[]; estimatedTaskPackageChars?: number; failureCode?: string; }`
  - `export function shouldUseExtractor(input: ExtractorTriggerInput): boolean`

- [ ] **Step 1: Write failing tests for role metadata and Kimi trigger defaults**

Add to `server/modelOrchestrator.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { defaultModelRoles, shouldUseExtractor } from './modelOrchestrator.ts';

describe('model role metadata', () => {
  test('declares V0.4 product model roles without exposing provider credentials', () => {
    expect(defaultModelRoles()).toEqual({
      primary: { role: 'primary', productName: 'DeepSeek', runtimeTier: 'report' },
      backup: { role: 'backup', productName: 'Qwen', runtimeTier: 'small' },
      extractor: { role: 'extractor', productName: 'Kimi', runtimeTier: 'small' },
      rule: { role: 'rule', productName: 'RuleTemplate', runtimeTier: 'none' }
    });
  });
});

describe('shouldUseExtractor', () => {
  test('does not trigger Kimi extraction by default', () => {
    expect(shouldUseExtractor({ jdText: '短 JD', profile: { internship: '短经历' }, assets: [] })).toBe(false);
  });

  test('triggers Kimi extraction for long JD text', () => {
    expect(shouldUseExtractor({ jdText: '岗位要求'.repeat(900) })).toBe(true);
  });

  test('triggers Kimi extraction for long user material', () => {
    expect(shouldUseExtractor({ profile: { internship: '用户材料'.repeat(1400) } })).toBe(true);
  });

  test('triggers Kimi extraction for oversized task package or context length failure', () => {
    expect(shouldUseExtractor({ estimatedTaskPackageChars: 18000 })).toBe(true);
    expect(shouldUseExtractor({ failureCode: 'context_length_exceeded' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm.cmd test -- server/modelOrchestrator.test.ts
```

Expected: fail because `server/modelOrchestrator.ts` does not exist.

- [ ] **Step 3: Implement role metadata and trigger helper**

Create `server/modelOrchestrator.ts`:

```ts
export type ModelRole = 'primary' | 'backup' | 'extractor' | 'rule';

export interface ModelRoleConfig {
  role: ModelRole;
  productName: 'DeepSeek' | 'Qwen' | 'Kimi' | 'RuleTemplate';
  runtimeTier: 'small' | 'report' | 'none';
}

export interface ExtractorTriggerInput {
  jdText?: string;
  profile?: Record<string, unknown>;
  assets?: unknown[];
  estimatedTaskPackageChars?: number;
  failureCode?: string;
}

const LONG_JD_CHARS = 5000;
const LONG_USER_MATERIAL_CHARS = 8000;
const TASK_PACKAGE_SAFE_CHARS = 16000;

export function defaultModelRoles(): Record<ModelRole, ModelRoleConfig> {
  return {
    primary: { role: 'primary', productName: 'DeepSeek', runtimeTier: 'report' },
    backup: { role: 'backup', productName: 'Qwen', runtimeTier: 'small' },
    extractor: { role: 'extractor', productName: 'Kimi', runtimeTier: 'small' },
    rule: { role: 'rule', productName: 'RuleTemplate', runtimeTier: 'none' }
  };
}

function collectText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('\n');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(collectText).join('\n');
  return '';
}

export function shouldUseExtractor(input: ExtractorTriggerInput): boolean {
  const jdLength = (input.jdText || '').length;
  const userMaterialLength = collectText(input.profile).length + collectText(input.assets).length;
  return (
    jdLength > LONG_JD_CHARS ||
    userMaterialLength > LONG_USER_MATERIAL_CHARS ||
    (input.estimatedTaskPackageChars || 0) > TASK_PACKAGE_SAFE_CHARS ||
    input.failureCode === 'context_length_exceeded'
  );
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
npm.cmd test -- server/modelOrchestrator.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add server/modelOrchestrator.ts server/modelOrchestrator.test.ts
git commit -m "Add V0.4 model role metadata"
```

---

### Task 2: Add Role-Based JSON Task Fallback

**Files:**
- Modify: `server/modelOrchestrator.ts`
- Modify: `server/modelOrchestrator.test.ts`

**Interfaces:**
- Consumes:
  - `ModelRole`
  - `defaultModelRoles()`
  - `AiRuntime`, `AiRuntimeResult`, `JsonCallOptions` from `server/openaiClient.ts`
- Produces:
  - `export interface RoleJsonCallOptions<T> extends Omit<JsonCallOptions<T>, 'model'> { primaryModel: string; backupModel: string; }`
  - `export interface RoleJsonCallResult<T> { data: T; usage: AiUsage | null; role: 'primary' | 'backup'; }`
  - `export async function callJsonWithPrimaryBackup<T>(runtime: AiRuntime, options: RoleJsonCallOptions<T>): Promise<RoleJsonCallResult<T>>`

- [ ] **Step 1: Write failing tests for primary success and backup fallback**

Append to `server/modelOrchestrator.test.ts`:

```ts
import { AiServiceError, type AiRuntime, type JsonCallOptions } from './openaiClient.ts';

function runtimeWithCalls(calls: string[], behavior: { primaryFails?: boolean; backupFails?: boolean } = {}): AiRuntime {
  return {
    callReportModelJson: async <T>(options: JsonCallOptions<T>) => {
      calls.push(`primary:${options.task}:${options.model}:${options.prompt}`);
      if (behavior.primaryFails) {
        throw new AiServiceError({
          code: 'schema_validation',
          message: 'schema invalid',
          detail: 'schema invalid',
          retryable: true,
          attempts: 1
        });
      }
      return { data: options.validate({ source: 'real', value: 'primary' }), usage: null };
    },
    callSmallModelJson: async <T>(options: JsonCallOptions<T>) => {
      calls.push(`backup:${options.task}:${options.model}:${options.prompt}`);
      if (behavior.backupFails) {
        throw new AiServiceError({
          code: 'schema_validation',
          message: 'schema invalid',
          detail: 'schema invalid',
          retryable: true,
          attempts: 1
        });
      }
      return { data: options.validate({ source: 'real', value: 'backup' }), usage: null };
    }
  };
}

test('primary success does not call backup', async () => {
  const calls: string[] = [];
  const result = await callJsonWithPrimaryBackup(runtimeWithCalls(calls), {
    primaryModel: 'deepseek-test',
    backupModel: 'qwen-test',
    task: 'module-test',
    schemaName: 'module_test',
    jsonSchema: {},
    prompt: 'same complete task package',
    validate: (value) => value as { source: string; value: string }
  });

  expect(result).toMatchObject({ role: 'primary', data: { value: 'primary' } });
  expect(calls).toEqual(['primary:module-test:deepseek-test:same complete task package']);
});

test('schema failure calls backup with the same complete prompt', async () => {
  const calls: string[] = [];
  const result = await callJsonWithPrimaryBackup(runtimeWithCalls(calls, { primaryFails: true }), {
    primaryModel: 'deepseek-test',
    backupModel: 'qwen-test',
    task: 'module-test',
    schemaName: 'module_test',
    jsonSchema: {},
    prompt: 'same complete task package',
    validate: (value) => value as { source: string; value: string }
  });

  expect(result).toMatchObject({ role: 'backup', data: { value: 'backup' } });
  expect(calls).toEqual([
    'primary:module-test:deepseek-test:same complete task package',
    'backup:module-test:qwen-test:same complete task package'
  ]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm.cmd test -- server/modelOrchestrator.test.ts
```

Expected: fail because `callJsonWithPrimaryBackup` is not exported.

- [ ] **Step 3: Implement role-based primary to backup fallback**

Add to `server/modelOrchestrator.ts`:

```ts
import { classifyAiError, type AiRuntime, type AiRuntimeResult, type JsonCallOptions } from './openaiClient.ts';
import type { AiUsage } from '../src/types.ts';

export interface RoleJsonCallOptions<T> extends Omit<JsonCallOptions<T>, 'model'> {
  primaryModel: string;
  backupModel: string;
}

export interface RoleJsonCallResult<T> {
  data: T;
  usage: AiUsage | null;
  role: 'primary' | 'backup';
}

function unwrapRuntimeResult<T>(result: AiRuntimeResult<T>): { data: T; usage: AiUsage | null } {
  if (result && typeof result === 'object' && 'data' in result) {
    return result as { data: T; usage: AiUsage | null };
  }
  return { data: result as T, usage: null };
}

function shouldUseBackup(error: unknown): boolean {
  const classified = classifyAiError(error);
  return ['timeout', 'network_error', 'server_error', 'schema_validation', 'invalid_json', 'empty_response'].includes(classified.code);
}

export async function callJsonWithPrimaryBackup<T>(
  runtime: AiRuntime,
  options: RoleJsonCallOptions<T>
): Promise<RoleJsonCallResult<T>> {
  const baseOptions = {
    task: options.task,
    schemaName: options.schemaName,
    jsonSchema: options.jsonSchema,
    prompt: options.prompt,
    validate: options.validate,
    maxAttempts: options.maxAttempts
  };

  try {
    const primary = unwrapRuntimeResult(
      await runtime.callReportModelJson({
        ...baseOptions,
        model: options.primaryModel
      })
    );
    return { ...primary, role: 'primary' };
  } catch (error) {
    if (!shouldUseBackup(error)) {
      throw error;
    }
  }

  const backup = unwrapRuntimeResult(
    await runtime.callSmallModelJson({
      ...baseOptions,
      model: options.backupModel
    })
  );
  return { ...backup, role: 'backup' };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
npm.cmd test -- server/modelOrchestrator.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add server/modelOrchestrator.ts server/modelOrchestrator.test.ts
git commit -m "Add V0.4 primary backup orchestration"
```

---

### Task 3: Wire Report Modules Through Role Orchestrator

**Files:**
- Modify: `server/index.ts`
- Modify: `server/index.test.ts`

**Interfaces:**
- Consumes:
  - `callJsonWithPrimaryBackup(runtime, options)` from Task 2
- Produces:
  - Report module generation path uses product-role fallback.
  - Existing `usageModule` remains compatible with `report` and `small` tiers for current aggregation.

- [ ] **Step 1: Write failing test that report backup gets same prompt**

Add a focused assertion to the existing test `configured JD report uses small/report/rule tiers and returns tiered usage without demo fallback` in `server/index.test.ts`:

```ts
expect(reportCalls[0]).toBe('report-jd-fit-summary:gpt-5.4');
expect(smallCalls).toEqual(['report-highlights:gpt-5.4-mini']);
```

Add a new test near the report fallback tests:

```ts
test('report module backup regenerates current module from the same complete prompt', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'qwen-test';
  process.env.OPENAI_MODEL_REPORT = 'deepseek-test';

  const prompts: string[] = [];
  const valid = validInventoryReport();
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    prompts.push(`primary:${options.task}:${options.prompt}`);
    throw new AiServiceError({
      code: 'schema_validation',
      message: 'OpenAI 返回结构不符合报告格式，请重试。',
      detail: 'schema invalid',
      retryable: true,
      attempts: 1
    });
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    prompts.push(`backup:${options.task}:${options.prompt}`);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
    throw new Error(`unexpected backup task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'jd', stage: 'senior', profile: { targetRole: '用户运营' }, assets: [], jdText: '负责用户运营。' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isBasic).toBe(true);
    expect(prompts[0].startsWith('primary:report-highlights:')).toBe(true);
    expect(prompts[1]).toBe(prompts[0].replace('primary:', 'backup:'));
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm.cmd test -- server/index.test.ts
```

Expected: fail until `callReportModule` uses `callJsonWithPrimaryBackup` for eligible module fallback.

- [ ] **Step 3: Replace module fallback internals**

In `server/index.ts`:

1. Import `callJsonWithPrimaryBackup`:

```ts
import { callJsonWithPrimaryBackup } from './modelOrchestrator.ts';
```

2. In `callReportModule`, keep the existing repair loop for the primary role only if needed, but make fallback to backup use the same `prompt` string from the module task rather than a derived partial response.

3. Minimal acceptable implementation for this task:

```ts
const prompt = reportModulePrompt(options.promptBody ?? body, options.task, useRepairPrompt);
const result = await callJsonWithPrimaryBackup(aiRuntime, {
  primaryModel: config.reportModel,
  backupModel: config.smallModel,
  task: options.task,
  schemaName: options.schemaName,
  jsonSchema: options.jsonSchema,
  prompt,
  validate: options.validate,
  maxAttempts: 1
});
const modelTier = result.role === 'primary' ? options.modelTier : 'small';
return {
  data: validateReportModule(options.task, options.validate, result.data),
  usage: result.usage,
  module: usageModule(options.task, modelTier, result.usage)
};
```

4. Preserve these current behaviors:
   - modules that start on `small` should still call only small;
   - rule modules still use rule;
   - when both model roles fail, existing basic report fallback remains active.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm.cmd test -- server/index.test.ts server/modelOrchestrator.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/index.test.ts server/modelOrchestrator.ts server/modelOrchestrator.test.ts
git commit -m "Route report modules through model roles"
```

---

### Task 4: Add Extractor Schema Guardrail

**Files:**
- Modify: `server/schemas.ts`
- Modify: `server/modelOrchestrator.test.ts`

**Interfaces:**
- Produces:
  - `export function validateKimiExtract(value: unknown): KimiExtract`
  - `export const kimiExtractJsonSchema`
  - `KimiExtract` shape with `sourceSnippets`, `verificationNotes`, `structuredFields`

- [ ] **Step 1: Write failing test for Kimi extract guardrails**

Append to `server/modelOrchestrator.test.ts`:

```ts
import { validateKimiExtract } from './schemas.ts';

test('Kimi extract rejects judgment recommendation and rewrite fields', () => {
  expect(() =>
    validateKimiExtract({
      source: 'real',
      sourceSnippets: ['JD 原文片段'],
      verificationNotes: ['岗位要求需核实'],
      structuredFields: [{ field: '岗位要求', value: '社群维护', sourceSnippet: '社群维护' }],
      recommendation: '建议优先投递',
      rewrite: '可写成负责社群运营'
    })
  ).toThrow(/Kimi extract must not contain judgment, recommendation, or rewrite fields/);
});

test('Kimi extract accepts source snippets verification notes and structured fields', () => {
  expect(
    validateKimiExtract({
      source: 'real',
      sourceSnippets: ['负责社群维护和用户反馈整理'],
      verificationNotes: ['用户规模未出现，需要待核实'],
      structuredFields: [{ field: '岗位要求', value: '社群维护', sourceSnippet: '负责社群维护和用户反馈整理' }]
    })
  ).toEqual({
    source: 'real',
    sourceSnippets: ['负责社群维护和用户反馈整理'],
    verificationNotes: ['用户规模未出现，需要待核实'],
    structuredFields: [{ field: '岗位要求', value: '社群维护', sourceSnippet: '负责社群维护和用户反馈整理' }]
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm.cmd test -- server/modelOrchestrator.test.ts
```

Expected: fail because `validateKimiExtract` does not exist.

- [ ] **Step 3: Implement schema and validator**

Add to `server/schemas.ts`:

```ts
export interface KimiExtract {
  source: 'real';
  sourceSnippets: string[];
  verificationNotes: string[];
  structuredFields: Array<{
    field: string;
    value: string;
    sourceSnippet: string;
  }>;
}

const forbiddenKimiKeys = ['judgment', 'recommendation', 'rewrite', 'deliveryDecision', 'matchLevel', 'resumeWriting'];

export function validateKimiExtract(value: unknown): KimiExtract {
  if (!isRecord(value)) throw new Error('KimiExtract must be an object');
  const forbidden = forbiddenKimiKeys.find((key) => key in value);
  if (forbidden) {
    throw new Error('Kimi extract must not contain judgment, recommendation, or rewrite fields');
  }
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    sourceSnippets: assertArray(value.sourceSnippets, 'sourceSnippets', (item) => assertString(item, 'sourceSnippet')),
    verificationNotes: assertArray(value.verificationNotes, 'verificationNotes', (item) => assertString(item, 'verificationNote')),
    structuredFields: assertArray(value.structuredFields, 'structuredFields', (item, index) => {
      if (!isRecord(item)) throw new Error(`structuredFields.${index} must be an object`);
      return {
        field: assertString(item.field, `structuredFields.${index}.field`),
        value: assertString(item.value, `structuredFields.${index}.value`),
        sourceSnippet: assertString(item.sourceSnippet, `structuredFields.${index}.sourceSnippet`)
      };
    })
  };
}

export const kimiExtractJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'sourceSnippets', 'verificationNotes', 'structuredFields'],
  properties: {
    source: { enum: ['real'] },
    sourceSnippets: { type: 'array', minItems: 1, items: stringSchema },
    verificationNotes: { type: 'array', items: stringSchema },
    structuredFields: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value', 'sourceSnippet'],
        properties: {
          field: stringSchema,
          value: stringSchema,
          sourceSnippet: stringSchema
        }
      }
    }
  }
};
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm.cmd test -- server/modelOrchestrator.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add server/schemas.ts server/modelOrchestrator.test.ts
git commit -m "Add Kimi extract guardrail schema"
```

---

### Task 5: Documentation And Final Verification

**Files:**
- Modify: `docs/v0.4/version-record.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces committed version record and clean verification.

- [ ] **Step 1: Update version record**

Add a new top entry to `docs/v0.4/version-record.md`:

```md
## 2026-07-07：多模型角色编排抽象层

改动类型：智能体工作流、后端接口、数据结构、测试、文档。

本次完成 V0.4 多模型编排的第一层工程抽象：

- 新增 primary/backup/extractor/rule 四类模型角色，对应 DeepSeek、Qwen、Kimi、规则模板的产品职责。
- 报告模块 fallback 以 primary -> backup -> rule 的方式表达，backup 使用同一份完整任务输入从头生成当前模块。
- 新增 Kimi 长文本摘录触发判断，默认不调用。
- 新增 Kimi 摘录 schema guardrail，只允许来源片段、待核实信息和结构化字段，不允许判断、推荐或改写字段。
- 本次仍未接入真实 DeepSeek/Qwen/Kimi API，不新增环境变量。

验证结果：

- `npm test`：通过。
- `npm run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。
```

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm.cmd test
```

Expected: all test files pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm.cmd run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: only intended files modified.

- [ ] **Step 5: Commit final docs**

```bash
git add docs/v0.4/version-record.md
git commit -m "Record V0.4 model orchestration abstraction"
```

---

## Self-Review

Spec coverage:

- Product roles are covered by Task 1.
- Primary -> backup fallback is covered by Task 2 and Task 3.
- Same complete task input for backup is covered by Task 2 and Task 3 tests.
- Kimi default-off and trigger logic is covered by Task 1.
- Kimi no judgment/recommend/rewrite guardrail is covered by Task 4.
- Documentation and verification are covered by Task 5.

Scope check:

- This plan does not connect real DeepSeek, Qwen, or Kimi APIs.
- This plan does not add provider-specific environment variables.
- This plan keeps existing report generation and basic fallback architecture.

Placeholder scan:

- No placeholder markers or unspecified test steps.

Type consistency:

- `ModelRole`, `ModelRoleConfig`, `shouldUseExtractor`, `callJsonWithPrimaryBackup`, and `validateKimiExtract` are defined before use.
