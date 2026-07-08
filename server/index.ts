import express from 'express';
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  AiServiceError,
  classifyAiError,
  callReportModelJson,
  callSmallModelJson,
  getOpenAiConfig,
  redactSensitiveText,
  toClientAiError,
  type AiRuntime,
  type AiRuntimeResult,
  type JsonCallOptions
} from './openaiClient.ts';
import { digQuestionsPrompt, jdSummaryPrompt, jdFitPrompt, kimiExtractPrompt, type ReportModuleTask, reportModulePrompt, reportPrompt, structureResumePrompt } from './prompts.ts';
import { callJsonWithPrimaryBackup, callRoleJsonWithPrimaryBackup, shouldUseExtractor } from './modelOrchestrator.ts';
import { callProviderRoleJson } from './modelProvider.ts';
import {
  sanitizeRiskyInterview,
  sanitizeRiskyJdFit,
  sanitizeRiskyResumeLanguage,
  sanitizeRiskyRewrite,
  validateReportQuality
} from './reportQuality.ts';
import { buildBasicReport } from './basicReport.ts';
import {
  digQuestionsJsonSchema,
  jdFitJsonSchema,
  jdSummaryJsonSchema,
  reportActionPlanJsonSchema,
  reportDirectionsJsonSchema,
  reportHighlightsJsonSchema,
  reportInterviewQuestionJsonSchema,
  reportInterviewsJsonSchema,
  reportJdFitSummaryJsonSchema,
  reportRewritesJsonSchema,
  kimiExtractJsonSchema,
  structuredResumeJsonSchema,
  validateDiagnosisReport,
  validateDigQuestionSet,
  validateJdFitReport,
  validateJdSummary,
  validateKimiExtract,
  validateReportActionPlanModule,
  validateReportDirectionsModule,
  validateReportHighlightsModule,
  validateReportInterviewQuestionModule,
  validateReportInterviewsModule,
  validateReportJdFitSummaryModule,
  validateReportRewritesModule,
  validateStructuredResume
} from './schemas.ts';
import type {
  KimiExtract,
  ReportActionPlanModule,
  ReportDirectionsModule,
  ReportHighlightsModule,
  ReportInterviewQuestionModule,
  ReportInterviewsModule,
  ReportJdFitSummaryModule,
  ReportRewritesModule
} from './schemas.ts';
import {
  assetTitles,
  emptyFieldStatuses,
  emptyProfile,
  type ActionPlanReport,
  type AiUsage,
  type AiUsageModule,
  type AiUsageTotals,
  type AssetCard,
  type AssetKind,
  type DiagnosisReport,
  type DigQuestionSet,
  type DirectionOption,
  type JdFitReport,
  type JdSummary,
  type Mode,
  type Profile,
  type ReportGenerationTask,
  type ReportModuleKey,
  type ResumeRewrite,
  type Stage,
  type StructuredResume
} from '../src/types.ts';

const DEMO_MESSAGE = '当前为演示模式，请在服务端 .env 中配置 OPENAI_API_KEY';
const BETA_ACCESS_REQUIRED_MESSAGE = '请输入有效的内测访问码后再使用 AI 诊断。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getBetaAccessCode() {
  return process.env.BETA_ACCESS_CODE?.trim() || '';
}

function readBetaAccessCode(req: express.Request) {
  const body = isRecord(req.body) ? req.body : {};
  const header = req.header('x-beta-access-code') || '';
  const query = typeof req.query.betaAccessCode === 'string' ? req.query.betaAccessCode : '';
  return (readString(body.betaAccessCode) || header || query).trim();
}

function hasValidBetaAccess(req: express.Request) {
  const expected = getBetaAccessCode();
  return !expected || readBetaAccessCode(req) === expected;
}

function sendBetaAccessError(res: express.Response) {
  res.status(401).json({
    error: BETA_ACCESS_REQUIRED_MESSAGE,
    message: BETA_ACCESS_REQUIRED_MESSAGE,
    code: 'beta_access_required'
  });
}

function getAllowedFrontendOrigins() {
  return (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function applyCors(req: express.Request, res: express.Response) {
  const allowedOrigins = getAllowedFrontendOrigins();
  const requestOrigin = req.header('origin')?.trim().replace(/\/+$/, '') || '';
  if (!allowedOrigins.length) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-beta-access-code');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function normalizeProfile(value: unknown): Profile {
  const source = isRecord(value) ? value : {};
  return {
    ...emptyProfile,
    ...Object.fromEntries(Object.keys(emptyProfile).map((key) => [key, readString(source[key])]))
  };
}

function makeAsset(id: AssetKind, content: string, source: 'demo' | 'real' = 'demo'): AssetCard {
  const isGap = id !== 'education' && !content.trim();
  return {
    id,
    title: assetTitles[id],
    content: isGap ? '' : content.trim(),
    status: '待用户确认',
    confirmed: false,
    source,
    isGap,
    gapAdvice: isGap
      ? `你目前没有${assetTitles[id]}，这不是问题本身；如果目标岗位看重这类证据，建议优先补一个与岗位相关的校内项目、作品集项目或短期实践。`
      : '',
    notes: []
  };
}

function createAssets(profile: Profile, source: 'demo' | 'real' = 'demo'): AssetCard[] {
  return [
    makeAsset(
      'education',
      [profile.education || '学历待确认', profile.schoolName || '学校名称待确认', profile.major || '专业待确认', profile.graduation || '毕业时间待确认']
        .filter(Boolean)
        .join(' / '),
      source
    ),
    makeAsset('internship', profile.internship, source),
    makeAsset('project', profile.project, source),
    makeAsset('campus', profile.campus, source),
    makeAsset('partTime', profile.partTime, source),
    makeAsset('awards', profile.awards, source),
    makeAsset('skills', [profile.skills, profile.portfolio].filter(Boolean).join('；'), source)
  ];
}

function demoStructureResume(body: unknown): StructuredResume {
  const payload = isRecord(body) ? body : {};
  const text = readString(payload.resumeText).replace(/\s+/g, ' ');
  const profile = normalizeProfile(payload.currentProfile);

  if (/本科/.test(text)) profile.education = profile.education || '本科';
  profile.schoolName = profile.schoolName || text.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,24}(?:大学|学院))/)?.[1] || '';
  profile.major = profile.major || text.match(/([\u4e00-\u9fa5A-Za-z]{2,18}(?:专业|营销|计算机|会计|金融|英语|设计|管理))/)?.[1] || '';
  profile.graduation = profile.graduation || text.match(/((?:20\d{2})\s*届|(?:20\d{2})\s*年\s*\d{0,2}\s*月?)/)?.[1] || '';
  profile.targetRole =
    profile.targetRole || text.match(/目标(?:岗位|方向)?[:：]?\s*([^。；，,\n]+)/)?.[1] || text.match(/(用户运营|内容运营|新媒体运营|产品助理)/)?.[1] || '';
  profile.internship = profile.internship || text.match(/([^。；\n]*(?:实习|运营实习)[^。；\n]*)/)?.[1] || '';
  profile.project = profile.project || text.match(/([^。；\n]*(?:项目|调研|作品|课程)[^。；\n]*)/)?.[1] || '';
  profile.campus = profile.campus || text.match(/([^。；\n]*(?:社团|学生会|校园|活动组织)[^。；\n]*)/)?.[1] || '';
  profile.partTime = profile.partTime || text.match(/([^。；\n]*(?:兼职|家教|门店|销售)[^。；\n]*)/)?.[1] || '';
  profile.awards = profile.awards || text.match(/([^。；\n]*(?:证书|奖学金|获奖|竞赛)[^。；\n]*)/)?.[1] || '';
  profile.skills = profile.skills || text.match(/技能[:：]?\s*([^。；\n]+)/)?.[1] || '';
  profile.portfolio = profile.portfolio || text.match(/((?:https?:\/\/|www\.)[^\s，。；]+)/)?.[1] || '';

  return {
    source: 'demo',
    profile,
    fieldStatuses: Object.fromEntries(
      Object.keys(emptyProfile).map((key) => [key, profile[key as keyof Profile] ? 'AI 已识别' : emptyFieldStatuses[key as keyof Profile]])
    ) as StructuredResume['fieldStatuses'],
    assets: createAssets(profile, 'demo')
  };
}

