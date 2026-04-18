# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成旧流水只保留摘要；本轮实现细节放 `task_plan.md / progress.md / findings.md`。

## 已完成摘要

- `packages/shared` 已收口为 type-only，共享契约已对齐。
- `packages/server/src` 已压到 `8494`，Windows 与 WSL 内部目录的 fresh 构建、测试、后端 smoke、前端浏览器 smoke、独立 judge 都已通过。
- 认证主链已收口为单密钥登录；`users/me / register / dev-login / refresh / role / API Key` 主链路已删除。
- 聊天链路已支持 provider 自定义扩展块，前端默认折叠展示；插件侧已支持显式 `transportMode: 'generate' | 'stream-collect'`。
- 文档分层、跨平台约束、无绝对路径约束、测试目录规范已同步到 `AGENTS.md`。

## 当前阶段：[已完成] N12 Persona 重构（AstrBot 方向）

### 目标

- 把当前 `persona = 会话标签 + 插件改 prompt` 的模式，重构为接近 AstrBot 的独立 persona 资源系统。
- persona 变成服务端一等资源，而不是 `builtin.persona-router` 这类插件的附属配置。
- 聊天主链由服务端统一消费 persona，不再把 persona prompt owner 放在普通 `chat:before-model` 插件上。
- 重构后 persona 至少具备以下能力：
  - 独立持久化
  - 列表 / 详情 / 新增 / 编辑 / 删除
  - 应用到当前对话
  - 默认 persona 回退
  - persona prompt 注入
  - begin dialogs 注入
  - 按 persona 约束 skills
  - 按 persona 约束 tools
  - persona 专属错误消息

### 当前问题

- 当前 persona 主体只存在于 `RuntimeHostUserContextService` 的内存 `Map` 中，不是独立持久化资源。
- 当前 Web 人设页只能“查看 + 应用到当前对话”，不能管理 persona 资源本身。
- 当前聊天主链不会直接消费 persona 配置；`activePersonaId` 主要只是传给 Hook 上下文。
- 当前若把 persona 逻辑继续放在 `chat:before-model` 插件里，会和其它改 `systemPrompt` 的插件产生 owner 冲突。
- 当前 Hook 链顺序虽然稳定，但主要依赖 `priority + pluginId`；不能把 persona 主语义继续寄托在普通插件顺序上。

### 设计边界

- persona 必须从“插件 owner”迁回服务端主链 owner。
- 不以“安装顺序”作为语义顺序；如需顺序，只用显式规则。
- 第一轮不做新的复杂 prompt DSL；先完成 persona 独立资源化与服务端统一组装。
- 第一轮不要求完全复刻 AstrBot 所有历史兼容细节，但要复刻其核心能力模型：
  - persona prompt
  - begin dialogs
  - skills 白名单 / 空列表禁用 / `null` 表示全量
  - tools 白名单 / 空列表禁用 / `null` 表示全量
  - custom error message
- 允许保留 `builtin.persona-router` 作为“辅助自动切换策略插件”，但它不再是 persona 主链 owner。
- 不新增 `helper / helpers` 命名、目录或抽象层。

### 实现计划

#### P1. Persona 资源中心

- 新增服务端 persona store 与 manager，独立于 `RuntimeHostUserContextService`。
- 采用当前项目已有的务实持久化方式：
  - 首轮落到 `packages/server/tmp/personas.server.json`
  - 测试环境走隔离测试文件
- persona 数据模型至少包含：
  - `id`
  - `name`
  - `description`
  - `prompt`
  - `beginDialogs`
  - `toolNames`
  - `skillIds`
  - `customErrorMessage`
  - `isDefault`
  - `createdAt`
  - `updatedAt`
- 提供默认 persona 种子，替代现在硬编码在 `RuntimeHostUserContextService` 里的单条默认记录。

#### P2. HTTP 与共享契约

- 扩展 shared persona 契约，区分：
  - summary
  - detail
  - current
- 扩展 `/personas` HTTP 边界：
  - `GET /personas`
  - `GET /personas/:personaId`
  - `POST /personas`
  - `PUT /personas/:personaId`
  - `DELETE /personas/:personaId`
  - `GET /personas/current`
  - `PUT /personas/current`
- 保持现有插件 host persona API 可用：
  - `persona.list`
  - `persona.get`
  - `persona.current.get`
  - `persona.activate`

#### P3. 聊天主链统一消费 persona

- `ConversationMessagePlanningService` 统一解析当前会话 persona。
- 在模型调用前由服务端统一完成：
  - persona prompt 注入
  - begin dialogs 注入
  - persona skill 限制
  - persona tool 限制
- persona prompt 与 skill prompt 的组合规则由服务端固定，不再由 persona 插件直接覆盖。
- `chat:before-model` 仍可存在，但 persona 相关 owner 从中移出。

#### P4. 错误与会话行为

- 聊天主链失败时，如果当前 persona 配置了 `customErrorMessage`，优先返回该消息。
- 对话记录继续保存 `activePersonaId`，但它引用的是 persona store 中的独立资源。
- 当前 persona 被删除时，已有对话回退到默认 persona，而不是留下悬空 ID。

#### P5. 前端人设页升级

- `PersonaSettingsView` 从“应用页”升级成“管理 + 应用”页。
- 前端支持：
  - persona 列表
  - 创建
  - 编辑
  - 删除
  - 设置为默认 / 标识默认
  - 应用到当前对话
- 页面文案不再把 `builtin.persona-router` 作为人设主入口。
- 如保留自动切换插件，只把它作为可选增强入口显示。

#### P6. 兼容与清理

- `RuntimeHostUserContextService` 中 persona 相关 owner 迁走，只保留真正属于 user context 的内容。
- `builtin.persona-router` 从“主 owner”降级为“策略插件”：
  - 只负责根据规则切换 `activePersonaId`
  - 不再直接成为 persona prompt 主组装者
- 清理旧的人设页、旧文档、旧测试中“persona 主要靠插件改 prompt”的表述。

### 验收标准

- persona 成为独立持久化资源，不再只存在于运行时内存。
- 前端可直接创建、编辑、删除、查看和应用 persona。
- 新对话与无 persona 对话会稳定回退到默认 persona。
- 模型调用前，服务端会统一注入 persona prompt 与 begin dialogs。
- persona 可真实约束 skills 与 tools，而不是只展示字段。
- persona 专属错误消息在请求失败时能真实生效。
- 当前 persona 主链不再依赖 `builtin.persona-router` 才能成立。
- 受影响测试、构建与 smoke 必须 fresh 通过。

### 当前验收命令（阶段内持续维护）

- `packages/server`: persona 相关定向 `jest`
- `packages/web`: persona 相关定向 `vitest`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: 受影响测试
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- 如人设页有真实 UI 改动，再补 `npm run smoke:web-ui`

### 当前结论

- 新鲜验收已通过：
  - `packages/shared`: `npm run build`
  - `packages/server`: persona 相关定向 `jest`
  - `packages/server`: `npm run build`
  - `packages/web`: persona 相关定向 `vitest`
  - `packages/web`: `npm run build`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
  - root: `npm run lint`
- 独立 judge 已通过：
  - agent `019d9f0c-fe7c-7e73-980f-bdaac5151964`
  - 结论：`PASS`
  - 未发现“persona owner 只是换壳平移”或新的阻断项

## 固定约束

- 不允许引入绝对路径。
- WSL 测试必须在 WSL 内部目录执行；如当前环境本身就在 Linux / WSL 内部目录则忽略迁移动作。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过才能继续。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 不接受把 persona 复杂度继续藏在普通插件顺序或隐式 prompt 覆盖里。
