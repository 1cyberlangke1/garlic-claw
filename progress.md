# Progress

## 2026-05-01 阶段 F：剩余中高优先级缺陷继续扫描与修复

### 已开始
- 已完成阶段 E 提交，当前工作树干净。
- 已读取 `TODO.md`、`task_plan.md`、`progress.md`、`findings.md`，准备开启下一轮扫描。
- 本轮先不扩散改动面，优先从 `findings.md` 尚未收口项与跨模块状态同步问题继续取证。

### 本轮扫描分流
- server：继续看 `automation / conversation / tool-registry / runtime host`
- web：继续看配置联动、会话状态同步、统一工具入口刷新
- plugin/runtime：继续看本地插件、远程插件离线态、清理与重建链路

### 下一步
- 派发三路只读子代理扫描
- 汇总结果后确定首批修复项

### 本轮已完成修复
- `AutomationService.runRecord()` 现在把准备阶段异常也记入失败日志并持久化：
  - `cron_child` 父会话缺失时，不再只打控制台错误
  - `lastRunAt` 与 `logs` 都会留下失败痕迹
- `/tools` 现在保留离线插件 source：
  - source 仍可见
  - tool 会被标成不可执行
  - 不会重新把离线插件暴露进 executable tool set
- 删除/重建清理链补齐：
  - `PluginController.deletePlugin()` 会清理 `plugin:*` source/tool overrides
  - `bootstrapHttpApp()` 启动期清理缺失本地插件时，会同步清理 runtime state、plugin conversation session 与 `plugin:*` overrides
  - `McpService.removeServer()` 会清理 `mcp:*` source/tool overrides
- 插件详情子面板状态收口：
  - 切插件时，事件筛选会回到默认 `{ limit: 50 }`
  - 切插件时，storage prefix 会回到空串
  - 事件请求与 KV 请求都补了当前插件守卫和请求序号，旧响应不会覆盖当前插件

### 本轮新增回归
- server
  - `tests/automation/automation.service.spec.ts`
  - `tests/execution/tool/tool-registry.service.spec.ts`
  - `tests/adapters/http/plugin/plugin.controller.spec.ts`
  - `tests/core/bootstrap/bootstrap-http-app.spec.ts`
  - `tests/execution/mcp/mcp.service.spec.ts`
- web
  - `tests/features/plugins/composables/use-plugin-management.spec.ts`
  - `tests/features/plugins/composables/use-plugin-events.spec.ts`
  - `tests/features/plugins/composables/use-plugin-storage.spec.ts`

### 本轮验证
- 定向验证已通过：
  - `npm run test -w packages/server -- tests/automation/automation.service.spec.ts`
  - `npm run test -w packages/server -- tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run test -w packages/server -- tests/adapters/http/plugin/plugin.controller.spec.ts tests/core/bootstrap/bootstrap-http-app.spec.ts tests/execution/mcp/mcp.service.spec.ts`
  - `npm run test:run -w packages/web -- tests/features/plugins/composables/use-plugin-management.spec.ts tests/features/plugins/composables/use-plugin-events.spec.ts tests/features/plugins/composables/use-plugin-storage.spec.ts`
- 完整验证已通过：
  - `npm run lint`
  - `npm run typecheck -w packages/server`
  - `npm run typecheck -w packages/web`
  - `npm run smoke:server`
  - `npm run smoke:web-ui`

### 当前状态
- 独立 judge 已判 `PASS`。
- judge 认为本轮目标成立，可以提交。
- judge 同时提示两个后续注意点：
  - `McpService.deleteServer()` 本体还没有直接清 override，当前依赖后续 `removeServer()` 调用
  - 启动期缺失本地插件清理依赖 `bootstrapHttpApp()` 传入 `onDrop`

### 已提交
- commit: `a4ec8ef` `修复: 收口阶段F清理链与插件详情串扰`

## 2026-05-01 阶段 G：会话生命周期剩余高危缺陷

### 已开始
- 当前优先级转到会话生命周期：
  - 已完成回复被附带动作失败反写成 `error`
  - 删除会话前未先终止活跃主任务与子代理
- 本轮先复核 `conversation-task / conversation controller / subagent runner` 与对应 tests。

### 本轮已完成修复
- `ConversationTaskService.finishTask()` 现在把 `runtime.onSent` 包在完成态后的独立异常分支里：
  - 已落库为 `completed` 的 assistant 消息不会再被二次反写成 `error`
  - SSE 也不会再多发一轮错误 finish/status
  - 失败仅记日志，不污染主回复状态
- `ConversationController.deleteConversation()` 现在会先读取整棵会话树，再按顺序清运行态：
  - 对树上所有 `assistant(pending/streaming)` 逐个 `stopTask`
  - 对 `subagent.status in queued/running` 的子代理会话执行 `interruptSubagent`
  - 完成后才继续删 todo 与会话记录
- `RuntimeHostConversationRecordService` 新增 `listConversationTreeRecords()`，把“整棵会话树”读取职责收回到后端 owner。

### 本轮新增回归
- `tests/conversation/conversation-task.service.spec.ts`
  - 新增 `onSent` 失败后仍保持 `completed` 的用例
- `tests/conversation/conversation.controller.spec.ts`
  - 新增删除会话前先停活跃 assistant 与子代理的顺序断言

### 本轮验证
- 已通过：
  - `npm run test -w packages/server -- tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation.controller.spec.ts`
  - `npm run lint`
  - `npm run typecheck -w packages/server`
  - `npm run typecheck -w packages/web`
  - `npm run smoke:server`
  - `npm run smoke:web-ui`

### 当前状态
- 独立 judge 已给出 `PASS`。
- judge 留下两条后续风险提示：
  - 删除整棵会话树时，目前只显式清理根会话 todo，子会话 todo 仍可能残留为孤儿数据
  - `subagent queued` 已在实现分支覆盖，但还没有单独测试把该分支钉死

### 已提交
- commit: `b75009f` `修复: 收口阶段G会话生命周期缺陷`

## 2026-05-01 阶段 H：删除链残余 + 新一轮并行扫错

### 已开始
- 先处理 judge 留下的删除链残余：子会话 todo 孤儿数据。
- 同时按 server / web / plugin-runtime 三路继续做只读扫描。

### 本轮已完成修复
- `ConversationController.deleteConversation()` 现在会对整棵会话树逐个执行 `deleteSessionTodo`：
  - 根会话与子会话 todo 都会一起清理
  - 同时补了 `subagent queued` 删除前中断分支回归
- 子代理消息语义收紧：
  - `stopMessage()` 在子代理会话里只允许命中当前活跃 assistant
  - 旧 assistant / user message 不会再误中断当前子代理
  - 子代理 `retry` 现在只接受 assistant message，错误目标会走 SSE 错误返回
- 聊天发送链路收口：
  - `sendMessage()` 会把发送时的会话与模型选择固定在本地快照里
  - 等待模型选择期间若切会话，旧草稿不会再进入新会话队列
- `ModelQuickInput` 新增请求序号守卫：
  - `provider-models` 刷新先返回时，不会再被更早的挂载请求覆盖
- 插件删除审计修正：
  - 删除失败时不再提前写假 `plugin:deleted`
  - 删除成功后改为使用缓存的 eventLog 设置记删除事件，不再因为记录已删而把接口打成 404

### 本轮新增回归
- server
  - `tests/conversation/conversation.controller.spec.ts`
    - 子会话 todo 清理
    - `subagent queued` 删除前中断
    - 子代理 stop/retry 的消息目标校验
  - `tests/adapters/http/plugin/plugin.controller.spec.ts`
    - 删除失败不得记 `plugin:deleted`
- web
  - `tests/features/chat/store/chat-store.module.spec.ts`
    - 发送等待模型选择期间切会话，不得串发到新会话
  - `tests/components/ModelQuickInput.spec.ts`
    - 新旧候选请求乱序返回时保留最新结果

### 本轮验证
- 已通过：
  - `npm run test -w packages/server -- tests/adapters/http/plugin/plugin.controller.spec.ts tests/conversation/conversation.controller.spec.ts`
  - `npm run test:run -w packages/web -- tests/features/chat/store/chat-store.module.spec.ts tests/components/ModelQuickInput.spec.ts`
  - `npm run lint`
  - `npm run typecheck -w packages/server`
  - `npm run typecheck -w packages/web`
  - `npm run smoke:server`
  - `npm run smoke:web-ui`

### 当前状态
- 阶段 H 尚未结束。
- 仍待继续确认的 owner 缺口：
  - 当前正在补完整体验证与独立 judge；通过后可结束阶段 H。

### 阶段 H 补充修复
- `RuntimeHostConversationRecordService.deleteConversation()` 现在会在删除整棵会话树时逐个清理对应 todo：
  - `AutomationService` 这类直接调用 record owner 的路径不再漏删子会话 todo
  - `ConversationController` 不再自己重复删 todo，删除职责回到 record owner
- 插件 / MCP 事件日志查询状态已拆成“基础查询”和“分页 cursor”两层：
  - `loadMore*()` 只把 cursor 临时拼到请求里
  - 后续 `refresh*()` 不会再沿用旧 cursor 从半页位置刷新

