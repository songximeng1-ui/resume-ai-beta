export const careerCoachSystemPrompt = `你是有 20 年校招筛选经验的资深 HR、业务面试官、求职诊断顾问和温和陪伴型表达教练。你服务的用户多为普通本科、双非、二本、末流 211 的准应届生或应届生。你的任务不是打击用户，也不是虚假鼓励，而是温和、诚实、专业地帮助用户发现真实经历中的岗位价值，把口语化经历翻译成岗位语言。

必须遵守：
1. 只优化真实经历，不伪造经历。
2. 禁止伪造学历、学校层级、专业、公司、证书、实习时间、项目时间、岗位名称、项目成果。
3. 禁止把“参与”写成“负责”，不能把课程作业包装成真实企业项目。
4. 禁止编造数据、业绩、用户量、转化率、营收结果；没有依据时必须写“待核实”“需补充依据”或“不建议写入”。
5. 禁止承诺“必过简历筛选”“必拿 offer”“不承诺 offer”“一定适合某岗位”。
6. 禁止用羞辱、否定、刺痛用户的表达，不能说“你不行”“你很弱”。
7. 禁止泄露或复述身份证号、家庭住址、银行卡等敏感隐私信息。
8. 允许对真实经历做表达优化，允许把口语化经历翻译成专业表达。
9. 允许在用户提供依据时做保守量化，使用“协助、参与、约、累计、支持”等克制表达。
10. 可以指出差距，但必须给路径；鼓励必须基于事实，不灌鸡汤。
11. 每条建议必须贴合用户真实情况和目标岗位或探索方向，避免空话。
12. 输出必须是严格 JSON，不要 Markdown，不要 JSON 之外的解释。`;

export function structureResumePrompt(payload: unknown) {
  return `任务：把用户粘贴的简历文本结构化为基础信息和经历资产卡。

要求：
- 只根据用户原文识别，不能编造。
- 识别不确定的字段标记为“待用户确认”。
- 空白经历生成缺口/补强卡。
- source 必须为 "real"。

输入：
${JSON.stringify(payload)}`;
}

export function digQuestionsPrompt(payload: unknown) {
  return `任务：根据用户经历、目标岗位 JD、已有回答，动态生成一组“有帮助感”的经历挖掘追问。

要求：
- encouragement：一句基于这段真实经历的温和鼓励，不能空泛鸡汤。
- digIntent：说明这轮为什么问，要确认哪些岗位证据，例如用户沟通、数据整理、活动执行、内容产出、协作跟进。
- potentialHighlight：告诉用户这段经历可能挖出的亮点，用“可能”“如果能补充依据”表达，不要下定论。
- questions：1-3 个问题，必须具体引用用户原经历、目标岗位或已有回答；不要问“你做了什么”这类泛泛问题。
- answerHint：告诉用户怎么轻松回答，例如按“对象 + 动作 + 频次 + 结果/反馈”回答即可。
- resumePreview：基于当前已有信息给一条“如果补充得出来，可能可以写成”的简历表达草稿，必须包含“待核实”或“需补充依据”，不能编造数据。
- source 必须为 "real"。
- 不要制造焦虑，不要羞辱用户；问题要帮助用户看见真实价值。
- 禁止编造规模、业绩、转化率、公司、岗位职责；没有依据必须标注待核实或需补充依据。

输入：
${JSON.stringify(payload)}`;
}

export function jdFitPrompt(payload: unknown) {
  const source = isRecord(payload) ? payload : {};
  const compactPayload = source.jdSummary
    ? {
        stage: source.stage,
        profile: compactProfile(source.profile),
        assets: compactAssets(source.assets),
        jdSummary: source.jdSummary
      }
    : payload;
  return `任务：生成 JD 证据矩阵和投递判断。

矩阵格式：
岗位要求 → 用户证据 → 缺口 → 简历写法 → 面试风险

判断类型只能是：主投、可冲、过渡、暂不建议主投。
source 必须为 "real"。
只基于 jdSummary、profile 和 assets，不要编造经历；缺证据必须写清缺口。
JD 安全收口：简历写法优先用“协助、参与、支持、整理、跟进、配合、记录、复盘、尝试、约”；无明确证据时禁止使用“负责、主导、独立完成、显著提升、大幅增长、全流程、闭环、从 0 到 1、保证、必过、确保”。不确定处写“待核实/需补充依据”。

输入：
${JSON.stringify(compactPayload)}`;
}

export function jdSummaryPrompt(payload: unknown) {
  const source = isRecord(payload) ? payload : {};
  const compact = {
    stage: source.stage === 'junior' ? 'junior' : 'senior',
    profile: compactProfile(source.profile),
    jdText: compactText(source.jdText, 900)
  };
  return `任务：把 JD 压缩成后续匹配可用的摘要。

要求：
- source 必须为 "real"。
- role：岗位名称或岗位类别。
- requirements：提取 3-8 条核心要求，短句，不复制长段 JD。
- keywords：提取岗位关键词。
- riskNotes：提取面试/简历风险提示，例如需要数据、需要社群经验、需要 Excel。
- 不评价用户，不生成报告，不编造岗位信息。

输入：
${JSON.stringify(compact)}`;
}

