# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成旧流水只保留摘要；本轮实现细节放 `task_plan.md / progress.md / findings.md`。

## 已完成摘要

- `packages/shared` 已收口为 type-only，共享契约已对齐。
- `packages/server/src` 已压到 `8494`，Windows 与 WSL 内部目录的 fresh 构建、测试、后端 smoke、前端浏览器 smoke、独立 judge 都已通过。
- 认证主链已收口为单密钥登录；`users/me / register / dev-login / refresh / role / API Key` 主链路已删除。
- 聊天链路已支持 provider 自定义扩展块，前端默认折叠展示；插件侧已支持显式 `transportMode: 'generate' | 'stream-collect'`。
- 聊天页“会话相关元素统一刷新”已完成，发送 / 重试 / 编辑 / 删除 / 停止生成后的摘要刷新、旧 SSE/旧请求竞态收口、独立 judge 都已通过。
- 文档分层、跨平台约束、无绝对路径约束、测试目录规范已同步到 `AGENTS.md`。
- N12 Persona 重构（AstrBot 方向）已完成，当前 persona 已改为服务端一等资源并使用目录化存储。
- N13 插件配置元数据协议已收口为 object-tree 声明式 schema，`shared / plugin-sdk / server / web` 已对齐并通过 fresh 验收。
- N15 模型上下文长度与 usage 估算已完成；`contextLength` 与模型元数据已持久化，usage 缺失时会统一估算并返回稳定结构。
- N16 插件化上下文压缩已完成；通用历史接口、`metadata.annotations[]`、自动/手动压缩、聊天摘要展示与 fresh 验收已打通。
- N14 远程插件静态接入密钥与元数据缓存已完成；远程插件主语义已收口为 `runtimeKind + remoteEnvironment + auth.mode + capabilityProfile`，接入配置面板、静态缓存、IoT 风险提示和 fresh 验收已齐备。

## 当前阶段：N17 OpenCode 对齐与 runtime 抽象收尾

- 已完成摘要：
  - 非执行环境主链已对齐到 `skill / todo / webfetch / invalid / subagent(session 化)`，fresh 验收和独立 judge 已通过。
  - `skill` 已收口为仓库 `skills/` 懒加载，`todo` 已收口为 session owner，`subagent` 已接入 `subagentType + sessionId`。
  - `subagent.task.get`、plugin-sdk facade、HTTP 明细入口与 `task` 工具输出已改成 `sessionId` 优先；后台任务列表现在按 session 只展示最新执行投影。
  - `bash / read / glob / grep / write / edit`、runtime `ask/always/reject` 审批链、工作区持久化与聊天前端审批面板已经打通，并有 fresh smoke 证据。
  - 当前残留不是“功能没有”，而是“抽象边界还没完全收干净”，还不能判成完全对标 OpenCode。

- 本轮总目标：
  - 把所有执行环境相关能力统一压到 runtime 抽象下。
  - 工具层只表达稳定语义，不直接绑定 `just-bash`。
  - 让后续接入本机 shell / WSL / 容器 / 其他虚拟 shell 时，不需要重写工具层和审批链。
  - 把当前 `subagent` 继续收口到更接近 OpenCode `task` 的公开语义。

- 当前仍未完成的完整路线：

### R17-1 runtime 后端注册与默认后端决议

- 状态：已完成
- 目标：
  - 去掉 `RuntimeCommandService` 对单个 `RuntimeJustBashService` 的硬绑定。
  - 建立 runtime backend 注册表，允许多个后端并存。
  - 建立“默认 shell 后端 / 默认 workspace 后端”的正式 owner。
- 验收：
  - `RuntimeCommandService` 通过后端集合初始化，而不是硬编码单实例。
  - `ToolRegistryService`、`BashToolService` 不再写死 `'just-bash'`。
  - 定向测试和 `smoke:server` 继续通过。

### R17-2 runtime 能力与权限规则分层

- 状态：已完成
- 目标：
  - 把“后端能力声明”和“权限策略”继续从工具层剥离。
  - 工具只声明需要什么能力，不决定自己绑定哪个具体后端。
  - 为后续更细的路径级 / 命令级规则预留 owner。
