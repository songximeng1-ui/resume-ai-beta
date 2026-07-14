export type Stage = 'junior' | 'senior';
export type Mode = 'inventory' | 'jd';
export type Step = 'start' | 'input' | 'assets' | 'dig' | 'direction' | 'match' | 'result';
export type AiSource = 'real' | 'demo';

export type FieldStatus = 'AI 已识别' | '待用户确认' | '用户已修改';
export type AssetStatus =
  | '待确认'
  | '确认使用'
  | '编辑后确认'
  | '暂未填写'
  | '暂不使用'
  | '已确认'
  | '待用户确认'
  | '用户已修改';
export type DeliveryVerdict = '主投' | '可冲' | '过渡' | '暂不建议主投';
export type MatchLevel = '匹配较强' | '有一定匹配' | '需要补充证据' | '当前证据不足';
export type DeliveryDecision = '建议优先投递' | '可以投递，建议先优化简历' | '可以作为尝试方向' | '建议先补强后再重点投递';
export type DirectionPriority = '优先探索' | '可以尝试' | '过渡方向' | '先补证据';
export type QuestionMethod = 'hr' | 'tar' | 'part' | 'prep' | 'custom';
export type FactDimension = 'task' | 'action' | 'result' | 'reflection' | 'scale' | 'tool' | 'risk';

export type AiUsage = {
  model: string;
  task: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  modelTier?: 'small' | 'report' | 'mixed';
  byModelTier?: {
    small: AiUsageTotals;
    report: AiUsageTotals;
  };
  modules?: AiUsageModule[];
};

export type AiUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
};

export type AiUsageModule = {
  task: string;
  modelTier: 'small' | 'report' | 'rule';
  calledAi: boolean;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
};

export type ReportTaskStatus = 'pending' | 'running' | 'partial' | 'retrying' | 'failed' | 'completed';

export type ReportModuleKey = 'highlights' | 'directions' | 'jdFit' | 'rewrites' | 'interviews' | 'actionPlan' | 'assembledReport';

export type ReportGenerationTask = {
  id: string;
  mode: Mode;
  status: ReportTaskStatus;
  currentModule?: ReportModuleKey;
  failedModule?: ReportModuleKey;
  completedModules: ReportModuleKey[];
  completedCount: number;
  totalModules: number;
  isRetrying: boolean;
  retryable: boolean;
  message: string;
  technicalDetail?: string;
  estimate: string;
  modules: Partial<Record<ReportModuleKey, unknown>>;
  moduleUsages: AiUsageModule[];
  usage: AiUsage | null;
};

export type AiStatus =
  | {
      configured: true;
      mode: 'real';
      smallModel: string;
      reportModel: string;
    }
  | {
      configured: false;
      mode: 'demo';
      message: string;
    };

export type AssetKind =
  | 'education'
  | 'internship'
  | 'project'
  | 'campus'
  | 'partTime'
  | 'awards'
  | 'skills'
  | 'portfolio';

export interface Profile {
  education: string;
  schoolName: string;
  major: string;
  graduation: string;
  city: string;
  targetRole: string;
  internship: string;
  project: string;
  campus: string;
  partTime: string;
  awards: string;
  skills: string;
  portfolio: string;
}

export interface AssetCard {
  id: AssetKind;
  title: string;
  content: string;
  status: AssetStatus;
  confirmed: boolean;
  source: AiSource;
  isGap: boolean;
  sourceDescription?: string;
  gapAdvice?: string;
  notes: string[];
}

export interface StructuredResume {
  profile: Profile;
  fieldStatuses: Record<keyof Profile, FieldStatus>;
  assets: AssetCard[];
  source: AiSource;
}

export interface DigQuestionMetadata {
  questionId: string;
  relatedAssetId: AssetKind;
  relatedJdRequirementId?: string;
  method: QuestionMethod;
  factDimensions: FactDimension[];
  internalWhy: string;
}

export interface DigQuestionSet {
  assetId: AssetKind;
  source: AiSource;
  userVisibleQuestions: string[];
  internalMetadata: DigQuestionMetadata[];
  encouragement: string;
}

