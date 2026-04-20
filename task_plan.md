# 2026-04-19 Skill 对齐 OpenCode

## 目标

- 把当前 skill 的公开语义和运行时主链对齐到 `other/opencode` 的 skill 设计。
- 避免继续把 skill 做成“会话常驻提示资源 + 专用治理页 + 专用工具源”的另一套系统，如果这些语义不属于目标设计则要收掉。
- 保持与现有 persona、插件、MCP、命令系统的边界清晰，不新增兼容层。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| S17-1 | 已完成 | 摸底当前 skill 实现与 `other/opencode` skill 主链差异，明确要保留和要删除的语义 |
| S17-2 | 已完成 | 形成对齐方案，确认 shared / server / web 的收敛边界 |
| S17-3 | 已完成 | 按确认方案改造 skill 发现、运行时注入、命令入口与前端界面 |
| S17-4 | 已完成 | 补测试、fresh 验收与独立 judge |
| S17-5 | 进行中 | 把 `subagent` 公开语义从 `profileId + taskId` 收口到 `subagentType + sessionId`，并把 `todo` owner 改成 session 级资源 |

## 当前决定

- 先以 `other/opencode` 的 skill 主语义为准做设计，不先假设保留现有 Garlic Claw 的会话激活模型。
- 如果 `opencode` 没有的能力只是我们自己额外长出来的壳，而不是稳定 owner，就优先删除而不是继续迁移。
- skill、persona、插件命令、工具治理的 owner 必须重新梳理，避免“skill 内容加载”和“工具权限治理”继续缠在一起。
- 用户已确认采用方案 1：
  - 直接切到 OpenCode 风格的 skill 懒加载模型
  - 删除现有 `activeSkillIds`、`/skill use/remove/clear` 和 skill 会话绑定逻辑
  - skill 的代码执行不再走专用执行器；与执行环境绑定的通用工具留到后续 runtime 子阶段
- 2026-04-20 补充决定：
  - 这轮先不碰任何执行环境相关能力，包括 `bash`、环境内副本、环境切换与 staging。
  - 先把与执行环境无关的部分落地：
    - skill 发现链统一收口到仓库根 `skills/`
    - 技能页去掉“用户技能/用户目录”公开语义
    - shared `SkillSourceKind` 同步收口，不再保留 `user` 公开类型分支
    - native `skill` 工具通过 `toModelOutput` 向模型回送 `<skill_content>` 文本块，而不是只回 JSON
    - 相关实现优先参考 `other/opencode/packages/opencode/src/skill/index.ts` 与 `other/opencode/packages/opencode/src/tool/skill.ts`
  - 当前阶段不改 AI 工具名，仍维持 `skill`；先把发现、目录与静态元数据语义收干净。
  - 已提前落地的 `bash / FileRuntime / native 工具` 不计入当前阶段进度，后续如保留，另开 runtime 子阶段重新审视。
  - 2026-04-20 补充：
    - `todo` 当前按 `other/opencode/packages/opencode/src/tool/todo.ts` 与 `session/todo.ts` 的 owner 收口
    - 公开语义固定为“当前会话独立待办列表的全量覆盖”
    - HTTP 接口固定为 `GET/PUT /chat/conversations/:id/todo`
    - `http-smoke.mjs` 已补独立路由覆盖和 native `todo` 多轮工具循环证据链
    - `subagent` 后续落地继续优先参考 `other/opencode/packages/opencode/src/tool/task.ts`
    - 当前已补第一段 `taskId` 续跑：
      - shared / plugin-sdk / server 都已接通 `taskId`
      - `builtin.subagent-delegate` 两个工具都可透传 `taskId`
      - `subagent.task.start` 续跑已有任务时会复用原任务 id，并把新提示接到既有请求上下文后继续执行
    - 当前已补第二段 `description` 标题语义：
      - shared / plugin-sdk / server / web 都已接通 `description`
      - `description` 作为任务标题独立持久化，前端任务卡片优先显示该标题
      - `requestPreview` 继续保留真实请求预览，不再复用 `description`
    - 当前已补第三段 `subagent type` 语义：
      - shared / plugin-sdk / server / web 都已接通 `subagentType`
      - 宿主已落真实 `RuntimeHostSubagentTypeRegistryService`，通过 `subagent-types/*.yaml` 扫描类型
      - 默认 `general / explore` 会自动补齐到目录中；`explore` 仍会补默认只读工具与探索导向提示词
      - 显式 `providerId / modelId / system / toolNames` 仍可覆盖类型默认值
      - 后台任务会持久化 `subagentType / subagentTypeName`
      - HTTP 已补 `GET /subagent-types`，插件声明式配置可用 `selectSubagentType` 拉取选项
    - 当前已补 `invalid` 失败恢复语义：
      - `AiModelExecutionService` 已接入 `experimental_repairToolCall`
      - 无效参数 / 未知工具会自动转成内部 `invalid` 工具结果，而不是直接打断整轮工具循环
      - native / plugin / MCP 工具的可恢复执行错误会统一回写 `invalid-tool-result`
      - `ConversationTaskService` 与 `RuntimeHostSubagentRunnerService` 都已把 `tool-error` 收口为稳定结果持久化
    - 当前工作区里的执行环境草稿已收走：
      - `packages/server/src/execution/bash/*`
      - `packages/server/src/execution/file/*`
      - 对应未提交测试草稿
      - 这部分不再污染当前 N17 口径，后续如要继续实现，另开 runtime 子阶段
    - 2026-04-20 新决定：
      - `subagent` 名字保持不变，但公开输入改成 OpenCode 风格的 `subagentType + sessionId`
      - `profileId` 不再作为公开主语义；宿主内建 `general / explore` 已改成子代理类型目录
      - 恢复同一子代理上下文的公开入口改用 `sessionId`
      - 当前结果载荷与后台任务账本仍保留 `taskId` 投影；后续再继续把它从公开主语义降级
      - 后台任务页继续保留，但只展示 session 的最新执行投影，不再让任务记录反向拥有 session
      - `todo` 读写统一改到 session owner；主聊天只把 `conversationId` 当主 session id 的宿主映射
      - 插件声明式配置里的子代理选择器特殊类型改成 `selectSubagentType`

