import { expect, test } from 'vitest';
import { buildActionPlanText, buildReportMarkdown, buildReportText } from './reportExport';
import type { DiagnosisReport } from './types';

const sampleReport: DiagnosisReport = {
  mode: 'inventory',
  source: 'real',
  isBasic: false,
  summary: '基于已确认经历生成的诊断摘要。',
  highlights: [
    {
      sourceExperience: '教育机构新媒体运营实习',
      capability: '社群维护',
      jdRequirement: '用户运营',
      whyNotFlattery: '来自真实社群维护动作。',
      professionalExpression: '协助维护学生社群并整理反馈。'
    }
  ],
  directionOptions: [
    {
      directionName: '用户运营 / 社群运营',
      name: '用户运营 / 社群运营',
      level: '优先探索',
      priority: '优先探索',
      searchableJobNames: ['用户运营', '社群运营'],
      whyExplore: '已有社群维护证据。',
      why: '已有社群维护证据。',
      evidence: '维护 3 个学生社群。',
      gap: '缺少复盘数据。',
      sevenDayValidation: '7 天内整理社群复盘。',
      next: '整理社群复盘。',
      keywords: ['用户运营']
    }
  ],
  rewrites: [
    {
      relatedExperience: '教育机构新媒体运营实习',
      originalIssue: '表达零散。',
      capability: '社群维护',
      directVersion: '协助维护学生社群并整理反馈。',
      versionAfterSupplement: '补充频率后再写。',
      usageReminder: '按真实情况使用。',
      original: '维护社群',
      optimized: '协助维护学生社群并整理反馈。',
      reason: '更清楚。',
      jdRequirement: '用户运营',
      risk: '不能夸大。',
      interviewProbe: '会被问频率。'
    }
  ],
  actionPlan: {
    source: 'real',
    plans: [
      {
        period: '7 天内',
        what: '整理经历素材表。',
        why: '确认真实证据。',
        how: '按任务、工具、产出整理。',
        completionStandard: '完成 1 份素材表。',
        jobSearchValue: '用于改写简历。',
        action: '整理经历素材表。',
        deliverable: '完成 1 份素材表。',
        resumeUsage: '用于改写简历。',
        targetAbility: '真实证据整理'
      }
    ],
    confidenceSummary: '先把真实经历整理清楚。'
  },
  safetyNotes: ['不编造经历。'],
  resumeText: ['求职意向：用户运营'],
  platformFields: ['个人优势：社群维护'],
  previewLines: ['用户运营']
};

test('buildReportMarkdown exports the complete report without provider internals', () => {
  const markdown = buildReportMarkdown(sampleReport);

  expect(markdown).toContain('# 求职诊断报告');
  expect(markdown).toContain('## 报告摘要');
  expect(markdown).toContain('## 真实经历亮点');
  expect(markdown).toContain('## 可探索岗位方向');
  expect(markdown).toContain('## 简历改写建议');
  expect(markdown).toContain('## 下一步行动计划');
  expect(markdown).toContain('协助维护学生社群并整理反馈。');
  expect(markdown).toContain('- **周期：** 7 天内');
  expect(markdown).not.toMatch(/provider|token|base url|api key|DeepSeek|Qwen|Kimi/i);
});

test('buildReportText and buildActionPlanText produce copy-friendly plain text', () => {
  const text = buildReportText(sampleReport);
  const actionPlan = buildActionPlanText(sampleReport);

  expect(text).toContain('求职诊断报告');
  expect(text).toContain('简历改写建议');
  expect(text).toContain('下一步行动计划');
  expect(actionPlan).toContain('7 天内');
  expect(actionPlan).toContain('整理经历素材表。');
  expect(actionPlan).not.toContain('#');
});
