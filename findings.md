# Findings

## 2026-04-27 记忆纯插件化

- 自动加载机制没有消失；问题在于 builtin registry 目前是空的。
- `memory` 当前并不是纯插件：
  - 送模前记忆注入仍在 `ContextGovernanceService`
  - 真正的记忆读写底座在 `RuntimeHostUserContextService`
- 这轮最小边界是：
  - 保留 `RuntimeHostUserContextService` 作为 host 存储 owner
  - 恢复 `builtin.memory-tools` 和 `builtin.memory-context` 作为插件 owner
  - 删除内部记忆注入与内部配置 section，避免双 owner
- `memory` 纯插件化不要求把底层存储也插件化：
  - `RuntimeHostUserContextService` 继续负责 host `memory.save / memory.search`
  - 插件只通过 host facade 调用它
  - 这样 owner 清晰，也不会把存储层重复搬一份
- `ContextGovernanceSettingsService` 去掉 `memoryContext` 后，前端上下文治理面板会自动只剩标题与压缩配置：
  - 不需要再加兼容层
  - 旧配置文件里的 `memoryContext` 会被忽略
- `smoke:http` 原来直接断言 `config.values.memoryContext.limit`，这会把旧 owner 假设写死在验收里：
  - 迁移后必须同步改 smoke
  - 新断言应确认上下文治理配置里不再出现 `memoryContext`
- 独立 judge 已给 `PASS`：
  - 当前阻塞已不存在
  - 剩余风险只是不再写回配置时，旧磁盘文件里的 `memoryContext` 字段可能继续物理存在，但运行时已忽略
