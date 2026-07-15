import type {
  ActionPlanItem,
  AssetCard,
  DiagnosisReport,
  DirectionOption,
  HiddenHighlight,
  InterviewPrep,
  JdFitReport,
  Mode,
  Profile,
  ResumeRewrite,
  V07JobRoute
} from '../src/types.ts';
import { emptyProfile } from '../src/types.ts';
import { validateDiagnosisReport } from './schemas.ts';

export const BASIC_REPORT_NOTICE =
  '当前已为你生成基础版报告。内容基于你确认过的信息和稳定规则整理，会偏保守，但不会替你编造经历。你可以先参考，系统也会继续尝试补全深度内容。';

type BasicReportInput = {
  mode?: unknown;
  route?: unknown;
  profile?: unknown;
  assets?: unknown;
  jdText?: unknown;
};

type ConfirmedAsset = Pick<AssetCard, 'id' | 'title' | 'content'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProfile(value: unknown): Profile {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(emptyProfile).map(([key, fallback]) => [key, readString(record[key]) || fallback])
  ) as Profile;
}

function normalizeMode(value: unknown): Mode {
  return value === 'inventory' ? 'inventory' : 'jd';
}

function normalizeRoute(value: unknown): V07JobRoute | undefined {
  return value === 'has_direction_resume_not_ready' ||
    value === 'target_job_fit' ||
    value === 'applying_no_feedback' ||
    value === 'no_direction'
    ? value
    : undefined;
}

function confirmedAssets(value: unknown, profile: Profile): ConfirmedAsset[] {
  const assets = Array.isArray(value) ? value : [];
  const fromCards = assets
    .filter(isRecord)
    .filter((asset) => {
      const status = readString(asset.status);
      return asset.confirmed === true || status === '确认使用' || status === '编辑后确认' || status === '已确认' || status === '用户已修改';
    })
    .filter((asset) => asset.isGap !== true && readString(asset.content))
    .map((asset) => ({
      id: readString(asset.id) as AssetCard['id'],
      title: readString(asset.title) || '已确认经历',
      content: readString(asset.content)
    }));

  if (fromCards.length) return fromCards;

  return [
    ['internship', '实习经历', profile.internship],
    ['project', '项目经历', profile.project],
    ['campus', '校园经历', profile.campus],
    ['partTime', '兼职经历', profile.partTime],
    ['skills', '技能作品', profile.skills],
    ['education', '教育背景', [profile.education, profile.schoolName, profile.major].filter(Boolean).join(' / ')]
  ]
    .map(([id, title, content]) => ({ id: id as AssetCard['id'], title, content }))
    .filter((asset) => asset.content.trim());
}

function assetAt(assets: ConfirmedAsset[], index: number): ConfirmedAsset {
  return assets[index] || assets[0] || { id: 'skills', title: '已确认经历材料', content: '已确认的基础信息和经历材料' };
}

function buildHighlights(assets: ConfirmedAsset[], mode: Mode): HiddenHighlight[] {
  const templates = [
    ['经历整理与任务执行能力', mode === 'jd' ? '岗位中与执行、协作、复盘相关的要求' : '可迁移到运营、助理、项目支持等基础岗位的能力'],
    ['信息整理与沟通协作能力', mode === 'jd' ? '岗位中与沟通、反馈整理、内容协作相关的要求' : '可迁移到用户运营、内容运营、行政运营等方向的能力']
  ];

  return templates.map(([capability, jdRequirement], index) => {
    const asset = assetAt(assets, index);
    return {
      sourceExperience: `${asset.title}：${asset.content}`,
      capability,
      jdRequirement,
      whyNotFlattery: '该判断只来自用户已确认经历中的任务、材料或工具，不扩写为未经确认的成果。',
      professionalExpression: `可保守表达为：参与${asset.title}相关工作，围绕具体任务进行整理、协作和复盘。`
    };
  });
}

