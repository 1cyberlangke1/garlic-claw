# Findings

## 2026-04-26 V3 体积治理

- 体积下降最快的做法仍然是 owner 级重写，不是零散删行。
  - 这轮 6 刀里，真正有收益的是把主执行链压成更短的稳定路径。
  - 只换文件位置、只拆 helper、只补少量格式化，几乎不出净减。

- 目前最有效的压缩对象有两个特征：
  - 对外 contract 稳定，内部展开很多，例如 `runtime-tools-plugin-runtime.ts`
  - 有独立 spec 能快速回归，例如 `conversation-task`、`filesystem backend`

- 当前阶段的边界仍然成立：
  - 不回头扩 runtime-tools 功能
  - 继续围绕 `packages/server/src <= 15000` 做大块净减

- 未使用依赖也值得顺手清掉：
  - 根包 `effect` 无任何源码入口
  - `server` 里的 Swagger / Pino 组当前没有 bootstrap 或模块入口

- `uuidv7` 不能按“未引用依赖”简单删除：
  - 当前单用户主线虽然不再走旧 Prisma 多实体写入，但 conversation / message / runtime-permission / plugin host request 这些关键 ID 仍然有时间有序语义
  - 只把实现退成 `randomUUID()` 会丢失排序语义，也会让后续 HTTP v7 校验无法收口
  - 这类基础语义应直接在 owner 内恢复，不应塞回 `shared`

- `subagent-runner` 里最先该删的是历史兼容恢复分支：
  - 缺失 session 文件时按旧记录即时重建，会让主执行链多一套隐式恢复语义
  - 现有测试与当前数据写入路径都不依赖它，删掉后 build 与 runner/host 回归仍通过
  - 这类“数据缺口时现场补造”分支比普通重复代码更容易掩盖真实状态问题

- `plugin-persistence` 的校验树可以继续压，但要守住三件事：
  - `options` 命中校验不能丢
  - object/list 的递归路径标签不能漂
  - schema 缺口必须继续报“未知配置字段”，不能静默吞掉

- 当前剩余差距：
  - `packages/server/src` 当前 `15761`
  - 距离 `<=15000` 还差 `761`

- `runtime-host.service` 这类 method map 文件压缩时，要避免把子映射错误标成完整 `Record`：
  - `Object.fromEntries(...) as Record<PluginHostMethod, ...>` 会让 TypeScript 认为后续 spread 一定覆盖全部 host method
  - 正确边界仍应是 `Partial<Record<PluginHostMethod, ...>>`
  - 这类问题会在 build 阶段直接暴露，修复后不影响运行语义

- `automation.service` 还有可继续压缩的空间，但当前最安全的净减段在：
  - 持久化 JSON 序列化样板
  - cron 控制流的错误/日志分支
  - 单用户迁移状态读取

- `runtime-shell-command-hints` 可以整文件重写，但必须守住 `bash-tool.service.spec.ts` 的高密度回归面：
  - 当前重写版已经通过 124 个 shell hint 回归
  - 这类 owner 可以删旧实现，但不能只看 build；必须直接跑 bash hint spec
  - 重写后还要继续压非空行，否则容易出现“行为对了但体积反弹”的假进度

- 独立 judge 已确认 `P5/P6` 可收口：
  - `P5`：关键 ID 已恢复为 `uuidv7`，HTTP conversation/message 路由已收口为 v7 校验
  - `P6`：`runtime-host.service`、`automation.service`、`runtime-shell-command-hints.ts` 都是真 owner 收口
  - 非阻塞残余只剩上层 `V3 <= 15000` 尚未完成
