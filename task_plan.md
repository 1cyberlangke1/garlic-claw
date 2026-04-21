# 2026-04-19 Skill 对齐 OpenCode

## 目标

- 把当前 skill 的公开语义和运行时主链对齐到 `other/opencode` 的 skill 设计。
- 避免继续把 skill 做成“会话常驻提示资源 + 专用治理页 + 专用工具源”的另一套系统，如果这些语义不属于目标设计则要收掉。
- 保持与现有 persona、插件、MCP、命令系统的边界清晰，不新增兼容层。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| S17-1 | 已完成 | 摸底当前 skill 实现与 `other/opencode` skill 主链差异，明确要保留和要删除的语义 |
| S17-2 | 已完成 | 形成对齐方案，确认 shared / server / web 的收敛边界 |
| S17-3 | 已完成 | 按确认方案改造 skill 发现、运行时注入、命令入口与前端界面 |
| S17-4 | 已完成 | 补测试、fresh 验收与独立 judge |
| S17-5 | 已完成 | 把 `subagent` 公开语义从 `profileId + taskId` 收口到 `subagentType + sessionId`，并把 `todo` owner 改成 session 级资源 |

## 2026-04-20 天气 skill 收口

## 目标

- 删除仓库当前旧 skill 目录，只保留真实要用的天气查询 skill。
- 把仓库默认天气查询从 `mcp/servers/weather-server.json` 收回到 `skills/weather-query/`。
- 保持 skill 继续是 OpenCode 风格“按需加载的提示资产”，不重新引入专用 skill 执行器。
- 补齐天气 skill 的脚本资产识别与代码执行验证。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| W17-1 | 已完成 | 同步规划文件，确认旧 skill 删除范围与天气 skill 设计 |
| W17-2 | 已完成 | 删除旧 skill、落 `skills/weather-query/` 并移除默认天气 MCP |
| W17-3 | 已完成 | 更新 server / web 测试与 smoke，补脚本资产和代码执行验证 |
| W17-4 | 已完成 | 执行 fresh 验收并确认无测试残留 |

## 当前决定

- 不保留 `automation-designer / planner / plugin-operator` 这 3 个旧 skill。
- 天气能力改成仓库内一个正式 skill：`skills/weather-query/`。
- 不给 skill 恢复专用执行通道；天气查询继续通过现有通用工具完成。
- 当前 `bash` 工具只允许在 `/workspace` 内执行，因此天气 skill 不直接假设能从仓库路径原地执行脚本。
- 天气 skill 会同时提供：
  - 面向模型的 markdown 指令
  - 仓库内可维护的 `scripts/weather.js` 资产
- 代码执行验证分两层：
  - skill 资产被识别为 `executable`
  - 现有 `bash` 执行链与 smoke 继续提供稳定代码执行证据

## 当前摸底

- 仓库当前真实 `skills/` 目录只有：
  - `skills/automation-designer`
  - `skills/planner`
  - `skills/plugin-operator`
- 当前“查询天气”实际是默认 MCP：
  - `mcp/servers/weather-server.json`
- skill 系统当前只扫描仓库根 `skills/` 下的 `SKILL.md`，这和本轮收口方向一致。
- `bash` 当前工作目录限制在 `/workspace`，不能直接把仓库 skill 目录当执行 cwd 使用。

## 2026-04-20 执行层 runtime 规划（just-bash 起步）

## 目标

- 为后续执行环境相关能力建立正式 runtime 抽象，不再把执行后端细节直接揉进工具层。
- 首个执行后端采用 `just-bash`，但公开 contract 必须支持后续继续挂载其他执行后端。
- 当前首个 `just-bash` 后端以“挂载到指定工作区目录的文件系统”作为真相源，不走纯内存环境；这不是所有 runtime 后端的统一硬约束。
- 第一版默认允许网络等完整能力，但能力策略必须是 runtime 自己的正式 owner。
- 先把计划和风险写清楚，这一轮不开始 runtime 实现代码。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R17-1 | 已完成 | 定义 runtime 驱动接口、session/workspace/能力策略 contract，明确多后端抽象 |
| R17-2 | 已完成 | 落首个 `just-bash` 适配器，明确 exec 生命周期与错误模型 |
| R17-3 | 已完成 | 设计挂载目录、工作区复制/映射、持久文件真相源与清理策略 |
| R17-4 | 已完成 | `subagent` 公开语义继续向 OpenCode `task` 收口，公开主键固定为 `sessionId` |
| R17-5 | 已完成 | 复核 `todo / task / bash` 与 OpenCode 的公开语义，差异表与收敛结果已补齐 |
| R17-6 | 已完成 | 为本机 shell / WSL / 容器等后续执行后端预留稳定扩展点 |
| R17-7 | 已完成 | 做 Windows / WSL 跨平台验证，并补 `workdir / timeout / tar` 等命令面证据 |
| R17-8 | 已完成 | 把工具主语义从固定 `/workspace` 收口到“当前 backend 可见路径” |
| R17-9 | 已完成 | 补 runtime 审批模式与 yolo 开关 |
| R17-12 | 已完成 | 增强 runtime host contract，并把 `bash / read / glob / grep / write / edit` 收成单个本地插件 |

## R17-5 差异表

| 工具 | OpenCode 主语义 | 当前收口结果 | 保留差异 |
| --- | --- | --- | --- |
| `todo` | session 级全量覆盖写入 | 已对齐为当前 session 全量覆盖，不走增量 patch | 无额外公开差异 |
| `task` | 以 session 续跑，结果面向模型只给最小必要信息 | 已收口为 `sessionId + <task_result>`，不再回送 `provider/model` | 工具名保持项目风格 `task`，不改成其他别名 |
| `bash` | 公开的是 shell 工作区语义，而不是宿主实现细节 | 已收口为“session 工作区持续、shell 状态不持续、自包含命令” | 当前后端仍不提供持久 shell 进程状态；这是现阶段 runtime 边界，不再向模型暴露宿主直挂或审批实现细节 |

## 当前决定

- 公开工具语义仍使用 `bash`，不把 `just-bash` 直接作为对模型暴露的工具名。
- `just-bash` 只是首个执行后端，不应反向定义整个 runtime 接口。
- 通用执行工具的主语义不再绑定某个代码仓库，也不再绑定单个固定 `/workspace` 根。
- 对工具来说，稳定真相应是“当前 backend 允许看见哪些路径、允许做哪些能力操作”。
- “项目 / worktree”后续如有需要，只能作为附加视图或特定 backend 能力，不能反向定义通用环境工具。
- runtime 至少要拆出这些 owner：
  - 驱动接口
  - 工作区挂载配置
  - 能力策略
  - native 工具接线
- runtime 需要提供显式审批模式开关；yolo 模式属于 runtime 配置，不属于单个工具特判。
- 对 `just-bash` 后端，工作区必须是显式指定目录，执行产生的文件要落到这个目录语义上；其他后端后续可按各自能力模型定义是否需要同样约束。
- 默认能力按用户要求允许网络访问等完整能力，但后续若要限权，必须改 runtime 能力策略，不在工具层散落特判。
- 当前先不决定“Windows 直接跑 `just-bash`”就是最终方案；先把它视为待验证对象。
- 第一段实现改成“系统路径留在内存层，`/workspace` 直挂宿主 session 工作区”模型：
  - `just-bash` 仍然是首个执行后端
  - `/bin`、`/usr/bin`、`/proc` 这类系统路径仍由内存 base 承接
  - `/workspace` 通过宿主自建 mounted filesystem 直挂到真实目录
  - 不直接使用当前 Windows 下不稳定的 `ReadWriteFs` 路径解析
