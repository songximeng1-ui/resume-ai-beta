import { afterEach, expect, test, vi } from 'vitest';
import {
  buildAiUsage,
  classifyAiError,
  getOpenAiConfig,
  redactSensitiveText,
  runWithRetry,
  toClientAiError
} from './openaiClient.ts';

const envKeys = ['AI_REQUEST_TIMEOUT_MS', 'OPENAI_API_KEY', 'OPENAI_MODEL_SMALL', 'OPENAI_MODEL_REPORT', 'OPENAI_PROXY_URL'];

afterEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }
});

test('redactSensitiveText removes API keys and limits long user content', () => {
  const raw = `Bad key sk-test_1234567890abcdef and resume ${'A'.repeat(1200)}`;
  const safe = redactSensitiveText(raw);

  expect(safe).toContain('sk-***');
  expect(safe).not.toContain('sk-test_1234567890abcdef');
  expect(safe.length).toBeLessThanOrEqual(700);
});

test('classifyAiError marks retryable transient failures and non-retryable configuration failures', () => {
  expect(classifyAiError({ status: 429, message: 'rate limit' })).toMatchObject({
    code: 'rate_limit',
    retryable: true
  });
  expect(classifyAiError({ status: 500, message: 'server overloaded' })).toMatchObject({
    code: 'server_error',
    retryable: true
  });
  expect(classifyAiError({ status: 401, message: 'Incorrect API key sk-real-secret' })).toMatchObject({
    code: 'auth_error',
    retryable: false
  });
  expect(classifyAiError({ status: 404, message: 'model not found' })).toMatchObject({
    code: 'model_error',
    retryable: false
  });
});

test('runWithRetry retries retryable AI errors once and preserves the final classification', async () => {
  const operation = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    .mockResolvedValueOnce('ok');

  await expect(runWithRetry(operation, { task: 'report', model: 'gpt-5.4', maxAttempts: 2, delayMs: 0 })).resolves.toBe('ok');
  expect(operation).toHaveBeenCalledTimes(2);
});

test('runWithRetry defaults to one retry for retryable AI errors', async () => {
  const operation = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));

  await expect(runWithRetry(operation, { task: 'report', model: 'gpt-5.4', delayMs: 0 })).rejects.toMatchObject({
    code: 'timeout',
    retryable: true,
    attempts: 2
  });
  expect(operation).toHaveBeenCalledTimes(2);
});

test('getOpenAiConfig defaults request timeout to 60 seconds and allows env override', () => {
  expect(getOpenAiConfig()).toMatchObject({
    timeoutMs: 60_000
  });

  process.env.AI_REQUEST_TIMEOUT_MS = '45000';

  expect(getOpenAiConfig()).toMatchObject({
    timeoutMs: 45_000
  });
});

test('runWithRetry does not retry non-retryable AI errors', async () => {
  const operation = vi.fn().mockRejectedValue(Object.assign(new Error('Incorrect API key sk-real-secret'), { status: 401 }));

  await expect(runWithRetry(operation, { task: 'report', model: 'gpt-5.4', maxAttempts: 2, delayMs: 0 })).rejects.toMatchObject({
    code: 'auth_error',
    retryable: false,
    attempts: 1
  });
  expect(operation).toHaveBeenCalledTimes(1);
});

test('toClientAiError returns understandable sanitized errors for the frontend', () => {
  const error = toClientAiError(Object.assign(new Error('Incorrect API key sk-real-secret'), { status: 401 }));

  expect(error).toMatchObject({
    code: 'auth_error',
    message: expect.stringContaining('API Key')
  });
  expect(JSON.stringify(error)).not.toContain('sk-real-secret');
});

test('buildAiUsage reads OpenAI response usage and estimates cost by model', () => {
  const usage = buildAiUsage(
    {
      usage: {
        input_tokens: 1200,
        output_tokens: 800,
        total_tokens: 2000
      }
    },
    { model: 'gpt-5.4-mini', task: 'report' }
  );

  expect(usage).toEqual({
    model: 'gpt-5.4-mini',
    task: 'report',
    inputTokens: 1200,
    outputTokens: 800,
    totalTokens: 2000,
    estimatedCostUsd: 0.0045
  });
});

test('buildAiUsage returns null when OpenAI response has no usage', () => {
  expect(buildAiUsage({}, { model: 'gpt-5.4', task: 'report' })).toBeNull();
});
