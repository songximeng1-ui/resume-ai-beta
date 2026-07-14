import { describe, expect, test } from 'vitest';
import { getInitialRoutePlan, isV07Route, isV07Step, migrateLegacySession } from './v07Foundation';
import type { PersistedState } from './types';

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
});
