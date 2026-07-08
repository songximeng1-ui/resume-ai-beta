# V0.4 版本记录

## 2026-07-08：真实 AI 报告质量失败兜底

改动类型：智能体工作流、后端接口、测试、文档。

本次把 V0.4 质量检查接入真实 AI 报告最终返回边界：

- `/api/ai/report` 在返回前统一检查报告质量；如果真实模型输出结构合法但仍存在 quality blocker，会自动改为保守基础版报告。
- 基础版兜底仍会重新附加质量检查，避免把不合格深度报告直接展示给用户。
- 浏览器端 `reportTask` 不再返回内部 `modules` 原文，避免模型中间产物、失败模块或不合格内容泄漏到用户端。
- 测试覆盖真实模型输出包含造假/夸大建议时的兜底行为，以及正常成功路径不暴露 usage、model、modules 等内部诊断字段。

验证结果：

- `npm.cmd test -- server/index.test.ts`：通过，1 个测试文件、41 个测试通过。
- `npm.cmd test`：通过，10 个测试文件、120 个测试通过。
- `npm.cmd run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新；提示词文档无需更新。

## 2026-07-08：真实感样本产品级 QA

改动类型：智能体工作流、测试、文档。

本次新增 V0.4 产品级 QA 夹具，用于防止系统退回普通简历工具：

- 新增 `server/productQa.ts`，固定一份真实感本科应届生简历、用户运营 JD 和求职困惑样本。
- QA 检查完整覆盖 V0.4 主线：信息收集、已确认经历证据绑定、JD 模式报告、5 个面试追问、7 天行动计划、隐藏内部追问标签、避免造假和过度承诺。
- 新增 `server/productQa.test.ts`，让该产品级检查进入自动化测试。
- 收紧基础报告中的承诺性措辞，避免“保证/确保”这类词被用户理解为结果承诺。

验证结果：

- `npm.cmd test -- server/productQa.test.ts server/basicReport.test.ts server/reportQuality.test.ts`：通过，3 个测试文件、17 个测试通过。
- `npm.cmd test`：通过，10 个测试文件、119 个测试通过。
- `npm.cmd run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新；提示词文档无需更新。

## 2026-07-08：报告证据对齐质量警告

改动类型：智能体工作流、后端接口校验、测试、文档。

本次继续收口 V0.4 报告质量检查：

- `validateReportQuality` 新增证据对齐警告：当 JD 匹配矩阵或无 JD 方向建议中的 evidence 只写“材料能证明”“相关经历”等笼统表达，且没有指向具体经历、动作、工具、对象或数量时，会产生质量 warning 并扣分。
- 该检查不阻断报告生成，只作为 V0.4 智能体输出可复查性的质量提醒。
- 测试同步覆盖笼统 evidence 的 warning 行为，并将报告质量测试口径改为 V0.4。

验证结果：

- `npm.cmd test -- server/reportQuality.test.ts`：通过，1 个测试文件、14 个测试通过。
- `npm.cmd test`：通过，9 个测试文件、118 个测试通过。
- `npm.cmd run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新；提示词文档无需更新。

## 2026-07-08：经历资产卡状态与来源说明收口

改动类型：智能体工作流、数据结构、前端体验、后端接口校验、测试、文档。

本次完成 V0.4 经历资产卡到报告生成之间的证据边界收口：

- 经历资产卡状态统一迁移到 `待确认`、`确认使用`、`编辑后确认`、`暂未填写`、`暂不使用`，并兼容旧状态和旧本地数据。
- 经历卡新增来源说明展示，帮助用户知道该卡来自粘贴简历、基础信息或经历材料；用户编辑后的经历会重新进入待确认状态。
- 后端报告兜底逻辑只读取已确认或编辑后确认的经历，未确认、空白或暂不使用经历不会进入报告证据。
- AI Task Package 和基础报告构造器同步识别 V0.4 状态，避免后续追问、诊断、改写建议误用未确认材料。

验证结果：

- `npm.cmd test -- src/App.test.tsx server/index.test.ts server/basicReport.test.ts server/taskPackage.test.ts`：通过，4 个测试文件、69 个测试通过。
- `npm.cmd test`：通过，9 个测试文件、117 个测试通过。
- `npm.cmd run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新；提示词文档无需更新。

