import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createAiServer, getServerListenConfig } from './index.ts';
import { buildCompactReportContext, careerCoachSystemPrompt, jdFitPrompt, reportModulePrompt, reportPrompt } from './prompts.ts';
import {
  diagnosisReportJsonSchema,
  digQuestionsJsonSchema,
  validateDiagnosisReport,
  validateDigQuestionSet,
  validateReportActionPlanModule,
  validateReportDirectionsModule,
  validateReportRewritesModule
} from './schemas.ts';
import { AiServiceError } from './openaiClient.ts';
import type { AiRuntime, JsonCallOptions } from './openaiClient.ts';
import * as modelProvider from './modelProvider.ts';

function v04Rewrite(overrides: Record<string, string> = {}) {
  const rewrite = {
    relatedExperience: '教育机构新媒体运营实习',
    originalIssue: '原表达只写“帮忙”，没有说明对象、动作和本人边界。',
    capability: '社群维护、内容整理',
    directVersion: '协助教育机构整理公众号推文素材，并在学生社群中发布活动通知。',
    versionAfterSupplement: '补充推文频率、社群数量和活动反馈记录后，可进一步写清楚真实产出。',
    usageReminder: '使用前确认推文素材整理频率和社群数量。',
    original: '在教育机构帮忙发推文和群通知。',
    optimized: '协助教育机构整理公众号推文素材，并在学生社群中发布活动通知。',
    reason: '把零散动作整理成岗位能理解的内容支持和用户触达。',
    jdRequirement: '可迁移到社群运营、内容运营助理方向。',
    risk: '使用前确认推文素材整理频率和社群数量。',
    interviewProbe: '可能被问到每周参与频率和具体工具。'
  };
  return { ...rewrite, ...overrides };
}

function v04ActionPlan(source: 'real' | 'demo' = 'real') {
  const item = (
    period: string,
    what: string,
    why: string,
    how: string,
    completionStandard: string,
    jobSearchValue: string
  ) => ({
    period,
    what,
    why,
    how,
    completionStandard,
    jobSearchValue,
    action: what,
    deliverable: completionStandard,
    resumeUsage: jobSearchValue,
    targetAbility: why
  });
  return {
    source,
    plans: [
      item('7 天内', '整理一份已确认经历清单，标注每段经历的任务、工具和产出。', '先筛选能真实写入简历的经历证据。', '按任务、工具、产出、本人边界四列整理。', '1 份经历素材表', '用于筛选可写入简历的真实经历。'),
      item('7 天内', '挑选 3 个真实岗位 JD，记录岗位名称、要求关键词和常见任务。', '用真实岗位要求验证当前材料。', '记录重复出现的能力词、任务描述和证据缺口。', '1 份岗位关键词对照表', '用于判断简历表达是否对应真实岗位。'),
      item('14 天内', '补充一份社群维护或内容整理复盘，写清对象、频率、动作和反馈。', '把现有经历补成可被追问的事实材料。', '补充对象、频率、本人动作、反馈记录和不能夸大的边界。', '1 页经历复盘', '用于改写用户运营或内容运营相关经历。'),
      item('14 天内', '整理 2 个可展示作品或过程材料，并补上本人分工说明。', '让简历表达有材料支撑。', '选择作品链接、截图或过程说明，并标注素材来源和本人参与部分。', '2 个作品材料链接或截图说明', '用于支撑新媒体运营助理投递。'),
      item('30 天内', '完成 6 次小批量投递，并记录岗位、简历版本和反馈。', '用真实反馈验证方向和简历版本。', '记录岗位名称、JD 关键词、投递版本、反馈和下一步修改点。', '1 份投递记录表', '用于迭代简历关键词和投递方向。'),
      item('30 天内', '针对反馈最高的方向准备 5 个面试追问题纲。', '确认简历内容能在面试中解释清楚。', '每个问题写清关联经历、可说事实、待核实信息和不能夸大的边界。', '1 份面试准备清单', '用于把简历经历转成可解释的面试素材。')
    ],
    confidenceSummary: '你不是没有经历，而是需要把现有动作整理成岗位语言和可展示材料。'
  };
}

function validInventoryReport() {
  return {
    mode: 'inventory' as const,
    source: 'real' as const,
    summary: '当前最可用的筹码是社群维护、内容整理、问卷调研和 Excel 汇总。',
    highlights: [
      {
        sourceExperience: '教育机构新媒体运营实习',
        capability: '社群维护与用户触达',
        jdRequirement: '用户运营 / 社群运营',
        whyNotFlattery: '用户确实做过社群提醒和内容整理，能支撑基础运营动作。',
        professionalExpression: '协助维护学生社群，整理活动通知与反馈信息。'
      },
      {
        sourceExperience: '校园调研项目',
        capability: '信息整理与复盘',
        jdRequirement: '数据运营助理',
        whyNotFlattery: '问卷设计和 Excel 汇总可以对应基础数据整理。',
        professionalExpression: '参与问卷设计，使用 Excel 汇总调研结果并完成课堂展示。'
      }
    ],
    rewrites: [
      v04Rewrite(),
      v04Rewrite({
        relatedExperience: '校园调研项目',
        originalIssue: '原表达没有说明材料来源、工具和交付物。',
        capability: '问卷整理、Excel 汇总、展示支持',
        directVersion: '参与校园调研项目，使用 Excel 汇总问卷结果并支持展示汇报。',
        versionAfterSupplement: '补充样本量、问卷维度和表格处理方式后，可进一步说明调研产出。',
        usageReminder: '不能写成商业数据分析项目。',
        original: '用 Excel 整理问卷。',
        optimized: '参与校园调研项目，使用 Excel 汇总问卷结果并支持展示汇报。',
        reason: '突出工具、材料来源和交付物。',
        jdRequirement: '可迁移到数据运营助理或项目助理方向。',
        risk: '不能写成商业数据分析项目。',
        interviewProbe: '可能被问到样本量和表格处理方式。'
      }),
      v04Rewrite({
        relatedExperience: '技能与工具材料',
        originalIssue: '工具能力如果只罗列名称，缺少真实使用场景。',
        capability: '基础内容制作、公众号排版',
        directVersion: '具备基础内容制作能力，可使用剪映处理短视频素材，并协助完成公众号内容排版。',
        versionAfterSupplement: '补充作品链接、截图或具体排版样例后，可写得更具体。',
        usageReminder: '使用前确认作品链接、排版样例和本人参与范围。',
        original: '会剪映和公众号排版。',
        optimized: '具备基础内容制作能力，可使用剪映处理短视频素材，并协助完成公众号内容排版。',
        reason: '把工具能力连接到可验证的内容支持任务。',
        jdRequirement: '可迁移到新媒体运营助理和内容运营助理方向。',
        risk: '使用前确认作品链接、排版样例和本人参与范围。',
        interviewProbe: '可能被问到具体作品、处理流程和使用频率。'
      })
    ],
    directionOptions: [
      {
        directionName: '用户运营 / 社群运营',
        name: '用户运营 / 社群运营',
        level: '优先探索' as const,
        priority: '优先探索' as const,
        searchableJobNames: ['用户运营', '社群运营', '活动运营'],
        whyExplore: '基于当前经历，更值得优先探索的是需要社群维护、活动通知和反馈整理的岗位。',
        why: '基于当前经历，更值得优先探索的是需要社群维护、活动通知和反馈整理的岗位。',
        evidence: '教育机构实习中有学生社群维护、公众号内容整理和用户触达。',
        gap: '当前证据还不充分的是活动复盘、用户分层和数据记录。',
        sevenDayValidation: '7 天内搜索 3 个用户运营或社群运营 JD，补一份社群活动复盘表，记录对象、频率、反馈和改进。',
        next: '未来 2 周补一份社群活动复盘表，记录对象、频率、反馈和改进。',
        keywords: ['用户运营', '社群运营', '活动运营']
      },
      {
        directionName: '新媒体运营助理',
        name: '新媒体运营助理',
        level: '可以尝试' as const,
        priority: '可以尝试' as const,
        searchableJobNames: ['新媒体运营', '内容运营助理', '公众号运营'],
        whyExplore: '公众号推文素材整理和剪映技能可以支持基础内容岗位尝试。',
        why: '公众号推文素材整理和剪映技能可以支持基础内容岗位尝试。',
        evidence: '有公众号排版、推文整理和剪映基础。',
        gap: '还需要补充可展示作品和内容数据复盘。',
        sevenDayValidation: '7 天内搜索 3 个新媒体运营助理 JD，整理 2 篇内容作品，补充选题、排版和复盘说明。',
        next: '整理 2 篇内容作品，补充选题、排版和复盘说明。',
        keywords: ['新媒体运营', '内容运营助理', '公众号运营']
      }
    ],
    actionPlan: v04ActionPlan(),
    safetyNotes: ['方向建议只作为探索起点，不替用户决定人生。'],
    resumeText: ['协助整理内容素材，维护学生社群。'],
    platformFields: ['社群维护；公众号排版；Excel'],
    previewLines: ['可优先探索用户运营、社群运营和新媒体运营助理。']
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

async function withServer(runtime?: Partial<AiRuntime>) {
  const server = createAiServer(runtime);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing test server address');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function requestReport(
  server: Awaited<ReturnType<typeof withServer>>,
  payload: Record<string, unknown>
) {
  const response = await fetch(`${server.baseUrl}/api/ai/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'senior', profile: {}, assets: [], ...payload })
  });
  return {
    response,
    body: await response.json()
  };
}

test('status returns demo mode when OPENAI_API_KEY is not configured', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const server = await withServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/status`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      configured: false,
      mode: 'demo',
      message: '当前为演示模式，请在服务端 .env 中配置 OPENAI_API_KEY'
    });
  } finally {
    await server.close();
  }
});

