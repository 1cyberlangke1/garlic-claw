# Garlic Claw TODO

> 本文件只保留当前有效计划、边界、验收与对照位置。
> 已完成细节写入 `task_plan.md / progress.md / findings.md`，这里不再堆历史流水账。

## 总目标

- 以 `other/opencode/packages/opencode/src/tool/{bash,read,write,edit,glob,grep}.ts` 为边界，对齐当前工具公开语义。
- 在此基线之上，完成 `task.txt` 要求的会话上下文治理、subagent 会话化、前端窗口化与消息编排。
- `shared` 只保留类型共享，不放运行逻辑。
- 优先完成功能，再压体积；最终目标 `packages/server/src <= 15000`。
- 只接受 owner 级重写，不接受换目录、换名字或碎片式“减几行”。

## 硬约束

- 不新增 `helper / helpers` 这类语义不明命名。
- 不在 `shared` 写运行逻辑。
- 禁止 `any`，除非外部类型客观缺失且无法补齐。
- `TODO.md` 已完成事项只保留摘要，不继续堆展开描述。
- 体积阶段必须优先删旧主链、直接重写同一 owner，不保留并行双实现。
- 能在前端做的状态缓存、窗口裁剪、展示灰化，优先留在前端；但即使前端关闭，也不能影响后端正在运行的 agent / subagent。
- 每个阶段都要有：
  - 代码变更
  - fresh 验收
  - 独立 judge
  - 文档同步
- 未通过 judge 的阶段，不能改为 `[已完成]`。

## OpenCode 对照

| 工具 | OpenCode 源码 | 当前 owner | 当前状态 |
| --- | --- | --- | --- |
| `bash` | `other/opencode/packages/opencode/src/tool/bash.ts` | `packages/server/src/execution/bash/bash-tool.service.ts`<br>`packages/server/src/execution/runtime/runtime-shell-command-hints.ts` | 主链已对齐，保留总复核 |
| `read` | `other/opencode/packages/opencode/src/tool/read.ts` | `packages/server/src/execution/read/read-tool.service.ts`<br>`packages/server/src/execution/read/read-path-instruction.ts`<br>`packages/server/src/execution/runtime/runtime-file-freshness.service.ts` | 主链已对齐，保留总复核 |
| `write` | `other/opencode/packages/opencode/src/tool/write.ts` | `packages/server/src/execution/write/write-tool.service.ts`<br>`packages/server/src/execution/file/runtime-file-post-write-report.ts` | 主链已对齐，保留总复核 |
| `edit` | `other/opencode/packages/opencode/src/tool/edit.ts` | `packages/server/src/execution/edit/edit-tool.service.ts`<br>`packages/server/src/execution/file/runtime-text-replace.ts`<br>`packages/server/src/execution/file/runtime-file-post-write-report.ts` | 主链已对齐，保留总复核 |
| `glob` | `other/opencode/packages/opencode/src/tool/glob.ts` | `packages/server/src/execution/glob/glob-tool.service.ts`<br>`packages/server/src/execution/file/runtime-search-result-report.ts` | 已基本对齐，保留回归 |
| `grep` | `other/opencode/packages/opencode/src/tool/grep.ts` | `packages/server/src/execution/grep/grep-tool.service.ts`<br>`packages/server/src/execution/file/runtime-search-result-report.ts` | 已基本对齐，保留回归 |

## 当前基线

- 统计时间：`2026-04-25`
- 当前体积：`packages/server/src = 14998` 非空行
- 统计命令：`npm run count:server-src`
- 功能基线：
  - `S1-S14` 已完成，OpenCode 六个核心工具主链已对齐
  - `S15` 只剩“安全余量压缩”，不再作为当前第一优先级
  - `S16` 配置目录统一到 `config/` 已完成

## 当前任务边界（来自 `task.txt`）

### A. 会话上下文治理

- 压缩模式开启时：
  - 继续保留“摘要消息 + 会话历史保留 + 送模裁剪”能力
  - 可以继续沿用现有压缩摘要语义，但 owner 不允许继续只是“插件按钮功能”
- 压缩模式关闭时：
  - 改为传统滑动上下文
  - 支持配置“最多保留模型上下文的百分比”，例如 `50%`
  - 必须保证裁剪后的 role / parts / message 序列合法，不产生 API 结构错误
- 前端：
  - 支持新配置
  - 不缓存全部消息，只缓存最近 `k` 条，可配置
  - 已脱离 LLM 上下文、但仍保留在聊天记录中的消息，要灰化显示

### B. Subagent 会话化

- 支持配置“单个会话窗口可拥有的 subagent 最大个数”
- 前端可查看 subagent 上下文
- 前端增加类似 `main / agent1 / agent2` 的会话切换条，数量多时支持横向滚动
- subagent 因 LLM API 失败时，要把错误直接回传到 main

