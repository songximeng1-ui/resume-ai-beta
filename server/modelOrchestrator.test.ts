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

  test('does not trigger Kimi extraction for JD text at or below the threshold', () => {
    expect(shouldUseExtractor({ jdText: 'a'.repeat(5000) })).toBe(false);
  });

  test('triggers Kimi extraction for JD text just over the threshold', () => {
    expect(shouldUseExtractor({ jdText: 'a'.repeat(5001) })).toBe(true);
  });

  test('does not trigger Kimi extraction for user material at or below the threshold', () => {
    expect(shouldUseExtractor({ profile: { internship: 'a'.repeat(8000) } })).toBe(false);
  });

  test('triggers Kimi extraction for user material just over the threshold', () => {
    expect(shouldUseExtractor({ profile: { internship: 'a'.repeat(8001) } })).toBe(true);
  });

  test('triggers Kimi extraction for oversized task package or context length failure', () => {
    expect(shouldUseExtractor({ estimatedTaskPackageChars: 18000 })).toBe(true);
    expect(shouldUseExtractor({ failureCode: 'context_length_exceeded' })).toBe(true);
  });
});