test('AI endpoints require beta access code when configured', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.BETA_ACCESS_CODE = 'private-beta';

  const server = await withServer();
  try {
    const blocked = await fetch(`${server.baseUrl}/api/ai/structure-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: '本科 用户运营', currentProfile: {} })
    });
    const blockedBody = await blocked.json();

    expect(blocked.status).toBe(401);
    expect(blockedBody.code).toBe('beta_access_required');

    const wrong = await fetch(`${server.baseUrl}/api/ai/structure-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: '本科 用户运营', currentProfile: {}, betaAccessCode: 'wrong-code' })
    });

    expect(wrong.status).toBe(401);

    const allowed = await fetch(`${server.baseUrl}/api/ai/structure-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: '本科 用户运营', currentProfile: {}, betaAccessCode: 'private-beta' })
    });
    const allowedBody = await allowed.json();

    expect(allowed.status).toBe(200);
    expect(allowedBody.source).toBe('demo');
  } finally {
    await server.close();
  }
});

test('beta access check endpoint validates code without requiring AI configuration', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.BETA_ACCESS_CODE = 'private-beta';

  const server = await withServer();
  try {
    const denied = await fetch(`${server.baseUrl}/api/beta/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betaAccessCode: 'wrong-code' })
    });
    const allowed = await fetch(`${server.baseUrl}/api/beta/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betaAccessCode: 'private-beta' })
    });

    expect(denied.status).toBe(401);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ ok: true });
  } finally {
    await server.close();
  }
});

test('CORS allows configured frontend origin and rejects other origins', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.BETA_ACCESS_CODE = 'private-beta';
  process.env.FRONTEND_ORIGIN = 'https://resume-beta.vercel.app';

  const server = await withServer();
  try {
    const allowed = await fetch(`${server.baseUrl}/api/ai/status`, {
      headers: {
        Origin: 'https://resume-beta.vercel.app',
        'x-beta-access-code': 'private-beta'
      }
    });
    const rejected = await fetch(`${server.baseUrl}/api/ai/status`, {
      headers: {
        Origin: 'https://example.com',
        'x-beta-access-code': 'private-beta'
      }
    });

    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://resume-beta.vercel.app');
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  } finally {
    await server.close();
  }
});

test('server listen config supports Render PORT and host binding', () => {
  process.env.PORT = '10000';
  process.env.API_HOST = '0.0.0.0';
  process.env.AI_API_PORT = '8787';

  expect(getServerListenConfig()).toEqual({
    port: 10000,
    host: '0.0.0.0'
  });
});

test('small task endpoints use the small model runtime and return real source when configured', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const callSmallModelJson = vi.fn(async () => ({
    source: 'real',
    profile: {
      education: '本科',
      schoolName: '杭州应用技术学院',
      major: '市场营销',
      graduation: '2026 年 6 月',
      city: '杭州',
      targetRole: '用户运营',
      internship: '',
      project: '',
      campus: '',
      partTime: '',
      awards: '',
      skills: '',
      portfolio: ''
    },
    fieldStatuses: {
      education: 'AI 已识别',
      schoolName: 'AI 已识别',
      major: 'AI 已识别',
      graduation: 'AI 已识别',
      city: '待用户确认',
      targetRole: 'AI 已识别',
      internship: '待用户确认',
      project: '待用户确认',
      campus: '待用户确认',
      partTime: '待用户确认',
      awards: '待用户确认',
      skills: '待用户确认',
      portfolio: '待用户确认'
    },
    assets: []
  }));

  const server = await withServer({ callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/structure-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: '本科 市场营销 目标用户运营', currentProfile: {} })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('real');
    expect(callSmallModelJson).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-mini',
        task: 'structure-resume'
      })
    );
  } finally {
    await server.close();
  }
});

test('dig questions use V0.4 hidden internal metadata and natural user questions', () => {
  const payload = {
    source: 'real' as const,
    assetId: 'internship',
    userVisibleQuestions: ['你提到维护学生社群，当时主要接触的是学生、家长还是老师？'],
    internalMetadata: [
      {
        questionId: 'q_1',
        relatedAssetId: 'internship',
        relatedJdRequirementId: 'req_1',
        method: 'hr',
        factDimensions: ['task', 'action'],
        internalWhy: '核实用户触达和本人分工。'
      }
    ],
    encouragement: '你这段经历已经有真实任务线索，不需要硬包装，先把本人动作说清楚就有价值。'
  };

  expect(validateDigQuestionSet(payload)).toMatchObject(payload);
  expect(digQuestionsJsonSchema.required).toEqual(expect.arrayContaining(Object.keys(digQuestionsJsonSchema.properties)));
  expect(() =>
    validateDigQuestionSet({
      source: 'real',
      assetId: 'internship',
      userVisibleQuestions: ['请按 TAR 说一下你的任务、行动、结果'],
      internalMetadata: [
        {
          questionId: 'q_1',
          relatedAssetId: 'internship',
          method: 'tar',
          factDimensions: ['task', 'action', 'result'],
          internalWhy: '补齐事实证据。'
        }
      ],
      encouragement: '这段经历有价值。'
    })
  ).toThrow(/userVisibleQuestions/);
});

test('demo dig-question endpoint returns natural questions without exposing internal methods', async () => {
  delete process.env.OPENAI_API_KEY;
  const server = await withServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/dig-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'jd',
        profile: { targetRole: '用户运营' },
        jdSummary: { requirements: ['整理用户反馈'] },
        asset: {
          id: 'internship',
          title: '实习经历',
          content: '维护学生社群并整理公众号推文',
          status: '确认使用',
          confirmed: true
        },
        jdText: '负责用户反馈整理。',
        previousAnswers: []
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userVisibleQuestions).toHaveLength(3);
    expect(body.userVisibleQuestions.join(' ')).not.toMatch(/TAR|PART|PREP|HR 视角|为什么问|事实回忆维度/i);
    expect(body.internalMetadata[0]).toMatchObject({
      relatedJdRequirementId: expect.any(String),
      method: expect.stringMatching(/hr|tar|part|prep/)
    });
    expect(JSON.stringify(body)).not.toMatch(/potentialHighlight|answerHint|resumePreview/);
  } finally {
    await server.close();
  }
});

test('status hides configured model details from browser clients', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'qwen-test';
  process.env.OPENAI_MODEL_REPORT = 'deepseek-test';

  const server = await withServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/status`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      configured: true,
      mode: 'real'
    });
    expect(JSON.stringify(body)).not.toMatch(/model|deepseek|qwen|kimi|gpt/i);
  } finally {
    await server.close();
  }
});

