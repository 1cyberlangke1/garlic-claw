# 2026-04-19 Skill 对齐 OpenCode

## 2026-04-25 记忆上下文避免打断 cache 并持久化

### 目标

- 修正 `builtin.memory-context` 直接改 `systemPrompt` 的注入方式，避免每次命中记忆都打断 provider prompt cache。
- 为 `RuntimeHostUserContextService` 增加本地 json 持久化，保证记忆可跨服务重启恢复。
- 不改 `shared` 契约，不新增兼容层，不把记忆逻辑外推到别的 owner。

### 范围

- `packages/server/src/plugin/builtin/hooks/builtin-memory-context.plugin.ts`
- `packages/server/src/runtime/host/runtime-host-user-context.service.ts`
- `packages/server/tests/plugin/builtin/hooks/builtin-memory-context.plugin.spec.ts`
- `packages/server/tests/runtime/host/runtime-host-user-context.service.spec.ts`

### 实现约束

- 记忆注入只允许改 `messages`，不再改 `systemPrompt`。
- 注入位置固定为“最新 user 消息之前”的合成上下文消息，尽量保持静态前缀稳定。
- 持久化默认使用 `process.cwd()/tmp/memories.server.json`。
- 可通过 `GARLIC_CLAW_MEMORIES_PATH` 覆盖持久化路径。
- Jest 默认不落盘，除非显式设置 `GARLIC_CLAW_MEMORIES_PATH`。

