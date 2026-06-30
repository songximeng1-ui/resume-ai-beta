# V0.3 Web 私密内测部署说明

## 适用范围

本版本只用于 3-10 人小范围 Web 私密内测，不是正式上线版本。

当前保护方式是简单访问码：

- 不做正式账号登录。
- 不做支付。
- 不接数据库。
- 不保存服务端用户材料。
- 所有 AI 接口都需要访问码校验。

## 环境变量

本地 `.env` 或部署平台环境变量可以参考：

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL_SMALL=gpt-5.4-mini
OPENAI_MODEL_REPORT=gpt-5.4
AI_API_PORT=8787
PORT=
API_HOST=127.0.0.1
OPENAI_PROXY_URL=
BETA_ACCESS_CODE=your_beta_access_code_here
FRONTEND_ORIGIN=http://127.0.0.1:5173
VITE_API_BASE_URL=
```

注意：

- 不要提交真实 `.env`。
- `BETA_ACCESS_CODE` 请使用只发给内测用户的短期访问码。
- 如果需要停止内测，可以更换或删除线上环境里的访问码。
- `FRONTEND_ORIGIN` 是后端允许跨域访问的前端域名。部署到 Vercel 后应改成 Vercel 站点域名，例如 `https://your-app.vercel.app`。
- `VITE_API_BASE_URL` 是前端请求后端的基础地址。部署到 Vercel 后应配置为 Render 后端地址，例如 `https://your-render-api.onrender.com`。
- 本地开发可以不配置 `VITE_API_BASE_URL`，前端会继续通过 Vite 代理请求相对路径 `/api`。
- Render 会自动注入 `PORT`。线上如需外部访问，`API_HOST` 应配置为 `0.0.0.0`；本地保留 `127.0.0.1`。

## 本地验证

```bash
npm install
npm test
npm run build
npm run dev
```

本地打开 Vite 页面后，先输入内测访问码，再进入诊断流程。

## 部署建议

推荐部署形态：

- 前端：Vercel，构建 Vite 前端。
- 后端：Render，运行 Express AI API 服务。
- 环境变量：在部署平台后台配置，不写入仓库。

## Render 后端部署步骤

1. 登录 Render，新建 `Web Service`。
2. 连接 GitHub 仓库。
3. Runtime 选择 `Node`。
4. Root Directory 保持项目根目录。
5. Build Command：

```bash
npm install
```

6. Start Command：

```bash
npm run start:server
```

7. 在 Render 环境变量中配置：

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL_SMALL=gpt-5.4-mini
OPENAI_MODEL_REPORT=gpt-5.4
OPENAI_PROXY_URL=
BETA_ACCESS_CODE=your_private_beta_code
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
API_HOST=0.0.0.0
```

8. 部署完成后记录 Render 服务地址，例如：

```text
https://your-render-api.onrender.com
```

9. 用接口检查后端是否存活。无码访问应返回 401，说明访问码保护生效：

```bash
curl https://your-render-api.onrender.com/api/ai/status
```

10. 带访问码访问应返回 AI 状态：

```bash
curl -H "X-Beta-Access-Code: your_private_beta_code" https://your-render-api.onrender.com/api/ai/status
```

## Vercel 前端部署步骤

1. 登录 Vercel，新建项目并连接同一个 GitHub 仓库。
2. Framework Preset 选择 `Vite`。
3. Root Directory 保持项目根目录。
4. Build Command：

```bash
npm run build
```

5. Output Directory：

```text
dist
```

6. 在 Vercel 环境变量中配置：

```env
VITE_API_BASE_URL=https://your-render-api.onrender.com
```

7. 部署完成后，得到前端地址，例如：

```text
https://your-vercel-app.vercel.app
```

8. 回到 Render，把 `FRONTEND_ORIGIN` 更新为真实 Vercel 地址。
9. 重新部署 Render 后端，使 CORS 白名单生效。
10. 打开 Vercel 前端地址，输入内测访问码，完成一次无 JD 和一次有 JD 冒烟测试。

## 本地与线上请求路径

- 本地：`VITE_API_BASE_URL` 留空，前端请求 `/api/...`，由 Vite 代理到 `http://127.0.0.1:8787`。
- 线上：Vercel 配置 `VITE_API_BASE_URL=https://your-render-api.onrender.com`，前端直接请求 Render 后端。
- 后端：`FRONTEND_ORIGIN` 配置为允许访问的 Vercel 域名。未配置时本地开发默认允许所有来源。

## 内测用户提醒文案

发链接前建议同时告知用户：

1. 这是私密内测链接，请不要公开传播。
2. 使用前请删除姓名、手机号、邮箱、身份证号、家庭住址等敏感信息。
3. 不要上传银行卡、证件、账号密码等无关隐私。
4. 工具只基于真实经历做表达优化，不支持伪造经历或夸大职责。
5. 生成结果仅供求职准备参考，不代表录用承诺。

## 验收清单

- [ ] 访问页未输入访问码时不能进入产品。
- [ ] 错误访问码不能进入产品。
- [ ] 正确访问码可以进入产品。
- [ ] 刷新页面后仍保持访问状态。
- [ ] `/api/ai/status` 无码或错码返回 401。
- [ ] `/api/ai/structure-resume` 无码或错码返回 401。
- [ ] `/api/ai/dig-questions` 无码或错码返回 401。
- [ ] `/api/ai/jd-fit` 无码或错码返回 401。
- [ ] `/api/ai/report` 无码或错码返回 401。
- [ ] `.env.example` 只有占位值，没有真实 Key。
- [ ] Vercel 已配置 `VITE_API_BASE_URL`。
- [ ] Render 已配置 `FRONTEND_ORIGIN`。
- [ ] Render 已配置 `BETA_ACCESS_CODE`。
- [ ] 构建通过，自动测试通过。
- [ ] Vercel 页面能打开内测访问页。
- [ ] 正确访问码能进入产品。
- [ ] 无 JD 模式能生成报告。
- [ ] 有 JD 模式能生成报告。

## 已知边界

- 访问码不是正式账号系统，不能区分不同用户。
- 访问码保存在浏览器 localStorage，适合小范围内测，不适合公开投放。
- 当前无数据库，用户关闭或清除浏览器数据后，本地会话可能丢失。
- 后续正式上线前应补充账号、速率限制、审计日志、数据删除机制和更完整的隐私协议。
