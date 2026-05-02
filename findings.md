# Findings

## 2026-05-01 阶段 Q 当前合并口径

### 已固定的处理原则
- 当前仓库已经进入 merge 现场，不能再用回退式操作规避冲突。
- 这轮不是继续发散做新功能，而是把现有 fork 收口到 `upstream/main`。
- 用户明确要求：
  - 优先保留 upstream
  - 只有确实不能保留时，才补回本地必要行为

### 已固定的保留项
- `packages/web/src/modules/config/components/SchemaConfigNodeRenderer.vue`
  - 继续保持高级配置默认展开，不恢复折叠按钮。
- AI 设置 / provider / model / tools / plugins 的配置修改联动
  - 不退回大范围手动保存或手动刷新。
- 聊天、工具、插件里此前已经修过的 request guard、失败回滚、自动刷新
  - 若 upstream 没有同等保护，需要补回。

## 2026-05-02 阶段 Q 新发现

### 最新 upstream 基线
- 已重新抓取上游，`upstream/main` 当前推进到 `180d16b`。
- 这意味着当前 merge 收口不能只以 `0b1c804` 为目标，后续需要再复核一次与最新 upstream 的差异。

### `packages/web/tests/smoke/browser-smoke.mjs`
- 启动超时的真实原因不是服务没起来，而是 `start_launcher.py restart` 的完整耗时与脚本默认 `90_000ms` 超时边界撞线。
- 实测一次完整 `python tools/start_launcher.py restart`：
  - 退出码：`0`
  - 耗时：`89962ms`
- 将 launcher 重启超时改成跟随通用命令超时后，浏览器 smoke 已成功越过“启动开发环境”阶段。
- 后续新增取证结果：
  - provider 新建弹窗的 `保存` 按钮位于 `ElDialog` footer，不在 `data-test="provider-dialog-overlay"` 这个 body 容器里
  - 旧 smoke 在错误的子树下等待并点击 `保存`，所以会误报 `waitForResponse` 超时
  - 模型上下文长度输入在当前 Element Plus 绑定下，逐字 `keyboard.type('65536')` 会被中途自动保存重渲染打断，最终请求体只剩 `{"contextLength":6}`
  - `/mcp` 页面此前失败只是说明文案断言过旧，不是功能回归
- 已收口后的 smoke 兼容策略：
  - provider 弹窗统一改为 `.provider-editor-dialog` 根节点 + `dialogBody` 两层定位
  - “新增服务商 / 新建自动化 / 新建” 一类标题与按钮改成兼容新旧文案的选择器
  - 数字输入统一使用 `fill()`，避免逐字输入被自动保存链截断
  - `/mcp` 页面只保留稳定结构断言，不再绑定易变说明文案

### 本轮页面壳层对齐结论
- `commands / skills / mcp / personas / automations` 这批页面，可以直接采用 upstream 当前壳层与共享组件。
- 本地此前修过的真实行为保护主要仍在 `composables / store / smoke`，不需要为保留这些语义而继续背着旧页面壳。
- 这样处理后，最新 upstream 在这一批页面上的结构冲突面已经明显缩小。

### 当前明确保留的非 upstream 差异
- `packages/web/src/modules/ai-settings/views/ProviderSettings.vue`
  - 保留本地上下文长度自动保存，不回退到逐行手点“保存”。
  - 保留 `host routing` 的真实保存中状态，不回退到静态 `saving=false`。
- `packages/web/src/modules/skills/composables/use-skill-management.ts`
  - 在不删除本地既有统计字段的前提下补 `enabledCount`，用于承接 upstream `SkillsView`。
- `packages/web/tests/smoke/browser-smoke.mjs`
  - 继续按最新 upstream 页面结构维护断言，不回退到旧 DOM / 旧文案绑定。

## 2026-05-01 阶段 F：继续扫描记录

### 当前扫描优先级
- 优先继续核对这些尚未收口或只部分覆盖的问题：
  - `packages/server/src/execution/automation/automation.service.ts` 准备阶段失败日志与持久化
  - `packages/server/src/execution/tool/tool-registry.service.ts` 离线插件工具源可见性
  - 配置修改后的跨页面状态同步是否仍有漏刷
  - plugin/runtime 删除、重建、reload、离线恢复链路是否还有残留状态

### 当前约束
- 本轮继续只记录真实行为缺陷，不记录风格或纯重构建议。
- 若发现可复现 bug，会补充影响、复现路径、文件位置与测试缺口。

### 本轮已收口
- `packages/server/src/execution/automation/automation.service.ts`
  - `runRecord()` 现在会把准备阶段异常记成失败日志并持久化，`cron_child` 父会话缺失不再静默丢失运行痕迹。
- `packages/server/src/execution/tool/tool-registry.service.ts`
  - 离线插件 source 现在会继续出现在 `/tools` 总览里，但对应 tool 不会进入 executable tool set。
- `packages/server/src/adapters/http/plugin/plugin.controller.ts`
  - 删除插件会同步清理 `plugin:${pluginId}` source/tool overrides。
- `packages/server/src/core/bootstrap/bootstrap-http-app.ts`
  - 启动期清理缺失本地插件时，会一并清理 runtime state、plugin conversation session 与 `plugin:${pluginId}` overrides。
