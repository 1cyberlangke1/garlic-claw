# Progress

## 2026-04-28 shell backend 持久会话修复

- 已完成本轮修复：
  - `native-shell / wsl-shell` 已改成按 `sessionId` 复用的持久 shell 会话
  - `just-bash` 保持单次无状态执行
  - shell tool 描述、descriptor 能力与清理链路已同步
- 已定位并修复两个真实缺陷：
  - PowerShell 持久会话 marker 丢了首个制表符，导致成功命令被误判成 `exitCode=1`
  - 每次 `executeCommand` 都把 `cwd` 重置回会话根，导致 `cd` 无法跨调用保持
- 已补清理链路：
  - 持久 shell 会话关闭改为可等待
  - 对话删除会等待 runtime workspace 真正删除后再返回
  - 超时分支不再过早把会话从 map 移除
- 本轮 fresh 验收已通过：
  - `npm run build -w packages/server`
  - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\execution\\runtime\\runtime-native-shell.service.spec.ts`
  - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\execution\\runtime\\runtime-session-environment.service.spec.ts tests\\execution\\bash\\bash-tool.service.spec.ts tests\\execution\\tool\\tool-registry.service.spec.ts`
  - `npm run typecheck:server`
  - `npm run smoke:server`
- 额外记录：
  - 已顺手补齐 legacy todo 迁移 fallback：
    - 当独立 todo 存储文件不存在时，会从旧 conversations 存储里的 `todos` 字段迁移
    - 迁移后会把旧 conversations 文件中的 `todos` 字段清掉
  - 已通过：
    - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\runtime\\host\\runtime-host-conversation-record.service.spec.ts --testNamePattern "drops legacy todos from conversation storage payload after reload"`
    - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\runtime\\host\\runtime-host-conversation-todo.service.spec.ts tests\\execution\\todo\\todo-tool.service.spec.ts`

## 2026-04-27 runtime/workspace 路径收口与 tmp 清理

- 已完成本轮路径收口：
  - runtime 工作目录默认根改到仓库根 `workspace/runtime-workspaces`
  - server 默认状态文件改到 `workspace/server-state`
  - `packages/server/tmp` 不再作为运行态默认写入位置
- 已完成本轮自动清理：
  - 服务启动时会删除旧 `packages/server/tmp`
  - Jest 临时产物已改到 `workspace/test-artifacts/server/process-<pid>`，并由 `globalSetup/globalTeardown` 清理
  - `http-smoke` 结束后会删除自己的 `workspace/test-artifacts/http-smoke/*` 目录，并回收空父目录
- 已完成仓库清理：
  - 当前 `packages/server/tmp` 已删除
  - `workspace/test-artifacts` fresh 验收后可回收为空
- 本轮 fresh 验收已通过：
  - `npm run typecheck:server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/server-workspace-paths.spec.ts tests/execution/runtime/runtime-session-environment.service.spec.ts tests/runtime/host/runtime-host-user-context.service.spec.ts tests/plugin/persistence/plugin-persistence.service.spec.ts tests/ai-management/ai-provider-settings.service.spec.ts tests/execution/mcp/mcp.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts`
  - `npm run smoke:server`

## 2026-04-27 CRUD 覆盖补齐

- 已完成当前 CRUD 覆盖收口：
  - `AiController` 已补齐 provider/model/config 缺失 CRUD 单测
  - `http-smoke.mjs` 已给既有删除链路补删后不可读/不可见校验
  - `/compact` fake smoke 已删除不稳定的“必须触发摘要模型请求”硬断言，专用 summary smoke 继续单独验模型请求
