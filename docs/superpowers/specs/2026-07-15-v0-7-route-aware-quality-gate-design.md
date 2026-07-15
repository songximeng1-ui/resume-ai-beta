# V0.7 Route-Aware Report Quality Gate Design

## Context

V0.7 has four job-search routes. The current report quality gate is still mostly keyed by `mode` (`inventory` or `jd`). During online smoke testing with a real resume PDF, `has_direction_resume_not_ready` and `applying_no_feedback` both generated deep report modules, but the final assembled report failed quality validation and fell back to the basic report.

The blocker was:

> 每个方向建议都必须包含方向名称、3-5 个可搜索岗位、探索原因、用户已有证据、风险或缺口、7 天验证动作。

That rule is correct for `no_direction`, but too strict for routes whose main action is resume evidence preparation or delivery-feedback review.

## Goal

Make report quality validation route-aware so a deep report is accepted when it satisfies the route's V0.7 action goal, while keeping conservative basic fallback for real quality failures.

This change stays inside V0.7. It does not enter V0.8 and does not change the DeepSeek primary plus Qwen fallback strategy.

## Non-Goals

- Do not add a new model.
- Do not make Qwen retry reports that only failed route-mismatched quality rules.
- Do not add a database, account system, backend dashboard, CRM, crawler, auto-apply, payment, or new route name.
- Do not loosen safety checks for fabrication, overpromising, privacy leakage, or model/provider exposure.

## Design

Add route context to report quality validation:

```ts
validateReportQuality(report, mode, route?)
```

The existing `mode` checks remain the base layer. Route-specific checks then decide which blockers apply.

### `no_direction`

Keep the strict direction-validation rule:

- Direction options must be framed as exploratory directions, not career recommendations.
- Each direction should include searchable job names, exploration reason, user evidence, gap or risk, and a 7-day validation action.
- The report must not say "recommended career", "most suitable", or similar unverified career-selection language.

### `has_direction_resume_not_ready`

Do not require every direction option to contain 3-5 searchable job names.

Required route checks:

- The report references at least one concrete user material item, such as an internship, campus activity, project, tool, or task.
- The action plan includes a first action about choosing one stable experience and supplementing facts.
- The first action should be small enough for a 20-35 minute task.
- The report must not promise a perfect resume, fabricate achievements, or imply one-shot resume completion.

### `applying_no_feedback`

Do not require direction options to contain 3-5 searchable job names.

Required route checks:

- The report includes a light delivery-review action, capped around 3 recent application records.
- The report asks for minimal review fields: role, resume version, delivery time, feedback status, and suspected clue.
- The report frames no-feedback as a material, role, timing, strategy, or market-feedback issue, not a personal failure.
- The report must not encourage mass application or anxiety-driven volume.

### `target_job_fit`

Keep JD-oriented checks:

- The report must compare target JD requirements with current material evidence.
- It must identify evidence gaps and one pre-delivery action.
- It must not predict admission, guarantee interviews, or make absolute "can/cannot apply" judgments.

## Error Handling

The basic fallback remains unchanged as the final safe fallback. It should trigger when:

- Model calls fail in a non-recoverable way.
- Schema validation cannot produce usable content.
- Safety blockers remain after sanitization.
- Route-aware quality blockers are still present.

Qwen fallback remains for retryable primary-model or schema/model-call failures. A route-mismatched quality rule should not be treated as a reason to call Qwen.

## Testing

Add focused tests around the quality gate and report endpoint:

- `has_direction_resume_not_ready` deep report should not fail solely because direction options lack 3-5 searchable job names.
- `applying_no_feedback` deep report should not fail solely because direction options lack 3-5 searchable job names.
- `no_direction` should still fail when exploratory direction details are missing.
- `target_job_fit` should still reject admission prediction or offer guarantees.
- Basic fallback identity tests should continue to pass.

Run:

```bash
npm.cmd test
npm.cmd run build
```

## Acceptance Criteria

- The real-resume smoke path can return deep reports for `has_direction_resume_not_ready` and `applying_no_feedback` when route-specific quality is acceptable.
- `no_direction` keeps the stricter real-job-sample rule.
- `target_job_fit` keeps the no-prediction rule.
- Basic fallback remains available and correctly identified.
- No model/provider/token/API key details are exposed to users.
