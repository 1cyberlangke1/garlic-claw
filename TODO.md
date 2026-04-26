# Garlic Claw TODO

> 这里只保留当前有效边界、阶段、验收与替代关系。
> 已完成细节压缩为摘要；过程证据见 `task_plan.md / progress.md / findings.md`。

## 总目标

- 以 `other/opencode/packages/opencode/src/tool/{bash,read,write,edit,glob,grep,todo}.ts` 为公开语义边界。
- `shared` 只保留类型共享，不放运行逻辑。
- `subagent / runtime-tools / 上下文管理` 统一收回内部 owner；插件系统只保留真正的扩展点。
- 前端保留配置界面，但不再把内部能力伪装成 builtin plugin。
- 先把 owner 边界纠正到位，再处理 `packages/server/src <= 15000` 的压体积目标。
- 不做兼容层，不保留双 owner，不接受“插件壳转发 host 同名工具”。

## 硬约束

- 不新增 `helper / helpers` 语义命名。
- 禁止 `any`，除非外部类型客观缺失且无法补齐。
- Windows 下 shell 选项允许 `PowerShell / WSL / just-bash`；Linux 下只允许 `bash`。
- `TODO.md` 已完成事项只保留摘要；未完成旧计划不能消失，只能标记为 `已完成 / 已取消 / 已废弃 / 已被新计划替代`。
- 每个阶段都必须有：
  - 代码变更
  - fresh 验收
  - 独立 judge
  - 文档同步
- 未通过 judge 的阶段不能标成 `[已完成]`。

## OpenCode 对照

| 能力 | OpenCode 源码 | 当前实际 owner | 状态 |
| --- | --- | --- | --- |
| `bash` | `other/opencode/packages/opencode/src/tool/bash.ts` | `packages/server/src/execution/bash/bash-tool.service.ts` + `packages/server/src/runtime/host/runtime-host-runtime-tool.service.ts` | 已完成，内部 owner 对齐 |
| `read` | `other/opencode/packages/opencode/src/tool/read.ts` | `packages/server/src/execution/read/read-tool.service.ts` + `packages/server/src/runtime/host/runtime-host-runtime-tool.service.ts` | 已完成，内部 owner 对齐 |
| `glob` | `other/opencode/packages/opencode/src/tool/glob.ts` | `packages/server/src/execution/glob/glob-tool.service.ts` + `packages/server/src/runtime/host/runtime-host-runtime-tool.service.ts` | 已完成，内部 owner 对齐 |
| `grep` | `other/opencode/packages/opencode/src/tool/grep.ts` | `packages/server/src/execution/grep/grep-tool.service.ts` + `packages/server/src/runtime/host/runtime-host-runtime-tool.service.ts` | 已完成，内部 owner 对齐 |
| `write` | `other/opencode/packages/opencode/src/tool/write.ts` | `packages/server/src/execution/write/write-tool.service.ts` + `packages/server/src/runtime/host/runtime-host-runtime-tool.service.ts` | 已完成，内部 owner 对齐 |
| `edit` | `other/opencode/packages/opencode/src/tool/edit.ts` | `packages/server/src/execution/edit/edit-tool.service.ts` + `packages/server/src/runtime/host/runtime-host-runtime-tool.service.ts` | 已完成，内部 owner 对齐 |
| `todowrite` | `other/opencode/packages/opencode/src/tool/todo.ts` | `packages/server/src/execution/todo/todo-tool.service.ts` | 已完成 |
| `subagent` | 无直接 OpenCode 对应；对齐本项目内部能力边界 | `packages/server/src/execution/subagent/*` + `packages/server/src/runtime/host/runtime-host-subagent-runner.service.ts` + `packages/server/src/adapters/http/subagent/subagent.controller.ts` | 已完成，内部 owner 对齐 |
| `memory-context / conversation-title / context-compaction` | 无直接 OpenCode 对应；属于本项目上下文治理 | `packages/server/src/conversation/context-governance*.ts` + `packages/server/src/adapters/http/command/command-catalog.controller.ts` + `packages/web/src/features/ai-settings/components/ContextGovernanceSettingsPanel.vue` | 已完成，内部 owner 对齐 |

## 已完成摘要

