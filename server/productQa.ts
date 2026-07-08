import type { AssetCard, DiagnosisReport, Profile, ReportQualityResult } from '../src/types.ts';
import { buildBasicReport } from './basicReport.ts';
import { findUnsafeAdvice, validateReportQuality } from './reportQuality.ts';

export interface V04ProductQaSample {
  resumeText: string;
  jdText: string;
  confusion: string;
  profile: Profile;
  assets: AssetCard[];
}

export interface V04ProductQaCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface V04ProductQaResult {
  sample: V04ProductQaSample;
  report: DiagnosisReport;
  quality: ReportQualityResult;
  checks: V04ProductQaCheck[];
}

export const v04RealisticJdSample: V04ProductQaSample = {
  resumeText:
    '张同学，杭州应用技术学院市场营销本科，2026 届。教育机构新媒体运营实习 2 个月，维护 3 个学生社群，整理公众号推文素材并记录用户反馈。校园二手交易调研项目中设计问卷，用 Excel 整理结果并完成课堂展示。技能包括 Excel、公众号排版、剪映。',
  jdText:
    '用户运营实习生，负责社群日常维护、用户反馈整理、活动通知协作、基础内容整理和数据复盘，要求能使用 Excel，有耐心，能把用户问题记录清楚。',
  confusion: '不知道自己能投什么岗位，也担心简历太普通、经历不够像运营。',
  profile: {
    education: '本科',
    schoolName: '杭州应用技术学院',
    major: '市场营销',
    graduation: '2026',
    city: '杭州',
    targetRole: '用户运营实习生',
    internship: '教育机构新媒体运营实习 2 个月，维护 3 个学生社群，整理公众号推文素材并记录用户反馈。',
    project: '校园二手交易调研项目，设计问卷，用 Excel 整理结果并完成课堂展示。',
    campus: '',
    partTime: '',
    awards: '',
    skills: 'Excel、公众号排版、剪映',
    portfolio: ''
  },
  assets: [
    {
      id: 'internship',
      title: '教育机构新媒体运营实习',
      content: '2 个月内维护 3 个学生社群，整理公众号推文素材，并记录用户反馈。',
      status: '确认使用',
      confirmed: true,
      source: 'real',
      isGap: false,
      sourceDescription: '来自真实感 QA 样本中的简历文本。',
      notes: ['用户确认社群数量、周期和反馈记录均为真实经历。']
    },
    {
      id: 'project',
      title: '校园二手交易调研项目',
      content: '设计问卷，用 Excel 整理调研结果，并完成课堂展示。',
      status: '编辑后确认',
      confirmed: true,
      source: 'real',
      isGap: false,
      sourceDescription: '来自真实感 QA 样本中的项目材料。',
      notes: ['用户确认本人参与问卷设计和 Excel 汇总。']
    },
    {
      id: 'campus',
      title: '校园活动经历',
      content: '',
      status: '暂未填写',
      confirmed: false,
      source: 'real',
      isGap: true,
      sourceDescription: '当前未识别到对应经历，可稍后补充真实材料。',
      notes: []
    }
  ]
};

function hasHiddenAgentLabels(report: DiagnosisReport): boolean {
  return /TAR|PART|PREP|HR 视角|为什么问|事实回忆维度/.test(JSON.stringify(report));
}

function hasConfirmedAssetEvidence(report: DiagnosisReport, assets: AssetCard[]): boolean {
  const text = JSON.stringify(report);
  return assets
    .filter((asset) => asset.confirmed && asset.content.trim())
    .every((asset) => text.includes(asset.title) || text.includes(asset.content.slice(0, 12)));
}

export function runV04ProductQa(sample: V04ProductQaSample = v04RealisticJdSample): V04ProductQaResult {
  const report = buildBasicReport({
    mode: 'jd',
    profile: sample.profile,
    assets: sample.assets,
    jdText: sample.jdText
  });
  const quality = validateReportQuality(report, 'jd');
  const unsafeFindings = findUnsafeAdvice(report);
  const checks: V04ProductQaCheck[] = [
    {
      name: 'collects resume, JD and confusion',
      passed: Boolean(sample.resumeText.trim() && sample.jdText.trim() && sample.confusion.trim()),
      detail: 'QA 样本必须同时包含简历、目标岗位 JD 和求职困惑。'
    },
    {
      name: 'binds report evidence to confirmed assets',
      passed: hasConfirmedAssetEvidence(report, sample.assets),
      detail: '报告必须能追溯到已确认经历资产。'
    },
    {
      name: 'keeps internal agent labels hidden',
      passed: !hasHiddenAgentLabels(report),
      detail: '用户可见输出不能暴露 TAR、PART、PREP 或内部追问标签。'
    },
    {
      name: 'avoids fabrication and overpromising',
      passed: unsafeFindings.length === 0,
      detail: '报告不能鼓励编造、夸大或承诺 offer。'
    }
  ];

  return {
    sample,
    report,
    quality,
    checks
  };
}