### 验收

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-memory-context.plugin.spec.ts tests/runtime/host/runtime-host-user-context.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-lifecycle.service.spec.ts tests/runtime/host/runtime-host.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`

## 2026-04-25 配置目录统一到 config

### 目标

- 把用户维护配置统一迁到仓库根 `config/`。
- provider 配置改成“每个 provider 一个独立 json 文件”。
- `persona / subagent / mcp / skill governance` 统一 json。
- 不做旧布局兼容层，直接切新布局。

### 范围

- `packages/server/src/ai-management/*`
- `packages/server/src/persona/persona-store.service.ts`
- `packages/server/src/execution/project/project-subagent-type-registry.service.ts`
- `packages/server/src/execution/mcp/mcp-config-store.service.ts`
- `packages/server/src/execution/skill/skill-registry.service.ts`
- `packages/server/scripts/http-smoke.mjs`
- 对应 Jest 与文档引用

### 新布局

- `config/ai/providers/<providerId>.json`
- `config/ai/host-model-routing.json`
- `config/ai/vision-fallback.json`
- `config/mcp/servers/<name>.json`
- `config/personas/<personaId>/persona.json`
- `config/personas/<personaId>/prompt.md`
- `config/personas/<personaId>/avatar.*`
- `config/subagent/<id>/subagent.json`
- `config/subagent/<id>/prompt.md`
- `config/skills/governance.json`
- `config/skills/definitions/<name>/SKILL.md`

### 验收

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai-management/ai-provider-settings.service.spec.ts tests/persona/persona.service.spec.ts tests/execution/project/project-subagent-type-registry.service.spec.ts tests/execution/mcp/mcp-config.service.spec.ts tests/execution/mcp/mcp.service.spec.ts tests/execution/skill/skill-registry.service.spec.ts tests/adapters/http/mcp/mcp.controller.spec.ts tests/adapters/http/persona/persona.controller.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`

## 2026-04-25 S15 subagent-runner owner 继续收口（七次）

### 当前稳定值

- `packages/server/src` 非空行：`14691`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已删除只被单点调用的异步包装 `completeSubagentAsync()`，`scheduleSubagentExecution()` 直接承接 `restoreStoredSubagentExecution() -> executeStoredSubagent()` 调度链
  - `readSubagentRequest()` 直接承接 `toolNames` 非空字符串过滤，已删除单点 `isNonEmptyString()`
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - 文件物理行数：`523 -> 515`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14691`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义保持
  - 单点异步包装与字符串过滤包装已真实删除，owner 语义没有外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 留在 `runtime-host-subagent-runner.service.ts`
- 继续删 `start/run/restore` 的 result/session/write-back 收尾重复链，但不外推 raw request / execution request 边界、before/after hook、revision changed 或 subagentType 语义

## 2026-04-25 S15 subagent-runner owner 继续收口（六次）

### 当前稳定值

- `packages/server/src` 非空行：`14699`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已删除只在当前 owner 单点调用的包装：`readWriteBackConversationRevision / readSubagentRequestPreview / writeSubagentSessionRequest`
  - `startSubagent()` 直接读取 write-back revision，`resolveSubagentInvocation()` 直接承接 request preview 生成，`persistSubagentSession()` update 分支直接承接 session request 写回
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - 文件物理行数：`530 -> 523`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14699`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义保持
  - 单点包装已真实删除，owner 语义没有外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 留在 `runtime-host-subagent-runner.service.ts`
- 继续删 `start/run/restore` 的 result/session/write-back 收尾重复链，但不外推 raw request / execution request 边界、before/after hook、revision changed 或 subagentType 语义

## 2026-04-25 S15 subagent-runner owner 继续收口（五次）

### 当前稳定值

- `packages/server/src` 非空行：`14706`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已把 `restoreStoredSubagentExecution()` 与 `resolveSubagentSession()` 的双段主链继续收成单一 restore 主链
  - restore 侧直接承接 session 读取、旧 session 缺失时的 fallback 重建、history/request 重建与 snapshot 同步判定
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - 文件物理行数：`542 -> 530`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14706`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义保持
  - `restore + resolve session` 双段主链已真实删除，owner 语义没有外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 留在 `runtime-host-subagent-runner.service.ts`
- 继续删 `start/run/restore` 的 result/session/write-back 收尾重复链，但不外推 raw request / execution request 边界、before/after hook、revision changed 或 subagentType 语义

## 2026-04-25 S15 subagent-runner owner 继续收口（四次）

### 当前稳定值

- `packages/server/src` 非空行：`14718`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已把 restore session 所需的 history/request 拼装、session create payload 与 execution request 组装继续压回同一 owner 主链
  - 已删除 `readStoredSubagentHistoryMessages / readStoredSubagentSessionRequest / createSubagentSessionPayload / readSubagentExecutionRequestFromSession / hasStoredSubagentSessionSnapshotChanged`
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - 文件物理行数：`553 -> 542`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14718`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义保持
  - restore session 拼装、session create payload 与 execution request 组装继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 留在 `runtime-host-subagent-runner.service.ts`
- 继续删 `start/run/restore` 的 result/session/write-back 收尾重复链，但不外推 raw request / execution request 边界、before/after hook、revision changed 或 subagentType 语义

## 2026-04-25 S15 context-compaction owner 继续收口（四次）

### 当前稳定值

- `packages/server/src` 非空行：`14729`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `builtin-context-compaction.plugin.ts`
  - 已把命令短路回复、auto-stop 状态读取与 summary 插入点判定继续压回同一 owner 主链
  - `message:received` 直接复用 `createContextCompactionCommandShortCircuit(...)`，不再经过额外 reply formatter
  - `/compact`、`/compress`、route `context-compaction/run`、`conversation:history-rewrite`、`chat:before-model`、summary/covered annotation、auto-stop、revision 写回语义仍留在同一 owner
  - 文件物理行数：`395 -> 388`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14729`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `/compact`、`/compress`、route `context-compaction/run`、`conversation:history-rewrite`、`chat:before-model`、summary / covered annotation、auto-stop、revision 写回语义保持
  - 命令短路回复、auto-stop 状态读取与 summary 插入点判定继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `runtime-host-subagent-runner.service.ts`
- 继续删 subagent runner owner 里 run/start/resume/restart 与 session/write-back/snapshot 装配的重复状态链，但不外推 raw request / execution request 边界、before/after hook、revision changed 或 subagentType 语义

## 2026-04-25 S15 conversation-task owner 继续收口（四次）

### 当前稳定值

- `packages/server/src` 非空行：`14736`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `conversation-task.service.ts`
  - 已把 `finishTask()` 里只服务一次的 terminal event / completed result / snapshot 组装壳继续压回主链
  - `persistTaskSnapshot()` 直接构造终态 snapshot，不再经过额外 `buildConversationTaskSnapshot(...)`
  - `streaming / stopped / error / completed`、snapshot 持久化、completed result、patched writeMessage、permission event、tool-call / tool-result normalize、customBlocks finalize、onComplete / onSent 语义仍留在同一 owner
  - 文件物理行数：`395 -> 380`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation.controller.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14736`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `streaming / stopped / error / completed`、snapshot 持久化、completed result、patched writeMessage、permission event、tool-call / tool-result normalize、customBlocks finalize、onComplete / onSent 语义保持
  - terminal event、completed result 与 snapshot 组装继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `builtin-context-compaction.plugin.ts`
- 继续删 context-compaction owner 里 history state / summary apply / annotation finalize 的重复状态链，但不外推 `/compact`、`/compress`、history rewrite、before-model、route、summary/covered annotation、auto-stop 或 revision 语义

## 2026-04-25 S15 conversation-record owner 继续收口（三次）

### 当前稳定值

- `packages/server/src` 非空行：`14751`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-conversation-record.service.ts`
  - 已把 conversation 读模型继续收成 `readConversationRecordValue(...)`
  - `overview / detail / summary / history` 继续共用同一 owner 内投影主链
  - `keepConversationSession()` 与 `startConversationSession()` 继续共用 `saveConversationSession(...)`
  - `create/delete/read/list`、`persist/load/migration`、`session keep/start/finish`、`history preview/replace`、`hostServices`、`runtimePermissionApprovals`、`activePersona`、revision 保护语义仍留在同一 owner
  - 文件物理行数：`405 -> 391`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation-task.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14751`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `create/delete/read/list`、`persist/load/migration`、`session keep/start/finish`、`history preview/replace`、`hostServices`、`runtimePermissionApprovals`、`activePersona`、revision 保护语义保持
  - conversation 读模型与 session 写回继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `conversation-task.service.ts`
- 继续删 task owner 里 `streaming / stopped / error / completed` 的 snapshot/result/writeMessage 终态重复链，但不外推 permission event、tool-call-result normalize、customBlocks finalize 或 patched result 语义

## 2026-04-25 S15 context-compaction owner 继续收口（三次）

### 当前稳定值

- `packages/server/src` 非空行：`14765`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `builtin-context-compaction.plugin.ts`
  - 已把旧的 `ContextCompactionHistoryState` 类壳压回纯函数主链
  - `readContextCompactionHistoryState(...)` 负责历史视图与送模视图
  - `readContextCompactionSummaryInsertIndex(...)` 负责 summary 插入点判定
  - `message:received` 与 route `context-compaction/run` 继续共用 `runManualContextCompaction(...)`
  - `/compact`、`/compress`、`conversation:history-rewrite`、`chat:before-model`、summary/covered annotation、auto-stop、revision 写回语义仍留在同一 owner
  - 文件物理行数：`401 -> 395`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14765`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `/compact`、`/compress`、route `context-compaction/run`、`conversation:history-rewrite`、`chat:before-model`、summary / covered annotation、auto-stop、revision 写回语义保持
  - 历史状态读取与 summary 插入点判定继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `runtime-host-conversation-record.service.ts`
- 继续删 conversation record owner 里 session/history/hostServices/todo/summary 的重复读写链，但不外推 persist/load/migration、revision 保护或 activePersona 语义

## 2026-04-25 S15 conversation-task owner 继续收口（三次）

### 当前稳定值

- `packages/server/src` 非空行：`14771`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `conversation-task.service.ts`
  - 已把 outcome 判定、snapshot / completed result / writeMessage payload 继续压回同一终态主链
  - `buildCompletedConversationTaskResult(...)` 改为直接复用 snapshot，不再重复组装字段
  - `streaming / stopped / error / completed`、patched result / onSent、permission event、tool-call / tool-result normalize、customBlocks finalize 语义仍留在同一 owner
  - 文件物理行数：`417 -> 397`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation.controller.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14771`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `streaming / stopped / error / completed`、snapshot 持久化、completed result、patched writeMessage、permission event、tool-call / tool-result normalize、customBlocks finalize、onComplete / onSent 语义保持
  - outcome 判定与终态写回数据结构继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `runtime-host-conversation-record.service.ts`
- 继续删 conversation record owner 里 session/history/hostServices/todo/summary 的重复读写链，但不外推 persist/load/migration、revision 保护或 activePersona 语义

## 2026-04-25 S15 subagent-runner owner 继续收口（三次）

### 当前稳定值

- `packages/server/src` 非空行：`14793`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已把 `startStoredSubagent()` 与 `restoreStoredSubagentExecution()` 的 execution input 装配继续收成 `readStoredSubagentExecutionInput(...)`
  - session snapshot 变更判定已收成 `hasStoredSubagentSessionSnapshotChanged(...)`
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - 文件物理行数：`559 -> 553`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14793`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack、before/after hook、subagentType default 语义保持
  - execution input 装配与 snapshot 变更判定继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `conversation-task.service.ts`
- 继续删 `streaming / stopped / error / completed` 的 snapshot/result/event 收尾链，但不外推 task contract、permission event、tool-call-result normalize 或 customBlocks finalize 语义

## 2026-04-25 S15 context-compaction owner 继续收口（二次）

### 当前稳定值

- `packages/server/src` 非空行：`14799`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `builtin-context-compaction.plugin.ts`
  - 已把 `/compact`、`/compress` 与 route `context-compaction/run` 的手动执行入口继续收成同一主链 `runManualContextCompaction(...)`
  - 已删除 `ContextCompactionHistoryState` 不再需要的状态统计壳，compaction 结果收尾不再经额外 covered-count 状态读回
  - `conversation:history-rewrite`、`chat:before-model`、summary/covered annotation、auto-stop、revision 写回语义仍留在同一 owner
  - 文件物理行数：`410 -> 401`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14799`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `/compact`、`/compress`、route、history rewrite、before-model、summary/covered annotation、auto-stop 与 revision 写回语义保持
  - 手动入口与 compaction 收尾继续压回当前 owner 主链，没有语义外溢
  - 这刀可计入 `S15` 进度

### 下一步

- 切回 `runtime-host-subagent-runner.service.ts`
- 继续删 `run/start/resume/restart` 与 session/write-back/snapshot 装配里的重复状态流，但不外推 subagent contract、revision 判定、before/after hook 或 raw request 语义

## 2026-04-25 S15 conversation-record owner 继续收口（二次）

### 当前稳定值

- `packages/server/src` 非空行：`14808`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-conversation-record.service.ts`
  - 已把 `keepConversationSession / startConversationSession / previewConversationHistory / writeConversationHostServices / rememberRuntimePermissionApproval` 的重复收尾链继续压回同一 owner
  - `replaceConversationHistory()` 已去掉 owner 内部重复 revision assert，revision 保护仍留在同一主链
  - `create/delete/read/list`、`persist/load/migration`、`session keep/start/finish`、`history preview/replace`、`runtimePermissionApprovals`、`activePersona` 语义仍留在同一 owner
  - 文件物理行数：`434 -> 405`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation-task.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14808`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `create/delete/read/list`、`persist/load/migration`、`session keep/start/finish`、`history preview/replace`、`hostServices`、`runtimePermissionApprovals`、`activePersona` 与 revision 保护语义保持
  - 旧的并行写回链继续被压回 `updateConversationRecord()` 主链，owner 语义没有散出
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `builtin-context-compaction.plugin.ts`
- 继续删 `resolve config/target -> preview -> summary -> predicted history -> annotation -> replace` 主链里的重复状态流，但不外推 `/compact`、`/compress`、history rewrite、before-model、route、summary/covered annotation 或 revision 语义

## 2026-04-25 S15 conversation-task owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`14837`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `conversation-task.service.ts`
  - 已把 completed 终态里的重复 snapshot/result 组装收成单一主链
  - `finishTask()` 与 `persistTaskSnapshot()` 已共享同一份 snapshot
  - completed result 改为基于现成 snapshot 构造，不再重复组装 `content / metadata / parts / toolCalls / toolResults`
  - `streaming / stopped / error / completed`、patched result / onSent、permission event、tool-call / tool-result / tool-error normalize、customBlocks finalize 语义仍留在同一 owner
  - 文件物理行数：`435 -> 417`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation.controller.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14837`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `streaming / stopped / error / completed` 终态链、patched result / onSent、permission event、tool-call / tool-result 持久化与 customBlocks finalize 语义保持
  - completed 终态里的重复 snapshot/result 组装确实已删除
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `runtime-host-conversation-record.service.ts`
- 继续删 conversation record owner 里 history/approval/hostServices/session keep 的重复写回链，但不外推 persist/load/migration、history preview/replace 或 revision 语义

## 2026-04-25 S15 subagent-runner owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`14855`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已把真正执行时使用的 request 统一收回 session owner
  - start/restore execution 都改为从 session 读取 execution request
  - subagent store 继续保留 raw request，resumable 语义不变
  - `executeStoredSubagent()` 的 `running/completed/error` 三段 `updateSubagent` 写回链收成统一 `writeStoredSubagentExecutionState`
  - `background / inline`、pending resume、session 重建 / snapshot 同步、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 与 tool/provider/model/system 覆盖语义仍留在同一 owner
  - 文件物理行数：`566 -> 559`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14855`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - subagent record 仍保留 raw request，session 才承接已解析 execution request，resumable 语义保持
  - pending resume、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 与 tool/provider/model/system 覆盖语义保持
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `conversation-task.service.ts`
- 继续删 task runtime 里 `streaming / stop / error / completed` 的 snapshot/result/event 重复收尾链，但不外推 task contract、permission event 或 tool-call-result 语义

## 2026-04-25 S15 shell hints owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`14862`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-shell-command-hints.ts`
  - 已把 PowerShell 写路径选择与 flag 值扫描收成更短主链
  - `readRuntimePowerShellDestinationTargets / readRuntimePowerShellWriteTargets / readRuntimePowerShellComposedTargets / readRuntimePowerShellCommandPath` 已收成 `readRuntimePowerShellWriteSelection`
  - shell 与 PowerShell 的 `wantsValue` 平行扫描已收成统一 `readRuntimeOptionValues`
  - `copy-item / move-item / new-item / rename-item / remove-item / set-content / add-content / out-file / mkdir`
  - `scp / tar / git` 写目标判定、quoted attached、single-quoted literal、Join-Path、provider prefix、env/local variable、remove-item include/exclude 保护语义仍留在同一 owner
  - 文件物理行数：`388 -> 386`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14862`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - PowerShell 写路径选择、flag 值扫描、quoted attached、Join-Path、provider prefix、env/local variable、`scp / tar / git` 写目标判定都仍留在当前 owner
  - `remove-item` 仍只把 `-path / -literalpath` 认作删除目标，`include / exclude / filter / stream` 没被误提成 write target
  - 这刀可计入 `S15` 进度

### 下一步

- 切回 `runtime-host-subagent-runner.service.ts`
- 继续删 `run/start/resume/restart` 与 session/write-back/snapshot 装配里的重复状态流，但不外推 subagent contract、revision 判定或 hook 语义

## 2026-04-25 S15 filesystem backend owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`14864`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-filesystem-backend.service.ts`
  - 已把 `edit/write/list` 这组重复状态流继续收短
  - `editTextFile()` 把“空旧文本写入”和“普通 replace”收成同一写回主链
  - `writeResolvedTextFile()` 的 diff base 读取收成 `readRuntimeHostFilesystemDiffBase()`
  - `listFiles()` 的 `partial / skippedEntries / skippedPaths` 收尾链收短
  - `resolvePath / statPath / readDirectoryEntries / readPathRange / readTextFile`
  - `writeTextFile / editTextFile / copyPath / movePath / deletePath / ensureDirectory / symlink`
  - `globPaths / grepText`、`diff / postWrite / CRLF`、missing path suggestion 与 trimmed-boundary 保护语义仍留在同一 owner
  - 文件物理行数：`392 -> 385`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/runtime/runtime-tool-backend.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14864`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `editTextFile` 的 create-style edit 与普通 replace 已统一到同一写回主链
  - `diff / postWrite / CRLF`、binary/offset/byteLimited/maxLineLength、missing path suggestion、trimmed-boundary 保护语义保持
  - 这刀可计入 `S15` 进度

### 下一步

- 切到 `runtime-shell-command-hints.ts`
- 继续删 shell hints owner 内的命令分派、flag/path token 提取与提示汇总重复主链，但不外推 AST、permission hint 或 path summary 语义

## 2026-04-25 S15 ai-model-execution owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`14871`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `ai-model-execution.service.ts`
  - 已把 `generateText / transportMode=stream-collect` 的重复执行主链收成单一 `readTextExecutionResult`
  - 重复的结果归约壳已删除；invalid tool repair 的 `inputText` 读取也已收成单次计算
  - fallback target、usage 估算、response-body/raw custom blocks、tool repair、openai-compatible SSE normalize 语义仍留在同一 owner
  - 文件物理行数：`398 -> 385`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai/ai-model-execution.service.spec.ts tests/conversation/conversation-task.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14871`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `generateText`、`streamText`、`transportMode=stream-collect`、fallback target、usage 估算、response-body/raw custom blocks、tool repair、openai-compatible SSE normalize` 语义保持
  - `runAcrossTargets / runAcrossTargetsSync` 继续负责 fallback；`streamText` 继续保留直接返回流的主链
  - 这刀可计入 `S15` 进度

## 2026-04-25 S15 context-compaction owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`14884`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `builtin-context-compaction.plugin.ts`
  - 已把 `resolve config/target -> preview -> summary -> predicted history -> annotation -> replace` 收成更短主链
  - 旧的双层执行入口与几段只服务该主链的中间函数已删除
  - `/compact`、`/compress`、`conversation:history-rewrite`、`chat:before-model`、route `context-compaction/run`、summary/covered annotation、auto-stop 语义仍留在同一 owner
  - 文件物理行数：`431 -> 410`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14884`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `/compact`、`/compress`、`conversation:history-rewrite`、`chat:before-model`、route `context-compaction/run`、summary/covered annotation、auto-stop、history preview/replace` 语义保持
  - `enabled`、`mode !== auto`、`threshold-not-reached`、`not-enough-history`、`empty-summary`、`invalid-history`、`allowAutoContinue` 与 revision 保护仍在主链
  - 这刀可计入 `S15` 进度

## 2026-04-25 S15 conversation-record owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`14905`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-conversation-record.service.ts`
  - 已把 `replace/history/hostServices/approval/activePersona` 的重复写回链收成统一主线 `updateConversationRecord<T>`
  - 旧的 `createConversationRecord / writeConversation / mutateConversation / bumpRevision` 已删除
  - `create/delete/read/list`、`persist/load/migration`、`session keep/start/finish`、`history preview/replace`、`runtimePermissionApprovals` 语义仍留在同一 owner
  - 文件物理行数：`448 -> 434`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation-task.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14905`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `create/delete/read/list`、`hostServices`、`runtimePermissionApprovals`、`replaceMessages/activePersona/todo`、`persist/load/migration`、`history preview/replace` 与 revision conflict 语义保持
  - `session keep/start/finish`、`captureHistory/timeout/resetTimeout/过期清理` 仍留在当前 owner
  - 这刀可计入 `S15` 进度

## 2026-04-25 S15 subagent-runner owner 收口

### 当前稳定值

- `packages/server/src` 非空行：`14944`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已把 `run/start/restart` 共享的 invocation/session/subagent 创建链收成 `startStoredSubagent / restoreStoredSubagentExecution / persistSubagentSession`
  - `session / request / write-back / snapshot / before-after hook` 语义仍留在同一 owner
  - 文件物理行数：`605 -> 566`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14944`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是压格式
  - `run/start/resume/restart`、session 绑定、write-back revision、subagent type 默认值、before/after hook 语义保持
  - 这刀可计入 `S15` 进度

## 2026-04-25 S15 conversation-task owner 收口

### 当前稳定值

- `packages/server/src` 非空行：`14919`
- `S15` 当前仍是进行中；这一刀 fresh 与独立 judge 已完成

### 本轮新增

- `conversation-task.service.ts`
  - 已把 `streaming / stop / error / completed` 的 message snapshot 与 terminal 收尾链收成 `ConversationTaskRuntime / persistTaskSnapshot / finishTask`
  - `patched completion / permission event / tool-call-result` 语义仍留在同一 owner
  - 文件物理行数：`460 -> 435`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation.controller.spec.ts`
  - `npm run build`
- root
  - `npm run lint`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14919`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收口，不是换壳压格式
  - `streaming/stop/error/completed`、patched completion、permission event、tool-call-result 持久化语义保持
  - 这刀可计入 `S15` 进度

## 2026-04-25 S14 后续收尾：warning 清零

### 当前稳定值

- `packages/server/src` 非空行：`14983`
- lint：`0 errors / 0 warnings`

### fresh

- root
  - `npm run lint`
  - `npm run count:server-src` -> `14983`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- `packages/server`
  - `npm run build`

### 本轮新增

- 已移除剩余 warning：
  - unused import / type
  - non-null assertion
  - 重复 normalize 调用
- 当前 warning 已清零，行为未变

## 2026-04-25 S14 总 judge 通过

### 当前稳定值

- `packages/server/src` 非空行：`14973`
- `S14` 已完成

### fresh

- root
  - `npm run lint` -> `0 errors / 11 warnings`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run smoke:web-ui`
  - `npm run count:server-src` -> `14973`
- `packages/server`
  - `npm run build`

### judge

- 结果：`PASS`
- 结论：
  - `curly: all` 已恢复，当前过线不是靠放宽规则
  - `bash / read / write / edit / glob / grep` 未见新的公开语义回退
  - `S14` 可以标记为已完成
  - 当前可宣告本轮完成

## 2026-04-25 S14 总 judge 失败

### 结论

- 结果：`FAIL`
- judge 认可：
  - `bash / read / write / edit / glob / grep` 没有明显公开语义回退
  - `plugin-bootstrap / ai-model-execution / context-compaction` 的收口仍成立
- judge 否决点：
  - `eslint.config.mjs` 把 `curly` 从 `all` 放宽到 `multi-line`
  - 这会让当前 `14973 <= 15000` 的过线带上风格规则放松嫌疑
  - 因此不能据此宣告 `S14` 或“本轮完成”

### 后续要求

- 回退 lint 规则放宽
- 保持 `S13` 已完成
- 继续在不放宽 `curly: all` 的前提下做 owner 级真实减量

## 2026-04-25 S13 plugin-bootstrap owner 重写并结题

### 当前稳定值

- `packages/server/src` 非空行：`14973`
- 相对上一稳定值 `15106`：净减 `133`
- `S13` 已完成，下一阶段转入 `S14`

### 本轮新增

- `plugin-bootstrap.service.ts`
  - 已把 remote 注册、manifest 字段赋值、config/remote reader 收成更短主链
  - 主链收口为 `normalizeRemotePluginInput -> createRemotePluginRegistration -> registerPlugin`
  - `normalizePluginManifest / readConfigNode / readRemoteDescriptor / normalizeRemoteRecord` 仍留在同一 owner
  - 文件物理行数：`355 -> 220`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/remote/plugin-remote-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `14973`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - `plugin-bootstrap.service.ts` 这轮属于 owner 级真实收口，不是只压成一行
  - register/upsert/builtin bootstrap、manifest/config/remote 解释权未散出当前 owner
  - 当前总量 `14973 <= 15000`，`S13` 可以标记为已完成

## 2026-04-25 S13 context-compaction owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15202`
- 相对上一稳定值 `15359`：净减 `157`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `builtin-context-compaction.plugin.ts`
  - 已把 `history view / model view / annotation scan / summary insert / covered marker sync` 收成同一 owner 主链
  - `/compact`、`/compress`、history rewrite、before-model mutate、route run 仍留在同一 owner
  - 文件物理行数：`587 -> 430`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15202`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - `builtin-context-compaction.plugin.ts` 这轮属于 owner 级真实收口，不是换壳；`/compact` 与 `/compress`、history rewrite、auto-stop、before-model mutate、summary/covered annotation、route run 语义保持
  - 这刀可计入 `S13` 进度

## 2026-04-25 S13 ai-model / host-values / gateway-lifecycle owner 收口

### 当前稳定值

- `packages/server/src` 非空行：`15359`
- 相对上一稳定值 `15389`：净减 `30`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `ai-model-execution.service.ts`
  - 已把 `generate / stream / stream-collect` 三条 fallback 执行链收成 `runAcrossTargets / runAcrossTargetsSync / buildToolExecutionOptions / readGeneratedTextResult / readCollectedStreamResult`
  - tool repair、custom blocks、usage 估算、openai-compatible SSE normalize 仍留在同一 owner
  - 文件物理行数：`506 -> 495`
- `runtime-host-values.ts`
  - 已把 assistant `raw/message` custom block 平行 reader 收成 `readAssistantCustomBlocks`
  - `tool-error -> invalid result` 与 plugin llm messages 校验仍留在同一 owner
  - 文件物理行数：`224 -> 208`
- `runtime-gateway-connection-lifecycle.service.ts`
  - 已把连接认证、注册前鉴权、断连 offline 标记收成 `disconnectPreviousPluginConnection / requireAuthenticatedPluginConnection / markPluginOffline`
  - `authenticate/register/disconnect/heartbeat` 与 remote auth mode 解释权仍留在同一 owner
  - 文件物理行数：`217 -> 214`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/gateway/runtime-gateway-connection-lifecycle.service.spec.ts tests/ai/ai-model-execution.service.spec.ts tests/conversation/conversation-task.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15359`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - `ai-model-execution.service.ts` 这轮属于 owner 级真实收口，不是换壳；generate/stream/stream-collect fallback、tool repair、custom blocks、usage、SSE normalize 语义保持
  - `runtime-host-values.ts` 这轮属于 owner 级真实收口，不是换壳；assistant custom block 读取、tool-error 转 invalid result、plugin llm messages 校验口径保持
  - `runtime-gateway-connection-lifecycle.service.ts` 这轮属于 owner 级真实收口，不是换壳；authenticate/register/disconnect/heartbeat/offline 与 `none/optional/required` auth mode 语义保持
  - 这三刀可计入 `S13` 进度

## 2026-04-25 S13 subagent-runner / plugin-bootstrap owner 继续收口

### 当前稳定值

- `packages/server/src` 非空行：`15389`
- 相对上一稳定值 `15418`：净减 `29`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已继续收口 session / request / subagent snapshot 装配主链
  - `mergeSubagentRequests / writeSubagentSessionRequest / writeSubagentSessionSnapshot` 已接管恢复 session 与 snapshot 同步
  - `run/start/resume/write-back` 仍留在同一 owner
  - 文件物理行数：`611 -> 605`
- `plugin-bootstrap.service.ts`
  - 已继续收口 config node base reader 与 remote input normalize 主链
  - `normalizeRemotePluginInput / normalizePluginManifest / readConfigNode` 的平行 reader 已删短
  - manifest/remote/config 解释权继续留在同一 owner
  - 文件物理行数：`378 -> 355`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/remote/plugin-remote-bootstrap.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15389`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - `runtime-host-subagent-runner.service.ts` 这轮属于 owner 级真实收口，不是换壳；`run/start/resume`、background 执行、write-back、subagent type 默认值、hook before/after-run 语义保持
  - `plugin-bootstrap.service.ts` 这轮属于 owner 级真实收口，不是换壳；register/upsert remote、manifest normalize、config node reader、remote descriptor/metadata/access 语义保持
  - 这两刀可计入 `S13` 进度

## 2026-04-25 S13 runtime-host / plugin-read-model owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15418`
- 相对上一稳定值 `15475`：净减 `57`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host.service.ts`
  - 已整文件重写，把 host method dispatch 的 `store / runtime tool / llm` 重复映射收成表驱动主链
  - `call -> permission -> activePersona remember -> handler` 仍留在同一 owner
  - 文件物理行数：`271 -> 264`
- `plugin-read-model.ts`
  - 已整文件重写，把 remote snapshot、plugin self capability、command conflict entry、config snapshot resolve 收成更短主链
  - command overview/version 的排序与 hash 口径继续留在同一 owner
  - 文件物理行数：`263 -> 213`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host.service.spec.ts tests/persona/persona.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/adapters/http/plugin/plugin-command.controller.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15418`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - `runtime-host.service.ts` 这轮属于 owner 级真实收口，不是换壳；host method dispatch、provider/persona/subagent/runtime tool/store/llm 返回结构未回退
  - `plugin-read-model.ts` 这轮属于 owner 级真实收口，不是换壳；plugin self summary、command overview/version、config snapshot、remote snapshot 语义保持
  - 这两刀可计入 `S13` 进度

## 2026-04-25 S13 conversation-message-planning owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15475`
- 相对上一稳定值 `15560`：净减 `85`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `conversation-message-planning.service.ts`
  - 已整文件重写，把 `message:received / history-rewrite / before-model / after-model / before-send / after-send` 收成更短主链
  - hook payload/context 拼装、short-circuit 分支、persona 注入继续留在同一 owner
  - 文件物理行数：`301 -> 216`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation-task.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15475`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实重写，不是换名留壳
  - `message:received / history-rewrite / before-model / after-model / before-send / after-send`、persona 注入、short-circuit 语义保持
  - `conversation-message-planning` 这刀可计入 `S13` 进度

## 2026-04-25 S13 persona-service owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15560`
- 相对上一稳定值 `15656`：净减 `96`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `persona.service.ts`
  - 已整文件重写，把 current/create/update/delete/avatar 主链收成更短结构
  - `context / conversation / default` source 判定、default persona 回退、delete 后 conversation 回退仍留在同一 owner
  - 文件物理行数：`279 -> 183`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/persona/persona.service.spec.ts tests/runtime/host/runtime-host.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15560`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实重写，不是换名留壳
  - current/create/update/delete/avatar、default/context/conversation source 判定语义保持
  - `persona-service` 这刀可计入 `S13` 进度

## 2026-04-25 S13 persona-store owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15656`
- 相对上一稳定值 `15775`：净减 `119`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `persona-store.service.ts`
  - 已整文件重写，把 persona storage root、load/normalize/persist、avatar 识别、meta 渲染收成更短主链
  - `readPersonaMetaYaml` 的长模板、legacy meta 兼容、default persona seed 继续留在同一 owner
  - 文件物理行数：`334 -> 215`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/persona/persona.service.spec.ts tests/runtime/host/runtime-host.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15656`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实重写，不是换名留壳
  - default persona、meta.yaml/SYSTEM.md、avatar 自动识别、legacy meta、storage root 解析语义保持
  - `persona-store` 这刀可计入 `S13` 进度

## 2026-04-25 S13 plugin-persistence owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15775`
- 相对上一稳定值 `15888`：净减 `113`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `plugin-persistence.service.ts`
  - 已整文件重写，把 plugin record 的 read/update/write/persist 收成更短主链
  - `setConnectionState / touchHeartbeat / updatePluginConfig / updatePluginScope / updatePluginLlmPreference / updatePluginEventLog` 不再各自维护一套“读记录 -> 改时间 -> 写回”链
  - config schema 校验、remote normalize、disabled event fallback 继续留在同一 owner
  - 文件物理行数：`355 -> 242`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/persistence/plugin-persistence.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/remote/plugin-remote-bootstrap.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15775`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实重写，不是换名留壳
  - plugin record read/update/write、config validate、remote normalize、event fallback 语义保持
  - `plugin-persistence` 这刀可计入 `S13` 进度

## 2026-04-25 S13 conversation-record owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15888`
- 相对上一稳定值 `15944`：净减 `56`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `runtime-host-conversation-record.service.ts`
  - 已整文件重写，把 conversation 持久化、session 存取、history normalize 收进更短主链
  - `load/save/mutate/session/history` 的旧平行链已删短，不再各自维护一套校验与更新路径
  - history 的 `metadata / customBlocks / annotations / parts` 严格校验继续留在同一 owner
  - 文件物理行数：`504 -> 448`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/conversation/conversation-task.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15888`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于 owner 级真实收紧，不是换名留壳
  - create/list/get/delete、todo/runtimePermission、history read/preview/replace、session get/start/keep/finish/list 语义保持
  - `conversation-record` 这刀可计入 `S13` 进度

## 2026-04-25 S13 conversation-task owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15944`
- 相对上一稳定值 `15999`：净减 `55`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `conversation-task.service.ts`
  - 已整文件重写，把 `startTask / runTask / finalizeTask / writeTaskMessage` 收成更短主链
  - `complete / finish / persist` 旧重复收尾链已删除
  - stream consume、permission event forward、custom block 更新继续留在同一 owner
  - 文件物理行数：`515 -> 460`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15944`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮是主链收口，不是换名留壳
  - 流式事件、停止、错误、patch completion、tool call/result、custom block metadata、permission request/resolution 语义保持
  - `conversation-task` 这刀可计入 `S13` 进度

## 2026-04-25 S13 plugin-bootstrap owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`15999`
- 相对上一稳定值 `16021`：净减 `22`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `plugin-bootstrap.service.ts`
  - 已整文件重写，把 `registerPlugin / upsertRemotePlugin / builtin bootstrap / manifest normalize / remote normalize / config schema parse` 收成更短主链
  - remote 注册入口改为共享 `createRemotePluginRegistration`
  - 多组字面量判定和字段清洗收进同域 reader，不再保留展开分支
  - 文件物理行数：`400 -> 378`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/plugin/remote/plugin-remote-bootstrap.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `15999`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮是实质收短主链，不是换名留壳
  - 公开 API、builtin bootstrap、remote plugin 注册、manifest/config/remote 解析语义保持
  - `plugin-bootstrap` 这刀可计入 `S13` 进度

## 2026-04-25 S13 context-compaction owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`16021`
- 相对上一稳定值 `16027`：净减 `6`
- `S13` 当前仍是进行中；这轮 fresh 与独立 judge 已完成

### 本轮新增

- `builtin-context-compaction.plugin.ts`
  - 已整文件重写，把 `history view / model preview / annotation scan` 收进同一 `ContextCompactionHistoryState` 主链
  - `message:received / conversation:history-rewrite / chat:before-model / route` 共享同一 compaction 执行入口
  - summary/covered annotation 的创建、识别与 marker 同步继续留在同一 owner
  - 文件物理行数：`593 -> 587`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `16021`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮属于主链收敛，不是换壳
  - `history view / model preview / annotation scan` 已集中到单一 owner
  - `/compact`、auto-stop、history rewrite、before-model mutate、summary/covered annotation 语义保持
  - `context-compaction` 这刀可计入 `S13` 进度

## 2026-04-25 S13 filesystem backend owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`16066`
- 相对上一稳定值 `16086`：净减 `20`
- `S13` 当前仍是进行中；这轮 fresh 已完成，独立 judge 待回收

### 本轮新增

- `runtime-host-filesystem-backend.service.ts`
  - 已整文件重写并继续收紧 host filesystem backend owner
  - `resolve/list/read/grep/write/edit/symlink` 仍留在同一 owner
  - 已去掉旧的 mounted filesystem 中转壳，并把 search/read 主链压得更紧
  - 文件物理行数：`406 -> 386`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `16066`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - 这轮不是纯物理压行
  - `resolve/list/read/grep/write/edit/symlink` 主链仍停在同一 owner
  - `filesystem backend` 这刀可计入 `S13` 进度

## 2026-04-25 S13 subagent runner owner 重写

### 当前稳定值

- `packages/server/src` 非空行：`16027`
- 相对上一稳定值 `16066`：净减 `39`
- `S13` 当前仍是进行中；这轮 fresh 已完成，独立 judge 待回收

### 本轮新增

- `runtime-host-subagent-runner.service.ts`
  - 已把前台执行与后台续跑收回同一 `executeStoredSubagent` owner
  - `run/start/complete` 不再各自维护一套“置 running -> 执行 -> append session -> 落 store”链
  - `createSubagentRecord / syncSubagentSessionSnapshot` 已成为同一 owner 内的新装配点
  - 文件物理行数：`650 -> 611`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `16027`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`

### 本轮 judge

- 结果：`PASS`
- 结论：
  - `run/start/complete` 的重复 running/session/store 收尾链已经收回同一 owner
  - session 复用、resume、write-back、hook 边界未见公开语义回退
  - `subagent runner` 这刀可计入 `S13` 进度

## 2026-04-25 S12 阶段总 judge

### 结果

- 独立 judge：`PASS`
- 结论：
  - `packages/server/src = 16086` 已满足 `S12 <= 17000`
  - 现有 fresh 证据足以支撑 `S12` 完成
  - `S12` 可以标记为 `已完成`
  - `S13` 进入 `进行中`

## 2026-04-24 S11 阶段总 judge

### 结果

- 独立 judge：`PASS`
- 结论：
  - `S11` 记录中的 owner 重写可以整体计入阶段结果
  - 目前 `packages/server/src = 16156`
  - `S11` 可标记为 `已完成`
  - `S12 / S13` 仍未完成，不能一起跳过

### 后续压缩确认

- `automation.service.ts`：`189 -> 241`
- `automation-execution.service.ts`：`173 -> 160`
- 当前稳定值：`16086`
- 补充 judge：`PASS`
  - 结论：automation owner 后续压缩没有打坏顺序、cron、hook pipeline，`S11 已完成` 状态仍有效

## 2026-04-24 S11 automation/runtime/plugin 第二批稳定化

### 当前稳定值

- `packages/server/src` 非空行：`16086`
- 相对上一稳定值 `16305`：净减 `219`
- 虽然这轮减行不大，但 `automation` 已从“薄包装压缩”改成新的状态 owner / 执行 pipeline
- `S11` 阶段总 judge 仍未做，因此阶段状态不变

### 本轮新增

- `automation.service.ts`
  - 已删除旧的 service 内平行状态流，改成：
    - `readAutomationState`
    - `createAutomationRecord`
    - `createAutomationLog`
    - `readEventAutomations`
  - 事件分发已恢复按创建顺序执行，不再经过会把 `automation-10` 排到 `automation-2` 前面的字典序
- `automation-execution.service.ts`
  - 已删除旧的 service 内并排执行链，改成：
    - `createAutomationRunPlan`
    - `prepareAutomationRun`
    - `executeAutomationActions`
    - `settleAutomationRun`
- `runtime-just-bash.service.ts`
  - 已恢复稳定的 `AbortController + Promise.race` timeout 主链
  - 文件物理行数：`136 -> 52`
- `builtin-runtime-tools.plugin.ts`
  - 已继续保持统一 runtime tool 输出 owner，并透传：
    - `read.loaded`
    - `write/edit.diff`
    - `write/edit.postWriteSummary`
    - `edit.strategy`
    - `edit.occurrences`
  - 文件物理行数：`211 -> 69`
- `tests/automation/automation.service.spec.ts`
  - 已补双位数 id 的事件顺序断言，直接卡住 `automation-2 / automation-10` 排序回退

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/automation/automation.service.spec.ts tests/execution/runtime/runtime-just-bash.service.spec.ts tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/runtime/host/runtime-host-runtime-tool.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `16156`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`

### 状态

- 独立 judge：`PASS`
  - 结论：`automation` 两个 owner 已是新的状态/执行主链，不再只是内联旧函数
  - 结论：`runtime-just-bash` timeout 与 `builtin-runtime-tools` 输出链没有公开语义回退
  - 这轮可计入 `S11` 进度

## 2026-04-24 S11 execution support owner 大重写

### 当前稳定值

- `packages/server/src` 非空行：`16305`
- 相对上一稳定值 `16828`：净减 `523`
- 已进一步低于 `S11 <= 19000` 与 `S12 <= 17000` 数字门槛
- fresh 已完成；独立 judge 结果待回收，因此阶段状态不变

### 本轮新增

- `runtime-command-output.ts`
  - 重写为更短的 tail render 主链
  - 文件物理行数：`205 -> 159`
- `runtime-native-shell.service.ts`
  - 重写为更短的 shell spawn / timeout 主链
  - 文件物理行数：`156 -> 127`
- `project-worktree-post-write.service.ts`
  - 重写为单一 `format -> diagnostics` 主链
  - 文件物理行数：`256 -> 200`
- `webfetch-service.ts`
  - 重写为单一 `fetch -> normalize -> render` 主链
  - 文件物理行数：`200 -> 167`
- `project-subagent-type-registry.service.ts`
  - 删除旧的 yaml 注释模板与多段规范化壳，改成更短的 seed/load 主链
  - 文件物理行数：`180 -> 93`
- `skill-tool.service.ts`
  - 收口 skill load / event log / model output 主链
  - 文件物理行数：`135 -> 125`
- `skill-registry.service.ts`
  - 删除旧的多段 discovery / governance 包装链
  - 文件物理行数：`228 -> 97`
- `mcp-stdio-launcher.ts`
  - 删除旧的 bind/forward/shutdown 包装链，收回单一 launcher 主链
  - 文件物理行数：`156 -> 109`
- `mcp.service.ts`
  - 删除旧的 record/tool source/timeout 包装链，重写为更短的 config/runtime/client 主链
  - 文件物理行数：`244 -> 160`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/runtime/runtime-command-output.spec.ts tests/execution/runtime/runtime-native-shell.service.spec.ts tests/execution/project/project-worktree-post-write.service.spec.ts tests/execution/webfetch/webfetch-service.spec.ts tests/execution/project/project-subagent-type-registry.service.spec.ts tests/execution/skill/skill-registry.service.spec.ts tests/execution/skill/skill-tool.service.spec.ts tests/execution/mcp/mcp-stdio-launcher.spec.ts tests/execution/mcp/mcp.service.spec.ts tests/adapters/http/mcp/mcp.controller.spec.ts tests/adapters/http/skill/skill.controller.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `16305`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`

### 状态

- 这轮是 execution support owner 级整文件重写，不是碎片减行
- 当前已满足“单轮至少减 500 行”
- 独立 judge：`PASS`
  - 结论：这轮是真删旧主链，不是换壳，可计入 `S11` 进度
- `S11` 阶段总 judge 仍未做，因此阶段状态保持 `进行中`

## 2026-04-24 S11 分发层大重写

### 当前稳定值

- `packages/server/src` 非空行：`16828`
- 相对上一稳定值 `17798`：净减 `970`
- 已低于 `S11 <= 19000` 与 `S12 <= 17000` 数字门槛
- 仍缺独立 judge，因此阶段状态不变

### 本轮新增

- `tool-registry.service.ts`
  - 删除旧的重复 native tool / executable tool / output 包装链
  - 文件物理行数：`352 -> 168`
- `runtime-filesystem-backend.service.ts`
  - 删除旧的重复 delegate 主链，改成单一后端分发 owner
  - 文件物理行数：`215 -> 44`
- `runtime-mounted-workspace-file-system.ts`
  - 删除旧的重复 path/write/link 包装链
  - 文件物理行数：`255 -> 98`
- `runtime-tool-permission.service.ts`
  - 删除旧的重复 review / pending / approval 包装链
  - 文件物理行数：`241 -> 112`
- `runtime-filesystem-backend.types.ts`
  - 整文件重写为更紧凑的 contract 声明
  - 文件物理行数：`189 -> 46`
- `glob-tool.service.ts`
  - 删除旧的输入/输出平行包装链
  - 文件物理行数：`167 -> 49`
- `grep-tool.service.ts`
  - 删除旧的输入/输出平行包装链
  - 文件物理行数：`167 -> 70`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/tool/tool-registry.service.spec.ts tests/execution/runtime/runtime-tool-backend.service.spec.ts tests/execution/runtime/runtime-tool-permission.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/bash/bash-tool.service.spec.ts tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `16828`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`

### 状态

- 这轮是 owner 级整文件重写，不是碎片减行
- 当前还没做独立 judge，`S11` 继续保持 `进行中`

## 2026-04-24 S11 file/read/write/edit/host 大重写

### 当前稳定值

- `packages/server/src` 非空行：`17798`
- 相对上轮稳定值 `18490`：净减 `692`
- 相对 `S11 <= 19000`：已低于门槛，但仍缺独立 judge

### 本轮新增

- `runtime-file-freshness.service.ts`
  - 重写为更短的 freshness 主链，保留 read stamp、loaded context、write lock、instruction claim 语义
  - 文件物理行数：`277 -> 213`
- `read-tool.service.ts`
  - 重写为单一 `read -> narrow -> reminder` 主链
  - 文件物理行数：`201 -> 150`
- `write-tool.service.ts`
  - 重写为单一 `guard -> backend -> render` 主链
  - 文件物理行数：`157 -> 120`
- `edit-tool.service.ts`
  - 重写为单一 `guard -> backend -> render` 主链
  - 文件物理行数：`166 -> 135`
- `runtime-host-filesystem-backend.service.ts`
  - 删除旧的多段分散 I/O 主链，重写成更短的 path/read/write/list/search owner
  - 文件物理行数：`773 -> 406`
- `project-worktree-file.service.ts`
  - 删除旧的重复 path/read/write/edit 主链，压回单一 owner
  - 文件物理行数：`150 -> 88`
- 同轮继续压缩：
  - `runtime-file-tree.ts`：`130 -> 112`
  - `read-result-render.ts`：`97 -> 90`
  - `read-path-instruction.ts`：`108 -> 86`
  - `runtime-search-result-report.ts`：`107 -> 71`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/read/read-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/project/project-worktree-file.service.spec.ts tests/execution/file/runtime-search-result-report.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/execution/runtime/runtime-tool-backend.service.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `17798`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`

### 状态

- 本轮 fresh 已完成
- 还没做独立 judge，`S11` 继续保持 `进行中`

## 2026-04-24 S11 bash 工具体积重写

### 当前稳定值

- `packages/server/src` 非空行：`19058`
- 距 `S11 <= 19000`：还差 `58`

### 本轮新增

- `runtime-shell-command-hints.ts`
  - 已删除旧的 reader / fallback / 单次包装链，改成单一声明式 hints 主链。
  - 文件物理行数：`841 -> 440`
- `bash-tool.service.ts`
  - 已删除旧的描述拼装和 access 包装壳，改成单一主链。
  - 文件物理行数：`180 -> 68`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run count:server-src` -> `19058`

### 状态

- 本轮相对上一稳定值 `19558` 已净减 `500`
- 还没做独立 judge，`S11` 继续保持 `进行中`

## 2026-04-24 S11 bash hints 大重写收尾

### 当前稳定值

- `packages/server/src` 非空行：`19558`
- 距 `S11 <= 19000`：还差 `558`

### 本轮新增

- `runtime-shell-command-hints.ts`
  - 已把 `copy-item / move-item` 的 destination 读取收口到同一 owner，不再把 `-Destination (Join-Path ...)` 截成只剩 `Join-Path` 首 token。
  - 已在 tokenizer 入口保护 bare / parenthesized `Join-Path` 子表达式，避免绝对路径统计只捞到基路径、丢掉 child path。
  - 当前仍不扩成通用 PowerShell 求值器，只处理 `Join-Path` 这类纯路径拼接命令。
- 已删除旧 runtime 辅助文件：
  - `packages/server/src/execution/runtime/runtime-shell-command-ast.ts`
  - `packages/server/src/execution/runtime/runtime-powershell-path-token.ts`
  - `packages/server/src/execution/runtime/runtime-shell-syntax.ts`

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `19558`

### 状态

- 这轮只完成 fresh 收尾，还没做独立 judge，`S11` 继续保持 `进行中`。

## 2026-04-24 S11 稳定基线补记

### 当前稳定值

- `packages/server/src` 非空行：`20059`
- 距 `S11 <= 19000`：还差 `1059`

### 新增稳定事项

- `builtin-context-compaction.plugin.ts`
  - 已把 annotation / covered-marker 的旧平行包壳链重写成单一 annotation state 主链
  - 文件物理行数：`594 -> 593`
  - 定向 fresh：
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
    - 结果：`2 suites / 23 tests` 全部通过
  - 统计变化：`npm run count:server-src`：`20084 -> 20076`
  - 状态：已通过 fresh，尚未做独立 judge
- `conversation-task.service.ts`
  - 已把 `complete / finish / persist` 三段旧收尾链重写成 `finalizeTask + writeTaskMessage` 单一主链
  - 已把 `json custom block / text custom block` 两套构造链收成 `readConversationTaskCustomBlock()`
  - 文件物理行数：`532 -> 515`
  - 定向 fresh：
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-task.service.spec.ts`
    - 结果：`1 suite / 4 tests` 全部通过
  - 统计变化：
    - 第一刀：`20076 -> 20071`
    - 第二刀：`20071 -> 20059`
  - 状态：已通过 fresh，尚未做独立 judge

## 2026-04-24 S11 第一轮持续压缩

### 当前目标

- 保持 `S1-S9` 行为不回退。
- 改为直接删除旧主链并重写 `runtime-host-filesystem-backend.service.ts`、`runtime-shell-command-hints.ts`、`runtime-text-replace.ts`。
- 当前阶段只记 fresh 进度，不提前做 `S11` judge。
- 不再接受“薄包装内联几行”的推进方式。

### 本轮新增

- `runtime-text-replace.ts`
  - 已删除“策略对象 + reader 工厂”旧主链，改成 `readRuntimeTextStrategyMatches()` 单一策略调度
  - 当前这刀不改策略顺序，不改 `replaceAll` 歧义保护，不改 line-ending / indentation / anchored 语义
  - 已继续把 `escape-normalized / trimmed-boundary / whitespace-normalized` 的重复候选扫描收成 `readRuntimeTextLooseMatches()`
  - 已把 `context-aware / block-anchor` 两条评分链收成 `readRuntimeTextAnchoredSimilarity()`
  - 当前这刀不改策略顺序，不改 `replaceAll` 歧义保护，不改 line-ending / indentation / anchored / not-found 文案
- `runtime-shell-command-ast.ts`
  - 已把 `assignment_expression` 判定里的单次 `Join-Path command` 判定直接回收到 `hasRuntimeIgnoredCommandAncestors()`
  - 已删掉未复用的 `resolveRuntimeShellAssignedValue()`
  - 已把 bash / PowerShell 赋值链上的 `readRuntimeShellVariableAssignment()` 与 `resolveRuntimePowerShellAssignedPathToken()` 这类单点转发壳直接回收到真实调用点
  - 已把 parser language 选择、redirection operator 判定、`Join-Path` unwrap/tokenize 这类只服务单一调用点的薄包装继续内联回 AST owner
- `runtime-host-filesystem-backend.service.ts`
  - 已把二进制 read error 判定、非文本 read result 构造、静态 non-text 判定与行数统计继续压回现有 `read/write/edit/grep` owner
  - 当前这刀只删读文件薄包装，不改 binary / image / pdf / line-ending 行为
  - 已把 missing-path 异常拼装、diff base 读取、目录遍历 skipped 标记与 nearby-path comparator 继续压回主链调用点
  - 当前这刀不改缺失路径提示文案、skipped path 语义与 diff base 取值边界
  - 已把 read-metadata 链上的 `mime/static non-text/binary path` 三段单点判定压回 `readRuntimeHostFilesystemReadMetadata()`
  - 当前这刀不改 `image/pdf/binary` 分类语义
  - 已把 `write / edit` 共享的旧文本基线读取与落盘主链收成 `writeResolvedTextFile()`
  - 已删除 `edit -> writeTextFile` 的重复二次读文件链
- `runtime-shell-command-hints.ts`
  - 已把写路径读取、`Join-Path` unwrap 与 env path 展开链上的单点薄包装压回 hints owner
  - 当前这刀不改 `Join-Path`、filesystem provider prefix、env path 展开与写路径判定语义
- `runtime-shell-command-hints.ts`
  - 已把 tokenizer 的 braced-token 保护/恢复、separator 判定、quoted token 去壳与 summary 组装继续压回 hints owner
  - 当前这刀不改 tokenizer 边界、single-quoted literal 语义与 summary 文案口径
- `runtime-host-filesystem-backend.service.ts`
  - 已把 binary sample 检测压回 `readRuntimeHostFilesystemReadMetadata()`
  - 当前这刀净减很小，后续不再优先沿同粒度继续挤这一块
- `runtime-shell-command-hints.ts`
  - 已把 command-structure 读取、redirection fallback、filesystem provider prefix 拆装与 network command 单次 reader 直接压回主链
  - 当前这刀不改 absolute/external/write/network 语义，只删 hints owner 内的中间转发层
- `builtin-context-compaction.plugin.ts`
  - 已把 covered-count、result-label 与 owned-annotation 这类单次包壳压回 summary / command / marker owner
  - 当前这刀不改 summary annotation、covered marker 与手动压缩短路语义
- `runtime-host-subagent-runner.service.ts`
  - 已把 `resolveSubagentInvocation()` 的 create/resume 双分支收口到单一 return 主链
  - 当前这刀不改 session 恢复、resolved request 注入与 preview 语义，只删 runner owner 内的重复返回壳
- `runtime-host-subagent-runner.service.ts`
  - 已把 create/resume 两条链里显式抄写的 resolved request 字段列表删掉，直接复用 `resolved.request`
  - 当前这刀不改 session payload、session request 注入与 subagent request 存档语义
- `builtin-context-compaction.plugin.ts`
  - 已把 `readAutoStopState()` 与 `toPluginLlmMessage()` 压回 `chat:before-model`
  - 当前这刀不改 auto-stop 判定、模型前历史改写与 display->assistant 投影语义
- `runtime-host-filesystem-backend.service.ts`
  - 已删掉未使用的 `countFilesystemTextLines()`，并把 `readFilesystemMtime()`、offset 越界异常壳压回主链
  - 当前这刀不改 glob/grep 排序、read offset 错误文案与 text-range 行为
- `runtime-host-subagent-runner.service.ts`
  - 已把只服务 resume 分支的 `buildSubagentRequestFromSession()` 与 `mergeSubagentRequest()` 一起压回调用点
  - 当前这刀不改 session 消息拼接顺序与 envelope merge 语义
- `runtime-shell-command-ast.ts`
  - 已继续把变量展开、`Join-Path` 赋值读取与变量名归一化链收回 AST owner
  - 当前这刀只删 AST owner 内并行归约主链，不改 bash / PowerShell / redirection / AST 失败回退语义
- 已证伪切口
  - `runtime-text-replace.ts` 的 block-normalized reader 总收口会回增文件体积，并打坏 `indentation-flexible / line-trimmed / trailing-whitespace-trimmed` 的策略边界
  - `runtime-shell-command-hints.ts` 的写路径 reader map 改单一 `switch` 主链会回增文件体积

### 本轮已落地

- `runtime-host-filesystem-backend.service.ts`
  - 目标路径类型校验继续收口到 `requireDirectoryPath / requireFilePath / requireMissingPath / resolveWritableFilePath`
  - `grepText()` 不再拿到 file entry 后再绕回 session 级 `readTextFile()`
  - 目录遍历已把 `collectRuntimeVisibleDirectoryTree / collectRuntimeVisibleDirectoryEntries` 并回单条递归主链
  - `writeTextFile()` 现在直接委托 `writeResolvedTextFile()`，`editTextFile()` 不再为 diff 和落盘重复读同一文件
- `runtime-shell-command-hints.ts`
  - git 子命令写路径分派已收口到 `GIT_WRITE_PATH_READERS`
  - PowerShell / POSIX env 路径展开已收口到 `expandShellEnvPathToken()`
- `runtime-text-replace.ts`
  - `line-ending-normalized / trailing-whitespace-trimmed / line-trimmed` 已共用 `createRuntimeTextNormalizedLineReader()`
  - `context-aware / block-anchor` 已共用 `createRuntimeTextAnchoredReader()`
  - `escape-normalized / trimmed-boundary / whitespace-normalized` 已共用 `readRuntimeTextLooseMatches()`
  - `context-aware / block-anchor` 的评分逻辑已收回 `readRuntimeTextAnchoredSimilarity()`
- `builtin-context-compaction.plugin.ts`
  - `context-compaction` annotation 的 owner/type 过滤已收口到单点判定
  - `/compact / /compress` 命令短路响应已收口到单点生成
  - 对应历史 summary 断言已修正为真实存储角色 `display`
  - summary / covered annotation 构造、历史过滤、covered 判定已继续收口到真实领域 owner
- `runtime-shell-command-ast.ts`
  - `Join-Path` 的 flagged / positional token 解析已收口到通用读取器
  - AST 结果空段判断与无效 `Tree` 类型壳已去掉
  - 变量展开、`Join-Path` 赋值读取与变量名归一化链已进一步收口到 AST owner
  - 文件物理行数 `513 -> 496`
- `runtime-powershell-path-token.ts`
  - `AST` 与 `shell hints` 的 PowerShell flagged / positional token 解析与路径拼接已回收同域 owner
  - 不进 `shared`，只服务 `execution/runtime`
- `project-worktree-file.service.ts`
  - 已删除 project worktree 自带的第二套 edit 替换逻辑
  - 现在直接复用 `runtime-text-replace`，不再并行维护 `countOccurrences / replaceFirst / normalizeLineEnding`
- `runtime-file-tree.ts`
  - host 文件后端与 project worktree 的递归文件树遍历、目录条目排序已回收单一 owner
  - host 继续保留 skipped path 语义，project 继续保留直接抛错语义
- `runtime-host-subagent-runner.service.ts`
  - request envelope 克隆、session payload 组装、session snapshot 回写已收口到单点 owner
  - 中途验证过把 `createSubagent` 总装配也抽成公共构造会反向增膨胀，因此本轮只保留 request/session 侧收口，store 调用保留在调用点
- `builtin-context-compaction.plugin.ts`
  - manual command、route 与 auto history-rewrite 共用的 compaction 调用编排已收口到同域 owner
  - 中途验证过单纯新增调用壳会反向增膨胀，因此本轮继续把结果标签、短路回复与若干固定分支一起压回正收益
- `runtime-shell-command-hints.ts`
  - destination fallback 与 tar mode 判定已继续收口到单点 owner
  - 当前这刀只删同构控制流，不改 `copy/move-item` 与 `tar` 写路径语义

### 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `npm run build`
- root
  - `npm run count:server-src` -> `20289`
  - `npm run count:server-src` -> `20259`
  - `npm run count:server-src` -> `20253`
  - `npm run count:server-src` -> `20150`
  - `npm run count:server-src` -> `20101`
  - `npm run count:server-src` -> `20084`
  - `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/conversation/conversation-task.service.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- `runtime-shell-command-ast.ts` 独立 judge 已 `PASS`，确认这刀是真删并行变量展开主链，不是换壳。
- 下一刀直接整段重写 `runtime-host-subagent-runner.service.ts` 的 session / create-resume 主链，不再做零碎压行。
- `runtime-text-replace.ts` 与 `runtime-shell-command-hints.ts` 不再重试已证伪切口。
- 所有重写都要求删除旧主链，不保留并行实现，不切 `S12`。

## 2026-04-24 TODO 结构重排

### 目标

- 把 `TODO.md` 从大块阶段改成串行小阶段。
- 保留旧约束，不让“拆细计划”变成“删约束”。
- 每个阶段都要求 fresh 验收和独立 judge。

### 当前阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| S1 | 已完成 | `bash` parenthesized / subexpression 去重复 |
| S2 | 已完成 | `bash` AST 失败回退固定 |
| S3 | 已完成 | `read` 文本 reminder 去重统一 |
| S4 | 已完成 | `read.loaded` 结构化结果去重统一 |
| S5 | 已完成 | `read` 路径级 instruction 边界固定 |
| S6 | 已完成 | `write/edit` summary 补齐省略信息 |
| S7 | 已完成 | `write/edit` hint 与 diagnostics 排序一致 |
| S8 | 已完成 | `edit` rewrite 选优与歧义保留固定 |
| S9 | 已完成 | 功能阶段总复核 |
| S10 | 已完成 | 大文件体积基线重排 |
| S11 | 进行中 | 体积压到 <= 19000 |
| S12-S14 | 待开始 | 体积控制与最终验收 |

### 说明

- 已完成的大段历史不再继续堆在 `TODO.md`，只保留摘要。
- 原先有效的硬约束已移到 `TODO.md` 的“继承约束”段，继续生效。
- `S6` 已完成：
  - `postWriteSummary` 已补 `omittedRelatedFiles / visibleRelatedFiles`
  - fresh：shared/plugin-sdk/server build、server 定向 jest、root `smoke:server` 通过
  - judge：`PASS`
- `S7` 已完成：
  - `postWriteSummary` 已补 `visibleRelatedPaths`
  - 文本 diagnostics block 与结构化 summary 现在复用同一套排序/截断逻辑
  - fresh：shared/plugin-sdk/server build、server 定向 jest、root `smoke:server` 通过
  - judge：`PASS`
- `S8` 已完成：
  - `runtime-text-replace.ts` 已把更窄的 `line-trimmed` 提前到锚点类宽策略之前
  - “每行只差外层空白”的场景现在不再误落到 `context-aware`
  - `trimmed-boundary / context-aware / replaceAll` 的歧义保护保持不变
  - fresh：server 定向 jest、server build、双 `smoke:server` 通过
  - judge：`PASS`

## 2026-04-23 P21-7 闭环化执行

### 目标

- 停止使用模糊成熟度百分比，改成剩余闭环推进。
- 当前剩余闭环的边界以 `other/opencode` 代码为准，不再凭空扩展：
  - `bash`：`packages/opencode/src/tool/bash.ts`
  - `read`：`packages/opencode/src/tool/read.ts`
  - `write / edit`：`packages/opencode/src/tool/write.ts`、`packages/opencode/src/tool/edit.ts`
- 当前只围绕 4 个闭环执行：
  - `bash AST 预扫`
  - `read loaded-files / reminder`
  - `write/edit 工程反馈`
  - `packages/server/src <= 15000`

### 当前阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| P21-7A | 进行中 | `bash` parser / AST 级预扫接入与安全回退 |
| P21-7B | 进行中 | `read` loaded-files / reminder 从路径列表升级成上下文视图 |
| P21-7C | 进行中 | `write/edit` post-write 反馈改成带目标路径的可执行动作 |
| P21-7D | 进行中 | 在前 3 项不回退前提下压缩 `packages/server/src` 到 `<=15000` |

### 当前执行约束补充

- `TODO.md` 已按工具补齐“当前缺口 / 当前仓库验收锚点”。
- 自这轮起按以下口径推进：
  - `bash / read / write / edit` 继续作为功能主闭环推进
  - `glob / grep` 视为主链已基本对齐，只保留回归与稳定性收口，不再单独开新功能目标
  - 每个工具的下一步改动，都必须能回指到 `TODO.md` 对应工具块里的缺口描述与验收锚点

### 本轮已完成

- `P21-7D` 第一段：
  - `runtime-host-filesystem-backend.service.ts` 已把 `copyPath / movePath` 收口到同一个 transfer owner
  - 文本文件读取与二进制拒绝逻辑已收口到 `readRuntimeTextFileContent()`
  - 路径存在校验、返回文案与 `edit/write/read` 主链行为保持不变
- `P21-7D` 第二段：
  - `runtime-shell-command-hints.ts` 已继续删除薄包装 reader
  - `new-item / rename-item / mkdir` 现在直接复用 `readPowerShellComposedWritePathTokens()`
  - `git` 单路径返回分支已统一走 `readSinglePathToken()`，减少重复 `[destination] : []` 控制流
- `P21-7D` 第三段：
  - `runtime-text-replace.ts` 已把 `block-anchor / context-aware` 的 anchored-scored 扫描收口到同一条 owner
  - `line-trimmed / trailing-whitespace-trimmed / line-ending-normalized` 已收口到 `readRuntimeTextNormalizedLineWindowMatches()`
  - 中途尝试过 `runtime-host-subagent-runner.service.ts` 的 session create 映射收口，但净减为负，已同轮回滚，不计入成果
- `P21-7D` 第四段：
  - `runtime-host-filesystem-backend.service.ts` 已把 `image / pdf / binary` 的静态分类与非文本返回收口到单点 owner
  - 当前这刀保持了 `read` 结果类型与二进制拒绝文案不变
- `P21-7D` 第五段：
  - `runtime-text-replace.ts` 已把 anchored-scored 选优直接收进 `readRuntimeTextAnchoredCandidates()`
  - 已删除只服务这一处的 scored helper 与中间类型，保持歧义保护与最高分并列返回不变
- `P21-7D` 第六段：
  - `runtime-shell-command-hints.ts` 已把 rename parent-path 的单次 reader 直接收进 `resolveRenameShellPathToken()`
  - 当前这刀只压一层薄包装，不改 `rename-item` 的路径拼接语义
- `P21-7D` 第七段：
  - `runtime-text-replace.ts` 已把只服务 `whitespace-normalized / escape-normalized` 的组合 helper 直接回收到各自 strategy owner
  - 当前保持单行命中 + 多行窗口命中两条链都不变
- `P21-7D` 第八段：
  - `runtime-text-replace.ts` 已把 `indentation-flexible` 的缩进归一化收成共用 owner
  - 已删除只服务 `readRuntimeTextCommonIndentation()` 的前导空白 reader
- `P21-7D` 第九段：
  - `runtime-shell-command-hints.ts` 已把 command-substitution body / filesystem provider prefix 单次 reader 直接回收到绝对路径归一化链
  - 当前不改 `Join-Path`、provider-aware path 与 env 展开边界
- `P21-7D` 第十段：
  - `runtime-text-replace.ts` 已把 `line-trimmed / trailing-whitespace-trimmed / line-ending-normalized` 三个单次 strategy reader 直接内联回策略表
  - 当前不改逐行归一化窗口匹配语义
- `P21-7D` 第十一段：
  - `runtime-text-replace.ts` 已把 `trimmed-boundary / indentation-flexible` 两个单次 strategy reader 直接内联回策略表
  - 当前不改 `trimmed-boundary` 歧义保护与 `indentation-flexible` 缩进匹配语义
- `P21-7A` 第一段：
  - `runtime-shell-command-ast.ts` 已接入 `web-tree-sitter` wasm AST 预扫
  - Bash 控制流与 PowerShell script block 已能通过 AST 抽出写入目标
  - Jest 运行态已改成 wasm 字节加载，避免 `Language.load(path)` 的 dynamic import 限制
  - PowerShell `-Flag:"value"` 与 bash `file_redirect` 目标提取已补齐
  - `native-shell-alias` 等 `native-shell` 同族 backend 已复用 PowerShell 语法族判定与 AST 预扫
- `P21-7B` 第一段：
  - read window 元数据已记入 freshness owner
  - reminder / freshness 阻塞提示已共享 loaded-files 上下文
- `P21-7C` 第一段：
  - post-write next hint 已支持目标路径与 related paths 排序
- `P21-7C` 第二段：
  - `runtime-text-replace.ts` 已新增 `line-ending-normalized`
  - `RuntimeHostFilesystemBackendService.editTextFile()` 已改为直接对原始文件文本做 replace
  - CRLF 文件中的 LF `oldString/newString` 现在能通过 native `edit` 真链路落盘，并保持 CRLF
- `P21-7B` 第二段：
  - `RuntimeFileFreshnessService` 的 reminder 已显式标注“按最近读取排序”
  - 每个已加载文件现在都会带下一步动作：
    - 可续读窗口：直接给出 `read <path> offset=<n>`
    - 当前窗口完整：直接提示“当前窗口已加载，可直接复用”
- `P21-7B` 第三段：
  - `RuntimeFileFreshnessService` 已区分“真实 loaded-files 上下文”和“仅用于 freshness 的写后 stamp”
  - `buildReadSystemReminder()` 与 overwrite-before-read 提示不再把 `write/edit` 后的 freshness stamp 冒充成“当前窗口已加载”
  - 空文件 read 现在也会保留 loaded-files 上下文
  - stale write 阻塞现在会带出已过期窗口和明确动作：`read <targetPath>`
- `P21-7B` 第四段：
  - `ReadToolService` 已补路径祖先 `AGENTS.md` reminder
  - 当前会沿目标文件祖先目录向上收集路径级 `AGENTS.md`，并在 read 结果里作为单独 `system-reminder` 输出
  - 为避免重复灌入全局约束，当前只加载可见根以下、但不等于可见根本身的 `AGENTS.md`
- `P21-7B` 第五段：
  - `read-path-instruction.ts` 现在除了渲染 reminder，还会回传本次命中的 instruction 路径
  - `ReadToolService` 已把这些路径写入 `ReadToolResult.loaded`
  - `builtin.runtime-tools` 的 `read` 输出现在会把 `loaded` 结构化带回插件结果，和 `other/opencode` 的 read metadata 方向对齐
- `P21-7B` 第六段：
  - `read` 的路径级 `AGENTS.md` 现在会优先按 assistant message 级 claim 去重
  - 当前调用拿不到 assistant message id 时，回退到 session 级 claim
  - `read.loaded` 现在只回传本次新加载的 instruction 路径
- `P21-7C` 第三段：
  - `indentation-flexible` 已从“只匹配成功”升级成“按命中代码块缩进回写 replacement”
  - native `edit` 真链路已确认嵌套代码块不会因 edit 回写而左移缩进
- `P21-7C` 第四段：
  - post-write renderer 现在会在只有 `info/hint` diagnostics 时继续给出 next hint
  - 不再让模型拿到 diagnostics 后自己猜“还要不要先 read 当前文件/相关文件”
- `P21-7A` 第二段：
  - `runtime-shell-command-hints.ts` 已补 bash env 路径展开
  - `$VAR/path` 与 `${VAR}/path` 现在会参与绝对路径、外部路径与外部写入判定
  - 单引号 bash literal 仍不展开，避免把 `'${VAR}/path'` 误报成真实外部路径
- `P21-7A` 第三段：
  - `runtime-shell-command-hints.ts` 已对 PowerShell `$(Join-Path ...)` 补有限静态归约
  - 当前已覆盖：
    - `$(Join-Path $env:ROOT 'file.txt')`
    - `$(Join-Path ${env:ROOT} 'file.txt')`
    - `filesystem::$(Join-Path $env:ROOT 'file.txt')`
  - 对应 `bash-tool / tool-registry` 负例已改成正例，fresh 已确认能产出 `absolutePaths / externalWritePaths / writesExternalPath`
  - generic command substitution 与本地变量路径仍维持保守边界，不做泛化猜测
- `P21-7C` 第四段：
  - `runtime-file-post-write-report.ts` 已补 formatting-only next hint
  - 当 post-write 只有格式化、没有 diagnostics 时，结果会直接提示先 `read <targetPath>` 确认格式化后的最终内容
  - `write-tool` 与 `tool-registry` 输出链都已补证据
- `P21-7A` 第四段：
  - `runtime-shell-command-ast.ts` 已补简单本地变量路径静态识别
  - AST 现在会在 bash / PowerShell 预扫里记录简单赋值，并把变量展开应用到 command tokens / redirection targets
  - 当前已覆盖：
    - bash `ROOT=/tmp/out; cp /workspace/source.txt "$ROOT/copied.txt"`
    - PowerShell `$root='C:\\temp'; Set-Content -Path "$root\\note.txt" -Value hi`
    - PowerShell `$root=$env:TEMP; ...`
  - 当前仍保持保守边界：
    - 不展开 generic command substitution
    - 不展开更宽 PowerShell 子表达式
- `P21-7A` 第五段：
  - `runtime-shell-command-ast.ts` 已补 PowerShell 简单子表达式变量展开
  - 当前已覆盖：
    - `"$($root)\\note.txt"`
    - `"$($env:TEMP)\\note.txt"`
  - 当前仍保持保守边界：
    - 不展开通用命令型子表达式
    - 不把 `$(...)` 直接放宽成任意命令执行
- `P21-7A` 第六段：
  - `bash-tool.service.spec.ts` 与 `tool-registry.service.spec.ts` 已补 parenthesized `Join-Path` 真链路证据
  - `tool-registry` 里的 PowerShell `Join-Path` permission request 用例已显式切到 `native-shell` backend，避免默认 `just-bash` 夹具把 PowerShell 语法族打回 bash
  - 当前 `-Destination (Join-Path ...)` 形态已不再额外带出基路径 `C:\\env-root`；这条重复扫描噪音已收口
- `P21-7C` 回归修复：
  - `runtime-text-replace.ts` 的 `trimmed-boundary` 已恢复歧义保护
  - `replaceAll` 现在不会再把不同外壳文本误吞成同一段原文
- `P21-7C` 第五段补强：
  - `runtime-text-replace.ts` 的 `escape-normalized` 已支持 `\\uXXXX / \\xNN`
  - 当前可覆盖“转义文本 vs 实际字符”这一类高频 edit 误差
- `P21-7C` 第六段补强：
  - `edit` 现在已对齐 OpenCode 的 create-style 入口：`oldString=""` 可直接创建新文件
  - 目标文件已存在时，不新起一套覆盖分支，继续复用 `withWriteFreshnessGuard + writeTextFile` owner
  - 这条链现在会稳定产出整文件 diff、post-write diagnostics 与 `Strategy: empty-old-string`
  - `packages/server/scripts/http-smoke.mjs` 已补 `edit-create-loop`，后续回归会在 fresh 冒烟里直接暴露
  - create-style `edit` 现在也会在整文件覆盖已存在文本时保留原文件换行风格
- `P21-7C` 第七段：
  - `runtime-file-post-write-report.ts` 已补 `readRuntimeFilesystemPostWriteSummary()`，把 formatting、诊断计数、related focus paths 与 next hint 收成结构化 owner
  - `WriteToolService / EditToolService` 现在都会把 `postWriteSummary` 挂回结果，不再只有文本输出
  - `builtin.runtime-tools` 的 `write/edit` 插件结果现在会把 diff + `postWriteSummary` 透传到 `data`
- `P21-7C` 第八段：
  - post-write diagnostics 的文件块顺序现在已与 `relatedFocusPaths / next hint` 共用同一套优先级
  - 当前文件仍固定置顶，相关文件再按严重度与问题数排序
- `P21-7C` 第九段：
  - post-write 文本反馈现在最多展开 5 个相关文件 diagnostics
  - summary 继续保留全量问题数与文件数，超出部分显式提示 omitted 数量

### 本轮验收

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/conversation/conversation-task.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/read/read-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run count:server-src`

### 当前注意点

- `P21-7A` 这次新增的是 fresh 证据，不是阶段完成：
  - 还没做独立 judge
  - 因此 `TODO.md` 里的 `P21-7A` 仍保持 `进行中`
- 当前总量回升到 `20351`
  - 这是 `P21-7A` 功能补齐带来的真实增量，不按回退处理
  - 下一步继续优先补 `P21-7A / P21-7B / P21-7C` 的剩余功能缺口，不再回到低收益压行小刀

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
| S17-5 | 已完成 | 把 `subagent` 公开语义从 `profileId + taskId` 收口到 `subagentType + sessionId`，并把 `todo` owner 改成 session 级资源 |

## 2026-04-20 天气 skill 收口

## 目标

- 删除仓库当前旧 skill 目录，只保留真实要用的天气查询 skill。
- 把仓库默认天气查询从 `mcp/servers/weather-server.json` 收回到 `skills/weather-query/`。
- 保持 skill 继续是 OpenCode 风格“按需加载的提示资产”，不重新引入专用 skill 执行器。
- 补齐天气 skill 的脚本资产识别与代码执行验证。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| W17-1 | 已完成 | 同步规划文件，确认旧 skill 删除范围与天气 skill 设计 |
| W17-2 | 已完成 | 删除旧 skill、落 `skills/weather-query/` 并移除默认天气 MCP |
| W17-3 | 已完成 | 更新 server / web 测试与 smoke，补脚本资产和代码执行验证 |
| W17-4 | 已完成 | 执行 fresh 验收并确认无测试残留 |

## 当前决定

- 不保留 `automation-designer / planner / plugin-operator` 这 3 个旧 skill。
- 天气能力改成仓库内一个正式 skill：`skills/weather-query/`。
- 不给 skill 恢复专用执行通道；天气查询继续通过现有通用工具完成。
- 当前 `bash` 工具只允许在 `/workspace` 内执行，因此天气 skill 不直接假设能从仓库路径原地执行脚本。
- 天气 skill 会同时提供：
  - 面向模型的 markdown 指令
  - 仓库内可维护的 `scripts/weather.js` 资产
- 代码执行验证分两层：
  - skill 资产被识别为 `executable`
  - 现有 `bash` 执行链与 smoke 继续提供稳定代码执行证据

## 当前摸底

- 仓库当前真实 `skills/` 目录只有：
  - `skills/automation-designer`
  - `skills/planner`
  - `skills/plugin-operator`
- 当前“查询天气”实际是默认 MCP：
  - `mcp/servers/weather-server.json`
- skill 系统当前只扫描仓库根 `skills/` 下的 `SKILL.md`，这和本轮收口方向一致。
- `bash` 当前工作目录限制在 `/workspace`，不能直接把仓库 skill 目录当执行 cwd 使用。

## 2026-04-20 执行层 runtime 规划（just-bash 起步）

## 目标

- 为后续执行环境相关能力建立正式 runtime 抽象，不再把执行后端细节直接揉进工具层。
- 首个执行后端采用 `just-bash`，但公开 contract 必须支持后续继续挂载其他执行后端。
- 当前首个 `just-bash` 后端以“挂载到指定工作区目录的文件系统”作为真相源，不走纯内存环境；这不是所有 runtime 后端的统一硬约束。
- 第一版默认允许网络等完整能力，但能力策略必须是 runtime 自己的正式 owner。
- 先把计划和风险写清楚，这一轮不开始 runtime 实现代码。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R17-1 | 已完成 | 定义 runtime 驱动接口、session/workspace/能力策略 contract，明确多后端抽象 |
| R17-2 | 已完成 | 落首个 `just-bash` 适配器，明确 exec 生命周期与错误模型 |
| R17-3 | 已完成 | 设计挂载目录、工作区复制/映射、持久文件真相源与清理策略 |
| R17-4 | 已完成 | `subagent` 公开语义继续向 OpenCode `task` 收口，公开主键固定为 `sessionId` |
| R17-5 | 已完成 | 复核 `todo / task / bash` 与 OpenCode 的公开语义，差异表与收敛结果已补齐 |
| R17-6 | 已完成 | 为本机 shell / WSL / 容器等后续执行后端预留稳定扩展点 |
| R17-7 | 已完成 | 做 Windows / WSL 跨平台验证，并补 `workdir / timeout / tar` 等命令面证据 |
| R17-8 | 已完成 | 把工具主语义从固定 `/workspace` 收口到“当前 backend 可见路径” |
| R17-9 | 已完成 | 补 runtime 审批模式与 yolo 开关 |
| R17-12 | 已完成 | 增强 runtime host contract，并把 `bash / read / glob / grep / write / edit` 收成单个本地插件 |

## R17-5 差异表

| 工具 | OpenCode 主语义 | 当前收口结果 | 保留差异 |
| --- | --- | --- | --- |
| `todo` | session 级全量覆盖写入 | 已对齐为当前 session 全量覆盖，不走增量 patch | 无额外公开差异 |
| `task` | 以 session 续跑，结果面向模型只给最小必要信息 | 已收口为 `sessionId + <task_result>`，不再回送 `provider/model` | 工具名保持项目风格 `task`，不改成其他别名 |
| `bash` | 公开的是 shell 工作区语义，而不是宿主实现细节 | 已收口为“session 工作区持续、shell 状态不持续、自包含命令” | 当前后端仍不提供持久 shell 进程状态；这是现阶段 runtime 边界，不再向模型暴露宿主直挂或审批实现细节 |

## 当前决定

- 公开工具语义仍使用 `bash`，不把 `just-bash` 直接作为对模型暴露的工具名。
- `just-bash` 只是首个执行后端，不应反向定义整个 runtime 接口。
- 通用执行工具的主语义不再绑定某个代码仓库，也不再绑定单个固定 `/workspace` 根。
- 对工具来说，稳定真相应是“当前 backend 允许看见哪些路径、允许做哪些能力操作”。
- “项目 / worktree”后续如有需要，只能作为附加视图或特定 backend 能力，不能反向定义通用环境工具。
- runtime 至少要拆出这些 owner：
  - 驱动接口
  - 工作区挂载配置
  - 能力策略
  - native 工具接线
- runtime 需要提供显式审批模式开关；yolo 模式属于 runtime 配置，不属于单个工具特判。
- 对 `just-bash` 后端，工作区必须是显式指定目录，执行产生的文件要落到这个目录语义上；其他后端后续可按各自能力模型定义是否需要同样约束。
- 默认能力按用户要求允许网络访问等完整能力，但后续若要限权，必须改 runtime 能力策略，不在工具层散落特判。
- 当前先不决定“Windows 直接跑 `just-bash`”就是最终方案；先把它视为待验证对象。
- 第一段实现改成“系统路径留在内存层，`/workspace` 直挂宿主 session 工作区”模型：
  - `just-bash` 仍然是首个执行后端
  - `/bin`、`/usr/bin`、`/proc` 这类系统路径仍由内存 base 承接
  - `/workspace` 通过宿主自建 mounted filesystem 直挂到真实目录
  - 不直接使用当前 Windows 下不稳定的 `ReadWriteFs` 路径解析
- 这轮优先把这些东西打通：
  - runtime 执行接口
  - session 工作区目录
  - native `bash` 工具
  - 实际 smoke 里的写入后再读取验证

## 当前摸底

- `just-bash@2.14.2` 已装入 `packages/server`，可作为后续 runtime 试验基座。
- 已确认 `just-bash` 的关键导出包括：
  - `Bash`
  - `InMemoryFs`
  - `OverlayFs`
  - `ReadWriteFs`
  - `MountableFs`
  - `defineCommand`
- 已确认 `exec()` 的关键语义：
  - 多次执行共享文件系统状态
  - 不共享 shell 进程状态
  - 因此 `cwd / export / shell function` 之类状态不会跨次保留
- 已确认它支持 `curl`，但需要显式打开 `network`。
- 已观察到 Windows 下真实目录挂载有明显风险：
  - `ReadWriteFs` / `MountableFs` 对 `/workspace` 这类虚拟绝对路径和 Windows 宿主路径的映射不稳定
  - 出现过 `resolves outside sandbox` 与真实文件找不到的问题
- 因此这轮实现前必须把“跨平台验证”当成正式阶段，而不是默认假设。
- 当前第一段实现策略：
  - 使用 `MountableFs`
  - base 仍为 `InMemoryFs`
  - `/workspace` 通过 `RuntimeMountedWorkspaceFileSystem` 直挂宿主目录
  - 这样保留真实工作区目录语义，同时绕开 `ReadWriteFs` 现有的 Windows 路径问题
- 当前 ask 审批策略：
  - runtime 能力策略正式收口为 `allow / ask / deny`
  - `just-bash` 当前对 `shellExecution / networkAccess` 走 `ask`
  - pending request 以 conversation 为 owner，支持 `once / always / reject`
  - 聊天 SSE、`GET pending`、`POST reply` 和前端聊天页审批面板都已接通
  - `always` 批准记录当前已持久化到 conversation store，服务重启后会继续生效
  - fresh `smoke:server` 已补真实链路：同一会话里首次 `bash` 调用 `always` 批准后，后续 `bash` 调用不再二次 `ask`
- 当前测试约束补充：
  - `runtime-just-bash.service.spec.ts` 这类直接改 `process.env` 的用例，恢复环境时不能写 `process.env.KEY = undefined`
  - 原值缺失时必须 `delete process.env.KEY`，否则 Node 会把它变成字符串 `'undefined'`，污染后续 `just-bash` 配置读取
- 当前 runtime 抽象收口新进展：
  - `RuntimeCommandService` 已改成 runtime backend 注册表模式，不再硬绑定单个 `RuntimeJustBashService`
  - shared `RuntimeBackendKind` 已放宽为开放字符串，不再把契约锁死为单一字面量
  - 新增 `RuntimeToolBackendService`，把 shell backend 与 workspace backend 的选择点从工具层抽回 runtime owner
  - `ToolRegistryService` 当前只消费解析后的 backend descriptor，不再持有“先拿 kind 再回查 registry”的细节
  - `BashToolService` 的描述文案也已改成读取当前默认 shell backend descriptor，而不是写死 `just-bash`
- 当前已落第一段实现：
  - `RuntimeCommandService` 已作为 runtime 执行入口落地
  - `RuntimeJustBashService` 已作为首个后端落地
  - `RuntimeWorkspaceService` 已把 session 工作区同步到宿主目录
  - `RuntimeWorkspaceService` 已补 `deleteWorkspace()`，主会话删除时会清理对应 runtime workspace
  - `RuntimeMountedWorkspaceFileSystem` 已把 `/workspace` 直挂到宿主目录
  - `RuntimeMountedWorkspaceFileSystem` 已补 `symlink / link / readlink`
  - native `bash / read / glob / grep / write / edit` 工具已进入统一工具集
  - `RuntimeToolPermissionService` 已作为 runtime 权限 owner 落地
  - `ToolRegistryService` 已把 native runtime 工具统一接到权限审查链
  - HTTP smoke 已覆盖 `bash / read / glob / grep / write / edit` 多轮工具链，以及“先写文件、再读取、再校验宿主目录存在文件、最后删除会话后工作区已被清理”
  - `RuntimeHostConversationRecordService` 的可选注入不能用 `Pick<...>` 这类泛型类型表达；Nest 真链路只会拿到 `Object`，会让清理逻辑在 HTTP 路径里静默失效
  - `BashToolService` 已把“命令完成后同步回宿主工作区”的旧描述改成“直挂并直接落宿主工作区”
- 当前已拿到的新鲜验证：
  - Windows：`packages/server` runtime 定向 `jest`、`packages/server build`、root `lint`、root `smoke:server`
  - WSL 内部目录：`packages/server` runtime 定向 `jest`、root `smoke:server`
- 2026-04-20 补充推进：
  - `bash` 的对模描述和 `<bash_result>` 已去掉 backend kind 这类宿主附加语义
  - `task` 的对模结果已收成 `session_id + <task_result>`，不再回送 `provider/model`
  - `RuntimeJustBashService` 已补 runtime owner 的统一超时决议，不再只依赖底层 `AbortSignal`
  - HTTP smoke 已新增 `bash-workdir-loop`、`bash-timeout-loop` 与 `bash-tar-loop`
- 当前已确认的命令面：
  - 文件追加、复制、移动、删除
  - shell 状态跨次不续存
  - 本地 `curl` 网络访问
  - `ln -s / readlink / ln`
- 当前仍缺：
  - 更宽命令面，例如压缩、`tar`、更复杂目录树与边界性能

## 2026-04-21 G18 runtime 二次收口

## 目标

- 把 session 环境从 command backend 和 filesystem backend 中拆成独立 owner。
- 把当前 `host-filesystem` backend 补成更接近通用 filesystem backend 的稳定接口。
- 保持现有工具公开行为不变，不引入兼容壳。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| G18-2 | 已完成 | 新增 `RuntimeSessionEnvironmentService`，收走 `storageRoot / visibleRoot / workspaceRoot` owner，并让命令链、文件链、会话删除清理链统一依赖它 |
| G18-3 | 已完成 | 为 `host-filesystem` backend 补 `resolve/stat/mkdir/delete/move/copy/symlink/readlink`，并把 `workspace backend` 命名继续收口成 `filesystem backend` |
| G18-4 | 已完成 | 让文件工具统一通过 `RuntimeFilesystemBackendService` 的稳定 contract 执行，不再自己持有 configured backend 细节 |
| G18-5 | 已完成 | 把 runtime 审批请求、工具 access 声明和前端审批面板从 capability 语义切到 operation 语义 |
| G18-6 | 已完成 | 把 project/worktree 相关 owner 下沉为可选 overlay，并通过 fresh 验证与独立 judge |
| G18-7 | 已完成 | 用第二 shell backend 和第二 filesystem backend 的真路由测试，复核 runtime 抽象的可迁移性 |

## 当前进展

- `G19-1` 已开始：
  - 已把 `bash` 结果文本渲染收口到 `execution/runtime/runtime-command-output.ts`
  - `BashToolService.toModelOutput()` 与 `builtin.runtime-tools` 当前共用 `renderRuntimeCommandTextOutput()`
  - 当前已补输出尾部截断语义：每个 stream 最多保留最后 `200` 行、`16 KiB`
  - `RuntimeCommandService` 当前会在 backend 原始结果上统一补 `stdoutStats / stderrStats`
  - `runtime-command-output.ts` 已改成消费本地稳定渲染输入接口，不再依赖跨包联合 `Pick<>`
  - `builtin.runtime-tools` 当前已声明 `config schema`，前端插件配置页会直接渲染 bash 输出治理项
  - 插件配置链已接通 `maxLines / maxBytes / showTruncationDetails` 三个字段，并实际影响 `bash` 工具返回文本
  - 已通过定向验证：
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/runtime/runtime-command.service.spec.ts tests/execution/runtime/runtime-command-output.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts`
    - `packages/web`: `npm run test:run -- tests/features/plugins/components/PluginConfigForm.spec.ts`
    - `packages/shared`: `npm run build`
    - `packages/plugin-sdk`: `npm run build`
    - `packages/server`: `npm run build`
    - root: `npm run lint`
    - root: `npm run smoke:server`
    - root: `npm run smoke:web-ui`
  - 已补浏览器 smoke 的数值输入稳定性：
    - `context-length` 输入现在会在等待按钮启用时反复写值并派发 `input/change`
    - 本轮 `smoke:server` 与 `smoke:web-ui` 已重新通过
- `G18-4` 已新增 `RuntimeFilesystemBackend.readPathRange`，把 `read` 的目录/文件分支、offset 越界诊断、行切片与行截断继续下沉到 filesystem backend owner。
- `ReadToolService` 当前只保留参数校验、stable contract 调用与结果文本包装。
- `write / edit` 复核后暂不继续拆；当前已经基本满足“工具层只剩参数校验 + contract 调用 + 结果包装”的目标。
- `RuntimeCommandResult / PluginRuntimeCommandResult` 已移除不再使用的 `workspaceRoot`。
- `RuntimeSessionEnvironment.workspaceRoot` 已收口为 `sessionRoot`，`RuntimeFilesystemResolvedPath.workspaceRoot` 也已移除。
- 当前生产代码里和本阶段相关的旧 `workspace` owner 命名已经清空；后续若继续推进，重点应转向 `G18-6 project/worktree overlay`，而不是再做同类命名清理。
- `G18-6` 第一刀已开始：
  - project root 判定已从自由函数收口为 `ProjectWorktreeRootService`
  - `ProjectWorktreeOverlayModule` 已建立，当前由 `RuntimeHostModule` import/export
  - project/worktree 相关服务的下一步重点应是继续判断哪些能力可以彻底移出 runtime host 主模块
- `G18-6` 第二刀已完成：
  - `ProjectWorktreeOverlayModule` 已直接持有 `skill / mcp / persona / subagent-type` 这些 project/worktree 相关 provider
  - `RuntimeHostModule` 不再直接注册这些 provider
  - `AppModule` 已直接导入 overlay module，`RuntimeHostModule` 也不再转手导出 overlay
- `G18-6` 第三刀已完成：
  - `ProjectWorktreeFileService / SkillRegistryService / McpConfigStoreService / PersonaStoreService / ProjectSubagentTypeRegistryService` 已移除默认 `new ProjectWorktreeRootService()`，强制回到 overlay module 装配
  - `RuntimeHostSubagentRunnerService` 已移除默认 `new RuntimeHostSubagentSessionStoreService()` 与 `new ProjectSubagentTypeRegistryService()`，不再把 session/type owner 偷带回 runtime host
  - 相关 server 定向测试构造已统一显式传入这些 owner，避免测试链路继续掩盖真实装配问题
- `G18-6` 第四刀已完成：
  - `RuntimeHostSubagentTypeRegistryService` 已迁到 overlay owner `ProjectSubagentTypeRegistryService`
  - 对应测试已迁到 `tests/execution/project/project-subagent-type-registry.service.spec.ts`
  - `RuntimeHostSubagentRunnerService` 只消费 overlay 侧 registry，不再依赖 runtime/host 目录中的 project owner 命名
- `G18-6` 独立 judge 已 PASS：
  - judge 确认 overlay provider 目前已真正落在 `ProjectWorktreeOverlayModule`
  - judge 确认 `ProjectSubagentTypeRegistryService` 迁移是真迁移，不是换名留壳
  - judge 确认当前 residual risk 仅剩“runtime host 仍硬 import overlay”，但按本阶段验收口径不构成阻塞
- `G18-7` 已完成实现摸底：
  - `RuntimeCommandService`、`RuntimeFilesystemBackendService` 与 `RuntimeToolBackendService` 现有 owner 已能稳定注册多个 backend，并按环境变量切换 shell/filesystem 路由
  - `tests/execution/tool/tool-registry.service.spec.ts` 已补第二 backend 真路由回归：
    - `mock-shell` 证明 `bash` 经 runtime 权限链后会切到第二 shell backend
    - `mock-filesystem` 证明 `read / glob / grep / write / edit` 会统一切到第二 filesystem backend
  - `tests/execution/runtime/runtime-command.service.spec.ts` 与 `tests/execution/runtime/runtime-tool-backend.service.spec.ts` 已继续覆盖默认 backend、显式 backend 与未知 backend 拒绝
- `G18-7` 独立 judge 已 PASS：
  - judge 确认第二 shell/filesystem backend 证据不是只换名字或只包一层壳
  - judge 确认 `bash` 与文件工具都真正穿过 runtime owner 到达第二 backend
  - judge 确认当前残余风险只剩“第二 backend 仍是测试实现，不是生产级实现”，不阻塞本阶段完成判定
- `G18-2 ~ G18-5` 独立 judge 已 PASS：
  - judge 确认 session environment owner、filesystem backend contract、工具层稳定 contract 和 operation 公开语义都已真实成立
  - judge 确认当前残余风险主要是工具成熟度增强项，不阻塞这四段阶段完成判定

## 2026-04-21 通用环境工具语义修正

## 目标

- 把 runtime 工具主语义从“session `/workspace`”修正为“当前 backend 可见路径”。
- 保留 just-bash 作为首个 backend，但不让它当前的挂载布局反向定义整个工具 contract。
- 补 runtime 审批模式；在需要时可切到 yolo，但保留能力声明与审计痕迹。

## 当前决定

- `bash / read / glob / grep / write / edit` 的路径参数都应由 backend 判定是否可见，而不是工具层自己假设固定根。
- just-bash 下允许访问 just-bash 文件系统里当前暴露的任意路径；持久与非持久路径由 backend 自己表达。
- 当前先不把 project/worktree 作为主工具语义继续推进；相关底座仅保留为后续附加能力参考。
- yolo 只改变默认审批决议，不跳过 runtime capability declaration，也不跳过日志/审计链。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| E17-1 | 已完成 | 更新规划文件并复核当前 `/workspace` 绑定点 |
| E17-2 | 已完成 | 改造 runtime backend 文件路径 contract，去掉工具层对固定根的硬编码 |
| E17-3 | 已完成 | 改造 just-bash backend 的可见路径模型与路径校验 |
| E17-4 | 已完成 | 补 runtime yolo 模式、定向测试与 smoke，并整理 fresh 结论 |

## 2026-04-21 R17-12 runtime 工具插件化

## 目标

- 把 `bash / read / glob / grep / write / edit` 从 `ToolRegistryService` 原生注入迁到单个本地插件。
- 保留现有 runtime backend、审批链和文件/命令 owner，不回退到“插件直接碰底层 runtime 服务”。
- 让本地插件拥有正式 runtime host contract，为后续其他插件复用同一能力做准备。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| P17-12-1 | 已完成 | 增加 shared / plugin-sdk / server 的 runtime host method 与权限契约 |
| P17-12-2 | 已完成 | 新增 `builtin.runtime-tools` 本地插件，接管 `bash / read / glob / grep / write / edit` |
| P17-12-3 | 已完成 | 移除 `ToolRegistryService` 原生 runtime 工具注入并补 fresh 验证 |

## 当前决定

- 插件接口增强优先于“继续保留 native 工具壳”。
- runtime 工具不走单个 `runtime.tool.call` 泛化入口，先按稳定语义拆成 6 个 host method。
- 本阶段仍保留 `todowrite / webfetch / skill` 的 native owner；这次只处理执行环境工具。
- 新本地插件先做成 `system-required`，避免在迁移阶段改变默认可用性。
- 独立 judge 已 PASS：
  - `ToolRegistryService` 不再直接拼接 `bash / read / glob / grep / write / edit`
  - `builtin.runtime-tools` 通过正式 host contract 调用 runtime owner
  - runtime 权限审查与 backend 路由仍由宿主统一持有
  - fresh 验收链足以支撑完成判定

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
  - 宿主已落真实 `ProjectSubagentTypeRegistryService`，通过仓库根 `subagent/*.yaml` 扫描类型
  - 默认 `general / explore` 会自动补齐到目录中；`explore` 仍会补默认只读工具与探索导向提示词
  - 显式 `providerId / modelId / system / toolNames` 仍可覆盖类型默认值
  - 后台任务会持久化 `subagentType / subagentTypeName`
  - HTTP 已补 `GET /plugin-subagents/types`，插件声明式配置可用 `selectSubagentType` 拉取选项
    - 当前已补第四段 `session` 主语义收口：
      - `subagent.get` 宿主 Host API 已改成按 `sessionId` 读取
      - plugin-sdk `getSubagent()` 已改成透传 `sessionId`
      - HTTP `plugin-subagents/:sessionId` 与后台列表都已改成 session 最新投影语义
      - native `task` 工具对模型输出已改成 `session_id` 优先，`taskId` 只保留为 `ledger_task_id` 投影
      - `subagent.run` 与 `subagent.task.start/list/get/overview` 的公开结果都已移除账本 `id/taskId`，只保留 `sessionId / sessionMessageCount` 作为公开续跑与投影视图字段
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
      - 当前后台任务账本仍保留 `taskId` 作为内部投影；公开结果和前端消费已经不再暴露它
      - 后台任务页继续保留，但只展示 session 的最新执行投影，不再让任务记录反向拥有 session
      - `todo` 读写统一改到 session owner；主聊天只把 `conversationId` 当主 session id 的宿主映射
      - 插件声明式配置里的子代理选择器特殊类型改成 `selectSubagentType`

## 2026-04-20 R17-8 预备结论

- `other/opencode` 的 `bash / read / write / edit / grep / lsp` 面向真实项目 worktree，而不是 session runtime workspace。
- 当前 Garlic Claw 新增的 `bash / read / glob / grep / write / edit` 则明确面向 `sessionId` 对应的 `/workspace`。
- 这意味着当前 runtime 文件工具与 runtime bash 虽然已经形成稳定 owner，但它们不能直接当成 OpenCode 本地项目工具层。
- 因此 `R17-8` 的第一步不是直接接 `lsp`，而是先决定：
  - 新增独立的 project/worktree backend
  - 还是重定义当前文件工具的公开语义
- 在这个 owner 没厘清前，不应把 `lsp` 直接挂到现有 runtime workspace 文件链上。
- 2026-04-21 更新：
  - 用户已明确取消当前阶段的 `lsp` 计划。
  - 已复核仓库主代码，当前没有真正落地的 `lsp` 实现需要删除，只有规划层引用。
  - 因此这条结论保留为未来参考，不再作为当前执行项继续推进。

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
| L18-1 | 已完成 | 确认日志 owner、消息语义 owner、shared/server/web 契约边界 |
| L18-2 | 已完成 | 实现 server 文件日志服务与 plugin / MCP / skill 日志读写、配置持久化 |
| L18-3 | 已完成 | 实现“仅前端展示、不进入送模上下文”的消息角色并迁移上下文压缩 |
| L18-4 | 已完成 | 更新前端日志面板、聊天展示、测试、fresh 验收与独立 judge |

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
- 已补第二轮阻塞修复：
  - `RuntimeEventLogService` 已改成真正按 `cursor` 继续分页，不再只是排除当前 cursor 这一条记录。
  - 已新增 server 定向分页测试与 web 三个日志 composable 的 `loadMore` 分页测试。
- 独立 judge 已 PASS；`L18` 现在可标记为已完成。

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

## 2026-04-21 文件工具与执行抽象 100% 对齐 OpenCode

### 目标

- 压缩 `TODO.md` 已完成部分，只保留项目级真相。
- 把 `bash / read / glob / grep / write / edit` 的使用体验、结果质量、错误提示和工程化能力推进到接近 `other/opencode` 的水平。
- 继续压实 runtime 中间抽象，保证后续接更多执行后端时不需要回改工具层 owner。
- 在进入下一轮实现前，先对当前阶段做独立 judge，并只在 judge 通过后提交。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| G20-0 | 已完成 | 压缩 `TODO.md` 已完成部分，并冻结 OpenCode 100% 对齐主路线 |
| G20-1 | 已完成 | 已完成独立 judge，确认当前执行层与 smoke 修复可作为提交点 |
| G20-2 | 进行中 | 按 `TODO.md` 的 G20-0 ~ G20-7 逐段推进文件工具成熟度和中间抽象；当前已完成 `read / glob / grep / write / edit` 第一批成熟度增强并通过独立 judge，可作为阶段性提交点 |

## 2026-04-22 G20-2 第二批推进

### 本轮目标

- 继续补 `write / edit` 的工程化反馈，不把 diff owner 重新抬回工具层。
- 收掉上一轮 judge 提示的 `pdf`、`indentation-flexible`、`trimmed-boundary` 测试缺口。
- 在继续下一批实现前，重新拿到 fresh 验收证据。

### 当前结果

- `write / edit` 现在都会回带 diff 摘要，当前最小 contract 已包含：
  - `additions / deletions`
  - `beforeLineCount / afterLineCount`
  - `patch`
- diff 计算已下沉到 `packages/server/src/execution/file/runtime-file-diff.ts`，由 runtime filesystem owner 统一生成。
- `runtime-text-replace` 已把策略顺序改成：
  - `exact`
  - `trimmed-boundary`
  - `indentation-flexible`
  - `line-trimmed`
  - `whitespace-normalized`
- `read` 已补独立 PDF 格式化断言。
- `write / edit` 已继续补 session 级 freshness：
  - 已有文件必须先 `read`
  - 写入前会校验 `mtime / size` 未变化
  - `edit` 还会按解析后的 virtual path 串行加锁
- `glob / grep` 已补空结果与截断 totals 文案。
- `glob / grep` 已继续补 `partial + skippedPaths` 诊断：
  - host filesystem backend 会在遍历或读取失败时保留 skipped path
  - tool 输出会显式提示“哪些路径被跳过”
- `glob / grep` 已继续补更细失败分类：
  - backend 结果现在额外保留 `skippedEntries`
  - `glob` 会标记不可达路径
  - `grep` 会区分不可达 / 不可读 / 二进制文件跳过
  - tool 输出会把“搜索不完整”和“非文本文件跳过”拆开提示
- 已继续补 judge 指出的真实缺口：
  - `edit` 现已保留 CRLF 行尾，不再把 Windows 文本改写成 LF
  - `grep` 截断时 `totalMatches` 已改成真实总数，不再只等于已回传条数
  - freshness path lock 已按 `sessionId + virtualPath` 隔离
  - `smoke:server` 已补 stale-read 拒绝分支，端到端会验证 invalid edit result

### 下一步

- 继续补 `write / edit` 的 diagnostics / formatting 入口。
- 继续补 `glob / grep` 的更细失败分类，而不是只停在 skipped path 提示。
- 本轮如要收口为提交点，仍需独立 judge。

## 2026-04-22 G20-2 第三批推进

### 本轮目标

- 继续把 `edit` 的文本定位能力和失败反馈向 OpenCode 靠齐。
- 避免出现“替换失败但没有告诉模型该补什么上下文”的弱错误信息。

### 当前结果

- `runtime-text-replace.ts` 当前已新增两类多行定位策略：
  - `context-aware`
  - `block-anchor`
- 匹配顺序已继续收口成：
  - `exact`
  - `trimmed-boundary`
  - `indentation-flexible`
  - `context-aware`
  - `block-anchor`
  - `line-trimmed`
  - `whitespace-normalized`
- 当前不再只按“候选文本内容”计数；内部已改为按真实命中位置跟踪：
  - `candidate`
  - `startIndex`
  - `line`
- 多命中报错现在会显式回显：
  - 命中的策略名
  - 命中的总数
  - 前几处命中的起始行
  - `replaceAll` 与“补更多上下文”分别该怎么用
- 未命中报错现在也会明确提示：
  - 重新读取当前文件
  - 确保 oldString 与当前文本一致
  - 给出更多稳定锚点
- 已同步通过的回归：
  - `tests/execution/file/runtime-text-replace.spec.ts`
  - `tests/execution/file/runtime-host-filesystem-backend.service.spec.ts`
  - `tests/execution/edit/edit-tool.service.spec.ts`

### 下一步

- 通过后做独立 judge，确认不是“策略名变多了，但真实可用性没提升”。
- 如果 judge 仍挑出真实误改风险，继续先修语义，再谈阶段状态。

### 当前判定

- 本批次独立 judge 已 PASS。
- 当前可以继续推进 `G20-2 / G20-3 / G20-4` 的剩余成熟度差距，不需要回滚这批 edit 匹配增强。

## 2026-04-22 G20-4 第一批推进

### 本轮目标

- 把 `bash` 的结果文本从“只有原始 stdout/stderr”补到更接近可执行诊断的程度。
- 把网络策略和 shell 状态语义写成稳定描述，避免模型把当前 backend 误判成持久 shell。

### 当前结果

- `runtime-command-output.ts` 现在会显式输出：
  - `status: success | failed`
  - 按成功 / 失败 / 仅 stderr 告警 / 完全无输出 4 类分支给出 `diagnostic`
  - `stdout_summary / stderr_summary`
- `BashToolService.buildToolDescription()` 已把环境语义收口为：
  - 文件在 session 中持续可见
  - shell 进程状态不会跨调用保留
  - `workdir` 优先于命令内 `cd`
  - 文件读写搜索优先用专用工具，不要滥用 `bash`
  - 网络策略按 `allow / ask / deny` 明示
- 已新增 `packages/server/tests/execution/bash/bash-tool.service.spec.ts`，钉住 `ask / deny` 两类环境说明。

### 下一步

- 继续补更细的 stderr / exit_code 诊断质量。
- 视情况补更稳定的 stream summary / structured metadata 提示。

## 2026-04-22 G20-4 第二批推进

### 本轮目标

- 把被截断的 `bash` 完整输出保留为 session 可见文件路径，而不是只给 tail view。
- 保持主聊天链路与 `builtin.runtime-tools` 继续共用同一条运行时 contract，不再各自特判。

### 当前结果

- 已新增 `packages/server/src/execution/runtime/runtime-command-capture.service.ts`。
- `RuntimeCommandService` 当前会在 backend 返回后统一判定 stdout/stderr 是否超过默认渲染阈值：
  - 超过时，把完整输出写入 `/.garlic-claw/runtime-command-output/command-*.txt`
  - 并把 `outputPath` 带回 `RuntimeCommandResult`
- shared `PluginRuntimeCommandResult` 已补 `outputPath?: string`，插件宿主链不再丢这条信息。
- `runtime-command-output.ts` 当前在实际发生截断时会额外回显：
  - `full_output_path: ...`
- 已新增并通过定向回归：
  - `tests/execution/runtime/runtime-command-capture.service.spec.ts`
  - `tests/execution/runtime/runtime-command.service.spec.ts`
  - `tests/execution/runtime/runtime-command-output.spec.ts`
  - `tests/execution/runtime/runtime-tool-backend.service.spec.ts`
  - `tests/runtime/host/runtime-host.service.spec.ts`
  - `tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 继续补 `bash` 和 OpenCode 仍未对齐的执行结果治理项。
- 视情况把完整输出文件索引、清理策略和更多结构化命令元数据继续收口到 runtime owner。

## 2026-04-22 G20-5 第一批推进

### 本轮目标

- 把 `write / edit` 的 diagnostics / formatting 做成正式 overlay owner，不把这类增强语义写死进工具层。
- 保持 runtime 主链可脱离 overlay 单独工作；overlay 存在时再额外增强结果。

### 当前结果

- 已新增 `packages/server/src/execution/project/project-worktree-post-write.service.ts`。
- 已新增 `packages/server/src/execution/runtime/runtime-filesystem-post-write.service.ts`。
- 当前 `RuntimeHostFilesystemBackendService` 只通过 runtime `post-write` owner 消费 overlay 增强：
  - overlay 存在时执行 post-write 增强
  - overlay 缺席时回退到 `diagnostics: [] / formatting: null`
- `write / edit` 结果 contract 已新增：
  - `postWrite.formatting`
  - `postWrite.diagnostics`
- 当前第一轮增强能力：
  - `.json` 自动 pretty format
  - `.json / .js / .jsx / .ts / .tsx / .mjs / .cjs` 语法诊断
- `write / edit` 对模输出已补：
  - `Formatting: ...`
  - `Diagnostics: none | N issue(s)`
  - `<diagnostics file="..."> ... </diagnostics>`

### 下一步

- 继续把 post-write owner 和 runtime filesystem/backend 分层整理到更稳定的中间 contract。
- 继续确认哪些增强能力应留在 overlay，哪些该继续下沉成通用 runtime owner。

## 2026-04-22 G20-6 第一批推进

### 本轮目标

- 把 shell/filesystem backend 路由的环境变量读取从多个 service 中收走。
- 让 descriptor 决议、权限审查和实际 backend 选择继续共用同一条 runtime 路由真相。

### 当前结果

- 已新增 `packages/server/src/execution/runtime/runtime-backend-routing.service.ts`。
- 已新增 `packages/server/src/execution/runtime/runtime-visible-path.ts`。
- 当前 shell/filesystem backend 路由环境变量只由该 service 读取：
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND`
  - `GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND`
- `RuntimeFilesystemBackendService` 当前不再自己读环境变量。
- `RuntimeToolBackendService` 当前不再自己直接读 shell/filesystem 路由环境变量，而是统一消费 runtime 路由 owner。
- `RuntimeJustBashService` 与 `RuntimeHostFilesystemBackendService` 当前已共用 visible path 规范化、拼接和越界校验逻辑。
- `read / glob / grep / write / edit` 当前都会先拿固定 filesystem backend kind，再把同一个 kind 继续传给：
  - runtime filesystem 执行
  - freshness 读戳 / 锁
  - descriptor / 审批链
- 这条改动已覆盖到：
  - runtime backend 路由定向测试
  - runtime visible path 定向测试
  - `read / glob / grep / write / edit` 定向测试
  - freshness 定向测试
  - `tool-registry`
  - `runtime-host`

### 下一步

- 继续确认 runtime 中层里还有哪些“配置读取 + backend 决议 + 执行”没有完全对齐到同一 owner。
- 继续压实 command/filesystem/session 三层稳定 contract，减少后续接新 backend 时的回改点。

## 2026-04-22 G20-6 第二批推进

### 本轮目标

- 把 `RuntimeHostRuntimeToolService` 从“同次调用分散准备”收成“单次调用只固定一次 backend kind”。
- 让 `bash / read / glob / grep / write / edit` 不再在 `execute()` 阶段重复读取当前 backend。

### 当前结果

- `RuntimeToolAccessRequest` 已新增显式 `backendKind`。
- `RuntimeToolBackendService` 当前支持按显式传入的 kind 读取 backend descriptor，不再只能走当前路由默认值。
- `RuntimeHostRuntimeToolService` 现在每次 host facade 调用都会：
  - 先固定 shell 或 filesystem backend kind
  - 再把同一个 kind 传给 `readInput`
  - 再把同一个 kind 传给 `readRuntimeAccess`
  - 最后把同一个 kind 传给 `execute`
- `RuntimeHostRuntimeToolService` 内部已继续收成两条明确执行通路：
  - `runShellTool()`
  - `runFilesystemTool()`
  - 共同复用 `runPreparedTool()`，避免 6 个 host 方法重复复制同一段准备流程
- `reviewAccess()` 当前不再自己重新决议 backend，而是直接按 access 上携带的 `backendKind` 读取 descriptor。
- `bash / read / glob / grep / write / edit` 当前都已把 backend kind 改成输入的一部分：
  - 文件工具已移除对 `RuntimeToolBackendService` 的直接依赖
  - `execute()` 只消费准备好的 `backendKind`
  - 非 host 场景若直接调用 `readInput()`，默认只回到 runtime filesystem default backend，不再读取路由配置
- 已新增 `packages/server/tests/runtime/host/runtime-host-runtime-tool.service.spec.ts`：
  - shell 调用会验证 `getShellBackendKind()` 只执行一次
  - filesystem 调用会验证 `getFilesystemBackendKind()` 只执行一次
  - 并验证 permission review 与 tool execute 使用的是同一个 backend kind

### 下一步

- 继续确认 `runShellTool / runFilesystemTool / runPreparedTool` 这层是否已足够稳定，还是仍需继续下沉成更正式的 runtime prepared contract。
- 本轮如要标阶段完成，仍需 fresh 主链和独立 judge。

## 2026-04-22 G20-3 第二批推进

### 本轮目标

- 对照 `other/opencode` 复核 `glob / grep` 当前差距，不再只停留在 totals 与 skipped path。
- 在不把搜索后处理抬回工具层的前提下，补 `grep` 的搜索基路径上下文。
- 把 `glob / grep` 当前重复的 skipped diagnostics 文案收成共享 owner，继续压住工具层代码体积。

### 预期收口

- `grep` 输出和 `glob` 一样显式回显搜索基路径，模型能更直接继续 `read / edit / write`。
- `glob / grep` 的 skipped diagnostics 改为共用一套格式化逻辑，不再各自复制同类字符串拼装。
- 如果后续还要补更细 reason/count 文案，优先继续加在共享 owner，不再往单个 tool service 堆分支。

### 当前结果

- `RuntimeFilesystemGrepResult` 已新增 `basePath`，`grep` 对模输出现已显式回显 `Base: ...`。
- `glob / grep` 的 skipped diagnostics 已抽到 `runtime-search-diagnostics.ts`，当前不再各自维护同类文案分支。
- 这轮代码净变化仍保持收缩方向：
- `glob-tool.service.ts` 与 `grep-tool.service.ts` 删除了重复 diagnostics 拼装。
- 新增 shared owner 后，总 diff 仍以删除重复代码为主。

## 2026-04-22 G20-6 第三批推进

### 本轮目标

- 落一个真实可运行的第二 shell backend，而不是继续只靠 mock backend 证明可迁移性。
- 第二 backend 先收口为 `native-shell`：
  - Windows 宿主进程走 PowerShell
  - Linux / WSL 宿主进程走 bash
- filesystem 先继续复用现有 `host-filesystem`，本轮重点只验证 command backend 可迁移性。

### 设计收口

- `native-shell` 继续实现现有 `RuntimeBackend` contract，不改工具公开语义。
- backend kind 继续通过 `GARLIC_CLAW_RUNTIME_SHELL_BACKEND` 显式切换，不在本轮改默认值。
- `native-shell` 的 `cwd` 与可见路径校验继续复用现有 runtime visible path / session environment owner，不新增平行路径解析。
- 本轮 fresh 证据必须覆盖：
  - Windows 当前工作树下的 native-shell 定向与 smoke
  - WSL 内部目录下的 native-shell 定向与 smoke

### 验收重点

- `RuntimeCommandService` 真能注册并执行 `native-shell`，不是只挂 descriptor。
- `RuntimeToolBackendService`、`RuntimeHostRuntimeToolService` 与 `ToolRegistryService` 在 shell route 切到 `native-shell` 后无需改工具层代码。
- Windows 与 WSL 内部目录各至少一条真实 `bash`/PowerShell command round-trip 证据。

### 当前结果

- `native-shell` 已作为真实第二 shell backend 落地：
  - Windows 宿主进程走 PowerShell
  - Linux / WSL 宿主进程走 bash
- `http-smoke.mjs` 已补 shell-aware 命令模板：
  - `bash-config / bash-write / bash-read / bash-workdir / bash-tar` 不再写死 bash 语法
  - bash 相关文件内容断言已统一做换行规范化
- Windows fresh 验收已通过：
  - 默认 `npm run smoke:server`
  - `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - `npm run smoke:web-ui`
- WSL 内部目录 fresh 证据已补齐：
  - `other/test-logs/2026-04-22-native-shell/wsl-node-version.log`
  - `other/test-logs/2026-04-22-native-shell/wsl-native-shell-runtime-jest.log`
  - `other/test-logs/2026-04-22-native-shell/wsl-native-shell-route-jest.log`
  - `other/test-logs/2026-04-22-native-shell/wsl-native-shell-smoke-server.log`
- WSL 首次整文件执行 `tool-registry.service.spec.ts` 的失败已确认属于测试前置条件不成立：
  - 该文件中多数默认夹具只注册 `just-bash`
  - 因此本轮 Linux 证据改为只跑 native-shell 直接相关用例，不再误把无关失败算成产品阻塞

### 下一步

- 继续按 `G20-6` 总目标补 judge，而不是提前把整个阶段标成完成。
- 如果继续扩第三个 command backend，优先复核：
  - timeout / output capture / permission review 是否仍然完全不动工具层
  - smoke 资产是否还残留宿主 shell 私有假设

## 2026-04-22 G20-4 第三批推进

### 本轮目标

- 继续补 `bash` 与 `other/opencode` 在“执行前静态分析”上的差距，但只做轻量切片。
- 不引入 parser，不把 shell 预判逻辑散回工具描述或审批 service。
- 先把最容易误用、最值得提前提示的 3 类信号收进独立 owner：
  - 明显 `cd`
  - 明显文件型命令
  - 明显外部绝对路径

### 设计收口

- 新增单独的 runtime owner，专门从命令字符串里提取静态 hints。
- `BashToolService` 只消费该 owner 的结果，并把 hints 注入：
  - runtime permission request metadata
  - runtime permission request summary
- 当前阶段只做启发式识别，不承诺 AST 级准确率；更重的语法分析留给后续阶段。

### 当前结果

- 已新增 `packages/server/src/execution/runtime/runtime-shell-command-hints.ts`。
- `BashToolService.readRuntimeAccess()` 当前会把静态 hints 写进 `commandHints`：
  - `usesCd`
  - `fileCommands`
  - `absolutePaths`
  - `externalAbsolutePaths`
- 权限审批摘要当前也会回显最关键的静态提示，减少只靠长描述文案约束的情况。
- 这轮继续补了 Windows / PowerShell 口径：
  - `gc / sc / ac / sl / ni / md / rd / ren` 这类常见别名会先归一到正式命令名
  - `filesystem::...` provider 路径会参与绝对路径与外部路径识别
- 审批 `summary` 现在不只写“含文件命令 / 含外部绝对路径”，而是直接回显已识别的命令名和路径预览。
- 当前路径边界也补了一层：
  - 裸 `~` 会进入绝对路径 / 外部路径提示
  - `filesystem::/workspace/...` 若仍位于可见根内，不会被误报成外部路径
- 当前又补了两类高价值误用提示：
  - 如果已经提供 `workdir`，但命令里仍然写 `cd`，审批链会直接提示
  - Windows `native-shell` 下若命令里出现 `&&`，静态 hints 会直接标出来
- 联网命令识别也已收回同一个静态预扫 owner：
  - `curl / wget / ssh / scp / npm install / git clone` 这类命令不再只由 `bash-tool` 私有 regex 识别
  - 当前审批 `summary` 会直接补 `含联网命令`
- 当前又补了 PowerShell 原生命令口径：
  - `iwr / irm` 会先归一为 `invoke-webrequest / invoke-restmethod`
  - 这两类命令现在也会触发 `network.access` 与联网命令静态提示
- 当前又补了组合风险提示：
  - 如果同一条命令既联网又碰外部绝对路径，审批摘要会单独回显这一层组合风险
  - 这样不会和普通“联网命令”或“外部绝对路径”提示混在一起
- 已补两层回归：
  - `bash-tool.service.spec.ts`：覆盖静态 hints 的 metadata / summary
  - `tool-registry.service.spec.ts`：覆盖真实 bash 审批请求里能看到静态 hints

### 下一步

- 如果继续补这条线，优先把“轻量启发式”升级到更结构化的 shell 语法分析。
- 继续保持 owner 单点，不把解析分支重新散回 `BashToolService`、permission service 或 smoke 资产。

## 2026-04-22 G20-4 第四批推进

### 本轮目标

- 不引 parser，继续补审批前最值钱的风险信号。
- 把“普通外部绝对路径”与“写入外部绝对路径”分开，避免审批摘要只给平铺标签。
- 给 PowerShell 的 `-Path / -LiteralPath / -Destination` 补最小参数位识别，先抬高 Windows `native-shell` 的静态提示质量。

### 当前结果

- `runtime-shell-command-hints.ts` 当前已按命令段做轻量切分，不再只按整条命令平铺 token。
- 写入型命令若触碰外部绝对路径，当前会单独写入：
  - `writesExternalPath`
  - `externalWritePaths`
- 审批 `summary` 现在会直接回显：
  - `写入命令涉及外部绝对路径: ...`
- PowerShell 命令当前已补轻量参数位识别：
  - `-Path`
  - `-LiteralPath`
  - `-Destination`
- `Copy-Item -Path ... -Destination ...` 这类命令的外部写入风险，当前不再只落成“有外部绝对路径”。
- 已补定向回归：
  - `packages/server`: `tests/execution/bash/bash-tool.service.spec.ts`
  - `packages/server`: `tests/execution/tool/tool-registry.service.spec.ts` 目标审批用例
- 已重新通过 fresh 验收：
  - `packages/shared`: `npm run build`
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - root: `npm run smoke:web-ui`

### 下一步

- 如果继续补这条线，优先继续增强“命令段 + 参数位”这层结构化启发式，而不是直接跳到重 parser。
- `G20-4 / G20-6` 当前仍未做独立 judge，不能标阶段完成。

## 2026-04-22 G20-4 第五批推进

### 本轮目标

- 继续补最小但高价值的 bash 执行前信号，不引 parser。
- 把 `../`、`..\\`、`cd ..` 这类上级目录穿越倾向从普通 token 中单独抬出来。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不把解析分支散回工具层。

### 当前结果

- 当前已新增：
  - `usesParentTraversal`
  - `parentTraversalPaths`
- 审批摘要现在会直接回显：
  - `相对上级路径: .., ../notes.txt`
- `cd .. && cat ../notes.txt` 这类命令，当前不再只显示 `含 cd`，而会额外提示上级目录穿越倾向。
- 已补定向回归：
  - `packages/server`: `tests/execution/bash/bash-tool.service.spec.ts`
  - `packages/server`: `tests/execution/tool/tool-registry.service.spec.ts` 目标审批用例
- 已重新通过 fresh 验收：
  - `packages/shared`: `npm run build`
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - root: `npm run smoke:web-ui`

### 补充约束

- `smoke:server` 与 `smoke:web-ui` 当前都带构建链；不要并行执行两条会同时重建 `shared / plugin-sdk / server` 的 smoke，否则容易出现非代码语义的并发构建误报。

### 下一步

- 如果继续补这条线，优先继续围绕“命令段 + 路径参数位 + 目录穿越倾向”做结构化启发式。
- `G20-4 / G20-6` 当前仍未做独立 judge，不能标阶段完成。

## 2026-04-22 G20-6 第四批推进

### 本轮目标

- 让前端能实时切换 `bash` 执行后端，但不新起页面、不引入新的配置 owner。
- 保持 runtime 全局 shell route 仍然是默认真相；只有前端显式选择时才覆盖。
- 收掉 `tool-registry.service.spec.ts` 因 `builtin.runtime-tools` 先读配置而产生的异步时序假设。

### 当前结果

- `builtin.runtime-tools` 当前已把 shell backend 切换收进既有配置链：
  - `shellBackend` 会通过 `context.host.getConfig()` 读取
  - 显式选择 `just-bash / native-shell` 时，会把 `backendKind` 传给 `runtime.command.execute`
- 这轮又补了一条关键语义修正：
  - `shellBackend` schema 已移除 `defaultValue: 'just-bash'`
  - 未设置时不再把 runtime 全局默认路由压回 `just-bash`
  - 前端下拉仍可显式切到 `just-bash / native-shell`，也可清空回“跟随后端默认路由”
- `tool-registry.service.spec.ts` 已补 `waitForPendingRuntimeRequest(...)`，bash 审批请求不再依赖“同 tick 立即出现”的旧假设。
- 已重新通过本轮定向验证：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/runtime/host/runtime-host-runtime-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts`
  - `packages/web`: `npm run test:run -- tests/features/plugins/components/PluginConfigForm.spec.ts`
  - `packages/shared`: `npm run build`
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - root: `npm run smoke:web-ui`

### 下一步

- 继续按 `G20-6` 总目标补独立 judge，当前仍不能标阶段完成。
- 如果后续继续扩更多 shell backend，优先保持“未设置跟随默认、显式配置才覆盖”这条 owner 真相，不再把 schema 默认值做成运行时路由。

## 2026-04-22 G20-1 补充收口

### 本轮目标

- 对照 `other/opencode`，在不新造 loaded-files 大系统的前提下，给 `read` 补一条最小可用的 session reminder。
- 保持实现继续复用现有 freshness owner，不把提醒逻辑抬回聊天链、工具层外或前端。
- 同时继续压缩 `TODO.md` 中已完成阶段，只保留活跃路线和差距真相。

### 当前结果

- `RuntimeFileFreshnessService` 已新增 `listRecentReads()`：
  - 按最近读取时间倒序返回当前 session 已读取文件
  - 支持 `excludePath / limit`
- `ReadToolService` 当前在成功读取文本文件后，会追加最小 `<system-reminder>`：
  - 回显“本 session 近期还读取过这些文件”
  - 提示跨文件继续修改时优先复用已读内容；如文件可能已变更，先重新 `read`
- 这条实现继续保持低膨胀：
  - 没有新增新的 loaded-files service
  - 没有改 shared 契约
  - 只是在既有 freshness owner 上补只读查询，再由 `read` 渲染最小提醒
- `TODO.md` 已继续压缩：
  - 已完成阶段收成归档摘要
  - 当前短板改成按 `bash / read / glob-grep / write-edit / runtime` 的差距矩阵
  - 新增 `P20-*` 当前执行计划，并把本轮 `read` reminder 标成已执行

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/runtime/runtime-file-freshness.service.spec.ts`
- `packages/server`: `npm run build`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `read`，优先把 loaded-files reminder 继续收成更稳定 owner，而不是把更多 session 提示直接堆进 `ReadToolService`。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-2 第四批推进

### 本轮目标

- 继续把 `write / edit` 的结果从“只有数字摘要”向更可执行反馈推进。
- 不新增新的 diff 子系统，直接复用现有 `RuntimeFilesystemDiffSummary.patch`。
- 避免 `write` 和 `edit` 各自拼一套 patch 文案，保持低膨胀。

### 当前结果

- 已新增 `packages/server/src/execution/file/runtime-file-diff-report.ts`。
- `write` 与 `edit` 当前都通过同一个共享 owner 回显最小 `<patch>` 预览：
  - 默认最多显示前 `20` 行 patch
  - 超出时会提示剩余 patch 行数
- 这轮没有改 shared 契约，也没有把 diff 逻辑抬回工具层：
  - diff 真相仍在 filesystem/backend owner
  - 工具层只消费共享渲染 helper

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts`
- `packages/server`: `npm run build`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `write / edit`，优先让 patch / diagnostics / formatting 继续共用共享 owner，而不是再往两个 tool service 分别堆输出分支。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-2 第五批推进

### 本轮目标

- 继续补 `write / edit` 与 `other/opencode` 的可恢复性差距，但保持 owner 不外扩。
- 在“已有文件未先 `read` 就修改”被 freshness 拒绝时，补最小但直接可执行的上下文提示。
- 不新造 loaded-files 或 write-session 子系统，继续复用既有 freshness owner。

### 当前结果

- `RuntimeFileFreshnessService.assertCanWrite()` 当前在拒绝“未先 read 就覆盖已有文件”时，会附带：
  - 当前 session 最近已读文件列表
  - 自动排除当前目标文件
  - 默认最多回显 `5` 条
- 这条增强继续复用已有 `listRecentReads()`，没有新增新的 session 状态 owner。
- `tool-registry.service.spec.ts` 的大夹具已同步补 `listRecentReads()` stub，避免旧 mock 让 read 工具在非目标用例里出现假回归。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/runtime/runtime-just-bash.service.spec.ts tests/execution/runtime/runtime-native-shell.service.spec.ts tests/execution/runtime/runtime-tool-backend.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/runtime/host/runtime-host-runtime-tool.service.spec.ts`
- `packages/web`: `npm run test:run -- tests/features/plugins/components/PluginConfigForm.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-2`，优先把 freshness / patch / diagnostics 的结果组织继续稳定到共享 owner，而不是给单个工具追加更多私有提示分支。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第六批推进

### 本轮目标

- 继续补 `bash` 执行前静态预扫，但保持实现集中在 `runtime-shell-command-hints.ts`。
- 把 shell 重定向写文件这类高价值误用也纳入外部写入风险提示。
- 不引 parser，不把这层判断散回 `BashToolService` 或审批 service。

### 当前结果

- 当前已新增 shell 重定向目标识别：
  - `>`
  - `>>`
  - `1>`
  - `2>`
  - `*>`
- 当重定向目标落到外部绝对路径时，当前也会进入：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持单点 owner：
  - `BashToolService` 无新增解析分支
  - `ToolRegistryService` 无新增特判

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先沿“命令段 + 参数位 + 重定向目标”继续增强结构化启发式，而不是直接引入重 parser。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第七批推进

### 本轮目标

- 继续按 `other/opencode` 对照 `bash` 执行前预扫，但仍保持单点 owner。
- 补 PowerShell 常用写文件形式 `Out-File -FilePath ...` 的外部写入提示。
- 保持实现继续收在 `runtime-shell-command-hints.ts`，不扩散到工具层和审批层。

### 当前结果

- 当前已把 `out-file` 纳入：
  - `FILE_COMMANDS`
  - `WRITE_COMMANDS`
- PowerShell 路径参数位当前已补 `-FilePath`。
- 因此 `Get-Content ... | Out-File -FilePath filesystem::C:\\temp\\copied.txt` 这类命令现在会稳定回显：
  - `fileCommands: ['get-content', 'out-file']`
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续围绕 PowerShell / bash 常见写法补结构化命令段识别，而不是新增第二套审批前解析逻辑。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-3 第三批推进

### 本轮目标

- 继续补 `glob / grep` 与 `other/opencode` 的结果摘要差距，但保持工具层不增厚。
- 把截断提示里“隐藏了多少结果”这类文案收成共享 owner，不再由两个 tool service 各自维护。
- 顺手继续压缩 `TODO.md` 中对当前已做差异的记录。

### 当前结果

- 已新增 `packages/server/src/execution/file/runtime-search-result-report.ts`。
- `glob / grep` 当前都通过同一个共享 owner 输出截断摘要：
  - 统一回显 `showing first X of Y matches`
  - 若存在剩余结果，会额外回显 `N hidden`
- 这条实现继续保持低膨胀：
  - 没有改 backend contract
  - 没有把搜索摘要文案继续散在两个 tool service

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-3`，优先继续把搜索结果摘要、空结果提示和后续 continuation hint 收成共享 owner，而不是回到 `glob / grep` 各自拼文案。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-3 第四批推进

### 本轮目标

- 继续补 `grep` 与 `other/opencode` 在结果摘要上的细小但真实差距。
- 让 continuation hint 只提示当前真实可调的过滤项，避免未传 `include` 时仍回显 `Refine include`。
- 保持实现继续收在 shared search report owner，不把判断分支重新放回 `grep-tool.service.ts`。

### 当前结果

- `runtime-search-result-report.ts` 当前已新增 `renderRuntimeGrepContinuationHint(include?)`。
- `grep` 截断提示现在会按输入动态回显：
  - 有 `include`：`Refine path, include or pattern to continue.`
  - 无 `include`：`Refine path or pattern to continue.`
- 这条增强继续保持低膨胀：
  - 没有改 backend contract
  - 没有在 `grep-tool.service.ts` 再堆一段字符串分支

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-3`，优先继续收口空结果提示、totals 和 continuation hint 这类结果摘要，而不是回到工具层复制格式化分支。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第八批推进

### 本轮目标

- 继续补 `bash` 静态预扫里和 `other/opencode` 仍有差距的“联网命令写文件”场景，但保持单点 owner。
- 让联网命令带输出文件参数时，也进入 `externalWritePaths / writesExternalPath`，而不是只提示“联网命令碰外部路径”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不把这层判断散回工具层或审批层。

### 当前结果

- 当前已把两类高频联网写文件口径并入静态预扫：
  - `curl -o / --output`
  - `Invoke-WebRequest -OutFile / -OutputFile`
- 因此这几类命令现在都会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 只补 `WRITE_COMMANDS` 词汇和 PowerShell 路径参数位
  - 没有新增 parser、没有新增第二套审批前解析逻辑

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续围绕联网命令的结构化参数位识别补高价值场景，而不是引入重 parser。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第九批推进

### 本轮目标

- 继续补 Unix 侧联网命令的外部写入识别，但保持单点 owner。
- 让 `wget -O` 与 `scp ... <dest>` 这类常见下载/拷贝命令也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不增加第二套 shell 预扫逻辑。

### 当前结果

- 当前已把两类 Unix 常见联网写文件口径并入静态预扫：
  - `wget -O / --output-document`
  - `scp <remote> <dest>`
- 因此这几类命令现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 只补 `WRITE_COMMANDS` 词汇
  - 没有新增 parser、没有改审批 service、没有改工具层

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先考虑把更多“命令名 + 少量关键参数位”继续收成同一 owner，而不是直接跳到重 parser。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十批推进

### 本轮目标

- 把上一刀 `curl / wget / scp` 的联网写文件识别从粗粒度命令名单，收紧到“命令名 + 关键参数位”。
- 先修掉两类真实误报：
  - `curl --upload-file <local>`
  - `scp <local> <remote>`
- 保持实现继续留在 `runtime-shell-command-hints.ts`，不把逻辑散回工具层。

### 当前结果

- 当前已新增命令特定写路径提取：
  - `curl`: `-o / --output`
  - `wget`: `-O / --output-document / --output-file / -P / --directory-prefix`
  - `scp`: 仅把最后一个 positional token 当作目标路径
- 因此当前既能继续识别：
  - `curl -o`
  - `wget -O`
  - `scp <remote> <dest>`
- 也不会再把这些命令里的本地输入路径误报成：
  - `externalWritePaths`
  - `writesExternalPath`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在同一 owner 内把粗粒度命令名单收成少量结构化参数位

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续沿“命令名 + 少量关键参数位”的方式扩高价值场景，而不是退回大而粗的命令白名单。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十一批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 short flag 的大小写边界，但保持单点 owner。
- 先修掉 `wget -P` 与 `wget -p` 被同一套 lower-case 匹配混掉的问题。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser。

### 当前结果

- 当前已把 shell short flag 匹配收成：
  - 短参数按原样精确匹配
  - 长参数继续按小写匹配
- 因此：
  - `wget -P /tmp/downloads` 仍会进入 `externalWritePaths`
  - `wget -p ~/downloads ...` 不再误报成 `writesExternalPath`
- 这条增强继续保持低膨胀：
  - 没有改工具层
  - 没有改审批 service
  - 只是在同一 owner 内修正 flag matching 规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续检查少量高价值 short/long flag 的语义边界，而不是直接扩大命令名单。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十二批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 Unix long flag 的大小写边界，但保持单点 owner。
- 先修掉 `curl --output` / `wget --directory-prefix` 与其错误大小写变体被同一套 lower-case 匹配混掉的问题。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser。

### 当前结果

- 当前已把 Unix shell flag 匹配进一步收成：
  - short flag 精确匹配
  - long flag 也精确匹配
- 因此：
  - `curl --output`、`wget --directory-prefix` 仍会进入 `externalWritePaths`
  - `curl --Output`、`wget --Directory-Prefix` 不再误报成 `writesExternalPath`
- 这条增强继续保持低膨胀：
  - 没有改工具层
  - 没有改审批 service
  - 只是在同一 owner 内修正 Unix long flag matching 规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续沿“少量关键参数位 + 真实 CLI 语义边界”推进，而不是扩大命令名单或退回粗粒度启发式。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十三批推进

### 本轮目标

- 继续补 `bash` 静态预扫里和 `other/opencode` 仍有差距的“联网命令显式目标目录落盘”场景，但保持单点 owner。
- 让 `git clone <repo> <dest>` 在显式目标目录落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已新增 `git clone` 的最小写路径提取：
  - 仅在首个 positional token 为 `clone` 时生效
  - `clone` 之后至少存在 `repo + dest` 两个 positional token 时，取最后一个作为目标目录
- 因此 `git clone https://example.com/repo.git /tmp/repo-copy` 现在会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 没有把 `git` 做成粗粒度写命令白名单

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续沿“命令名 + 少量关键参数位 + 明确落盘目标”推进，而不是把更多命令粗暴并入写命令名单。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十四批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git clone` 的另一条明确落盘目标，但保持单点 owner。
- 让 `git clone --separate-git-dir <path>` 在目标路径落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git clone --separate-git-dir <path>` 并入 `git clone` 写路径提取：
  - `--separate-git-dir` 会直接进入命令特定写路径参数位识别
  - 若同时还带显式 `<repo> <dest>`，写路径会按去重后的最小预览回显
- 因此 `git clone --separate-git-dir /tmp/repo.git https://example.com/repo.git` 现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在既有 `git clone` owner 上补一个明确参数位

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“明确写路径但仍能用少量参数位表达”的高价值命令，而不是退回粗粒度白名单或引 parser。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十五批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git` 的本地初始化落盘边界，但保持单点 owner。
- 让 `git init <path>` 在目标目录落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git init` 并入 `git` 命令特定写路径提取：
  - `git init <path>` 会把第一个 positional token 视为显式初始化目标目录
  - 未显式提供初始化目录时，不去猜当前目录或隐式 `.git`
- 因此 `git init /tmp/repo-copy` 现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在既有 `git` 子命令 owner 上补一个更明确的本地写入边界

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“命令子语义明确、但当前 hints 还没覆盖”的本地/联网落盘边界，而不是把整类命令抬成粗粒度白名单。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十六批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git` 的本地目录扩展边界，但保持单点 owner。
- 让 `git worktree add <path>` 在目标目录落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git worktree add` 并入 `git` 命令特定写路径提取：
  - 仅在子命令链为 `git worktree add` 时生效
  - 当前会跳过 `-b / -B / --orphan / --reason` 这类已知取值参数，再取第一个真正的 positional token 作为目标目录
- 因此 `git worktree add -b feature /tmp/repo-copy main` 现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在既有 `git` 子命令 owner 上补少量取值参数跳过规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“命令子语义明确、且只需少量 flag/positional 规则就能表达”的边界，而不是退回粗粒度命令名单。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十七批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git` 的仓库扩展边界，但保持单点 owner。
- 让 `git submodule add <repo> <path>` 在显式目标目录落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git submodule add` 并入 `git` 命令特定写路径提取：
  - 仅在子命令链为 `git submodule add` 时生效
  - 当前会跳过 `-b / --branch / --depth / --name / --reference` 这类已知取值参数，再取显式 `<repo> <path>` 里的最后一个 positional token 作为目标目录
- 因此 `git submodule add https://example.com/repo.git /tmp/repo-copy` 现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在既有 `git` 子命令 owner 上补少量取值参数跳过规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“命令子语义明确、同时能明显提升审批前可恢复性”的边界，而不是把 `bash` hints 扩成零散命令大全。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十八批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git` 的归档落盘边界，但保持单点 owner。
- 让 `git archive --output/-o <path>` 在输出文件落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git archive` 并入 `git` 命令特定写路径提取：
  - 仅在子命令为 `git archive` 时生效
  - 当前通过 `--output / -o` 这类明确输出参数位识别归档文件路径
- 因此 `git archive --output /tmp/repo.tar HEAD` 现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在既有 `git` 子命令 owner 上补一个明确输出参数位

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“命令子语义明确、并且能复用现有 flag/positional 提取”的边界，而不是把这层 hints 膨胀成零散特判集合。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第十九批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git` 的导出落盘边界，但保持单点 owner。
- 让 `git bundle create <file>` 在输出文件落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git bundle create` 并入 `git` 命令特定写路径提取：
  - 仅在子命令链为 `git bundle create` 时生效
  - 当前把 `create` 之后第一个显式 positional token 视为 bundle 输出文件
- 因此 `git bundle create /tmp/repo.bundle HEAD` 现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在既有 `git` 子命令 owner 上补一个明确的 positional 输出文件规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“命令子语义明确、并且只需最小 positional/flag 规则”的边界，而不是把 hints 继续膨胀成命令大全。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git` 的补丁导出边界，但保持单点 owner。
- 让 `git format-patch -o/--output-directory <dir>` 在输出目录落到外部绝对路径时，也进入 `externalWritePaths / writesExternalPath`。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git format-patch` 并入 `git` 命令特定写路径提取：
  - 仅在子命令为 `git format-patch` 时生效
  - 当前通过 `-o / --output-directory` 这类明确输出目录参数位识别补丁输出目录
- 因此 `git format-patch --output-directory /tmp/patches HEAD~2` 现在也会稳定回显：
  - `externalWritePaths`
  - `writesExternalPath`
  - 审批摘要里的 `写入命令涉及外部绝对路径`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是在既有 `git` 子命令 owner 上补一个明确输出目录参数位

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“命令子语义明确、并且能继续复用少量 flag/positional 规则”的边界，而不是转向更重的 parser 或命令大全。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十一批推进

### 本轮目标

- 继续补 `bash` 静态预扫里仍然偏粗粒度的 `tar` 写路径识别，但保持单点 owner。
- 把 `tar` 从“所有非 flag 路径都可能写”收成“按 create/extract 模式识别真正的输出路径”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `tar` 改成模式化写路径提取：
  - create / append / update 模式只认 `-f / --file` 为输出归档文件
  - extract 模式只认 `-C / --directory` 为输出目录
- 因此：
  - `tar -cf /tmp/archive.tar ~/source.txt` 当前只会把 `/tmp/archive.tar` 记为 `externalWritePaths`
  - `tar -xf ~/archive.tar -C /tmp/output` 当前只会把 `/tmp/output` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把现有 `tar` 粗粒度 owner 收成少量真实模式与参数位

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找“当前仍是粗粒度名单，但可以压成少量真实参数位/模式”的命令，而不是把 hints 膨胀成大而散的特判集合。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十二批推进

### 本轮目标

- 继续补 `bash` 静态预扫里仍然偏粗粒度的 `cp / mv` 写路径识别，但保持单点 owner。
- 把 `cp / mv` 从“所有 positional 路径都可能写”收成“只把最后一个 positional token 视为目标路径”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `cp / mv` 改成目标路径提取：
  - 仅在命令名为 `cp` 或 `mv` 时生效
  - 当前只把最后一个 positional token 视为写入目标
- 因此：
  - `cp ~/source.txt /tmp/copied.txt` 当前只会把 `/tmp/copied.txt` 记为 `externalWritePaths`
  - `mv ~/source.txt /tmp/moved.txt` 当前只会把 `/tmp/moved.txt` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把现有 `cp / mv` 粗粒度 owner 收成最小 positional 目标路径规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找 PowerShell 侧仍偏粗粒度、但也能收成少量真实参数位的命令，例如 `Copy-Item / Move-Item`。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十三批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 PowerShell 侧仍偏粗粒度的 `Copy-Item / Move-Item` 写路径识别，但保持单点 owner。
- 把这两类命令从“`-Path / -Destination` 一起视为写路径”收成“优先认 `-Destination`，否则只取最后一个 positional token 作为目标路径”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `Copy-Item / Move-Item` 改成目标路径提取：
  - 若显式给出 `-Destination`，当前只把该参数值视为写入目标
  - 未显式给出 `-Destination` 时，当前回退到最后一个 positional token
- 因此：
  - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt` 当前只会把 `filesystem::D:\\temp\\copied.txt` 记为 `externalWritePaths`
  - `Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt` 当前只会把 `filesystem::D:\\temp\\moved.txt` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把现有 PowerShell 复制/移动命令从通用路径参数扫描收成最小目标路径规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续看 PowerShell 侧仍偏粗粒度、但也能收成少量真实参数位的命令，例如 `Rename-Item / New-Item` 等明确写入边界。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十四批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `git init` 仍偏粗粒度的 positional 识别，但保持单点 owner。
- 把 `git init` 从“第一个 positional token 就是目标目录”收成“跳过已知取值参数后，再取显式初始化目标目录”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 git parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `git init` 改成 value-flag aware 的目标路径提取：
  - 当前会跳过 `--template / -b / -c / --initial-branch / --object-format / --ref-format` 这类已知取值参数
  - 跳过后再把第一个真正的 positional token 视为初始化目标目录
- 因此：
  - `git init --template /tmp/template-dir /tmp/repo-copy` 当前只会把 `/tmp/repo-copy` 记为 `externalWritePaths`
  - `--template` 的参数值不再误报成初始化目标目录
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把既有 `git init` owner 从粗粒度 positional 规则收成少量 value flag + positional 规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找 `git` 或 PowerShell 侧仍偏粗粒度、但也能继续收成少量 value flag/目标路径规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十五批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `cp / mv` 仍偏粗粒度的目标目录识别，但保持单点 owner。
- 把 `cp / mv` 的 `-t / --target-directory` 从“继续靠最后一个 positional token 猜目标”收成“优先认显式目标目录参数”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `cp / mv` 改成 target-directory aware 的目标路径提取：
  - 若显式给出 `-t / --target-directory`，当前只把该参数值视为写入目标
  - 未显式给出时，当前仍回退到最后一个 positional token
- 因此：
  - `cp -t /tmp/copied-dir ~/source-a.txt ~/source-b.txt` 当前只会把 `/tmp/copied-dir` 记为 `externalWritePaths`
  - `mv --target-directory /tmp/moved-dir ~/source-a.txt ~/source-b.txt` 当前只会把 `/tmp/moved-dir` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把既有 `cp / mv` owner 从单一 positional 规则收成显式目标目录参数 + positional 回退规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能收成少量显式目标参数或 value-flag 跳过规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十六批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `New-Item` 仍偏粗粒度的目标路径识别，但保持单点 owner。
- 把 `New-Item -Path <dir> -Name <leaf>` 从“只认父目录路径”收成“直接回显真正创建的目标路径”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 PowerShell parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `New-Item` 改成最小目标路径拼接：
  - 若同时存在 `-Path / -LiteralPath` 与 `-Name`，当前会直接拼出真正写入目标
  - 若只有 `-Path / -LiteralPath`，当前仍回退到该路径本身
- 因此：
  - `New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File` 当前会把 `filesystem::C:\\temp\\created.txt` 记为 `externalWritePaths`
  - 不再只把父目录 `filesystem::C:\\temp` 视为写入目标
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把既有 `new-item` owner 从单一路径参数收成最小目标路径拼接规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能收成少量显式目标参数、路径拼接或 value-flag 跳过规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十七批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `Rename-Item` 仍偏粗粒度的目标路径识别，但保持单点 owner。
- 把 `Rename-Item -Path <old> -NewName <leaf>` 从“只认旧路径”收成“直接回显真正重命名目标路径”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 PowerShell parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `Rename-Item` 改成最小目标路径拼接：
  - 若同时存在 `-Path / -LiteralPath` 与 `-NewName`，当前会直接拼出真正的重命名目标
  - 若只有 `-Path / -LiteralPath`，当前仍回退到该路径本身
- 因此：
  - `Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt` 当前会把 `filesystem::C:\\temp\\renamed.txt` 记为 `externalWritePaths`
  - 不再只把旧路径 `filesystem::C:\\temp\\old.txt` 视为写入目标
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把既有 `rename-item` owner 从单一路径参数收成最小目标路径拼接规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能收成少量显式目标参数、路径拼接或 value-flag 跳过规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十八批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `Rename-Item` 的 PowerShell 目标路径识别，但保持单点 owner。
- 把 `Rename-Item -Path <old> -NewName <leaf>` 的路径拼接收成共享最小规则，并证明这条 PowerShell `path + leaf-name` 形态已经可复用。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 PowerShell parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `Rename-Item` 接到与 `New-Item` 一致的最小目标路径拼接 owner：
  - `-Path / -LiteralPath` 提供 base path
  - `-NewName` 提供目标 leaf name
  - 目标路径会回显为真正的重命名后路径，而不是旧路径本身
- 因此：
  - `Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt` 当前会把 `filesystem::C:\\temp\\renamed.txt` 记为 `externalWritePaths`
  - 这条 `path + leaf-name` 形态现在已经能在 `new-item / rename-item` 两类命令上复用
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把 PowerShell 同类命令继续收口到一个共享的最小路径拼接方向

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能继续收成显式目标参数、value-flag 跳过或共享路径拼接规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第二十九批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `New-Item / Rename-Item` 的 PowerShell positional 写法，但保持单点 owner。
- 把这两类命令从“优先支持 flag 写法”收成“flag 与 positional 都走同一条最小目标路径拼接规则”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 PowerShell parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `New-Item / Rename-Item` 的 positional 写法并入共享目标路径拼接：
  - `New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File` 当前会把 `filesystem::C:\\temp\\created-positional.txt` 记为 `externalWritePaths`
  - `Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt` 当前会把 `filesystem::C:\\temp\\renamed-positional.txt` 记为 `externalWritePaths`
- 这说明当前同一条 owner 已能同时覆盖：
  - `-Path / -Name`
  - `-Path / -NewName`
  - positional `path + leaf-name`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把同类 PowerShell 命令继续收口到一个共享的最小路径拼接方向

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能继续收成显式目标参数、value-flag 跳过或共享路径拼接规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第三十批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 PowerShell 路径拼接 owner 的 Windows 裸盘符边界，但保持单点 owner。
- 把 `C:\...` 这类裸盘符路径从“可能混出 `/`”收成“稳定保留反斜杠”的目标路径拼接。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 PowerShell parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把共享路径拼接规则补到裸盘符边界：
  - `New-Item -Path C:\\temp -Name created-drive.txt -ItemType File` 当前会把 `C:\\temp\\created-drive.txt` 记为 `externalWritePaths`
  - `Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt` 当前会把 `C:\\temp\\renamed-drive.txt` 记为 `externalWritePaths`
- 这说明当前 PowerShell 路径拼接 owner 已经同时覆盖：
  - `filesystem::...`
  - 裸 `C:\\...`
  - positional `path + leaf-name`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把共享路径拼接规则补齐到 Windows 裸盘符语义

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能继续收成显式目标参数、value-flag 跳过或共享路径拼接规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第三十一批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `mkdir / md` 的 PowerShell 目标路径识别，但保持单点 owner。
- 把 `mkdir -Path <dir> -Name <leaf>` 从“只认目录参数”收成“直接回显真正创建目标路径”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 PowerShell parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已给 `mkdir` 增加最小分流：
  - 若命令段使用 `-Path / -LiteralPath / -Name` 这类 PowerShell 风格参数，则复用 `New-Item` 已有的 `path + leaf-name` 目标路径拼接规则
  - 否则继续回退现有 Unix `mkdir` 路径提取，不改变原有 bash 语义
- 因此：
  - `mkdir -Path C:\\temp -Name created-dir` 当前会把 `C:\\temp\\created-dir` 记为 `externalWritePaths`
  - `md -Path C:\\temp -Name created-alias-dir` 当前会把 `C:\\temp\\created-alias-dir` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把 `mkdir / md` 接到现有共享路径拼接规则，并保留 Unix 回退分支

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能继续收成显式目标参数、value-flag 跳过或共享路径拼接规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 G20-4 第三十二批推进

### 本轮目标

- 继续补 `bash` 静态预扫里 `Set-Content / Add-Content` 的 PowerShell positional 写入识别，但保持单点 owner。
- 把这两类命令从“所有 positional token 都可能是写路径”收成“优先认显式路径参数，否则只认第一个 positional token”。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 PowerShell parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已给 `set-content / add-content` 增加最小目标路径提取：
  - 若显式给出 `-Path / -LiteralPath / -FilePath`，当前只把该参数值视为写入目标
  - 未显式给出时，当前会跳过 `-Value / -Encoding / -Delimiter / -Stream` 这类内容型取值参数，再只取第一个 positional token
- 因此：
  - `Set-Content C:\\temp\\note.txt D:\\payload.txt` 当前只会把 `C:\\temp\\note.txt` 记为 `externalWritePaths`
  - `ac C:\\temp\\append.txt D:\\payload.txt` 当前只会把 `C:\\temp\\append.txt` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改审批 service
  - 只是把 `set-content / add-content` 从通用 positional 扫描收成一条更真实的目标路径规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: `npm run build`
- `packages/server`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- root: `npm run smoke:web-ui`

### 下一步

- 如果继续补 `G20-4`，优先继续找仍偏粗粒度、但也能继续收成显式目标参数、value-flag 跳过或共享路径拼接规则的命令。
- `G20-4 / G20-6` 仍未独立 judge，当前不能标阶段完成。

## 2026-04-22 P21 计划重排

### 本轮目标

- 按用户最新要求，把 `TODO.md` 从“现状 + 局部推进”改成“完整计划 + 交付硬门槛”。
- 明确两条硬约束：
  - 最终功能成熟度要对齐 `other/opencode`
  - `packages/server/src <= 15000`
- 保持代码膨胀继续受控，不把计划写成更长的流水账。

### 当前结果

- `TODO.md` 当前已重写为项目级真相版本：
  - 保留已完成摘要
  - 重新整理当前短板
  - 新增“本轮交付硬门槛”
  - 新增“代码膨胀控制规则”
  - 把未完成路线改写为完整 `P21-1 ~ P21-7` 计划
- 当前交付完成定义已经明确收口为 4 条同时满足：
  - 对齐 `other/opencode` 的功能成熟度达到可交付水平
  - `packages/server/src <= 15000`
  - fresh 验收全通过
  - 独立 judge PASS

### 下一步

- 后续执行统一按 `P21-1 ~ P21-7` 推进，不再继续沿旧的零散 TODO 记录方式膨胀。
- 优先继续推进 `P21-1 / P21-3 / P21-4 / P21-5`，同时在每轮执行里持续核对 `packages/server/src` 行数。

## 2026-04-22 P21 计划二次收紧

### 本轮目标

- 把 `TODO.md` 从“方向正确但步子偏大”的计划，再收紧成真正可执行的串行阶段。
- 明确“每一步都要独立 judge 验收”，不能只在大阶段末尾 judge。

### 当前结果

- `TODO.md` 当前已把未完成路线改成 `P21-1 ~ P21-8` 串行阶段。
- 每一步当前都明确了：
  - 范围
  - 产出
  - fresh 验收
  - 独立 judge
- 当前执行规则也已写明：
  - 未通过 fresh 验收，不进入下一步
  - judge 未 `PASS`，不进入下一步
  - 规划文件未同步，不进入下一步

### 下一步

- 后续实际执行时，统一按 `P21-1 -> P21-2 -> ... -> P21-8` 顺序推进。
- 每完成一步，先补 fresh 验收，再做独立 judge，再同步规划文件，然后才允许进入下一步。

## 2026-04-22 P21-1 第一刀继续收口

### 本轮目标

- 继续收口 `P21-1` 里的 PowerShell 写入 / 删除命令误报，但只做最小可复用规则。
- 解决 `Remove-Item / rd` 把 `-Include` 值误抬成 `externalWritePaths` 的问题。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已给 `remove-item` 增加最小目标路径提取：
  - 优先认显式 `-Path / -LiteralPath`
  - 未显式给出时，跳过 `-Include / -Exclude / -Filter / -Stream` 这类取值参数
  - 跳过后只取第一个 positional token 作为删除目标
- 因此：
  - `Remove-Item C:\\temp -Include D:\\archived.log` 当前只会把 `C:\\temp` 记为 `externalWritePaths`
  - `rd C:\\temp -Include D:\\archived.log` 当前也只会把 `C:\\temp` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改 `BashToolService / tool-registry / 审批 service`
  - 只是把 `remove-item` 收成一条 `value-flag 跳过 + 首个 positional target` 规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否真留在单点 owner，且没有把 `-Include` 参数值继续误报成删除目标。
- judge `PASS` 后，再继续 `P21-1` 里下一类 PowerShell 误报点。

## 2026-04-22 P21-1 第二刀继续收口

### 本轮目标

- 继续收口 `P21-1` 里的 PowerShell 写入命令误报，但仍只做最小可复用规则。
- 解决 `Out-File` positional 写法把第二个看起来像路径的内容误抬成 `externalWritePaths` 的问题。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已给 `out-file` 增加最小目标路径提取：
  - 优先认显式 `-FilePath / -LiteralPath`
  - 未显式给出时，跳过 `-InputObject / -Encoding / -Width` 这类取值参数
  - 跳过后只取第一个 positional token 作为输出目标
- 因此：
  - `Out-File C:\\temp\\copied.txt D:\\payload.txt` 当前只会把 `C:\\temp\\copied.txt` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改 `BashToolService / tool-registry / 审批 service`
  - 只是把 `out-file` 接到现有 `flagged path + value-flag 跳过 + 首个 positional target` 规则

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否真留在单点 owner，且没有把 `D:\\payload.txt` 继续误报成输出目标。
- judge `PASS` 后，再继续 `P21-1` 里下一类 PowerShell 误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 判断仍集中在 `runtime-shell-command-hints.ts`
  - 没有散回 `BashToolService / tool-registry / 审批 service`
  - 仍复用既有 `flagged path / value-flag 跳过 / positional` 机制
  - 当前残余只剩更深 PowerShell 参数语法，后续继续按最小规则推进

## 2026-04-22 P21-1 第三刀继续收口

### 本轮目标

- 继续收口 `P21-1` 里的共享 PowerShell 参数语法缺口，而不是继续堆命令名单。
- 解决 `-Path:C:\\... / -FilePath:C:\\...` 这类附着写法当前无法被 hints owner 识别的问题。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已给 PowerShell 路径参数识别补上 `-Flag:Value` 附着写法：
  - `readPowerShellFlaggedPathTokensWithFlags()` 现在既支持 `-Path C:\\...`，也支持 `-Path:C:\\...`
  - 因此现有依赖这条共享能力的命令会一起受益，不需要分别加第二套解析
- 因此：
  - `Out-File -FilePath:C:\\temp\\copied-attached.txt D:\\payload.txt` 当前会把 `C:\\temp\\copied-attached.txt` 记为 `externalWritePaths`
  - `Set-Content -Path:C:\\temp\\note-attached.txt D:\\payload.txt` 当前会把 `C:\\temp\\note-attached.txt` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改 `BashToolService / tool-registry / 审批 service`
  - 只是把既有共享 `flagged path` owner 补齐到 PowerShell 常见附着参数语法

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否真停留在共享 owner，而不是把 `-Flag:Value` 逻辑散到各命令分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类 PowerShell 误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `-Flag:Value` 识别已补在共享 `flagged path` owner
  - 没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前不是按命令复制附着参数语法，而是现有分支复用共享入口
  - 当前残余是附着参数目标还未进入 `absolutePaths / externalAbsolutePaths`

## 2026-04-22 P21-1 第四刀继续收口

### 本轮目标

- 继续修正 `P21-1` 里附着参数语法的提示失真，但不引新 owner。
- 把 `-Path:C:\\... / -FilePath:C:\\...` 里的目标路径同步纳入 `absolutePaths / externalAbsolutePaths`，避免摘要只看到内容路径。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把附着参数路径并入统一绝对路径提取：
  - `readRuntimeShellCommandHints()` 现在会在逐 token 汇总 `absolutePaths` 时，同时识别 PowerShell `-Flag:Value` 里的附着路径
  - 因此附着路径现在不只进入 `externalWritePaths`，也会进入 `absolutePaths / externalAbsolutePaths`
- 因此：
  - `Out-File -FilePath:C:\\temp\\copied-attached.txt D:\\payload.txt` 当前会把 `C:\\temp\\copied-attached.txt` 与 `D:\\payload.txt` 一起记入 `absolutePaths`
  - `Set-Content -Path:C:\\temp\\note-attached.txt D:\\payload.txt` 当前也会把 `C:\\temp\\note-attached.txt` 与 `D:\\payload.txt` 一起记入 `absolutePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有改 `BashToolService / tool-registry / 审批 service`
  - 只是把既有共享附着参数能力继续接入统一 `absolutePaths` owner

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否真留在共享汇总 owner，而不是把附着参数路径额外复制进各命令分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类 PowerShell 误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 附着参数路径已补进共享 `absolutePaths` 汇总 owner
  - 没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前不是把附着路径再复制进 `set-content / out-file` 等命令分支
  - 当前残余是后续若出现新附着 path flag，仍需继续扩共享 flag 集合

## 2026-04-22 P21-1 第五刀继续收口

### 本轮目标

- 继续补 `P21-1` 里的 PowerShell 常用别名缺口，但只做不与 Unix 语义冲突的小口子。
- 让 `ri` 别名直接走现有 `remove-item` 规则，不再退化成普通 token。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `ri` 并入 `remove-item` 别名映射。
- 因此：
  - `ri C:\\temp -Include D:\\archived.log` 当前会复用现有 `remove-item` 规则，只把 `C:\\temp` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有新增命令分支
  - 只是把 `ri` 接到已有 `remove-item` owner

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是 alias 映射收口，而没有把 `ri` 专属判断散到别处。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `ri` 已作为 alias 接到既有 `remove-item` owner
  - 没有新增 `ri` 专属命令分支
  - 没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前残余只是 `absolutePaths` 摘要仍会保留 `-Include` 的路径值，不构成本刀阻塞

## 2026-04-22 P21-1 第六刀继续收口

### 本轮目标

- 继续补 `P21-1` 里的 PowerShell 常用别名缺口，仍只做不和 Unix 语义冲突的小口子。
- 让 `cpi / mi` 直接走现有 `copy-item / move-item` 规则，不再退化成普通 token。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `cpi` 并入 `copy-item`，`mi` 并入 `move-item` 别名映射。
- 因此：
  - `cpi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-alias.txt` 当前会复用 `copy-item` 规则，只把目标路径记为 `externalWritePaths`
  - `mi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-alias.txt` 当前会复用 `move-item` 规则，只把目标路径记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有新增 `cpi / mi` 专属命令分支
  - 只是把两个 alias 接到既有 owner

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是 alias 映射收口，而没有把 `cpi / mi` 专属判断散到别处。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `cpi / mi` 已作为 alias 接到既有 `copy-item / move-item` owner
  - 没有新增 `cpi / mi` 专属命令分支
  - 没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前残余只是 `tool-registry` 链路还没单独钉 `cpi / mi` 用例，不构成本刀阻塞

## 2026-04-22 P21-1 第七刀继续收口

### 本轮目标

- 收掉上一刀 judge 提到的覆盖残余，但不改实现 owner。
- 给 `tool-registry` 权限提示链补 `cpi / mi` 用例，证明 alias 在审批链里同样归一到 canonical owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已在 `tool-registry.service.spec.ts` 补上：
  - `cpi -Path ... -Destination ...`
  - `mi -Path ... -Destination ...`
- 这两条用例当前都证明：
  - alias 进入权限提示链后，`fileCommands` 仍归一为 `copy-item / move-item`
  - `externalWritePaths` 仍只保留目标路径
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把上一刀 residual risk 变成新鲜覆盖证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有让 alias 在权限链里出现第二套语义。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `tool-registry` 侧 alias 用例已证明 `cpi / mi` 在权限链里仍归一到 `copy-item / move-item`
  - `externalWritePaths` 仍只保留目标路径，没有分叉出第二套语义
  - 本轮只是补 coverage，没有新增生产 owner
  - 当前残余是更多 alias 形态尚未覆盖，不构成本刀阻塞

## 2026-04-22 P21-1 第八刀继续收口

### 本轮目标

- 继续补 `P21-1` 里的 PowerShell 删除别名缺口，仍只做不和 Unix 语义冲突的小口子。
- 让 `del / erase` 直接走现有 `remove-item` 规则，不再退化成普通 token。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `del / erase` 并入 `remove-item` 别名映射。
- 因此：
  - `del C:\\temp -Include D:\\archived.log` 当前会复用 `remove-item` 规则，只把 `C:\\temp` 记为 `externalWritePaths`
  - `erase C:\\temp -Include D:\\archived.log` 当前也会复用 `remove-item` 规则，只把 `C:\\temp` 记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有新增 `del / erase` 专属命令分支
  - 只是把两个 alias 接到既有 owner

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是 alias 映射收口，而没有把 `del / erase` 专属判断散到别处。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `del / erase` 已作为 alias 接到既有 `remove-item` owner
  - 没有新增 `del / erase` 专属命令分支
  - 没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前残余只是 `tool-registry` 链路还没单独钉 `del / erase` 用例，不构成本刀阻塞

## 2026-04-23 P21-1 第九刀继续收口

### 本轮目标

- 收掉上一刀 judge 提到的覆盖残余，但不改实现 owner。
- 给 `tool-registry` 权限提示链补 `del / erase` 用例，证明 alias 在审批链里同样归一到 `remove-item`。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已在 `tool-registry.service.spec.ts` 补上：
  - `del C:\\temp -Include D:\\archived.log`
  - `erase C:\\temp -Include D:\\archived.log`
- 这两条用例当前都证明：
  - alias 进入权限提示链后，`fileCommands` 仍归一为 `remove-item`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp`
  - `-Include` 的路径值仍只保留在 `absolutePaths / externalAbsolutePaths`
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把上一刀 residual risk 变成新鲜覆盖证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有让 `del / erase` 在权限链里出现第二套语义。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `tool-registry` 侧 alias 用例已证明 `del / erase` 在权限链里仍归一到 `remove-item`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp`，没有把 `-Include` 提升成写目标
  - 本轮只是补 coverage，没有新增生产 owner
  - 当前残余是更复杂 quoting 和其他 value-flag 组合尚未覆盖，不构成本刀阻塞

## 2026-04-23 P21-1 第十刀继续收口

### 本轮目标

- 继续补 `P21-1` 里的 PowerShell 常用词形入口，但仍优先选低冲突小口子。
- 让 `copy / move` 直接走现有 `copy-item / move-item` 规则，不再退化成普通 token。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把 `copy / move` 并入 `copy-item / move-item` 别名映射。
- 因此：
  - `copy -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-word.txt` 当前会复用 `copy-item` 规则，只把目标路径记为 `externalWritePaths`
  - `move -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-word.txt` 当前会复用 `move-item` 规则，只把目标路径记为 `externalWritePaths`
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有新增 `copy / move` 专属命令分支
  - 只是把两个词形入口接到既有 owner

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是 alias 映射收口，而没有把 `copy / move` 专属判断散到别处。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `copy / move` 已作为词形入口接到既有 `copy-item / move-item` owner
  - 没有新增 `copy / move` 专属命令分支
  - 没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前残余只是 `tool-registry` 链路还没单独钉 `copy / move` 用例，不构成本刀阻塞

## 2026-04-23 P21-1 第十一刀继续收口

### 本轮目标

- 收掉上一刀 judge 提到的覆盖残余，但不改实现 owner。
- 给 `tool-registry` 权限提示链补 `copy / move` 用例，证明词形入口在审批链里同样归一到 canonical owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已在 `tool-registry.service.spec.ts` 补上：
  - `copy -Path ... -Destination ...`
  - `move -Path ... -Destination ...`
- 这两条用例当前都证明：
  - 词形入口进入权限提示链后，`fileCommands` 仍归一为 `copy-item / move-item`
  - `externalWritePaths` 仍只保留目标路径
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把上一刀 residual risk 变成新鲜覆盖证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有让 `copy / move` 在权限链里出现第二套语义。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - `tool-registry` 侧词形入口用例已证明 `copy / move` 在权限链里仍归一到 `copy-item / move-item`
  - `externalWritePaths` 仍只保留目标路径，没有分叉出第二套语义
  - 本轮只是补 coverage，没有新增生产 owner
  - 当前残余是更真实的 PowerShell 参数形态仍未覆盖，不构成本刀阻塞

## 2026-04-23 P21-1 第十二刀继续收口

### 本轮目标

- 继续补 `P21-1` 的共享 PowerShell 参数语法缺口，不继续堆命令入口。
- 让附着参数里的带引号路径 `-Path:"..." / -FilePath:"..."` 直接进入既有绝对路径与写路径识别。
- 保持实现继续集中在 `runtime-shell-command-hints.ts`，不引 parser，不把判断散回工具层或审批层。

### 当前结果

- 当前已把附着参数值的外层引号剥离补到共享 `readPowerShellAttachedFlagValue()`：
  - `-Path:"C:\\temp\\note.txt"` 现在会被还原成 `C:\\temp\\note.txt`
  - `-FilePath:"C:\\temp\\copied.txt"` 同理
- 因此：
  - `Out-File -FilePath:"C:\\temp\\copied-attached-quoted.txt" D:\\payload.txt` 当前会把 quoted 目标路径同时记入 `absolutePaths` 与 `externalWritePaths`
  - `Set-Content -Path:"C:\\temp\\note-attached-quoted.txt" D:\\payload.txt` 同理
- 这条增强继续保持低膨胀：
  - 没有引 parser
  - 没有新增命令分支
  - 只是把既有共享附着参数 owner 补齐到 quoted 形态

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts`
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否真留在共享附着参数 owner，而没有把 quoted 逻辑散进各命令分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - quoted 附着值处理已补在共享 `readPowerShellAttachedFlagValue()` owner
  - 没有新增命令分支，也没有散回工具层
  - quoted 目标已同时进入 `absolutePaths` 与 `externalWritePaths`
  - 当前残余只是 `tool-registry` 链路还没单独钉 quoted 附着语法用例，不构成本刀阻塞

## 2026-04-23 P21-1 第十三刀继续收口

### 本轮目标

- 收掉上一刀 judge 提到的覆盖残余，但不改实现 owner。
- 给 `tool-registry` 权限提示链补 `Set-Content -Path:"..."` 的 quoted attached 用例，证明审批链里仍归一到共享 owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已在 `tool-registry.service.spec.ts` 补上：
  - `Set-Content -Path:"C:\\temp\\note-attached-quoted.txt" D:\\payload.txt`
- 这条用例当前证明：
  - quoted attached 形态进入权限提示链后，`fileCommands` 仍归一为 `set-content`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp\\note-attached-quoted.txt`
  - `absolutePaths / externalAbsolutePaths` 仍同时保留 `D:\\payload.txt`，没有丢掉共享汇总语义
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把上一刀 residual risk 变成新鲜覆盖证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有让 quoted attached `set-content` 在权限链里出现第二套语义。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮只新增 `tool-registry` 测试，没有把 quoted attached 逻辑散回 `BashToolService / tool-registry / 审批 service` 生产代码
  - 权限链用例已证明 quoted attached `set-content` 仍归一到共享 owner，而不是长出第二套语义
  - 本轮补到的是 `tool-registry -> bash access -> runtime-shell-command-hints` 真实链路覆盖，不是假完成

## 2026-04-23 P21-1 第十四刀继续收口

### 本轮目标

- 继续收掉 `set-content` 入口覆盖残余，但不改实现 owner。
- 给 `sc -> set-content` 补齐静态 hints 与 `tool-registry` 权限链证据，证明短别名入口仍归一到 canonical owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增两条用例：
  - `bash-tool.service.spec.ts`：
    - `sc C:\\temp\\note-short.txt D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - `sc C:\\temp\\note-short.txt D:\\payload.txt`
- 这两条用例当前都证明：
  - `sc` 进入静态 hints 与权限提示链后，`fileCommands` 仍归一为 `set-content`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp\\note-short.txt`
  - `D:\\payload.txt` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把既有 alias owner 变成双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有让 `sc` 在 hints 或权限链里出现第二套语义。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `sc` 相关生产逻辑，alias 仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 `sc` 仍归一到 `set-content`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第十五刀继续收口

### 本轮目标

- 沿同一条 `content` 短别名线继续收掉覆盖残余，但不改实现 owner。
- 给 `ac -> add-content` 补齐 `tool-registry` 权限链证据，证明该入口在审批链里仍归一到 canonical owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已在 `tool-registry.service.spec.ts` 补上：
  - `ac C:\\temp\\append.txt D:\\payload.txt`
- 这条用例当前证明：
  - `ac` 进入权限提示链后，`fileCommands` 仍归一为 `add-content`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp\\append.txt`
  - `D:\\payload.txt` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把既有 alias owner 变成权限链新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有让 `ac` 在权限链里出现第二套语义。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `ac` 相关生产逻辑，alias 仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 权限链已证明 `ac` 仍归一到 `add-content`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第十六刀继续收口

### 本轮目标

- 继续沿 `content` 共享 owner 收掉 `add-content` 的 quoted attached 覆盖残余，但不改实现 owner。
- 给 `Add-Content -Path:"..."` 补齐静态 hints 与 `tool-registry` 权限链证据，证明共享 quoted attached 规则同样覆盖 `add-content`。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增两条用例：
  - `bash-tool.service.spec.ts`：
    - `Add-Content -Path:"C:\\temp\\append-attached-quoted.txt" D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - `Add-Content -Path:"C:\\temp\\append-attached-quoted.txt" D:\\payload.txt`
- 这两条用例当前都证明：
  - quoted attached 形态进入静态 hints 与权限提示链后，`fileCommands` 仍归一为 `add-content`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp\\append-attached-quoted.txt`
  - `D:\\payload.txt` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 quoted attached owner 变成 `add-content` 的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 quoted attached 逻辑散进 `add-content` 专属分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `add-content` quoted attached 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 quoted attached `Add-Content` 仍归一到 `add-content`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第十七刀继续收口

### 本轮目标

- 继续沿共享 `path + leaf-name` owner 收掉 `mkdir / md` 的权限链覆盖残余，但不改实现 owner。
- 给 `mkdir -Path + -Name` 与 `md -Path + -Name` 补齐 `tool-registry` 审批链证据，证明 PowerShell style 目录创建仍归一到 `mkdir`。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已在 `tool-registry.service.spec.ts` 补上：
  - `mkdir -Path C:\\temp -Name created-dir`
  - `md -Path C:\\temp -Name created-alias-dir`
- 这两条用例当前都证明：
  - PowerShell style `mkdir / md` 进入权限提示链后，`fileCommands` 仍归一为 `mkdir`
  - `externalWritePaths` 分别只保留真正目标：
    - `C:\\temp\\created-dir`
    - `C:\\temp\\created-alias-dir`
  - 父路径 `C:\\temp` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被误抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 `path + leaf-name` owner 变成 `mkdir / md` 的权限链新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 PowerShell style `mkdir / md` 逻辑散进生产层。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `mkdir / md` 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 权限链已证明 `mkdir / md` 仍统一归一到 `mkdir`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第十八刀继续收口

### 本轮目标

- 继续沿共享 `path + leaf-name + quoted attached` owner 收掉 `new-item` 的覆盖残余，但不改实现 owner。
- 给 `New-Item -Path:"..." -Name ...` 补齐静态 hints 与 `tool-registry` 权限链证据，证明共享 quoted attached 规则同样覆盖 `new-item`。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增两条用例：
  - `bash-tool.service.spec.ts`：
    - `New-Item -Path:"C:\\temp" -Name created-attached-quoted.txt -ItemType File`
  - `tool-registry.service.spec.ts`：
    - 同命令的权限链用例
- 这两条用例当前都证明：
  - quoted attached `new-item` 进入静态 hints 与权限提示链后，`fileCommands` 仍归一为 `new-item`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp\\created-attached-quoted.txt`
  - `C:\\temp` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 `path + leaf-name + quoted attached` owner 变成 `new-item` 的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 quoted attached 或 `path + leaf-name` 逻辑散进 `new-item` 专属分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `new-item` quoted attached 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 quoted attached `New-Item` 仍归一到 `new-item`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第十九刀继续收口

### 本轮目标

- 继续沿共享 `path + new-name + quoted attached` owner 收掉 `rename-item` 的覆盖残余，但不改实现 owner。
- 给 `Rename-Item -Path:"..." -NewName ...` 补齐静态 hints 与 `tool-registry` 权限链证据，证明共享 quoted attached 规则同样覆盖 `rename-item`。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增两条用例：
  - `bash-tool.service.spec.ts`：
    - `Rename-Item -Path:"C:\\temp\\old.txt" -NewName renamed-attached-quoted.txt`
  - `tool-registry.service.spec.ts`：
    - 同命令的权限链用例
- 这两条用例当前都证明：
  - quoted attached `rename-item` 进入静态 hints 与权限提示链后，`fileCommands` 仍归一为 `rename-item`
  - `externalWritePaths` 仍只保留真正目标 `C:\\temp\\renamed-attached-quoted.txt`
  - `C:\\temp\\old.txt` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 `path + new-name + quoted attached` owner 变成 `rename-item` 的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 quoted attached 或 `path + new-name` 逻辑散进 `rename-item` 专属分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `rename-item` quoted attached 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 quoted attached `Rename-Item` 仍归一到 `rename-item`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第二十刀继续收口

### 本轮目标

- 继续沿 alias normalization 共享 owner 收掉 `ni / ren` 的覆盖残余，但不改实现 owner。
- 给 `ni -> new-item` 与 `ren -> rename-item` 补齐静态 hints 与 `tool-registry` 权限链证据，证明短别名入口仍统一归一到 canonical owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增 4 条用例：
  - `bash-tool.service.spec.ts`：
    - `ni -Path C:\\temp -Name created-alias.txt -ItemType File`
    - `ren C:\\temp\\old-alias.txt renamed-alias.txt`
  - `tool-registry.service.spec.ts`：
    - 同上两条命令的权限链用例
- 这 4 条用例当前都证明：
  - `ni` 进入静态 hints 与权限提示链后，`fileCommands` 仍归一为 `new-item`
  - `ren` 进入静态 hints 与权限提示链后，`fileCommands` 仍归一为 `rename-item`
  - `externalWritePaths` 仍只保留真正目标：
    - `C:\\temp\\created-alias.txt`
    - `C:\\temp\\renamed-alias.txt`
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 alias owner 变成 `ni / ren` 的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 `ni / ren` 逻辑散进生产层。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `ni / ren` 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 `ni / ren` 仍归一到 `new-item / rename-item`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第二十一刀继续收口

### 本轮目标

- 继续沿 alias normalization + quoted attached 共享 owner 收掉 `ni / ren` 的组合覆盖残余，但不改实现 owner。
- 给 `ni -Path:"..." -Name ...` 与 `ren -Path:"..." -NewName ...` 补齐静态 hints 与 `tool-registry` 权限链证据，证明 alias 与 quoted attached 两层组合后仍统一归一到 canonical owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增 4 条用例：
  - `bash-tool.service.spec.ts`：
    - `ni -Path:"C:\\temp" -Name created-alias-quoted.txt -ItemType File`
    - `ren -Path:"C:\\temp\\old-quoted.txt" -NewName renamed-alias-quoted.txt`
  - `tool-registry.service.spec.ts`：
    - 同上两条命令的权限链用例
- 这 4 条用例当前都证明：
  - `ni` 在 alias + quoted attached 组合下，`fileCommands` 仍归一为 `new-item`
  - `ren` 在 alias + quoted attached 组合下，`fileCommands` 仍归一为 `rename-item`
  - `externalWritePaths` 仍只保留真正目标：
    - `C:\\temp\\created-alias-quoted.txt`
    - `C:\\temp\\renamed-alias-quoted.txt`
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 alias + quoted attached owner 变成 `ni / ren` 的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 alias 或 quoted attached 逻辑散进生产层。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `ni / ren` alias + quoted attached 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 `ni / ren` 在组合语法下仍归一到 `new-item / rename-item`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第二十二刀继续收口

### 本轮目标

- 继续沿共享 `path + leaf-name + quoted attached` owner 收掉 `mkdir / md` 的组合覆盖残余，但不改实现 owner。
- 给 `mkdir -Path:"..." -Name ...` 与 `md -Path:"..." -Name ...` 补齐静态 hints 与 `tool-registry` 权限链证据，证明 quoted attached 形态同样统一归一到 `mkdir`。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增 4 条用例：
  - `bash-tool.service.spec.ts`：
    - `mkdir -Path:"C:\\temp" -Name created-quoted-dir`
    - `md -Path:"C:\\temp" -Name created-alias-quoted-dir`
  - `tool-registry.service.spec.ts`：
    - 同上两条命令的权限链用例
- 这 4 条用例当前都证明：
  - `mkdir` 在 quoted attached 形态下，`fileCommands` 仍归一为 `mkdir`
  - `md` 在 alias + quoted attached 组合下，`fileCommands` 仍归一为 `mkdir`
  - `externalWritePaths` 仍只保留真正目标：
    - `C:\\temp\\created-quoted-dir`
    - `C:\\temp\\created-alias-quoted-dir`
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 `path + leaf-name + quoted attached` owner 变成 `mkdir / md` 的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 quoted attached 或 `path + leaf-name` 逻辑散进 `mkdir / md` 专属分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `mkdir / md` quoted attached 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 `mkdir / md` 在 quoted attached 形态下仍归一到 `mkdir`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第二十三刀继续收口

### 本轮目标

- 继续沿共享 `显式路径参数 + value-flag 跳过 + quoted attached` owner 收掉删除线的组合覆盖残余，但不改实现 owner。
- 给 `Remove-Item -Path:"..." -Include ...` 与 `rd -Path:"..." -Include ...` 补齐静态 hints 与 `tool-registry` 权限链证据，证明 quoted attached 形态下仍只保留真实删除目标。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增 4 条用例：
  - `bash-tool.service.spec.ts`：
    - `Remove-Item -Path:"C:\\temp" -Include D:\\archived.log`
    - `rd -Path:"C:\\temp" -Include D:\\archived.log`
  - `tool-registry.service.spec.ts`：
    - 同上两条命令的权限链用例
- 这 4 条用例当前都证明：
  - quoted attached `Remove-Item` 进入 hints 与权限链后，`fileCommands` 仍归一为 `remove-item`
  - quoted attached `rd` 进入 hints 与权限链后，`fileCommands` 仍归一为 `remove-item`
  - `externalWritePaths` 都仍只保留真正删除目标 `C:\\temp`
  - `D:\\archived.log` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被误抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 `value-flag 跳过 + quoted attached` owner 变成删除线的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 quoted attached 或 `value-flag 跳过` 逻辑散进 `remove-item / rd` 专属分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `Remove-Item / rd` quoted attached 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 quoted attached `Remove-Item / rd` 仍归一到 `remove-item`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第二十四刀继续收口

### 本轮目标

- 继续沿共享 `显式路径参数 + value-flag 跳过 + quoted attached + alias` owner 收掉删除线的组合覆盖残余，但不改实现 owner。
- 给 `ri / del / erase -Path:"..." -Include ...` 补齐静态 hints 与 `tool-registry` 权限链证据，证明 alias 与 quoted attached 组合后仍只保留真实删除目标。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增 6 条用例：
  - `bash-tool.service.spec.ts`：
    - `ri -Path:"C:\\temp" -Include D:\\archived.log`
    - `del -Path:"C:\\temp" -Include D:\\archived.log`
    - `erase -Path:"C:\\temp" -Include D:\\archived.log`
  - `tool-registry.service.spec.ts`：
    - 同上三条命令的权限链用例
- 这 6 条用例当前都证明：
  - `ri / del / erase` 在 alias + quoted attached 组合下，`fileCommands` 都仍归一为 `remove-item`
  - `externalWritePaths` 都仍只保留真正删除目标 `C:\\temp`
  - `D:\\archived.log` 仍只留在 `absolutePaths / externalAbsolutePaths`，没有被误抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 `value-flag 跳过 + quoted attached + alias` owner 变成删除线 alias 组合的新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`

### 下一步

- 做独立 judge，先检查这刀是否只是补 coverage，而没有把 quoted attached、alias 或 `value-flag 跳过` 逻辑散进 `ri / del / erase` 专属分支。
- judge `PASS` 后，再继续 `P21-1` 里下一类高价值误报点。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `ri / del / erase` quoted attached 相关生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - 静态 hints 与权限链都已证明 `ri / del / erase` 在组合语法下仍归一到 `remove-item`
  - 本轮补到的是实际 `tool-registry -> bash -> pending request` 链路证据，不是假完成

## 2026-04-23 P21-1 第二十五刀继续收口

### 本轮目标

- 继续沿共享 `destination + quoted attached + alias normalization` owner 收掉 `copy-item / move-item` 线的组合覆盖残余，但不改实现 owner。
- 给 `Copy-Item / cpi / copy` 与 `Move-Item / mi / move` 的 `-Destination:"..."` 补齐静态 hints 与 `tool-registry` 权限链证据，证明 destination 附着参数与 alias 组合后仍统一归一到 canonical owner。
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增 12 条用例：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-quoted.txt"`
    - `cpi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-alias-quoted.txt"`
    - `copy -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-word-quoted.txt"`
    - `Move-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-quoted.txt"`
    - `mi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-alias-quoted.txt"`
    - `move -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-word-quoted.txt"`
  - `tool-registry.service.spec.ts`：
    - 同上 6 条命令的权限链用例
- 这 12 条用例当前都证明：
  - `Copy-Item / cpi / copy` 在 `destination + quoted attached` 组合下，`fileCommands` 都仍归一为 `copy-item`
  - `Move-Item / mi / move` 在 `destination + quoted attached` 组合下，`fileCommands` 都仍归一为 `move-item`
  - `externalWritePaths` 都仍只保留真正目标路径
  - 源路径仍只留在 `absolutePaths / externalAbsolutePaths`，没有被误抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 `destination + quoted attached + alias normalization` owner 变成 `copy-item / move-item` 线的新鲜双层证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 189 tests` 全部通过

### 下一步

- 继续留在 `P21-1`，优先找仍可沿共享 owner 收口、但还缺 quoted attached 或权限链新鲜证据的 PowerShell 高价值组合。
- 保持“不改生产 owner，先补共享规则证据”的节奏。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `copy-item / move-item / cpi / mi / copy / move` 的 quoted attached 专属生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - destination + quoted attached 仍统一归一到共享 owner，没有散回 `BashToolService / tool-registry / 审批 service`
  - `tool-registry` 用例走了真实 `pending request -> reject -> invalid-tool-result` 链路，不是假完成

## 2026-04-23 P21-1 第二十六刀继续收口

### 本轮目标

- 继续沿共享 `path flag` owner 收掉 `-LiteralPath` 这一组覆盖残余，但不改实现 owner。
- 选代表性 4 类命令补双层证据：
  - `destination`
  - `content write`
  - `path + new-name`
  - `remove-item`
- 保持实现只落在测试层，不新增生产分支。

### 当前结果

- 当前已新增 8 条用例：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -LiteralPath filesystem::C:\\temp\\input-literal.txt -Destination:"filesystem::D:\\temp\\copied-literal.txt"`
    - `Set-Content -LiteralPath:"C:\\temp\\note-literal-quoted.txt" D:\\payload.txt`
    - `Rename-Item -LiteralPath:"C:\\temp\\old-literal.txt" -NewName renamed-literal.txt`
    - `Remove-Item -LiteralPath:"C:\\temp" -Include D:\\archived.log`
  - `tool-registry.service.spec.ts`：
    - 同上 4 条命令的权限链用例
- 这 8 条用例当前都证明：
  - `-LiteralPath` 仍统一走共享 path flag owner
  - `Copy-Item` 仍归一到 `copy-item`，且只把目标 destination 视为写目标
  - `Set-Content` 仍归一到 `set-content`，内容路径没有被误抬成写目标
  - `Rename-Item` 仍归一到 `rename-item`，目标路径仍由 `path + new-name` 共享规则拼出
  - `Remove-Item` 仍归一到 `remove-item`，`-Include` 的路径值没有被误抬成写目标
- 这条增强继续保持低膨胀：
  - 没有改生产代码
  - 没有新增 owner
  - 只是把共享 path flag owner 变成 `-LiteralPath` 的双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 197 tests` 全部通过

### 下一步

- 继续留在 `P21-1`，判断是否还存在同级共享规则缺口。
- 若同级高价值组合基本收口，再准备整体复核 `P21-1` 是否可转入阶段级 judge，而不是直接跳进 `P21-2`。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮没有新增 `-LiteralPath` 专属生产逻辑，仍停留在共享 `runtime-shell-command-hints.ts` owner
  - `-LiteralPath` 仍统一走共享 path flag owner，没有散回各命令专属逻辑
  - `tool-registry` 用例走了真实 `pending request -> reject -> invalid-tool-result` 链路，不是假完成

## 2026-04-23 P21-1 阶段级复核

### 复核目标

- 判断 `P21-1 Bash 静态预扫收口第一段` 是否已经满足 TODO 阶段定义，可以正式从“进行中”改成“已完成”。
- 明确剩余明显缺口是否已经主要属于 `P21-2`，而不是 `P21-1` 同级缺口。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 197 tests` 全部通过

### Judge

- 结果：`PASS-P21-1`
- 结论摘要：
  - `P21-1` 范围内的高价值 PowerShell 写入 / 删除命令，已经基本收口到少量共享规则：
    - `destination`
    - `path + leaf-name`
    - `value-flag 跳过`
    - `首个 positional target`
  - 判断仍集中在 `runtime-shell-command-hints.ts`，没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前剩余明显缺口已经主要落在 `P21-2`：
    - 复杂 quoting
    - variable expansion
    - command substitution
  - 可以把 `TODO.md` 里的 `P21-1` 改成 `已完成`，并进入 `P21-2`

## 2026-04-23 P21-2 第一刀继续收口

### 本轮目标

- 在不引完整 parser 的前提下，先补最小 PowerShell env 路径展开。
- 只支持明确可静态判定的前缀：
  - `$env:NAME...`
  - `${env:NAME}...`
- 保持 env 展开仍停留在共享 hints owner，不散进命令专属分支。

### 当前结果

- 当前已在 `runtime-shell-command-hints.ts` 新增最小共享 env 展开：
  - `expandPowerShellEnvPathToken()`
  - `readProcessEnvValue()`
  - `normalizeShellAbsolutePathCandidate()`
- 当前没有把 env 展开塞进 `Copy-Item / Set-Content` 等命令分支：
  - `Copy-Item` 仍走共享 `destination` owner
  - `Set-Content` 仍走共享 `path flag` owner
- 当前已新增 4 条代表性用例：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-env.txt"`
    - `Set-Content -Path:"$env:GARLIC_CLAW_HINTS_TEST_ROOT\\note-env.txt" D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上 2 条命令的权限链用例
- 这些用例当前都证明：
  - env 变量展开后，目标路径会进入 `absolutePaths / externalAbsolutePaths / externalWritePaths`
  - `Copy-Item` 仍归一为 `copy-item`
  - `Set-Content` 仍归一为 `set-content`

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 201 tests` 全部通过

### 下一步

- 继续补 `P21-2` 的负向边界证据：
  - 非 env 变量不要误当绝对路径
  - command substitution 这类更深语法暂不支持时，要有明确证据

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮仍是共享 owner 内的最小 env 展开，不是半成品 parser
  - env 展开没有散进各命令专属分支
  - `tool-registry` 用例走了真实 `pending request -> reject -> invalid-tool-result` 链路
  - 未定义 env 与非 env 变量不会被误当成绝对路径

## 2026-04-23 P21-2 第二刀继续收口

### 本轮目标

- 给 `P21-2` 增加明确负向边界证据，防止 env 展开继续膨胀成半成品 parser。
- 明确当前仍故意不支持：
  - 本地变量路径
  - command substitution

### 当前结果

- 当前已新增 4 条负向用例：
  - `bash-tool.service.spec.ts`：
    - `Set-Content -Path "$targetRoot\\note.txt" D:\\payload.txt`
    - `Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT 'copied.txt')"`
  - `tool-registry.service.spec.ts`：
    - 同上 2 条命令的权限链用例
- 这些用例当前都证明：
  - 本地变量路径不会被抬成 `externalWritePaths`
  - command substitution 不会被误判成外部写入目标
  - 当前只把确定的外部绝对路径保留在 `absolutePaths / externalAbsolutePaths`
  - 深语法边界仍停留在“故意不支持”，没有偷偷长成新解析层

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 205 tests` 全部通过

### 下一步

- 继续在 `P21-2` 内找下一类高价值、但仍能用共享 owner 表达的深语法缺口。
- 继续优先补“明确支持什么 / 明确不支持什么”的边界证据，避免 parser 化。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本地变量和 command substitution 仍明确处于故意不支持边界，没有被误判成外部写入
  - 没有新增半成品 parser 或命令专属特判
  - `tool-registry` 用例仍走了真实 `pending request -> reject -> invalid-tool-result` 链路

## 2026-04-23 P21-2 第三刀继续收口

### 本轮目标

- 给 `${env:...}` 补齐 quoted attached 形态的双层新鲜证据。
- 若共享实现仍有缺口，只允许修 `runtime-shell-command-hints.ts` 的共享 owner，不把逻辑散回命令专属分支。
- 保持 `P21-2` 仍停留在“最小可静态判定语法”，不把 tokenizer / hints 推成完整 parser。

### 当前结果

- 当前已新增 4 条 `${env:GARLIC_CLAW_HINTS_TEST_ROOT}` 代表性用例：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\copied-braced-env.txt"`
    - `Set-Content -Path:"${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-braced-env.txt" D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上 2 条命令的权限链用例
- 定向验证先暴露真实缺口：
  - `Copy-Item` 已能通过 `${env:...}` 识别目标
  - `Set-Content -Path:"${env:...}..."` 会被共享分词拆碎，导致目标没有进入 `absolutePaths / externalWritePaths`
- 当前已在 `runtime-shell-command-hints.ts` 的分词入口补最小共享修正：
  - 先保护 `${...}` 片段
  - 分词后再还原
  - 后续仍复用既有 `readPowerShellAttachedFlagValue()` 与 `expandPowerShellEnvPathToken()`
- 这轮修正后，`${env:...}` 在两层都成立：
  - `Copy-Item` 仍归一到 `copy-item`
  - `Set-Content` 仍归一到 `set-content`
  - `externalWritePaths` 会正确包含：
    - `C:\\env-root\\copied-braced-env.txt`
    - `C:\\env-root\\note-braced-env.txt`

### 已验证

- 第一次定向验证：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 tests` 失败，暴露 `${env:...}` 在 quoted attached `Set-Content` 里的共享分词缺口
- 修正后的 fresh 验证：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 209 tests` 全部通过

### 下一步

- 继续留在 `P21-2`，优先找仍能用共享 owner 表达的复杂 quoting / variable expansion 高价值缺口。
- 继续把支持边界和不支持边界一起补证据，避免 tokenizer / hints 继续长成 parser。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 生产改动只停留在 `runtime-shell-command-hints.ts` 的共享分词入口，没有散回 `BashToolService / tool-registry / 审批 service`
  - `${...}` 保护与还原后，后续仍走既有 token 流、attached flag 读取和 env 展开，不构成半成品 parser
  - `bash-tool` 与 `tool-registry` 两层都已拿到 `${env:...}` 的新鲜证据，且权限链仍是 `pending request -> reject -> invalid-tool-result`

## 2026-04-23 P21-2 第四刀继续收口

### 本轮目标

- 把 PowerShell 单引号 literal 语义补成明确负向边界：
  - `'$env:...'` 不展开
  - `'${env:...}'` 不展开
- 保持绝对路径字面量仍可识别，不把单引号处理做成“全部忽略”的粗暴特判。
- 实现只允许落在共享 hints owner，不新增命令专属分支。

### 当前结果

- 当前已新增 4 条负向用例，并都显式设置 `GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root'`：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination '$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-single-quoted-env.txt'`
    - `Set-Content -Path '${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-single-quoted-braced-env.txt' D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上 2 条命令的权限链用例
- 这轮定向验证先暴露真实缺口：
  - 当前共享 hints 会把单引号 literal 中的 env 也展开
  - 因而会误抬成 `externalAbsolutePaths / externalWritePaths`
- 当前已在 `runtime-shell-command-hints.ts` 补最小共享修正：
  - 新增单引号 literal token 标记
  - 分词入口与 attached flag value 读取都保留该标记
  - 绝对路径字面量仍可识别
  - `expandPowerShellEnvPathToken()` 会直接拒绝对单引号 literal token 做 env 展开
- 这轮修正后，两类负向边界都成立：
  - `Copy-Item` 不会把单引号 `$env:` destination 误判成外部写入
  - `Set-Content` 不会把单引号 `${env:...}` path 误判成外部写入

### 已验证

- 第一次定向验证：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 tests` 失败，暴露单引号 env 被误展开
- 修正后的 fresh 验证：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 213 tests` 全部通过
- 冒烟验证：
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：两条都是 `182 checks` 通过

### 下一步

- 继续留在 `P21-2`，优先找仍可用共享 owner 表达的 quoting / variable expansion 误判点。
- 继续坚持“支持边界和不支持边界一起补证据”，避免 tokenizer / hints 继续膨胀。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 生产改动只停留在 `runtime-shell-command-hints.ts`，没有散回 `BashToolService / tool-registry / 审批 service`
  - 这刀只是补单引号 literal 语义，不是把 tokenizer / hints 推成半成品 parser
  - `bash-tool` 与 `tool-registry` 两层都显式设 env 并拿到真实负向证据，权限链仍是 `pending request -> reject -> invalid-tool-result`

## 2026-04-23 P21-2 第五刀继续收口

### 本轮目标

- 给“单引号 literal 仍可识别绝对路径”补齐双层新鲜证据。
- 证明上一刀没有把单引号处理做成“全部忽略”，而是只禁止 env 展开。
- 保持本刀只补测试，不再扩生产逻辑。

### 当前结果

- 当前已新增 4 条正向用例：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:'filesystem::D:\\temp\\copied-single-quoted-literal.txt'`
    - `Set-Content -Path:'C:\\temp\\note-single-quoted-literal.txt' D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上 2 条命令的权限链用例
- 这些用例当前都证明：
  - 单引号 absolute path literal 仍会进入 `absolutePaths / externalAbsolutePaths / externalWritePaths`
  - `Copy-Item` 仍归一到 `copy-item`
  - `Set-Content` 仍归一到 `set-content`
  - 上一刀的单引号 env 修正没有误杀字面量路径
- 这轮保持低膨胀：
  - 没有生产代码改动
  - 只是把“单引号 env 不展开，但单引号 absolute path literal 仍可识别”补成双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 217 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-2`，优先找仍可用共享 owner 表达、且对提示精度有实际价值的 quoting / variable expansion 缺口。
- 继续避免把测试驱动变成命令专属特判。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮只有测试改动，没有新增生产判断
  - 单引号 absolute path literal 的静态 hints 与权限链证据都齐全，说明上一刀没有把字面量路径误杀
  - 权限链仍是 `pending request -> reject -> invalid-tool-result` 真链路

## 2026-04-23 P21-2 第六刀继续收口

### 本轮目标

- 给 `${localVar}` 这类 braced 本地变量补齐明确负向边界证据。
- 证明当前共享分词虽然会保护所有 `${...}`，但只有 `${env:...}` 进入支持面，本地变量不会被误抬成外部写入。
- 保持本刀只补测试，不新增生产逻辑。

### 当前结果

- 当前已新增 2 条代表性用例：
  - `bash-tool.service.spec.ts`：
    - `Set-Content -Path "${targetRoot}\\note-braced-local.txt" D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上命令的权限链用例
- 这些用例当前都证明：
  - `absolutePaths / externalAbsolutePaths` 只保留 `D:\\payload.txt`
  - `${targetRoot}` 没有被误认成 `${env:...}`
  - `externalWritePaths` 不会被误抬
- 这轮继续保持低膨胀：
  - 没有生产代码改动
  - 只是把 `${...}` 保护范围的负向边界补成双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 219 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-2`，优先补仍可用共享 owner 表达、且能明显提升静态提示精度的 quoting / expansion 边界。
- 继续避免把 `${...}` 保护范围误变成“所有 braced 变量都支持”的半成品 parser。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮只有测试改动，没有新增生产判断
  - `${localVar}` 负向边界已在静态 hints 与权限链两层钉住
  - 权限链仍是 `pending request -> reject -> invalid-tool-result` 真链路

## 2026-04-23 P21-2 第七刀继续收口

### 本轮目标

- 补 `filesystem:: + $env` / `filesystem:: + ${env}` 的 provider-aware 组合缺口。
- 保持实现仍停留在共享绝对路径归一，不把 provider + env 逻辑散进命令分支。
- 同时守住更早的单引号 literal 负向边界，不让这刀回归。

### 当前结果

- 当前已新增 4 条 provider-aware 组合用例：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-env.txt"`
    - `Set-Content -Path:"filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-braced-env.txt" D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上 2 条命令的权限链用例
- 定向验证先暴露真实缺口：
  - 当前共享 hints 只会在完整 token 是 `$env:...` / `${env:...}` 时展开
  - 对 `filesystem::${...}` / `filesystem::$env:...` 不会继续深入 provider 后半段
- 当前已在 `runtime-shell-command-hints.ts` 的共享归一补最小 provider-aware 修正：
  - `normalizeShellAbsolutePathCandidate()` 会先识别 `filesystem::` 前缀
  - 再只对后半段继续走既有 env 展开
  - 最后把 provider 前缀拼回去
  - 同时保留单引号 literal 不展开的边界
- 这轮修正后，provider-aware 组合已在两层成立：
  - `filesystem::$env:...` 会归一成 `filesystem::C:\\env-root\\...`
  - `filesystem::${env:...}` 也会归一成 `filesystem::C:\\env-root\\...`
  - 更早的 `'$env:...'` / `'${env:...}'` 负向边界没有回归

### 已验证

- 第一次定向验证：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 tests` 失败，暴露 provider-aware env 组合缺口
- 修正后的 fresh 验证：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 223 tests` 全部通过
- 冒烟验证：
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：两条都是 `182 checks` 通过

### 下一步

- 继续留在 `P21-2`，优先找仍能用共享 owner 表达、但当前还没拿到边界证据的 quoting / expansion 组合。
- 继续避免把 PowerShell hints 膨胀成 provider-aware parser。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 生产改动只停留在 `runtime-shell-command-hints.ts`，没有散回命令层或审批层
  - 这刀只是共享绝对路径归一的 provider-aware 小扩展，不是更重 parser
  - provider-aware 组合与更早的单引号负向边界都在同一批 fresh 验证里通过

## 2026-04-23 P21-2 第八刀继续收口

### 本轮目标

- 给 provider-aware 组合再补单引号负向边界证据：
  - `'filesystem::$env:...'` 不展开
  - `'filesystem::${env:...}'` 不展开
- 证明上一刀的 provider-aware 展开没有把单引号边界打坏。
- 保持本刀只补测试，不新增生产逻辑。

### 当前结果

- 当前已新增 4 条负向用例：
  - `bash-tool.service.spec.ts`：
    - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination 'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-single-quoted-env.txt'`
    - `Set-Content -Path 'filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-single-quoted-braced-env.txt' D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上 2 条命令的权限链用例
- 这些用例当前都证明：
  - provider-aware 单引号 env 不会被展开
  - `externalWritePaths` 不会被误抬
  - 上一刀的 provider-aware 正向展开没有破坏 earlier single-quoted boundary
- 这轮继续保持低膨胀：
  - 没有生产代码改动
  - 只是把 provider-aware 组合下的单引号负向边界补成双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 227 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-2`，优先找仍可用共享 owner 表达、但还没成对拿到正负边界证据的 quoting / expansion 组合。
- 继续避免为了补证据把 PowerShell hints 推成 provider-aware parser。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮只有测试改动，没有新增生产逻辑
  - provider-aware 组合下的单引号负向边界已经在两层钉住
  - 权限链仍是 `pending request -> reject -> invalid-tool-result` 真链路

## 2026-04-23 P21-2 第九刀继续收口

### 本轮目标

- 给 `filesystem::${localVar}` 这类 provider-aware braced 本地变量补齐负向边界证据。
- 证明当前 provider-aware 支持面只覆盖 `filesystem::${env:...}`，不会把 `filesystem::${localVar}` 误抬成外部写入。
- 保持本刀只补测试，不新增生产逻辑。

### 当前结果

- 当前已新增 2 条代表性用例：
  - `bash-tool.service.spec.ts`：
    - `Set-Content -Path "filesystem::${targetRoot}\\note-provider-braced-local.txt" D:\\payload.txt`
  - `tool-registry.service.spec.ts`：
    - 同上命令的权限链用例
- 这些用例当前都证明：
  - `filesystem::${targetRoot}` 不会被误当成 `filesystem::${env:...}`
  - `absolutePaths / externalAbsolutePaths` 只保留 `D:\\payload.txt`
  - `externalWritePaths` 不会被误抬
- 这轮继续保持低膨胀：
  - 没有生产代码改动
  - 只是把 provider-aware braced 本地变量的负向边界补成双层新鲜证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 229 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-2`，优先找仍可用共享 owner 表达、但还没成对拿到边界证据的 quoting / expansion 组合。
- 继续避免把 provider-aware 支持面误解成“所有 `${...}` 都支持”。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本轮只有测试改动，没有新增生产逻辑
  - `filesystem::${localVar}` 的负向边界已在两层钉住
  - 权限链仍是 `pending request -> reject -> invalid-tool-result` 真链路

## 2026-04-23 P21-2 阶段级复核

### 复核目标

- 判断 `P21-2 Bash 静态预扫收口第二段` 是否已经满足 TODO 阶段定义，可以正式从“进行中”改成“已完成”。
- 明确当前若继续往下补，是否已经进入更深 PowerShell 语法 / 完整 parser 范畴，而不再属于 `P21-2` 的同级阻塞。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 229 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS-P21-2`
- 结论摘要：
  - `P21-2` 的能力仍集中在 `runtime-shell-command-hints.ts`，没有散回 `BashToolService / tool-registry / 审批 service`
  - 当前共享 owner 仍是最小启发式规则，不是半成品 parser
  - 支持面与不支持面都已拿到双层证据：
    - `$env:...`
    - `${env:...}`
    - quoted attached `${env:...}`
    - `filesystem::$env:...`
    - `filesystem::${env:...}`
    - 本地变量 / `${localVar}` / command substitution / 单引号 env / provider-aware 单引号 env / provider-aware `${localVar}`
    - 单引号 absolute path literal 正向边界
  - 若继续往下补，已主要进入更深 PowerShell 语法或完整 parser 范畴，不再是 `P21-2` 的同级阻塞

## 2026-04-23 P21-3 第一刀：loaded-files reminder owner 下沉

### 本轮目标

- 把 `read` 的 loaded-files / `system-reminder` 从 `ReadToolService` 的本地 formatter 收回 runtime freshness owner。
- 保持改动最小，只处理 owner 下沉，不顺手扩成更大的 read 文案改造。
- 让 `ReadToolService` 真实变薄，同时拿到双层 fresh 证据与独立 judge。

### 当前结果

- `RuntimeFileFreshnessService` 当前已新增 `buildReadSystemReminder(sessionId, options)`：
  - 内部继续复用 `listRecentReads()`
  - 对外统一输出 `system-reminder` 文本块
- `ReadToolService` 当前已删除本地 `buildReadSystemReminder()` 自由函数：
  - 文件结果分支只保留对 freshness owner 的调用
  - 不再自己维护 reminder 标题、条目渲染与结尾文案
- 这轮继续控制膨胀：
  - 生产代码只改 `runtime-file-freshness.service.ts` 与 `read-tool.service.ts`
  - 只新增一个很小的 recent read entries 共享渲染点，没有再起新的中间层
- 双层测试证据已补齐：
  - `runtime-file-freshness.service.spec.ts` 直接断言 `buildReadSystemReminder()` 输出
  - `read-tool.service.spec.ts` 断言 `ReadToolService` 真实调用该 owner，并保留最终输出语义

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/runtime/runtime-file-freshness.service.spec.ts`
  - 结果：`2 suites / 14 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-3`，开始第二刀：
  - 对照 `other/opencode` 的 `read` 输出
  - 收口缺失 / 文件 / 目录 / 截断 / 分流场景的统一继续操作提示
  - 继续压 `ReadToolService` 的场景文案分支

### Judge

- 结果：`PASS`
- 结论摘要：
  - `ReadToolService` 已真实变薄，没有保留本地 reminder 拼装
  - `RuntimeFileFreshnessService` 已成为稳定的 read reminder owner，不是只换位置的工具层壳
  - 双层证据成立，且当前残余风险只在“后续若有第二种展示形态，可能还要再结构化”，不阻塞本刀

## 2026-04-23 P21-3 第二刀：统一继续操作提示

### 本轮目标

- 对照 `other/opencode` 的 `read` 输出，把缺失 / 文件 / 目录 / 截断 / 分流场景的继续操作提示补成更统一的可继续文案。
- 继续压薄 `ReadToolService`，避免把这些场景文案继续堆在工具层。
- 顺手把缺失路径建议的相关性顺序收稳，避免结果顺序漂移。

### 当前结果

- `packages/server/src/execution/read/read-result-render.ts` 已新增独立 renderer owner：
  - 目录结果统一输出“继续用子路径 inspect 内容”的提示
  - 文件结果统一输出“继续读取当前文件 / 重新开窗口”的提示
  - image / pdf / binary 分流统一输出“改读相关文本文件或切到 asset-aware tool”的提示
- `ReadToolService` 已进一步变薄：
  - 自身只负责分支分派、调用 renderer、拼接 freshness reminder
  - 目录 / 文件 / 资产文案已离开工具层
- `RuntimeHostFilesystemBackendService` 已补缺失路径继续提示：
  - suggestions message 新增 `可继续操作：...`
  - suggestions 排序改成“前缀命中优先 -> 长度差更近优先 -> 字典序”
  - `docs/read` 现在会稳定把 `/docs/readme.md` 排在 `/docs/reader-notes.md` 前面
- 这轮继续控制膨胀：
  - 新增文件只是一层纯 renderer
  - backend 排序逻辑直接落在现有缺失路径 owner，没有再引入新 service

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 140 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-3`，优先摸下一类更接近 OpenCode 的 read 边界：
  - `offset` 越界与空窗口诊断
  - 目录 offset 越界是否也要像文件一样给明确错误
  - 继续压缩 `ReadToolService` 与 backend 的 read UX 散落点

### Judge

- 结果：`PASS`
- 结论摘要：
  - 继续操作提示比之前更统一，且目录 / 文件 / 资产文案都已收口到 `read-result-render.ts`
  - `ReadToolService` 已继续变薄，没有把这些文案继续留在工具层
  - backend 缺失路径建议不只是多一行提示，还顺手收稳了建议顺序
  - 当前残余风险只是“backend 缺失提示 owner”和“read renderer owner”仍是两层，不阻塞本刀

## 2026-04-23 P21-3 第三刀：offset 越界诊断统一

### 本轮目标

- 把目录 `read.offset` 越界补成和文件同级的 backend 诊断。
- 去掉目录 read 的“空窗口假成功”，让越界直接失败。
- 保持实现仍落在 backend owner，不把越界判断散到工具层。

### 当前结果

- `RuntimeHostFilesystemBackendService.readPathRange()` 当前已在目录分支补越界判断：
  - `offset` 超过目录总条目数时直接报错
  - 只有“空目录且 offset=1”仍允许返回空列表
- 文件与目录现在共用 `createReadOffsetOutOfRangeException()`：
  - 文件文案：`文件总行数`
  - 目录文案：`目录总条目数`
  - 没有再复制两套错误拼装
- 这轮继续控制膨胀：
  - 只是在现有 backend owner 内补条件与一个共享异常构造
  - 没有改 `ReadToolService`，也没有新增工具层分支

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 141 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-3`，摸底下一类 read 缺口：
  - 是否还要补 tool-level 的越界透传证据
  - 是否还存在 OpenCode 级别的 read loaded/continuation 差距
  - 判断 `P21-3` 是否已经接近阶段级复核条件

### Judge

- 结果：`PASS`
- 结论摘要：
  - 目录 offset 越界已真实收口到 backend owner，不再是空窗口假成功
  - 文件与目录现在复用同一异常构造，没有复制两套文案
  - 当前残余风险只是尚未单独补 tool-registry 的越界透传断言，不阻塞本刀

## 2026-04-23 P21-3 第四刀：tool-level 越界透传证据

### 本轮目标

- 给 `read.offset` 越界补一层真实工具链证据，收掉阶段级 judge 前的 residual risk。
- 不改生产逻辑，只补 `tool-registry` 真链路断言。

### 当前结果

- `tool-registry.service.spec.ts` 当前已新增原生 `read` 越界用例：
  - backend 文件越界诊断会进入 `invalid-tool-result`
  - 错误文本会保留 `read.offset 超出范围: ...`
- 这轮保持零生产膨胀：
  - 没有生产代码改动
  - 只补真实工具链证据

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 142 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：沿用本阶段最近一次 `182 checks` fresh 通过

### Judge

- 结果：并入 `P21-3` 阶段级复核
- 结论摘要：
  - 这刀只是补齐阶段级复核需要的真链路证据，不单独做新的阻塞判断

## 2026-04-23 P21-3 阶段级复核

### 复核目标

- 判断 `P21-3 Read 成熟度补齐` 是否已经满足 TODO 阶段定义，可以正式从“进行中”改成“已完成”。
- 明确当前和 `other/opencode` 相比，是否还存在足以阻塞 `P21-3` 的 read 主链缺口。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 当前相关 fresh 证据包括：
    - `read + freshness`: `2 suites / 14 tests` 全部通过
    - `read + backend + tool-registry`: `3 suites / 142 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS-P21-3`
- 结论摘要：
  - `buildReadSystemReminder()` 已成为稳定 owner，不再是工具层换壳
  - 目录 / 文件 / 资产文案已经集中在 `read-result-render.ts`，缺失路径提示也已在 backend owner 给出可继续动作
  - `ReadToolService` 目前只剩输入校验、backend 调用、read stamp 记录和 renderer 装配，已真实变薄
  - 当前与 `other/opencode` 相比，已没有足以阻塞 `P21-3` 的明显 read 主链缺口
  - 当前 residual risk 只剩更丰富的附件/LSP 类能力与更全面的工具链断言，不阻塞阶段完成

## 2026-04-23 P21-4 第一刀：glob 缺失路径诊断复用

### 本轮目标

- 让 `glob` 缺失路径复用和 `read / grep` 相同的 backend 建议 owner。
- 补齐 backend 与 tool-chain 两层证据。
- 保持零散字符串不再在 `glob` 侧重复实现。

### 当前结果

- `RuntimeHostFilesystemBackendService.globPaths()` 当前已改成先走 `requireExistingPath()`：
  - 缺失路径会复用 `createMissingPathException()`
  - 诊断内容统一变成：
    - `路径不存在`
    - `可选路径`
    - `可继续操作`
- 这轮生产改动极小：
  - 只删掉 `glob` 自己的裸报错
  - 没有复制建议排序或提示字符串
- 双层证据已补齐：
  - `runtime-host-filesystem-backend.service.spec.ts` 直接断言 backend suggestions
  - `tool-registry.service.spec.ts` 断言原生 `glob` 工具链会把该诊断透传到 `invalid-tool-result`

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 138 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-4`，优先找下一类更值的搜索成熟度缺口：
  - `grep` 缺失路径 / continuation hint / search post-processing 是否还有不一致
  - `glob / grep` 继续提示文案是否需要从共享 owner 再统一一层

### Judge

- 结果：`PASS`
- 结论摘要：
  - `glob` 缺失路径已真实复用 backend owner，不是再写一套近似文案
  - backend 与 tool-chain 两层证据都成立
  - 当前 residual risk 只是继续动作文案还偏 `read` 语气，不阻塞这一刀

## 2026-04-23 P21-4 第二刀：搜索工具缺失路径动作文案参数化

### 本轮目标

- 保持同一套缺失路径 suggestions owner，不再让 `glob / grep` 共用 `read` 语气的下一步动作。
- 只做最小参数化，不引入更重的动作模型。

### 当前结果

- `createMissingPathException()` 当前已支持 `nextStepHint` 参数：
  - 默认仍保留 `read` 文案
  - `globPaths()` 可传 `重新 glob / 先 glob 上级目录缩小范围`
  - `grepText()` 通过 `listFiles(..., missingPathOptions)` 可传 `重新 grep / 先 glob 上级目录确认搜索范围`
- 这轮仍保持低膨胀：
  - 没有复制 suggestions 拼装
  - 只是把原先固定字符串改成同一 owner 的最小参数化
- 双层证据已补齐：
  - `runtime-host-filesystem-backend.service.spec.ts` 新增 `grep` 缺失路径建议断言，并更新 `glob` 断言
  - `tool-registry.service.spec.ts` 同步新增 `grep` 工具链透传断言，并更新 `glob` 工具链断言

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 140 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-4`，优先找下一类搜索成熟度缺口：
  - 搜索结果继续提示是否还需要更统一 owner
  - `glob / grep` 的排序 / 截断 / post-processing 是否还有和 OpenCode 的主链差距

### Judge

- 结果：`PASS`
- 结论摘要：
  - 仍复用同一个缺失路径 owner，没有复制 glob/grep 专属 suggestions 拼装
  - `glob / grep / read` 现在各自拿到更贴切的下一步动作
  - 当前 residual risk 只是 `nextStepHint` 仍是字符串参数，不阻塞这一刀

## 2026-04-23 P21-4 第三刀：搜索结果 follow-up hint 收口

### 本轮目标

- 让 `glob / grep` 在有匹配结果时，更直接引导模型下一步用 `read` 跟进。
- 共享总数摘要壳，不分别在工具层重写 `(total matches: ...)` 文案。

### 当前结果

- `runtime-search-result-report.ts` 当前已新增 `renderRuntimeSearchTotalSummary()`：
  - 统一接管 `(total matches: N ...)` 摘要壳
  - `glob` 与 `grep` 只传各自的 follow-up hint
- `glob` 当前会提示：
  - `Use read on a matching path to inspect content.`
- `grep` 当前会提示：
  - `Use read on a matching file to inspect surrounding context.`
- 这轮继续控制膨胀：
  - 共享 report owner 负责摘要外壳
  - 工具层只保留领域差异 hint 参数

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 132 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS`
- 结论摘要：
  - glob/grep 的 follow-up hint 已真实收口到共享 report owner 的摘要壳
  - 当前 residual risk 只剩 tool-registry 还没逐字钉死新 follow-up hint，不阻塞这一刀

## 2026-04-23 P21-4 第四刀：0 matches 的继续提示

### 本轮目标

- 把 `glob / grep` 的 `0 matches` 情况也补成可继续摘要，而不只是回显空总数。
- 继续停留在共享 report owner，不回到工具层拼字符串。

### 当前结果

- `renderRuntimeSearchTotalSummary()` 当前已支持 `emptyHint`：
  - `glob` 空结果：`Refine path or pattern and retry.`
  - `grep` 空结果：
    - 有 `include` 时：`Refine path, include or pattern and retry.`
    - 无 `include` 时：`Refine path or pattern and retry.`
- `tool-registry.service.spec.ts` 当前也已补真实工具链断言：
  - `glob` 真链路会保留 `0 matches` 的 retry hint
  - `grep` 真链路会保留 `0 matches` 的 retry hint
- 这轮保持低膨胀：
  - 没有新增第二套 empty summary owner
  - 只是给现有共享摘要补了空结果分支

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 135 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS`
- 结论摘要：
  - `0 matches` 总数摘要已真实收口到共享 report owner
  - 空结果比之前更可继续，不只是换措辞
  - 当前 residual risk 中“真实工具链没有逐字钉死空结果文案”已补掉，不再构成残差

## 2026-04-23 P21-4 第五刀：搜索提示字符串继续去重

### 本轮目标

- 把 `glob / grep / read` 当前已经成立的搜索提示字符串进一步收回领域 owner。
- 保持行为不变，只压缩重复文案与调用点散落。

### 当前结果

- `runtime-search-result-report.ts` 当前已新增：
  - `renderRuntimeSearchEmptyHint()`
  - `renderRuntimeSearchReadFollowUpHint()`
  - `renderRuntimeMissingPathNextStep()`
- 当前重复字符串已从这些调用点收走：
  - `glob / grep` 的 `0 matches` empty hint
  - `glob / grep` 的正向 `read` follow-up hint
  - `read / glob / grep` 的缺失路径下一步动作 fallback
- 这轮继续控制膨胀：
  - 没有新增新 service
  - 只是把已经稳定的字符串收回已有 search report owner

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 suites / 149 tests` 全部通过

### Judge

- 结果：并入后续 `P21-4` 阶段复核
- 结论摘要：
  - 这刀是纯去重，不单独构成阶段阻塞判断

## 2026-04-23 P21-4 第六刀：搜索结果接到 edit/write

### 本轮目标

- 让 `glob / grep` 的正向 follow-up hint 不再只停在 `read`，而是明确给出 `read -> edit/write` 的下一步动作。
- 保持 owner 仍留在共享 search report，不把新文案散回两个 tool service。
- 继续用最小改动补 TODO 里“搜索结果可直接接 `read / edit / write`”这一段。

### 当前结果

- `runtime-search-result-report.ts` 的 `renderRuntimeSearchReadFollowUpHint()` 当前已改成：
  - `glob`：先 `read`，如需修改再 `edit / write`
  - `grep`：先 `read` 上下文，如需修改再 `edit / write`
- `GlobToolService / GrepToolService` 仍只传领域差异参数，没有重新拼接第二套 follow-up 文案。
- 这轮继续控制膨胀：
  - 只改一个已有 shared owner 函数
  - 只更新对应断言
  - 没有新增新 service、枚举或结构壳

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 135 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-4`，优先摸底 project-aware overlay 是否能以附加视图形式落到共享 owner。
- 如果 overlay 暂时不值当，下一刀优先补更结构化的搜索后处理，而不是继续堆提示语句。

### Judge

- 结果：`PASS`
- 结论摘要：
  - 这刀仍留在共享 search owner，没有散回 `GlobToolService / GrepToolService`
  - 改动不只是表面换词，已经把下一步动作从“查看链”推进到“查看后可修改链”
  - 当前 residual risk 是尚未结构化到可直接生成 `edit/write` 参数，不阻塞本刀

## 2026-04-23 P21-4 第七刀：suggested next read 搜索后处理

### 本轮目标

- 利用当前搜索结果排序，给 `glob / grep` 增加一个可直接执行的首个 `read` 建议目标。
- 保持这层决策留在共享 search owner，而不是由 `GlobToolService / GrepToolService` 各自挑第一条。
- 继续把 `P21-4` 的“搜索后处理”往真实可继续执行推进，而不是只改提示语句。

### 当前结果

- `runtime-search-result-report.ts` 当前已新增：
  - `renderRuntimeSearchSuggestedReadHint()`
  - `readRuntimeSearchSuggestedReadPath()`
- 共享 owner 现在直接接收：
  - `glob` 的 `string[]`
  - `grep` 的 `{ virtualPath }[]`
  并在 owner 内统一决定 `suggested next read`
- `GlobToolService / GrepToolService` 当前只把 backend 结果传给共享 owner，不再各自读取 `matches[0]`
- 这轮中间先被 judge 判过一次 `FAIL`：
  - 原因是 top-match 决策还散在工具层
  - 已按 judge 意见修回共享 owner 后重跑 fresh 验证并复判通过

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 135 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-4`，优先判断 project-aware overlay 是否还能以同样的小 owner 落地。
- 若 overlay 仍没有真实 mapping，下一刀优先补更结构化的搜索后处理，不做假 overlay。

### Judge

- 首次结果：`FAIL`
  - 原因：top-match 决策还散在 `GlobToolService / GrepToolService`
- 修正后结果：`PASS`
- 结论摘要：
  - `suggested next read` 已成为真实搜索后处理，不只是文案
  - top-match 决策已回到共享 search owner
  - 当前 residual risk 只是“第一条即建议目标”的策略还不够强，不阻塞本刀

## 2026-04-23 P21-4 第八刀：overlay next-read owner 收紧

### 本轮目标

- 把 project-aware overlay 的 `Project Next Read` 候选路径决策从 `GlobToolService / GrepToolService` 工具层移走。
- 保持 next-read 决策继续复用既有 shared search owner，不在 overlay 侧复制第二套 top-match 逻辑。
- 继续控制膨胀，只改最小 owner 边界与对应验证。

### 当前结果

- `runtime-search-result-report.ts` 当前已导出 `readRuntimeSearchSuggestedReadPath()`：
  - `suggested next read` 文本渲染和首个 read 候选决策继续共用同一 owner
- `ProjectWorktreeSearchOverlayService.buildSearchOverlay()` 当前已改成直接接 `matches`：
  - owner 内部复用 `readRuntimeSearchSuggestedReadPath()` 决定 `Project Next Read`
  - 不再由工具层把 `matches[0]` / `matches[0]?.virtualPath` 预先挑出来
- `GlobToolService / GrepToolService` 当前都只把 backend 搜索结果整体传给 overlay owner：
  - 工具层不再持有 overlay 的 next-read 选择逻辑
- 这轮继续控制膨胀：
  - 没有新增新 service
  - 没有复制第二套 overlay top-match 决策
  - 只是把既有 shared owner 复用到 overlay owner

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/project/project-worktree-search-overlay.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 suites / 137 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-4`，优先补更结构化的搜索后处理：
  - 不再把 `suggested next read` 固定为“第一条结果”
  - 尽量把建议目标策略继续收口到 shared search owner
- 若这条线收益不高，再转入 `P21-4` 阶段级复核，判断剩余缺口是否已主要转入 `P21-5 / P21-6`

### Judge

- 结果：`PASS`
- 结论摘要：
  - 这刀是真收紧 owner，不是只挪参数
  - overlay owner 现在直接消费 `matches`，工具层不再自己挑 `matches[0]`
  - 当前新增耦合只是 overlay owner 复用 shared search owner 的建议路径决策，属于可接受的明确 owner 复用
  - 当前 residual risk 只剩“top-match 仍默认第一条”的策略问题，不阻塞本刀

## 2026-04-23 P21-4 第九刀：suggested-next-read 策略增强

### 本轮目标

- 把 `suggested next read` 从“第一条匹配”升级成更稳定的 shared owner 决策。
- 保持建议目标策略不回流到 `GlobToolService / GrepToolService`。
- 在不引入重型排序框架的前提下补一层实质搜索后处理成熟度。

### 当前结果

- `runtime-search-result-report.ts` 当前已把 `readRuntimeSearchSuggestedReadPath()` 升级为候选策略：
  - 同一路径按 `hits` 聚合
  - 排序规则：`hits desc -> depth asc -> length asc -> lexical`
- `glob / grep / overlay` 继续只消费 shared owner 的建议路径结果：
  - 工具层没有新增策略分支
  - overlay owner 也没有复制另一套 top-match 决策
- 这轮继续控制膨胀：
  - 只在现有 shared owner 内补薄策略函数
  - 新增测试覆盖，不新增新 service 或配置项

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-search-result-report.spec.ts tests/execution/project/project-worktree-search-overlay.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`5 suites / 142 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-4`，准备阶段级复核：
  - 判断当前 residual risk 是否只剩“启发式策略仍不够语义化”
  - 若阶段级 judge 通过，再把 `P21-4` 改为 `已完成` 并进入 `P21-5`

### Judge

- 结果：`PASS`
- 结论摘要：
  - owner 继续收敛在 shared search owner，没有回流工具层
  - 这是搜索后处理实质增强，不是文案改写
  - 复杂度可控，当前只是薄启发式排序，不是新框架
  - 当前 residual risk 只剩“相关性仍是启发式”，不阻塞本刀

## 2026-04-23 P21-4 阶段级复核

### 复核目标

- 判断 `P21-4 Glob / Grep 成熟度补齐` 是否满足 TODO 阶段定义，可从“进行中”改成“已完成”。
- 重点识别是否存在“只改文案、owner 仍停在工具层”的假完成。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/file/runtime-search-result-report.spec.ts tests/execution/project/project-worktree-search-overlay.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`6 suites / 156 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS-P21-4`
- 结论摘要：
  - 缺失路径建议、搜索摘要、skipped diagnostics、project-aware overlay 都已在稳定 owner 下收口
  - `glob / grep` 工具层已不再持有关键搜索后处理决策
  - 这阶段是实质成熟度提升，不是仅文案迁移
  - 当前 residual risk 只剩更强语义相关性策略，已不构成 `P21-4` 阻塞

## 2026-04-23 P21-5 第一刀：post-write 诊断可操作反馈收口

### 本轮目标

- 增强 `write / edit` 写后诊断反馈的可操作性，不再只给总数和原始诊断块。
- 把“当前文件 vs 关联文件”的分流与下一步提示收口到 shared post-write owner。
- 保持工具层继续变薄，只传最小上下文，不拼额外诊断文案。

### 当前结果

- `runtime-file-post-write-report.ts` 当前已新增：
  - 按 `targetPath` 生成 `current file / related files` 诊断摘要
  - 诊断块顺序优先当前文件
  - `Next:` 提示（error/warning 分流）
- `WriteToolService / EditToolService` 当前只新增 `targetPath` 透传：
  - 具体分流与提示仍由 shared owner 决策
  - 工具层没有新增第二套诊断拼接分支
- 这轮继续控制膨胀：
  - 只增强已有 post-write owner
  - 不新增 service、不新增跨层状态

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 suites / 133 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-5`，优先补 `edit/write` 的匹配纠偏与写后工程反馈证据：
  - 评估是否需要把更多 rewrite 纠偏策略收口到 backend owner
  - 补 tool-chain 对 post-write 诊断反馈的逐字回归，防止后续回退

### Judge

- 结果：`PASS`
- 结论摘要：
  - 分流与提示已收在 shared owner，没有回流工具层
  - 这是实质成熟度提升，不是单纯改措辞
  - 当前复杂度可控，未出现新重复控制流

## 2026-04-23 P21-5 第二刀：post-write 真实链路钉桩

### 本轮目标

- 把 post-write 新诊断反馈补到 `tool-registry` 真链路回归，避免只停留在 owner 单测与工具单测。
- 明确钉住 `write / edit` 经过 native tool 包装后的关键反馈内容。
- 保持“只补证据，不引入新生产复杂度”。

### 当前结果

- `tool-registry.service.spec.ts` 当前已新增两条真链路用例：
  - native `write`：断言 `current/related` summary、`Next` hint 和 diagnostics block
  - native `edit`：断言同上，并额外钉住 warning code 文本
- 本刀没有新增生产逻辑，只补 tool-chain 证据。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 suites / 135 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-5`，优先推进 rewrite/edit 匹配纠偏增强：
  - 先补高价值误判点（非唯一匹配、边界空白、上下文歧义）
  - 仍要求策略收在 backend/replace owner，不回流 `EditToolService`

### Judge

- 结果：`PASS`
- 结论摘要：
  - 本刀补齐了真实 tool-chain 证据，不是壳化断言
  - 关键诊断内容已被断言，不再只看结果标签
  - 未引入生产耦合，风险可控

## 2026-04-23 P21-5 第三刀：rewrite 匹配 escape-normalized 收口

### 本轮目标

- 增强 `edit` 在 escaped 片段输入下的匹配纠偏能力，避免只能靠 exact/trimmed 命中。
- 把策略继续收在 shared replace owner，不把规则回流到 `EditToolService / WriteToolService`。
- 补齐 `edit` 真链路回归，避免只在 owner 单测自证。

### 当前结果

- `runtime-text-replace.ts` 当前已新增 `escape-normalized` 策略：
  - 在 `find` 含转义序列时，先做 unescape 后匹配候选。
  - 仍沿用统一策略表，不新增工具层分支。
- `runtime-text-replace.spec.ts` 已新增 escaped newline 正向用例。
- `edit-tool.service.spec.ts` 已新增 `Strategy: escape-normalized` 输出断言。
- `tool-registry.service.spec.ts` 已新增 native `edit` 真链路断言：
  - 输出包含 `Strategy: escape-normalized`
  - 文件内容按预期改写

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 suites / 147 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-5`，优先补匹配歧义场景（非唯一匹配、边界空白、上下文歧义）的可操作反馈：
  - 保持策略 owner 在 `runtime-text-replace` 或 backend owner
  - 工具层仅消费结果，不新增策略分支

### Judge

- 结果：`PASS`
- 结论摘要：
  - `escape-normalized` 仍在 shared replace owner，不是工具层特判
  - `edit` 工具层和 native tool-chain 证据已补齐
  - 未出现新增重复控制流或策略顺序回退

## 2026-04-23 P21-5 第四刀：上下文锚点多候选选优

### 本轮目标

- 收口 `context-aware / block-anchor` 在多候选场景下的匹配歧义。
- 只在“明显最佳候选”时自动收敛；同分场景仍保留歧义报错。
- 继续保持策略 owner 在 shared replace backend，不回流工具层。

### 当前结果

- `runtime-text-replace.ts` 当前已新增统一 scored 选优逻辑：
  - `readContextAwareCandidates()` 与 `readBlockAnchorCandidates()` 都改为产出 scored candidate
  - `readRuntimeTextBestScoredMatches()` 统一处理：
    - 选出最高分候选
    - 同分保留多个候选，交给上层歧义报错
- `runtime-text-replace.spec.ts` 已补三类关键回归：
  - `context-aware` 多候选时优先最佳候选
  - `context-aware` 同分时继续抛歧义（含行号）
  - `block-anchor` 多候选时优先最佳候选
- `tool-registry.service.spec.ts` 已保留 native `edit` 真链路断言，覆盖 `context-aware` 最佳候选收敛。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 suites / 151 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-5`，优先补边界空白与 replaceAll 场景的可操作反馈：
  - 保持新增逻辑停在 shared replace/backend owner
  - 工具层只透传结果，不新增策略分支

### Judge

- 结果：`PASS`
- 结论摘要：
  - 选优 owner 继续留在 shared replace backend
  - 同分保留歧义、最佳候选自动收敛两侧语义证据已成立
  - native `edit` 真链路仍可见策略结果，未引入工具层回流

## 2026-04-23 P21-5 第五刀：trailing whitespace 匹配纠偏

### 本轮目标

- 解决 `oldString` 仅在尾部空白不一致时的高频误报歧义。
- 保持前导缩进语义，不把策略放宽成“忽略所有边界空白”。
- 继续保持 owner 在 shared replace backend。

### 当前结果

- `runtime-text-replace.ts` 当前已新增 `trailing-whitespace-trimmed` 策略：
  - 仅按 `trimEnd()` 比较候选
  - 前导缩进仍参与匹配，不被忽略
- 新策略已接入统一策略表，顺序位于 `trimmed-boundary` 之前。
- `runtime-text-replace.spec.ts` 已补尾部空白纠偏用例，明确钉住“只替换无缩进目标行”。
- `tool-registry.service.spec.ts` 已补 native `edit` 真链路用例，断言策略标签与文件改写结果。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`4 suites / 153 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-5`，补 `replaceAll` 与边界场景的可操作反馈：
  - 减少“可自动执行但仍报歧义”的场景
  - 保持保守边界，不自动做不确定替换

### Judge

- 结果：`PASS`
- 结论摘要：
  - 新策略是实质匹配增强，不是文案调整
  - 前导缩进语义保持，未出现过度放宽
  - owner 仍在 shared replace backend，native tool-chain 证据成立

## 2026-04-23 P21-5 第六刀：related-file error next hint 收口

### 本轮目标

- 当 diagnostics 仅出现在 related files 且提供 `targetPath` 时，给更可执行的下一步提示。
- 避免模型把“关联文件报错”误判成“当前文件继续可改”。
- 保持 owner 在 shared post-write renderer，不回流 `write/edit` 工具层。

### 当前结果

- `runtime-file-post-write-report.ts` 当前已增强 next hint 判定：
  - 先判当前文件 `error`
  - 再判 related files `error`
  - 并为 related-only `error/warning` 给出专属提示
- `write/edit` 工具层无新增策略逻辑，仍只传 `targetPath` 给 shared renderer。
- `runtime-file-post-write-report.spec.ts` 已新增 related-only error 场景断言。
- `tool-registry.service.spec.ts` 已新增 native `edit` 真链路断言：
  - related-only error summary
  - related-file error next hint

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/file/runtime-text-replace.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`5 suites / 157 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-5`，进入 `diff / patch / freshness` 重复控制流压缩：
  - 先收敛 `write/edit` 的共用结果拼装路径
  - 再补回归，确认行为不回退

### Judge

- 结果：`PASS`
- 结论摘要：
  - related-file error 提示增强已在 shared renderer 成立
  - 工具层未新增分支，owner 未回流
  - 既有 current-file error 场景行为保持稳定

## 2026-04-23 P21-5 第七刀：freshness 写入事务收口

### 本轮目标

- 压缩 `write/edit` 中重复的 freshness 控制流（锁、写前校验、写后 read-stamp）。
- 让 `write` 与 `edit` 一致走文件锁，减少并发写风险。
- 保持 `write/edit` 输出语义不回退。

### 当前结果

- `runtime-file-freshness.service.ts` 当前已新增 `withWriteFreshnessGuard()`：
  - `withFileLock`
  - `assertCanWrite`
  - `run`
  - `rememberRead`
- `write-tool.service.ts` 与 `edit-tool.service.ts` 当前都改为调用同一 guard owner。
- `write` 现在也自动走文件锁，行为与 `edit` 对齐。
- `runtime-file-freshness.service.spec.ts` 已新增 guard 相关回归：
  - 未读覆盖阻断且 writer 不执行
  - 成功写入后自动记录 read stamp

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/file/runtime-text-replace.spec.ts`
  - 结果：`6 suites / 168 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 中途修复：
  - `tool-registry` 夹具已补 `withWriteFreshnessGuard` mock，修复后重跑全绿

### 下一步

- 进入 `P21-5` 阶段级复核：
  - 判断 rewrite 匹配纠偏、post-write 反馈、freshness 控制流压缩是否已满足阶段目标
  - 若复核通过，再把 `P21-5` 从 `进行中` 改为 `已完成`

### Judge

- 结果：`PASS`
- 结论摘要：
  - 重复 freshness 流程已在 shared owner 收口
  - `write/edit` 调用面一致并共享文件锁
  - 对外输出语义与工具链行为未回退

## 2026-04-23 P21-5 阶段级复核

### 复核目标

- 判断 `P21-5 Write / Edit 成熟度补齐` 是否满足 TODO 阶段定义，可从“进行中”改为“已完成”。
- 重点识别是否存在“只改展示字段、owner 仍停在工具层”的假完成。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/file/runtime-text-replace.spec.ts`
  - 结果：`6 suites / 168 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS-P21-5`
- 结论摘要：
  - rewrite 匹配纠偏、post-write 反馈、freshness 控制流压缩三块范围都已成立
  - 关键 owner 已稳定停在 shared replace / post-write renderer / freshness backend
  - native tool-chain 证据与 fresh 验收均成立，可将 `P21-5` 标记为已完成

## 2026-04-23 P21-6 第一刀：第三 filesystem backend 等价证据

### 本轮目标

- 在不改 6 工具 owner 的前提下，补出第三 filesystem backend kind 的真路由证据。
- 证据覆盖 `read/glob/grep/write/edit` 主链，而非单工具样例。

### 当前结果

- `tool-registry.service.spec.ts` 当前已新增：
  - `routes filesystem tools through a third real backend kind without changing tool owner`
  - 该用例通过 `aliasHostFilesystemKinds` 注入 `host-filesystem-alias`
  - 依次执行 `read -> write -> edit -> glob -> grep`，验证同一 backend 视图下的读写结果
- `createFixture` 当前已支持 `aliasHostFilesystemKinds`，用于复用真实 host backend 行为并给出第三 kind 证据。
- `createKindAliasedFilesystemBackend()` 当前通过代理复用真实 host backend 方法，仅改 `getKind/getDescriptor`，避免 mock 假路由。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/file/runtime-text-replace.spec.ts`
  - 结果：`6 suites / 169 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 继续留在 `P21-6`，补 shell 侧第三 backend 等价证据并做迁移性汇总：
  - 覆盖 `bash` 真路由
  - 与 filesystem 侧证据合并后，判断是否可进入 `P21-6` 阶段级复核

### Judge

- 结果：`PASS`
- 结论摘要：
  - 证据覆盖了 `read/glob/grep/write/edit` 五条主链
  - 使用真实 host backend 行为，不是 `mock-filesystem` 假路由
  - 6 工具服务 owner 未因 backend kind 扩展而回改

## 2026-04-23 P21-6 第二刀：第三 shell backend 等价证据

### 本轮目标

- 补 shell 侧第三 backend kind 证据，覆盖 `bash` 真路由。
- 继续保持工具层 owner 不感知 backend 新 kind。

### 当前结果

- `tool-registry.service.spec.ts` 当前已新增：
  - `routes bash execution through a third shell backend kind without changing tool owner`
  - 通过 `aliasNativeShellKinds` 注入 `native-shell-alias`
  - 断言 pending request 的 `backendKind` 为 `native-shell-alias`
- `createFixture` 当前已支持 `aliasNativeShellKinds` 注入。
- `createKindAliasedRuntimeBackend()` 当前复用真实 `native-shell` 执行链，仅改 kind/descriptor 投影。
- `usesRuntimePowerShellBackend()` 测试辅助已兼容 alias kind，避免 Windows 下命令语法误判。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/file/runtime-text-replace.spec.ts`
  - 结果：`6 suites / 170 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 进入 `P21-6` 阶段级复核：
  - 汇总 filesystem + shell 两侧第三 backend 证据
  - 判断是否可将 `P21-6` 标记为 `已完成`

### Judge

- 结果：`PASS`
- 结论摘要：
  - `bash` 真链路已确认路由到第三 shell backend kind
  - 证据停在 runtime backend 装配层，未回流 `BashToolService`
  - fresh 与 smoke 均通过

## 2026-04-23 P21-6 阶段级复核

### 复核目标

- 判断 `P21-6 第三 backend 试点` 是否满足 TODO 阶段定义，可从“进行中”改成“已完成”。
- 重点识别是否存在 mock 假迁移，或工具层新增 backend 特判。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/execution/file/runtime-file-post-write-report.spec.ts tests/execution/file/runtime-text-replace.spec.ts`
  - 结果：`6 suites / 170 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS-P21-6`
- 结论摘要：
  - filesystem + shell 两侧第三 backend kind 证据都已成立
  - 证据基于真实 host/native 行为，不是 mock 假路由
  - 6 工具服务 owner 未因 backend 扩展而回改，可将 `P21-6` 标记为已完成

## 2026-04-23 P21-7 第一刀：`runtime-shell-command-hints` 去重与回归修复

### 本轮目标

- 保留行为语义不变的前提下，继续压缩 `runtime-shell-command-hints.ts` 中重复的 PowerShell 路径提取控制流。
- 修复独立 judge 指出的 redirection 单引号 env/provider-env 误展开回归。
- 给静态层与权限链两层分别补负向证据，避免同类回退再次出现。

### 当前结果

- `runtime-shell-command-hints.ts` 已把 redirection token 读取从 `stripOuterQuotes()` 改为 `normalizeQuotedShellToken()`，保留单引号 literal 标记。
- `bash-tool.service.spec.ts` 已新增两条负向回归：
  - `'$env:...` redirection 不应被识别为外部写入
  - `'filesystem::$env:...` redirection 不应被识别为外部写入
- `tool-registry.service.spec.ts` 已新增两条真链路负向回归：
  - 审批 pending request 不应携带 `commandHints.externalWritePaths`
  - `reject` 后返回仍维持既有 `invalid-tool-result` 语义

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 246 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19671` 行（`*.ts`）

### Judge

- 首轮：`FAIL-1`
  - 指出 redirection 单引号 env/provider-env 被误展开，不能计入 `P21-7` 进度
- 修复后复核：`PASS-1`
  - 确认 FAIL 点已消除，新增两层负向证据有效
  - 确认去重收益仍在，未发生 owner 回流
  - 结论：可计入 `P21-7` 进度

### 下一步

- 继续 `P21-7` 第二刀，优先处理 `runtime-host-filesystem-backend.service.ts` 与 `runtime-shell-command-hints.ts` 的重复流程，目标是在不降成熟度前提下持续压缩总行数。

## 2026-04-23 P21-7 第二刀：命令分派与扩展名判定去重

### 本轮目标

- 压缩 `runtime-shell-command-hints.ts` 的写路径命令分派重复分支。
- 压缩 `runtime-host-filesystem-backend.service.ts` 的 MIME/binary 扩展名长 `switch`。
- 保持 shell hints 与 host filesystem 语义不变，不把逻辑回流到工具层。

### 当前结果

- `runtime-shell-command-hints.ts` 已新增 `SHELL_WRITE_PATH_TOKEN_READERS` 映射，替代长串 `if (segment.command === ...)` 分派。
- `runtime-host-filesystem-backend.service.ts` 已新增：
  - `PLAIN_TEXT_MIME_EXTENSIONS`
  - `MIME_TYPE_BY_EXTENSION`
  - `BINARY_PATH_EXTENSIONS`
- `detectFilesystemMimeType()` 与 `isBinaryFilesystemPath()` 已改为集合映射判定，删除重复 `switch` 分支。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 260 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19648` 行（`*.ts`）

### Judge

- 结果：`PASS-2`
- 结论摘要：
  - 命令分派与扩展名判定去重属于实质性重复控制流压缩
  - shell 写路径与 filesystem mime/binary 判定语义保持，未见回退
  - 工具层未新增分支，变更仍停在 shared owner，可计入 `P21-7` 进度

### 下一步

- 继续 `P21-7` 第三刀，优先挑选 `runtime-host-filesystem-backend.service.ts` 与 `runtime-shell-command-hints.ts` 内可继续收口的重复流程，保持“每刀 fresh + smoke + judge”。

## 2026-04-23 P21-7 第三刀：删除薄包装函数

### 本轮目标

- 继续压缩 `runtime-shell-command-hints.ts` 的薄包装层，减少“只转发参数”的中转函数。
- 保持 `add-content / out-file / remove-item / scp` 的路径提取语义不变。

### 当前结果

- `SHELL_WRITE_PATH_TOKEN_READERS` 已直接绑定：
  - `add-content` / `set-content` -> `readPowerShellFlaggedOrPositionalPathTokens(..., POWERSHELL_CONTENT_VALUE_FLAGS)`
  - `out-file` -> `readPowerShellFlaggedOrPositionalPathTokens(..., POWERSHELL_OUT_FILE_VALUE_FLAGS)`
  - `remove-item` -> `readPowerShellFlaggedOrPositionalPathTokens(..., POWERSHELL_REMOVE_ITEM_VALUE_FLAGS, POWERSHELL_REMOVE_ITEM_PATH_PARAMETER_FLAGS)`
  - `scp` -> `readShellDestinationPathTokens(tokens, 2)`
- 已删除仅做参数转发的薄包装函数：
  - `readPowerShellContentWritePathTokens`
  - `readPowerShellOutFileWritePathTokens`
  - `readPowerShellRemoveItemWritePathTokens`
  - `readScpWritePathTokens`

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 246 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19636` 行（`*.ts`）

### Judge

- 结果：`PASS-3`
- 结论摘要：
  - 这刀属于实质删薄包装，不是换壳
  - 命令 flag 与 positional 规则保持，语义未回退
  - 变更仍停在 shared owner，可计入 `P21-7` 进度

### 下一步

- 继续 `P21-7`，优先挑选高行数 owner 的重复控制流，确保每刀都有净减行与 fresh/judge 证据。

## 2026-04-23 P21-7 第四刀：声明收口与类型去重

### 本轮目标

- 继续做低风险净减行，优先处理重复类型定义与冗长声明。
- 不改运行时控制流，只做 owner 内部去重与声明收口。

### 当前结果

- `runtime-host-filesystem-backend.service.ts`：
  - 新增 `RuntimeTraversalState`，替代多处重复遍历状态结构声明
  - `PLAIN_TEXT_MIME_EXTENSIONS` 与 `BINARY_PATH_EXTENSIONS` 声明收口为紧凑数组形式
- `runtime-shell-command-hints.ts`：
  - `FILE_COMMANDS / WRITE_COMMANDS / POWERSHELL_REMOVE_ITEM_VALUE_FLAGS` 声明收口为紧凑数组形式

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`3 suites / 260 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19545` 行（`*.ts`）

### Judge

- 结果：`PASS-4`
- 结论摘要：
  - 重复类型已被收口，属于有效减膨胀
  - 集合声明压缩未改变成员，语义无回退
  - 可计入 `P21-7` 进度

### 下一步

- 继续 `P21-7`，优先从 `runtime-host-filesystem-backend.service.ts` 与 `runtime-shell-command-hints.ts` 中挑选仍可删除的重复控制流。

## 2026-04-23 P21-7 第五刀：shell hints 常量声明继续收口

### 本轮目标

- 延续低风险减行，在 `runtime-shell-command-hints.ts` 收口长常量声明。
- 保持 alias/flag 成员不变，不触碰 reader 控制流。

### 当前结果

- `COMMAND_ALIASES` 声明已压缩为紧凑条目布局。
- `POWERSHELL_PATH_PARAMETER_FLAGS` 声明已压缩为紧凑数组形式。
- 运行逻辑未变，本刀仅涉及常量声明层。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 246 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19526` 行（`*.ts`）

### Judge

- 结果：`PASS-5`
- 结论摘要：
  - 本刀是有效减膨胀，成员集合未变，无语义回退
  - 可计入 `P21-7` 进度

### 下一步

- 继续 `P21-7`，优先挑“控制流去重收益更高”的切刀，避免只靠声明压缩推进。

## 2026-04-23 P21-7 第六刀：网络命令判定常量化

### 本轮目标

- 减少 `runtime-shell-command-hints.ts` 内重复数组常量，收口网络命令判定与 tar flag 判定中的重复声明。
- 保持网络命令识别语义不变。

### 当前结果

- 已新增并复用：
  - `NETWORK_COMMANDS`
  - `GIT_NETWORK_SUBCOMMANDS`
  - `PACKAGE_MANAGER_COMMANDS`
  - `PACKAGE_MANAGER_NETWORK_SUBCOMMANDS`
  - `TAR_FILE_LONG_FLAGS`
  - `TAR_DIRECTORY_LONG_FLAGS`
- `readRuntimeShellNetworkCommands()` 和 `readTarWritePathTokens()` 已改为复用上述常量，不再在函数内重复构造数组/集合。

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 246 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19523` 行（`*.ts`）

### Judge

- 结果：`PASS-6`
- 结论摘要：
  - 网络命令与 tar flag 常量化属于有效去重，成员保持一致
  - 语义未回退，可计入 `P21-7` 进度

### 下一步

- 继续 `P21-7`，优先做控制流级去重，减少“单刀收益偏小”的纯声明收口。

## 2026-04-23 P21-7 第七刀：search result owner 下沉到 shared

### 本轮目标

- 把纯渲染/提示 owner 从 `packages/server/src` 下沉到 `packages/shared`，做实质性减膨胀。
- 保持 `glob/grep/read overlay/缺失路径提示` 语义不变。

### 当前结果

- 新增 `packages/shared/src/runtime-search-result-report.ts`，承接：
  - truncation/total/empty/follow-up 文案
  - suggested-read 选择逻辑
  - missing-path next-step 文案
- `packages/shared/src/index.ts` 已导出该 owner。
- server 侧消费点已切到 shared：
  - `glob-tool.service.ts`
  - `grep-tool.service.ts`
  - `runtime-host-filesystem-backend.service.ts`
  - `project-worktree-search-overlay.service.ts`
- 已删除 `packages/server/src/execution/file/runtime-search-result-report.ts`。

### 已验证

- `packages/shared`: `npm run build -w packages/shared`
  - 结果：通过
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/file/runtime-search-result-report.spec.ts tests/execution/project/project-worktree-search-overlay.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`6 suites / 166 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19416` 行（`*.ts`）

### Judge

- 结果：`PASS-7`
- 结论摘要：
  - 下沉是实质 owner 迁移，不是换目录保留双份实现
  - server 侧只保留消费点，未新增转发壳
  - 可计入 `P21-7` 进度

### 下一步

- 继续找可下沉的纯逻辑 owner，优先从 `execution/file` 和 `execution/runtime` 中挑 server 无关的渲染/排序策略。

## 2026-04-23 P21-7 第八刀：read result render owner 下沉到 shared

### 本轮目标

- 把 `read` 输出渲染 owner 从 `packages/server/src` 下沉到 `packages/shared`。
- 保持目录/文件/资产 read 输出语义不变。

### 当前结果

- 新增 `packages/shared/src/runtime-read-result-render.ts`，承接：
  - `renderDirectoryReadOutput`
  - `renderAssetReadOutput`
  - `renderFileReadOutput`
- `packages/shared/src/index.ts` 已导出该 owner。
- `read-tool.service.ts` 已改为从 `@garlic-claw/shared` 直接消费渲染函数。
- 已删除 `packages/server/src/execution/read/read-result-render.ts`。

### 已验证

- `packages/shared`: `npm run build -w packages/shared`
  - 结果：通过
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/read/read-tool.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/file/runtime-search-result-report.spec.ts tests/execution/project/project-worktree-search-overlay.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`7 suites / 172 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19337` 行（`*.ts`）

### Judge

- 结果：`PASS-8`
- 结论摘要：
  - 下沉是实质 owner 迁移，不是换目录保留双份实现
  - read 输出主链语义未回退
  - 可计入 `P21-7` 进度

### 下一步

- 继续在 `execution` 下找可迁移到 shared/plugin-sdk 的纯逻辑 owner，优先选择“server 特有依赖最少、减行收益更高”的块。

## 2026-04-23 P21-7 边界回滚：shared 仅保留类型

### 回滚目标

- 执行用户新增边界：`shared` 仅做类型共享，不承载运行逻辑。
- 回滚第七刀与第八刀的逻辑下沉，恢复 server 本地 owner。

### 回滚结果

- `shared` 侧逻辑文件已删除：
  - `packages/shared/src/runtime-search-result-report.ts`
  - `packages/shared/src/runtime-read-result-render.ts`
  - `packages/shared/src/runtime-text-replace-core.ts`
- `shared` 入口导出已回退，不再导出以上运行逻辑。
- `server` 侧逻辑已恢复：
  - `packages/server/src/execution/file/runtime-search-result-report.ts`
  - `packages/server/src/execution/read/read-result-render.ts`
  - `packages/server/src/execution/file/runtime-text-replace.ts`
- `glob/grep/read/project-worktree/runtime-host` 与对应测试导入已回退到 server 本地 owner。

### 已验证

- `packages/shared`: `npm run build -w packages/shared`
  - 结果：通过
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/file/runtime-text-replace.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/file/runtime-search-result-report.spec.ts tests/execution/project/project-worktree-search-overlay.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`8 suites / 188 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- 代码规模复测：`packages/server/src = 19541` 行（`*.ts`）

### Judge

- 结果：`PASS`
- 结论摘要：
  - shared 侧这三组逻辑实现已移除
  - server 侧实现与消费链已恢复完整
  - 未发现双份实现残留

### 状态说明

- 第七刀、第八刀改为“已被边界回滚替代”，不再计入当前减行成果。

## 2026-04-23 P21-7 第九刀：shell hints flag reader 合并与净减行回收

### 本轮目标

- 继续留在 `packages/server/src` 内做实质减膨胀，不触碰 `shared` 逻辑边界。
- 把 `runtime-shell-command-hints.ts` 中 PowerShell/POSIX flag 路径读取循环、`new-item/rename-item` 组合路径与若干薄包装继续收口。
- 保持 shell hints 判断仍集中在同一 owner，不回流 `BashToolService / tool-registry / 审批 service`。

### 当前结果

- `runtime-shell-command-hints.ts` 已新增并复用：
  - `readFlaggedPathTokens()`
  - `readPowerShellComposedWritePathTokens()`
  - `readSinglePathToken()`
- PowerShell 与 POSIX flag 路径提取已改为共享读取循环，不再各自维护一套 `wantsPath + push` 控制流。
- `new-item / rename-item` 已共用同一条 `path + leaf/new-name` 拼接流程。
- `readShellCommandWritePathTokens()`、`mkdir` 分流、destination/path fallback 与若干常量声明已继续压缩。
- 文件物理行数复测：
  - `packages/server/src/execution/runtime/runtime-shell-command-hints.ts = 843`
  - 上一轮基线：`856`
  - 本刀净减：`13`

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 246 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过

### Judge

- 结果：`PASS`
- 结论摘要：
  - 这刀属于实质性控制流去重和删薄包装，不是单纯改写法
  - shell hints 主语义保持，未见回流到工具层或审批层
  - 公开接口仍是同一套 `metadata / summary`，可计入 `P21-7` 进度

### 额外记录

- 当前已新增统一统计脚本：`npm run count:server-src`
- 统计口径已固定为：`packages/server/src/**/*.ts` 的非空行数
- 当前脚本实测：`19531`
- 与 PowerShell 基线已对齐：`Get-ChildItem packages/server/src -Recurse -File -Filter *.ts | Get-Content | Measure-Object -Line`

## 2026-04-24 P21-7A 权限链真证据补齐

### 本轮目标

- 把 `P21-7A` 已落地的“本地变量路径 AST 预扫”补成 permission chain 级证据，而不只停在 `BashToolService` 静态层。
- 同时确认 PowerShell `Join-Path + 本地变量` 只在 `native-shell` 语法族下采信，不把默认 just-bash backend 混进证据口径。

### 当前结果

- `packages/server/tests/execution/tool/tool-registry.service.spec.ts` 已新增并通过：
  - mock-shell 的 bash 本地变量路径 permission request
  - native-shell-alias 的 PowerShell 本地变量路径 permission request
  - native-shell-alias 的 PowerShell `$(Join-Path $root ...)` permission request
- `packages/server/tests/execution/bash/bash-tool.service.spec.ts` 已新增并通过：
  - PowerShell `$(Join-Path $root 'copied-local.txt')` 静态 hints 正例
- 中途确认的边界：
  - 同一条 PowerShell `Join-Path + 本地变量` 用例若走默认 shell backend，会退回 just-bash 语法族，因此不会产出 AST 级本地变量提示
  - 所以这类证据必须固定到 `native-shell` 同族 backend，不能用默认 backend 口径混测

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 265 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 这一步 fresh 已完成，但还没做独立 judge，不能把 `P21-7A` 改成 `已完成`
- 下一步优先回到：
  - `P21-7A` judge 复核
  - 或 `P21-7D` 的大 owner 减膨胀

## 2026-04-24 P21-7D host filesystem / shell hints 减膨胀

### 本轮目标

- 在不改公开行为的前提下，继续压缩 `execution/file` 与 `execution/runtime` 的重复控制流。
- 优先处理：
  - `runtime-host-filesystem-backend.service.ts`
  - `runtime-shell-command-hints.ts`

### 当前结果

- `runtime-host-filesystem-backend.service.ts` 已继续收口：
  - 文件可读性判定已集中到 `readRuntimeHostFilesystemReadMetadata()`
  - `readPathRange / readRuntimeDiffBaseContent / readRuntimeTextFileContent` 不再各自维护一套 mime/binary 判定
  - 目录遍历的 `readdir -> 递归` 分支已收口到 `collectRuntimeVisibleDirectoryEntries()`
  - `createSymlink / readSymlink` 已复用同一条 mounted filesystem 读取路径
  - `readTextFile / editTextFile` 已复用同一条文本文件读取 owner
- `runtime-shell-command-hints.ts` 已继续删除单次使用薄包装：
  - `readRuntimeShellExpandedEnvPath()`
  - `readFirstPowerShellAttachedFlagValue()`
  - 调用点已直接复用底层 owner，不改 shell hints 语义
- 当前总量复测：
  - `npm run count:server-src` -> `20407`
  - 相比本轮开始前的 `20418`，净减 `11`

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`7 suites / 182 tests` 全部通过
- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`2 suites / 265 tests` 全部通过
- root: `npm run smoke:server`
  - 结果：`182 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`182 checks` 通过