### C1-C8 历史功能阶段 `[已完成]`

- 上下文治理、前端窗口灰化、subagent 会话化、消息排队、网络收口、todo 对齐、runtime-tools 多文件 owner 拆分都已完成。
- 旧流水不再在本文件展开，证据压缩见 `task_plan.md / progress.md / findings.md`。

### I1 runtime-tools 收回内部 `[已完成]`

- `builtin.runtime-tools` 的 manifest / plugin-tool / runtime 壳文件已删除；`builtin-plugin-registry.service.ts` 与 `RuntimeHostPluginDispatchService` 都不再保留 runtime-tools plugin 旁路。
- `ToolRegistryService` 已稳定暴露 `internal:runtime-tools`；宿主执行链直接走 `bash/read/glob/grep/write/edit` 内部 owner 与 `RuntimeToolsSettingsService`。
- 前后端已接通 `/ai/runtime-tools-config` 与 AI 设置页里的“执行工具配置 / 执行工具治理”，不再通过插件页伪装内部能力；Windows 额外暴露 `just-bash` 热切换选项，Linux 仍只暴露 `bash`。
- fresh 验收已通过：`npm run -w packages/server build`、runtime-tools 相关 jest、`npm run smoke:server`、`npm run -w packages/web typecheck`、`npm run -w packages/web smoke:browser`。
- 独立 judge：`PASS`。结论：代码 owner、宿主链路、前端入口都已对齐；未见“仅换路径留壳”的假完成。

## 旧计划状态

### V1 conversation-record 压体积 `[已被 P1-P4 替代]`

- 旧方向是先压 host 大文件。
- 当前已改成先补齐 OpenCode 对齐所需功能边界。

### V2 runtime-host-runtime-tool 压体积 `[已被 P1-P4 替代]`

- 旧方向是继续压 host runtime-tool 主链。
- 当前已改成先把 builtin 主执行链迁出 host，再重开体积阶段。

### V3 体积阶段总验收 `[已完成]`

- `P1-P4` 收口后重开。
- 历史计数：`node tools/count-server-src-lines.mjs` -> `14998`。
- `P8` fresh 验收与独立 judge 已通过，本阶段收口。

## 当前阶段计划

### P1-P4 runtime-tools 对齐与收口 `[已被 I1-I4 替代]`

- 摘要：
  - 平台 shell options 已收口为 Windows `PowerShell / WSL / just-bash`、Linux `bash`
  - 语义与测试曾收口一轮，但“已迁成 direct owner”的判断已证伪
  - 当时真实状态仍是 `builtin.runtime-tools` 插件壳调用内部 runtime 服务
  - 本阶段验收记录保留，但 owner 结论失效，后续以 `I1` 新计划重做

### I0 边界校正与 inventory 收口 `[已完成]`

- 目标：
  - 把 `runtime-tools / subagent / 上下文治理` 从“伪装成 builtin plugin”改回内部能力
  - 保留前端配置界面，但不再通过插件列表伪装内部 owner
  - 清理 `TODO.md`、代码命名、清单中的失真表述
- 范围：
  - `builtin.runtime-tools` `[已完成]`
  - 旧 subagent plugin owner `[已完成]`
  - `builtin.memory-context / builtin.conversation-title / builtin.context-compaction` `[已完成]`
  - 已声明但未接线的 `builtin.provider-router / builtin.persona-router` `[已完成]`
- fresh 验收：
  - 文档层：`TODO.md / task_plan.md / progress.md`
  - 代码层：逐阶段更新，不在 `I0` 提前声称已完成迁移
- judge：
  - 要求：明确指出每个能力的真实 owner、当前伪装壳、目标 owner 与前端保留面
  - 通过条件：不再出现“插件壳 = 插件实现”的表述
  - 独立 judge：`PASS`
    - 结论：`runtime-tools / subagent / 上下文治理 / provider-router / persona-router` 的 owner、authoring、前端入口与文档表述已统一，不再存在“内部能力伪装成 builtin plugin”的残留

### I1 runtime-tools 收回内部 `[已完成，摘要见上]`

- 已完成，不再在当前阶段计划重复展开。

### I2 subagent 收回内部 `[已完成]`

