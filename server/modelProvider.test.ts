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
  for (const key of keys) {
    delete process.env[key];
  }
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
