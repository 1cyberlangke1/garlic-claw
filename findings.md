# Findings

## 2026-04-28 shell backend 持久会话修复

- 当前实现与用户要求不一致：
  - `native-shell` 的 descriptor 仍写成 `persistentShellState: false` / `deny`
  - `wsl-shell` 也是同样配置
  - 结果是三个 backend 实际上都无状态，只有 `just-bash` 无状态这一例外并未成立
- 当前直接根因不只在 descriptor，还在执行 owner：
  - `RuntimeNativeShellService` 每次调用都 `spawn(..., '-Command', command)`
  - `RuntimeWslShellService` 每次调用都 `spawn('wsl.exe', ['--cd', ..., 'bash', '-lc', input.command])`
  - 这决定了 `cd`、shell 变量、导出环境都不会跨调用保存
- `other/opencode` 的 PTY 实现已证明持久 shell 会话需要至少具备：
  - 每个会话一个长期进程
  - 输入写入与输出采集
  - 显式 remove / finalizer 清理
  - 会话列表或按 sessionId 索引的 owner
- 当前还需要同步的外层 contract 不只生产代码：
  - `bash-tool.service.ts` 的提示词仍默认“依赖前序命令时放进同一条命令”
  - runtime 权限 descriptor 仍宣称不支持持久 shell state
  - 相关 Jest 断言基于当前错误 contract，需要一起改
- PowerShell 持久会话误报失败的直接根因已经确认：
  - marker 输出字符串首个分隔符被写成了字母 `t`，不是制表符
  - 结果 `consumeStdoutChunk()` 读到的退出码文本是 `t0`，`parseInt()` 失败后被回退成 `1`
- 仅让会话复用进程还不够：
  - 如果 `executeCommand()` 在未显式传 `workdir` 时仍把请求目录重算成会话根，持久 shell 的 `cd` 状态会被宿主层覆盖掉
  - 所以“默认沿用当前 shell cwd，只有显式 `workdir` 才切目录”是必要 contract
- Windows 清理链路的关键点在超时分支：
  - 命令超时时如果先把会话从 map 移除，再杀进程，后续就没有 owner 能等待 `close`
  - 这会在测试或对话删除时留下短暂未释放的目录句柄，表现为 `EPERM`
- 对话删除路径不能只 fire-and-forget：
  - `smoke:server` 明确要求删除对话后 runtime workspace 立即不存在
  - 因此 `deleteConversation()` 必须等待 `deleteSessionEnvironment()` 完成，而不是后台异步回收
- legacy todo 迁移的缺口也已确认：
  - `RuntimeHostConversationTodoService` 只读独立 todo 存储文件时，旧 conversations 文件里的 `todos` 无法被迁移
  - 正确行为应是：独立 todo 存储不存在时，回退读取 legacy `todos`，写入新 todo 存储，并把旧 conversations 文件里的 `todos` 字段清掉

## 2026-04-27 runtime/workspace 路径收口与 tmp 清理

- 用户看到“tmp 下面是空的，但工具说写成功”的直接原因，不是工具没写出，而是默认 runtime workspace 根放在 `packages/server/tmp/runtime-workspaces/<conversationId>`。
- 仅把默认路径改到 `workspace/` 还不够；如果不同时删掉 legacy 读取分支和旧 tmp 启动清理，仓库仍会继续保留旧垃圾。
- `workspace/test-artifacts` 的自动清理不能挂在服务启动期：
  - `smoke:http` 自己会把 SQLite 与脚本产物放进 `workspace/test-artifacts/http-smoke`
  - 如果后端启动时直接清空整个 `test-artifacts`，会误删 smoke 当前正在使用的临时目录
- Jest 的测试残留也不能只靠 `process.on('exit')`：
  - 在当前仓库里，Jest 进程结束后仍会留下 `config-ai.server.test-* / plugins.server.test-*` 等目录
  - 把清理挂到 Jest 自身的 `globalSetup/globalTeardown` 更可靠
- 当前较稳的分层是：
  - runtime 会话工作目录：`workspace/runtime-workspaces`
  - server 持久状态：`workspace/server-state`
  - Jest 临时产物：`workspace/test-artifacts/server/process-<pid>`
  - smoke 临时产物：`workspace/test-artifacts/http-smoke/*`，由脚本 finally 删除

## 2026-04-27 CRUD 覆盖补齐

- `AiController` 当前已覆盖：
  - `listProviderCatalog`
  - `listProviders / getProvider / deleteProvider`
  - `discoverModels / testConnection`
  - `listModels / upsertModel / setDefaultModel / deleteModel`
  - `updateModelCapabilities`
  - `get/update` vision-fallback / host-model-routing / runtime-tools / subagent-config / context-governance-config
