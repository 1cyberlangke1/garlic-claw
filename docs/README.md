# 文档索引

`docs/` 是给开发者和维护者看的。使用者看根目录的 `README.md` 就够了。

## 插件开发

- [`插件开发指南.md`](./插件开发指南.md) — 远程插件接入、manifest、hook、host API、治理接口

## 后端开发

- [`后端模型调用接口说明.md`](./后端模型调用接口说明.md) — provider 配置、聊天接口、vision fallback、host model routing、内部模型调用链

## 内核维护

- [`扩展内核契约说明.md`](./扩展内核契约说明.md) — extension kernel contract，runtime 原语，plugin/MCP/skill 统一边界
- [`扩展内核维护说明.md`](./扩展内核维护说明.md) — owner 边界、维护规则、验证要求

## 开发规范

- [`开发规范.md`](./开发规范.md) — 前后端编码约定、项目结构、测试规范
- [`跨平台开发说明.md`](./跨平台开发说明.md) — Windows/WSL 环境配置、网络排障、进程管理

## 分层

- `README.md` → 使用者
- `docs/` → 开发者 + 维护者
- `AGENTS.md` → agent 协作

内容按受众放，不要跨层复制。
