import type {
  ActionPlanItem,
  AssetCard,
  DiagnosisReport,
  DirectionOption,
  HiddenHighlight,
  InterviewPrep,
  JdFitReport,
  Mode,
  Profile,
  ResumeRewrite
} from '../src/types.ts';
import { emptyProfile } from '../src/types.ts';
import { validateDiagnosisReport } from './schemas.ts';

export const BASIC_REPORT_NOTICE =
  '当前已为你生成基础版报告。内容基于你确认过的信息和稳定规则整理，会偏保守，但不会替你编造经历。你可以先参考，系统也会继续尝试补全深度内容。';

type BasicReportInput = {
  mode?: unknown;
  profile?: unknown;
  assets?: unknown;
  jdText?: unknown;
};

type ConfirmedAsset = Pick<AssetCard, 'id' | 'title' | 'content'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProfile(value: unknown): Profile {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(emptyProfile).map(([key, fallback]) => [key, readString(record[key]) || fallback])
  ) as Profile;
}

function normalizeMode(value: unknown): Mode {
  return value === 'inventory' ? 'inventory' : 'jd';
}

function confirmedAssets(value: unknown, profile: Profile): ConfirmedAsset[] {
  const assets = Array.isArray(value) ? value : [];
  const fromCards = assets
    .filter(isRecord)
    .filter((asset) => {
      const status = readString(asset.status);
      return asset.confirmed === true || status === '已确认' || status === '用户已修改';
    })
    .filter((asset) => asset.isGap !== true && readString(asset.content))
    .map((asset) => ({
      id: readString(asset.id) as AssetCard['id'],
      title: readString(asset.title) || '已确认经历',
      content: readString(asset.content)
    }));

  if (fromCards.length) return fromCards;

  return [
    ['internship', '实习经历', profile.internship],
    ['project', '项目经历', profile.project],
    ['campus', '校园经历', profile.campus],
    ['partTime', '兼职经历', profile.partTime],
    ['skills', '技能作品', profile.skills],
    ['education', '教育背景', [profile.education, profile.schoolName, profile.major].filter(Boolean).join(' / ')]
  ]
    .map(([id, title, content]) => ({ id: id as AssetCard['id'], title, content }))
    .filter((asset) => asset.content.trim());
}

function assetAt(assets: ConfirmedAsset[], index: number): ConfirmedAsset {
  return assets[index] || assets[0] || { id: 'skills', title: '已确认经历材料', content: '已确认的基础信息和经历材料' };
}

function buildHighlights(assets: ConfirmedAsset[], mode: Mode): HiddenHighlight[] {
  const templates = [
    ['经历整理与任务执行能力', mode === 'jd' ? '岗位中与执行、协作、复盘相关的要求' : '可迁移到运营、助理、项目支持等基础岗位的能力'],
    ['信息整理与沟通协作能力', mode === 'jd' ? '岗位中与沟通、反馈整理、内容协作相关的要求' : '可迁移到用户运营、内容运营、行政运营等方向的能力']
  ];

  return templates.map(([capability, jdRequirement], index) => {
    const asset = assetAt(assets, index);
    return {
      sourceExperience: `${asset.title}：${asset.content}`,
      capability,
      jdRequirement,
      whyNotFlattery: '该判断只来自用户已确认经历中的任务、材料或工具，不扩写为未经确认的成果。',
      professionalExpression: `可保守表达为：参与${asset.title}相关工作，围绕具体任务进行整理、协作和复盘。`
    };
  });
}

function buildDirections(assets: ConfirmedAsset[]): DirectionOption[] {
  const primary = assetAt(assets, 0);
  const secondary = assetAt(assets, 1);
  return [
    {
      directionName: '用户运营支持',
      name: '用户运营支持',
      level: '过渡方向',
      priority: '过渡方向',
      searchableJobNames: ['用户运营实习生', '社群运营助理', '用户反馈专员', '运营助理'],
      whyExplore: '该方向可用真实 JD 验证，且能承接已确认经历中的社群、反馈、内容或资料整理任务。',
      why: '先用真实岗位要求验证经历是否能对应日常运营任务。',
      evidence: `${primary.title}：${primary.content}`,
      gap: '仍需要补充服务对象、工具、周期、反馈类型和可核实交付物。',
      sevenDayValidation: '7 天内搜索 3 个用户运营或社群运营 JD，标注要求与已确认经历的对应关系。',
      next: '先整理一版经历证据表，再决定是否小批量投递。',
      keywords: ['用户运营', '社群维护', '用户反馈', '内容协作']
    },
    {
      directionName: '内容运营与资料整理',
      name: '内容运营与资料整理',
      level: '过渡方向',
      priority: '过渡方向',
      searchableJobNames: ['内容运营实习生', '新媒体运营助理', '内容编辑助理', '资料运营助理'],
      whyExplore: '该方向能用内容整理、材料归类、基础编辑和复盘材料来验证，不需要把经历包装成更高职责。',
      why: '用内容类岗位检验当前材料是否能证明信息整理和表达能力。',
      evidence: `${secondary.title}：${secondary.content}`,
      gap: '需要补充内容类型、发布或展示场景、协作对象和本人边界。',
      sevenDayValidation: '7 天内找 3 个内容运营 JD，对照是否要求排版、资料整理、选题协作或数据记录。',
      next: '准备 1-2 份可展示的内容材料或过程截图，并标明本人完成部分。',
      keywords: ['内容运营', '新媒体运营', '资料整理', '内容编辑']
    }
  ];
}

