# V0.5 版本记录

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
