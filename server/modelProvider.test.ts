import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { toClientAiError } from './openaiClient.ts';

const responsesCreate = vi.fn();
const chatCompletionsCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = {
      create: responsesCreate
    };
    chat = {
      completions: {
        create: chatCompletionsCreate
      }
    };
  }
}));

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
  'OPENAI_PROXY_URL',
  'HTTPS_PROXY',
  'HTTP_PROXY'
];

beforeEach(() => {
  for (const key of keys) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of keys) {
    delete process.env[key];
  }
  responsesCreate.mockReset();
  chatCompletionsCreate.mockReset();
});

test('resolves role-specific provider config without exposing secrets', async () => {
  const { getProviderRoleConfig } = await import('./modelProvider.ts');
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

test('provider role config defaults request timeout to 60 seconds', async () => {
  const { getProviderRoleConfig } = await import('./modelProvider.ts');
  process.env.AI_PRIMARY_PROVIDER = 'deepseek';
  process.env.AI_PRIMARY_API_KEY = 'sk-deepseek-secret';
  process.env.AI_PRIMARY_BASE_URL = 'https://api.deepseek.example/v1';
  process.env.AI_PRIMARY_MODEL = 'deepseek-chat';

  expect(getProviderRoleConfig('primary')).toMatchObject({
    timeoutMs: 60_000
  });
});

test('falls back to current OpenAI-compatible development config', async () => {
  const { getProviderRoleConfig } = await import('./modelProvider.ts');
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

test('extractor is unconfigured when neither Kimi nor fallback config exists', async () => {
  const { getProviderRoleConfig } = await import('./modelProvider.ts');
  expect(getProviderRoleConfig('extractor')).toMatchObject({
    role: 'extractor',
    provider: 'kimi',
    apiKey: '',
    model: '',
    configured: false
  });
});

test('role-specific provider key requires its matching role model instead of OpenAI fallback model', async () => {
  const { getProviderRoleConfig } = await import('./modelProvider.ts');
  process.env.AI_PRIMARY_API_KEY = 'sk-deepseek-secret';
  process.env.OPENAI_MODEL_REPORT = 'gpt-report-dev';

  expect(getProviderRoleConfig('primary')).toMatchObject({
    role: 'primary',
    provider: 'deepseek',
    apiKey: 'sk-deepseek-secret',
    model: '',
    configured: false
  });
});

test('role-specific non-OpenAI provider uses chat completions for JSON calls', async () => {
  const { callProviderRoleJson } = await import('./modelProvider.ts');
  process.env.AI_BACKUP_PROVIDER = 'qwen';
  process.env.AI_BACKUP_API_KEY = 'sk-qwen-secret';
  process.env.AI_BACKUP_BASE_URL = 'https://dashscope.example/compatible-mode/v1';
  process.env.AI_BACKUP_MODEL = 'qwen-plus';

  chatCompletionsCreate.mockResolvedValueOnce({
    choices: [{ message: { content: '{"source":"real","value":"ok"}' } }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
  });

  const result = await callProviderRoleJson('backup', {
    task: 'provider-smoke',
    schemaName: 'ProviderSmoke',
    jsonSchema: {
      type: 'object',
      additionalProperties: false
    },
    prompt: 'return json',
    validate: (value) => value as { source: string; value: string },
    maxAttempts: 1
  });

  expect(result).toMatchObject({
    data: { source: 'real', value: 'ok' },
    usage: {
      model: 'qwen-plus',
      task: 'provider-smoke',
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5
    }
  });
  expect(chatCompletionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'qwen-plus',
      response_format: { type: 'json_object' },
      messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'return json' })])
    })
  );
  expect(responsesCreate).not.toHaveBeenCalled();
});

test('OpenAI fallback provider keeps using responses JSON schema calls', async () => {
  const { callProviderRoleJson } = await import('./modelProvider.ts');
  process.env.OPENAI_API_KEY = 'sk-openai-dev';
  process.env.OPENAI_MODEL_REPORT = 'gpt-report-dev';

  responsesCreate.mockResolvedValueOnce({
    output_text: '{"source":"real","value":"ok"}',
    output: [],
    usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 }
  });

  const result = await callProviderRoleJson('primary', {
    task: 'provider-smoke',
    schemaName: 'ProviderSmoke',
    jsonSchema: {
      type: 'object',
      additionalProperties: false
    },
    prompt: 'return json',
    validate: (value) => value,
    maxAttempts: 1
  });

  expect(result.data).toEqual({ source: 'real', value: 'ok' });
  expect(responsesCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-report-dev',
      text: expect.objectContaining({
        format: expect.objectContaining({
          type: 'json_schema',
          name: 'ProviderSmoke'
        })
      })
    })
  );
  expect(chatCompletionsCreate).not.toHaveBeenCalled();
});

test('provider role errors expose a role-safe label instead of provider config details', async () => {
  const { callProviderRoleJson } = await import('./modelProvider.ts');
  process.env.AI_PRIMARY_PROVIDER = 'deepseek';
  process.env.AI_PRIMARY_API_KEY = 'sk-deepseek-secret';
  process.env.AI_PRIMARY_BASE_URL = 'https://api.deepseek.example/v1';
  process.env.AI_PRIMARY_MODEL = 'deepseek-chat';

  chatCompletionsCreate.mockRejectedValueOnce(Object.assign(new Error('rate limit'), { status: 429 }));

  const error = await callProviderRoleJson('primary', {
    task: 'report',
    schemaName: 'TestSchema',
    jsonSchema: {
      type: 'object',
      additionalProperties: false
    },
    prompt: 'hello',
    validate: (value) => value,
    maxAttempts: 1
  }).catch((caught) => caught);

  const clientError = toClientAiError(error);
  const serialized = JSON.stringify(clientError);

  expect(clientError.detail).toContain('primary-role');
  expect(serialized).not.toContain('deepseek-chat');
  expect(serialized).not.toContain('deepseek');
  expect(serialized).not.toContain('api.deepseek.example');
  expect(serialized).not.toContain('sk-deepseek-secret');
});
