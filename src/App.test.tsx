import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type {
  ActionPlanReport,
  AssetCard,
  DiagnosisReport,
  DigQuestionSet,
  JdFitReport,
  Profile,
  StructuredResume
} from './types';

const BETA_STORAGE_KEY = 'job-map-v0.3-beta-access';
const SESSION_STORAGE_KEY = 'job-map-v2-confirmed-session';
const STYLES_TEXT = readFileSync('src/styles.css', 'utf8');

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url.endsWith('/api/beta/access')) {
      return body.betaAccessCode === 'private-beta' ? jsonResponse({ ok: true }) : jsonResponse({ code: 'beta_access_required' }, 401);
    }
    if (url.endsWith('/api/ai/status')) {
      return jsonResponse({
        configured: false,
        mode: 'demo',
        message: '当前为演示模式，请在服务端 .env 中配置 OPENAI_API_KEY'
      });
    }
    if (url.endsWith('/api/ai/structure-resume')) {
      return jsonResponse(mockStructuredResume(body.resumeText || ''));
    }
    if (url.endsWith('/api/ai/dig-questions')) {
      return jsonResponse(mockDigQuestions(body.asset));
    }
    if (url.endsWith('/api/ai/jd-fit')) {
      return jsonResponse(mockJdFit());
    }
    if (url.endsWith('/api/ai/report')) {
      return jsonResponse(mockReport());
    }

    return jsonResponse({ error: 'not found' }, 404);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const baseProfile: Profile = {
  education: '本科',
  schoolName: '杭州某学院',
  major: '市场营销',
  graduation: '2026届',
  city: '',
  targetRole: '用户运营',
  internship: '教育机构新媒体运营实习2个月，维护3个学生社群，整理公众号推文',
  project: '校园二手交易调研项目，设计问卷并整理Excel',
  campus: '校园二手交易调研项目，设计问卷并整理Excel',
  partTime: '',
  awards: '',
  skills: 'Excel、公众号排版、剪映',
  portfolio: ''
};

function makeAsset(id: AssetCard['id'], content: string): AssetCard {
  return {
    id,
    title:
      id === 'education'
        ? '教育背景'
        : id === 'internship'
          ? '实习经历'
          : id === 'project'
            ? '项目经历'
            : id === 'campus'
              ? '校园经历'
              : id === 'partTime'
                ? '兼职经历'
                : id === 'awards'
                  ? '荣誉证书'
                  : '技能作品',
    content,
    status: content ? '待确认' : '暂未填写',
    confirmed: false,
    source: 'demo',
    isGap: !content && id !== 'education',
    sourceDescription: content ? '来自用户粘贴的简历文本、基础信息或经历材料。' : '当前未识别到对应经历，可稍后补充真实材料。',
    gapAdvice: !content && id !== 'education' ? `你目前没有${id === 'internship' ? '实习经历' : '相关经历'}，这不是问题本身。` : undefined,
    notes: []
  };
}

function mockStructuredResume(_resumeText: string): StructuredResume {
  return {
    source: 'demo',
    profile: baseProfile,
    fieldStatuses: {
      education: 'AI 已识别',
      schoolName: 'AI 已识别',
      major: 'AI 已识别',
      graduation: 'AI 已识别',
      city: '待用户确认',
      targetRole: 'AI 已识别',
      internship: 'AI 已识别',
      project: 'AI 已识别',
      campus: 'AI 已识别',
      partTime: '待用户确认',
      awards: '待用户确认',
      skills: 'AI 已识别',
      portfolio: '待用户确认'
    },
    assets: [
      makeAsset('education', '本科 / 杭州某学院 / 市场营销 / 2026届'),
      makeAsset('internship', baseProfile.internship),
      makeAsset('project', baseProfile.project),
      makeAsset('campus', baseProfile.campus),
      makeAsset('partTime', ''),
      makeAsset('awards', ''),
      makeAsset('skills', baseProfile.skills)
    ]
  };
}

function mockDigQuestions(asset?: AssetCard): DigQuestionSet {
  return {
    assetId: asset?.id || 'internship',
    source: 'demo',
    userVisibleQuestions: [
      `结合你想探索的用户运营，你这段${asset?.title || '实习经历'}里提到“${asset?.content || '教育机构新媒体运营实习'}”，你自己实际完成的动作是哪 1-2 个？`,
      '这段经历有没有可核实的规模、频次或周期，例如人数、社群数量、每周次数、持续多久？',
      '如果面试时被问到困难，你能想到一个真实问题和你的处理方式吗？'
    ],
    internalMetadata: [
      {
        questionId: 'q_1',
        relatedAssetId: asset?.id || 'internship',
        relatedJdRequirementId: 'req_1',
        method: 'hr',
        factDimensions: ['action'],
        internalWhy: '确认本人分工'
      },
      {
        questionId: 'q_2',
        relatedAssetId: asset?.id || 'internship',
        relatedJdRequirementId: 'req_1',
        method: 'tar',
        factDimensions: ['task', 'scale', 'tool', 'result'],
        internalWhy: '补齐事实证据'
      },
      {
        questionId: 'q_3',
        relatedAssetId: asset?.id || 'internship',
        relatedJdRequirementId: 'req_1',
        method: 'part',
        factDimensions: ['reflection', 'risk'],
        internalWhy: '准备面试解释边界'
      }
    ],
    encouragement: '这一步只是在帮你回忆真实细节，不需要写得很完整。'
  };
}

function mockJdFit(): JdFitReport {
  return {
    source: 'demo',
    deliveryDecision: '可以投递，建议先优化简历',
    deliveryReason: '已有经历能对上部分岗位要求，但结果数据和岗位深度仍需要补强。',
    strongestEvidence: '已有社群/内容相关实践，可以转译成基础运营证据。',
    mainGap: '缺少可核验的结果指标。',
    nextStepAdvice: '建议先投要求偏执行、助理、实习的岗位，并补齐真实数据。',
    matrix: [
      {
        requirement: '用户运营、社群维护、用户反馈整理',
        matchLevel: '有一定匹配',
        evidence: '教育机构新媒体运营实习中维护学生社群、配合活动提醒。',
        gap: '结果数据和用户规模需要确认。',
        resumeWriting: '可写为“协助维护学生社群，整理活动提醒和内容素材”。',
        interviewRisk: '可能被追问社群规模、周期和本人分工。'
      }
    ]
  };
}

function mockActionPlan(): ActionPlanReport {
  return {
    source: 'demo',
    plans: [
      {
        period: '7 天',
        action: '完成一份目标岗位相关的数据复盘小项目。',
        deliverable: '一张 Excel 表和 500 字复盘。',
        resumeUsage: '可写成“围绕用户运营完成内容表现复盘”。',
        targetAbility: '补强数据整理和复盘表达能力。'
      }
    ],
    confidenceSummary: '事实型总结：你目前不是完全没有竞争力，而是已有实习和课程/校园经历还没有被转译成岗位语言。当前最能使用的筹码是执行、信息整理和内容/社群相关任务；最需要补的短板是可核验的数据结果和复盘表达。下一步最值得做的是先补一个可展示的小项目。'
  };
}