## 2026-07-08：前端版本口径统一为 V0.4

改动类型：前端体验、测试、文档。

本次完成 V0.4 用户可见版本口径整理：

- 内测入口、顶部标识、JD 报告生成按钮和通用报告页标识统一展示 V0.4。
- 前端测试同步校验 V0.4 文案，避免后续回退到 V0.3 或 V2 旧口径。
- 本地存储 key 暂时保留旧名称，避免影响用户已有内测授权和未完成会话。

验证结果：

- `npm.cmd test -- src/App.test.tsx`：通过，1 个测试文件、23 个测试通过。
- `npm.cmd run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新；提示词文档无需更新。

## 2026-07-08：V0.4 worktree 成果合并回 main

改动类型：Git 工作流、测试、文档。

本次完成 V0.4 接力整理：

- 将 `codex/v0-4-task-package` 分支已提交成果 fast-forward 合并回主目录 `main`，后续可继续以主目录作为可信开发入口。
- 保留 `.worktrees/codex-v0-4-task-package` 中未跟踪的 `.superpowers/sdd` 接力材料，未删除或回滚已有工作。
- `vite.config.mjs` 排除 `.worktrees` 测试扫描，避免主目录测试被临时 worktree 干扰。
- `server/modelProvider.test.ts` 在测试前清理代理环境变量，避免本机 `OPENAI_PROXY_URL`、`HTTP_PROXY` 或 `HTTPS_PROXY` 影响单元测试。

验证结果：

- `npm.cmd test`：通过，9 个测试文件、116 个测试通过。
- `npm.cmd run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-08：Provider Adapter 与 Kimi 摘录链路

改动类型：智能体工作流、后端接口、数据结构、提示词、测试、文档。

本次完成 V0.4 真实模型接入前后的工程边界：

- 新增 role-based provider adapter，DeepSeek/Qwen/Kimi 可通过独立环境变量配置。
- primary/backup 继续保持同一份完整任务输入，不续写半成品。
- Kimi 仅在长文本触发条件下做结构化摘录，并进入 AI Task Package 作为证据整理。
- Kimi 失败不阻断报告生成。
- 用户端继续隐藏 provider、模型名、token、成本、schema 和原始错误细节。

验证结果：

- `npm test`：通过，9 个测试文件、116 个测试通过。
- `npm run build`：通过。

本次新增 provider 环境变量，已更新 `.env.example`；README 启动方式未变化，暂不需要更新。

## 2026-07-07：多模型角色编排抽象层

改动类型：智能体工作流、后端接口、数据结构、测试、文档。

本次完成 V0.4 多模型编排的第一层工程抽象：

- 新增 primary/backup/extractor/rule 四类模型角色，对应 DeepSeek、Qwen、Kimi、规则模板的产品职责。
- 报告模块 fallback 以 primary -> backup -> rule 的方式表达，backup 使用同一份完整任务输入从头生成当前模块。
- 新增 Kimi 长文本摘录触发判断，默认不调用。
- 新增 Kimi 摘录 schema guardrail，只允许来源片段、待核实信息和结构化字段，不允许判断、推荐或改写字段。
- 本次仍未接入真实 DeepSeek/Qwen/Kimi API，不新增环境变量。

验证结果：