### C. 消息编排与前后端职责

- 优化网络：前端可缓存的状态尽量前置，后端只发送必要信息
- 编辑消息时：
  - 如果删除了最后一条 assistant 消息
  - 再编辑并提交最后一条 user 消息
  - 不应报错；应退化成正常发送
- 如果用户在 AI 工作时继续发消息：
  - 消息进入队列
  - 等待 AI 完成或用户手动停止后自动发送
- 前端要自行适配，但前端关闭不能影响后端任务继续执行

## 当前 owner 对照

| 需求域 | 当前 owner |
| --- | --- |
| 上下文压缩 / 裁剪 | `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts`<br>`packages/server/src/conversation/conversation-message-planning.service.ts` |
| 会话记录 / 历史替换 | `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts` |
| 前端消息列表 / 编辑 / 灰化 | `packages/web/src/features/chat/components/ChatMessageList.vue` |
| 前端聊天状态 / 流式 / 重试 / 停止 | `packages/web/src/features/chat/modules/chat-store.module.ts`<br>`packages/web/src/features/chat/modules/chat-stream.module.ts` |
| subagent 持久化 / 上下文 / 会话 | `packages/server/src/runtime/host/runtime-host-subagent-store.service.ts`<br>`packages/server/src/runtime/host/runtime-host-subagent-session-store.service.ts`<br>`packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts` |
| subagent 页面 | `packages/web/src/features/subagents/views/SubagentView.vue` |
| 现有压缩配置 schema | `packages/plugin-sdk/src/authoring/context-compaction.ts`<br>`packages/plugin-sdk/src/authoring/builtin-manifest-data.json` |

## 已完成摘要（压缩版）

### S1-S9 功能对齐

- `bash / read / write / edit / glob / grep` 主链已对齐 OpenCode。
- 细节证据见 `task_plan.md / progress.md / findings.md`。

### S10-S15 体积治理

- 已把 `packages/server/src` 从 `18490` 压到 `14691`。
- 主要收益 owner：`runtime-host-subagent-runner`、`builtin-context-compaction`、`conversation-task`、`runtime-host-conversation-record`、`ai-model-execution`、`runtime-host-filesystem-backend`。
- `S15` 当前不删历史细节，只保留“需要时继续压 owner”的资格。

### S16 配置目录统一到 `config/`

- `config/ai / mcp / personas / subagent / skills` 新布局已落地。
- fresh 与独立 judge 已通过。

## 阶段计划

### N1 上下文治理内核化 `[已完成]`

- 目标：
  - 把“是否压缩 / 是否滑动裁剪 / LLM 可用上下文百分比 / 最近保留条数 / 前端缓存条数”收成稳定配置模型
  - 不再让“上下文治理”只等价于一个手动插件动作
  - 保证送模消息结构合法
- owner：
  - `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts`
  - `packages/server/src/conversation/conversation-message-planning.service.ts`
  - `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts`
  - `packages/plugin-sdk/src/authoring/context-compaction.ts`
- 交付：
  - 新增上下文治理模式：`summary` / `sliding`
  - `summary` 保留现有摘要主链
  - `sliding` 按配置百分比裁剪历史，并保留合法消息边界
  - 配置模型已补：`frontendMessageWindowSize`
  - `GET /chat/conversations/:id/context-window` 已返回动态窗口视图与 `frontendMessageWindowSize`
  - 输出“哪些消息已不进入 LLM 上下文”的动态标记，供前端灰化
  - 浏览器链路里的 `context-window` 400 已修正：
    - 预览前会把历史消息规整成合法 JSON 形状
    - `smoke:web-ui` 已不再打印 `messages[0] must be an object`
- fresh：
  - 定向 Jest：`builtin-context-compaction / conversation-message-planning / conversation-message-lifecycle / runtime-host-conversation-record`
  - `packages/server`: `npm run build`
  - root: `npm run smoke:server`
- judge：
  - 必须验证“关闭压缩后仍有上下文治理”
  - 必须验证“裁剪后消息结构合法”
  - 必须验证“不是只把旧插件改名”
  - 最新独立 judge：`PASS`
    - 结论：后端已真实修正 `context-window` 预览输入合法性，不是前端降级绕过
    - 结论：`summary / sliding / disabled` 预览链仍成立，窗口预览与前端灰化契约未回退

### N2 前端上下文窗口与灰化 `[已完成]`

- 前置：`N1`
- 目标：
  - 前端只保留最近 `k` 条消息缓存
  - 被裁出 LLM 上下文但仍在聊天记录里的消息灰化显示
  - 提供上下文治理配置 UI
