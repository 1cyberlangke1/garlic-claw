# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成阶段统一压成摘要；细节证据、失败记录、判断过程继续放 `task_plan.md / progress.md / findings.md`。

## 规范化目标

- 执行层文件工具最终目标不是“名字接近 OpenCode”，而是：
  - 工具使用体验接近 `other/opencode`
  - 工具结果质量、错误提示、可恢复性、诊断反馈接近 `other/opencode`
  - 中间抽象足够稳定，后续适配更多执行后端时不需要回改工具层 owner
- 不保留兼容壳，不接受“旧 owner 换目录继续活着”。
- `bash / read / glob / grep / write / edit` 的公开语义继续以“当前 backend 可见路径”为主，不反向绑死到单个 project/worktree；但能力成熟度要对齐 OpenCode 水平。

## 已完成摘要

- `packages/shared` 已收口为 type-only，共享契约已完成一轮整理。
- 主聊天链路、provider 自定义扩展块、非流式/流式统一执行、历史压缩、display 消息、聊天刷新链、命令提示、事件日志、前端主要治理页面都已打通，并通过 fresh 验收。
- persona 已改为目录化存储；插件配置协议已收口为声明式 schema；远程插件静态接入 key 与元数据缓存已完成一轮基础落地。
- `skill / todo / webfetch / invalid / subagent(session 化)` 已完成一轮对齐 OpenCode 的公开语义收口。
- `bash / read / glob / grep / write / edit` 已完成一轮 runtime 抽象与插件化：
  - backend 可见路径语义已收口
  - runtime 审批链与 yolo 模式已落地
  - `builtin.runtime-tools` 已接管这 6 个工具
  - `RuntimeSessionEnvironment / RuntimeFilesystemBackend / RuntimeCommandBackend` 三层 owner 已落地
  - 第二 shell/filesystem backend 的真路由测试已通过
  - Windows 与 WSL 内部目录 fresh 验收、独立 judge 均已通过
- `bash` 输出后处理 owner 已开始落地：
  - `runtime-command-output.ts` 已成为主聊天与 `builtin.runtime-tools` 的共用渲染层
  - `bashOutput.maxLines / maxBytes / showTruncationDetails` 已接到插件配置 UI
  - `smoke:server / smoke:web-ui / lint` 已重新通过

## 当前判断

- 对齐 OpenCode 的公开工具语义：约 `70%`
- 对齐 OpenCode 的工具成熟度与执行体验：约 `50% ~ 60%`
- 对齐“方便迁移到新执行后端”的抽象质量：约 `65% ~ 70%`

当前主要短板：

- `read / write / edit / glob / grep` 仍偏基础版，离 OpenCode 的文件工具成熟度还有明显差距。
- `bash` 还缺更强的输出治理、环境语义说明、诊断反馈与执行后处理。
- 当前 runtime 中层方向正确，但还没有稳定到“接第二个、第三个生产级执行后端时几乎不用回改工具层”。

## 当前主路线：文件工具与执行抽象对齐 OpenCode 到 100%

### G20-0 差异基线冻结

- 状态：已完成
- 目标：
  - 为 `bash / read / glob / grep / write / edit` 逐个建立 Garlic Claw vs OpenCode 差异表。
  - 差异必须拆成三层：
    - 公开语义
    - 结果质量 / 使用体验
    - 中间 owner / 抽象边界
- 验收：
  - 每个工具都给出“已对齐 / 故意不对齐 / 必须补齐”的明确矩阵。
  - `TODO.md` 与 `task_plan.md` 同步固化优先级。

### G20-1 Read 对齐到 OpenCode 水平

- 状态：已完成
- 目标：
  - 把 `read` 提升到接近 OpenCode 的成熟度，而不是只做文本切片。
  - 重点补齐：
    - 缺失路径猜测与更友好的 miss 提示
    - 更明确的目录读取语义与 offset/limit 提示
    - 文件读取的字节级保护与更稳定的截断文案
    - 图片 / PDF / 二进制文件分流策略
    - 为未来 instruction/system-reminder/loaded-files owner 预留稳定接口
- 验收：
  - `read` 有定向测试覆盖 miss / directory / text / binary / image-or-pdf 分支
  - 输出质量与 OpenCode 对齐到“模型可直接继续操作”的水平
- 已完成摘要：
  - 已补缺失路径建议、目录窗口提示、字节级截断保护。
  - 已补 `image / pdf / binary / file / directory` 分流与定向测试。

### G20-2 Write / Edit 对齐到 OpenCode 水平