- `npm test`：通过，8 个测试文件、102 个测试通过。
- `npm run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-07：无 JD 探索方向优先级迁移

改动类型：数据结构、后端接口校验、提示词、前端体验、测试、文档。

本次把无 JD 模式“可探索岗位方向”的优先级从旧投递判断口径迁移为探索口径：

- directionOptions 的 `level/priority` 统一为：优先探索、可以尝试、过渡方向、先补证据。
- 后端 schema、JSON schema、提示词、demo 结果、基础版报告和质量审查同步使用新枚举。
- 前端无 JD 页面新增断言，不展示“主投/可冲/暂不建议主投”等投递判断词。
- 保留 JD 投递判断的旧字段兼容映射，不影响有 JD 模块旧数据进入报告链路。

验证结果：

- `npm test -- server/index.test.ts server/reportQuality.test.ts src/App.test.tsx`：通过，3 个测试文件、66 个测试通过。
- `npm test`：通过，7 个测试文件、81 个测试通过。
- `npm run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-07：JD 匹配四档判断字段迁移

改动类型：数据结构、后端接口校验、提示词、前端体验、测试、文档。

本次把有 JD 模式的岗位匹配判断从旧的“主投/可冲/过渡/暂不建议主投”迁移到 V0.4 PRD 确认的四档口径：

- 投递判断统一为：建议优先投递、可以投递，建议先优化简历、可以作为尝试方向、建议先补强后再重点投递。
- 每条 JD 证据矩阵新增匹配程度：匹配较强、有一定匹配、需要补充证据、当前证据不足。
- 前端 JD 证据匹配页和岗位要求匹配分析报告不再展示“可冲/主投/如果坚持投”等旧文案。
- 后端 JSON schema、提示词、demo 结果、基础版报告和质量审查同步使用新字段。
- 校验器保留旧字段兼容映射，避免旧缓存或旧模块结果进入报告链路时直接失败。

验证结果：

- `npm test -- src/App.test.tsx server/index.test.ts`：通过，2 个测试文件、53 个测试通过。
- `npm test -- server/reportQuality.test.ts server/basicReport.test.ts`：通过，2 个测试文件、15 个测试通过。
- `npm test`：通过，7 个测试文件、81 个测试通过。
- `npm run build`：通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-07：V0.4 当前批次最终验证

改动类型：测试、文档。

本次完成当前 V0.4 核心批次的最终验证：

- 全量自动化测试通过。
- 生产构建通过。
- 本地开发服务烟测通过：客户端 `http://127.0.0.1:5173` 可访问，API `http://127.0.0.1:8787/api/ai/status` 可返回状态。
- 烟测结束后已关闭本次启动的本地服务进程。

验证结果：

- `npm test`：通过，7 个测试文件、81 个测试通过。
- `npm run build`：通过。
- `npm run dev` 轻量烟测：客户端和 API 均 ready。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-07：移动端可读性与防横向溢出

改动类型：前端体验、测试、文档。

本次完成 V0.4 手机端可读性收紧：

- JD 报告核心内容继续保持卡片/网格结构，不使用原生横向表格。
- 结果页关键容器补充 `min-width: 0`，降低长文本撑开布局的风险。
- `pre`、`textarea`、结果页正文段落补充 `overflow-wrap: anywhere` 和换行策略。
- 720px 以下按钮组纵向排列，结果区块隐藏横向溢出。
- 前端测试新增 DOM 与 CSS 断言，防止后续回退到横向表格或缺少移动端防溢出样式。

验证结果：

- `npm test -- src/App.test.tsx`：通过，1 个测试文件、23 个测试通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-07：用户端隐藏模型与用量明细

改动类型：前端体验、服务契约、测试、文档。

本次完成 V0.4 用户端隐私与产品口径收紧：

- 输入页 AI 状态不再展示具体模型名，只显示“已连接真实 AI。”。
- 结果页不再展示 AI 用量、tokens、估算成本、模型名或未返回用量提示。
- 前端测试新增断言：用户端页面不出现 token、成本、具体模型名、DeepSeek/Qwen/Kimi 或 schema 明细。

验证结果：

- `npm test -- src/App.test.tsx`：通过，1 个测试文件、22 个测试通过。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-07：基础版报告兜底

改动类型：智能体工作流、后端接口、数据结构、前端体验、提示词、测试、文档。