- 已落地：
  - `chat-store` 已持有 `contextWindowPreview`
  - 前端消息缓存已按 `frontendMessageWindowSize` 裁剪为最近窗口
  - `ChatMessageList` 已按 `excludedMessageIds` 灰化，而不是误删历史
  - `context-window` 预览失败时，前端已降级为“不阻断 send/retry/compact”
  - 插件配置页保存 `builtin.context-compaction` 的配置或作用域后，会即时通知聊天 store 刷新当前会话窗口预览
- owner：
  - `packages/web/src/features/chat/modules/chat-store.module.ts`
  - `packages/web/src/features/chat/modules/chat-stream.module.ts`
  - `packages/web/src/features/chat/components/ChatMessageList.vue`
  - `packages/web/src/features/chat/views/ChatView.vue`
- fresh：
  - `packages/web`: `npm run build`
  - root: `npm run smoke:web-ui`
  - root: `npm run smoke:server`
- judge：
  - 必须验证“前端不再无上限缓存全部消息”
  - 必须验证“灰化仅影响展示，不误删历史”
  - 必须验证“配置切换即时作用到当前聊天链路”
  - 最新独立 judge：`PASS`
    - 结论：消息窗口裁剪、灰化展示、配置变更即时刷新三条链都已落地
    - 残余风险：`scope` 变更虽走同一路径，但可继续补一条前端测试证据

### N3 Subagent 会话窗口与上限 `[已完成]`

- 前置：`N1`
- 目标：
  - 会话级 subagent 最大数量可配置
  - subagent context 可查看
  - 前端提供 `main / agent*` 窗口切换条与横向滚动
- 已落地：
  - `builtin.subagent-delegate` 配置新增 `session.maxConversationSubagents`
  - 新建 subagent session 时，后端会按 `conversationId` 统计真实 session 数；达到上限后直接报错，继续已有 `sessionId` 不受影响
  - 前端 `SubagentView` 已新增按主会话聚合的工作区：
    - 会话条
    - `main / agent*` 窗口条
    - 当前激活 agent 的上下文消息与执行结果详情
  - 窗口切换只走 overview/detail 只读链路，不改后端运行态
- owner：
  - `packages/server/src/runtime/host/runtime-host-subagent-store.service.ts`
  - `packages/server/src/runtime/host/runtime-host-subagent-session-store.service.ts`
  - `packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts`
  - `packages/web/src/features/subagents/views/SubagentView.vue`
- fresh：
  - 定向 Jest：`runtime-host-subagent-store / runtime-host-subagent-session-store / runtime-host-subagent-runner / plugin controller`
  - `packages/server`: `npm run build`
  - `packages/web`: `npm run build`
  - root: `npm run smoke:server`
- 最近 fresh：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/adapters/http/plugin/plugin.controller.spec.ts tests/adapters/http/plugin/plugin-subagent.controller.spec.ts tests/plugin/builtin/tools/builtin-subagent-delegate.plugin.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `packages/server`: `npm run build`
  - `packages/web`: `npx vitest run tests/features/subagents/composables/use-plugin-subagents.spec.ts tests/features/subagents/views/SubagentView.spec.ts`
  - `packages/web`: `npm run build`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- judge：
  - 必须验证“超过上限时行为明确，不悄悄丢”
  - 必须验证“subagent 上下文真实可读，不只是摘要壳”
  - 必须验证“前端切换窗口不影响后端已运行任务”
  - 最新独立 judge：`PASS`
    - 结论：会话级上限、真实上下文查看、`main / agent*` 窗口切换与只读切换链都已成立
    - 结论：上一轮 `FAIL` 只因阶段材料未同步；现已补齐，可标记完成

### N4 消息编辑、排队与失败回写 `[已完成]`

- 前置：`N1`
- 目标：
  - 用户在 AI 工作时发出的新消息进入队列
  - AI 空闲或被 stop 后自动发送
  - 删除最后一条 assistant 后，编辑最后一条 user 失败时退化成正常发送
  - subagent LLM API 失败时把错误直接回到 main
- 已落地：
  - `chat-store` 已改成前端 FIFO 发送队列：
    - 新消息先入队
    - 当前回复结束后自动 drain
    - 用户手动 stop 后也会继续发送已排队消息
  - 前端编辑最后一条非 `display` 的 `user` 消息时：
    - 若它已成为会话尾部消息，则不再走普通 patch
    - 会先删原消息，再按正常发送链重发，避免“删掉最后 assistant 后再编辑最后 user”报错
  - `RuntimeHostSubagentRunnerService` 在 subagent 执行失败时，若配置了 `writeBack.target`，会把 `子代理执行失败：...` 直接写回主会话
- owner：
  - `packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts`
  - `packages/web/src/features/chat/modules/chat-store.module.ts`
  - `packages/web/src/features/chat/modules/chat-view.module.ts`
  - `packages/web/src/features/chat/components/ChatComposer.vue`