- `packages/server/src/execution/mcp/mcp.service.ts`
  - 删除 MCP server runtime 记录时，会同步清理 `mcp:${name}` source/tool overrides。
- `packages/web/src/features/plugins/composables/use-plugin-events.ts`
  - 切插件时会重置事件查询，并忽略旧插件慢响应。
- `packages/web/src/features/plugins/composables/use-plugin-storage.ts`
  - 切插件时会重置 storage prefix，并忽略旧插件慢响应。

### 阶段 F 剩余待处理 findings
- `packages/server/src/conversation/conversation-message-lifecycle.service.ts`
  - `display` 命令消息仍绕过单飞约束，且 stop API 不能按正式消息语义停止它。
- `packages/web/src/features/ai-settings/components/ContextGovernanceSettingsPanel.vue`
  - 自动保存失败后，纯 schema 改动可能不再自动重试。
- `packages/web/src/components/ModelQuickInput.vue`
  - 模型候选加载还没有并发保护，旧请求可能覆盖新配置快照。

## 2026-05-01 阶段 G 已收口

### `packages/server/src/conversation/conversation-task.service.ts`
- 已完成回复后，`onSent / after-send` 失败不再把 assistant 消息反写成 `error/stopped`。
- 真实 owner 修复点在 `finishTask()` 完成态分支内部，不再依赖外层 `runTask()` 捕获兜底。

### `packages/server/src/adapters/http/conversation/conversation.controller.ts`
- 删除会话前会先读取整棵会话树，停止所有活跃 assistant 消息，并中断 `queued/running` 子代理。
- 删除顺序已收口为：读取树 -> 停运行态 -> 删 todo -> 删会话记录。

### 本轮 judge 剩余风险
- 删除整棵会话树时，目前只显式删除根会话 todo；若子会话也持有 todo，会留下持久化孤儿数据。
- `queued` 子代理分支已纳入实现条件，但测试仍未单独覆盖该分支。

## 2026-05-01 阶段 H 新增收口

### `packages/web/src/features/chat/modules/chat-store.module.ts`
- 已修复发送前等待模型选择时切换会话导致旧草稿进入新会话的问题。
- 当前行为改为：发送请求绑定原会话与原选择快照；若等待期间切到别的会话，不再把旧请求串发到新会话。

### `packages/web/src/components/ModelQuickInput.vue`
- 已为候选加载补请求序号守卫。
- `provider-models` 刷新与挂载首刷乱序返回时，只保留最新请求结果。

### `packages/server/src/adapters/http/plugin/plugin.controller.ts`
- 已修复插件删除失败时误写 `plugin:deleted` 审计。
- 成功删除后改为按删除前缓存的 eventLog 设置写删除事件，避免记录删除后再读 owner 导致 404。

### `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts`
- 已把“删除整棵会话树时一并删除 todo”收回 record owner。
- 直接调用 `deleteConversation()` 的路径现在也会同步清理父/子会话 todo，不再依赖 controller 表层补动作。

### `packages/web/src/features/plugins/composables/use-plugin-events.ts`
- 已把事件日志基础查询与分页 cursor 分离。
- “加载更多”不会再把 cursor 写回常驻查询状态，普通刷新始终从基础查询重新拉第一页。

### `packages/web/src/features/tools/composables/use-mcp-config-management.ts`
- MCP 事件日志已做同样收口。
- 普通刷新不再继承上一轮“加载更多”的 cursor，避免刷新后空页或跳页。

## 2026-05-01 阶段 I 新增收口

### `packages/web/src/features/ai-settings/components/ContextGovernanceSettingsPanel.vue`
- 已修自动保存失败后的纯 schema 重试缺口。
- 组件现在区分已提交签名与待提交签名；保存失败时不会把失败请求误记成“已提交”。

### `packages/server/src/plugin/bootstrap/plugin-bootstrap.service.ts`
- 本地插件 `reload` 在项目定义已经消失时，不再只抛错。
- 现在会把对应 plugin record 从持久化列表里移除，并把“已删除”状态返回给上层治理动作。

### `packages/server/src/runtime/kernel/runtime-plugin-governance.service.ts`
- 本地插件 `reload` 的“目录已删除”分支不再承载当前单例清理 owner。
- 该 service 现在只负责：
  - health snapshot / failure count
  - 支持动作判定
  - remote reconnect / refresh-metadata
- 这样可以避免通过额外 callback 落成“清了磁盘、没清当前服务单例”的假成功。

### `packages/server/src/adapters/http/plugin/plugin.controller.ts`
- 本地插件 `reload` 命中“目录已删除”时，controller 入口会直接清理当前进程单例状态：
  - runtime state
  - plugin conversation sessions
  - `plugin:*` tool/source overrides
  - plugin 健康态缓存

### `packages/server/src/execution/tool/tool-registry.service.ts`
- `/tools` 统一入口触发本地插件 `reload` 命中“目录已删除”时，也会执行与 controller 相同的当前单例清理链。
- 这条路径现在与插件页按钮语义对齐，不会再出现“插件页 reload 清了，统一工具入口 reload 没清”的双口径。

