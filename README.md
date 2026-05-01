# Garlic Claw

AI 助手，支持多模型聊天、插件扩展和设备控制。

## 环境

- Python 3.10+
- Node.js 22+
- npm（随 Node.js 安装）

## 文档

| 文档 | 面向 |
|------|------|
| 当前 `README.md` | 使用者 |
| [`docs/README.md`](docs/README.md) | 开发者入口 |
| [`docs/插件开发指南.md`](docs/插件开发指南.md) | 插件开发 |
| [`docs/后端模型调用接口说明.md`](docs/后端模型调用接口说明.md) | 模型接入 |
| [`docs/扩展内核契约说明.md`](docs/扩展内核契约说明.md) | 维护者 |
| [`docs/扩展内核维护说明.md`](docs/扩展内核维护说明.md) | 维护者 |

## 项目结构

```
start.bat / start.sh      启动入口
packages/
  server/      NestJS 后端，HTTP :23330，插件 WS :23331
  web/         Vue 3 前端，开发 :23333
  shared/      共享类型
  plugin-sdk/  插件 SDK
  config/plugins/     本地/示例插件
config/
  ai/          AI provider 配置
  mcp/         MCP 配置
  personas/    Persona（人设）
  subagent/    子代理
  skills/      内置 skill
tools/
  一键启停脚本.py  主入口脚本
  scripts/         编排与运行时
```

## 快速开始

```bash
npm install
cd packages/server && npx prisma generate && npx prisma db push && cd ../..

# 启动
.\start.bat restart          # Windows
bash ./start.sh restart      # Linux / WSL

# 停止
.\start.bat stop

# 前台模式（Ctrl+C 停止）
python tools/一键启停脚本.py --tail-logs
```

启动后访问：
- 前端 `http://127.0.0.1:23333`
- 后端 API `http://127.0.0.1:23330/api`
- 插件 WebSocket `ws://127.0.0.1:23331`

## 配置

### 环境变量

```bash
cp .env.example .env
```

关键变量：

| 变量 | 说明 |
|------|------|
| `GARLIC_CLAW_LOGIN_SECRET` | 登录共享密钥 |
| `GARLIC_CLAW_AUTH_TTL` | 登录态有效期，默认 `30d` |
| `JWT_SECRET` | JWT 签名密钥 |
| `GARLIC_CLAW_AI_SETTINGS_PATH` | AI 配置路径，默认 `config/ai/` |

### AI Provider

配置文件在 `config/ai/`，支持三种协议族：OpenAI、Anthropic、Gemini。

```bash
cp config/ai/providers/openai.example.json config/ai/providers/openai.json
```

编辑 `config/ai/providers/openai.json`，填入 `apiKey` 和 `baseUrl`。

## 技术栈

- 后端：NestJS 11 + Prisma + AI SDK v6
- 前端：Vue 3 + Vite + Pinia
- 插件通信：WebSocket + `@garlic-claw/plugin-sdk`

## 能力

- 多 provider / 多模型对话（SSE 流式）
- 消息编辑、删除、停止、重试
- 图片上传与视觉转述
- 记忆管理
- 插件系统（设备控制、IoT 等）
- 自动化任务（Web UI 创建，定时/触发执行）
- Skill 系统
- MCP 工具集成
- 子代理

## 开发验证

```bash
npm run lint
npm run typecheck:server
npm run typecheck -w packages/web
npm run test:server
npm run smoke:server
```
