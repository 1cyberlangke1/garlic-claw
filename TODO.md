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

- `bash`：仍缺 OpenCode 那种 parser/AST 级静态分析；当前还是启发式 hints，复杂 quoting / 变量展开 / 命令替换 / 更深 PowerShell 语法还不够强。
- `read`：当前已具备缺失路径建议、分流和截断保护，但还缺 OpenCode 那层更成熟的 loaded-files / system-reminder 生态 owner。
- `glob / grep`：当前已有 base path、partial 与 skipped diagnostics，但搜索后处理、排序与 project-aware overlay 仍弱于 OpenCode。
- `write / edit`：当前已有 diff / freshness / post-write 第一轮增强，但写后诊断、格式化和更复杂 rewrite 纠偏仍未到 OpenCode 水平。
- runtime 抽象：第二 backend 已成立，但还缺“第三个生产级 backend 几乎不用回改工具层”的 judge 级证据。

## 当前主路线：文件工具与执行抽象对齐 OpenCode 到 100%

### 当前执行计划

- `P20-1 [已完成]` 压缩已完成阶段记录，只保留摘要与活跃路线。
- `P20-2 [已完成]` 前端 `builtin.runtime-tools` 已支持实时切换 shell backend，且未设置时回退全局 runtime route。
- `P20-3 [已完成]` `read` 已补最小 session loaded-files reminder：
  - 当前会基于 `RuntimeFileFreshnessService` 回显“本 session 近期还读取过这些文件”
  - 先补最小提醒，不引入新的 loaded-files 大系统
- `P20-4 [进行中]` 把 `bash` 从启发式静态预扫继续推进到更结构化分析，但不把 parser 复杂度抬回工具层。
- `P20-5 [进行中]` 继续补 `glob / grep / write / edit` 的成熟度差距，优先做低膨胀 owner 收口：
  - `write / edit` 当前已补共享 patch 预览渲染，不再只回数字 diff 摘要
  - freshness 写入阻塞当前会附带本 session 最近已读文件，减少“先 read 哪些文件”这类上下文丢失
  - `glob / grep` 当前已把截断提示收成共享 owner，并补隐藏结果数，继续压缩重复文案
  - `grep` 截断提示当前会按是否传入 `include` 生成 guidance，不再在未传 `include` 时回显误导提示
- `P20-6 [待开始]` 对 `G20-4 / G20-6` 做 fresh 验收后的独立 judge；judge 未 PASS 前，不把阶段标成已完成。

### 已完成阶段归档

- `G20-0` 差异基线冻结：已完成，详细矩阵与判断过程转入 `task_plan.md / findings.md`。
- `G20-1` Read 第一轮对齐：已完成，缺失路径建议、目录窗口、字节级截断与二进制/图片/PDF 分流已不再在本文件逐段展开。

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
  - `write / edit` 已稳定回带 `diff / lineCount / size / strategy` 等工程化摘要，diff owner 已下沉到 filesystem 层。
  - `edit` 已补 `context-aware / block-anchor` 等多行定位策略；匹配失败或多命中时会明确回显策略名、命中行号和下一步建议。
  - session 级 freshness、path lock 与 stale-read smoke 已落地；当前仍待继续补更强的写后增强与更细诊断。
  - `write / edit` 当前都会通过共享 owner 回显最小 `<patch>` 预览，不再只剩数字 diff 摘要。
  - 未先 `read` 就尝试覆盖已有文件时，freshness 拒绝信息当前会附带同 session 最近已读文件列表，便于模型直接回到正确上下文继续修改。

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
  - 已补 mtime 倒序、空结果 / 截断 totals、`partial + skippedEntries` 细分类。
  - `glob / grep` 当前都会把“搜索可能不完整”和“非文本文件被跳过”分开提示；`grep` 已补 `Base` 搜索基路径上下文。
  - `glob / grep` 的 skipped diagnostics 现已收成共享格式化 owner，工具层重复文案已压缩。
  - `glob / grep` 当前已把截断提示收成共享 owner；截断时会明确回显隐藏结果数，和 `other/opencode` 的结果摘要更接近。
  - `grep` 当前会按 `include` 是否存在生成更准确的 continuation hint，未传 `include` 时不再提示“Refine include”。
  - 仍待补更强的搜索后处理与 project-aware overlay。