function mockReport(): DiagnosisReport {
  const jdFit = mockJdFit();
  return {
    source: 'demo',
    jdFit,
    actionPlan: mockActionPlan(),
    highlights: [
      {
        sourceExperience: '教育机构新媒体运营实习',
        capability: '社群触达和内容整理能力',
        jdRequirement: '用户运营、社群维护',
        whyNotFlattery: '来自维护3个学生社群和整理推文素材。',
        professionalExpression: '协助完成社群维护和用户触达支持。'
      },
      {
        sourceExperience: '校园二手交易调研项目',
        capability: '调研和数据整理能力',
        jdRequirement: 'Excel 数据整理与复盘',
        whyNotFlattery: '来自问卷设计和 Excel 整理。',
        professionalExpression: '参与调研问题设计与数据归类。'
      }
    ],
    rewrites: [
      {
        original: baseProfile.internship,
        optimized: '协助完成教育机构新媒体运营支持工作，维护学生社群并整理公众号推文素材。',
        reason: '把任务拆成岗位语言。',
        jdRequirement: '社群维护、内容编辑',
        risk: '人数和效果需要真实可解释。',
        interviewProbe: '可能被追问社群规模和分工。'
      },
      {
        original: baseProfile.project,
        optimized: '参与校园二手交易调研项目，完成问卷设计、Excel 结果整理和课堂展示。',
        reason: '强调调研和数据整理产出。',
        jdRequirement: '数据整理、复盘表达',
        risk: '不能包装成企业项目。',
        interviewProbe: '可能被问样本量和结论。'
      }
    ],
    interviews: Array.from({ length: 5 }, (_, index) => ({
      question: `面试追问 ${index + 1}`,
      whyAsk: '核实经历真实性。',
      answerAngle: '按任务、动作、结果回答。',
      concern: '真实分工和可解释性。',
      sampleAnswer: '结合社群维护和调研项目回答。',
      doNotExaggerate: '不要编造数据。'
    })),
    resumeText: ['求职意向：用户运营', '经历改写：协助完成教育机构新媒体运营支持工作。'],
    platformFields: ['个人优势：协助完成社群维护和用户触达支持。'],
    previewLines: ['用户运营', '本科 / 杭州某学院 / 市场营销', '协助完成教育机构新媒体运营支持工作。'],
    usage: {
      model: 'gpt-5.4',
      task: 'report',
      inputTokens: 2000,
      outputTokens: 1000,
      totalTokens: 3000,
      estimatedCostUsd: 0.02
    },
    quality: {
      passed: true,
      score: 92,
      blockers: [],
      warnings: ['补强计划存在偏空泛或不可验证的表达。']
    }
  };
}

async function startV2(modeLabel = '做岗位定制诊断') {
  const user = userEvent.setup();
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  render(<App />);

  const routeLabel =
    modeLabel === '先盘点经历'
      ? '我大概知道方向，但简历不知道怎么写。'
      : '我看到一个岗位，想知道能不能投、怎么改。';
  await user.click(screen.getByRole('button', { name: routeLabel }));
  await user.click(screen.getByRole('button', { name: /开始 21 天陪跑/ }));

  return user;
}

async function generateAssetCards(user: ReturnType<typeof userEvent.setup>) {
  const jdInput = screen.queryByLabelText('粘贴目标岗位要求');
  if (jdInput) {
    await user.type(jdInput, '用户运营实习，负责社群维护和用户反馈整理。');
  }
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));
}

async function confirmDiggableCards(user: ReturnType<typeof userEvent.setup>) {
  for (const id of ['internship', 'project', 'campus', 'partTime', 'awards', 'skills', 'portfolio'] as const) {
    const card = screen.queryByTestId(`asset-card-${id}`);
    const confirmButton = card ? within(card).queryByRole('button', { name: '确认可用' }) : null;
    if (confirmButton) {
      await user.click(confirmButton);
    }
  }
}

test('未通过内测访问码时停留在访问页且不调用 AI 状态接口', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: 'Web 私密内测访问' })).toBeInTheDocument();
  expect(screen.getByText(/请先删除姓名、手机号、邮箱、身份证号、家庭住址等敏感信息/)).toBeInTheDocument();
  expect(screen.getByLabelText('内测访问码')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: '普通本科生 AI 求职诊断' })).not.toBeInTheDocument();
});

test('输入正确内测访问码后保存访问状态，并且 AI 请求携带访问码', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText('内测访问码'), 'private-beta');
  await user.click(screen.getByRole('button', { name: '进入内测' }));

  expect(await screen.findByRole('heading', { name: '21 天应届生求职陪跑' })).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem(BETA_STORAGE_KEY) || '{}')).toEqual({
    authorized: true,
    betaAccessCode: 'private-beta'
  });

  await user.click(screen.getByRole('button', { name: '我看到一个岗位，想知道能不能投、怎么改。' }));
  await user.click(screen.getByRole('button', { name: /开始 21 天陪跑/ }));
  await user.type(screen.getByLabelText('粘贴简历文本'), '本科 市场营销 2026届，目标用户运营。');
  await user.click(screen.getByRole('button', { name: /AI 帮我整理基础信息/ }));

  const structureCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).endsWith('/api/ai/structure-resume'));
  expect(structureCall).toBeTruthy();
  expect(JSON.parse(String(structureCall?.[1]?.body))).toMatchObject({ betaAccessCode: 'private-beta' });
});

test('V0.7 首页未选择路线时不能进入下一步，选择后进入输入页', async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  render(<App />);

  expect(screen.getByRole('heading', { name: '21 天应届生求职陪跑' })).toBeInTheDocument();
  expect(screen.getByText('求职地图 V0.7')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '先把你的材料放进来' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '大三/准应届生' })).not.toBeInTheDocument();
  expect(screen.queryByText('选择当前阶段')).not.toBeInTheDocument();
  expect(screen.queryByText('选择诊断方式')).not.toBeInTheDocument();

  expect(screen.getByRole('button', { name: '我不知道该投什么岗位。' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '我大概知道方向，但简历不知道怎么写。' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '我投了很多，但没有面试。' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '我看到一个岗位，想知道能不能投、怎么改。' })).toBeInTheDocument();
  expect(screen.getByText(/不承诺 offer、面试或薪资结果/)).toBeInTheDocument();

  const startButton = screen.getByRole('button', { name: '开始 21 天陪跑' });
  expect(startButton).toBeDisabled();

  await user.click(screen.getByRole('button', { name: '我看到一个岗位，想知道能不能投、怎么改。' }));
  expect(startButton).toBeEnabled();
  await user.click(startButton);

  expect(screen.getByRole('heading', { name: '先把你的材料放进来' })).toBeInTheDocument();
  expect(screen.getByLabelText('粘贴目标岗位要求')).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || '{}')).toMatchObject({
    version: 'v0.7',
    route: 'target_job_fit',
    step: 'intake',
    plan: {
      route: 'target_job_fit',
      totalDays: 21
    },
    legacy: {
      stage: 'senior',
      mode: 'jd',
      step: 'input'
    }
  });
});

test('V0.7 首页选择简历准备路线后复用旧无 JD 经历盘点能力', async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  render(<App />);

  await user.click(screen.getByRole('button', { name: '我大概知道方向，但简历不知道怎么写。' }));
  await user.click(screen.getByRole('button', { name: /开始 21 天陪跑/ }));

  expect(screen.getByRole('heading', { name: '先把你的材料放进来' })).toBeInTheDocument();
  expect(screen.queryByLabelText('粘贴目标岗位要求')).not.toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || '{}')).toMatchObject({
    version: 'v0.7',
    route: 'has_direction_resume_not_ready',
    legacy: {
      stage: 'senior',
      mode: 'inventory',
      step: 'input'
    }
  });
});