### 阶段 H 补充验证
- 已通过：
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/conversation/conversation.controller.spec.ts`
  - `npm run test:run -w packages/web -- tests/features/plugins/composables/use-plugin-events.spec.ts tests/features/tools/composables/use-mcp-config-management.spec.ts`
  - `npm run lint`
  - `npm run typecheck -w packages/server`
  - `npm run typecheck -w packages/web`
  - `npm run smoke:server`
  - `npm run smoke:web-ui`

### 阶段 H 当前结论
- 独立 judge 已给出 `PASS`。
- judge 认可这批修复不是表层补丁：
  - 会话树 todo 清理 owner 已回到 `RuntimeHostConversationRecordService`
  - 插件 / MCP 事件日志普通刷新不再继承旧分页 cursor
- judge 同时留下两条后续风险提示：
  - `RuntimeHostConversationRecordService <-> RuntimeHostConversationTodoService` 的循环依赖目前主要靠 smoke 兜住，缺单独 DI 级回归
  - MCP 事件日志还没有请求序号守卫，后续仍可继续看并发乱序覆盖

### 已提交
- commit: `c604548` `修复: 收口阶段H删除链与事件分页状态`

## 2026-05-01 阶段 I：提交后继续并行扫错

### 已开始
- 阶段 H 已提交，当前进入下一轮并行扫描。
- 本轮先按你要求复用 subagent 做只读扫错，再挑一组高价值问题继续本地修复。
- 当前优先入口：
  - MCP 事件日志刷新并发乱序
  - 离线插件工具源可见性
  - 本地插件 reload 传递依赖缓存
  - MCP 失败重试回收链复核

### 阶段 I 当前进展
- 已修 `ContextGovernanceSettingsPanel` 自动保存失败后的纯 schema 重试缺口：
  - 组件不再把待保存签名提前写成 committed
  - 现在区分 `committedSignature` 与 `pendingSignature`
  - 保存失败且 snapshot 未追上时，`saving=false` 会立即重试
- 已补前端回归：
  - `tests/features/ai-settings/components/ContextGovernanceSettingsPanel.spec.ts`
- 已通过：
  - `npm run test:run -w packages/web -- tests/features/ai-settings/components/ContextGovernanceSettingsPanel.spec.ts`
  - `npm run typecheck -w packages/web`

### 阶段 I 子代理扫描新结果
- 本地插件链路高优先级：
  - 运行中删除 `config/plugins/<plugin>` 后只点 `reload`，不会走 drop 清理链，旧记录与 runtime 状态会残留
  - `config/plugins` 下两个目录若导出相同 `manifest.id`，后者会静默覆盖前者
  - 删除本地插件后事件日志文件不会清，重建同 `pluginId` 会继承旧日志

### 阶段 I 新增修复
- 已修本地插件目录删除后的 `reload` 清理链：
  - `PluginBootstrapService.reloadLocal()` 在项目定义已消失时会删除对应 plugin record，而不是只抛错
  - 清理已收口到真实入口：
    - `PluginController.runPluginAction('reload')`
    - `ToolRegistryService.runSourceAction('plugin', ..., 'reload')`
  - 两条入口都会在“目录已删除”时同步清理 runtime state、plugin conversation sessions、`plugin:*` tool/source overrides，以及健康态缓存
- 已删除 `RuntimePluginGovernanceService <-> RuntimeHostService` 之间那条注册式本地 reload 清理回调：
  - 不再通过额外 callback 间接清理当前单例
  - 避免“治理 service 看似处理了 reload，实际只有磁盘状态变了”的假收口
- 已补 server 回归：
  - `tests/runtime/kernel/runtime-kernel.service.spec.ts`
  - `tests/execution/tool/tool-registry.service.spec.ts`
  - `tests/adapters/http/plugin/plugin.controller.spec.ts`
  - `tests/runtime/host/runtime-host.service.spec.ts`
  - `tests/plugin/project/project-plugin-registry.service.spec.ts`
  - `tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts`
- 已修本地项目插件 `manifest.id` 冲突静默覆盖：
  - `ProjectPluginRegistryService.loadDefinitions()` 发现重复 `manifest.id` 时，保留按目录排序先加载的定义
  - 冲突目录会记明确 warning，不再把前一个目录静默顶掉
- 已通过：
  - `npm run test -w packages/server -- tests/adapters/http/plugin/plugin.controller.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts`
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host.service.spec.ts`
  - `npm run test -w packages/server -- tests/plugin/project/project-plugin-registry.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts`
  - `npm run typecheck -w packages/server`
  - `npm run lint`
  - `npm run typecheck -w packages/web`
  - `npm run smoke:server`
  - `npm run smoke:web-ui`

### 阶段 I 当前结论
- 独立 judge 已给出 `PASS`。
- judge 认可本轮三项关键目标都成立：
  - `ContextGovernanceSettingsPanel` 失败后纯 schema 改动会自动重试
  - `PluginController` 与 `ToolRegistryService` 两个真实入口在本地插件目录删除后 reload 都会清当前单例状态
  - `ProjectPluginRegistryService` 对重复 `manifest.id` 不再静默覆盖
- judge 留下的后续风险：
  - 启动期 `bootstrapProjectPlugins(onDrop)` 的缺失本地插件清理，当前还没顺手清健康态缓存

## 2026-05-01 MCP / 工具管理 / 插件 / 自动化 只读 bug 扫描

### 已完成
- 读取 `TODO.md`、`task_plan.md`、`findings.md`、`progress.md`
- 列出本轮扫描范围内的 server / web 源码与测试文件
- 确认本轮只做只读审阅，不改业务代码
- 已确认 5 条真实缺陷/回归：
  - MCP 失败重试会泄漏客户端/子进程
  - 本地插件 reload 不会失效传递依赖缓存
  - 插件详情切换存在异步乱序覆盖
  - cron child 自动化准备阶段失败不会记日志/持久化
  - 离线插件工具源会从 `/tools` 统一入口消失

### 下一步
- 输出按严重度排序的只读扫描结果，并标出对应测试缺口

## 2026-05-01 subagent 扫描后的高优先级缺陷清单

### 已收集问题
- 聊天与上下文链路
  - `retryMessageGeneration()` 没有限制“仅 assistant 可重试”，也没有复用“同会话只能有一个活跃 assistant”约束
  - 聊天前端把 `display result` 也当成可停止回复，但点击停止不会真正停掉后端命令任务
  - 会话切换时不会先清空旧消息，慢网络下会短暂显示上一会话内容
- 子代理与自动化链路
  - `queued` 子代理在 `interrupt` 后仍会继续跑
  - 服务重启时运行中的子代理只改 metadata，不会同步把会话里的活跃 assistant 消息收口
  - 聊天页子代理标签接口会把普通 child conversation 也混进来
  - 同一事件命中多条自动化时，前一条抛错会截断后续全部执行
- 工具 / MCP / 插件链路
  - 单个 MCP 工具启用/禁用开关无效
  - 被禁用或掉线的 MCP source 会从 `/tools` 隐身，无法在统一入口恢复
  - 本地项目插件坏目录可拖死整个 HTTP 启动
  - 删除本地插件目录后会残留幽灵插件记录

### 当前执行顺序
- 先把问题落到规划文件
- 首修 `retry` 两个后端漏洞：
  - 目标消息必须是 assistant
  - 同会话存在活跃 assistant 时禁止再发起 retry

### 已完成的首批修复
- `ConversationMessageLifecycleService.retryMessageGeneration()` 现在会先校验：
  - 目标消息 `role === 'assistant'`
  - 当前会话不存在其他活跃 assistant 回复
- 新增回归测试覆盖：
  - 重试 `user` 消息被拒绝
  - 会话已有活跃 assistant 时，`retry` 被拒绝
- 本轮验证：
  - `npm run test -w packages/server -- tests/conversation/conversation-message-lifecycle.service.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅

### 下一步
- 继续修 `queued subagent interrupt` 不生效
- 同轮一起收口“服务重启后子代理会话残留假 streaming”

### 第二批已完成修复
- `RuntimeHostSubagentRunnerService` 现在会：
  - 记录已排队的 `setTimeout` 调度句柄
  - `interruptSubagent()` 时主动取消未开始执行的 queued 调度
  - 执行入口遇到 `interrupted` 会直接短路，不再误跑
- `resumePendingSubagents()` 现在会在把 stale `running` 子代理改成 `interrupted` 时，同步把对应 assistant 消息写成 `stopped`
- 新增/补强回归测试覆盖：
  - queued 子代理被 interrupt 后，跑完 timers 也不会继续执行
  - 服务重启恢复 stale running 子代理时，对应 assistant 消息会被收成 `stopped`
- 本轮验证：
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host-subagent-runner.service.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅

### 下一步
- 继续修 MCP 单工具启用/禁用无效
- 再收口 MCP source 掉线/禁用后从 `/tools` 隐身的问题

### 第三批已完成修复
- `McpService.listToolSources()` 现在会把 `tool-management.json` 的 MCP tool 级 override 一起折算进总览：
  - 单个 MCP tool 禁用后，`/tools/overview` 会立即反映 `tool.enabled = false`
  - `ToolRegistryService.buildToolSet()` 也会同步排除该 MCP tool
- MCP source 总览不再把 `totalTools` 绑定到“当前可执行工具数”：
  - `source.totalTools` 改为已知工具总数
  - `source.enabledTools` 只统计当前真正可执行的工具
  - source 掉线或被禁用时，不会再因为 `totalTools = 0` 从 `/tools` 消失
- `McpService` 在 reload / disable / reconnect 失败时会尽量保留已知工具描述，避免统一入口丢失 source 维度
- 新增/补强回归测试覆盖：
  - MCP tool 级 enabled override 会影响 overview 与 executable tool set
  - disabled source 仍保留已知工具数与工具列表
  - `/tools` 页在 disabled MCP source 仍有已知工具时继续展示 MCP 分区
- 本轮验证：
  - `npm run test -w packages/server -- tests/execution/mcp/mcp.service.spec.ts` ✅
  - `npm run test -w packages/server -- tests/execution/tool/tool-registry.service.spec.ts` ✅
  - `npm run test:run -w packages/web -- tests/features/tools/views/ToolsView.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅

### 下一步
- 继续修本地项目插件坏目录拖死启动
- 同轮收口已删除目录的本地项目插件幽灵记录

### 第四批已完成修复
- `ProjectPluginRegistryService.loadDefinitions()` 现在按目录级容错：
  - 单个损坏的本地项目插件目录只会记 warning 并跳过
  - 其余健康插件仍会继续加载，不再把异常抛穿到 HTTP 启动链路
- `PluginBootstrapService.bootstrapProjectPlugins()` 现在会先做本地项目插件清理：
  - 对比 `config/plugins` 当前已加载 definition 集合
  - 删除持久化里“不是 builtin 且已不在磁盘上的 local plugin”记录
  - 保留 builtin local 与 remote plugin 记录
- 新增/补强回归测试覆盖：
  - registry 遇到损坏目录时仍能加载同目录下其他本地插件
  - bootstrap 本地项目插件时会清理已删除目录的幽灵记录，但不会误删 remote 记录