## 当前摸底

- 当前 Garlic Claw skill：
  - 有独立 `/skills` 管理页
  - 有会话级 `activeSkillIds`
  - 会在每次主聊天调用前把 active skills 拼进 `systemPrompt`
  - 还额外暴露 `skill__asset__list / read / run` 这组专用工具
  - 通过 `/skill use/remove/clear` 管理会话绑定
- 当前 OpenCode skill：
  - 以原生 `skill` 工具按需加载单个 `SKILL.md`
  - 通过 `<available_skills>` 描述让模型自行选择是否调用
  - skill 内容只在调用后注入上下文，不是会话常驻绑定
  - 有权限模式过滤 `allow / ask / deny`
  - 同名 skill 还会自然进入 slash command 列表，但本质仍是加载 prompt 模板/说明，不是会话状态机
- 2026-04-19 补充：
  - `http-smoke.mjs` 之前只覆盖 `/skills` 路由，没有覆盖 runtime 里的 native `skill` 工具暴露与多轮 tool loop。
  - 当前 smoke 已补两条证据链：
    - `loadPolicy=deny` 时，主聊天请求发给模型的 `tools` 列表中不再包含 native `skill`
    - `loadPolicy=allow` 时，fake OpenAI 会先发 `skill` tool call，宿主执行后继续下一轮并返回自然语言
- 2026-04-20 补充：
  - 当前 Garlic Claw skill 发现链仍同时扫描：
    - 仓库根 `skills/`
    - 用户目录 `~/.garlic-claw/skills`
  - 这与用户要求的“保证从 `skills/` 目录扫描”不一致，也让前端“项目/用户”双来源语义继续外露。
  - 当前 skill 页统计、卡片和详情面板都还在展示 `sourceKind === 'project' | 'user'`，需要同步收口。
  - 当前这部分已收口完成：
    - server 只扫仓库根 `skills/`
    - shared `SkillSourceKind` 已收成单一 `project`
    - web 技能页不再按“项目/用户”双来源统计
    - native `skill` tool follow-up request 已带上 `<skill_content>`，不再只是 JSON tool result
  - 当前 runtime 新进展：
  - 2026-04-20 更正：
    - 先前提前落了 `bash / FileRuntime / native 工具`，这和“先做与执行环境无关的部分”冲突
    - 这些实现暂不作为当前阶段完成度依据，后续另列 runtime 子阶段

