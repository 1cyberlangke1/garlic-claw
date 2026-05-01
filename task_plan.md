# Task Plan

## 2026-05-01 上下文 preview 与自动压缩 token 口径对齐

### 目标
- [ ] 顶部上下文 preview 与后端自动压缩阈值判断使用同一份 token 口径
- [ ] 有真实 provider usage 时优先复用真实 `inputTokens`
- [ ] 仅当当前历史快照与该次真实请求对应快照一致时才复用 usage
- [ ] 历史已变化时回退到当前历史估算，不能继续吃旧 usage
- [ ] 补回归测试并完成最小必要验证

### 阶段 A：取证
- [x] 确认当前 preview 与压缩判断共同依赖 `readConversationHistoryPreviewTokens(...)`
- [x] 确认当前实现会无条件复用最近一条匹配 provider/model 的 `conversation.model-usage`
- [x] 对照 `other/opencode`，确认它把真实 tokens 绑定在具体已完成 turn 上，压缩判断不会把旧 turn usage 冒充成当前历史

### 阶段 B：实现
- [x] 为 usage 注解增加历史快照签名
- [x] 在真实送模链路写入该签名
- [x] preview / 压缩判断只在签名匹配时复用真实 usage

### 阶段 C：验证
- [x] 补 record / planning / governance 回归测试
- [x] 跑相关后端测试与 typecheck
- [x] 视改动范围决定是否补 smoke
- [x] 通过独立 judge 复核

## 2026-05-01 回复完成后立即检查上下文压缩

### 目标
- [x] assistant 回复完成落库后，立刻再做一次自动压缩检查
- [x] 继续复用现有 summary 自动压缩阈值与改写逻辑，不额外引入第二套规则
- [x] 与 `other/opencode` 的失败语义对齐：压缩不了就停下，不带超限上下文继续送模
- [x] 不影响 `/compact` 手动压缩与“送模前自动压缩”的既有行为
- [x] 补后端回归测试

### 阶段 A：链路确认
- [x] 确认顶部 `100% / 14478 / 10000` 只是 preview 展示，不是压缩触发点
- [x] 确认现有自动压缩只在 `rewriteHistoryBeforeModel()` 的送模前触发
- [x] 确认主对话阻塞时新输入会进入前端待发送队列

### 阶段 B：实现
- [x] 补“回复完成后立即检查压缩”的失败测试
- [x] 在回复完成链路加入压缩检查
- [x] 把压缩失败从“抛穿主链路”改成“记录失败并停止后续继续生成”
- [x] 核对 `allowAutoContinue` 等既有语义不被新时机污染

### 阶段 C：验证
- [x] 运行相关后端测试
- [x] 运行完整 smoke 验收
- [x] 通过独立 judge 复核
- [x] 更新 `progress.md / findings.md`

## 2026-05-01 开发态后端启动过慢与端口超时

### 目标
- [x] `python tools\一键启停脚本.py --log` 在存在 MCP 配置时不再被 MCP 初始化阻塞到端口超时
- [x] 保留 MCP 配置加载、治理动作与工具发现语义，不靠删除用户配置规避
- [x] 补后端测试与实际启动复验

### 阶段 A：根因确认
- [x] 读取 `TODO.md`、`task_plan.md`、`progress.md`、`findings.md`
- [x] 核对启动日志、`tools/scripts/dev_runtime.py`、`bootstrap-http-app.ts`、`mcp.service.ts`
- [x] 对照实测“默认 MCP 配置 vs 空 MCP 配置”的端口就绪耗时

### 阶段 B：实现
- [x] 把 MCP 启动期初始化改成不阻塞 HTTP 监听
- [x] 保留运行时状态与治理动作的可用性，避免引入假成功
- [x] 补测试覆盖启动期异步预热行为

### 阶段 C：验证
- [x] 运行相关后端测试
- [x] 实测一次开发态启动，确认端口就绪时间下降且不再超时

