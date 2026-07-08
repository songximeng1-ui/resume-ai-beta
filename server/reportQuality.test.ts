import { describe, expect, test } from 'vitest';
import type { DiagnosisReport } from '../src/types.ts';
import { containsUnsafeAdvice, findUnsafeAdvice, sanitizeRiskyResumeLanguage, validateReportQuality } from './reportQuality.ts';

function v04Rewrite(overrides: Record<string, string> = {}) {
  const rewrite = {
    relatedExperience: '教育机构新媒体运营实习',
    originalIssue: '原表达只写通知动作，缺少对象、周期和本人边界。',
    capability: '社群维护、活动通知、反馈整理',
    directVersion: '协助维护 3 个学生社群，按活动节奏发布通知并整理到课反馈。',
    versionAfterSupplement: '补充通知频率、社群规模来源和反馈记录方式后，可进一步写清楚真实产出。',
    usageReminder: '社群数量和到课反馈方式需要用户确认真实。',
    original: '维护学生群，发通知。',
    optimized: '协助维护 3 个学生社群，按活动节奏发布通知并整理到课反馈。',
    reason: '把动作、对象和产出边界说清楚，保留“协助”表述。',
    jdRequirement: '社群维护',
    risk: '社群数量和到课反馈方式需要用户确认真实。',
    interviewProbe: '可能会追问通知频率、社群规模和反馈记录方式。'
  };
  return { ...rewrite, ...overrides };
}

