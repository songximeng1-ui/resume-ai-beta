import { describe, expect, test } from 'vitest';
import type { DiagnosisReport } from '../src/types.ts';
import { containsUnsafeAdvice, findUnsafeAdvice, sanitizeRiskyResumeLanguage, validateReportQuality } from './reportQuality.ts';

function jdReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  const report: DiagnosisReport = {
    mode: 'jd',
    source: 'demo',
    summary: '基于用户运营 JD 和教育机构实习经历，当前可以尝试投递，但需要补清楚社群维护边界和内容产出。',
    highlights: [
      {
        sourceExperience: '教育机构新媒体运营实习',
        capability: '社群维护与用户触达',
        jdRequirement: '社群运营、用户沟通',
        whyNotFlattery: '用户确实做过社群提醒和内容整理，能支撑基础运营动作。',
        professionalExpression: '协助维护学生社群，整理活动通知与反馈信息。'
      },
      {
        sourceExperience: '校园调研项目',
        capability: '信息整理与复盘',
        jdRequirement: '用户反馈整理、Excel 使用',
        whyNotFlattery: '问卷设计和 Excel 汇总可以对应基础数据整理。',
        professionalExpression: '参与问卷设计，使用 Excel 汇总调研结果并完成课堂展示。'
      }
    ],
    rewrites: [
      {
        original: '维护学生群，发通知。',
        optimized: '协助维护 3 个学生社群，按活动节奏发布通知并整理到课反馈。',
        reason: '把动作、对象和产出边界说清楚，保留“协助”表述。',
        jdRequirement: '社群维护',
        risk: '社群数量和到课反馈方式需要用户确认真实。',
        interviewProbe: '可能会追问通知频率、社群规模和反馈记录方式。'
      },
      {
        original: '做过问卷和表格。',
        optimized: '参与校园二手交易调研，设计问卷并用 Excel 汇总结果，支持课堂展示。',
        reason: '补充项目场景、工具和交付物，更方便 HR 理解。',
        jdRequirement: '用户反馈整理',
        risk: '不能写成独立负责完整商业调研。',
        interviewProbe: '可能会追问问卷样本量和你负责的具体部分。'
      }
    ],
    jdFit: {
      source: 'demo',
      verdict: '可冲',
      basis: '用户经历能覆盖社群维护、内容整理和反馈汇总，但缺少独立活动策划案例。',
      maxAdvantage: '有教育机构用户触达和社群维护经历。',
      maxGap: '缺少活动转化、复盘指标或独立负责案例。',
      ifInsist: '简历先突出协助维护、反馈整理和内容支持，并准备好边界说明。',
      matrix: [
        {
          requirement: '社群维护与用户沟通',
          evidence: '教育机构实习中协助维护 3 个学生社群并发布活动通知。',
          gap: '社群规模、频率和反馈结果仍需补充依据。',
          resumeWriting: '可写为协助维护学生社群并整理活动反馈。',
          interviewRisk: 'HR 可能追问你是否独立负责以及具体社群规模。'
        }
      ]
    },
    interviews: Array.from({ length: 5 }, (_, index) => ({
      question: `你在社群维护中具体做了哪些动作？${index + 1}`,
      whyAsk: 'HR 想确认你是真实参与，而不是只写概念。',
      answerAngle: '按对象、频率、工具、反馈结果说明自己的参与边界。',
      concern: '不要把协助说成独立负责，也不要补不存在的数据。',
      sampleAnswer: '我主要协助老师维护学生社群，每周整理活动通知并记录学生反馈。',
      doNotExaggerate: '不能把参与通知发布说成完整负责社群增长。'
    })),
    actionPlan: {
      source: 'demo',
      plans: [
        {
          period: '2 周',
          action: '整理一次社群活动通知到反馈的完整记录，补充频率、对象和工具。',
          deliverable: '1 份社群维护复盘表',
          resumeUsage: '用于补充社群维护经历的真实细节。',
          targetAbility: '用户沟通与运营复盘'
        }
      ],
      confidenceSummary: '当前经历可以支撑基础运营岗位尝试，重点是把真实边界讲清楚。'
    },
    safetyNotes: ['只基于真实经历，不伪造、不编造，不承诺 offer。'],
    resumeText: ['协助维护学生社群，整理活动通知和反馈。'],
    platformFields: ['用户运营实习；社群维护；Excel'],
    previewLines: ['有教育机构用户触达经历，可尝试用户运营实习。']
  };
  return { ...report, ...overrides };
}

function inventoryReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  const report: DiagnosisReport = {
    mode: 'inventory',
    source: 'demo',
    summary: '当前最可用的筹码是社群维护、内容整理、问卷调研和 Excel 汇总。',
    highlights: jdReport().highlights,
    rewrites: [
      {
        original: '在教育机构帮忙发推文和群通知。',
        optimized: '协助教育机构整理公众号推文素材，并在学生社群中发布活动通知。',
        reason: '把零散动作整理成岗位能理解的内容支持和用户触达。',
        jdRequirement: '可迁移到社群运营、内容运营助理方向。',
        risk: '使用前确认推文素材整理频率和社群数量。',
        interviewProbe: '可能被问到每周参与频率和具体工具。'
      },
      {
        original: '用 Excel 整理问卷。',
        optimized: '参与校园调研项目，使用 Excel 汇总问卷结果并支持展示汇报。',
        reason: '突出工具、材料来源和交付物。',
        jdRequirement: '可迁移到数据运营助理或项目助理方向。',
        risk: '不能写成商业数据分析项目。',
        interviewProbe: '可能被问到样本量和表格处理方式。'
      }
    ],
    directionOptions: [
      {
        name: '用户运营 / 社群运营',
        level: '优先探索',
        why: '基于当前经历，更值得优先探索的是需要社群维护、活动通知和反馈整理的岗位。',
        evidence: '教育机构实习中有学生社群维护、公众号内容整理和用户触达。',
        gap: '当前证据还不充分的是活动复盘、用户分层和数据记录。',
        next: '未来 2 周补一份社群活动复盘表，记录对象、频率、反馈和改进。',
        keywords: ['用户运营', '社群运营', '活动运营']
      },
      {
        name: '新媒体运营助理',
        level: '可以尝试',
        why: '公众号推文素材整理和剪映技能可以支持基础内容岗位尝试。',
        evidence: '有公众号排版、推文整理和剪映基础。',
        gap: '还需要补充可展示作品和内容数据复盘。',
        next: '整理 2 篇内容作品，补充选题、排版和复盘说明。',
        keywords: ['新媒体运营', '内容运营助理']
      }
    ],
    actionPlan: {
      source: 'demo',
      plans: [
        {
          period: '2-4 周',
          action: '整理 2 个经历复盘页：一个社群维护案例，一个问卷调研案例。',
          deliverable: '2 页作品集或简历素材',
          resumeUsage: '用于用户运营、项目助理和新媒体运营助理投递。',
          targetAbility: '经历表达、内容整理、基础复盘'
        }
      ],
      confidenceSummary: '你不是没有经历，而是需要把现有动作整理成岗位语言和可展示材料。'
    },
    safetyNotes: ['方向建议只作为探索起点，不替用户决定人生。'],
    resumeText: ['协助整理内容素材，维护学生社群。'],
    platformFields: ['社群维护；公众号排版；Excel'],
    previewLines: ['可优先探索用户运营、社群运营和新媒体运营助理。']
  };
  return { ...report, ...overrides };
}

