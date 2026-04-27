# Findings

## 2026-04-27 流错误稳定性与 smoke 修复

- 用户现场的第一层根因不是前端，也不是 vite 代理，而是 provider 返回 `401 invalid x-api-key`。
- 真正要修的 owner 在后端流执行链：
  - 流对象上的附带 promise 可能 reject
  - 如果这些 promise 被裸暴露给上层，会演变成未处理 rejection 或 `NoOutputGeneratedError`
- 现有修法采用双层防守：
  - `AiModelExecutionService` 规范化 SDK 返回流
  - `ConversationTaskService` 再做一次安全包装，避免其他流来源绕过
- 当前待确认点：
  - 只剩独立 judge 复核
- 新发现：
  - `streamText()` 的返回对象上，`fullStream` 不是可靠的普通可枚举属性
  - `normalizeStreamResult()` 如果直接用 `{ ...result }`，会把 `fullStream` 丢掉
  - 丢失后的表征不是进程退出，而是：
    - SSE 只有 `message-start`
    - 随后进入 `status:error`
    - 错误为 `Cannot read properties of undefined (reading 'Symbol(Symbol.asyncIterator)')`
  - 因此这轮除了修用户现场的 rejected promise 链，还顺带修掉了 smoke 主链里的流对象复制错误
