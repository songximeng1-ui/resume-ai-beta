# V0.5 版本记录

## 2026-07-09：report-highlights 最小模块 smoke 通过

改动类型：提示词、报告模块上下文、测试、真实 AI 验证、文档。

本次只验证报告模块里的 `report-highlights` 最小 smoke，未调用 `/api/ai/report`，未跑完整报告。

修复：

- `report-highlights` prompt 明确顶层 JSON 只能包含 `source`、`highlights`。
- 每个 highlight 必须包含 `sourceExperience`、`capability`、`jdRequirement`、`whyNotFlattery`、`professionalExpression`。
- `sourceExperience` 必须从 `sourceExperienceCandidates` 逐字复制，避免模型输出“2 段经历”“用户未详细描述”等泛化来源。
- `buildCompactReportContext` 仅对 `report-highlights` 增加 `sourceExperienceCandidates`，候选来自已确认资产的 `title` 和 `content`。

真实模块 smoke：

- DeepSeek direct `report-highlights`：成功，用时约 2.93 秒，返回 2 条 highlights。
- Direct 返回的 2 条 highlights 均绑定来源经历，`sourceExperience` 分别逐字引用教育机构新媒体运营实习和校园二手交易调研项目。
- 强制 primary base URL 失败后 fallback 到 Qwen `report-highlights`：成功，用时约 6.93 秒，返回 2 条 highlights。
- Fallback 返回的 2 条 highlights 均绑定来源经历，`sourceExperience` 同样逐字引用两段来源经历。

失败排查：

- 初始 smoke 曾出现 `schema_validation`，原因是模型返回的 highlight 缺少 `whyNotFlattery` 字段。
- 后续 smoke 曾出现来源绑定不稳和临时脚本中文乱码；已通过 prompt 字段约束、来源候选和 UTF-8 临时脚本复测收口。
- 最终 direct 和 fallback 均成功，无网络、超时、鉴权、额度、模型、schema 或解析错误残留。
- 收口验证时发现既有前端有 JD 完整流程测试稳定接近默认 5 秒 timeout；已仅为该长流程测试补充 10 秒 timeout，不改变产品逻辑。

边界：

- 本次没有调用 `/api/ai/report`。
- 本次没有跑完整报告。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。
- 收口复核时 `git status` 干净、`git diff` 为空，未发现 `.env` 内容、真实 API Key 或 `sk-` 形式密钥泄露。

验证结果：

- `npm.cmd test -- server/index.test.ts -t "report highlights prompt|report highlights context"`：通过，2 个目标测试通过。
- `npm.cmd test -- src/App.test.tsx -t "有 JD 模式输出证据矩阵和 V0.4 完整诊断报告"`：通过，1 个目标测试通过。
- `npm.cmd test`：通过。
- `npm.cmd run build`：通过。

## 2026-07-09：JD fit 小范围业务 smoke 通过

改动类型：真实 AI 验证、文档。

本次按 V0.5 下一步计划，只跑 `/api/ai/jd-fit` 小范围业务 smoke，未调用 `/api/ai/report`，未跑完整报告。

验证内容：

- DeepSeek direct `/api/ai/jd-fit`：成功，用时约 17.36 秒。
- Direct 路径可推断内部 `jd-summary` 步骤通过；接口响应返回最终 JD fit，不直接暴露 JD summary。
- Direct 路径返回 `source=real`，投递判断为“可以投递，建议先优化简历”，生成 5 条 JD fit matrix。
- 强制 primary base URL 失败后 fallback 到 Qwen `/api/ai/jd-fit`：成功，用时约 30.72 秒。
- Fallback 路径可推断内部 `jd-summary` 步骤通过；接口响应返回最终 JD fit，不直接暴露 JD summary。
- Fallback 路径返回 `source=real`，投递判断为“可以投递，建议先优化简历”，生成 5 条 JD fit matrix。
- 响应不直接暴露 JD summary；本次只记录其内部步骤可推断通过，以及最终 JD fit matrix 和投递判断。

失败分类结果：

- 本次最终 direct 和 fallback 均成功，无业务失败需要归类。
- fallback 验证过程中曾确认 primary 人为网络失败后已由 backup 接手；最终成功响应未向用户端暴露 provider、模型名、token、base URL 或密钥。