function buildRouteHighlights(assets: ConfirmedAsset[], route: V07JobRoute): HiddenHighlight[] {
  const primary = assetAt(assets, 0);
  const secondary = assetAt(assets, 1);
  const routeCopy: Record<V07JobRoute, Array<[string, string, string]>> = {
    has_direction_resume_not_ready: [
      ['可先整理的简历材料', `${primary.title} 中已经有可核实任务，可先补对象、工具、周期和本人动作。`, `这段经历可以先写进简历草稿，但只写已确认动作：${primary.content}`],
      ['第二优先级经历证据', `${secondary.title} 可作为补充材料，适合检查是否有作品、表格、截图或课堂展示。`, `先判断它能不能补出 1 条简历证据：${secondary.content}`]
    ],
    target_job_fit: [
      ['当前材料能证明的要求', `${primary.title} 可先对应目标岗位里的具体任务要求。`, `投递前先把这段经历改成岗位能读懂的事实表达：${primary.content}`],
      ['当前证据不足的位置', `${secondary.title} 需要继续核实对象、工具、交付物或反馈。`, `这部分暂时只标为证据不足，不推导录取结果：${secondary.content}`]
    ],
    applying_no_feedback: [
      ['先复盘最近投递线索', `${primary.title} 可用来对照最近投递的简历版本，看表达是否一致。`, `最多 3 条投递记录先写岗位、简历版本、投递时间、反馈状态和可疑线索。`],
      ['材料与岗位要求的落差', `${secondary.title} 可帮助检查某类岗位是否总是缺同一类证据。`, `先找线索，不把无反馈归因为用户本人：${secondary.content}`]
    ],
    no_direction: [
      ['先验证一个真实岗位样本', `${primary.title} 只能作为可探索方向的材料线索，不能直接下方向结论。`, `下一步先找 1 个真实可搜索的初级岗位样本，再看这段经历能否对应：${primary.content}`],
      ['暂不下方向结论', `${secondary.title} 可以留作岗位样本对照材料。`, `没有真实 JD 前，只能称为可探索方向：${secondary.content}`]
    ]
  };

  return routeCopy[route].map(([capability, jdRequirement, professionalExpression], index) => {
    const asset = assetAt(assets, index);
    return {
      sourceExperience: `${asset.title}：${asset.content}`,
      capability,
      jdRequirement,
      whyNotFlattery: '该判断只来自用户已确认经历，不替用户扩写结果、身份或职责。',
      professionalExpression
    };
  });
}

function buildDirections(assets: ConfirmedAsset[]): DirectionOption[] {
  const primary = assetAt(assets, 0);
  const secondary = assetAt(assets, 1);
  return [
    {
      directionName: '用户运营支持',
      name: '用户运营支持',
      level: '过渡方向',
      priority: '过渡方向',
      searchableJobNames: ['用户运营实习生', '社群运营助理', '用户反馈专员', '运营助理'],
      whyExplore: '该方向可用真实 JD 验证，且能承接已确认经历中的社群、反馈、内容或资料整理任务。',
      why: '先用真实岗位要求验证经历是否能对应日常运营任务。',
      evidence: `${primary.title}：${primary.content}`,
      gap: '仍需要补充服务对象、工具、周期、反馈类型和可核实交付物。',
      sevenDayValidation: '7 天内搜索 3 个用户运营或社群运营 JD，标注要求与已确认经历的对应关系。',
      next: '先整理一版经历证据表，再决定是否小批量投递。',
      keywords: ['用户运营', '社群维护', '用户反馈', '内容协作']
    },
    {
      directionName: '内容运营与资料整理',
      name: '内容运营与资料整理',
      level: '过渡方向',
      priority: '过渡方向',
      searchableJobNames: ['内容运营实习生', '新媒体运营助理', '内容编辑助理', '资料运营助理'],
      whyExplore: '该方向能用内容整理、材料归类、基础编辑和复盘材料来验证，不需要把经历包装成更高职责。',
      why: '用内容类岗位检验当前材料是否能证明信息整理和表达能力。',
      evidence: `${secondary.title}：${secondary.content}`,
      gap: '需要补充内容类型、发布或展示场景、协作对象和本人边界。',
      sevenDayValidation: '7 天内找 3 个内容运营 JD，对照是否要求排版、资料整理、选题协作或数据记录。',
      next: '准备 1-2 份可展示的内容材料或过程截图，并标明本人完成部分。',
      keywords: ['内容运营', '新媒体运营', '资料整理', '内容编辑']
    }
  ];
}

