# Findings

## 2026-05-01 上下文 preview 与自动压缩 token 口径失真

### 当前错误口径
- `RuntimeHostConversationRecordService.readConversationHistoryPreviewTokens(...)` 当前不是在读“当前历史的 token”，而是在读“最近一条匹配 provider/model 的 usage.inputTokens”。
- 这会把“上一轮真实请求的输入 token”直接拿来冒充“当前历史 preview / 自动压缩判断 token”。

### 直接后果
- 顶部 `100% / 14460 / 10000` 可能只是上一轮请求的 usage，不一定对应当前历史。
- 当前历史一旦被 summary、covered 或新消息改变，preview 仍可能显示旧 usage。
- 自动压缩触发判断也走同一 owner，因此会和顶部一起失真。

### 对照 `other/opencode` 的结论
- `opencode` 把真实 tokens 绑定在具体已完成 assistant turn 上。
- 它不会把旧 turn 的 usage 直接拿来充当当前历史 preview。
- 因此要对齐的不是“全退回估算”，而是“真实 usage 只在对应历史快照未变时复用”。

## 2026-05-01 回复完成后的压缩检查

### 当前缺口
- 自动压缩与上下文预览现在是分离的：
  - 预览会在聊天页立即显示 `100%`
  - 真正改写历史只会在下一次送模前发生
- 因此“收到回复后马上把超限历史折叠掉”这条产品语义，目前后端还没有 owner。

### 实现边界
- 新触发点应落在“assistant 回复已经完成并写回会话历史”之后。
- 不能直接复用 `rewriteHistoryBeforeModel()` 的全部副作用：
  - 它在 `allowAutoContinue = false` 时会登记 `autoStopConversationIds`
  - 这个副作用只适用于“当前正在准备送模”的场景，不应污染“回复已经完成”的场景

### 本轮结论
- 更合适的收口点不是前端 preview，也不是再次等待下一轮用户输入，而是后端 `broadcastAfterSend(...)`：
  - 此时 assistant 最终回复已经完成并写回历史
  - 可以立刻做一次压缩检查
  - 又不会打断当前回复的正常发送
- `opencode` 的关键不是“压缩失败后退回滑动窗口”，而是“压缩失败就停下，不带超限上下文继续跑”：
  - 上一条 assistant 完成后若判定 overflow，会先创建 compaction 任务
  - compaction 自己再失败时，会写 `ContextOverflowError` 并停止
- 因此当前仓库对齐后的语义也应是：
  - 回复后压缩失败：当前已完成回复保留，但下一轮先短路停止
  - 送模前压缩失败：当前这轮直接短路停止，不继续调用模型

## 2026-05-01 上下文压缩触发与消息队列

### 自动压缩
- `100%` 只是前端把 `estimatedTokens / contextLength` 做了展示，不是自动压缩调度器。
- summary 策略下的自动压缩 owner 在后端 `rewriteHistoryBeforeModel()`：
  - 只有下一次真正准备请求模型时才会检查并改写历史
  - 空闲态、只看页面、或刚收到上一轮回复时，不会立即落一次压缩
- 因此用户看到“已经超了，但还没压缩”，本质上是“预览链路”和“改写链路”刻意分开。

### 输入队列
- 主对话的待发送队列是前端会话级队列，不是后端并行执行器。
- 只要当前会话还在 `streaming`，新的用户输入或命令就先排进队列，等当前流结束后再串行发送。
- 这也意味着现在的 `/compact`、普通对话、其他命令在主对话里共用同一条串行发送通道。

## 2026-05-01 开发态启动过慢

### 根因结论
- `bootstrap-http-app.ts` 本身没有在 `listen` 前做额外业务 warmup；阻塞点在 Nest 模块生命周期。
- `McpService.onModuleInit()` 当前会等待 `reloadServersFromConfig()` 完成，而该方法会串行连接所有 MCP server。
- 单个 MCP server 的最坏耗时并不低：
  - 连接超时 `15000ms`
  - 拉工具列表超时 `10000ms`
  - 最多重试 `2` 次