- 这轮优先把这些东西打通：
  - runtime 执行接口
  - session 工作区目录
  - native `bash` 工具
  - 实际 smoke 里的写入后再读取验证

## 当前摸底

- `just-bash@2.14.2` 已装入 `packages/server`，可作为后续 runtime 试验基座。
- 已确认 `just-bash` 的关键导出包括：
  - `Bash`
  - `InMemoryFs`
  - `OverlayFs`
  - `ReadWriteFs`
  - `MountableFs`
  - `defineCommand`
- 已确认 `exec()` 的关键语义：
  - 多次执行共享文件系统状态
  - 不共享 shell 进程状态
  - 因此 `cwd / export / shell function` 之类状态不会跨次保留
- 已确认它支持 `curl`，但需要显式打开 `network`。
- 已观察到 Windows 下真实目录挂载有明显风险：
  - `ReadWriteFs` / `MountableFs` 对 `/workspace` 这类虚拟绝对路径和 Windows 宿主路径的映射不稳定
  - 出现过 `resolves outside sandbox` 与真实文件找不到的问题
- 因此这轮实现前必须把“跨平台验证”当成正式阶段，而不是默认假设。
- 当前第一段实现策略：
  - 使用 `MountableFs`
  - base 仍为 `InMemoryFs`
  - `/workspace` 通过 `RuntimeMountedWorkspaceFileSystem` 直挂宿主目录
  - 这样保留真实工作区目录语义，同时绕开 `ReadWriteFs` 现有的 Windows 路径问题
- 当前 ask 审批策略：
  - runtime 能力策略正式收口为 `allow / ask / deny`
  - `just-bash` 当前对 `shellExecution / networkAccess` 走 `ask`
  - pending request 以 conversation 为 owner，支持 `once / always / reject`
  - 聊天 SSE、`GET pending`、`POST reply` 和前端聊天页审批面板都已接通
  - `always` 批准记录当前已持久化到 conversation store，服务重启后会继续生效
  - fresh `smoke:server` 已补真实链路：同一会话里首次 `bash` 调用 `always` 批准后，后续 `bash` 调用不再二次 `ask`
- 当前测试约束补充：
  - `runtime-just-bash.service.spec.ts` 这类直接改 `process.env` 的用例，恢复环境时不能写 `process.env.KEY = undefined`
  - 原值缺失时必须 `delete process.env.KEY`，否则 Node 会把它变成字符串 `'undefined'`，污染后续 `just-bash` 配置读取
- 当前 runtime 抽象收口新进展：
  - `RuntimeCommandService` 已改成 runtime backend 注册表模式，不再硬绑定单个 `RuntimeJustBashService`
  - shared `RuntimeBackendKind` 已放宽为开放字符串，不再把契约锁死为单一字面量
  - 新增 `RuntimeToolBackendService`，把 shell backend 与 workspace backend 的选择点从工具层抽回 runtime owner
  - `ToolRegistryService` 当前只消费解析后的 backend descriptor，不再持有“先拿 kind 再回查 registry”的细节
  - `BashToolService` 的描述文案也已改成读取当前默认 shell backend descriptor，而不是写死 `just-bash`
- 当前已落第一段实现：
  - `RuntimeCommandService` 已作为 runtime 执行入口落地
  - `RuntimeJustBashService` 已作为首个后端落地
  - `RuntimeWorkspaceService` 已把 session 工作区同步到宿主目录
  - `RuntimeWorkspaceService` 已补 `deleteWorkspace()`，主会话删除时会清理对应 runtime workspace
  - `RuntimeMountedWorkspaceFileSystem` 已把 `/workspace` 直挂到宿主目录
  - `RuntimeMountedWorkspaceFileSystem` 已补 `symlink / link / readlink`
  - native `bash / read / glob / grep / write / edit` 工具已进入统一工具集
  - `RuntimeToolPermissionService` 已作为 runtime 权限 owner 落地
  - `ToolRegistryService` 已把 native runtime 工具统一接到权限审查链
  - HTTP smoke 已覆盖 `bash / read / glob / grep / write / edit` 多轮工具链，以及“先写文件、再读取、再校验宿主目录存在文件、最后删除会话后工作区已被清理”
  - `RuntimeHostConversationRecordService` 的可选注入不能用 `Pick<...>` 这类泛型类型表达；Nest 真链路只会拿到 `Object`，会让清理逻辑在 HTTP 路径里静默失效
  - `BashToolService` 已把“命令完成后同步回宿主工作区”的旧描述改成“直挂并直接落宿主工作区”
- 当前已拿到的新鲜验证：
  - Windows：`packages/server` runtime 定向 `jest`、`packages/server build`、root `lint`、root `smoke:server`
  - WSL 内部目录：`packages/server` runtime 定向 `jest`、root `smoke:server`
- 2026-04-20 补充推进：
  - `bash` 的对模描述和 `<bash_result>` 已去掉 backend kind 这类宿主附加语义
  - `task` 的对模结果已收成 `session_id + <task_result>`，不再回送 `provider/model`
  - `RuntimeJustBashService` 已补 runtime owner 的统一超时决议，不再只依赖底层 `AbortSignal`
  - HTTP smoke 已新增 `bash-workdir-loop`、`bash-timeout-loop` 与 `bash-tar-loop`
- 当前已确认的命令面：
  - 文件追加、复制、移动、删除
  - shell 状态跨次不续存
  - 本地 `curl` 网络访问
  - `ln -s / readlink / ln`
- 当前仍缺：
  - 更宽命令面，例如压缩、`tar`、更复杂目录树与边界性能

## 2026-04-21 G18 runtime 二次收口

## 目标

- 把 session 环境从 command backend 和 filesystem backend 中拆成独立 owner。
- 把当前 `host-filesystem` backend 补成更接近通用 filesystem backend 的稳定接口。
- 保持现有工具公开行为不变，不引入兼容壳。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| G18-2 | 已完成 | 新增 `RuntimeSessionEnvironmentService`，收走 `storageRoot / visibleRoot / workspaceRoot` owner，并让命令链、文件链、会话删除清理链统一依赖它 |
| G18-3 | 已完成 | 为 `host-filesystem` backend 补 `resolve/stat/mkdir/delete/move/copy/symlink/readlink`，并把 `workspace backend` 命名继续收口成 `filesystem backend` |
| G18-4 | 已完成 | 让文件工具统一通过 `RuntimeFilesystemBackendService` 的稳定 contract 执行，不再自己持有 configured backend 细节 |
| G18-5 | 已完成 | 把 runtime 审批请求、工具 access 声明和前端审批面板从 capability 语义切到 operation 语义 |
| G18-6 | 已完成 | 把 project/worktree 相关 owner 下沉为可选 overlay，并通过 fresh 验证与独立 judge |
| G18-7 | 已完成 | 用第二 shell backend 和第二 filesystem backend 的真路由测试，复核 runtime 抽象的可迁移性 |

## 当前进展