function demoDigQuestions(body: unknown): DigQuestionSet {
  const payload = isRecord(body) ? body : {};
  const rawAsset = isRecord(payload.asset) ? payload.asset : {};
  const asset = makeAsset(
    (['education', 'internship', 'project', 'campus', 'partTime', 'awards', 'skills'].includes(readString(rawAsset.id))
      ? rawAsset.id
      : 'internship') as AssetKind,
    readString(rawAsset.content) || '教育机构新媒体运营实习'
  );
  asset.title = readString(rawAsset.title) || asset.title;
  asset.gapAdvice = readString(rawAsset.gapAdvice) || asset.gapAdvice;
  const profile = normalizeProfile(payload.profile);
  const target = profile.targetRole || '目标岗位';
  const content = (asset.content || asset.gapAdvice || asset.title).slice(0, 42);
  const jdSummary = isRecord(payload.jdSummary) && Array.isArray(payload.jdSummary.requirements) ? payload.jdSummary.requirements.map(String) : [];
  const relatedJdRequirementId = jdSummary.length ? 'req_1' : undefined;

  return {
    assetId: asset.id,
    source: 'demo',
    userVisibleQuestions: [
      `结合你想探索的${target}，你这段${asset.title}里提到“${content}”，你自己实际完成的动作是哪 1-2 个？`,
      '这段经历有没有可核实的规模、频次或周期，例如人数、社群数量、每周次数、持续多久？',
      '如果面试时被问到困难，你能想到一个真实问题和你的处理方式吗？'
    ],
    internalMetadata: [
      {
        questionId: 'q_1',
        relatedAssetId: asset.id,
        relatedJdRequirementId,
        method: 'hr',
        factDimensions: ['action'],
        internalWhy: `确认这段${asset.title}中的本人真实分工。`
      },
      {
        questionId: 'q_2',
        relatedAssetId: asset.id,
        relatedJdRequirementId,
        method: 'tar',
        factDimensions: ['task', 'scale', 'tool', 'result'],
        internalWhy: `补齐${target}相关的事实证据。`
      },
      {
        questionId: 'q_3',
        relatedAssetId: asset.id,
        relatedJdRequirementId,
        method: 'part',
        factDimensions: ['reflection', 'risk'],
        internalWhy: '准备面试解释边界，不诱导编造完整答案。'
      }
    ],
    encouragement: '这一步只是在帮你回忆真实细节，不需要写得很完整。'
  };
}

function demoJdFit(body: unknown): JdFitReport {
  const payload = isRecord(body) ? body : {};
  const profile = normalizeProfile(payload.profile);
  const jdText = readString(payload.jdText);
  const evidence = `${profile.internship} ${profile.project} ${profile.campus} ${profile.skills}`;
  const hasPractice = Boolean(profile.internship || profile.project || profile.campus);
  const hasData = /Excel|数据|问卷|复盘/i.test(evidence);
  const deliveryDecision: JdFitReport['deliveryDecision'] =
    hasPractice && hasData
      ? '可以投递，建议先优化简历'
      : hasPractice
        ? '可以作为尝试方向'
        : '建议先补强后再重点投递';
  const requirement = /社群|用户/.test(jdText) ? '用户运营、社群维护、用户反馈整理' : '目标岗位核心任务理解与稳定执行';

  return {
    source: 'demo',
    deliveryDecision,
    deliveryReason: '已有经历能对上部分岗位要求，但结果数据和岗位深度仍需要补强。',
    strongestEvidence: hasPractice ? '已有真实实践材料，可以转译成基础岗位证据。' : '仍有时间用小项目补足第一段可解释材料。',
    mainGap: hasData ? '缺少可核验的结果指标。' : '缺少数据整理、复盘或真实业务反馈。',
    nextStepAdvice: '建议先投要求偏执行、助理、实习的岗位，并在简历里突出真实任务边界。',
    matrix: [
      {
        requirement,
        matchLevel: hasPractice ? '有一定匹配' : '当前证据不足',
        evidence: hasPractice ? '用户提供的实习、项目或校园经历中已有可转译的执行任务。' : '当前材料中目标岗位证据不足。',
        gap: '任务存在，但规模、周期、结果或复盘结论仍需用户确认。',
        resumeWriting: '可写为“协助完成信息整理、用户触达和任务推进支持”，避免把参与写成负责。',
        interviewRisk: '可能被追问具体人数、周期、产出和本人分工，不能临场编造数据。'
      }
    ]
  };
}

function actionPlanItem(
  period: string,
  what: string,
  why: string,
  how: string,
  completionStandard: string,
  jobSearchValue: string
): ActionPlanReport['plans'][number] {
  return {
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
  };
}

function demoActionPlan(stage: Stage, profile: Profile): ActionPlanReport {
  const target = profile.targetRole || '目标岗位';
  return {
    source: 'demo',
    plans: [
      actionPlanItem(
        '7 天内',
        '整理已确认经历清单，标注每段经历的任务、工具、产出和本人边界。',
        '先确定哪些经历可以真实写入简历。',
        '按对象、周期、工具、本人动作、交付物和不能夸大的边界整理。',
        '完成 1 份经历素材表。',
        '用于筛选可直接写入简历的真实经历。'
      ),
      actionPlanItem(
        '7 天内',
        `围绕${target}搜索 3 个真实 JD，记录岗位要求关键词。`,
        '用真实岗位要求验证当前材料是否对应市场需求。',
        '记录岗位名称、重复出现的能力词、任务描述和证据缺口。',
        '完成 1 份岗位要求对照表。',
        '用于判断简历表达是否对应真实岗位。'
      ),
      actionPlanItem(
        '14 天内',
        '完成一份目标岗位相关的数据复盘小项目，使用 Excel 整理 20 条公开内容样本。',
        '补充当前材料里较弱的数据整理和复盘证据。',
        '记录标题、互动表现、发布时间和观察结论，只使用公开可查材料。',
        '形成一张 Excel 表、一个 500 字复盘和一段截图说明。',
        `可写成“围绕${target}完成内容表现复盘，整理 20 条样本并输出观察”。`
      ),
      actionPlanItem(
        '14 天内',
        '选择 2 段最相关经历补充对象、周期、工具、动作和可核实结果。',
        '把已有经历补成能被面试追问的事实证据。',
        '每段经历至少补充 1 个真实样例、1 个工具或材料、1 个本人分工边界。',
        '完成 2 页经历复盘。',
        '用于生成更稳妥的简历改写内容。'
      ),
      actionPlanItem(
        '30 天内',
        '完成 6 次小批量投递或岗位验证，并记录岗位、简历版本和反馈。',
        '用真实反馈验证当前简历版本和岗位方向。',
        '每次记录岗位名称、JD 关键词、投递版本、反馈结果和下一步修改点。',
        '完成 1 份投递/验证记录表。',
        '用于迭代简历关键词和投递方向。'
      ),
      actionPlanItem(
        '30 天内',
        '根据反馈最高的方向准备 5 个面试追问题纲，只使用已确认经历回答。',
        '确认简历内容能在面试中解释清楚。',
        '每个问题写清关联经历、可说事实、待核实信息和不能夸大的边界。',
        '完成 1 份面试准备清单。',
        '用于把简历经历转成可解释的面试素材。'
      )
    ],
    confidenceSummary: '事实型总结：你目前不是完全没有竞争力，而是已有材料还没有被整理成岗位语言。当前最能使用的筹码是真实执行、信息整理和项目参与；下一步要补的是可核验的结果和复盘。'
  };
}

