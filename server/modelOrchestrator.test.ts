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
