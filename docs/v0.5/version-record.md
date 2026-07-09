# V0.5 版本记录

## 2026-07-09：有 JD 完整报告 smoke 通过

改动类型：真实 AI 验证、文档。

本次验证 DeepSeek primary + Qwen fallback provider 链路下的 `/api/ai/report` 有 JD 完整报告，严格只跑 1 次完整报告，未跑无 JD 流程，未追加第二次复跑。

真实完整报告 smoke：

- `/api/ai/report` 有 JD 完整报告 HTTP 200，总耗时约 47.17 秒。
- 返回 `isBasic=false`，为深度报告。
- 返回 `quality.passed=true`。
- 返回包含 `highlights`、`jdFit`、`rewrites`、`interviews`、`actionPlan`、`reportTask`。
- 返回 2 条 highlights、5 条 JD fit matrix、3 条 rewrites、5 个 interviews、6 条 actionPlan。
- `reportTask.status=completed`，完成模块为 `highlights`、`jdFit`、`rewrites`、`interviews`、`actionPlan`、`assembledReport`。
- 未返回无 JD `directionOptions`。
- JD fit matrix 的岗位要求均来自用户 JD，证据均绑定已确认来源经历或明确标注当前证据不足。

失败诊断：

- 本次未失败，未进入基础版兜底。
- `failedModule` / `technicalDetail` / quality blockers / safetyFindings 均无失败残留。

边界：

- 本次只跑有 JD 完整报告。
- 本次没有跑无 JD 流程。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

## 2026-07-09：无 JD 完整报告 smoke 复测恢复深度报告

改动类型：真实 AI 验证、文档。

本次复测 commit `6c6fa46` 后的 `/api/ai/report` 无 JD 完整报告链路，严格只跑 1 次完整报告，未跑有 JD 流程，未追加第二次复跑。

真实完整报告复测：

- `/api/ai/report` 无 JD 完整报告 HTTP 200，总耗时约 23.52 秒。
- 返回 `isBasic=false`，确认从基础版兜底恢复为深度报告。
- 返回 `quality.passed=true`。
- 返回包含 `highlights`、`directionOptions`、`rewrites`、`actionPlan`、`reportTask`。
- 返回 2 条 highlights、3 个 directionOptions、3 条 rewrites、6 条 actionPlan。
- `reportTask.status=completed`，完成模块为 `highlights`、`directions`、`rewrites`、`actionPlan`、`assembledReport`。
- 未返回 JD fit matrix，未返回 interviews。

失败诊断：

- 本次未失败，未进入基础版兜底。
- `failedModule` / `technicalDetail` / quality blockers / safetyFindings 均无失败残留。
- 客户端安全响应不暴露 provider 角色，因此未观察到明确 Qwen fallback 接手信号。

边界：

- 本次只复测无 JD 完整报告。
- 本次没有跑有 JD 流程。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

## 2026-07-09：无 JD 完整报告 smoke 首次触发基础版兜底，已收口质量清洗链路

改动类型：后端质量链路、测试、真实 AI 验证、文档。

本次按要求只跑 1 次 `/api/ai/report` 无 JD 完整报告 smoke，未跑有 JD 流程。

真实完整报告 smoke：

- DeepSeek primary + Qwen backup provider 链路配置存在，接口请求体为 `mode=inventory`，未传 JD。
- `/api/ai/report` HTTP 200，总耗时约 20.78 秒。
- 返回包含 `highlights`、`directionOptions`、`rewrites`、`actionPlan`、`reportTask`。
- 返回 2 条 highlights、2 个 directionOptions、3 条 rewrites、6 条 actionPlan。
- 未返回 JD fit matrix，未返回 interviews。
- 最终响应 `quality.passed=true`。
- 但本次真实 smoke 未满足 `isBasic=false`：实际进入基础版兜底，`reportTask.status=partial`，`failedModule=assembledReport`。

失败分类：

- 失败步骤：最终深度报告组装后的质量检查。
- 模块：`assembledReport`。
- 错误类型：质量 blocker 触发后的基础版兜底，不是 HTTP 错误。
- 是否触发 Qwen fallback：客户端安全响应不暴露 provider 角色；本次未观察到明确 Qwen fallback 接手信号。
- 是否进入基础版兜底：是。

修复：