describe('report quality checks', () => {
  test('有 JD 报告满足 V0.3 成功诊断标准时通过', () => {
    const result = validateReportQuality(jdReport(), 'jd');

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.blockers).toEqual([]);
  });

  test('无 JD 报告满足方向诊断标准时通过，且不要求 JD 面试题', () => {
    const result = validateReportQuality(inventoryReport(), 'inventory');

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.blockers).toEqual([]);
  });

  test('缺少关键 JD 输出时失败', () => {
    const result = validateReportQuality(jdReport({ interviews: [] }), 'jd');

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('有 JD 报告必须包含至少 5 个目标岗位 HR 面试追问。');
  });

  test('无 JD 报告不应伪装成 JD 报告', () => {
    const result = validateReportQuality(inventoryReport({ jdFit: jdReport().jdFit }), 'inventory');

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('无 JD 报告不应输出 JD 证据矩阵或假装已有 JD。');
  });

  test('报告正文中出现鼓励造假或过度承诺的建议时失败', () => {
    const unsafe = jdReport({
      rewrites: [
        {
          ...jdReport().rewrites[0],
          optimized: '没有也可以写成你负责社群增长，保证 offer。'
        },
        jdReport().rewrites[1]
      ]
    });

    const result = validateReportQuality(unsafe, 'jd');

    expect(containsUnsafeAdvice('禁止伪造经历，不承诺 offer，所有数据都要待核实。')).toBe(false);
    expect(containsUnsafeAdvice('只基于真实经历表达；不伪造、不编造；不承诺 offer。')).toBe(false);
    expect(containsUnsafeAdvice('没有也可以写成你负责社群增长，保证 offer。')).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('报告正文存在可能鼓励造假、夸大或过度承诺的表达。');
  });

  test('安全检测区分禁止性说明和实际违规建议', () => {
    expect(containsUnsafeAdvice('风险提醒：避免虚构数据，不能把参与写成负责，缺少依据时写待核实。')).toBe(false);
    expect(containsUnsafeAdvice('不要使用主导、独立负责、显著提升，除非用户明确提供证据。')).toBe(false);
    expect(containsUnsafeAdvice('如果没有证据，不建议把课程作业包装成企业项目。')).toBe(false);

    expect(containsUnsafeAdvice('可以把课程作业包装成企业项目，写成你负责增长。')).toBe(true);
    expect(containsUnsafeAdvice('没有也可以写独立负责社群增长，保证通过筛选。')).toBe(true);
    expect(containsUnsafeAdvice('建议写成主导活动执行并显著提升转化率。')).toBe(true);
  });

  test('JD 报告包含安全风险提醒时不触发 blocker', () => {
    const result = validateReportQuality(
      jdReport({
        rewrites: [
          {
            ...jdReport().rewrites[0],
            risk: '避免虚构社群规模；不能把参与写成负责；没有依据的数据标注待核实。'
          },
          {
            ...jdReport().rewrites[1],
            interviewProbe: '可能会被问是否主导项目；如无证据，不要说独立完成或显著提升。'
          }
        ],
        safetyNotes: ['避免编造数据；不要伪造经历；不承诺 offer；所有不确定内容写待核实。']
      }),
      'jd'
    );

    expect(result.blockers).toEqual([]);
    expect(result.passed).toBe(true);
  });

  test('简历改写正文出现无依据过度包装词时触发 blocker', () => {
    const result = validateReportQuality(
      jdReport({
        rewrites: [
          {
            ...jdReport().rewrites[0],
            optimized: '主导社群运营并独立完成用户增长方案，显著提升转化率。'
          },
          jdReport().rewrites[1]
        ]
      }),
      'jd'
    );

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('报告正文存在可能鼓励造假、夸大或过度承诺的表达。');
  });

  test('简历改写 optimized 中无边界的负责表达也返回安全溯源', () => {
    const result = validateReportQuality(
      jdReport({
        rewrites: [
          {
            ...jdReport().rewrites[0],
            optimized: '负责社群用户增长和活动转化。'
          },
          jdReport().rewrites[1]
        ]
      }),
      'jd'
    );

    expect(result.passed).toBe(false);
    expect(result.safetyFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'rewrites[0].optimized',
          matchedText: expect.stringContaining('负责社群用户增长'),
          riskKind: 'exaggeration',
          severity: 'blocker'
        })
      ])
    );
  });

  test('JD 报告安全清洗会收口改写和面试示例中的过度包装表达', () => {
    const risky = jdReport({
      rewrites: [
        {
          ...jdReport().rewrites[0],
          optimized: '主导社群运营并独立负责全流程闭环，从 0 到 1 显著提升转化率，保证通过筛选。',
          risk: '',
          interviewProbe: ''
        },
        {
          ...jdReport().rewrites[1],
          optimized: '可以包装成负责用户增长，独立完成数据复盘。',
          risk: '可能被问是否真的主导。',
          interviewProbe: '说明增长结果。'
        }
      ],
      jdFit: {
        ...jdReport().jdFit!,
        matrix: [
          {
            ...jdReport().jdFit!.matrix[0],
            resumeWriting: '建议写成主导社群全流程并显著提升转化率。'
          }
        ]
      },
      interviews: jdReport().interviews!.map((item, index) => ({
        ...item,
        sampleAnswer:
          index === 0
            ? '我主导社群增长并独立完成全流程闭环，确保转化率大幅增长。'
            : item.sampleAnswer
      })),
      resumeText: ['负责全流程社群增长，显著提升转化率。'],
      previewLines: ['写了就能提高通过率。']
    });

    const sanitized = sanitizeRiskyResumeLanguage(risky);
    const serialized = JSON.stringify(sanitized);
    const quality = validateReportQuality(sanitized, 'jd');

    expect(serialized).not.toMatch(/主导|独立负责|独立完成|显著提升|大幅增长|全流程|闭环|从 0 到 1|保证|确保|可以包装成/);
    expect(sanitized.rewrites[0].optimized).toContain('参与');
    expect(sanitized.rewrites[0].risk).toMatch(/需补充依据|待核实|按真实记录/);
    expect(sanitized.rewrites[0].interviewProbe).toMatch(/需补充依据|待核实|按真实记录/);
    expect(sanitized.interviews?.[0].sampleAnswer).toMatch(/我主要参与的是|我协助完成的是/);
    expect(sanitized.interviews?.[0].sampleAnswer).toContain('按真实记录补充');
    expect(quality.passed).toBe(true);
    expect(quality.blockers).toEqual([]);
  });

  test('安全检测返回字段路径、命中内容和风险类型，且忽略禁止性 safetyNotes', () => {
    const report = jdReport({
      summary: '可以包装成负责用户增长项目，保证通过筛选。',
      safetyNotes: ['禁止伪造经历，不建议写成负责，不承诺 offer，缺少依据写待核实。']
    });

    const quality = validateReportQuality(report, 'jd');
    const findings = findUnsafeAdvice(report);

    expect(quality.passed).toBe(false);
    expect(quality.safetyFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'summary',
          matchedText: expect.stringContaining('可以包装成'),
          riskKind: 'fabrication',
          severity: 'blocker'
        }),
        expect.objectContaining({
          path: 'summary',
          matchedText: expect.stringContaining('保证通过筛选'),
          riskKind: 'overpromise',
          severity: 'blocker'
        })
      ])
    );
    expect(findings.some((finding) => finding.path.startsWith('safetyNotes'))).toBe(false);
  });

  test('JD 全字段安全清洗覆盖 summary highlights jdFit actionPlan resumeText platformFields previewLines', () => {
    const risky = jdReport({
      summary: '主导用户增长全流程，保证 offer。',
      highlights: [
        {
          ...jdReport().highlights[0],
          capability: '主导增长闭环',
          jdRequirement: '负责全流程',
          whyNotFlattery: '可以包装成企业项目。',
          professionalExpression: '独立完成社群增长闭环。'
        },
        jdReport().highlights[1]
      ],
      jdFit: {
        ...jdReport().jdFit!,
        basis: '保证匹配岗位。',
        maxAdvantage: '主导社群全流程。',
        maxGap: '缺少依据也可以写。',
        ifInsist: '建议写成主导。',
        matrix: [
          {
            ...jdReport().jdFit!.matrix[0],
            gap: '缺少数据也可以写成显著提升。',
            interviewRisk: '可以说成负责增长。'
          }
        ]
      },
      actionPlan: {
        ...jdReport().actionPlan,
        confidenceSummary: '这样写保证通过筛选。'
      },
      safetyNotes: ['不要编造经历，不建议写成负责，不承诺 offer。'],
      resumeText: ['主导全流程闭环，显著提升转化率。'],
      platformFields: ['可以包装成负责用户增长。'],
      previewLines: ['保证 offer。']
    });

    const sanitized = sanitizeRiskyResumeLanguage(risky);
    const serialized = JSON.stringify(sanitized);
    const quality = validateReportQuality(sanitized, 'jd');

    expect(serialized).not.toMatch(/主导|独立负责|独立完成|显著提升|大幅增长|全流程|闭环|从 0 到 1|保证 offer|保证通过|可以包装成|可以说成负责|没有也可以写|建议写成主导/);
    expect(sanitized.safetyNotes).toContain('不要编造经历，不建议写成负责，不承诺 offer。');
    expect(quality.passed).toBe(true);
    expect(quality.safetyFindings).toEqual([]);
  });

  test('空泛鸡汤式行动计划会产生质量警告', () => {
    const result = validateReportQuality(
      inventoryReport({
        actionPlan: {
          ...inventoryReport().actionPlan,
          plans: [
            {
              period: '未来',
              action: '努力提升综合素质，增强岗位认知。',
              deliverable: '',
              resumeUsage: '',
              targetAbility: '综合能力'
            }
          ]
        }
      }),
      'inventory'
    );

    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('补强计划存在偏空泛或不可验证的表达。');
    expect(result.score).toBeLessThan(100);
  });
});
