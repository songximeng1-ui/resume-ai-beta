# V0.4 版本记录

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