- 因此只要本地挂着 `npx` 型或网络依赖型 MCP server，应用监听就会被启动期外部依赖绑住。

### 设计约束
- 不能靠删除 `config/mcp/servers/*.json` 解决，因为那只是规避用户配置。
- 更合适的 owner 是：
  - HTTP 服务先监听
  - MCP 在后台预热、更新状态与工具列表
  - 显式治理动作（`health-check / reconnect / reload`）仍保持真实探活，不做假成功

### 实现后结论
- 把 `McpService.onModuleInit()` 改成“占位注册 + 后台预热”后，默认 MCP 配置与空配置的端口开放时间已经收敛到同一量级。
- 这说明真正需要从启动关键路径拿掉的是“等待外部 MCP 连接完成”，不是单纯加大端口等待超时。

## 2026-04-30 上下文长度显示语义与上下文设置文案修正

### 预览字段语义
- `ConversationContextWindowPreview.maxWindowTokens` 当前不是“模型上下文长度”。
- 它实际暴露的是内部送模预算，因此不适合直接给用户看百分比和分母。
- 这不是“补一个总长度字段”就能解决的问题；当前字段名和展示语义本身就错了，需要直接修正。

### 自动压缩与 `manual`
- 现在的“没有自动压缩”至少有一部分不是 bug，而是配置语义：
  - `config/context-governance.json` 里还留着 `mode: "manual"`
  - 后端 `rewriteHistoryBeforeModel()` 也还要求 `runtimeConfig.mode === 'auto'`
- 既然产品目标已经明确不保留手动模式，就应该删掉这层模式分叉，而不是继续围着它补前端解释。

### 前端漏字段
- 上下文设置页当前字段是否显示，主要由 schema 条件控制。
- `allowAutoContinue` 现在要求：
  - `strategy === "summary"`
  - `mode === "auto"`
- 这意味着只要历史配置里残留 `manual`，即使后端有这个字段，前端也会被 schema 条件直接隐藏。

### 本轮修正后的结论
- “显示总上下文长度”和“内部预算裁剪”应该是两套语义：
  - 用户可见预览显示 `contextLength`
  - `reservedTokens/slidingWindowUsagePercent/compressionThreshold` 继续只服务后端送模预算
- `manual` 模式本身就是前后端不一致的来源：
  - 它让自动压缩逻辑和前端字段显示都多了一层无价值分叉
  - 完全删除后，语义和交互都更直接
- 这轮“后端有、前端没显示”的具体问题，不是前端组件没能力，而是 schema 条件把字段挡掉了。

## 2026-04-30 上下文预算、自动压缩与 AI 设置即时生效

### usage 链路
- AI SDK 已提供统一 usage 字段：
  - `inputTokens`
  - `outputTokens`
  - `totalTokens`
  - `cachedInputTokens`
- 当前仓库在 `AiModelExecutionService` 里仍包了一层 `readProviderUsage()`：
  - 已不再需要手动适配 `prompt_tokens/completion_tokens`
  - 应直接信任 SDK 统一字段，再只做最小合法性归一化
- `conversation.model-usage` 注解已经足够作为前端 `[i]` 展示 owner，不应再让消息本体 `provider/model` 成为硬前提。

### 上下文预算与自动压缩
- `ContextGovernanceService.readContextWindowBudget()` 公式本身没有把 `10000` 算成 `256` 的逻辑：
  - 更像是模型 `contextLength` 没有在聊天页或当前会话预览里刷新
- `chat-store.module.ts` 当前只在 `scope === 'context-governance'` 时刷新 preview：
  - 这解释了“AI 设置里改模型 contextLength 后，聊天页不立即更新”
- 自动压缩阈值使用 `readContextWindowTarget()` 读取当前 provider/model 的 `contextLength`：
  - 只要聊天页选中的 provider/model 与后端最新配置不同步，就会出现“前端显示不对、压缩触发也看着不对”的连锁问题

