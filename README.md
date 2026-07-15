# Job Map MVP

这是一个求职诊断智能体产品，目前处于 V0.7 迭代阶段。V0.4 到 V0.8 的主线目标是搭建稳定、可迭代、可测试的求职诊断智能体工作流雏形。

V0.7 的产品主线是“21 天应届生求职行动陪跑 MVP”：用户先选择当前求职状态，再进入对应路线，完成诊断、今日行动、记录、复盘和下一步调整。旧 inventory / jd 诊断报告继续保留，但定位为路线里的诊断依据和材料库，不再是终点。

## V0.7 四条路线

- 还没方向：通过真实岗位样本验证“可探索方向”，不做职业推荐。
- 有方向但简历还没准备好：复用 inventory 能力，把真实经历整理成可投递简历材料。
- 已投递但没反馈：只做轻量投递记录和复盘，不做完整 CRM。
- 有目标岗位想判断能不能投：复用 jd 能力，判断当前材料能否证明岗位要求，并给出今日投递前行动。

## 开发约束

后续 V0.4-V0.8 的开发必须先阅读并遵守：

- [docs/v0.4-v0.8-rules.md](docs/v0.4-v0.8-rules.md)
- [docs/v0.7/route-reviewer-checklist.md](docs/v0.7/route-reviewer-checklist.md)
- [docs/v0.7/version-record.md](docs/v0.7/version-record.md)

每次新开 Codex 对话或开始新迭代时，可以先说：

```text
先阅读 docs/v0.4-v0.8-rules.md，再继续开发。
```

## 本地启动

```bash
npm install
npm run dev
```

## 常用命令

```bash
npm run build
npm test
```

## V0.7 暂不做

- 不做支付、账号、后台、数据库。
- 不做完整投递 CRM、自动投递、招聘平台爬虫或复杂统计后台。
- 不做职业推荐、性格测评、长期职业规划。
- 不承诺 offer、面试或薪资结果。
- 不向用户暴露 provider、模型、token、成本、API key、base URL 或原始错误。

## 迁移原则

项目需要保持跨平台可迁移，方便未来从 Windows 切换到 MacBook 后继续开发：

- 不写死 `C:\xxx` 这类 Windows 本地路径
- 环境变量放在 `.env`，并维护 `.env.example`
- 保留 `package-lock.json`
- 使用 Git 记录版本
- 关键版本推送 GitHub