- 状态：进行中
- 目标：
  - 把 `write / edit` 从“基础文件改写”提升到“工程化修改工具”。
  - 重点补齐：
    - 统一 diff owner，不再只回 created/occurrences
    - 更强的 edit 匹配与替换修正策略
    - line ending / formatting / rewrite 后一致性
    - 文件 freshness / time lock / rewrite race 保护
    - 写入后诊断反馈入口
- 验收：
  - `write / edit` 输出至少能稳定返回修改摘要与 diff 元数据
  - 多位置匹配、空文件创建、覆盖写、行尾差异、重复替换都有定向测试
- 当前进展：
  - `write` 已回带 `lineCount / size / diff` 摘要，`edit` 已回带 `strategy / diff` 摘要。
  - runtime 已新增 `runtime-file-diff.ts`，把 diff metadata 继续收口在 filesystem owner。
  - `trimmed-boundary / indentation-flexible` 已补独立回归样例，并修正策略顺序为“更具体优先、更宽松靠后”。
  - `edit` 当前已补 `context-aware / block-anchor` 多行定位策略；匹配失败或多命中时会明确回显策略名、命中行号和下一步建议，不再只给笼统报错。
  - 已补 session 级 file freshness owner；`write / edit` 现已要求“已有文件先 read，再写入时校验 mtime/size 未变”，`edit` 还会按解析后的 virtual path 串行加锁。
  - `smoke:server` 已补 stale-read 拒绝分支，端到端会验证“文件在读取后被外部改动时，edit 会失败并要求重新读取”。

### G20-3 Glob / Grep 对齐到 OpenCode 水平

- 状态：进行中
- 目标：
  - 把 `glob / grep` 从基础枚举提升到更接近 OpenCode 的搜索体验。
  - 重点补齐：
    - 更成熟的排序和截断策略
    - 更稳定的 `path / include / pattern` 语义
    - 更细的结果统计与结果上限说明
    - 文件不可达、部分失败、二进制跳过等诊断
    - 后端层尽量复用高性能搜索能力，不把搜索 owner 重新抬回工具层
- 验收：
  - `glob / grep` 都有“结果为空 / 有结果 / 截断 / 局部失败”定向测试
  - 输出结构与 OpenCode 接近到“模型可直接据此继续 read/edit/write”的水平
- 当前进展：
  - 已补 mtime 倒序、partial 语义、媒体/二进制跳过对齐。
  - 已补空结果与截断时的更明确 totals 文案。
  - 已补 `partial + skippedPaths` 诊断，工具输出会显式提示被跳过的不可达路径。
  - 已补 `skippedEntries` 细分类：`glob` 会区分不可达路径，`grep` 会区分不可达 / 不可读 / 二进制跳过。
  - `glob / grep` 当前都会把“搜索可能不完整”和“非文本文件被跳过”分开提示，不再只回一条笼统 skipped path 文案。
  - 仍待补 formatting / diagnostics overlay。

### G20-4 Bash 结果质量与后处理补齐

- 状态：进行中
- 目标：
  - 把 `bash` 的结果渲染、输出治理、错误反馈、环境提示继续收口成正式 runtime owner。
  - 主聊天链路与 `builtin.runtime-tools` 必须复用同一渲染链。
  - 避免超长 `stdout/stderr` 与不稳定元信息无界进入模型上下文。
- 当前进展：
  - 已新增 `runtime-command-output.ts`
  - 已接通 `bashOutput.maxLines / maxBytes / showTruncationDetails`
  - 已补 `stdout_summary / stderr_summary` 与更具体的 `exit_code` 诊断。
  - 已新增 `RuntimeCommandCaptureService`，stdout/stderr 超过默认渲染阈值时会把完整输出写到 session 可见路径下的 `/.garlic-claw/runtime-command-output/...`。
  - `RuntimeCommandService`、主聊天链路和 `builtin.runtime-tools` 当前都已共用这条完整输出捕获 contract；渲染被截断时会额外回显 `full_output_path`。
  - `bash` 公开说明已继续补齐 `workdir` 优先与“不要用 bash 代替文件工具”的约束文案。
  - 已通过 `smoke:server / smoke:web-ui / lint`
- 下一步重点：
  - 继续看是否要把更多 structured metadata 下沉为稳定 contract
  - 继续补与执行后端能力矩阵一致的环境提示文案
- 验收：
  - `bash` 至少一组渲染/截断/错误分支定向测试
  - 主聊天与 `builtin.runtime-tools` 的结果文本完全共用

### G20-5 诊断与项目增强 owner 收口

- 状态：进行中
- 目标：
  - 把 OpenCode 文件工具里“有工程上下文时的额外价值”拆成独立 owner，而不是写死进 runtime 主链。
  - 第一轮重点：
    - diff metadata owner
    - diagnostics owner
    - formatting owner
    - file freshness / watch / touch owner
  - 明确哪些能力属于可选 overlay，哪些属于 runtime 主链。
