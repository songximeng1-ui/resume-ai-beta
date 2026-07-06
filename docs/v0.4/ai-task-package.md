# 求职地图 V0.4 AI Task Package 设计草稿

## 1. 设计目标

AI Task Package 是 V0.4 多模型稳定交付的核心输入结构。

它要解决的问题：

- DeepSeek 和 Qwen 使用同一份完整上下文。
- Qwen 接手时不续写 DeepSeek 半成品。
- 每个模块输出有统一 schema。
- 除经历资产卡初步识别模块外，所有模型都只能使用用户确认过的真实经历。
- 规则模板也能读取同一份结构化输入生成基础版报告。

## 2. 总体原则

- 完整：当前模块所需信息必须一次性放入任务包。
- 保守：未确认信息只允许作为待核实，不允许作为结论。
- 可追溯：关键判断必须能追溯到经历卡或 JD 要求。
- 可校验：输出必须有 schema，可判定是否合格。
- 可降级：深度模型失败时，规则模板能基于同一数据生成基础版。

## 3. 通用任务包结构

```json
{
  "meta": {
    "version": "v0.4",
    "mode": "no_jd | with_jd",
    "user_stage": "pre_graduate | fresh_graduate",
    "module": "asset_cards | dynamic_questions | no_jd_direction | jd_match | resume_rewrite | interview_prep | action_plan | report",
    "language": "zh-CN"
  },
  "user_profile": {
    "education": "",
    "school": "",
    "major": "",
    "graduation_time": "",
    "city": "",
    "target_direction": ""
  },
  "confirmed_assets": [],
  "excluded_assets": [],
  "pending_or_unverified_info": [],
  "user_answers": [],
  "jd": {
    "raw_text": "",
    "structured_requirements": []
  },
  "kimi_extract": null,
  "current_task": {
    "goal": "",
    "instructions": [],
    "output_schema_name": "",
    "quality_rules": [],
    "safety_rules": []
  },
  "forbidden_inputs": {
    "unconfirmed_assets": [],
    "disallowed_claims": []
  }
}
```

## 4. 字段说明

### 4.1 meta

用于描述当前任务。

关键字段：

- version：固定为 v0.4。
- mode：无 JD 或有 JD。
- user_stage：准应届生或应届生。
- module：当前生成模块。
- language：默认 zh-CN。

### 4.2 user_profile

用户基础信息。

注意：

- 缺失字段可以为空。
- 不得基于学校、学历做歧视性判断。
- 不得输出绝对化人生评价。

### 4.3 confirmed_assets

只包含用户确认使用或编辑后确认的经历卡。

建议字段：

```json
{
  "id": "asset_001",
  "type": "education | internship | project | campus | part_time | honor | skill_work",
  "title": "",
  "time_range": "",
  "organization": "",
  "role": "",
  "description": "",
  "confirmed_status": "confirmed | edited_confirmed",
  "source_text": "",
  "verified_fields": [],
  "uncertain_fields": []
}
```

规则：

- 后续所有分析只能读取 confirmed_assets。
- uncertain_fields 可以用于追问，不能直接写成确定事实。

### 4.4 excluded_assets

用户选择暂不使用的经历。

规则：

- 不进入报告分析。
- 不用于简历改写。
- 不用于岗位匹配。
- 仅可用于产品内部状态展示，不传给生成模块也可以。

### 4.5 pending_or_unverified_info

待核实信息。

来源可能包括：

- AI 初步识别不确定字段。
- Kimi 摘录中的待核实信息。
- 用户回答里模糊的信息。

规则：

- 可用于追问。
- 不可用于结论。
- 不可写进可直接使用版简历表达。

### 4.6 user_answers

动态追问中用户已回答的内容。

建议字段：

```json
{
  "question_id": "q_001",
  "related_asset_id": "asset_001",
  "related_jd_requirement_id": "req_001",
  "question": "",
  "answer": "",
  "method": "hr | tar | part | prep | custom",
  "fact_dimensions": ["task", "action", "result", "reflection"]
}
```

### 4.7 jd

有 JD 模式下必填。

structured_requirements 建议字段：

```json
{
  "id": "req_001",
  "requirement": "",
  "type": "skill | experience | tool | responsibility | soft_skill | other",
  "priority": "high | medium | low",
  "source_text": ""
}
```

规则：

- JD 要求必须来自用户提供的 JD 或 Kimi 来源片段。
- 不得凭空新增岗位要求。

### 4.8 kimi_extract

Kimi 只在长文本触发条件满足时出现。

建议字段：

```json
{
  "source_type": "jd | user_material",
  "source_length": 0,
  "extracted_fields": [],
  "source_snippets": [],
  "needs_verification": []
}
```

规则：

- Kimi 输出只做摘录。
- 不包含判断、推荐、改写。

### 4.9 current_task

当前模块任务说明。

必须包含：

- goal：当前模块目标。
- instructions：生成要求。
- output_schema_name：输出 schema 名称。
- quality_rules：质量标准。
- safety_rules：安全红线。

