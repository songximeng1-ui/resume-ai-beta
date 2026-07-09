# V0.5 版本记录

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