test('简历准备路线结果页提供今日行动记录，并保存恢复 records', async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      version: 'v0.7',
      route: 'has_direction_resume_not_ready',
      step: 'result',
      plan: {
        route: 'has_direction_resume_not_ready',
        currentDay: 1,
        totalDays: 21,
        tasks: [
          {
            day: 1,
            title: '第 1 天：选 1 段真实经历，补齐背景 / 动作 / 工具 / 结果',
            route: 'has_direction_resume_not_ready',
            actionLoopStage: 'diagnosis',
            taskType: 'rewrite_resume',
            status: 'today',
            difficulty: 'stretch',
            estimatedMinutes: 30,
            expectedOutput: '一段包含背景、动作、工具或方法、结果的真实经历草稿。',
            evidenceRequired: '用户自己的实习、项目、校园、兼职或作品经历原文。'
          },
          {
            day: 2,
            title: '第 2 天：找 1 个目标岗位样本，摘出 3 条常见要求',
            route: 'has_direction_resume_not_ready',
            actionLoopStage: 'action',
            taskType: 'compare_jd',
            status: 'todo',
            difficulty: 'stretch',
            estimatedMinutes: 25,
            expectedOutput: '1 个真实岗位名称，以及 3 条岗位语言或常见要求。只找 1 个岗位样本即可，不用找很多。',
            evidenceRequired: '用户手动粘贴或概括的真实岗位标题、岗位要求或 JD 摘要。'
          },
          {
            day: 3,
            title: '第 3 天：把 Day 1 经历改成 1 条可投递简历表达',
            route: 'has_direction_resume_not_ready',
            actionLoopStage: 'record',
            taskType: 'rewrite_resume',
            status: 'todo',
            difficulty: 'stretch',
            estimatedMinutes: 30,
            expectedOutput: '一条可复制到简历里的表达，以及一句不能夸大的边界提醒。',
            evidenceRequired: 'Day 1 经历草稿、Day 2 岗位要求、用户确认的真实事实。'
          }
        ]
      },
      records: [],
      legacy: {
        step: 'result',
        stage: 'senior',
        mode: 'inventory',
        profile: baseProfile,
        fieldStatuses: {},
        assets: [],
        truthConfirmed: true,
        resumeText: '本科 市场营销，目标用户运营。',
        jdText: '',
        jdFit: null,
        report: { ...mockReport(), mode: 'inventory', jdFit: undefined, interviews: undefined, usage: null },
        reportTask: null
      }
    })
  );

  const { unmount } = render(<App />);

  expect(screen.getByRole('heading', { name: 'V0.7 简历准备路线' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '今日行动' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Day 1-3 任务' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '今日记录入口' })).toBeInTheDocument();
  expect(screen.getByText('先不用看完整报告，今天只要完成下面这条记录。')).toBeInTheDocument();
  expect(screen.getAllByText('第 1 天：选 1 段真实经历，补齐背景 / 动作 / 工具 / 结果').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('第 2 天：找 1 个目标岗位样本，摘出 3 条常见要求')).toBeInTheDocument();
  expect(screen.getByText(/只找 1 个岗位样本即可，不用找很多/)).toBeInTheDocument();
  expect(screen.getByText('第 3 天：把 Day 1 经历改成 1 条可投递简历表达')).toBeInTheDocument();
  expect(screen.getByText(/旧报告内容会作为诊断依据和材料库保留/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '报告摘要' })).toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: '完成一部分' }));
  await user.type(screen.getByLabelText('今天写出来的内容'), '教育机构新媒体运营实习，维护3个学生社群，整理公众号推文素材。');
  await user.type(screen.getByLabelText('这段内容来自哪段真实经历'), '来自用户确认的实习经历。');
  await user.type(screen.getByLabelText('哪里还没写清楚'), '结果还需要补具体频率。');
  await user.type(screen.getByLabelText('明天先补什么'), '明天对照用户运营岗位语言补表达。');
  await user.click(screen.getByRole('button', { name: '保存今日记录' }));

  expect(screen.getByText('已保存今日记录。')).toBeInTheDocument();
  const saved = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || '{}');
  expect(saved.records).toHaveLength(1);
  expect(saved.records[0]).toMatchObject({
    route: 'has_direction_resume_not_ready',
    day: 1,
    completionStatus: 'partly',
    outputText: '教育机构新媒体运营实习，维护3个学生社群，整理公众号推文素材。',
    evidenceText: '来自用户确认的实习经历。',
    reflectionText: '结果还需要补具体频率。',
    nextAdjustment: '明天对照用户运营岗位语言补表达。'
  });

  unmount();
  render(<App />);
  expect(screen.getByRole('heading', { name: '已记录的今日行动' })).toBeInTheDocument();
  expect(screen.getByText(/教育机构新媒体运营实习，维护3个学生社群/)).toBeInTheDocument();
  expect(screen.getAllByText(/完成一部分/).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/token|tokens|成本|模型：|gpt-5\.4|provider|API key|base URL|schema|parse|OpenAI|DeepSeek|Qwen|Kimi/i);

  await user.click(screen.getAllByRole('button', { name: '清除本次分析数据' })[0]);
  await waitFor(() => expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull());
});

test('旧 JD session 会安全迁移到 V0.7 目标岗位判断路线', () => {
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      step: 'input',
      stage: 'senior',
      mode: 'jd',
      profile: baseProfile,
      fieldStatuses: {},
      assets: [],
      truthConfirmed: true,
      resumeText: '本科 市场营销',
      jdText: '用户运营助理，负责社群维护。',
      jdFit: null,
      report: null,
      reportTask: null
    })
  );

  render(<App />);

  expect(screen.getByRole('heading', { name: '先把你的材料放进来' })).toBeInTheDocument();
  expect(screen.getByLabelText('粘贴目标岗位要求')).toHaveValue('用户运营助理，负责社群维护。');
  expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || '{}')).toMatchObject({
    version: 'v0.7',
    route: 'target_job_fit',
    step: 'intake',
    legacy: {
      mode: 'jd',
      step: 'input'
    }
  });
});

test('损坏的本地 session 不会白屏，会回到 V0.7 路线选择', () => {
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  window.localStorage.setItem(SESSION_STORAGE_KEY, '{bad json');

  render(<App />);

  expect(screen.getByRole('heading', { name: '21 天应届生求职陪跑' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '我不知道该投什么岗位。' })).toBeInTheDocument();
});

test('粘贴简历文本后可以结构化为基础信息和经历卡，并允许用户修改识别结果', async () => {
  const user = await startV2();

  expect(screen.getByRole('heading', { name: '先把你的材料放进来' })).toBeInTheDocument();
  expect(screen.getByText(/请先删除身份证号、家庭住址、银行卡号等无关敏感信息/)).toBeInTheDocument();
  expect(screen.getByText(/真实 AI 暂未连接/)).toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/API Key|OPENAI_API_KEY|模型名|provider|base URL/i);
  expect(screen.getByLabelText('粘贴简历文本')).toBeInTheDocument();
  expect(screen.queryByLabelText('学校层级')).not.toBeInTheDocument();
  expect(screen.getByLabelText('学校名称')).toBeInTheDocument();

  await user.type(
    screen.getByLabelText('粘贴简历文本'),
    '张同学 本科 杭州某学院 市场营销 2026届。目标用户运营。教育机构新媒体运营实习2个月，维护3个学生社群，整理公众号推文。校园二手交易调研项目，设计问卷并整理Excel。技能：Excel、公众号排版、剪映。'
  );
  await user.click(screen.getByRole('button', { name: /AI 帮我整理基础信息/ }));

  expect(screen.getByText('演示结果')).toBeInTheDocument();
  expect(screen.getByText('已整理出基础信息和经历材料，请检查并修改不准确的地方。')).toBeInTheDocument();
  expect(screen.getByLabelText('学校名称')).toHaveValue('杭州某学院');
  expect(screen.getAllByText('AI 已识别').length).toBeGreaterThan(2);

  const schoolInput = screen.getByLabelText('学校名称');
  await user.clear(schoolInput);
  await user.type(schoolInput, '杭州应用技术学院');

  expect(screen.getByText('学校背景参考：普通本科。该信息只用于判断岗位竞争环境，不代表个人能力评价。')).toBeInTheDocument();

  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);

  expect(screen.getByRole('heading', { name: '你的经历资产卡' })).toBeInTheDocument();
  expect(screen.getAllByText('待确认').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/来源说明：来自用户粘贴的简历文本、基础信息或经历材料。/).length).toBeGreaterThan(0);
});