- `G19-1` 已开始：
  - 已把 `bash` 结果文本渲染收口到 `execution/runtime/runtime-command-output.ts`
  - `BashToolService.toModelOutput()` 与 `builtin.runtime-tools` 当前共用 `renderRuntimeCommandTextOutput()`
  - 当前已补输出尾部截断语义：每个 stream 最多保留最后 `200` 行、`16 KiB`
  - `RuntimeCommandService` 当前会在 backend 原始结果上统一补 `stdoutStats / stderrStats`
  - `runtime-command-output.ts` 已改成消费本地稳定渲染输入接口，不再依赖跨包联合 `Pick<>`
  - `builtin.runtime-tools` 当前已声明 `config schema`，前端插件配置页会直接渲染 bash 输出治理项
  - 插件配置链已接通 `maxLines / maxBytes / showTruncationDetails` 三个字段，并实际影响 `bash` 工具返回文本
  - 已通过定向验证：
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/runtime/runtime-command.service.spec.ts tests/execution/runtime/runtime-command-output.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts`
    - `packages/web`: `npm run test:run -- tests/features/plugins/components/PluginConfigForm.spec.ts`
    - `packages/shared`: `npm run build`
    - `packages/plugin-sdk`: `npm run build`
    - `packages/server`: `npm run build`
    - root: `npm run lint`
    - root: `npm run smoke:server`
    - root: `npm run smoke:web-ui`
  - 已补浏览器 smoke 的数值输入稳定性：
    - `context-length` 输入现在会在等待按钮启用时反复写值并派发 `input/change`
    - 本轮 `smoke:server` 与 `smoke:web-ui` 已重新通过
- `G18-4` 已新增 `RuntimeFilesystemBackend.readPathRange`，把 `read` 的目录/文件分支、offset 越界诊断、行切片与行截断继续下沉到 filesystem backend owner。
- `ReadToolService` 当前只保留参数校验、stable contract 调用与结果文本包装。
- `write / edit` 复核后暂不继续拆；当前已经基本满足“工具层只剩参数校验 + contract 调用 + 结果包装”的目标。
- `RuntimeCommandResult / PluginRuntimeCommandResult` 已移除不再使用的 `workspaceRoot`。
- `RuntimeSessionEnvironment.workspaceRoot` 已收口为 `sessionRoot`，`RuntimeFilesystemResolvedPath.workspaceRoot` 也已移除。
- 当前生产代码里和本阶段相关的旧 `workspace` owner 命名已经清空；后续若继续推进，重点应转向 `G18-6 project/worktree overlay`，而不是再做同类命名清理。
- `G18-6` 第一刀已开始：
  - project root 判定已从自由函数收口为 `ProjectWorktreeRootService`
  - `ProjectWorktreeOverlayModule` 已建立，当前由 `RuntimeHostModule` import/export
  - project/worktree 相关服务的下一步重点应是继续判断哪些能力可以彻底移出 runtime host 主模块
- `G18-6` 第二刀已完成：
  - `ProjectWorktreeOverlayModule` 已直接持有 `skill / mcp / persona / subagent-type` 这些 project/worktree 相关 provider
  - `RuntimeHostModule` 不再直接注册这些 provider
  - `AppModule` 已直接导入 overlay module，`RuntimeHostModule` 也不再转手导出 overlay
- `G18-6` 第三刀已完成：
  - `ProjectWorktreeFileService / SkillRegistryService / McpConfigStoreService / PersonaStoreService / ProjectSubagentTypeRegistryService` 已移除默认 `new ProjectWorktreeRootService()`，强制回到 overlay module 装配
  - `RuntimeHostSubagentRunnerService` 已移除默认 `new RuntimeHostSubagentSessionStoreService()` 与 `new ProjectSubagentTypeRegistryService()`，不再把 session/type owner 偷带回 runtime host
  - 相关 server 定向测试构造已统一显式传入这些 owner，避免测试链路继续掩盖真实装配问题
- `G18-6` 第四刀已完成：
  - `RuntimeHostSubagentTypeRegistryService` 已迁到 overlay owner `ProjectSubagentTypeRegistryService`
  - 对应测试已迁到 `tests/execution/project/project-subagent-type-registry.service.spec.ts`
  - `RuntimeHostSubagentRunnerService` 只消费 overlay 侧 registry，不再依赖 runtime/host 目录中的 project owner 命名
- `G18-6` 独立 judge 已 PASS：
  - judge 确认 overlay provider 目前已真正落在 `ProjectWorktreeOverlayModule`
  - judge 确认 `ProjectSubagentTypeRegistryService` 迁移是真迁移，不是换名留壳
  - judge 确认当前 residual risk 仅剩“runtime host 仍硬 import overlay”，但按本阶段验收口径不构成阻塞
- `G18-7` 已完成实现摸底：
  - `RuntimeCommandService`、`RuntimeFilesystemBackendService` 与 `RuntimeToolBackendService` 现有 owner 已能稳定注册多个 backend，并按环境变量切换 shell/filesystem 路由
  - `tests/execution/tool/tool-registry.service.spec.ts` 已补第二 backend 真路由回归：
    - `mock-shell` 证明 `bash` 经 runtime 权限链后会切到第二 shell backend
    - `mock-filesystem` 证明 `read / glob / grep / write / edit` 会统一切到第二 filesystem backend
  - `tests/execution/runtime/runtime-command.service.spec.ts` 与 `tests/execution/runtime/runtime-tool-backend.service.spec.ts` 已继续覆盖默认 backend、显式 backend 与未知 backend 拒绝
- `G18-7` 独立 judge 已 PASS：
  - judge 确认第二 shell/filesystem backend 证据不是只换名字或只包一层壳
  - judge 确认 `bash` 与文件工具都真正穿过 runtime owner 到达第二 backend
  - judge 确认当前残余风险只剩“第二 backend 仍是测试实现，不是生产级实现”，不阻塞本阶段完成判定
- `G18-2 ~ G18-5` 独立 judge 已 PASS：
  - judge 确认 session environment owner、filesystem backend contract、工具层稳定 contract 和 operation 公开语义都已真实成立
  - judge 确认当前残余风险主要是工具成熟度增强项，不阻塞这四段阶段完成判定

## 2026-04-21 通用环境工具语义修正

## 目标

- 把 runtime 工具主语义从“session `/workspace`”修正为“当前 backend 可见路径”。
- 保留 just-bash 作为首个 backend，但不让它当前的挂载布局反向定义整个工具 contract。
- 补 runtime 审批模式；在需要时可切到 yolo，但保留能力声明与审计痕迹。

## 当前决定

- `bash / read / glob / grep / write / edit` 的路径参数都应由 backend 判定是否可见，而不是工具层自己假设固定根。
- just-bash 下允许访问 just-bash 文件系统里当前暴露的任意路径；持久与非持久路径由 backend 自己表达。
- 当前先不把 project/worktree 作为主工具语义继续推进；相关底座仅保留为后续附加能力参考。
- yolo 只改变默认审批决议，不跳过 runtime capability declaration，也不跳过日志/审计链。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| E17-1 | 已完成 | 更新规划文件并复核当前 `/workspace` 绑定点 |
| E17-2 | 已完成 | 改造 runtime backend 文件路径 contract，去掉工具层对固定根的硬编码 |
| E17-3 | 已完成 | 改造 just-bash backend 的可见路径模型与路径校验 |
| E17-4 | 已完成 | 补 runtime yolo 模式、定向测试与 smoke，并整理 fresh 结论 |

## 2026-04-21 R17-12 runtime 工具插件化

## 目标

- 把 `bash / read / glob / grep / write / edit` 从 `ToolRegistryService` 原生注入迁到单个本地插件。
- 保留现有 runtime backend、审批链和文件/命令 owner，不回退到“插件直接碰底层 runtime 服务”。
- 让本地插件拥有正式 runtime host contract，为后续其他插件复用同一能力做准备。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| P17-12-1 | 已完成 | 增加 shared / plugin-sdk / server 的 runtime host method 与权限契约 |
| P17-12-2 | 已完成 | 新增 `builtin.runtime-tools` 本地插件，接管 `bash / read / glob / grep / write / edit` |
| P17-12-3 | 已完成 | 移除 `ToolRegistryService` 原生 runtime 工具注入并补 fresh 验证 |

## 当前决定

- 插件接口增强优先于“继续保留 native 工具壳”。
- runtime 工具不走单个 `runtime.tool.call` 泛化入口，先按稳定语义拆成 6 个 host method。
- 本阶段仍保留 `todowrite / webfetch / skill` 的 native owner；这次只处理执行环境工具。
- 新本地插件先做成 `system-required`，避免在迁移阶段改变默认可用性。
- 独立 judge 已 PASS：
  - `ToolRegistryService` 不再直接拼接 `bash / read / glob / grep / write / edit`
  - `builtin.runtime-tools` 通过正式 host contract 调用 runtime owner
  - runtime 权限审查与 backend 路由仍由宿主统一持有
  - fresh 验收链足以支撑完成判定

## 当前决定

- 先以 `other/opencode` 的 skill 主语义为准做设计，不先假设保留现有 Garlic Claw 的会话激活模型。
- 如果 `opencode` 没有的能力只是我们自己额外长出来的壳，而不是稳定 owner，就优先删除而不是继续迁移。
- skill、persona、插件命令、工具治理的 owner 必须重新梳理，避免“skill 内容加载”和“工具权限治理”继续缠在一起。
- 用户已确认采用方案 1：
  - 直接切到 OpenCode 风格的 skill 懒加载模型
  - 删除现有 `activeSkillIds`、`/skill use/remove/clear` 和 skill 会话绑定逻辑
  - skill 的代码执行不再走专用执行器；与执行环境绑定的通用工具留到后续 runtime 子阶段
- 2026-04-20 补充决定：
  - 这轮先不碰任何执行环境相关能力，包括 `bash`、环境内副本、环境切换与 staging。
  - 先把与执行环境无关的部分落地：
    - skill 发现链统一收口到仓库根 `skills/`
    - 技能页去掉“用户技能/用户目录”公开语义
    - shared `SkillSourceKind` 同步收口，不再保留 `user` 公开类型分支
    - native `skill` 工具通过 `toModelOutput` 向模型回送 `<skill_content>` 文本块，而不是只回 JSON
    - 相关实现优先参考 `other/opencode/packages/opencode/src/skill/index.ts` 与 `other/opencode/packages/opencode/src/tool/skill.ts`
  - 当前阶段不改 AI 工具名，仍维持 `skill`；先把发现、目录与静态元数据语义收干净。
  - 已提前落地的 `bash / FileRuntime / native 工具` 不计入当前阶段进度，后续如保留，另开 runtime 子阶段重新审视。
  - 2026-04-20 补充：
    - `todo` 当前按 `other/opencode/packages/opencode/src/tool/todo.ts` 与 `session/todo.ts` 的 owner 收口
    - 公开语义固定为“当前会话独立待办列表的全量覆盖”
    - HTTP 接口固定为 `GET/PUT /chat/conversations/:id/todo`
    - `http-smoke.mjs` 已补独立路由覆盖和 native `todo` 多轮工具循环证据链
    - `subagent` 后续落地继续优先参考 `other/opencode/packages/opencode/src/tool/task.ts`
    - 当前已补第一段 `taskId` 续跑：
      - shared / plugin-sdk / server 都已接通 `taskId`
      - `builtin.subagent-delegate` 两个工具都可透传 `taskId`
      - `subagent.task.start` 续跑已有任务时会复用原任务 id，并把新提示接到既有请求上下文后继续执行
    - 当前已补第二段 `description` 标题语义：
      - shared / plugin-sdk / server / web 都已接通 `description`
      - `description` 作为任务标题独立持久化，前端任务卡片优先显示该标题
      - `requestPreview` 继续保留真实请求预览，不再复用 `description`
- 当前已补第三段 `subagent type` 语义：
  - shared / plugin-sdk / server / web 都已接通 `subagentType`
  - 宿主已落真实 `ProjectSubagentTypeRegistryService`，通过仓库根 `subagent/*.yaml` 扫描类型
  - 默认 `general / explore` 会自动补齐到目录中；`explore` 仍会补默认只读工具与探索导向提示词
  - 显式 `providerId / modelId / system / toolNames` 仍可覆盖类型默认值
  - 后台任务会持久化 `subagentType / subagentTypeName`
  - HTTP 已补 `GET /plugin-subagents/types`，插件声明式配置可用 `selectSubagentType` 拉取选项
    - 当前已补第四段 `session` 主语义收口：
      - `subagent.get` 宿主 Host API 已改成按 `sessionId` 读取
      - plugin-sdk `getSubagent()` 已改成透传 `sessionId`
      - HTTP `plugin-subagents/:sessionId` 与后台列表都已改成 session 最新投影语义
      - native `task` 工具对模型输出已改成 `session_id` 优先，`taskId` 只保留为 `ledger_task_id` 投影
      - `subagent.run` 与 `subagent.task.start/list/get/overview` 的公开结果都已移除账本 `id/taskId`，只保留 `sessionId / sessionMessageCount` 作为公开续跑与投影视图字段
    - 当前已补 `invalid` 失败恢复语义：
      - `AiModelExecutionService` 已接入 `experimental_repairToolCall`
      - 无效参数 / 未知工具会自动转成内部 `invalid` 工具结果，而不是直接打断整轮工具循环
      - native / plugin / MCP 工具的可恢复执行错误会统一回写 `invalid-tool-result`
      - `ConversationTaskService` 与 `RuntimeHostSubagentRunnerService` 都已把 `tool-error` 收口为稳定结果持久化
    - 当前工作区里的执行环境草稿已收走：
      - `packages/server/src/execution/bash/*`
      - `packages/server/src/execution/file/*`
      - 对应未提交测试草稿
      - 这部分不再污染当前 N17 口径，后续如要继续实现，另开 runtime 子阶段
    - 2026-04-20 新决定：
      - `subagent` 名字保持不变，但公开输入改成 OpenCode 风格的 `subagentType + sessionId`
      - `profileId` 不再作为公开主语义；宿主内建 `general / explore` 已改成子代理类型目录
      - 恢复同一子代理上下文的公开入口改用 `sessionId`
      - 当前后台任务账本仍保留 `taskId` 作为内部投影；公开结果和前端消费已经不再暴露它
      - 后台任务页继续保留，但只展示 session 的最新执行投影，不再让任务记录反向拥有 session
      - `todo` 读写统一改到 session owner；主聊天只把 `conversationId` 当主 session id 的宿主映射
      - 插件声明式配置里的子代理选择器特殊类型改成 `selectSubagentType`

## 2026-04-20 R17-8 预备结论

- `other/opencode` 的 `bash / read / write / edit / grep / lsp` 面向真实项目 worktree，而不是 session runtime workspace。
- 当前 Garlic Claw 新增的 `bash / read / glob / grep / write / edit` 则明确面向 `sessionId` 对应的 `/workspace`。
- 这意味着当前 runtime 文件工具与 runtime bash 虽然已经形成稳定 owner，但它们不能直接当成 OpenCode 本地项目工具层。
- 因此 `R17-8` 的第一步不是直接接 `lsp`，而是先决定：
  - 新增独立的 project/worktree backend
  - 还是重定义当前文件工具的公开语义
- 在这个 owner 没厘清前，不应把 `lsp` 直接挂到现有 runtime workspace 文件链上。
- 2026-04-21 更新：
  - 用户已明确取消当前阶段的 `lsp` 计划。
  - 已复核仓库主代码，当前没有真正落地的 `lsp` 实现需要删除，只有规划层引用。
  - 因此这条结论保留为未来参考，不再作为当前执行项继续推进。

## 当前摸底

- 当前 Garlic Claw skill：
  - 有独立 `/skills` 管理页
  - 有会话级 `activeSkillIds`
  - 会在每次主聊天调用前把 active skills 拼进 `systemPrompt`
  - 还额外暴露 `skill__asset__list / read / run` 这组专用工具
  - 通过 `/skill use/remove/clear` 管理会话绑定
- 当前 OpenCode skill：
  - 以原生 `skill` 工具按需加载单个 `SKILL.md`
  - 通过 `<available_skills>` 描述让模型自行选择是否调用
  - skill 内容只在调用后注入上下文，不是会话常驻绑定
  - 有权限模式过滤 `allow / ask / deny`
  - 同名 skill 还会自然进入 slash command 列表，但本质仍是加载 prompt 模板/说明，不是会话状态机
- 2026-04-19 补充：
  - `http-smoke.mjs` 之前只覆盖 `/skills` 路由，没有覆盖 runtime 里的 native `skill` 工具暴露与多轮 tool loop。
  - 当前 smoke 已补两条证据链：
    - `loadPolicy=deny` 时，主聊天请求发给模型的 `tools` 列表中不再包含 native `skill`
    - `loadPolicy=allow` 时，fake OpenAI 会先发 `skill` tool call，宿主执行后继续下一轮并返回自然语言
- 2026-04-20 补充：
  - 当前 Garlic Claw skill 发现链仍同时扫描：
    - 仓库根 `skills/`
    - 用户目录 `~/.garlic-claw/skills`
  - 这与用户要求的“保证从 `skills/` 目录扫描”不一致，也让前端“项目/用户”双来源语义继续外露。
  - 当前 skill 页统计、卡片和详情面板都还在展示 `sourceKind === 'project' | 'user'`，需要同步收口。
  - 当前这部分已收口完成：
    - server 只扫仓库根 `skills/`
    - shared `SkillSourceKind` 已收成单一 `project`
    - web 技能页不再按“项目/用户”双来源统计
    - native `skill` tool follow-up request 已带上 `<skill_content>`，不再只是 JSON tool result
  - 当前 runtime 新进展：
  - 2026-04-20 更正：
    - 先前提前落了 `bash / FileRuntime / native 工具`，这和“先做与执行环境无关的部分”冲突
    - 这些实现暂不作为当前阶段完成度依据，后续另列 runtime 子阶段

# 2026-04-19 独立事件日志与非送模消息语义

## 目标

- 把 `plugin / MCP / skill` 的事件日志从进程内暂存改成独立文件日志。
- 日志统一放在仓库根 `log/` 下，并按实体类型和实体 ID 分目录隔离。
- 每个插件 / MCP / skill 都能单独配置日志文件大小上限，默认 `1MB`，设置为 `0` 表示关闭。
- 上下文压缩产物改成“前端可见但不进入 LLM 上下文”的正式消息语义，不再伪装成普通 assistant 消息。
- 前端分别在插件管理、MCP 管理、技能目录页面展示对应实体的最近日志和日志配置。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| L18-1 | 已完成 | 确认日志 owner、消息语义 owner、shared/server/web 契约边界 |
| L18-2 | 已完成 | 实现 server 文件日志服务与 plugin / MCP / skill 日志读写、配置持久化 |
| L18-3 | 已完成 | 实现“仅前端展示、不进入送模上下文”的消息角色并迁移上下文压缩 |
| L18-4 | 已完成 | 更新前端日志面板、聊天展示、测试、fresh 验收与独立 judge |

## 当前决定

- 不继续沿用 `PluginPersistenceService.events` 这类内存态 Map；日志 owner 要统一落到文件系统。
- 不为上下文压缩继续开专用展示后门；要把“用户可见但不送模”的消息语义做成通用消息角色。
- 送模历史构造链必须显式跳过这类消息，而不是依赖注解或特定插件 ID 判断。
- 日志配置跟随各自实体的正式配置 owner：
  - plugin 跟插件持久化记录走
  - MCP 跟 `mcp/mcp.json` 走
  - skill 跟 skill governance 走
- 前端不做单独“总事件日志页”，而是继续放回插件 / MCP / skill 各自页面。

## 当前推进

- shared / server / web 当前已经全部接通 `EventLogSettings / EventLogRecord / EventLogQuery / EventLogListResult` 正式契约。
- plugin / MCP / skill 三类实体都已有独立文件日志 owner，目录位于仓库根 `log/plugins|mcp|skills/<entity>/events.json`。
- Web 侧现在三个入口都能看到各自事件日志：
  - 插件管理
  - MCP 管理
  - 技能目录
- 上下文压缩摘要已切到 `role: 'display'`，并在前端使用独立样式显示。
- 已重新通过：
  - `packages/shared`: `npm run build`
  - `packages/server`: `npm run build`
  - `packages/web`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- 已补第二轮阻塞修复：
  - `RuntimeEventLogService` 已改成真正按 `cursor` 继续分页，不再只是排除当前 cursor 这一条记录。
  - 已新增 server 定向分页测试与 web 三个日志 composable 的 `loadMore` 分页测试。
- 独立 judge 已 PASS；`L18` 现在可标记为已完成。

## 当前摸底

- `packages/server/src/plugin/persistence/plugin-persistence.service.ts` 的事件日志仍是 `Map<string, PluginEventRecord[]>`，重启丢失。
- `packages/server/src/execution/mcp/mcp.service.ts` 只有治理动作返回值，没有独立日志持久化。
- `packages/server/src/execution/skill/skill-registry.service.ts` 目前只有治理配置，没有事件日志 owner。
- 上下文压缩仍在 `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts` 中写回 `role: 'assistant'` 的正式消息。
- `packages/server/src/conversation/conversation-message-planning.service.ts` 当前送模只收 `assistant / user`，这正好是新增前端可见消息角色的收口点。

# N14 远程插件静态接入密钥与元数据缓存

## 目标

- 把远程插件公开语义从 `deviceType` 收口为：
  - `runtimeKind`
  - `remoteEnvironment`
  - `auth.mode`
  - `capabilityProfile`
- 把远程插件接入主语义改成“用户手填静态 key”，不再以宿主签发 bootstrap token 作为公开主链。
- 在服务端显式区分远程接入配置、静态元数据缓存、运行态连接状态。
- 宿主自动生成远程接入配置 UI，并在插件离线时继续展示缓存元数据。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R14-1 | 已完成 | shared 契约改造：移除 `deviceType` 主语义，新增 `remoteEnvironment / auth.mode / capabilityProfile` |
| R14-2 | 已完成 | server 记录模型改造：远程接入配置、静态元数据缓存、运行态状态分层 |
| R14-3 | 已完成 | server 接口与网关握手改造：从 bootstrap token 主语义迁出 |
| R14-4 | 已完成 | web 插件页新增远程接入面板、缓存状态与风险提示 |
| R14-5 | 已完成 | 测试、模拟 IoT smoke、fresh 验证与独立 judge |

## 当前决定

- 只保留 `remoteEnvironment: 'api' | 'iot'`，不再保留 `pc | mobile` 公开语义。
- 只保留 `auth.mode: 'none' | 'optional' | 'required'`。
- 只保留 `capabilityProfile: 'query' | 'actuate' | 'hybrid'`。
- 远程插件接入 key 由宿主保存并使用；是否输入由 `auth.mode` 控制，不做全局强制。
- 远程插件的接入表单属于宿主自动能力，不混进插件自己的 config schema。
- 静态缓存只存声明型元数据，不缓存工具执行结果、健康检查结果和动态 route 结果。

## 当前摸底

- shared 仍存在 `DeviceType / AuthPayload.deviceType / RemotePluginBootstrapInfo.token`。
- server 仍暴露 `POST /plugins/remote/bootstrap`，并用 JWT 作为远程插件主接入语义。
- 插件持久化记录仍把 `deviceType` 暴露到读模型，没有远程接入配置和元数据缓存的显式分层。
- web 插件页还没有远程插件专属接入面板与缓存展示区。

# Persona 目录化存储计划

## 目标

- 把 persona 持久化从单文件改成 `persona/` 目录结构。
- 每个人设一个文件夹，默认人设也使用同一结构。
- 配置文件可直接人工编辑并允许写注释。
- avatar 不手动配置，改为自动识别人设目录中的 `avatar.*` 图片文件。
- 保持现有服务端 API、主对话语义与前端管理能力不变。

## 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| P1 | 已完成 | 确认目录结构、文件格式与兼容边界 |
| P2 | 已完成 | 改造 `PersonaStoreService` 与测试夹具 |
| P3 | 已完成 | 运行 persona 相关测试、构建与 smoke |

## 当前决定

- 目录根使用仓库根 `persona/`；如设置 `GARLIC_CLAW_PERSONAS_PATH`，则使用该目录。
- 每个人设一个文件夹，目录名使用 `encodeURIComponent(personaId)`。
- 每个人设目录包含：
  - `SYSTEM.md`
  - `meta.yaml`
- `meta.yaml` 只保存元数据，不手动保存 `avatar`。
- 服务端会自动扫描人设目录内的 `avatar.png / avatar.webp / avatar.jpg / avatar.svg ...` 并回填响应中的 `avatar` 字段。

## 2026-04-18 插件配置元数据协议重构（AstrBot 方向）

### 目标

- 用接近 AstrBot 的声明式配置元数据协议替换当前插件扁平 `fields[]` schema。
- 宿主统一渲染插件配置 UI，不做插件自带前端。
- 第一轮把当前插件详情页配置面板升级为 object-tree 元数据渲染器。

### 当前决定

- 方向对标 AstrBot 的功能与字段语义，不直接照搬其文件名。
- 新协议保留纯数据语义，便于未来接不同前端。
- 第一轮不做动作按钮与插件自带页面；聚焦配置元数据与宿主渲染。
- `_special` 只接当前宿主已有稳定 owner 的选择器，不做空壳兼容。
- 旧 `fields[]` 协议不保留兼容层，直接迁到新协议。
- 内建示例 schema 继续按 AstrBot 风格收口：
  - `builtin.provider-router` 使用 `routing / tools / shortCircuit` section
  - `builtin.subagent-delegate` 使用 `llm / tools` section
  - `allowedToolNames` 不再用逗号分隔字符串，统一改成 `list<string>`
- 宿主已有的插件模型偏好 UI 继续保留为宿主侧自动能力，但显示条件收紧为：
  - 只有声明 `llm:generate` 的插件才展示
  - 默认仍继承主聊天当前 provider / model

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C1 | 已完成 | 改造 shared / plugin-sdk 配置元数据契约，并把计划写入 TODO |
| C2 | 已完成 | 改造 server 配置快照、默认值补全与递归校验 |
| C3 | 已完成 | 改造 web 插件配置面板，支持 object-tree 元数据渲染 |
| C4 | 已完成 | 补测试、构建、lint 与 smoke 验收；独立 judge 已 PASS，可收尾 |

## 2026-04-18 插件模型配置与工具治理拆页

### 目标

- 把插件调用 LLM 的宿主模型选择从全局 AI 设置迁到插件自己的设置页。
- 默认行为改成继承主聊天当前上下文；插件作者或用户可在插件维度手动覆盖 provider / model。
- `工具治理` 不再作为单独页面，拆回 `插件管理 / MCP 管理 / skill 管理` 各自页面。
- MCP 拆成独立界面；AI 设置页只保留真正属于宿主级 AI 配置的入口。

### 当前决定

- 不把插件宿主模型偏好塞进 manifest config，避免和插件声明式 schema 混用。
- 新增独立的插件宿主模型偏好读写接口；字段先只包含 `providerId / modelId`，两者同时为空表示继承主聊天。
- 插件运行时模型选择优先级固定为：
  - 调用参数显式指定
  - 插件宿主模型偏好
  - 当前对话上下文 `activeProviderId / activeModelId`
  - 系统默认 provider / model
- AI 设置页里的 `Host Model Routing` 只保留聊天回退链，不再暴露 `compressionModel / utilityModelRoles.pluginGenerateText` 这类当前无稳定 owner 的入口。
- 工具治理 UI 下沉后，复用统一 `/tools/overview` 数据源，但不再保留独立 `/tools` 页面。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| G1 | 已完成 | 后端新增插件宿主模型偏好契约、接口与运行时选择逻辑 |
| G2 | 已完成 | 前端插件页接入模型偏好面板，并从 AI 设置页移除插件默认文本生成入口 |
| G3 | 已完成 | 前端拆分 MCP 页面，移除独立工具治理页，把工具治理下沉到插件 / MCP / skill 页面 |
| G4 | 已完成 | 补测试、构建、lint 与 smoke，完成本轮验收 |

## 2026-04-18 MCP 默认目录显式化

### 目标

- 把 MCP 默认配置目录从隐藏的 `.mcp/` 改成显式的 `mcp/`。
- 让运行时默认读取仓库根 `mcp/mcp.json`，不再回退到空的 `tmp/mcp.server.json`。
- 不保留旧 `.mcp/` 兼容层。

### 当前决定

- 默认 MCP 配置文件统一为仓库根 `mcp/mcp.json`。
- `GARLIC_CLAW_MCP_CONFIG_PATH` 仍可覆盖默认路径。
- 服务端默认快照对外显示 `mcp/mcp.json`，便于前端与使用者理解。
- 仓库内置 MCP 配置直接迁到 `mcp/mcp.json`。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| M1 | 已完成 | 修改默认路径解析、迁移仓库配置并更新测试预期 |

## 2026-04-18 MCP 开发态重启收尾

### 目标

- 修复开发态 `node --watch` 重启时 stdio MCP server 残留 `EPIPE` 的问题。
- 保证宿主退出时会先断开 MCP client，再结束后端进程。

### 当前决定

- `McpService` 负责自身的退出收尾，模块销毁时主动断开全部 MCP client。
- Nest HTTP 入口开启 shutdown hooks，确保开发态重启与进程退出都会触发模块销毁链。
- 不修改外部 MCP server 包，优先修宿主退出顺序。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| S1 | 已完成 | 补退出钩子、回归测试与定向验证 |

## 2026-04-18 MCP 校验链补强收尾

### 目标

- 修正“严重 MCP 回归已进入提交，但校验链仍通过”的验收缺口。
- 让校验链同时覆盖：
  - 构建产物是否真的发射了 `mcp-stdio-launcher.js`
  - 真实 stdio MCP server 是否能经由 launcher 连通并成功调用工具
- 避免测试夹具和真实运行态的模块解析环境脱节，造成假通过或假失败。

### 当前决定

- HTTP smoke 继续承担“构建产物存在 + 宿主真实连通 working MCP”的端到端校验。
- `McpService` 的定向 `jest` 继续承担“launcher 路由 + 真实 stdio MCP 工具调用”的回归校验。
- 真实 MCP 集成测试产生的临时脚本必须放在仓库内可解析项目依赖的位置，不能再写到系统临时目录。
- 只有 smoke 与定向 `jest` 都新鲜通过，才算这条链路完成验收。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| V1 | 进行中 | 修复真实 MCP 集成测试夹具路径，并重新跑定向 `jest`、build、lint、smoke |

## 2026-04-18 子代理步数限制移除

### 目标

- 移除宿主层自行暴露的 `maxSteps / stopWhen / stepCountIs` 步数限制控制。
- 子代理运行、shared 契约、plugin-sdk authoring 与插件作者示例不再出现该能力。
- 保留现有工具过滤、tool result 收集、后台任务与 writeBack 语义不变。

### 当前决定

- 不再给 `AiModelExecutionService.streamText()` 透传 `stopWhen`。
- `RuntimeHostSubagentRunnerService` 不再读取、默认补齐或 hook 改写 `maxSteps`。
- `PluginSubagentRunParams / PluginSubagentRequest / SubagentBeforeRunHookMutateResult` 删除 `maxSteps`。
- `builtin.subagent-delegate` 不再暴露“子代理最多几步”的插件配置项。
- 如果后续仍出现“只跑一步就停”，那是第三方 `ai` 库默认语义，不再是宿主额外限制。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R1 | 进行中 | 删除 server/shared/plugin-sdk 的步数限制暴露与测试残留，并补验证 |

## 2026-04-18 AI SDK 多轮工具调用适配

### 目标

- 核对当前安装的 `ai` 库是否原生支持多轮工具调用。
- 如果默认行为仍会把工具链截断在单步，则在宿主统一执行层做适配，而不是让聊天链路和子代理链路各自特判。
- 保持“无工具时自然单次完成，有工具时按工具结果继续下一步，直到循环自然结束”的语义。

### 当前决定

- 当前安装版本 `ai@6.0.164` 原生支持多轮工具循环。
- `generateText / streamText` 的默认 `stopWhen` 是 `stepCountIs(1)`，所以不适配时会天然只跑一轮。
- `ai` 内部在“有工具调用且工具结果都齐了”并且“未命中 stop 条件”时，会继续下一步；没有工具调用时会自然结束。
- 宿主统一在 `AiModelExecutionService` 对“带工具的流式调用”注入 `stopWhen: isLoopFinished()`。
- 不重新向插件作者暴露新的步数配置；这次是宿主内部语义修正，不是把 `maxSteps` 换名留下。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| L1 | 已完成 | 核对 `ai` 库默认 stop 语义与内部循环条件 |
| L2 | 已完成 | 在统一执行层给工具流式调用注入 `isLoopFinished()` 并补测试 |

## 2026-04-18 聊天页 smoke 残留显示修复

### 目标

- 修复开发态前端聊天页仍显示已被 smoke 清理会话内容的问题。
- 保证后端会话已经不存在时，前端不会继续显示旧的 `smoke-ui-*` 消息与模型标记。

### 当前决定

- 这次残留不是后端数据库残留；当前实际问题是前端 `chat` store 仍保留已失效的 `currentConversationId / messages`。
- `loadConversations()` 在刷新会话列表后，需要校验当前选中的会话是否仍存在；如果已不存在，就同步清空当前消息、模型选择与流式状态。
- 用 web 单测覆盖“列表刷新后当前会话已失效”的场景，再用 `smoke:web-ui` 走完整浏览器链路复核。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C14-1 | 已完成 | 修复聊天 store 的失效会话收尾逻辑，并通过定向测试、build、lint、`smoke:web-ui`、`smoke:server` |

## 2026-04-18 插件健康快照与 LLM 面板收口

### 目标

- 修复插件详情页健康接口与插件列表健康快照契约错位，避免内建插件详情出现“未知”状态。
- 统一插件页状态展示，不再同时显示重复且语义冲突的连接 / 健康徽标。
- 继续保持“用了宿主 LLM 权限的插件自动出现模型选择面板”的宿主语义。

### 当前决定

- `/plugins/:pluginId/health` 直接返回完整 `PluginHealthSnapshot`，不再返回旧的 `{ ok: boolean }` 简化结构。
- 远程插件详情健康状态在“尚未连接 / 健康探测失败但未进入 error 状态”时按 `offline` 展示，不误记成 `error`。
- 插件侧栏只保留健康状态徽标，不再额外叠加重复的“在线 / 离线”文本 chip。
- 插件模型策略面板的显隐继续由宿主 owner 控制，当前规则是：插件声明 `llm:generate` 时自动出现。
- `subagent:run` 不并入这条宿主 LLM 面板语义；它仍走自己的子代理目标模型配置链。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| P15-1 | 已完成 | 统一插件健康快照接口、侧栏状态展示与 LLM 面板显隐判断，并重新通过 build、定向测试、lint、`smoke:server`、`smoke:web-ui` |

## 2026-04-18 会话标题内建插件实现补全

### 目标

- 修复 `builtin.conversation-title` 在插件页可见但运行时完全不生效的问题。
- 让会话标题生成逻辑作为真实内建 hook 接入 `chat:after-model` 链，而不是只停留在 manifest 声明层。

### 当前决定

- 不给标题插件加额外兼容层；直接把缺失的内建 hook definition 补齐。
- 保持现有标题生成语义：
  - 仅主对话主回复完成后执行
  - 仅当前标题仍是默认标题时生成
  - 仅更新会话标题，不改 assistant 消息正文
- 通过独立定向测试覆盖“生成”和“跳过”两条分支，再用 `smoke:server` 复核真实链路未回归。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| T16-1 | 已完成 | 补齐内建 hook definition、更新注册表、补测试并重新通过 build 与 `smoke:server` |

## 2026-04-18 本地插件公开语义与 memory-context 恢复

### 目标

- 把插件运行形态对外公开语义从“内建插件”收口到“本地插件”，避免把宿主内实现方式直接暴露给前端文案与插件管理视图。
- 补回 `builtin.memory-context` 的真实 hook 实现，确认它在重构前确实存在且语义延续。
- 保持当前插件 ID、hook 边界与运行时 owner 不变，不额外引入兼容层。

### 当前决定

- 这次改的是公开运行形态与前端文案，`builtin.*` 插件 ID 先不改。
- `memory-context` 继续挂在 `chat:before-model`，使用宿主现有 `memory.search` 能力，把命中摘要拼接进 `systemPrompt`。
- `memory-context` 返回值直接收口成稳定 JSON 结构，不再借助更宽的结果 union 推导。
- 前端插件管理默认选中逻辑按 `runtimeKind: 'local' | 'remote'` 判断，不再保留旧的 `'builtin'` 测试夹具语义。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| L17-1 | 已完成 | 补回 `builtin.memory-context` 实现并对齐历史语义 |
| L17-2 | 已完成 | 调整插件页“本地插件”相关测试夹具与默认选中判定 |
| L17-3 | 已完成 | 已通过 build、lint、`smoke:server`、`smoke:web-ui`，可继续整理提交 |

## 2026-04-18 聊天相关元素统一刷新

### 目标

- 把聊天页当前“只刷新消息、不刷新会话摘要”的行为收口成统一语义。
- 只要主聊天操作导致当前会话相关元素发生变化，前端就同步刷新会话列表与当前会话摘要，而不是只等用户手动切换或重新进入页面。
- 覆盖标题、更新时间、消息数以及其他挂在会话摘要上的通用字段，不为单独字段写特判。

### 当前决定

- 刷新 owner 放在 chat store，而不是散落到单个视图组件或 smoke 脚本。
- 发送、重试、编辑消息、删除消息、停止生成后，都走统一的“会话相关元素刷新”动作。
- 当前实现优先刷新：
  - 会话列表 `loadConversations()`
  - 当前会话详情 `loadConversationDetail()`
- 不引入专门的“标题刷新”私有逻辑，统一按“当前会话相关元素可能已被服务端改动”处理。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C18-1 | 已完成 | 梳理聊天操作遗漏的刷新点并完成实现 |
| C18-2 | 已完成 | 补测试、build、lint、smoke、judge；独立 judge 已 PASS，进入提交与 push 收尾 |

## 2026-04-18 远程插件静态接入密钥与元数据缓存

### 目标

- 把远程插件接入主语义改成“用户手填静态 key”。
- 为远程插件静态元数据建立服务端缓存模型，覆盖 manifest、工具描述、配置 schema 与未来 UI 元数据。
- 让远程插件离线时仍能展示最近一次成功同步的静态描述，而不是因为连接断开就失去管理信息。

### 当前决定

- 按用户要求，静态 key 视为用户自己掌握并决定外发的凭据；宿主只负责安全保存与使用，不再替用户管理其传播。
- 缓存 owner 放在服务端插件持久化与读取链，不放到前端 local storage，也不只放在网关内存态。
- 静态缓存与运行态状态必须拆分：
  - 静态缓存：manifest / tools / commands / hooks / routes / config schema / 未来 UI schema
  - 运行态状态：health / 事件日志 / 动态 route 响应 / tool 执行结果
- 目标完成后，旧的远程 bootstrap token 不再作为公开主语义。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| R14-1 | 待开始 | 设计远程插件静态 key 契约、配置模型与接入校验 |
| R14-2 | 待开始 | 设计远程插件静态元数据缓存模型与失效语义 |
| R14-3 | 待开始 | 设计前端远程插件 key / 缓存展示与管理交互 |

## 2026-04-18 模型上下文长度与 usage 估算

### 目标

- 为模型元数据补齐持久化的能力配置与 `contextLength`。
- 为统一模型执行层补齐 usage 估算，避免上游缺失时出现空 usage。
- 保持当前 API 面尽量不扩散，只在必要 DTO / 返回契约上补字段。

### 当前决定

- `TODO.md` 里既有讨论不删除，本轮只追加 N15。
- `contextLength` 默认值使用 `128 * 1024`。
- usage 估算仅统计文本内容，公式固定为 `ceil(utf8Bytes / 4)`。
- usage 结构统一收口为 `{ inputTokens, outputTokens, totalTokens, source }`。
- 模型能力与 `contextLength` 一起持久化到 AI 设置文件。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| U15-1 | 已完成 | 更新规划文件，确认模型能力当前未持久化、需要和 `contextLength` 一起落盘 |
| U15-2 | 已完成 | 重构 AI 设置持久化与 `AiManagementService` 的模型读写 |
| U15-3 | 已完成 | 为统一模型执行层补齐 usage 估算 |
| U15-4 | 已完成 | 更新前端模型页并通过定向测试、build、lint、`smoke:server`、`smoke:web-ui` |
| U15-5 | 已完成 | 独立 judge 已 PASS，已确认 provider 整体保存清理陈旧元数据，以及前端 `contextLength` 正式链与 smoke 证据成立 |

## 2026-04-19 插件化上下文压缩（参考 OpenCode / AstrBot）

### 目标

- 用本地插件实现主对话上下文压缩，支持自动压缩与手动压缩。
- 宿主补齐通用会话历史读写接口，让插件可顺序改写持久化历史。
- 历史消息保留原文，通过通用 `annotations[]` 标记压缩覆盖关系，不给压缩插件单开固定字段。
- 前端补齐压缩插件配置面板、聊天手动压缩入口与压缩摘要消息展示。

### 当前决定

- 采用通用历史接口，而不是压缩专用 Host API。
- 历史改写阶段和 `chat:before-model` 阶段分层。
- 顺序复用现有 hook priority 语义，保证插件改历史顺序确定。
- 压缩摘要消息写回持久化历史；原始消息继续保留。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| C16-1 | 已完成 | 更新设计文档、TODO 与规划文件 |
| C16-2 | 已完成 | 扩展 shared / plugin-sdk 契约与 Host API |
| C16-3 | 已完成 | 实现 server 会话历史改写链与 revision 校验 |
| C16-4 | 已完成 | 实现 `builtin.context-compaction` 插件的自动/手动压缩 |
| C16-5 | 已完成 | 更新前端配置和聊天界面 |
| C16-6 | 已完成 | 已通过定向测试、fresh 验收、浏览器 smoke 稳定性修复与独立 judge |

## 2026-04-21 文件工具与执行抽象 100% 对齐 OpenCode

### 目标

- 压缩 `TODO.md` 已完成部分，只保留项目级真相。
- 把 `bash / read / glob / grep / write / edit` 的使用体验、结果质量、错误提示和工程化能力推进到接近 `other/opencode` 的水平。
- 继续压实 runtime 中间抽象，保证后续接更多执行后端时不需要回改工具层 owner。
- 在进入下一轮实现前，先对当前阶段做独立 judge，并只在 judge 通过后提交。

### 阶段

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| G20-0 | 已完成 | 压缩 `TODO.md` 已完成部分，并冻结 OpenCode 100% 对齐主路线 |
| G20-1 | 已完成 | 已完成独立 judge，确认当前执行层与 smoke 修复可作为提交点 |
| G20-2 | 进行中 | 按 `TODO.md` 的 G20-0 ~ G20-7 逐段推进文件工具成熟度和中间抽象 |