function buildRewrites(assets: ConfirmedAsset[], mode: Mode): ResumeRewrite[] {
  return [0, 1, 2].map((_, index) => {
    const asset = assetAt(assets, index);
    const jdRequirement = mode === 'jd' ? '回应岗位中与执行、协作、整理或反馈相关的要求' : '对应可迁移的基础岗位能力';
    const directVersion = `参与${asset.title}，围绕已确认任务进行资料整理、沟通协作和过程记录。`;
    return {
      relatedExperience: `${asset.title}：${asset.content}`,
      originalIssue: '原表达容易停留在经历名称，缺少任务、动作和边界。',
      capability: '任务拆解、信息整理和协作执行能力',
      directVersion,
      versionAfterSupplement: `${directVersion} 如能确认对象、周期、工具、数量或交付物，可补充到同一句中。`,
      usageReminder: '只使用你能解释清楚的真实信息；数字、结果和职责边界需要先核实。',
      original: asset.content,
      optimized: directVersion,
      reason: '把经历改成岗位可读的任务语言，但不新增未确认事实。',
      jdRequirement,
      risk: '不要把参与、协助或整理类经历写成独立统筹或结果承诺。',
      interviewProbe: '面试中可能追问你的具体分工、工具、对象和交付物。'
    };
  });
}

function buildRouteDirections(route: V07JobRoute, assets: ConfirmedAsset[]): DirectionOption[] | undefined {
  if (route === 'target_job_fit') return undefined;
  const primary = assetAt(assets, 0);
  const secondary = assetAt(assets, 1);
  const direction = (
    name: string,
    why: string,
    evidence: string,
    gap: string,
    next: string,
    keywords: string[]
  ): DirectionOption => ({
    directionName: name,
    name,
    level: '过渡方向',
    priority: '过渡方向',
    searchableJobNames: keywords,
    whyExplore: why,
    why,
    evidence,
    gap,
    sevenDayValidation: next,
    next,
    keywords
  });

  if (route === 'has_direction_resume_not_ready') {
    return [
      direction(
        '简历证据整理：先处理最稳经历',
        '当前重点不是下方向结论，而是判断哪段经历能先写成真实简历材料。',
        `${primary.title}：${primary.content}`,
        '还需要补对象、动作、工具、周期和交付物。',
        '今天先补 1 条经历证据，再改成 1 条保守简历表达。',
        ['经历证据', '简历表达', '岗位样本']
      ),
      direction(
        '简历证据整理：补充第二段材料',
        '第二段经历只作为补充，不急着包装成亮点。',
        `${secondary.title}：${secondary.content}`,
        '需要判断是否有真实作品、截图、表格或展示材料。',
        '找 1 个目标岗位样本，对照 3 条要求。',
        ['补充证据', '材料边界', '简历草稿']
      )
    ];
  }

  if (route === 'applying_no_feedback') {
    return [
      direction(
        '投递记录复盘：先看最近 3 次',
        '当前重点是复盘岗位、版本、时间、反馈状态和可疑线索。',
        `${primary.title}：${primary.content}`,
        '如果没有记录，就难以判断问题出在材料、岗位还是节奏。',
        '先整理最多 3 条投递记录，并只改 1 个可疑点。',
        ['投递记录', '简历版本', '反馈状态']
      ),
      direction(
        '投递记录复盘：检查岗位要求是否重复缺证据',
        '用投递记录观察是否总卡在同一类岗位要求上。',
        `${secondary.title}：${secondary.content}`,
        '需要补清岗位类型、JD 关键词和使用的简历版本。',
        '下一轮只调整一条简历表达或一个岗位类型。',
        ['可疑线索', '岗位要求', '复盘调整']
      )
    ];
  }

  return [
    direction(
      '可探索方向：先验证一个初级岗位样本',
      '没有真实岗位样本前，不下方向结论，只把它作为待验证样本。',
      `${primary.title}：${primary.content}`,
      '还缺具体岗位名称、初级入口和可拆解 JD。',
      '先找 1 个真实可搜索的初级岗位样本。',
      ['岗位样本', '初级岗位', '可探索方向']
    ),
    direction(
      '可探索方向：用经历对照岗位要求',
      '找到真实岗位后，再判断经历能否对应 1 条岗位要求。',
      `${secondary.title}：${secondary.content}`,
      '还不能从兴趣或经历线索直接推出职业方向。',
      '复制 3 条岗位要求，并完成 1 条经历-岗位对照。',
      ['真实 JD', '岗位要求', '经历对照']
    )
  ];
}