本次完成 V0.4 “模型可以失败，但用户一定能拿到结果”的基础版兜底：

- 新增 `server/basicReport.ts`，用稳定规则生成保守可信的基础版报告。
- 基础版只使用已确认经历卡或用户明确填写的材料，不使用待确认/暂不使用经历。
- 无 JD 基础版包含可探索岗位方向、至少 3 条简历改写建议、7/14/30 天行动计划。
- 有 JD 基础版包含岗位证据概览、5 个占位式面试准备问题、简历改写建议和行动计划。
- `/api/ai/report` 在真实模型或 schema 修复失败时，返回 `isBasic: true` 的基础版报告，不回退到 demo。
- 如果部分深度模块已完成，基础版会保留已完成的深度分析内容，再用规则模板补齐缺失模块。
- 结果页在 `report.isBasic` 时展示固定说明，告诉用户内容偏保守但不编造经历。
- strict JSON schema 和提示词同步 `isBasic` 字段；深度报告要求 `isBasic: false`。

验证结果：

- `npm test -- server/basicReport.test.ts`：通过，1 个测试文件、2 个测试通过。
- `npm test -- server/basicReport.test.ts server/index.test.ts src/App.test.tsx`：通过，3 个测试文件、54 个测试通过。
- `npm test -- server/index.test.ts`：通过，1 个测试文件、30 个测试通过，覆盖部分深度模块失败时的混合基础版报告。

本次没有新增环境变量或启动方式，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-07：报告模块标题与面试准备口径迁移

改动类型：前端体验、提示词、测试、文档。

本次完成 V0.4 报告展示口径收紧：

- 有 JD 报告主标题改为“岗位要求匹配分析”。
- 无 JD 报告方向模块改为“可探索岗位方向”。
- 简历模块统一为“简历改写建议”，行动模块统一为“下一步行动计划”。
- JD 面试模块改为“面试追问与回答准备”，页面不再展示“回答示例”或“复制回答示例”。
- 提示词同步要求面试内容输出占位式表达和注意边界，不输出可直接照抄的虚构完整答案。

验证结果：

- `npm test -- src/App.test.tsx server/index.test.ts`：通过，2 个测试文件、51 个测试通过。

本次没有新增环境变量，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-06：JD-first 流程与经历卡确认 Gate

改动类型：前端体验、智能体工作流、测试、文档。

本次完成 V0.4 输入到动态追问前的关键流程约束：

- 有 JD 模式在简历输入页前置目标岗位 JD 输入框；未填写 JD 时不能生成经历资产卡。
- JD 文本会带入后续 JD 证据匹配页，用户仍可在匹配页清空或修改。
- 进入动态追问前会检查需要追问的非空经历卡；未确认或未暂不使用时会提示并定位到对应卡片。
- 资产页补齐可访问错误提示，避免用户被拦截但看不到原因。
- 测试路径同步调整为真实用户流程：先补 JD、生成经历卡、处理经历卡，再进入动态追问。

验证结果：

- `npm test -- src/App.test.tsx`：通过，1 个测试文件、21 个测试通过。
- `npm test`：通过，6 个测试文件、77 个测试通过。
- `npm run build`：通过。

本次没有新增环境变量，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-06：改写建议与行动计划契约收紧

改动类型：数据结构、后端接口校验、提示词、测试、前端构建配置。

本次完成两个 V0.4 环节：

- 简历改写建议：后端 schema、共享类型、规则/demo 输出和质量清洗都要求 V0.4 字段，包括 relatedExperience、originalIssue、capability、directVersion、versionAfterSupplement、usageReminder；报告至少 3 条改写建议。
- 下一步行动计划：后端 schema、共享类型、规则/demo 输出和质量检查都要求固定 7 天内、14 天内、30 天内，每个阶段至少 2 条；每条行动包含 what、why、how、completionStandard、jobSearchValue。

同步调整：

