# Job Map MVP

这是一个求职诊断智能体产品，目前处于 V0.6 迭代阶段。V0.4 到 V0.8 的主线目标是搭建稳定、可迭代、可测试的求职诊断智能体工作流雏形。

## 开发约束

后续 V0.4-V0.8 的开发必须先阅读并遵守：

- [docs/v0.4-v0.8-rules.md](docs/v0.4-v0.8-rules.md)

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

## 迁移原则

项目需要保持跨平台可迁移，方便未来从 Windows 切换到 MacBook 后继续开发：

- 不写死 `C:\xxx` 这类 Windows 本地路径
- 环境变量放在 `.env`，并维护 `.env.example`
- 保留 `package-lock.json`
- 使用 Git 记录版本
- 关键版本推送 GitHub