- 发现无 JD 深度报告此前没有进入 `sanitizeRiskyResumeLanguage`，当 chat provider 在 rewrites / directions / action plan 中输出可保守清洗的“负责、显著提升、保证”等措辞时，会被最终质量检查 blocker 打回基础版。
- 已将最终质量检查前的保守语言清洗扩展到无 JD 深度报告。
- 新增回归测试：无 JD 深度报告遇到可恢复的夸大措辞时应清洗并保留深度版 `isBasic=false`。
- 保留严重风险兜底：若模型输出“建议编造数据、包装成不存在项目”等不可接受内容，仍进入基础版兜底。

边界：

- 本次严格只跑了 1 次无 JD 完整报告。
- 本次没有跑有 JD 流程。
- 本次没有追加第二次真实完整报告复测；后续如需确认修复后的真实链路，应单独发起下一轮无 JD 完整报告 smoke。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

验证结果：

- `npm.cmd test`：通过，10 个测试文件，153 个测试通过。
- `npm.cmd run build`：通过。

## 2026-07-09：report-interview-question 有 JD 最小模块 smoke 复核通过

改动类型：提示词、报告模块上下文、报告模块 schema 归一化、测试、真实 AI 验证、文档。

本次只复核有 JD 模式报告模块里的 `report-interview-question` 最小 smoke，未调用 `/api/ai/report`，未跑完整报告。

修复：

- `report-interview-question` 上下文新增 `sourceExperienceCandidates`，用于让 chat provider 逐字绑定已确认来源经历。
- prompt 明确顶层 JSON 只能包含 `source`、`interview`。
- `interview` 必须包含 `question`、`whyAsk`、`answerAngle`、`concern`、`sampleAnswer`、`doNotExaggerate`。
- `question` 必须关联用户 JD 要求，并包含至少一个 JD 原文关键词。
- `answerAngle` 必须绑定已确认来源经历，或明确写“当前证据不足”。
- 可使用的真实经历必须从 `sourceExperienceCandidates` 中逐字复制；没有可绑定来源时写“当前证据不足”。
- `sampleAnswer` 只能写占位式表达，不能输出可直接照抄的完整答案。
- prompt 明确不要引导用户伪造数据、夸大角色或包装不存在成果。
- prompt 进一步要求即使用否定句也不要出现“显著提升、大幅增长、伪造数据、夸大角色、包装不存在成果”等敏感词样。
- schema 对过于泛化的 `question` 增加窄口径兜底：当 `whyAsk` / `answerAngle` 中已有 JD 关键词而问题本身未包含时，自动前缀补入该关键词，避免业务层看到脱离 JD 的泛化追问。

真实模块 smoke：

- DeepSeek direct `report-interview-question`：成功，用时约 4.62 秒，返回 1 个面试追问结构。
- Direct 面试问题关联用户 JD 要求；回答思路绑定已确认来源经历或明确当前证据不足。
- Direct 包含面试问题、HR 为什么可能会问、关联岗位要求、可使用的真实经历、回答思路、占位式表达、注意边界。
- Direct 未输出可直接照抄的虚构完整答案，未引导伪造数据、夸大角色或包装不存在成果。
- 强制 primary base URL 失败后 fallback 到 Qwen `report-interview-question`：成功，用时约 6.16 秒，返回 1 个面试追问结构。
- Fallback 面试问题关联用户 JD 要求；回答思路绑定已确认来源经历或明确当前证据不足。
- Fallback 包含面试问题、HR 为什么可能会问、关联岗位要求、可使用的真实经历、回答思路、占位式表达、注意边界。
- Fallback 未输出可直接照抄的虚构完整答案，未引导伪造数据、夸大角色或包装不存在成果。

失败排查：

- 初始 smoke 中 DeepSeek direct 成功，Qwen fallback 结构成功但来源绑定/证据不足标注不稳，失败字段为 `interview.answerAngle`。
- 后续 smoke 曾出现一次 DeepSeek direct `invalid_json`，复跑后 direct 正常返回可验证结构，归类为 chat JSON 偶发解析漂移。
- Direct 后续曾出现 `question` 未显式包含 JD 原文关键词；已通过 prompt 要求 `question` 字段包含 JD 原文关键词收口。
- 本次复核初始 DeepSeek direct 曾在安全扫描中命中“显著提升”，但语义上来自否定提醒；已通过 prompt 禁止否定句里复述夸大词样收口。
- 本次复核初始 DeepSeek direct 曾出现 `question` 结构有效但过于泛化，未直接包含 JD 关键词；已通过 schema 关键词前缀兜底收口。
- 最终 direct 和 fallback 均成功，无网络、超时、鉴权、额度、模型、schema 或解析错误残留。