- 本轮 fresh 验收已通过：
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/adapters/http/ai/ai.controller.spec.ts`
  - `npm run smoke:server`
  - `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=nvidia npm run smoke:server:real`
  - `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=ds2api npm run smoke:server:real`
  - `npm run typecheck:server`
  - `npm run lint`
- 独立 judge：
  - `PASS`
  - 已确认本轮未引入 fake/real 平行复制控制流，也未出现假成功验收

## 2026-04-27 LLM 覆盖矩阵与 smoke 复用收口

- 已把 `TODO.md / task_plan.md` 切换到当前任务：
  - 目标改为“所有调用 LLM 的路径覆盖、fake/real smoke 复用、测试产物自动清理”
  - 旧的 provider 修复阶段已压缩为摘要
- 已确认当前真实能力边界：
  - `nvidia` 与修正后的 `ds2api` 可用于真实文本 smoke
  - 当前仓库内无已配置、可直接用于真实图片输入的 provider，因此 `vision fallback` 只能保证 fake 覆盖
- 本轮已完成：
  - `http-smoke.mjs` 已抽出 fake/real 共用的 provider、对话、删除、上下文压缩步骤
  - 修复 fake smoke 中 `/compact` 断言，改为核对“命令短路但允许摘要模型请求”
  - `ContextGovernanceService` 的压缩摘要保持 owner 级显式 transport 选择，不恢复全局重放回退
  - fake smoke 已补 `RuntimeHostService` 的 `llm.generate-text / llm.generate` 端到端覆盖
  - `ContextGovernanceService` 新单测已通过
  - `nvidia` / `ds2api` 真实 smoke 均已 fresh 通过到 `testConnection / chat / title / context-compaction / delete`
  - 真实 smoke 的 `/compact` 已改为“先两轮真实对话，再用 `keepRecentMessages: 2` 复用同一套 compaction 步骤”，避开 `nvidia` 在“只压单条用户历史”时返回 `Invalid JSON response`
  - 已再次通过：
    - `packages/server`: 定向 Jest 8 套件
    - root: `npm run smoke:server`
    - root: `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=nvidia npm run smoke:server:real`
    - root: `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=ds2api npm run smoke:server:real`
    - root: `npm run typecheck:server`
    - root: `npm run lint`
- 当前剩余：
  - 仅剩提交
- 独立 judge 结果：
  - `PASS`
  - 未发现 fake/real 平行复制、清理缺失、假成功回退或 LLM owner 漏项

## 2026-04-27 真实 provider 冒烟与默认 provider 行为修复

- 已确认两处假成功：
  - `AiManagementService.testConnection()` 直接返回 `ok: true`
  - 现有 `smoke:server` 主要覆盖 fake provider，不代表真实厂商可用
- 已确认一个默认行为问题：
  - 未显式指定 provider 时，会按 provider 列表顺序回落
  - 当前仓库中的占位 provider 配置可能误入默认路径
- 当前正在做：
  - 保留真实 smoke 路径，继续看本机 `ds2api` TLS 失败是否属于代码问题还是环境问题
- 已完成：
  - `TODO.md / task_plan.md / progress.md / findings.md` 已切到当前 provider 任务
  - 默认 provider 选择已改为优先真实已配置 provider，不再优先占位 key provider
  - `testConnection` 已改成真实联网调用，不再写死 `ok: true`
  - `http-smoke.mjs` 已新增真实 provider 路径：
    - 支持 `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID`
    - 支持 root `npm run smoke:server:real`
    - 从当前配置复制指定 provider 到临时 smoke 配置目录
    - 真实验证 provider 详情、模型配置、真实 `testConnection`、真实对话 SSE
  - 已通过：
    - `packages/server`: `npm run build`
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai-management/ai-provider-settings.service.spec.ts tests/ai-management/ai-management.service.spec.ts tests/ai/ai-model-execution.service.spec.ts`
    - root: `npm run smoke:server`
- 已执行真实 smoke：
  - `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=ds2api npm run smoke:server:real`
  - 当前在本机失败于真实 `testConnection`
  - 失败信息已明确暴露为 TLS 建连失败，而不是假成功