function buildRouteRewrites(assets: ConfirmedAsset[], route: V07JobRoute): ResumeRewrite[] {
  const routeCopy: Record<V07JobRoute, Array<{
    issue: string;
    capability: string;
    jdRequirement: string;
    direct: (asset: ConfirmedAsset) => string;
    reason: string;
    risk: string;
    probe: string;
  }>> = {
    has_direction_resume_not_ready: [
      {
        issue: '当前经历还缺少对象、动作、工具或交付物，不能急着包装成完整简历亮点。',
        capability: '简历证据整理',
        jdRequirement: '今天先补 1 条经历证据，再决定什么能写进简历。',
        direct: (asset) => `先整理${asset.title}：补清服务对象、本人动作、使用工具和可核实材料。`,
        reason: '把“经历名称”先变成能核实的简历素材。',
        risk: '先核实事实边界，不把参与经历写成独立成果。',
        probe: '这段经历里你本人做了哪一步，能拿出什么材料说明？'
      },
      {
        issue: '材料可用性还不清楚，需要先判断哪段经历最值得整理。',
        capability: '经历优先级判断',
        jdRequirement: '先选最容易补证据的一段经历。',
        direct: (asset) => `优先检查${asset.title}是否能补出 1 个真实样例、1 个工具或 1 个交付物。`,
        reason: '先让用户知道今天补哪条证据。',
        risk: '只写已确认经历，不新增未确认数字或结果。',
        probe: '如果只能补一条事实，你最确定的是对象、动作、工具还是结果？'
      }
    ],
    target_job_fit: [
      {
        issue: '当前表达还没有逐条对应岗位要求。',
        capability: '岗位要求证据匹配',
        jdRequirement: '先标出当前材料能证明的岗位要求。',
        direct: (asset) => `投递前先把${asset.title}改成一条事实句：说明对象、动作和与 JD 要求对应的位置。`,
        reason: '帮助用户知道先改哪一条简历表达。',
        risk: '只做材料证据判断，不给绝对投递结论。',
        probe: '这条 JD 要求能用哪段真实经历证明？缺口在哪里？'
      },
      {
        issue: '部分岗位要求还缺少证据。',
        capability: '投递前证据补强',
        jdRequirement: '把证据不足的要求单独标出。',
        direct: (asset) => `如果${asset.title}无法说明结果或工具熟练度，就先标为证据不足，暂不硬写。`,
        reason: '避免把不足写成确定能力。',
        risk: '只评价当前材料证据，不评价用户本人。',
        probe: '如果 HR 追问这个要求，你能回答到什么程度？'
      }
    ],
    applying_no_feedback: [
      {
        issue: '无反馈需要先看投递记录，不能直接归因到用户本人。',
        capability: '投递记录复盘',
        jdRequirement: '最多 3 条投递记录：岗位、简历版本、投递时间、反馈状态、可疑线索。',
        direct: (asset) => `用${asset.title}对照最近投递岗位，检查简历版本是否写清同类证据。`,
        reason: '先找材料、岗位、节奏或市场反馈线索。',
        risk: '只复盘记录和线索，不评价用户本人，也不鼓励无目标加量。',
        probe: '最近 3 次投递分别用了哪个简历版本，投后有没有任何状态变化？'
      },
      {
        issue: '如果没有记录，就很难判断问题出在材料、岗位还是投递节奏。',
        capability: '反馈线索整理',
        jdRequirement: '先把反馈状态和可疑线索写清楚。',
        direct: (asset) => `把${asset.title}对应到某一类岗位，观察是否总在同一类要求上缺证据。`,
        reason: '让下一步调整更小、更具体。',
        risk: '不扩大成完整 CRM，不要求录入过多隐私。',
        probe: '哪些岗位看起来要求更高，哪些只是简历表达没有对上？'
      }
    ],
    no_direction: [
      {
        issue: '没有真实岗位样本时，不能下方向结论。',
        capability: '真实岗位样本验证',
        jdRequirement: '先找 1 个真实可搜索的初级岗位样本。',
        direct: (asset) => `把${asset.title}暂时作为可探索方向的证据线索，等找到真实 JD 后再判断是否对应。`,
        reason: '方向必须经过真实岗位验证。',
        risk: '只称为可探索方向，方向结论必须等真实岗位样本验证后再说。',
        probe: '你能在招聘平台搜到哪个具体初级岗位，并复制 3 条岗位要求？'
      },
      {
        issue: '兴趣或经历线索还不能直接等于职业方向。',
        capability: '岗位样本对照',
        jdRequirement: '用岗位名称、职责和入门要求验证可探索方向。',
        direct: (asset) => `找到岗位样本后，再看${asset.title}能对应哪 1 条真实要求。`,
        reason: '避免凭空判断职业方向。',
        risk: '不做职业测评，不替用户做人生决定。',
        probe: '这个岗位是否可搜索、有应届生入口、JD 能拆成具体任务？'
      }
    ]
  };

  return [0, 1, 2].map((_, index) => {
    const asset = assetAt(assets, index);
    const copy = routeCopy[route][index % routeCopy[route].length];
    const directVersion = copy.direct(asset);
    return {
      relatedExperience: `${asset.title}：${asset.content}`,
      originalIssue: copy.issue,
      capability: copy.capability,
      directVersion,
      versionAfterSupplement: `${directVersion} 如能确认更多事实，再补对象、周期、工具、交付物或反馈状态。`,
      usageReminder: copy.risk,
      original: asset.content,
      optimized: directVersion,
      reason: copy.reason,
      jdRequirement: copy.jdRequirement,
      risk: copy.risk,
      interviewProbe: copy.probe
    };
  });
}

