import {
  type ActionPlanReport,
  type AssetCard,
  type AssetKind,
  type DiagnosisReport,
  type DigQuestionSet,
  type EvidenceMatrixRow,
  type HiddenHighlight,
  type InterviewPrep,
  type JdFitReport,
  type Profile,
  type ReportGenerationTask,
  type ResumeRewrite,
  type Stage,
  type StructuredResume,
  type V07JobRoute,
  type V07ApplicationRecord,
  type AiStatus,
  assetTitles,
  diggableAssetIds,
  emptyFieldStatuses,
  emptyProfile
} from '../types';

export class ReportTaskError extends Error {
  task: ReportGenerationTask;

  constructor(task: ReportGenerationTask) {
    super(task.message || '报告生成任务暂停。');
    this.name = 'ReportTaskError';
    this.task = task;
  }
}

const BETA_ACCESS_STORAGE_KEY = 'job-map-v0.3-beta-access';

export interface AiCareerService {
  readonly source: 'real' | 'demo';
  getStatus(): Promise<AiStatus>;
  structureResumeText(resumeText: string, currentProfile: Profile): Promise<StructuredResume>;
  generateDigQuestions(input: {
    profile: Profile;
    asset: AssetCard;
    jdText: string;
    previousAnswers: string[];
  }): Promise<DigQuestionSet>;
  analyzeJdFit(input: { stage: Stage; profile: Profile; assets: AssetCard[]; jdText: string }): Promise<JdFitReport>;
  rewriteResumeBullets(input: { profile: Profile; assets: AssetCard[]; jdText: string }): Promise<ResumeRewrite[]>;
  generateInterviewPrep(input: {
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    rewrites: ResumeRewrite[];
  }): Promise<InterviewPrep[]>;
  generateActionPlan(input: {
    stage: Stage;
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    jdFit?: JdFitReport;
  }): Promise<ActionPlanReport>;
  generateReport(input: {
    mode: 'inventory' | 'jd';
    route?: V07JobRoute | null;
    stage: Stage;
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    applicationRecords?: V07ApplicationRecord[];
    jdFit?: JdFitReport;
    reportTask?: ReportGenerationTask | null;
  }): Promise<DiagnosisReport>;
}

function readStoredBetaAccessCode() {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BETA_ACCESS_STORAGE_KEY) || '{}') as { betaAccessCode?: unknown };
    return typeof parsed.betaAccessCode === 'string' ? parsed.betaAccessCode : '';
  } catch {
    return '';
  }
}

function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
}

function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function getAiConfigMessage(status?: AiStatus | null, error?: string) {
  if (error) {
    return '当前 AI 连接暂时不可用，可以稍后再试或联系测试负责人。';
  }
  if (status?.configured) {
    return '已连接真实 AI。';
  }
  if (status && !status.configured) {
    return '当前为演示模式：真实 AI 暂未连接。当前仅展示明确标注的演示结果。';
  }
  return '正在检查 AI 连接状态。当前仅展示明确标注的演示结果。';
}