test('基础信息页标注城市和目标方向为可选，并显示真实 AI 等待提示', async () => {
  let resolveStructure: (response: Response) => void = () => undefined;
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/api/ai/status')) {
      return jsonResponse({ configured: true, mode: 'real', smallModel: 'gpt-5.4-mini', reportModel: 'gpt-5.4' });
    }
    if (url.endsWith('/api/ai/structure-resume')) {
      return new Promise<Response>((resolve) => {
        resolveStructure = resolve;
      });
    }
    return jsonResponse(mockStructuredResume(body.resumeText || ''));
  });

  const user = await startV2('先盘点经历');

  expect(screen.getByLabelText('城市意向（可选）')).toHaveAttribute('placeholder', '不确定可以先空着');
  expect(screen.getByLabelText('目标岗位或行业（可选）')).toHaveAttribute('placeholder', '无岗位要求路线可以先不填，系统会根据经历给方向建议');
  expect(screen.getByText(/预计需要 10-30 秒。AI 会帮你整理简历信息/)).toBeInTheDocument();
  expect(screen.getByText('已连接真实 AI。')).toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/gpt-5\.4|gpt-5\.4-mini|小任务模型|报告模型/);

  await user.type(screen.getByLabelText('粘贴简历文本'), '本科 市场营销 教育机构运营实习');
  await user.click(screen.getByRole('button', { name: /AI 帮我整理基础信息/ }));

  expect(screen.getByRole('status')).toHaveTextContent(/AI 正在整理基础信息/);
  expect(screen.getByRole('status')).toHaveTextContent(/可能需要等待较长时间/);

  resolveStructure(jsonResponse(mockStructuredResume('本科 市场营销')));
});

test('可以附上文本简历文件并把内容带入简历输入框', async () => {
  const user = await startV2();
  const file = new File(['王同学 本科 市场营销 目标用户运营 实习维护社群'], 'resume.txt', { type: 'text/plain' });

  const upload = screen.getByLabelText('上传简历文件');
  expect(upload).not.toBeDisabled();

  await user.upload(upload, file);

  expect(await screen.findByText(/文本文件读取成功：resume.txt/)).toBeInTheDocument();
  expect(screen.getByLabelText('粘贴简历文本')).toHaveValue('王同学 本科 市场营销 目标用户运营 实习维护社群');
});

test('真实性确认未勾选时不能进入经历资产卡，资产页显示摘要和温和空白提示', async () => {
  const user = await startV2('先盘点经历');

  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('项目经历'), '课程项目：校园二手交易调研，设计问卷、整理Excel并做课堂展示。');

  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));
  expect(screen.getByText(/请先确认真实性条款/)).toBeInTheDocument();

  await user.click(screen.getByLabelText(/我确认以上学历、学校、证书、实习、项目、时间和成果均基于真实经历/));
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));

  expect(screen.getByRole('heading', { name: '你的经历资产卡' })).toBeInTheDocument();
  expect(screen.getByText(/当前可重点挖掘/)).toBeInTheDocument();
  expect(screen.getAllByText(/暂未填写/).length).toBeGreaterThan(0);
  expect(screen.getByText(/不用担心空白项，后续报告会优先使用你真实填写的经历/)).toBeInTheDocument();
  expect(screen.getByTestId('asset-card-project')).toBeInTheDocument();
  expect(screen.getByTestId('asset-card-internship')).toHaveTextContent(/暂未填写/);
  expect(screen.getByTestId('asset-card-internship')).toHaveTextContent(/目前没有识别到这段经历。没关系，后续不会强行追问这一项。/);
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/缺失|薄弱|劣势|不合格|太弱|无价值/);
});

test('有岗位要求路线必须先补充岗位要求才能生成经历资产卡', async () => {
  const user = await startV2();

  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));

  expect(screen.getByRole('alert')).toHaveTextContent('请先补充目标岗位要求');
  expect(screen.queryByRole('heading', { name: '你的经历资产卡' })).not.toBeInTheDocument();

  await user.type(screen.getByLabelText('粘贴目标岗位要求'), '用户运营实习，负责社群维护和用户反馈整理。');
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));

  expect(screen.getByRole('heading', { name: '你的经历资产卡' })).toBeInTheDocument();
});

test('进入动态追问前必须处理所有非空经历卡', async () => {
  const user = await startV2('先盘点经历');

  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月。');
  await user.type(screen.getByLabelText('项目经历'), '校园二手交易调研项目，设计问卷并用Excel整理结果。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));

  await user.click(within(screen.getByTestId('asset-card-internship')).getByRole('button', { name: '确认可用' }));
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));

  expect(screen.getByRole('alert')).toHaveTextContent('请先处理「项目经历」经历卡');
  expect(screen.queryByRole('heading', { name: '动态经历挖掘' })).not.toBeInTheDocument();

  await user.click(within(screen.getByTestId('asset-card-project')).getByRole('button', { name: '暂不使用' }));
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));

  expect(screen.getByRole('heading', { name: '动态经历挖掘' })).toBeInTheDocument();
});

test('非空经历可以确认可用、修改保存，并标记为暂不使用但不消失', async () => {
  const user = await startV2('先盘点经历');

  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('项目经历'), '课程项目：校园二手交易调研，设计问卷、整理Excel并做课堂展示。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));

  const projectCard = screen.getByTestId('asset-card-project');
  await user.click(within(projectCard).getByRole('button', { name: '确认可用' }));
  expect(within(projectCard).getByText('确认使用')).toBeInTheDocument();

  await user.click(within(projectCard).getByRole('button', { name: '修改' }));
  const editor = within(projectCard).getByLabelText('项目经历内容');
  await user.clear(editor);
  await user.type(editor, '课程项目：校园二手交易调研，负责问卷设计、Excel整理和课堂展示。');
  await user.click(within(projectCard).getByRole('button', { name: '保存修改' }));
  expect(within(projectCard).getByText('待确认')).toBeInTheDocument();
  expect(projectCard).toHaveTextContent(/负责问卷设计/);
  expect(projectCard).toHaveTextContent(/来源说明：用户在经历卡中编辑或补充的内容/);

  await user.click(within(projectCard).getByRole('button', { name: '暂不使用' }));
  expect(screen.getByTestId('asset-card-project')).toBeInTheDocument();
  expect(within(projectCard).getAllByText('暂不使用').length).toBeGreaterThan(0);
});

test('空白经历可以稍后补充，保存后变为可用经历卡', async () => {
  const user = await startV2('先盘点经历');

  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));

  const internshipCard = screen.getByTestId('asset-card-internship');
  expect(internshipCard).toHaveTextContent(/暂未填写/);
  expect(within(internshipCard).getByRole('button', { name: '查看补强建议' })).toBeInTheDocument();

  await user.click(within(internshipCard).getByRole('button', { name: '稍后补充' }));
  await user.type(within(internshipCard).getByLabelText('实习经历内容'), '教育机构运营实习，维护学生社群并整理活动提醒。');
  await user.click(within(internshipCard).getByRole('button', { name: '保存修改' }));

  expect(internshipCard).toHaveTextContent(/待确认/);
  expect(internshipCard).toHaveTextContent(/教育机构运营实习/);
  expect(within(internshipCard).getByRole('button', { name: '确认可用' })).toBeInTheDocument();
});