### AI 设置交互
- `ProviderSettings.vue` 与 `AiProviderModelsPanel.vue` 都还保留了模型上下文长度草稿 + 保存按钮模式。
- `SchemaConfigForm.vue` 仍以磁盘按钮作为统一提交入口，不符合当前项目里“设置项改完立即生效”的交互方向。

### 本轮修正后的结论
- “`14478 / 256`” 这类显示异常并不需要改预算公式：
  - 更实际的问题是 AI 设置改动没有及时持久化和推送到聊天页预览
  - 移除手动保存并补配置变更事件后，预览与后端上下文预算会重新对齐
- 自动压缩“看起来没触发”与上下文预算显示错误是一条链上的问题：
  - 模型 `contextLength` 没有及时保存时，前后端看到的仍是旧窗口
  - 修正自动保存后，阈值判断和前端预览会一起恢复
- `chat-store` 的内部配置事件监听此前在多次建 store 时会累积：
  - 测试里能看到一次事件触发多次 preview 请求
  - 已改成单实例监听，避免重复刷新和潜在内存残留

## 2026-04-28 README 中文问题
- README 全文 GPT 风格中文 ✅ 已修复

## 自动化工具
- `create_automation` 不在任何 plugin 的 tool 注册中 ✅ 已创建 builtin-automation.plugin.ts

## opencode task vs Garlic Claw 子代理（详细）
### opencode 的 task
- `sessions.create({ parentID, ... })` — task 就是普通 session
- 消息存在正常 message 系统（同一套存储）
- 结果内嵌: `task_id: xxx\n<task_result>\n...\n</task_result>`
- Resume: `sessions.get(taskID)` 
- Cancel: `ctx.abort` 事件监听
- 无独立 subagent 存储/管理页

### Garlic Claw 差距
- ✅ 结果已包裹 `<subagent_result>`
- ✅ sessionId resume / cancel_subagent
- ✅ 标签页查看
- ❌ 独立 JSON 文件存储，不是普通 session
- ❌ 消息不通过 conversation message API
- ❌ 无 parentID 语义

## 假实现审计（2026-04-29）
### HIGH — 功能完全虚假
1. `runtime-gateway-connection-lifecycle.service.ts:95` — `checkPluginHealth` 只查内存 map，不发 ping
2. `runtime-gateway-connection-lifecycle.service.ts:100` — `probePluginHealth` 没注册 probe 时静默返回 ok: true

### MEDIUM — 数据误导
3. `plugin-read-model.ts:21` — `buildPluginInfo` 的 failureCount/consecutiveFailures/lastError/lastErrorAt 永远硬编码 0/null
4. `runtime-plugin-governance.service.ts:85` — `createPluginHealthSnapshot` 的 failureCount 永远 0 或 1，不是累计

### LOW — 占位健康值
5. `tool-registry.service.ts:427` — `createInternalToolInfo` 硬编码 health: 'healthy'
6. `tool-registry.service.ts:493` — `createInternalSourceEntry` 硬编码 health: 'healthy'
7. `subagent-tool.service.ts:30` — `SubagentToolService.getToolInfos` 硬编码 health: 'healthy'

### 前端误导展示
8. `PluginDetailOverview.vue:70` — `failureCount ?? 0` 在健康快照为 null 时显示 0
9. `ToolGovernancePanel.vue:399` — `formatTime(null)` 返回 '尚未检查'
10. 多个组件 — `formatTime(null)` 返回不一致：'无' / '暂无' / '尚未检查'
11. 四个组件 — `healthText` 函数重复实现

### 根因
- `ToolInfo` shared 类型要求 `health/lastError/lastCheckedAt` 必填，所有 tool 注册都得编一个
- 没有后端服务真正实现累计失败跟踪、连接探活、或工具可用性检查

