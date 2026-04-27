# Task Plan

## 2026-04-27 provider 回迁修复

### 当前阶段

1. 定位 provider 消失来源
   - 真实写盘 owner 在后端 `AiProviderSettingsService -> saveAiSettings(...)`
   - 问题不是前端直写文件，而是后端默认路径从旧单文件切到 `config/ai/` 后没有迁移旧数据
2. 修复目标
   - 保持“每个 provider 一个 JSON 文件”
   - 启动读取时执行一次性旧配置回迁
   - 不覆盖新目录里已存在的同名 provider 文件
3. fresh 验收
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai-management/ai-provider-settings.service.spec.ts`
4. judge 要求
   - 明确 owner 仍是后端
   - 明确迁移结果仍是 `config/ai/providers/*.json`
   - 明确迁移只补缺失项，不覆盖同名现存文件
5. 收口补强
   - 增加断言：已有 `openai.json` 保留当前 `apiKey`，不被 legacy 单文件覆盖
   - 调整迁移：当 structured 配置已与 legacy 等价时，也归档 legacy 文件，避免重复扫描
6. 本轮 fresh
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/ai-management/ai-provider-settings.service.spec.ts`
   - `packages/server`: `npm run smoke:http`
   - `packages/web`: `node tests/smoke/browser-smoke.mjs`
7. 独立 judge
   - 结果：`PASS`
   - 结论：后端 owner、分文件目标、只补缺失 provider 三条均成立

## 2026-04-26 体积治理与 owner 收口

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

- 当前 `packages/server/src` 非空行数：`14998`
- `<=15000` 目标已命中，当前只差 `P8` 独立 judge 收口
- 本轮证明：中型稳定 owner 也能一次性大块净减，不必硬撞最宽主链

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
12. `P7` 配置/网关 owner 压体积
   - 重写：`plugin-bootstrap.service.ts`
   - 重写：`ai-management-settings.store.ts`
   - 重写：`runtime-gateway-connection-lifecycle.service.ts`
   - 目标：继续净减且不改公开语义
13. `P7` 独立 judge
   - 结论：`PASS`
   - `plugin-bootstrap / ai-settings / gateway` 三个 owner 都是真收口
   - `V3` 总目标仍未完成，当前 `packages/server/src = 15598`
14. `P8` subagent / text-replace / event-log owner 压体积
   - 重写：`runtime-host-subagent-session-store.service.ts`
   - 重写：`runtime-text-replace.ts`
   - 重写：`runtime-event-log.service.ts`
   - 结果：`packages/server/src = 14998`
15. `P8` fresh 验收
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/runtime/host/runtime-host-subagent-session-store.service.spec.ts tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/execution/mcp/mcp.service.spec.ts`
   - root: `npm run smoke:server`
   - root: `node tools/count-server-src-lines.mjs`
16. `P8` 独立 judge
   - 结论：`PASS`
   - `subagent-session-store / runtime-text-replace / runtime-event-log` 三个 owner 都是真收口
   - `V3` 总目标已完成，当前 `packages/server/src = 14998`
17. 旧会话 ID / 标题 prompt 回归修复
   - 服务端启动时清理非 `uuidv7` 会话与其遗留 todo
   - 前端会话链只拦截“UUID 形状但不是 v7”的旧 ID，避免误伤非 UUID 测试夹具
   - 标题插件拒收内部标题 prompt 的回显结果，防止 smoke provider 把提示词写成会话标题
18. 本轮 fresh 验收
   - `packages/plugin-sdk`: `npm test`
   - `packages/server`: `npm run typecheck`
   - `packages/server`: `npm test -- tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/plugin/builtin/hooks/builtin-conversation-title.plugin.spec.ts`
   - `packages/web`: `npm run typecheck`
   - `packages/web`: `npm run test:run -- tests/features/chat/store/chat-store.module.spec.ts`
   - root: `npm run smoke:server`
   - root: `npm run smoke:web-ui`
19. `I1 runtime-tools 收回内部`
   - 删除 `builtin.runtime-tools` 旧 manifest / plugin-tool / runtime 壳文件
   - `runtime-host-runtime-tool.service.ts` 改为直接调用内部 `bash/read/glob/grep/write/edit` owner
   - `runtime-host-plugin-dispatch.service.ts` 移除 local builtin plugin 的 `runtimeTools` 旁路注入
20. `I1` fresh 验收
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-runtime-tool.service.spec.ts`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/tool/tool-registry.service.spec.ts -t "applies internal runtime-tools bash output config through the internal settings owner|routes internal runtime-tools bash execution through the configured shell backend|uses the platform default backend when internal runtime-tools shellBackend is unset|supports hot-switching internal runtime-tools bash execution to the platform-scoped secondary backend"`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/adapters/http/ai/ai.controller.spec.ts`
   - root: `npm run smoke:server`
   - `packages/web`: `npm run typecheck`
   - `packages/web`: `npm run smoke:browser`
21. `I1` 独立 judge
   - 首轮结论：`FAIL`
   - 原因：代码已达标，但 `TODO.md` 仍保留旧 owner 表述，文档同步未收口
22. `I1` 文档同步
   - 更新 `TODO.md` 的 OpenCode 对照、阶段状态、下一轮入口与历史摘要
23. `I1` 独立 judge 复核
   - 结论：`PASS`
   - 关键点：旧壳文件已删、宿主已直连内部 owner、dispatch 无 runtimeTools 旁路、前端入口仍在 AI 设置页
24. `I2 subagent 收回内部`
   - 删除旧 subagent plugin owner，新增内部 `SubagentToolService / SubagentSettingsService`
   - `ToolRegistryService` 新增 `internal:subagent` source，自动化执行链改走 `executeRegisteredTool(...)`
   - `/api/subagents/*` 与 `/api/ai/subagent-config` 已接通，前端 subagents 命名已收口
   - `plugin-sdk` 已删除旧 subagent plugin owner 的 manifest 数据，subagent schema/tool 定义改为通用 authoring helper
25. `I2` fresh 验收
   - `packages/plugin-sdk`: `npm test`
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-session-store.service.spec.ts`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/adapters/http/plugin/plugin-subagent.controller.spec.ts`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/tool/tool-registry.service.spec.ts -t "lists internal subagent tools as a dedicated internal source|routes internal subagent tools through the internal subagent owner|applies internal runtime-tools bash output config through the internal settings owner|routes internal runtime-tools bash execution through the configured shell backend|supports hot-switching internal runtime-tools bash execution to the platform-scoped secondary backend|uses the platform default backend when internal runtime-tools shellBackend is unset"`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/automation/automation.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/adapters/http/ai/ai.controller.spec.ts tests/runtime/host/runtime-host.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts`
   - `packages/web`: `npm run typecheck`
   - `packages/web`: `npm run test:run -- tests/features/subagents/composables/use-subagents.spec.ts tests/features/subagents/views/SubagentView.spec.ts`
   - root: `npm run smoke:server`
   - root: `npm run smoke:web-ui`
26. `I2` 下一步
   - 执行独立 judge，确认不存在 builtin owner 残留或仅换路径留壳
   - judge `PASS` 前，不把 `I2` 标记为 `[已完成]`
27. `I2` 独立 judge
   - 结论：`PASS`
   - 旧 subagent plugin owner 已从 server owner 与 plugin-sdk builtin manifest 双侧清除
   - `/api/subagents/*`、`/api/ai/subagent-config`、`internal:subagent`、前端 `subagents` 命名与 smoke 覆盖均已对齐
28. `I3` 上下文治理收回内部收口
   - 会话测试改为直接注入 `ContextGovernanceService / ContextGovernanceSettingsService`
   - `/compact` 命令改按真实内部上下文治理语义构造历史并断言 display 消息
   - `http-smoke` 补齐远程插件治理路由覆盖：`config / llm-preference / scopes / event-log / events / storage / crons`
29. `I3` 生产回归修复
   - 修复 `ContextGovernanceService.injectMemoryContext(...)` 对字符串消息的崩溃
   - 修复滑动/摘要窗口在存在 pending assistant 时误算前缀，导致 persona `beginDialogs` 与 vision fallback 描述丢失
30. `I3` fresh 验收
   - `packages/plugin-sdk`: `npm test`
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-planning.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
   - `packages/web`: `npm run typecheck`
   - root: `npm run smoke:server`
31. `I3` 下一步
   - 更新 `TODO.md / progress.md / findings.md`
   - 发起独立 judge，确认 builtin hook owner 已真正迁走，且前端/命令目录/烟测覆盖都已切到内部链路
32. `I3` 首轮 judge 失败后的收口
   - 启动时删除退役 builtin 持久化记录，避免旧工作区把上下文 builtin 继续暴露到插件页
   - `RuntimePluginGovernanceService` 只允许真实 builtin definition 暴露 `reload`
   - 删除旧 builtin hook spec，重写 `plugin-bootstrap / runtime-kernel` 对应断言
   - `plugin-sdk` authoring 与 `docs/插件开发指南.md` 移除上下文 builtin 对外声明
33. `I3` 二次 fresh
   - `packages/plugin-sdk`: `npm test`
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts`
   - root: `npm run smoke:server`
34. `I3` 二次下一步
   - 重新执行独立 judge
   - 若 judge `PASS`，把 `I3` 标记为 `[已完成]`
35. `I3` 二次独立 judge
   - 结论：`PASS`
   - 退役 builtin 清理、local `reload` 收口、plugin-sdk authoring 清理与文档同步都已通过复核
36. `I3` 收口
   - `TODO.md` 已标记 `I3 [已完成]`
   - 下一阶段切到 `I4 内部配置中心与残余 builtin 清理`
37. `I4` 残余 builtin manifest 与前端配置语义收口
   - `plugin-sdk` 删除 `builtin.provider-router / builtin.persona-router` manifest 导出
   - 前端新增通用 `SchemaConfigForm / SchemaConfigNodeRenderer`，删除旧插件前缀配置组件
   - `AI 设置` 与 `插件页` 都已切到通用 schema 配置组件；内部页不再显示插件配置头
38. `I4` fresh 验收
   - `packages/web`: `npm run typecheck`
   - `packages/web`: `npm run test:run -- tests/features/plugins/components/SchemaConfigForm.spec.ts tests/features/plugins/components/PluginSidebar.spec.ts tests/features/plugins/components/PluginScopeEditor.spec.ts tests/features/plugins/composables/use-plugin-management.spec.ts tests/features/plugins/views/PluginsView.spec.ts`
   - `packages/plugin-sdk`: `npm test`
   - `packages/server`: `npm run build`
   - root: `npm run smoke:server`
   - root: `npm run smoke:web-ui`
39. `I4` 下一步
   - 发起独立 judge，确认残余伪 builtin 已清理、前端入口仍可访问，且内部配置不再伪装成插件组件
40. `I4` 独立 judge
   - 结论：`PASS`
   - `provider-router / persona-router` 已不再以 builtin plugin manifest 对外暴露
   - 内部配置入口已切到 `SchemaConfigForm / SchemaConfigNodeRenderer`
   - 插件页配置入口仍保留，未误删真实外部扩展能力
41. `I0/I4` 收口
   - `TODO.md` 已标记 `I0 [已完成]`、`I4 [已完成]`
   - 本阶段后续只剩 residual risk 跟踪，不再重复展开已完成细节
42. `V4` 上下文治理 / 会话链压体积启动
   - 修正 `TODO.md` 中 `I4.3` 的漏状态
   - 新阶段目标：优先压 `context-governance.service.ts` 与 `conversation-message-planning.service.ts`
   - 目标是在不改行为的前提下，把 `packages/server/src` 从 `15534` 压回 `<= 15000`
43. `V4` conversation owner 收口
   - 重写并压缩：`context-governance.service.ts`
   - 收紧：`context-governance-settings.service.ts`
   - 收紧：`conversation-message-planning.service.ts`
   - 同 owner 补刀：`runtime-host-conversation-record.service.ts`
   - 结果：`packages/server/src` 降到 `14925`
44. `V4` fresh 验收
   - `packages/server`: `npm run build`
   - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-planning.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts`
   - root: `npm run smoke:server`
   - root: `node tools/count-server-src-lines.mjs`
45. `V4` 下一步
   - 发起独立 judge
   - judge `PASS` 前，不把 `V4` 标记为 `[已完成]`
46. `V4` 独立 judge
   - 结论：`PASS`
   - 四个目标文件都在原 owner 内真实收口，不是换名、换路径或拆壳
   - `summary / sliding / memory / title` 四条语义仍在主链
47. `V4` 收口
   - `TODO.md` 已标记 `V4 [已完成]`
   - 当前 `packages/server/src = 14925`
48. `I5 plugin-sdk authoring 语义收口`
   - 删除 `builtin-manifests` 旧聚合入口
   - 把内部默认值/schema 直接接回 `prompt-helpers / conversation-helpers / context-compaction / router-helpers`
   - 清理未被生产链使用、易误导的 builtin manifest 聚合导出
49. `I5` 验收计划
   - `packages/plugin-sdk`: `npm test`
   - `packages/server`: `npm run build`
50. runtime-tools shell 选项补齐
   - Windows 前端配置重新暴露 `just-bash`
   - Linux 继续只暴露 `bash`
   - 同步核对 `wsl-shell` 不是占位实现，而是 `wsl.exe --cd ... bash -lc ...`
50. `I5` 下一步
   - 完成代码与文档同步后发独立 judge
51. `I5` 代码与文档同步
   - 新增 `authoring-config-data.json`
   - 删除 `builtin-manifest-data.json / builtin-manifests.ts`
   - `prompt-helpers / conversation-helpers / context-compaction / router-helpers` 已直接接回默认值与 schema
   - `docs/插件开发指南.md` 已同步当前边界
52. `I5` fresh 验收
   - `packages/plugin-sdk`: `npm test`
   - `packages/server`: `npm run build`
53. `I5` 下一步
   - 发起独立 judge
54. `I5` 独立 judge
   - 结论：`PASS`
   - `builtin-manifests` 聚合入口与旧混装 JSON 已真实删除
   - `server` 依赖的 schema/default 已回到明确语义文件
55. `I5` 收口
   - `TODO.md` 已标记 `I5 [已完成]`
56. `I6 authoring barrel 收口`
   - 新增 `observation-summaries.ts`
   - `builtin-observers.ts` 退回为 observer manifest 常量文件
   - 根 `authoring/index.ts` 不再导出 `builtin-observers`
57. `I6` fresh 验收
   - `packages/plugin-sdk`: `npm test`
58. `I6` 下一步
   - 发起独立 judge
59. `I6` 独立 judge
   - 结论：`PASS`
   - 根 `authoring` 入口已不再暴露 observer manifest
   - 反向断言已补上，测试防回退缺口已收口
60. `I6` 收口
   - `TODO.md` 已标记 `I6 [已完成]`
61. `I7 observer manifest 死代码清理`
   - 删除 `builtin-observers.ts`
   - 删除 `builtin-observer-manifests.json`
   - `docs/插件开发指南.md` 已删除对应残留表述
62. `I7` fresh 验收
   - `packages/plugin-sdk`: `npm test`
63. `I7` 下一步
   - 发起独立 judge
64. `I7` 独立 judge
   - 结论：`PASS`
   - 已删除文件不存在隐藏消费链
   - authoring 导出边界仍完整
65. `I7` 收口
   - `TODO.md` 已标记 `I7 [已完成]`
66. `I8 authoring 文案去歧义`
   - `docs/插件开发指南.md` 已把 authoring 静态资产与运行时 builtin plugin 的措辞分开
   - `packages/plugin-sdk/tests/index.test.js` 已同步测试名
67. `I8` fresh 验收
   - `packages/plugin-sdk`: `npm test`
68. `I8` 下一步
   - 发起独立 judge
69. `I8` 独立 judge
   - 结论：`PASS`
   - 文档与测试命名已与当前 authoring 边界对齐
70. `I8` 收口
   - `TODO.md` 已标记 `I8 [已完成]`
71. `I9 前端测试命名去噪`
   - 配置表单测试已统一到 `SchemaConfigForm.spec.ts`
   - subagents composable 测试已统一到 `use-subagents.spec.ts`
   - subagents 视图测试中的 owner 夹具已统一到内部语义
   - 历史验收记录里的旧路径同步更新
72. `I9` fresh 验收
   - `packages/web`: `npm run test:run -- tests/features/plugins/components/SchemaConfigForm.spec.ts tests/features/subagents/composables/use-subagents.spec.ts tests/features/subagents/views/SubagentView.spec.ts`
73. `I9` 独立 judge
   - 结论：`PASS`
   - 三个前端测试文件名、夹具语义与过程文档记录已全部对齐
74. `I9` 收口
   - `TODO.md` 已标记 `I9 [已完成]`
   - `I8 / I9` 已压缩成完成摘要