test('空白和暂不使用经历不进入动态追问，没有可追问经历时显示温和提示', async () => {
  const user = await startV2('先盘点经历');

  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText('项目经历'), '课程项目：校园二手交易调研，设计问卷、整理Excel并做课堂展示。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await user.click(screen.getByRole('button', { name: /生成我的经历资产卡/ }));

  await user.click(within(screen.getByTestId('asset-card-project')).getByRole('button', { name: '暂不使用' }));

  expect(screen.getByRole('button', { name: /进入 AI 动态追问/ })).toBeDisabled();
  expect(screen.getByText(/请至少补充一段真实经历。课程项目、校园活动、兼职、技能作品都可以作为求职材料。/)).toBeInTheDocument();
});

test('动态追问结合具体经历和目标岗位，支持上一段、下一段、保存并继续、跳过和返回修改', async () => {
  const user = await startV2();

  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月，维护3个学生社群，整理公众号推文。');
  await user.type(screen.getByLabelText('项目经历'), '校园二手交易调研项目，设计问卷并用Excel整理结果。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));

  expect(screen.getByRole('heading', { name: '动态经历挖掘' })).toBeInTheDocument();
  expect(screen.getByText(/这一步不是考你，而是帮你把原本说不清的经历拆开。/)).toBeInTheDocument();
  expect(screen.getByText(/正在完善：实习经历 · 第 1\/2 段/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '当前经历' })).toBeInTheDocument();
  expect(screen.getByText(/下面的问题只围绕这段经历，不会要求你编造结果。/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '这轮想帮你确认什么' })).not.toBeInTheDocument();
  expect(screen.queryByText(/用户沟通、内容整理、活动触达或数据整理证据/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '可能挖出的亮点' })).not.toBeInTheDocument();
  expect(screen.queryByText(/基础用户触达与内容执行支持/)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'AI 想进一步确认' })).toBeInTheDocument();
  expect(screen.getAllByText(/教育机构新媒体运营实习/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/用户运营/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/3个学生社群|公众号推文/).length).toBeGreaterThan(0);
  expect(screen.queryByText('你具体负责什么？')).not.toBeInTheDocument();
  expect(screen.queryByText(/TAR|PART|PREP|HR 视角|为什么问|事实回忆维度/i)).not.toBeInTheDocument();

  expect(screen.getByLabelText('补充回答')).toBeInTheDocument();
  expect(screen.queryByText(/对象 \+ 动作 \+ 频次 \+ 结果\/反馈/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '如果补充得出来，可能可以这样写' })).not.toBeInTheDocument();
  expect(screen.queryByText(/待核实：协助维护学生社群/)).not.toBeInTheDocument();
  expect(screen.getByText(/没有数据也没关系/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('补充回答'), '每周整理2篇推文素材，维护3个社群，活动提醒后到课反馈更稳定。');
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByText(/执行推进和信息整理能力/)).toBeInTheDocument();
  expect(screen.getByText(/正在完善：项目经历 · 第 2\/2 段/)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '上一段经历' }));
  await user.click(screen.getByRole('button', { name: '下一段经历' }));
  await user.click(screen.getByRole('button', { name: '跳过本段' }));
  await user.click(screen.getByRole('button', { name: '返回修改经历卡' }));
  expect(screen.getByRole('heading', { name: '你的经历资产卡' })).toBeInTheDocument();
});

test('有岗位要求路线追问后直接生成报告，等待时显示较长等待提示，失败后提示可重试', async () => {
  let resolveDig: (response: Response) => void = () => undefined;
  let resolveJd: (response: Response) => void = () => undefined;
  let resolveReport: (response: Response) => void = () => undefined;
  let reportRequested = false;

  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/api/ai/status')) {
      return jsonResponse({ configured: true, mode: 'real', smallModel: 'gpt-5.4-mini', reportModel: 'gpt-5.4' });
    }
    if (url.endsWith('/api/ai/dig-questions')) {
      return new Promise<Response>((resolve) => {
        resolveDig = () => resolve(jsonResponse(mockDigQuestions(body.asset)));
      });
    }
    if (url.endsWith('/api/ai/jd-fit')) {
      return new Promise<Response>((resolve) => {
        resolveJd = () => resolve(jsonResponse(mockJdFit()));
      });
    }
    if (url.endsWith('/api/ai/report')) {
      reportRequested = true;
      return new Promise<Response>((resolve) => {
        resolveReport = () => resolve(jsonResponse({ error: 'Connection error. (task: report, model: gpt-5.4)' }, 502));
      });
    }
    return jsonResponse(mockStructuredResume(body.resumeText || ''));
  });

  const user = await startV2();

  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月，维护3个学生社群，整理公众号推文。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  expect(screen.getByText(/预计需要 10-20 秒。AI 会基于当前经历生成追问/)).toBeInTheDocument();
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));

  expect(screen.getByRole('status')).toHaveTextContent(/AI 正在生成动态追问/);
  expect(screen.getByRole('status')).toHaveTextContent(/可能需要等待较长时间/);
  resolveDig(jsonResponse(mockDigQuestions(makeAsset('internship', baseProfile.internship))));
  expect(await screen.findByRole('heading', { name: 'AI 想进一步确认' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('补充回答'), '维护3个学生社群，每周整理2篇推文素材。');
  await waitFor(() => expect(screen.getByRole('button', { name: '生成完整报告' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '生成完整报告' }));
  expect(screen.getByRole('status')).toHaveTextContent(/AI 正在分段生成诊断报告/);
  expect(screen.getByRole('status')).toHaveTextContent(/可能需要等待较长时间/);
  expect(screen.queryByRole('heading', { name: '岗位要求证据匹配' })).not.toBeInTheDocument();
  resolveJd(jsonResponse(mockJdFit()));
  await waitFor(() => expect(reportRequested).toBe(true));
  resolveReport(jsonResponse({ error: 'Connection error. (task: report, model: gpt-5.4)' }, 502));

  expect(await screen.findByText(/当前 AI 生成失败，可以直接重试一次/)).toBeInTheDocument();
  expect(screen.getByText(/如果多次失败，请稍后再试或联系测试负责人/)).toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/Connection error|task: report|model:|gpt-5\.4|provider|token|成本|base URL|schema|parse|OpenAI/i);
});

test('有岗位要求路线最后一段追问保存后直接生成完整报告', async () => {
  const user = await startV2();

  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月，维护3个学生社群，整理公众号推文。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));
  await user.type(screen.getByLabelText('补充回答'), '维护3个学生社群，每周整理2篇推文素材。');

  expect(screen.getByRole('button', { name: '生成完整报告' })).toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/保证 offer|逆袭名企|offer 收割机/);
  await waitFor(() => expect(screen.getByRole('button', { name: '生成完整报告' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '生成完整报告' }));

  expect(await screen.findByRole('heading', { name: '岗位要求匹配分析' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '岗位要求证据匹配' })).not.toBeInTheDocument();
});