function clean(value: string) {
  return value.trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function snippet(value: string, max = 42) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function evidenceText(profile: Profile, assets: AssetCard[]) {
  return `${profile.targetRole} ${profile.internship} ${profile.project} ${profile.campus} ${profile.partTime} ${profile.skills} ${assets
    .map((asset) => `${asset.content} ${asset.notes.join(' ')}`)
    .join(' ')}`;
}

function inferSchoolBackground(schoolName: string) {
  if (!schoolName) {
    return '';
  }
  if (/985|211|双一流/.test(schoolName)) {
    return '学校背景参考：211/双一流相关背景。该信息只用于判断岗位竞争环境，不代表个人能力评价。';
  }
  return '学校背景参考：普通本科。该信息只用于判断岗位竞争环境，不代表个人能力评价。';
}

export function createAssetCardsFromProfile(profile: Profile, source: 'real' | 'demo' = 'demo'): AssetCard[] {
  const educationParts = [
    profile.education || '学历待确认',
    profile.schoolName || '学校名称待确认',
    profile.major || '专业待确认',
    profile.graduation || '毕业时间待确认',
    profile.city ? `意向城市：${profile.city}` : '',
    profile.targetRole ? `目标方向：${profile.targetRole}` : ''
  ].filter(Boolean);

  const contents: Record<AssetKind, string> = {
    education: educationParts.join(' / '),
    internship: clean(profile.internship),
    project: clean(profile.project),
    campus: clean(profile.campus),
    partTime: clean(profile.partTime),
    awards: clean(profile.awards),
    skills: clean(profile.skills),
    portfolio: clean(profile.portfolio)
  };

  return (Object.keys(contents) as AssetKind[]).map((id) => {
    const content = contents[id];
    const isGap = id !== 'education' && !content;
    return {
      id,
      title: assetTitles[id],
      content: isGap ? '' : content,
      status: content ? '待确认' : '暂未填写',
      confirmed: false,
      source,
      isGap,
      sourceDescription: content ? '来自用户粘贴的简历文本、基础信息或经历材料。' : '当前未识别到对应经历，可稍后补充真实材料。',
      gapAdvice: isGap
        ? `目前没有识别到这段经历。没关系，后续不会强行追问这一项。如果目标岗位看重这类经历，可以后续补充。`
        : undefined,
      notes: []
    };
  });
}

function inferProfileFromResumeText(resumeText: string, currentProfile: Profile) {
  const text = resumeText.replace(/\s+/g, ' ');
  const next: Profile = { ...currentProfile };
  const status = { ...emptyFieldStatuses };

  const inferred: Partial<Profile> = {
    education: includesAny(text, ['本科']) ? '本科' : firstMatch(text, [/学历[:：]?\s*([^。；\n]+)/]),
    schoolName: firstMatch(text, [/([\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:大学|学院))/]),
    major: firstMatch(text, [/([\u4e00-\u9fa5A-Za-z]{2,18}(?:专业|营销|计算机|会计|金融|英语|设计|管理))/]),
    graduation: firstMatch(text, [/((?:20\d{2})\s*届|(?:20\d{2})\s*年\s*\d{0,2}\s*月?)/]),
    targetRole: firstMatch(text, [/目标(?:岗位|方向)?[:：]?\s*([^。；，,\n]+)/, /(用户运营|内容运营|新媒体运营|前端实习|产品助理|行政助理)/]),
    internship: firstMatch(text, [/([^。；\n]*(?:实习|运营实习)[^。；\n]*)/]),
    project: firstMatch(text, [/([^。；\n]*(?:项目|调研|作品|课程)[^。；\n]*)/]),
    campus: firstMatch(text, [/([^。；\n]*(?:社团|学生会|校园|活动组织)[^。；\n]*)/]),
    partTime: firstMatch(text, [/([^。；\n]*(?:兼职|家教|门店|销售)[^。；\n]*)/]),
    awards: firstMatch(text, [/([^。；\n]*(?:证书|奖学金|获奖|竞赛)[^。；\n]*)/]),
    skills: firstMatch(text, [/技能[:：]?\s*([^。；\n]+)/]),
    portfolio: firstMatch(text, [/((?:https?:\/\/|www\.)[^\s，。；]+)/])
  };

  for (const key of Object.keys(inferred) as (keyof Profile)[]) {
    if (inferred[key]) {
      next[key] = inferred[key] || '';
      status[key] = 'AI 已识别';
    } else if (next[key]) {
      status[key] = '待用户确认';
    }
  }

  return { profile: next, fieldStatuses: status };
}

function buildRequirements(jdText: string, targetRole: string) {
  const text = `${jdText} ${targetRole}`;
  const requirements = [
    includesAny(text, ['社群', '用户']) ? '用户运营、社群维护、用户反馈整理' : '',
    includesAny(text, ['活动', '执行']) ? '活动执行与流程推进' : '',
    includesAny(text, ['内容', '文案', '公众号', '新媒体']) ? '内容编辑与触达表达' : '',
    includesAny(text, ['数据', 'Excel', 'excel', '复盘']) ? 'Excel 数据整理与复盘意识' : '',
    includesAny(text, ['沟通', '协调']) ? '沟通协调与跨角色协作' : ''
  ].filter(Boolean);

  return requirements.length ? requirements : ['目标岗位任务理解', '稳定执行与复盘表达'];
}

function buildEvidenceMatrix(profile: Profile, assets: AssetCard[], jdText: string): EvidenceMatrixRow[] {
  const evidence = evidenceText(profile, assets);
  return buildRequirements(jdText, profile.targetRole).map((requirement) => {
    const isUser = requirement.includes('用户') || requirement.includes('社群');
    const isData = requirement.includes('Excel') || requirement.includes('数据');
    const isContent = requirement.includes('内容');
    const matchedAsset =
      isUser && includesAny(evidence, ['社群', '用户', '维护'])
        ? '教育机构新媒体运营实习中维护学生社群、配合活动提醒。'
        : isData && includesAny(evidence, ['Excel', 'excel', '问卷', '数据', '整理'])
          ? '校园调研项目中设计问卷并使用 Excel 整理结果。'
          : isContent && includesAny(evidence, ['公众号', '推文', '内容', '剪映'])
            ? '实习中整理公众号推文素材，有内容触达相关任务。'
            : '已有课程项目、校园实践或实习材料，可转译为执行和信息整理证据。';

    return {
      requirement,
      matchLevel:
        (isUser && includesAny(evidence, ['社群', '用户', '维护'])) ||
        (isData && includesAny(evidence, ['Excel', 'excel', '问卷', '数据', '整理'])) ||
        (isContent && includesAny(evidence, ['公众号', '推文', '内容', '剪映']))
          ? '有一定匹配'
          : '需要补充证据',
      evidence: matchedAsset,
      gap: isData
        ? '目前缺少可核验的指标变化或复盘结论，需要补数据来源和分析过程。'
        : '经历中任务存在，但规模、频次或结果还需要用户确认后再写。',
      resumeWriting: isUser
        ? '可写为“协助维护学生社群，整理活动提醒和内容素材，支持用户触达与反馈收集”。'
        : isData
          ? '可写为“设计并整理问卷数据，使用 Excel 完成基础归类和展示汇报”。'
          : '可写为“参与内容整理、流程推进和信息同步，支持项目按期完成”。',
      interviewRisk: '面试可能追问具体人数、周期、产出和你本人承担的部分，不能把参与写成独立负责。'
    };
  });
}

function buildRewrites(profile: Profile, assets: AssetCard[]): ResumeRewrite[] {
  const internship = assets.find((asset) => asset.id === 'internship' && !asset.isGap);
  const project = assets.find((asset) => asset.id === 'project' && !asset.isGap);
  const skills = assets.find((asset) => asset.id === 'skills' && !asset.isGap);
  const rewrites: ResumeRewrite[] = [];

  if (internship) {
    rewrites.push({
      relatedExperience: '教育机构新媒体运营实习',
      originalIssue: '原表达可能只写“实习”或零散任务，缺少对象、动作和本人边界。',
      capability: '社群维护、内容整理、用户反馈收集',
      directVersion: '协助完成教育机构新媒体运营支持工作，维护学生社群并整理公众号推文素材，配合活动提醒和用户反馈收集。',
      versionAfterSupplement: '补充社群数量、推文频率、活动提醒周期和反馈记录后，可进一步写清楚真实参与范围。',
      usageReminder: '如写人数、频次、效果，必须来自真实记录或能在面试中解释清楚。',
      original: internship.content,
      optimized: '协助完成教育机构新媒体运营支持工作，维护学生社群并整理公众号推文素材，配合活动提醒和用户反馈收集。',
      reason: '把“做过实习”拆成社群维护、内容整理、活动触达，岗位语言更清楚。',
      jdRequirement: '社群维护、内容编辑、用户反馈整理',
      risk: '如写人数、频次、效果，必须来自真实记录或能在面试中解释清楚。',
      interviewProbe: '面试官可能追问社群规模、推文频次、你和老师/同事的分工。'
    });
  }

  if (project) {
    rewrites.push({
      relatedExperience: '校园二手交易调研项目',
      originalIssue: '原表达容易停留在“做过项目”，没有说明调研动作、工具和交付物。',
      capability: '调研执行、Excel 数据整理、展示汇报',
      directVersion: '参与校园二手交易调研项目，完成问卷设计、Excel 结果整理和课堂展示，沉淀用户需求与交易痛点观察。',
      versionAfterSupplement: '补充样本量、问卷维度、Excel 处理方式和展示结论后，可进一步说明项目产出。',
      usageReminder: '不能把课程作业写成真实商业项目；样本量和结论需要按真实情况说明。',
      original: project.content,
      optimized: '参与校园二手交易调研项目，完成问卷设计、Excel 结果整理和课堂展示，沉淀用户需求与交易痛点观察。',
      reason: '课程项目不包装成企业项目，而是强调调研、数据整理和表达产出。',
      jdRequirement: '数据整理、用户需求理解、复盘表达',
      risk: '不能把课程作业写成真实商业项目；样本量和结论需要按真实情况说明。',
      interviewProbe: '可能被问问卷样本量、问题设计思路、你从数据里看到什么。'
    });
  }

  if (skills) {
    rewrites.push({
      relatedExperience: '技能与工具材料',
      originalIssue: '工具能力如果只罗列名称，岗位方难以判断能支持什么真实任务。',
      capability: '基础内容整理、数据归类、运营素材制作',
      directVersion: `掌握 ${skills.content}，可支持基础内容整理、数据归类和运营素材制作。`,
      versionAfterSupplement: '补充作品链接、截图、表格样例或使用场景后，可写成更具体的工具应用经历。',
      usageReminder: '只写自己实际用过、能解释过程的工具，不把入门能力写成精通。',
      original: skills.content,
      optimized: `掌握 ${skills.content}，可支持基础内容整理、数据归类和运营素材制作。`,
      reason: '把工具清单改成能支持岗位任务的能力说明。',
      jdRequirement: 'Excel、内容编辑、基础执行',
      risk: '只写自己能熟练完成的工具任务，不把入门能力写成精通。',
      interviewProbe: '可能被要求现场说明 Excel 或内容工具的具体使用场景。'
    });
  }

  while (rewrites.length < 3) {
    rewrites.push({
      relatedExperience: '待补充真实经历',
      originalIssue: '当前材料不足，不能直接生成看似完整但无法核实的经历。',
      capability: '真实岗位证据整理',
      directVersion: '可先补充一段真实项目或实践，再将任务、工具、产出按岗位要求改写。',
      versionAfterSupplement: '补充真实对象、周期、本人动作、工具和交付物后，再形成可投递的简历 bullet。',
      usageReminder: '不要为了简历好看虚构公司、岗位、证书、时间或项目结果。',
      original: profile.targetRole || '目标岗位相关经历待补充',
      optimized: '可先补充一段真实项目或实践，再将任务、工具、产出按岗位要求改写。',
      reason: '当前材料不足时，先标记缺口，不用编造经历。',
      jdRequirement: '真实岗位证据',
      risk: '不要为了简历好看虚构公司、岗位、证书、时间或项目结果。',
      interviewProbe: '面试官会追问经历来源和真实产出，无法解释的内容不建议写入。'
    });
  }

  return rewrites;
}

function buildHighlights(profile: Profile, assets: AssetCard[], matrix: EvidenceMatrixRow[]): HiddenHighlight[] {
  const evidence = evidenceText(profile, assets);
  const highlights: HiddenHighlight[] = [
    {
      sourceExperience: includesAny(evidence, ['社群', '公众号']) ? '教育机构新媒体运营实习' : '已有实习或项目经历',
      capability: '把用户触达、内容整理和执行跟进串起来的基础运营能力',
      jdRequirement: matrix[0]?.requirement || '目标岗位执行要求',
      whyNotFlattery: '这不是硬夸，因为它来自具体任务：社群维护、推文素材整理或活动提醒，而不是抽象评价。',
      professionalExpression: '可表达为“协助完成社群维护、内容素材整理和用户触达支持”。'
    },
    {
      sourceExperience: includesAny(evidence, ['问卷', 'Excel', '调研']) ? '校园二手交易调研项目' : '课程项目或校园经历',
      capability: '基础调研、信息整理和展示汇报能力',
      jdRequirement: matrix.find((item) => item.requirement.includes('数据'))?.requirement || '复盘与信息整理要求',
      whyNotFlattery: '它有明确产出：问卷、Excel 整理或展示汇报；只要不虚构样本量，就可以作为岗位证据。',
      professionalExpression: '可表达为“参与调研问题设计与数据归类，形成展示汇报和需求观察”。'
    }
  ];

  return highlights;
}

function buildInterviews(profile: Profile, rewrites: ResumeRewrite[]): InterviewPrep[] {
  const target = profile.targetRole || '目标岗位';
  const base = rewrites[0]?.optimized || '你提到的这段经历';
  return [
    {
      question: '你在社群维护中具体做了哪些动作？',
      whyAsk: '面试官想判断你是旁观参与，还是实际承担了可复现的运营任务。',
      answerAngle: '按对象、频次、工具、反馈四点回答。',
      concern: '你本人承担的任务边界，以及是否理解用户触达。',
      sampleAnswer: `我主要协助维护学生社群，整理活动提醒和内容素材。可以说明社群数量、每周动作和反馈来源，突出与${target}的关联。`,
      doNotExaggerate: '不要把“协助维护”说成独立负责增长，也不要编造转化数据。'
    },
    {
      question: '公众号推文素材是你原创、整理，还是排版发布？',
      whyAsk: '面试官会核实内容能力的真实深度。',
      answerAngle: '说明素材来源、自己负责的环节、使用工具和审核流程。',
      concern: '内容编辑能力和责任边界。',
      sampleAnswer: '我负责整理素材和排版支持，具体选题和发布通常需要老师确认，因此我会把自己的职责说清楚。',
      doNotExaggerate: '不要把素材整理写成独立策划完整内容账号。'
    },
    {
      question: '校园调研项目的问卷是怎么设计的？样本量是多少？',
      whyAsk: '面试官想判断数据意识是否真实。',
      answerAngle: '讲清调研目标、问题设计、样本来源、Excel 整理方式。',
      concern: '数据来源、分析方法和结论是否站得住。',
      sampleAnswer: '可以按“想了解校园二手交易痛点-设计问题-整理 Excel-形成展示”回答，样本量按真实数字说。',
      doNotExaggerate: '不知道样本量就说待核实，不要临场编数字。'
    },
    {
      question: '如果让你做一次用户反馈整理，你会怎么开始？',
      whyAsk: '这是把经历迁移到岗位任务的能力测试。',
      answerAngle: '先收集渠道，再分类标签，最后整理高频问题和可行动建议。',
      concern: '结构化思考和落地能力。',
      sampleAnswer: '我会先把反馈按渠道和问题类型记录到表格，再整理高频问题，输出可优先处理的清单。',
      doNotExaggerate: '不要说自己能独立负责完整用户增长，只说能完成基础整理和跟进。'
    },
    {
      question: '你这段经历最大的不足是什么？你准备怎么补？',
      whyAsk: '面试官看自我认知和补强行动。',
      answerAngle: '承认结果数据不足，再给出具体补强计划。',
      concern: '是否诚实、是否能持续学习。',
      sampleAnswer: `我目前更强的是执行和整理，短板是量化复盘。我准备用一个${target}相关小项目补数据分析和复盘产出。`,
      doNotExaggerate: '不要把短板包装成“太追求完美”，直接说事实和行动。'
    }
  ].map((item) => ({ ...item, sampleAnswer: item.sampleAnswer.replace(base, base) }));
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

function buildActionPlan(stage: Stage, profile: Profile, jdFit?: JdFitReport): ActionPlanReport {
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
        `围绕${target}搜索 3 个真实岗位，记录岗位要求关键词。`,
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
        jdFit?.deliveryDecision === '建议优先投递'
          ? '小批量投递 15-20 个岗位，记录岗位要求、投递版本、反馈和面试问题。'
          : '优先补一段与岗位相关的校内项目、短期实践或作品集，再小批量试投要求较贴近的岗位。',
        '用真实反馈验证当前简历版本和岗位方向。',
        '每次记录岗位名称、岗位关键词、投递版本、反馈结果和下一步修改点。',
        '完成 1 份岗位池表格和简历版本记录。',
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
    confidenceSummary: `事实型总结：你目前不是完全没有竞争力，而是已有的${profile.internship ? '实习' : '项目'}和课程/校园经历还没有被转译成岗位语言。当前最能使用的筹码是执行、信息整理和内容/社群相关任务；最需要补的短板是可核验的数据结果和复盘表达。下一步最值得做的是先补一个可展示的小项目，再把真实经历改写成能被面试追问解释清楚的版本。`
  };
}

export function buildDiagnosisReport(input: {
  mode?: 'inventory' | 'jd';
  source: 'real' | 'demo';
  stage: Stage;
  profile: Profile;
  assets: AssetCard[];
  jdFit?: JdFitReport;
  rewrites: ResumeRewrite[];
  interviews: InterviewPrep[];
  actionPlan: ActionPlanReport;
}): DiagnosisReport {
  const { source, profile, jdFit, rewrites, interviews, actionPlan, assets } = input;
  const fallbackMatrix = buildEvidenceMatrix(profile, assets, profile.targetRole);
  const highlights = buildHighlights(profile, assets, jdFit?.matrix || fallbackMatrix);
  const resumeText = [
    `求职意向：${profile.targetRole || '待补充'}`,
    `教育背景：${[profile.education, profile.schoolName, profile.major, profile.graduation].filter(Boolean).join(' / ') || '待补充'}`,
    `个人优势：${highlights[0].professionalExpression}；${highlights[1].professionalExpression}`,
    `经历改写：${rewrites.map((item) => item.optimized).join('；')}`,
    `技能作品：${profile.skills || '建议补充与目标岗位相关的工具、作品或项目链接'}`
  ];
  const platformFields = [
    `个人优势：${highlights.map((item) => item.professionalExpression).join('；')}`,
    `教育经历：${[profile.education, profile.schoolName, profile.major, profile.graduation].filter(Boolean).join(' / ') || '待补充'}`,
    `项目经历：${rewrites.find((item) => item.original.includes('项目') || item.optimized.includes('项目'))?.optimized || '待补充真实项目'}`,
    `实习经历：${rewrites.find((item) => item.original.includes('实习') || item.optimized.includes('实习'))?.optimized || '待补充真实实习'}`,
    `技能证书：${profile.skills || '待补充'}`,
    `求职意向：${profile.targetRole || '待补充'}，意向城市：${profile.city || '可协商'}`
  ];

  return {
    mode: input.mode || 'jd',
    source,
    summary: '基于已确认真实经历生成，重点帮助你看清经历筹码、表达方式和下一步补强路径。',
    highlights,
    rewrites,
    jdFit,
    interviews,
    actionPlan,
    safetyNotes: ['只基于真实经历表达；缺少依据的信息标注待核实；不编造数据、公司、时间或结果。'],
    resumeText,
    platformFields,
    previewLines: [profile.targetRole || '求职意向待补充', resumeText[1], rewrites[0]?.optimized || '', rewrites[1]?.optimized || '']
  };
}

class DemoCareerService implements AiCareerService {
  readonly source: 'real' | 'demo' = 'demo';

  async getStatus(): Promise<AiStatus> {
    return {
      configured: false,
      mode: 'demo',
      message: '当前为演示模式，请在服务端 .env 中配置 OPENAI_API_KEY'
    };
  }

  async structureResumeText(resumeText: string, currentProfile: Profile): Promise<StructuredResume> {
    const inferred = inferProfileFromResumeText(resumeText, currentProfile);
    return {
      ...inferred,
      assets: createAssetCardsFromProfile(inferred.profile, 'demo'),
      source: 'demo'
    };
  }

  async generateDigQuestions(input: {
    profile: Profile;
    asset: AssetCard;
    jdText: string;
    previousAnswers: string[];
  }): Promise<DigQuestionSet> {
    const target = input.profile.targetRole || '目标岗位';
    const content = snippet(input.asset.content || input.asset.gapAdvice || input.asset.title);
    const jdHint = input.jdText.trim() ? `岗位要求里提到“${snippet(input.jdText, 36)}”，` : '';
    const userVisibleQuestions = [
      `${jdHint}结合你想探索的${target}，你这段${input.asset.title}里提到“${content}”，你自己实际完成的动作是哪 1-2 个？`,
      `${jdHint}这段经历有没有可核实的规模、频次、工具或交付物，例如人数、社群数量、每周次数、作品链接、表格或内容成品？`,
      `${jdHint}如果面试时围绕这个岗位要求追问，你能想到一个真实问题和你的处理方式吗？`
    ];

    return {
      assetId: input.asset.id,
      source: 'demo',
      userVisibleQuestions,
      internalMetadata: [
        { questionId: 'q_1', relatedAssetId: input.asset.id, relatedJdRequirementId: input.jdText.trim() ? 'req_1' : undefined, method: 'hr', factDimensions: ['action'], internalWhy: '确认本人分工' },
        { questionId: 'q_2', relatedAssetId: input.asset.id, relatedJdRequirementId: input.jdText.trim() ? 'req_1' : undefined, method: 'tar', factDimensions: ['task', 'scale', 'tool', 'result'], internalWhy: `补齐${target}相关的事实证据` },
        { questionId: 'q_3', relatedAssetId: input.asset.id, relatedJdRequirementId: input.jdText.trim() ? 'req_1' : undefined, method: 'part', factDimensions: ['reflection', 'risk'], internalWhy: '准备面试解释边界' }
      ],
      encouragement: '这一步只是在帮你回忆真实细节，不需要写得很完整。'
    };
  }

  async analyzeJdFit(input: { stage: Stage; profile: Profile; assets: AssetCard[]; jdText: string }): Promise<JdFitReport> {
    const matrix = buildEvidenceMatrix(input.profile, input.assets, input.jdText);
    const source = evidenceText(input.profile, input.assets);
    const hasInternship = Boolean(clean(input.profile.internship));
    const hasProject = Boolean(clean(input.profile.project));
    const hasData = includesAny(source, ['Excel', 'excel', '数据', '问卷']);
    const deliveryDecision: JdFitReport['deliveryDecision'] =
      hasInternship && hasProject && hasData
        ? '可以投递，建议先优化简历'
        : hasProject
          ? '可以作为尝试方向'
          : '建议先补强后再重点投递';

    return {
      source: 'demo',
      deliveryDecision,
      deliveryReason: '已有经历能对上部分岗位要求，但结果数据和岗位深度仍需要补强。',
      strongestEvidence: hasInternship ? '已有社群/内容相关实践，可以转译成基础运营证据。' : '已有课程项目和学习材料，可作为第一段可解释经历。',
      mainGap: hasData ? '缺少可核验的结果指标。' : '缺少数据整理、复盘或真实业务反馈。',
      nextStepAdvice: '建议先投要求偏执行、助理、实习的岗位，并在简历里突出真实任务边界，不写无法解释的数据。',
      matrix
    };
  }

  async rewriteResumeBullets(input: { profile: Profile; assets: AssetCard[]; jdText: string }): Promise<ResumeRewrite[]> {
    return buildRewrites(input.profile, input.assets);
  }

  async generateInterviewPrep(input: {
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    rewrites: ResumeRewrite[];
  }): Promise<InterviewPrep[]> {
    return buildInterviews(input.profile, input.rewrites);
  }

  async generateActionPlan(input: {
    stage: Stage;
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    jdFit?: JdFitReport;
  }): Promise<ActionPlanReport> {
    return buildActionPlan(input.stage, input.profile, input.jdFit);
  }

  async generateReport(input: {
    mode: 'inventory' | 'jd';
    route?: V07JobRoute | null;
    stage: Stage;
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    applicationRecords?: V07ApplicationRecord[];
    jdFit?: JdFitReport;
    reportTask?: ReportGenerationTask | null;
  }): Promise<DiagnosisReport> {
    const jdFit = input.jdFit || (await this.analyzeJdFit(input));
    const rewrites = await this.rewriteResumeBullets(input);
    const interviews = await this.generateInterviewPrep({ ...input, rewrites });
    const actionPlan = await this.generateActionPlan({ ...input, jdFit });
    return buildDiagnosisReport({
      mode: input.mode,
      source: 'demo',
      stage: input.stage,
      profile: input.profile,
      assets: input.assets,
      jdFit: input.mode === 'jd' ? jdFit : undefined,
      rewrites,
      interviews: input.mode === 'jd' ? interviews : [],
      actionPlan
    });
  }
}

async function requestJson<T>(path: string, payload?: unknown): Promise<T> {
  const payloadCode =
    payload && typeof payload === 'object' && !Array.isArray(payload) && 'betaAccessCode' in payload
      ? String((payload as { betaAccessCode?: unknown }).betaAccessCode || '')
      : '';
  const betaAccessCode = payloadCode || readStoredBetaAccessCode();
  const body =
    payload === undefined
      ? undefined
      : JSON.stringify({
          ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { payload }),
          betaAccessCode
        });
  const headers: Record<string, string> = betaAccessCode ? { 'x-beta-access-code': betaAccessCode } : {};
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(apiUrl(path), {
    method: payload === undefined ? 'GET' : 'POST',
    headers: Object.keys(headers).length ? headers : undefined,
    body
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error || body.message || '';
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `AI API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function verifyBetaAccessCode(betaAccessCode: string): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>('/api/beta/access', { betaAccessCode });
}

class BackendCareerService implements AiCareerService {
  readonly source = 'demo' as const;

  async getStatus(): Promise<AiStatus> {
    return requestJson<AiStatus>('/api/ai/status');
  }

  async structureResumeText(resumeText: string, currentProfile: Profile): Promise<StructuredResume> {
    return requestJson<StructuredResume>('/api/ai/structure-resume', { resumeText, currentProfile });
  }

  async generateDigQuestions(input: {
    profile: Profile;
    asset: AssetCard;
    jdText: string;
    previousAnswers: string[];
  }): Promise<DigQuestionSet> {
    return requestJson<DigQuestionSet>('/api/ai/dig-questions', input);
  }

  async analyzeJdFit(input: { stage: Stage; profile: Profile; assets: AssetCard[]; jdText: string }): Promise<JdFitReport> {
    return requestJson<JdFitReport>('/api/ai/jd-fit', input);
  }

  async rewriteResumeBullets(input: { profile: Profile; assets: AssetCard[]; jdText: string }): Promise<ResumeRewrite[]> {
    const report = await this.generateReport({
      mode: 'jd',
      stage: 'senior',
      profile: input.profile,
      assets: input.assets,
      jdText: input.jdText,
      jdFit: await this.analyzeJdFit({ stage: 'senior', ...input })
    });
    return report.rewrites;
  }

  async generateInterviewPrep(input: {
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    rewrites: ResumeRewrite[];
  }): Promise<InterviewPrep[]> {
    const report = await this.generateReport({
      mode: 'jd',
      stage: 'senior',
      profile: input.profile,
      assets: input.assets,
      jdText: input.jdText,
      jdFit: await this.analyzeJdFit({ stage: 'senior', profile: input.profile, assets: input.assets, jdText: input.jdText })
    });
    return report.interviews || [];
  }

  async generateActionPlan(input: {
    stage: Stage;
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    jdFit?: JdFitReport;
  }): Promise<ActionPlanReport> {
    const report = await this.generateReport({ mode: input.jdFit ? 'jd' : 'inventory', ...input });
    return report.actionPlan;
  }

  async generateReport(input: {
    mode: 'inventory' | 'jd';
    route?: V07JobRoute | null;
    stage: Stage;
    profile: Profile;
    assets: AssetCard[];
    jdText: string;
    applicationRecords?: V07ApplicationRecord[];
    jdFit?: JdFitReport;
    reportTask?: ReportGenerationTask | null;
  }): Promise<DiagnosisReport> {
    const result = await requestJson<DiagnosisReport | { reportTask: ReportGenerationTask }>('/api/ai/report', input);
    if ('reportTask' in result && !('source' in result)) {
      throw new ReportTaskError(result.reportTask);
    }
    return result as DiagnosisReport;
  }
}

export function getAiService(): AiCareerService {
  return new BackendCareerService();
}

export { inferSchoolBackground };