function demoDirectionOptions(profile: Profile): DirectionOption[] {
  const text = `${profile.targetRole} ${profile.internship} ${profile.project} ${profile.campus} ${profile.skills}`.toLowerCase();
  const options: DirectionOption[] = [];
  const evidence = (fallback: string) => profile.internship || profile.project || profile.campus || profile.skills || fallback;
  const direction = (
    name: string,
    level: DirectionOption['level'],
    why: string,
    evidenceText: string,
    gap: string,
    next: string,
    keywords: string[]
  ): DirectionOption => ({
    directionName: name,
    name,
    level,
    priority: level,
    searchableJobNames: keywords.slice(0, 5),
    whyExplore: why,
    why,
    evidence: evidenceText,
    gap,
    sevenDayValidation: next,
    next,
    keywords: keywords.slice(0, 5)
  });

  if (/运营|社群|用户|活动|公众号|推文/.test(text)) {
    options.push(
      direction(
        '用户运营 / 社群运营',
        '优先探索',
        '当前经历里已经有社群维护、内容整理或用户触达线索，适合作为优先探索方向。',
        evidence('已有社群维护或内容整理相关材料。'),
        '还需要补清楚用户规模、触达频率、活动反馈和复盘结论。',
        '7 天内搜索 3 个用户运营或社群运营 JD，整理一段真实社群维护案例，补齐对象、动作、频率和产出。',
        ['用户运营', '社群运营', '运营助理']
      )
    );
  }

  if (/公众号|内容|推文|剪映|视频|排版|新媒体|小红书/.test(text)) {
    options.push(
      direction(
        '新媒体运营助理',
        options.length ? '可以尝试' : '优先探索',
        '公众号、推文、剪映或排版材料可以转成内容执行和素材整理证据。',
        profile.skills || profile.internship || '已有内容工具或素材整理相关材料。',
        '需要补清楚选题来源、制作流程、发布反馈和本人承担边界。',
        '7 天内搜索 3 个新媒体运营助理 JD，复盘一篇真实推文或短视频素材，写清楚素材、制作、发布和反馈。',
        ['新媒体运营', '内容运营助理', '公众号运营']
      )
    );
  }

  if (/excel|问卷|调研|数据|表格/.test(text)) {
    options.push(
      direction(
        '数据运营助理 / 运营分析助理',
        options.length ? '可以尝试' : '优先探索',
        '问卷、调研和 Excel 整理经历可以作为数据整理与基础分析的入门证据。',
        profile.project || profile.skills || '已有问卷、调研或 Excel 整理相关材料。',
        '需要补清楚数据来源、处理方法、结论和使用场景。',
        '7 天内搜索 3 个数据运营助理 JD，把一次问卷或表格整理做成小作品，补上数据处理过程和输出截图。',
        ['数据运营', '运营分析助理', '数据分析助理']
      )
    );
  }

  if (options.length < 2) {
    options.push(
      direction(
        '运营助理',
        '过渡方向',
        '如果方向暂时不清晰，可以先探索执行、整理和沟通要求更明确的入门岗位。',
        evidence('当前材料较少，建议继续补充真实经历证据。'),
        '岗位相关场景和结果反馈还需要继续补充。',
        '7 天内搜索 3 个运营助理 JD，并补一个围绕目标行业的小型复盘项目，形成可展示材料。',
        ['运营助理', '执行支持', '活动执行助理']
      ),
      direction(
        '项目助理 / 行政助理',
        '过渡方向',
        '作为过渡方向，可以先把信息整理、流程跟进和协作支持经历转成可投递表达。',
        evidence('当前材料较少，建议继续补充真实经历证据。'),
        '需要证明能稳定推进任务，而不仅是参与过。',
        '7 天内搜索 3 个项目助理或行政助理 JD，整理一段任务推进经历，写清楚分工、节点和交付物。',
        ['项目助理', '行政助理', '流程跟进']
      )
    );
  }

  return options.slice(0, 3);
}

function rewriteItem(
  relatedExperience: string,
  originalIssue: string,
  capability: string,
  directVersion: string,
  versionAfterSupplement: string,
  usageReminder: string,
  original: string,
  reason: string,
  jdRequirement: string,
  interviewProbe: string
): ResumeRewrite {
  return {
    relatedExperience,
    originalIssue,
    capability,
    directVersion,
    versionAfterSupplement,
    usageReminder,
    original,
    optimized: directVersion,
    reason,
    jdRequirement,
    risk: usageReminder,
    interviewProbe
  };
}

function demoReport(body: unknown): DiagnosisReport {
  const payload = isRecord(body) ? body : {};
  const mode: Mode = payload.mode === 'inventory' ? 'inventory' : 'jd';
  const stage = payload.stage === 'junior' ? 'junior' : 'senior';
  const profile = normalizeProfile(payload.profile);
  const jdFit = mode === 'jd' ? (isRecord(payload.jdFit) ? validateJdFitReport(payload.jdFit) : demoJdFit(payload)) : undefined;
  const target = profile.targetRole || '目标岗位';
  const internship = profile.internship || '目标岗位相关经历待补充';
  const project = profile.project || '课程/校园项目待补充';
  const directionOptions = mode === 'inventory' ? demoDirectionOptions(profile) : undefined;
  const summary =
    mode === 'inventory'
      ? '这份报告基于已确认真实经历生成，重点帮助你看清经历筹码、可探索方向和下一步补强路径。'
      : '这份报告基于已确认真实经历和目标岗位描述生成，重点帮助你判断是否值得投、怎么写、怎么答。';

  return {
    mode,
    source: 'demo',
    summary,
    highlights: [
      {
        sourceExperience: internship,
        capability: '把执行任务、用户触达和信息整理串起来的基础岗位能力',
        jdRequirement: jdFit?.matrix[0]?.requirement || target,
        whyNotFlattery: '它来自用户真实填写的任务，不是抽象性格评价。',
        professionalExpression: '协助完成信息整理、用户触达和任务推进支持。'
      },
      {
        sourceExperience: project,
        capability: '基础调研、数据整理和复盘表达能力',
        jdRequirement: '数据整理、复盘表达、任务产出',
        whyNotFlattery: '它必须来自真实问卷、表格、展示或复盘产出，不能包装成企业项目。',
        professionalExpression: '参与调研问题设计与结果整理，形成展示或复盘材料。'
      }
    ],
    rewrites: [
      rewriteItem(
        '实习/实践经历',
        '原表达可能只写了做过什么，缺少对象、动作和本人边界。',
        '执行推进、用户触达、信息整理',
        '协助完成目标岗位相关支持工作，参与信息整理、用户触达和任务推进，沉淀可复盘的过程材料。',
        '补充对象、周期、工具和交付物后，可进一步写清楚具体支持内容。',
        '人数、频次、结果必须按真实情况补充，不能把协助写成负责。',
        internship,
        '把普通经历拆成任务、对象和产出，形成更清晰的岗位语言。',
        '执行推进、用户触达、信息整理',
        '可能被追问具体分工、周期和产出证据。'
      ),
      rewriteItem(
        '项目/课程经历',
        '项目属性和本人分工需要更清楚。',
        '调研、数据整理、复盘表达',
        '参与课程/校园项目，完成问题整理、资料收集、基础分析和展示汇报，支持形成可说明的项目结论。',
        '补充样本来源、处理工具和展示材料后，可以形成更完整的项目表达。',
        '不能虚构样本量、业务结果或商业影响。',
        project,
        '保留真实项目属性，不包装成企业真实项目。',
        '调研、数据整理、复盘表达',
        '可能被问样本来源、分析方法和你本人完成的部分。'
      ),
      rewriteItem(
        '技能与材料',
        '工具能力需要连接到真实任务或作品，不能只罗列软件名。',
        '内容整理、工具使用、材料沉淀',
        '使用已掌握工具协助完成内容整理、素材处理或表格汇总，并保留真实作品或过程材料。',
        '补充作品链接、截图或过程说明后，可写成更具体的工具应用经历。',
        '只有实际用过并能解释过程的工具才建议写入。',
        profile.skills || '技能与作品材料待补充',
        '把工具能力放回真实使用场景。',
        '工具使用、内容整理、基础执行',
        '可能被要求说明工具的具体使用场景和产出。'
      )
    ],
    directionOptions,
    jdFit,
    interviews:
      mode === 'jd'
        ? Array.from({ length: 5 }, (_, index) => ({
            question: `面试追问 ${index + 1}：这段经历中你本人具体做了什么？`,
            whyAsk: '核实经历真实性，并判断用户是否能把经历解释清楚。',
            answerAngle: '按背景、任务、动作、结果或复盘四步回答。',
            concern: '本人分工、真实边界、结果证据和岗位迁移价值。',
            sampleAnswer: '我主要参与信息整理和执行支持，能说明具体对象、频次、工具和可核实产出。',
            doNotExaggerate: '不要编造公司、岗位、负责人身份、数据结果或项目影响。'
          }))
        : undefined,
    actionPlan: demoActionPlan(stage, profile),
    safetyNotes: ['只基于真实经历表达；不伪造、不编造；不承诺 offer；缺少依据的信息应标注待核实。'],
    resumeText: [
      `求职意向：${target}`,
      `教育背景：${[profile.education, profile.schoolName, profile.major, profile.graduation].filter(Boolean).join(' / ') || '待补充'}`,
      '个人优势：具备基础执行、信息整理和项目参与经验，可围绕目标岗位继续补强可核验产出。',
      `经历改写：${internship}；${project}`,
      `技能证书：${profile.skills || '待补充与目标岗位相关的工具或作品'}`
    ],
    platformFields: [
      '个人优势：基于真实经历整理岗位相关执行、信息整理和复盘表达能力。',
      `教育经历：${[profile.education, profile.schoolName, profile.major, profile.graduation].filter(Boolean).join(' / ') || '待补充'}`,
      `项目经历：${project}`,
      `实习经历：${internship}`,
      `技能证书：${profile.skills || '待补充'}`,
      `求职意向：${target}`
    ],
    previewLines: [target, [profile.education, profile.schoolName, profile.major].filter(Boolean).join(' / ') || '教育背景待补充', internship, project]
  };
}

