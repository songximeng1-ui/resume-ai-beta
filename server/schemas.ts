import type {
  ActionPlanReport,
  AssetCard,
  DiagnosisReport,
  DigQuestionSet,
  DirectionOption,
  EvidenceMatrixRow,
  FieldStatus,
  HiddenHighlight,
  InterviewPrep,
  JdFitReport,
  JdSummary,
  Profile,
  ResumeRewrite,
  StructuredResume
} from '../src/types.ts';

const fieldStatuses = ['AI 已识别', '待用户确认', '用户已修改'] as const;
const verdicts = ['主投', '可冲', '过渡', '暂不建议主投'] as const;
const matchLevels = ['匹配较强', '有一定匹配', '需要补充证据', '当前证据不足'] as const;
const deliveryDecisions = ['建议优先投递', '可以投递，建议先优化简历', '可以作为尝试方向', '建议先补强后再重点投递'] as const;
const directionPriorities = ['优先探索', '可以尝试', '过渡方向', '先补证据'] as const;
const questionMethods = ['hr', 'tar', 'part', 'prep', 'custom'] as const;
const factDimensions = ['task', 'action', 'result', 'reflection', 'scale', 'tool', 'risk'] as const;
const reportModes = ['inventory', 'jd'] as const;
const internalQuestionMarkers = /TAR|PART|PREP|HR\s*视角|为什么问|事实回忆维度/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`);
  }
  return value;
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`);
  }
  return value;
}

function assertArray<T>(value: unknown, path: string, mapper: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value.map(mapper);
}

function assertNonEmptyArray<T>(value: unknown, path: string, mapper: (item: unknown, index: number) => T): T[] {
  const items = assertArray(value, path, mapper);
  if (items.length === 0) {
    throw new Error(`${path} must contain at least 1 item`);
  }
  return items;
}

function assertExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${path} must not contain unknown field ${key}`);
    }
  }
}

function assertSource(value: unknown, path: string): 'real' | 'demo' {
  if (value !== 'real' && value !== 'demo') {
    throw new Error(`${path} must be real or demo`);
  }
  return value;
}

function assertRealSource(value: unknown, path: string): 'real' {
  if (value !== 'real') {
    throw new Error(`${path} must be real`);
  }
  return value;
}

function normalizeProfile(value: unknown): Profile {
  if (!isRecord(value)) {
    throw new Error('profile must be an object');
  }
  return {
    education: String(value.education || ''),
    schoolName: String(value.schoolName || ''),
    major: String(value.major || ''),
    graduation: String(value.graduation || ''),
    city: String(value.city || ''),
    targetRole: String(value.targetRole || ''),
    internship: String(value.internship || ''),
    project: String(value.project || ''),
    campus: String(value.campus || ''),
    partTime: String(value.partTime || ''),
    awards: String(value.awards || ''),
    skills: String(value.skills || ''),
    portfolio: String(value.portfolio || '')
  };
}

function normalizeFieldStatuses(value: unknown): Record<keyof Profile, FieldStatus> {
  if (!isRecord(value)) {
    throw new Error('fieldStatuses must be an object');
  }
  const read = (key: keyof Profile): FieldStatus => {
    const candidate = value[key];
    return fieldStatuses.includes(candidate as FieldStatus) ? (candidate as FieldStatus) : '待用户确认';
  };
  return {
    education: read('education'),
    schoolName: read('schoolName'),
    major: read('major'),
    graduation: read('graduation'),
    city: read('city'),
    targetRole: read('targetRole'),
    internship: read('internship'),
    project: read('project'),
    campus: read('campus'),
    partTime: read('partTime'),
    awards: read('awards'),
    skills: read('skills'),
    portfolio: read('portfolio')
  };
}

function normalizeAsset(value: unknown, index: number): AssetCard {
  if (!isRecord(value)) {
    throw new Error(`assets.${index} must be an object`);
  }
  return {
    id: assertString(value.id, `assets.${index}.id`) as AssetCard['id'],
    title: assertString(value.title, `assets.${index}.title`),
    content: String(value.content || ''),
    status: String(value.status || '待用户确认') as AssetCard['status'],
    confirmed: Boolean(value.confirmed),
    source: assertSource(value.source || 'real', `assets.${index}.source`),
    isGap: Boolean(value.isGap),
    gapAdvice: value.gapAdvice ? String(value.gapAdvice) : undefined,
    notes: Array.isArray(value.notes) ? value.notes.map(String) : []
  };
}

export function validateStructuredResume(value: unknown): StructuredResume {
  if (!isRecord(value)) {
    throw new Error('StructuredResume must be an object');
  }
  return {
    source: assertSource(value.source || 'real', 'source'),
    profile: normalizeProfile(value.profile),
    fieldStatuses: normalizeFieldStatuses(value.fieldStatuses),
    assets: assertArray(value.assets, 'assets', normalizeAsset)
  };
}

export function validateDigQuestionSet(value: unknown): DigQuestionSet {
  if (!isRecord(value)) {
    throw new Error('DigQuestionSet must be an object');
  }
  const userVisibleQuestions = assertArray(value.userVisibleQuestions, 'userVisibleQuestions', (item) => assertString(item, 'userVisibleQuestions item')).slice(0, 3);
  if (userVisibleQuestions.length < 1) {
    throw new Error('userVisibleQuestions must contain 1-3 items');
  }
  if (userVisibleQuestions.some((question) => internalQuestionMarkers.test(question))) {
    throw new Error('userVisibleQuestions must not expose internal questioning methods or reasoning labels');
  }
  const internalMetadata = assertArray(value.internalMetadata, 'internalMetadata', (item, index) => {
    if (!isRecord(item)) throw new Error(`internalMetadata.${index} must be an object`);
    const method = assertString(item.method, `internalMetadata.${index}.method`) as DigQuestionSet['internalMetadata'][number]['method'];
    if (!questionMethods.includes(method)) {
      throw new Error(`internalMetadata.${index}.method must be hr, tar, part, prep, or custom`);
    }
    const dimensions = assertArray(item.factDimensions, `internalMetadata.${index}.factDimensions`, (dimension) =>
      assertString(dimension, `internalMetadata.${index}.factDimensions item`) as DigQuestionSet['internalMetadata'][number]['factDimensions'][number]
    );
    const invalidDimension = dimensions.find((dimension) => !factDimensions.includes(dimension));
    if (invalidDimension) {
      throw new Error(`internalMetadata.${index}.factDimensions contains invalid dimension`);
    }
    return {
      questionId: assertString(item.questionId, `internalMetadata.${index}.questionId`),
      relatedAssetId: assertString(item.relatedAssetId, `internalMetadata.${index}.relatedAssetId`) as DigQuestionSet['assetId'],
      relatedJdRequirementId: item.relatedJdRequirementId ? assertString(item.relatedJdRequirementId, `internalMetadata.${index}.relatedJdRequirementId`) : undefined,
      method,
      factDimensions: dimensions,
      internalWhy: assertString(item.internalWhy, `internalMetadata.${index}.internalWhy`)
    };
  });
  return {
    assetId: assertString(value.assetId, 'assetId') as DigQuestionSet['assetId'],
    source: assertSource(value.source || 'real', 'source'),
    userVisibleQuestions,
    internalMetadata,
    encouragement: assertString(value.encouragement, 'encouragement')
  };
}

function validateMatrixRow(value: unknown, index: number): EvidenceMatrixRow {
  if (!isRecord(value)) {
    throw new Error(`matrix.${index} must be an object`);
  }
  const fallbackMatchLevel = String(value.evidence || '').includes('当前证据不足') || String(value.gap || '').includes('缺少')
    ? '需要补充证据'
    : '有一定匹配';
  const matchLevel = String(value.matchLevel || fallbackMatchLevel) as EvidenceMatrixRow['matchLevel'];
  if (!matchLevels.includes(matchLevel)) {
    throw new Error(`matrix.${index}.matchLevel must be one of the V0.4 match levels`);
  }
  return {
    requirement: assertString(value.requirement, `matrix.${index}.requirement`),
    matchLevel,
    evidence: assertString(value.evidence, `matrix.${index}.evidence`),
    gap: assertString(value.gap, `matrix.${index}.gap`),
    resumeWriting: assertString(value.resumeWriting, `matrix.${index}.resumeWriting`),
    interviewRisk: assertString(value.interviewRisk, `matrix.${index}.interviewRisk`)
  };
}

function mapLegacyVerdict(value: unknown): JdFitReport['deliveryDecision'] | null {
  if (value === '主投') return '建议优先投递';
  if (value === '可冲') return '可以投递，建议先优化简历';
  if (value === '过渡') return '可以作为尝试方向';
  if (value === '暂不建议主投') return '建议先补强后再重点投递';
  return null;
}

export function validateJdFitReport(value: unknown): JdFitReport {
  if (!isRecord(value)) {
    throw new Error('JdFitReport must be an object');
  }
  const verdictCandidate = value.verdict;
  const legacyVerdict =
    typeof verdictCandidate === 'string' && verdicts.includes(verdictCandidate as (typeof verdicts)[number])
      ? (verdictCandidate as (typeof verdicts)[number])
      : undefined;
  const deliveryDecision = String(value.deliveryDecision || mapLegacyVerdict(value.verdict) || '') as JdFitReport['deliveryDecision'];
  if (!deliveryDecisions.includes(deliveryDecision)) {
    throw new Error('deliveryDecision must be one of the V0.4 delivery decisions');
  }
  return {
    source: assertSource(value.source || 'real', 'source'),
    deliveryDecision,
    deliveryReason: String(value.deliveryReason || value.basis || ''),
    strongestEvidence: String(value.strongestEvidence || value.maxAdvantage || ''),
    mainGap: String(value.mainGap || value.maxGap || ''),
    nextStepAdvice: String(value.nextStepAdvice || value.ifInsist || ''),
    matrix: assertArray(value.matrix, 'matrix', validateMatrixRow),
    verdict: legacyVerdict,
    basis: value.basis ? String(value.basis) : undefined,
    maxAdvantage: value.maxAdvantage ? String(value.maxAdvantage) : undefined,
    maxGap: value.maxGap ? String(value.maxGap) : undefined,
    ifInsist: value.ifInsist ? String(value.ifInsist) : undefined
  };
}

export function validateJdSummary(value: unknown): JdSummary {
  if (!isRecord(value)) {
    throw new Error('JdSummary must be an object');
  }
  return {
    source: assertSource(value.source || 'real', 'source'),
    role: assertString(value.role, 'role'),
    requirements: assertArray(value.requirements, 'requirements', (item) => assertString(item, 'requirement')).slice(0, 8),
    keywords: assertArray(value.keywords, 'keywords', (item) => assertString(item, 'keyword')).slice(0, 12),
    riskNotes: assertArray(value.riskNotes, 'riskNotes', (item) => assertString(item, 'riskNote')).slice(0, 6)
  };
}

function validateHighlight(value: unknown, index: number): HiddenHighlight {
  if (!isRecord(value)) throw new Error(`highlights.${index} must be an object`);
  return {
    sourceExperience: assertString(value.sourceExperience, `highlights.${index}.sourceExperience`),
    capability: assertString(value.capability, `highlights.${index}.capability`),
    jdRequirement: assertString(value.jdRequirement, `highlights.${index}.jdRequirement`),
    whyNotFlattery: assertString(value.whyNotFlattery, `highlights.${index}.whyNotFlattery`),
    professionalExpression: assertString(value.professionalExpression, `highlights.${index}.professionalExpression`)
  };
}

function validateRewrite(value: unknown, index: number): ResumeRewrite {
  if (!isRecord(value)) throw new Error(`rewrites.${index} must be an object`);
  const relatedExperience = assertString(value.relatedExperience, `rewrites.${index}.relatedExperience`);
  const originalIssue = assertString(value.originalIssue, `rewrites.${index}.originalIssue`);
  const capability = assertString(value.capability, `rewrites.${index}.capability`);
  const directVersion = assertString(value.directVersion, `rewrites.${index}.directVersion`);
  const versionAfterSupplement = assertString(value.versionAfterSupplement, `rewrites.${index}.versionAfterSupplement`);
  const usageReminder = assertString(value.usageReminder, `rewrites.${index}.usageReminder`);
  if (!relatedExperience.trim()) throw new Error(`rewrites.${index}.relatedExperience must be non-empty`);
  if (!originalIssue.trim()) throw new Error(`rewrites.${index}.originalIssue must be non-empty`);
  if (!capability.trim()) throw new Error(`rewrites.${index}.capability must be non-empty`);
  if (!directVersion.trim()) throw new Error(`rewrites.${index}.directVersion must be non-empty`);
  if (!versionAfterSupplement.trim()) throw new Error(`rewrites.${index}.versionAfterSupplement must be non-empty`);
  if (!usageReminder.trim()) throw new Error(`rewrites.${index}.usageReminder must be non-empty`);
  return {
    relatedExperience,
    originalIssue,
    capability,
    directVersion,
    versionAfterSupplement,
    usageReminder,
    original: assertString(value.original, `rewrites.${index}.original`),
    optimized: assertString(value.optimized, `rewrites.${index}.optimized`),
    reason: assertString(value.reason, `rewrites.${index}.reason`),
    jdRequirement: assertString(value.jdRequirement, `rewrites.${index}.jdRequirement`),
    risk: assertString(value.risk, `rewrites.${index}.risk`),
    interviewProbe: assertString(value.interviewProbe, `rewrites.${index}.interviewProbe`)
  };
}

function validateInterview(value: unknown, index: number): InterviewPrep {
  if (!isRecord(value)) throw new Error(`interviews.${index} must be an object`);
  return {
    question: assertString(value.question, `interviews.${index}.question`),
    whyAsk: assertString(value.whyAsk, `interviews.${index}.whyAsk`),
    answerAngle: assertString(value.answerAngle, `interviews.${index}.answerAngle`),
    concern: assertString(value.concern, `interviews.${index}.concern`),
    sampleAnswer: assertString(value.sampleAnswer, `interviews.${index}.sampleAnswer`),
    doNotExaggerate: assertString(value.doNotExaggerate, `interviews.${index}.doNotExaggerate`)
  };
}

function validateActionPlan(value: unknown): ActionPlanReport {
  if (!isRecord(value)) throw new Error('actionPlan must be an object');
  return {
    source: assertSource(value.source || 'real', 'actionPlan.source'),
    plans: assertArray(value.plans, 'actionPlan.plans', (item, index) => {
      if (!isRecord(item)) throw new Error(`actionPlan.plans.${index} must be an object`);
      const what = assertString(item.what, `actionPlan.plans.${index}.what`);
      const why = assertString(item.why, `actionPlan.plans.${index}.why`);
      const how = assertString(item.how, `actionPlan.plans.${index}.how`);
      const completionStandard = assertString(item.completionStandard, `actionPlan.plans.${index}.completionStandard`);
      const jobSearchValue = assertString(item.jobSearchValue, `actionPlan.plans.${index}.jobSearchValue`);
      if (!what.trim()) throw new Error(`actionPlan.plans.${index}.what must be non-empty`);
      if (!why.trim()) throw new Error(`actionPlan.plans.${index}.why must be non-empty`);
      if (!how.trim()) throw new Error(`actionPlan.plans.${index}.how must be non-empty`);
      if (!completionStandard.trim()) throw new Error(`actionPlan.plans.${index}.completionStandard must be non-empty`);
      if (!jobSearchValue.trim()) throw new Error(`actionPlan.plans.${index}.jobSearchValue must be non-empty`);
      return {
        period: assertString(item.period, `actionPlan.plans.${index}.period`),
        what,
        why,
        how,
        completionStandard,
        jobSearchValue,
        action: assertString(item.action, `actionPlan.plans.${index}.action`),
        deliverable: assertString(item.deliverable, `actionPlan.plans.${index}.deliverable`),
        resumeUsage: assertString(item.resumeUsage, `actionPlan.plans.${index}.resumeUsage`),
        targetAbility: assertString(item.targetAbility, `actionPlan.plans.${index}.targetAbility`)
      };
    }),
    confidenceSummary: assertString(value.confidenceSummary, 'actionPlan.confidenceSummary')
  };
}

function validateV04ActionPlanCoverage(actionPlan: ActionPlanReport): void {
  const requiredPeriods = ['7 天内', '14 天内', '30 天内'];
  const missingPeriods = requiredPeriods.filter((period) => actionPlan.plans.filter((plan) => plan.period === period).length < 2);
  if (missingPeriods.length > 0) {
    throw new Error('actionPlan must include at least 2 actions for each period: 7 天内, 14 天内, 30 天内');
  }
}

function validateDirectionOption(value: unknown, index: number): DirectionOption {
  if (!isRecord(value)) throw new Error(`directionOptions.${index} must be an object`);
  const level = assertString(value.level, `directionOptions.${index}.level`) as DirectionOption['level'];
  if (!directionPriorities.includes(level)) {
    throw new Error(`directionOptions.${index}.level must be one of the V0.4 exploration priorities`);
  }
  const priority = assertString(value.priority, `directionOptions.${index}.priority`) as DirectionOption['priority'];
  if (!directionPriorities.includes(priority)) {
    throw new Error(`directionOptions.${index}.priority must be one of the V0.4 exploration priorities`);
  }
  const searchableJobNames = assertArray(
    value.searchableJobNames,
    `directionOptions.${index}.searchableJobNames`,
    (item) => assertString(item, 'searchableJobNames item')
  );
  if (searchableJobNames.length < 3 || searchableJobNames.length > 5) {
    throw new Error(`directionOptions.${index}.searchableJobNames must contain 3-5 searchable job names`);
  }
  const keywords = assertArray(value.keywords, `directionOptions.${index}.keywords`, (item) => assertString(item, 'keyword'));
  return {
    directionName: assertString(value.directionName, `directionOptions.${index}.directionName`),
    name: assertString(value.name, `directionOptions.${index}.name`),
    level,
    priority,
    searchableJobNames,
    whyExplore: assertString(value.whyExplore, `directionOptions.${index}.whyExplore`),
    why: assertString(value.why, `directionOptions.${index}.why`),
    evidence: assertString(value.evidence, `directionOptions.${index}.evidence`),
    gap: assertString(value.gap, `directionOptions.${index}.gap`),
    sevenDayValidation: assertString(value.sevenDayValidation, `directionOptions.${index}.sevenDayValidation`),
    next: assertString(value.next, `directionOptions.${index}.next`),
    keywords
  };
}

export interface ReportHighlightsModule {
  source: 'real';
  highlights: HiddenHighlight[];
}

export interface ReportDirectionsModule {
  source: 'real';
  directionOptions: DirectionOption[];
}

export interface ReportRewritesModule {
  source: 'real';
  rewrites: ResumeRewrite[];
}

export interface ReportJdFitSummaryModule {
  source: 'real';
  jdFit: JdFitReport;
}

export interface ReportInterviewsModule {
  source: 'real';
  interviews: InterviewPrep[];
}

export interface ReportInterviewQuestionModule {
  source: 'real';
  interview: InterviewPrep;
}

export interface ReportActionPlanModule {
  source: 'real';
  summary: string;
  actionPlan: ActionPlanReport;
  safetyNotes: string[];
  resumeText: string[];
  platformFields: string[];
  previewLines: string[];
}

export interface KimiExtract {
  source: 'real';
  sourceSnippets: string[];
  verificationNotes: string[];
  structuredFields: Array<{
    field: string;
    value: string;
    sourceSnippet: string;
  }>;
}

export function validateReportHighlightsModule(value: unknown): ReportHighlightsModule {
  if (!isRecord(value)) throw new Error('ReportHighlightsModule must be an object');
  const highlights = assertArray(value.highlights, 'highlights', validateHighlight);
  if (highlights.length < 2) throw new Error('highlights must contain at least 2 items');
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    highlights
  };
}

export function validateReportDirectionsModule(value: unknown): ReportDirectionsModule {
  if (!isRecord(value)) throw new Error('ReportDirectionsModule must be an object');
  const directionOptions = assertArray(value.directionOptions, 'directionOptions', validateDirectionOption);
  if (directionOptions.length < 2 || directionOptions.length > 3) throw new Error('directionOptions must contain 2-3 items');
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    directionOptions
  };
}

export function validateReportRewritesModule(value: unknown): ReportRewritesModule {
  if (!isRecord(value)) throw new Error('ReportRewritesModule must be an object');
  const rewrites = assertArray(value.rewrites, 'rewrites', validateRewrite);
  if (rewrites.length < 3) throw new Error('rewrites must contain at least 3 items');
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    rewrites
  };
}

export function validateReportJdFitSummaryModule(value: unknown): ReportJdFitSummaryModule {
  if (!isRecord(value)) throw new Error('ReportJdFitSummaryModule must be an object');
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    jdFit: validateJdFitReport(value.jdFit)
  };
}

export function validateReportInterviewsModule(value: unknown): ReportInterviewsModule {
  if (!isRecord(value)) throw new Error('ReportInterviewsModule must be an object');
  const interviews = assertArray(value.interviews, 'interviews', validateInterview);
  if (interviews.length !== 5) throw new Error('interviews must contain exactly 5 items');
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    interviews
  };
}

export function validateReportInterviewQuestionModule(value: unknown): ReportInterviewQuestionModule {
  if (!isRecord(value)) throw new Error('ReportInterviewQuestionModule must be an object');
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    interview: validateInterview(value.interview, 0)
  };
}

export function validateReportActionPlanModule(value: unknown): ReportActionPlanModule {
  if (!isRecord(value)) throw new Error('ReportActionPlanModule must be an object');
  const actionPlan = validateActionPlan(value.actionPlan);
  validateV04ActionPlanCoverage(actionPlan);
  return {
    source: assertRealSource(value.source || 'real', 'source'),
    summary: assertString(value.summary || '', 'summary'),
    actionPlan,
    safetyNotes: value.safetyNotes ? assertArray(value.safetyNotes, 'safetyNotes', (item) => assertString(item, 'safetyNotes item')) : [],
    resumeText: assertArray(value.resumeText, 'resumeText', (item) => assertString(item, 'resumeText item')),
    platformFields: assertArray(value.platformFields, 'platformFields', (item) => assertString(item, 'platformFields item')),
    previewLines: assertArray(value.previewLines, 'previewLines', (item) => assertString(item, 'previewLines item'))
  };
}

const forbiddenKimiKeys = ['judgment', 'recommendation', 'rewrite', 'deliveryDecision', 'matchLevel', 'resumeWriting'] as const;
const kimiExtractKeys = ['source', 'sourceSnippets', 'verificationNotes', 'structuredFields'] as const;
const kimiStructuredFieldKeys = ['field', 'value', 'sourceSnippet'] as const;

export function validateKimiExtract(value: unknown): KimiExtract {
  if (!isRecord(value)) {
    throw new Error('KimiExtract must be an object');
  }
  const forbidden = forbiddenKimiKeys.find((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (forbidden) {
    throw new Error('Kimi extract must not contain judgment, recommendation, or rewrite fields');
  }
  assertExactKeys(value, kimiExtractKeys, 'KimiExtract');
  return {
    source: assertRealSource(value.source, 'source'),
    sourceSnippets: assertNonEmptyArray(value.sourceSnippets, 'sourceSnippets', (item) => assertString(item, 'sourceSnippet')),
    verificationNotes: assertArray(value.verificationNotes, 'verificationNotes', (item) => assertString(item, 'verificationNote')),
    structuredFields: assertNonEmptyArray(value.structuredFields, 'structuredFields', (item, index) => {
      if (!isRecord(item)) {
        throw new Error(`structuredFields.${index} must be an object`);
      }
      assertExactKeys(item, kimiStructuredFieldKeys, `structuredFields.${index}`);
      return {
        field: assertString(item.field, `structuredFields.${index}.field`),
        value: assertString(item.value, `structuredFields.${index}.value`),
        sourceSnippet: assertString(item.sourceSnippet, `structuredFields.${index}.sourceSnippet`)
      };
    })
  };
}

export function validateDiagnosisReport(value: unknown): DiagnosisReport {
  if (!isRecord(value)) {
    throw new Error('DiagnosisReport must be an object');
  }
  const mode: DiagnosisReport['mode'] = value.mode === 'inventory' || value.mode === 'jd' ? value.mode : 'jd';
  const highlights = assertArray(value.highlights, 'highlights', validateHighlight);
  const rewrites = assertArray(value.rewrites, 'rewrites', validateRewrite);
  const actionPlan = validateActionPlan(value.actionPlan);
  validateV04ActionPlanCoverage(actionPlan);
  const report: DiagnosisReport = {
    mode,
    source: assertSource(value.source || 'real', 'source'),
    isBasic: value.isBasic === true,
    summary: assertString(value.summary || '', 'summary'),
    highlights,
    rewrites,
    directionOptions: value.directionOptions ? assertArray(value.directionOptions, 'directionOptions', validateDirectionOption) : undefined,
    jdFit: value.jdFit ? validateJdFitReport(value.jdFit) : undefined,
    interviews: value.interviews ? assertArray(value.interviews, 'interviews', validateInterview) : undefined,
    actionPlan,
    safetyNotes: value.safetyNotes ? assertArray(value.safetyNotes, 'safetyNotes', (item) => assertString(item, 'safetyNotes item')) : [],
    resumeText: assertArray(value.resumeText, 'resumeText', (item) => assertString(item, 'resumeText item')),
    platformFields: assertArray(value.platformFields, 'platformFields', (item) => assertString(item, 'platformFields item')),
    previewLines: assertArray(value.previewLines, 'previewLines', (item) => assertString(item, 'previewLines item'))
  };
  if (mode === 'jd') {
    if (!report.jdFit) throw new Error('jdFit must be provided for jd mode');
    if (!report.interviews || report.interviews.length !== 5) throw new Error('report must include exactly 5 interview questions');
  }
  if (report.highlights.length < 2) throw new Error('report must include at least 2 highlights');
  if (report.rewrites.length < 2) throw new Error('report must include at least 2 rewrites');
  if (report.actionPlan.plans.length < 1) throw new Error('report must include at least 1 action plan');
  if (mode === 'inventory') {
    if (!report.directionOptions || report.directionOptions.length < 2) throw new Error('inventory report must include at least 2 directionOptions');
  }
  return report;
}

const stringSchema = { type: 'string' } as const;
const booleanSchema = { type: 'boolean' } as const;
const profileKeys = [
  'education',
  'schoolName',
  'major',
  'graduation',
  'city',
  'targetRole',
  'internship',
  'project',
  'campus',
  'partTime',
  'awards',
  'skills',
  'portfolio'
] as const;
const assetIds = ['education', 'internship', 'project', 'campus', 'partTime', 'awards', 'skills'] as const;
const profileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...profileKeys],
  properties: Object.fromEntries(profileKeys.map((key) => [key, stringSchema]))
};
const fieldStatusesSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...profileKeys],
  properties: Object.fromEntries(profileKeys.map((key) => [key, { enum: [...fieldStatuses] }]))
};
const assetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'content', 'status', 'confirmed', 'source', 'isGap', 'gapAdvice', 'notes'],
  properties: {
    id: { enum: [...assetIds] },
    title: stringSchema,
    content: stringSchema,
    status: { enum: ['已确认', '待用户确认', '用户已修改', '估算数据', '待核实', '不建议写入'] },
    confirmed: booleanSchema,
    source: { enum: ['real'] },
    isGap: booleanSchema,
    gapAdvice: stringSchema,
    notes: { type: 'array', items: stringSchema }
  }
};
const matrixRowSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requirement', 'matchLevel', 'evidence', 'gap', 'resumeWriting', 'interviewRisk'],
  properties: {
    requirement: stringSchema,
    matchLevel: { enum: [...matchLevels] },
    evidence: stringSchema,
    gap: stringSchema,
    resumeWriting: stringSchema,
    interviewRisk: stringSchema
  }
};

export const structuredResumeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'profile', 'fieldStatuses', 'assets'],
  properties: {
    source: { enum: ['real'] },
    profile: profileSchema,
    fieldStatuses: fieldStatusesSchema,
    assets: { type: 'array', items: assetSchema }
  }
};

export const digQuestionsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'assetId', 'userVisibleQuestions', 'internalMetadata', 'encouragement'],
  properties: {
    source: { enum: ['real'] },
    assetId: stringSchema,
    userVisibleQuestions: { type: 'array', minItems: 1, maxItems: 3, items: stringSchema },
    internalMetadata: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionId', 'relatedAssetId', 'method', 'factDimensions', 'internalWhy'],
        properties: {
          questionId: stringSchema,
          relatedAssetId: stringSchema,
          relatedJdRequirementId: stringSchema,
          method: { enum: [...questionMethods] },
          factDimensions: { type: 'array', minItems: 1, items: { enum: [...factDimensions] } },
          internalWhy: stringSchema
        }
      }
    },
    encouragement: stringSchema
  }
};

export const jdFitJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'deliveryDecision', 'deliveryReason', 'strongestEvidence', 'mainGap', 'nextStepAdvice', 'matrix'],
  properties: {
    source: { enum: ['real'] },
    deliveryDecision: { enum: [...deliveryDecisions] },
    deliveryReason: stringSchema,
    strongestEvidence: stringSchema,
    mainGap: stringSchema,
    nextStepAdvice: stringSchema,
    matrix: { type: 'array', items: matrixRowSchema }
  }
};

export const jdSummaryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'role', 'requirements', 'keywords', 'riskNotes'],
  properties: {
    source: { enum: ['real'] },
    role: stringSchema,
    requirements: { type: 'array', minItems: 1, maxItems: 8, items: stringSchema },
    keywords: { type: 'array', items: stringSchema },
    riskNotes: { type: 'array', items: stringSchema }
  }
};

const highlightSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceExperience', 'capability', 'jdRequirement', 'whyNotFlattery', 'professionalExpression'],
  properties: {
    sourceExperience: stringSchema,
    capability: stringSchema,
    jdRequirement: stringSchema,
    whyNotFlattery: stringSchema,
    professionalExpression: stringSchema
  }
};
const rewriteSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'relatedExperience',
    'originalIssue',
    'capability',
    'directVersion',
    'versionAfterSupplement',
    'usageReminder',
    'original',
    'optimized',
    'reason',
    'jdRequirement',
    'risk',
    'interviewProbe'
  ],
  properties: {
    relatedExperience: stringSchema,
    originalIssue: stringSchema,
    capability: stringSchema,
    directVersion: stringSchema,
    versionAfterSupplement: stringSchema,
    usageReminder: stringSchema,
    original: stringSchema,
    optimized: stringSchema,
    reason: stringSchema,
    jdRequirement: stringSchema,
    risk: stringSchema,
    interviewProbe: stringSchema
  }
};
const interviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'whyAsk', 'answerAngle', 'concern', 'sampleAnswer', 'doNotExaggerate'],
  properties: {
    question: stringSchema,
    whyAsk: stringSchema,
    answerAngle: stringSchema,
    concern: stringSchema,
    sampleAnswer: stringSchema,
    doNotExaggerate: stringSchema
  }
};
const actionPlanItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'period',
    'what',
    'why',
    'how',
    'completionStandard',
    'jobSearchValue',
    'action',
    'deliverable',
    'resumeUsage',
    'targetAbility'
  ],
  properties: {
    period: stringSchema,
    what: stringSchema,
    why: stringSchema,
    how: stringSchema,
    completionStandard: stringSchema,
    jobSearchValue: stringSchema,
    action: stringSchema,
    deliverable: stringSchema,
    resumeUsage: stringSchema,
    targetAbility: stringSchema
  }
};
const actionPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'plans', 'confidenceSummary'],
  properties: {
    source: { enum: ['real'] },
    plans: { type: 'array', minItems: 6, items: actionPlanItemSchema },
    confidenceSummary: stringSchema
  }
};
const directionOptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'directionName',
    'name',
    'level',
    'priority',
    'searchableJobNames',
    'whyExplore',
    'why',
    'evidence',
    'gap',
    'sevenDayValidation',
    'next',
    'keywords'
  ],
  properties: {
    directionName: stringSchema,
    name: stringSchema,
    level: { enum: [...directionPriorities] },
    priority: { enum: [...directionPriorities] },
    searchableJobNames: { type: 'array', minItems: 3, maxItems: 5, items: stringSchema },
    whyExplore: stringSchema,
    why: stringSchema,
    evidence: stringSchema,
    gap: stringSchema,
    sevenDayValidation: stringSchema,
    next: stringSchema,
    keywords: { type: 'array', minItems: 3, maxItems: 5, items: stringSchema }
  }
};

export const reportHighlightsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'highlights'],
  properties: {
    source: { enum: ['real'] },
    highlights: { type: 'array', minItems: 2, items: highlightSchema }
  }
};

export const reportDirectionsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'directionOptions'],
  properties: {
    source: { enum: ['real'] },
    directionOptions: { type: 'array', minItems: 2, maxItems: 3, items: directionOptionSchema }
  }
};

export const reportRewritesJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'rewrites'],
  properties: {
    source: { enum: ['real'] },
    rewrites: { type: 'array', minItems: 3, items: rewriteSchema }
  }
};

export const reportJdFitSummaryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'jdFit'],
  properties: {
    source: { enum: ['real'] },
    jdFit: jdFitJsonSchema
  }
};

export const reportInterviewsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'interviews'],
  properties: {
    source: { enum: ['real'] },
    interviews: { type: 'array', minItems: 5, maxItems: 5, items: interviewSchema }
  }
};

export const reportInterviewQuestionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'interview'],
  properties: {
    source: { enum: ['real'] },
    interview: interviewSchema
  }
};

export const reportActionPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'summary', 'actionPlan', 'safetyNotes', 'resumeText', 'platformFields', 'previewLines'],
  properties: {
    source: { enum: ['real'] },
    summary: stringSchema,
    actionPlan: actionPlanSchema,
    safetyNotes: { type: 'array', minItems: 1, items: stringSchema },
    resumeText: { type: 'array', items: stringSchema },
    platformFields: { type: 'array', items: stringSchema },
    previewLines: { type: 'array', items: stringSchema }
  }
};

export const kimiExtractJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'sourceSnippets', 'verificationNotes', 'structuredFields'],
  properties: {
    source: { enum: ['real'] },
    sourceSnippets: { type: 'array', minItems: 1, items: stringSchema },
    verificationNotes: { type: 'array', items: stringSchema },
    structuredFields: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value', 'sourceSnippet'],
        properties: {
          field: stringSchema,
          value: stringSchema,
          sourceSnippet: stringSchema
        }
      }
    }
  }
} as const;

const nullableSchema = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }]
});

export const diagnosisReportJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode',
    'source',
    'isBasic',
    'summary',
    'highlights',
    'rewrites',
    'jdFit',
    'interviews',
    'directionOptions',
    'actionPlan',
    'safetyNotes',
    'resumeText',
    'platformFields',
    'previewLines'
  ],
  properties: {
    mode: { enum: [...reportModes] },
    source: { enum: ['real'] },
    isBasic: booleanSchema,
    summary: stringSchema,
    highlights: { type: 'array', minItems: 2, items: highlightSchema },
    rewrites: { type: 'array', minItems: 3, items: rewriteSchema },
    jdFit: nullableSchema(jdFitJsonSchema),
    interviews: nullableSchema({ type: 'array', minItems: 5, maxItems: 5, items: interviewSchema }),
    directionOptions: nullableSchema({ type: 'array', minItems: 2, maxItems: 3, items: directionOptionSchema }),
    actionPlan: actionPlanSchema,
    safetyNotes: { type: 'array', minItems: 1, items: stringSchema },
    resumeText: { type: 'array', items: stringSchema },
    platformFields: { type: 'array', items: stringSchema },
    previewLines: { type: 'array', items: stringSchema }
  }
};
