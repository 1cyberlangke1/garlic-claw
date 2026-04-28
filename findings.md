# Findings

## opencode task vs Garlic Claw 子代理

- opencode: `task` 工具 → 创建新 session（带 parentID）→ 结果嵌入聊天流 → 支持 task_id 恢复 → abort 自动取消
- Garlic Claw: `subagent` 工具 → 创建独立 DB record → 结果写入独立存储 → 前端管理页面展示"健康状态"（假的）
- 核心差异：opencode 的 task 是 disposable session，Garlic Claw 的是 persisted governance object

## 假健康检查
- `readPluginHealth()` 对本地插件只返回 `{ ok: plugin.connected }`（永远 true）
- `failureCount` 是 0/1 不是累计值
- `lastCheckedAt` 每次查询都是"现在"
- 前端"健康状态健康""最后检查尚未检查""最近错误无"完全无意义