# 2026-04-19 独立事件日志与非送模消息语义

## 目标

- 把 `plugin / MCP / skill` 的事件日志从进程内暂存改成独立文件日志。
- 日志统一放在仓库根 `log/` 下，并按实体类型和实体 ID 分目录隔离。
- 每个插件 / MCP / skill 都能单独配置日志文件大小上限，默认 `1MB`，设置为 `0` 表示关闭。
- 上下文压缩产物改成“前端可见但不进入 LLM 上下文”的正式消息语义，不再伪装成普通 assistant 消息。
- 前端分别在插件管理、MCP 管理、技能目录页面展示对应实体的最近日志和日志配置。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| L18-1 | 进行中 | 确认日志 owner、消息语义 owner、shared/server/web 契约边界 |
| L18-2 | 进行中 | 实现 server 文件日志服务与 plugin / MCP / skill 日志读写、配置持久化 |
| L18-3 | 进行中 | 实现“仅前端展示、不进入送模上下文”的消息角色并迁移上下文压缩 |
| L18-4 | 进行中 | 更新前端日志面板、聊天展示、测试、fresh 验收与独立 judge |

## 当前决定

- 不继续沿用 `PluginPersistenceService.events` 这类内存态 Map；日志 owner 要统一落到文件系统。
- 不为上下文压缩继续开专用展示后门；要把“用户可见但不送模”的消息语义做成通用消息角色。
- 送模历史构造链必须显式跳过这类消息，而不是依赖注解或特定插件 ID 判断。
- 日志配置跟随各自实体的正式配置 owner：
  - plugin 跟插件持久化记录走
  - MCP 跟 `mcp/mcp.json` 走
  - skill 跟 skill governance 走
- 前端不做单独“总事件日志页”，而是继续放回插件 / MCP / skill 各自页面。

## 当前推进

- shared / server / web 当前已经全部接通 `EventLogSettings / EventLogRecord / EventLogQuery / EventLogListResult` 正式契约。
- plugin / MCP / skill 三类实体都已有独立文件日志 owner，目录位于仓库根 `log/plugins|mcp|skills/<entity>/events.json`。
- Web 侧现在三个入口都能看到各自事件日志：
  - 插件管理
  - MCP 管理
  - 技能目录
- 上下文压缩摘要已切到 `role: 'display'`，并在前端使用独立样式显示。
- 已重新通过：
  - `packages/shared`: `npm run build`
  - `packages/server`: `npm run build`
  - `packages/web`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- 当前还缺独立 judge；在拿到 judge PASS 前，不把 L18 标成已完成。

## 当前摸底

- `packages/server/src/plugin/persistence/plugin-persistence.service.ts` 的事件日志仍是 `Map<string, PluginEventRecord[]>`，重启丢失。
- `packages/server/src/execution/mcp/mcp.service.ts` 只有治理动作返回值，没有独立日志持久化。
- `packages/server/src/execution/skill/skill-registry.service.ts` 目前只有治理配置，没有事件日志 owner。
- 上下文压缩仍在 `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts` 中写回 `role: 'assistant'` 的正式消息。
- `packages/server/src/conversation/conversation-message-planning.service.ts` 当前送模只收 `assistant / user`，这正好是新增前端可见消息角色的收口点。

# N14 远程插件静态接入密钥与元数据缓存

## 目标

- 把远程插件公开语义从 `deviceType` 收口为：
  - `runtimeKind`
  - `remoteEnvironment`
  - `auth.mode`
  - `capabilityProfile`