## 2026-04-29 上下文压缩跨窗口问题
- 前端聊天页的“子窗口”切换原先直接写 `chat.currentConversationId = sessionId`，没有走 `chat.selectConversation(...)`
- `main` tab 原先只改本地 `activeTab`，并不会真的切回主会话
- 后端子代理原先把 `subagent-session-*` 直接写进 `createConversation({ id })`，导致子窗口 conversation id 不是独立 UUID
- 结果是“窗口选择语义”和“真实对话加载链路”分叉：
  - 前端可能显示某个窗口，但消息、上下文预览、权限状态没有按真实会话重载
  - 后端返回的子窗口 id 又不符合正常 conversation 路由预期，继续放大跨窗口行为错误

## 2026-04-29 工具管理入口分散
- 统一组件已存在：`packages/web/src/features/tools/components/ToolGovernancePanel.vue`
- 但当前仍有三处直接管理入口：
  - `ProviderSettings.vue`：执行工具管理、子代理管理
  - `McpView.vue`：MCP 工具管理
  - `PluginsView.vue`：插件详情内工具管理
- 当前 `/tools` 路由仍重定向到 `mcp`，还不是真实统一页面
- 更合适的 owner 是单独 `ToolsView`，把四类工具源集中展示：
  - `internal/runtime-tools`
  - `internal/subagent`
  - `mcp`
  - `plugin`
- 原页面应只保留说明或跳转，否则会继续形成多个启用/禁用入口

## 2026-04-29 工具管理显示规则
- `/tools` 不能固定展示四类管理卡片，否则会把“未实际接入工具”的分类也展示出来
- 更合适的规则是先读取 `/tools/overview`，再按 `ToolSourceInfo.totalTools > 0` 决定是否显示该分类
- 因此像 MCP 未启用、插件未暴露宿主工具、或某类当前没有实际工具时，统一工具页应直接隐藏该分类，而不是展示空状态卡片

## 2026-04-29 插件运行时能力现状
- `RuntimeHostPluginRuntimeService` 里的：
  - `storageStore` / `stateStore` 只是内存 `Map`
  - `cronJobs` 只是内存记录表
  - `cron.register` 只登记，不会调度执行
- `RuntimeHostConversationRecordService` 里的 `conversationSessions` 也是内存 `Map`
  - 有 `start/get/keep/finish`
  - 无持久化
  - 过期清理只在 `get` 时被动触发
- 真正在跑时间触发的只有 `AutomationService`
  - 使用 `setInterval`
  - 自动化记录会写 JSON
  - 只支持 `10s / 5m / 1h` 这类简化表达式，不是真 cron 表达式
- OpenClaw 官方文档给出的实现更接近：
  - cron 由 Gateway 内置调度器执行
  - job store 落在 `~/.openclaw/cron/jobs.json`
  - 每次执行都会生成 task 记录
  - task 记录与维护 sweeper 独立于 heartbeat

## 2026-04-29 插件运行时能力真实化
- `conversation session` 最合适的 owner 仍然是 `RuntimeHostConversationRecordService`
  - 直接并入 `conversations.server.json` 的 `pluginConversationSessions` 字段即可
  - 这样可以复用现有会话文件路径、迁移链和删除会话时的清理动作
- `storage/state/cron` 更适合独立文件
  - 避免把高频 KV 与 cron 元数据继续塞进插件配置或会话文件
  - 当前已收口到新的 `plugin-runtime.server.json`
- `manifest cron` 不能只靠前端 fallback 展示
  - 如果后端不把它纳入调度，页面看到的是“像真的”，实际不会跑
  - 因此已和 `host cron` 合并成同一套 runtime job 记录与调度流程

## 2026-04-29 新一轮假实现扫描
- `McpService` 仍残留一处真实假实现：
  - `runGovernanceAction('health-check')` 原先只读 `serverRecords` 缓存状态并回文案
  - 这意味着工具管理页点击 `health-check` 时，不会真正探活 MCP server
- `AutomationService` 也存在实现收窄但文案放大的问题：
  - `TriggerConfig.cron`、builtin automation 插件描述都写 `cron 表达式`
  - 实际调度却只支持 `10s / 5m / 1h`
