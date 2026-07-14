import { describe, expect, test } from 'vitest';
import { getInitialRoutePlan, isV07Route, isV07Step, migrateLegacySession, toggleV07LeastHelpfulPart } from './v07Foundation';
import type { PersistedState, V07FeedbackSubmission, V07PersistedState, V07TaskRecord } from './types';

const legacyBase: PersistedState = {
  step: 'start',
  stage: 'senior',
  mode: null,
  profile: {
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
  },
  fieldStatuses: {
    education: '待用户确认',
    schoolName: '待用户确认',
    major: '待用户确认',
    graduation: '待用户确认',
    city: '待用户确认',
    targetRole: '待用户确认',
    internship: '待用户确认',
    project: '待用户确认',
    campus: '待用户确认',
    partTime: '待用户确认',
    awards: '待用户确认',
    skills: '待用户确认',
    portfolio: '待用户确认'
  },
  assets: [],
  truthConfirmed: false,
  resumeText: '',
  jdText: '',
  jdFit: null,
  report: null,
  reportTask: null
};

describe('V0.7 public foundation helpers', () => {
  test('route and step guards accept only V0.7 public foundation values', () => {
    expect(isV07Route('no_direction')).toBe(true);
    expect(isV07Route('has_direction_resume_not_ready')).toBe(true);
    expect(isV07Route('applying_no_feedback')).toBe(true);
    expect(isV07Route('target_job_fit')).toBe(true);
    expect(isV07Route('inventory')).toBe(false);

    expect(isV07Step('route')).toBe(true);
    expect(isV07Step('daily_task')).toBe(true);
    expect(isV07Step('start')).toBe(false);
  });

  test('migrates old inventory and jd modes into stable V0.7 routes', () => {
    expect(migrateLegacySession({ ...legacyBase, mode: 'inventory', step: 'input' })).toMatchObject({
      version: 'v0.7',
      route: 'has_direction_resume_not_ready',
      step: 'intake',
      legacy: {
        mode: 'inventory',
        step: 'input'
      }
    });

    expect(migrateLegacySession({ ...legacyBase, mode: 'jd', step: 'match' })).toMatchObject({
      version: 'v0.7',
      route: 'target_job_fit',
      step: 'diagnosis',
      legacy: {
        mode: 'jd',
        step: 'match'
      }
    });
  });

  test('junior legacy sessions are downgraded to route selection instead of keeping a main path', () => {
    expect(migrateLegacySession({ ...legacyBase, stage: 'junior', mode: 'inventory', step: 'start' })).toMatchObject({
      version: 'v0.7',
      route: null,
      step: 'route',
      plan: null,
      legacy: {
        stage: 'junior'
      }
    });
  });

  test('getInitialRoutePlan returns a 21 day skeleton with task safety fields', () => {
    const plan = getInitialRoutePlan('target_job_fit');

    expect(plan.route).toBe('target_job_fit');
    expect(plan.currentDay).toBe(1);
    expect(plan.totalDays).toBe(21);
    expect(plan.tasks).toHaveLength(21);
    expect(plan.tasks[0]).toMatchObject({
      day: 1,
      route: 'target_job_fit',
      status: 'today',
      difficulty: 'stretch',
      estimatedMinutes: expect.any(Number),
      expectedOutput: expect.any(String),
      evidenceRequired: expect.any(String)
    });
    expect(plan.tasks.every((task) => task.estimatedMinutes > 0)).toBe(true);
  });

  test('has direction resume route starts with three small resume preparation tasks', () => {
    const plan = getInitialRoutePlan('has_direction_resume_not_ready');

    expect(plan.tasks.slice(0, 3)).toMatchObject([
      {
        day: 1,
        title: '第 1 天：选 1 段真实经历，补齐背景 / 动作 / 工具 / 结果',
        taskType: 'rewrite_resume',
        difficulty: 'stretch',
        estimatedMinutes: 30,
        expectedOutput: '一段包含背景、动作、工具或方法、结果的真实经历草稿。',
        evidenceRequired: '用户自己的实习、项目、校园、兼职或作品经历原文。'
      },
      {
        day: 2,
        title: '第 2 天：找 1 个目标岗位样本，摘出 3 条常见要求',
        taskType: 'compare_jd',
        difficulty: 'stretch',
        estimatedMinutes: 25,
        expectedOutput: '1 个真实岗位名称，以及 3 条岗位语言或常见要求。',
        evidenceRequired: '用户手动粘贴或概括的真实岗位标题、岗位要求或 JD 摘要。'
      },
      {
        day: 3,
        title: '第 3 天：把 Day 1 经历改成 1 条可投递简历表达',
        taskType: 'rewrite_resume',
        difficulty: 'stretch',
        estimatedMinutes: 30,
        expectedOutput: '一条可复制到简历里的表达，以及一句不能夸大的边界提醒。',
        evidenceRequired: 'Day 1 经历草稿、Day 2 岗位要求、用户确认的真实事实。'
      }
    ]);
  });

  test('V0.7 persisted state can carry task records with completionStatus', () => {
    const record: V07TaskRecord = {
      route: 'has_direction_resume_not_ready',
      day: 1,
      taskTitle: '第 1 天：选 1 段真实经历，补齐背景 / 动作 / 工具 / 结果',
      taskType: 'rewrite_resume',
      completionStatus: 'partly',
      outputText: '教育机构新媒体运营实习，维护社群并整理推文素材。',
      evidenceText: '来自用户确认的实习经历。',
      reflectionText: '结果还需要补具体频率。',
      nextAdjustment: '明天对照岗位语言补表达。',
      createdAt: '2026-07-14T00:00:00.000Z'
    };
    const persisted: V07PersistedState = {
      version: 'v0.7',
      route: 'has_direction_resume_not_ready',
      step: 'result',
      plan: getInitialRoutePlan('has_direction_resume_not_ready'),
      records: [record],
      legacy: legacyBase
    };

    expect(persisted.records?.[0]).toMatchObject({
      route: 'has_direction_resume_not_ready',
      completionStatus: 'partly'
    });
  });

  test('V0.7 feedback least helpful parts keep none mutually exclusive', () => {
    const typedSubmission: V07FeedbackSubmission = {
      route: 'has_direction_resume_not_ready',
      taskHelpfulScore: 4,
      taskFinished: 'partly',
      actionClarity: 'partly_clear',
      contentCredibilityScore: 5,
      realityIssueText: '',
      leastHelpfulParts: ['none'],
      actionWillingness: '愿意继续做明天任务',
      paymentAcceptance: '10-30 元',
      continueTesting: 'yes',
      createdAt: '2026-07-14T00:00:00.000Z'
    };

    expect(typedSubmission.leastHelpfulParts).toEqual(['none']);
    expect(toggleV07LeastHelpfulPart(['task_unclear', 'too_long'], 'none')).toEqual(['none']);
    expect(toggleV07LeastHelpfulPart(['none'], 'task_unclear')).toEqual(['task_unclear']);
    expect(toggleV07LeastHelpfulPart(['task_unclear'], 'too_long')).toEqual(['task_unclear', 'too_long']);
    expect(toggleV07LeastHelpfulPart(['task_unclear', 'too_long'], 'task_unclear')).toEqual(['too_long']);
    expect(toggleV07LeastHelpfulPart(['task_unclear'], 'task_unclear')).toEqual([]);
  });
});