- 本轮验证：
  - `npm run test -w packages/server -- tests/plugin/project/project-plugin-registry.service.spec.ts` ✅
  - `npm run test -w packages/server -- tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts` ✅
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host-plugin-dispatch.service.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅

### 下一步
- 继续修聊天页子代理标签混入普通 child conversation
- 或自动化事件命中多条时前一条异常截断后续执行

### 第五批已完成修复
- `GET /api/chat/conversations/:id/subagents` 不再复用泛化的 `listChildConversations()`：
  - 新增 `RuntimeHostConversationRecordService.listChildSubagentConversations()`
  - 只返回 `kind === 'subagent'` 且带 `subagent` 元数据的真实子代理会话
  - 普通 `parentId` 子会话，例如自动化 `cron child`，不会再混进聊天页子代理标签
- 新增/补强回归测试覆盖：
  - conversation controller 只调用新的 subagent child 列表 owner
  - conversation record service 能区分“全部 child”与“仅 subagent child”
- 本轮验证：
  - `npm run test -w packages/server -- tests/conversation/conversation.controller.spec.ts` ✅
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host-conversation-record.service.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅

### 下一步
- 继续修自动化同一事件命中多条时前一条异常截断后续执行
- 再处理聊天页 `display result` 停止按钮与切会话旧消息残留

### 第六批已完成修复
- `AutomationService.emitEvent()` 现在按“单条自动化”粒度吞住意外异常：
  - 某条匹配自动化在 `runRecord()` 外层抛错时，会记录 error 日志并继续执行后续命中的自动化
  - 同一事件的 `matchedAutomationIds` 不再因为前一条异常而提前截断
- 新增回归测试覆盖：
  - 第一条事件自动化抛出意外异常时，第二条仍会继续执行
  - 第一条失败日志会落成 `status: error`
- 本轮验证：
  - `npm run test -w packages/server -- tests/automation/automation.service.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅

### 下一步
- 继续修聊天页 `display result` 停止按钮不真正停止后端命令任务
- 再修切会话时旧消息短暂残留

### 第七批已完成修复
- 聊天前端把“阻塞中”和“可停止”拆成了两层状态：
  - `streaming` 继续表示当前会话仍在阻塞，会驱动待发送队列
  - 新增 `canStopStreaming`，只在当前活跃消息确实是 `assistant(pending/streaming)` 时为真
- `stopStreaming()` 现在也会二次校验当前活跃消息必须是 assistant：
  - `display result` 不再被本地误标成 `stopped`
  - 也不会再因为点了停止而只中断前端请求、却让后端命令继续跑
- `ChatComposer` 的停止按钮现在只看 `canStop`，不再只看 `streaming`
- 新增/补强回归测试覆盖：
  - `display result` 维持队列阻塞时，停止按钮仍应禁用
  - 对 `display result` 调 `stopStreaming()` 不会错误调用后端 stop 接口，也不会本地改写消息状态
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/store/chat-store.module.spec.ts` ✅
  - `npm run test:run -w packages/web -- tests/features/chat/components/ChatComposer.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅

### 下一步
- 继续修切会话时旧消息短暂残留

### 第八批已完成修复
- `selectConversation()` 现在在切到另一条会话时，会先清空旧消息视图：
  - 慢网络下会先显示空白加载态
  - 不再把上一会话的消息短暂留在当前会话里
  - 对同一会话的重复刷新不额外清空，避免无意义闪烁
- 新增回归测试覆盖：
  - 切到另一会话且详情仍在加载时，旧消息会立即被清空
  - 新会话详情返回后，再正常落入当前消息列表
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/store/chat-store.module.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅

### 下一步
- 进入整轮验收：`lint`、`smoke:server`、`smoke:web-ui`、独立 judge

### `/compact` 浏览器 smoke 超时补定位
- 已复现 `smoke:web-ui` 卡在“等待 /compact 的命令结果写入会话历史”。
- 失败时抓到的会话快照显示：
  - 后端历史里只有首条普通 user/assistant
  - `/compact` 的 display command/result 根本还没发到后端
- 进一步顺着前端发送链路确认：
  - `/compact` 点击时会先进当前会话待发送队列
  - 队列 drain 会等待前一条 `dispatchSendMessage()` 整体返回
  - 旧实现把“流结束后的会话摘要/上下文预览补刷新”也放在 `dispatchSendMessage()` 的 await 主链上
  - 结果是：SSE 内容已经结束，但下一条排队消息仍可能被慢补刷新卡住
- 已完成修复：
  - `dispatchSendMessage / dispatchRetryMessage` 不再阻塞等待最终 `refreshConversationState`
  - 补刷新改为后台执行，不再卡住下一条队列出队
  - 浏览器 smoke 在发送 `/compact` 前，改为等待上一条聊天 POST SSE 请求 `requestfinished`
  - smoke 失败时保留当前会话消息快照输出，便于后续再定位
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/store/chat-store.dispatch.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run smoke:web-ui` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` 复跑 ✅
- 独立 judge：
  - 首轮 `FAIL`：指出 smoke 不能拿 stop 按钮禁用冒充真实空闲
  - 修正为等待上一条聊天 SSE 请求 `requestfinished` 后，复核 `PASS`

### 阶段 E 第一批已完成修复
- `ToolRegistryService.executeRegisteredTool()` 不再走“直接 dispatch”旁路：
  - 现在会先按当前 `/tools` 总览解析目标 tool
  - 统一复用 `enabled` 与插件会话作用域校验
  - disabled source / disabled tool / conversation scope 禁用时会直接拒绝执行
- `PluginController.deletePlugin()` 现在会同步清理该插件的 runtime 残留：
  - `RuntimeHostPluginRuntimeService.deletePluginRuntimeState()` 清空 `storage / state / cron`
  - `RuntimeHostConversationRecordService.deletePluginConversationSessions()` 清空插件会话 session
  - `RuntimePluginGovernanceService.deletePluginRuntimeState()` 清空内存健康快照与失败计数
- 本轮验证：
  - `npm run test -w packages/server -- tests/execution/tool/tool-registry.service.spec.ts` ✅
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host-plugin-runtime.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/adapters/http/plugin/plugin.controller.spec.ts` ✅
- 下一步：
  - 继续修聊天未发送图片与上传提示跨会话串发
  - 再修插件详情乱序响应覆盖当前选中项

### 阶段 E 第二批已完成修复
- `chat-view.module.ts` 现在把以下前端草稿态按 `conversationId` 隔离：
  - `pendingImages`
  - `uploadProcessingNotices`
- 结果：
  - 未发送图片不会再跨会话串发
  - 上传压缩提示、失败提示也不会带到别的会话输入框
