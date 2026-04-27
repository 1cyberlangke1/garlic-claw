# Task Plan

## 2026-04-27 记忆纯插件化

1. 收口计划文件
   - `TODO.md` 删除已完成旧阶段，只保留 `M1`
   - `task_plan.md / progress.md / findings.md` 同步缩到当前任务
2. 恢复 memory builtin
   - 恢复 `builtin.memory-tools`
   - 恢复 `builtin.memory-context`
   - 接回自动加载
3. 删除内部 memory owner
   - `ContextGovernanceService` 删除内部记忆注入
   - `ContextGovernanceSettingsService` 删除 `memoryContext`
   - 前端移除对应配置面
4. fresh 验收
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/automation/automation.service.spec.ts tests/adapters/http/tool/tool.controller.spec.ts tests/conversation/conversation-message-planning.service.spec.ts`
   - `packages/web`: `npm run typecheck`
   - `packages/web`: `npm run test:run -- tests/features/tools/composables/use-tool-management.spec.ts tests/features/plugins/composables/use-plugin-management.spec.ts`
   - root: `npm run smoke:server`
5. judge
   - 独立复核是否还残留内部 memory owner 或伪插件壳

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成
- 步骤 5 已完成

## Judge

- 结论：`PASS`
- 关键结论：
  - memory builtin 自动加载已恢复
  - 记忆注入已回到插件 hook owner
  - 内部 `memoryContext` owner 与前端入口已删除