function getReportQualityMode(body: unknown): Mode {
  return isRecord(body) && body.mode === 'inventory' ? 'inventory' : 'jd';
}

function attachReportQuality(report: DiagnosisReport, mode: Mode): DiagnosisReport {
  const qualityMode = mode === 'jd' ? 'jd' : 'inventory';
  const safeReport = qualityMode === 'jd' ? sanitizeRiskyResumeLanguage(report) : report;
  return {
    ...safeReport,
    quality: validateReportQuality(safeReport, qualityMode)
  };
}

function isAiTaskResult<T>(value: AiRuntimeResult<T>): value is { data: T; usage: AiUsage | null } {
  return Boolean(value && typeof value === 'object' && 'data' in value && 'usage' in value);
}

function unwrapAiResult<T>(value: AiRuntimeResult<T>): { data: T; usage: AiUsage | null } {
  if (isAiTaskResult(value)) {
    return value;
  }
  return { data: value, usage: null };
}

function attachUsage<T extends object>(value: T, _usage: AiUsage | null): T {
  return { ...value };
}

function sanitizeReportTaskForClient(task: ReportGenerationTask): Omit<ReportGenerationTask, 'usage' | 'moduleUsages'> {
  const { usage: _usage, moduleUsages: _moduleUsages, ...rest } = task;
  return rest;
}

function moduleSchemaValidationError(task: string, error: unknown) {
  const detail = error instanceof Error ? redactSensitiveText(error.message) : 'unknown schema error';
  return new AiServiceError({
    code: 'schema_validation' as const,
    message: 'OpenAI 返回结构不符合报告格式，请重试。',
    detail: `${detail} (task: ${task})`,
    retryable: true
  });
}

function validateReportModule<T>(task: string, validate: (value: unknown) => T, value: unknown): T {
  try {
    return validate(value);
  } catch (error) {
    throw moduleSchemaValidationError(task, error);
  }
}

type ReportModelTier = 'small' | 'report' | 'rule';

type ReportModuleResult<T> = {
  data: T;
  usage: AiUsage | null;
  module: AiUsageModule;
};

function emptyUsageTotals(): AiUsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0
  };
}

function addUsageTotals(total: AiUsageTotals, usage: AiUsage | null): AiUsageTotals {
  if (!usage) {
    return total;
  }
  const estimatedCostUsd =
    total.estimatedCostUsd === null || usage.estimatedCostUsd === null ? null : Number((total.estimatedCostUsd + usage.estimatedCostUsd).toFixed(6));
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
    estimatedCostUsd
  };
}

function usageModule(task: ReportModuleTask, modelTier: ReportModelTier, usage: AiUsage | null): AiUsageModule {
  return {
    task,
    modelTier,
    calledAi: modelTier !== 'rule',
    model: usage?.model,
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
    totalTokens: usage?.totalTokens || 0,
    estimatedCostUsd: usage?.estimatedCostUsd ?? (modelTier === 'rule' ? 0 : null)
  };
}

function aggregateUsageModules(modules: AiUsageModule[]): AiUsage | null {
  const actual = modules.filter((module) => module.calledAi && module.totalTokens > 0);
  if (!actual.length) {
    return {
      model: 'rule',
      task: 'report',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      modelTier: 'mixed',
      byModelTier: {
        small: emptyUsageTotals(),
        report: emptyUsageTotals()
      },
      modules
    };
  }
  const estimatedCosts = actual.map((item) => item.estimatedCostUsd);
  const knownCost = estimatedCosts.every((value) => value !== null);
  const models = Array.from(new Set(actual.map((item) => item.model).filter(Boolean))).join(',');
  const byModelTier = modules.reduce(
    (totals, result) => {
      const usage = result.calledAi
        ? {
            model: result.model || '',
            task: result.task,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            estimatedCostUsd: result.estimatedCostUsd
          }
        : null;
      if (result.modelTier === 'small') {
        totals.small = addUsageTotals(totals.small, usage);
      }
      if (result.modelTier === 'report') {
        totals.report = addUsageTotals(totals.report, usage);
      }
      return totals;
    },
    { small: emptyUsageTotals(), report: emptyUsageTotals() }
  );
  return {
    model: models,
    task: 'report',
    inputTokens: actual.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: actual.reduce((sum, item) => sum + item.outputTokens, 0),
    totalTokens: actual.reduce((sum, item) => sum + item.totalTokens, 0),
    estimatedCostUsd: knownCost ? Number(actual.reduce((sum, item) => sum + (item.estimatedCostUsd || 0), 0).toFixed(6)) : null,
    modelTier: 'mixed',
    byModelTier,
    modules
  };
}

function aggregateUsage(results: ReportModuleResult<unknown>[]): AiUsage | null {
  return aggregateUsageModules(results.map((result) => result.module));
}

async function maybeBuildKimiExtract(body: unknown): Promise<KimiExtract | null> {
  if (!isRecord(body)) {
    return null;
  }

  if (!shouldUseExtractor({
    jdText: readString(body.jdText),
    profile: isRecord(body.profile) ? body.profile : {},
    assets: Array.isArray(body.assets) ? body.assets : [],
    estimatedTaskPackageChars: JSON.stringify(body).length
  })) {
    return null;
  }

  try {
    const result = unwrapAiResult(
      await callProviderRoleJson('extractor', {
        task: 'kimi-extract',
        schemaName: 'kimi_extract',
        jsonSchema: kimiExtractJsonSchema,
        prompt: kimiExtractPrompt(body),
        validate: validateKimiExtract
      })
    );
    return result.data;
  } catch {
    return null;
  }
}

async function callReportModule<T>(
  body: unknown,
  aiRuntime: AiRuntime,
  config: ReturnType<typeof getOpenAiConfig>,
  options: {
    task: ReportModuleTask;
    modelTier: Exclude<ReportModelTier, 'rule'>;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    validate: (value: unknown) => T;
    promptBody?: unknown;
  }
): Promise<ReportModuleResult<T>> {
  let useRepairPrompt = false;
  let lastError: unknown = null;
  const promptBody = options.promptBody ?? body;
  const promptFor = (repair: boolean) => reportModulePrompt(promptBody, options.task, repair);
  if (hasDedicatedGenerationProviders()) {
    const result = await callRoleJsonWithPrimaryBackup({
      task: options.task,
      schemaName: options.schemaName,
      jsonSchema: options.jsonSchema,
      prompt: promptFor(false),
      validate: options.validate,
      maxAttempts: 1
    });
    const modelTier = result.role === 'primary' ? 'report' : 'small';
    return {
      data: validateReportModule(options.task, options.validate, result.data),
      usage: result.usage,
      module: usageModule(options.task, modelTier, result.usage)
    };
  }

  const callTier = async (modelTier: Exclude<ReportModelTier, 'rule'>, repair: boolean) => {
    const model = modelTier === 'small' ? config.smallModel : config.reportModel;
    const call = modelTier === 'small' ? aiRuntime.callSmallModelJson : aiRuntime.callReportModelJson;
    return unwrapAiResult(
      await call({
        model,
        task: options.task,
        schemaName: options.schemaName,
        jsonSchema: options.jsonSchema,
        prompt: promptFor(repair),
        validate: options.validate,
        maxAttempts: 1
      })
    );
  };

  if (options.modelTier === 'small') {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await callTier('small', useRepairPrompt);
        return {
          data: validateReportModule(options.task, options.validate, result.data),
          usage: result.usage,
          module: usageModule(options.task, 'small', result.usage)
        };
      } catch (error) {
        lastError = error;
        const classified = classifyAiError(error);
        if (classified.code === 'schema_validation' && !useRepairPrompt && attempt < 3) {
          useRepairPrompt = true;
          continue;
        }
        if (!classified.retryable || attempt >= 3) {
          break;
        }
      }
    }

    throw lastError;
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await callTier('report', useRepairPrompt);
      return {
        data: validateReportModule(options.task, options.validate, result.data),
        usage: result.usage,
        module: usageModule(options.task, 'report', result.usage)
      };
    } catch (error) {
      lastError = error;
      const classified = classifyAiError(error);
      if (classified.code === 'schema_validation' && !useRepairPrompt && attempt < 2) {
        useRepairPrompt = true;
        continue;
      }
      break;
    }
  }

  const prompt = promptFor(useRepairPrompt);
  const fallbackRuntime: AiRuntime = {
    ...aiRuntime,
    callReportModelJson: async () => {
      throw lastError;
    }
  };
  let result;
  try {
    result = await callJsonWithPrimaryBackup(fallbackRuntime, {
      primaryModel: config.reportModel,
      backupModel: config.smallModel,
      task: options.task,
      schemaName: options.schemaName,
      jsonSchema: options.jsonSchema,
      prompt,
      validate: options.validate,
      maxAttempts: 1
    });
  } catch (error) {
    throw error;
  }
  const modelTier = result.role === 'primary' ? 'report' : 'small';
  return {
    data: validateReportModule(options.task, options.validate, result.data),
    usage: result.usage,
    module: usageModule(options.task, modelTier, result.usage)
  };
}