export function reportPrompt(payload: unknown) {
  const mode = typeof payload === 'object' && payload && 'mode' in payload ? (payload as { mode?: unknown }).mode : 'jd';
  if (mode === 'inventory') {
    return `任务：生成 V0.3 无 JD 模式经历诊断报告。

无 JD 模式要求：
- mode 必须为 "inventory"。
- 不要假装已经有 JD，不要输出 JD 证据矩阵，不要强制输出 5 个 JD 面试题。
- 至少 2 个经历亮点 hiddenHighlights/highlights。
- 至少 2 条可直接复制的简历表达 resumeRewrites/rewrites。
- 2-3 个适合探索的岗位方向 directionOptions，每个方向说明：为什么适合、当前经历证据、风险或缺口、下一步应该补什么、搜索关键词。
- 至少 1 个 2-4 周内可执行的补强计划。
- confidenceMessage/actionPlan.confidenceSummary 必须是事实型总结，不承诺结果。
- 简历改写必须包含：原句、改写后、为什么这样改、是否可直接写入；如果缺证据，标注“需补充依据”或“待核实”。
- safetyNotes 必须提醒：不伪造、不编造、不承诺 offer、只基于真实经历。

source 必须为 "real"。

输入：
${JSON.stringify(payload)}`;
  }

  return `任务：生成 V0.3 有 JD 模式定制诊断报告。

有 JD 模式要求：
- mode 必须为 "jd"。
- 必须输出 JD 证据匹配 jdFit：JD 要求、用户已有证据、证据强度、缺口、如何补强。
- 至少 2 个用户自己可能没意识到的亮点 hiddenHighlights/highlights。
- 至少 2 条可直接复制到简历里的改写 resumeRewrites/rewrites。
- 5 个目标岗位 HR 可能追问的问题 interviewQuestions/interviews。
- 每个面试问题必须包含：HR 为什么问、回答角度、需要注意的风险、用户可参考的回答示例。
- 1 条明确投递判断：建议投递、可以投但需要调整简历、暂不建议主投、不建议投递；如使用主投/可冲/过渡/暂不建议主投，也必须解释原因。
- 至少 1 个具体补强计划。
- 简历改写必须包含：原句、改写后、为什么这样改、是否可直接写入；如果缺证据，标注“需补充依据”或“待核实”。
- safetyNotes 必须提醒：不伪造、不编造、不承诺 offer、只基于真实经历。

source 必须为 "real"。

输入：
${JSON.stringify(payload)}`;
}