- 当前两处都已改成真实行为：
  - MCP `health-check` 现在会真实重新建连或临时 probe，再更新状态
  - 自动化 cron 现在支持标准 cron 表达式，并兼容既有简写间隔格式

## 2026-04-29 工具管理与插件健康残留问题
- `ToolRegistryService` 原先把 source/tool 启用状态只写进进程内 `Map`
  - 接口会返回“已禁用 / 已启用”
  - 但服务重启后会全部回到默认值
  - 这类行为属于典型“看起来保存成功，实际没有真实持久化”
- `/tools/overview` 的插件工具源原先没有真实健康 owner：
  - `health` 直接由 `plugin.connected` 映射成 `healthy`
  - `lastCheckedAt` 直接复用 `plugin.lastSeenAt`
  - `lastError` 固定 `null`
  - 页面看到的是“像健康检查结果”，实际只是连接态拼装
- `RuntimePluginGovernanceService.createPluginHealthSnapshot` 原先把 `lastSuccessAt` 的成功/失败分支写成同一个值
  - 失败后的健康快照仍会显示“最后成功”
  - 插件详情页会被误导成“刚成功过”
- 当前已修正：
  - 工具管理启用状态改为真实落盘到 `config/tool-management.json`
  - 插件工具源改为读取已缓存的真实健康快照；未检查前不再伪造检查结果
  - 插件健康快照在失败时会保留上一次成功时间，而不是把失败时刻写成成功
- 前端同步收口：
  - 工具管理页补齐 `refresh-metadata` 动作文案
  - 工具管理页不再把缺省动作伪装成 `health-check`
  - 自动化页 cron 提示已和后端真实能力对齐
  - AI 模型能力文案改成“能力标记”，避免把展示字段说成运行时强约束

## 2026-04-29 cron 会话语义现状
- 自动化 `ai_message` 当前必须提供 `target.conversationId`
- cron 触发时只会把消息直接写进那个既有会话，不会创建新会话
- 插件 cron 当前只有 `source: 'cron' + cronJobId` 的 hook 上下文，默认没有 `conversationId`
- 当前仓库里真正具备“自动创建子会话”语义的是 subagent：
  - 会创建 `parentId = 当前会话` 的子会话
  - 可以把执行过程和最终结果写进子会话
- 因此如果要向 OpenClaw 靠拢，最自然的第一步是只改自动化 `ai_message` 的 cron 路径，而不是先扩插件 cron

## 2026-04-29 运行时输入队列现状
- 原先待发送队列是 `chat-store.module.ts` 里的单个全局数组：
  - 可以支持“流式回复时继续排队发送”
  - 但前端不展示当前队列内容
  - 也没有按会话隔离的取回能力
- 原先聊天输入草稿在 `chat-view.module.ts` 里是单个 `ref('')`
  - 切不同会话窗口时，草稿文本是共享的
  - 因此如果直接做“取回队尾消息”，不同窗口之间会很容易串内容
- 当前修正方向是：
  - 队列按 `conversationId` 分组
  - `queuedSendCount / preview / pop` 都只针对当前会话
  - 输入草稿也按当前会话隔离

## 2026-04-30 子代理聊天窗口显示
- 聊天页顶部子代理标签的数据源是 `/api/chat/conversations/:id/subagents`
- 当前实现只在 `currentConversationId` 变化时拉取一次，因此后台子代理新建或完成后不会自动出现在顶部标签，除非手动刷新页面
- 左侧主会话栏直接渲染 `chat.conversations`，而后端会把 `parentId` 子会话也放进普通会话列表，所以子代理子会话会在左栏暴露
- 后端删除主会话时尚未同步清理：
  - 该主会话下面的子会话
  - 指向这些会话的 subagent session / subagent record