- 验收：
  - `runtimePermission.backendKind` 不再在每个 native 工具定义里重复硬编码。
  - `RuntimeToolPermissionService` 只消费后端描述和能力需求，不感知具体工具实现细节。

### R17-3 workspace 文件能力与 shell 执行能力拆层

- 状态：已完成
- 目标：
  - 明确区分 `shellExecution` 与 `workspaceRead / workspaceWrite / search / edit`。
  - 文件工具默认走 workspace contract，而不是默认附着某个 shell 后端。
  - 为后续“文件工具可复用到非 shell 后端”打基础。
- 验收：
  - `read / glob / grep / write / edit` 的 backend 选择来自 runtime owner，而不是工具层常量。
  - 后续新增 shell 后端时，这些工具不需要跟着改业务语义。

### R17-4 `subagent` 继续向 OpenCode `task` 收口

- 状态：已完成
- 目标：
  - 继续保留 `subagent` 名称，但公开主语义尽量靠近 OpenCode `task`。
  - 逐步把 `taskId` 从公开主语义降级为投影或内部账本字段。
  - 保持 `subagentType + sessionId` 为公开恢复入口。
- 当前推进：
  - `subagent.task.get` 已改为按 `sessionId` 读取最新 session 投影，而不是按 `taskId` 直读账本记录。
  - plugin-sdk `getSubagentTask()`、HTTP `plugin-subagent-tasks/:sessionId` 与 `task` 工具对模型输出都已同步切到 `sessionId` 优先。
  - `subagent.run`、`subagent.task.start/list/get/overview` 的公开结果都已去掉账本 `id/taskId`，shared / plugin-sdk / server / web 现在统一只把 `sessionId` 作为公开主键与明细入口。
  - 后台任务总览当前已按 session 收口为“最新执行投影视图”。
- 验收：
  - shared / plugin-sdk / server / web 的公开参数和返回值以 `sessionId` 为主要续跑入口。
  - 后台任务页只作为 session 投影视图，不再反向拥有 session。

### R17-5 `todo` / `task` / `bash` 与 OpenCode 语义复核

- 状态：已完成
- 目标：
  - 逐条复核 `other/opencode` 的 `task.ts`、`todo.ts`、`bash.ts`。
  - 不照搬 UI 或 ACP 壳，只吸收真正的 owner 与语义。
  - 清掉当前剩余的宿主侧额外外露语义。
- 当前推进：
  - `todo` 已维持 session 级全量覆盖写入，`task/subagent` 公开主语义已收口到 `sessionId`。
  - `bash` 参数已对齐 `command / description / workdir / timeout`，并补了“配置 shell backend 真执行”的回归测试。
  - `bash` 对模描述与 `<bash_result>` 已去掉 backend kind、宿主挂载细节和审批 owner；当前只保留 session 工作区、无状态 shell、`workdir` 边界等稳定语义。
  - `task` 对模结果已收口为 `session_id + <task_result>`，不再回送 `provider/model`。
  - `task_plan.md` 已补 `bash / task / todo` 的明确差异表。
- 复核结论：
  - 独立 judge 已 PASS。
  - 当前 residual risk 是“差异表属于 owner 级摘要，不是逐字段镜像”；若后续继续追 `other/opencode` 上游变动，需要再次复核。
- 验收：
  - `todo` 维持 session 级全量覆盖写入。
  - `task/subagent`、`bash` 的权限、输出、续跑语义有明确差异表和收敛结果。

### R17-6 多后端预留与首个新增后端接入准备

- 状态：已完成
- 目标：
  - 为本机 shell / WSL / 容器后端预留稳定扩展点。
  - 不在这一轮把所有后端都做完，但必须保证接入面已经能承载第二个后端。
- 当前推进：
  - `RuntimeWorkspaceBackendService` 与 `RUNTIME_WORKSPACE_BACKENDS` 已落地，workspace 文件链不再直接绑死 `RuntimeWorkspaceFileService`。
  - `read / glob / grep / write / edit` 现在统一通过“当前配置的 workspace backend”执行，和权限描述共用同一 backend 决议。
  - 已补“configured workspace backend 真正生效”的定向测试，证明新增第二个 workspace backend 时不需要改工具公开 contract。