test('无岗位要求路线最后一段追问后进入经历方向诊断，并可继续生成报告', async () => {
  const user = await startV2('先盘点经历');

  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月，维护3个学生社群，整理公众号推文。');
  await user.type(screen.getByLabelText('技能/作品'), 'Excel、公众号排版、剪映');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));
  await user.type(screen.getByLabelText('补充回答'), '维护3个学生社群，每周整理2篇推文素材。');

  await waitFor(() => expect(screen.getByRole('button', { name: '保存并继续' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByText(/正在完善：技能作品 · 第 2\/2 段/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('补充回答'), '用 Excel 整理反馈，用公众号后台做过排版。');
  await waitFor(() => expect(screen.getByRole('button', { name: '生成经历方向诊断' })).toBeEnabled());
  expect(screen.getByRole('button', { name: '生成经历方向诊断' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '生成经历方向诊断' }));

  expect(screen.getByRole('heading', { name: '经历方向诊断' })).toBeInTheDocument();
  expect(screen.getByText('05 方向诊断')).toBeInTheDocument();
  expect(screen.getByText(/不是替你决定人生方向/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '当前经历筹码' })).toBeInTheDocument();
  expect(screen.getAllByText(/教育机构新媒体运营实习|社群维护|内容整理|用户触达/).length).toBeGreaterThan(0);

  const directionCards = screen.getAllByTestId('direction-card');
  expect(directionCards.length).toBeGreaterThanOrEqual(2);
  expect(directionCards.length).toBeLessThanOrEqual(3);
  expect(screen.getAllByText(/用户运营 \/ 社群运营|新媒体运营助理/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/优先探索|可以尝试|过渡方向|先补证据/).length).toBeGreaterThan(0);
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/主投|可冲|暂不建议主投/);

  for (const card of directionCards) {
    expect(within(card).getByText(/为什么可以探索/)).toBeInTheDocument();
    expect(within(card).getByText(/当前证据/)).toBeInTheDocument();
    expect(within(card).getByText(/主要缺口/)).toBeInTheDocument();
    expect(within(card).getByText(/下一步补强/)).toBeInTheDocument();
    expect(within(card).getByText(/岗位关键词/)).toBeInTheDocument();
  }

  expect(screen.getByRole('heading', { name: '方向对比' })).toBeInTheDocument();
  for (const header of ['方向', '当前证据', '主要缺口', '建议优先级']) {
    expect(screen.getAllByText(header).length).toBeGreaterThan(0);
  }
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/你只适合|没机会|学历太差|经历太弱|保证 offer|逆袭名企/);

  await user.click(screen.getByRole('button', { name: '返回动态追问' }));
  expect(screen.getByRole('heading', { name: '动态经历挖掘' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '生成经历方向诊断' }));
  expect(screen.getByText(/预计需要 1-3 分钟。AI 会分段生成诊断报告/)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '生成经历诊断报告' }));

  expect(await screen.findByRole('heading', { name: '经历诊断报告' })).toBeInTheDocument();
  expect(screen.getByText(/不是替你决定人生方向/)).toBeInTheDocument();
  for (const heading of [
    '报告摘要',
    '当前经历筹码总结',
    '真实经历亮点',
    '可探索岗位方向',
    '简历改写建议',
    '下一步行动计划',
    '信心修复总结'
  ]) {
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  }
  expect(screen.queryByRole('heading', { name: '推荐探索岗位方向' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '你可能没意识到的亮点' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '面试追问与回答准备' })).not.toBeInTheDocument();

  expect(screen.getByText(/你不是“没有经历”/)).toBeInTheDocument();
  expect(screen.getAllByText(/教育机构新媒体运营实习|校园二手交易调研项目|社群维护|内容整理|Excel/).length).toBeGreaterThan(0);
  expect(screen.getAllByTestId('inventory-highlight-card').length).toBeGreaterThanOrEqual(2);

  const reportDirectionCards = screen.getAllByTestId('report-direction-card');
  expect(reportDirectionCards.length).toBeGreaterThanOrEqual(2);
  expect(reportDirectionCards.length).toBeLessThanOrEqual(3);
  for (const card of reportDirectionCards) {
    expect(within(card).getByText(/探索优先级/)).toBeInTheDocument();
    expect(within(card).getByText(/为什么可以探索/)).toBeInTheDocument();
    expect(within(card).getByText(/对应经历证据/)).toBeInTheDocument();
    expect(within(card).getByText(/当前缺口/)).toBeInTheDocument();
    expect(within(card).getByText(/7 天验证动作/)).toBeInTheDocument();
    expect(within(card).getByText(/可搜索岗位名称/)).toBeInTheDocument();
  }

  const inventoryRewriteCards = screen.getAllByTestId('inventory-rewrite-card');
  expect(inventoryRewriteCards.length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByRole('button', { name: '复制优化表达' }).length).toBeGreaterThanOrEqual(2);
  for (const card of inventoryRewriteCards) {
    expect(within(card).getByText(/原始表达/)).toBeInTheDocument();
    expect(within(card).getByText(/可直接使用版/)).toBeInTheDocument();
    expect(within(card).getByText(/为什么这样改/)).toBeInTheDocument();
    expect(within(card).getByText(/使用提醒/)).toBeInTheDocument();
  }

  expect(screen.getAllByTestId('inventory-action-plan-card').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: '复制整份报告' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '复制行动计划' }));
  expect(screen.getByText('已复制')).toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/保证 offer|保证进面|提高通过率|你只适合|没机会|学历太差|经历太弱|匹配度|%/);
  expect(screen.getByRole('heading', { name: '内部质量检查' })).toBeInTheDocument();
  expect(screen.getByText('检查状态：通过')).toBeInTheDocument();
  expect(screen.getByText('质量分：92 分')).toBeInTheDocument();
  expect(screen.getByText('暂无阻断项')).toBeInTheDocument();
  expect(screen.getByText('补强计划存在偏空泛或不可验证的表达。')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '本次 AI 用量与估算成本' })).not.toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/token|tokens|成本|模型：|gpt-5\.4|DeepSeek|Qwen|Kimi|schema/i);
  expect(screen.getByRole('heading', { name: '报告反馈' })).toBeInTheDocument();
  expect(screen.getByText('这份报告对你有帮助吗？')).toBeInTheDocument();
  expect(screen.getByText('这份报告可信吗？')).toBeInTheDocument();
  expect(screen.getByText('你是否发现明显不准的地方？')).toBeInTheDocument();
  expect(screen.getByText('哪个模块最没用、不准或帮助较小？（可多选）')).toBeInTheDocument();
  const weakPartSection = screen.getByText('哪个模块最没用、不准或帮助较小？（可多选）').closest('fieldset') as HTMLElement;
  expect(within(weakPartSection).getByRole('checkbox', { name: '无' })).toBeInTheDocument();
  expect(within(weakPartSection).getByRole('checkbox', { name: '亮点分析' })).toBeInTheDocument();
  expect(within(weakPartSection).getByRole('checkbox', { name: '其他，请说明' })).toBeInTheDocument();
  expect(screen.getByLabelText('有没有让你觉得被误判的地方？')).toBeInTheDocument();
  expect(screen.getByLabelText('有没有你愿意直接复制使用的内容？')).toBeInTheDocument();
  expect(screen.getByLabelText('你最希望它下一版改什么？')).toBeInTheDocument();
  expect(screen.getByText('是否愿意继续帮忙测试？')).toBeInTheDocument();
  for (const marker of ['↓', '↘', '–', '↗', '★']) {
    expect(screen.getAllByText(marker).length).toBeGreaterThan(0);
  }
  for (const label of ['1 分', '2 分', '3 分', '4 分', '5 分']) {
    expect(screen.getAllByRole('button', { name: new RegExp(label) }).length).toBeGreaterThan(0);
  }
  expect(screen.getByText('看完报告后，你是否更清楚下一步该探索什么方向？')).toBeInTheDocument();
  expect(screen.getByLabelText(/我同意将本次诊断结果脱敏后用于产品优化和匿名案例研究/)).not.toBeChecked();

  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  expect(screen.getByText('请先选择这份报告对你的帮助程度。')).toBeInTheDocument();

  const highScore = screen.getByRole('button', { name: /5 分.*非常有帮助/ });
  await user.click(highScore);
  expect(highScore).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: /4 分.*比较可信/ }));
  await user.click(screen.getByRole('radio', { name: '否，没有明显不准' }));
  await user.click(screen.getByRole('checkbox', { name: '补强计划具体可执行' }));
  await user.click(within(weakPartSection).getByRole('checkbox', { name: '无' }));
  expect(within(weakPartSection).getByRole('checkbox', { name: '无' })).toBeChecked();
  await user.click(within(weakPartSection).getByRole('checkbox', { name: '亮点分析' }));
  expect(within(weakPartSection).getByRole('checkbox', { name: '无' })).not.toBeChecked();
  await user.click(within(weakPartSection).getByRole('checkbox', { name: '其他，请说明' }));
  await user.type(screen.getByLabelText('其他模块说明'), '整体结构有一点重复');
  await user.type(screen.getByLabelText('你觉得这个模块哪里不准或没帮助？'), '亮点分析还可以更贴近真实岗位');
  await user.type(screen.getByLabelText('有没有让你觉得被误判的地方？'), '没有明显误判');
  await user.type(screen.getByLabelText('有没有你愿意直接复制使用的内容？'), '行动计划里的经历素材表');
  await user.type(screen.getByLabelText('你最希望它下一版改什么？'), '希望更短一点');
  await user.click(screen.getByRole('radio', { name: '10-30 元' }));
  await user.click(screen.getByRole('radio', { name: '是，愿意继续测试' }));
  await user.click(screen.getByRole('button', { name: '提交反馈' }));

  expect(screen.getByText('感谢反馈。你的意见会用于优化诊断质量。')).toBeInTheDocument();
  const savedFeedback = JSON.parse(window.localStorage.getItem('job-map-v0.3-feedback') || '[]');
  expect(savedFeedback.at(-1)).toMatchObject({
    helpScore: 5,
    credibilityScore: 4,
    hasObviousInaccuracy: '否',
    helpfulParts: ['补强计划具体可执行'],
    weakParts: ['亮点分析', '其他，请说明'],
    weakPartDetail: '亮点分析还可以更贴近真实岗位',
    weakOtherDetail: '整体结构有一点重复',
    misjudgedFeedback: '没有明显误判',
    copyableContent: '行动计划里的经历素材表',
    nextVersionSuggestion: '希望更短一点',
    willingnessToPay: '10-30 元',
    willingToContinueTesting: '是',
    anonymousConsent: false,
    mode: 'inventory'
  });
  expect(savedFeedback.at(-1).createdAt).toEqual(expect.any(String));
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/默认授权训练模型|模型训练授权|默认同意.*训练/);
}, 10000);

