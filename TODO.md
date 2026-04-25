# Garlic Claw TODO

> 本文件只保留当前有效计划、边界、验收与对照位置。
> 已完成细节写入 `task_plan.md / progress.md / findings.md`，这里不再堆历史流水账。

## 总目标

- 以 `other/opencode/packages/opencode/src/tool/{bash,read,write,edit,glob,grep}.ts` 为边界，对齐当前工具公开语义。
- `shared` 只保留类型共享，不放运行逻辑。
- 优先完成功能，再压体积；最终目标 `packages/server/src <= 15000`。
- 只接受 owner 级重写，不接受换目录、换名字或碎片式“减几行”。

## 硬约束

- 不新增 `helper / helpers` 这类语义不明命名。
- 不在 `shared` 写运行逻辑。
- 禁止 `any`，除非外部类型客观缺失且无法补齐。
- `TODO.md` 已完成事项只保留摘要，不继续堆展开描述。
- 体积阶段必须优先删旧主链、直接重写同一 owner，不保留并行双实现。
- 每个阶段都要有：
  - 代码变更
  - fresh 验收
  - 独立 judge
  - 文档同步
- 未通过 judge 的阶段，不能改为 `[已完成]`。

## OpenCode 对照

| 工具 | OpenCode 源码 | 当前 owner | 当前剩余事项 |
| --- | --- | --- | --- |
| `bash` | `other/opencode/packages/opencode/src/tool/bash.ts` | `packages/server/src/execution/bash/bash-tool.service.ts`<br>`packages/server/src/execution/runtime/runtime-shell-command-hints.ts` | 主链已对齐；剩余是阶段 judge 与最终总复核 |
| `read` | `other/opencode/packages/opencode/src/tool/read.ts` | `packages/server/src/execution/read/read-tool.service.ts`<br>`packages/server/src/execution/read/read-path-instruction.ts`<br>`packages/server/src/execution/runtime/runtime-file-freshness.service.ts` | 主链已对齐；剩余是阶段 judge 与最终总复核 |
| `write` | `other/opencode/packages/opencode/src/tool/write.ts` | `packages/server/src/execution/write/write-tool.service.ts`<br>`packages/server/src/execution/file/runtime-file-post-write-report.ts` | 主链已对齐；剩余是阶段 judge 与最终总复核 |
| `edit` | `other/opencode/packages/opencode/src/tool/edit.ts` | `packages/server/src/execution/edit/edit-tool.service.ts`<br>`packages/server/src/execution/file/runtime-text-replace.ts`<br>`packages/server/src/execution/file/runtime-file-post-write-report.ts` | 主链已对齐；剩余是阶段 judge 与最终总复核 |
| `glob` | `other/opencode/packages/opencode/src/tool/glob.ts` | `packages/server/src/execution/glob/glob-tool.service.ts`<br>`packages/server/src/execution/file/runtime-search-result-report.ts` | 主链已基本对齐，仅保留回归与稳定性复核 |
| `grep` | `other/opencode/packages/opencode/src/tool/grep.ts` | `packages/server/src/execution/grep/grep-tool.service.ts`<br>`packages/server/src/execution/file/runtime-search-result-report.ts` | 主链已基本对齐，仅保留回归与稳定性复核 |

## 当前基线

- 统计时间：`2026-04-25`
- 当前体积：`packages/server/src = 14691` 非空行
- 统计命令：`npm run count:server-src`
- 当前与 `S11 <= 19000` 的关系：
  - 体积已经低于门槛
  - `S11` 阶段总 judge 已通过
  - `S14` 已完成，当前进入 `S15`

## 当前高体积 owner

1. `packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts`：`515`
2. `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts`：`391`
3. `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts`：`388`
4. `packages/server/src/execution/runtime/runtime-shell-command-hints.ts`：`386`
5. `packages/server/src/execution/file/runtime-host-filesystem-backend.service.ts`：`385`
6. `packages/server/src/ai/ai-model-execution.service.ts`：`385`
7. `packages/server/src/conversation/conversation-task.service.ts`：`380`
8. `packages/server/src/runtime/host/runtime-host.service.ts`：`264`
9. `packages/server/src/plugin/persistence/plugin-persistence.service.ts`：`242`
10. `packages/server/src/execution/automation/automation.service.ts`：`241`

## 阶段计划

### S1-S9 功能对齐