- 把远程插件接入主语义改成“用户手填静态 key”，不再以宿主签发 bootstrap token 作为公开主链。
- 在服务端显式区分远程接入配置、静态元数据缓存、运行态连接状态。
- 宿主自动生成远程接入配置 UI，并在插件离线时继续展示缓存元数据。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R14-1 | 已完成 | shared 契约改造：移除 `deviceType` 主语义，新增 `remoteEnvironment / auth.mode / capabilityProfile` |
| R14-2 | 已完成 | server 记录模型改造：远程接入配置、静态元数据缓存、运行态状态分层 |
| R14-3 | 已完成 | server 接口与网关握手改造：从 bootstrap token 主语义迁出 |
| R14-4 | 已完成 | web 插件页新增远程接入面板、缓存状态与风险提示 |
| R14-5 | 已完成 | 测试、模拟 IoT smoke、fresh 验证与独立 judge |

## 当前决定

- 只保留 `remoteEnvironment: 'api' | 'iot'`，不再保留 `pc | mobile` 公开语义。
- 只保留 `auth.mode: 'none' | 'optional' | 'required'`。
- 只保留 `capabilityProfile: 'query' | 'actuate' | 'hybrid'`。
- 远程插件接入 key 由宿主保存并使用；是否输入由 `auth.mode` 控制，不做全局强制。
- 远程插件的接入表单属于宿主自动能力，不混进插件自己的 config schema。
- 静态缓存只存声明型元数据，不缓存工具执行结果、健康检查结果和动态 route 结果。

## 当前摸底

- shared 仍存在 `DeviceType / AuthPayload.deviceType / RemotePluginBootstrapInfo.token`。
- server 仍暴露 `POST /plugins/remote/bootstrap`，并用 JWT 作为远程插件主接入语义。
- 插件持久化记录仍把 `deviceType` 暴露到读模型，没有远程接入配置和元数据缓存的显式分层。
- web 插件页还没有远程插件专属接入面板与缓存展示区。

# Persona 目录化存储计划

## 目标

- 把 persona 持久化从单文件改成 `persona/` 目录结构。
- 每个人设一个文件夹，默认人设也使用同一结构。
- 配置文件可直接人工编辑并允许写注释。
- avatar 不手动配置，改为自动识别人设目录中的 `avatar.*` 图片文件。
- 保持现有服务端 API、主对话语义与前端管理能力不变。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| P1 | 已完成 | 确认目录结构、文件格式与兼容边界 |
| P2 | 已完成 | 改造 `PersonaStoreService` 与测试夹具 |
| P3 | 已完成 | 运行 persona 相关测试、构建与 smoke |

## 当前决定

- 目录根使用仓库根 `persona/`；如设置 `GARLIC_CLAW_PERSONAS_PATH`，则使用该目录。
- 每个人设一个文件夹，目录名使用 `encodeURIComponent(personaId)`。
- 每个人设目录包含：
  - `SYSTEM.md`
  - `meta.yaml`
- `meta.yaml` 只保存元数据，不手动保存 `avatar`。
- 服务端会自动扫描人设目录内的 `avatar.png / avatar.webp / avatar.jpg / avatar.svg ...` 并回填响应中的 `avatar` 字段。

## 2026-04-18 插件配置元数据协议重构（AstrBot 方向）

### 目标

- 用接近 AstrBot 的声明式配置元数据协议替换当前插件扁平 `fields[]` schema。
- 宿主统一渲染插件配置 UI，不做插件自带前端。
- 第一轮把当前插件详情页配置面板升级为 object-tree 元数据渲染器。

### 当前决定

- 方向对标 AstrBot 的功能与字段语义，不直接照搬其文件名。
- 新协议保留纯数据语义，便于未来接不同前端。
- 第一轮不做动作按钮与插件自带页面；聚焦配置元数据与宿主渲染。
- `_special` 只接当前宿主已有稳定 owner 的选择器，不做空壳兼容。
- 旧 `fields[]` 协议不保留兼容层，直接迁到新协议。
- 内建示例 schema 继续按 AstrBot 风格收口：
  - `builtin.provider-router` 使用 `routing / tools / shortCircuit` section
  - `builtin.subagent-delegate` 使用 `llm / tools` section
  - `allowedToolNames` 不再用逗号分隔字符串，统一改成 `list<string>`
