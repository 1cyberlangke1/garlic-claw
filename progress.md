# Progress

## 2026-04-27 记忆纯插件化

- 已确认当前问题边界：
  - builtin 自动加载入口仍在
  - `builtin-plugin-registry.service.ts` 当前没有任何 definition
  - 记忆注入现在仍在 `ContextGovernanceService.injectMemoryContext(...)`
- 已确认最小修法：
  - 只恢复 `builtin.memory-tools` 和 `builtin.memory-context`
  - 只删除内部记忆注入 owner
  - 不碰其他 builtin / 内部能力
- 已完成：
  - `TODO.md` 已删除旧完成阶段，只保留 `M1`
  - `task_plan.md / progress.md / findings.md` 已同步缩到当前任务
  - 新增 `packages/server/src/plugin/builtin/tools/builtin-memory-tools.plugin.ts`
  - 新增 `packages/server/src/plugin/builtin/hooks/builtin-memory-context.plugin.ts`
  - `builtin-plugin-registry.service.ts` 已恢复 memory builtin definitions
  - `context-governance.service.ts` 已删除内部记忆注入
  - `context-governance-settings.service.ts` 已删除 `memoryContext` section
  - `ContextGovernanceSettingsPanel.vue` 已删除内部记忆配置表述
  - `http-smoke.mjs` 已改到新边界，不再断言 `memoryContext`
- 已完成 fresh：
  - `packages/server`: `npm run build`
  - `packages/web`: `npm run typecheck`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/automation/automation.service.spec.ts tests/adapters/http/tool/tool.controller.spec.ts tests/conversation/conversation-message-planning.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts`
  - `packages/web`: `npm run test:run -- tests/features/tools/composables/use-tool-management.spec.ts tests/features/plugins/composables/use-plugin-management.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-lifecycle.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- 当前状态：
  - fresh 已通过
  - 独立 judge：`PASS`