function firstUsefulText(...items: unknown[]) {
  return items.map(readString).find((item) => item.trim())?.trim() || '';
}

function activeAssetSummaries(body: unknown): string[] {
  const payload = isRecord(body) ? body : {};
  const assets = Array.isArray(payload.assets) ? payload.assets.filter(isRecord) : [];
  return assets
    .filter((asset) => readString(asset.content).trim() && asset.isGap !== true && asset.status !== '暂不使用')
    .slice(0, 4)
    .map((asset) => `${readString(asset.title) || readString(asset.id)}：${readString(asset.content).slice(0, 90)}`);
}

function buildRuleActionPlanModule(body: unknown, mode: Mode): ReportModuleResult<ReportActionPlanModule> {
  const payload = isRecord(body) ? body : {};
  const stage: Stage = payload.stage === 'junior' ? 'junior' : 'senior';
  const profile = normalizeProfile(payload.profile);
  const assets = activeAssetSummaries(body);
  const target = profile.targetRole || (mode === 'jd' ? '目标岗位' : '可探索岗位方向');
  const mainEvidence = firstUsefulText(profile.internship, profile.project, profile.campus, profile.partTime, profile.skills, assets[0], '已确认的真实经历材料');
  const actionPlan: ReportActionPlanModule = {
    source: 'real',
    summary:
      mode === 'jd'
        ? `本报告基于已确认经历和目标岗位，重点判断岗位证据、简历表达、面试风险和短期补强。`
        : `本报告基于已确认经历，重点梳理可迁移亮点、探索方向、简历表达和短期补强。`,
    actionPlan: {
      source: 'real',
      plans: [
        actionPlanItem(
          '7 天内',
          `围绕${target}整理 1 份已确认经历清单，标注任务、工具、产出和本人边界。`,
          '先筛出能真实写入简历和报告的经历证据。',
          '按任务、工具、产出、本人边界四列整理已确认经历。',
          '完成 1 份经历素材表。',
          '用于筛选可直接写入简历的真实经历。'
        ),
        actionPlanItem(
          '7 天内',
          mode === 'jd' ? '逐条拆解目标 JD 的岗位要求，标注当前材料能证明和不能证明的部分。' : '搜索 3 个真实岗位 JD，记录岗位名称、要求关键词和常见任务。',
          '用岗位要求校验当前材料，不凭感觉判断适合度。',
          '把每条岗位要求对应到已有证据、证据不足或待补充材料。',
          '完成 1 份岗位要求对照表。',
          '用于判断简历表达是否对应真实岗位。'
        ),
        actionPlanItem(
          '14 天内',
          '选择 2 段最相关经历补充事实细节，包括对象、周期、工具、动作和可核实结果。',
          '把现有经历补成可被 HR 追问的事实材料。',
          '每段经历补充对象、周期、工具、本人动作和可核实交付物。',
          '完成 2 页经历复盘。',
          '用于生成更稳妥的简历改写内容。'
        ),
        actionPlanItem(
          '14 天内',
          mode === 'jd' ? '针对证据不足的岗位要求补一项小任务或作品材料。' : '为优先探索方向整理 2 个可展示作品或过程材料。',
          '补足当前最影响投递判断的岗位证据。',
          '选择表格、截图、作品链接或复盘说明，并写明本人分工。',
          '形成 2 个作品材料或过程说明。',
          '用于补充投递前的证明材料。'
        ),
        actionPlanItem(
          '30 天内',
          mode === 'jd' ? '完成 5 次目标岗位投递，并记录简历版本、岗位要求和反馈。' : '围绕 2 个方向各完成 3 次小批量投递或岗位咨询。',
          '用真实反馈验证当前方向和简历版本。',
          '记录岗位名称、JD 关键词、投递版本、反馈结果和下一步修改点。',
          '完成 1 份投递/验证记录表。',
          '用于迭代简历关键词和投递方向。'
        ),
        actionPlanItem(
          '30 天内',
          '根据反馈最高的方向准备 5 个面试追问题纲，只使用已确认经历回答。',
          '确认简历内容能在面试中解释清楚。',
          '每个问题写清关联经历、可说事实、待核实信息和不能夸大的边界。',
          '完成 1 份面试准备清单。',
          '用于把简历经历转成可解释的面试素材。'
        )
      ],
      confidenceSummary: `当前材料不是没有价值，最可用的是${mainEvidence.slice(0, 80)}。下一步要把真实动作、交付物和边界补清楚。`
    },
    safetyNotes: ['只基于真实经历表达。', '不伪造、不编造、不承诺 offer。', '缺少依据的数据、规模和结果必须写待核实或不写入。'],
    resumeText: [
      `求职方向：${target}`,
      `教育背景：${[profile.education, profile.schoolName, profile.major, profile.graduation].filter(Boolean).join(' / ') || '待补充'}`,
      `经历摘要：${mainEvidence}`,
      `技能与材料：${firstUsefulText(profile.skills, profile.portfolio, '待补充与岗位相关的工具或作品')}`
    ],
    platformFields: [
      `个人优势：基于真实经历整理执行、沟通、信息整理和复盘表达能力。`,
      `教育经历：${[profile.education, profile.schoolName, profile.major, profile.graduation].filter(Boolean).join(' / ') || '待补充'}`,
      `项目/实习经历：${mainEvidence}`,
      `技能证书：${firstUsefulText(profile.skills, profile.awards, '待补充')}`,
      `求职意向：${target}`
    ],
    previewLines: [
      target,
      [profile.education, profile.schoolName, profile.major].filter(Boolean).join(' / ') || '教育背景待补充',
      mainEvidence.slice(0, 80),
      '下一步：7 天内整理经历复盘和可核实材料'
    ]
  };
  const data = validateReportActionPlanModule(actionPlan);
  return { data, usage: null, module: usageModule('report-action-plan', 'rule', null) };
}

const reportModuleKeyByTask: Record<ReportModuleTask, ReportModuleKey> = {
  'report-highlights': 'highlights',
  'report-directions': 'directions',
  'report-rewrites': 'rewrites',
  'report-jd-fit-summary': 'jdFit',
  'report-interviews': 'interviews',
  'report-interview-question': 'interviews',
  'report-action-plan': 'actionPlan'
};

const reportTaskByModuleKey: Partial<Record<ReportModuleKey, ReportModuleTask>> = Object.fromEntries(
  Object.entries(reportModuleKeyByTask).map(([task, key]) => [key, task])
) as Partial<Record<ReportModuleKey, ReportModuleTask>>;

function reportModuleOrder(mode: Mode): ReportModuleKey[] {
  return mode === 'inventory'
    ? ['highlights', 'directions', 'rewrites', 'actionPlan', 'assembledReport']
    : ['highlights', 'jdFit', 'rewrites', 'interviews', 'actionPlan', 'assembledReport'];
}

function readReportTask(body: unknown): ReportGenerationTask | null {
  if (!isRecord(body) || !isRecord(body.reportTask)) return null;
  return body.reportTask as ReportGenerationTask;
}

function createReportTask(body: unknown, mode: Mode): ReportGenerationTask {
  const existing = readReportTask(body);
  const order = reportModuleOrder(mode);
  const completedModules = Array.isArray(existing?.completedModules)
    ? existing.completedModules.filter((module): module is ReportModuleKey => order.includes(module as ReportModuleKey))
    : [];
  const moduleUsages = Array.isArray(existing?.moduleUsages) ? existing.moduleUsages.filter(isRecord).map((item) => item as AiUsageModule) : [];
  const modules = isRecord(existing?.modules) ? existing.modules : {};
  return {
    id: existing?.id || `report-${Date.now()}`,
    mode,
    status: existing ? 'retrying' : 'pending',
    currentModule: undefined,
    failedModule: undefined,
    completedModules,
    completedCount: completedModules.length,
    totalModules: order.length,
    isRetrying: Boolean(existing),
    retryable: true,
    message: existing ? '正在继续生成剩余部分，已完成内容不会丢失。' : '报告生成任务已创建。',
    technicalDetail: '',
    estimate: '预计仍需 1-3 分钟，请不要关闭页面。',
    modules,
    moduleUsages,
    usage: aggregateUsageModules(moduleUsages)
  };
}