- `http-smoke.mjs` 当前已补的删后校验：
  - `ai.model.delete` -> `ai.model.list.after-delete`
  - `ai.provider.delete` -> `ai.provider.get.after-delete` / `ai.providers.list.after-delete`
  - `plugins.storage.delete` -> `plugins.storage.list.after-delete`
  - `plugins.crons.delete.success` -> `plugins.crons.list.after-delete`
  - `plugins.sessions.delete.success` -> `plugins.sessions.list.after-delete`
  - `plugins.remote.delete` -> `plugins.list.after-remote-delete`
  - `chat.conversation.delete` -> detail 404 / list 不可见
- `/compact` smoke 结论：
  - 通用命令 smoke 只应校验 display message 不进入模型上下文
  - 是否触发摘要模型请求必须放在 `compact-with-summary` 专用步骤里单独断言

## 2026-04-27 LLM 覆盖矩阵与 smoke 复用收口

- 当前真实可用 provider 能力：
  - `nvidia` 已通过真实 smoke，适合覆盖文本与 tool-call 链路
  - `ds2api` 在更正为 `https://dsapi.cyberlangke.dpdns.org/v1` 后已通过真实 smoke
- 当前真实不可达能力：
  - 仓库内没有已配置且可直接用于真实图片输入的 provider，因此 `AiVisionService` 只能走 fake 覆盖
- 当前主要重复点：
  - `http-smoke.mjs` 原先在 fake/real 间复制 provider/chat 控制流；本轮已收口为共用 smoke 步骤函数
- 当前主要 LLM owner：
  - `AiManagementService.testConnection / discoverModels`
  - `ConversationMessagePlanningService` 主对话流
  - `ContextGovernanceService` 标题生成、压缩摘要
  - `AiVisionService` 图片转文本
  - `RuntimeHostService` 的 `llm.generate / llm.generate-text`
  - `RuntimeHostSubagentRunnerService` 子代理执行
- 当前覆盖结论：
  - fake smoke：
    - `ConversationMessagePlanningService` 主对话
    - `ContextGovernanceService` 命令压缩
    - `RuntimeHostService` 的 `llm.generate-text / llm.generate`
    - `RuntimeHostSubagentRunnerService` 子代理工具链
  - real smoke：
    - `AiManagementService.testConnection`
    - `ConversationMessagePlanningService` 主对话
    - `ContextGovernanceService` 标题生成与压缩摘要
    - 真实 `/compact` 目前需要至少两轮可压缩历史，`nvidia` 在“只压单条用户消息”的摘要 prompt 上会返回 `Invalid JSON response`
  - Jest：
    - `AiVisionService`
    - `RuntimeHostService`
    - `RuntimeHostSubagentRunnerService`
    - `AiManagementService`
    - `ContextGovernanceService`

## 2026-04-27 真实 provider 冒烟与默认 provider 行为修复

- `testConnection` 当前是占位实现，不联网。
- 现有 `smoke:server` 用 fake provider 验证内部链路，不能证明真实 provider 可用。
- 当前默认 provider 选择依赖 provider 列表顺序；若配置目录里存在占位 provider，则可能被误选。
- 新增真实 smoke 时，不能直接复用仓库主配置写盘；应复制指定 provider 到临时 smoke 配置目录，避免污染真实配置。
- 当前新增的真实 smoke 已证明两点：
  - 代码路径已经不再伪装成功，真实失败会在 smoke 中直接暴露
  - 本机当前对 `ds2api` 的真实失败点在 `testConnection`，错误为 `Client network socket disconnected before secure TLS connection was established`
- 因为真实 smoke 现在先走真实 `testConnection`，所以后续如果聊天仍失败，可以确认不是旧的假 `testConnection` 掩盖问题。
- 新增外链证据表明失败不局限于项目代码：
  - Windows `node:https` 直连 `/v1/models` 同样在 TLS 握手前被对端断开
  - Windows `curl.exe` 同样在 TLS 握手阶段失败
  - WSL `curl` 与 `openssl s_client` 结果一致，说明不是单一运行时的 TLS 栈问题
  - 当前域名 `ds2api.cyberlangke.dpdns.org` 在本机解析到 `198.18.0.66`，流量走 `FlClash` 接口；这说明还需要结合本机代理 / TUN / fake-ip 环境判断是否属于仓库外部条件

## 2026-04-27 skill 链路运行时故障修复

- `skill` 是否被调用，不应靠主观判断；从实际日志看，`skill` 已成功返回 `weather-query`，所以问题在后续链路。
- 工具名污染目前没有仓库内显式常量；更像模型把外层工具语法中的 channel 片段直接吐进了 `toolName`。这类问题应在 repair 阶段清洗，而不是只把报错喂回模型重试。
- `webfetch` 当前只接受 `text/*`、`application/json`、`application/xml`、`application/xhtml+xml`。`wttr.in` 返回 `application/text` 时会被误拒绝。
- Windows 侧 runtime shell 当前虽然提供 `just-bash / native-shell / wsl-shell` 三种 backend，但 runtime-tools 配置 schema 默认值仍是 `native-shell`；如果前端把默认值写回配置，就会把常见 bash 风格命令推向 PowerShell 语义。