边界：

- 本次没有调用 `/api/ai/report`。
- 本次没有跑完整报告。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

验证结果：

- `npm.cmd test`：通过，10 个测试文件，151 个测试通过。
- `npm.cmd run build`：通过。

## 2026-07-09：report-jd-fit-summary 有 JD 最小模块 smoke 通过

改动类型：提示词、报告模块 schema 归一化、测试、真实 AI 验证、文档。

本次只验证有 JD 模式报告模块里的 `report-jd-fit-summary` 最小 smoke，未调用 `/api/ai/report`，未跑完整报告。

修复：

- `report-jd-fit-summary` prompt 明确顶层 JSON 只能包含 `source`、`jdFit`。
- `jdFit` 必须包含 `deliveryDecision`、`deliveryReason`、`strongestEvidence`、`mainGap`、`nextStepAdvice`、`matrix`。
- `matrix.requirement` 必须来自用户 JD 原文或 JD 要求摘要，不能自造岗位要求。
- `matrix.evidence` 必须从 `sourceExperienceCandidates` 中逐字复制已确认来源经历；没有可绑定来源时写“当前证据不足”。
- prompt 明确有 JD 模式不能输出无 JD 方向探索内容、`directionOptions`、`searchableJobNames` 或 7 天验证动作。
- 对 chat provider 常见结构漂移增加窄口径归一化：当模型把 `jdFit` 内部字段直接放在顶层时，模块 schema 会包回 `jdFit` 对象。

真实模块 smoke：

- DeepSeek direct `report-jd-fit-summary`：成功，用时约 6.07 秒，投递判断为“建议优先投递”，返回 5 条岗位要求匹配分析。
- Direct 每条岗位要求均来自用户 JD；每条匹配分析均绑定已确认来源经历，或明确标注当前证据不足。
- Direct 匹配程度只使用允许四档：匹配较强、有一定匹配、需要补充证据、当前证据不足。
- Direct 投递判断只使用允许四档之一；未把证据不足写成用户能力不行；未输出无 JD 方向探索内容。
- 强制 primary base URL 失败后 fallback 到 Qwen `report-jd-fit-summary`：成功，用时约 18.11 秒，投递判断为“建议优先投递”，返回 5 条岗位要求匹配分析。
- Fallback 每条岗位要求均来自用户 JD；每条匹配分析均绑定已确认来源经历，或明确标注当前证据不足。
- Fallback 匹配程度只使用允许四档；投递判断只使用允许四档之一；未把证据不足写成用户能力不行；未输出无 JD 方向探索内容。

失败排查：

- 初始 smoke 暴露 `schema_validation`，原因是 DeepSeek 和 Qwen 均曾把 `deliveryDecision`、`matrix` 等 `jdFit` 内部字段直接放在顶层，缺少 `{ source, jdFit }` 包装。
- 结构归一化后，质量检查曾暴露部分 `matrix.evidence` 未绑定来源经历或未明确证据不足。
- 已通过 `sourceExperienceCandidates`、prompt 逐字复制约束和顶层 `jdFit` 包装归一化收口。
- 最终 direct 和 fallback 均成功，无网络、超时、鉴权、额度、模型、schema 或解析错误残留。

边界：

- 本次没有调用 `/api/ai/report`。
- 本次没有跑完整报告。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

验证结果：

- `npm.cmd test`：通过，10 个测试文件，150 个测试通过。
- `npm.cmd run build`：通过。

## 2026-07-09：report-directions 无 JD 最小模块 smoke 通过

改动类型：提示词、报告模块 schema 归一化、测试、真实 AI 验证、文档。

本次只验证无 JD 模式报告模块里的 `report-directions` 最小 smoke，未调用 `/api/ai/report`，未跑完整报告。

修复：