### `packages/server/src/plugin/project/project-plugin-registry.service.ts`
- `config/plugins` 下若两个目录导出相同 `manifest.id`，现在不会再由后加载目录静默覆盖前者。
- 当前行为改为：
  - 保留按目录排序先加载的定义
  - 对冲突目录记明确 warning，并跳过该目录
- 这样至少不会在无提示情况下把本地插件实现换成另一份目录内容。

### 阶段 I judge 残余风险
- `bootstrapProjectPlugins(onDrop)` 当前只清理：
  - runtime state
  - plugin conversation sessions
  - `plugin:*` source/tool overrides
- 启动期缺失本地插件的 drop 分支还没有顺手清健康态缓存；这不影响本轮 judge 通过，但可作为下一轮后端收尾项继续处理。

## 2026-05-01 阶段 J 新增收口

### `packages/server/src/core/bootstrap/bootstrap-http-app.ts`
- 启动期 `bootstrapProjectPlugins(onDrop)` 现在会和其余真实入口保持同一清理口径：
  - runtime state
  - plugin conversation sessions
  - `plugin:*` source/tool overrides
  - plugin 健康态缓存

### `packages/server/src/execution/mcp/mcp.service.ts`
- 已连接 MCP client 的 tool call 失败后，不再只改状态不回收 client。
- 当前行为改为：
  - 先关闭并移除旧 client
  - 再把 source 标成 `connected: false / health: error`
  - 保留 tool source 可见，但 executable client 不再残留

### `packages/server/src/plugin/persistence/plugin-persistence.service.ts`
- 插件事件日志生命周期 owner 已收回 `PluginPersistenceService`。
- 当前行为改为：
  - `deletePlugin()` 删除活跃插件日志目录，并由 persistence owner 自己补记 `plugin:deleted` detached audit
  - `dropPluginRecords()` 删除对应活跃插件日志目录
  - `recordDetachedPluginEvent()` 只写入 detached 审计路径，不再写回活跃插件日志
  - detached audit 至少保留 `1 MB` 审计空间，不再受活跃日志关闭开关影响

### `packages/server/src/runtime/log/runtime-event-log.service.ts`
- `RuntimeEventLogService` 现在只负责底层日志原语，不再隐式承担插件删除代际语义。
- 新增两个清晰原语：
  - `deleteLogs(kind, entityId)` 删除活跃日志目录
  - `appendDetachedPluginAudit(pluginId, ...)` 把删除审计写到 `log/deleted-plugins/<pluginId>/events.json`
- 这样删除审计与活跃插件日志分仓后，同 `pluginId` 重建不会再继承旧活跃日志。

## 2026-05-01 阶段 J 事件日志生命周期结论

### `packages/server/src/plugin/persistence/plugin-persistence.service.ts`
- 删除本地/远程插件后，事件日志生命周期现在由 `PluginPersistenceService` 统一接管。
- 删除审计与活跃插件日志已经分仓：
  - 活跃日志：`log/plugins/<pluginId>/events.json`
  - 删除审计：`log/deleted-plugins/<pluginId>/events.json`
- 因为代际隔离已回到真实 owner，同 `pluginId` 重建不会再继承旧活跃日志。

## 2026-05-01 阶段 K 新增收口

### `packages/server/src/conversation/context-governance.service.ts`
- summary 压缩现在不再把“有摘要”直接当作成功。
- 压缩后会重新计算 `afterPreview`；若仍超预算，则拒绝替换历史并返回失败原因。

### `packages/web/src/features/plugins/composables/use-plugin-list.ts`
- 本地插件 `reload` 命中“目录已删除”后，前端不再继续拉取旧插件详情。
- 插件列表静默刷新后会重新选择仍存在的插件，或回到空态。

### `packages/web/src/features/tools/composables/use-mcp-config-management.ts`
- MCP 事件日志现在会在切换 server 时重置基础查询。
- 事件刷新和加载更多都补了当前 server / requestId 守卫，旧请求不会覆盖新选中项。

### `packages/server/src/execution/tool/tool-registry.service.ts`
- plugin source 禁用后，tool 总览 `enabled` 与 `enabledTools` 统计不再被 tool 级 `true` override 误抬高。
- 展示口径已和真实执行口径统一到 `plugin.connected && sourceEnabled && toolEnabled`。

### `packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts`
- `waitSubagent()` 已补“先挂 waiter，再立即复核状态”的竞态保护。
- 子代理若在 waiter 建立前瞬时完成，不会再把 HTTP 等待链挂死。

## 2026-05-01 阶段 L 新增收口

### `packages/web/src/features/ai-settings/composables/use-provider-settings.ts`
- Vision Fallback 保存成功后，现在会发出 `vision-fallback` 内部配置变更事件。

### `packages/web/src/features/chat/modules/chat-view.module.ts`
- 聊天页现在会订阅 `vision-fallback` scope，并立即刷新当前开关。
- 这样从 AI 设置切回聊天页时，不需要等下一次失败重试才发现开关已变化。

## 2026-05-01 阶段 M 新增收口

### `packages/web/src/features/ai-settings/views/ProviderSettings.vue`
- `HostModelRoutingPanel` 之前一直拿 `saving=false`，保存按钮不会进入禁用态。
- 这会让用户在第一次保存尚未返回时继续点第二次保存，放大后端慢响应覆盖新配置的问题。