- 2026-04-27 本轮 fresh 验收补充结果：
  - 已再次通过：
    - `packages/server`: `npm run build`
    - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai-management/ai-provider-settings.service.spec.ts tests/ai-management/ai-management.service.spec.ts tests/ai/ai-model-execution.service.spec.ts`
    - root: `npm run smoke:server`
  - 已再次失败：
    - root: `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=ds2api npm run smoke:server:real`
  - 额外链路证据：
    - Windows `node:https` 直连 `https://ds2api.cyberlangke.dpdns.org/v1/models` 报 `ECONNRESET`
    - Windows `curl.exe -I https://ds2api.cyberlangke.dpdns.org/v1/models` 报 `schannel: failed to receive handshake`
    - WSL `curl -Ik https://ds2api.cyberlangke.dpdns.org/v1/models` 报 `OpenSSL SSL_connect: SSL_ERROR_SYSCALL`
    - WSL `openssl s_client -tls1_2/-tls1_3` 都显示 `unexpected eof while reading`，且 `no peer certificate available`

## 2026-04-27 skill 链路运行时故障修复

- 已确认这不是“没用 skill”：
  - 日志里 `skill` 已成功调用两次，并返回 `weather-query`
  - 失败发生在 skill 后续依赖的 runtime tool 链路
- 已确认当前直接故障点：
  - 工具名被污染成 `skill<|channel|>commentary`、`bash<|channel|>commentary`、`webfetch<|channel|>commentary<|channel|>`
  - shell backend 落到 `native-shell` 后尝试 `powershell.exe`，当前实际执行环境报 `ENOENT`
  - `webfetch` 直接拒绝 `application/text`
- 本轮已完成：
  - `AiModelExecutionService` 已在 repair 阶段优先把被污染的工具名清洗回已知工具，不再直接掉进 `invalid`
  - `runtime-host-values` 已同步清洗流式 tool name，避免前端继续看到带 `<|channel|>` 的名称
  - `runtime-tools` 配置默认 backend 已改为 Windows `just-bash`
  - 当 Windows 配置显式写成 `native-shell`，但宿主上找不到 `powershell.exe / pwsh.exe` 时，会自动回退到 `just-bash`
  - `RuntimeNativeShellService` 已补 `pwsh.exe / pwsh` 候选，并在缺少 PowerShell 时给出明确报错
  - `webfetch` 已支持 `application/text`