- fresh：
  - 定向 Jest：`conversation-task / conversation-message-lifecycle / runtime-host-subagent-runner`
  - `packages/server`: `npm run build`
  - `packages/web`: `npm run build`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- 最近 fresh：
  - `packages/web`: `npx vitest run tests/features/chat/store/chat-store.module.spec.ts tests/features/chat/composables/use-chat-view.spec.ts`
  - `packages/web`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `packages/server`: `npm run build`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- judge：
  - 必须验证“排队消息不会丢，也不会并发抢跑”
  - 必须验证“编辑最后 user 的回退语义正确”
  - 必须验证“subagent API error 已回写 main，而不是只留在后台页”
  - 最新独立 judge：`PASS`
    - 结论：发送队列是真正串行 drain，不是只把发送按钮放开
    - 结论：最后 user 编辑分支已退化为“删原消息后正常发送”，不是普通 patch 假装成功
    - 结论：subagent 错误已真实写回 main conversation，不再只留在后台页

### N5 网络收口与前后端职责重分 `[已完成]`

- 前置：`N2-N4`
- 目标：
  - 后端只发必要信息
  - 前端承担可缓存的派生状态
  - 但后端在无前端连接时仍可完整跑完 agent / subagent
- 当前已落地：
  - `send / retry / selectConversation / provider-model 切换 / context-compaction 配置变更` 已删掉多余 detail 刷新
  - `stopStreaming()` 已改为本地尾部 assistant `stopped` 修正，只刷新 `context-window / runtime permissions / todo`
  - `update / delete / compact` 已停止无关的 `runtime-permissions` 刷新：
    - `update / delete` 只刷新 `list / context-window / todo`
    - `compact` 只刷新 `list / detail / context-window / todo`
  - `send / retry` 已改为“只有流中真的出现过权限事件，才刷新 `runtime-permissions/pending`”
  - 未使用的旧手动压缩入口 `chat-store.compactContext()` 与其 data/api 包装已删除，页面继续走真实 `/compact` 发送链
  - `send / retry` 发送前的 `context-window` 预取已删除，当前页面只保留发送结束后的窗口刷新
  - `chat-stream` 未使用的 `scheduleChatRecovery()` 壳已删除
  - `stopStreaming()` 里的无效 recovery 调度已删除；stop 后直接走尾部状态刷新与排队消息 drain
  - 后端已补两层证据：
    - task 层：listener unsubscribe 后任务仍会继续并持久化 assistant
    - HTTP controller 层：SSE `close` 只取消 listener，不中断 `waitForTask()`
- owner：
  - `packages/server/src/adapters/http/**`
  - `packages/server/src/conversation/**`
  - `packages/web/src/features/chat/modules/**`
- fresh：
  - `packages/web`: `npx vitest run tests/features/chat/store/chat-store.module.spec.ts tests/features/chat/store/chat-store.dispatch.spec.ts tests/features/chat/composables/use-chat-view.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation.controller.spec.ts tests/conversation/conversation-task.service.spec.ts`
  - `packages/server`: `npm run build`
  - `packages/web`: `npm run build`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- judge：
  - 必须验证“不是简单少发字段打坏前端”
  - 必须验证“前端断开不影响后端继续执行”
  - 最新独立 judge：`PASS`
    - 结论：刷新已按 `summary / message-derived / stream / tail` 重分职责，不是旧全量刷新换名
    - 结论：前端重复 `detail / runtime-permissions / context-window` 请求链已被真实收掉，前端行为未回退
    - 结论：SSE 断开只取消 listener，后端 task 仍继续执行并持久化结果

### N6 总验收 `[已完成]`

- 前置：`N1-N5`
- fresh：
  - `packages/shared`: `npm run build`
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - `packages/web`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
  - root: `npm run count:server-src` -> `14998`
- judge：
  - 检查 `task.txt` 所有要求都能映射到真实 owner 与可见行为
  - 检查没有“前端只是显示壳、后端没有真语义”的假完成
  - 检查 `packages/server/src <= 15000`
  - 最新独立 judge：`PASS`
    - 结论：`task.txt` 三条主线都已映射到真实后端/前端 owner，不是前端展示壳
    - 结论：`N5/N6` 未见“前端只是显示、后端没有真语义”的假完成
    - 结论：`packages/server/src = 14998`，已满足体积门槛

## 最近证伪路线

- `shared` 下沉运行逻辑：已判定违反边界，不再重试。
- “只保留上下文压缩插件按钮，不做滑动窗口”：不能满足 `task.txt`，不再重试。
- “前端继续缓存全部消息，再靠虚拟列表兜住性能”：不能满足 `task.txt`，不再重试。
- “subagent 只保留后台总览页，不进入会话窗口”：不能满足 `task.txt`，不再重试。

## 完成定义

- 只有 `N1-N6` 都完成，且每阶段 fresh 与 judge 都齐全，才能说“本轮完成”。