## 2026-04-28 weather skill 默认入口收口

- 当前 `bash` 工具底层说明已经会按 backend 区分 PowerShell 与 bash，但 `config/skills/definitions/weather-query/SKILL.md` 仍把默认路径写成内联 `curl`，这会把高层心智重新拉回 shell 方言。
- 当前 `weather-query/scripts/weather.js` 过于薄，只做最小 `fetch wttr.in`，缺少：
  - 参数清洗
  - URL 构造的统一处理
  - 网络异常与非 2xx 的明确报错
  - 空响应 / 多行响应的兜转为稳定单行输出
- 历史上天气能力经历过两种独立 owner：
  - `1bda57f feat(server): use direct weather and tavily tools for chat` 中的直连 HTTP 工具 `get_weather`
  - 更早的 `weather-server` MCP 配置与测试，说明天气查询以前不是靠 skill 文案拼接命令
- 旧的直连天气工具能力特征：
  - 先按 provider 顺序尝试 AMap / QWeather
  - 做 geocode 与天气查询分步调用
  - 返回结构化 current / forecast 数据，而不是单纯一条 shell 结果
- 本轮如果回到 skill + 脚本路径，至少要保证：
  - 默认入口稳定，不依赖模型自行写 shell 方言
  - 出错时给真实错误
  - 输出足够简洁，便于模型直接转述
- `wttr.in` 的 `format=j1&lang=zh-cn` 响应存在两个直接坑：
  - `nearest_area` 会把“广东中山”写成 `Guangdong / Chungshankuchih`
  - 英文字段 `weatherDesc` 仍可能是英文，但同一对象下常有 `lang_zh-cn`
- 因此脚本更稳的策略是：
  - 地点标签优先使用用户输入
  - 天气描述优先读取 `lang_zh-cn`，再回退 `lang_xx / weatherDesc`

## 2026-04-28 shell 工具名动态化与 PowerShell workdir 修复

- 当前 `native-shell` 下 `workdir` 失败的直接根因在 [runtime-visible-path.ts](/D:/Git_Repository/garlic-claw/packages/server/src/execution/runtime/runtime-visible-path.ts)：
  - `resolveRuntimeVisiblePath()` 只把 `/` 开头当作绝对路径
  - Windows 的 `D:\...` 会被当作相对路径，拼成 `/D:\...`
- 随后 [runtime-native-shell.service.ts](/D:/Git_Repository/garlic-claw/packages/server/src/execution/runtime/runtime-native-shell.service.ts) 会把这个错误虚拟路径再映射到 session host path，于是抛出 `bash.workdir 不存在: /D:\...`
- 当前 shell 工具名固定来自 [bash-tool.service.ts](/D:/Git_Repository/garlic-claw/packages/server/src/execution/bash/bash-tool.service.ts) 的 `getToolName(): "bash"`，即使 backend 已明确是 Windows PowerShell，也仍对外暴露 `bash`
- 工具名固定 `bash` 的影响不只在展示层，还进入了：
  - runtime tool overview
  - `allowedToolNames` 过滤
  - `executeRegisteredTool`
  - 冒烟与 Jest 断言
- 仅把 runtime 主链改成动态工具名还不够：
  - `http-smoke.mjs` 的 fake provider 触发条件、SSE 断言、工具结果识别、超时错误文本都写死了 `bash`
  - 所以即使真实服务已经改成对外暴露 `powershell`，smoke 仍会把正常行为误判成失败
- shell 结果包装同样是一个隐藏耦合点：
  - `renderRuntimeCommandTextOutput()` 之前固定输出 `<bash_result>`
  - PowerShell backend 下如果继续输出 `<bash_result>`，模型侧和 smoke 侧都会看到“工具名变了，结果标签没变”的不一致
- `tool-registry.service.spec.ts` 里还有一批 Windows / `native-shell(-alias)` 用例直接取 `toolSet?.bash`
  - 这些用例不代表实现失败，而是测试本身还停留在旧 contract
  - 用 backend 派生真实工具名后，这批用例可以恢复通过
- `tool-registry.service.spec.ts` 整文件此前“超时不退出”的直接触发点是：
  - `keeps bash workdir and timeout semantics stable through the native tool contract`
  - 该用例会先启动本地 `slowServer`
  - 当 `native-shell` 下仍去取 `toolSet?.bash` 时，断言会在 `slowServer.close()` 之前失败
  - 结果是测试主体其实 10 秒内就跑完，但 Jest 会因为残留 HTTP server 句柄一直挂住