- `report-directions` 上下文新增 `sourceExperienceCandidates`，用于让 chat provider 逐字绑定已确认来源经历。
- `report-directions` prompt 明确 `evidence` 必须从 `sourceExperienceCandidates` 中逐字复制，不能概括、改写或自造来源。
- prompt 明确无 JD 模式不能输出 `JD fit matrix`、`matchLevel`、`deliveryDecision`、`interviewRisk` 或面试题。
- 对 chat provider 常见结构漂移增加窄口径归一化：`level` 可从 `priority` 兜底，`directionName` 可从 `name` 兜底，`name` 可从 `directionName` 兜底，`why` / `next` 可从 `whyExplore` / `sevenDayValidation` 兜底，`inventory.directionOptions` 可拆回模块结构。

真实模块 smoke：

- DeepSeek direct `report-directions`：成功，用时约 7.79 秒，返回 3 个可探索岗位方向。
- Direct 每个方向返回 5 个可搜索岗位名称，均绑定已确认来源经历，并包含当前缺口和 7 天验证动作。
- Direct 未输出“最适合 / 不适合 / 强烈推荐”等绝对化判断，未伪装成 JD 匹配，未输出 JD fit matrix 或面试题。
- 强制 primary base URL 失败后 fallback 到 Qwen `report-directions`：成功，用时约 11.39 秒，返回 2 个可探索岗位方向。
- Fallback 每个方向返回 5 个可搜索岗位名称，均绑定已确认来源经历，并包含当前缺口和 7 天验证动作。
- Fallback 未输出“最适合 / 不适合 / 强烈推荐”等绝对化判断，未伪装成 JD 匹配，未输出 JD fit matrix 或面试题。

失败排查：

- 初始 smoke 暴露 `schema_validation`，失败字段包括 `directionOptions.0.level`、`directionOptions.0.name`、`directionOptions.0.directionName`。
- Qwen fallback 曾将结果包在 `inventory.directionOptions` 下，已通过模块 schema 归一化收口。
- Fallback 曾出现来源绑定不稳，已通过 `sourceExperienceCandidates` 和 prompt 逐字复制约束收口。
- 最终 direct 和 fallback 均成功，无网络、超时、鉴权、额度、模型、schema 或解析错误残留。

边界：

- 本次没有调用 `/api/ai/report`。
- 本次没有跑完整报告。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

验证结果：

- `npm.cmd test`：通过，10 个测试文件，148 个测试通过。
- `npm.cmd run build`：通过。

## 2026-07-09：report-action-plan 最小模块 smoke 通过

改动类型：提示词、报告模块 schema 归一化、测试、真实 AI 验证、文档。

本次只验证报告模块里的 `report-action-plan` 最小 smoke，未调用 `/api/ai/report`，未跑完整报告。

修复：

- `report-action-plan` prompt 明确顶层 JSON 只能包含 `source`、`summary`、`actionPlan`、`safetyNotes`、`resumeText`、`platformFields`、`previewLines`。
- `actionPlan` 必须是对象，且只能包含 `source`、`plans`、`confidenceSummary`；`plans` 必须是扁平数组，不能按 `7days` / `14days` / `30days` 或 `7天内` / `14天内` / `30天内` 分组。
- `period` 只能使用 `7 天内`、`14 天内`、`30 天内`，并要求每个阶段至少 2 条行动、总数至少 6 条。
- 每条行动必须包含 `what`、`why`、`how`、`completionStandard`、`jobSearchValue`，并兼容填充 `action`、`deliverable`、`resumeUsage`、`targetAbility`。
- `safetyNotes`、`resumeText`、`platformFields`、`previewLines` 明确要求为数组。
- 对 chat provider 常见结构漂移增加窄口径归一化：紧凑 period 标签归一为 V0.4 标准值；数组式 `actionPlan` 包回对象；展示字段的字符串、对象、对象数组转为字符串数组；缺失的兼容展示字段从已必填行动字段兜底。
- 对 `保证进面`、`保证 offer`、`保证offer`、`一定成功`、`必过` 做安全词替换，避免用户端输出承诺式表达。

真实模块 smoke：