function buildRewrites(assets: ConfirmedAsset[], mode: Mode): ResumeRewrite[] {
  return [0, 1, 2].map((_, index) => {
    const asset = assetAt(assets, index);
    const jdRequirement = mode === 'jd' ? '回应岗位中与执行、协作、整理或反馈相关的要求' : '对应可迁移的基础岗位能力';
    const directVersion = `参与${asset.title}，围绕已确认任务进行资料整理、沟通协作和过程记录。`;
    return {
      relatedExperience: `${asset.title}：${asset.content}`,
      originalIssue: '原表达容易停留在经历名称，缺少任务、动作和边界。',
      capability: '任务拆解、信息整理和协作执行能力',
      directVersion,
      versionAfterSupplement: `${directVersion} 如能确认对象、周期、工具、数量或交付物，可补充到同一句中。`,
      usageReminder: '只使用你能解释清楚的真实信息；数字、结果和职责边界需要先核实。',
      original: asset.content,
      optimized: directVersion,
      reason: '把经历改成岗位可读的任务语言，但不新增未确认事实。',
      jdRequirement,
      risk: '不要把参与、协助或整理类经历写成独立统筹或结果承诺。',
      interviewProbe: '面试中可能追问你的具体分工、工具、对象和交付物。'
    };
  });
}

function buildJdFit(assets: ConfirmedAsset[], jdText: string): JdFitReport {
  const requirements = extractRequirements(jdText);
  return {
    source: 'real',
    deliveryDecision: '可以作为尝试方向',
    deliveryReason: '基础版只做保守判断：当前材料能覆盖部分执行、整理或协作要求，但关键细节仍需要用户补充核实。',
    strongestEvidence: `已有可引用证据：${assetAt(assets, 0).title}。`,
    mainGap: '岗位要求中的结果、规模、工具熟练度或行业经验，如未在已确认材料中出现，应标注为当前证据不足。',
    nextStepAdvice: '可以作为尝试方向，但建议先优化简历表达，并补充能被追问的事实细节。',
    matrix: requirements.map((requirement, index) => {
      const asset = assetAt(assets, index);
      return {
        requirement,
        matchLevel: asset.content ? '需要补充证据' : '当前证据不足',
        evidence: `${asset.title}：${asset.content}`,
        gap: '需要核实本人分工、对象、周期、工具和可展示交付物。',
        resumeWriting: `可保守写为：参与${asset.title}，围绕该要求完成相关支持工作。`,
        interviewRisk: '如被追问结果或规模，只回答已确认事实，不补编数字。'
      };
    })
  };
}

