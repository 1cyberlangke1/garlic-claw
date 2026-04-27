# Garlic Claw TODO

## 已完成摘要

- 真实 provider 基线已打通：
  - 默认 provider 不再回落到占位 key
  - `testConnection` 已改为真实联网
  - `smoke:server:real` 已支持按 provider 执行
  - `nvidia` 与修正后的 `ds2api` 真实 smoke 已可通过
- CRUD 覆盖已补齐：
  - `AiController` 的 provider/model/config 相关 HTTP 方法已补齐缺失单测
  - `http-smoke.mjs` 的既有删除链路已补删后 404 / 列表不可见校验
  - `/compact` fake smoke 已改为稳定断言，专用 summary 冒烟仍单独校验模型请求

## 已完成阶段摘要

- `P1 ~ P5` 已完成：
  - 所有调用 LLM 的核心 owner 已完成覆盖矩阵核对
  - fake/real smoke 已复用同一套步骤编排
  - 测试产物自动清理已补齐
  - fresh 验收与独立 judge 已通过
- `runtime/workspace 路径收口 + tmp 清理` 已完成：
  - runtime 工作目录统一落到仓库根 `workspace/`
  - server 默认运行态存储不再继续写入 `packages/server/tmp`
  - `packages/server/tmp` 历史垃圾已删除
  - Jest 临时产物已改为 `workspace/test-artifacts/server/process-<pid>`，并接入 `globalSetup/globalTeardown`
  - `http-smoke` 临时目录已在脚本结束后自动删除
- `subagent 可见性 + 空工作目录回收` 已完成：
  - `subagentType: "default"` 已映射到 `general`
  - 无效 `sessionId` 已按新会话处理，且不会绕过容量限制
  - Subagent 页面已同时展示 `同步 / 后台` 两类记录
  - 空的 `workspace/runtime-workspaces/<session>` 会在工具调用后自动回收

## 当前边界

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
