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
  return `任务：根据用户已确认经历、目标岗位 JD、已有补充回答，生成 V0.4 动态追问。

要求：
- 输出字段只能包含：source、assetId、userVisibleQuestions、internalMetadata、encouragement。
- userVisibleQuestions：1-3 个自然问题，必须具体引用用户原经历、目标岗位 JD 或已有回答；不要问“你做了什么”这类泛泛问题。
- internalMetadata：每个问题的内部追问依据，包含 questionId、relatedAssetId、relatedJdRequirementId、method、factDimensions、internalWhy。
- method 只能用 hr、tar、part、prep、custom；factDimensions 只能用 task、action、result、reflection、scale、tool、risk。
- JD 模式必须结合 JD 要求、用户已确认经历、用户已有补充回答；relatedJdRequirementId 优先绑定 jdSummary.requirements 对应的 req_x。
- 无 JD 模式也可以用 HR/TAR/PART/PREP 逻辑做内部追问，但不要展示这些方法名称。
- userVisibleQuestions 里禁止出现 TAR、PART、PREP、HR 视角、为什么问、事实回忆维度等内部标签。
- 不展示可能挖出的亮点，不给“你可以这样回答”的明确答案，不给完整示例，不输出简历草稿。
- encouragement：一句事实型、温和的提醒，告诉用户这一步只是回忆真实细节。
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
岗位要求 → 匹配程度 → 用户证据 → 缺口 → 简历写法 → 面试风险

匹配程度只能是：匹配较强、有一定匹配、需要补充证据、当前证据不足。
投递判断只能是：建议优先投递、可以投递，建议先优化简历、可以作为尝试方向、建议先补强后再重点投递。
source 必须为 "real"。
输出字段必须使用 deliveryDecision、deliveryReason、strongestEvidence、mainGap、nextStepAdvice、matrix。
每条 matrix 必须包含 requirement、matchLevel、evidence、gap、resumeWriting、interviewRisk。
只基于 jdSummary、profile 和 assets，不要编造经历；缺证据必须写清缺口。匹配程度不是对用户能力的评价，只判断现有材料是否能证明岗位要求。
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
    return `任务：生成 V0.4 无 JD 模式经历诊断报告。

无 JD 模式要求：
- mode 必须为 "inventory"。
- isBasic 必须为 false；只有规则模板兜底生成的基础版报告才可以为 true。
- 不要假装已经有 JD，不要输出 JD 证据矩阵，不要强制输出 5 个 JD 面试题。
- 至少 2 个经历亮点 hiddenHighlights/highlights。
- 至少 3 条简历改写建议 rewrites，只优化表达，不新增事实。
- 2-3 个可探索岗位方向 directionOptions；不是替用户决定职业方向，而是给出可用真实 JD 验证的岗位探索入口。
- 每个方向必须包含 directionName/name、searchableJobNames 3-5 个现实可搜索岗位名、whyExplore/why、evidence、gap、priority/level、sevenDayValidation/next、keywords 3-5 个。
- 每个方向必须绑定至少一段用户已确认经历；不允许证据错位；不输出抽象或现实中难以搜索的岗位；不用“最适合、不适合、强烈推荐”等绝对词。
- actionPlan 固定 7 天内、14 天内、30 天内，每个阶段至少 2 条。
- confidenceMessage/actionPlan.confidenceSummary 必须是事实型总结，不承诺结果。
- 无 JD 简历改写每条包含 relatedExperience/originalIssue/capability/directVersion/versionAfterSupplement/usageReminder，并兼容填充 original/optimized/reason/jdRequirement/risk/interviewProbe；如果缺证据，标注“需补充依据”或“待核实”。
- safetyNotes 必须提醒：不伪造、不编造、不承诺 offer、只基于真实经历。

source 必须为 "real"。

输入：
${JSON.stringify(payload)}`;
  }

  return `任务：生成 V0.4 有 JD 模式定制诊断报告。