边界：

- 本次没有跑完整报告。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。
- 下一步可考虑继续跑 `jd-fit` 的更多样本，或进入完整报告前的更小粒度模块 smoke。

## 2026-07-09：业务接口 provider fallback 与结构化 prompt 修复

改动类型：后端接口、provider 编排、提示词、测试、文档。

本次按 V0.5 主线“小范围业务接口 smoke，不跑完整报告”继续验证并修复：

- role provider 模式下，默认小模型和报告模型调用从单独 primary 调整为 primary -> backup 编排。
- `/api/ai/structure-resume` 和 `/api/ai/dig-questions` 现在可在 primary 网络失败、schema 失败等可重试错误后 fallback 到 backup。
- 强化 `structure-resume` prompt，明确顶层 JSON 只能包含 `source`、`profile`、`fieldStatuses`、`assets`，并写清 `profile`、`fieldStatuses`、`assets` 的结构要求，降低 chat JSON 模式输出嵌套或缺字段的概率。
- OpenAI provider 的 Responses API strict schema 路径不变。
- 用户端仍不暴露 provider、模型名、token、base URL 或原始密钥。

真实业务 smoke：

- DeepSeek direct `/api/ai/structure-resume`：成功，用时约 5.58 秒，返回 `source=real`，生成 7 张资产卡。
- DeepSeek direct `/api/ai/dig-questions`：成功，用时约 3.97 秒，返回 `source=real`，生成 3 个动态追问和 3 条内部元数据。
- 强制 primary base URL 失败后 fallback 到 Qwen `/api/ai/structure-resume`：成功，用时约 20.97 秒，返回 `source=real`，生成 13 张资产卡。
- 强制 primary base URL 失败后 fallback 到 Qwen `/api/ai/dig-questions`：成功，用时约 10.30 秒，返回 `source=real`，生成 3 个动态追问和 3 条内部元数据。
- 本次只跑小范围业务接口 smoke，未跑完整报告，下一步再考虑 `jd-fit` smoke。

验证结果：

- `npm.cmd test -- server/index.test.ts -t "structure resume prompt|role provider structure-resume|role provider dig-questions"`：通过，3 个目标测试通过。
- `npm.cmd test`：通过，10 个测试文件、131 个测试通过。
- `npm.cmd run build`：通过。
- 提交前检查 4 个修改文件 diff：未包含 `.env` 内容、真实 API Key 或 `sk-` 形式密钥；测试中只使用 `primary-key`、`backup-key`、`test-key` 等假值。

本次没有新增环境变量；`.env.example` 暂无必要更新。README 启动方式未变化，暂不需要更新。

## 2026-07-09：DeepSeek / Qwen provider 最小真实链路打通

改动类型：后端接口、provider 适配、测试、文档。

本次从 V0.5 的主目标“多模型 provider 与失败可观测链路”开始推进，先解决 DeepSeek / Qwen 真实接口不适配的问题。

改动：

- OpenAI provider 保持使用 Responses API 和严格 JSON schema。
- DeepSeek / Qwen / Kimi 等非 OpenAI provider 改走 OpenAI-compatible `chat.completions`。
- Chat provider 使用 JSON object 输出约束，再由本地 schema 校验兜底。
- usage 统计兼容 `prompt_tokens` / `completion_tokens` / `total_tokens`。
- `.env.example` 补充 DeepSeek 和 Qwen 的推荐 base URL 与模型名。
- README 当前迭代阶段同步为 V0.5。

真实最小 smoke：

- DeepSeek direct：成功，`primary` 返回 `{ "source": "real", "value": "ok" }`，有 usage。
- Qwen direct：成功，`backup` 返回 `{ "source": "real", "value": "provider_ok" }`，有 usage。
- 强制 DeepSeek primary 网络失败后 fallback 到 Qwen：成功，`backup` 接手并返回结构化 JSON。

边界：

- 本次没有跑完整无 JD / 有 JD 报告生成。
- 本次没有启用 Kimi extractor 真实调用。
- 下一步应跑小范围业务接口 smoke：优先 `structure-resume` 或 `dig-questions`，再决定是否进入完整报告链路。