function buildJdFit(assets: ConfirmedAsset[], jdText: string): JdFitReport {
  const requirements = extractRequirements(jdText);
  return {
    source: 'real',
    deliveryDecision: '可以作为尝试方向',
    deliveryReason: '基础版只做保守判断：当前材料能覆盖部分执行、整理或协作要求，但关键细节仍需要用户补充核实。',
    strongestEvidence: `已有可引用证据：${assetAt(assets, 0).title}。`,
    mainGap: '岗位要求中的结果、规模、工具熟练度或行业经验，如未在已确认材料中出现，应标注为当前证据不足。',
    nextStepAdvice: '可以作为尝试方向，但建议先优化简历表达，并补充能被追问的事实细节。',
    matrix: requirements.map((requirement, index) => {
      const asset = assetAt(assets, index);
      return {
        requirement,
        matchLevel: asset.content ? '需要补充证据' : '当前证据不足',
        evidence: `${asset.title}：${asset.content}`,
        gap: '需要核实本人分工、对象、周期、工具和可展示交付物。',
        resumeWriting: `可保守写为：参与${asset.title}，围绕该要求完成相关支持工作。`,
        interviewRisk: '如被追问结果或规模，只回答已确认事实，不补编数字。'
      };
    })
  };
}

function extractRequirements(jdText: string): string[] {
  const defaults = ['执行与协作能力', '信息整理能力', '沟通反馈能力'];
  const parts = jdText
    .split(/[。；;\n,.，]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .slice(0, 3);
  return [...parts, ...defaults].slice(0, 3);
}

function buildInterviews(assets: ConfirmedAsset[]): InterviewPrep[] {
  const questions = [
    ['请介绍一段和岗位要求最相关的经历。', 'HR 可能用它确认经历是否真实、分工是否清楚。'],
    ['这段经历中你具体做了哪些动作？', 'HR 可能用它判断你是否真的参与过过程。'],
    ['你当时服务或协作的对象是谁？', 'HR 可能用它确认沟通场景和岗位相关性。'],
    ['这段经历有什么可展示的材料或交付物？', 'HR 可能用它判断材料是否能支撑简历表达。'],
    ['如果重新做一次，你会先改进哪一步？', 'HR 可能用它观察复盘意识和边界感。']
  ];

  return questions.map(([question, whyAsk], index) => {
    const asset = assetAt(assets, index);
    const sampleAnswer = index === 0
      ? `请按你的真实情况补充：我可以讲${asset.title}，其中我能确认的是……`
      : `可以围绕${asset.title}说明本人动作、工具、对象和可核实材料。`;
    return {
      question,
      whyAsk,
      answerAngle: '按背景、任务、本人动作、可核实结果或反思来组织，不需要套用完整模板。',
      concern: '避免把团队成果、模糊印象或未经核实的数据说成个人确定成果。',
      sampleAnswer,
      doNotExaggerate: '不编造数据、职级、独立职责、业务结果或录用承诺。'
    };
  });
}

function buildActionPlan(mode: Mode, assets: ConfirmedAsset[]): ActionPlanItem[] {
  const main = assetAt(assets, 0);
  const modeTarget = mode === 'jd' ? '目标岗位要求' : '可探索岗位方向';
  return [
    action('7 天内', `整理${main.title}的事实清单。`, '先让后续分析尽量只使用真实经历。', '按任务、对象、工具、周期、本人动作、交付物六列填写。', '完成 1 份事实清单。', '为简历改写和面试回答提供证据。'),
    action('7 天内', mode === 'jd' ? '逐条标注目标岗位要求。' : '搜索 3 个真实岗位 JD。', '用真实岗位要求校验方向，不凭感觉判断。', `把每条要求和${modeTarget}中的关键词写成对照表。`, '完成 1 份岗位要求对照表。', '判断当前材料能证明什么、还缺什么。'),
    action('14 天内', '补充 2 段已确认经历的细节。', '让经历经得起 HR 追问。', '每段补齐对象、本人动作、工具和可展示材料。', '完成 2 段经历复盘。', '提升简历表达的可信度。'),
    action('14 天内', mode === 'jd' ? '针对证据不足要求补一个小材料。' : '为优先方向准备 1 个作品或过程材料。', '补足当前最影响判断的证据。', '选择表格、截图、链接或复盘说明，并标明本人边界。', '形成 1 个可展示材料。', '投递前减少空泛表达。'),
    action('30 天内', mode === 'jd' ? '完成 5 次小批量投递并记录反馈。' : '围绕 2 个方向各做 3 次验证。', '用真实反馈验证方向和简历表达。', '记录岗位名称、JD 关键词、简历版本和反馈。', '完成 1 份投递或验证记录表。', '判断下一轮优化重点。'),
    action('30 天内', '复盘简历与面试中被追问最多的问题。', '持续修正证据不足的部分。', '把高频问题归类为事实缺口、表达问题或岗位不匹配。', '完成 1 次月度复盘。', '为后续深度报告和投递策略提供材料。')
  ];
}

function buildRouteActionPlan(route: V07JobRoute, assets: ConfirmedAsset[]): ActionPlanItem[] {
  const main = assetAt(assets, 0);
  const routePlans: Record<V07JobRoute, ActionPlanItem[]> = {
    has_direction_resume_not_ready: [
      action('今天', `先整理${main.title}这一段经历。`, '判断这段材料是否能写进简历。', '补对象、本人动作、工具、周期、交付物五项事实。', '完成 1 条经历证据清单。', '用于生成第一条保守简历表达。'),
      action('今天', '今天先补 1 条最确定的经历证据。', '先补事实，再决定表达。', '只写自己能解释清楚的真实信息。', '补完 1 条可追问证据。', '减少空泛经历描述。'),
      action('本周', '找 1 个目标岗位样本，对照 3 条要求。', '让简历材料服务真实岗位。', '标出哪些要求已有证据、哪些暂时没有。', '完成 1 份岗位要求对照。', '决定下一条简历先改哪里。')
    ],
    target_job_fit: [
      action('今天', '逐条标出当前材料能证明的岗位要求。', '先看证据，不做录取预测。', '把 JD 要求拆成 3 条以内，并写对应经历。', '完成 1 份 JD 证据表。', '判断投递前先改哪条表达。'),
      action('今天', '标出证据不足的 1-2 条要求。', '避免把缺口写成确定能力。', '只写缺口类型：工具、结果、场景、作品或经验。', '得到 1 份证据不足清单。', '投递前优先补最影响判断的材料。'),
      action('本周', `先改${main.title}对应目标岗位的一句话。`, '让简历表达更贴近岗位要求。', '保留真实边界，不写保证结果。', '完成 1 条投递前简历表达。', '用于小范围试投或继续补证据。')
    ],
    applying_no_feedback: [
      action('今天', '整理最多 3 条投递记录。', '先复盘事实，不评价用户本人。', '记录岗位、简历版本、投递时间、反馈状态和可疑线索。', '完成最多 3 条投递记录。', '判断问题可能在材料、岗位、节奏还是市场反馈。'),
      action('今天', '把最近一次投递和简历版本对上。', '检查投递材料是否回应岗位要求。', '标出这版简历最可能没说清的一条证据。', '找到 1 条可修改线索。', '下一轮只改一个小点再观察。'),
      action('本周', '小范围调整 1 个岗位类型或 1 条简历表达。', '避免无目标加量。', '只选择一个变量调整，并记录反馈状态。', '完成 1 次可复盘调整。', '让后续复盘更清楚。')
    ],
    no_direction: [
      action('今天', '先找 1 个真实可搜索的初级岗位样本。', '没有岗位样本时不下方向结论。', '在招聘平台搜索具体岗位名，复制岗位名称和 3 条要求。', '得到 1 个真实岗位样本。', '把方向暂时称为可探索方向。'),
      action('今天', '检查这个岗位是否有应届生或初级入口。', '确认它不是空泛行业名。', '看 JD 是否包含具体职责、工具、经验或软素质要求。', '完成 1 次岗位样本核验。', '决定是否继续探索这一类岗位。'),
      action('本周', `用${main.title}对照岗位样本中的 1 条要求。`, '让经历材料经过真实岗位验证。', '只判断能否对应一条要求，不做职业结论。', '完成 1 条经历-岗位对照。', '为下一步可探索方向筛选提供依据。')
    ]
  };

  const focused = routePlans[route];
  const followUps: Record<V07JobRoute, [ActionPlanItem, ActionPlanItem, ActionPlanItem]> = {
    has_direction_resume_not_ready: [
      action('14 天内', '把最稳的一段经历改成 1 条保守简历表达。', '让简历先有一条可用内容。', '只使用已补齐的事实，不扩写结果。', '完成 1 条简历 bullet。', '用于后续小范围投递或继续补材料。'),
      action('30 天内', '根据岗位样本继续补 2 条经历证据。', '让简历材料逐步变厚。', '每条都写清本人动作和可核实材料。', '完成 2 条证据补充。', '支持下一版简历迭代。'),
      action('30 天内', '复盘哪条经历最容易被追问清楚。', '优先保留真实、可解释的内容。', '把追问风险分为事实不足、表达不清或岗位不相关。', '完成 1 次简历材料复盘。', '决定下一轮先改哪段经历。')
    ],
    target_job_fit: [
      action('14 天内', '补一个能回应证据不足要求的小材料。', '减少投递前最明显的证据缺口。', '选择截图、表格、作品或复盘说明，并标注真实边界。', '形成 1 个补充材料。', '让目标岗位判断更有依据。'),
      action('30 天内', '围绕相似岗位做 3 次小范围验证。', '用真实反馈判断表达是否对上岗位要求。', '记录岗位名称、简历版本、反馈状态和下一步修改点。', '完成 1 份小范围验证记录。', '调整下一版简历表达。'),
      action('30 天内', '复盘被重复要求但证据不足的能力。', '避免在同一缺口上反复投递。', '把缺口分为工具、场景、作品、结果或经验。', '完成 1 份岗位缺口复盘。', '决定继续补证据还是换岗位样本。')
    ],
    applying_no_feedback: [
      action('14 天内', '针对可疑线索只改 1 条简历表达。', '让调整可复盘。', '保留原版本，记录修改前后差异。', '完成 1 次简历小改。', '观察下一轮反馈是否变化。'),
      action('30 天内', '用同一记录表复盘下一轮 3 次投递。', '比较调整前后的反馈状态。', '继续记录岗位、简历版本、投递时间、反馈状态和可疑线索。', '完成第二轮最多 3 条记录。', '判断是否需要换岗位样本或改材料。'),
      action('30 天内', '总结无反馈最常见的 1 个原因线索。', '把问题落到可调整变量上。', '只从记录中归纳，不评价用户本人。', '完成 1 条复盘结论。', '决定下一轮调整方向。')
    ],
    no_direction: [
      action('14 天内', '再找 2 个同类初级岗位样本做对比。', '验证这个可探索方向是否真实存在。', '只比较岗位名称、职责和入门要求。', '完成 3 个岗位样本对比。', '判断是否继续探索这一类岗位。'),
      action('30 天内', '选择 1 个可探索方向继续补经历证据。', '把探索落到行动。', '只选择已经有真实岗位样本支撑的方向。', '完成 1 条经历-岗位证据补充。', '为后续简历准备提供材料。'),
      action('30 天内', '复盘这个方向是否值得继续验证。', '避免凭感觉做长期决定。', '看岗位是否可搜索、有初级入口、JD 能拆解、经历能对应。', '完成 1 次可探索方向复盘。', '决定继续找样本还是换一个样本。')
    ]
  };

  return [
    { ...focused[0], period: '7 天内' },
    { ...focused[1], period: '7 天内' },
    { ...focused[2], period: '14 天内' },
    ...followUps[route]
  ];
}

function action(period: string, what: string, why: string, how: string, completionStandard: string, jobSearchValue: string): ActionPlanItem {
  return {
    period,
    what,
    why,
    how,
    completionStandard,
    jobSearchValue,
    action: what,
    deliverable: completionStandard,
    resumeUsage: jobSearchValue,
    targetAbility: '经历证据整理与岗位验证'
  };
}

export function buildBasicReport(input: BasicReportInput): DiagnosisReport {
  const payload = isRecord(input) ? input : {};
  const mode = normalizeMode(payload.mode);
  const route = normalizeRoute(payload.route);
  const profile = normalizeProfile(payload.profile);
  const assets = confirmedAssets(payload.assets, profile);
  const jdText = readString(payload.jdText);
  const routeSummary: Record<V07JobRoute, string> = {
    has_direction_resume_not_ready: '本基础版会先判断简历材料是否能写、哪段经历最适合先整理、今天先补哪条经历证据；先补事实，再形成保守简历表达。',
    target_job_fit: '本基础版会先看当前材料能证明哪些岗位要求、哪些证据不足，以及投递前先改哪一条简历表达；不会做录取预测。',
    applying_no_feedback: '本基础版会先引导你整理最多 3 条投递记录，复盘岗位、简历版本、投递时间、反馈状态和可疑线索。',
    no_direction: '本基础版在没有真实岗位样本时不下方向结论；下一步只先找 1 个真实可搜索的初级岗位样本，并把方向称为可探索方向。'
  };
  const highlights = route ? buildRouteHighlights(assets, route) : buildHighlights(assets, mode);
  const rewrites = route ? buildRouteRewrites(assets, route) : buildRewrites(assets, mode);
  const actionPlans = route ? buildRouteActionPlan(route, assets) : buildActionPlan(mode, assets);
  const report: DiagnosisReport = {
    mode,
    source: 'real',
    isBasic: true,
    summary: `${BASIC_REPORT_NOTICE}\n\n${route ? routeSummary[route] : '本版本只做保守整理，优先减少空泛、混乱和无依据内容，让报告可参考、能行动。'}`,
    highlights,
    rewrites,
    directionOptions: mode === 'inventory' ? (route ? buildRouteDirections(route, assets) : buildDirections(assets)) : undefined,
    jdFit: mode === 'jd' ? buildJdFit(assets, jdText) : undefined,
    interviews: mode === 'jd' ? buildInterviews(assets) : undefined,
    actionPlan: {
      source: 'real',
      plans: actionPlans,
      confidenceSummary: '基础版结论偏保守，适合作为先行动、再补充深度分析的起点。'
    },
    safetyNotes: [
      '本报告只使用用户已确认或明确填写的材料。',
      '所有结果、数字、职责边界和岗位匹配判断都需要用户按真实情况核实。'
    ],
    resumeText: rewrites.map((item) => item.directVersion),
    platformFields: [
      `求职方向：${profile.targetRole || (mode === 'jd' ? '目标岗位' : '待验证方向')}`,
      `可用经历：${assets.map((asset) => asset.title).slice(0, 3).join('、') || '已确认基础材料'}`
    ],
    previewLines: [
      profile.targetRole || (mode === 'jd' ? '目标岗位诊断' : '岗位方向探索'),
      [profile.education, profile.schoolName, profile.major].filter(Boolean).join(' / ') || '基础信息待补充',
      assetAt(assets, 0).title
    ]
  };

  return validateDiagnosisReport(report);
}
