import 'dotenv/config';
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

function retryModelLabel(role: ProviderRole) {
  return `${role}-role`;
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
  const usesRoleProvider = Boolean(roleApiKey);
  const apiKey = roleApiKey || fallbackApiKey;
  const provider =
    readEnv(`${prefix}_PROVIDER`) || (usesRoleProvider ? defaultProvider(role) : fallbackApiKey ? 'openai' : defaultProvider(role));
  const model = usesRoleProvider
    ? readEnv(`${prefix}_MODEL`)
    : fallbackApiKey
      ? fallbackModel(role)
      : '';

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

export function getConfiguredProviderRoles(): Record<ProviderRole, ProviderRoleConfig> {
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
          ? ((input, init) =>
              undiciFetch(input as never, { ...(init as object), dispatcher: proxyAgent } as never) as unknown as Promise<Response>)
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
    { task: options.task, model: retryModelLabel(role), maxAttempts: options.maxAttempts || 2 }
  );
}
