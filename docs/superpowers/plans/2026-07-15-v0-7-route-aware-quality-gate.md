# V0.7 Route-Aware Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent `has_direction_resume_not_ready` and `applying_no_feedback` deep reports from being incorrectly downgraded to basic reports by `no_direction`-style direction validation.

**Architecture:** Keep the existing report-quality gate, but pass optional V0.7 route context into it. Use mode-level safety checks as the base layer, then apply route-specific blockers only where they match the route's V0.7 action goal.

**Tech Stack:** TypeScript, Express, Vitest, Vite.

## Global Constraints

- Stay inside V0.7.
- Do not enter V0.8.
- Do not add a new model.
- Do not change the DeepSeek primary plus Qwen fallback strategy.
- Do not add a database, account system, backend dashboard, CRM, crawler, auto-apply, payment, or new route name.
- Do not loosen safety checks for fabrication, overpromising, privacy leakage, or model/provider exposure.
- Do not modify `V07JobRoute` naming.
- Do not submit `resume-ai-beta-work-upload.zip`.

---

### Task 1: Add Route-Aware Quality Tests

**Files:**
- Modify: `server/reportQuality.test.ts`
- Read: `server/reportQuality.ts`
- Read: `src/types.ts`

**Interfaces:**
- Consumes: existing `validateReportQuality(report, mode)` export from `server/reportQuality.ts`
- Produces: failing tests that call `validateReportQuality(report, mode, route)`

- [ ] **Step 1: Inspect existing report quality test helpers**

Run:

```bash
Select-String -Path server/reportQuality.test.ts -Pattern "validateReportQuality|DiagnosisReport|directionOptions|actionPlan" -Context 2,4
```

Expected: identify the helper report shapes already used by report-quality tests.

- [ ] **Step 2: Write failing tests for the two misclassified routes**

In `server/reportQuality.test.ts`, add tests equivalent to:

```ts
test('has_direction_resume_not_ready does not require exploratory direction job lists', () => {
  const report = validInventoryReport({
    directionOptions: [
      {
        directionName: '简历材料整理',
        name: '简历材料整理',
        level: '过渡方向',
        priority: '过渡方向',
        searchableJobNames: [],
        whyExplore: '用户已经有销售实习经历，当前重点是先补清对象、动作、工具、周期和交付物。',
        why: '先把一段最稳经历整理成可写入简历的证据。',
        evidence: '特斯拉销售实习：接待客户、记录需求、协助跟进试驾安排。',
        gap: '还缺少周期、工具、交付物和本人边界。',
        sevenDayValidation: '今天先补 1 条经历证据，不需要先列岗位方向。',
        next: '补完事实后再生成保守简历表达。',
        keywords: []
      }
    ],
    actionPlan: validActionPlan([
      {
        period: '今天',
        what: '先选特斯拉销售实习这一段经历，补清对象、本人动作、工具、周期和交付物。',
        why: '先补事实，再形成保守简历表达。',
        how: '用 20-35 分钟列出五项事实，只写能解释清楚的信息。',
        completionStandard: '完成 1 条经历证据清单。',
        jobSearchValue: '用于生成第一条保守简历表达。',
        action: '先选特斯拉销售实习这一段经历，补清对象、本人动作、工具、周期和交付物。',
        deliverable: '完成 1 条经历证据清单。',
        resumeUsage: '用于生成第一条保守简历表达。',
        targetAbility: '经历证据整理'
      }
    ])
  });

  const result = validateReportQuality(report, 'inventory', 'has_direction_resume_not_ready');

  expect(result.blockers).not.toContain(
    '每个方向建议都必须包含方向名称、3-5 个可搜索岗位、探索原因、用户已有证据、风险或缺口、7 天验证动作。'
  );
  expect(result.passed).toBe(true);
});
```

Add a matching test for `applying_no_feedback`:

```ts
test('applying_no_feedback does not require exploratory direction job lists', () => {
  const report = validInventoryReport({
    directionOptions: [
      {
        directionName: '投递记录复盘',
        name: '投递记录复盘',
        level: '过渡方向',
        priority: '过渡方向',
        searchableJobNames: [],
        whyExplore: '用户已经有投递无反馈问题，当前重点是复盘最近记录。',
        why: '先从岗位、简历版本、投递时间、反馈状态和可疑线索定位问题。',
        evidence: '简历中有特斯拉销售实习和校园经历，可用于对照最近投递版本。',
        gap: '还缺少最近 3 条投递记录。',
        sevenDayValidation: '今天整理最多 3 条投递记录。',
        next: '只调整一个变量，再观察下一轮反馈。',
        keywords: []
      }
    ],
    actionPlan: validActionPlan([
      {
        period: '今天',
        what: '整理最多 3 条投递记录，记录岗位、简历版本、投递时间、反馈状态和可疑线索。',
        why: '先复盘事实，不评价用户本人。',
        how: '只记录最近 3 条，不扩大成完整 CRM。',
        completionStandard: '完成最多 3 条投递记录。',
        jobSearchValue: '判断问题可能在材料、岗位、节奏还是市场反馈。',
        action: '整理最多 3 条投递记录。',
        deliverable: '完成最多 3 条投递记录。',
        resumeUsage: '判断问题可能在材料、岗位、节奏还是市场反馈。',
        targetAbility: '投递复盘'
      }
    ])
  });

  const result = validateReportQuality(report, 'inventory', 'applying_no_feedback');

  expect(result.blockers).not.toContain(
    '每个方向建议都必须包含方向名称、3-5 个可搜索岗位、探索原因、用户已有证据、风险或缺口、7 天验证动作。'
  );
  expect(result.passed).toBe(true);
});
```

Use existing local helper names if they differ; do not create unrelated fixtures.

- [ ] **Step 3: Write a guard test for `no_direction`**

Add:

```ts
test('no_direction still requires exploratory direction details', () => {
  const report = validInventoryReport({
    directionOptions: [
      {
        directionName: '运营方向',
        name: '运营方向',
        level: '过渡方向',
        priority: '过渡方向',
        searchableJobNames: [],
        whyExplore: '材料里有运营线索。',
        why: '材料里有运营线索。',
        evidence: '已有材料。',
        gap: '',
        sevenDayValidation: '',
        next: '',
        keywords: []
      }
    ]
  });

  const result = validateReportQuality(report, 'inventory', 'no_direction');

  expect(result.blockers).toContain(
    '每个方向建议都必须包含方向名称、3-5 个可搜索岗位、探索原因、用户已有证据、风险或缺口、7 天验证动作。'
  );
});
```

- [ ] **Step 4: Run the targeted test and verify it fails**

Run:

```bash
npm.cmd test -- server/reportQuality.test.ts
```

Expected: FAIL because `validateReportQuality` does not accept route context yet or still applies the direction blocker to all inventory reports.

---

### Task 2: Implement Route-Aware Quality Gate

**Files:**
- Modify: `server/reportQuality.ts`
- Modify: `server/index.ts`
- Test: `server/reportQuality.test.ts`
- Optional Test: `server/index.test.ts`

**Interfaces:**
- Consumes: `V07JobRoute` from `src/types.ts`
- Produces: `validateReportQuality(report: DiagnosisReport, mode: Mode, route?: V07JobRoute | null): ReportQualityResult`

- [ ] **Step 1: Update the quality function signature**

In `server/reportQuality.ts`, import `V07JobRoute` as a type and update:

```ts
export function validateReportQuality(report: DiagnosisReport, mode: Mode): ReportQualityResult
```

to:

```ts
export function validateReportQuality(report: DiagnosisReport, mode: Mode, route?: V07JobRoute | null): ReportQualityResult
```

- [ ] **Step 2: Gate direction-detail blocker by route**

Locate the inventory direction validation that pushes:

```ts
'每个方向建议都必须包含方向名称、3-5 个可搜索岗位、探索原因、用户已有证据、风险或缺口、7 天验证动作。'
```

Wrap it so it applies only when:

```ts
const requiresExploratoryDirections = mode === 'inventory' && (!route || route === 'no_direction');
```

Do not remove general safety checks, unsafe rewrite checks, generic-text warnings, evidence-alignment warnings, or basic structural checks.

- [ ] **Step 3: Add route-specific blockers for the two routes**

Add small helper checks inside `server/reportQuality.ts`:

```ts
function reportText(report: DiagnosisReport) {
  return collectText(report).join('\n');
}

function hasActionPlanText(report: DiagnosisReport, pattern: RegExp) {
  return report.actionPlan.plans.some((plan) =>
    pattern.test([plan.what, plan.action, plan.how, plan.completionStandard, plan.deliverable].join('\n'))
  );
}
```

For `has_direction_resume_not_ready`, push a blocker if the report does not include a first-action style evidence task:

```ts
if (route === 'has_direction_resume_not_ready') {
  if (!hasActionPlanText(report, /(先选|先整理|今天先补|补清|经历证据|本人动作|工具|周期|交付物)/)) {
    blockers.push('有方向但简历未准备好路线必须给出先整理 1 段真实经历证据的今日行动。');
  }
}
```

For `applying_no_feedback`, push a blocker if the report does not include lightweight delivery review:

```ts
if (route === 'applying_no_feedback') {
  const text = reportText(report);
  if (!/(最多\s*3\s*条|3\s*条投递|投递记录)/.test(text) || !/(简历版本|投递时间|反馈状态|可疑线索)/.test(text)) {
    blockers.push('已投递但没反馈路线必须引导整理最多 3 条投递记录，并包含岗位、简历版本、投递时间、反馈状态和可疑线索。');
  }
}
```

- [ ] **Step 4: Pass route from endpoint quality checks**

In `server/index.ts`, update `attachReportQuality`:

```ts
function attachReportQuality(report: DiagnosisReport, mode: Mode): DiagnosisReport
```

to:

```ts
function attachReportQuality(report: DiagnosisReport, mode: Mode, route?: unknown): DiagnosisReport
```

Normalize the route locally:

```ts
function normalizeV07Route(value: unknown): V07JobRoute | undefined {
  return value === 'has_direction_resume_not_ready' ||
    value === 'target_job_fit' ||
    value === 'applying_no_feedback' ||
    value === 'no_direction'
    ? value
    : undefined;
}
```

Then call:

```ts
quality: validateReportQuality(safeReport, qualityMode, normalizeV07Route(route))
```

Update callers in `ensureClientSafeReport` and `ensureClientSafeReportForTask` to pass `body.route` into `attachReportQuality`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm.cmd test -- server/reportQuality.test.ts server/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm.cmd test
npm.cmd run build
```

Expected:

```text
Test Files  12 passed
Tests  182+ passed
vite ... built
```

- [ ] **Step 7: Optional online smoke retest**

Use the existing `.agents/tmp/resume-test-extracted.txt` and beta access code to rerun the two affected routes against local or deployed service after deployment. Expected after deployment:

- `has_direction_resume_not_ready` returns `isBasic: false` if its route-specific quality passes.
- `applying_no_feedback` returns `isBasic: false` if its route-specific quality passes.
- `no_direction` and `target_job_fit` behavior remains unchanged.

- [ ] **Step 8: Commit implementation**

Run:

```bash
git add server/reportQuality.ts server/reportQuality.test.ts server/index.ts server/index.test.ts
git commit -m "fix: make v0.7 report quality route-aware"
```

Only include `server/index.test.ts` if modified.

---

## Self-Review

- Spec coverage: route-aware validation, no model strategy change, basic fallback retention, and route-specific acceptance are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: `V07JobRoute` is consumed from `src/types.ts`; `validateReportQuality(report, mode, route?)` is the single new interface.
