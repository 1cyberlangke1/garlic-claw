# Task Plan

## 2026-04-26 V3 体积治理

### 已执行

1. runtime-tools 主执行链重写
   - 删除旧混合主链
   - 收口到更短的 direct owner
2. conversation task 状态机重写
   - 删除旧事件/持久化样板
   - 保留同一套消息、metadata、tool 结果语义
3. filesystem / conversation owner 压缩
   - `runtime-host-filesystem-backend`
   - `runtime-host-conversation-record`
   - `conversation-message-planning`
   - `builtin-context-compaction`
4. 依赖与 owner 收口
   - 删除未使用依赖：`effect`、Swagger/Pino 组
   - 压缩：`runtime-shell-command-hints`
   - 重写：`runtime-host-subagent-store`
5. `uuidv7` 语义恢复
   - `plugin-sdk` Host 请求 ID 改回 `uuidv7`
   - conversation / message / runtime-permission / context-compaction / OpenAI 兼容流 ID 改回 `uuidv7`
   - 会话路由 UUID 校验收口为 v7，不保留旧数据兼容入口
6. `runtime-host-subagent-runner` 收口
   - 删除缺失 session 文件时按历史请求重建的兼容分支
   - 合并 write-back 目标解析与重复状态写入
   - 保留手动移除、恢复执行、write-back 语义不变
7. `plugin-persistence` 配置校验收口
   - 折叠 object/list/primitive 三段式校验
   - 保留 options、嵌套对象、list item 递归语义不变

### 当前结论

- 当前 `packages/server/src` 非空行数：`15761`
- 与 `<=15000` 目标还差：`761`
- `uuidv7` 恢复已完成定向 build + Jest，当前可继续回到大文件 owner 重写
- 下一步继续找 `350+` 行且有独立回归面的 owner 文件，优先：
  - `plugin-persistence.service.ts`
  - `runtime-host-subagent-runner.service.ts` 继续二次收口
  - `runtime-shell-command-hints.ts`

### 本轮补充

8. `runtime-host.service` 收口 host method 映射
   - 保留同名 Host API 语义
   - 删除重复映射样板与多余占行
9. `automation.service` 收口持久化与 cron 控制流
   - 不改单用户语义
   - 不改事件触发顺序、cron 恢复与日志写入
10. `runtime-shell-command-hints` 整文件重写
   - 删除旧扫描器实现，按现有 bash / PowerShell 回归样例重写
   - 保留静态提示、绝对路径识别、写入目标识别、联网提示语义
11. `P5/P6` 独立 judge
   - 结论：`PASS`
   - `P5` 可标记完成：关键 ID 与 v7 路由约束已恢复
   - `P6` 可标记完成：host/automation/hints 三处都是真收口，不是假 facade