- 目标：
  - 删除旧 subagent plugin owner 作为 `subagent / subagent_background` 的 owner 身份
  - 将 `subagent` 工具直接注册到内部工具层
  - `runtime-host-subagent-runner / store / session / API / 前端页面` 统一表述为内部能力
  - 插件系统仅保留 `subagent:before-run / subagent:after-run` 作为扩展点
- 范围：
  - `packages/server/src/plugin/builtin/tools/builtin-subagent-delegate.plugin.ts`
  - `packages/server/src/runtime/host/runtime-host-subagent-*.service.ts`
  - `packages/server/src/adapters/http/plugin/plugin.controller.ts`
  - `packages/web/src/features/subagents/*`
- fresh 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-session-store.service.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/adapters/http/plugin/plugin-subagent.controller.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/tool/tool-registry.service.spec.ts -t "lists internal subagent tools as a dedicated internal source|routes internal subagent tools through the internal subagent owner|applies internal runtime-tools bash output config through the internal settings owner|routes internal runtime-tools bash execution through the configured shell backend|supports hot-switching internal runtime-tools bash execution to the platform-scoped secondary backend|uses the platform default backend when internal runtime-tools shellBackend is unset"`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/automation/automation.service.spec.ts tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/adapters/http/ai/ai.controller.spec.ts tests/runtime/host/runtime-host.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts`
  - root: `npm run smoke:server`
  - `packages/web`: `npm run typecheck`
  - `packages/web`: `npm run test:run -- tests/features/subagents/composables/use-subagents.spec.ts tests/features/subagents/views/SubagentView.spec.ts`
  - root: `npm run smoke:web-ui`
- judge：
  - 要求：
    - `builtin-plugin-registry.service.ts` 不再注册旧 subagent plugin owner
    - `subagent / subagent_background` 不再通过 builtin plugin manifest 暴露
    - `subagents/*` 前端命名、API 路径、治理入口与文案已切到内部语义
  - 当前实现摘要：
    - `SubagentToolService` / `SubagentSettingsService` 已成为 `internal:subagent` owner
    - `ToolRegistryService` 已直接注册 `subagent / subagent_background`
    - `/api/subagents/*` 与 `/api/ai/subagent-config` 已接通
    - `plugin-sdk` 已删除旧 subagent plugin owner 的 manifest 数据，仅保留通用 subagent authoring helper
    - 前端 subagents 命名已完成收口，AI 设置页保留内部配置与治理面板
  - 独立 judge：`PASS`
    - 结论：server owner、automation internal source、plugin-sdk manifest、前端命名与 smoke 覆盖均已对齐；未见 builtin 壳残留回流到生产链路

### I3 上下文治理收回内部 `[已完成]`

- 目标：
  - 将 `memory-context / conversation-title / context-compaction` 从 builtin hook plugin 迁回内部 conversation policy / context pipeline
  - 保留原有可配置能力、注解展示、自动/手动触发与会话历史改写语义
  - 前端保留配置表单，但改为内部上下文治理配置，不再挂到插件列表
- 范围：
  - `packages/server/src/plugin/builtin/hooks/builtin-memory-context.plugin.ts`
  - `packages/server/src/plugin/builtin/hooks/builtin-conversation-title.plugin.ts`
  - `packages/server/src/plugin/builtin/hooks/builtin-context-compaction.plugin.ts`
  - `packages/server/src/conversation/*`
  - `packages/web` 插件页与聊天页上下文治理配置入口