- 验收：
  - 没有 project/worktree overlay 时，runtime 文件工具仍可工作
  - 有 overlay 时，工具结果能额外带上 diagnostics / formatting / metadata
- 当前进展：
  - 已新增 `ProjectWorktreePostWriteService`，作为 overlay 侧正式 `post-write` owner。
  - 已新增 `RuntimeFilesystemPostWriteService`，由 runtime 主链统一聚合 post-write provider。
  - `RuntimeHostFilesystemBackendService` 当前只依赖 runtime `post-write` owner；overlay 缺席时保持原行为，不需要兼容壳。
  - `write / edit` 结果当前已正式带上 `postWrite.formatting / postWrite.diagnostics`。
  - 第一轮已落地的增强能力：
    - `.json` 自动 pretty format
    - `.json / .js / .jsx / .ts / .tsx / .mjs / .cjs` 语法诊断
  - 工具输出当前会显式回显：
    - `Formatting: ...`
    - `Diagnostics: none | N issue(s)`
    - `<diagnostics file="..."> ... </diagnostics>`

### G20-6 执行后端抽象继续压实

- 状态：进行中
- 目标：
  - 把当前 runtime 中层从“已能注册第二 backend”推进到“便于挂更多生产级后端”。
  - 重点补齐：
    - command/filesystem/session 三层契约的稳定输入输出
    - 后处理 owner 与 backend 原始结果解耦
    - 权限 ask/yolo 与 backend capability 决议彻底解耦
    - 工具层不再持有任何 backend 私有假设
- 验收：
  - 新增一个生产风格的第二 backend 试点时，不需要回改 `read / glob / grep / write / edit / bash` 工具服务
  - 独立 judge 明确确认“不是只靠 mock backend 的假迁移性”
- 当前进展：
  - 已新增 `RuntimeBackendRoutingService`，把 shell/filesystem backend 路由的环境变量读取收口成单点。
  - `RuntimeFilesystemBackendService` 当前已不再持有“configured filesystem backend”这条隐式 owner。
  - `RuntimeToolBackendService` 不再自己直接读取 shell/filesystem 路由环境变量，而是统一消费 runtime 路由 owner。
  - 当前 `bash` 权限审查链、filesystem 实际执行链与 backend descriptor 决议，已继续共用同一条 runtime 路由真相。
  - 已新增 `runtime-visible-path.ts`，把 backend 可见路径的规范化、拼接与越界校验收口成单个 runtime 领域模块。
  - `RuntimeJustBashService` 与 `RuntimeHostFilesystemBackendService` 当前已共用同一套 visible path 解析语义。
  - `read / glob / grep / write / edit` 当前都会先显式解析 filesystem backend kind，再把同一个 kind 传给：
    - descriptor / 审批链
    - freshness 读戳 / 锁
    - 真正的 filesystem backend 执行
  - `RuntimeHostRuntimeToolService` 当前也已改成“单次 host 调用只决议一次 backend kind”：
    - host facade 会先固定 backend kind
    - 再把同一个 kind 传给 `readInput / readRuntimeAccess / execute`
    - `reviewAccess()` 也改为直接消费 access 上显式携带的 `backendKind`
  - `bash / read / glob / grep / write / edit` 当前已不再在工具 `execute()` 里重复决议 backend kind。

### G20-7 端到端验收与独立 judge

- 状态：待开始
- 目标：
  - 对每一段都执行 fresh 验收，不接受“局部单测通过但 smoke 漏洞仍在”。
  - 当前固定验收链：
    - 受影响定向 jest / vitest
    - `packages/shared` build
    - `packages/plugin-sdk` build
    - `packages/server` build
    - root `npm run lint`
    - root `npm run smoke:server`
    - root `npm run smoke:web-ui`
  - 每个大阶段结束前都必须做独立 judge。
- 验收：
  - judge 明确 PASS
  - fresh 验收命令全部新鲜通过
  - `TODO.md / task_plan.md / progress.md / findings.md` 全部同步

## 其他未完成路线摘要

这些路线仍有效，但不抢当前主路线优先级：

- `R14` 远程插件静态 key 与元数据缓存：
  - 目标不变：远程接入主语义改成静态 key，静态元数据缓存与运行态状态分层
  - 当前状态：待开始
- 其他历史已完成路线与中间判断：
  - 不再保留在本文件逐段展开
  - 需要追溯时看 `task_plan.md / progress.md / findings.md`

## 固定约束

- 不保留旧兼容层，不接受把旧 owner 换个位置继续保留。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 准备把阶段标记为已完成时，必须先做独立 judge 复核。