function sanitizeJdTaskModuleData<T>(task: ReportGenerationTask, key: ReportModuleKey, data: T): T {
  if (task.mode !== 'jd') {
    return data;
  }
  if (key === 'rewrites' && isRecord(data) && Array.isArray(data.rewrites)) {
    return { ...data, rewrites: data.rewrites.map((rewrite) => sanitizeRiskyRewrite(rewrite as never)) } as T;
  }
  if (key === 'jdFit' && isRecord(data) && isRecord(data.jdFit)) {
    return { ...data, jdFit: sanitizeRiskyJdFit(data.jdFit as never) } as T;
  }
  if (key === 'interviews' && isRecord(data) && Array.isArray(data.interviews)) {
    return { ...data, interviews: data.interviews.map((interview) => sanitizeRiskyInterview(interview as never)) } as T;
  }
  if (key === 'assembledReport' && isRecord(data)) {
    return sanitizeRiskyResumeLanguage(data as unknown as DiagnosisReport) as T;
  }
  return data;
}

function markReportModuleDone<T>(task: ReportGenerationTask, key: ReportModuleKey, result: ReportModuleResult<T>) {
  const safeData = sanitizeJdTaskModuleData(task, key, result.data);
  task.modules[key] = safeData;
  if (!task.completedModules.includes(key)) {
    task.completedModules.push(key);
  }
  task.moduleUsages = task.moduleUsages.filter((item) => item.task !== result.module.task).concat(result.module);
  task.completedCount = task.completedModules.length;
  task.usage = aggregateUsageModules(task.moduleUsages);
}

function markRuleModuleDone<T>(task: ReportGenerationTask, key: ReportModuleKey, result: ReportModuleResult<T>) {
  markReportModuleDone(task, key, result);
}

function markAssembledReportDone(task: ReportGenerationTask, report: DiagnosisReport) {
  task.modules.assembledReport = sanitizeJdTaskModuleData(task, 'assembledReport', report);
  if (!task.completedModules.includes('assembledReport')) {
    task.completedModules.push('assembledReport');
  }
  task.completedCount = task.completedModules.length;
  task.currentModule = undefined;
  task.failedModule = undefined;
  task.status = 'completed';
  task.message = '报告已生成完成。';
  task.technicalDetail = '';
  task.usage = aggregateUsageModules(task.moduleUsages);
}

function markReportTaskFailed(task: ReportGenerationTask, key: ReportModuleKey, error: unknown) {
  const classified = classifyAiError(error);
  task.status = task.completedModules.length ? 'partial' : 'failed';
  task.currentModule = undefined;
  task.failedModule = key;
  task.retryable = classified.retryable;
  task.message = `报告生成在“${key}”模块暂停。已完成内容不会丢失，可以继续生成剩余部分。`;
  task.technicalDetail = redactSensitiveText(classified.detail || classified.message);
  task.completedCount = task.completedModules.length;
  task.usage = aggregateUsageModules(task.moduleUsages);
}

function cachedModuleResult<T>(task: ReportGenerationTask, key: ReportModuleKey, validate: (value: unknown) => T): ReportModuleResult<T> | null {
  if (!(key in task.modules)) {
    return null;
  }
  const taskName = reportTaskByModuleKey[key];
  const moduleUsage = taskName ? task.moduleUsages.find((item) => item.task === taskName) : undefined;
  return {
    data: validateReportModule(taskName || key, validate, task.modules[key]),
    usage: null,
    module:
      moduleUsage ||
      usageModule((taskName || 'report-action-plan') as ReportModuleTask, key === 'actionPlan' ? 'rule' : 'report', null)
  };
}

function assembleReportFromModules(mode: Mode, task: ReportGenerationTask): DiagnosisReport {
  const highlights = validateReportModule('report-highlights', validateReportHighlightsModule, task.modules.highlights);
  const rewrites = validateReportModule('report-rewrites', validateReportRewritesModule, task.modules.rewrites);
  const actionPlan = validateReportModule('report-action-plan', validateReportActionPlanModule, task.modules.actionPlan);

  if (mode === 'inventory') {
    const directions = validateReportModule('report-directions', validateReportDirectionsModule, task.modules.directions);
    return validateDiagnosisReport({
      mode: 'inventory',
      source: 'real',
      summary: actionPlan.summary,
      highlights: highlights.highlights,
      rewrites: rewrites.rewrites,
      directionOptions: directions.directionOptions,
      actionPlan: actionPlan.actionPlan,
      safetyNotes: actionPlan.safetyNotes,
      resumeText: actionPlan.resumeText,
      platformFields: actionPlan.platformFields,
      previewLines: actionPlan.previewLines
    });
  }

  const jdFit = validateReportModule('report-jd-fit-summary', validateReportJdFitSummaryModule, task.modules.jdFit);
  const interviews = validateReportModule('report-interviews', validateReportInterviewsModule, task.modules.interviews);
  return sanitizeRiskyResumeLanguage(validateDiagnosisReport({
    mode: 'jd',
    source: 'real',
    summary: actionPlan.summary,
    highlights: highlights.highlights,
    rewrites: rewrites.rewrites,
    jdFit: jdFit.jdFit,
    interviews: interviews.interviews,
    actionPlan: actionPlan.actionPlan,
    safetyNotes: actionPlan.safetyNotes,
    resumeText: actionPlan.resumeText,
    platformFields: actionPlan.platformFields,
    previewLines: actionPlan.previewLines
  }));
}

function assembleMixedBasicReport(mode: Mode, task: ReportGenerationTask, body: unknown): DiagnosisReport {
  const report = buildBasicReport({ ...(isRecord(body) ? body : {}), mode });

  if (task.completedModules.includes('highlights')) {
    const highlights = validateReportModule('report-highlights', validateReportHighlightsModule, task.modules.highlights);
    report.highlights = highlights.highlights;
  }

  if (task.completedModules.includes('rewrites')) {
    const rewrites = validateReportModule('report-rewrites', validateReportRewritesModule, task.modules.rewrites);
    report.rewrites = rewrites.rewrites;
  }

  if (task.completedModules.includes('actionPlan')) {
    const actionPlan = validateReportModule('report-action-plan', validateReportActionPlanModule, task.modules.actionPlan);
    report.summary = actionPlan.summary;
    report.actionPlan = actionPlan.actionPlan;
    report.safetyNotes = actionPlan.safetyNotes;
    report.resumeText = actionPlan.resumeText;
    report.platformFields = actionPlan.platformFields;
    report.previewLines = actionPlan.previewLines;
  }

  if (mode === 'inventory') {
    if (task.completedModules.includes('directions')) {
      const directions = validateReportModule('report-directions', validateReportDirectionsModule, task.modules.directions);
      report.directionOptions = directions.directionOptions;
    }
    return validateDiagnosisReport(report);
  }

  if (task.completedModules.includes('jdFit')) {
    const jdFit = validateReportModule('report-jd-fit-summary', validateReportJdFitSummaryModule, task.modules.jdFit);
    report.jdFit = jdFit.jdFit;
  }
  if (task.completedModules.includes('interviews')) {
    const interviews = validateReportModule('report-interviews', validateReportInterviewsModule, task.modules.interviews);
    report.interviews = interviews.interviews;
  }
  return sanitizeRiskyResumeLanguage(validateDiagnosisReport(report));
}

