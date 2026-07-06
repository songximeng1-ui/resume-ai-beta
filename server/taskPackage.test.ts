import { describe, expect, it } from 'vitest';
import { buildTaskPackage } from './taskPackage.ts';

describe('buildTaskPackage', () => {
  it('includes structured JD requirements before dynamic questions in JD mode', () => {
    const taskPackage = buildTaskPackage({
      module: 'dynamic_questions',
      mode: 'jd',
      stage: 'senior',
      profile: { targetRole: '用户运营' },
      jdText: '岗位要求：整理用户反馈，维护社群。',
      jdSummary: { requirements: ['整理用户反馈', '维护社群'] },
      assets: [{ id: 'project', title: '项目经历', content: '问卷调研', confirmed: true, status: '确认使用', notes: [] }]
    });

    expect(taskPackage.meta).toMatchObject({
      version: 'v0.4',
      mode: 'jd',
      module: 'dynamic_questions',
      language: 'zh-CN'
    });
    expect(taskPackage.jd.structuredRequirements).toEqual([
      { id: 'req_1', requirement: '整理用户反馈', sourceText: '整理用户反馈' },
      { id: 'req_2', requirement: '维护社群', sourceText: '维护社群' }
    ]);
    expect(taskPackage.confirmedAssets).toHaveLength(1);
    expect(taskPackage.currentTask.safetyRules.join(' ')).toMatch(/不伪造|不编造|不夸大/);
  });

  it('excludes unconfirmed and ignored assets from generation modules', () => {
    const taskPackage = buildTaskPackage({
      module: 'report',
      mode: 'inventory',
      stage: 'senior',
      profile: {},
      assets: [
        { id: 'project', title: '项目经历', content: '确认项目', confirmed: true, status: '确认使用', notes: [] },
        { id: 'internship', title: '实习经历', content: '未确认实习', confirmed: false, status: '待确认', notes: [] },
        { id: 'campus', title: '校园经历', content: '暂不使用经历', confirmed: false, status: '暂不使用', notes: [] }
      ]
    });

    expect(taskPackage.confirmedAssets.map((asset) => asset.title)).toEqual(['项目经历']);
    expect(taskPackage.excludedAssets.map((asset) => asset.title)).toEqual(['校园经历']);
    expect(taskPackage.forbiddenInputs.unconfirmedAssets).toEqual(['未确认实习', '暂不使用经历']);
    expect(JSON.stringify(taskPackage.confirmedAssets)).not.toMatch(/未确认实习|暂不使用经历/);
  });
});
