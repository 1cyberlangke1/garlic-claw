# Progress

## 2026-04-26 V3 体积治理

- 当前累计净减：
  - `packages/server/src`: `16546 -> 14998`
  - 本轮累计净减：`1548`
- 已重写并压缩：
  - `packages/server/src/plugin/builtin/tools/runtime-tools/runtime-tools-plugin-runtime.ts`
    - `462 -> 332`
  - `packages/server/src/conversation/conversation-task.service.ts`
    - `343 -> 260`
  - `packages/server/src/execution/file/runtime-host-filesystem-backend.service.ts`
    - `385 -> 348`
  - `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts`
    - `365 -> 341`
  - `packages/server/src/conversation/conversation-message-planning.service.ts`
    - `373 -> 325`
  - `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts`
    - `327 -> 307`
  - `packages/server/src/ai/ai-model-execution.service.ts`
    - `319 -> 312`
  - `packages/server/src/execution/runtime/runtime-shell-command-hints.ts`
    - `390 -> 358`
  - `packages/server/src/runtime/host/runtime-host-subagent-store.service.ts`
    - `232 -> 155`
  - `packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts`
    - `375 -> 350`
  - `packages/server/src/plugin/persistence/plugin-persistence.service.ts`
    - `242 -> 237`
  - `packages/server/src/runtime/host/runtime-host.service.ts`
    - `264 -> 244`
  - `packages/server/src/execution/automation/automation.service.ts`
    - `241 -> 193`
  - `packages/server/src/execution/runtime/runtime-shell-command-hints.ts`
    - 旧实现删除后整文件重写，当前回归通过
  - `packages/server/src/plugin/bootstrap/plugin-bootstrap.service.ts`
    - `222 -> 208`
  - `packages/server/src/ai-management/ai-management-settings.store.ts`
    - `237 -> 148`
  - `packages/server/src/runtime/gateway/runtime-gateway-connection-lifecycle.service.ts`
    - `214 -> 154`
  - `packages/server/src/runtime/host/runtime-host-subagent-session-store.service.ts`
    - `192 -> 171`
  - `packages/server/src/execution/file/runtime-text-replace.ts`
    - `196 -> 184`
  - `packages/server/src/runtime/log/runtime-event-log.service.ts`
    - `190 -> 70`

- 已删除未使用依赖：
  - root: `effect`
  - `packages/server`: `@nestjs/swagger`, `nestjs-pino`, `pino-http`
  - `packages/server` devDependencies: `pino-pretty`

- 已恢复 `uuidv7` 语义：
  - `packages/plugin-sdk/src/client/plugin-client.ts`
  - `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts`
  - `packages/server/src/runtime/host/runtime-host-conversation-message.service.ts`
  - `packages/server/src/execution/runtime/runtime-tool-permission.service.ts`
  - `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts`
  - `packages/server/src/ai/ai-model-execution.service.ts`
  - `packages/server/src/adapters/http/conversation/conversation.controller.ts`

## 本轮 fresh

- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/tool/tool-registry.service.spec.ts tests/runtime/host/runtime-host-runtime-tool.service.spec.ts tests/execution/read/read-tool.service.spec.ts tests/execution/write/write-tool.service.spec.ts tests/execution/edit/edit-tool.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-host-filesystem-backend.service.spec.ts tests/execution/runtime/runtime-file-freshness.service.spec.ts tests/runtime/host/runtime-host.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/conversation/conversation-message-planning.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/runtime/host/runtime-host-conversation-message.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-planning.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/conversation/conversation-message-planning.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai/ai-model-execution.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/auth/auth.service.spec.ts tests/auth/request-auth.service.spec.ts tests/conversation/conversation.controller.spec.ts tests/adapters/ws/plugin-gateway/plugin-gateway-ws-module.spec.ts tests/adapters/ws/plugin-gateway/plugin-gateway-ws-connection.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/runtime/host/runtime-host-runtime-tool.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/adapters/http/plugin/plugin-subagent.controller.spec.ts`
  - 每刀后均已 `npm run build`
- `packages/plugin-sdk`
  - `npm run build`
- `packages/server`
  - `npm run build`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/runtime/host/runtime-host-conversation-message.service.spec.ts tests/execution/runtime/runtime-tool-permission.service.spec.ts tests/conversation/conversation.controller.spec.ts tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/runtime/host/runtime-host.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/persistence/plugin-persistence.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/runtime/host/runtime-host.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host.service.spec.ts tests/automation/automation.service.spec.ts tests/adapters/http/automation/automation.controller.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host.service.spec.ts tests/execution/bash/bash-tool.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/runtime/host/runtime-host-conversation-message.service.spec.ts tests/execution/runtime/runtime-tool-permission.service.spec.ts tests/conversation/conversation.controller.spec.ts tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts tests/runtime/host/runtime-host.service.spec.ts tests/automation/automation.service.spec.ts tests/adapters/http/automation/automation.controller.spec.ts tests/execution/bash/bash-tool.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/runtime/gateway/runtime-gateway-connection-lifecycle.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/ai-management/ai-management.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts`
- root
  - `node tools/count-server-src-lines.mjs` -> `15598`
  - `npm run smoke:server` -> `server HTTP smoke passed: 187 checks`
  - `node tools/count-server-src-lines.mjs` -> `14998`
  - `npm run smoke:server` -> `server HTTP smoke passed: 187 checks`
- `packages/server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/runtime/host/runtime-host-subagent-session-store.service.spec.ts tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/execution/mcp/mcp.service.spec.ts`
  - `npm run build`

## 独立 judge

- `P5 uuidv7 语义恢复`：`PASS`
- `P6 host / automation owner 压体积`：`PASS`
- `P7 bootstrap / ai-settings / gateway owner 压体积`：`PASS`
- `P8 subagent / text-replace / event-log owner 压体积`：`PASS`
