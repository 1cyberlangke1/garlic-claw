# Task Plan

## 2026-04-27 流错误稳定性与 smoke 修复

1. 同步计划文件
   - `TODO.md` 只保留当前流错误链任务
   - `task_plan.md / progress.md / findings.md` 删除旧阶段，改为当前任务
2. 定位 `smoke:server`
   - 复现 `chat.messages.send`
   - 记录真实 SSE 事件序列与失败 owner
3. 修复 owner
   - 如果是后端流错误链，修后端
   - 如果是 smoke 断言或配置，修 smoke
   - 补对应回归测试
4. fresh 验收
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai/ai-model-execution.service.spec.ts tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
   - root: `npm run smoke:server`
5. judge
   - 独立检查是否还存在未处理 rejection、错误 SSE 语义或后端退出

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成
- 步骤 5 已完成

## Judge

- 结论：`PASS`
- 关键结论：
  - 不是简单吞异常；`fullStream` 仍保留原始失败语义，任务层会进入 `error`
  - 已修掉两类真实问题：
    - 附带 promise 的 rejected promise 外泄
    - 非枚举 `fullStream` 在对象展开时丢失
  - fresh 验证通过：
    - `packages/server npm run build`
    - `packages/server jest --runInBand --no-cache tests/ai/ai-model-execution.service.spec.ts tests/conversation/conversation-task.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
    - `root npm run smoke:server`