有 JD 模式要求：
- mode 必须为 "jd"。
- isBasic 必须为 false；只有规则模板兜底生成的基础版报告才可以为 true。
- 必须输出 JD 证据匹配 jdFit：JD 要求、匹配程度、用户已有证据、缺口、如何补强。
- 至少 2 个用户自己可能没意识到的亮点 hiddenHighlights/highlights。
- 至少 3 条简历改写建议 rewrites，只优化表达，不新增事实。
- 模块名使用“面试追问与回答准备”，仅服务有 JD 模式。
- 5 个目标岗位 HR 可能追问的问题 interviewQuestions/interviews。
- 每个面试问题必须包含：HR 为什么可能会问、回答思路、占位式表达、注意边界；不输出可直接照抄的虚构完整答案。
- 1 条明确投递判断，只能使用：建议优先投递、可以投递，建议先优化简历、可以作为尝试方向、建议先补强后再重点投递。
- actionPlan 固定 7 天内、14 天内、30 天内，每个阶段至少 2 条。
- 有 JD 简历改写每条包含 relatedExperience/originalIssue/capability/directVersion/versionAfterSupplement/usageReminder，并兼容填充 original/optimized/reason/jdRequirement/risk/interviewProbe；如果缺证据，标注“需补充依据”或“待核实”。
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
    deliveryDecision: compactText(value.deliveryDecision || value.verdict, 40),
    deliveryReason: compactText(value.deliveryReason || value.basis, 140),
    strongestEvidence: compactText(value.strongestEvidence || value.maxAdvantage, 120),
    mainGap: compactText(value.mainGap || value.maxGap, 120),
    nextStepAdvice: compactText(value.nextStepAdvice || value.ifInsist, 120),
    matrix: matrix.map((row) => ({
      requirement: compactText(row.requirement, 120),
      matchLevel: compactText(row.matchLevel, 40),
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
- 2-3 个“可探索岗位方向”，用于帮助用户拿真实 JD 验证方向，不替用户决定职业方向。
- 每项必须含 directionName/name、searchableJobNames 3-5 个现实可搜索岗位名、whyExplore/why、evidence、gap、priority/level、sevenDayValidation/next、keywords 3-5 个。
- evidence 必须绑定至少一段用户已确认经历；证据不足就写“当前证据不足/需补充依据”，不要错配经历。
- sevenDayValidation 必须是 7 天内可以执行的验证动作，例如搜索真实 JD、整理经历证据、补作品或复盘材料。
- 不输出抽象岗位，不使用“最适合、不适合、强烈推荐”等绝对词，不承诺 offer。

${common}`;
    case 'report-rewrites':
      return `任务：生成 rewrites。
- 至少 3 条可复制但克制的简历改写建议。
- 每条含 relatedExperience/originalIssue/capability/directVersion/versionAfterSupplement/usageReminder。
- 同时兼容填充 original/optimized/reason/jdRequirement/risk/interviewProbe，optimized=directVersion，risk=usageReminder。
- 每条简历改写必须包含 risk 和 interviewProbe；不确定信息必须写“待核实/需补充依据”。
- 禁止把参与写成负责，不能把课程作业包装成企业项目。

${common}`;
    case 'report-jd-fit-summary':
      return `任务：生成 jdFit。
- 仅 JD 模式。
- 输出 deliveryDecision/deliveryReason/strongestEvidence/mainGap/nextStepAdvice。
- deliveryDecision 只能是：建议优先投递、可以投递，建议先优化简历、可以作为尝试方向、建议先补强后再重点投递。
- matrix 至少 1 行：requirement/matchLevel/evidence/gap/resumeWriting/interviewRisk。
- matchLevel 只能是：匹配较强、有一定匹配、需要补充证据、当前证据不足。
- 匹配程度不是对用户能力评价，只看现有材料是否能证明岗位要求。
- resumeWriting 保持协助/参与边界，无依据数据写待核实；禁止夸大成负责、主导、独立完成或承诺结果。

${common}`;
    case 'report-interviews':
      return `任务：生成 interviews。
- 模块名：面试追问与回答准备。
- 5 个 JD 面试追问。
- 每项含 question/whyAsk/answerAngle/concern/sampleAnswer/doNotExaggerate。
- sampleAnswer 字段只写占位式表达，不写可直接照抄的完整答案。
- 每项必须提醒注意边界，强调本人真实分工和待核实信息。

${common}`;
    case 'report-interview-question':
      return `任务：只生成第 ${interviewIndex} 个 JD 面试追问。
- 只输出一个 interview 对象。
- 包含 question/whyAsk/answerAngle/concern/sampleAnswer/doNotExaggerate。
- 问题要和 JD 要求、用户真实经历、简历改写风险相关。
- sampleAnswer 字段只写占位式表达，使用“我主要参与的是……”“我能确认的是……”等占位结构。
- 不输出可直接照抄的虚构完整答案，必须提醒注意边界。
- 必须写真实边界：“这部分数据需要按真实记录补充”或“如果没有明确数据，不建议写成结果提升”。

${common}`;
    case 'report-action-plan':
      return `任务：生成 summary/actionPlan/safetyNotes/resumeText/platformFields/previewLines。
- actionPlan 固定 7 天内、14 天内、30 天内，每个阶段至少 2 条。
- 每条行动包含 what/why/how/completionStandard/jobSearchValue，并兼容填充 action/deliverable/resumeUsage/targetAbility。
- confidenceSummary 基于事实修复信心，不承诺结果。
- resumeText/platformFields/previewLines 使用克制真实表达。
- safetyNotes 写不伪造、不编造、不承诺 offer、只基于真实经历。

${common}`;
  }
}
