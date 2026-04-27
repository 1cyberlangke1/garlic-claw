# Garlic Claw TODO

## 已完成摘要

- 真实 provider 基线已打通：
  - 默认 provider 不再回落到占位 key
  - `testConnection` 已改为真实联网
  - `smoke:server:real` 已支持按 provider 执行
  - `nvidia` 与修正后的 `ds2api` 真实 smoke 已可通过

## 当前边界

- 本轮只处理“所有调用 LLM 的路径覆盖、fake/real smoke 复用、测试产物自动清理”。
- 必须覆盖的 LLM owner：
  - `AiManagementService`
  - `ConversationMessagePlanningService`
  - `ContextGovernanceService`
  - `AiVisionService`
  - `RuntimeHostService`
  - `RuntimeHostSubagentRunnerService`
- `shared` 只放类型，不放逻辑。
- 不新增 `helper / helpers` 命名。
- 禁止 `any`。
- fake LLM 与 real LLM 的 smoke 路径必须复用同一套步骤编排，不能平行复制控制流。
- 测试创建的会话、provider、临时配置、临时目录、子代理记录必须自动清理。

## 当前阶段

- `[已完成] P1 覆盖矩阵`
  - `AiManagementService / ContextGovernanceService / AiVisionService / RuntimeHostService / RuntimeHostSubagentRunnerService / ConversationMessagePlanningService` 已补齐归属核对
  - 真实图片 provider 仍缺，因此 `AiVisionService` 保持 fake 覆盖
- `[已完成] P2 smoke 复用收口`
  - fake/real 已共用 provider 选择、连接测试、会话创建、文本对话、会话删除、上下文压缩步骤
  - `http-smoke.mjs` 的临时目录、会话与配置清理继续统一走 `finally`
- `[已完成] P3 覆盖补齐`
  - fake：已补齐 `context-compaction / runtime-host llm.generate-text / runtime-host llm.generate / subagent / vision fallback`
  - real：已补齐 `testConnection / chat / title / context-compaction`
- `[已完成] P4 fresh 验收`
  - `packages/server` 相关 Jest、root `smoke:server`、`nvidia` / `ds2api` 真实 smoke、`typecheck:server`、`lint` 已 fresh 通过
- `[已完成] P5 judge 复核`
  - 独立 judge 已给 `PASS`
  - fake/real smoke 复用、LLM owner 覆盖、自动清理三项已复核通过