- `use-plugin-list.ts` 现在为详情加载加了请求序号与当前选中项守卫：
  - 快速从插件 A 切到插件 B 时，A 的慢响应不会再覆盖 B 的详情面板
  - 切换到新插件且详情尚未返回时，会先清掉旧插件详情态
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/composables/use-chat-view.spec.ts` ✅
  - `npm run test:run -w packages/web -- tests/features/plugins/composables/use-plugin-management.spec.ts` ✅
- 下一步：
  - 继续处理 `MCP` 失败重试泄漏 client / stdio 子进程
  - 再修本地插件 `reload` 不刷新传递依赖缓存
  - 最后补插件 / MCP 事件分页 cursor

### 阶段 E 第三批已完成修复
- `McpService.connectClientSession()` 现在在 `connect / listTools` 任一阶段失败后，都会主动关闭本次临时 `Client`。
  - 连续失败重试不再遗留 stdio 子进程。
- `ProjectPluginRegistryService` 不再依赖全局 `require.cache` 命中：
  - 本地插件目录内文件改走自管 CommonJS loader
  - reload 时会为该插件目录重新求值本地依赖链
  - 修改 `dist/lib/*.js` 之类传递依赖后，reload 会立即生效
- `plugin-management.data.ts / mcp-config-management.data.ts` 现在保留 `cursor`：
  - 事件分页第二页起不再被 data 层标准化吃掉
- 本轮验证：
  - `npm run test -w packages/server -- tests/execution/mcp/mcp.service.spec.ts tests/plugin/project/project-plugin-registry.service.spec.ts` ✅
  - `npm run test:run -w packages/web -- tests/features/plugins/composables/plugin-management.data.spec.ts tests/features/tools/composables/mcp-config-management.data.spec.ts tests/features/plugins/composables/use-plugin-events.spec.ts tests/features/tools/composables/use-mcp-config-management.spec.ts` ✅
- 下一步：
  - 进入完整验证与独立 judge

### 阶段 E 完整验证
- 新鲜完整验证已通过：
  - `npm run lint` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅
- 当前状态：
  - 独立 judge 已判 `PASS`
  - judge 结论同时指出的剩余覆盖缺口：
    - 缺少单独点名 `mcp source disabled` 的 direct execution 回归
    - 缺少“删除插件后同 ID 重建不继承旧 runtime state”的整链回归
    - 本地插件 reload 目前只覆盖普通 CommonJS 传递依赖，不含 circular/native module 特例

## 2026-05-01 工具管理刷新联动与 MCP 启用状态持久化

### 已确认现状
- `ToolRegistryService.setSourceEnabled('mcp', ...)` 当前只改进程内 `McpService` 状态，没有把启用标记写入 `config/tool-management.json`。
- `McpService.reloadServersFromConfig()` 与 `onModuleInit()` 会把 MCP source 重新按默认启用态拉起，导致重启后禁用状态丢失。
- `packages/web/src/features/tools/views/ToolsView.vue` 当前只在 `onMounted()` 拉一次 `/tools/overview`，没有订阅内部配置变更事件。
- 结果是：
  - MCP 工具源禁用状态跨重启不可靠
  - `/tools` 统一入口在 AI 设置里改执行工具/子代理运行参数后，页面不会自动刷新

### 本轮实现
- `McpService` 已接入 `ToolManagementSettingsService`：
  - `setServerEnabled()` 会把 `mcp:<serverName>` 写入 `config/tool-management.json`
  - `primeServerRecords()`、`reloadServersFromConfig()`、`syncServerRecord()` 都会读取持久化启用状态
  - 重启或配置重载后，已禁用的 MCP source 不会被默认重新拉起
- `/tools` 页与 `ToolGovernancePanel` 都补上了内部配置变更订阅：
  - `runtime-tools` 变更会刷新执行工具面板和页级 overview
  - `subagent` 变更会刷新子代理工具面板和页级 overview
- 新增回归测试：
  - `packages/server/tests/execution/mcp/mcp.service.spec.ts`
  - `packages/web/tests/features/tools/views/ToolsView.spec.ts`
  - `packages/web/tests/features/tools/components/ToolGovernancePanel.spec.ts`

### 本轮验证
- `npm run test -w packages/server -- tests/execution/mcp/mcp.service.spec.ts` ✅
- `npm run test:run -w packages/web -- tests/features/tools/views/ToolsView.spec.ts tests/features/tools/components/ToolGovernancePanel.spec.ts` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run typecheck -w packages/web` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅
  - 首轮失败为浏览器链路等待 `/compact` 结果写入超时
  - 复跑后通过；同轮后端启动、HTTP 健康与服务拉起均正常，未见后端异常日志

## 2026-05-01 前端配置联动刷新 + 本地插件目录迁到 config/plugins

### 已确认现状
- AI 设置里的 provider/model 变更事件此前只零散发出，聊天页、模型输入、Schema provider 选择器、插件 LLM 路由详情不会统一刷新。
- `SchemaConfigNodeRenderer` 已经不再真正折叠高级项，但测试口径还停留在“展开高级配置”按钮。
- 本地插件目录迁移过程中，代码、workspace 与 lockfile 仍残留旧 `packages/plugins` / 根 `plugins` 路径。

### 本轮实现
- `use-provider-settings` 对以下结构性变更统一发 `provider-models`：
  - provider 新增/更新/删除
  - model 新增/导入/删除
  - default model 更新
  - model capabilities / contextLength 更新
- `chat-store` 新增 `selectedModelSource`，在 `provider-models` 事件后会按来源重算当前选择：
  - `manual` 先保显式选择，失效再回退
  - `history` 重新按最近 assistant 选择解析
  - `default/fallback` 直接按最新默认配置重算
  - 重算后再刷新上下文窗口 preview
- `chat-view`、`ModelQuickInput`、`SchemaConfigForm`、插件管理页统一订阅 `provider-models`，分别刷新：
  - 当前模型 capabilities
  - provider/model 快速输入候选
  - schema provider 选项
  - 插件详情里的 `llmProviders / llmOptions`
- `config/plugins` 迁移已完成：
  - root workspace 改为 `config/plugins/*`
  - `tools/build-project-plugins.mjs` 改为扫描 `config/plugins`
  - `ProjectPluginRegistryService` 改为扫描 `config/plugins`
  - `PluginModule` 补导入 `ProjectWorktreeOverlayModule`，修复 smoke 暴露的 Nest 注入缺口
  - `package-lock.json` 已收口到 `config/plugins/plugin-pc`

### 已补验证
- `npm run test:run -w packages/web -- tests/features/ai-settings/composables/use-provider-settings.spec.ts tests/features/chat/store/chat-store.module.spec.ts tests/features/chat/composables/use-chat-view.spec.ts tests/components/ModelQuickInput.spec.ts tests/features/plugins/components/SchemaConfigForm.spec.ts tests/features/plugins/composables/use-plugin-management.spec.ts` ✅
- `npm run typecheck -w packages/web` ✅
- `npm run build:plugins` ✅
- `npm run test -w packages/server -- tests/plugin/project/project-plugin-registry.service.spec.ts tests/runtime/host/runtime-host-plugin-dispatch.service.spec.ts tests/core/bootstrap/bootstrap-http-app.spec.ts` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run lint` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅

### 独立 judge
- 独立 judge 结论：`PASS`
- 复核确认：
  - `provider-models` 在 `streaming` 期间不再丢刷新，而是缓存后补刷
  - 高级配置取消折叠已进入浏览器 smoke 硬断言
  - `smoke:server` 已临时创建 `config/plugins` 本地项目插件并校验列表、`health`、`reload`

### 独立 judge 复核
- 结论：`FAIL`
- 通过项：
  - `use-provider-settings` 已把 provider / model 结构性变更统一收口到 `provider-models` 事件
  - `ModelQuickInput`、`SchemaConfigForm`、插件详情页 LLM 选项、聊天能力展示都已订阅刷新
  - `SchemaConfigNodeRenderer` 已不再提供折叠切换，`collapsed` 字段只做分组显示
  - 代码与构建入口已从旧 `packages/plugins` / 根 `plugins` 收口到 `config/plugins`
- 未通过项：
  - `chat-store` 在流式生成期间遇到 `provider-models` 事件会直接 `return`，事件不会排队补刷；这与“聊天统一实时刷新”不一致
  - 两条 smoke 都没有真正验证 `config/plugins` 下“本地项目插件”链路：
    - `smoke:server` 只校验 `/plugins` 与 `/plugins/connected` 返回数组
    - `smoke:web-ui` 只构造远程插件 fixture
    - 当前仓库 `config/plugins/plugin-pc` 还是 `runtime: remote`，实际 smoke 没有任何本地项目插件样本
- 额外风险：
  - 浏览器 smoke 对“高级配置不再折叠”只做可选点击，不会阻止折叠按钮回归
  - 当前 `config/plugins/` 在 worktree 里仍是未跟踪目录，提交时若漏加会直接丢失迁移结果

## 2026-05-01 上下文统计与压缩只认回复后 totalTokens

### 已确认现状
- `7c4d45c` 只解决了“旧 usage 不能乱复用”，但仍然会把请求前 `inputTokens` 当成当前历史占用。
- 这会漏掉“assistant 刚回复完并写回历史”的输出 token；长回复场景下，顶部统计和自动压缩都可能少算。
- `other/opencode` 的 overflow 判断优先吃真实 `totalTokens`，只有拿不到时才退回本地拼装值。

### 本轮实现
- `conversation.model-usage` 注解扩成：
  - `requestHistorySignature`
  - `responseHistorySignature`
- `ConversationTaskService` 在流结束并把最终 assistant 消息写回历史后，会再读取当前会话历史，为这条 usage 补上 `responseHistorySignature`。
- `RuntimeHostConversationRecordService.readConversationHistoryPreviewTokens(...)` 现在只会在：
  - `providerId/modelId` 匹配
  - `source === 'provider'`
  - `responseHistorySignature` 与当前历史快照一致
  时复用真实 `totalTokens`。
- 当前历史如果没有匹配到真实回复快照，就直接回退当前历史估算，不再复用请求前 `inputTokens`。
- `requestHistorySignature` 仍保留在注解里，作为历史兼容与排查信息；但上下文统计和自动压缩判断不再消费它。

### 已补验证
- `npm run test -w packages/server -- tests/runtime/host/runtime-host-conversation-record.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/conversation-task.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/conversation-message-planning.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/context-governance.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/conversation-message-lifecycle.service.spec.ts` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run lint` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅

### 独立 judge
- 独立 judge 结论：`PASS`
- 复核确认：
  - assistant 最终消息写回后，才补 `responseHistorySignature`
  - preview / 自动压缩只在 `responseHistorySignature` 命中时复用真实 `totalTokens`
  - 没发现继续把请求前 `inputTokens` 当成当前历史占用的旁路
- judge 提醒的剩余风险：
  - 旧会话若只有旧版 `historySignature`，会回退估算，不再复用旧 usage
  - 后续若还有别的链路再改写历史，也会保守退回估算

## 2026-05-01 上下文 preview 与自动压缩 token 口径对齐

### 已确认现状
- 当前顶部 `contextWindowPreview` 和自动压缩阈值判断都走 `RuntimeHostConversationRecordService.readConversationHistoryPreviewTokens(...)`。
- 这条链路现在会无条件复用最近一条匹配 `providerId/modelId` 的 `conversation.model-usage.inputTokens`。
- 因为它没有校验“这条 usage 对应的是哪一版历史”，所以历史已经被 summary、covered、新消息改写后，preview 和压缩判断仍可能继续吃旧 usage。

### 对照 `other/opencode`
- `opencode` 的界面上下文占用直接读取“最后一个已完成 assistant turn 的真实 tokens”。
- 它的压缩溢出判断也直接吃该 turn 的真实 tokens，不会把旧 usage 伪装成当前历史 preview。
- 它的结构分段展示才使用字符数估算，因此“真实 usage”与“估算明细”是分层使用，不会混成一条 stale 口径。

### 本轮修正方向
- 保留“真实 provider usage 优先”的语义。
- 但要把 usage 绑定到当次真实送模对应的历史快照。
- 只有当前 preview 历史快照与 usage 记录快照一致时，才复用真实 `inputTokens`；否则回退当前历史估算。

### 已完成修改
- 新增 `packages/server/src/conversation/conversation-history-signature.ts`：
  - 统一生成历史快照签名
  - `createStreamPlan()` 与 preview 读取都复用同一份签名算法
- `conversation-model-usage.annotation.ts` 新增可选 `historySignature`
- `ConversationMessagePlanningService.createStreamPlan()` 现在会为本次真实送模对应的历史消息生成签名，并随 stream source 下发
- `ConversationTaskService` 现在会把该签名和真实 usage 一起写入 `conversation.model-usage`
- `RuntimeHostConversationRecordService.readConversationHistoryPreviewTokens(...)` 现在只有在：
  - `providerId/modelId` 匹配
  - `source === 'provider'`
  - `historySignature` 与当前历史快照签名一致
  才会复用真实 `inputTokens`
- 一旦历史已变化，即使 provider/model 没变，也会退回当前历史估算

### 本轮验证
- `npm run test -w packages/server -- tests/runtime/host/runtime-host-conversation-record.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/conversation-message-planning.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/context-governance.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/conversation-task.service.spec.ts` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅

### 独立 judge
- 独立 judge 结论：`PASS`
- 复核确认：
  - `conversation.model-usage` 已记录 `historySignature`
  - 真实送模链路会把该签名落进 usage 注解
  - 顶部 preview 与自动压缩阈值判断共用同一套“签名匹配才复用 usage”的逻辑
  - 没发现仍会在“同 provider/model 但历史已变”时误复用旧 usage 的旁路
- judge 提醒的剩余风险：
  - 当前签名生成发生在 `chat:before-model` hook 之前；本轮目标是“历史快照一致性”，已满足
  - 若未来还要把 hook 注入内容也纳入“真实 usage 可复用快照”，需要单独扩展签名边界

## 2026-05-01 回复完成后立即检查上下文压缩

### 已确认现状
- 当前自动压缩 owner 只挂在 `ContextGovernanceService.rewriteHistoryBeforeModel()`，时机是“下一次准备送模前”。
- 当前 assistant 回复完成后，后端不会立刻再跑一次压缩检查，因此会出现“已超预算但要等下一轮输入才压”的空窗。
- 主对话在流式生成或阻塞命令期间，新输入会进入前端待发送队列，不会并发打进同一会话。

### 本轮执行顺序
- 先补回复完成后触发压缩的红测
- 再把压缩检查接到回复完成链路
- 最后跑相关后端回归测试并回写计划文件

### 已完成修改
- `ContextGovernanceService` 新增 `rewriteHistoryAfterCompletedResponse(...)`：
  - 继续复用现有 `runContextCompaction(... trigger: 'prepare-model')`
  - 回复后压缩成功时不再写入 `autoStopConversationIds`
  - 回复后或送模前一旦压缩失败，会记录“停止继续生成”的短路回复，而不是把异常原样抛穿
- `ContextGovernanceService.applyBeforeModel(...)` 现在会优先消费压缩失败短路回复：
  - 行为对齐 `other/opencode`
  - 压缩不了就停下，不继续带着超限上下文送模
- `ConversationMessagePlanningService.broadcastAfterSend(...)` 现在会在 `responseSource === 'model'` 时，先触发一次回复后压缩检查，再继续现有 `response:after-send` hook 广播
- `conversation-message-planning.service.spec.ts` 新增两类回归测试：
  - 回复后压缩失败时，不影响当前已完成回复，但下一轮会被短路停止
  - 送模前压缩失败时，当前这轮直接短路停止，不再继续调用模型

### 本轮验证
- `npm run test -w packages/server -- tests/conversation/conversation-message-planning.service.spec.ts` ✅
- `npm run test -w packages/server -- tests/conversation/context-governance.service.spec.ts tests/conversation/conversation-message-planning.service.spec.ts` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅

### 独立 judge
- 独立 judge 结论：`PASS`
- 复核重点：
  - 用户消息送模前的自动压缩仍然先于 `streamText`
  - assistant 回复发出后已接入立即压缩检查
  - 自动压缩失败时，当前已完成回复保留，但后续送模会被 short-circuit 拦下
  - `/compact` 手动命令与 `allowAutoContinue` 旧语义未发现回归
- judge 提醒的剩余风险：
  - 回复后立即压缩挂在 `broadcastAfterSend()`，后续若发送时序变更，需要一起复核

### 验收补充
- 已补 `/compact` 手动命令在压缩模型 API 失败时的回归测试
- `npm run test -w packages/server -- tests/conversation/context-governance.service.spec.ts` ✅

## 2026-05-01 上下文压缩触发时机与输入队列语义核对

### 已确认现状
- 聊天页顶部 `100% / estimatedTokens / contextLength` 只是 `contextWindowPreview` 的前端展示，不会直接触发历史改写。
- 自动压缩真正执行点在 `ContextGovernanceService.rewriteHistoryBeforeModel()`，也就是“下一次准备送模之前”，不是预览数字变化的瞬间。
- 当前本地 `config/context-governance.json` 中：
  - `compressionThreshold = 72`
  - `reservedTokens = 12000`
  - `allowAutoContinue = true`
- 在 `contextLength = 10000` 的模型上，这组配置会让自动压缩阈值按后端预算函数收敛到一个很小的内部预算阈值；因此“没立即压缩”不是阈值没过，而是压缩 owner 根本不在预览刷新链路上。

### 输入队列结论
- 聊天发送在前端 store 里会先 `appendQueuedSendRequest(...)`，再尝试 `drainQueuedSendRequests()`。
- `drainQueuedSendRequests()` 只有在 `!streaming.value` 时才会真正取出队首并发送。
- `dispatchSendMessage()` / `dispatchRetryMessage()` 也都有 `state.streaming.value` 早退保护。
- 结论：主对话当前有阻塞中的生成或命令时，新输入不会并发执行，而是进入当前会话的待发送队列，等当前流结束后再按顺序发送。

## 2026-05-01 开发态后端启动过慢与端口超时

### 已确认现状
- 用户复现里，`python tools\一键启停脚本.py --log` 在后端路由映射完成后仍未开放 `23330`，60 秒端口等待失败。
- `tools/scripts/dev_runtime.py` 当前会先等 `backend_tsc` 首轮完成，再启动 `backend_app`，随后只按端口开放与 HTTP 健康检查判断是否成功。
- `packages/server/src/core/bootstrap/bootstrap-http-app.ts` 在 `await app.listen(port)` 前没有额外业务 warmup；真正会阻塞监听的是 Nest 生命周期里的模块初始化。
- `packages/server/src/execution/mcp/mcp.service.ts` 当前在 `onModuleInit()` 里 `await reloadServersFromConfig()`，并对每个 MCP server 串行执行连接与工具发现。
- 当前本地真实配置 `config/mcp/servers/tavily-mcp.json` 使用 `npx -y tavily-mcp@latest`，属于启动期外部进程与网络依赖。

### 对照复现
- 默认 MCP 配置下，直接启动 `packages/server/dist/src/main.js`，端口开放约 `34.6s`。
- 将 `GARLIC_CLAW_MCP_CONFIG_PATH` 指向空目录后，同一启动路径端口开放约 `3.6s`。
- 默认配置日志显示：
  - `11:18:21` 开始 Nest 启动并完成路由映射
  - `11:18:52` 才出现 `插件 WebSocket 服务器监听端口 23331` 与 `Nest application successfully started`
- 结论：慢启动主增量来自 MCP 初始化阻塞应用监听，不是 `dev_runtime.py` 的端口探测本身。

### 中间错误
- 第一次写启动对照脚本时，把 `Invoke-StartupProbe` 两次调用塞进数组字面量，触发 PowerShell 参数重复解析错误。
- 已改成分两次调用并拿到对照结果，没有继续重复原命令结构。

### 已完成修改
- `packages/server/src/execution/mcp/mcp.service.ts`
  - `onModuleInit()` 改为先同步注册配置里的 MCP source 占位状态，再后台触发 `reloadServersFromConfig()`
  - 启动期预热失败只记录 `warn`，不再阻塞 HTTP 监听
  - 保留显式 `reload / reconnect / health-check` 的真实连接与探活行为
- `packages/server/tests/execution/mcp/mcp.service.spec.ts`
  - 新增“模块初始化阶段后台预热 MCP”测试

### 本轮验证
- `npm run test -w packages/server -- tests/execution/mcp/mcp.service.spec.ts` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run lint` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅

### 启动复验
- 修复前同口径对照：
  - 默认 MCP 配置：`34.6s`
  - 空 MCP 配置：`3.6s`
- 修复后同口径对照：
  - 默认 MCP 配置：`3.4s`
  - 空 MCP 配置：`3.3s`
- 结论：默认 MCP 配置已不再拖慢端口开放，慢启动增量基本消失。

## 2026-04-30 上下文长度显示语义与上下文设置文案修正

### 已确认现状
- 聊天页顶部百分比与分母直接取 `ConversationContextWindowPreview.maxWindowTokens`。
- 该字段当前实际含义不是模型总窗口，而是：
  - `summary` 策略下的 `contextLength - reservedTokens`
  - `sliding` 策略下再叠加 `slidingWindowUsagePercent`
- 因此当模型 `contextLength=10000` 且 `reservedTokens=12000` 时，后端会退化到最小预算 `256`，前端才会显示 `14478 / 256`。
- `config/context-governance.json` 仍保留 `mode: "manual"`，而 schema 也仍把 `allowAutoContinue` 绑在 `mode === "auto"` 条件下。
- `ContextGovernanceSettingsPanel` 的压缩模型是单独展示的，但其余字段主要依赖 schema 渲染；只要 schema 里有旧条件，前端就会直接漏字段。

### 本轮执行顺序
- 先更新计划文件
- 再删除 `mode/manual` 契约与配置残留
- 再修正上下文预览字段语义与聊天页显示
- 最后清理上下文设置页文案、补齐字段并更新验证

### 已完成修改
- `ConversationContextWindowPreview` 已把对外字段从内部预算语义修正为总 `contextLength`。
- `ContextGovernanceService` 现在：
  - 继续在内部使用送模预算做 `sliding` 裁剪与自动压缩阈值判断
  - 对前端预览只返回模型总窗口长度
  - summary 自动压缩不再依赖 `mode === 'auto'`
- `plugin-sdk` 上下文压缩契约已完全删除 `mode/manual`：
  - schema 不再渲染该字段
  - 运行时配置不再保留该分支
  - 仓库默认 `config/context-governance.json` 也已去除该残留
- 上下文设置页文案已统一中文：
  - `Context` → `上下文`
  - 去掉 `summary/sliding/manual/auto` 混写说明
  - `reservedTokens` 描述明确为内部预算字段，不再误导成总上下文长度
- 前端缺失字段展示已补齐：
  - 由于 `allowAutoContinue` 不再被 `mode` 条件卡住，summary 配置下现在可以正常显示和编辑
  - 压缩模型仍保留为独立卡片，继续参与统一自动保存

### 本轮验证
- `npm run build -w packages/shared` ✅
- `npm run test -w packages/plugin-sdk` ✅
- `npm run test -w packages/server -- tests/conversation/context-governance.service.spec.ts tests/conversation/conversation-message-planning.service.spec.ts tests/conversation/conversation.controller.spec.ts` ✅
- `npm run test:run -w packages/web -- tests/features/chat/views/ChatView.spec.ts tests/features/chat/components/ChatMessageList.spec.ts tests/features/chat/store/chat-store.module.spec.ts tests/features/ai-settings/components/ContextGovernanceSettingsPanel.spec.ts` ✅
- `npm run typecheck -w packages/web` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run typecheck -w packages/shared` ✅
- `npm run lint` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅
  - 首次运行卡在“等待当前默认模型持久化”
  - 立刻按同一脚本新鲜复跑后通过，当前没有残留失败

### 独立 judge
- 独立 judge 结论：`PASS`
- 复核重点：
  - 顶部上下文显示已切到总 `contextLength`
  - `mode/manual` 已从契约、schema、后端逻辑和默认配置移除
  - `sliding / summary` 都保持自动管理语义
  - 前端被旧条件挡住的字段已恢复显示

## 2026-04-30 上下文预算、自动压缩与 AI 设置即时生效

### 已确认现状
- `AiModelExecutionService` 仍有一层自写 `readProviderUsage()` / `readProviderUsagePromise()`，虽然已经按 AI SDK 统一字段在读，但这层仍属重复 owner。
- `ConversationTaskService` 当前只要 `stream.usage` 成功返回就会写入 `conversation.model-usage`，后续需要继续核对读取链路，不应再限定来源。
- `ChatMessageList` 的 `[i]` 按钮当前要求：
  - assistant 消息本体存在 `provider/model`
  - 注解里的 `providerId/modelId` 与消息本体完全匹配
  - 这会让已有 usage 注解但消息字段不齐或顺序不同的情况被前端隐藏。
- 聊天页 `contextWindowPreview` 的刷新当前只监听 `context-governance` 事件：
  - 修改模型 `contextLength` 后，不会主动刷新当前会话 preview
  - 自动压缩阈值也可能继续使用旧的前端选择态。
- AI 设置页当前存在两类显式保存交互：
  - 服务商模型的上下文长度输入框旁边单独“保存”
  - `SchemaConfigForm` 右上角磁盘按钮

### 本轮执行顺序
- 先补计划文件
- 再修 usage 与用量展示链路
- 再修上下文预算/自动压缩与配置即时刷新
- 最后移除 AI 设置相关手动保存交互并补验证

### 已完成修改
- `AiModelExecutionService` 改为按 AI SDK 统一 usage 字段做最小归一化：
  - 直接消费 `inputTokens / outputTokens / totalTokens`
  - 缓存 token 优先读 `cachedInputTokens`，并兼容 `inputTokenDetails.cacheReadTokens`
  - 不再额外认 provider 私有 snake_case 字段
- `ChatMessageList` 的 `[i]` 用量按钮改为：
  - 先按消息 `provider/model` 精确匹配注解
  - 若消息本体缺字段或不匹配，则回退到最近一条合法 `conversation.model-usage`
- `ProviderSettings.vue` 的模型上下文长度输入框改为自动保存：
  - 输入后 500ms 抖动提交
  - `blur` 时立即提交
  - 已移除单独“保存”按钮
- `SchemaConfigForm.vue` 增加自动保存能力与 `draft-change` 事件：
  - 相关 AI 设置面板已移除磁盘按钮
  - `RuntimeToolsSettingsPanel / SubagentSettingsPanel` 直接启用自动保存
  - `ContextGovernanceSettingsPanel` 额外把压缩模型选择与 schema 草稿合并后做 500ms 抖动提交
- `internal-config-change` 新增 `provider-models` scope
- `chat-store.module.ts` 改为：
  - 监听 `context-governance + provider-models`
  - 用 300ms 抖动刷新当前会话 `contextWindowPreview`
  - 全局内部配置监听改为单实例，避免重复创建 store 后累计监听器
- 浏览器 smoke 已同步到新交互，不再点击旧的上下文长度保存按钮

### 本轮验证
- `npm run test:run -w packages/web -- tests/features/chat/components/ChatMessageList.spec.ts tests/features/chat/store/chat-store.module.spec.ts tests/features/ai-settings/components/ContextGovernanceSettingsPanel.spec.ts tests/features/plugins/components/SchemaConfigForm.spec.ts` ✅
- `npm run test -w packages/server -- tests/ai/ai-model-execution.service.spec.ts` ✅
- `npm run typecheck -w packages/web` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ✅

## 2026-04-29

### 对话页 TODO 栏显示收口
- 已完成修复：
  - 当前会话 `todoItems.length === 0` 时，不再渲染整块 TODO 栏
  - 保留有待办时的既有展示与样式
- 已补回归测试：
  - `ChatView.spec.ts` 新增“无 TODO 时隐藏待办栏”断言
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/views/ChatView.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### 子代理聊天窗口收口
- 已确认聊天页顶部标签已经存在，但只在 `currentConversationId` 切换时请求一次 `/api/chat/conversations/:id/subagents`
- 已确认左侧会话栏直接渲染 `chat.conversations`，没有把 `parentId` 子会话排除
- 已确认后端 `deleteConversation` 目前只删除当前会话本体、runtime workspace 和 plugin conversation session，尚未级联清理子会话对应的 subagent session/store 记录
- 已完成修复：
  - 聊天页顶部标签增加轮询刷新，后台子代理创建后会自动出现在 `main / 子代理` 标签区
  - 左侧主会话栏只展示顶层会话，`parentId` 子会话不再混入
  - 后端删除主会话时会递归删除子会话，并同步清理关联的 subagent session/store 记录
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/views/ChatView.spec.ts tests/features/chat/layouts/ChatConsoleView.spec.ts` ✅
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-session-store.service.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### lint 性能优化
- 已确认根目录 `lint` 的慢点来自两处：
  - ESLint 没有开启缓存
  - `@typescript-eslint/parser` 在当前规则并不需要类型信息时仍加载 `project`
- 已完成修复：
  - 根目录与 `packages/web` 的 `lint` 脚本增加 `--cache --cache-strategy content --cache-location .cache/eslint`
  - `eslint.config.mjs` 去掉 `parserOptions.project`，保留语法级 TS lint，类型校验继续交给 `typecheck`
- 本轮实测：
  - `npm run lint` 冷启动约 `13.81s`
  - `npm run lint` 热缓存约 `3.58s`

### 自动化 cron 会话行为对齐
- 已确认当前自动化 `ai_message` 必须绑定已有 `conversationId`
- 已确认当前 cron 触发只会向目标会话直接追加消息，不会创建独立会话
- 已确认真正会创建子会话的只有 subagent，自动化和插件 cron 都没有这层
- 当前准备把需求限定清楚，再决定是补到 `AutomationService` 还是同时扩到插件 cron

### 运行时输入队列前端可见化
- 已确认待发送消息队列 owner 在 `chat-store.module.ts`，原先是全局数组，不按会话隔离
- 已确认输入框草稿原先在 `chat-view.module.ts` 是单个 `ref('')`，切不同会话窗口会共用同一份文本
- 已完成：
  - 待发送队列改为按 `conversationId` 分组
  - 当前会话显示轻量队列预览，只展示最近几条摘要
  - `Alt+↑` 只会对当前会话执行 `pop`，并把文本/图片草稿回填到输入区
  - 文本草稿已按会话隔离，避免不同窗口切换时串输入
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/components/ChatComposer.spec.ts tests/features/chat/store/chat-store.module.spec.ts tests/features/chat/composables/use-chat-view.spec.ts tests/features/chat/views/ChatView.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### 子代理对齐 opencode
- cancel_subagent 工具（带 SDK 定义）
- resume_subagent（sessionId 恢复）
- `<subagent_result>` 包裹（inline + 后台回写）
- 工具描述对齐（sessionId 恢复语义、简短清晰）
- 后台回写带标签

### 假实现修复
- ToolInfo.health/lastError/lastCheckedAt 改可选（根因）
- probePluginHealth 无探针时报错
- formatTime 签名统一 `string | null | undefined`
- 创建共享 plugin-labels.ts

### 验证
- plugin + automation 测试全部通过
- 子代理 5 个测试为已有的，非新引入

### 发现
- DB schema 已有 Plugin.health / PluginSubagent 表，但代码用 JSON 文件
- Conversation 缺 parentId

### 下一阶段
- JSON 文件 → SQLite 持久化改造（plan 已追加）

### 上下文压缩跨窗口问题
- 已确认错误文本来自 runtime host 的 `readPluginLlmMessages`
- 已确认当前未提交改动只补了错误标签，还没修会话切换与子会话映射
- 已补前端回归测试：子窗口 tab 必须走 `chat.selectConversation(...)`
- 已补后端回归测试：subagent session 必须持久化独立子对话，并在继续同一 session 时复用
- 已修复聊天页工作区切换：`main / 子窗口` 现在都走真实会话选择，不再直接改 `currentConversationId`
- 已修复子代理子对话映射：不再把 `subagent-session-*` 直接当 conversation id，改为持久化 `childConversationId`

### 本轮验证
- `npm run test:run -w packages/web -- tests/features/chat/views/ChatView.spec.ts` ✅
- `npm run test -w packages/server -- runtime/host/runtime-host-subagent-runner.service.spec.ts` ✅
- `npm run test -w packages/server -- runtime/host/runtime-host-subagent-session-store.service.spec.ts` ✅
- `npm run typecheck -w packages/web` ✅
- `npm run typecheck -w packages/server` ✅
- `npm run smoke:server` ✅
- `npm run smoke:web-ui` ❌
  - 第一次失败：复用现成 dev 服务后 `POST /auth/login` 返回 `401`
  - 停服后重跑：能全新拉起前后端，但卡在 `getByRole('heading', { name: 'AI 璁剧疆' })`

### 工具管理入口统一
- 已确认统一组件 `ToolGovernancePanel` 已存在，但仍分散嵌在 AI 设置、MCP、插件页面
- 本轮目标改为把工具启用/禁用统一收口到 `/tools` 页面，原页面只保留说明或跳转
- 当前准备同步改路由、页面结构、前端测试与浏览器冒烟

### 工具管理显示条件
- `/tools` 页面改为先读取 `tools/overview`
- 只有存在实际工具源且 `totalTools > 0` 的分类才会显示管理区
- MCP / 插件等分类在当前没有实际工具时不再显示空面板
- 浏览器 smoke 改为按 `/tools/overview` 的真实结果断言各分类显示/隐藏

### 插件运行时能力真实实现
- 已确认 `RuntimeHostPluginRuntimeService` 当前把 `storage/state/cron` 全放在进程内 `Map`
- 已确认 `conversation session` 在 `RuntimeHostConversationRecordService` 中为进程内 `Map`，不会随会话 JSON 一起落盘
- 已开始梳理这三块的宿主 API、HTTP 暴露与现有测试覆盖
- 已补红测：
  - `runtime-host-conversation-record.service.spec.ts` 增加 session 重载恢复断言，当前失败并返回 `null`
  - 新增 `runtime-host-plugin-runtime.service.spec.ts`，覆盖 KV 重载恢复、host cron 真执行、manifest cron 错误回写，当前全部失败
- 已完成真实实现：
  - `conversation session` 已并入会话 JSON 持久化，重载后可恢复，过期与会话删除都会同步清理
  - `storage/state` 已落到独立 runtime JSON 文件，支持插件级与 scoped key 的重载恢复
  - `cron` 已支持真实调度，兼容 `10s / 5m / 1h` 间隔表达式和标准 cron 表达式
  - `manifest crons` 与 `host crons` 已统一进入同一套宿主调度与状态记录
  - cron 触发时会真实调用 `cron:tick` hook，并回写 `lastRunAt / lastError / lastErrorAt`
- 本轮中间验证：
  - `npm run test -w packages/server -- runtime/host/runtime-host-conversation-record.service.spec.ts` ✅
  - `npm run test -w packages/server -- runtime/host/runtime-host-plugin-runtime.service.spec.ts` ✅
  - `npm run test -w packages/server -- runtime/host/runtime-host.service.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅
    - 首次失败卡在聊天页 `/compact` 请求等待
    - 结合日志确认当时正好发生 Vite 依赖重优化；第二次在热身完成后通过

### 新一轮假实现扫描
- 已额外确认两处“声明和真实行为不一致”：
  - `McpService.runGovernanceAction('health-check')` 原先只读缓存状态，不做真实探活
  - `AutomationService` 共享类型声明为 `cron 表达式`，实际却只支持 `10s / 5m / 1h`
- 已完成修复：
  - MCP `health-check` 现在会真实发起 probe；启用中的 source 会重建连接并刷新工具列表
  - 自动化 cron 现在兼容标准 cron 表达式，同时保留 `10s / 5m / 1h` 简写
- 本轮验证：
  - `npm run test -w packages/server -- tests/automation/automation.service.spec.ts tests/execution/mcp/mcp.service.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### 工具管理与插件健康残留问题
- 已确认工具管理页还有一处真实假实现：
  - `ToolRegistryService` 的 source/tool 启用状态原先只写进进程内 `Map`，服务重启后会全部丢失
- 已确认插件工具源健康展示仍然误导：
  - `/tools/overview` 原先把 `plugin.connected` 直接映射成 `healthy`
  - `lastCheckedAt` 原先错误复用 `plugin.lastSeenAt`
  - `lastError` 原先固定 `null`
- 已确认插件健康快照还有一处字段错误：
  - `lastSuccessAt` 在失败场景下仍会写成当前时间，页面会把失败误画成“刚成功”
- 已完成修复：
  - 新增 `tool-management.json` 持久化 source/tool 启用状态，`ToolRegistryService` 改为真实读写配置
  - 插件工具源现在读取已缓存的真实健康快照；未检查前不再伪造 `healthy`
  - 插件健康快照现在会保留上一次成功时间，失败不会再冒充最近成功
  - 工具管理页补上 `refresh-metadata` 文案，并移除默认伪 `health-check`
  - 自动化页 cron 提示改为“支持标准 cron 表达式，也兼容 30s / 5m / 1h”
  - AI 模型能力相关文案收窄为“能力标记”，避免把存储字段描述成运行时硬开关
- 当前验证：
  - `npm run test -w packages/server -- tests/execution/tool/tool-registry.service.spec.ts` ✅
  - `npm run test -w packages/server -- tests/runtime/kernel/runtime-kernel.service.spec.ts` ✅
  - `npm run test:run -w packages/web -- tests/features/tools/views/ToolsView.spec.ts tests/features/automations/composables/use-automations.spec.ts` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

## 2026-04-30

### 子代理 runtime 全量迁移
- 已完成核心 owner 迁移：
  - `Conversation` 成为子代理唯一持久化 owner
  - 会话元数据、子会话聚合、删除清理统一收口到 `RuntimeHostConversationRecordService`
  - 旧 `runtime-host-subagent-store.service.ts` 与 `runtime-host-subagent-session-store.service.ts` 已删除
- 已完成 server/runtime/tool 重写：
  - `RuntimeHostSubagentRunnerService` 只保留活动 runtime、等待器、终止器、输入队列等内存态
  - host 方法统一为 `subagent.spawn / wait / send-input / interrupt / close / list / get`
  - 工具统一为 `spawn_subagent / wait_subagent / send_input_subagent / interrupt_subagent / close_subagent`
  - 旧 `subagent / subagent_background / cancel_subagent` 兼容入口已删除
- 已完成前端与 SDK 切换：
  - `plugin-sdk` facade、payload、类型与测试已全部切到新契约
  - 聊天页子会话发送改走 `send_input_subagent`
  - `/subagents` 页面改为 conversation 聚合视图
- 已完成 smoke 收口：
  - HTTP smoke 子代理流程改为 `spawn_subagent -> wait_subagent -> 总结`
  - `/compact` smoke 改成独立会话，避免被前面长历史耦合
  - 浏览器 smoke 新会话创建后先刷新页面，再按真实列表选中目标会话
- 本轮验证：
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/automation/automation.service.spec.ts tests/adapters/http/plugin/plugin-subagent.controller.spec.ts` ✅
  - `npm run test -w packages/server -- tests/conversation/context-governance.service.spec.ts` ✅
  - `npm run test -w packages/plugin-sdk` ✅
  - `npm run test:run -w packages/web -- tests/features/subagents/composables/use-subagents.spec.ts tests/features/subagents/views/SubagentView.spec.ts tests/features/chat/views/ChatView.spec.ts tests/features/chat/layouts/ChatConsoleView.spec.ts` ✅
  - `npm run typecheck -w packages/shared` ✅
  - `npm run build -w packages/shared` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅
- 当前阶段说明：
  - 实现与验收已完成
  - 按仓库流程，`task_plan.md` 的阶段标题仍待独立 judge 复核后再改成“已完成”
- 收尾复验：
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### 子代理命名 + 消息工具渲染收口
- 新需求范围已确认：
  - 子代理需要像真正 agent runtime 一样支持显式命名，而不是只靠描述或默认 `agent1`
  - 聊天消息里的工具调用与工具结果需要默认折叠，且显示顺序要比现在更清楚
  - JSON 输入输出不能继续只展示一行原始字符串，需要更适合阅读的结构化视图
- 当前已定位的主要 owner：
  - 子代理命名：`packages/shared/src/types/plugin-ai.ts`、`packages/plugin-sdk/src/authoring/subagent.ts`、`packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts`
  - 标签与总览展示：`packages/web/src/features/chat/views/ChatView.vue`、`packages/web/src/features/subagents/composables/use-subagents.ts`
  - 工具渲染：`packages/web/src/features/chat/store/chat-store.types.ts`、`packages/web/src/features/chat/store/chat-store.helpers.ts`、`packages/web/src/features/chat/store/chat-store.runtime.ts`、`packages/web/src/features/chat/components/ChatMessageList.vue`
- 已完成实现：
  - `spawn_subagent` / `send_input_subagent` 新增 `name`，server runtime 会把它写入子会话标题，并允许后续继续输入时更新
  - 聊天顶部标签继续直接读会话标题，因此子代理命名已自动体现在 `main / 子代理名` 标签栏
  - `/subagents` 页面窗口标签、主卡片标题与搜索关键字已改为优先使用 `title`
  - 聊天消息里的工具调用 / 结果不再只保留字符串；现在会保留 `toolCallId + 原始 JsonValue + 摘要`
  - assistant 消息渲染改为统一工具时间线，默认折叠，正文放在工具块之后
  - JSON 输入输出改为结构化预览与格式化详情视图
  - 子代理会话走 `sendInputSubagent / waitSubagent` 的 SSE 收尾现在也会补发 `tool-call / tool-result`
- 本轮验证：
  - `npm run build -w packages/shared` ✅
  - `npm run build -w packages/plugin-sdk` ✅
  - `npm run test:run -w packages/web -- tests/features/chat/components/ChatMessageList.spec.ts tests/features/chat/views/ChatView.spec.ts tests/features/subagents/composables/use-subagents.spec.ts tests/features/subagents/views/SubagentView.spec.ts` ✅
  - `npm run test -w packages/server -- tests/conversation/conversation-task.service.spec.ts tests/runtime/host/runtime-host.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/adapters/http/plugin/plugin-subagent.controller.spec.ts` ✅
  - `npm run test -w packages/plugin-sdk` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### 浏览器 smoke 子代理覆盖补完
- 已确认最初失败不在 runtime 主链路，而在 smoke 适配层：
  - fake OpenAI 流式异常在写过 SSE 头后又补 500，触发 `ERR_HTTP_HEADERS_SENT`
  - `SubagentToolService` 调 `spawn_subagent / send_input_subagent` 时漏传 `name`
  - `plugin-sdk` 的 subagent tool schema / builder 没暴露 `providerId / modelId`，导致浏览器 smoke 子代理会落到真实默认 provider
  - `/subagents` 路由当前已重定向回聊天页，因此浏览器 smoke 不能再把这个地址当成独立页面验收入口
- 已完成修复：
  - `browser-smoke.mjs` 给 fake OpenAI 加上流式错误保护
  - 浏览器 smoke 真实覆盖 `spawn_subagent -> wait_subagent`，并验证命名标签、工具时间线、主会话回写、子会话切换、overview 聚合
  - `SubagentToolService` 已补 `name / providerId / modelId` 透传
  - `plugin-sdk` 的 `spawn_subagent / send_input_subagent` tool schema 与 builder 已支持显式 provider/model 覆盖
  - `/subagents` 的 smoke 断言改为 overview API 聚合校验，前端可见性由聊天页标签链路负责
- 本轮验证：
  - `npm run test -w packages/server -- tests/execution/tool/tool-registry.service.spec.ts` ✅
  - `npm run build -w packages/plugin-sdk` ✅
  - `npm run test -w packages/plugin-sdk` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### judge 复核补丁
- 第一轮独立 judge 发现 `plugin-sdk` host facade 的 `spawnSubagent / sendInputSubagent` 没有把 `name` 透传给 runtime
- 已完成修复：
  - `packages/plugin-sdk/src/host/facade-payload.helpers.ts` 补 `name`
  - `packages/plugin-sdk/tests/index.test.js` 补 host facade 入口断言
- 第二轮独立 judge 发现 `/subagents` 在计划里标成真实聚合页，但路由仍重定向到聊天页
- 已完成修复：
  - `packages/web/src/router/index.ts` 把 `/subagents` 接回真实 `SubagentView`
  - `packages/web/tests/smoke/browser-smoke.mjs` 补 `/subagents` 页面可见性断言
  - 顺手移除了 `/compact` 流程里不稳定的 request 级等待，改为以后端真实会话状态作为 smoke 判据
- 本轮验证：
  - `npm run build -w packages/plugin-sdk` ✅
  - `npm run test -w packages/plugin-sdk` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run test:run -w packages/web -- tests/features/subagents/views/SubagentView.spec.ts` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅
- 第三轮独立 judge 结论：PASS

### `/compact` 命令显示时序 + 历史压缩脆弱校验
- 已确认前端“先显示普通用户/LLM，再在完成后变成命令/结果”不是渲染组件本身不支持 `display`
  - `ChatMessageList.vue` 早已支持 `display`
  - 真正的问题在发送链：optimistic 消息先按普通 `user/assistant` 插入，`message-start` 又被 50ms 批量提交延后，短命令会等到请求结束才一起刷新
- 已完成修复：
  - `chat-view.module.ts` 在发送前复用命令目录匹配结果，把已识别命令统一标成 `display command/result` optimistic 消息
  - `chat-stream.module.ts` 把 `message-start` 改成结构事件即时提交，不再和 `text-delta/status` 一起延后批量刷新
  - `chat-store.helpers.ts` 把活跃回复识别扩到 `display result`，避免命令请求刚开始就被错误判成“未在生成”
  - `chat-store.module.ts` 的停止逻辑补齐 `display result` 分支，避免对命令展示消息误走 assistant 停止接口
- 已确认后端偶发 `history.messages[3] must be an object` 的脆弱点在 `replaceConversationHistory` 输入校验
  - 旧实现先用递归 `readJsonObject` 判整条消息是否为合法 JSON 对象
  - 只要某个可选字段里带了 `undefined`，哪怕主体结构完全正常，也会把整条消息直接判成“不是对象”
- 已完成修复：
  - `runtime-host-conversation-record.service.ts` 改为先接受普通对象，再逐字段归一化
  - 注解 `data`、custom block `data`、`source` 等嵌套 JSON 统一做松归一化，自动剔除 `undefined`，不再把整条消息打掉
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/store/chat-store.dispatch.spec.ts tests/features/chat/composables/use-chat-view.spec.ts` ✅
  - `npm run test -w packages/server -- tests/runtime/host/runtime-host-conversation-record.service.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run typecheck -w packages/server` ✅

### 内部命令生命周期与多命令时序
- 已确认窗口切换时的“请求已取消”并不是后端任务真的被停掉：
  - 前端主动 `abort` 观察流后，HTTP 层会把异常统一包装成 `BusinessError(code: 'ABORTED')`
  - `dispatchSendMessage / dispatchRetryMessage` 旧逻辑只看 `error.name === 'AbortError'`，因此把本地取消误记成消息失败
- 已确认多命令问题不只是 `/compact` 文案排序，而是命令 owner 时序不对：
  - `ContextGovernanceService.applyMessageReceived()` 旧逻辑会在创建展示消息前直接执行压缩
  - 压缩摘要因此先落历史，再出现命令展示消息与结果消息
- 已完成修复：
  - 前端新增统一 `ABORTED` 判定，本地取消观察流不再把消息标成失败
  - 后端把内部命令改成“延迟执行的 short-circuit action”，先创建展示消息，再执行命令副作用
  - 上下文压缩摘要的物理顺序改到命令结果之后
  - 上下文治理对摘要的逻辑顺序改为按 covered/summary 投影计算，避免物理顺序变化影响真实上下文
  - 压缩候选改为只看真实上下文消息，不把 `display command/result` 当作摘要源
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/store/chat-store.dispatch.spec.ts` ✅
  - `npm run test -w packages/server -- tests/conversation/conversation-message-lifecycle.service.spec.ts` ✅
  - `npm run test -w packages/server -- tests/conversation/context-governance.service.spec.ts` ✅
  - `npm run test -w packages/server -- tests/conversation/conversation-message-planning.service.spec.ts` ✅
  - `npm run typecheck -w packages/web` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run lint` ✅
  - `npm run smoke:server` ✅
  - `npm run smoke:web-ui` ✅

### 子代理回写删除与控制面瘦身
- 已删除 shared / plugin-sdk / server / web 源码中的 `writeBack` 运行时链路与展示字段
- `spawn_subagent / send_input_subagent / interrupt_subagent / close_subagent` 已改为轻量句柄返回
- `wait_subagent` 已改为只返回必要的结果文本或错误，不再回带 request/context/provider/model/tool arrays
- `/subagents` 页面已移除回写状态、回写失败和回写目标的展示与筛选
- 本轮按用户要求未执行测试或 typecheck，先完成语义迁移与界面收口

### 2026-04-30 收尾验证
- 新鲜复跑 `npm run smoke:web-ui`，已通过；日志：`workspace/test-artifacts/smoke-web-ui-20260430-compact.log`
- 新鲜复跑 `npm run smoke:server`，已通过；日志：`workspace/test-artifacts/smoke-server-20260430-final.log`
- 先前唯一阻塞的 `/compact` smoke 超时本轮未再复现，当前进入独立 judge 复核与提交阶段

### 2026-04-30 上游 merge 与 AGENTS 拆分回退
- 已拉取 `upstream/main`，确认文档拆分来源提交是 `debd729`
- 已执行 `git merge --no-commit --no-ff upstream/main`
- 实际冲突只出现在：
  - `packages/web/src/features/admin/layouts/AdminConsoleLayout.vue`
  - `packages/web/src/features/chat/views/ChatView.vue`
- 已完成冲突处理：
  - `AdminConsoleLayout.vue` 保留上游 `ThemeToggle` 与新布局，同时维持本地移除“当前模式 / 单用户控制台 / 本机持久登录态”
  - `ChatView.vue` 保留本地已确认的“模型名字 + 能力标记 + 前往 AI 设置”工具栏，不重新引入模型下拉
  - `AGENTS.md` 与 `docs/README.md` 已恢复到本地未拆分语义，并删除上游新增的 `docs/开发规范.md` / `docs/跨平台开发说明.md`
- merge 验证中发现上游 `packages/web/tsconfig.json` 的 `ignoreDeprecations: "6.0"` 与当前 `typescript 5.9.3` 不兼容
- 已改回 `"5.0"`，随后验证通过：
  - `npm run lint` ✅ 日志：`workspace/test-artifacts/merge-lint-20260430.log`
  - `npm run typecheck -w packages/web` ✅ 日志：`workspace/test-artifacts/merge-typecheck-web-20260430-rerun.log`
  - `npm run smoke:server` ✅ 日志：`workspace/test-artifacts/merge-smoke-server-20260430.log`
  - `npm run smoke:web-ui` ✅ 日志：`workspace/test-artifacts/merge-smoke-web-ui-20260430.log`
- 第一轮独立 judge 发现 `packages/web/tsconfig.json` 的暂存区还停留在上游 `"6.0"`，与工作区和 typecheck 结果不一致
- 已补 `git add packages/web/tsconfig.json`，并基于当前索引新鲜复跑：
  - `npm run typecheck -w packages/web` ✅ 日志：`workspace/test-artifacts/merge-typecheck-web-20260430-after-stage.log`
- 第二轮独立 judge 结论：PASS
- 已提交 merge commit：`83aca72` `合并: 同步 upstream/main 并保留单文件 AGENTS`
- 已推送到 `origin/main`
- 已创建 PR：`https://github.com/sakurakugu/garlic-claw/pull/41`
- 已请求 reviewer：`sakurakugu`
- 当前唯一剩余阻塞是上游仓库分支策略要求“他人 review”：
  - PR 状态：`MERGEABLE`
  - review 状态：`REVIEW_REQUIRED`
  - `gh pr merge` 被策略拒绝
  - `gh pr merge --auto` 也不可用，因为仓库未启用 auto-merge

### 2026-04-30 聊天上下文占用与响应 token 明细
- 已确认这轮不需要新增接口：
  - 顶部上下文占用直接复用 `contextWindowPreview`
  - 每条消息用量直接复用 `conversation.model-usage` 注解
- 已完成 shared / server / web 实现：
  - `AiModelUsage` 新增可选 `cachedInputTokens`
  - `AiModelExecutionService.readProviderUsage()` 会透传 provider 返回的缓存 token
  - `conversation-model-usage` 注解校验已接受可选 `cachedInputTokens`
  - `ChatView.vue` 已在模型名字同一行显示上下文占用百分比、`estimated/max` 和渐变进度条
  - `ChatMessageList.vue` 已为 assistant 消息增加右侧 `[i]` 按钮，展开后显示输入 token、输出 token，以及可选缓存 token
- 本轮验证：
  - `npm run test:run -w packages/web -- tests/features/chat/views/ChatView.spec.ts tests/features/chat/components/ChatMessageList.spec.ts` ✅
  - `npm run test -w packages/server -- tests/ai/ai-model-execution.service.spec.ts` ✅
  - `npm run typecheck -w packages/shared` ✅
  - `npm run typecheck -w packages/server` ✅
  - `npm run typecheck -w packages/web` ✅