- fresh 验收：
  - `packages/plugin-sdk`: `npm test`
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-planning.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts`
  - `packages/web`: `npm run typecheck`
  - root: `npm run smoke:server`
- judge：
  - 要求：
    - 上述三项能力不再依赖 builtin plugin registry 才能生效
    - 历史消息注解、窗口裁剪、标题生成、记忆注入语义不回退
    - 前端配置界面仍可直接操作
  - 当前实现摘要：
    - `ContextGovernanceSettingsService` / `ContextGovernanceService` 已成为上下文治理唯一内部 owner
    - `/api/ai/context-governance-config` 与 `/api/command-catalog/*` 已接通，前端“上下文治理”面板与聊天命令目录都已改走内部入口
    - `ConversationMessagePlanningService` 已直接调用内部 `applyMessageReceived / rewriteHistoryBeforeModel / applyBeforeModel / generateConversationTitleIfNeeded`
    - `builtin.memory-context / builtin.conversation-title / builtin.context-compaction` 旧 hook 生产文件已删除
    - 启动时会清理旧持久化的退役 builtin 记录，避免前端插件页继续暴露历史上下文 builtin
    - plugin governance 不再给普通 local plugin 暴露 `reload`；仅真实 builtin definition 才允许 reload
    - `plugin-sdk` 与开发文档已移除这三条上下文 builtin 的对外声明
  - 当前 fresh 状态：
    - 已通过：`packages/plugin-sdk npm test`、`packages/server npm run build`、会话 planning/lifecycle 两组 jest、`plugin-bootstrap/runtime-kernel` 两组 jest、`packages/web npm run typecheck`、root `npm run smoke:server`
  - 独立 judge：`PASS`
    - 关键结论：
      - 启动主链已清理退役 builtin 持久化记录
      - ordinary local plugin 不再错误暴露 `reload`
      - `plugin-sdk` 与文档已移除上下文 builtin 的对外声明
      - server/web 运行时入口均已切到内部上下文治理 owner

### I4 内部配置中心与残余 builtin 清理 `[已完成]`

- 目标：
  - 为内部能力提供统一配置入口，复用现有 schema 表单渲染器
  - 清理仍只存在于 manifest 清单里的伪 builtin 声明
  - 把 builtin plugin registry 收敛到“真实外部扩展点”最小集合
- 范围：
  - `packages/web/src/features/config/components/SchemaConfigForm.vue`
  - `packages/web/src/features/config/components/SchemaConfigNodeRenderer.vue`
  - `packages/server/src/plugin/builtin/builtin-plugin-registry.service.ts`
  - `packages/plugin-sdk/src/authoring/builtin-manifest-data.json`
- 当前执行点：
  - `I4.1` `[已完成]`：`plugin-sdk` 已移除 `provider-router / persona-router` 的 builtin manifest 导出，仅保留内部 routing schema/default 常量
  - `I4.2` `[已完成]`：前端内部配置面已改为通用 `SchemaConfigForm / SchemaConfigNodeRenderer`，AI 设置页不再复用插件命名组件
  - `I4.3` `[已完成]`：独立 judge 已复核真实 owner、前端入口与 authoring 边界一致
- fresh 验收：
  - `packages/web`: `npm run typecheck`
  - `packages/web`: `npm run test:run -- tests/features/plugins/components/SchemaConfigForm.spec.ts tests/features/plugins/components/PluginSidebar.spec.ts tests/features/plugins/components/PluginScopeEditor.spec.ts tests/features/plugins/composables/use-plugin-management.spec.ts tests/features/plugins/views/PluginsView.spec.ts`
  - `packages/plugin-sdk`: `npm test`
  - `packages/server`: `npm run build`
  - root: `npm run smoke:server`
  - root: `npm run smoke:web-ui`
- judge：
  - 要求：
    - `runtime-tools / subagent / 上下文治理` 都不再挂在 builtin plugin registry
    - `provider-router / persona-router` 不再以 builtin plugin manifest 形式对外暴露
    - 前端配置入口仍可访问，且内部配置面不再借插件命名组件表达
    - 只清理伪 builtin，不误删真实外部扩展能力
  - 独立 judge：`PASS`
    - 关键结论：
      - `provider-router / persona-router` 已只剩内部 routing schema/default 常量，不再对外导出 builtin manifest
      - AI 设置页的内部配置入口已切到 `SchemaConfigForm / SchemaConfigNodeRenderer`，旧插件命名组件已删除
      - 插件页仍保留插件自己的配置入口与文案，未误删真实外部扩展能力
    - residual risk：
      - `plugin-sdk` 仍保留其他 builtin manifest 常量，后续维护者可能误把 authoring 常量理解成 server 默认 builtin 集合
      - 前端测试文件名里仍保留旧命名噪音

## 最近证伪路线

- “插件继续调 host 同名 runtime RPC，也算插件实现工具”：已证伪。
- “builtin.runtime-tools 已迁成 direct owner”：历史上曾被误判，现已在 `I1` 真实完成。
- “旧 subagent plugin owner 属于可接受的插件实现”：已证伪。
- “builtin context hooks 作为长期 owner 没问题”：已证伪，后续要迁回内部上下文治理链。
- “shellBackend 保持自由字符串，前端靠手填解决平台差异”：已证伪。
- “未配置时沿 runtime backend 默认顺序回落即可”：已证伪。
- “先继续压 host 行数，builtin owner 问题以后再说”：已证伪。

## 下一轮入口

- 当前计数：`node tools/count-server-src-lines.mjs` -> `14925`
- 下一轮从体积阶段或下一条功能计划开始：
  - `I0-I4` 已全部收口
  - `V4` 已完成
  - `I5` 已完成
  - `I6` 已完成
  - `I7` 已完成
  - `I8` 已完成
  - `I9` 已完成
  - 当前无进行中阶段，后续按新计划继续

### I9 前端测试命名去噪 `[已完成]`

- 完成摘要：
  - `SchemaConfigForm.spec.ts / use-subagents.spec.ts / SubagentView.spec.ts` 已与当前组件、composable、内部 subagent 语义对齐
  - `TODO.md / task_plan.md / progress.md / findings.md` 已同步清理旧测试文件名、旧组件命名与旧 owner 噪音
- fresh 验收：
  - `packages/web`: `npm run test:run -- tests/features/plugins/components/SchemaConfigForm.spec.ts tests/features/subagents/composables/use-subagents.spec.ts tests/features/subagents/views/SubagentView.spec.ts`
  - 独立 judge：`PASS`

### I8 authoring 文案去歧义 `[已完成]`

- 完成摘要：
  - `docs/插件开发指南.md` 已把 “authoring 静态资产” 和 “运行时 builtin plugin” 表述拆开
  - `packages/plugin-sdk/tests/index.test.js` 已把 `builtin plugins` 测试名改成 `authoring flows`
- fresh 验收：
  - `packages/plugin-sdk`: `npm test`
  - 独立 judge：`PASS`

### I7 observer manifest 死代码清理 `[已完成]`

- 目标：
  - 删除 `plugin-sdk authoring` 中已经不被根入口、包导出、测试或生产代码使用的 observer manifest 残留
  - 同步清理文档里对该残留的表述
- 完成摘要：
  - 删除 `packages/plugin-sdk/src/authoring/builtin-observers.ts`
  - 删除 `packages/plugin-sdk/src/authoring/builtin-observer-manifests.json`
  - `docs/插件开发指南.md` 已删除对应残留表述
- fresh 验收：
  - `packages/plugin-sdk`: `npm test`
- judge：
  - 要求：
    - 上述文件删除后，`plugin-sdk` 导出面与测试不回退
    - 文档不再把已删除的 observer manifest 文件当成当前边界的一部分
  - 独立 judge：`PASS`
    - 关键结论：
      - 已删除文件不存在隐藏消费链
      - authoring 导出边界仍完整
      - 文档与计划文件已同步当前事实

### I6 authoring barrel 收口 `[已完成]`

- 目标：
  - 把 `plugin-sdk/authoring` 根 barrel 上仍混在一起的 observer manifest 与观测摘要逻辑拆开
  - 根 barrel 只暴露作者侧通用逻辑，不再顺手暴露 builtin observer manifest
- 完成摘要：
  - 新增 `packages/plugin-sdk/src/authoring/observation-summaries.ts`
  - `packages/plugin-sdk/src/authoring/index.ts` 已改为导出 `observation-summaries`，不再导出 observer manifest
  - `packages/plugin-sdk/tests/authoring.test.js` 已新增反向断言，确保根 `authoring` 入口不可直接拿到 observer manifest
- fresh 验收：
  - `packages/plugin-sdk`: `npm test`
- judge：
  - 要求：
    - 根 barrel 不再直接导出 builtin observer manifest
    - 现有观测摘要/持久化逻辑导出不回退
  - 独立 judge：`PASS`
    - 关键结论：
      - 根 `authoring` 入口已不再暴露 observer manifest
      - 观测摘要/持久化逻辑仍完整可用
      - 反向断言已补上，测试防回退缺口已收口

### I5 plugin-sdk authoring 语义收口 `[已完成]`

- 目标：
  - 删除 `plugin-sdk` 里混放“内部默认值/schema”和“builtin manifest”的旧聚合 authoring 入口
  - 让 `conversation / context-compaction / router` 各自只从明确语义文件读取默认值与 schema
  - 删除仓库里未被生产链使用、且容易误导维护者的 builtin manifest 聚合导出
- 完成摘要：
  - 新增 `packages/plugin-sdk/src/authoring/authoring-config-data.json`
  - 删除 `packages/plugin-sdk/src/authoring/builtin-manifest-data.json`
  - 删除 `packages/plugin-sdk/src/authoring/builtin-manifests.ts`
  - `prompt-helpers / conversation-helpers / context-compaction / router-helpers` 已直接从 `authoring-config-data.json` 读取默认值与 schema
  - `packages/plugin-sdk/src/authoring/index.ts` 已移除 `builtin-manifests` 聚合导出
  - `docs/插件开发指南.md` 已同步当前边界
- fresh 验收：
  - `packages/plugin-sdk`: `npm test`
  - `packages/server`: `npm run build`
- judge：
  - 要求：
    - 不能再通过一个含糊的 `builtin-manifests` 聚合入口同时表达“内部 schema/default”与“真实 builtin plugin manifest”
    - `server` 仍能读取上下文治理与 router 相关 schema/default
    - 文档要同步说明当前 plugin-sdk authoring 暴露的真实边界
  - 独立 judge：`PASS`
    - 关键结论：
      - `builtin-manifests` 聚合入口与旧混装 JSON 已真实删除
      - `server` 依赖的 schema/default 已回到明确语义文件
      - 开发文档已不再把内部能力表述成默认 builtin plugin

### V4 上下文治理 / 会话链压体积 `[已完成]`

- 目标：
  - 继续把 `packages/server/src` 从 `15534` 压回 `<= 15000`
  - 优先压缩 `conversation` owner 内的重复控制流，不改变上下文治理、窗口预览、标题生成、记忆注入语义
  - 不新增兼容层，不把复杂度转移到 `shared`
- 完成摘要：
  - `packages/server/src/conversation/context-governance.service.ts`: `723 -> 529`
  - `packages/server/src/conversation/context-governance-settings.service.ts`: `128 -> 126`
  - `packages/server/src/conversation/conversation-message-planning.service.ts`: `160 -> 152`
  - `packages/server/src/runtime/host/runtime-host-conversation-record.service.ts`: `353 -> 276`
  - `packages/server/src`: `15206 -> 14925`
- fresh 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/conversation/conversation-message-planning.service.spec.ts tests/conversation/conversation-message-lifecycle.service.spec.ts tests/runtime/host/runtime-host-conversation-record.service.spec.ts`
  - root: `npm run smoke:server`
  - root: `node tools/count-server-src-lines.mjs`
- judge：
  - 要求：
    - 不能把上下文治理逻辑换名后拆散成语义不明的中间层
    - `summary / sliding / memory / title` 四条语义都不能回退
    - 计数必须给出 fresh 结果
  - 独立 judge：`PASS`
    - 关键结论：
      - 四个目标文件都在原 owner 内真实收口，不是换名、换路径或拆壳
      - `summary / sliding / memory / title` 四条语义仍在主链
      - `TODO.md / task_plan.md / progress.md / findings.md` 已同步到 `14925` 与 fresh 结果

### P5 uuidv7 语义恢复 `[已完成]`

- 目标：
  - 把当前退化成 `randomUUID()` 的持久/会话关键 ID 恢复为 `uuidv7`
  - 不保留旧 v4 数据兼容入口
  - 不把运行逻辑塞回 `shared`
- 验收：
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host-conversation-record.service.spec.ts tests/runtime/host/runtime-host-conversation-message.service.spec.ts tests/execution/runtime/runtime-tool-permission.service.spec.ts tests/conversation/conversation.controller.spec.ts tests/plugin/builtin/hooks/builtin-context-compaction.plugin.spec.ts`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - conversation / message / runtime-permission / context-compaction / OpenAI 兼容流 / plugin host request id 已恢复为 `uuidv7`
    - HTTP conversation/message 路由已收口为 UUID v7 校验
    - 未引入旧 v4 数据兼容壳

### P6 host / automation owner 压体积 `[已完成]`

- 目标：
  - 继续删除 host method 映射样板、automation 持久化与 cron 重复控制流
  - 保持 `runtime-host.service` 与 `automation.service` 现有公开语义和测试行为不变
- 当前进度：
  - `runtime-host.service.ts`: `264 -> 242`
  - `automation.service.ts`: `241 -> 193`
  - `runtime-shell-command-hints.ts`: 旧实现已删并重写，bash hint 回归通过
  - `packages/server/src`: `15761`
- 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/runtime/host/runtime-host.service.spec.ts tests/automation/automation.service.spec.ts tests/adapters/http/automation/automation.controller.spec.ts`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/bash/bash-tool.service.spec.ts`
  - root: `node tools/count-server-src-lines.mjs`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - `runtime-host.service` 为 owner 内部映射收口，不是 facade 转发
    - `automation.service` 为同 owner 内控制流压缩，不是复杂度转移
    - `runtime-shell-command-hints.ts` 的 `visibleRoot='/'` 误判已修复，bash 回归已覆盖

### P7 bootstrap / ai-settings / gateway owner 压体积 `[已完成]`

- 目标：
  - 继续删除配置解析、远端连接生命周期与持久化配置读写中的重复控制流
  - 保持 `plugin-bootstrap.service.ts`、`ai-management-settings.store.ts`、`runtime-gateway-connection-lifecycle.service.ts` 公开语义不变
- 当前进度：
  - `plugin-bootstrap.service.ts`: `222 -> 208`
  - `ai-management-settings.store.ts`: `237 -> 148`
  - `runtime-gateway-connection-lifecycle.service.ts`: `214 -> 154`
  - `packages/server/src`: `15598`
- 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/plugin/bootstrap/plugin-bootstrap.service.spec.ts tests/runtime/gateway/runtime-gateway-connection-lifecycle.service.spec.ts tests/runtime/kernel/runtime-kernel.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts tests/ai-management/ai-management.service.spec.ts`
  - root: `npm run smoke:server`
  - root: `node tools/count-server-src-lines.mjs`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - `plugin-bootstrap.service.ts` 的 manifest/config 解析仍在同一 owner 内收口，不是 facade 转移
    - `ai-management-settings.store.ts` 仍由同一 store owner 负责 provider 分文件与 routing/vision 读写
    - `runtime-gateway-connection-lifecycle.service.ts` 仍由同一 owner 负责认证、注册、断连、心跳与 health 语义

### P8 subagent / text-replace / event-log owner 压体积 `[已完成]`

- 目标：
  - 继续删掉 subagent session 持久化、文本替换、多类事件日志里的重复控制流
  - 把 `packages/server/src` 压到 `<= 15000`
  - 不改 `subagent` 软删除/回写、`edit` 替换策略、事件日志分页与裁剪语义
- 当前进度：
  - `runtime-host-subagent-session-store.service.ts`: `192 -> 171`
  - `runtime-text-replace.ts`: `196 -> 184`
  - `runtime-event-log.service.ts`: `190 -> 70`
  - `packages/server/src`: `14998`
- fresh 验收：
  - `packages/server`: `npm run build`
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand --no-cache tests/execution/file/runtime-text-replace.spec.ts tests/runtime/host/runtime-host-subagent-session-store.service.spec.ts tests/runtime/host/runtime-host-subagent-store.service.spec.ts tests/runtime/host/runtime-host-subagent-runner.service.spec.ts tests/execution/mcp/mcp.service.spec.ts`
  - root: `npm run smoke:server`
  - root: `node tools/count-server-src-lines.mjs`
- judge：
  - 结果：`PASS`
  - 关键结论：
    - `runtime-host-subagent-session-store.service.ts` 仍保持 removed 会话“对外隐藏、对内可追写”的语义
    - `runtime-text-replace.ts` 的策略顺序、歧义报错与 `replaceAll` 限制未变
    - `runtime-event-log.service.ts` 仍保持 append/list、cursor 分页、maxFileSize 裁剪与 `plugin/skill/mcp` 路由语义
