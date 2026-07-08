import { validateKimiExtract, type KimiExtract } from './schemas.ts';

export type TaskPackageModule =
  | 'asset_cards'
  | 'dynamic_questions'
  | 'no_jd_direction'
  | 'jd_match'
  | 'resume_rewrite'
  | 'interview_prep'
  | 'action_plan'
  | 'report';

type TaskPackageMode = 'inventory' | 'jd';
type TaskPackageStage = 'junior' | 'senior';

type TaskPackageAsset = {
  id?: unknown;
  title: string;
  content: string;
  confirmed?: boolean;
  status?: string;
  sourceDescription?: string;
  notes?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeMode(value: unknown): TaskPackageMode {
  return value === 'jd' ? 'jd' : 'inventory';
}

function normalizeStage(value: unknown): TaskPackageStage {
  return value === 'junior' ? 'junior' : 'senior';
}

function normalizeModule(value: unknown): TaskPackageModule {
  const moduleName = readString(value, 'report');
  const modules: TaskPackageModule[] = [
    'asset_cards',
    'dynamic_questions',
    'no_jd_direction',
    'jd_match',
    'resume_rewrite',
    'interview_prep',
    'action_plan',
    'report'
  ];
  return modules.includes(moduleName as TaskPackageModule) ? (moduleName as TaskPackageModule) : 'report';
}

function normalizeAsset(value: unknown): TaskPackageAsset | null {
  if (!isRecord(value)) return null;
  const title = readString(value.title, readString(value.id, '未命名经历'));
  const content = readString(value.content, title);
  return {
    ...value,
    title,
    content,
    confirmed: value.confirmed === true,
    status: readString(value.status),
    sourceDescription: readString(value.sourceDescription),
    notes: Array.isArray(value.notes) ? value.notes : []
  };
}

function isConfirmedAsset(asset: TaskPackageAsset) {
  return asset.confirmed === true || asset.status === '确认使用' || asset.status === '编辑后确认' || asset.status === '已确认';
}

function readRequirements(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.requirements)) return [];
  return value.requirements.map(String).map((item) => item.trim()).filter(Boolean);
}

function normalizeKimiExtract(value: unknown): KimiExtract | null {
  if (!value) return null;
  return validateKimiExtract(value);
}

export function buildTaskPackage(input: Record<string, unknown>) {
  const assets = Array.isArray(input.assets) ? input.assets.map(normalizeAsset).filter((asset): asset is TaskPackageAsset => Boolean(asset)) : [];
  const confirmedAssets = assets.filter(isConfirmedAsset);
  const excludedAssets = assets.filter((asset) => asset.status === '暂不使用');
  const unconfirmedAssets = assets
    .filter((asset) => !confirmedAssets.includes(asset))
    .map((asset) => asset.content || asset.title || '未确认经历');
  const requirements = readRequirements(input.jdSummary);
  const kimiExtract = normalizeKimiExtract(input.kimiExtract);

  return {
    meta: {
      version: 'v0.4',
      mode: normalizeMode(input.mode),
      userStage: normalizeStage(input.stage),
      module: normalizeModule(input.module),
      language: 'zh-CN'
    },
    userProfile: isRecord(input.profile) ? input.profile : {},
    confirmedAssets,
    excludedAssets,
    kimiExtract,
    pendingOrUnverifiedInfo: kimiExtract?.verificationNotes || [],
    userAnswers: Array.isArray(input.userAnswers) ? input.userAnswers : [],
    jd: {
      rawText: readString(input.jdText),
      structuredRequirements: requirements.map((requirement, index) => ({
        id: `req_${index + 1}`,
        requirement,
        sourceText: requirement
      }))
    },
    currentTask: {
      goal: readString(input.goal),
      outputSchemaName: readString(input.outputSchemaName),
      qualityRules: [
        '所有判断必须基于用户确认过的真实经历',
        '证据不足时标注当前证据不足或需补充依据',
        '输出必须可行动、可复查、不过度承诺'
      ],
      safetyRules: ['不伪造经历', '不编造数据', '不夸大职责', '不承诺 offer']
    },
    forbiddenInputs: {
      unconfirmedAssets,
      disallowedClaims: ['伪造学历', '伪造公司', '编造数据', '把参与写成负责']
    }
  };
}