## 2026-04-28 全部旧任务 ✅ 完成

## 2026-04-29 已完成的修复

### 子代理对齐 opencode
- [x] 聊天页标签栏 + 详情查看 ✅
- [x] `cancel_subagent` + `resume_subagent`(sessionId) ✅
- [x] `<subagent_result>` 标签包裹 ✅
- [x] 移除独立子代理页面 ✅
- [x] 工具描述对齐 ✅
- [x] 子代理创建子对话（Conversation + parentId） ✅
- [x] 子代理标签页改为对话切换 ✅
- [x] 子代理结果写入子对话 ✅
- [x] ChatComposer 对所有标签页开放 ✅
- [x] 子代理执行中实时消息流写入子对话 ✅

### 假实现修复
- [x] `probePluginHealth` 无探针时报错 ✅
- [x] `checkPluginHealth` 远程走 WebSocket ping ✅
- [x] `buildPluginInfo` 去假 health ✅
- [x] `createPluginHealthSnapshot` failureCount 累计 ✅
- [x] `ToolInfo.health` 改可选 ✅
- [x] `formatTime` 签名统一 ✅
- [x] `healthText` 共享函数 ✅

### 数据库 — 完全移除
- [x] Prisma schema / prisma-client 删除 ✅
- [x] Plugin / Subagent / Conversation / Memories DB 同步全删 ✅
- [x] BootstrapUserService 简化为日志 ✅
- [x] 全编译 0 错误 ✅

### 假 admin 概念
- [x] `BootstrapAdminService` → `BootstrapUserService` ✅
- [x] User.role 删除 ✅

### 工具对齐
- [x] 工具列表对比 + cancel_subagent + resume ✅

### 前端
- [x] GPT 中文全量修正 ✅
- [x] AI 设置页侧边栏分组 ✅
- [x] 文档重写 ✅

### 2026-04-29 进行中
- [x] 对话页 TODO 栏显示收口：
  - [x] 当前会话没有 TODO 时不显示待办栏
  - [x] 补聊天页回归测试
  - [x] 补验证
- [ ] 子代理聊天窗口收口：
  - [x] 顶部 `main / 子代理` 标签自动刷新，不依赖手动刷新页面
  - [x] 左侧主会话列表不再展示 `parentId` 子会话
  - [x] 前端删除主会话时，后端同步递归删除子会话与关联子代理记录
  - [x] 补前后端回归测试与验证
- [ ] 运行时输入队列前端可见化：
  - [x] 排查当前消息队列 owner 与输入框状态边界
  - [x] 将待发送队列改为按会话隔离
  - [x] 前端展示当前会话的轻量队列预览
  - [x] 支持 `Alt+↑` 按当前会话 `pop` 队尾并回填输入框
  - [x] 补聊天 store / composer / view 回归测试
  - [x] 补完整验证
- [ ] 自动化 cron 会话行为对齐 OpenClaw：
  - [ ] 明确只改自动化 `ai_message` 还是同时覆盖插件 cron
  - [ ] 设计独立 cron 会话创建与历史裁剪语义
  - [ ] 补后端类型、持久化与执行链路
  - [ ] 补前端创建表单与展示文案
  - [ ] 补单测与冒烟验证
- [ ] 修复跨窗口手动 `/compress` 失败：
  - [x] 排查上下文窗口切换后的会话选择与子会话映射
  - [x] 补回归测试覆盖子窗口切换与上下文压缩手动触发
  - [x] 修正子会话对话 ID / 选择链路，避免错误会话上下文混入
  - [ ] 补齐浏览器冒烟通过证据
- [ ] 统一工具管理入口：
  - [ ] 将 `/tools` 从重定向改成真实“工具管理”页面
  - [ ] 集中展示执行工具、子代理、MCP、插件四类工具源
  - [ ] 删除 AI 设置、MCP、插件页面里的直接启用/禁用面板
  - [ ] 补齐页面单测与浏览器冒烟，确保工具启用/禁用只走统一页面