export type ReportModuleTask =
  | 'report-highlights'
  | 'report-directions'
  | 'report-rewrites'
  | 'report-jd-fit-summary'
  | 'report-interviews'
  | 'report-interview-question'
  | 'report-action-plan';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function compactText(value: unknown, maxLength = 220) {
  const text = readString(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactProfile(value: unknown) {
  const profile = isRecord(value) ? value : {};
  return {
    education: compactText(profile.education, 40),
    schoolName: compactText(profile.schoolName, 40),
    major: compactText(profile.major, 40),
    graduation: compactText(profile.graduation, 40),
    city: compactText(profile.city, 40),
    targetRole: compactText(profile.targetRole, 80),
    internship: compactText(profile.internship, 180),
    project: compactText(profile.project, 180),
    campus: compactText(profile.campus, 140),
    partTime: compactText(profile.partTime, 120),
    awards: compactText(profile.awards, 100),
    skills: compactText(profile.skills, 120),
    portfolio: compactText(profile.portfolio, 80)
  };
}

function compactAssets(value: unknown) {
  const assets = Array.isArray(value) ? value : [];
  return assets
    .filter(isRecord)
    .filter((asset) => readString(asset.content).trim() || (Array.isArray(asset.notes) && asset.notes.length))
    .slice(0, 5)
    .map((asset) => ({
      id: compactText(asset.id, 24),
      title: compactText(asset.title, 40),
      content: compactText(asset.content, 220),
      notes: Array.isArray(asset.notes) ? asset.notes.slice(0, 3).map((note) => compactText(note, 120)) : []
    }));
}

function compactJdFit(value: unknown) {
  if (!isRecord(value)) return null;
  const matrix = Array.isArray(value.matrix) ? value.matrix.filter(isRecord).slice(0, 3) : [];
  return {
    verdict: compactText(value.verdict, 20),
    basis: compactText(value.basis, 140),
    maxAdvantage: compactText(value.maxAdvantage, 120),
    maxGap: compactText(value.maxGap, 120),
    ifInsist: compactText(value.ifInsist, 120),
    matrix: matrix.map((row) => ({
      requirement: compactText(row.requirement, 120),
      evidence: compactText(row.evidence, 140),
      gap: compactText(row.gap, 100),
      resumeWriting: compactText(row.resumeWriting, 100),
      interviewRisk: compactText(row.interviewRisk, 100)
    }))
  };
}

export function buildCompactReportContext(payload: unknown, task: ReportModuleTask) {
  const source = isRecord(payload) ? payload : {};
  const mode = source.mode === 'inventory' ? 'inventory' : 'jd';
  const base = {
    mode,
    stage: source.stage === 'junior' ? 'junior' : 'senior',
    profile: compactProfile(source.profile),
    assets: compactAssets(source.assets)
  };
  const jd = mode === 'jd' ? { jdText: compactText(source.jdText, 420), jdFit: compactJdFit(source.jdFit) } : {};

  switch (task) {
    case 'report-directions':
      return base;
    case 'report-jd-fit-summary':
      return { ...base, jdText: compactText(source.jdText, 520), jdFit: compactJdFit(source.jdFit) };
    case 'report-interviews':
      return { ...base, ...jd };
    case 'report-interview-question':
      return { ...base, ...jd, interviewIndex: typeof source.interviewIndex === 'number' ? source.interviewIndex : 1 };
    case 'report-action-plan':
      return { ...base, ...jd };
    case 'report-highlights':
    case 'report-rewrites':
    default:
      return { ...base, ...jd };
  }
}

export function reportModulePrompt(payload: unknown, task: ReportModuleTask, repair = false) {
  const mode = typeof payload === 'object' && payload && 'mode' in payload ? (payload as { mode?: unknown }).mode : 'jd';
  const repairInstruction = repair
    ? '\n修复：上次 JSON 不符合 schema。只补结构/缺字段，不改真实性边界。'
    : '';
  const context = buildCompactReportContext(payload, task);
  const contextRecord = context as Record<string, unknown>;
  const interviewIndex = typeof contextRecord.interviewIndex === 'number' ? contextRecord.interviewIndex : 1;
  const common = `上下文：
${JSON.stringify(context)}

红线：source="real"；只基于上下文；不编造学历/公司/证书/数据/业绩；无依据写“待核实/需补充依据/不建议写入”；输出严格 JSON。JD 安全：优先用“协助、参与、支持、整理、跟进、配合、记录、复盘、尝试、约”；禁止使用无依据的“负责、主导、独立完成、显著提升、大幅增长、全流程、闭环、从 0 到 1、保证、必过、确保”。${repairInstruction}`;

  switch (task) {
    case 'report-highlights':
      return `任务：生成 highlights。
- 至少 2 个真实隐藏亮点。
- 每项写来源经历、能力、岗位/JD 要求、非空泛理由、专业表达。
- ${mode === 'inventory' ? '无 JD：jdRequirement 写探索方向能力，不假装有 JD。' : '有 JD：jdRequirement 结合目标 JD。'}

${common}`;
    case 'report-directions':
      return `任务：生成 inventory 的 directionOptions。
- 2-3 个方向。
- 每项含 why/evidence/gap/next/keywords。
- 不承诺 offer，不替用户决定人生。

${common}`;
    case 'report-rewrites':
      return `任务：生成 rewrites。
- 至少 2 条可复制但克制的改写。
- 每条含 original/optimized/reason/jdRequirement/risk/interviewProbe。
- 每条简历改写必须包含 risk 和 interviewProbe；不确定信息必须写“待核实/需补充依据”。
- 禁止把参与写成负责，不能把课程作业包装成企业项目。

${common}`;
    case 'report-jd-fit-summary':
      return `任务：生成 jdFit。
- 仅 JD 模式。
- 输出 verdict/basis/maxAdvantage/maxGap/ifInsist。
- matrix 至少 1 行：requirement/evidence/gap/resumeWriting/interviewRisk。
- resumeWriting 保持协助/参与边界，无依据数据写待核实；禁止夸大成负责、主导、独立完成或承诺结果。

${common}`;
    case 'report-interviews':
      return `任务：生成 interviews。
- 5 个 JD 面试追问。
- 每项含 question/whyAsk/answerAngle/concern/sampleAnswer/doNotExaggerate。
- 示例回答必须保守，强调本人真实分工和待核实边界。

${common}`;
    case 'report-interview-question':
      return `任务：只生成第 ${interviewIndex} 个 JD 面试追问。
- 只输出一个 interview 对象。
- 包含 question/whyAsk/answerAngle/concern/sampleAnswer/doNotExaggerate。
- 问题要和 JD 要求、用户真实经历、简历改写风险相关。
- 示例回答必须短一些，保守，使用“我主要参与的是……”或“我协助完成的是……”。
- 必须写真实边界：“这部分数据需要按真实记录补充”或“如果没有明确数据，不建议写成结果提升”。

${common}`;
    case 'report-action-plan':
      return `任务：生成 summary/actionPlan/safetyNotes/resumeText/platformFields/previewLines。
- actionPlan 至少 1 条，2-4 周或 7-14 天内可执行，有 deliverable/resumeUsage。
- confidenceSummary 基于事实修复信心，不承诺结果。
- resumeText/platformFields/previewLines 使用克制真实表达。
- safetyNotes 写不伪造、不编造、不承诺 offer、只基于真实经历。

${common}`;
  }
}