- 本轮 fresh 验收已通过：
  - `npm run typecheck:server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai/ai-model-execution.service.spec.ts tests/execution/webfetch/webfetch-service.spec.ts tests/execution/runtime/runtime-tools-settings.service.spec.ts`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/runtime/runtime-native-shell.service.spec.ts`
  - `npm run smoke:server`

## 2026-04-27 默认模型重启后恢复错误

- 用户反馈：
  - 前端已把 `openai/gpt-oss-20b` 设为默认模型
  - 重启后 UI 又显示成别的模型
- 已确认当前直接证据：
  - `config/ai/providers/nvidia.json` 中 `defaultModel` 已经写成 `openai/gpt-oss-20b`
  - 所以问题不在 `setDefaultModel` 写盘失败
- 本轮已完成：
  - 后端已新增 `GET /ai/default-selection`，直接暴露已持久化的默认 provider/model 选择
  - shared 已补 `AiDefaultProviderSelection` 公共契约，前后端不再各自拼 shape
  - 聊天页恢复模型时已改为：
    - 先尊重当前会话内最后一条 assistant 的 provider/model
    - 无会话历史或历史已失效时，优先读取后端默认选择
    - 只有后端默认不可用时，才回退到前端本地枚举逻辑
  - 已补前端回归测试，覆盖“后端默认优先于本地 provider 顺序”与“后端默认失效时回退”两条路径
- 本轮 fresh 验收已通过：
  - `npm run build:shared`
  - `npm run typecheck:server`
  - `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/adapters/http/ai/ai.controller.spec.ts`
  - `npm run typecheck -w packages/web`
  - `npm run test:run -w packages/web -- tests/features/chat/modules/chat-model-selection.spec.ts`

## 2026-04-27 provider 接入语义收口与新对话默认模型修复

- 已完成本轮 provider 语义收口：
  - 公开 provider 配置与摘要已移除 `mode`
  - 前后端统一只保留 `driver`
  - 内建供应商与自定义供应商改为按 `provider id 是否等于 driver` 推断
- 已完成本轮默认模型修复：
  - AI 设置页改默认模型后，后端会显式写入默认 provider/model 选择
  - 新对话读取 `/api/ai/default-selection` 时会优先使用这条显式默认选择
  - 删除默认 provider / 默认模型时，会自动回退或清空该显式选择
- 已完成本轮 smoke 对齐：
  - `browser-smoke` 已去掉旧的“接入方式”下拉框操作
  - `http-smoke` 的 provider upsert 请求体已移除旧 `mode`
- 关于 `Restarting 'dist/src/main.js'`：
  - 当前来自 `packages/server/package.json` 的 `node --watch dist/src/main.js`
  - 只要 `tsc --watch` 重写 `dist`，Node 就会打印这行并重启后端进程
  - 这属于开发态热重启，不等于服务崩溃
- 本轮 fresh 验收已通过：
  - `npm run build -w packages/shared`
  - `npm run typecheck:server`
  - `npm run typecheck -w packages/web`
  - `npx jest --runInBand tests/ai-management/ai-management.service.spec.ts tests/ai-management/ai-provider-settings.service.spec.ts tests/adapters/http/ai/ai.controller.spec.ts`
  - `npx vitest run tests/features/ai-settings/components/provider-editor-form.spec.ts tests/features/ai-settings/components/AiProviderSidebar.spec.ts tests/features/ai-settings/components/AiProviderModelsPanel.spec.ts tests/features/chat/modules/chat-model-selection.spec.ts tests/features/ai-settings/composables/use-provider-settings.spec.ts tests/components/ModelQuickInput.spec.ts`
  - `npm run smoke:server`
  - `npm run smoke:web-ui`

## 2026-04-28 weather skill 默认入口收口

- 已开始本轮 weather skill 收口：
  - 已读取 `TODO.md / task_plan.md / findings.md / progress.md`
  - 已确认当前 `weather-query` skill 仍把默认执行路径写成内联 `curl`
  - 已确认当前 `weather.js` 只是最小 `fetch wttr.in` 脚本
- 已补历史对照：
  - 找到 skill 之前的天气入口提交 `1bda57f`
  - 已确认更早还存在 `weather-server` MCP 配置与测试
- 当前下一步：
  - 修改 weather skill 为中性说明，默认引导到脚本
  - 完善脚本与补对应测试
- 本轮已完成：
  - `weather-query` skill 已改成中性说明，不再默认引导到内联 `curl`
  - skill 默认执行方式已改为：
    - `workdir` 指向 skill `Base directory`
    - 执行 `node scripts/weather.js "<地点>"`
  - `weather.js` 已改成可直接 `node` 运行的 CommonJS 脚本
  - 脚本已补：
    - 参数校验
    - 超时与 HTTP 错误透传
    - JSON 解析校验
    - 地点优先使用用户输入
    - 描述优先读取 `lang_zh-cn`
    - 当前天气 + 最近两天摘要的单行输出
  - 已新增回归测试：
    - `project-weather-skill.spec.ts`
    - `weather-script.spec.ts`
- 本轮 fresh 验收已通过：
  - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\execution\\skill\\project-weather-skill.spec.ts tests\\execution\\skill\\weather-script.spec.ts`
  - `npm run typecheck:server`
  - `npm run lint`
  - `npm run smoke:server`
  - `node config\\skills\\definitions\\weather-query\\scripts\\weather.js "广东中山"`

## 2026-04-28 shell 工具名动态化与 PowerShell workdir 修复

- 已开始本轮调查：
  - 已重新读取 `task_plan.md / findings.md / progress.md`
  - 已读取 `systematic-debugging` 与 `planning-with-files-zh` 约束
  - 已确认 PowerShell 下 `workdir` 问题不是脚本文案，而是 runtime 路径归一化错误
- 当前调查结论：
  - `resolveRuntimeVisiblePath()` 不识别 `D:\\...` 这类 Windows 绝对路径
  - shell 工具名当前仍固定由 `BashToolService.getToolName()` 返回 `bash`
