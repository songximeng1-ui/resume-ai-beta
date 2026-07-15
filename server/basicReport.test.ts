import { describe, expect, test } from 'vitest';

import { buildBasicReport, BASIC_REPORT_NOTICE } from './basicReport.ts';
import type { AssetCard, Profile, V07JobRoute } from '../src/types.ts';

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

  test.each([
    {
      route: 'has_direction_resume_not_ready',
      mode: 'inventory',
      expectedPhrases: ['先整理', '今天先补', '写进简历', '经历证据', '简历材料'],
      forbidden: /完美简历|夸大经历/,
      materialPhrases: ['维护学生社群', '公众号推文素材'],
      mainAction: /先整理|今天先补/,
      routeRule: /经历证据|简历材料/
    },
    {
      route: 'target_job_fit',
      mode: 'jd',
      expectedPhrases: ['当前材料能证明', '岗位要求', '证据不足', '投递前'],
      forbidden: /保证 offer|一定进面|匹配度百分比|你不适合/,
      materialPhrases: ['维护学生社群', '用户反馈整理'],
      mainAction: /逐条标出当前材料能证明的岗位要求|投递前/,
      routeRule: /当前材料能证明.*岗位要求|材料证据判断/
    },
    {
      route: 'applying_no_feedback',
      mode: 'inventory',
      expectedPhrases: ['最多 3 条投递记录', '简历版本', '反馈状态', '可疑线索', '复盘'],
      forbidden: /你不行|简历很差|海投|每天投很多/,
      materialPhrases: ['维护学生社群', '记录用户反馈'],
      mainAction: /整理最多 3 条投递记录|最多 3 条投递记录/,
      routeRule: /复盘|可疑线索/
    },
    {
      route: 'no_direction',
      mode: 'inventory',
      expectedPhrases: ['1 个真实可搜索的初级岗位样本', '可探索方向', '没有真实岗位样本时不下方向结论'],
      forbidden: /推荐职业|推荐你做|你最适合|AI 帮你选职业|你的职业方向是/,
      materialPhrases: ['维护学生社群', '校园二手交易调研项目'],
      mainAction: /先找 1 个真实可搜索的初级岗位样本/,
      routeRule: /不能下方向结论|不下方向结论|真实岗位样本/
    }
  ] as Array<{
    route: V07JobRoute;
    mode: 'inventory' | 'jd';
    expectedPhrases: string[];
    forbidden: RegExp;
    materialPhrases: string[];
    mainAction: RegExp;
    routeRule: RegExp;
  }>)('builds route-aware basic copy for $route', ({ route, mode, expectedPhrases, forbidden, materialPhrases, mainAction, routeRule }) => {
    const report = buildBasicReport({
      mode,
      route,
      profile,
      assets,
      jdText: route === 'target_job_fit' ? '用户运营助理，需要社群维护、用户反馈整理、内容协作。' : ''
    });
    const serialized = JSON.stringify(report);
    const todayActions = report.actionPlan.plans.filter((item) => item.period === '7 天内');

    expect(report.isBasic).toBe(true);
    expect(report.source).toBe('real');
    expect(todayActions).toHaveLength(2);
    expect(todayActions[0].what).toMatch(mainAction);
    expect(serialized).toMatch(routeRule);
    for (const phrase of expectedPhrases) {
      expect(serialized).toContain(phrase);
    }
    for (const phrase of materialPhrases) {
      expect(serialized).toContain(phrase);
    }
    expect(serialized).not.toMatch(forbidden);
    expect((serialized.match(/执行、协作、整理、反馈/g) || []).length).toBeLessThanOrEqual(1);
    expect((serialized.match(/请按你的真实情况补充/g) || []).length).toBeLessThanOrEqual(1);
  });

  test('route-aware basic report avoids repeating generic execution collaboration template copy', () => {
    const report = buildBasicReport({
      mode: 'inventory',
      route: 'has_direction_resume_not_ready',
      profile,
      assets,
      jdText: ''
    });
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain('回应岗位中与执行、协作、整理或反馈相关的要求');
    expect(serialized).not.toContain('岗位中与执行、协作、复盘相关的要求');
    expect((serialized.match(/执行、协作、整理、反馈/g) || []).length).toBeLessThanOrEqual(1);
  });
});
