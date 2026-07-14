# V0.7 公共底座记录

## 本分支定位

本分支只建立 V0.7 21 天应届生求职陪跑的公共底座，不实现四条路线的完整业务闭环。

完成范围：

- 首页从旧 `stage/mode` 二段选择升级为四个求职状态入口。
- 新增统一的 V0.7 route、step、plan、daily task、feedback 类型。
- 新增旧 session 到 V0.7 session 的迁移与损坏数据安全降级。
- 保留旧 JD / 无 JD 诊断能力，作为后续路线内部复用模块。
- 建立首页、迁移、路线基础计划的测试保护网。

## 公共入口

V0.7 首页只展示用户语言的四个入口：

- 我不知道该投什么岗位。
- 我大概知道方向，但简历不知道怎么写。
- 我投了很多，但没有面试。
- 我看到一个岗位，想知道能不能投、怎么改。

首页不再把“大三/准应届生”作为主入口，也不要求用户理解 `stage` 或 `mode`。

## 状态兼容

V0.7 本地 session 使用 `version: 'v0.7'`，核心字段是：

- `route`
- `step`
- `plan`
- `legacy`

旧状态不会被直接删除。旧 `mode: 'inventory'` 迁移到 `has_direction_resume_not_ready`；旧 `mode: 'jd'` 迁移到 `target_job_fit`。旧 `stage: 'junior'` 不继续作为主路径，安全降级到路线选择。

## 后续路线依赖

后续四条路线分支应只接入自己的 route 页面、任务、结果和测试，不应再重命名公共类型或重写首页入口：

- `v0.7-route-has-direction-resume`
- `v0.7-route-target-job-fit`
- `v0.7-route-applying-no-feedback`
- `v0.7-route-no-direction`

公共类型来源：`src/types.ts`。

公共迁移与计划函数来源：`src/v07Foundation.ts`。

## 明确不做

本公共底座不做账号、支付、后台、完整投递 CRM、自动投递、招聘平台爬虫、复杂职业测评、完整 21 天任务内容库，也不把可探索方向包装成推荐职业。
