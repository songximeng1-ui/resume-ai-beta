import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getAiService, verifyBetaAccessCode } from './aiService';

const BETA_STORAGE_KEY = 'job-map-v0.3-beta-access';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('uses relative API paths when VITE_API_BASE_URL is not configured', async () => {
  await verifyBetaAccessCode('private-beta');

  expect(fetch).toHaveBeenCalledWith(
    '/api/beta/access',
    expect.objectContaining({
      method: 'POST'
    })
  );
});

test('uses VITE_API_BASE_URL for backend requests when configured', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://resume-api.onrender.com/');
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
    configured: false,
    mode: 'demo',
    message: 'demo'
  }));

  await getAiService().getStatus();

  expect(fetch).toHaveBeenCalledWith(
    'https://resume-api.onrender.com/api/ai/status',
    expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        'x-beta-access-code': 'private-beta'
      })
    })
  );
});

test('reads VITE_API_BASE_URL through direct import.meta.env access for production builds', () => {
  const source = readFileSync(join(process.cwd(), 'src/services/aiService.ts'), 'utf8');

  expect(source).toContain('import.meta.env.VITE_API_BASE_URL');
});

test('dig-question service contract uses V0.4 user-visible questions and hidden metadata', async () => {
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
    source: 'real',
    assetId: 'project',
    userVisibleQuestions: [
      '你这段项目里，自己实际完成的动作是哪 1-2 个？',
      '这件事有没有可以核实的对象、周期、工具或交付物？',
      '如果面试时被问到困难，你能想到一个真实问题和你的处理方式吗？'
    ],
    internalMetadata: [
      {
        questionId: 'q_1',
        relatedAssetId: 'project',
        relatedJdRequirementId: 'req_1',
        method: 'tar',
        factDimensions: ['task', 'action'],
        internalWhy: '补齐项目证据'
      }
    ],
    encouragement: '这一步只是在帮你回忆真实细节，不需要写得很完整。'
  }));

  const result = await getAiService().generateDigQuestions({
    profile: {
      education: '',
      schoolName: '',
      major: '',
      graduation: '',
      city: '',
      targetRole: '用户运营',
      internship: '',
      project: '问卷调研',
      campus: '',
      partTime: '',
      awards: '',
      skills: '',
      portfolio: ''
    },
    asset: {
      id: 'project',
      title: '项目经历',
      content: '问卷调研',
      status: '确认使用',
      confirmed: true,
      source: 'demo',
      isGap: false,
      notes: []
    },
    jdText: '岗位要求：整理用户反馈。',
    previousAnswers: []
  });

  expect(result.userVisibleQuestions).toHaveLength(3);
  expect(result.internalMetadata[0]).toMatchObject({
    method: 'tar',
    factDimensions: expect.arrayContaining(['task'])
  });
  expect(JSON.stringify(result.userVisibleQuestions)).not.toMatch(/TAR|PART|PREP|HR 视角|为什么问|事实回忆维度/i);
  expect(JSON.stringify(result)).not.toMatch(/potentialHighlight|answerHint|resumePreview/);
});