export interface EvidenceMatrixRow {
  requirement: string;
  matchLevel: MatchLevel;
  evidence: string;
  gap: string;
  resumeWriting: string;
  interviewRisk: string;
}

export interface JdFitReport {
  source: AiSource;
  deliveryDecision: DeliveryDecision;
  deliveryReason: string;
  strongestEvidence: string;
  mainGap: string;
  nextStepAdvice: string;
  matrix: EvidenceMatrixRow[];
  verdict?: DeliveryVerdict;
  basis?: string;
  maxAdvantage?: string;
  maxGap?: string;
  ifInsist?: string;
}

export interface JdSummary {
  source: AiSource;
  role: string;
  requirements: string[];
  keywords: string[];
  riskNotes: string[];
}

export interface ResumeRewrite {
  relatedExperience: string;
  originalIssue: string;
  capability: string;
  directVersion: string;
  versionAfterSupplement: string;
  usageReminder: string;
  original: string;
  optimized: string;
  reason: string;
  jdRequirement: string;
  risk: string;
  interviewProbe: string;
}

export interface HiddenHighlight {
  sourceExperience: string;
  capability: string;
  jdRequirement: string;
  whyNotFlattery: string;
  professionalExpression: string;
}

export interface InterviewPrep {
  question: string;
  whyAsk: string;
  answerAngle: string;
  concern: string;
  sampleAnswer: string;
  doNotExaggerate: string;
}

export interface ActionPlanItem {
  period: string;
  what: string;
  why: string;
  how: string;
  completionStandard: string;
  jobSearchValue: string;
  action: string;
  deliverable: string;
  resumeUsage: string;
  targetAbility: string;
}

export interface ActionPlanReport {
  source: AiSource;
  plans: ActionPlanItem[];
  confidenceSummary: string;
}

export interface DirectionOption {
  directionName: string;
  name: string;
  level: DirectionPriority;
  priority: DirectionPriority;
  searchableJobNames: string[];
  whyExplore: string;
  why: string;
  evidence: string;
  gap: string;
  sevenDayValidation: string;
  next: string;
  keywords: string[];
}

export type UnsafeFinding = {
  path: string;
  matchedText: string;
  riskKind: 'fabrication' | 'exaggeration' | 'overpromise';
  severity: 'blocker' | 'warning';
};

export interface ReportQualityResult {
  passed: boolean;
  score: number;
  blockers: string[];
  warnings: string[];
  safetyFindings: UnsafeFinding[];
}

export interface DiagnosisReport {
  mode?: Mode;
  source: AiSource;
  isBasic?: boolean;
  summary?: string;
  highlights: HiddenHighlight[];
  rewrites: ResumeRewrite[];
  directionOptions?: DirectionOption[];
  jdFit?: JdFitReport;
  interviews?: InterviewPrep[];
  actionPlan: ActionPlanReport;
  safetyNotes?: string[];
  resumeText: string[];
  platformFields: string[];
  previewLines: string[];
  quality?: ReportQualityResult;
  usage?: AiUsage | null;
  reportTask?: ReportGenerationTask;
}

export interface ReportFeedback {
  helpScore: number | null;
  credibilityScore: number | null;
  hasObviousInaccuracy: string;
  helpfulParts: string[];
  weakParts: string[];
  weakPartDetail: string;
  weakOtherDetail: string;
  misjudgedFeedback: string;
  copyableContent: string;
  nextVersionSuggestion: string;
  inaccurateFeedback: string;
  actionIntent: string;
  willingnessToPay: string;
  willingToContinueTesting: string;
  anonymousConsent: boolean;
}

export interface FeedbackSubmission extends ReportFeedback {
  mode: Mode | null;
  createdAt: string;
}

