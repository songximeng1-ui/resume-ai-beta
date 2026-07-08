import { describe, expect, test } from 'vitest';

import { buildBasicReport, BASIC_REPORT_NOTICE } from './basicReport.ts';
import type { AssetCard, Profile } from '../src/types.ts';

const profile: Profile = {
  education: '本科',
  schoolName: '杭州应用技术学院',
  major: '市场营销',
  graduation: '2026',
  city: '杭州',
  targetRole: '用户运营',
  internship: '教育机构新媒体运营实习，维护学生社群并整理公众号推文素材。',
  project: '校园二手交易调研项目，设计问卷并用 Excel 整理结果。',
  campus: '',
  partTime: '',
  awards: '',
  skills: 'Excel、公众号排版、剪映',
  portfolio: ''
};

const assets: AssetCard[] = [
  {
    id: 'internship',
    title: '教育机构新媒体运营实习',
    content: '维护学生社群，整理公众号推文素材，记录用户反馈。',
    status: '确认使用',
    confirmed: true,
    source: 'real',
    isGap: false,
    notes: []
  },
  {
    id: 'project',
    title: '校园二手交易调研项目',
    content: '设计问卷，用 Excel 整理结果，并完成课堂展示。',
    status: '编辑后确认',
    confirmed: true,
    source: 'real',
    isGap: false,
    notes: []
  },
  {
    id: 'campus',
    title: '待核实学生会经历',
    content: '组织过大型活动。',
    status: '待确认',
    confirmed: false,
    source: 'real',
    isGap: false,
    notes: []
  }
];

const unsafeWords = /主导|负责全流程|显著提升|保证 offer/;

describe('buildBasicReport', () => {
  test('builds a conservative inventory report from confirmed assets only', () => {
    const report = buildBasicReport({ mode: 'inventory', profile, assets, jdText: '' });
    const serialized = JSON.stringify(report);

    expect(report.isBasic).toBe(true);
    expect(report.source).toBe('real');
    expect(report.summary).toContain(BASIC_REPORT_NOTICE);
    expect(report.directionOptions).toHaveLength(2);
    expect(report.jdFit).toBeUndefined();
    expect(report.interviews).toBeUndefined();
    expect(report.rewrites.length).toBeGreaterThanOrEqual(3);
    expect(report.actionPlan.plans.filter((item) => item.period === '7 天内')).toHaveLength(2);
    expect(report.actionPlan.plans.filter((item) => item.period === '14 天内')).toHaveLength(2);
    expect(report.actionPlan.plans.filter((item) => item.period === '30 天内')).toHaveLength(2);
    expect(serialized).toContain('教育机构新媒体运营实习');
    expect(serialized).toContain('校园二手交易调研项目');
    expect(serialized).not.toContain('待核实学生会经历');
    expect(serialized).not.toMatch(unsafeWords);
  });

  test('builds a JD report with evidence-bound fit and five placeholder interview preparations', () => {
    const report = buildBasicReport({
      mode: 'jd',
      profile,
      assets,
      jdText: '用户运营实习生，需要社群维护、用户反馈整理、内容协作和数据复盘能力。'
    });

    expect(report.isBasic).toBe(true);
    expect(report.jdFit?.matrix.length).toBeGreaterThanOrEqual(3);
    expect(report.interviews).toHaveLength(5);
    expect(report.directionOptions).toBeUndefined();
    expect(report.rewrites.length).toBeGreaterThanOrEqual(3);
    expect(report.jdFit?.matrix.map((row) => row.evidence).join('\n')).toContain('教育机构新媒体运营实习');
    expect(report.interviews?.map((item) => item.sampleAnswer).join('\n')).toContain('请按你的真实情况补充');
    expect(JSON.stringify(report)).not.toContain('待核实学生会经历');
    expect(JSON.stringify(report)).not.toMatch(unsafeWords);
  });
});
