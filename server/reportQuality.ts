import type { DiagnosisReport, InterviewPrep, JdFitReport, Mode, ReportQualityResult, ResumeRewrite, UnsafeFinding } from '../src/types.ts';

export type { ReportQualityResult, UnsafeFinding };

const unsafeAdvicePatterns: Array<{
  pattern: RegExp;
  riskKind: UnsafeFinding['riskKind'];
  severity: UnsafeFinding['severity'];
}> = [
  { pattern: /保证\s*offer/i, riskKind: 'overpromise', severity: 'blocker' },
  { pattern: /保证\s*(?:通过|筛选|录用)/, riskKind: 'overpromise', severity: 'blocker' },
  { pattern: /一定通过/, riskKind: 'overpromise', severity: 'blocker' },
  { pattern: /必过筛选/, riskKind: 'overpromise', severity: 'blocker' },
  { pattern: /可以.*(?:编造|伪造|虚构|包装成)/, riskKind: 'fabrication', severity: 'blocker' },
  { pattern: /建议.*(?:编造|伪造|虚构|包装成)/, riskKind: 'fabrication', severity: 'blocker' },
  { pattern: /可以写成你负责/, riskKind: 'exaggeration', severity: 'blocker' },
  { pattern: /没有也可以写/, riskKind: 'fabrication', severity: 'blocker' },
  { pattern: /缺少(?:依据|数据)也可以写成/, riskKind: 'fabrication', severity: 'blocker' },
  { pattern: /建议.*写成.*(?:负责|主导|独立负责|独立完成|显著提升)/, riskKind: 'exaggeration', severity: 'blocker' },
  { pattern: /可以.*写成.*(?:负责|主导|独立负责|独立完成|显著提升)/, riskKind: 'exaggeration', severity: 'blocker' },
  { pattern: /把课程作业包装成企业项目/, riskKind: 'fabrication', severity: 'blocker' },
  { pattern: /夸大在职时间/, riskKind: 'fabrication', severity: 'blocker' },
  { pattern: /(?:主导|独立负责|独立完成|显著提升|大幅增长|全流程|闭环|从\s*0\s*到\s*1)/, riskKind: 'exaggeration', severity: 'blocker' },
  { pattern: /(?:保证|必过|确保)(?!.*(?:不承诺|不能|不要|不建议))/, riskKind: 'overpromise', severity: 'blocker' }
];

const prohibitionMarkers = [
  '禁止',
  '不能',
  '不要',
  '不得',
  '不建议',
  '严禁',
  '不允许',
  '不可',
  '不承诺',
  '不伪造',
  '不编造',
  '请勿',
  '避免',
  '如无证据',
  '没有依据',
  '缺少依据',
  '待核实',
  '需补充依据',
  '需核实'
];
const genericPatterns = [/提升综合素质/, /增强岗位认知/, /加强学习/, /努力提升/, /认真准备/, /全面提高/];
const riskyClaimPatterns = [
  /没有也可以写/,
  /可以包装成/,
  /可以说成负责/,
  /写成负责/,
  /建议写成主导/,
  /独立负责/,
  /独立完成/,
  /负责全流程/,
  /全流程/,
  /闭环/,
  /从\s*0\s*到\s*1/,
  /主导/,
  /显著提升/,
  /大幅增长/,
  /保证/,
  /必过/,
  /确保/
];
const boundaryMarkers = ['待核实', '需补充依据', '按真实记录', '不建议', '真实记录'];

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsefulText(value: unknown, minLength = 6): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function splitAdviceSentences(text: string): string[] {
  return text
    .split(/[。！？!?\n；;]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isProhibitionSentence(sentence: string): boolean {
  return prohibitionMarkers.some((marker) => sentence.includes(marker));
}

function isBoundaryRiskSentence(sentence: string): boolean {
  return (
    isProhibitionSentence(sentence) ||
    /(追问|被问|是否|边界|风险|核实|真实分工|真实记录|按真实)/.test(sentence) ||
    (/缺少/.test(sentence) && !/也可以写/.test(sentence))
  );
}

export function containsUnsafeAdvice(text: string): boolean {
  return findUnsafeAdvice(text).some((finding) => finding.severity === 'blocker');
}

function collectText(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, output));
    return output;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectText(item, output));
  }
  return output;
}

function collectTextEntries(value: unknown, path = '', output: Array<{ path: string; text: string }> = []) {
  if (typeof value === 'string') {
    output.push({ path: path || 'text', text: value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTextEntries(item, `${path}[${index}]`, output));
    return output;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (['quality', 'usage', 'reportTask'].includes(key)) return;
      collectTextEntries(item, path ? `${path}.${key}` : key, output);
    });
  }
  return output;
}