### `packages/web/src/features/ai-settings/composables/use-provider-settings.ts`
- `saveHostModelRoutingConfig()` 之前没有请求序号守卫。
- 当前行为已改为只让最新一次保存回包落本地状态；旧请求晚回包时直接丢弃。

### `packages/web/src/features/chat/views/ChatView.vue`
- 子代理标签轮询之前只校验 `workspaceConversationId`，没有校验请求先后。
- 同一会话下两次轮询若旧请求更晚返回，旧标签列表会覆盖较新的结果。
- 当前已补请求序号守卫，只有最新轮询结果允许写回页面。

## 2026-05-01 阶段 N 新增收口

### `packages/web/src/features/tools/views/ToolsView.vue`
- `/tools` 之前只订阅 `runtime-tools / subagent` 内部配置事件。
- 因此 MCP 配置更新、插件配置更新后，总览不会自动刷新，页面会停在旧快照。
- 当前已补两条刷新来源：
  - `mcp` 内部配置事件
  - `PLUGIN_CONFIG_CHANGED_EVENT`

### `packages/web/src/features/tools/composables/use-mcp-config-management.ts`
- `refresh()` 之前没有外层请求代次守卫。
- 旧 `loadMcpConfigSnapshot()` 慢返回时，会把 `snapshot` 和 `selectedServerName` 覆盖回旧值。
- 当前已补 `refreshRequestId`，只允许最新一轮全量刷新回写状态。

### `packages/web/src/features/ai-settings/composables/use-provider-settings.ts`
- `refreshAll()` 之前没有外层请求代次守卫。
- 旧 `loadProviderSettingsBaseData()` 慢返回时，会把 provider/default/vision/host routing 基线重新盖回旧快照。
- 当前已补 `refreshAllRequestId`，只允许最新一轮基线刷新写回这些字段。

## 2026-05-01 阶段 O 新增收口

### `packages/web/src/features/chat/store/chat-store.helpers.ts`
- 活跃回复识别现在统一抽成 `isStoppableResponseMessage()`。
- `display result` 不再只是“会卡住 streaming 的活跃消息”，同时也进入可停止语义。

### `packages/web/src/features/chat/modules/chat-store.module.ts`
- `stopStreaming()` 之前会直接拒绝 `display result`，导致命令消息挂起时只能继续卡队列。
- 当前已改为对可停止回复统一走 `stopConversationMessageRecord()`，然后本地标记 `stopped` 并继续 drain 队列。
- `selectConversation()` 之前先清空当前会话再并发加载新会话；只要其中一个请求失败，就会停在半切换状态。
- 当前已补上一会话快照回滚：新会话加载失败时会恢复旧消息、todo、模型选择与上下文预览。

### `packages/server/src/conversation/conversation-message-lifecycle.service.ts`
- 阶段 O 首轮 judge 暴露的真实缺口是“前端 stop 语义已放宽，后端仍只认 assistant”。
- 当前已把三处判定收口到同一语义：
  - `stopMessageGeneration()` 允许 `assistant` 与 `display result`
  - `startMessageGeneration()` 遇到活跃 `display result` 时同样禁止第二条生成
  - `retryMessageGeneration()` 遇到活跃 `display result` 时同样禁止重试并发
- 因此 `/compact` 这类命令现在不再出现“前端显示可停、后端实际拒绝 stop”的前后端分叉。

### `packages/web/src/features/chat/modules/chat-store.module.ts`
- 阶段 O 第二轮 judge 暴露的真实缺口是“回滚快照取自当前半切换态”。
- 当前已补两层保护：
  - `stableConversationState` 只在 `loading=false` 时记录最后一份稳定会话状态
  - `selectConversation()` 新增请求代次守卫，旧切换的完成/失败不会再回写新切换后的页面
- 因此“旧切换未完成 -> 新切换失败”的并发场景，现在会回到最后稳定会话，而不是回到空消息/空待办/空权限的半切换壳。

## 2026-05-01 阶段 P 扫描起点

### 当前扫描方向
- server：继续看 `conversation / execution / plugin / automation` 的 owner 和并发边界
- web：继续看聊天、插件、工具、配置联动里的乱序与失败回滚
- plugin-runtime：继续看本地插件 reload / delete / bootstrap 与 runtime 状态残留

### 本轮已确认的高优先级问题
- `packages/web/src/features/chat/modules/chat-view.module.ts`
  - `send()` 在真正入队前就清空草稿；发送前置失败会直接丢文本、图片和上传提示
  - `handleFileChange()` 压缩图片时没锁发起会话；切会话后会把图片和提示写到别的会话
- `packages/server/src/plugin/bootstrap/plugin-bootstrap.service.ts`
  - 本地插件目录仍存在但暂时损坏时，会被误当成“已删除”并直接 drop 持久化状态
- `packages/server/src/conversation/conversation-message-lifecycle.service.ts`
  - `start / retry` 入口仍有 check-then-act 并发窗

### 本轮首批已收口
- `packages/web/src/features/chat/modules/chat-view.module.ts`
  - 发送失败后会按原会话恢复草稿文本、待发送图片与上传提示
  - 图片压缩过程锁定原会话，切会话后不会再串图或串提示