- 宿主已有的插件模型偏好 UI 继续保留为宿主侧自动能力，但显示条件收紧为：
  - 只有声明 `llm:generate` 的插件才展示
  - 默认仍继承主聊天当前 provider / model

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C1 | 已完成 | 改造 shared / plugin-sdk 配置元数据契约，并把计划写入 TODO |
| C2 | 已完成 | 改造 server 配置快照、默认值补全与递归校验 |
| C3 | 已完成 | 改造 web 插件配置面板，支持 object-tree 元数据渲染 |
| C4 | 已完成 | 补测试、构建、lint 与 smoke 验收；独立 judge 已 PASS，可收尾 |

## 2026-04-18 插件模型配置与工具治理拆页

### 目标

- 把插件调用 LLM 的宿主模型选择从全局 AI 设置迁到插件自己的设置页。
- 默认行为改成继承主聊天当前上下文；插件作者或用户可在插件维度手动覆盖 provider / model。
- `工具治理` 不再作为单独页面，拆回 `插件管理 / MCP 管理 / skill 管理` 各自页面。
- MCP 拆成独立界面；AI 设置页只保留真正属于宿主级 AI 配置的入口。

### 当前决定

- 不把插件宿主模型偏好塞进 manifest config，避免和插件声明式 schema 混用。
- 新增独立的插件宿主模型偏好读写接口；字段先只包含 `providerId / modelId`，两者同时为空表示继承主聊天。
- 插件运行时模型选择优先级固定为：
  - 调用参数显式指定
  - 插件宿主模型偏好
  - 当前对话上下文 `activeProviderId / activeModelId`
  - 系统默认 provider / model
- AI 设置页里的 `Host Model Routing` 只保留聊天回退链，不再暴露 `compressionModel / utilityModelRoles.pluginGenerateText` 这类当前无稳定 owner 的入口。
- 工具治理 UI 下沉后，复用统一 `/tools/overview` 数据源，但不再保留独立 `/tools` 页面。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| G1 | 已完成 | 后端新增插件宿主模型偏好契约、接口与运行时选择逻辑 |
| G2 | 已完成 | 前端插件页接入模型偏好面板，并从 AI 设置页移除插件默认文本生成入口 |
| G3 | 已完成 | 前端拆分 MCP 页面，移除独立工具治理页，把工具治理下沉到插件 / MCP / skill 页面 |
| G4 | 已完成 | 补测试、构建、lint 与 smoke，完成本轮验收 |

## 2026-04-18 MCP 默认目录显式化

### 目标

- 把 MCP 默认配置目录从隐藏的 `.mcp/` 改成显式的 `mcp/`。
- 让运行时默认读取仓库根 `mcp/mcp.json`，不再回退到空的 `tmp/mcp.server.json`。
- 不保留旧 `.mcp/` 兼容层。

### 当前决定

- 默认 MCP 配置文件统一为仓库根 `mcp/mcp.json`。
- `GARLIC_CLAW_MCP_CONFIG_PATH` 仍可覆盖默认路径。
- 服务端默认快照对外显示 `mcp/mcp.json`，便于前端与使用者理解。
- 仓库内置 MCP 配置直接迁到 `mcp/mcp.json`。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| M1 | 已完成 | 修改默认路径解析、迁移仓库配置并更新测试预期 |

## 2026-04-18 MCP 开发态重启收尾

### 目标

- 修复开发态 `node --watch` 重启时 stdio MCP server 残留 `EPIPE` 的问题。
- 保证宿主退出时会先断开 MCP client，再结束后端进程。

### 当前决定

- `McpService` 负责自身的退出收尾，模块销毁时主动断开全部 MCP client。
- Nest HTTP 入口开启 shutdown hooks，确保开发态重启与进程退出都会触发模块销毁链。
- 不修改外部 MCP server 包，优先修宿主退出顺序。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| S1 | 已完成 | 补退出钩子、回归测试与定向验证 |

## 2026-04-18 MCP 校验链补强收尾

### 目标

- 修正“严重 MCP 回归已进入提交，但校验链仍通过”的验收缺口。
- 让校验链同时覆盖：
  - 构建产物是否真的发射了 `mcp-stdio-launcher.js`
  - 真实 stdio MCP server 是否能经由 launcher 连通并成功调用工具
- 避免测试夹具和真实运行态的模块解析环境脱节，造成假通过或假失败。

### 当前决定