export function findUnsafeAdvice(value: unknown): UnsafeFinding[] {
  return collectTextEntries(value).flatMap(({ path, text }) =>
    splitAdviceSentences(text).flatMap((sentence) => {
      if (isBoundaryRiskSentence(sentence)) return [];
      return unsafeAdvicePatterns.flatMap(({ pattern, riskKind, severity }) => {
        const match = sentence.match(pattern);
        if (!match) return [];
        return [
          {
            path,
            matchedText: sentence,
            riskKind,
            severity
          }
        ];
      });
    })
  );
}

function hasGenericText(text: string): boolean {
  return genericPatterns.some((pattern) => pattern.test(text));
}

function hasUnsafeRewriteClaim(report: DiagnosisReport): boolean {
  return findUnsafeRewriteClaims(report).length > 0;
}

function findUnsafeRewriteClaims(report: DiagnosisReport): UnsafeFinding[] {
  return report.rewrites.flatMap((rewrite, index) => {
    const text = rewrite.optimized;
    if (/(主导|独立负责|独立完成|显著提升|大幅增长|全流程|闭环|从\s*0\s*到\s*1|保证|必过|确保|虚构|没有也可以写|可以包装成)/.test(text)) {
      return [
        {
          path: `rewrites[${index}].optimized`,
          matchedText: text,
          riskKind: /保证|必过|确保/.test(text) ? 'overpromise' : 'exaggeration',
          severity: 'blocker'
        }
      ] satisfies UnsafeFinding[];
    }
    if (/负责/.test(text) && !/(协助负责|参与负责|支持负责|配合负责)/.test(text)) {
      return [
        {
          path: `rewrites[${index}].optimized`,
          matchedText: text,
          riskKind: 'exaggeration',
          severity: 'blocker'
        }
      ] satisfies UnsafeFinding[];
    }
    return [];
  });
}

function sanitizeClaimText(text: string): string {
  return splitAdviceSentences(text)
    .map((sentence) => {
      return sentence
    .replace(/没有也可以写/g, '不建议写入无依据内容')
    .replace(/缺少(依据|数据)也可以写成/g, '缺少$1时不建议写成')
    .replace(/可以包装成/g, '需按真实经历表达为')
    .replace(/可以说成负责/g, '需按真实经历表达为参与')
    .replace(/写成负责/g, '写成参与')
    .replace(/建议写成主导/g, '建议写成参与')
    .replace(/独立负责/g, '参与')
    .replace(/独立完成/g, '参与完成')
    .replace(/负责全流程/g, '参与相关流程')
    .replace(/全流程/g, '相关流程')
    .replace(/闭环/g, '跟进相关环节')
    .replace(/从\s*0\s*到\s*1/g, '参与前期整理与推进')
    .replace(/主导/g, '参与')
    .replace(/显著提升/g, '支持改进（需补充依据）')
    .replace(/大幅增长/g, '支持改进（需补充依据）')
    .replace(/保证/g, '不承诺')
    .replace(/必过/g, '不承诺通过')
    .replace(/确保/g, '需核实')
    .replace(/写了就能提高通过率/g, '不承诺提高通过率')
    .replace(/负责/g, '参与');
    })
    .join('。');
}

function hasRiskyClaimText(text: string): boolean {
  return riskyClaimPatterns.some((pattern) => pattern.test(text));
}

function withBoundary(text: string, fallback: string): string {
  const value = text.trim() || fallback;
  if (boundaryMarkers.some((marker) => value.includes(marker))) {
    return sanitizeClaimText(value);
  }
  return `${sanitizeClaimText(value)}；需补充依据，按真实记录说明。`;
}

function sanitizeInterviewAnswer(text: string): string {
  const sanitized = sanitizeClaimText(text);
  const hasRoleBoundary = /我主要参与的是|我协助完成的是/.test(sanitized);
  const answer = hasRoleBoundary ? sanitized : `我主要参与的是：${sanitized}`;
  if (/按真实记录补充|如果没有明确数据，不建议写成结果提升/.test(answer)) {
    return answer;
  }
  return `${answer} 这部分数据需要按真实记录补充；如果没有明确数据，不建议写成结果提升。`;
}