test('status accepts dedicated primary and backup provider configuration without exposing details', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIMARY_API_KEY = 'deepseek-key';
  process.env.AI_PRIMARY_MODEL = 'deepseek-chat';
  process.env.AI_BACKUP_API_KEY = 'qwen-key';
  process.env.AI_BACKUP_MODEL = 'qwen-plus';

  const server = await withServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/status`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      configured: true,
      mode: 'real'
    });
    expect(JSON.stringify(body)).not.toMatch(/model|deepseek|qwen|kimi|provider|token|cost/i);
  } finally {
    await server.close();
  }
});

test('report endpoint returns a conservative basic report instead of demo on real failures', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const callReportModelJson = vi.fn(async () => {
    throw new Error('model not found');
  });

  const server = await withServer({ callReportModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isBasic).toBe(true);
    expect(body.source).toBe('real');
    expect(body.summary).toContain('当前已为你生成基础版报告');
    expect(body.directionOptions.length).toBeGreaterThanOrEqual(2);
    expect(body.usage).toBeUndefined();
    expect(body.reportTask).toMatchObject({
      status: 'completed',
      completedModules: ['assembledReport'],
      retryable: false
    });
    expect(JSON.stringify(body)).not.toContain('演示结果');
    expect(callReportModelJson).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4',
        task: 'report-highlights'
      })
    );
  } finally {
    await server.close();
  }
});

test('basic report fallback only uses confirmed or edited-confirmed assets', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const callReportModelJson = vi.fn(async () => {
    throw new Error('model timeout');
  });

  const server = await withServer({ callReportModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'inventory',
        stage: 'senior',
        profile: {},
        assets: [
          {
            id: 'project',
            title: '项目经历',
            content: '确认可用项目经历',
            status: '确认使用',
            confirmed: true,
            source: 'real',
            isGap: false
          },
          {
            id: 'internship',
            title: '实习经历',
            content: '未确认实习不能进入报告',
            status: '待确认',
            confirmed: false,
            source: 'real',
            isGap: false
          },
          {
            id: 'campus',
            title: '校园经历',
            content: '暂不使用经历不能进入报告',
            status: '暂不使用',
            confirmed: false,
            source: 'real',
            isGap: false
          }
        ],
        jdText: ''
      })
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.isBasic).toBe(true);
    expect(serialized).toContain('确认可用项目经历');
    expect(serialized).not.toContain('未确认实习不能进入报告');
    expect(serialized).not.toContain('暂不使用经历不能进入报告');
  } finally {
    await server.close();
  }
});

test('report endpoint can use dedicated primary provider config without OPENAI_API_KEY', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIMARY_API_KEY = 'deepseek-key';
  process.env.AI_PRIMARY_MODEL = 'deepseek-chat';
  process.env.AI_BACKUP_API_KEY = 'qwen-key';
  process.env.AI_BACKUP_MODEL = 'qwen-plus';

  const providerCalls: string[] = [];
  const valid = validInventoryReport();
  vi.spyOn(modelProvider, 'callProviderRoleJson').mockImplementation(async (role, options) => {
    providerCalls.push(`${role}:${options.task}`);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
    if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: null };
    throw new Error(`unexpected provider task ${role}:${options.task}`);
  });

  const server = await withServer();
  try {
    const { response, body } = await requestReport(server, { mode: 'inventory', jdText: 'short jd' });

    expect(response.status).toBe(200);
    expect(body.source).toBe('real');
    expect(providerCalls).toEqual([
      'primary:report-highlights',
      'primary:report-directions',
      'primary:report-rewrites'
    ]);
    expect(JSON.stringify(body)).not.toMatch(/deepseek|qwen|provider|inputTokens|estimatedCostUsd/i);
  } finally {
    await server.close();
  }
});

test('dedicated provider report falls back to backup only after primary module failure', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIMARY_API_KEY = 'deepseek-key';
  process.env.AI_PRIMARY_MODEL = 'deepseek-chat';
  process.env.AI_BACKUP_API_KEY = 'qwen-key';
  process.env.AI_BACKUP_MODEL = 'qwen-plus';

  const providerCalls: string[] = [];
  const directionPrompts: string[] = [];
  const valid = validInventoryReport();
  vi.spyOn(modelProvider, 'callProviderRoleJson').mockImplementation(async (role, options) => {
    providerCalls.push(`${role}:${options.task}`);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
    if (options.task === 'report-directions') {
      directionPrompts.push(`${role}:${options.prompt}`);
      if (role === 'primary') {
        throw new AiServiceError({
          code: 'schema_validation',
          message: 'schema invalid',
          detail: 'schema invalid',
          retryable: true,
          attempts: 1
        });
      }
      return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
    }
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: null };
    throw new Error(`unexpected provider task ${role}:${options.task}`);
  });

  const server = await withServer();
  try {
    const { response, body } = await requestReport(server, { mode: 'inventory', jdText: 'short jd' });

    expect(response.status).toBe(200);
    expect(body.source).toBe('real');
    expect(providerCalls).toEqual([
      'primary:report-highlights',
      'primary:report-directions',
      'backup:report-directions',
      'primary:report-rewrites'
    ]);
    expect(directionPrompts[1]).toBe(directionPrompts[0].replace('primary:', 'backup:'));
  } finally {
    await server.close();
  }
});

test('demo report supports inventory mode without requiring JD fit or 5 interview questions', async () => {
  delete process.env.OPENAI_API_KEY;

  const server = await withServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'inventory',
        stage: 'senior',
        profile: {
          targetRole: '用户运营',
          internship: '教育机构新媒体运营实习，维护学生社群，整理公众号推文。',
          project: '校园二手交易调研项目，设计问卷并用 Excel 整理结果。',
          skills: 'Excel、公众号排版、剪映'
        },
        assets: [],
        jdText: ''
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('inventory');
    expect(body.highlights.length).toBeGreaterThanOrEqual(2);
    expect(body.directionOptions.length).toBeGreaterThanOrEqual(2);
    expect(body.rewrites.length).toBeGreaterThanOrEqual(2);
    expect(body.actionPlan.plans.length).toBeGreaterThanOrEqual(6);
    expect(body.jdFit).toBeUndefined();
    expect(body.interviews).toBeUndefined();
    expect(body.quality).toMatchObject({
      passed: true,
      score: expect.any(Number),
      blockers: [],
      warnings: expect.any(Array)
    });
  } finally {
    await server.close();
  }
});

test('demo report supports JD mode with JD fit and 5 interview questions', async () => {
  delete process.env.OPENAI_API_KEY;

  const server = await withServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'jd',
        stage: 'senior',
        profile: {
          targetRole: '用户运营实习',
          internship: '教育机构新媒体运营实习，维护学生社群，整理公众号推文。',
          project: '校园二手交易调研项目，设计问卷并用 Excel 整理结果。'
        },
        assets: [],
        jdText: '负责社群维护、用户反馈整理、活动执行。',
        jdFit: null
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('jd');
    expect(body.highlights.length).toBeGreaterThanOrEqual(2);
    expect(body.rewrites.length).toBeGreaterThanOrEqual(2);
    expect(body.interviews).toHaveLength(5);
    expect(body.actionPlan.plans.length).toBeGreaterThanOrEqual(6);
    expect(body.jdFit).toBeTruthy();
    expect(body.quality).toMatchObject({
      passed: true,
      score: expect.any(Number),
      blockers: [],
      warnings: expect.any(Array)
    });
  } finally {
    await server.close();
  }
});

test('configured report endpoint attaches quality result after model validation', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const callReportModelJson = vi.fn(async () => validInventoryReport());

  const server = await withServer({ callReportModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('real');
    expect(body.quality).toMatchObject({
      passed: true,
      score: expect.any(Number),
      blockers: [],
      warnings: expect.any(Array)
    });
  } finally {
    await server.close();
  }
});

test('configured report endpoint hides AI usage and model diagnostics from browser clients', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const usage = {
    model: 'gpt-5.4',
    task: 'report',
    inputTokens: 2000,
    outputTokens: 1000,
    totalTokens: 3000,
    estimatedCostUsd: 0.02
  };
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: validInventoryReport().highlights }, usage };
    if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: validInventoryReport().directionOptions }, usage };
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: validInventoryReport().rewrites }, usage };
    throw new Error(`unexpected task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('real');
    expect(body.quality).toMatchObject({
      passed: true,
      score: expect.any(Number)
    });
    expect(body.usage).toBeUndefined();
    expect(body.reportTask).toBeDefined();
    expect(body.reportTask.usage).toBeUndefined();
    expect(body.reportTask.moduleUsages).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/"usage":|"moduleUsages":|"model":|"inputTokens":|"outputTokens":|"totalTokens":|"estimatedCostUsd":|"byModelTier":/i);
  } finally {
    await server.close();
  }
});