## 2026-05-01 阶段 Q 合并前观察

### 分叉结论
- 本地 `main` 与 `upstream/main` 已形成双向大分叉：
  - 本地 ahead `21`
  - upstream ahead `22`
- 上游提交主体不是功能 owner 迁移，而是大规模前端样式/组件体系调整。
- 本地同一时期则持续修改了聊天、AI 设置、工具页、插件页、smoke 与大量相关 tests。

### 预期冲突面
- `packages/web/src/features/chat/*`
- `packages/web/src/features/ai-settings/*`
- `packages/web/src/features/tools/*`
- `packages/web/src/features/plugins/*`
- `packages/web/tests/*`
- `packages/web/tests/smoke/browser-smoke.mjs`

## 2026-05-01 MCP / 工具管理 / 插件 / 自动化 只读 bug 扫描

### 高优先级
- `packages/server/src/execution/mcp/mcp.service.ts`
  - `connectClientSession()` 在 `client.connect()` 或 `client.listTools()` 失败后只记录错误并重试，没有关闭本次新建的 `Client`。
  - 真实后果：当 MCP server 启动成功但工具发现超时、半连接失败、或 `health-check / reload` 连续失败时，会反复遗留 stdio 子进程。
  - 复现思路：配置一个会卡在 `listTools` 的 MCP server，多次触发 `reload` 或启动重试，观察子进程数量持续增加。
  - 现有 `packages/server/tests/execution/mcp/mcp.service.spec.ts` 覆盖了成功连接、持久化启停和健康检查，但没有覆盖“连接后发现失败时必须回收客户端/子进程”。

- `packages/server/src/plugin/project/project-plugin-registry.service.ts`
  - 本地插件 reload 只 `delete localRequire.cache[resolvedEntryFilePath]`，没有清掉该入口依赖的传递模块缓存。
  - 真实后果：修改 `config/plugins/<plugin>/dist/lib/*.js` 之类被入口 `require()` 的文件后，点“重载插件”仍可能继续执行旧逻辑，直到宿主进程重启。
  - 复现思路：让 `dist/index.js` 引入一个子模块，修改子模块返回值后调用本地插件 `reload`，行为不会更新。
  - `packages/server/tests/plugin/project/project-plugin-registry.service.spec.ts` 只测首次加载、跳过 remote、坏目录容错，没有覆盖“reload 后传递依赖更新”。

- `packages/web/src/features/plugins/composables/use-plugin-list.ts`
  - `selectPlugin()` 和 `refreshAll()` 都直接 `await refreshSelectedDetails(pluginName)`；`refreshSelectedDetails()` 完成后无二次校验，任何慢请求都能覆盖当前详情状态。
  - 真实后果：快速从插件 A 切到插件 B 时，A 的慢响应可把 `conversationSessions / healthSnapshot / configSnapshot / llmOptions` 写进 B 的详情面板；随后保存动作却会按 `selectedPlugin.value.name` 写回 B。
  - 这是可误操作的数据错配，不只是视觉闪烁。
  - `packages/web/tests/features/plugins/composables/use-plugin-management.spec.ts` 没有覆盖“快速切换插件 + 乱序返回”。

### 中优先级
- `packages/server/src/execution/automation/automation.service.ts`
  - `runRecord()` 在 `prepareExecutionAutomation()` 之前先改 `lastRunAt/updatedAt`，但如果 `prepareExecutionAutomation()` 抛错，既不会写失败日志，也不会持久化这次失败。
  - 真实后果：`cron_child` 自动化一旦父会话被删、或运行环境缺 `RuntimeHostConversationRecordService`，cron 任务会持续失败，但 UI 日志列表看不到失败记录，重启后连 `lastRunAt` 都会回退。
  - 复现思路：创建 `conversationMode: 'cron_child'` 的自动化后删除其父会话，等待下一次 cron 触发。
  - `packages/server/tests/automation/automation.service.spec.ts` 覆盖了 action 执行失败和 event 广播兜底，但没有覆盖“准备阶段失败”。

- `packages/server/src/execution/tool/tool-registry.service.ts`
  - `buildPluginSources()` 只保留 `plugin.connected && plugin.manifest.tools.length > 0` 的插件工具源。
  - 真实后果：远程插件一旦离线，统一 `/tools` 页面会直接看不到该插件工具源，无法在统一入口继续查看已登记工具、启用状态或执行恢复动作；这和 MCP source 已修掉的“离线后隐身”问题形成回归。
  - 复现思路：接入一个带 tools 的远程插件，断开连接后刷新 `/tools/overview`，对应 `plugin` source 会消失。
  - `packages/server/tests/execution/tool/tool-registry.service.spec.ts` 有 MCP 离线 source 可见性测试，但没有插件离线 source 的对等覆盖。

## 2026-05-01 subagent 并行扫描汇总

### 聊天 / 上下文
- `retryMessageGeneration()` 当前缺两个后端约束：
  - 目标消息必须是 `assistant`
  - 同会话存在活跃 `assistant(pending/streaming)` 时不能再启动另一条 retry
