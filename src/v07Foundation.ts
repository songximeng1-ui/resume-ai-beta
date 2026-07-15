import type { Mode, PersistedState, Step, V07DailyTask, V07JobRoute, V07LeastHelpfulPart, V07PersistedState, V07PlanState, V07Step } from './types';

export const v07Routes: V07JobRoute[] = [
  'no_direction',
  'has_direction_resume_not_ready',
  'applying_no_feedback',
  'target_job_fit'
];

export const v07Steps: V07Step[] = [
  'route',
  'intake',
  'diagnosis',
  'plan',
  'daily_task',
  'record',
  'review',
  'result'
];

export function isV07Route(value: unknown): value is V07JobRoute {
  return typeof value === 'string' && (v07Routes as string[]).includes(value);
}

export function isV07Step(value: unknown): value is V07Step {
  return typeof value === 'string' && (v07Steps as string[]).includes(value);
}

export function toggleV07LeastHelpfulPart(current: V07LeastHelpfulPart[], part: V07LeastHelpfulPart): V07LeastHelpfulPart[] {
  if (part === 'none') {
    return current.includes('none') ? [] : ['none'];
  }

  const withoutNone = current.filter((item) => item !== 'none');
  return withoutNone.includes(part)
    ? withoutNone.filter((item) => item !== part)
    : [...withoutNone, part];
}

export function getLegacyModeForRoute(route: V07JobRoute): Mode {
  return route === 'target_job_fit' ? 'jd' : 'inventory';
}

export function getV07StepForLegacyStep(step: Step): V07Step {
  switch (step) {
    case 'start':
      return 'route';
    case 'input':
      return 'intake';
    case 'assets':
    case 'dig':
    case 'direction':
    case 'match':
      return 'diagnosis';
    case 'result':
      return 'result';
  }
}

export function getLegacyStepForV07Step(step: V07Step): Step {
  switch (step) {
    case 'route':
      return 'start';
    case 'intake':
      return 'input';
    case 'diagnosis':
      return 'assets';
    case 'result':
      return 'result';
    case 'plan':
    case 'daily_task':
    case 'record':
    case 'review':
      return 'input';
  }
}

