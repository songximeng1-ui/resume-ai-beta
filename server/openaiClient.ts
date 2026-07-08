import 'dotenv/config';
import OpenAI from 'openai';
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { careerCoachSystemPrompt } from './prompts.ts';
import type { AiUsage } from '../src/types.ts';

const DEFAULT_SMALL_MODEL = 'gpt-5.4-mini';
const DEFAULT_REPORT_MODEL = 'gpt-5.4';
const DEFAULT_AI_REQUEST_TIMEOUT_MS = 60_000;

export interface OpenAiConfig {
  apiKey: string;
  configured: boolean;
  smallModel: string;
  reportModel: string;
  proxyUrl: string;
  timeoutMs: number;
}

export interface JsonCallOptions<T = unknown> {
  model: string;
  task: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  prompt: string;
  validate: (value: unknown) => T;
  maxAttempts?: number;
}

export interface AiRuntime {
  callSmallModelJson<T>(options: JsonCallOptions<T>): Promise<AiRuntimeResult<T>>;
  callReportModelJson<T>(options: JsonCallOptions<T>): Promise<AiRuntimeResult<T>>;
}

export interface AiTaskResult<T> {
  data: T;
  usage: AiUsage | null;
}

export type AiRuntimeResult<T> = T | AiTaskResult<T>;

export type AiErrorCode =
  | 'config_missing'
  | 'auth_error'
  | 'model_error'
  | 'rate_limit'
  | 'timeout'
  | 'network_error'
  | 'server_error'
  | 'empty_response'
  | 'invalid_json'
  | 'schema_validation'
  | 'request_failed';

export interface ClassifiedAiError {
  code: AiErrorCode;
  message: string;
  detail: string;
  retryable: boolean;
  status?: number;
  attempts?: number;
}

export class AiServiceError extends Error implements ClassifiedAiError {
  code: AiErrorCode;
  detail: string;
  retryable: boolean;
  status?: number;
  attempts: number;

  constructor(error: ClassifiedAiError) {
    super(error.message);
    this.name = 'AiServiceError';
    this.code = error.code;
    this.detail = error.detail;
    this.retryable = error.retryable;
    this.status = error.status;
    this.attempts = error.attempts || 1;
  }
}

export function getOpenAiConfig(): OpenAiConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || '';
  const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  return {
    apiKey,
    configured: Boolean(apiKey),
    smallModel: process.env.OPENAI_MODEL_SMALL?.trim() || DEFAULT_SMALL_MODEL,
    reportModel: process.env.OPENAI_MODEL_REPORT?.trim() || DEFAULT_REPORT_MODEL,
    proxyUrl: process.env.OPENAI_PROXY_URL?.trim() || process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || '',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_AI_REQUEST_TIMEOUT_MS
  };
}

function readErrorField(error: unknown, key: string): unknown {
  return error && typeof error === 'object' && key in error ? (error as Record<string, unknown>)[key] : undefined;
}

export function redactSensitiveText(message: string) {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').slice(0, 700);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown OpenAI request error';
}

function errorStatus(error: unknown) {
  const status = readErrorField(error, 'status') ?? readErrorField(error, 'statusCode');
  return typeof status === 'number' ? status : undefined;
}

function userMessageFor(code: AiErrorCode) {
  switch (code) {
    case 'config_missing':
      return '服务端未配置 OPENAI_API_KEY，无法调用真实 AI。';
    case 'auth_error':
      return 'OpenAI API Key 无效或无权限，请检查服务端 .env 配置。';
    case 'model_error':
      return 'OpenAI 模型不可用，请检查 OPENAI_MODEL_SMALL / OPENAI_MODEL_REPORT。';
    case 'rate_limit':
      return 'OpenAI 当前限流，请稍后重试。';
    case 'timeout':
      return 'OpenAI 请求超时，请稍后重试或检查网络/代理。';
    case 'network_error':
      return 'OpenAI 网络连接失败，请检查网络或代理配置。';
    case 'server_error':
      return 'OpenAI 服务暂时异常，请稍后重试。';
    case 'empty_response':
      return 'OpenAI 返回为空，未生成可解析内容。';
    case 'invalid_json':
      return 'OpenAI 返回内容不是合法 JSON，请重试。';
    case 'schema_validation':
      return 'OpenAI 返回结构不符合报告格式，请重试。';
    default:
      return 'OpenAI 请求失败，请检查 API Key、模型名、网络或代理配置。';
  }
}

export function classifyAiError(error: unknown): ClassifiedAiError {
  if (error instanceof AiServiceError) {
    return error;
  }

  const status = errorStatus(error);
  const rawMessage = errorMessage(error);
  const detail = redactSensitiveText(rawMessage);
  const lower = rawMessage.toLowerCase();
  const rawCode = String(readErrorField(error, 'code') || '').toLowerCase();

  let code: AiErrorCode = 'request_failed';
  let retryable = false;

  if (status === 401 || status === 403 || lower.includes('incorrect api key') || lower.includes('invalid api key')) {
    code = 'auth_error';
  } else if (status === 404 || lower.includes('model not found') || lower.includes('model_not_found')) {
    code = 'model_error';
  } else if (status === 429 || lower.includes('rate limit')) {
    code = 'rate_limit';
    retryable = true;
  } else if (status && status >= 500) {
    code = 'server_error';
    retryable = true;
  } else if (rawCode.includes('timeout') || rawCode.includes('etimedout') || lower.includes('timeout') || lower.includes('timed out')) {
    code = 'timeout';
    retryable = true;
  } else if (
    rawCode.includes('econn') ||
    rawCode.includes('enotfound') ||
    rawCode.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('connection error') ||
    lower.includes('connection failed') ||
    lower.includes('fetch failed')
  ) {
    code = 'network_error';
    retryable = true;
  }

  return {
    code,
    message: userMessageFor(code),
    detail,
    retryable,
    status
  };
}