- 当前聊天前端把 `display result` 也算作“活跃回复”，但停止动作只会真正停止 `assistant`
  - 这会让 `/compact` 这类命令出现“看起来能停，实际上后端还在跑”的错觉
- 会话切换期间若新会话详情加载较慢，旧消息会继续留在视图里，造成短暂串会话

### 子代理 / 自动化
- `queued` 子代理的调度是 `setTimeout(0)` 异步起跑；`interrupt` 只改状态，没有取消这次调度
- 服务重启时，运行中的子代理 metadata 会被改成 `interrupted`，但对应会话内的活跃 assistant 消息没有同步收口
- 聊天页“子代理标签”接口当前实际返回所有 child conversation，不只是真正的 subagent child
- 自动化事件广播对命中的自动化是串行链路，前一条异常会截断后续全部执行

### 工具 / MCP / 插件
- MCP source 已修复“source 启用状态不持久化”，但单个 MCP tool 仍未吃 `tool-management.json` 的 tool 级覆盖
- `/tools` 当前只显示 `totalTools > 0` 的 source，因此 MCP source 只要掉线或被禁用就会从统一入口消失
- `config/plugins/*` 扫描时，单个坏本地插件目录的异常会直接抛出到 HTTP 启动链路
- 本地项目插件 bootstrap 只会增量 upsert，不会清理已从磁盘删除的旧记录，因此会留下幽灵插件

## 2026-05-01 `/compact` 浏览器 smoke 超时

### 关键事实
- 失败时 `/api/chat/conversations/:id` 历史里只有首条普通 user/assistant。
- `/compact` 对应的 display command/result 根本不在后端历史里，说明不是“落库后注解丢失”，而是“前端还没把它发出去”。

### 前端链路结论
- 聊天发送按钮本来就允许在 `streaming` 时继续点；后续消息会先进当前会话待发送队列。
- 队列 drain 当前按“上一条 `dispatchSendMessage()` Promise 完整结束”串行。
- 旧实现里，这个 Promise 不只等待 SSE 结束，还会继续 await：
  - `refreshConversationState`
  - 对应的会话摘要/上下文窗口补刷新
- 因此会出现一种真实时序：
  - 第一条 assistant 内容已经回到界面，后端历史也已完成
  - 但前端主发送 Promise 还没收口
  - `/compact` 先入队，直到慢补刷新结束才会真正出队

### 这和 smoke 为什么会撞上
- 原 smoke 只等：
  - 后端历史里上一条 assistant 已非 `pending/streaming`
  - 输入框还能输入
- 这不足以证明“前端发送主链已空闲”。
- 因为发送按钮不看 `streaming`，所以 smoke 会在队列模式下提前点 `/compact`。

### 修正方向
- 队列串行只该依赖真正的流结束，不该再被补刷新拖住。
- smoke 的等待条件也不能再拿 UI 层的 stop 按钮做代理信号；更可靠的是直接等待上一条 `/api/chat/conversations/:id/messages` SSE 请求 `requestfinished`。

## 2026-05-01 subagent 第二轮扫描新增高危项

### 后端 / 工具 / 插件
- `ToolRegistryService` 的 direct execution 路径还会绕过 tool/source enabled 与插件会话作用域；自动化 `device_command` 正好能走到这条旁路。
- 删除插件记录不会清理 runtime storage / plugin conversation session / 旧 runtime 状态；同 ID 重建会继承脏状态。
- `McpService.connectClientSession()` 在 connect / listTools 失败重试时没有回收客户端，可能遗留 stdio 子进程。
- 本地项目插件 `reload` 只删入口缓存，不删传递依赖缓存，改子模块后 reload 仍跑旧代码。

### 前端 / 聊天 / 插件管理
- 聊天只把文本草稿按会话隔离；`pendingImages` 和上传提示还是全局态，未发送图片会跨会话串发。
- 插件详情请求没有“当前选中项”守卫，快切插件或内部刷新时，旧响应可能覆盖新面板。
- 插件事件日志与 MCP 事件日志的 `cursor` 都在 data 层标准化时被吃掉，加载更多会反复请求第一页。

### 当前取舍
- `display result` 阻塞但不可停止这条先不按 bug 处理：
  - 它与当前已经确认过的产品语义冲突
  - 后续若要改，必须先重新定义“内部命令是否允许 stop”

### 已完成修复记录
- `ToolRegistryService.executeRegisteredTool()` 之前会绕过 overview 校验，导致自动化 `device_command` 可以直达 plugin / MCP 执行器。
  - 现在 direct execution 会先按 `sourceKind/sourceId/toolName` 回查当前 tool 总览，再复用统一 `enabled + scope` 判断。
  - 因此 plugin source 禁用、tool 禁用、conversation scope 禁用都不会再被旁路绕过。
- `PluginController.deletePlugin()` 之前只删持久化插件记录，不会清该插件 runtime side state。
  - 现在删除插件会同时清：
    - `plugin-runtime.server.json` 里的 `storage / state / cron`
    - `conversations.server.json` 里的 plugin conversation sessions
    - `RuntimePluginGovernanceService` 的健康快照与失败计数