- 本轮已完成：
  - 新增 `runtime-shell-tool-name.ts`，统一收口 shell 工具主名、alias 与 host 绝对 `workdir` 判定
  - `native-shell / wsl-shell` 已支持直接接受 host 绝对 `workdir`，不再把 `D:\\...` 误拼成 `/D:\\...`
  - runtime tool registry、tool call repair、runtime host 审批链路已按 backend 动态暴露 `bash / powershell`
  - shell 工具输入报错已改成动态前缀，例如 `powershell.command`
  - runtime shell 文本输出已支持动态结果标签：`<bash_result> / <powershell_result>`
  - `http-smoke.mjs` 已把 shell 工具提示词、fake provider 触发条件、SSE 断言、超时错误断言与结果包装识别全部改成按 backend 派生
  - `tool-registry.service.spec.ts` 中与 `native-shell` / `native-shell-alias` 直接相关的失败用例已改为按 backend 取真实工具名
- 本轮 fresh 验收已通过：
  - `npm run typecheck:server`
  - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\execution\\runtime\\runtime-command-output.spec.ts tests\\execution\\tool\\tool-registry.service.spec.ts --testNamePattern "dispatches native bash tool execution through the runtime owner and persists workspace files|applies internal runtime-tools bash output config through the internal settings owner|exposes powershell as the shell tool name when native-shell is selected on Windows"`
  - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\execution\\bash\\bash-tool.service.spec.ts tests\\execution\\runtime\\runtime-native-shell.service.spec.ts tests\\runtime\\host\\runtime-host-runtime-tool.service.spec.ts tests\\execution\\tool\\model-tool-call-name.spec.ts`
  - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\execution\\tool\\tool-registry.service.spec.ts --testNamePattern "exposes powershell as the shell tool name when native-shell is selected on Windows|applies internal runtime-tools bash output config through the internal settings owner|routes internal runtime-tools bash execution through the configured shell backend|supports hot-switching internal runtime-tools bash execution to the platform-scoped secondary backend|surfaces powershell native network command hints in bash permission requests|surfaces powershell env destination expansion in copy-item permission requests|surfaces braced powershell env destination expansion in copy-item permission requests|surfaces powershell env destinations after filesystem provider prefixes in copy-item permission requests|does not surface single-quoted powershell env redirection as external write hints in bash permission requests|surfaces powershell env path expansion in set-content permission requests|surfaces braced powershell env path expansion in set-content permission requests|surfaces braced powershell env paths after filesystem provider prefixes in set-content permission requests|does not surface single-quoted powershell env destinations as external writes in copy-item permission requests|does not surface single-quoted braced powershell env paths as external writes in set-content permission requests|does not surface powershell local variable paths as external writes in set-content permission requests|does not surface braced powershell local variable paths as external writes in set-content permission requests|does not surface provider braced powershell local variable paths as external writes in set-content permission requests|surfaces powershell Join-Path command substitution destinations as external writes in copy-item permission requests|surfaces powershell Join-Path local variable destinations as external writes in copy-item permission requests|surfaces provider-prefixed powershell Join-Path command substitution destinations as external writes in copy-item permission requests|surfaces powershell Join-Path-assigned local variable destinations as external writes in copy-item permission requests|surfaces parenthesized powershell Join-Path destinations as external writes in copy-item permission requests|routes bash execution to the configured shell backend without changing tool contract|routes bash execution to the real native-shell backend|routes bash execution through a third shell backend kind without changing tool owner|surfaces powershell AST hints through native-shell alias permission requests|keeps powershell permission-chain hints when AST parsing fails|surfaces powershell local variable AST hints through native-shell alias permission requests|surfaces powershell simple subexpression local variable AST hints through native-shell alias permission requests"`
  - `npm run smoke:server`
  - `npm run smoke:web-ui`
- 额外记录：
  - 初次整文件超时的根因已定位为测试自身残留句柄，不是生产代码慢
  - 直接触发点是 `keeps bash workdir and timeout semantics stable through the native tool contract` 仍取 `toolSet?.bash`，导致本地 `slowServer` 在断言失败后未关闭
  - 修复该用例后，完整 `tests\\execution\\tool\\tool-registry.service.spec.ts` 已 fresh 通过：
    - `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --no-cache tests\\execution\\tool\\tool-registry.service.spec.ts`
