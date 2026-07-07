import { classifyAiError, type AiRuntime, type AiRuntimeResult, type AiTaskResult, type JsonCallOptions } from './openaiClient.ts';
import type { AiUsage } from '../src/types.ts';

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

export interface RoleJsonCallOptions<T> extends Omit<JsonCallOptions<T>, 'model'> {
  primaryModel: string;
  backupModel: string;
}

export interface RoleJsonCallResult<T> {
  data: T;
  usage: AiUsage | null;
  role: 'primary' | 'backup';
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
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(collectText).join('\n');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(collectText)
      .join('\n');
  }

  return '';
}

function unwrapRuntimeResult<T>(result: AiRuntimeResult<T>): { data: T; usage: AiUsage | null } {
  if (result && typeof result === 'object' && 'data' in result && 'usage' in result) {
    return result as AiTaskResult<T>;
  }

  return { data: result as T, usage: null };
}

function shouldUseBackup(error: unknown): boolean {
  const classified = classifyAiError(error);
  return ['timeout', 'network_error', 'server_error', 'schema_validation', 'invalid_json', 'empty_response'].includes(classified.code);
}

export function shouldUseExtractor(input: ExtractorTriggerInput): boolean {
  const jdLength = input.jdText?.length ?? 0;
  const userMaterialLength = collectText(input.profile).length + collectText(input.assets).length;

  return (
    jdLength > LONG_JD_CHARS ||
    userMaterialLength > LONG_USER_MATERIAL_CHARS ||
    (input.estimatedTaskPackageChars ?? 0) > TASK_PACKAGE_SAFE_CHARS ||
    input.failureCode === 'context_length_exceeded'
  );
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
