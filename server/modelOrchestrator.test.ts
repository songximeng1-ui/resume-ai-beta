import { describe, expect, test } from 'vitest';
import { defaultModelRoles, shouldUseExtractor, callJsonWithPrimaryBackup } from './modelOrchestrator.ts';
import { AiServiceError, type AiRuntime, type JsonCallOptions } from './openaiClient.ts';
import { validateKimiExtract } from './schemas.ts';

function runtimeWithCalls(
  calls: string[],
  behavior: { primaryFails?: boolean; backupFails?: boolean; primaryErrorCode?: 'schema_validation' | 'auth_error' } = {}
): AiRuntime {
  return {
    callReportModelJson: async <T>(options: JsonCallOptions<T>) => {
      calls.push(`primary:${options.task}:${options.model}:${options.prompt}`);
      if (behavior.primaryFails) {
        throw new AiServiceError({
          code: behavior.primaryErrorCode || 'schema_validation',
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

describe('callJsonWithPrimaryBackup runtime result handling', () => {
  test('preserves raw object results that contain a data field', async () => {
    const calls: string[] = [];
    const rawResult = { data: 'raw-payload', marker: 'keep-me' };
    const runtime: AiRuntime = {
      callReportModelJson: async () => rawResult,
      callSmallModelJson: async () => {
        throw new Error('backup should not run');
      }
    };

    const result = await callJsonWithPrimaryBackup(runtime, {
      primaryModel: 'deepseek-test',
      backupModel: 'qwen-test',
      task: 'module-test',
      schemaName: 'module_test',
      jsonSchema: {},
      prompt: 'same complete task package',
      validate: (value) => value as { data: string; marker: string }
    });

    expect(result).toEqual({
      data: rawResult,
      usage: null,
      role: 'primary'
    });
    expect(calls).toEqual([]);
  });

  test('auth failure does not call backup', async () => {
    const calls: string[] = [];
    const runtime = runtimeWithCalls(calls, { primaryFails: true, primaryErrorCode: 'auth_error' });

    await expect(
      callJsonWithPrimaryBackup(runtime, {
        primaryModel: 'deepseek-test',
        backupModel: 'qwen-test',
        task: 'module-test',
        schemaName: 'module_test',
        jsonSchema: {},
        prompt: 'same complete task package',
        validate: (value) => value as { source: string; value: string }
      })
    ).rejects.toThrowError();

    expect(calls).toEqual(['primary:module-test:deepseek-test:same complete task package']);
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

describe('callJsonWithPrimaryBackup', () => {
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
});

describe('validateKimiExtract', () => {
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
});
