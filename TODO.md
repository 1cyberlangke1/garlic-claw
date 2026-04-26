# Garlic Claw TODO

> 这里只保留当前有效边界、阶段、验收与替代关系。
> 已完成细节压缩为摘要；过程证据见 `task_plan.md / progress.md / findings.md`。

## 总目标

- 以 `other/opencode/packages/opencode/src/tool/{bash,read,write,edit,glob,grep,todo}.ts` 为公开语义边界。
- `shared` 只保留类型共享，不放运行逻辑。
- 先把功能成熟度补齐到可对齐 OpenCode，再处理 `packages/server/src <= 15000` 的压体积目标。
- 不做兼容层，不保留双 owner，不接受“插件壳转发 host 同名工具”。

## 硬约束

- 不新增 `helper / helpers` 语义命名。
- 禁止 `any`，除非外部类型客观缺失且无法补齐。
- Windows 下 shell 选项只允许 `PowerShell / WSL`；Linux 下只允许 `bash`。
- `TODO.md` 已完成事项只保留摘要；未完成旧计划不能消失，只能标记为 `已完成 / 已取消 / 已废弃 / 已被新计划替代`。
- 每个阶段都必须有：
  - 代码变更
  - fresh 验收
  - 独立 judge
  - 文档同步
- 未通过 judge 的阶段不能标成 `[已完成]`。

## OpenCode 对照

| 能力 | OpenCode 源码 | 当前 owner | 状态 |
| --- | --- | --- | --- |
| `bash` | `other/opencode/packages/opencode/src/tool/bash.ts` | `packages/server/src/plugin/builtin/tools/runtime-tools/builtin-runtime-bash.plugin-tool.ts` | 已完成 |
| `read` | `other/opencode/packages/opencode/src/tool/read.ts` | `packages/server/src/plugin/builtin/tools/runtime-tools/builtin-runtime-read.plugin-tool.ts` | 已完成 |
| `glob` | `other/opencode/packages/opencode/src/tool/glob.ts` | `packages/server/src/plugin/builtin/tools/runtime-tools/builtin-runtime-glob.plugin-tool.ts` | 已完成 |
| `grep` | `other/opencode/packages/opencode/src/tool/grep.ts` | `packages/server/src/plugin/builtin/tools/runtime-tools/builtin-runtime-grep.plugin-tool.ts` | 已完成 |
| `write` | `other/opencode/packages/opencode/src/tool/write.ts` | `packages/server/src/plugin/builtin/tools/runtime-tools/builtin-runtime-write.plugin-tool.ts` | 已完成 |
| `edit` | `other/opencode/packages/opencode/src/tool/edit.ts` | `packages/server/src/plugin/builtin/tools/runtime-tools/builtin-runtime-edit.plugin-tool.ts` | 已完成 |
| `todowrite` | `other/opencode/packages/opencode/src/tool/todo.ts` | `packages/server/src/execution/todo/todo-tool.service.ts` | 已完成 |

## 已完成摘要

### C1-C8 历史功能阶段 `[已完成]`

- 上下文治理、前端窗口灰化、subagent 会话化、消息排队、网络收口、todo 对齐、runtime-tools 多文件 owner 拆分都已完成。
- 旧流水不再在本文件展开，证据压缩见 `task_plan.md / progress.md / findings.md`。

## 旧计划状态

### V1 conversation-record 压体积 `[已被 P1-P4 替代]`

- 旧方向是先压 host 大文件。
- 当前已改成先补齐 OpenCode 对齐所需功能边界。

### V2 runtime-host-runtime-tool 压体积 `[已被 P1-P4 替代]`

- 旧方向是继续压 host runtime-tool 主链。
- 当前已改成先把 builtin 主执行链迁出 host，再重开体积阶段。

### V3 体积阶段总验收 `[已完成]`

- `P1-P4` 收口后重开。
- 当前计数：`node tools/count-server-src-lines.mjs` -> `14998`。
- `P8` fresh 验收与独立 judge 已通过，本阶段收口。

## 当前阶段计划

### P1-P4 runtime-tools 对齐与收口 `[已完成]`

- 摘要：
  - 平台 shell options 已收口为 Windows `PowerShell / WSL`、Linux `bash`
  - builtin runtime-tools 已迁成 direct owner，不再走 host 同名 facade 主链
  - host 旧链仅保留 remote plugin / host API 边界
  - 完整 fresh、smoke 与文档压缩已做过一轮
- 验收与 judge：
  - 结果：`PASS`
  - 证据细节转存 `task_plan.md / progress.md / findings.md`

## 最近证伪路线