## 2026-04-30 lint 性能
- 当前 ESLint 规则集没有启用任何需要类型信息的 rule，但 `eslint.config.mjs` 仍配置了 `parserOptions.project`
- 这会让 `lint` 额外构建 TypeScript Program，成本接近再跑一轮轻量 `typecheck`
- 根目录 `lint` 此前也没有开启缓存，因此每次执行都按全量冷启动处理
- 更合适的分工是：
  - `lint` 只做语法级 / 风格级检查，并启用内容缓存
  - `typecheck` 负责类型正确性

## 2026-04-30 subagent 相比 opencode 的剩余结构问题
- 当前实现虽然已经把子代理结果写进子对话，但 owner 仍然是“双轨”：
  - 普通对话走 `Conversation`
  - 子代理过程与状态还额外挂在 `subagent session store + subagent store`
- 这会带来额外同步成本：
  - 前端顶部标签需要单独请求 `/chat/conversations/:id/subagents`
  - `/subagents/overview` 仍是独立账本视图
  - 删除主会话时需要额外清理 `subagent session/store`
- 相比之下，`opencode` 的 task 更接近“子任务就是普通 session”：
  - 生命周期、消息流、查看入口、恢复语义都统一在同一套 session/message owner 下
- 因此 Garlic Claw 当前的主要问题不是“不能显示”，而是：
  - `subagent` 仍不是彻底的一等 conversation owner
  - 还有一层独立持久化与查询模型在旁边并行存在

## 2026-04-30 子代理 runtime 全量迁移后的结构结论
- 现在的子代理结构已经切到“一等 agent runtime”：
  - 子代理本体就是 `Conversation` 及其元数据
  - `RuntimeHostSubagentRunnerService` 只保留运行期内存控制，不再做持久化主账本
  - 前端标签、详情、聚合页都直接读 conversation 与 subagent metadata
- 新契约相对旧设计的关键改动：
  - host 语义从“单个特殊工具返回值”改为一组 runtime 操作：`spawn / wait / send-input / interrupt / close / list / get`
  - tool 语义同步改成 `spawn_subagent / wait_subagent / send_input_subagent / interrupt_subagent / close_subagent`
  - SDK facade 也按同一组 runtime 动作暴露，不再混杂旧名字
- smoke 需要跟着 runtime 语义一起改：
  - server smoke 不能再假设 `subagent_background` 一步完成，必须显式验证 `spawn_subagent -> wait_subagent`
  - `/compact` 相关测试要允许 assistant message 同时包含 `spawn_subagent / wait_subagent` 的 toolCalls 与 toolResults
- 浏览器 smoke 有一处 UI 现实约束：
  - 新会话创建成功后，前端列表并不会保证本地立即插入到当前视图
  - 更稳定的做法是先等待后端创建成功，再 `reload` 页面，并按 `.conversation-item[data-id]` 重新选中真实会话
- 子代理 `messageCount` 更适合统一按 conversation 真实消息数计算
  - 不再维持旧 store 的独立计数语义
  - 这样等待、继续输入、写回结果三条链路都不会再出现双份统计口径

## 2026-04-30 子代理命名与工具时间线显示
- 子代理“名字”最合适的 owner 仍然是 conversation 自己：
  - runtime 层新增 `name` 参数
  - 持久化时直接写进子会话标题与 `subagent` metadata
  - 这样聊天顶部标签和 `/subagents` 聚合页都不需要额外引入第二套展示字段
- `description` 和 `name` 应分开：
  - `name` 解决“标签页/窗口里怎么称呼它”
  - `description` 继续承担“这轮任务在做什么”的摘要作用
- 前端工具事件如果只存字符串，后面几乎所有体验优化都会卡住：
  - 不能按 `toolCallId` 对齐调用和结果
  - 不能做 JSON 类型判断
  - 也没法给 summary/detail 两层展示提供不同粒度
- 更合适的前端消息结构是：
  - `toolCallId`
  - 原始 `JsonValue`
  - 一条短 preview
  - 具体展开时再做格式化详情
- 子代理会话自己的 SSE 收尾原先只补正文和状态，不补工具事件
  - 这会让普通聊天链路和子代理链路的前端体验分叉
  - 当前已改为在 `waitSubagent` 收尾时把持久化好的 `tool-call / tool-result` 一并补发