- 状态：已完成
- 摘要：
  - `bash`：AST 预扫、`Join-Path` / env / 本地变量路径提示已就位
  - `read`：loaded-files、路径级 `AGENTS.md`、session reminder 已就位
  - `write/edit`：`postWriteSummary`、diagnostics 排序、rewrite 纠偏已就位
  - `glob/grep`：OpenCode 主链能力已基本齐备
- 细节证据：见 `task_plan.md / progress.md / findings.md`

### S10 体积基线重排

- 状态：已完成
- 摘要：
  - 已把压缩主战场固定在高体积 owner
  - 已停止 shared 下沉与碎片式减行路线

### S11 体积压到 `<= 19000`

- 状态：已完成
- 摘要：
  - 通过 owner 级重写把 `packages/server/src` 从 `18490` 压到 `16086`
  - 高收益 owner 包括：`runtime-shell-command-hints`、`runtime-text-replace`、`runtime-host-filesystem-backend`、`tool-registry`、`mcp`、`automation`
  - 阶段 fresh 与阶段总 judge 均已通过
- 细节证据：见 `task_plan.md / progress.md / findings.md`

### S12 体积压到 `<= 17000`

- 状态：已完成
- 摘要：
  - 已继续清理前排大 owner，并把总量稳定压到 `<= 17000`
  - 阶段总 judge：`PASS`
- 细节证据：见 `task_plan.md / progress.md / findings.md`

### S13 体积压到 `<= 15000`

- 状态：已完成
- 前置：`S12` 完成
- 摘要：
  - 关键 owner 收口：
    - `runtime-host-filesystem-backend.service.ts`：`406 -> 386`
    - `runtime-host-subagent-runner.service.ts`：`650 -> 605`
    - `builtin-context-compaction.plugin.ts`：`593 -> 430`
    - `conversation-task.service.ts`：`515 -> 460`
  - `runtime-host-conversation-record.service.ts`：`504 -> 448 -> 434`
    - `plugin-persistence.service.ts`：`355 -> 242`
    - `persona-store.service.ts`：`334 -> 215`
    - `persona.service.ts`：`279 -> 183`
    - `conversation-message-planning.service.ts`：`301 -> 216`
    - `plugin-read-model.ts`：`263 -> 213`
    - `ai-model-execution.service.ts`：`506 -> 399`
    - `runtime-host-values.ts`：`224 -> 208`
    - `runtime-gateway-connection-lifecycle.service.ts`：`217 -> 214`
    - `plugin-bootstrap.service.ts`：`400 -> 220`
  - 当前总量：`16086 -> 14983`
  - 本阶段最后一刀 fresh：
    - `packages/server`: `plugin-bootstrap / plugin-remote-bootstrap / plugin-persistence / runtime-host-subagent-runner` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14983`
  - 本阶段最后一刀 judge：`PASS`
  - 阶段结论：`S13` 已完成
- 细节证据：见 `task_plan.md / progress.md / findings.md`

### S14 最终总验收

- 状态：已完成
- 前置：`S13` 完成
- fresh：
  - `packages/shared`: `npm run build`
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - root: `npm run smoke:web-ui`
- judge：
  - 检查功能与 `other/opencode` 对齐
  - 检查 `packages/server/src <= 15000`
  - 检查没有“换壳未降复杂度”的假完成
- 结果：
  - `npm run lint`：通过，`0 errors / 0 warnings`
  - `packages/server/src = 14983`
  - 独立 judge：`PASS`
  - 当前结论：`S14` 已完成

### S15 体积安全余量

- 状态：进行中
- 目标：
  - 在不回退 `S1-S14` 结论的前提下，把 `packages/server/src` 从 `14983` 继续压低，给后续维护留出安全余量
  - 本阶段优先继续清理前 1-3 名高体积 owner，仍只接受 owner 级真实重写
- 当前进度：
  - `runtime-host-subagent-runner.service.ts` 已完成一刀 owner 级重写：`605 -> 566`
  - 已把 `run/start/restart` 的 invocation/session/subagent 创建链收成 `startStoredSubagent / restoreStoredSubagentExecution / persistSubagentSession`
  - `session / subagent / write-back / before-after hook` 语义仍留在同一 owner
  - `conversation-task.service.ts` 已完成一刀 owner 级重写：`460 -> 435`
  - 已把 `streaming / stop / error / completed` 的 message snapshot 与 terminal 收尾链收成 `ConversationTaskRuntime / persistTaskSnapshot / finishTask`
  - `patched completion / permission event / tool-call-result` 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `runtime-host-subagent-runner / plugin-bootstrap / plugin-persistence / conversation-task / conversation-message-lifecycle / conversation.controller` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14729`
  - judge：
    - `runtime-host-subagent-runner.service.ts`：`PASS`
    - `conversation-task.service.ts`：`PASS`
    - `runtime-host-conversation-record.service.ts`：`PASS`
    - `builtin-context-compaction.plugin.ts`：`PASS`
    - `ai-model-execution.service.ts`：`PASS`
    - `runtime-host-filesystem-backend.service.ts`：`PASS`
