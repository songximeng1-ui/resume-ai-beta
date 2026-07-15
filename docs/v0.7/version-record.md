# V0.7 版本记录

## 阶段目标

V0.7 将产品主线从“一次性求职诊断报告”升级为“21 天应届生求职行动陪跑 MVP”。本阶段验证普通应届生是否能围绕四种求职状态完成诊断、今日行动、记录、复盘和下一步调整。

## 公共底座完成情况

- 首页完成四状态分流：还没方向、有方向但简历没准备好、已投递但没反馈、有目标岗位想判断能不能投。
- 建立统一的 `V07JobRoute`、`V07Step`、`V07PlanState`、`V07DailyTask`、`V07TaskRecord` 和 V0.7 session 结构。
- 旧 `stage` / `mode` / `step` 保留为 legacy，并支持迁移或安全降级。
- 旧 inventory / jd 诊断能力继续保留，作为路线内部的诊断依据和材料库。
- 清除数据入口覆盖 V0.7 session、records 和旧 session。

## Foundation Hardening

- `V07LeastHelpfulPart` 已收口为明确字面值类型。
- `leastHelpfulParts` 支持 `none`，且 `none` 与其他负面选项互斥。
- 客户端 AI 错误提示已脱敏，不向用户展示原始错误、provider、模型名、token、成本、API key、base URL、schema 或 parse 等内部细节。

## Route Reviewer 检查机制

已新增 `docs/v0.7/route-reviewer-checklist.md`，用于每条路线的设计前检查、实现计划检查、中途 diff 检查和最终验收检查。检查重点包括行动闭环、任务难度、伦理边界、数据最小化、错误脱敏、旧能力复用和测试覆盖。

## 四条路线完成情况

### `has_direction_resume_not_ready`

解决“有大概方向，但简历还没准备好”的问题。复用旧 inventory 能力，将旧报告降级为诊断依据和材料库，并提供 Day 1-3 简历准备任务、今日行动和记录入口。

### `target_job_fit`

解决“有目标岗位，想判断能不能投”的问题。复用旧 jd 能力，将 JD 报告升级为岗位判断依据和材料库，并提供投递前行动、记录入口和复盘/调整提示。

### `applying_no_feedback`

解决“已经投递但没反馈”的问题。只做轻量投递记录和复盘，不做完整 CRM、自动投递或爬虫。无反馈只被拆解为材料、岗位、节奏和市场反馈线索，不评价用户本人。

### `no_direction`

解决“还没方向，需要真实岗位验证”的问题。只做真实岗位样本验证，不做职业推荐、性格测评或长期职业规划。没有真实岗位样本时不输出方向结论，所有方向只称为“可探索方向”。

## 最终整合内容

- 四条路线共用 route panel shell、今日任务卡、Day 1-3 任务卡、记录表单和已记录内容列表。
- 保留每条路线自己的业务语境、记录字段文案和依据库提示。
- 新增四路线总回归测试，覆盖 21 天计划结构、Day 1-3 安全字段和 records session 承载。
- README 更新到 V0.7 状态。
- `resume-ai-beta-work-upload.zip` 已加入 `.gitignore`，避免误提交。

## 测试与 Build

最终整合分支完成标准与本次验证结果：

```bash
npm test
# 12 个测试文件通过，176 个测试通过

npm run build
# TypeScript 与 Vite 生产构建通过
```

## V0.7 明确不做事项

- 不新增第五条路线。
- 不做支付、账号、后台、数据库。
- 不做完整投递 CRM、自动投递、招聘平台爬虫或复杂统计后台。
- 不做职业推荐、性格测评、长期职业规划。
- 不承诺 offer、面试或薪资结果。
- 不评价用户本人，不使用“你最适合”“你不适合”等绝对判断。
- 不暴露 provider、模型、token、成本、API key、base URL 或原始错误。