### G20-4 Bash 结果质量与后处理补齐

- 状态：进行中
- 目标：
  - 把 `bash` 的结果渲染、输出治理、错误反馈、环境提示继续收口成正式 runtime owner。
  - 主聊天链路与 `builtin.runtime-tools` 必须复用同一渲染链。
  - 避免超长 `stdout/stderr` 与不稳定元信息无界进入模型上下文。
- 当前进展：
  - `runtime-command-output.ts`、`RuntimeCommandCaptureService` 与 `bashOutput.*` 配置已接通；截断时会稳定回显 `stdout_summary / stderr_summary / full_output_path`。
  - 主聊天链路与 `builtin.runtime-tools` 当前已共用同一条 bash 渲染与完整输出捕获 contract。
  - `bash` 公开说明已补 `workdir` 优先、网络策略三态和“不要用 bash 代替文件工具”的约束文案。
  - `bash` 当前已补 shell-specific chaining 提示：
    - bash 场景明确建议依赖顺序的命令使用 `&&`
    - Windows `native-shell` 明确提示不要用 `&&`，改用 PowerShell 条件写法
  - `just-bash / native-shell` 当前都已补更可执行的超时错误文案：超时后会明确提示“如非交互等待，请调大 timeout 重试”。
  - `bash` 已新增轻量静态预扫 owner：
    - 审批前会识别明显 `cd`
    - 会识别明显文件型命令
    - 会识别明显外部绝对路径并写入审批 metadata / summary
    - 已补 PowerShell 常见别名与 `filesystem::` provider 路径识别，Windows `native-shell` 下不再只认 bash 风格 token
    - 已补两类高价值误用提示：`workdir` 已提供却仍写 `cd`，以及 Windows `native-shell` 中误用 `&&`
    - 联网命令识别已并回同一静态预扫 owner，当前审批摘要也会直接提示“含联网命令”
    - 已补 PowerShell 原生联网命令识别：`iwr / irm / Invoke-WebRequest / Invoke-RestMethod`
    - 当同一条命令既联网又触碰外部绝对路径时，审批摘要会单独抬出这层组合风险
    - 已把“写入命令触碰外部绝对路径”从普通外部路径提示中单独抬出，并补 `-Path / -LiteralPath / -Destination` 这类 PowerShell 轻量参数位识别
    - 已补 `../`、`..\\`、`cd ..` 这类上级目录穿越倾向提示，审批摘要会单独回显相对上级路径预览
    - 已补 shell 重定向目标识别：`>` / `>>` / `1>` 这类写入外部绝对路径时，也会进入 `externalWritePaths` 与审批摘要
    - 已补 PowerShell `Out-File -FilePath` 写文件识别，这类常用外部写入现在也会进入 `externalWritePaths`
    - 已补联网命令输出文件参数识别：`curl -o / --output` 与 `Invoke-WebRequest -OutFile / -OutputFile` 当前也会进入 `externalWritePaths`，联网下载直写外部路径时不再只提示“联网 + 外部路径”
    - 已补常见下载/拷贝命令写入识别：`wget -O` 与 `scp ... <dest>` 当前也会进入 `externalWritePaths`，Unix 侧联网落盘提示更完整
    - 已把 `curl / wget / scp` 从粗粒度写命令名单收回到“命令名 + 关键参数位”识别，`curl --upload-file` 与 `scp <local> <remote>` 这类本地输入路径不再误报成外部写入
    - 已补 short flag 大小写边界：`wget -P` 继续视为目录输出路径，`wget -p` 不再被误判成写入外部路径
    - 已补 Unix long flag 大小写边界：`curl --output`、`wget --directory-prefix` 继续识别；`--Output`、`--Directory-Prefix` 这类大小写错误参数不再误报成写入外部路径
    - 已补 `git clone` 两类显式落盘目标识别：
      - `<repo> <dest>` 目标目录落到外部绝对路径时，会进入 `externalWritePaths / writesExternalPath`
      - `--separate-git-dir <path>` 落到外部绝对路径时，也会进入 `externalWritePaths / writesExternalPath`
    - 已补 `git init <path>` 显式目标目录识别：当初始化目录落到外部绝对路径时，也会进入 `externalWritePaths / writesExternalPath`
    - 已补 `git worktree add <path>` 显式目标目录识别：当 worktree 目录落到外部绝对路径时，也会进入 `externalWritePaths / writesExternalPath`
    - 已补 `git submodule add <repo> <path>` 显式目标目录识别：当 submodule 目录落到外部绝对路径时，也会进入 `externalWritePaths / writesExternalPath`
    - 已补 `git archive --output/-o <path>` 显式输出文件识别：当输出文件落到外部绝对路径时，也会进入 `externalWritePaths / writesExternalPath`
    - 已补 `git bundle create <file>` 显式输出文件识别：当 bundle 文件落到外部绝对路径时，也会进入 `externalWritePaths / writesExternalPath`
    - 已补 `git format-patch -o/--output-directory <dir>` 显式输出目录识别：当输出目录落到外部绝对路径时，也会进入 `externalWritePaths / writesExternalPath`
    - 已把 `tar` 从粗粒度写命令收成模式化识别：
      - 创建归档时只把 `-f/--file` 识别为输出文件
      - 解包时只把 `-C/--directory` 识别为输出目录
      - 不再把归档输入文件或源文件路径误报成 `externalWritePaths`
    - 已把 `cp / mv` 从粗粒度写命令收成“最后一个 positional token 为目标路径”：
      - `cp ~/source.txt /tmp/copied.txt` 当前只把 `/tmp/copied.txt` 记为 `externalWritePaths`
      - `mv ~/source.txt /tmp/moved.txt` 当前只把 `/tmp/moved.txt` 记为 `externalWritePaths`
    - 已把 `Copy-Item / Move-Item` 从通用 PowerShell 路径参数收成“优先认 `-Destination`，否则回退到最后一个 positional token”为目标路径：
      - `Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt` 当前只把目标路径记为 `externalWritePaths`
      - `Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt` 当前只把目标路径记为 `externalWritePaths`