## 2026-04-30 浏览器 smoke 子代理补充发现
- `SubagentToolService` 一开始只把 `prompt / description / subagentType / writeBack` 传给 builder：
  - `name` 在工具入口被截断，所以 runtime 虽然支持命名，浏览器 smoke 仍会看到旧标题
  - `providerId / modelId` 也没有从工具 schema 暴露出来，导致子代理默认回落到当前系统默认 provider
- `plugin-sdk` 的 `buildSubagentSpawnParams / buildSubagentSendInputParams` 之前只支持从 config 读取默认 provider/model：
  - 如果工具调用层想临时钉到某个 fake provider/model，没有入口可用
  - 这会让浏览器 smoke 的子代理链路失去确定性，跑到真实 provider 时既慢又不稳定
- `/subagents` 前端路由当前已经重定向到聊天页：
  - 真实的子代理前端可见入口已经转到聊天页顶部 `main / 命名子代理` 标签
  - 因此浏览器 smoke 更合适的做法是：
    - 在聊天页验证子代理标签、工具时间线、回写与切换
    - 用 `/subagents/overview` API 验证 conversation 聚合结果

## 2026-04-30 `/compact` 显示延迟与历史压缩偶发报错
- 前端“先显示普通用户/LLM，结束后才变命令/结果”的关键原因不是组件不支持 `display`
  - `ChatMessageList.vue` 已经会按 `display-message` annotation 渲染“命令 / 展示 / 摘要”
  - 真正拖后的是 `chat-stream.module.ts` 的批量提交通道：`message-start` 被和普通流式事件一起延后，短命令会在 `finally` 刷新时才把真实角色替换进去
- 因此这类问题更适合按“命令系统 + SSE 结构事件”统一处理：
  - 发送前由命令目录判断是否是已知 slash command
  - `message-start` 作为结构事件即时提交
  - 不给 `/compact` 写单独前端特判
- 后端 `history.messages[3] must be an object` 并不一定表示数组里真的混入了字符串
  - `RuntimeHostConversationRecordService.readConversationHistoryObject` 旧实现复用了递归 `readJsonObject`
  - 只要对象内部任何一层存在 `undefined`，整个对象都会被判成“不是合法 JsonObject”
  - 所以错误文本表面看像“第 3 条消息不是对象”，实际可能只是某个可选字段没有先被归一化
- 更合理的 owner 行为是：
  - history replace 先接受“普通 JS 对象”
  - 再按宿主契约逐字段读取和归一化
  - 对注解 data / custom block data / source 这类嵌套 JSON，自动剔除 `undefined`
  - 不让脆弱的递归整对象校验把一条结构正常的消息整条打掉

## 2026-04-30 内部命令多命令时序
- “切换窗口显示请求已取消”本质上是前端观察流被本地 abort：
  - 后端任务仍在继续
  - HTTP/错误层会把它统一包成 `BusinessError(code: 'ABORTED')`
  - 因此前端不能只认原生 `AbortError.name`
- 内部命令的真正 owner 问题不在渲染层，而在生命周期边界：
  - 旧链路在 `applyMessageReceived()` 里直接执行内部命令副作用
  - `startMessageGeneration()` 之后才创建命令展示消息和结果消息
  - 结果就是“摘要先写历史，命令后出现”，多条命令时更明显
- 上下文压缩摘要的“可见顺序”和“逻辑顺序”需要分开：
  - 用户界面更适合把摘要当作命令执行后的后置产物，放在结果消息之后
  - 但后端做上下文治理时，摘要仍要按 covered message 的逻辑位置参与模型上下文
- 因此当前实现改成两层顺序：
  - 物理消息顺序：命令 -> 结果 -> 摘要
  - 逻辑上下文顺序：按 covered/summary 关系重新投影，不依赖物理数组位置