export interface PersistedState {
  step: Step;
  stage: Stage | null;
  mode: Mode | null;
  profile: Profile;
  fieldStatuses: Record<keyof Profile, FieldStatus>;
  assets: AssetCard[];
  truthConfirmed: boolean;
  resumeText: string;
  jdText: string;
  jdFit: JdFitReport | null;
  report: DiagnosisReport | null;
  reportTask: ReportGenerationTask | null;
}

export type V07JobRoute =
  | 'no_direction'
  | 'has_direction_resume_not_ready'
  | 'applying_no_feedback'
  | 'target_job_fit';

export type V07Step =
  | 'route'
  | 'intake'
  | 'diagnosis'
  | 'plan'
  | 'daily_task'
  | 'record'
  | 'review'
  | 'result';

export type V07Audience =
  | 'first_job_graduate'
  | 'within_one_year_after_graduation';

export type V07ActionLoopStage =
  | 'diagnosis'
  | 'action'
  | 'record'
  | 'review'
  | 'adjust';

export interface V07DailyTask {
  day: number;
  title: string;
  route: V07JobRoute;
  actionLoopStage: V07ActionLoopStage;
  taskType:
    | 'search_job'
    | 'compare_jd'
    | 'rewrite_resume'
    | 'submit_application'
    | 'record_feedback'
    | 'review';
  status: 'locked' | 'today' | 'todo' | 'done' | 'skipped';
  difficulty: 'comfort' | 'stretch' | 'panic_risk';
  estimatedMinutes: number;
  expectedOutput: string;
  evidenceRequired: string;
}

export interface V07PlanState {
  route: V07JobRoute;
  currentDay: number;
  totalDays: 21;
  tasks: V07DailyTask[];
}

export interface V07PersistedState {
  version: 'v0.7';
  route: V07JobRoute | null;
  step: V07Step;
  plan: V07PlanState | null;
  legacy?: PersistedState;
}

export type V07LeastHelpfulPart =
  | 'none'
  | 'task_unclear'
  | 'rewrite_unusable'
  | 'too_long'
  | 'not_realistic'
  | 'route_mismatch'
  | 'other';

export interface V07FeedbackSubmission {
  route: V07JobRoute;
  day?: number;
  taskHelpfulScore: number | null;
  taskFinished: 'yes' | 'partly' | 'no';
  actionClarity: 'clear' | 'partly_clear' | 'unclear' | null;
  contentCredibilityScore: number | null;
  realityIssueText: string;
  leastHelpfulParts: V07LeastHelpfulPart[];
  actionWillingness: string;
  paymentAcceptance: string;
  continueTesting: 'yes' | 'no' | 'unsure';
  createdAt: string;
}

export const emptyProfile: Profile = {
  education: '',
  schoolName: '',
  major: '',
  graduation: '',
  city: '',
  targetRole: '',
  internship: '',
  project: '',
  campus: '',
  partTime: '',
  awards: '',
  skills: '',
  portfolio: ''
};

export const assetTitles: Record<AssetKind, string> = {
  education: '教育背景',
  internship: '实习经历',
  project: '项目经历',
  campus: '校园经历',
  partTime: '兼职经历',
  awards: '荣誉证书',
  skills: '技能作品',
  portfolio: '作品集'
};

export const profileLabels: Record<keyof Profile, string> = {
  education: '学历',
  schoolName: '学校名称',
  major: '专业',
  graduation: '毕业时间',
  city: '城市意向（可选）',
  targetRole: '目标岗位或行业（可选）',
  internship: '实习经历',
  project: '项目经历',
  campus: '校园经历',
  partTime: '兼职经历',
  awards: '荣誉证书',
  skills: '技能/作品',
  portfolio: '作品集或链接'
};

export const fieldKeys = Object.keys(emptyProfile) as (keyof Profile)[];

export const emptyFieldStatuses: Record<keyof Profile, FieldStatus> = fieldKeys.reduce(
  (acc, key) => ({ ...acc, [key]: '待用户确认' }),
  {} as Record<keyof Profile, FieldStatus>
);

export const diggableAssetIds: AssetKind[] = ['internship', 'project', 'campus', 'partTime', 'awards', 'skills', 'portfolio'];