export function sanitizeRiskyRewrite(rewrite: ResumeRewrite): ResumeRewrite {
  const optimized = sanitizeClaimText(rewrite.optimized);
  const needsBoundary = hasRiskyClaimText(rewrite.optimized) || !rewrite.risk.trim() || !rewrite.interviewProbe.trim();
  return {
    ...rewrite,
    optimized,
    reason: sanitizeClaimText(rewrite.reason),
    risk: needsBoundary
      ? withBoundary(rewrite.risk, '这条改写涉及职责、规模或结果边界')
      : sanitizeClaimText(rewrite.risk),
    interviewProbe: needsBoundary
      ? withBoundary(rewrite.interviewProbe, '面试中可能追问真实分工、数据来源和产出边界')
      : sanitizeClaimText(rewrite.interviewProbe)
  };
}

export function sanitizeRiskyJdFit(jdFit: JdFitReport): JdFitReport {
  return {
    ...jdFit,
    basis: sanitizeClaimText(jdFit.basis),
    maxAdvantage: sanitizeClaimText(jdFit.maxAdvantage),
    maxGap: sanitizeClaimText(jdFit.maxGap),
    ifInsist: sanitizeClaimText(jdFit.ifInsist),
    matrix: jdFit.matrix.map((row) => ({
      ...row,
      evidence: sanitizeClaimText(row.evidence),
      gap: sanitizeClaimText(row.gap),
      resumeWriting: withBoundary(row.resumeWriting, '简历写法需保留参与边界'),
      interviewRisk: withBoundary(row.interviewRisk, '面试中需说明真实分工')
    }))
  };
}

function sanitizeActionPlan(report: DiagnosisReport['actionPlan']): DiagnosisReport['actionPlan'] {
  return {
    ...report,
    plans: report.plans.map((plan) => ({
      ...plan,
      action: sanitizeClaimText(plan.action),
      deliverable: sanitizeClaimText(plan.deliverable),
      resumeUsage: sanitizeClaimText(plan.resumeUsage),
      targetAbility: sanitizeClaimText(plan.targetAbility)
    })),
    confidenceSummary: sanitizeClaimText(report.confidenceSummary)
  };
}

export function sanitizeRiskyInterview(interview: InterviewPrep): InterviewPrep {
  return {
    ...interview,
    answerAngle: sanitizeClaimText(interview.answerAngle),
    concern: withBoundary(interview.concern, '需要说明真实边界'),
    sampleAnswer: sanitizeInterviewAnswer(interview.sampleAnswer),
    doNotExaggerate: withBoundary(interview.doNotExaggerate, '不要把参与写成负责')
  };
}

export function sanitizeRiskyResumeLanguage(report: DiagnosisReport): DiagnosisReport {
  if (report.mode !== 'jd') {
    return report;
  }

  const sanitized: DiagnosisReport = {
    ...report,
    summary: sanitizeClaimText(report.summary || ''),
    highlights: report.highlights.map((highlight) => ({
      ...highlight,
      sourceExperience: sanitizeClaimText(highlight.sourceExperience),
      capability: sanitizeClaimText(highlight.capability),
      jdRequirement: sanitizeClaimText(highlight.jdRequirement),
      whyNotFlattery: sanitizeClaimText(highlight.whyNotFlattery),
      professionalExpression: sanitizeClaimText(highlight.professionalExpression)
    })),
    rewrites: report.rewrites.map((rewrite) => {
      return sanitizeRiskyRewrite(rewrite);
    }),
    jdFit: report.jdFit ? sanitizeRiskyJdFit(report.jdFit) : report.jdFit,
    interviews: report.interviews?.map((interview) => sanitizeRiskyInterview(interview)),
    actionPlan: sanitizeActionPlan(report.actionPlan),
    safetyNotes: report.safetyNotes?.map((note) => (isBoundaryRiskSentence(note) ? note : sanitizeClaimText(note))),
    resumeText: report.resumeText.map(sanitizeClaimText),
    platformFields: report.platformFields.map(sanitizeClaimText),
    previewLines: report.previewLines.map(sanitizeClaimText)
  };

  return sanitized;
}

function hasConcreteActionPlan(report: DiagnosisReport): boolean {
  return report.actionPlan.plans.some((plan) => {
    const hasPeriod = /天|周|月/.test(plan.period);
    const hasAction = hasUsefulText(plan.action, 12) && !hasGenericText(plan.action);
    return hasPeriod && hasAction && isNonEmptyText(plan.deliverable) && isNonEmptyText(plan.resumeUsage);
  });
}