- [x] 插件运行时能力改成真实实现：
  - [x] `storage/state` 从进程内 `Map` 改成真实落盘存储
  - [x] `conversation session` 从进程内等待态改成可恢复的持久化记录
  - [x] `cron.register/list/delete` 从登记簿改成真实调度器
  - [x] 补齐后端单测、HTTP/浏览器冒烟，确认重启后仍有效
- [x] 继续扫描并修复剩余假实现：
  - [x] `McpService.health-check` 从读缓存状态改成真实 probe
  - [x] `AutomationService` 从仅支持简写间隔改成支持标准 cron 表达式
  - [x] 补齐后端单测与 server/web 冒烟验证
- [x] 继续扫描并修复工具管理与插件健康残留假实现：
  - [x] 工具启用/禁用从进程内 `Map` 改成真实持久化配置
  - [x] `/tools/overview` 的插件工具源接入真实健康快照，不再伪造 `healthy`
  - [x] 插件健康快照修正 `lastSuccessAt`，失败时不再冒充最近成功
  - [x] 工具管理页补 `refresh-metadata` 动作文案，并移除默认伪 `health-check`
  - [x] 自动化页 cron 文案同步为“标准 cron + 简写兼容”
  - [x] AI 模型能力文案收窄为“能力标记”，不再冒充运行时硬开关
  - [x] 补齐完整验证并提交 push

## 2026-04-30 子代理 runtime 全量迁移 ✅ 完成

> 状态说明：实现、完整验收与独立 judge 复核均已通过。

### 目标
- [x] 把当前 `subagent` 从“聊天工具特殊返回值 + 独立账本”迁到“真正的一等 agent runtime”
- [x] `Conversation` 成为子代理唯一持久化 owner，不再保留独立 `subagent store/session store` 兼容层
- [x] 对外能力统一为：
  - [x] `spawn`
  - [x] `wait`
  - [x] `send_input`
  - [x] `interrupt`
  - [x] `close`

### 阶段 A：Conversation 持久化结构重构
- [x] 在 `packages/shared/src/types/chat.ts` 增加会话级 subagent 元数据结构
- [x] 在 `RuntimeHostConversationRecordService` 中并入 subagent 元数据读写、子会话聚合与删除清理
- [x] 删除旧 `subagent session/store` 对 conversation 状态的主 owner 职责
- [x] 补持久化与删除链路单测

### 阶段 B：Server runtime / host / tool API 重写
- [x] 重写 `RuntimeHostSubagentRunnerService`，只保留活动 runtime 控制、等待器、终止器、输入队列等内存态
- [x] 删除 `RuntimeHostSubagentStoreService`
- [x] 删除 `RuntimeHostSubagentSessionStoreService`
- [x] 把 host API 改为：
  - [x] `subagent.spawn`
  - [x] `subagent.wait`
  - [x] `subagent.send-input`
  - [x] `subagent.interrupt`
  - [x] `subagent.close`
  - [x] `subagent.list`
  - [x] `subagent.get`
- [x] 把工具 API 改为：
  - [x] `spawn_subagent`
  - [x] `wait_subagent`
  - [x] `send_input_subagent`
  - [x] `interrupt_subagent`
  - [x] `close_subagent`
- [x] 删除旧 `subagent` / `subagent_background` / `cancel_subagent` 兼容入口
- [x] 补 host/tool/runtime 单测

### 阶段 C：聊天发送链路与前端会话行为改造
- [x] 子代理子会话发送消息时改走 `send_input_subagent`，不再走普通聊天生成链路
- [x] 聊天页顶部标签、详情状态、待办显示都直接依赖 conversation + subagent metadata
- [x] `/subagents` 页面改成 conversation 聚合视图，不再依赖独立账本
- [x] 前端补会话切换、状态刷新、输入交互回归测试