- 复核结论：
  - 独立 judge 已 PASS。
  - 当前 residual risk 是“生产模块里还只注册默认 `host-workspace` backend”，但这不影响本条“抽象与接入面已能承载第二 backend”的完成判定。
- 验收：
  - 共享类型不再把 backend kind 锁死为单一字面量。
  - 服务端新增第二个 runtime backend 时，不需要修改工具层公开 contract。

### R17-7 跨平台与命令面补强

- 状态：进行中
- 目标：
  - 以 Windows + WSL 内部目录作为当前可接受的跨平台 fresh 基线。
  - 补更宽的命令面和边界验证，例如压缩、`tar`、更复杂目录树。
- 当前推进：
  - Windows 已 fresh 通过：runtime 定向 `jest`、`packages/server build`、`packages/web build`、root `lint`、`smoke:server`、`smoke:web-ui`。
  - WSL 内部目录已 fresh 通过：`packages/server` runtime 定向 `jest` 与 root `smoke:server`，日志位于 `/home/test/garlic-claw-wsl-internal/other/test-logs/2026-04-20-r17-runtime/`。
  - `smoke:server` 已补 `bash-workdir-loop`、`bash-timeout-loop`、`bash-tar-loop` 三条端到端证据，当前新增命令面不再只停在定向单测。
  - 用户已明确接受“没有原生 Linux 时，以 WSL 视作当前 Linux 侧等价基线”；因此本条剩余工作不再被原生 Linux 环境阻塞。
- 验收：
  - Windows 与 WSL 内部目录都有新鲜证据。
  - `smoke:server` 与定向 runtime `jest` 覆盖新增命令面。

### R17-8 `lsp` 与后续本地工具层

- 状态：已取消
- 取消原因：
  - 用户已明确决定当前不做 `lsp`，并从当前路线中移除。
  - 仓库当前没有真正落地到 `packages/` 主代码的 `lsp` 实现，只有预备规划，不存在额外运行时代码需要回滚。
- 保留结论：
  - `other/opencode` 的 `bash / read / write / edit / grep / lsp` 围绕真实项目 worktree 运转，而不是会话临时工作区。
  - 当前 Garlic Claw 的 `bash / read / glob / grep / write / edit` 明确绑定 `sessionId + runtime workspace backend`，这是稳定的 runtime 语义，但不等于 OpenCode 的本地项目工具语义。
  - 如果未来重新评估 `lsp`，必须先决定是否新增一层“project/worktree tool backend”作为独立 owner，不能直接挂到现有 runtime workspace 文件链上。

### R17-9 skill 目录清理与天气 skill 收口

- 状态：已完成
- 目标：
  - 删除当前仓库里与目标设计无关的旧 skill 目录，只保留真实需要的天气查询 skill。
  - 把“查询天气”从仓库默认 MCP 示例改成仓库 skill，不再默认内置天气 MCP 配置。
  - 补上天气 skill 的脚本资产识别与代码执行验证，确保 skill 资产和现有 `bash` 工具链能给出可靠证据。
- 验收：
  - 仓库 `skills/` 目录只保留天气 skill。
  - `mcp/servers/weather-server.json` 删除，默认 MCP 配置不再内置天气查询。
  - server / web 定向测试、build、lint、`smoke:server`、`smoke:web-ui` 新鲜通过。

- 本轮执行顺序：
  1. 已完成 `R17-1`、`R17-2`、`R17-3`，runtime registry、角色路由与工具权限接线已收口。
  2. 已完成 `R17-4` 与 `R17-9`，`subagent` 公开语义和天气 skill 主链已对齐。
  3. 下一步继续 `R17-5 ~ R17-7`，做 OpenCode 语义复核、第二后端接入准备与跨平台补证据。

## 固定约束

- 不允许引入绝对路径。
- WSL 测试必须在 WSL 内部目录执行；如当前环境本身就在 Linux / WSL 内部目录则忽略迁移动作。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过才能继续。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 不接受把 persona 复杂度继续藏在普通插件顺序或隐式 prompt 覆盖里。