function extractRequirements(jdText: string): string[] {
  const defaults = ['执行与协作能力', '信息整理能力', '沟通反馈能力'];
  const parts = jdText
    .split(/[。；;\n,.，]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .slice(0, 3);
  return parts.length >= 3 ? parts : defaults;
}

function buildInterviews(assets: ConfirmedAsset[]): InterviewPrep[] {
  const questions = [
    ['请介绍一段和岗位要求最相关的经历。', 'HR 可能用它确认经历是否真实、分工是否清楚。'],
    ['这段经历中你具体做了哪些动作？', 'HR 可能用它判断你是否真的参与过过程。'],
    ['你当时服务或协作的对象是谁？', 'HR 可能用它确认沟通场景和岗位相关性。'],
    ['这段经历有什么可展示的材料或交付物？', 'HR 可能用它判断材料是否能支撑简历表达。'],
    ['如果重新做一次，你会先改进哪一步？', 'HR 可能用它观察复盘意识和边界感。']
  ];

  return questions.map(([question, whyAsk], index) => {
    const asset = assetAt(assets, index);
    return {
      question,
      whyAsk,
      answerAngle: '按背景、任务、本人动作、可核实结果或反思来组织，不需要套用完整模板。',
      concern: '避免把团队成果、模糊印象或未经核实的数据说成个人确定成果。',
      sampleAnswer: `请按你的真实情况补充：我可以讲${asset.title}，其中我能确认的是……`,
      doNotExaggerate: '不编造数据、职级、独立职责、业务结果或录用承诺。'
    };
  });
}

function buildActionPlan(mode: Mode, assets: ConfirmedAsset[]): ActionPlanItem[] {
  const main = assetAt(assets, 0);
  const modeTarget = mode === 'jd' ? '目标岗位 JD' : '可探索岗位方向';
  return [
    action('7 天内', `整理${main.title}的事实清单。`, '先确保后续分析只使用真实经历。', '按任务、对象、工具、周期、本人动作、交付物六列填写。', '完成 1 份事实清单。', '为简历改写和面试回答提供证据。'),
    action('7 天内', mode === 'jd' ? '逐条标注目标岗位要求。' : '搜索 3 个真实岗位 JD。', '用真实岗位要求校验方向，不凭感觉判断。', `把每条要求和${modeTarget}中的关键词写成对照表。`, '完成 1 份岗位要求对照表。', '判断当前材料能证明什么、还缺什么。'),
    action('14 天内', '补充 2 段已确认经历的细节。', '让经历经得起 HR 追问。', '每段补齐对象、本人动作、工具和可展示材料。', '完成 2 段经历复盘。', '提升简历表达的可信度。'),
    action('14 天内', mode === 'jd' ? '针对证据不足要求补一个小材料。' : '为优先方向准备 1 个作品或过程材料。', '补足当前最影响判断的证据。', '选择表格、截图、链接或复盘说明，并标明本人边界。', '形成 1 个可展示材料。', '投递前减少空泛表达。'),
    action('30 天内', mode === 'jd' ? '完成 5 次小批量投递并记录反馈。' : '围绕 2 个方向各做 3 次验证。', '用真实反馈验证方向和简历表达。', '记录岗位名称、JD 关键词、简历版本和反馈。', '完成 1 份投递或验证记录表。', '判断下一轮优化重点。'),
    action('30 天内', '复盘简历与面试中被追问最多的问题。', '持续修正证据不足的部分。', '把高频问题归类为事实缺口、表达问题或岗位不匹配。', '完成 1 次月度复盘。', '为后续深度报告和投递策略提供材料。')
  ];
}

function action(period: string, what: string, why: string, how: string, completionStandard: string, jobSearchValue: string): ActionPlanItem {
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
    targetAbility: '经历证据整理与岗位验证'
  };
}

export function buildBasicReport(input: BasicReportInput): DiagnosisReport {
  const payload = isRecord(input) ? input : {};
  const mode = normalizeMode(payload.mode);
  const profile = normalizeProfile(payload.profile);
  const assets = confirmedAssets(payload.assets, profile);
  const jdText = readString(payload.jdText);
  const report: DiagnosisReport = {
    mode,
    source: 'real',
    isBasic: true,
    summary: `${BASIC_REPORT_NOTICE}\n\n本版本只做保守整理，优先保证不空、不乱、不假、可参考、能行动。`,
    highlights: buildHighlights(assets, mode),
    rewrites: buildRewrites(assets, mode),
    directionOptions: mode === 'inventory' ? buildDirections(assets) : undefined,
    jdFit: mode === 'jd' ? buildJdFit(assets, jdText) : undefined,
    interviews: mode === 'jd' ? buildInterviews(assets) : undefined,
    actionPlan: {
      source: 'real',
      plans: buildActionPlan(mode, assets),
      confidenceSummary: '基础版结论偏保守，适合作为先行动、再补充深度分析的起点。'
    },
    safetyNotes: [
      '本报告只使用用户已确认或明确填写的材料。',
      '所有结果、数字、职责边界和岗位匹配判断都需要用户按真实情况核实。'
    ],
    resumeText: buildRewrites(assets, mode).map((item) => item.directVersion),
    platformFields: [
      `求职方向：${profile.targetRole || (mode === 'jd' ? '目标岗位' : '待验证方向')}`,
      `可用经历：${assets.map((asset) => asset.title).slice(0, 3).join('、') || '已确认基础材料'}`
    ],
    previewLines: [
      profile.targetRole || (mode === 'jd' ? '目标岗位诊断' : '岗位方向探索'),
      [profile.education, profile.schoolName, profile.major].filter(Boolean).join(' / ') || '基础信息待补充',
      assetAt(assets, 0).title
    ]
  };

  return validateDiagnosisReport(report);
}