export async function runWithRetry<T>(
  operation: () => Promise<T>,
  options: { task: string; model: string; maxAttempts?: number; delayMs?: number }
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts || 2);
  const delayMs = Math.max(0, options.delayMs ?? 500);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const classified = classifyAiError(error);
      const withContext = new AiServiceError({
        ...classified,
        detail: redactSensitiveText(`${classified.detail} (task: ${options.task}, model: ${options.model})`),
        attempts: attempt
      });

      if (!withContext.retryable || attempt >= maxAttempts) {
        throw withContext;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new AiServiceError({
    code: 'request_failed',
    message: userMessageFor('request_failed'),
    detail: `OpenAI request failed after ${maxAttempts} attempts`,
    retryable: false,
    attempts: maxAttempts
  });
}

export function toClientAiError(error: unknown) {
  const classified = classifyAiError(error);
  return {
    error: classified.detail ? `${classified.message} ${classified.detail}` : classified.message,
    message: classified.message,
    code: classified.code,
    retryable: classified.retryable,
    attempts: classified.attempts || 1,
    detail: classified.detail
  };
}

const modelTokenPricesUsdPerMillion: Record<string, { input: number; output: number }> = {
  'gpt-5.4': { input: 2.5, output: 15 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 }
};

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const prices = modelTokenPricesUsdPerMillion[model];
  if (!prices) {
    return null;
  }
  const cost = (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;
  return Number(cost.toFixed(6));
}

export function buildAiUsage(response: unknown, options: { model: string; task: string }): AiUsage | null {
  const usage = readErrorField(response, 'usage');
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const inputTokens = readNumber(readErrorField(usage, 'input_tokens') ?? readErrorField(usage, 'inputTokens'));
  const outputTokens = readNumber(readErrorField(usage, 'output_tokens') ?? readErrorField(usage, 'outputTokens'));
  const totalTokens = readNumber(readErrorField(usage, 'total_tokens') ?? readErrorField(usage, 'totalTokens')) || inputTokens + outputTokens;

  return {
    model: options.model,
    task: options.task,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: estimateCostUsd(options.model, inputTokens, outputTokens)
  };
}

function extractOutputText(response: OpenAIResponse) {
  if (response.output_text?.trim()) {
    return response.output_text;
  }

  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type === 'output_text' && part.text.trim()) {
        return part.text;
      }
    }
  }

  throw new AiServiceError({
    code: 'empty_response',
    message: userMessageFor('empty_response'),
    detail: 'OpenAI returned an empty response',
    retryable: true
  });
}

async function callModelJson<T>(options: JsonCallOptions<T>): Promise<AiTaskResult<T>> {
  const { apiKey, proxyUrl, timeoutMs } = getOpenAiConfig();
  if (!apiKey) {
    throw new AiServiceError({
      code: 'config_missing',
      message: userMessageFor('config_missing'),
      detail: 'OPENAI_API_KEY is missing',
      retryable: false
    });
  }

  return runWithRetry(
    async () => {
      const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;
      const client = new OpenAI({
        apiKey,
        timeout: timeoutMs,
        fetch: proxyAgent
          ? ((input, init) => undiciFetch(input as never, { ...(init as object), dispatcher: proxyAgent } as never) as unknown as Promise<Response>)
          : undefined
      });
      const response = await client.responses.create({
        model: options.model,
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
        const detail = error instanceof Error ? redactSensitiveText(error.message) : 'unknown parse error';
        throw new AiServiceError({
          code: 'invalid_json',
          message: userMessageFor('invalid_json'),
          detail,
          retryable: true
        });
      }

      try {
        return {
          data: options.validate(parsed),
          usage: buildAiUsage(response, { model: options.model, task: options.task })
        };
      } catch (error) {
        const detail = error instanceof Error ? redactSensitiveText(error.message) : 'unknown schema error';
        throw new AiServiceError({
          code: 'schema_validation',
          message: userMessageFor('schema_validation'),
          detail,
          retryable: true
        });
      }
    },
    { task: options.task, model: options.model, maxAttempts: options.maxAttempts || 2 }
  );
}

export async function callSmallModelJson<T>(options: JsonCallOptions<T>): Promise<AiTaskResult<T>> {
  const { smallModel } = getOpenAiConfig();
  return callModelJson({ ...options, model: options.model || smallModel });
}

export async function callReportModelJson<T>(options: JsonCallOptions<T>): Promise<AiTaskResult<T>> {
  const { reportModel } = getOpenAiConfig();
  return callModelJson({ ...options, model: options.model || reportModel });
}