function checkCommonReport(report: DiagnosisReport, blockers: string[], warnings: string[], safetyFindings: UnsafeFinding[]) {
  if (report.highlights.length < 2) {
    blockers.push('报告必须包含至少 2 个用户可能没意识到的亮点。');
  }

  if (report.rewrites.length < 2) {
    blockers.push('报告必须包含至少 2 条可直接复制的简历改写。');
  }

  if (report.actionPlan.plans.length < 1) {
    blockers.push('报告必须包含至少 1 个具体补强计划。');
  } else if (!hasConcreteActionPlan(report)) {
    warnings.push('补强计划存在偏空泛或不可验证的表达。');
  }

  const blockerFindings = safetyFindings.filter((finding) => finding.severity === 'blocker');
  if (blockerFindings.length || hasUnsafeRewriteClaim(report)) {
    blockers.push('报告正文存在可能鼓励造假、夸大或过度承诺的表达。');
  }
}

function checkJdReport(report: DiagnosisReport, blockers: string[], warnings: string[]) {
  if (!report.jdFit) {
    blockers.push('有 JD 报告必须包含投递判断和 JD 证据匹配结构。');
    return;
  }

  if (!isNonEmptyText(report.jdFit.verdict) || !isNonEmptyText(report.jdFit.basis)) {
    blockers.push('有 JD 报告必须包含明确投递判断和理由。');
  }

  if (report.jdFit.matrix.length < 1) {
    blockers.push('有 JD 报告必须包含 JD 证据矩阵。');
  }

  const matrixIsConcrete = report.jdFit.matrix.some(
    (row) =>
      hasUsefulText(row.requirement) &&
      hasUsefulText(row.evidence) &&
      hasUsefulText(row.gap) &&
      hasUsefulText(row.resumeWriting) &&
      hasUsefulText(row.interviewRisk)
  );
  if (!matrixIsConcrete) {
    blockers.push('JD 证据矩阵必须同时包含岗位要求、用户证据、缺口、简历写法和面试风险。');
  }

  if (!report.interviews || report.interviews.length < 5) {
    blockers.push('有 JD 报告必须包含至少 5 个目标岗位 HR 面试追问。');
    return;
  }

  const incompleteInterview = report.interviews.some(
    (item) =>
      !hasUsefulText(item.question) ||
      !hasUsefulText(item.whyAsk) ||
      !hasUsefulText(item.answerAngle) ||
      !hasUsefulText(item.concern) ||
      !hasUsefulText(item.sampleAnswer)
  );
  if (incompleteInterview) {
    blockers.push('每个面试追问都必须包含为什么问、回答角度、关注风险和回答示例。');
  }

  const hasJdAndEvidence = collectText(report.jdFit.matrix).join('\n');
  if (!/JD|岗位|要求|社群|运营|用户|内容/.test(hasJdAndEvidence)) {
    warnings.push('JD 证据矩阵可能没有充分结合岗位要求和用户经历。');
  }
}

function checkInventoryReport(report: DiagnosisReport, blockers: string[]) {
  if (report.jdFit) {
    blockers.push('无 JD 报告不应输出 JD 证据矩阵或假装已有 JD。');
  }

  const directionCount = report.directionOptions?.length ?? 0;
  if (directionCount < 2 || directionCount > 3) {
    blockers.push('无 JD 报告必须包含 2-3 个岗位方向建议。');
  }

  const incompleteDirection = (report.directionOptions ?? []).some(
    (direction) =>
      !hasUsefulText(direction.name) ||
      !hasUsefulText(direction.why) ||
      !hasUsefulText(direction.evidence) ||
      !hasUsefulText(direction.gap) ||
      !hasUsefulText(direction.next) ||
      direction.keywords.length < 1
  );
  if (incompleteDirection) {
    blockers.push('每个方向建议都必须说明为什么适合、用户已有证据、风险或缺口、下一步补什么。');
  }
}

function calculateScore(blockers: string[], warnings: string[]): number {
  return Math.max(0, Math.min(100, 100 - blockers.length * 25 - warnings.length * 8));
}

export function validateReportQuality(report: DiagnosisReport, mode: Mode): ReportQualityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const safetyFindings = [...findUnsafeAdvice(report), ...findUnsafeRewriteClaims(report)];

  checkCommonReport(report, blockers, warnings, safetyFindings);
  if (mode === 'jd') {
    checkJdReport(report, blockers, warnings);
  } else {
    checkInventoryReport(report, blockers);
  }

  return {
    passed: blockers.length === 0,
    score: calculateScore(blockers, warnings),
    blockers,
    warnings,
    safetyFindings
  };
}
