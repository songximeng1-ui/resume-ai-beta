import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  type AssetCard,
  type AssetKind,
  type AiStatus,
  type DiagnosisReport,
  type DigQuestionSet,
  type FeedbackSubmission,
  type FieldStatus,
  type JdFitReport,
  type Mode,
  type PersistedState,
  type Profile,
  type ReportGenerationTask,
  type ReportFeedback,
  type Stage,
  type Step,
  type V07JobRoute,
  type V07PersistedState,
  type V07TaskRecord,
  type V07PlanState,
  assetTitles,
  diggableAssetIds,
  emptyFieldStatuses,
  emptyProfile,
  fieldKeys,
  profileLabels
} from './types';
import {
  createAssetCardsFromProfile,
  getAiConfigMessage,
  getAiService,
  inferSchoolBackground,
  ReportTaskError,
  verifyBetaAccessCode
} from './services/aiService';
import { buildActionPlanText, buildReportMarkdown, buildReportText } from './reportExport';
import {
  getInitialRoutePlan,
  getLegacyModeForRoute,
  getLegacyStepForV07Step,
  getV07StepForLegacyStep,
  isV07Route,
  isV07Step,
  migrateLegacySession
} from './v07Foundation';

const STORAGE_KEY = 'job-map-v2-confirmed-session';
const FEEDBACK_STORAGE_KEY = 'job-map-v0.3-feedback';
const BETA_ACCESS_STORAGE_KEY = 'job-map-v0.3-beta-access';
type AiLoadingTask = 'structure' | 'dig' | 'jd-fit' | 'report' | null;

const initialState: PersistedState = {
  step: 'start',
  stage: null,
  mode: null,
  profile: emptyProfile,
  fieldStatuses: emptyFieldStatuses,
  assets: [],
  truthConfirmed: false,
  resumeText: '',
  jdText: '',
  jdFit: null,
  report: null,
  reportTask: null
};

const initialV07State: V07PersistedState = {
  version: 'v0.7',
  route: null,
  step: 'route',
  plan: null,
  records: []
};

const v07RouteOptions: {
  route: V07JobRoute;
  title: string;
  detail: string;
}[] = [
  {
    route: 'no_direction',
    title: '我不知道该投什么岗位。',
    detail: '先找真实岗位样本，只把未经验证的方向叫作可探索方向。'
  },
  {
    route: 'has_direction_resume_not_ready',
    title: '我大概知道方向，但简历不知道怎么写。',
    detail: '先整理真实经历，把能写进简历的证据和表达拆清楚。'
  },
  {
    route: 'applying_no_feedback',
    title: '我投了很多，但没有面试。',
    detail: '先轻量记录投递、岗位样本和简历版本，再复盘问题。'
  },
  {
    route: 'target_job_fit',
    title: '我看到一个岗位，想知道能不能投、怎么改。',
    detail: '粘贴目标 JD，判断当前材料能证明什么、还缺什么。'
  }
];

interface RestoredSession {
  v07: V07PersistedState;
  legacy: PersistedState;
}

function formatAiError(error: unknown) {
  void error;
  return '当前 AI 生成失败，可以直接重试一次。如果多次失败，请稍后再试或联系测试负责人。';
}

function getAiLoadingMessage(task: AiLoadingTask) {
  switch (task) {
    case 'structure':
      return 'AI 正在整理基础信息，真实 AI 调用可能需要等待较长时间，请不要关闭页面。';
    case 'dig':
      return 'AI 正在生成动态追问，真实 AI 调用可能需要等待较长时间，请不要关闭页面。';
    case 'jd-fit':
      return 'AI 正在拆解岗位要求并匹配你的经历，真实 AI 调用可能需要等待较长时间，请不要关闭页面。';
    case 'report':
      return 'AI 正在分段生成诊断报告，内容较多，真实 AI 调用可能需要等待较长时间。若失败，可以直接再次点击当前按钮重试。';
    default:
      return '';
  }
}

function getAiWaitEstimate(task: Exclude<AiLoadingTask, null>) {
  switch (task) {
    case 'structure':
      return '预计需要 10-30 秒。AI 会帮你整理简历信息，期间请不要关闭页面。';
    case 'dig':
      return '预计需要 10-20 秒。AI 会基于当前经历生成追问，期间请不要关闭页面。';
    case 'jd-fit':
      return '预计需要 20-60 秒。AI 会拆解岗位要求并匹配你的真实经历，期间请不要关闭页面。';
    case 'report':
      return '预计需要 1-3 分钟。AI 会分段生成诊断报告，期间请不要关闭页面。';
  }
}

function AiTaskNotice({ estimate, loadingMessage }: { estimate: string; loadingMessage?: string }) {
  return (
    <p className="context-note" role={loadingMessage ? 'status' : undefined}>
      {loadingMessage || estimate}
    </p>
  );
}

function ReportTaskProgress({ task, isBusy, onContinue }: { task: ReportGenerationTask | null; isBusy: boolean; onContinue: () => void }) {
  if (!task) {
    return null;
  }
  const isDone = task.status === 'completed';
  return (
    <section className="result-block" aria-label="报告生成进度">
      <h2>报告生成进度</h2>
      <p className="context-note">{task.message || '报告生成任务正在处理。已完成内容不会丢失。'}</p>
      <p>状态：{task.status}</p>
      <p>已完成 {task.completedCount}/{task.totalModules} 个模块</p>
      {task.currentModule ? <p>正在生成模块：{task.currentModule}</p> : null}
      {task.failedModule ? <p>失败模块：{task.failedModule}</p> : null}
      <p>{task.isRetrying || task.status === 'retrying' ? '当前正在重试或续跑。' : '如遇失败，可以继续生成剩余部分。'}</p>
      <p className="context-note">{task.estimate || '预计仍需等待一会儿，请不要关闭页面。'}</p>
      {!isDone && task.retryable ? (
        <button className="primary-button" type="button" onClick={onContinue} disabled={isBusy}>
          {isBusy ? '继续生成中...' : '继续生成剩余部分'}
        </button>
      ) : null}
    </section>
  );
}

function normalizeLegacyState(value: unknown): PersistedState {
  if (!value || typeof value !== 'object') {
    return initialState;
  }
  return { ...initialState, ...(value as Partial<PersistedState>) };
}

function normalizeV07TaskRecords(value: unknown): V07TaskRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is V07TaskRecord => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const record = item as Partial<V07TaskRecord>;
    return (
      isV07Route(record.route) &&
      typeof record.day === 'number' &&
      typeof record.taskTitle === 'string' &&
      typeof record.taskType === 'string' &&
      ['done', 'partly', 'not_done'].includes(String(record.completionStatus)) &&
      typeof record.outputText === 'string' &&
      typeof record.evidenceText === 'string' &&
      typeof record.reflectionText === 'string' &&
      typeof record.nextAdjustment === 'string' &&
      typeof record.createdAt === 'string'
    );
  });
}

function readPersistedSession(): RestoredSession {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { v07: initialV07State, legacy: initialState };
    }

    const parsed = JSON.parse(raw) as Partial<V07PersistedState> | Partial<PersistedState>;
    if ('version' in parsed && parsed.version === 'v0.7') {
      const route = isV07Route(parsed.route) ? parsed.route : null;
      const step = isV07Step(parsed.step) ? parsed.step : 'route';
      const legacy = normalizeLegacyState(parsed.legacy);
      const plan = route
        ? parsed.plan && parsed.plan.route === route && parsed.plan.totalDays === 21
          ? parsed.plan
          : getInitialRoutePlan(route)
        : null;

      return {
        v07: {
          version: 'v0.7',
          route,
          step,
          plan,
          records: normalizeV07TaskRecords(parsed.records),
          legacy
        },
        legacy: { ...legacy, step: getLegacyStepForV07Step(step) }
      };
    }

    const legacy = normalizeLegacyState(parsed);
    const v07 = migrateLegacySession(legacy);
    return { v07, legacy: v07.legacy || legacy };
  } catch {
    return { v07: initialV07State, legacy: initialState };
  }
}

function readBetaAccessState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BETA_ACCESS_STORAGE_KEY) || '{}') as {
      authorized?: unknown;
      betaAccessCode?: unknown;
    };
    return {
      authorized: parsed.authorized === true && typeof parsed.betaAccessCode === 'string' && parsed.betaAccessCode.trim().length > 0,
      betaAccessCode: typeof parsed.betaAccessCode === 'string' ? parsed.betaAccessCode : ''
    };
  } catch {
    return { authorized: false, betaAccessCode: '' };
  }
}

function saveBetaAccessState(betaAccessCode: string) {
  window.localStorage.setItem(BETA_ACCESS_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode }));
}

function SourceBadge({ source }: { source?: 'real' | 'demo' }) {
  if (!source) {
    return null;
  }
  return <span className={source === 'real' ? 'source-badge real' : 'source-badge demo'}>{source === 'real' ? '真实 AI 诊断' : '演示结果'}</span>;
}

function SafetyNotice() {
  return <p className="safety-note">基于用户已确认真实经历生成，请勿用于伪造或夸大。</p>;
}

function ErrorNotice({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return <p className="error-note" role="alert">{message}</p>;
}

function BetaAccessPage({ onAuthorized }: { onAuthorized: (betaAccessCode: string) => void }) {
  const [betaAccessCode, setBetaAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = betaAccessCode.trim();
    if (!code) {
      setError('请输入内测访问码。');
      return;
    }
    setIsChecking(true);
    setError('');
    try {
      await verifyBetaAccessCode(code);
      saveBetaAccessState(code);
      onAuthorized(code);
    } catch {
      setError('访问码不正确，或当前内测入口暂不可用。');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <section className="flow-section beta-access-section">
      <div className="intro">
        <p className="eyebrow">求职地图 V0.4 私密内测</p>
        <h1>Web 私密内测访问</h1>
        <p className="lead">这是小范围体验入口，请使用邀请获得的访问码进入。</p>
      </div>

      <aside className="privacy-band">
        <strong>隐私与脱敏提醒</strong>
        <p>请先删除姓名、手机号、邮箱、身份证号、家庭住址等敏感信息，再粘贴简历或岗位要求。</p>
        <p>不要上传与求职诊断无关的隐私、证件、银行卡或账号密码。</p>
        <p>工具只帮助重构真实经历表达，严格禁止伪造经历、虚构项目或夸大职责。</p>
      </aside>

      <form className="form-section beta-access-form" onSubmit={submit}>
        <label className="field" htmlFor="beta-access-code">
          <span className="field-label-row">
            <span>内测访问码</span>
          </span>
          <input
            id="beta-access-code"
            value={betaAccessCode}
            onChange={(event) => setBetaAccessCode(event.target.value)}
            placeholder="输入内测访问码"
            autoComplete="off"
          />
        </label>
        <ErrorNotice message={error} />
        <button className="primary-button wide-action" type="submit" disabled={isChecking}>
          {isChecking ? '校验中...' : '进入内测'}
        </button>
      </form>
    </section>
  );
}

function canEnterDig(asset: AssetCard) {
  return diggableAssetIds.includes(asset.id) && !asset.isGap && asset.status !== '暂不使用' && Boolean(asset.content.trim());
}

function isConfirmedAssetStatus(asset: AssetCard) {
  return asset.confirmed || ['确认使用', '编辑后确认', '已确认', '用户已修改'].includes(asset.status);
}

function isAssetProcessed(asset: AssetCard) {
  if (asset.isGap || !asset.content.trim()) {
    return true;
  }
  return isConfirmedAssetStatus(asset) || asset.status === '暂不使用';
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error || new Error('File read failed')));
    reader.readAsText(file, 'UTF-8');
  });
}