export function getInitialRoutePlan(route: V07JobRoute): V07PlanState {
  const routeTitles: Record<V07JobRoute, string> = {
    no_direction: '找 3 个真实可搜索的岗位样本',
    has_direction_resume_not_ready: '整理 1 段能写进简历的真实经历',
    applying_no_feedback: '记录最近 5 次投递和反馈状态',
    target_job_fit: '拆开 1 个目标岗位要求并标出证据'
  };

  const hasDirectionResumeTasks: V07DailyTask[] = [
    {
      day: 1,
      title: '第 1 天：选 1 段真实经历，补齐背景 / 动作 / 工具 / 结果',
      route: 'has_direction_resume_not_ready',
      actionLoopStage: 'diagnosis',
      taskType: 'rewrite_resume',
      status: 'today',
      difficulty: 'stretch',
      estimatedMinutes: 30,
      expectedOutput: '一段包含背景、动作、工具或方法、结果的真实经历草稿。',
      evidenceRequired: '用户自己的实习、项目、校园、兼职或作品经历原文。'
    },
    {
      day: 2,
      title: '第 2 天：找 1 个目标岗位样本，摘出 3 条常见要求',
      route: 'has_direction_resume_not_ready',
      actionLoopStage: 'action',
      taskType: 'compare_jd',
      status: 'todo',
      difficulty: 'stretch',
      estimatedMinutes: 25,
      expectedOutput: '1 个真实岗位名称，以及 3 条岗位语言或常见要求。只找 1 个岗位样本即可，不用找很多。',
      evidenceRequired: '用户手动粘贴或概括的真实岗位标题、岗位要求或 JD 摘要。'
    },
    {
      day: 3,
      title: '第 3 天：把 Day 1 经历改成 1 条可投递简历表达',
      route: 'has_direction_resume_not_ready',
      actionLoopStage: 'record',
      taskType: 'rewrite_resume',
      status: 'todo',
      difficulty: 'stretch',
      estimatedMinutes: 30,
      expectedOutput: '一条可复制到简历里的表达，以及一句不能夸大的边界提醒。',
      evidenceRequired: 'Day 1 经历草稿、Day 2 岗位要求、用户确认的真实事实。'
    }
  ];

  const targetJobFitTasks: V07DailyTask[] = [
    {
      day: 1,
      title: '第 1 天：从 AI 拆出的岗位要求里，选出最影响投递的 3 条',
      route: 'target_job_fit',
      actionLoopStage: 'diagnosis',
      taskType: 'compare_jd',
      status: 'today',
      difficulty: 'stretch',
      estimatedMinutes: 30,
      expectedOutput: '3 条关键岗位要求，并分别标记已有证据 / 证据不足 / 暂无证据。',
      evidenceRequired: 'AI 已拆出的岗位要求、用户手动粘贴的真实 JD、当前简历或经历材料。'
    },
    {
      day: 2,
      title: '第 2 天：为 1 条关键岗位要求补 1 段真实经历证据',
      route: 'target_job_fit',
      actionLoopStage: 'action',
      taskType: 'rewrite_resume',
      status: 'todo',
      difficulty: 'stretch',
      estimatedMinutes: 30,
      expectedOutput: '一段能证明某条岗位要求的真实经历草稿。',
      evidenceRequired: '用户真实经历原文、JD 中对应要求、不能夸大的边界。'
    },
    {
      day: 3,
      title: '第 3 天：生成 1 条投递前简历表达，并写 1 句提醒',
      route: 'target_job_fit',
      actionLoopStage: 'record',
      taskType: 'rewrite_resume',
      status: 'todo',
      difficulty: 'stretch',
      estimatedMinutes: 25,
      expectedOutput: '1 条可放入简历的表达 + 1 句投递前提醒：现在材料最需要补哪一点。',
      evidenceRequired: 'Day 1 岗位要求、Day 2 经历证据、用户确认的真实事实。'
    }
  ];

  const tasks: V07DailyTask[] = Array.from({ length: 21 }, (_, index) => {
    const day = index + 1;
    if (route === 'has_direction_resume_not_ready' && day <= 3) {
      return hasDirectionResumeTasks[index];
    }
    if (route === 'target_job_fit' && day <= 3) {
      return targetJobFitTasks[index];
    }
    const reviewDay = day % 7 === 0;
    return {
      day,
      title: reviewDay ? `第 ${day} 天：复盘本周求职行动` : `第 ${day} 天：${routeTitles[route]}`,
      route,
      actionLoopStage: reviewDay ? 'review' : day === 1 ? 'diagnosis' : day % 3 === 0 ? 'record' : 'action',
      taskType: reviewDay
        ? 'review'
        : route === 'no_direction'
          ? 'search_job'
          : route === 'target_job_fit'
            ? 'compare_jd'
            : route === 'applying_no_feedback'
              ? 'record_feedback'
              : 'rewrite_resume',
      status: day === 1 ? 'today' : day <= 3 ? 'todo' : 'locked',
      difficulty: day === 1 ? 'stretch' : reviewDay ? 'comfort' : 'stretch',
      estimatedMinutes: reviewDay ? 20 : 30,
      expectedOutput: reviewDay ? '一段本周复盘和下一步调整记录。' : '一个可以被保存、复制或继续修改的求职行动产物。',
      evidenceRequired: reviewDay ? '本周已完成任务、投递记录或材料修改记录。' : '真实岗位、真实经历、真实投递或真实反馈中的一种证据。'
    };
  });

  return {
    route,
    currentDay: 1,
    totalDays: 21,
    tasks
  };
}

export function migrateLegacySession(legacy: PersistedState): V07PersistedState {
  if (legacy.stage === 'junior') {
    return {
      version: 'v0.7',
      route: null,
      step: 'route',
      plan: null,
      legacy
    };
  }

  const route = legacy.mode === 'jd'
    ? 'target_job_fit'
    : legacy.mode === 'inventory'
      ? 'has_direction_resume_not_ready'
      : null;

  return {
    version: 'v0.7',
    route,
    step: getV07StepForLegacyStep(legacy.step),
    plan: route ? getInitialRoutePlan(route) : null,
    legacy
  };
}