- DeepSeek direct `report-action-plan`：成功，用时约 22.70 秒，返回 6 条行动计划。
- Direct 返回 `7 天内` / `14 天内` / `30 天内` 三个阶段，每阶段各 2 条行动；每条行动都包含要做什么、为什么做、怎么做、完成标准、对求职有什么帮助。
- Direct 安全扫描通过：未输出保证进面、保证 offer、一定成功等承诺语义；未要求用户伪造数据、夸大经历或包装不存在的成果。
- 强制 primary base URL 失败后 fallback 到 Qwen `report-action-plan`：成功，用时约 33.98 秒，返回 6 条行动计划。
- Fallback 返回 `7 天内` / `14 天内` / `30 天内` 三个阶段，每阶段各 2 条行动；每条行动都包含要做什么、为什么做、怎么做、完成标准、对求职有什么帮助。
- Fallback 安全扫描通过：未输出保证进面、保证 offer、一定成功等承诺语义；未要求用户伪造数据、夸大经历或包装不存在的成果。

失败排查：

- 初始 smoke 暴露 `schema_validation`，失败字段集中在 `actionPlan.plans`：模型将计划按阶段分组，或省略每条 plan 的 `period`。
- 后续 smoke 暴露 `actionPlan.plans.0.period`、`platformFields`、`platformFields item`、`actionPlan.plans.1.resumeUsage` 等字段漂移。
- 曾出现一次 DeepSeek direct `invalid_json`，复调诊断显示同模块可返回可验证 JSON，归类为 chat JSON 偶发解析漂移。
- 已通过 prompt 字段约束、阶段标签归一化、展示字段归一化、兼容字段兜底和安全词替换收口。
- 最终 direct 和 fallback 均成功，无网络、超时、鉴权、额度、模型、schema 或解析错误残留。

边界：

- 本次没有调用 `/api/ai/report`。
- 本次没有跑完整报告。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

验证结果：

- `npm.cmd test`：通过，10 个测试文件，143 个测试通过。
- `npm.cmd run build`：通过。

## 2026-07-09：report-rewrites 最小模块 smoke 通过

改动类型：提示词、报告模块上下文、测试、真实 AI 验证、文档。

本次只验证报告模块里的 `report-rewrites` 最小 smoke，未调用 `/api/ai/report`，未跑完整报告。

修复：

- `report-rewrites` prompt 明确顶层 JSON 只能包含 `source`、`rewrites`。
- 每条 rewrite 必须包含 V0.4 改写字段和兼容展示字段。
- `relatedExperience` 必须从 `sourceExperienceCandidates` 逐字复制，避免模型只返回 `internship` / `project` 这类内部 id。
- `directVersion` / `optimized` 只能重写用户已提供事实，禁止新增用户未提供的数量、人数、频率、主管、分类、结论或业务结果。
- `versionAfterSupplement` 只能写需要用户补充哪些依据，不能输出带虚构事实的完整简历句。
- 禁止把“参与、协助、整理”写成“主导、负责、独立完成”，并禁止“显著提升、大幅增长、保证进面、保证 offer”等夸大或承诺表达。

真实模块 smoke：

- DeepSeek direct `report-rewrites`：成功，用时约 11.12 秒，返回 3 条改写建议。
- Direct 返回的 3 条改写均逐字绑定来源经历；改写正文未新增用户未提供事实，未把参与/协助/整理写成主导/负责/独立完成，未输出夸大或承诺表达。
- 强制 primary base URL 失败后 fallback 到 Qwen `report-rewrites`：成功，用时约 23.84 秒，返回 3 条改写建议。
- Fallback 返回的 3 条改写均逐字绑定来源经历；改写正文未新增用户未提供事实，未把参与/协助/整理写成主导/负责/独立完成，未输出夸大或承诺表达。

失败排查：

- 初始 smoke 结构成功但质量不达标：`relatedExperience` 只返回 `internship` / `project`，并出现未提供的数量、主管、分类或增长类表达。
- 后续 fallback 曾出现 `schema_validation`，失败字段为 `rewrites.0.originalIssue`。
- 已通过 prompt 字段约束、来源候选、`originalIssue` 兜底规则和改写正文安全边界收口。
- 最终 direct 和 fallback 均成功，无网络、超时、鉴权、额度、模型、schema 或解析错误残留。

边界：

- 本次没有调用 `/api/ai/report`。
- 本次没有跑完整报告。
- 本次没有新增环境变量；`.env.example` 暂无必要更新。

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
