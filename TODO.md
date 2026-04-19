# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成旧流水只保留摘要；本轮实现细节放 `task_plan.md / progress.md / findings.md`。

## 已完成摘要

- `packages/shared` 已收口为 type-only，共享契约已对齐。
- `packages/server/src` 已压到 `8494`，Windows 与 WSL 内部目录的 fresh 构建、测试、后端 smoke、前端浏览器 smoke、独立 judge 都已通过。
- 认证主链已收口为单密钥登录；`users/me / register / dev-login / refresh / role / API Key` 主链路已删除。
- 聊天链路已支持 provider 自定义扩展块，前端默认折叠展示；插件侧已支持显式 `transportMode: 'generate' | 'stream-collect'`。
- 聊天页“会话相关元素统一刷新”已完成，发送 / 重试 / 编辑 / 删除 / 停止生成后的摘要刷新、旧 SSE/旧请求竞态收口、独立 judge 都已通过。
- 文档分层、跨平台约束、无绝对路径约束、测试目录规范已同步到 `AGENTS.md`。
- N12 Persona 重构（AstrBot 方向）已完成，当前 persona 已改为服务端一等资源并使用目录化存储。
- N13 插件配置元数据协议已收口为 object-tree 声明式 schema，`shared / plugin-sdk / server / web` 已对齐并通过 fresh 验收。
- N15 模型上下文长度与 usage 估算已完成；`contextLength` 与模型元数据已持久化，usage 缺失时会统一估算并返回稳定结构。
- N16 插件化上下文压缩已完成；通用历史接口、`metadata.annotations[]`、自动/手动压缩、聊天摘要展示与 fresh 验收已打通。
- N14 远程插件静态接入密钥与元数据缓存已完成；远程插件主语义已收口为 `runtimeKind + remoteEnvironment + auth.mode + capabilityProfile`，接入配置面板、静态缓存、IoT 风险提示和 fresh 验收已齐备。

## 当前阶段：待定

- N17 Skill 对齐 OpenCode 已启动：
  - skill 改为原生按需加载工具
  - 删除会话级 skill 激活态、专用工具源和隐式常驻 prompt 注入
  - skill 相关代码执行统一回到通用工具

## 固定约束

- 不允许引入绝对路径。
- WSL 测试必须在 WSL 内部目录执行；如当前环境本身就在 Linux / WSL 内部目录则忽略迁移动作。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过才能继续。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 不接受把 persona 复杂度继续藏在普通插件顺序或隐式 prompt 覆盖里。