- HTTP smoke 继续承担“构建产物存在 + 宿主真实连通 working MCP”的端到端校验。
- `McpService` 的定向 `jest` 继续承担“launcher 路由 + 真实 stdio MCP 工具调用”的回归校验。
- 真实 MCP 集成测试产生的临时脚本必须放在仓库内可解析项目依赖的位置，不能再写到系统临时目录。
- 只有 smoke 与定向 `jest` 都新鲜通过，才算这条链路完成验收。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| V1 | 进行中 | 修复真实 MCP 集成测试夹具路径，并重新跑定向 `jest`、build、lint、smoke |

## 2026-04-18 子代理步数限制移除

### 目标

- 移除宿主层自行暴露的 `maxSteps / stopWhen / stepCountIs` 步数限制控制。
- 子代理运行、shared 契约、plugin-sdk authoring 与插件作者示例不再出现该能力。
- 保留现有工具过滤、tool result 收集、后台任务与 writeBack 语义不变。

### 当前决定

- 不再给 `AiModelExecutionService.streamText()` 透传 `stopWhen`。
- `RuntimeHostSubagentRunnerService` 不再读取、默认补齐或 hook 改写 `maxSteps`。
- `PluginSubagentRunParams / PluginSubagentRequest / SubagentBeforeRunHookMutateResult` 删除 `maxSteps`。
- `builtin.subagent-delegate` 不再暴露“子代理最多几步”的插件配置项。
- 如果后续仍出现“只跑一步就停”，那是第三方 `ai` 库默认语义，不再是宿主额外限制。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R1 | 进行中 | 删除 server/shared/plugin-sdk 的步数限制暴露与测试残留，并补验证 |

## 2026-04-18 AI SDK 多轮工具调用适配

### 目标

- 核对当前安装的 `ai` 库是否原生支持多轮工具调用。
- 如果默认行为仍会把工具链截断在单步，则在宿主统一执行层做适配，而不是让聊天链路和子代理链路各自特判。
- 保持“无工具时自然单次完成，有工具时按工具结果继续下一步，直到循环自然结束”的语义。

### 当前决定

- 当前安装版本 `ai@6.0.164` 原生支持多轮工具循环。
- `generateText / streamText` 的默认 `stopWhen` 是 `stepCountIs(1)`，所以不适配时会天然只跑一轮。
- `ai` 内部在“有工具调用且工具结果都齐了”并且“未命中 stop 条件”时，会继续下一步；没有工具调用时会自然结束。
- 宿主统一在 `AiModelExecutionService` 对“带工具的流式调用”注入 `stopWhen: isLoopFinished()`。
- 不重新向插件作者暴露新的步数配置；这次是宿主内部语义修正，不是把 `maxSteps` 换名留下。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| L1 | 已完成 | 核对 `ai` 库默认 stop 语义与内部循环条件 |
| L2 | 已完成 | 在统一执行层给工具流式调用注入 `isLoopFinished()` 并补测试 |

## 2026-04-18 聊天页 smoke 残留显示修复

### 目标

- 修复开发态前端聊天页仍显示已被 smoke 清理会话内容的问题。
- 保证后端会话已经不存在时，前端不会继续显示旧的 `smoke-ui-*` 消息与模型标记。

### 当前决定

- 这次残留不是后端数据库残留；当前实际问题是前端 `chat` store 仍保留已失效的 `currentConversationId / messages`。
- `loadConversations()` 在刷新会话列表后，需要校验当前选中的会话是否仍存在；如果已不存在，就同步清空当前消息、模型选择与流式状态。
- 用 web 单测覆盖“列表刷新后当前会话已失效”的场景，再用 `smoke:web-ui` 走完整浏览器链路复核。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C14-1 | 已完成 | 修复聊天 store 的失效会话收尾逻辑，并通过定向测试、build、lint、`smoke:web-ui`、`smoke:server` |

## 2026-04-18 插件健康快照与 LLM 面板收口

### 目标

- 修复插件详情页健康接口与插件列表健康快照契约错位，避免内建插件详情出现“未知”状态。
- 统一插件页状态展示，不再同时显示重复且语义冲突的连接 / 健康徽标。
- 继续保持“用了宿主 LLM 权限的插件自动出现模型选择面板”的宿主语义。