function Field({
  id,
  value,
  status,
  onChange,
  multiline = false,
  placeholder
}: {
  id: keyof Profile;
  value: string;
  status: FieldStatus;
  onChange: (key: keyof Profile, value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const inputId = `field-${id}`;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label-row">
        <span>{profileLabels[id]}</span>
        <span className="field-status">{status}</span>
      </span>
      {multiline ? (
        <textarea
          aria-label={profileLabels[id]}
          id={inputId}
          value={value}
          onChange={(event) => onChange(id, event.target.value)}
          placeholder={placeholder}
          rows={4}
        />
      ) : (
        <input
          aria-label={profileLabels[id]}
          id={inputId}
          value={value}
          onChange={(event) => onChange(id, event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

function App() {
  const restored = useMemo(readPersistedSession, []);
  const restoredBetaAccess = useMemo(readBetaAccessState, []);
  const [betaAuthorized, setBetaAuthorized] = useState(restoredBetaAccess.authorized);
  const [route, setRoute] = useState<V07JobRoute | null>(restored.v07.route);
  const [plan, setPlan] = useState<V07PlanState | null>(restored.v07.plan);
  const [records, setRecords] = useState<V07TaskRecord[]>(restored.v07.records || []);
  const [step, setStep] = useState<Step>(restored.legacy.step);
  const [stage, setStage] = useState<Stage | null>(restored.legacy.stage);
  const [mode, setMode] = useState<Mode | null>(restored.legacy.mode);
  const [profile, setProfile] = useState<Profile>(restored.legacy.profile);
  const [fieldStatuses, setFieldStatuses] = useState<Record<keyof Profile, FieldStatus>>(restored.legacy.fieldStatuses);
  const [resumeText, setResumeText] = useState(restored.legacy.resumeText);
  const [assets, setAssets] = useState<AssetCard[]>(restored.legacy.assets);
  const [truthConfirmed, setTruthConfirmed] = useState(restored.legacy.truthConfirmed);
  const [truthError, setTruthError] = useState('');
  const [structureSource, setStructureSource] = useState<'real' | 'demo' | null>(null);
  const [structureMessage, setStructureMessage] = useState('');
  const [resumeFileMessage, setResumeFileMessage] = useState('');
  const [editingId, setEditingId] = useState<AssetKind | null>(null);
  const [digIndex, setDigIndex] = useState(0);
  const [digAnswer, setDigAnswer] = useState('');
  const [digQuestionSet, setDigQuestionSet] = useState<DigQuestionSet | null>(null);
  const [digEncouragement, setDigEncouragement] = useState('');
  const [jdText, setJdText] = useState(restored.legacy.jdText);
  const [jdFit, setJdFit] = useState<JdFitReport | null>(restored.legacy.jdFit);
  const [report, setReport] = useState<DiagnosisReport | null>(restored.legacy.report);
  const [reportTask, setReportTask] = useState<ReportGenerationTask | null>(restored.legacy.reportTask);
  const [isBusy, setIsBusy] = useState(false);
  const [aiLoadingTask, setAiLoadingTask] = useState<AiLoadingTask>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiStatusError, setAiStatusError] = useState('');

  const aiService = useMemo(getAiService, []);

  useEffect(() => {
    if (!betaAuthorized) {
      return undefined;
    }
    let active = true;
    aiService
      .getStatus()
      .then((status) => {
        if (!active) return;
        setAiStatus(status);
        setAiStatusError('');
      })
      .catch((error) => {
        if (!active) return;
        setAiStatusError(formatAiError(error));
      });
    return () => {
      active = false;
    };
  }, [aiService, betaAuthorized]);

  useEffect(() => {
    if (!truthConfirmed && !route) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const legacy: PersistedState = {
      step,
      stage,
      mode,
      profile,
      fieldStatuses,
      assets,
      truthConfirmed,
      resumeText,
      jdText,
      jdFit,
      report,
      reportTask
    };
    const payload: V07PersistedState = {
      version: 'v0.7',
      route,
      step: getV07StepForLegacyStep(step),
      plan,
      records,
      legacy
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [assets, fieldStatuses, jdFit, jdText, mode, plan, profile, records, report, reportTask, resumeText, route, stage, step, truthConfirmed]);

  const diggableAssets = useMemo(() => diggableAssetIds.map((id) => assets.find((asset) => asset.id === id && canEnterDig(asset))).filter(Boolean) as AssetCard[], [assets]);
  const currentDigAsset = diggableAssets[Math.min(digIndex, Math.max(diggableAssets.length - 1, 0))];
  const progressLabel = {
    start: '01 开始',
    input: '02 简历输入',
    assets: '03 经历资产',
    dig: '04 动态追问',
    direction: '05 方向诊断',
    match: '05 岗位证据',
    result: '06 诊断报告'
  }[step];

  const updateProfile = (key: keyof Profile, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setFieldStatuses((current) => ({ ...current, [key]: '用户已修改' }));
  };

  const resetAll = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setStep('start');
    setStage(null);
    setMode(null);
    setRoute(null);
    setPlan(null);
    setRecords([]);
    setProfile(emptyProfile);
    setFieldStatuses(emptyFieldStatuses);
    setResumeText('');
    setAssets([]);
    setTruthConfirmed(false);
    setTruthError('');
    setStructureSource(null);
    setStructureMessage('');
    setResumeFileMessage('');
    setEditingId(null);
    setDigIndex(0);
    setDigAnswer('');
    setDigQuestionSet(null);
    setDigEncouragement('');
    setJdText('');
    setJdFit(null);
    setReport(null);
    setReportTask(null);
    setAiLoadingTask(null);
  };

  const attachResumeFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    const isTextFile =
      file.type.startsWith('text/') ||
      /\.(txt|md|markdown|csv)$/i.test(file.name);

    if (!isTextFile) {
      setResumeFileMessage(`已附上：${file.name}。PDF/Word 当前解析可能不稳定，建议同时粘贴简历正文。`);
      return;
    }

    try {
      const text = await readFileAsText(file);
      setResumeText((current) => [current.trim(), text.trim()].filter(Boolean).join('\n\n'));
      setResumeFileMessage(`文本文件读取成功：${file.name}。请快速检查内容是否有乱码。`);
      setAiStatusError('');
    } catch {
      setResumeFileMessage(`文件读取失败。可以稍后重试，或先把简历正文粘贴到文本框。`);
    }
  };

  const startDiagnosis = () => {
    if (!route) {
      return;
    }
    const nextMode = getLegacyModeForRoute(route);
    setStage('senior');
    setMode(nextMode);
    setPlan((current) => (current?.route === route ? current : getInitialRoutePlan(route)));
    setStep('input');
  };

  const structureResume = async () => {
    setIsBusy(true);
    setAiLoadingTask('structure');
    try {
      const structured = await aiService.structureResumeText(resumeText, profile);
      setProfile(structured.profile);
      setFieldStatuses(structured.fieldStatuses);
      setAssets(structured.assets);
      setStructureSource(structured.source);
      setStructureMessage('已整理出基础信息和经历材料，请检查并修改不准确的地方。');
      setAiStatusError('');
    } catch (error) {
      const message = formatAiError(error);
      setAiStatusError(message);
      setStructureMessage('AI 暂时没有整理成功，你可以稍后重试，或先手动填写。');
      setTruthError(message);
    } finally {
      setIsBusy(false);
      setAiLoadingTask(null);
    }
  };

  const generateAssets = () => {
    if (!truthConfirmed) {
      setTruthError('请先确认真实性条款，再进入经历资产卡。');
      return;
    }
    if (mode === 'jd' && !jdText.trim()) {
      setTruthError('请先补充目标岗位要求。系统需要先理解岗位要求，再结合你的经历生成追问。');
      return;
    }
    const nextAssets = assets.length ? assets : createAssetCardsFromProfile(profile, aiStatus?.configured ? 'real' : 'demo');
    setAssets(nextAssets);
    setTruthError('');
    setStep('assets');
  };

  const updateAsset = (id: AssetKind, patch: Partial<AssetCard>) => {
    setAssets((current) =>
      current.map((asset) => {
        if (asset.id !== id) {
          return asset;
        }
        const next = { ...asset, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
          const hasContent = Boolean((patch.content || '').trim());
          return {
            ...next,
            isGap: asset.id !== 'education' && !hasContent,
            status: hasContent ? '待确认' : '暂未填写',
            confirmed: false,
            sourceDescription: hasContent ? '用户在经历卡中编辑或补充的内容，需确认后进入后续分析。' : next.sourceDescription,
            gapAdvice: hasContent ? undefined : '目前没有识别到这段经历。没关系，后续不会强行追问这一项。如果目标岗位看重这类经历，可以后续补充。'
          };
        }
        return { ...next, status: patch.status || '待确认' };
      })
    );
  };

  const deleteAsset = (id: AssetKind) => {
    setAssets((current) => current.filter((asset) => asset.id !== id));
  };

  const confirmAsset = (id: AssetKind) => {
    setAssets((current) =>
      current.map((asset) =>
        asset.id === id && !asset.isGap
          ? { ...asset, confirmed: true, status: asset.sourceDescription?.includes('编辑') ? '编辑后确认' : '确认使用' }
          : asset
      )
    );
  };

  const ignoreAsset = (id: AssetKind) => {
    setAssets((current) => current.map((asset) => (asset.id === id && !asset.isGap ? { ...asset, confirmed: false, status: '暂不使用' } : asset)));
  };

  const loadDigQuestion = async (asset: AssetCard | undefined) => {
    if (!asset) {
      setDigQuestionSet(null);
      return;
    }
    setIsBusy(true);
    setAiLoadingTask('dig');
    try {
      const questionSet = await aiService.generateDigQuestions({
        profile,
        asset,
        jdText,
        previousAnswers: asset.notes
      });
      setDigQuestionSet(questionSet);
      setDigEncouragement('');
      setAiStatusError('');
    } catch (error) {
      const message = formatAiError(error);
      setAiStatusError(message);
      setDigEncouragement(message);
    } finally {
      setIsBusy(false);
      setAiLoadingTask(null);
    }
  };

  const enterDig = async () => {
    const firstPending = assets.find((asset) => diggableAssetIds.includes(asset.id) && !isAssetProcessed(asset));
    if (firstPending) {
      setTruthError(`请先处理「${firstPending.title}」经历卡，再进入下一步。`);
      const pendingElement = document.querySelector(`[data-asset-id="${firstPending.id}"]`);
      if (pendingElement instanceof HTMLElement && typeof pendingElement.scrollIntoView === 'function') {
        pendingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    setTruthError('');
    setDigIndex(0);
    setStep('dig');
    await loadDigQuestion(diggableAssets[0]);
  };

  const moveDig = async (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(nextIndex, Math.max(diggableAssets.length - 1, 0)));
    setDigIndex(bounded);
    setDigAnswer('');
    await loadDigQuestion(diggableAssets[bounded]);
  };

  const saveAndContinue = async () => {
    if (!currentDigAsset) {
      return;
    }
    let nextAssets = assets;
    if (digAnswer.trim()) {
      nextAssets = assets.map((asset) =>
          asset.id === currentDigAsset.id ? { ...asset, notes: [...asset.notes, digAnswer.trim()], confirmed: true, status: '编辑后确认' } : asset
      );
      setAssets(nextAssets);
    }
    setDigAnswer('');
    const encouragement =
      digAnswer.trim()
        ? '这段经历可以体现执行推进和信息整理能力。只要补清楚你的真实分工、频率和产出，就能变成更清楚的简历表达。'
        : '这段可以先跳过。后续报告会优先使用你已经补充的信息。';
    if (digIndex < diggableAssets.length - 1) {
      await moveDig(digIndex + 1);
      setDigEncouragement(encouragement);
    } else {
      setDigEncouragement(encouragement);
      await continueAfterDig(nextAssets);
    }
  };

  const skipCurrentDig = async () => {
    setDigEncouragement('已跳过本段。跳过不会删除经历，只是暂时不把它作为重点改写材料。');
    if (digIndex < diggableAssets.length - 1) {
      await moveDig(digIndex + 1);
    }
  };

  const analyzeJd = async () => {
    if (!stage) {
      return;
    }
    setIsBusy(true);
    setAiLoadingTask('jd-fit');
    try {
      const fit = await aiService.analyzeJdFit({ stage, profile, assets, jdText });
      setJdFit(fit);
      setAiStatusError('');
    } catch (error) {
      setAiStatusError(formatAiError(error));
    } finally {
      setIsBusy(false);
      setAiLoadingTask(null);
    }
  };

  const generateReport = async (reportAssets = assets, fromDig = false) => {
    if (!stage) {
      return;
    }
    setIsBusy(true);
    setAiLoadingTask('report');
    try {
      const fit = mode === 'jd' ? jdFit || (await aiService.analyzeJdFit({ stage, profile, assets: reportAssets, jdText })) : undefined;
      const nextReport = await aiService.generateReport({ mode: mode || 'inventory', stage, profile, assets: reportAssets, jdText, jdFit: fit, reportTask });
      if (fit) {
        setJdFit(fit);
      }
      setReport(nextReport);
      setReportTask(nextReport.reportTask || null);
      setAiStatusError('');
      setStep('result');
    } catch (error) {
      if (error instanceof ReportTaskError) {
        setReportTask(error.task);
        setAiStatusError(error.task.message);
        if (fromDig) {
          setDigEncouragement(error.task.message);
        }
        return;
      }
      const message = formatAiError(error);
      setAiStatusError(message);
      if (fromDig) {
        setDigEncouragement(message);
      }
    } finally {
      setIsBusy(false);
      setAiLoadingTask(null);
    }
  };

  const continueAfterDig = async (nextAssets = assets) => {
    if (mode === 'jd') {
      await generateReport(nextAssets, true);
      return;
    }
    setStep('direction');
  };

  const aiLoadingMessage = isBusy ? getAiLoadingMessage(aiLoadingTask) : '';
  const structureLoadingMessage = aiLoadingTask === 'structure' ? aiLoadingMessage : '';
  const digLoadingMessage = aiLoadingTask === 'dig' ? aiLoadingMessage : '';
  const jdFitLoadingMessage = aiLoadingTask === 'jd-fit' ? aiLoadingMessage : '';
  const reportLoadingMessage = aiLoadingTask === 'report' ? aiLoadingMessage : '';

  return (
    <main className="app-shell" data-testid="app-root">
      <header className="topbar">
        <div>
          <p className="eyebrow">求职地图 V0.7</p>
          <span>{progressLabel}</span>
        </div>
        {step !== 'start' ? (
          <button className="ghost-button" type="button" onClick={resetAll}>
            清除本次分析数据
          </button>
        ) : null}
      </header>

      {!betaAuthorized ? (
        <BetaAccessPage onAuthorized={() => setBetaAuthorized(true)} />
      ) : null}

      {betaAuthorized && step === 'start' ? (
        <section className="flow-section start-section">
          <div className="intro">
            <p className="eyebrow">普通应届生第一份工作 · 21 天行动陪跑</p>
            <h1>21 天应届生求职陪跑</h1>
            <p className="lead">先判断你现在卡在哪一步，再把今天能完成、能记录、能复盘的求职行动拆出来。</p>
            <p className="intro-note">AI 是陪跑教练，不替你做人生决定，也不把求职结果归因为你本人不行。</p>
          </div>

          <section className="choice-group" aria-labelledby="route-title">
            <h2 id="route-title">你现在最卡在哪一步？</h2>
            <div className="choice-grid">
              {v07RouteOptions.map((option) => (
                <button
                  key={option.route}
                  type="button"
                  aria-label={option.title}
                  className={route === option.route ? 'choice-card selected' : 'choice-card'}
                  onClick={() => {
                    setRoute(option.route);
                    setPlan((current) => (current?.route === option.route ? current : getInitialRoutePlan(option.route)));
                  }}
                >
                  <strong>{option.title}</strong>
                  <span>{option.detail}</span>
                </button>
              ))}
            </div>
          </section>

          <aside className="privacy-band">
            <strong>隐私与真实性提示</strong>
            <p>不要上传身份证号、家庭住址、银行卡等无关敏感信息。</p>
            <p>系统只帮助你优化真实表达，不帮助伪造经历。</p>
            <p>不承诺 offer、面试或薪资结果，只帮助你整理事实、拆解行动和复盘调整。</p>
          </aside>

          <button className="primary-button wide-action" type="button" onClick={startDiagnosis} disabled={!route}>
            开始 21 天陪跑
          </button>
        </section>
      ) : null}

      {betaAuthorized && step === 'input' ? (
        <InputPage
          mode={mode}
          profile={profile}
          fieldStatuses={fieldStatuses}
          resumeText={resumeText}
          jdText={jdText}
          structureSource={structureSource}
          structureMessage={structureMessage}
          truthConfirmed={truthConfirmed}
          truthError={truthError}
          isBusy={isBusy}
          loadingMessage={structureLoadingMessage}
          onProfileChange={updateProfile}
          onResumeTextChange={setResumeText}
          onJdTextChange={setJdText}
          resumeFileMessage={resumeFileMessage}
          onResumeFile={attachResumeFile}
          onStructure={structureResume}
          aiStatusMessage={getAiConfigMessage(aiStatus, aiStatusError)}
          onTruthChange={(checked) => {
            setTruthConfirmed(checked);
            if (checked) {
              setTruthError('');
            }
          }}
          onGenerateAssets={generateAssets}
          onBack={() => setStep('start')}
        />
      ) : null}

      {betaAuthorized && step === 'assets' ? (
        <AssetsPage
          assets={assets}
          truthError={truthError}
          editingId={editingId}
          onEdit={setEditingId}
          onUpdateAsset={updateAsset}
          onDelete={deleteAsset}
          onConfirm={confirmAsset}
          onIgnore={ignoreAsset}
          onBack={() => setStep('input')}
          onEnterDig={enterDig}
        />
      ) : null}

      {betaAuthorized && step === 'dig' ? (
        <DigPage
          profile={profile}
          mode={mode}
          isBusy={isBusy}
          loadingMessage={digLoadingMessage}
          assets={diggableAssets}
          currentIndex={digIndex}
          currentAsset={currentDigAsset}
          questionSet={digQuestionSet}
          answer={digAnswer}
          encouragement={digEncouragement}
          onAnswer={setDigAnswer}
          onPrev={() => moveDig(digIndex - 1)}
          onNext={() => moveDig(digIndex + 1)}
          onSave={saveAndContinue}
          onSkip={skipCurrentDig}
          onBack={() => setStep('assets')}
          onContinue={() => continueAfterDig()}
          reportLoadingMessage={reportLoadingMessage}
        />
      ) : null}

      {betaAuthorized && step === 'direction' ? (
        <DirectionPage
          profile={profile}
          assets={assets}
          isBusy={isBusy}
          loadingMessage={reportLoadingMessage}
          reportTask={reportTask}
          onBack={() => setStep('dig')}
          onReport={() => generateReport()}
        />
      ) : null}

      {betaAuthorized && step === 'match' ? (
        <MatchPage
          jdText={jdText}
          jdFit={jdFit}
          isBusy={isBusy}
          jdFitLoadingMessage={jdFitLoadingMessage}
          reportLoadingMessage={reportLoadingMessage}
          reportTask={reportTask}
          errorMessage={aiStatusError}
          onJdText={setJdText}
          onAnalyze={analyzeJd}
          onBack={() => setStep('dig')}
          onReport={() => generateReport()}
        />
      ) : null}

      {betaAuthorized && step === 'result' && report ? (
        <ResultPage
          report={report}
          mode={mode}
          route={route}
          plan={plan}
          records={records}
          onSaveRecord={(record) => setRecords((current) => [...current, record])}
          onBack={() => setStep(mode === 'jd' ? 'match' : 'direction')}
          onClear={resetAll}
        />
      ) : null}
    </main>
  );
}

function InputPage({
  mode,
  profile,
  fieldStatuses,
  resumeText,
  jdText,
  structureSource,
  structureMessage,
  aiStatusMessage,
  truthConfirmed,
  truthError,
  isBusy,
  loadingMessage,
  onProfileChange,
  onResumeTextChange,
  onJdTextChange,
  resumeFileMessage,
  onResumeFile,
  onStructure,
  onTruthChange,
  onGenerateAssets,
  onBack
}: {
  mode: Mode | null;
  profile: Profile;
  fieldStatuses: Record<keyof Profile, FieldStatus>;
  resumeText: string;
  jdText: string;
  structureSource: 'real' | 'demo' | null;
  structureMessage: string;
  aiStatusMessage: string;
  truthConfirmed: boolean;
  truthError: string;
  isBusy: boolean;
  loadingMessage: string;
  onProfileChange: (key: keyof Profile, value: string) => void;
  onResumeTextChange: (value: string) => void;
  onJdTextChange: (value: string) => void;
  resumeFileMessage: string;
  onResumeFile: (file: File | null) => void;
  onStructure: () => void;
  onTruthChange: (checked: boolean) => void;
  onGenerateAssets: () => void;
  onBack: () => void;
}) {
  const background = inferSchoolBackground(profile.schoolName);
  const basicFields: (keyof Profile)[] = ['education', 'schoolName', 'major', 'graduation', 'city', 'targetRole'];
  const experienceFields: (keyof Profile)[] = ['internship', 'project', 'campus', 'partTime', 'awards', 'skills', 'portfolio'];
  const basicPlaceholder = (key: keyof Profile) => {
    if (key === 'schoolName') return '例如：杭州应用技术学院';
    if (key === 'city') return '不确定可以先空着';
    if (key === 'targetRole') return '无岗位要求路线可以先不填，系统会根据经历给方向建议';
    return undefined;
  };

  return (
    <section className="flow-section">
      <div className="section-heading">
        <p className="eyebrow">简历输入</p>
        <h1>先把你的材料放进来</h1>
        <p>可以上传或粘贴简历。AI 会先帮你整理成基础信息和经历卡，你可以随时修改。</p>
      </div>

      <aside className="privacy-band">
        <strong>隐私提示</strong>
        <p>请先删除身份证号、家庭住址、银行卡号等无关敏感信息。</p>
      </aside>

      <aside className="privacy-band">
        <strong>AI 状态</strong>
        <p>{aiStatusMessage}</p>
      </aside>

      <div className="upload-placeholder">
        <div>
          <strong>上传简历文件</strong>
          <p>支持 PDF、Word、TXT。PDF/Word 当前解析可能不稳定，建议同时粘贴正文。</p>
          {resumeFileMessage ? <p className="file-status">{resumeFileMessage}</p> : null}
        </div>
        <input
          aria-label="上传简历文件"
          type="file"
          accept=".txt,.md,.markdown,.csv,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
          onChange={(event) => onResumeFile(event.currentTarget.files?.[0] || null)}
        />
      </div>

      <label className="field" htmlFor="resumeText">
        <span>粘贴简历文本</span>
        <textarea
          aria-label="粘贴简历文本"
          id="resumeText"
          value={resumeText}
          onChange={(event) => onResumeTextChange(event.target.value)}
          rows={7}
          placeholder="把简历正文、项目经历、实习经历或自我介绍粘贴到这里。"
        />
        <p className="helper-text">没有正式简历也可以，粘贴经历材料或自我介绍即可。</p>
      </label>

      {mode === 'jd' ? (
        <label className="field" htmlFor="jdTextInput">
          <span>粘贴目标岗位要求</span>
          <textarea
            aria-label="粘贴目标岗位要求"
            id="jdTextInput"
            value={jdText}
            onChange={(event) => onJdTextChange(event.target.value)}
            rows={6}
            placeholder="把招聘软件里的岗位职责、任职要求或岗位描述粘贴到这里。后续追问会先理解岗位要求，再结合你的真实经历生成问题。"
          />
          <p className="helper-text">有岗位要求路线会先基于岗位要求和你的经历生成追问；页面不会展示内部追问方法。</p>
        </label>
      ) : null}

      <div className="action-row">
        <button className="primary-button" type="button" onClick={onStructure} disabled={isBusy || !resumeText.trim()}>
          {isBusy ? 'AI 正在整理...' : 'AI 帮我整理基础信息'}
        </button>
        <SourceBadge source={structureSource || undefined} />
      </div>
      <AiTaskNotice estimate={getAiWaitEstimate('structure')} loadingMessage={loadingMessage} />
      {structureMessage ? (
        <p className={structureMessage.startsWith('AI 暂时') ? 'error-note' : 'context-note'}>{structureMessage}</p>
      ) : null}

      <section className="form-section">
        <h2>基础信息</h2>
        <div className="field-grid">
          {basicFields.map((key) => (
            <Field
              key={key}
              id={key}
              value={profile[key]}
              status={fieldStatuses[key]}
              onChange={onProfileChange}
              placeholder={basicPlaceholder(key)}
            />
          ))}
        </div>
        {background ? <p className="context-note">{background}</p> : null}
      </section>

      <section className="form-section">
        <h2>经历材料</h2>
        <div className="field-grid single">
          {experienceFields.map((key) => (
            <Field
              key={key}
              id={key}
              value={profile[key]}
              status={fieldStatuses[key]}
              onChange={onProfileChange}
              multiline
              placeholder="暂未填写。空白经历不会被强行追问，后续会给补强建议。"
            />
          ))}
        </div>
      </section>

      <label className="truth-check">
        <input
          aria-label="我确认以上学历、学校、证书、实习、项目、时间和成果均基于真实经历。系统只帮助我优化真实表达，不帮助伪造经历。"
          type="checkbox"
          checked={truthConfirmed}
          onChange={(event) => onTruthChange(event.target.checked)}
        />
        <span>我确认以上学历、学校、证书、实习、项目、时间和成果均基于真实经历。系统只帮助我优化真实表达，不帮助伪造经历。</span>
      </label>
      <ErrorNotice message={truthError} />

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onBack}>
          返回开始页
        </button>
        <button className="primary-button" type="button" onClick={onGenerateAssets}>
          生成我的经历资产卡
        </button>
      </div>
    </section>
  );
}

function AssetsPage({
  assets,
  truthError,
  editingId,
  onEdit,
  onUpdateAsset,
  onDelete,
  onConfirm,
  onIgnore,
  onBack,
  onEnterDig
}: {
  assets: AssetCard[];
  truthError: string;
  editingId: AssetKind | null;
  onEdit: (id: AssetKind | null) => void;
  onUpdateAsset: (id: AssetKind, patch: Partial<AssetCard>) => void;
  onDelete: (id: AssetKind) => void;
  onConfirm: (id: AssetKind) => void;
  onIgnore: (id: AssetKind) => void;
  onBack: () => void;
  onEnterDig: () => void;
}) {
  const [adviceId, setAdviceId] = useState<AssetKind | null>(null);
  const usableAssets = assets.filter((asset) => !asset.isGap && asset.status !== '暂不使用' && asset.content.trim());
  const blankAssets = assets.filter((asset) => asset.isGap || !asset.content.trim());
  const diggableAssets = assets.filter(canEnterDig);
  const hasDiggable = diggableAssets.length > 0;
  const noDigMessage = '请至少补充一段真实经历。课程项目、校园活动、兼职、技能作品都可以作为求职材料。';
  const formatAssetNames = (items: AssetCard[]) => (items.length ? items.map((asset) => assetTitles[asset.id]).join('、') : '暂无');

  return (
    <section className="flow-section">
      <div className="section-heading">
        <p className="eyebrow">我的求职材料盘点页</p>
        <h1>你的经历资产卡</h1>
        <p>AI 已把你的材料拆成几类经历。请确认真实可用的内容，修改不准确的地方。空白经历不会被强行追问，后续会给补强建议。</p>
      </div>

      <section className="asset-summary" aria-label="经历资产摘要">
        <div>
          <strong>当前可重点挖掘</strong>
          <p>{formatAssetNames(usableAssets)}</p>
        </div>
        <div>
          <strong>暂未填写</strong>
          <p>{formatAssetNames(blankAssets)}</p>
        </div>
        <p className="summary-note">不用担心空白项，后续报告会优先使用你真实填写的经历。</p>
        {!hasDiggable ? <p className="error-note">{noDigMessage}</p> : null}
      </section>

      <div className="asset-grid">
        {assets.map((asset) => {
          const isBlank = asset.isGap || !asset.content.trim();
          const displayStatus = isBlank ? '暂未填写' : asset.status;
          const isEditing = editingId === asset.id;

          return (
          <article className={isBlank ? 'asset-card gap-card' : 'asset-card'} data-asset-id={asset.id} data-testid={`asset-card-${asset.id}`} key={asset.id}>
            <div className="asset-head">
              <div>
                <span className="asset-kicker">{assetTitles[asset.id]}</span>
                <h2>{asset.title}</h2>
              </div>
              <span className="status-pill">{displayStatus}</span>
            </div>

            {isEditing ? (
              <textarea
                aria-label={`${asset.title}内容`}
                value={asset.content}
                onChange={(event) => onUpdateAsset(asset.id, { content: event.target.value })}
                rows={5}
              />
            ) : isBlank ? (
              <p>目前没有识别到这段经历。没关系，后续不会强行追问这一项。如果目标岗位看重这类经历，可以后续补充。</p>
            ) : (
              <>
                <p>{asset.content}</p>
                <p className="asset-helper">来源说明：{asset.sourceDescription || '来自用户粘贴的简历文本、基础信息或经历材料。'}</p>
                <p className="asset-helper">确认后，AI 会围绕这段经历继续追问真实细节。</p>
              </>
            )}

            {asset.notes.length ? (
              <div className="note-list">
                <strong>追问补充</strong>
                {asset.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}

            {adviceId === asset.id ? (
              <p className="context-note">后续可补强：可以先补一个真实课程项目、校园活动、兼职任务、工具作品或复盘记录。只写自己确实做过的部分。</p>
            ) : null}

            <div className="card-actions">
              {isBlank ? (
                <>
                  <button className="tiny-button" type="button" onClick={() => onEdit(asset.id)}>
                    稍后补充
                  </button>
                  <button className="tiny-button" type="button" onClick={() => setAdviceId(adviceId === asset.id ? null : asset.id)}>
                    查看补强建议
                  </button>
                </>
              ) : (
                <>
                  <button className="tiny-button" type="button" onClick={() => onEdit(editingId === asset.id ? null : asset.id)}>
                    {editingId === asset.id ? '保存修改' : '修改'}
                  </button>
                  <button className="tiny-button" type="button" onClick={() => onIgnore(asset.id)}>
                    暂不使用
                  </button>
                  <button className="tiny-button" type="button" onClick={() => onConfirm(asset.id)}>
                    确认可用
                  </button>
                </>
              )}
              <button className="tiny-button subtle-danger" type="button" onClick={() => onDelete(asset.id)}>
                移除本卡
              </button>
            </div>
          </article>
          );
        })}
      </div>

      <ErrorNotice message={truthError} />

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onBack}>
          返回修改信息
        </button>
        <button className="primary-button" type="button" onClick={onEnterDig} disabled={!hasDiggable}>
          进入 AI 动态追问
        </button>
      </div>
      <AiTaskNotice estimate={getAiWaitEstimate('dig')} />
    </section>
  );
}

function DigPage({
  profile,
  mode,
  isBusy,
  loadingMessage,
  reportLoadingMessage,
  assets,
  currentIndex,
  currentAsset,
  questionSet,
  answer,
  encouragement,
  onAnswer,
  onPrev,
  onNext,
  onSave,
  onSkip,
  onBack,
  onContinue
}: {
  profile: Profile;
  mode: Mode | null;
  isBusy: boolean;
  loadingMessage: string;
  reportLoadingMessage: string;
  assets: AssetCard[];
  currentIndex: number;
  currentAsset: AssetCard | undefined;
  questionSet: DigQuestionSet | null;
  answer: string;
  encouragement: string;
  onAnswer: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onSkip: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const isLastAsset = currentIndex >= assets.length - 1;
  const saveLabel = isLastAsset ? (mode === 'jd' ? '生成完整报告' : '生成经历方向诊断') : '保存并继续';

  return (
    <section className="flow-section">
      <div className="section-heading">
        <p className="eyebrow">每次只问 1-3 个具体问题</p>
        <h1>动态经历挖掘</h1>
        <p>{mode === 'jd' ? 'AI 会结合岗位要求和你确认的经历，每段问 1-3 个问题，帮你找到最值得补充的真实细节。' : 'AI 会围绕你确认的经历，每段问 1-3 个问题，帮你找到可以写进简历或面试回答的真实细节。'}</p>
        <p className="intro-note">这一步不是考你，而是帮你把原本说不清的经历拆开。</p>
      </div>

      {currentAsset ? (
        <section className="dig-panel">
          <div className="dig-progress">
            <span className="status-pill">正在完善：{currentAsset.title} · 第 {currentIndex + 1}/{assets.length} 段</span>
          </div>

          <div className="dig-context">
            <h2>当前经历</h2>
            <span className="status-pill">{currentAsset.title}</span>
            <p>{currentAsset.content}</p>
            <p className="safety-note">下面的问题只围绕这段经历，不会要求你编造结果。</p>
          </div>

          {questionSet?.encouragement ? (
            <div className="dig-context">
              <h2>先给你一个判断</h2>
              <p>{questionSet.encouragement}</p>
            </div>
          ) : null}

          <div className="question-list">
            <h2>AI 想进一步确认</h2>
            <AiTaskNotice estimate={getAiWaitEstimate(reportLoadingMessage ? 'report' : 'dig')} loadingMessage={reportLoadingMessage || loadingMessage} />
            {(questionSet?.userVisibleQuestions ?? []).map((question) => (
              <p key={question}>{question}</p>
            ))}
          </div>

          <label className="field" htmlFor="digAnswer">
            <span>补充回答</span>
            <textarea
              aria-label="补充回答"
              id="digAnswer"
              value={answer}
              onChange={(event) => onAnswer(event.target.value)}
              rows={5}
              placeholder="能想起多少写多少。优先写真实动作、对象、规模、工具、结果或复盘。"
            />
            <p className="helper-text">没有数据也没关系，可以写“大约、每周、参与、协助”等真实边界。</p>
          </label>

          {encouragement ? <p className="encouragement">{encouragement}</p> : null}

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={onPrev} disabled={currentIndex === 0}>
              上一段经历
            </button>
            <button className="secondary-button" type="button" onClick={onNext} disabled={currentIndex >= assets.length - 1}>
              下一段经历
            </button>
            <button className="primary-button" type="button" onClick={onSave} disabled={isBusy}>
              {saveLabel}
            </button>
            <button className="secondary-button" type="button" onClick={onSkip}>
              跳过本段
            </button>
            <button className="secondary-button" type="button" onClick={onBack}>
              返回修改经历卡
            </button>
          </div>
        </section>
      ) : (
        <p className="error-note">当前没有可追问的经历。请返回经历资产卡，至少补充一段真实经历。课程项目、校园活动、兼职、技能作品都可以作为求职材料。</p>
      )}

      {!currentAsset ? (
        <button className="primary-button wide-action" type="button" onClick={onBack} disabled={isBusy}>
          返回修改经历卡
        </button>
      ) : null}
    </section>
  );
}

type DirectionSuggestion = {
  name: string;
  level: '优先探索' | '可以尝试' | '过渡方向' | '先补证据';
  why: string;
  evidence: string;
  gap: string;
  next: string;
  keywords: string[];
};

function buildDirectionSuggestions(profile: Profile, assets: AssetCard[]): DirectionSuggestion[] {
  const usableAssets = assets.filter((asset) => !asset.isGap && asset.status !== '暂不使用' && asset.content.trim());
  const combinedText = [
    profile.targetRole,
    ...usableAssets.flatMap((asset) => [asset.title, asset.content, ...asset.notes])
  ]
    .join(' ')
    .toLowerCase();

  const suggestions: DirectionSuggestion[] = [];
  const hasOperation = /运营|社群|用户|活动|增长|私域|触达/.test(combinedText);
  const hasContent = /公众号|内容|推文|剪映|短视频|视频|排版|新媒体|小红书/.test(combinedText);
  const hasEducation = /教育|教务|学生|课程|老师|机构|培训|活动通知/.test(combinedText);
  const hasData = /excel|问卷|调研|数据|表格|分析/.test(combinedText);

  const evidenceFrom = (...ids: AssetCard['id'][]) =>
    pickEvidence(usableAssets.find((asset) => ids.includes(asset.id))?.content || profile.targetRole);

  if (hasOperation) {
    suggestions.push({
      name: '用户运营 / 社群运营',
      level: '优先探索',
      why: '基于当前经历，更值得优先探索的是能承接社群维护、用户触达和活动支持的执行型运营岗位。',
      evidence: evidenceFrom('internship', 'campus', 'project'),
      gap: '还需要补清楚用户规模、触达频率、活动反馈和复盘结论。',
      next: '补一段真实社群维护案例，写清楚对象、周期、动作、工具和可核实反馈。',
      keywords: ['社群维护', '用户触达', '活动执行', '运营助理']
    });
  }

  if (hasContent) {
    suggestions.push({
      name: '新媒体运营助理',
      level: hasOperation ? '可以尝试' : '优先探索',
      why: '公众号、推文、排版或剪映相关材料，可以作为内容执行和素材整理的起点。',
      evidence: evidenceFrom('skills', 'internship', 'project'),
      gap: '还需要补清楚选题逻辑、内容效果和你在制作流程里的具体边界。',
      next: '选一篇真实内容做复盘，说明选题、素材整理、制作发布和收到的反馈。',
      keywords: ['公众号排版', '推文整理', '剪映', '内容执行']
    });
  }

  if (hasEducation) {
    suggestions.push({
      name: '教务 / 运营助理',
      level: suggestions.length < 2 ? '可以尝试' : '过渡方向',
      why: '教育机构、学生服务或活动通知经历，可以转成服务支持、流程跟进和沟通协调证据。',
      evidence: evidenceFrom('internship', 'campus', 'partTime'),
      gap: '还需要补清楚服务对象、协作流程、通知频率和可核实产出。',
      next: '把一次课程、活动或学生服务支持经历按任务、动作、结果整理出来。',
      keywords: ['学生服务', '活动通知', '流程跟进', '教务支持']
    });
  }

  if (hasData) {
    suggestions.push({
      name: '数据运营助理 / 运营分析助理',
      level: suggestions.length ? '可以尝试' : '优先探索',
      why: '问卷、调研、Excel 或表格整理经历，可以先作为数据整理和运营分析助理方向的入门证据。',
      evidence: evidenceFrom('project', 'skills', 'campus'),
      gap: '还需要补清楚分析目的、处理方法、结论和业务使用方式。',
      next: '把一次表格或问卷整理过程写成小案例，补清楚数据来源、处理动作和输出物。',
      keywords: ['Excel', '问卷整理', '数据清洗', '运营分析']
    });
  }

  if (suggestions.length < 2) {
    suggestions.push(
      {
        name: '运营助理',
        level: '过渡方向',
        why: '如果方向暂时不清楚，可以先探索对执行、整理、沟通要求更明确的入门岗位。',
        evidence: evidenceFrom('project', 'campus', 'skills'),
        gap: '还需要补清楚岗位相关场景、交付物和结果反馈。',
        next: '补一个围绕目标行业的小型复盘项目，形成可展示材料。',
        keywords: ['执行支持', '信息整理', '沟通协作', '运营助理']
      },
      {
        name: '项目助理 / 行政助理',
        level: '过渡方向',
        why: '作为过渡方向，可以用信息整理、流程跟进和协作支持作为保守起点。',
        evidence: evidenceFrom('project', 'campus', 'education'),
        gap: '还需要补清楚稳定推进任务的过程和交付结果。',
        next: '整理一段任务推进经历，写清楚分工、节点和交付物。',
        keywords: ['流程跟进', '资料整理', '协作支持', '项目助理']
      }
    );
  }

  return suggestions.slice(0, 3);
}

function pickEvidence(text: string) {
  const normalized = text.trim();
  return normalized || '当前材料较少，建议先从已填写的项目、校园经历或技能中补充事实证据。';
}

function DirectionPage({
  profile,
  assets,
  isBusy,
  loadingMessage,
  reportTask,
  onBack,
  onReport
}: {
  profile: Profile;
  assets: AssetCard[];
  isBusy: boolean;
  loadingMessage: string;
  reportTask: ReportGenerationTask | null;
  onBack: () => void;
  onReport: () => void;
}) {
  const activeAssets = assets.filter((asset) => !asset.isGap && asset.status !== '暂不使用' && asset.content.trim());
  const suggestions = buildDirectionSuggestions(profile, assets);
  const hasLimitedEvidence = activeAssets.length < 2;
  const assetSignals = activeAssets
    .slice(0, 4)
    .map((asset) => `${asset.title}：${asset.content}`)
    .join('；');
  const skillAsset = activeAssets.find((asset) => asset.id === 'skills');
  const operationSignals = [profile.internship, profile.campus, profile.project, skillAsset?.content || ''].join(' ');
  const signalSummary = [
    /社群|用户|运营|触达/.test(operationSignals) ? '社群维护' : '',
    /公众号|推文|内容|排版/.test(operationSignals) ? '内容整理' : '',
    /学生|用户|社群|活动/.test(operationSignals) ? '用户触达' : '',
    /excel|问卷|调研|数据|表格/i.test(operationSignals) ? '数据整理' : ''
  ].filter(Boolean);

  return (
    <section className="flow-section">
      <div className="section-heading">
        <p className="eyebrow">无岗位要求经历盘点</p>
        <h1>经历方向诊断</h1>
        <p>根据你已确认和补充的经历，AI 会先判断哪些岗位方向更值得探索，再给出补强建议。</p>
        <p className="context-note">这里不是替你决定人生方向，而是帮你从已有材料里找更合理的起点。</p>
      </div>

      <section className="result-block">
        <h2>当前经历筹码</h2>
        {hasLimitedEvidence ? (
          <p className="context-note">当前可用经历较少，方向建议会比较保守。你可以返回经历资产卡补充课程项目、校园活动、兼职或技能作品。</p>
        ) : null}
        {signalSummary.length ? <p className="context-note">初步可见线索：{signalSummary.join('、')}。</p> : null}
        <div className="card-list">
          {activeAssets.length ? (
            activeAssets.slice(0, 4).map((asset) => (
              <article className="insight-card" key={asset.id}>
                <p><strong>{asset.title}：</strong>{asset.content}</p>
                {asset.notes.length ? <p><strong>追问补充：</strong>{asset.notes.join('；')}</p> : null}
              </article>
            ))
          ) : (
            <article className="insight-card">
              <p>当前可用经历较少，方向建议会比较保守。你可以返回经历资产卡补充课程项目、校园活动、兼职或技能作品。</p>
            </article>
          )}
        </div>
      </section>

      <section className="result-block">
        <h2>推荐探索方向</h2>
        <div className="card-list">
          {suggestions.map((item) => (
            <article className="plan-card" data-testid="direction-card" key={item.name}>
              <div className="matrix-heading">
                <h3>{item.name}</h3>
                <span className="status-pill">{item.level}</span>
              </div>
              <p><strong>为什么可以探索：</strong>{item.why}</p>
              <p><strong>当前证据：</strong>{item.evidence}</p>
              <p><strong>主要缺口：</strong>{item.gap}</p>
              <p><strong>下一步补强：</strong>{item.next}</p>
              <p><strong>岗位关键词：</strong>{item.keywords.join('、')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="result-block">
        <h2>方向对比</h2>
        <p className="context-note">以下排序只是探索优先级，不代表你只能选择某一个方向。</p>
        <div className="matrix-table">
          <div className="matrix-row direction-row matrix-header">
            <strong>方向</strong>
            <strong>当前证据</strong>
            <strong>主要缺口</strong>
            <strong>建议优先级</strong>
          </div>
          {suggestions.map((item) => (
            <div className="matrix-row direction-row" key={`${item.name}-compare`}>
              <p>{item.name}</p>
              <p>{item.evidence}</p>
              <p>{item.gap}</p>
              <p>{item.level}</p>
            </div>
          ))}
        </div>
        {assetSignals ? <p className="safety-note">以上建议只基于当前材料：{assetSignals}</p> : null}
      </section>

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onBack}>
          返回动态追问
        </button>
        <button className="primary-button" type="button" onClick={onReport} disabled={isBusy}>
          {isBusy ? 'AI 正在生成报告...' : '生成经历诊断报告'}
        </button>
      </div>
      <AiTaskNotice estimate={getAiWaitEstimate('report')} loadingMessage={loadingMessage} />
      <ReportTaskProgress task={reportTask} isBusy={isBusy} onContinue={onReport} />
    </section>
  );
}

function MatchPage({
  jdText,
  jdFit,
  isBusy,
  jdFitLoadingMessage,
  reportLoadingMessage,
  reportTask,
  errorMessage,
  onJdText,
  onAnalyze,
  onBack,
  onReport
}: {
  jdText: string;
  jdFit: JdFitReport | null;
  isBusy: boolean;
  jdFitLoadingMessage: string;
  reportLoadingMessage: string;
  reportTask: ReportGenerationTask | null;
  errorMessage: string;
  onJdText: (value: string) => void;
  onAnalyze: () => void;
  onBack: () => void;
  onReport: () => void;
}) {
  const isShortJd = Boolean(jdText.trim()) && jdText.trim().length < 20;

  return (
    <section className="flow-section">
      <div className="section-heading">
        <p className="eyebrow">先输入岗位要求 → AI 分析 → 证据化判断</p>
        <h1>岗位要求证据匹配</h1>
        <p>把岗位要求拆成证据，看你的真实经历能对应哪些要求、缺口在哪里、简历和面试要怎么准备。</p>
        <p className="context-note">判断只是投递建议，不是录取预测。</p>
      </div>

      <label className="field" htmlFor="jdText">
        <span>粘贴目标岗位描述</span>
        <textarea
          aria-label="粘贴目标岗位描述"
          id="jdText"
          value={jdText}
          onChange={(event) => onJdText(event.target.value)}
          rows={7}
          placeholder="复制岗位职责、任职要求、加分项。内容越完整，匹配越准确。"
        />
        <p className="helper-text">如果岗位描述较短，分析可能不完整。建议补充岗位职责和任职要求。</p>
      </label>
      {isShortJd ? <p className="context-note">当前岗位描述较短，分析可能不完整</p> : null}

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onBack}>
          返回动态追问
        </button>
        <button className="primary-button" type="button" onClick={onAnalyze} disabled={isBusy || !jdText.trim()}>
          {isBusy ? 'AI 正在拆解岗位要求，并与你的经历证据做匹配。' : 'AI 分析岗位匹配'}
        </button>
      </div>
      <AiTaskNotice estimate={getAiWaitEstimate('jd-fit')} loadingMessage={jdFitLoadingMessage} />
      <ErrorNotice message={errorMessage} />
      {jdFit ? <p className="context-note">已生成岗位要求证据矩阵，请先查看投递判断和主要缺口。</p> : null}

      {jdFit ? (
        <EvidenceMatrix report={jdFit}>
          <button className="primary-button wide-action" type="button" onClick={onReport} disabled={isBusy}>
            {isBusy ? 'AI 正在生成报告...' : '生成 V0.4 定制诊断报告'}
          </button>
          <AiTaskNotice estimate={getAiWaitEstimate('report')} loadingMessage={reportLoadingMessage} />
          <ReportTaskProgress task={reportTask} isBusy={isBusy} onContinue={onReport} />
        </EvidenceMatrix>
      ) : null}
    </section>
  );
}

function EvidenceMatrix({ report, children, showVerdict = true }: { report: JdFitReport; children?: ReactNode; showVerdict?: boolean }) {
  return (
    <section className="result-block">
      <div className="matrix-heading">
        <div>
          <h2>岗位要求证据矩阵</h2>
          <p>系统不会给分数，而是逐条看岗位要求和真实经历之间有没有证据。</p>
        </div>
        <SourceBadge source={report.source} />
      </div>
      {showVerdict ? (
        <article className="verdict-panel">
          <h2>投递判断</h2>
          <strong>{report.deliveryDecision}</strong>
          <p><span>判断依据</span>{report.deliveryReason}</p>
          <p><span>最强证据</span>{report.strongestEvidence}</p>
          <p><span>主要缺口</span>{report.mainGap}</p>
          <p><span>下一步建议</span>{report.nextStepAdvice}</p>
        </article>
      ) : null}
      <div className="matrix-table">
        <div className="matrix-row matrix-header">
          <strong>岗位要求</strong>
          <strong>匹配程度</strong>
          <strong>用户证据</strong>
          <strong>当前缺口</strong>
          <strong>简历写法</strong>
          <strong>面试风险</strong>
        </div>
        {report.matrix.map((row) => (
          <div className="matrix-row" key={`${row.requirement}-${row.evidence}`}>
            <p>{row.requirement}</p>
            <p>{row.matchLevel}</p>
            <p>{row.evidence}</p>
            <p>{row.gap}</p>
            <p>{row.resumeWriting}</p>
            <p>{row.interviewRisk}</p>
          </div>
        ))}
      </div>
      <p className="safety-note">以上写法只能基于真实经历使用。请确认社群数量、具体动作、参与边界和结果描述是否真实，不能把协助写成负责。</p>
      {children}
    </section>
  );
}

const helpfulPartOptions = [
  '亮点分析',
  '可探索岗位方向',
  '岗位要求匹配分析',
  '简历改写建议',
  '面试追问与回答准备',
  '下一步行动计划',
  '整体报告结构',
  '补强计划具体可执行',
  '其他'
];

const weakPartOptions = [
  '无',
  '亮点分析',
  '可探索岗位方向',
  '岗位要求匹配分析',
  '简历改写建议',
  '面试追问与回答准备',
  '下一步行动计划',
  '整体报告结构',
  '其他，请说明'
];

const payOptions = ['不能', '5-10 元', '10-30 元', '30 元以上'];
const scoreOptions = [
  { score: 1, symbol: '↓', label: '没有帮助', tone: 'score-1' },
  { score: 2, symbol: '↘', label: '帮助较少', tone: 'score-2' },
  { score: 3, symbol: '–', label: '有一点帮助', tone: 'score-3' },
  { score: 4, symbol: '↗', label: '比较有帮助', tone: 'score-4' },
  { score: 5, symbol: '★', label: '非常有帮助', tone: 'score-5' }
];
const credibilityScoreOptions = [
  { score: 1, symbol: '↓', label: '不可信', tone: 'score-1' },
  { score: 2, symbol: '↘', label: '可信度较低', tone: 'score-2' },
  { score: 3, symbol: '–', label: '部分可信', tone: 'score-3' },
  { score: 4, symbol: '↗', label: '比较可信', tone: 'score-4' },
  { score: 5, symbol: '★', label: '非常可信', tone: 'score-5' }
];

const emptyFeedback: ReportFeedback = {
  helpScore: null,
  credibilityScore: null,
  hasObviousInaccuracy: '',
  helpfulParts: [],
  weakParts: [],
  weakPartDetail: '',
  weakOtherDetail: '',
  misjudgedFeedback: '',
  copyableContent: '',
  nextVersionSuggestion: '',
  inaccurateFeedback: '',
  actionIntent: '',
  willingnessToPay: '',
  willingToContinueTesting: '',
  anonymousConsent: false
};

function FeedbackSection({ mode }: { mode: Mode | null }) {
  const [feedback, setFeedback] = useState<ReportFeedback>(emptyFeedback);
  const [scoreError, setScoreError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const actionQuestion =
    mode === 'inventory'
      ? '看完报告后，你是否更清楚下一步该探索什么方向？'
      : '你是否愿意根据这份报告修改简历并投递该岗位？';
  const actionOptions =
    mode === 'inventory'
      ? ['更清楚下一步方向了', '有一点帮助', '还是不清楚']
      : ['会修改简历并投递', '可能会', '不会'];

  const toggleHelpfulPart = (part: string) => {
    setFeedback((current) => ({
      ...current,
      helpfulParts: current.helpfulParts.includes(part)
        ? current.helpfulParts.filter((item) => item !== part)
        : [...current.helpfulParts, part]
    }));
  };

  const toggleWeakPart = (part: string) => {
    setFeedback((current) => {
      if (part === '无') {
        return {
          ...current,
          weakParts: current.weakParts.includes('无') ? [] : ['无'],
          weakPartDetail: current.weakParts.includes('无') ? current.weakPartDetail : '',
          weakOtherDetail: current.weakParts.includes('无') ? current.weakOtherDetail : ''
        };
      }
      const withoutNone = current.weakParts.filter((item) => item !== '无');
      return {
        ...current,
        weakParts: withoutNone.includes(part) ? withoutNone.filter((item) => item !== part) : [...withoutNone, part]
      };
    });
  };

  const submitFeedback = () => {
    if (!feedback.helpScore) {
      setScoreError('请先选择这份报告对你的帮助程度。');
      setSubmitted(false);
      return;
    }
    const submission: FeedbackSubmission = {
      ...feedback,
      mode,
      createdAt: new Date().toISOString()
    };
    const current = JSON.parse(window.localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]') as FeedbackSubmission[];
    window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([...current, submission]));
    setScoreError('');
    setSubmitted(true);
  };

  return (
    <section className="result-block" aria-labelledby="feedback-title">
      <h2 id="feedback-title">报告反馈</h2>
      <p>你的反馈会帮助我们判断这份诊断是否真的有用，也会帮助后续优化报告质量。</p>

      <fieldset className="form-section">
        <legend>这份报告对你有帮助吗？</legend>
        <div className="score-grid">
          {scoreOptions.map((option) => (
            <button
              aria-pressed={feedback.helpScore === option.score}
              className={`score-card ${option.tone} ${feedback.helpScore === option.score ? 'selected' : ''}`}
              key={option.score}
              type="button"
              onClick={() => {
                setFeedback((current) => ({ ...current, helpScore: option.score }));
                setScoreError('');
              }}
            >
              <span className="score-symbol">{option.symbol}</span>
              <strong>{option.score} 分</strong>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        {scoreError ? <p className="error-note" role="alert">{scoreError}</p> : null}
      </fieldset>

      <fieldset className="form-section">
        <legend>这份报告可信吗？</legend>
        <div className="score-grid">
          {credibilityScoreOptions.map((option) => (
            <button
              aria-pressed={feedback.credibilityScore === option.score}
              className={`score-card ${option.tone} ${feedback.credibilityScore === option.score ? 'selected' : ''}`}
              key={option.score}
              type="button"
              onClick={() => setFeedback((current) => ({ ...current, credibilityScore: option.score }))}
            >
              <span className="score-symbol">{option.symbol}</span>
              <strong>{option.score} 分</strong>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>你是否发现明显不准的地方？</legend>
        <div className="field-grid single">
          {['是，有明显不准', '否，没有明显不准'].map((option) => (
            <label className="truth-check" key={option}>
              <input
                type="radio"
                name="hasObviousInaccuracy"
                checked={feedback.hasObviousInaccuracy === (option.startsWith('是') ? '是' : '否')}
                onChange={() => setFeedback((current) => ({ ...current, hasObviousInaccuracy: option.startsWith('是') ? '是' : '否' }))}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>哪一部分最有帮助？（可多选）</legend>
        <div className="field-grid single">
          {helpfulPartOptions.map((part) => (
            <label className="truth-check" key={part}>
              <input type="checkbox" checked={feedback.helpfulParts.includes(part)} onChange={() => toggleHelpfulPart(part)} />
              <span>{part}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>哪个模块最没用、不准或帮助较小？（可多选）</legend>
        <div className="field-grid single">
          {weakPartOptions.map((part) => (
            <label className="truth-check" key={part}>
              <input type="checkbox" checked={feedback.weakParts.includes(part)} onChange={() => toggleWeakPart(part)} />
              <span>{part}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {feedback.weakParts.some((part) => part !== '无' && part !== '其他，请说明') ? (
        <label className="field" htmlFor="weakPartDetail">
          <span>你觉得这个模块哪里不准或没帮助？</span>
          <textarea
            id="weakPartDetail"
            value={feedback.weakPartDetail}
            onChange={(event) => setFeedback((current) => ({ ...current, weakPartDetail: event.target.value }))}
            rows={3}
            placeholder="可以写具体模块、句子或建议。"
          />
        </label>
      ) : null}

      {feedback.weakParts.includes('其他，请说明') ? (
        <label className="field" htmlFor="weakOtherDetail">
          <span>其他模块说明</span>
          <textarea
            id="weakOtherDetail"
            value={feedback.weakOtherDetail}
            onChange={(event) => setFeedback((current) => ({ ...current, weakOtherDetail: event.target.value }))}
            rows={3}
            placeholder="请说明你觉得帮助较小的部分。"
          />
        </label>
      ) : null}

      <label className="field" htmlFor="inaccurateFeedback">
        <span>哪一部分不准确、没帮助，或者不像你的真实情况？</span>
        <textarea
          id="inaccurateFeedback"
          value={feedback.inaccurateFeedback}
          onChange={(event) => setFeedback((current) => ({ ...current, inaccurateFeedback: event.target.value }))}
          rows={4}
          placeholder="例如：岗位方向不准、改写太夸张、面试回答不像我、补强计划不现实……"
        />
      </label>

      <label className="field" htmlFor="misjudgedFeedback">
        <span>有没有让你觉得被误判的地方？</span>
        <textarea
          id="misjudgedFeedback"
          value={feedback.misjudgedFeedback}
          onChange={(event) => setFeedback((current) => ({ ...current, misjudgedFeedback: event.target.value }))}
          rows={3}
          placeholder="例如：目标方向判断偏了、经历理解错了、建议不符合真实情况。"
        />
      </label>

      <label className="field" htmlFor="copyableContent">
        <span>有没有你愿意直接复制使用的内容？</span>
        <textarea
          id="copyableContent"
          value={feedback.copyableContent}
          onChange={(event) => setFeedback((current) => ({ ...current, copyableContent: event.target.value }))}
          rows={3}
          placeholder="可以写简历改写句、行动计划、面试准备片段等。"
        />
      </label>

      <label className="field" htmlFor="nextVersionSuggestion">
        <span>你最希望它下一版改什么？</span>
        <textarea
          id="nextVersionSuggestion"
          value={feedback.nextVersionSuggestion}
          onChange={(event) => setFeedback((current) => ({ ...current, nextVersionSuggestion: event.target.value }))}
          rows={3}
          placeholder="例如：更短、更准、更像人工顾问、增加导出等。"
        />
      </label>

      <fieldset className="form-section">
        <legend>{actionQuestion}</legend>
        <div className="field-grid single">
          {actionOptions.map((option) => (
            <label className="truth-check" key={option}>
              <input
                type="radio"
                name="actionIntent"
                checked={feedback.actionIntent === option}
                onChange={() => setFeedback((current) => ({ ...current, actionIntent: option }))}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>如果完整报告付费，你能接受的价格是？</legend>
        <p className="context-note">仅用于判断产品方向，不会立即收费。</p>
        <div className="field-grid single">
          {payOptions.map((option) => (
            <label className="truth-check" key={option}>
              <input
                type="radio"
                name="willingnessToPay"
                checked={feedback.willingnessToPay === option}
                onChange={() => setFeedback((current) => ({ ...current, willingnessToPay: option }))}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>是否愿意继续帮忙测试？</legend>
        <div className="field-grid single">
          {['是，愿意继续测试', '否，暂时不用'].map((option) => (
            <label className="truth-check" key={option}>
              <input
                type="radio"
                name="willingToContinueTesting"
                checked={feedback.willingToContinueTesting === (option.startsWith('是') ? '是' : '否')}
                onChange={() => setFeedback((current) => ({ ...current, willingToContinueTesting: option.startsWith('是') ? '是' : '否' }))}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="truth-check">
        <input
          type="checkbox"
          checked={feedback.anonymousConsent}
          onChange={(event) => setFeedback((current) => ({ ...current, anonymousConsent: event.target.checked }))}
        />
        <span>
          我同意将本次诊断结果脱敏后用于产品优化和匿名案例研究。
          不会公开你的姓名、学校、联系方式、具体公司或任何能识别你的信息。
        </span>
      </label>
      <p className="context-note">你可以拒绝授权，不影响使用报告。</p>

      <button className="primary-button" type="button" onClick={submitFeedback}>
        提交反馈
      </button>

      {submitted ? (
        <div className="privacy-band" role="status">
          <strong>感谢反馈。你的意见会用于优化诊断质量。</strong>
          {feedback.anonymousConsent ? <p>已记录匿名授权。后续使用前会进行脱敏处理。</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function QualityCheckSection({ report }: { report: DiagnosisReport }) {
  const quality = report.quality;

  return (
    <section className="result-block" aria-labelledby="quality-check-title">
      <h2 id="quality-check-title">内部质量检查</h2>
      {quality ? (
        <>
          <div className="matrix-heading">
            <p>检查状态：{quality.passed ? '通过' : '需要复核'}</p>
            <span className="status-pill">质量分：{quality.score} 分</span>
          </div>
          <div className="card-list">
            <article className="insight-card">
              <p><strong>阻断项</strong></p>
              {quality.blockers.length ? (
                <ul>
                  {quality.blockers.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p>暂无阻断项</p>
              )}
            </article>
            <article className="insight-card">
              <p><strong>提醒项</strong></p>
              {quality.warnings.length ? (
                <ul>
                  {quality.warnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p>暂无提醒项</p>
              )}
            </article>
          </div>
          <p className="context-note">该区域用于内部验收报告质量，不代表录取预测，也不会替代人工复核。</p>
        </>
      ) : (
        <p className="context-note">本次报告未返回质量检查结果。</p>
      )}
    </section>
  );
}

function CopyButton({ text, children }: { text: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Clipboard support can be unavailable in tests or restricted browsers.
    }
    setCopied(true);
  };

  return (
    <button className="tiny-button" type="button" onClick={copy}>
      {copied ? '已复制' : children}
    </button>
  );
}

function ExportMarkdownButton({ report }: { report: DiagnosisReport }) {
  const [exported, setExported] = useState(false);

  const exportMarkdown = () => {
    const markdown = buildReportMarkdown(report);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `job-map-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  return (
    <button className="tiny-button" type="button" onClick={exportMarkdown}>
      {exported ? '已导出 Markdown' : '导出 Markdown'}
    </button>
  );
}

function ReportExportActions({ report }: { report: DiagnosisReport }) {
  return (
    <section className="result-block" aria-label="报告复制和导出">
      <h2>报告复制和导出</h2>
      <div className="action-row">
        <CopyButton text={buildReportText(report)}>复制整份报告</CopyButton>
        <CopyButton text={buildActionPlanText(report)}>复制行动计划</CopyButton>
        <ExportMarkdownButton report={report} />
      </div>
    </section>
  );
}

function getInventoryEvidenceItems(report: DiagnosisReport) {
  const highlightItems = report.highlights.map((item) => ({
    title: item.sourceExperience,
    detail: item.capability
  }));
  const rewriteItems = report.rewrites.map((item) => ({
    title: item.original,
    detail: item.reason
  }));
  const uniqueItems = [...highlightItems, ...rewriteItems].filter(
    (item, index, list) => item.title && list.findIndex((candidate) => candidate.title === item.title) === index
  );

  return uniqueItems.slice(0, 5);
}

function buildInventoryReportDirections(report: DiagnosisReport): DirectionSuggestion[] {
  const reportText = [
    ...report.highlights.flatMap((item) => [item.sourceExperience, item.capability, item.jdRequirement, item.whyNotFlattery, item.professionalExpression]),
    ...report.rewrites.flatMap((item) => [item.original, item.optimized, item.reason, item.jdRequirement]),
    ...report.resumeText,
    ...report.platformFields,
    ...report.previewLines
  ]
    .join(' ')
    .toLowerCase();

  const suggestions: DirectionSuggestion[] = [];
  const pickReportEvidence = (...patterns: RegExp[]) => {
    const matchedHighlight = report.highlights.find((item) =>
      patterns.some((pattern) => pattern.test(`${item.sourceExperience} ${item.capability} ${item.jdRequirement} ${item.whyNotFlattery}`))
    );
    if (matchedHighlight) {
      return `${matchedHighlight.sourceExperience}：${matchedHighlight.capability}`;
    }

    const matchedRewrite = report.rewrites.find((item) =>
      patterns.some((pattern) => pattern.test(`${item.original} ${item.optimized} ${item.reason} ${item.jdRequirement}`))
    );
    return matchedRewrite?.optimized || report.resumeText[0] || '当前材料较少，建议继续补充真实经历证据。';
  };

  if (/运营|社群|用户|活动|增长|私域|触达/.test(reportText)) {
    suggestions.push({
      name: '用户运营 / 社群运营',
      level: '优先探索',
      why: '基于当前经历，更值得优先探索的是能承接社群维护、用户触达和活动执行的运营助理类岗位。',
      evidence: pickReportEvidence(/运营|社群|用户|触达|活动/),
      gap: '还需要补清楚用户规模、触达频率、活动反馈和复盘结论。',
      next: '用 7-14 天整理一段社群或用户触达案例，补齐对象、动作、频率和产出。',
      keywords: ['用户运营', '社群运营', '活动执行', '运营助理']
    });
  }

  if (/公众号|内容|推文|剪映|短视频|视频|排版|新媒体|小红书/.test(reportText)) {
    suggestions.push({
      name: '新媒体运营助理',
      level: suggestions.length ? '可以尝试' : '优先探索',
      why: '内容整理、公众号排版或剪映相关经历，可以先转成内容执行和素材整理的岗位语言。',
      evidence: pickReportEvidence(/公众号|内容|推文|剪映|排版|新媒体/),
      gap: '还需要补清楚选题来源、制作流程、发布反馈和你实际承担的边界。',
      next: '复盘一篇真实推文或视频素材，写清楚从素材到发布的具体动作。',
      keywords: ['新媒体运营', '内容运营', '公众号排版', '短视频剪辑']
    });
  }

  if (/excel|问卷|调研|数据|表格|分析/.test(reportText)) {
    suggestions.push({
      name: '数据运营助理 / 运营分析助理',
      level: suggestions.length ? '可以尝试' : '优先探索',
      why: '问卷、调研和 Excel 整理经历，可以作为数据整理、运营复盘和基础分析的入门证据。',
      evidence: pickReportEvidence(/excel|问卷|调研|数据|表格|分析/),
      gap: '还需要补清楚数据来源、整理方法、结论和结论如何被使用。',
      next: '把一次问卷或表格整理做成小作品，补上数据处理过程和输出截图。',
      keywords: ['数据运营', '运营分析助理', 'Excel', '问卷整理']
    });
  }

  if (suggestions.length < 2) {
    suggestions.push(
      {
        name: '运营助理',
        level: '过渡方向',
        why: '如果目标岗位暂时不明确，可以先探索对执行、整理和沟通要求更清楚的入门岗位。',
        evidence: pickReportEvidence(/执行|整理|沟通|运营|项目/),
        gap: '还需要补清楚具体场景、交付物和结果反馈。',
        next: '补一个围绕目标行业的小型复盘项目，形成可展示材料。',
        keywords: ['运营助理', '执行支持', '信息整理', '沟通协作']
      },
      {
        name: '项目助理 / 行政助理',
        level: '过渡方向',
        why: '作为过渡方向，可以把信息整理、流程跟进和协作支持经历先转成可投递表达。',
        evidence: pickReportEvidence(/项目|整理|流程|协作|支持/),
        gap: '还需要补清楚任务推进过程、节点和交付结果。',
        next: '整理一段任务推进经历，写清楚分工、节点和交付物。',
        keywords: ['项目助理', '行政助理', '流程跟进', '资料整理']
      }
    );
  }

  return suggestions.slice(0, 3);
}

const completionStatusLabels: Record<V07TaskRecord['completionStatus'], string> = {
  done: '已完成',
  partly: '完成一部分',
  not_done: '还没完成'
};

function V07ResumeRoutePanel({
  plan,
  records,
  onSaveRecord
}: {
  plan: V07PlanState | null;
  records: V07TaskRecord[];
  onSaveRecord: (record: V07TaskRecord) => void;
}) {
  const routeTasks = plan?.route === 'has_direction_resume_not_ready' ? plan.tasks.slice(0, 3) : [];
  const todayTask = routeTasks.find((task) => task.status === 'today') || routeTasks[0];
  const [completionStatus, setCompletionStatus] = useState<V07TaskRecord['completionStatus']>('done');
  const [outputText, setOutputText] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [nextAdjustment, setNextAdjustment] = useState('');
  const [message, setMessage] = useState('');

  if (!todayTask) {
    return null;
  }

  const routeRecords = records.filter((record) => record.route === 'has_direction_resume_not_ready');

  const submitRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSaveRecord({
      route: 'has_direction_resume_not_ready',
      day: todayTask.day,
      taskTitle: todayTask.title,
      taskType: todayTask.taskType,
      completionStatus,
      outputText: outputText.trim(),
      evidenceText: evidenceText.trim(),
      reflectionText: reflectionText.trim(),
      nextAdjustment: nextAdjustment.trim(),
      createdAt: new Date().toISOString()
    });
    setMessage('已保存今日记录。');
    setOutputText('');
    setEvidenceText('');
    setReflectionText('');
    setNextAdjustment('');
  };

  return (
    <section className="result-block" aria-labelledby="v07-resume-route-title">
      <p className="eyebrow">21 天陪跑 · 有方向但简历还没准备好</p>
      <h2 id="v07-resume-route-title">V0.7 简历准备路线</h2>

      <article className="verdict-panel">
        <p>
          <span>当前诊断摘要</span>
          你现在的关键问题不是“没有经历”，而是经历还没有被整理成目标岗位能看懂的证据。先把一段真实经历补清楚，再对照岗位语言改成简历表达。
        </p>
        <p>
          <span>下一步复盘/调整提示</span>
          今天先看产物是否具体到背景、动作、工具和结果；如果证据不足，下一步先补事实，不急着美化表达。
        </p>
      </article>

      <section className="result-block">
        <h3>今日行动</h3>
        <article className="plan-card">
          <p><strong>{todayTask.title}</strong></p>
          <p><strong>任务类型：</strong>{todayTask.taskType}</p>
          <p><strong>难度：</strong>{todayTask.difficulty}</p>
          <p><strong>预计时间：</strong>{todayTask.estimatedMinutes} 分钟</p>
          <p><strong>产出标准：</strong>{todayTask.expectedOutput}</p>
          <p><strong>需要证据：</strong>{todayTask.evidenceRequired}</p>
        </article>
      </section>

      <section className="result-block">
        <h3>Day 1-3 任务</h3>
        <div className="card-list">
          {routeTasks.map((task) => (
            <article className="plan-card" key={task.day}>
              <p><strong>{task.title}</strong></p>
              <p><strong>难度：</strong>{task.difficulty}</p>
              <p><strong>预计：</strong>{task.estimatedMinutes} 分钟</p>
              <p><strong>产出：</strong>{task.expectedOutput}</p>
              <p><strong>证据：</strong>{task.evidenceRequired}</p>
            </article>
          ))}
        </div>
      </section>

      <form className="form-section" onSubmit={submitRecord}>
        <h3>今日记录入口</h3>
        <p className="context-note">先不用看完整报告，今天只要完成下面这条记录。</p>
        <fieldset className="inline-options">
          <legend>完成状态</legend>
          {(['done', 'partly', 'not_done'] as const).map((status) => (
            <label key={status}>
              <input
                type="radio"
                name="v07CompletionStatus"
                checked={completionStatus === status}
                onChange={() => setCompletionStatus(status)}
              />
              {completionStatusLabels[status]}
            </label>
          ))}
        </fieldset>

        <label className="field" htmlFor="v07-output-text">
          <span>今天写出来的内容</span>
          <textarea id="v07-output-text" value={outputText} onChange={(event) => setOutputText(event.target.value)} rows={3} />
        </label>

        <label className="field" htmlFor="v07-evidence-text">
          <span>这段内容来自哪段真实经历</span>
          <textarea id="v07-evidence-text" value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} rows={2} />
        </label>

        <label className="field" htmlFor="v07-reflection-text">
          <span>哪里还没写清楚</span>
          <textarea id="v07-reflection-text" value={reflectionText} onChange={(event) => setReflectionText(event.target.value)} rows={2} />
        </label>

        <label className="field" htmlFor="v07-next-adjustment">
          <span>明天先补什么</span>
          <textarea id="v07-next-adjustment" value={nextAdjustment} onChange={(event) => setNextAdjustment(event.target.value)} rows={2} />
        </label>

        <button className="primary-button" type="submit">保存今日记录</button>
        {message ? <p className="context-note">{message}</p> : null}
      </form>

      {routeRecords.length ? (
        <section className="result-block">
          <h3>已记录的今日行动</h3>
          <div className="card-list">
            {routeRecords.map((record) => (
              <article className="insight-card" key={`${record.createdAt}-${record.day}`}>
                <p><strong>{record.taskTitle}</strong></p>
                <p><strong>完成状态：</strong>{completionStatusLabels[record.completionStatus]}</p>
                <p><strong>今日产物：</strong>{record.outputText || '暂未填写'}</p>
                <p><strong>证据来源：</strong>{record.evidenceText || '暂未填写'}</p>
                <p><strong>今日复盘：</strong>{record.reflectionText || '暂未填写'}</p>
                <p><strong>下一步调整：</strong>{record.nextAdjustment || '暂未填写'}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <p className="context-note">旧报告内容会作为诊断依据和材料库保留；真正要推进的是今天的行动产物和复盘记录。</p>
    </section>
  );
}

function ResultPage({
  report,
  mode,
  route,
  plan,
  records,
  onSaveRecord,
  onBack,
  onClear
}: {
  report: DiagnosisReport;
  mode: Mode | null;
  route: V07JobRoute | null;
  plan: V07PlanState | null;
  records: V07TaskRecord[];
  onSaveRecord: (record: V07TaskRecord) => void;
  onBack: () => void;
  onClear: () => void;
}) {
  if (mode === 'jd' && report.jdFit) {
    const jdFit = report.jdFit;
    const interviews = report.interviews || [];
    return (
      <section className="flow-section result-section">
        <div className="section-heading">
          <p className="eyebrow">V0.6 有岗位要求路线</p>
          <h1>岗位要求匹配分析</h1>
          <p>这份报告基于你确认的真实经历和目标岗位描述生成。判断只是投递建议，不是录取预测。</p>
          <SourceBadge source={report.source} />
        </div>

        <BasicReportNotice show={report.isBasic} />

        <section className="result-block">
          <h2>投递判断摘要</h2>
          <article className="verdict-panel">
            <strong>{jdFit.deliveryDecision}</strong>
            <p><span>判断依据</span>{jdFit.deliveryReason}</p>
            <p><span>最强证据</span>{jdFit.strongestEvidence}</p>
            <p><span>主要缺口</span>{jdFit.mainGap}</p>
            <p><span>下一步建议</span>{jdFit.nextStepAdvice}</p>
          </article>
        </section>

        <section className="result-block">
          <h2>真实经历亮点</h2>
          <div className="card-list">
            {report.highlights.map((item) => (
              <article className="insight-card" data-testid="highlight-card" key={item.professionalExpression}>
                <p><strong>来自经历：</strong>{item.sourceExperience}</p>
                <p><strong>对应岗位要求：</strong>{item.jdRequirement}</p>
                <p><strong>体现能力：</strong>{item.capability}</p>
                <p><strong>为什么是真实亮点：</strong>{item.whyNotFlattery}</p>
                <p><strong>专业表达：</strong>{item.professionalExpression}</p>
                <p><strong>风险边界：</strong>只能基于真实分工和真实产出表达，不能夸大职责。</p>
              </article>
            ))}
          </div>
        </section>

        <EvidenceMatrix report={jdFit} showVerdict={false} />

        <section className="result-block">
          <h2>简历改写建议</h2>
          <div className="card-list">
            {report.rewrites.map((item) => (
              <article className="rewrite-card" data-testid="rewrite-card" key={item.optimized}>
                <p><strong>原始表达：</strong>{item.original}</p>
                <p><strong>可直接使用版：</strong>{item.optimized}</p>
                <p><strong>匹配的岗位要求：</strong>{item.jdRequirement}</p>
                <p><strong>为什么这样改：</strong>{item.reason}</p>
                <p><strong>面试可能追问：</strong>{item.interviewProbe}</p>
                <p><strong>使用提醒：</strong>{item.risk}</p>
                <CopyButton text={item.optimized}>复制优化表达</CopyButton>
              </article>
            ))}
          </div>
        </section>

        <section className="result-block">
          <h2>面试追问与回答准备</h2>
          <div className="card-list">
            {interviews.map((item) => (
              <article className="interview-card" data-testid="interview-card" key={item.question}>
                <p><strong>面试问题：</strong>{item.question}</p>
                <p><strong>HR 为什么可能会问：</strong>{item.whyAsk}</p>
                <p><strong>回答思路：</strong>{item.answerAngle}</p>
                <p><strong>关注点：</strong>{item.concern}</p>
                <p><strong>占位式表达：</strong>{item.sampleAnswer}</p>
                <p><strong>注意边界：</strong>{item.doNotExaggerate}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="result-block">
          <h2>风险提醒</h2>
          <p className="safety-note">这份简历改写可以使用，但需要你确认：社群数量、具体动作、参与边界和结果描述是否真实，不能把协助写成负责。</p>
        </section>

        <section className="result-block">
          <h2>下一步行动计划</h2>
          <div className="card-list">
            {report.actionPlan.plans.map((item) => (
              <article className="plan-card" data-testid="action-plan-card" key={`${item.period}-${item.action}`}>
                <p><strong>周期：</strong>{item.period}</p>
                <p><strong>动作：</strong>{item.action}</p>
                <p><strong>产出物：</strong>{item.deliverable}</p>
                <p><strong>简历用法：</strong>{item.resumeUsage}</p>
                <p><strong>补强能力：</strong>{item.targetAbility}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="result-block">
          <h2>信心修复总结</h2>
          <p>{report.actionPlan.confidenceSummary}</p>
        </section>

        <section className="result-block">
          <h2>简历正文版</h2>
          <pre>{report.resumeText.join('\n\n')}</pre>
          <SafetyNotice />
        </section>

        <section className="result-block">
          <h2>招聘平台字段版</h2>
          <pre>{report.platformFields.join('\n\n')}</pre>
          <SafetyNotice />
        </section>

        <section className="result-block preview-paper">
          <h2>极简预览版</h2>
          <div className="resume-preview">
            {report.previewLines.map((line, index) => (index === 0 ? <h3 key={line}>{line}</h3> : <p key={line}>{line}</p>))}
          </div>
          <p className="privacy-copy">预览默认脱敏：不展示真实姓名、手机号、邮箱、家庭住址。</p>
          <SafetyNotice />
        </section>

        <ReportExportActions report={report} />

        <QualityCheckSection report={report} />

        <FeedbackSection mode={mode} />

        <div className="action-row">
          <button className="secondary-button" type="button" onClick={onBack}>
            返回上一步
          </button>
          <button className="danger-button" type="button" onClick={onClear}>
            清除本次分析数据
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'inventory') {
    const evidenceItems = getInventoryEvidenceItems(report);
    const directions = buildInventoryReportDirections(report);
    const evidenceSummary = evidenceItems.length
      ? evidenceItems.map((item) => item.detail).join('、')
      : '当前可用材料还比较少';
    const primaryDirection = directions[0]?.name || '运营助理';

    return (
      <section className="flow-section result-section">
        <div className="section-heading">
          <p className="eyebrow">V0.6 无岗位要求路线</p>
          <h1>经历诊断报告</h1>
          <p>这份报告基于你确认的真实经历生成。它不是替你决定人生方向，而是帮你看清当前筹码、可探索方向和下一步补强路径。</p>
          <SourceBadge source={report.source} />
        </div>

        <BasicReportNotice show={report.isBasic} />

        {route === 'has_direction_resume_not_ready' ? (
          <V07ResumeRoutePanel plan={plan} records={records} onSaveRecord={onSaveRecord} />
        ) : null}

        <section className="result-block">
          <h2>报告摘要</h2>
          <article className="verdict-panel">
            <p><span>当前求职起点</span>你不是“没有经历”，而是经历还没有被整理成岗位语言。当前最可用的筹码是：{evidenceSummary}。</p>
            <p><span>建议优先探索方向</span>基于当前材料，可以先从“{primaryDirection}”开始探索，同时保留相邻方向作为比较。</p>
            <p><span>下一步重点</span>先把 1-2 段真实经历补清楚动作、对象、工具、频率和产出，再用于简历表达。</p>
          </article>
        </section>

        <section className="result-block">
          <h2>当前经历筹码总结</h2>
          {evidenceItems.length ? (
            <div className="card-list">
              {evidenceItems.map((item) => (
                <article className="insight-card" key={`${item.title}-${item.detail}`}>
                  <p><strong>{item.title}：</strong>{item.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="context-note">当前可用材料还比较少，建议后续补充课程项目、校园活动、兼职或技能作品，让方向判断更准确。</p>
          )}
        </section>

        <section className="result-block">
          <h2>真实经历亮点</h2>
          <div className="card-list">
            {report.highlights.map((item) => (
              <article className="insight-card" data-testid="inventory-highlight-card" key={item.professionalExpression}>
                <p><strong>来自经历：</strong>{item.sourceExperience}</p>
                <p><strong>体现能力：</strong>{item.capability}</p>
                <p><strong>可迁移方向/能力场景：</strong>{item.jdRequirement}</p>
                <p><strong>为什么有价值：</strong>{item.whyNotFlattery}</p>
                <p><strong>专业表达：</strong>{item.professionalExpression}</p>
                <p><strong>不能夸大的地方：</strong>只能基于真实分工和真实产出表达，不把参与写成负责。</p>
              </article>
            ))}
          </div>
        </section>

        <section className="result-block">
          <h2>可探索岗位方向</h2>
          <div className="card-list">
            {directions.map((item) => (
              <article className="plan-card" data-testid="report-direction-card" key={item.name}>
                <div className="matrix-heading">
                  <h3>{item.name}</h3>
                  <span className="status-pill">{item.level}</span>
                </div>
                <p><strong>探索优先级：</strong>{item.level}</p>
                <p><strong>为什么可以探索：</strong>{item.why}</p>
                <p><strong>对应经历证据：</strong>{item.evidence}</p>
                <p><strong>当前缺口：</strong>{item.gap}</p>
                <p><strong>7 天验证动作：</strong>{item.next}</p>
                <p><strong>可搜索岗位名称：</strong>{item.keywords.join('、')}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="result-block">
          <h2>简历改写建议</h2>
          <div className="card-list">
            {report.rewrites.map((item) => (
              <article className="rewrite-card" data-testid="inventory-rewrite-card" key={item.optimized}>
                <p><strong>原始表达：</strong>{item.original}</p>
                <p><strong>可直接使用版：</strong>{item.optimized}</p>
                <p><strong>为什么这样改：</strong>{item.reason}</p>
                <p><strong>使用提醒：</strong>{item.risk}</p>
                <CopyButton text={item.optimized}>复制优化表达</CopyButton>
              </article>
            ))}
          </div>
        </section>

        <section className="result-block">
          <h2>下一步行动计划</h2>
          <div className="card-list">
            {report.actionPlan.plans.map((item) => (
              <article className="plan-card" data-testid="inventory-action-plan-card" key={`${item.period}-${item.action}`}>
                <p><strong>周期：</strong>{item.period}</p>
                <p><strong>动作：</strong>{item.action}</p>
                <p><strong>产出物：</strong>{item.deliverable}</p>
                <p><strong>简历用法：</strong>{item.resumeUsage}</p>
                <p><strong>补强能力：</strong>{item.targetAbility}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="result-block">
          <h2>信心修复总结</h2>
          <p>{report.actionPlan.confidenceSummary}</p>
        </section>

        <section className="result-block">
          <h2>简历正文版</h2>
          <pre>{report.resumeText.join('\n\n')}</pre>
          <SafetyNotice />
        </section>

        <section className="result-block">
          <h2>招聘平台字段版</h2>
          <pre>{report.platformFields.join('\n\n')}</pre>
          <SafetyNotice />
        </section>

        <section className="result-block preview-paper">
          <h2>极简预览版</h2>
          <div className="resume-preview">
            {report.previewLines.map((line, index) => (index === 0 ? <h3 key={line}>{line}</h3> : <p key={line}>{line}</p>))}
          </div>
          <p className="privacy-copy">预览默认脱敏：不展示真实姓名、手机号、邮箱、家庭住址。</p>
          <SafetyNotice />
        </section>

        <ReportExportActions report={report} />

        <QualityCheckSection report={report} />

        <FeedbackSection mode={mode} />

        <div className="action-row">
          <button className="secondary-button" type="button" onClick={onBack}>
            返回上一步
          </button>
          <button className="danger-button" type="button" onClick={onClear}>
            清除本次分析数据
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flow-section result-section">
      <div className="section-heading">
        <p className="eyebrow">V0.4 AI 求职诊断</p>
        <h1>诊断报告</h1>
        <p>报告只基于已确认真实经历生成。复制到第三方平台后，隐私保护由第三方平台规则决定。</p>
        <SourceBadge source={report.source} />
      </div>

      <BasicReportNotice show={report.isBasic} />

      <section className="result-block">
        <h2>真实经历亮点</h2>
        <div className="card-list">
          {report.highlights.map((item) => (
            <article className="insight-card" data-testid="highlight-card" key={item.professionalExpression}>
              <p><strong>来自经历：</strong>{item.sourceExperience}</p>
              <p><strong>体现能力：</strong>{item.capability}</p>
              <p><strong>匹配要求：</strong>{item.jdRequirement}</p>
              <p><strong>为什么不是硬夸：</strong>{item.whyNotFlattery}</p>
              <p><strong>专业表达：</strong>{item.professionalExpression}</p>
            </article>
          ))}
        </div>
        <SafetyNotice />
      </section>

      <section className="result-block">
        <h2>简历改写建议</h2>
        <div className="card-list">
          {report.rewrites.map((item) => (
            <article className="rewrite-card" data-testid="rewrite-card" key={item.optimized}>
              <p><strong>原始表达：</strong>{item.original}</p>
              <p><strong>可直接使用版：</strong>{item.optimized}</p>
              <p><strong>优化理由：</strong>{item.reason}</p>
              <p><strong>对应岗位要求：</strong>{item.jdRequirement}</p>
              <p><strong>风险提醒：</strong>{item.risk}</p>
              <p><strong>面试可能被追问点：</strong>{item.interviewProbe}</p>
            </article>
          ))}
        </div>
        <SafetyNotice />
      </section>

      {report.jdFit ? <EvidenceMatrix report={report.jdFit} /> : null}

      <section className="result-block">
        <h2>面试追问与回答准备</h2>
        <div className="card-list">
          {(report.interviews || []).map((item) => (
            <article className="interview-card" data-testid="interview-card" key={item.question}>
              <p><strong>面试问题：</strong>{item.question}</p>
              <p><strong>HR 为什么可能会问：</strong>{item.whyAsk}</p>
              <p><strong>回答思路：</strong>{item.answerAngle}</p>
              <p><strong>关注点：</strong>{item.concern}</p>
              <p><strong>占位式表达：</strong>{item.sampleAnswer}</p>
              <p><strong>注意边界：</strong>{item.doNotExaggerate}</p>
            </article>
          ))}
        </div>
        <SafetyNotice />
      </section>

      <section className="result-block">
        <h2>明确投递判断</h2>
        <article className="verdict-panel">
          <span>建议</span>
          <strong>{report.jdFit?.deliveryDecision || '待判断'}</strong>
          <p>{report.jdFit?.deliveryReason || '当前报告未生成岗位投递判断。'}</p>
          <p>{report.jdFit?.strongestEvidence || ''}</p>
          <p>{report.jdFit?.mainGap || ''}</p>
          <p>{report.jdFit?.nextStepAdvice || ''}</p>
        </article>
      </section>

      <section className="result-block">
        <h2>下一步行动计划</h2>
        <div className="card-list">
          {report.actionPlan.plans.map((item) => (
            <article className="plan-card" data-testid="action-plan-card" key={`${item.period}-${item.action}`}>
              <p><strong>时间周期：</strong>{item.period}</p>
              <p><strong>具体行动：</strong>{item.action}</p>
              <p><strong>可交付成果：</strong>{item.deliverable}</p>
              <p><strong>怎么写进简历：</strong>{item.resumeUsage}</p>
              <p><strong>帮助的岗位能力：</strong>{item.targetAbility}</p>
            </article>
          ))}
        </div>
        <SafetyNotice />
      </section>

      <section className="result-block">
        <h2>事实型信心修复总结</h2>
        <p>{report.actionPlan.confidenceSummary}</p>
        <SafetyNotice />
      </section>

      <section className="result-block">
        <h2>简历正文版</h2>
        <pre>{report.resumeText.join('\n\n')}</pre>
        <SafetyNotice />
      </section>

      <section className="result-block">
        <h2>招聘平台字段版</h2>
        <pre>{report.platformFields.join('\n\n')}</pre>
        <SafetyNotice />
      </section>

      <section className="result-block preview-paper">
        <h2>极简预览版</h2>
        <div className="resume-preview">
          {report.previewLines.map((line, index) => (index === 0 ? <h3 key={line}>{line}</h3> : <p key={line}>{line}</p>))}
        </div>
        <p className="privacy-copy">预览默认脱敏：不展示真实姓名、手机号、邮箱、家庭住址。</p>
        <SafetyNotice />
      </section>

      <aside className="privacy-band">
        <strong>隐私与删除</strong>
        <p>本原型只在你勾选真实性确认后保存临时会话数据。你可以随时清除本次分析数据。</p>
      </aside>

      <ReportExportActions report={report} />

      <QualityCheckSection report={report} />

      <FeedbackSection mode={mode} />

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onBack}>
          返回上一步
        </button>
        <button className="danger-button" type="button" onClick={onClear}>
          清除本次分析数据
        </button>
      </div>
    </section>
  );
}

function BasicReportNotice({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <section className="result-block basic-report-notice">
      <h2>基础版报告</h2>
      <p>当前已为你生成基础版报告。内容基于你确认过的信息和稳定规则整理，会偏保守，但不会替你编造经历。你可以先参考，系统也会继续尝试补全深度内容。</p>
    </section>
  );
}

export default App;