async function generateSplitReport(
  body: unknown,
  aiRuntime: AiRuntime,
  config: ReturnType<typeof getOpenAiConfig>,
  mode: Mode
): Promise<{ data: DiagnosisReport; usage: AiUsage | null }> {
  const kimiExtract = await maybeBuildKimiExtract(body);
  const bodyWithExtract = isRecord(body) && kimiExtract ? { ...body, kimiExtract } : body;
  const results: ReportModuleResult<unknown>[] = [];
  const highlights = await callReportModule<ReportHighlightsModule>(bodyWithExtract, aiRuntime, config, {
    task: 'report-highlights',
    modelTier: mode === 'jd' ? 'small' : 'report',
    schemaName: 'report_highlights',
    jsonSchema: reportHighlightsJsonSchema,
    validate: validateReportHighlightsModule
  });
  results.push(highlights);

  if (mode === 'inventory') {
    const directions = await callReportModule<ReportDirectionsModule>(bodyWithExtract, aiRuntime, config, {
      task: 'report-directions',
      modelTier: 'report',
      schemaName: 'report_directions',
      jsonSchema: reportDirectionsJsonSchema,
      validate: validateReportDirectionsModule
    });
    results.push(directions);
    const rewrites = await callReportModule<ReportRewritesModule>(bodyWithExtract, aiRuntime, config, {
      task: 'report-rewrites',
      modelTier: 'report',
      schemaName: 'report_rewrites',
      jsonSchema: reportRewritesJsonSchema,
      validate: validateReportRewritesModule
    });
    results.push(rewrites);
    const actionPlan = buildRuleActionPlanModule(body, mode);
    results.push(actionPlan);
    return {
      data: validateDiagnosisReport({
        mode: 'inventory',
        source: 'real',
        summary: actionPlan.data.summary,
        highlights: highlights.data.highlights,
        rewrites: rewrites.data.rewrites,
        directionOptions: directions.data.directionOptions,
        actionPlan: actionPlan.data.actionPlan,
        safetyNotes: actionPlan.data.safetyNotes,
        resumeText: actionPlan.data.resumeText,
        platformFields: actionPlan.data.platformFields,
        previewLines: actionPlan.data.previewLines
      }),
      usage: aggregateUsage(results)
    };
  }

  const jdFit = await callReportModule<ReportJdFitSummaryModule>(bodyWithExtract, aiRuntime, config, {
    task: 'report-jd-fit-summary',
    modelTier: 'report',
    schemaName: 'report_jd_fit_summary',
    jsonSchema: reportJdFitSummaryJsonSchema,
    validate: validateReportJdFitSummaryModule
  });
  results.push(jdFit);
  const rewrites = await callReportModule<ReportRewritesModule>(bodyWithExtract, aiRuntime, config, {
    task: 'report-rewrites',
    modelTier: 'report',
    schemaName: 'report_rewrites',
    jsonSchema: reportRewritesJsonSchema,
    validate: validateReportRewritesModule
  });
  results.push(rewrites);
  const interviews = await callReportModule<ReportInterviewsModule>(bodyWithExtract, aiRuntime, config, {
    task: 'report-interviews',
    modelTier: 'report',
    schemaName: 'report_interviews',
    jsonSchema: reportInterviewsJsonSchema,
    validate: validateReportInterviewsModule
  });
  results.push(interviews);
  const actionPlan = buildRuleActionPlanModule(body, mode);
  results.push(actionPlan);

  return {
    data: sanitizeRiskyResumeLanguage(validateDiagnosisReport({
      mode: 'jd',
      source: 'real',
      summary: actionPlan.data.summary,
      highlights: highlights.data.highlights,
      rewrites: rewrites.data.rewrites,
      jdFit: jdFit.data.jdFit,
      interviews: interviews.data.interviews,
      actionPlan: actionPlan.data.actionPlan,
      safetyNotes: actionPlan.data.safetyNotes,
      resumeText: actionPlan.data.resumeText,
      platformFields: actionPlan.data.platformFields,
      previewLines: actionPlan.data.previewLines
    })),
    usage: aggregateUsage(results)
  };
}

type ResumableReportResult =
  | { kind: 'completed'; data: DiagnosisReport; usage: AiUsage | null; task: ReportGenerationTask }
  | { kind: 'task'; task: ReportGenerationTask };

async function generateResumableReport(
  body: unknown,
  aiRuntime: AiRuntime,
  config: ReturnType<typeof getOpenAiConfig>,
  mode: Mode
): Promise<ResumableReportResult> {
  const kimiExtract = await maybeBuildKimiExtract(body);
  const bodyWithExtract = isRecord(body) && kimiExtract ? { ...body, kimiExtract } : body;
  const task = createReportTask(bodyWithExtract, mode);
  const runCachedOrModule = async <T>(
    key: ReportModuleKey,
    validate: (value: unknown) => T,
    create: () => Promise<ReportModuleResult<T>>
  ): Promise<ReportModuleResult<T>> => {
    const cached = cachedModuleResult(task, key, validate);
    if (cached) {
      return cached;
    }
    task.status = task.isRetrying ? 'retrying' : 'running';
    task.currentModule = key;
    task.message = `正在生成第 ${task.completedModules.length + 1}/${task.totalModules} 个模块：${key}。已完成内容不会丢失。`;
    const result = await create();
    markReportModuleDone(task, key, result);
    return result;
  };
  const runInterviewQuestions = async (): Promise<ReportModuleResult<ReportInterviewsModule>> => {
    const cached = cachedModuleResult(task, 'interviews', validateReportInterviewsModule);
    if (cached) {
      return cached;
    }
    task.status = task.isRetrying ? 'retrying' : 'running';
    task.currentModule = 'interviews';
    task.message = `正在生成第 ${task.completedModules.length + 1}/${task.totalModules} 个模块：interviews。已完成内容不会丢失。`;
    const pieces: ReportModuleResult<ReportInterviewQuestionModule>[] = [];
    for (let index = 1; index <= 5; index += 1) {
      pieces.push(
        await callReportModule<ReportInterviewQuestionModule>(bodyWithExtract, aiRuntime, config, {
          task: 'report-interview-question',
          modelTier: 'report',
          schemaName: 'report_interview_question',
          jsonSchema: reportInterviewQuestionJsonSchema,
          validate: validateReportInterviewQuestionModule,
          promptBody: { ...(isRecord(bodyWithExtract) ? bodyWithExtract : {}), interviewIndex: index }
        })
      );
    }
    const moduleUsages = pieces.map((piece) => piece.module);
    const module: AiUsageModule = {
      task: 'report-interview-question',
      modelTier: moduleUsages.some((item) => item.modelTier === 'small') ? 'small' : 'report',
      calledAi: true,
      model: Array.from(new Set(moduleUsages.map((item) => item.model).filter(Boolean))).join(',') || undefined,
      inputTokens: moduleUsages.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: moduleUsages.reduce((sum, item) => sum + item.outputTokens, 0),
      totalTokens: moduleUsages.reduce((sum, item) => sum + item.totalTokens, 0),
      estimatedCostUsd: moduleUsages.every((item) => item.estimatedCostUsd !== null)
        ? Number(moduleUsages.reduce((sum, item) => sum + (item.estimatedCostUsd || 0), 0).toFixed(6))
        : null
    };
    const data = validateReportInterviewsModule({ source: 'real', interviews: pieces.map((piece) => piece.data.interview) });
    const result: ReportModuleResult<ReportInterviewsModule> = { data, usage: null, module };
    markReportModuleDone(task, 'interviews', result);
    return result;
  };

  try {
    await runCachedOrModule('highlights', validateReportHighlightsModule, () =>
      callReportModule<ReportHighlightsModule>(bodyWithExtract, aiRuntime, config, {
        task: 'report-highlights',
        modelTier: mode === 'jd' ? 'small' : 'report',
        schemaName: 'report_highlights',
        jsonSchema: reportHighlightsJsonSchema,
        validate: validateReportHighlightsModule
      })
    );

    if (mode === 'inventory') {
      await runCachedOrModule('directions', validateReportDirectionsModule, () =>
        callReportModule<ReportDirectionsModule>(bodyWithExtract, aiRuntime, config, {
          task: 'report-directions',
          modelTier: 'report',
          schemaName: 'report_directions',
          jsonSchema: reportDirectionsJsonSchema,
          validate: validateReportDirectionsModule
        })
      );
    } else {
      await runCachedOrModule('jdFit', validateReportJdFitSummaryModule, () =>
        callReportModule<ReportJdFitSummaryModule>(bodyWithExtract, aiRuntime, config, {
          task: 'report-jd-fit-summary',
          modelTier: 'report',
          schemaName: 'report_jd_fit_summary',
          jsonSchema: reportJdFitSummaryJsonSchema,
          validate: validateReportJdFitSummaryModule
        })
      );
    }

    await runCachedOrModule('rewrites', validateReportRewritesModule, () =>
      callReportModule<ReportRewritesModule>(bodyWithExtract, aiRuntime, config, {
        task: 'report-rewrites',
        modelTier: 'report',
        schemaName: 'report_rewrites',
        jsonSchema: reportRewritesJsonSchema,
        validate: validateReportRewritesModule
      })
    );

    if (mode === 'jd') {
      await runInterviewQuestions();
    }

    if (!cachedModuleResult(task, 'actionPlan', validateReportActionPlanModule)) {
      task.status = task.isRetrying ? 'retrying' : 'running';
      task.currentModule = 'actionPlan';
      task.message = `正在生成第 ${task.completedModules.length + 1}/${task.totalModules} 个模块：actionPlan。已完成内容不会丢失。`;
      markRuleModuleDone(task, 'actionPlan', buildRuleActionPlanModule(body, mode));
    }

    task.currentModule = 'assembledReport';
    task.status = 'running';
    const report = assembleReportFromModules(mode, task);
    markAssembledReportDone(task, report);
    return { kind: 'completed', data: report, usage: task.usage, task };
  } catch (error) {
    markReportTaskFailed(task, task.currentModule || 'assembledReport', error);
    const report = assembleMixedBasicReport(mode, task, body);
    markAssembledReportDone(task, report);
    task.message = task.completedModules.length > 1
      ? '已生成基础版报告，并保留已完成的深度分析内容。深度内容可在后续继续尝试补全。'
      : '已生成基础版报告。深度内容可在后续继续尝试补全。';
    return { kind: 'completed', data: report, usage: task.usage, task };
  }
}