- 多命令下不能把 `display command/result` 当成真实上下文：
  - 否则后续 `/compact` 会把上一条命令文本和结果文案一起吸进摘要源
  - 当前已改成只让真实上下文消息和 compaction summary 参与压缩候选

## 2026-04-30 子代理回写与控制面返回
- 当前仓库里最烧 token 的不是子代理执行本身，而是两层结构污染：
  - 子代理结束后自动回写一条主对话 assistant 消息
  - `spawn / wait / send_input / interrupt / close` 的工具结果本身又塞了大块状态快照
- 真正的 agent runtime 语义应该拆开：
  - 控制面返回轻量句柄
  - 最终结果只在 `wait` 暴露
  - 主对话是否吸收子代理结果，应由父代理显式决定，而不是 runtime 偷偷写回
- 因此这轮直接删除 `writeBack`，而不是改默认值或在前端遮住：
  - 只关默认值会留下旧语义暗门
  - 只改前端会继续污染 LLM 上下文

## 2026-04-30 上游 merge 与 AGENTS 拆分
- 当前分叉点是 `713793d`
- 上游本轮需要吸收的文档相关提交里，`debd729` 是单独的 `AGENTS.md` 拆分提交：
  - 把前后端规范、测试规范、WSL/进程管理从 `AGENTS.md` 挪到 `docs/开发规范.md` 与 `docs/跨平台开发说明.md`
  - 这不是功能改动，只是文档 owner 迁移
- 真实 merge 冲突并不在 `AGENTS.md`，而在两个前端文件：
  - `packages/web/src/features/admin/layouts/AdminConsoleLayout.vue`
  - `packages/web/src/features/chat/views/ChatView.vue`
- 因此更安全的处理不是跳过上游 merge，而是：
  - 正常合并 `upstream/main`
  - 保留上游真实功能改动
  - 单独把 `AGENTS.md` 拆分结果回退到本地单文件 owner
- merge 后新鲜验证里唯一失败点是 `packages/web/tsconfig.json`
  - 上游把 `ignoreDeprecations` 改成了 `"6.0"`
  - 但当前仓库锁定的 `typescript` 实际版本是 `5.9.3`
  - 因此 `vue-tsc` 会直接报 `TS5103: Invalid value for '--ignoreDeprecations'`
  - 将该值恢复到当前仓库可接受的 `"5.0"` 后，typecheck 与两条 smoke 都通过
- GitHub 侧当前不是技术性不可合并，而是策略性不可直接 merge：
  - PR `#41` 的 `mergeable` 状态是 `MERGEABLE`
  - 但 `reviewDecision` 是 `REVIEW_REQUIRED`
  - 当前账号对上游仓库权限是 `write`，不是 `admin`
  - 不能自审自己的 PR
  - 仓库也未启用 auto-merge，因此 `gh pr merge --auto` 直接失败
- 结论：这轮已经把代码和 PR 状态推进到“只差他人 review”这一外部步骤，剩余阻塞不在仓库内容本身

## 2026-04-30 聊天上下文占用与响应 token 明细
- 顶部上下文占用的现成 owner 已存在：
  - `ChatView` 已经能从 `useChatView()` 直接拿到 `contextWindowPreview`
  - 其中 `estimatedTokens / maxWindowTokens` 已足够计算百分比，无需新接口
- 每条 assistant 回复的 token 明细也已有现成 owner：
  - 服务端会把本次模型用量写进 `conversation.model-usage` 注解
  - 前端消息结构里已经保留 `metadata.annotations`
  - 因此前端只需要按当前消息的 `provider/model` 读取匹配注解
- 缓存 token 最合适的共享字段是 `cachedInputTokens`
  - AI SDK 已经提供该字段
  - 当前仓库原先只缺 shared/server 透传，不缺概念模型
- `packages/web` 的类型检查对共享包字段新增较敏感：
  - 即使 `packages/shared` 源码已更新，`web` 侧本地视图类型仍应把可选字段显式写明
  - 这样不会依赖共享构建产物刷新顺序
