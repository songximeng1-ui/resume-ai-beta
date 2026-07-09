import type { DiagnosisReport } from './types';

function cleanLines(lines: Array<string | undefined | null>) {
  return lines.map((line) => String(line || '').trim()).filter(Boolean);
}

function bullet(label: string, value: string | undefined | null) {
  return value ? `- **${label}：** ${value}` : '';
}

function section(title: string, lines: Array<string | undefined | null>) {
  const body = cleanLines(lines).join('\n');
  return body ? `## ${title}\n\n${body}` : '';
}

export function buildActionPlanText(report: DiagnosisReport) {
  return report.actionPlan.plans
    .map((item) =>
      cleanLines([
        `${item.period}`,
        `动作：${item.action || item.what}`,
        `产出物：${item.deliverable || item.completionStandard}`,
        `简历用法：${item.resumeUsage || item.jobSearchValue}`,
        `补强能力：${item.targetAbility || item.why}`
      ]).join('\n')
    )
    .join('\n\n');
}

export function buildReportMarkdown(report: DiagnosisReport) {
  const modeLabel = report.mode === 'jd' ? '有岗位要求路线' : '无岗位要求方向探索';
  const parts = [
    `# 求职诊断报告\n\n- **报告模式：** ${modeLabel}\n- **报告类型：** ${report.isBasic ? '基础版兜底报告' : '深度诊断报告'}`,
    section('报告摘要', [report.summary]),
    section(
      '真实经历亮点',
      report.highlights.flatMap((item) => [
        `### ${item.sourceExperience}`,
        bullet('体现能力', item.capability),
        bullet(report.mode === 'jd' ? '对应岗位要求' : '可迁移方向/能力场景', item.jdRequirement),
        bullet('为什么是真实亮点', item.whyNotFlattery),
        bullet('专业表达', item.professionalExpression)
      ])
    ),
    report.jdFit
      ? section('岗位要求匹配分析', [
          bullet('投递判断', report.jdFit.deliveryDecision),
          bullet('判断依据', report.jdFit.deliveryReason),
          bullet('最强证据', report.jdFit.strongestEvidence),
          bullet('主要缺口', report.jdFit.mainGap),
          bullet('下一步建议', report.jdFit.nextStepAdvice),
          ...report.jdFit.matrix.flatMap((item) => [
            `### ${item.requirement}`,
            bullet('匹配程度', item.matchLevel),
            bullet('用户证据', item.evidence),
            bullet('当前缺口', item.gap),
            bullet('简历写法', item.resumeWriting),
            bullet('面试风险', item.interviewRisk)
          ])
        ])
      : '',
    report.directionOptions?.length
      ? section(
          '可探索岗位方向',
          report.directionOptions.flatMap((item) => [
            `### ${item.directionName || item.name}`,
            bullet('探索优先级', item.level || item.priority),
            bullet('为什么可以探索', item.whyExplore || item.why),
            bullet('对应经历证据', item.evidence),
            bullet('当前缺口', item.gap),
            bullet('7 天验证动作', item.sevenDayValidation || item.next),
            bullet('可搜索岗位名称', item.searchableJobNames.join('、'))
          ])
        )
      : '',
    section(
      '简历改写建议',
      report.rewrites.flatMap((item) => [
        `### ${item.relatedExperience}`,
        bullet('原始表达', item.original),
        bullet('可直接使用版', item.optimized || item.directVersion),
        bullet('为什么这样改', item.reason),
        bullet('使用提醒', item.risk || item.usageReminder)
      ])
    ),
    report.interviews?.length
      ? section(
          '面试追问与回答准备',
          report.interviews.flatMap((item) => [
            `### ${item.question}`,
            bullet('HR 为什么可能会问', item.whyAsk),
            bullet('回答思路', item.answerAngle),
            bullet('关注点', item.concern),
            bullet('占位式表达', item.sampleAnswer),
            bullet('注意边界', item.doNotExaggerate)
          ])
        )
      : '',
    section(
      '下一步行动计划',
      report.actionPlan.plans.flatMap((item) => [
        `### ${item.period}`,
        bullet('周期', item.period),
        bullet('动作', item.action || item.what),
        bullet('产出物', item.deliverable || item.completionStandard),
        bullet('简历用法', item.resumeUsage || item.jobSearchValue),
        bullet('补强能力', item.targetAbility || item.why)
      ])
    ),
    section('信心修复总结', [report.actionPlan.confidenceSummary]),
    section('简历正文版', report.resumeText),
    section('招聘平台字段版', report.platformFields),
    section('极简预览版', report.previewLines),
    section('安全提醒', report.safetyNotes || [])
  ];

  return cleanLines(parts).join('\n\n');
}

export function buildReportText(report: DiagnosisReport) {
  return buildReportMarkdown(report)
    .replace(/^#\s+/gm, '')
    .replace(/^##\s+/gm, '')
    .replace(/^###\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^- /gm, '');
}
