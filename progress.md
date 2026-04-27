# Progress

## 2026-04-27 流错误稳定性与 smoke 修复

- 已确认用户现场故障链：
  - 真实上游错误是 `Anthropic 401 invalid x-api-key`
  - 后续 `NoOutputGeneratedError` 与后端退出属于流失败后的附带问题
  - 前端 `vite proxy ECONNREFUSED/ECONNRESET` 是后端退出后的连带症状
- 已有未提交修复：
  - `AiModelExecutionService` 对 `finishReason / totalUsage` 做安全 promise 包装
  - `ConversationTaskService` 对 `finishReason / usage` 再做防守式包装
  - 已补 3 处回归测试，覆盖流失败后不崩进程、不泄漏 rejected promise
- 当前正在做：
  - 等待独立 judge 复核
- 已完成：
  - `TODO.md / task_plan.md / progress.md / findings.md` 已收口到当前流错误任务
  - 复现 `smoke:server`，定位到 `normalizeStreamResult()` 用对象展开后丢失了 SDK 返回对象上的非枚举 `fullStream`
  - 修复 `AiModelExecutionService.normalizeStreamResult()`，显式保留 `fullStream`
  - `http-smoke.mjs` 的 SSE 断言已补充事件序列输出，后续失败更容易定位
  - 新增回归测试：`AiModelExecutionService` 保证非枚举 `fullStream` 不丢失
  - fresh 已通过：
    - `packages/server`: `npm run build`
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai/ai-model-execution.service.spec.ts tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
    - root: `npm run smoke:server`