- “插件继续调 host 同名 runtime RPC，也算插件实现工具”：已证伪。
- “shellBackend 保持自由字符串，前端靠手填解决平台差异”：已证伪。
- “未配置时沿 runtime backend 默认顺序回落即可”：已证伪。
- “先继续压 host 行数，builtin owner 问题以后再说”：已证伪。

## 下一轮入口

- 进入 `V3`：
  - 目标仍是 `packages/server/src <= 15000`
  - 只接受 owner 级重写与大块净减
  - 不再回头扩 runtime-tools 功能范围
  - 并行修正被误退化的基础语义，例如 `uuidv7`

### P5 uuidv7 语义恢复 `[已完成]`

- 目标：
  - 把当前退化成 `randomUUID()` 的持久/会话关键 ID 恢复为 `uuidv7`
  - 不保留旧 v4 数据兼容入口
  - 不把运行逻辑塞回 `shared`
- 验收：
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/runtime/host/runtime-host-conversation-message.service.spec.ts tests/execution/runtime/runtime-tool-permission.service.spec.ts tests/conversation/conversation.controller.spec.ts tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - conversation / message / runtime-permission / context-compaction / OpenAI 兼容流 / plugin host request id 已恢复为 `uuidv7`
    - HTTP conversation/message 路由已收口为 UUID v7 校验
    - 未引入旧 v4 数据兼容壳

### P6 host / automation owner 压体积 `[已完成]`

- 目标：
  - 继续删除 host method 映射样板、automation 持久化与 cron 重复控制流
  - 保持 `runtime-host.service` 与 `automation.service` 现有公开语义和测试行为不变
- 当前进度：
  - `runtime-host.service.ts`: `264 -> 242`
  - `automation.service.ts`: `241 -> 193`
  - `runtime-shell-command-hints.ts`: 旧实现已删并重写，bash hint 回归通过
  - `packages/server/src`: `15761`
- 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host.service.spec.ts tests/automation/automation.service.spec.ts tests/adapters/http/automation/automation.controller.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts`
  - root: `node tools/count-server-src-lines.mjs`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - `runtime-host.service` 为 owner 内部映射收口，不是 facade 转发
    - `automation.service` 为同 owner 内控制流压缩，不是复杂度转移
    - `runtime-shell-command-hints.ts` 的 `visibleRoot='/'` 误判已修复，bash 回归已覆盖

### P7 bootstrap / ai-settings / gateway owner 压体积 `[已完成]`

- 目标：
  - 继续删除配置解析、远端连接生命周期与持久化配置读写中的重复控制流
  - 保持 `plugin-bootstrap.service.ts`、`ai-management-settings.store.ts`、`runtime-gateway-connection-lifecycle.service.ts` 公开语义不变
- 当前进度：
  - `plugin-bootstrap.service.ts`: `222 -> 208`
  - `ai-management-settings.store.ts`: `237 -> 148`
  - `runtime-gateway-connection-lifecycle.service.ts`: `214 -> 154`
  - `packages/server/src`: `15598`
- 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/runtime/gateway/runtime-gateway-connection-lifecycle.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/ai-management/ai-management.service.spec.ts`
  - root: `npm run smoke:server`
  - root: `node tools/count-server-src-lines.mjs`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - `plugin-bootstrap.service.ts` 的 manifest/config 解析仍在同一 owner 内收口，不是 facade 转移
    - `ai-management-settings.store.ts` 仍由同一 store owner 负责 provider 分文件与 routing/vision 读写
    - `runtime-gateway-connection-lifecycle.service.ts` 仍由同一 owner 负责认证、注册、断连、心跳与 health 语义

### P8 subagent / text-replace / event-log owner 压体积 `[已完成]`

- 目标：
  - 继续删掉 subagent session 持久化、文本替换、多类事件日志里的重复控制流
  - 把 `packages/server/src` 压到 `<= 15000`
  - 不改 `subagent` 软删除/回写、`edit` 替换策略、事件日志分页与裁剪语义
- 当前进度：
  - `runtime-host-subagent-session-store.service.ts`: `192 -> 171`
  - `runtime-text-replace.ts`: `196 -> 184`
  - `runtime-event-log.service.ts`: `190 -> 70`
  - `packages/server/src`: `14998`
- fresh 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/runtime/host/runtime-host-subagent-session-store.service.spec.ts tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/execution/mcp/mcp.service.spec.ts`
  - root: `npm run smoke:server`
  - root: `node tools/count-server-src-lines.mjs`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - `runtime-host-subagent-session-store.service.ts` 仍保持 removed 会话“对外隐藏、对内可追写”的语义
    - `runtime-text-replace.ts` 的策略顺序、歧义报错与 `replaceAll` 限制未变
    - `runtime-event-log.service.ts` 仍保持 append/list、cursor 分页、maxFileSize 裁剪与 `plugin/skill/mcp` 路由语义