- 已新增一刀：
  - `runtime-host-conversation-record.service.ts` 已继续完成一刀 owner 级重写：`434 -> 405`
  - 已把 `keepConversationSession / startConversationSession / previewConversationHistory / writeConversationHostServices / rememberRuntimePermissionApproval` 的重复收尾链继续压回当前 owner
  - `replaceConversationHistory()` 已去掉 owner 内部重复 revision assert，revision 保护仍由同一主链承接
  - `create/delete/read/list`、`persist/load/migration`、`session keep/start/finish`、`history preview/replace`、`runtimePermissionApprovals`、`activePersona` 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `runtime-host-conversation-record / conversation-message-lifecycle / conversation-task` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14808`
  - judge：`PASS`
- 已新增一刀：
  - `builtin-context-compaction.plugin.ts` 已继续完成一刀 owner 级重写：`410 -> 401`
  - 已把 `/compact`、`/compress` 与 route `context-compaction/run` 的手动执行入口继续收成同一主链 `runManualContextCompaction(...)`
  - 已删除 `ContextCompactionHistoryState` 不再需要的状态统计壳，compaction 结果收尾不再经额外 covered-count 读回
  - `/compact`、`/compress`、`conversation:history-rewrite`、`chat:before-model`、route `context-compaction/run`、summary/covered annotation、auto-stop、revision 写回语义仍留在同一 owner
  - fresh：
    - `packages/server`: `builtin-context-compaction / conversation-message-lifecycle` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14799`
  - judge：`PASS`
- 已新增一刀：
  - `ai-model-execution.service.ts` 已完成一刀 owner 级重写：`398 -> 385`
  - 已把 `generateText / transportMode=stream-collect` 的重复执行主链收成单一 `readTextExecutionResult`
  - fallback target、usage 估算、response-body/raw custom blocks、tool repair、openai-compatible SSE normalize 语义仍留在同一 owner
- 已新增一刀：
  - `runtime-host-filesystem-backend.service.ts` 已完成一刀 owner 级重写：`392 -> 385`
  - 已把 `edit/write/list` 这组重复状态流继续收短：
    - `editTextFile()` 把“空旧文本写入”和“普通 replace”收成同一写回主链
    - `writeResolvedTextFile()` 的 diff base 读取收成 `readRuntimeHostFilesystemDiffBase()`
    - `listFiles()` 的 `partial / skippedEntries / skippedPaths` 收尾链收短
  - `resolvePath / statPath / readDirectoryEntries / readPathRange / readTextFile`
  - `writeTextFile / editTextFile / copyPath / movePath / deletePath / ensureDirectory / symlink`
  - `globPaths / grepText`、`diff / postWrite / CRLF`、missing path suggestion 与 trimmed-boundary 保护语义仍留在同一 owner
  - fresh：
    - `packages/server`: `runtime-host-filesystem-backend / runtime-tool-backend / tool-registry` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14864`
  - judge：`PASS`
- 已新增一刀：
  - `runtime-shell-command-hints.ts` 已完成一刀 owner 级重写：`388 -> 386`
  - 已把 PowerShell 写路径选择与 flag 值扫描收成更短主链：
    - `readRuntimePowerShellDestinationTargets / readRuntimePowerShellWriteTargets / readRuntimePowerShellComposedTargets / readRuntimePowerShellCommandPath` 收成 `readRuntimePowerShellWriteSelection`
    - shell 与 PowerShell 的 `wantsValue` 平行扫描收成统一 `readRuntimeOptionValues`
  - `copy-item / move-item / new-item / rename-item / remove-item / set-content / add-content / out-file / mkdir`
  - `scp / tar / git` 写目标判定、quoted attached、single-quoted literal、Join-Path、provider prefix、env/local variable、remove-item include/exclude 保护语义仍留在同一 owner
  - fresh：
    - `packages/server`: `bash-tool / tool-registry` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14862`
  - judge：`PASS`
