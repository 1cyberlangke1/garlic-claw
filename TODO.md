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
- `[已完成] N13 插件配置元数据协议重构（AstrBot 方向）`：
  - 插件配置已从扁平 `fields[]` 收口为 object-tree 声明式协议，主语义覆盖 section/object/items、`hint / obvious_hint / options / condition / collapsed / _special`。
  - `shared / plugin-sdk / server / web` 已统一到新协议；宿主可以按 schema 渲染配置 UI，server 会按新协议生成快照并递归校验。
  - 受影响 build、lint、server smoke、web smoke 与独立 judge 已通过。
- `[已完成] N15 模型上下文长度与 usage 估算`：
  - `AiModelConfig` 已新增 `contextLength`，默认值为 `128 * 1024`；模型能力与上下文长度会持久化到 AI 设置文件。
  - usage 已收口到统一模型执行层：优先读取 AI SDK 统一字段，缺失时按 `ceil(utf8Bytes / 4)` 估算，并统一返回稳定 usage 结构。
  - 前端 AI 设置页已支持真实编辑 `contextLength`；provider 整体保存会清理被移除模型的陈旧元数据，定向测试、server smoke、web smoke 与独立 judge 已通过。
- `[已完成] N16 插件化上下文压缩（参考 OpenCode / AstrBot）`：
  - 已通过通用 Host API `conversation.history.get / preview / replace`、通用 `metadata.annotations[]` 与确定性 hook 顺序完成插件化上下文压缩，不给宿主增加压缩专用后门。
  - `builtin.context-compaction` 已支持自动压缩、手动压缩、正式摘要消息写回、送模视图裁剪，以及 assistant 消息上方默认折叠的压缩摘要展示。
  - 受影响定向测试、`smoke:server`、`smoke:web-ui`、`lint` 与独立 judge 已 fresh 通过；期间暴露的 state 权限缺口和浏览器 smoke 脆弱点都已修复。
- `[已完成] N14 远程插件静态接入密钥与元数据缓存`：
  - 远程插件公开主语义已从 `deviceType + bootstrap token` 收口为 `runtimeKind + remoteEnvironment + auth.mode + capabilityProfile`，宿主改为保存并校验用户手填的静态接入 key。
  - 服务端已把远程接入配置、静态元数据缓存和运行态连接状态分层持久化；`refresh-metadata`、重新注册和离线缓存展示都已有正式实现与测试证据。
  - 前端插件页已新增远程接入配置面板、远程摘要面板和 IoT / 控制型风险提示；`smoke:server`、`smoke:web-ui`、`lint`、定向测试与独立 judge 已 fresh 通过。

## 当前阶段：待定

- 当前没有新的进行中项目级阶段；下一轮任务开始前，再把对应详细计划写入 `TODO.md / task_plan.md / progress.md / findings.md`。

## 固定约束

- 不允许引入绝对路径。
- WSL 测试必须在 WSL 内部目录执行；如当前环境本身就在 Linux / WSL 内部目录则忽略迁移动作。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过才能继续。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 不接受把 persona 复杂度继续藏在普通插件顺序或隐式 prompt 覆盖里。