### 阶段 D：SDK、冒烟与收尾
- [x] `plugin-sdk` facade、payload、类型与测试全部切到新 runtime 契约
- [x] `http-smoke.mjs`、浏览器 smoke、相关 fixture 全量迁移
- [x] 运行完整验证：
  - [x] `npm run typecheck -w packages/server`
  - [x] `npm run typecheck -w packages/web`
  - [x] `npm run lint`
  - [x] `npm run smoke:server`
  - [x] `npm run smoke:web-ui`

### 删除要求
- [x] 不保留旧工具名
- [x] 不保留旧 host method 名
- [x] 不保留 `subagent` 独立持久化主账本
- [x] 不保留“子代理 tab 依赖额外 owner 才能显示状态”的旧结构

## 2026-04-30 子代理命名 + 消息工具渲染收口 ✅ 完成

### 目标
- [x] 子代理支持显式命名，并在聊天顶部标签与 `/subagents` 聚合视图展示该名称
- [x] assistant 消息里的工具调用 / 工具结果显示改为更清晰的时序块，默认折叠
- [x] JSON 输入输出改为结构化预览 + 展开详情，而不是直接塞原始字符串

### 阶段 A：子代理命名契约
- [x] 在 shared / plugin-sdk / server runtime 契约中新增子代理 `name`
- [x] `spawn_subagent` / `send_input_subagent` 支持写入或更新名称
- [x] 聊天顶部标签与 `/subagents` 窗口标签优先展示显式名称

### 阶段 B：工具调用与结果展示
- [x] 前端保留工具调用 ID 与原始 JSON 值，不再只存字符串
- [x] assistant 消息把工具调用 / 结果渲染为统一时序列表
- [x] 默认折叠工具块，并提供简洁摘要
- [x] 回复正文放在工具块之后

### 阶段 C：JSON 视图与验证
- [x] JSON 输入输出改为格式化预览与展开详情
- [x] 补 `ChatMessageList` / `ChatView` / `use-subagents` 回归测试
- [x] 跑前端相关验证

### 阶段 D：浏览器 smoke 子代理覆盖补完
- [x] 浏览器 smoke 真正触发 `spawn_subagent -> wait_subagent`
- [x] 覆盖子代理命名标签、工具时间线、子会话切换与 overview 聚合断言
- [x] 浏览器 smoke 子代理链路固定走 fake provider/model，避免落到真实默认 provider

## 2026-04-30 内部命令生命周期与多命令时序修复

### 目标
- [x] 窗口切换导致的本地 abort 不再误写成消息失败
- [x] 内部命令改成“先识别、后执行”，不在展示消息落库前提前执行副作用
- [x] `/compact` 摘要消息改为命令结果之后展示
- [x] 多条命令连续执行时，旧命令展示消息不被后续压缩吞掉
- [ ] 补完整验证与提交

### 阶段 A：前端取消语义
- [x] 统一识别 `ABORTED` 业务错误
- [x] `dispatchSendMessage / dispatchRetryMessage` 对本地 abort 静默处理
- [x] 补前端回归测试

### 阶段 B：后端命令时序
- [x] `ContextGovernanceService` 改成返回延迟执行的内部命令
- [x] `ConversationMessageLifecycleService` 负责在展示消息创建后执行内部命令
- [x] 上下文压缩摘要物理顺序改到命令结果之后

### 阶段 C：后端逻辑顺序与多命令
- [x] 上下文治理逻辑顺序改按 covered/summary 投影计算，不依赖物理消息位置
- [x] 压缩候选改只看真实上下文消息，不把 `display command/result` 纳入摘要源
- [x] 补命令时序、多命令、上下文治理单测
- [x] 补完整验证与提交前冒烟

## 2026-04-30 子代理回写删除 + 控制面瘦身

### 目标
- [x] 完全删除 `writeBack -> 主对话 assistant 消息` 旧链路，不保留兼容入口
- [x] 子代理工具返回对齐真正 agent runtime：
  - [x] `spawn / send_input / interrupt / close` 只返回轻量句柄
  - [x] `wait` 只返回必要结果文本或错误
