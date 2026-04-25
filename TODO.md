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
- 当前体积：`packages/server/src = 14973` 非空行
- 统计命令：`npm run count:server-src`
- 当前与 `S11 <= 19000` 的关系：
  - 体积已经低于门槛
  - `S11` 阶段总 judge 已通过
  - `S13` 已完成，下一步进入 `S14`

## 当前高体积 owner

1. `packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts`：`605`
2. `packages/server/src/conversation/conversation-task.service.ts`：`460`
3. `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts`：`448`
4. `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts`：`430`
5. `packages/server/src/ai/ai-model-execution.service.ts`：`399`
6. `packages/server/src/execution/runtime/runtime-shell-command-hints.ts`：`388`
7. `packages/server/src/execution/file/runtime-host-filesystem-backend.service.ts`：`386`
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
    - `runtime-host-conversation-record.service.ts`：`504 -> 448`
    - `plugin-persistence.service.ts`：`355 -> 242`
    - `persona-store.service.ts`：`334 -> 215`
    - `persona.service.ts`：`279 -> 183`
    - `conversation-message-planning.service.ts`：`301 -> 216`
    - `plugin-read-model.ts`：`263 -> 213`
    - `ai-model-execution.service.ts`：`506 -> 399`
    - `runtime-host-values.ts`：`224 -> 208`
    - `runtime-gateway-connection-lifecycle.service.ts`：`217 -> 214`
    - `plugin-bootstrap.service.ts`：`400 -> 220`
  - 当前总量：`16086 -> 14973`
  - 本阶段最后一刀 fresh：
    - `packages/server`: `plugin-bootstrap / plugin-remote-bootstrap / plugin-persistence / runtime-host-subagent-runner` 定向 Jest 通过
    - `packages/server`: `npm run build` 通过
    - root: 双 `smoke:server` 通过
    - root: `npm run count:server-src` -> `14973`
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
  - `npm run lint`：通过，`0 errors / 11 warnings`
  - `packages/server/src = 14973`
  - 独立 judge：`PASS`
  - 当前结论：`S14` 已完成

## 最近证伪路线

- `shared` 下沉运行逻辑：已判定违反边界，不再重试。
- `runtime-text-replace.ts` 的 block-normalized 总收口：会回增体积并打坏策略边界，不再重试。
- `runtime-shell-command-hints.ts` 的单一总 dispatch：会回增体积，不再重试。

## 完成定义

- 只有 `S11-S14` 都完成，且每阶段 fresh 与 judge 都齐全，才能说“本轮完成”。