test('report generation skips Kimi extractor for normal sized inputs', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';
  process.env.AI_EXTRACTOR_API_KEY = 'kimi-key';
  process.env.AI_EXTRACTOR_MODEL = 'kimi-test';

  const extractorSpy = vi.spyOn(modelProvider, 'callProviderRoleJson');
  const server = await withServer({
    callReportModelJson: async (options) => {
      if (options.task === 'report-highlights') return { data: { source: 'real', highlights: validInventoryReport().highlights }, usage: null };
      if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: validInventoryReport().directionOptions }, usage: null };
      if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: validInventoryReport().rewrites }, usage: null };
      throw new Error(`unexpected task ${options.task}`);
    }
  });

  try {
    const { response } = await requestReport(server, { mode: 'inventory', jdText: 'short jd' });
    expect(response.status).toBe(200);
    expect(extractorSpy).not.toHaveBeenCalled();
  } finally {
    await server.close();
  }
});

test('report generation calls Kimi extractor for long JD and hides extractor diagnostics', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';
  process.env.AI_EXTRACTOR_API_KEY = 'kimi-key';
  process.env.AI_EXTRACTOR_MODEL = 'kimi-test';

  const extractorCalls: string[] = [];
  const valid = validInventoryReport();
  vi.spyOn(modelProvider, 'callProviderRoleJson').mockImplementation(async (role, options) => {
    extractorCalls.push(`${role}:${options.task}`);
    return {
      data: {
        source: 'real',
        sourceSnippets: ['负责社群维护和用户反馈整理'],
        verificationNotes: ['社群规模需要用户确认'],
        structuredFields: [{ field: 'jd_requirement', value: '社群维护', sourceSnippet: '负责社群维护和用户反馈整理' }]
      },
      usage: { model: 'kimi-test', task: 'kimi-extract', inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: null }
    };
  });
  const server = await withServer({
    callReportModelJson: async (options) => {
      expect(options.prompt).toContain('kimiExtract');
      if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
      if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
      if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: null };
      throw new Error(`unexpected task ${options.task}`);
    }
  });

  try {
    const { response, body } = await requestReport(server, { mode: 'inventory', jdText: '长'.repeat(5001) });
    expect(response.status).toBe(200);
    expect(extractorCalls).toEqual(['extractor:kimi-extract']);
    expect(JSON.stringify(body)).not.toMatch(/kimi-test|inputTokens|outputTokens|estimatedCostUsd|provider|baseUrl/i);
  } finally {
    await server.close();
  }
});

test('Kimi extractor failure does not block basic or deep report generation', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';
  process.env.AI_EXTRACTOR_API_KEY = 'kimi-key';
  process.env.AI_EXTRACTOR_MODEL = 'kimi-test';

  const valid = validInventoryReport();
  vi.spyOn(modelProvider, 'callProviderRoleJson').mockImplementation(async (role, options) => {
    if (role === 'extractor' && options.task === 'kimi-extract') throw new Error('Kimi timeout sk-secret');
    throw new Error(`unexpected provider role ${role}:${options.task}`);
  });
  const server = await withServer({
    callReportModelJson: async (options) => {
      expect(options.prompt).not.toContain('Kimi timeout');
      if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
      if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
      if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: null };
      throw new Error(`unexpected task ${options.task}`);
    }
  });

  try {
    const { response, body } = await requestReport(server, { mode: 'inventory', jdText: '长'.repeat(5001) });
    expect(response.status).toBe(200);
    expect(body.summary).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('sk-secret');
  } finally {
    await server.close();
  }
});

test('configured inventory report endpoint generates smaller modules and assembles original report shape', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const calls: string[] = [];
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push(`${options.task}:${options.model}`);
    if (options.task === 'report-highlights') {
      return {
        data: { source: 'real', highlights: validInventoryReport().highlights },
        usage: { model: options.model, task: options.task, inputTokens: 100, outputTokens: 100, totalTokens: 200, estimatedCostUsd: 0.001 }
      };
    }
    if (options.task === 'report-directions') {
      return {
        data: { source: 'real', directionOptions: validInventoryReport().directionOptions },
        usage: { model: options.model, task: options.task, inputTokens: 100, outputTokens: 100, totalTokens: 200, estimatedCostUsd: 0.001 }
      };
    }
    if (options.task === 'report-rewrites') {
      return {
        data: { source: 'real', rewrites: validInventoryReport().rewrites },
        usage: { model: options.model, task: options.task, inputTokens: 100, outputTokens: 100, totalTokens: 200, estimatedCostUsd: 0.001 }
      };
    }
    throw new Error(`unexpected task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('inventory');
    expect(body.source).toBe('real');
    expect(body.highlights).toHaveLength(2);
    expect(body.directionOptions).toHaveLength(2);
    expect(body.rewrites).toHaveLength(3);
    expect(body.actionPlan.plans.length).toBeGreaterThanOrEqual(6);
    expect(body.jdFit).toBeUndefined();
    expect(body.interviews).toBeUndefined();
    expect(body.quality.passed).toBe(true);
    expect(body.usage).toBeUndefined();
    expect(body.reportTask?.usage).toBeUndefined();
    expect(body.reportTask?.moduleUsages).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/"usage":|"moduleUsages":|"model":|"inputTokens":|"outputTokens":|"totalTokens":|"estimatedCostUsd":|"byModelTier":/i);
    expect(calls).toEqual([
      'report-highlights:gpt-5.4',
      'report-directions:gpt-5.4',
      'report-rewrites:gpt-5.4'
    ]);
  } finally {
    await server.close();
  }
});

test('configured JD report uses small/report/rule tiers without exposing usage diagnostics', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const valid = validInventoryReport();
  const jdFit = {
    source: 'real' as const,
    deliveryDecision: '可以投递，建议先优化简历' as const,
    deliveryReason: '岗位要求与已有社群维护、用户反馈整理经历部分匹配。',
    strongestEvidence: '已有真实用户触达和信息整理经历。',
    mainGap: '缺少更完整的数据复盘和业务结果。',
    nextStepAdvice: '建议投递时突出协助边界和可核实产出。',
    matrix: [
      {
        requirement: '用户运营实习生需要社群维护和反馈整理。',
        matchLevel: '有一定匹配' as const,
        evidence: '教育机构实习中维护学生社群并整理活动通知。',
        gap: '缺少用户规模和反馈结果。',
        resumeWriting: '协助维护学生社群，整理活动通知和用户反馈。',
        interviewRisk: '可能追问社群数量、频次和具体反馈。'
      }
    ]
  };
  const interviews = Array.from({ length: 5 }, (_, index) => ({
    question: `请说明社群维护经历中的具体分工 ${index + 1}`,
    whyAsk: '核实经历真实性和岗位迁移价值。',
    answerAngle: '按对象、动作、工具、结果或复盘回答。',
    concern: '不要夸大负责范围或编造用户规模。',
    sampleAnswer: '我主要协助整理活动通知和反馈信息，具体规模以真实记录为准。',
    doNotExaggerate: '不要编造用户量、转化率或负责人身份。'
  }));
  const reportCalls: string[] = [];
  const smallCalls: string[] = [];
  const reportUsage = (task: string) => ({ model: 'gpt-5.4', task, inputTokens: 100, outputTokens: 100, totalTokens: 200, estimatedCostUsd: 0.001 });
  const smallUsage = (task: string) => ({ model: 'gpt-5.4-mini', task, inputTokens: 50, outputTokens: 50, totalTokens: 100, estimatedCostUsd: 0.0002 });
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    reportCalls.push(`${options.task}:${options.model}`);
    if (options.task === 'report-jd-fit-summary') return { data: { source: 'real', jdFit }, usage: reportUsage(options.task) };
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: reportUsage(options.task) };
    if (options.task === 'report-interview-question') {
      const index = Number(options.prompt.match(/"interviewIndex":(\d)/)?.[1] || 1);
      return { data: { source: 'real', interview: interviews[index - 1] }, usage: reportUsage(options.task) };
    }
    throw new Error(`unexpected report task ${options.task}`);
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    smallCalls.push(`${options.task}:${options.model}`);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: smallUsage(options.task) };
    throw new Error(`unexpected small task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'jd', stage: 'senior', profile: { targetRole: '用户运营' }, assets: [], jdText: '负责用户运营、社群维护和反馈整理。', jdFit })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quality.passed).toBe(true);
    expect(reportCalls[0]).toBe('report-jd-fit-summary:gpt-5.4');
    expect(smallCalls).toEqual(['report-highlights:gpt-5.4-mini']);
    expect(reportCalls).toEqual([
      'report-jd-fit-summary:gpt-5.4',
      'report-rewrites:gpt-5.4',
      'report-interview-question:gpt-5.4',
      'report-interview-question:gpt-5.4',
      'report-interview-question:gpt-5.4',
      'report-interview-question:gpt-5.4',
      'report-interview-question:gpt-5.4'
    ]);
    expect(body.usage).toBeUndefined();
    expect(body.reportTask?.usage).toBeUndefined();
    expect(body.reportTask?.moduleUsages).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/"usage":|"moduleUsages":|"model":|"inputTokens":|"outputTokens":|"totalTokens":|"estimatedCostUsd":|"byModelTier":/i);
    expect(JSON.stringify(body)).not.toContain('演示结果');
  } finally {
    await server.close();
  }
});