- `server/prompts.ts` 从 V0.3 旧要求更新为 V0.4 输出结构。
- `vite.config.mjs` 显式设置项目 root，修复 Windows 中文路径下 `npm run build` 的 Vite HTML 输出路径问题。

验证结果：

- `npm test`：14 个测试文件、160 个测试通过。
- `npm run build`：通过。

本次没有新增环境变量，因此不需要更新 `.env.example`。

## 2026-07-06：无 JD 方向探索契约收紧

改动类型：数据结构、后端接口校验、提示词、测试。

本次完成 V0.4 “可探索岗位方向”模块收紧：

- `directionOptions` 继续兼容旧展示字段 name、level、why、next、keywords，同时新增并强制校验 directionName、searchableJobNames、whyExplore、priority、sevenDayValidation。
- 每个方向必须包含 3-5 个现实可搜索岗位名，必须说明探索原因、已确认经历证据、当前缺口和 7 天验证动作。
- 规则模板兜底报告同步输出新字段，避免基础版报告落回旧格式。
- 质量检查同步升级：无 JD 报告方向数量仍为 2-3 个，并要求每个方向具备可搜索岗位、经历证据和 7 天验证动作。
- 提示词明确无 JD 方向不是替用户决定职业方向，而是给出可用真实 JD 验证的岗位探索入口；禁止证据错位、抽象岗位和绝对化判断。

验证结果：

- `npm test`：14 个测试文件、161 个测试通过。
- `npm run build`：通过。

本次没有新增环境变量，因此不需要更新 `.env.example`；README 暂无必要更新。

## 2026-07-06：AI Task Package 构造器地基

改动类型：智能体工作流、数据结构、测试、文档。

本次完成 V0.4 智能体工作流的任务包构造器第一步：

- 新增 `server/taskPackage.ts`，用于从请求输入中构造 V0.4 AI Task Package。
- 任务包统一包含 meta、userProfile、confirmedAssets、excludedAssets、jd、currentTask、forbiddenInputs 等核心区块。
- JD 模式下可把 `jdSummary.requirements` 转成稳定的 `req_1`、`req_2` 结构化岗位要求，供后续动态追问和报告模块绑定。
- 生成模块只使用确认使用、编辑后确认或已确认的经历；未确认和暂不使用经历会进入 forbiddenInputs，避免被后续模型误用。
- 安全规则明确写入任务包：不伪造经历、不编造数据、不夸大职责、不承诺 offer。

验证结果：

- `npm test -- server/taskPackage.test.ts`：通过，1 个测试文件、2 个测试通过。

本次没有新增环境变量，因此不需要更新 `.env.example`；README 暂无必要更新。下一步应把该任务包接入动态追问或分模块报告调用。

## 2026-07-06：动态追问 V0.4 合同迁移

改动类型：智能体工作流、数据结构、后端接口校验、提示词、前端体验、测试。

本次完成 V0.4 动态追问契约迁移：

- `DigQuestionSet` 从 V0.3 的 questions、digIntent、potentialHighlight、answerHint、resumePreview 迁移为 userVisibleQuestions、internalMetadata、encouragement。
- 后端 schema 要求内部元数据包含 questionId、relatedAssetId、relatedJdRequirementId、method、factDimensions、internalWhy。
- userVisibleQuestions 会拒绝 TAR、PART、PREP、HR 视角、为什么问、事实回忆维度等内部标签。
- 后端 demo 与前端 demo 均输出自然问题，内部保留 HR/TAR/PART 等方法 metadata。
- 动态追问页面不再展示“可能挖出的亮点”、回答提示和待核实简历草稿，避免诱导用户照着答案编造。
- 提示词明确：JD 模式结合 JD 要求、确认经历和已有回答；无 JD 模式也使用内部追问逻辑，但不向用户展示。

验证结果：

- `npm test -- server/index.test.ts src/services/aiService.test.ts`：通过，2 个测试文件、34 个测试通过。
- `npm run build`：通过。

本次没有新增环境变量，因此不需要更新 `.env.example`；README 暂无必要更新。
