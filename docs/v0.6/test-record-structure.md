# V0.6 小范围真实测试记录结构

## 定位

V0.6 真实测试记录用于 10 人以内小范围测试复盘，目标是判断真实报告链路是否稳定、是否生成深度报告、质量检查是否通过，以及 DeepSeek primary / Qwen fallback 的表现。

当前实现采用服务端进程内脱敏记录，不引入数据库、不做复杂后台、不向用户端展示 provider 细节。

## 单次报告记录

每次 `/api/ai/report` 成功返回报告页时，服务端内部记录一条：

- `id`：报告任务 id。
- `createdAt`：记录时间。
- `mode`：`inventory` 或 `jd`。
- `httpSuccess`：接口是否成功返回。
- `reachedReportPage`：用户是否能到达报告页。
- `isDeepReport`：是否为深度报告，对应 `isBasic=false`。
- `qualityPassed`：是否通过质量检查，对应 `quality.passed=true`。
- `qwenFallbackTriggered`：是否触发 backup provider。
- `qwenFallbackSucceeded`：backup provider 是否成功接手。
- `enteredBasicFallback`：是否进入基础版兜底。
- `failedModule`：失败模块，例如 `rewrites`、`assembledReport`。
- `failureType`：失败类型。
- `providerAttempts`：脱敏 provider 尝试记录。

## Provider 尝试记录

`providerAttempts` 只记录脱敏字段：

- `role`：`primary` 或 `backup`。
- `module`：报告模块任务名，例如 `report-directions`。
- `status`：`success` 或 `failed`。
- `failureType`：标准失败类型。

不得记录或暴露：

- provider 名称。
- 模型名。
- token。
- 成本。
- base URL。
- API Key。
- 原始错误全文。
- 简历原文或 JD 原文。

## 失败类型

V0.6 统一使用以下失败类型：

- `timeout`
- `network`
- `auth`
- `quota`
- `model`
- `schema`
- `parse`
- `quality_blocker`
- `unknown`

## 汇总指标

服务端内部可汇总：

- `totalRuns`：测试总次数。
- `technicalAvailabilityRate`：技术可用率。
- `deepReportRate`：深度报告率。
- `qualityPassRate`：质量通过率。
- `deepSeekDirectSuccessRate`：primary provider 模块级成功率。
- `qwenFallbackTriggerCount`：backup provider 触发次数。
- `qwenFallbackSuccessRate`：backup provider 成功率。
- `basicFallbackCount`：基础版兜底次数。
- `failureTypeCounts`：失败类型计数。

## V0.6 边界

当前记录结构只服务小范围真实测试复盘，不作为正式数据后台。

V0.6 暂不做：

- 多用户账号归属。
- 历史报告库。
- 复杂后台管理页面。
- 大规模数据库。
- 成本统计展示。