test('configured JD report sanitizes risky rewrite and interview wording before quality check', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const valid = validInventoryReport();
  const jdFit = {
    source: 'real' as const,
    deliveryDecision: '可以投递，建议先优化简历' as const,
    deliveryReason: '岗位要求与已有社群维护经历部分匹配。',
    strongestEvidence: '已有真实用户触达经历。',
    mainGap: '缺少数据复盘。',
    nextStepAdvice: '突出协助边界。',
    matrix: [
      {
        requirement: '用户运营实习生需要社群维护。',
        matchLevel: '有一定匹配' as const,
        evidence: '教育机构实习中维护学生社群。',
        gap: '缺少用户规模和反馈结果。',
        resumeWriting: '建议写成主导社群全流程并显著提升转化率。',
        interviewRisk: '可能追问真实边界。'
      }
    ]
  };
  const riskyRewrites = [
    {
      ...valid.rewrites[0],
      optimized: '主导社群运营并独立负责全流程闭环，从 0 到 1 显著提升转化率，保证通过筛选。',
      risk: '',
      interviewProbe: ''
    },
    {
      ...valid.rewrites[1],
      optimized: '可以包装成负责用户增长，独立完成数据复盘。',
      risk: '可能追问是否真的主导。',
      interviewProbe: '说明增长结果。'
    },
    valid.rewrites[2]
  ];
  const interviews = Array.from({ length: 5 }, (_, index) => ({
    question: `请说明社群维护经历中的具体分工 ${index + 1}`,
    whyAsk: '核实经历真实性和岗位迁移价值。',
    answerAngle: '按对象、动作、工具、结果或复盘回答。',
    concern: '不要夸大负责范围或编造用户规模。',
    sampleAnswer: index === 0 ? '我主导社群增长并独立完成全流程闭环，确保转化率大幅增长。' : '我主要协助整理活动通知和反馈信息。',
    doNotExaggerate: '不要编造用户量、转化率或负责人身份。'
  }));

  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    if (options.task === 'report-jd-fit-summary') return { data: { source: 'real', jdFit }, usage: null };
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: riskyRewrites }, usage: null };
    if (options.task === 'report-interview-question') {
      const index = Number(options.prompt.match(/"interviewIndex":(\d)/)?.[1] || 1);
      return { data: { source: 'real', interview: interviews[index - 1] }, usage: null };
    }
    throw new Error(`unexpected report task ${options.task}`);
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
    throw new Error(`unexpected small task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'jd', stage: 'senior', profile: { targetRole: '用户运营' }, assets: [], jdText: '负责用户运营、社群维护和反馈整理。', jdFit })
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.quality.passed).toBe(true);
    expect(body.quality.blockers).toEqual([]);
    expect(serialized).not.toMatch(/主导|独立负责|独立完成|显著提升|大幅增长|全流程|闭环|从 0 到 1|保证|确保|可以包装成/);
    expect(body.rewrites[0].risk).toMatch(/需补充依据|按真实记录|待核实/);
    expect(body.rewrites[0].interviewProbe).toMatch(/需补充依据|按真实记录|待核实/);
    expect(body.interviews[0].sampleAnswer).toContain('按真实记录补充');
    expect(JSON.stringify(body)).not.toContain('演示结果');
  } finally {
    await server.close();
  }
});

test('configured JD report falls back only the failed report module to small model', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const valid = validInventoryReport();
  const calls: string[] = [];
  const jdFit = {
    source: 'real' as const,
    deliveryDecision: '可以投递，建议先优化简历' as const,
    deliveryReason: '岗位要求与已有社群维护、用户反馈整理经历部分匹配。',
    strongestEvidence: '已有真实用户触达和信息整理经历。',
    mainGap: '缺少更完整的数据复盘和业务结果。',
    nextStepAdvice: '建议投递时突出协助边界和可核实产出。',
    matrix: [
      {
        requirement: '用户运营实习生需要社群维护和反馈整理。',
        matchLevel: '有一定匹配' as const,
        evidence: '教育机构实习中维护学生社群并整理活动通知。',
        gap: '缺少用户规模和反馈结果。',
        resumeWriting: '协助维护学生社群，整理活动通知和用户反馈。',
        interviewRisk: '可能追问社群数量、频次和具体反馈。'
      }
    ]
  };
  const interviews = Array.from({ length: 5 }, (_, index) => ({
    question: `请说明社群维护经历中的具体分工 ${index + 1}`,
    whyAsk: '核实经历真实性和岗位迁移价值。',
    answerAngle: '按对象、动作、工具、结果或复盘回答。',
    concern: '不要夸大负责范围或编造用户规模。',
    sampleAnswer: '我主要协助整理活动通知和反馈信息，具体规模以真实记录为准。',
    doNotExaggerate: '不要编造用户量、转化率或负责人身份。'
  }));
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push(`strong:${options.task}:${options.model}`);
    if (options.task === 'report-rewrites') {
      throw new AiServiceError({
        code: 'network_error',
        message: 'OpenAI 网络连接失败，请检查网络或代理配置。',
        detail: 'Connection error. (task: report-rewrites, model: gpt-5.4)',
        retryable: true,
        attempts: 3
      });
    }
    if (options.task === 'report-highlights') return { source: 'real', highlights: valid.highlights };
    if (options.task === 'report-jd-fit-summary') return { source: 'real', jdFit };
    if (options.task === 'report-interview-question') {
      const index = Number(options.prompt.match(/"interviewIndex":(\d)/)?.[1] || 1);
      return { source: 'real', interview: interviews[index - 1] };
    }
    if (options.task === 'report-action-plan') {
      return {
        source: 'real',
        summary: '本报告基于真实经历和 JD，可以投递但建议先补足数据复盘。',
        actionPlan: valid.actionPlan,
        safetyNotes: valid.safetyNotes,
        resumeText: valid.resumeText,
        platformFields: valid.platformFields,
        previewLines: valid.previewLines
      };
    }
    throw new Error(`unexpected task ${options.task}`);
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push(`small:${options.task}:${options.model}`);
    if (options.task === 'report-highlights') return { source: 'real', highlights: valid.highlights };
    if (options.task === 'report-rewrites') return { source: 'real', rewrites: valid.rewrites };
    throw new Error(`unexpected small task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'jd',
        stage: 'senior',
        profile: {},
        assets: [],
        jdText: '负责用户运营、社群维护和反馈整理。',
        jdFit
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('jd');
    expect(body.jdFit).toBeTruthy();
    expect(body.interviews).toHaveLength(5);
    expect(body.rewrites).toHaveLength(3);
    expect(body.quality.passed).toBe(true);
    expect(calls).toContain('small:report-highlights:gpt-5.4-mini');
    expect(calls).toContain('small:report-rewrites:gpt-5.4-mini');
    expect(calls.filter((item) => item.includes('report-rewrites'))).toEqual([
      'strong:report-rewrites:gpt-5.4',
      'small:report-rewrites:gpt-5.4-mini'
    ]);
    expect(JSON.stringify(body)).not.toContain('演示结果');
  } finally {
    await server.close();
  }
});