### 当前决定

- `/plugins/:pluginId/health` 直接返回完整 `PluginHealthSnapshot`，不再返回旧的 `{ ok: boolean }` 简化结构。
- 远程插件详情健康状态在“尚未连接 / 健康探测失败但未进入 error 状态”时按 `offline` 展示，不误记成 `error`。
- 插件侧栏只保留健康状态徽标，不再额外叠加重复的“在线 / 离线”文本 chip。
- 插件模型策略面板的显隐继续由宿主 owner 控制，当前规则是：插件声明 `llm:generate` 时自动出现。
- `subagent:run` 不并入这条宿主 LLM 面板语义；它仍走自己的子代理目标模型配置链。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| P15-1 | 已完成 | 统一插件健康快照接口、侧栏状态展示与 LLM 面板显隐判断，并重新通过 build、定向测试、lint、`smoke:server`、`smoke:web-ui` |

## 2026-04-18 会话标题内建插件实现补全

### 目标

- 修复 `builtin.conversation-title` 在插件页可见但运行时完全不生效的问题。
- 让会话标题生成逻辑作为真实内建 hook 接入 `chat:after-model` 链，而不是只停留在 manifest 声明层。

### 当前决定

- 不给标题插件加额外兼容层；直接把缺失的内建 hook definition 补齐。
- 保持现有标题生成语义：
  - 仅主对话主回复完成后执行
  - 仅当前标题仍是默认标题时生成
  - 仅更新会话标题，不改 assistant 消息正文
- 通过独立定向测试覆盖“生成”和“跳过”两条分支，再用 `smoke:server` 复核真实链路未回归。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| T16-1 | 已完成 | 补齐内建 hook definition、更新注册表、补测试并重新通过 build 与 `smoke:server` |

## 2026-04-18 本地插件公开语义与 memory-context 恢复

### 目标

- 把插件运行形态对外公开语义从“内建插件”收口到“本地插件”，避免把宿主内实现方式直接暴露给前端文案与插件管理视图。
- 补回 `builtin.memory-context` 的真实 hook 实现，确认它在重构前确实存在且语义延续。
- 保持当前插件 ID、hook 边界与运行时 owner 不变，不额外引入兼容层。

### 当前决定

- 这次改的是公开运行形态与前端文案，`builtin.*` 插件 ID 先不改。
- `memory-context` 继续挂在 `chat:before-model`，使用宿主现有 `memory.search` 能力，把命中摘要拼接进 `systemPrompt`。
- `memory-context` 返回值直接收口成稳定 JSON 结构，不再借助更宽的结果 union 推导。
- 前端插件管理默认选中逻辑按 `runtimeKind: 'local' | 'remote'` 判断，不再保留旧的 `'builtin'` 测试夹具语义。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| L17-1 | 已完成 | 补回 `builtin.memory-context` 实现并对齐历史语义 |
| L17-2 | 已完成 | 调整插件页“本地插件”相关测试夹具与默认选中判定 |
| L17-3 | 已完成 | 已通过 build、lint、`smoke:server`、`smoke:web-ui`，可继续整理提交 |

## 2026-04-18 聊天相关元素统一刷新

### 目标

- 把聊天页当前“只刷新消息、不刷新会话摘要”的行为收口成统一语义。
- 只要主聊天操作导致当前会话相关元素发生变化，前端就同步刷新会话列表与当前会话摘要，而不是只等用户手动切换或重新进入页面。
- 覆盖标题、更新时间、消息数以及其他挂在会话摘要上的通用字段，不为单独字段写特判。

### 当前决定

- 刷新 owner 放在 chat store，而不是散落到单个视图组件或 smoke 脚本。
- 发送、重试、编辑消息、删除消息、停止生成后，都走统一的“会话相关元素刷新”动作。
- 当前实现优先刷新：
  - 会话列表 `loadConversations()`
  - 当前会话详情 `loadConversationDetail()`
- 不引入专门的“标题刷新”私有逻辑，统一按“当前会话相关元素可能已被服务端改动”处理。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C18-1 | 已完成 | 梳理聊天操作遗漏的刷新点并完成实现 |
| C18-2 | 已完成 | 补测试、build、lint、smoke、judge；独立 judge 已 PASS，进入提交与 push 收尾 |