- `chat-view.module.ts` 之前只把文本草稿按会话隔离，`pendingImages / uploadProcessingNotices` 仍是全局单例。
  - 现在两者都改成按 `conversationId` 分桶。
  - 切换会话时，图片草稿和上传提示会回到各自所属会话。
- `use-plugin-list.ts` 之前没有防守异步乱序：
  - 旧插件详情请求返回较慢时，可以在用户切换后覆盖当前插件面板。
  - 现在详情请求会校验“是否仍是当前激活请求 + 当前选中插件”，慢响应会被直接丢弃。
- `McpService.connectClientSession()` 之前失败后只记错重试，不回收本次临时 `Client`。
  - 现在在每次失败分支都会 `close()` 临时 client，再决定是否进入下一次重试。
- `ProjectPluginRegistryService` 的本地插件 reload 之前只依赖全局 `require.cache` 清理入口模块。
  - 现在插件目录内文件改走自管 loader，传递依赖不再复用旧缓存。
- `normalizeEventQuery()` 和 `normalizeMcpEventQuery()` 之前会把 `cursor` 丢掉。
  - 现在分页查询会保留 `cursor` 原样透传到 API 层。

## 2026-05-01 工具管理刷新联动与 MCP 启用状态持久化

### MCP 工具源启用状态残留缺口
- 之前工具管理持久化只覆盖了 `internal` 和 `plugin` source。
- `mcp` source 的启用/禁用走的是 `ToolRegistryService -> McpService.setServerEnabled()`，但不会写 `config/tool-management.json`。
- 结果是：
  - 当前进程里看起来禁用了
  - `reloadServersFromConfig()` 或服务重启后又回到默认启用
- 更合适的 owner 在 `McpService` 本身：
  - 它负责 source 连接态
  - 也最适合在 `prime / reload / set enabled` 三个时机统一吃持久化开关

### `/tools` 统一入口刷新缺口
- `ToolsView` 和 `ToolGovernancePanel` 都是各自直接拉 `/tools/overview`。
- 之前只有聊天、插件、Schema 之类页面订阅了内部配置变更事件，`/tools` 自己没有。
- 因此在 AI 设置里改：
  - 执行工具运行参数
  - 子代理配置
 之后，统一入口会继续停留在旧快照，直到手动刷新页面。
- 对这类“统一入口”页面，不能只靠 `onMounted()` 首次拉取；需要订阅内部配置事件，把页级 overview 和具体 panel 一起刷新。

## 2026-05-01 前端配置联动刷新与本地插件目录收口

### 独立 judge 复核结论
- 当前轮次不能判 `PASS`。
- 主要不是“改动没做”，而是还有两类真实缺口：
  - 聊天页在 `streaming` 时会漏掉 `provider-models` 事件，配置变更不是全时段实时生效
  - `config/plugins` 的本地项目插件链路虽然在代码里改了，但现有 smoke 没有真正走到这条链

### judge 重点挑刺
- `chat-store` 当前监听内部配置事件时，遇到 `streaming` 直接返回，没有挂起刷新请求。
  - 这意味着如果用户在一轮回复进行中改了 provider/default model/contextLength，当前聊天页不会在流结束后自动补刷新
  - 现有回归测试只覆盖“非 streaming 时收到事件”的路径
- `smoke:server` 现有插件步骤只确认插件接口能返回数组，没断言任何 `config/plugins` 中的本地项目插件已被发现、可 reload、可执行工具
- `smoke:web-ui` 的插件验收只围绕远程插件 fixture 展开；当前仓库里的 `config/plugins/plugin-pc` 本身也是 `runtime: remote`
- “高级配置不再折叠”这件事代码上已经成立，但 smoke 仍是“如果折叠按钮存在就点开”，没有把“折叠按钮必须不存在”固化成验收条件

### 前端联动问题
- 真正的问题不是某一个页面少刷一次，而是 `provider-models` 变更没有统一 owner：
  - 事件发出不全
  - 订阅方零散
  - 聊天当前选择、provider/model 列表、Schema 选项、插件 LLM 路由各自缓存
- 只修聊天页会继续漏掉：
  - `ModelQuickInput`
  - `SchemaConfigForm`
  - 插件详情页 `llmProviders / llmOptions`
- 因此本轮收口成“AI provider/model 结构性变更统一发 `provider-models`，消费方各自刷新派生状态”。

### 聊天选择重算语义
- 聊天当前模型选择不能只记 `provider/model`，还要记“它是怎么来的”：
  - `manual`
  - `history`
  - `default`
  - `fallback`
- 只有带上 `selectedModelSource`，收到 `provider-models` 事件时才能区分：
  - 是保留用户手选
  - 还是按历史回复恢复
  - 还是直接切到最新默认模型

### 本地插件目录迁移
- 用户要的是把本地插件放到 `config/plugins`，不是根 `plugins/`。
- 这个迁移不能只改扫描目录，还要一起改：
  - workspace
  - build 脚本
  - registry
  - bootstrap
  - runtime reload / dispatch
  - lockfile
- `smoke:server` 额外暴露出一个真实缺口：`ProjectPluginRegistryService` 进入 `PluginModule` 后，必须显式引入 `ProjectWorktreeOverlayModule`，否则 Nest 在启动期就会缺依赖。