test('jd-fit first summarizes long JD then matches with compact input and retries connection errors', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const longJd = '用户运营岗位要求：'.repeat(300);
  const calls: { task: string; prompt: string }[] = [];
  let jdFitAttempts = 0;
  const jdFit = {
    source: 'real' as const,
    deliveryDecision: '可以投递，建议先优化简历' as const,
    deliveryReason: '岗位要求与已有社群维护经历部分匹配。',
    strongestEvidence: '已有真实用户触达和信息整理经历。',
    mainGap: '缺少更完整的数据复盘和业务结果。',
    nextStepAdvice: '建议先投执行型运营实习，并补充真实数据复盘。',
    matrix: [
      {
        requirement: '社群维护与用户反馈整理',
        matchLevel: '有一定匹配' as const,
        evidence: '用户材料中有社群维护和内容整理经历。',
        gap: '缺少规模、频次和复盘结果。',
        resumeWriting: '协助维护学生社群，整理用户反馈和活动提醒。',
        interviewRisk: '可能追问社群规模、频次和本人边界。'
      }
    ]
  };
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push({ task: options.task, prompt: options.prompt });
    if (options.task === 'jd-summary') {
      return {
        data: {
          source: 'real',
          role: '用户运营实习生',
          requirements: ['社群维护', '用户反馈整理', '活动执行'],
          keywords: ['用户运营', '社群', 'Excel'],
          riskNotes: ['不要承诺录取，不要编造数据']
        },
        usage: { model: options.model, task: options.task, inputTokens: 50, outputTokens: 30, totalTokens: 80, estimatedCostUsd: 0.0001 }
      };
    }
    if (options.task === 'jd-fit') {
      jdFitAttempts += 1;
      if (jdFitAttempts === 1) {
        throw new Error('Connection error.');
      }
      return {
        data: jdFit,
        usage: { model: options.model, task: options.task, inputTokens: 80, outputTokens: 80, totalTokens: 160, estimatedCostUsd: 0.0002 }
      };
    }
    throw new Error(`unexpected small task ${options.task}`);
  });

  const server = await withServer({ callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/jd-fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'senior', profile: { targetRole: '用户运营' }, assets: [], jdText: longJd })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deliveryDecision).toBe('可以投递，建议先优化简历');
    expect(calls.map((item) => item.task)).toEqual(['jd-summary', 'jd-fit', 'jd-fit']);
    expect(calls[1].prompt).not.toContain(longJd);
    expect(calls[1].prompt).toContain('jdSummary');
    expect(body.usage).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/"usage":|"model":|"inputTokens":|"outputTokens":|"totalTokens":|"estimatedCostUsd":/i);
  } finally {
    await server.close();
  }
});

test('JD report generates interviews as smaller question tasks and falls back failed question to small model', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const valid = validInventoryReport();
  const jdFit = {
    source: 'real' as const,
    deliveryDecision: '可以投递，建议先优化简历' as const,
    deliveryReason: '岗位要求与已有社群维护、用户反馈整理经历部分匹配。',
    strongestEvidence: '已有真实用户触达和信息整理经历。',
    mainGap: '缺少更完整的数据复盘和业务结果。',
    nextStepAdvice: '建议先投执行型运营实习，并补充真实数据复盘。',
    matrix: [
      {
        requirement: '社群维护与用户反馈整理',
        matchLevel: '有一定匹配' as const,
        evidence: '用户材料中有社群维护和内容整理经历。',
        gap: '缺少规模、频次和复盘结果。',
        resumeWriting: '协助维护学生社群，整理用户反馈和活动提醒。',
        interviewRisk: '可能追问社群规模、频次和本人边界。'
      }
    ]
  };
  const interview = (index: number) => ({
    source: 'real' as const,
    interview: {
      question: `问题 ${index}：请说明你的真实分工？`,
      whyAsk: '核实经历真实性和岗位迁移能力。',
      answerAngle: '按背景、任务、动作、结果或复盘回答。',
      concern: '本人边界、规模、频次和证据。',
      sampleAnswer: '我主要协助维护社群和整理反馈，具体规模按真实记录说明。',
      doNotExaggerate: '不要编造用户量、转化率或负责人身份。'
    }
  });
  const reportUsage = (task: string) => ({ model: 'gpt-5.4', task, inputTokens: 60, outputTokens: 40, totalTokens: 100, estimatedCostUsd: 0.0005 });
  const smallUsage = (task: string) => ({ model: 'gpt-5.4-mini', task, inputTokens: 40, outputTokens: 30, totalTokens: 70, estimatedCostUsd: 0.0002 });
  const reportCalls: string[] = [];
  const smallCalls: string[] = [];

  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    reportCalls.push(`${options.task}:${options.model}`);
    if (options.task === 'report-jd-fit-summary') return { data: { source: 'real', jdFit }, usage: reportUsage(options.task) };
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: reportUsage(options.task) };
    if (options.task === 'report-interview-question') {
      if (options.prompt.includes('"interviewIndex":3')) throw new Error('Connection error.');
      return { data: interview(Number(options.prompt.match(/"interviewIndex":(\d)/)?.[1] || 1)), usage: reportUsage(options.task) };
    }
    throw new Error(`unexpected report task ${options.task}`);
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    smallCalls.push(`${options.task}:${options.model}`);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: smallUsage(options.task) };
    if (options.task === 'report-interview-question') return { data: interview(3), usage: smallUsage(options.task) };
    throw new Error(`unexpected small task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'jd', stage: 'senior', profile: { targetRole: '用户运营' }, assets: [], jdText: '用户运营 JD', jdFit })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.interviews).toHaveLength(5);
    expect(body.quality.passed).toBe(true);
    expect(reportCalls.filter((item) => item.startsWith('report-interviews:'))).toEqual([]);
    expect(reportCalls.filter((item) => item.startsWith('report-interview-question:')).length).toBe(5);
    expect(smallCalls).toEqual(expect.arrayContaining(['report-highlights:gpt-5.4-mini', 'report-interview-question:gpt-5.4-mini']));
    expect(body.usage).toBeUndefined();
    expect(body.reportTask?.usage).toBeUndefined();
    expect(body.reportTask?.moduleUsages).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/"usage":|"moduleUsages":|"model":|"inputTokens":|"outputTokens":|"totalTokens":|"estimatedCostUsd":|"byModelTier":/i);
  } finally {
    await server.close();
  }
});

test('report module backup regenerates current module from the same complete prompt', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'qwen-test';
  process.env.OPENAI_MODEL_REPORT = 'deepseek-test';

  const prompts: string[] = [];
  const valid = validInventoryReport();
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    prompts.push(`primary:${options.task}:${options.prompt}`);
    throw new AiServiceError({
      code: 'schema_validation',
      message: 'OpenAI 返回结构不符合报告格式，请重试。',
      detail: 'schema invalid',
      retryable: true,
      attempts: 1
    });
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    prompts.push(`backup:${options.task}:${options.prompt}`);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
    if (options.task === 'report-directions') {
      return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
    }
    throw new Error(`unexpected backup task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: { targetRole: '用户运营' }, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isBasic).toBe(true);
    expect(prompts[0].startsWith('primary:report-highlights:')).toBe(true);
    expect(prompts[1]).toContain('修复：上次 JSON 不符合 schema');
    expect(prompts[2]).toBe(prompts[1].replace('primary:', 'backup:'));
  } finally {
    await server.close();
  }
});