## 2026-04-18 远程插件静态接入密钥与元数据缓存

### 目标

- 把远程插件接入主语义改成“用户手填静态 key”。
- 为远程插件静态元数据建立服务端缓存模型，覆盖 manifest、工具描述、配置 schema 与未来 UI 元数据。
- 让远程插件离线时仍能展示最近一次成功同步的静态描述，而不是因为连接断开就失去管理信息。

### 当前决定

- 按用户要求，静态 key 视为用户自己掌握并决定外发的凭据；宿主只负责安全保存与使用，不再替用户管理其传播。
- 缓存 owner 放在服务端插件持久化与读取链，不放到前端 local storage，也不只放在网关内存态。
- 静态缓存与运行态状态必须拆分：
  - 静态缓存：manifest / tools / commands / hooks / routes / config schema / 未来 UI schema
  - 运行态状态：health / 事件日志 / 动态 route 响应 / tool 执行结果
- 目标完成后，旧的远程 bootstrap token 不再作为公开主语义。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R14-1 | 待开始 | 设计远程插件静态 key 契约、配置模型与接入校验 |
| R14-2 | 待开始 | 设计远程插件静态元数据缓存模型与失效语义 |
| R14-3 | 待开始 | 设计前端远程插件 key / 缓存展示与管理交互 |

## 2026-04-18 模型上下文长度与 usage 估算

### 目标

- 为模型元数据补齐持久化的能力配置与 `contextLength`。
- 为统一模型执行层补齐 usage 估算，避免上游缺失时出现空 usage。
- 保持当前 API 面尽量不扩散，只在必要 DTO / 返回契约上补字段。

### 当前决定

- `TODO.md` 里既有讨论不删除，本轮只追加 N15。
- `contextLength` 默认值使用 `128 * 1024`。
- usage 估算仅统计文本内容，公式固定为 `ceil(utf8Bytes / 4)`。
- usage 结构统一收口为 `{ inputTokens, outputTokens, totalTokens, source }`。
- 模型能力与 `contextLength` 一起持久化到 AI 设置文件。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| U15-1 | 已完成 | 更新规划文件，确认模型能力当前未持久化、需要和 `contextLength` 一起落盘 |
| U15-2 | 已完成 | 重构 AI 设置持久化与 `AiManagementService` 的模型读写 |
| U15-3 | 已完成 | 为统一模型执行层补齐 usage 估算 |
| U15-4 | 已完成 | 更新前端模型页并通过定向测试、build、lint、`smoke:server`、`smoke:web-ui` |
| U15-5 | 已完成 | 独立 judge 已 PASS，已确认 provider 整体保存清理陈旧元数据，以及前端 `contextLength` 正式链与 smoke 证据成立 |

## 2026-04-19 插件化上下文压缩（参考 OpenCode / AstrBot）

### 目标

- 用本地插件实现主对话上下文压缩，支持自动压缩与手动压缩。
- 宿主补齐通用会话历史读写接口，让插件可顺序改写持久化历史。
- 历史消息保留原文，通过通用 `annotations[]` 标记压缩覆盖关系，不给压缩插件单开固定字段。
- 前端补齐压缩插件配置面板、聊天手动压缩入口与压缩摘要消息展示。

### 当前决定

- 采用通用历史接口，而不是压缩专用 Host API。
- 历史改写阶段和 `chat:before-model` 阶段分层。
- 顺序复用现有 hook priority 语义，保证插件改历史顺序确定。
- 压缩摘要消息写回持久化历史；原始消息继续保留。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C16-1 | 已完成 | 更新设计文档、TODO 与规划文件 |
| C16-2 | 已完成 | 扩展 shared / plugin-sdk 契约与 Host API |
| C16-3 | 已完成 | 实现 server 会话历史改写链与 revision 校验 |
| C16-4 | 已完成 | 实现 `builtin.context-compaction` 插件的自动/手动压缩 |
| C16-5 | 已完成 | 更新前端配置和聊天界面 |
| C16-6 | 已完成 | 已通过定向测试、fresh 验收、浏览器 smoke 稳定性修复与独立 judge |