function v04ActionPlan(source: 'real' | 'demo' = 'demo') {
  const item = (
    period: string,
    what: string,
    why: string,
    how: string,
    completionStandard: string,
    jobSearchValue: string
  ) => ({
    period,
    what,
    why,
    how,
    completionStandard,
    jobSearchValue,
    action: what,
    deliverable: completionStandard,
    resumeUsage: jobSearchValue,
    targetAbility: why
  });
  return {
    source,
    plans: [
      item('7 天内', '整理一份已确认经历清单，标注每段经历的任务、工具和产出。', '先筛选能真实写入简历的经历证据。', '按任务、工具、产出、本人边界四列整理。', '1 份经历素材表', '用于筛选可写入简历的真实经历。'),
      item('7 天内', '挑选 3 个真实岗位 JD，记录岗位名称、要求关键词和常见任务。', '用真实岗位要求验证当前材料。', '记录重复出现的能力词、任务描述和证据缺口。', '1 份岗位关键词对照表', '用于判断简历表达是否对应真实岗位。'),
      item('14 天内', '补充一份社群维护或内容整理复盘，写清对象、频率、动作和反馈。', '把现有经历补成可被追问的事实材料。', '补充对象、频率、本人动作、反馈记录和不能夸大的边界。', '1 页经历复盘', '用于改写用户运营或内容运营相关经历。'),
      item('14 天内', '整理 2 个可展示作品或过程材料，并补上本人分工说明。', '让简历表达有材料支撑。', '选择作品链接、截图或过程说明，并标注素材来源和本人参与部分。', '2 个作品材料链接或截图说明', '用于支撑新媒体运营助理投递。'),
      item('30 天内', '完成 6 次小批量投递，并记录岗位、简历版本和反馈。', '用真实反馈验证方向和简历版本。', '记录岗位名称、JD 关键词、投递版本、反馈和下一步修改点。', '1 份投递记录表', '用于迭代简历关键词和投递方向。'),
      item('30 天内', '针对反馈最高的方向准备 5 个面试追问题纲。', '确认简历内容能在面试中解释清楚。', '每个问题写清关联经历、可说事实、待核实信息和不能夸大的边界。', '1 份面试准备清单', '用于把简历经历转成可解释的面试素材。')
    ],
    confidenceSummary: '当前经历可以支撑基础运营岗位尝试，重点是把真实边界讲清楚。'
  };
}

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
      v04Rewrite(),
      v04Rewrite({
        relatedExperience: '校园二手交易调研项目',
        originalIssue: '原表达没有说明项目场景、工具和本人分工。',
        capability: '问卷设计、Excel 汇总、展示支持',
        directVersion: '参与校园二手交易调研，设计问卷并用 Excel 汇总结果，支持课堂展示。',
        versionAfterSupplement: '补充问卷样本量、问题维度和展示结论后，可进一步说明项目产出。',
        usageReminder: '不能写成独立负责完整商业调研。',
        original: '做过问卷和表格。',
        optimized: '参与校园二手交易调研，设计问卷并用 Excel 汇总结果，支持课堂展示。',
        reason: '补充项目场景、工具和交付物，更方便 HR 理解。',
        jdRequirement: '用户反馈整理',
        risk: '不能写成独立负责完整商业调研。',
        interviewProbe: '可能会追问问卷样本量和你负责的具体部分。'
      }),
      v04Rewrite({
        relatedExperience: '公众号排版和剪映素材处理',
        originalIssue: '工具能力需要连接到真实任务，不能只罗列软件名称。',
        capability: '内容整理、基础排版、短视频素材处理',
        directVersion: '整理公众号推文素材并完成基础排版，同时使用剪映处理活动短视频素材。',
        versionAfterSupplement: '补充作品截图、素材来源和参与频率后，可写成更具体的内容支持经历。',
        usageReminder: '使用前需要确认参与频率、素材来源和具体产出是否真实。',
        original: '会公众号排版和剪映。',
        optimized: '整理公众号推文素材并完成基础排版，同时使用剪映处理活动短视频素材。',
        reason: '把工具能力放回真实任务场景，避免只罗列软件名称。',
        jdRequirement: '内容整理、基础内容制作',
        risk: '使用前需要确认参与频率、素材来源和具体产出是否真实。',
        interviewProbe: '可能会追问你负责的是素材整理、排版还是完整内容策划。'
      })
    ],
    jdFit: {
      source: 'demo',
      deliveryDecision: '可以投递，建议先优化简历',
      deliveryReason: '用户经历能覆盖社群维护、内容整理和反馈汇总，但缺少独立活动策划案例。',
      strongestEvidence: '有教育机构用户触达和社群维护经历。',
      mainGap: '缺少活动转化、复盘指标或独立负责案例。',
      nextStepAdvice: '简历先突出协助维护、反馈整理和内容支持，并准备好边界说明。',
      matrix: [
        {
          requirement: '社群维护与用户沟通',
          matchLevel: '有一定匹配',
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
    actionPlan: v04ActionPlan(),
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
    rewrites: jdReport().rewrites,
    directionOptions: [
      {
        directionName: '用户运营 / 社群运营',
        name: '用户运营 / 社群运营',
        level: '优先探索',
        priority: '优先探索',
        searchableJobNames: ['用户运营', '社群运营', '活动运营'],
        whyExplore: '基于当前经历，更值得优先探索的是需要社群维护、活动通知和反馈整理的岗位。',
        why: '基于当前经历，更值得优先探索的是需要社群维护、活动通知和反馈整理的岗位。',
        evidence: '教育机构实习中有学生社群维护、公众号内容整理和用户触达。',
        gap: '当前证据还不充分的是活动复盘、用户分层和数据记录。',
        sevenDayValidation: '7 天内搜索 3 个用户运营或社群运营 JD，补一份社群活动复盘表，记录对象、频率、反馈和改进。',
        next: '未来 2 周补一份社群活动复盘表，记录对象、频率、反馈和改进。',
        keywords: ['用户运营', '社群运营', '活动运营']
      },
      {
        directionName: '新媒体运营助理',
        name: '新媒体运营助理',
        level: '可以尝试',
        priority: '可以尝试',
        searchableJobNames: ['新媒体运营', '内容运营助理', '公众号运营'],
        whyExplore: '公众号推文素材整理和剪映技能可以支持基础内容岗位尝试。',
        why: '公众号推文素材整理和剪映技能可以支持基础内容岗位尝试。',
        evidence: '有公众号排版、推文整理和剪映基础。',
        gap: '还需要补充可展示作品和内容数据复盘。',
        sevenDayValidation: '7 天内搜索 3 个新媒体运营助理 JD，整理 2 篇内容作品，补充选题、排版和复盘说明。',
        next: '整理 2 篇内容作品，补充选题、排版和复盘说明。',
        keywords: ['新媒体运营', '内容运营助理', '公众号运营']
      }
    ],
    actionPlan: v04ActionPlan(),
    safetyNotes: ['方向建议只作为探索起点，不替用户决定人生。'],
    resumeText: ['协助整理内容素材，维护学生社群。'],
    platformFields: ['社群维护；公众号排版；Excel'],
    previewLines: ['可优先探索用户运营、社群运营和新媒体运营助理。']
  };
  return { ...report, ...overrides };
}

describe('report quality checks', () => {
  test('有 JD 报告满足 V0.4 成功诊断标准时通过', () => {
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
          },
          jdReport().rewrites[2]
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
          jdReport().rewrites[1],
          jdReport().rewrites[2]
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
          jdReport().rewrites[1],
          jdReport().rewrites[2]
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
        },
        jdReport().rewrites[2]
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
        deliveryReason: '保证匹配岗位。',
        strongestEvidence: '主导社群全流程。',
        mainGap: '缺少依据也可以写。',
        nextStepAdvice: '建议写成主导。',
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
              ...inventoryReport().actionPlan.plans[0],
              what: '努力提升综合素质，增强岗位认知。',
              why: '提升综合能力。',
              how: '继续努力。',
              completionStandard: '完成记录',
              jobSearchValue: '用于求职准备',
              action: '努力提升综合素质，增强岗位认知。',
              deliverable: '完成记录',
              resumeUsage: '用于求职准备',
              targetAbility: '综合能力'
            },
            ...inventoryReport().actionPlan.plans.slice(1)
          ]
        }
      }),
      'inventory'
    );

    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('补强计划存在偏空泛或不可验证的表达。');
    expect(result.score).toBeLessThan(100);
  });

  test('证据字段过于笼统且没有指向具体经历时产生质量警告', () => {
    const result = validateReportQuality(
      jdReport({
        jdFit: {
          ...jdReport().jdFit!,
          matrix: [
            {
              ...jdReport().jdFit!.matrix[0],
              evidence: '材料能证明部分岗位要求。'
            }
          ]
        }
      }),
      'jd'
    );

    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('报告证据引用过于笼统，建议明确绑定具体经历、动作或材料。');
    expect(result.score).toBeLessThan(100);
  });
});