test('report task returns mixed basic report on partial module failure without losing completed modules', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const valid = validInventoryReport();
  const calls: string[] = [];
  const usage = (task: string) => ({ model: 'gpt-5.4', task, inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 });
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push(options.task);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: usage(options.task) };
    if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: usage(options.task) };
    if (options.task === 'report-rewrites' && !calls.includes('resume-started')) {
      throw new AiServiceError({
        code: 'network_error',
        message: 'OpenAI 网络连接失败，请检查网络或代理配置。',
        detail: 'Connection error. (task: report-rewrites, model: gpt-5.4, apiKey: sk-test-secret)',
        retryable: true,
        attempts: 3
      });
    }
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: usage(options.task) };
    throw new Error(`unexpected task ${options.task}`);
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push(`small:${options.task}`);
    if (options.task === 'report-rewrites' && calls.includes('resume-started')) {
      return { data: { source: 'real', rewrites: valid.rewrites }, usage: { ...usage(options.task), model: 'gpt-5.4-mini' } };
    }
    throw new AiServiceError({
      code: 'network_error',
      message: 'OpenAI 网络连接失败，请检查网络或代理配置。',
      detail: 'Connection error. (task: report-rewrites, model: gpt-5.4-mini)',
      retryable: true,
      attempts: 3
    });
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const firstResponse = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const partial = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(partial.isBasic).toBe(true);
    expect(partial.summary).toContain('当前已为你生成基础版报告');
    expect(partial.highlights).toEqual(valid.highlights);
    expect(partial.directionOptions).toEqual(valid.directionOptions);
    expect(partial.rewrites.length).toBeGreaterThanOrEqual(3);
    expect(partial.reportTask).toMatchObject({
      status: 'completed',
      completedModules: ['highlights', 'directions', 'assembledReport'],
      completedCount: 3,
      totalModules: 5,
      retryable: true
    });
    expect(JSON.stringify(partial)).toContain('基础版报告');
    expect(JSON.stringify(partial)).not.toContain('sk-test-secret');
    expect(calls).toEqual([
      'report-highlights',
      'report-directions',
      'report-rewrites',
      'small:report-rewrites'
    ]);
  } finally {
    await server.close();
  }
});

test('report task basic fallback reflects final backup failure metadata', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const valid = validInventoryReport();
  const calls: string[] = [];
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push(`report:${options.task}`);
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
    if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
    if (options.task === 'report-rewrites') {
      throw new AiServiceError({
        code: 'server_error',
        message: 'OpenAI 服务暂时异常，请稍后重试。',
        detail: 'primary report service unavailable',
        retryable: true,
        attempts: 1
      });
    }
    throw new Error(`unexpected report task ${options.task}`);
  });
  const callSmallModelJson = vi.fn(async (options: JsonCallOptions) => {
    calls.push(`small:${options.task}`);
    if (options.task === 'report-rewrites') {
      throw new AiServiceError({
        code: 'auth_error',
        message: 'OpenAI API Key 无效或无权限，请检查服务端 .env 配置。',
        detail: 'backup invalid api key',
        retryable: false,
        attempts: 1
      });
    }
    throw new Error(`unexpected small task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isBasic).toBe(true);
    expect(body.reportTask).toMatchObject({
      status: 'completed',
      completedModules: ['highlights', 'directions', 'assembledReport'],
      completedCount: 3,
      totalModules: 5,
      retryable: false
    });
    expect(body.reportTask.technicalDetail).toBe('');
    expect(JSON.stringify(body)).toContain('基础版报告');
    expect(calls).toEqual([
      'report:report-highlights',
      'report:report-directions',
      'report:report-rewrites',
      'small:report-rewrites'
    ]);
  } finally {
    await server.close();
  }
});

test('report module schema repair succeeds once and repair failure returns clear task error', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const valid = validInventoryReport();
  const prompts: string[] = [];
  const callReportModelJson = vi.fn(async (options: JsonCallOptions) => {
    prompts.push(options.prompt);
    if (options.task === 'report-highlights' && !options.prompt.includes('修复')) return { data: { source: 'real', highlights: [valid.highlights[0]] }, usage: null };
    if (options.task === 'report-highlights') return { data: { source: 'real', highlights: valid.highlights }, usage: null };
    if (options.task === 'report-directions') return { data: { source: 'real', directionOptions: valid.directionOptions }, usage: null };
    if (options.task === 'report-rewrites') return { data: { source: 'real', rewrites: valid.rewrites }, usage: null };
    throw new Error(`unexpected task ${options.task}`);
  });

  const server = await withServer({ callReportModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('real');
    expect(prompts.some((prompt) => prompt.includes('修复：上次 JSON 不符合 schema'))).toBe(true);
  } finally {
    await server.close();
  }
});

test('report module schema repair failure returns basic report without leaking API key', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-secret';
  process.env.OPENAI_MODEL_SMALL = 'gpt-5.4-mini';
  process.env.OPENAI_MODEL_REPORT = 'gpt-5.4';

  const callReportModelJson = vi.fn(async () => ({ data: { source: 'real', highlights: [] }, usage: null }));
  const callSmallModelJson = vi.fn(async () => {
    throw new AiServiceError({
      code: 'auth_error',
      message: 'OpenAI API Key 无效或无权限，请检查服务端 .env 配置。',
      detail: 'backup rejected sk-test-secret',
      retryable: false,
      attempts: 1
    });
  });

  const server = await withServer({ callReportModelJson, callSmallModelJson });
  try {
    const response = await fetch(`${server.baseUrl}/api/ai/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'inventory', stage: 'senior', profile: {}, assets: [], jdText: '' })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isBasic).toBe(true);
    expect(body.summary).toContain('当前已为你生成基础版报告');
    expect(body.reportTask).toMatchObject({
      status: 'completed',
      completedModules: ['assembledReport'],
      retryable: false
    });
    expect(JSON.stringify(body)).not.toContain('sk-test-secret');
    expect(JSON.stringify(body)).not.toContain('演示结果');
  } finally {
    await server.close();
  }
});

test('diagnosis report validator rejects missing key fields for each mode', () => {
  expect(() =>
    validateDiagnosisReport({
      mode: 'inventory',
      source: 'real',
      summary: 'summary',
      highlights: [],
      directionOptions: [],
      rewrites: [],
      actionPlan: v04ActionPlan(),
      resumeText: [],
      platformFields: [],
      previewLines: [],
      safetyNotes: []
    })
  ).toThrow(/at least 2 highlights/);

  expect(() =>
    validateDiagnosisReport({
      mode: 'jd',
      source: 'real',
      summary: 'summary',
      highlights: [{ sourceExperience: 'a', capability: 'b', jdRequirement: 'c', whyNotFlattery: 'd', professionalExpression: 'e' }],
      rewrites: [],
      actionPlan: v04ActionPlan(),
      resumeText: [],
      platformFields: [],
      previewLines: [],
      safetyNotes: []
    })
  ).toThrow(/jdFit/);
});

test('rewrite schema requires V0.4 resume suggestion fields', () => {
  const legacyRewrite = {
    original: '在教育机构帮忙发推文和群通知。',
    optimized: '协助教育机构整理公众号推文素材，并在学生社群中发布活动通知。',
    reason: '把零散动作整理成岗位能理解的内容支持和用户触达。',
    jdRequirement: '社群维护、内容编辑、用户反馈整理',
    risk: '使用前确认推文素材整理频率和社群数量。',
    interviewProbe: '可能被问到每周参与频率和具体工具。'
  };

  expect(() =>
    validateReportRewritesModule({
      source: 'real',
      rewrites: [legacyRewrite, legacyRewrite, legacyRewrite]
    })
  ).toThrow(/directVersion|relatedExperience|usageReminder/);
});