- 已新增一刀：
  - `runtime-host-subagent-runner.service.ts` 已继续完成一刀 owner 级重写：`559 -> 553`
  - 已把 `startStoredSubagent()` 与 `restoreStoredSubagentExecution()` 的 execution input 装配继续收成 `readStoredSubagentExecutionInput(...)`
  - session snapshot 变更判定已收成 `hasStoredSubagentSessionSnapshotChanged(...)`
  - raw request 与 execution request 的边界、write-back revision、before/after hook、subagentType default 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `plugin-bootstrap / plugin-persistence / runtime-host-subagent-runner` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14793`
  - judge：`PASS`
- 已新增一刀：
  - `conversation-task.service.ts` 已继续完成一刀 owner 级重写：`417 -> 397`
  - 已把 outcome 判定、snapshot / completed result / writeMessage payload 继续压回同一终态主链
  - `buildCompletedConversationTaskResult(...)` 改为直接复用 snapshot，不再重复组装字段
  - `streaming / stopped / error / completed`、patched result / onSent、permission event、tool-call / tool-result normalize、customBlocks finalize 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `conversation-task / conversation-message-lifecycle / conversation.controller` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14771`
  - judge：`PASS`
- 已新增一刀：
  - `builtin-context-compaction.plugin.ts` 已继续完成一刀 owner 级重写：`401 -> 395`
  - 已把旧的 `ContextCompactionHistoryState` 类壳继续压回纯函数主链：
    - `readContextCompactionHistoryState(...)`
    - `readContextCompactionSummaryInsertIndex(...)`
  - `message:received` 与 route `context-compaction/run` 继续共用 `runManualContextCompaction(...)`
  - `/compact`、`/compress`、`conversation:history-rewrite`、`chat:before-model`、summary/covered annotation、auto-stop、revision 写回语义仍留在同一 owner
  - fresh：
    - `packages/server`: `builtin-context-compaction / conversation-message-lifecycle` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14765`
  - judge：`PASS`
- 已新增一刀：
  - `runtime-host-conversation-record.service.ts` 已继续完成一刀 owner 级重写：`405 -> 391`
  - 已把 conversation 读模型继续收成 `readConversationRecordValue(...)`
  - 已把 session 持久化返回继续收成 `saveConversationSession(...)`
  - `create/delete/read/list`、`persist/load/migration`、`session keep/start/finish`、`history preview/replace`、`hostServices`、`runtimePermissionApprovals`、`activePersona`、revision 保护语义仍留在同一 owner
  - fresh：
    - `packages/server`: `runtime-host-conversation-record / conversation-message-lifecycle / conversation-task` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14751`
  - judge：`PASS`
- 已新增一刀：
  - `conversation-task.service.ts` 已继续完成一刀 owner 级重写：`395 -> 380`
  - 已把 `finishTask()` 里只服务一次的 terminal event / completed result / snapshot 组装壳继续压回主链
  - `persistTaskSnapshot()` 直接构造终态 snapshot，不再经过额外 `buildConversationTaskSnapshot(...)`
  - `streaming / stopped / error / completed`、snapshot 持久化、completed result、patched writeMessage、permission event、tool-call / tool-result normalize、customBlocks finalize、onComplete / onSent 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `conversation-task / conversation-message-lifecycle / conversation.controller` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14736`
  - judge：`PASS`
- 已新增一刀：
  - `builtin-context-compaction.plugin.ts` 已继续完成一刀 owner 级重写：`395 -> 388`
  - 已把命令短路回复、auto-stop 状态读取与 summary 插入点判定继续压回同一 owner 主链
  - `message:received` 直接复用 `createContextCompactionCommandShortCircuit(...)`，不再经过额外 reply formatter
  - `/compact`、`/compress`、route `context-compaction/run`、`conversation:history-rewrite`、`chat:before-model`、summary/covered annotation、auto-stop、revision 写回语义仍留在同一 owner
  - fresh：
    - `packages/server`: `builtin-context-compaction / conversation-message-lifecycle` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14729`
  - judge：`PASS`