function sendAiError(res: express.Response, error: unknown) {
  res.status(502).json(toClientAiError(error));
}

function hasDedicatedGenerationProviders() {
  return Boolean(
    process.env.AI_PRIMARY_API_KEY?.trim() &&
      process.env.AI_PRIMARY_MODEL?.trim() &&
      process.env.AI_BACKUP_API_KEY?.trim() &&
      process.env.AI_BACKUP_MODEL?.trim()
  );
}

function isAiConfigured(config: ReturnType<typeof getOpenAiConfig>) {
  return config.configured || hasDedicatedGenerationProviders();
}

function omitModel<T>(options: JsonCallOptions<T>): Omit<JsonCallOptions<T>, 'model'> {
  const { model: _model, ...rest } = options;
  return rest;
}

function getRuntime(runtime: Partial<AiRuntime>): AiRuntime {
  const useRoleProviders = hasDedicatedGenerationProviders();
  return {
    callSmallModelJson:
      runtime.callSmallModelJson ||
      (useRoleProviders ? ((options) => callProviderRoleJson('primary', omitModel(options))) : callSmallModelJson),
    callReportModelJson:
      runtime.callReportModelJson ||
      (useRoleProviders ? ((options) => callProviderRoleJson('primary', omitModel(options))) : callReportModelJson)
  };
}

async function runJsonTask<T>(
  reqBody: unknown,
  call: (options: JsonCallOptions<T>) => Promise<AiRuntimeResult<T>>,
  options: Omit<JsonCallOptions<T>, 'prompt'>
) {
  return unwrapAiResult(await call({
    ...options,
    prompt:
      options.task === 'structure-resume'
        ? structureResumePrompt(reqBody)
        : options.task === 'dig-questions'
          ? digQuestionsPrompt(reqBody)
          : options.task === 'jd-summary'
          ? jdSummaryPrompt(reqBody)
          : options.task === 'jd-fit'
          ? jdFitPrompt(reqBody)
            : reportPrompt(reqBody)
  }));
}

async function runJsonTaskWithRetry<T>(
  reqBody: unknown,
  call: (options: JsonCallOptions<T>) => Promise<AiRuntimeResult<T>>,
  options: Omit<JsonCallOptions<T>, 'prompt'>,
  maxAttempts = 3
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runJsonTask(reqBody, call, options);
    } catch (error) {
      lastError = error;
      const classified = classifyAiError(error);
      if (!classified.retryable || attempt >= maxAttempts) {
        break;
      }
    }
  }
  throw lastError;
}

function aggregateSimpleUsage(task: string, usages: (AiUsage | null)[]): AiUsage | null {
  const actual = usages.filter(Boolean) as AiUsage[];
  if (!actual.length) return null;
  const estimatedCostUsd = actual.every((usage) => usage.estimatedCostUsd !== null)
    ? Number(actual.reduce((sum, usage) => sum + (usage.estimatedCostUsd || 0), 0).toFixed(6))
    : null;
  return {
    model: Array.from(new Set(actual.map((usage) => usage.model))).join(','),
    task,
    inputTokens: actual.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: actual.reduce((sum, usage) => sum + usage.outputTokens, 0),
    totalTokens: actual.reduce((sum, usage) => sum + usage.totalTokens, 0),
    estimatedCostUsd
  };
}

export function createAiServer(runtime: Partial<AiRuntime> = {}): Server {
  const app = express();
  const aiRuntime = getRuntime(runtime);

  app.use(express.json({ limit: '240kb' }));
  app.use((req, res, next) => {
    applyCors(req, res);
    next();
  });
  app.options('/api/{*path}', (_, res) => res.sendStatus(204));

  app.post('/api/beta/access', (req, res) => {
    if (!hasValidBetaAccess(req)) {
      sendBetaAccessError(res);
      return;
    }
    res.json({ ok: true });
  });

  app.use('/api/ai', (req, res, next) => {
    if (!hasValidBetaAccess(req)) {
      sendBetaAccessError(res);
      return;
    }
    next();
  });

  app.get('/api/ai/status', (_, res) => {
    const config = getOpenAiConfig();
    if (!isAiConfigured(config)) {
      res.json({ configured: false, mode: 'demo', message: DEMO_MESSAGE });
      return;
    }
    res.json({
      configured: true,
      mode: 'real'
    });
  });

  app.post('/api/ai/structure-resume', async (req, res) => {
    const config = getOpenAiConfig();
    if (!isAiConfigured(config)) {
      res.json(attachUsage(demoStructureResume(req.body), null));
      return;
    }
    try {
      const result = await runJsonTask(req.body, aiRuntime.callSmallModelJson, {
        model: config.smallModel,
        task: 'structure-resume',
        schemaName: 'structured_resume',
        jsonSchema: structuredResumeJsonSchema,
        validate: validateStructuredResume
    });
    res.json(attachUsage(result.data, result.usage));
  } catch (error) {
      sendAiError(res, error);
    }
  });

  app.post('/api/ai/dig-questions', async (req, res) => {
    const config = getOpenAiConfig();
    if (!isAiConfigured(config)) {
      res.json(attachUsage(demoDigQuestions(req.body), null));
      return;
    }
    try {
      const result = await runJsonTask(req.body, aiRuntime.callSmallModelJson, {
        model: config.smallModel,
        task: 'dig-questions',
        schemaName: 'dig_questions',
        jsonSchema: digQuestionsJsonSchema,
        validate: validateDigQuestionSet
    });
    res.json(attachUsage(result.data, result.usage));
  } catch (error) {
      sendAiError(res, error);
    }
  });

  app.post('/api/ai/jd-fit', async (req, res) => {
    const config = getOpenAiConfig();
    if (!isAiConfigured(config)) {
      res.json(attachUsage(demoJdFit(req.body), null));
      return;
    }
    try {
      const summary = await runJsonTaskWithRetry<JdSummary>(req.body, aiRuntime.callSmallModelJson, {
        model: config.smallModel,
        task: 'jd-summary',
        schemaName: 'jd_summary',
        jsonSchema: jdSummaryJsonSchema,
        validate: validateJdSummary
      });
      const result = await runJsonTaskWithRetry({ ...(isRecord(req.body) ? req.body : {}), jdSummary: summary.data, jdText: '' }, aiRuntime.callSmallModelJson, {
        model: config.smallModel,
        task: 'jd-fit',
        schemaName: 'jd_fit_report',
        jsonSchema: jdFitJsonSchema,
        validate: validateJdFitReport
      });
    res.json(attachUsage(result.data, aggregateSimpleUsage('jd-fit', [summary.usage, result.usage])));
  } catch (error) {
      sendAiError(res, error);
    }
  });

  app.post('/api/ai/report', async (req, res) => {
    const config = getOpenAiConfig();
    const qualityMode = getReportQualityMode(req.body);
    if (!isAiConfigured(config)) {
      res.json(attachUsage(attachReportQuality(demoReport(req.body), qualityMode), null));
      return;
    }
    try {
      const result = await generateResumableReport(req.body, aiRuntime, config, qualityMode);
      if (result.kind === 'task') {
        res.json({ reportTask: sanitizeReportTaskForClient(result.task) });
        return;
      }
      res.json({
        ...attachUsage(attachReportQuality(result.data, qualityMode), result.usage),
        reportTask: sanitizeReportTaskForClient(result.task)
      });
  } catch (error) {
      sendAiError(res, error);
    }
  });

  return createServer(app);
}

export function getServerListenConfig() {
  return {
    port: Number(process.env.PORT || process.env.AI_API_PORT || 8787),
    host: process.env.API_HOST?.trim() || '127.0.0.1'
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const { port, host } = getServerListenConfig();
  createAiServer().listen(port, host, () => {
    console.log(`AI API server listening on http://${host}:${port}`);
  });
}