### judge 追打出的补口
- 如果 `provider-models/context-governance` 变更发生在聊天 `streaming` 期间，不能直接丢掉；应缓存 scope，等流结束后补刷。
- 浏览器 smoke 对“高级配置不再折叠”不能再用“有按钮就点开”的宽松口径，而要明确断言按钮不存在。
- `config/plugins` 迁移不能只靠单测证明；server smoke 需要临时挂一个真实本地项目插件，至少验证：
  - `/plugins` 能发现
  - `/plugins/:id/health` 能读
  - `/plugins/:id/actions/reload` 能执行

## 2026-05-01 上下文统计与压缩应只认回复后 totalTokens

### 当前关键事实
- 请求前 `inputTokens` 只能说明“那次送模输入用了多少 token”，不能说明“当前会话历史现在占了多少 token”。
- 一旦 assistant 回复已经完成并写回历史，当前历史占用要优先看这次真实回复对应的 `totalTokens`。
- 如果还拿请求前 `inputTokens` 去做顶部统计或自动压缩判断，长回复场景会系统性少算。

### 对照 `other/opencode`
- `other/opencode/packages/opencode/src/session/overflow.ts` 的 overflow 判断优先读 `tokens.total`。
- `other/opencode/packages/opencode/src/session/processor.ts` 会在每次 assistant step 完成时，把真实 usage 写回当前 assistant message，再立刻据此决定是否需要 compaction。
- 因此它的压缩判断吃的是“最后一个已完成回复对应的真实总占用”，不是“上一轮请求前输入占用”。

### 本轮结论
- 本仓库要对齐的不是“双口径并行”，而是：
  - 有匹配当前历史快照的真实回复 usage 时，用 `totalTokens`
  - 没有时，再回退估算
- 请求前签名可以保留在注解里，但上下文统计与自动压缩判断不该继续消费 `inputTokens`。

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

## 2026-05-01 plugin / runtime / config/plugins 生命周期只读扫描

### HIGH
- `packages/server/src/plugin/bootstrap/plugin-bootstrap.service.ts`
  - `reloadLocal()` 把 `ProjectPluginRegistryService.reloadDefinition()` 抛出的 `NotFoundException` 一律当成“目录已删除”，直接 `dropPluginRecords([pluginId])`。
  - 但 `packages/server/src/plugin/project/project-plugin-registry.service.ts` 会把“目录还在、只是入口缺失 / 构建中断 / definition 无效”的本地插件同样降级成“跳过损坏目录”，最后 `getDefinition()` 也是 `NotFoundException`。
  - 真实后果：本地插件只要在 reload 或启动期碰到临时坏构建，就会被当成已删除，插件配置、scope、LLM 偏好、事件日志，连带 runtime state / session / overrides 清理链都会被抹掉；修好构建后同 ID 重建只能拿到全新空状态。
  - 现有测试只覆盖“坏目录会被跳过”和“真删除目录会 drop 记录”，没有覆盖“目录仍存在但暂时坏掉时必须保留现有记录”。

### MEDIUM
- `packages/server/src/adapters/http/plugin/plugin.controller.ts`
  - `setPluginStorage()` 先调用 `runtimeHostPluginRuntimeService.setPluginStorage()` 写盘，再调用 `recordPluginEvent()`。
  - 如果插件记录已经被删掉，后半段记事件会因为 `PluginPersistenceService.readPlugin()` 抛 `NotFoundException` 失败，但前半段写入的 runtime storage 已经落到 `plugin-runtime.server.json`。
  - 真实后果：删除插件后，只要有一个迟到的 storage 写请求命中，就能在返回失败的同时把同 ID 的 runtime storage 重新种回去；后续同 ID 重建会继承这份“删不干净”的旧状态。
  - 现有测试只覆盖正常 storage 委托和删除链清理，没有覆盖“插件已删除后 storage 写请求必须原子失败且不得留下新 runtime 数据”。

### MEDIUM
- `packages/server/src/runtime/gateway/runtime-gateway-connection-lifecycle.service.ts`
  - `authenticateConnection()` 在同一远程插件重复认证时，只调用 `disconnectConnection(previousConnectionId)` 摘掉旧连接账本，没有像 `disconnectPlugin()` 那样触发 `connectionCloser`。
  - 真实后果：旧 WebSocket 会一直留在进程里，直到对端自己断开或超时；频繁 reload / reconnect / 双端重连时会积累僵尸连接，远端也会继续误以为自己还在线。
  - 现有测试只断言旧 connection record 和授权上下文被替换，没有断言旧 socket 会被立即关闭。

### MEDIUM
- `packages/server/src/runtime/kernel/runtime-plugin-governance.service.ts`
  - 本地插件 `health-check` 的真实判断只有 `plugin.connected`，没有重新读 `config/plugins` 目录，也不会验证 definition 还能否重新装载。
  - 真实后果：运行中把本地插件目录删掉、入口文件掉盘或构建产物损坏后，`health-check` 仍会继续报“插件健康检查通过”，直到用户手动点 `reload` 或进程重启才暴露异常。
  - 现有测试只覆盖“手动 mark offline 的本地插件返回失败”和“远程插件走真实 probe”，没有覆盖“本地目录已失效但 connected 仍为 true”的掉盘场景。