test('有岗位要求路线输出证据矩阵和 V0.6 完整诊断报告', async () => {
  const user = await startV2();

  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText('毕业时间'), '2026 年 6 月');
  await user.type(screen.getByLabelText(/城市意向/), '杭州');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营实习');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月，维护3个学生社群，整理公众号推文。');
  await user.type(screen.getByLabelText('项目经历'), '校园二手交易调研项目，设计问卷并用Excel整理结果，完成课堂展示。');
  await user.type(screen.getByLabelText('技能/作品'), 'Excel、公众号排版、剪映');
  await user.type(screen.getByLabelText('作品集或链接'), '公众号排版截图、课程活动短视频剪辑说明。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));
  await user.type(screen.getByLabelText('补充回答'), '维护3个学生社群，每周整理2篇推文素材，配合老师发布活动提醒。');
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByText(/正在完善：项目经历 · 第 2\/4 段/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('补充回答'), '设计问卷并用 Excel 汇总结果，完成课堂展示。');
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByText(/正在完善：技能作品 · 第 3\/4 段/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('补充回答'), '用公众号后台做过排版，用剪映处理过课程活动素材。');
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByText(/正在完善：作品集 · 第 4\/4 段/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('补充回答'), '作品集里保留了排版截图和剪辑说明，可以说明本人参与的具体部分。');
  await user.click(screen.getByRole('button', { name: '生成完整报告' }));

  expect(await screen.findByRole('heading', { name: '岗位要求匹配分析' })).toBeInTheDocument();
  expect(screen.getByText(/这份报告基于你确认的真实经历和目标岗位描述生成。判断只是投递建议，不是录取预测。/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '岗位要求匹配分析' }).closest('section')?.querySelector('table')).toBeNull();

  for (const heading of [
    '投递判断摘要',
    '真实经历亮点',
    '岗位要求证据矩阵',
    '简历改写建议',
    '面试追问与回答准备',
    '风险提醒',
    '下一步行动计划',
    '信心修复总结',
    '简历正文版',
    '招聘平台字段版',
    '极简预览版'
  ]) {
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  }

  expect(screen.getByText(mockJdFit().deliveryDecision)).toBeInTheDocument();
  expect(screen.getByText(mockJdFit().deliveryReason)).toBeInTheDocument();
  expect(screen.getByText(mockJdFit().strongestEvidence)).toBeInTheDocument();
  expect(screen.getByText(mockJdFit().mainGap)).toBeInTheDocument();
  expect(screen.getByText(mockJdFit().nextStepAdvice)).toBeInTheDocument();
  expect(screen.getAllByTestId('highlight-card').length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByTestId('rewrite-card').length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByRole('button', { name: '复制优化表达' }).length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByTestId('interview-card').length).toBe(5);
  expect(screen.queryByRole('button', { name: '复制回答示例' })).not.toBeInTheDocument();
  expect(screen.getAllByText(/HR 为什么可能会问/).length).toBeGreaterThanOrEqual(5);
  expect(screen.getAllByText(/回答思路/).length).toBeGreaterThanOrEqual(5);
  expect(screen.getAllByText(/关注点/).length).toBeGreaterThanOrEqual(5);
  expect(screen.getAllByText(/占位式表达/).length).toBeGreaterThanOrEqual(5);
  expect(screen.queryByText(/回答示例/)).not.toBeInTheDocument();
  expect(screen.getAllByText(/注意边界/).length).toBeGreaterThanOrEqual(5);
  expect(screen.getAllByTestId('action-plan-card').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole('button', { name: '复制整份报告' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '复制行动计划' })).toBeInTheDocument();
  expect(screen.getAllByText(/优化表达/).length).toBeGreaterThan(0);
  expect(screen.getByText(/当前最能使用的筹码/)).toBeInTheDocument();
  expect(screen.getAllByText(/不能把协助写成负责/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/保证进面|保证 offer|offer 收割机|逆袭/)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '内部质量检查' })).toBeInTheDocument();
  expect(screen.getByText('检查状态：通过')).toBeInTheDocument();
  expect(screen.getByText('质量分：92 分')).toBeInTheDocument();
  expect(screen.getByText('暂无阻断项')).toBeInTheDocument();
  expect(screen.getByText('补强计划存在偏空泛或不可验证的表达。')).toBeInTheDocument();
  await user.click(screen.getAllByRole('button', { name: '复制优化表达' })[0]);
  expect(screen.getByText('已复制')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '报告反馈' })).toBeInTheDocument();
  expect(screen.getByText('你是否愿意根据这份报告修改简历并投递该岗位？')).toBeInTheDocument();
  expect(screen.getByText('这份报告对你有帮助吗？')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /1 分.*没有帮助/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /5 分.*非常有帮助/ })).toBeInTheDocument();
  expect(screen.getAllByText('★').length).toBeGreaterThan(0);
}, 10000);

