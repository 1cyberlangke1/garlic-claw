# Garlic Claw TODO

## 当前边界

- 这轮只处理“流式对话失败不应导致后端退出”。
- 目标：
  - provider 鉴权失败或流中途报错时，后端进程保持存活
  - 对话 SSE 语义稳定，前端只收到本轮失败，不出现整站 `ECONNREFUSED`
  - `smoke:server` 要覆盖并验证这条链路
- 不扩到 `conversation-title / context-compaction / runtime-tools / subagent / plugin-pc / memory`。
- `shared` 只放类型，不放逻辑。
- 不新增 `helper / helpers` 命名。
- 禁止 `any`。

## 当前阶段

- 当前无进行中阶段。
