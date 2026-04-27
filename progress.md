# Progress

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