- 下一步重点：
  - 继续看是否要把更多 structured metadata 下沉为稳定 contract
  - 把当前轻量静态预扫继续推进到更结构化的 shell 语法分析，但不把 parser 复杂度重新抬回工具层
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
  - `ProjectWorktreePostWriteService + RuntimeFilesystemPostWriteService` 已形成正式 overlay 链；overlay 缺席时会回退为空结果，不需要兼容壳。
  - `write / edit` 当前已正式带上 `postWrite.formatting / postWrite.diagnostics`，第一轮增强覆盖 `.json` pretty format + JS/TS 语法诊断。
  - 工具输出会显式回显 `Formatting` 与 `Diagnostics` 摘要，后续增强继续沿 post-write owner 追加。

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
  - `RuntimeBackendRoutingService` 与 `runtime-visible-path.ts` 已把 backend 路由和可见路径真相收口成单点 owner。
  - `RuntimeFilesystemBackendService`、`RuntimeToolBackendService` 与 `RuntimeHostRuntimeToolService` 当前都已改成“单次调用只固定一次 backend kind，再贯穿 input / access / review / execute”。
  - 当前剩余重点不是继续改工具层，而是继续验证中层 prepared contract 是否已经足够稳定。
  - `bash / read / glob / grep / write / edit` 当前已不再在工具 `execute()` 里重复决议 backend kind。
  - `native-shell` 已作为真实第二 shell backend 落地：
    - Windows 宿主进程走 PowerShell
    - Linux / WSL 宿主进程走 bash
  - `packages/server/scripts/http-smoke.mjs` 已补 shell-aware 命令模板，Windows `native-shell` 不再被 bash-only smoke 误伤。
  - 前端实时切换 shell backend 已并回 `builtin.runtime-tools` 现有配置链：
    - `shellBackend` 当前只在用户显式选择时覆盖 runtime shell route
    - 未设置时继续跟随后端全局默认路由，不会被 schema 默认值误压回 `just-bash`
  - 2026-04-22 已重新拿到 fresh 证据：
    - Windows：默认 `smoke:server`、`GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell smoke:server`、`smoke:web-ui`
    - WSL 内部目录：`runtime-native-shell` 定向 jest、real native-shell route 定向 jest、`GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell smoke:server`

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