- [x] 前端子代理页移除“回写状态”相关展示

### 阶段 A：共享契约与 SDK
- [x] 删除 shared / plugin-sdk 里的 `writeBack` 契约与工具参数
- [x] 新增轻量 `PluginSubagentHandle / PluginSubagentWaitResult`
- [x] 核对 host facade 与 authoring 侧返回类型不再暴露大对象

### 阶段 B：server runtime
- [x] 删除 `RuntimeHostSubagentRunnerService` 的自动回写主对话逻辑
- [x] 删除子代理持久化元数据里的回写字段
- [x] 核对 tool / host 返回只剩轻量控制面信息

### 阶段 C：前端展示
- [x] 移除 `/subagents` 页面里的回写状态、回写失败、回写目标展示
- [x] 核对筛选、统计与详情文案不再依赖回写概念

## 2026-04-30 上游合并对齐 + 保留单文件 AGENTS

### 目标
- [x] 合并 `upstream/main` 的非冲突功能改动
- [x] 保留当前单文件 `AGENTS.md`，不采纳上游拆分 owner
- [x] 把 merge 冲突收敛为语义合并，不回退本地已确认交互
- [x] 完成新鲜验证与独立复核后提交

### 阶段 A：分叉与冲突面分析
- [x] 拉取 `upstream/main` 并确认分叉提交
- [x] 识别 `debd729` 为 `AGENTS.md` 拆分来源
- [x] 确认真实冲突文件只有 `AdminConsoleLayout.vue` 与 `ChatView.vue`

### 阶段 B：合并与回退拆分
- [x] 合并 `upstream/main`
- [x] `AdminConsoleLayout.vue` 保留上游主题切换，同时维持移除“当前模式”说明
- [x] `ChatView.vue` 保留本地已确认的模型摘要 / AI 设置入口，不重新引入模型下拉
- [x] `AGENTS.md`、`docs/README.md` 与新增拆分文档回退到“未拆分”状态

### 阶段 C：验证与提交
- [x] 修正上游 `packages/web/tsconfig.json` 与当前 TS 版本不兼容的 `ignoreDeprecations`
- [x] `npm run lint`
- [x] `npm run typecheck -w packages/web`
- [x] `npm run smoke:server`
- [x] `npm run smoke:web-ui`
- [x] 独立 judge 复核
- [x] 提交 merge
- [x] 推送 `origin/main`
- [x] 创建 PR：`sakurakugu/garlic-claw#41`
- [ ] 等待他人 review 后由仓库策略完成 merge

## 2026-04-30 聊天上下文占用与响应 token 明细

### 目标
- [x] 聊天页顶部在模型名字同一行展示当前上下文占用百分比
- [x] 上下文占用展示包含渐变进度条与估算 token 数
- [x] 每条 assistant 回复右侧增加 `[i]` 按钮查看本次输入/输出 token
- [x] 仅在上游真实返回时展示缓存 token，不新增额外接口
- [x] 补前端回归测试与最小后端用量透传测试

### 阶段 A：现有链路确认
- [x] 确认顶部上下文数据直接复用 `contextWindowPreview`
- [x] 确认消息用量直接复用 `conversation.model-usage` 注解
- [x] 确认 AI SDK 用量字段采用 `cachedInputTokens`

### 阶段 B：共享与后端透传
- [x] `AiModelUsage` 增加可选 `cachedInputTokens`
- [x] `AiModelExecutionService.readProviderUsage()` 透传缓存 token
- [x] `conversation-model-usage` 注解校验接受可选缓存 token

### 阶段 C：前端展示
- [x] `ChatView.vue` 增加上下文占用百分比与渐变进度条
- [x] `ChatMessageList.vue` 为 assistant 消息增加 `[i]` 用量详情
- [x] 无缓存 token 时不显示对应行

### 阶段 D：验证
- [x] `packages/web` 指定回归测试
- [x] `packages/server` 用量透传测试
- [x] `packages/shared / server / web` typecheck