test('有岗位要求路线追问后不再二次要求填写岗位要求', async () => {
  const user = await startV2();

  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));
  expect(screen.getByRole('button', { name: '生成完整报告' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '生成完整报告' }));

  expect(await screen.findByRole('heading', { name: '岗位要求匹配分析' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '岗位要求证据匹配' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('粘贴目标岗位描述')).not.toBeInTheDocument();
}, 10000);

test('移动端结果页核心容器具备防横向溢出样式', () => {
  render(<App />);

  const css = STYLES_TEXT;
  expect(css).toMatch(/\.flow-section[\s\S]*min-width:\s*0/);
  expect(css).toMatch(/\.result-block[\s\S]*min-width:\s*0/);
  expect(css).toMatch(/\.card-list[\s\S]*min-width:\s*0/);
  expect(css).toMatch(/\.rewrite-card[\s\S]*min-width:\s*0/);
  expect(css).toMatch(/\.interview-card[\s\S]*min-width:\s*0/);
  expect(css).toMatch(/\.plan-card[\s\S]*min-width:\s*0/);
  expect(css).toMatch(/\.verdict-panel[\s\S]*min-width:\s*0/);
  expect(css).toMatch(/\.result-block p[\s\S]*overflow-wrap:\s*anywhere/);
  expect(css).toMatch(/@media \(max-width:\s*720px\)[\s\S]*\.action-row[\s\S]*flex-direction:\s*column/);
  expect(css).toMatch(/@media \(max-width:\s*720px\)[\s\S]*\.result-block[\s\S]*overflow-x:\s*hidden/);
});

test('结果页不向用户展示 usage、token、成本或模型明细', () => {
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  window.localStorage.setItem(
    'job-map-v2-confirmed-session',
    JSON.stringify({
      step: 'result',
      stage: 'senior',
      mode: 'inventory',
      profile: baseProfile,
      fieldStatuses: {},
      assets: [],
      truthConfirmed: true,
      resumeText: '',
      jdText: '',
      jdFit: null,
      report: { ...mockReport(), mode: 'inventory', jdFit: undefined, interviews: undefined, usage: null }
    })
  );

  render(<App />);

  expect(screen.queryByRole('heading', { name: '本次 AI 用量与估算成本' })).not.toBeInTheDocument();
  expect(screen.queryByText('本次未返回用量信息')).not.toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/token|tokens|成本|模型：|gpt-5\.4|DeepSeek|Qwen|Kimi|schema/i);
});

test('基础版报告在结果页展示保守交付说明', () => {
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  window.localStorage.setItem(
    'job-map-v2-confirmed-session',
    JSON.stringify({
      step: 'result',
      stage: 'senior',
      mode: 'inventory',
      profile: baseProfile,
      fieldStatuses: {},
      assets: [],
      truthConfirmed: true,
      resumeText: '',
      jdText: '',
      jdFit: null,
      report: { ...mockReport(), mode: 'inventory', isBasic: true, jdFit: undefined, interviews: undefined, usage: null }
    })
  );

  render(<App />);

  expect(screen.getByRole('heading', { name: '基础版报告' })).toBeInTheDocument();
  expect(screen.getByText(/内容基于你确认过的信息和稳定规则整理/)).toBeInTheDocument();
  expect(screen.getByText(/不会替你编造经历/)).toBeInTheDocument();
});

test('有岗位要求路线直接生成报告失败时显示脱敏错误提示', async () => {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/api/ai/status')) {
      return jsonResponse({ configured: false, mode: 'demo', message: '当前为演示模式，请在服务端 .env 中配置 OPENAI_API_KEY' });
    }
    if (url.endsWith('/api/ai/dig-questions')) return jsonResponse(mockDigQuestions(body.asset));
    if (url.endsWith('/api/ai/jd-fit')) return jsonResponse(mockJdFit());
    if (url.endsWith('/api/ai/report')) return jsonResponse({ error: 'model timeout from OpenAI provider base URL parse schema token cost' }, 502);
    return jsonResponse(mockStructuredResume(body.resumeText || ''));
  });
  const user = await startV2();

  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText(/目标岗位或行业/), '用户运营');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: '生成完整报告' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '生成完整报告' }));

  expect(await screen.findByText(/当前 AI 生成失败，可以直接重试一次/)).toBeInTheDocument();
  expect(screen.getByText(/如果多次失败，请稍后再试或联系测试负责人/)).toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/model timeout|API Key|模型名|provider|token|成本|base URL|schema|parse|DeepSeek|Qwen|Kimi|OpenAI/i);
});

test('报告生成部分失败后保留进度，并可继续生成剩余模块', async () => {
  const reportBodies: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/api/ai/status')) {
      return jsonResponse({ configured: true, mode: 'real', smallModel: 'gpt-5.4-mini', reportModel: 'gpt-5.4' });
    }
    if (url.endsWith('/api/ai/dig-questions')) return jsonResponse(mockDigQuestions(makeAsset('internship', baseProfile.internship)));
    if (url.endsWith('/api/ai/report')) {
      reportBodies.push(body);
      if (!body.reportTask) {
        return jsonResponse({
          reportTask: {
            id: 'task-1',
            mode: 'inventory',
            status: 'partial',
            failedModule: 'rewrites',
            completedModules: ['highlights', 'directions'],
            completedCount: 2,
            totalModules: 5,
            isRetrying: false,
            retryable: true,
            message: '报告生成在“rewrites”模块暂停。已完成内容不会丢失，可以继续生成剩余部分。',
            technicalDetail: 'Connection error. (task: report-rewrites, model: gpt-5.4)',
            estimate: '预计仍需 1-3 分钟，请不要关闭页面。',
            modules: { highlights: { source: 'real', highlights: mockReport().highlights } },
            moduleUsages: [],
            usage: null
          }
        });
      }
      return jsonResponse({ ...mockReport(), mode: 'inventory', jdFit: undefined, interviews: undefined });
    }
    return jsonResponse(mockStructuredResume(body.resumeText || ''));
  });

  const user = await startV2('先盘点经历');
  await user.type(screen.getByLabelText('学校名称'), '杭州应用技术学院');
  await user.type(screen.getByLabelText('学历'), '本科');
  await user.type(screen.getByLabelText('专业'), '市场营销');
  await user.type(screen.getByLabelText('实习经历'), '教育机构新媒体运营实习2个月。');
  await user.click(screen.getByLabelText(/我确认以上学历/));
  await generateAssetCards(user);
  await confirmDiggableCards(user);
  await user.click(screen.getByRole('button', { name: /进入 AI 动态追问/ }));
  await user.type(screen.getByLabelText('补充回答'), '维护学生社群并整理推文素材。');
  await user.click(screen.getByRole('button', { name: '生成经历方向诊断' }));
  await user.click(screen.getByRole('button', { name: '生成经历诊断报告' }));

  expect(await screen.findByText(/已完成内容不会丢失/)).toBeInTheDocument();
  expect(screen.getByText(/失败模块：rewrites/)).toBeInTheDocument();
  expect(screen.getByText(/已完成 2\/5 个模块/)).toBeInTheDocument();
  expect(screen.getByTestId('app-root')).not.toHaveTextContent(/Connection error|model:|gpt-5\.4|technicalDetail|provider|token|成本|base URL|schema|parse|OpenAI/i);

  await user.click(screen.getByRole('button', { name: '继续生成剩余部分' }));

  expect(reportBodies[1]).toMatchObject({
    reportTask: {
      id: 'task-1',
      completedModules: ['highlights', 'directions']
    }
  });
  expect(await screen.findByRole('heading', { name: '经历诊断报告' })).toBeInTheDocument();
});