test('action plan schema requires V0.4 actionable fields and period coverage', () => {
  const legacyPlan = {
    period: '2-4 周',
    action: '整理 2 个经历复盘页。',
    deliverable: '2 页作品集或简历素材',
    resumeUsage: '用于用户运营、项目助理和新媒体运营助理投递。',
    targetAbility: '经历表达、内容整理、基础复盘'
  };

  expect(() =>
    validateReportActionPlanModule({
      source: 'real',
      summary: '行动计划',
      actionPlan: {
        source: 'real',
        plans: [legacyPlan],
        confidenceSummary: '先把真实经历证据补清楚。'
      },
      safetyNotes: ['只基于真实经历。'],
      resumeText: ['协助整理内容素材。'],
      platformFields: ['社群维护'],
      previewLines: ['可先验证用户运营。']
    })
  ).toThrow(/what|7 天内|14 天内|30 天内/);
});

test('direction schema requires V0.4 exploration fields', () => {
  const legacyDirection = {
    name: '用户运营 / 社群运营',
    level: '优先探索',
    priority: '优先探索',
    why: '基于当前经历，可以探索社群维护类岗位。',
    evidence: '教育机构实习中有学生社群维护和内容整理。',
    gap: '还需要补充复盘材料。',
    next: '搜索真实 JD。',
    keywords: ['用户运营', '社群运营', '活动运营']
  };

  expect(() =>
    validateReportDirectionsModule({
      source: 'real',
      directionOptions: [legacyDirection, { ...legacyDirection, name: '新媒体运营助理', level: '主投' }]
    })
  ).toThrow(/directionName|searchableJobNames|whyExplore|sevenDayValidation|priority|level/);
});

test('career prompts include V0.4 role, safety red lines, and mode-specific instructions', () => {
  const jdPrompt = reportPrompt({ mode: 'jd', profile: {}, jdText: '用户运营 JD' });
  const inventoryPrompt = reportPrompt({ mode: 'inventory', profile: {}, jdText: '' });
  const combined = `${careerCoachSystemPrompt}\n${jdPrompt}\n${inventoryPrompt}`;

  for (const keyword of ['资深 HR', '温和陪伴型', '普通本科', '不伪造', '不编造', '不承诺 offer', '真实经历', '待核实']) {
    expect(combined).toContain(keyword);
  }
  expect(jdPrompt).toContain('有 JD 模式');
  expect(jdPrompt).toContain('JD 证据匹配');
  expect(jdPrompt).toContain('面试追问与回答准备');
  expect(jdPrompt).toContain('占位式表达');
  expect(jdPrompt).toContain('注意边界');
  expect(jdPrompt).toContain('至少 3 条简历改写建议');
  expect(jdPrompt).toContain('7 天内、14 天内、30 天内');
  expect(jdPrompt).not.toContain('回答示例');
  expect(inventoryPrompt).toContain('无 JD 模式');
  expect(inventoryPrompt).toContain('不要输出 JD 证据矩阵');
  expect(inventoryPrompt).toContain('可探索岗位方向');
  expect(inventoryPrompt).toContain('至少 3 条简历改写建议');
});

test('compact report context summarizes inputs for split report modules without repeating full payload', () => {
  const longResume = '简历正文'.repeat(500);
  const longJd = '岗位要求'.repeat(400);
  const payload = {
    mode: 'jd',
    stage: 'senior',
    resumeText: longResume,
    jdText: longJd,
    profile: {
      education: '本科',
      schoolName: '某某学院',
      major: '市场营销',
      graduation: '2026',
      city: '杭州',
      targetRole: '用户运营',
      internship: '教育机构实习，维护社群并整理反馈。',
      project: '校园调研项目，问卷和 Excel 汇总。',
      campus: '',
      partTime: '',
      awards: '',
      skills: 'Excel，公众号排版',
      portfolio: ''
    },
    assets: [
      {
        id: 'internship',
        title: '实习经历',
        content: `${longResume} 教育机构社群维护`,
        notes: ['补充回答'.repeat(200)],
        status: '已确认',
        confirmed: true,
        source: 'real',
        isGap: false
      }
    ],
    jdFit: {
      deliveryDecision: '可以投递，建议先优化简历',
      deliveryReason: longJd,
      strongestEvidence: '有社群维护经历。',
      mainGap: '缺少数据复盘。',
      nextStepAdvice: '突出协助边界。',
      matrix: [
        {
          requirement: longJd,
          matchLevel: '有一定匹配',
          evidence: '教育机构社群维护。',
          gap: '缺少规模。',
          resumeWriting: '协助维护社群。',
          interviewRisk: '追问边界。'
        }
      ]
    }
  };

  const context = buildCompactReportContext(payload, 'report-rewrites');
  const prompt = reportModulePrompt(payload, 'report-rewrites');

  expect(JSON.stringify(context).length).toBeLessThan(JSON.stringify(payload).length / 2);
  expect(prompt).not.toContain(longResume);
  expect(prompt).not.toContain(longJd);
  expect(prompt).toContain('用户运营');
  expect(prompt).toContain('教育机构实习');
  expect(prompt).toContain('协助');
  expect(prompt.length).toBeLessThan(2600);
});

test('JD prompts explicitly constrain risky resume and interview language', () => {
  const payload = {
    mode: 'jd',
    stage: 'senior',
    profile: { targetRole: '用户运营', internship: '教育机构实习，维护社群并整理反馈。' },
    assets: [{ id: 'internship', title: '实习', content: '协助维护学生社群。', notes: [] }],
    jdSummary: { role: '用户运营', requirements: ['社群运营'], keywords: ['用户'], riskNotes: ['需要数据依据'] },
    jdFit: {
      deliveryDecision: '可以投递，建议先优化简历',
      deliveryReason: '部分匹配。',
      strongestEvidence: '有社群维护经历。',
      mainGap: '缺少数据依据。',
      nextStepAdvice: '突出协助边界。',
      matrix: [
        {
          requirement: '社群运营',
          matchLevel: '有一定匹配',
          evidence: '协助维护社群',
          gap: '缺少规模',
          resumeWriting: '协助维护社群',
          interviewRisk: '追问边界'
        }
      ]
    }
  };

  const prompts = [
    jdFitPrompt(payload),
    reportModulePrompt(payload, 'report-rewrites'),
    reportModulePrompt(payload, 'report-jd-fit-summary'),
    reportModulePrompt(payload, 'report-interview-question')
  ].join('\n');

  expect(prompts).toContain('协助、参与、支持、整理、跟进、配合、记录、复盘、尝试、约');
  expect(prompts).toContain('禁止使用');
  expect(prompts).toContain('主导');
  expect(prompts).toContain('独立完成');
  expect(prompts).toContain('显著提升');
  expect(prompts).toContain('保证');
  expect(prompts).toContain('每条简历改写必须包含 risk 和 interviewProbe');
  expect(prompts).toContain('我主要参与的是');
  expect(prompts).toContain('如果没有明确数据，不建议写成结果提升');
});

test('diagnosis report json schema is compatible with OpenAI strict response format', () => {
  const properties = diagnosisReportJsonSchema.properties;
  const required = diagnosisReportJsonSchema.required;

  expect(required).toEqual(expect.arrayContaining(Object.keys(properties)));
  expect(properties.jdFit).toMatchObject({
    anyOf: expect.arrayContaining([expect.objectContaining({ type: 'null' })])
  });
  expect(properties.interviews).toMatchObject({
    anyOf: expect.arrayContaining([expect.objectContaining({ type: 'null' })])
  });
  expect(properties.directionOptions).toMatchObject({
    anyOf: expect.arrayContaining([expect.objectContaining({ type: 'null' })])
  });
});