### 4.10 forbidden_inputs

明确告诉模型哪些不能用。

包括：

- 未确认经历。
- 用户选择暂不使用的经历。
- 不确定但未核实的信息。
- 禁止补写的敏感事实。
- 禁止夸大的角色和成果。

## 5. 模块任务包要求

### 5.1 经历资产卡模块

输入：

- 简历文本。
- 基础信息。
- 经历材料。

输出：

- 初步经历资产卡。
- 待确认字段。
- 缺口 / 补强卡。
- 原始来源片段。

注意：

- 这是唯一可以读取原始未确认材料并生成待确认卡的模块。
- 输出不能直接进入报告，必须经过用户确认。

### 5.2 动态追问模块

输入：

- confirmed_assets。
- user_answers。
- JD 要求，有 JD 时必填。

有 JD 模式前置条件：

- 用户已补充目标岗位 JD。
- JD 已被拆成结构化岗位要求。
- 用户已经完成经历资产卡确认。
- 动态追问任务包必须同时包含 jd.structured_requirements 和 confirmed_assets。

输出：

- user_visible_questions：用户可见的 1-3 个自然问题。
- internal_metadata：每个问题的关联经历、有 JD 时的关联岗位要求、为什么问、事实回忆维度、使用的方法。

用户可见输出不得包含：

- HR/TAR/PART/PREP 方法名。
- 为什么问。
- 事实回忆维度。
- 内部推理链。

有 JD 模式生成规则：

- 先选择一条或多条 JD 岗位要求。
- 再从已确认经历中寻找可能相关的事实线索。
- 再用 HR 视角、TAR、PART、PREP 等方法生成追问。
- 追问目标是帮助用户回忆真实证据，而不是提供可照抄答案。

无 JD 模式生成规则：

- 从已确认经历、目标方向和用户已有补充回答出发。
- 使用 HR 视角、TAR、PART、PREP 等方法生成追问。
- 追问目标是帮助用户补齐任务、行动、结果、复盘、能力证据等真实信息。

禁止：

- 不给完整示例答案。
- 不在用户端展示 HR/TAR/PART/PREP 等方法标签。
- 不在用户端展示为什么问和事实回忆维度。
- 不展示可能挖出的亮点。
- 不暗示用户编造数据。

### 5.3 无 JD 可探索岗位方向模块

输入：

- confirmed_assets。
- user_answers。
- user_profile。

输出：

- 可探索方向。
- 可搜索岗位名称。
- 经历证据。
- 当前缺口。
- 探索优先级。
- 7 天验证动作。

禁止：

- 不输出无法搜索的抽象岗位。
- 不使用绝对化判断。
- 不把无证据方向写成推荐方向。

### 5.4 有 JD 岗位匹配模块

输入：

- confirmed_assets。
- user_answers。
- jd.structured_requirements。

输出：

- 每条岗位要求的匹配程度。
- 对应确认经历。
- 当前缺口。
- 投递判断。
- 简历表达建议。
- 面试风险。

禁止：

- 不允许证据错位。
- 不把证据不足写成能力不行。

### 5.5 简历改写模块

输入：

- confirmed_assets。
- user_answers。
- 有 JD 时加入 jd.structured_requirements。

输出：

- 对应经历。
- 原表达问题。
- 可体现能力。
- 可直接使用版。
- 补充信息后可用版。
- 使用提醒。

有 JD 时额外输出：

- 回应的岗位要求。
- 为什么这样改。

禁止：

- 不新增事实。
- 不使用增强版改写。
- 不把参与写成主导。

### 5.6 面试准备模块

仅有 JD 模式使用。

输入：

- confirmed_assets。
- user_answers。
- jd.structured_requirements。
- jd_match 输出。

输出：

- 5 个面试问题。
- HR 为什么可能会问。
- 关联岗位要求。
- 可使用的真实经历。
- 回答思路。
- 占位式表达。
- 注意边界。

禁止：

- 不输出虚构完整答案。
- 不让用户背诵不存在的经历。

### 5.7 行动计划模块

输入：

- confirmed_assets。
- user_answers。
- 当前模式下的诊断结果。

输出：

- 7 天内行动。
- 14 天内行动。
- 30 天内行动。

每条行动包含：

- 要做什么。
- 为什么做。
- 怎么做。
- 完成标准。
- 对求职有什么帮助。

## 6. 输出合格标准

模型输出必须满足：

- JSON 结构可解析。
- schema 字段完整。
- 不使用未确认经历。
- 不包含安全红线内容。
- 每个判断都有证据或标注证据不足。
- 中文表达清楚、温和、可执行。

不合格情况：

- JSON 解析失败。
- 缺少必填字段。
- 输出未确认经历。
- 出现编造或夸大。
- 输出绝对化职业判断。
- 面试模块输出虚构完整答案。

不合格后处理：

1. 同模型可进行一次结构修复。
2. 仍不合格则切换 Qwen。
3. Qwen 不合格则进入规则模板基础版。