## 2026-04-30 上下文预算、自动压缩与 AI 设置即时生效

### 目标
- [ ] 消息 usage 改为优先消费 AI SDK 统一字段，不再额外解析 provider 私有 shape
- [ ] assistant `[i]` 用量按钮显示放宽到按注解 owner 读取，不再过度依赖消息本体 provider/model
- [ ] 聊天页上下文占用显示与真实模型 `contextLength` 保持一致，不再出现 `14478 / 256` 这类旧值
- [ ] 模型 `contextLength`、上下文治理配置修改后，聊天页与自动压缩判断立即使用新配置
- [ ] AI 设置页相关配置改为无需手动点保存，移除多余保存入口

### 阶段 A：计划与链路核对
- [x] 读取 `TODO.md`、现有 `task_plan.md / progress.md / findings.md`
- [x] 核对 `AiModelExecutionService / ConversationTaskService / ChatMessageList / ChatView / useProviderSettings / chat-store / ContextGovernanceService`
- [x] 记录本轮验证范围

### 阶段 B：usage 与消息用量展示
- [x] 删除或瘦身 `AiModelExecutionService` 里重复的 provider usage 解析
- [x] `ConversationTaskService` 只要有合法 usage 就写入 `conversation.model-usage`
- [x] `ChatMessageList` 从消息注解读取 usage，允许注解自身提供 provider/model 作为匹配锚点

### 阶段 C：上下文预算与自动压缩
- [x] 修正聊天页上下文预算显示，避免旧模型 `contextLength` 残留
- [x] 让 AI 设置变化事件覆盖模型上下文长度与上下文治理配置
- [x] 让 `chat-store` 在相关配置变化后主动刷新当前会话 preview
- [x] 核对 `ContextGovernanceService` 自动压缩阈值使用的是最新模型配置

### 阶段 D：AI 设置交互
- [x] 模型上下文长度改为输入后自动提交或失焦提交，不再要求单独保存按钮
- [x] AI 设置相关 `SchemaConfigForm` 改为自动提交，移除保存按钮
- [x] 同步收口相关文案，避免页面继续暗示需要手动保存

### 阶段 E：验证
- [x] 补或更新相关单测
- [x] 跑类型检查与需要的回归验证

## 2026-04-30 上下文长度显示语义与上下文设置文案修正 ✅ 完成

> 状态说明：实现、新鲜验收与独立 judge 复核均已通过。

### 目标
- [x] 聊天页顶部上下文占用改为按模型总 `contextLength` 显示，不再直接暴露内部 `reservedTokens` 预算
- [x] 完全删除 `contextCompaction.mode/manual` 旧模式，自动压缩语义只保留“启用后自动运行 + `/compact` 显式触发”
- [x] 核对“超上下文时自动压缩”的真实产品语义，不再拿 `mode: manual` 当成前端显示问题的替代解释
- [x] 清理上下文设置页的残留旧文案与中英混写
- [x] 补齐前端未展示的后端上下文治理字段
- [x] 补验证

### 阶段 A：根因确认
- [x] 确认顶部显示当前取的是 `maxWindowTokens` 而不是模型总窗口
- [x] 确认当前 `config/context-governance.json` 与前端上下文设置页展示是否一致
- [x] 定位“是否启用上下文压缩插件 / summary / sliding”文案来源
- [x] 确认 `mode` 条件会影响 `allowAutoContinue` 等字段显示

### 阶段 B：实现
- [x] 修正上下文预览字段语义，前端改按模型总 `contextLength` 显示百分比与分母
- [x] 删除 `mode/manual` 契约、schema、清洗与默认配置残留
- [x] 清理上下文设置页文案，统一中文
- [x] 补齐上下文设置页缺失字段展示
- [x] 根据最终语义修正自动压缩触发判断或提示

### 阶段 C：验证
- [x] 补相关单测
- [x] 跑回归验证
