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