### 下一步

- 这轮只有 fresh 验证，还没做独立 judge，不能把 `P21-7D` 标为完成
- 下一步继续挑大 owner：
  - `runtime-shell-command-hints.ts`
  - `runtime-text-replace.ts`

## 2026-04-24 S11-继续：filesystem backend path/read 主链

### 本轮目标

- 在 `runtime-host-filesystem-backend.service.ts` 内直接删除旧的 path 校验薄包装和重复文本读取链。
- 保持 `read / write / edit / grep / glob / symlink` 外部行为不变，只删 owner 内重复控制流。

### 当前结果

- 已删除：
  - `requireExistingPath`
  - `requireDirectoryPath`
  - `requireFilePath`
  - `requireMissingPath`
  - `resolveWritableFilePath`
- 已新增并落地到同一 owner：
  - `resolveValidatedPath()` 成为唯一路径校验入口
  - `readRuntimeHostFilesystemTextSource()` 成为 `readTextFile / editTextFile / grepText` 共用文本源读取入口
  - `readMissingPathMessage()` 成为缺失路径 suggestion 文案唯一拼装入口
- 当前量化结果：
  - `runtime-host-filesystem-backend.service.ts`: `822 -> 773`
  - `npm run count:server-src`: `20150 -> 20101`

### 已验证

- `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts tests/execution/grep/grep-tool.service.spec.ts tests/execution/glob/glob-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
  - 结果：`7 suites / 196 tests` 通过
- `packages/server`: `npm run build`
  - 结果：通过
- root: `npm run count:server-src`
  - 结果：`20101`
- root: `npm run smoke:server`
  - 结果：`184 checks` 通过
- root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - 结果：`184 checks` 通过

### 下一步

- 独立 judge 已通过：
  - 结论：这刀是真删旧主链，不是换壳；`resolveValidatedPath / readRuntimeHostFilesystemTextSource / readMissingPathMessage` 已成为同一 owner 内的真实收口点
- judge 通过后，继续看：
  - `runtime-shell-command-hints.ts`
  - `runtime-text-replace.ts`