- 已新增一刀：
  - `runtime-host-subagent-runner.service.ts` 已继续完成一刀 owner 级重写：`553 -> 542`
  - 已把 restore session 所需的 history/request 拼装、session create payload 与 execution request 组装直接压回同一 owner 主链
  - 已删除 `readStoredSubagentHistoryMessages / readStoredSubagentSessionRequest / createSubagentSessionPayload / readSubagentExecutionRequestFromSession / hasStoredSubagentSessionSnapshotChanged`
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `plugin-bootstrap / plugin-persistence / runtime-host-subagent-runner` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14718`
  - judge：`PASS`
- 已新增一刀：
  - `runtime-host-subagent-runner.service.ts` 已继续完成一刀 owner 级重写：`542 -> 530`
  - 已把 `restoreStoredSubagentExecution()` 与 `resolveSubagentSession()` 的双段主链继续收成单一 restore 主链
  - restore 侧直接承接 session 读取、旧 session 缺失时的 fallback 重建、history/request 重建与 snapshot 同步判定
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `plugin-bootstrap / plugin-persistence / runtime-host-subagent-runner` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14706`
  - judge：`PASS`
- 已新增一刀：
  - `runtime-host-subagent-runner.service.ts` 已继续完成一刀 owner 级重写：`530 -> 523`
  - 已删除只在当前 owner 单点调用的包装：`readWriteBackConversationRevision / readSubagentRequestPreview / writeSubagentSessionRequest`
  - `startSubagent()` 直接读取 write-back revision，`resolveSubagentInvocation()` 直接承接 request preview 生成，`persistSubagentSession()` update 分支直接承接 session request 写回
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `plugin-bootstrap / plugin-persistence / runtime-host-subagent-runner` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14699`
  - judge：`PASS`
- 已新增一刀：
  - `runtime-host-subagent-runner.service.ts` 已继续完成一刀 owner 级重写：`523 -> 515`
  - 已删除只被单点调用的异步包装 `completeSubagentAsync()`，`scheduleSubagentExecution()` 直接承接 `restoreStoredSubagentExecution() -> executeStoredSubagent()` 调度链
  - `readSubagentRequest()` 直接承接 `toolNames` 非空字符串过滤，已删除单点 `isNonEmptyString()`
  - `run/start/resume/restart`、session 绑定 / 恢复 / snapshot 同步、raw request / execution request 边界、writeBack sent/failed/skipped、revision changed、before-run / after-run hook、subagentType default 语义仍留在同一 owner
  - fresh：
    - `packages/server`: `plugin-bootstrap / plugin-persistence / runtime-host-subagent-runner` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: `npm run lint` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14691`
  - judge：`PASS`
- 下一刀：
  - `runtime-host-subagent-runner.service.ts`
  - 继续删 subagent runner owner 里 `start/run/restore` 的 result/session/write-back 收尾重复链，但不外推 raw request / execution request 边界、before/after hook、revision changed 或 subagentType 语义

## 最近证伪路线

- `shared` 下沉运行逻辑：已判定违反边界，不再重试。
- `runtime-text-replace.ts` 的 block-normalized 总收口：会回增体积并打坏策略边界，不再重试。
- `runtime-shell-command-hints.ts` 的单一总 dispatch：会回增体积，不再重试。

## 完成定义

- 只有 `S11-S14` 都完成，且每阶段 fresh 与 judge 都齐全，才能说“本轮完成”。

## S16 配置目录统一到 `config/`

- 状态：已完成
- 目标：
  - 把“用户维护的配置”统一收敛到仓库根 `config/`
  - `shared` 继续只保留类型，不新增运行逻辑
  - 不做旧布局兼容层，直接切到新布局
- 范围：
  - `config/ai/providers/<providerId>.json`
  - `config/ai/host-model-routing.json`
  - `config/ai/vision-fallback.json`
  - `config/mcp/servers/<name>.json`
  - `config/personas/<personaId>/persona.json`
  - `config/personas/<personaId>/avatar.*`
  - `config/agents/subagent-types/<id>.json`
  - `config/skills/governance.json`
  - `config/skills/definitions/<name>/SKILL.md`
- 不在本阶段内：
  - `runtime-host-conversation-record.service.ts`
  - `runtime-host-subagent-store.service.ts`
  - `runtime-host-subagent-session-store.service.ts`
  - `automation.service.ts`
  - `plugin-persistence.service.ts` 的运行态状态文件
- 验收：
  - 定向 Jest：`ai-management / persona / mcp / subagent / skill`
  - `packages/server`: `npm run build`
  - root: `npm run smoke:server`
  - 文档与 smoke 夹具同步到新布局
- 当前进度：
  - 新布局代码已落地，仓库内置样例与 skill 定义已迁到 `config/`
  - fresh：定向 Jest、skill/tool 定向 Jest、`packages/server npm run build`、root `npm run smoke:server` 已通过
  - 独立 judge：`PASS`
