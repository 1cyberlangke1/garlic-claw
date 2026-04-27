# Findings

## 2026-04-27 provider 回迁修复

- 这次 provider 消失的真实问题是后端默认存储路径切换，不是前端直写文件：
  - 前端只调用 `/api/ai/providers/*`
  - 真正写盘发生在后端 `AiProviderSettingsService -> saveAiSettings(...)`
- `2026-04-25` 配置目录改造后，旧单文件 `packages/server/tmp/ai-settings.server.json` 仍保留了用户此前在 UI 中新增的 provider
- 新结构 `config/ai/providers/*.json` 已成为唯一正确目标格式，因此最小修复不是回退到单文件，而是做一次性拆分迁移
- 迁移策略需要保守：
  - 只补新目录里缺失的 provider
  - 不覆盖已存在的同名 provider 文件
  - 迁移完成后归档旧单文件，避免每次启动重复导入
- 如果当前 structured 配置已经完全覆盖 legacy 内容，也应直接归档 legacy 文件：
  - 否则每次启动都会重复扫描同一个旧文件
  - 这类场景不需要保留旧单文件继续参与导入决策
- 当前工作区已验证：
  - 旧单文件中的 `ds2api`、`nvidia` 已拆到独立 provider JSON
  - 定向 build 与 `ai-provider-settings.service.spec.ts` 已通过
  - `smoke:http` 与 `browser-smoke` 已通过

## 2026-04-26 体积治理与 owner 收口

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

- 新一轮更适合改“配置解析 / 持久化读写 / 连接生命周期”这类稳定 owner：
  - `plugin-bootstrap.service.ts` 可通过表驱动读取压掉 manifest/config 重复分支
  - `ai-management-settings.store.ts` 可通过合并 provider 文件扫描与 JSON 读取压掉双遍目录遍历
  - `runtime-gateway-connection-lifecycle.service.ts` 可通过合并连接状态更新路径压掉认证/断连样板

- 当前剩余差距已更新：
  - `packages/server/src` 当前 `15598`
  - 距离 `<=15000` 还差 `598`

- 独立 judge 已确认 `P7` 可收口：
  - `plugin-bootstrap.service.ts`：manifest/config 解析压缩后仍保持 fallback、typed config、builtin runtime-tools config 语义
  - `ai-management-settings.store.ts`：provider 分文件、routing/vision 文件读写语义未变
  - `runtime-gateway-connection-lifecycle.service.ts`：remote gateway 认证、注册、断连、心跳、health 语义未变

- `runtime-event-log.service.ts` 这类存储 owner 适合直接整文件重写：
  - 目录路由、分页 cursor、文件裁剪三段语义稳定
  - 不需要保留旧的多层包装函数，压缩空间很大

- `runtime-text-replace.ts` 的高风险点不是策略数量，而是歧义报错语义：
  - `replaceAll` 必须继续拒绝“同策略命中不同原文”
  - `line-trimmed` 与 `context-aware` 的优先级不能互换
  - 这类文件可压，但必须直接跑独立 spec

- 当前 `V3` 已达到计数目标：
  - `packages/server/src` 当前 `14998`
  - 还差 `P8` 独立 judge，才能把 `V3` 标记收口

- 独立 judge 已确认 `P8` 可收口：
  - `runtime-host-subagent-session-store.service.ts`：removed 会话仍保持“对外隐藏、对内可读写补全”边界
  - `runtime-text-replace.ts`：策略顺序、歧义提示、replaceAll 约束未回退
  - `runtime-event-log.service.ts`：append/list、cursor、裁剪、kind 路由与 JEST 临时目录语义未变
  - `V3 <= 15000` 已完成，当前 `packages/server/src = 14998`

- `uuid v7 is expected` 这类前端打开即炸的回归，不能只在 HTTP 层提示错误：
  - 旧数据源可能同时来自持久会话文件、遗留 todo 文件、开发态内存态当前会话选择
  - 最稳的处理是服务端加载即清理旧会话，前端再补一层“仅拦截 UUID 形状但不是 v7 的旧值”
  - 这样既能清旧数据，也不会误伤测试里常见的 `conversation-1` 夹具 ID

- `builtin.conversation-title` 在 echo/mock provider 下会把内部 prompt 回写成标题：
  - 问题不在消息链路，而在标题插件把“模型回显提示词”当成标题接受
  - 只要 provider 返回的是 `本地 smoke 回复: <prompt>` 或直接返回提示词首行，就会污染会话列表
  - 最小修复点是 `sanitizeConversationTitle`：拒收明显的指令/回显文本，不去扩 host 或消息持久化语义

- `runtime-tools` 彻底收回内部时，光删注册还不够：
  - `RuntimeHostRuntimeToolService` 若继续 import `plugin/builtin/tools/runtime-tools/*`，本质上仍是旧 plugin runtime 在做 owner
  - `RuntimeHostPluginDispatchService` 若继续注入 `host.runtimeTools` 旁路对象，local builtin plugin 仍然能绕开标准 host facade
  - 真收口的判定标准是：旧壳文件删除、宿主链路只依赖内部 owner、前端入口转为内部配置页、仓库搜索只剩历史文档

- `subagent` 收回内部时，`plugin-sdk` 里的 builtin manifest 数据也必须一起删：
  - 如果只删 server registry，旧 subagent plugin owner 仍会作为 authoring 常量残留在 `plugin-sdk`
  - 更稳的做法是把 schema、tool 定义和 host 参数构造改成通用 subagent authoring helper，不再挂 builtin manifest 名义
  - 这样 server 与前端都能继续复用静态定义，但 judge 不会把它判成“旧 builtin 壳换地方”

- `smoke:server` 的工具源覆盖不能再默认要求 plugin tool source：
  - `runtime-tools / subagent` 收回内部后，`/tools/overview` 在 fresh 环境下可以只有 `internal + mcp`
  - 需要把 smoke 改成验证 `internal:runtime-tools` 与 `internal:subagent`，并把 source action 覆盖切到 MCP health-check
  - 同时新增 `/ai/subagent-config` 覆盖，否则 route coverage 会因为新控制器接口漏测而失败

- 前端把内部能力从“插件语义”收回时，文案和路径都要同步：
  - 只改接口路径不够，旧插件前缀命名会继续让 TODO/judge 认定为旧 owner 余震
  - 本轮直接改成 `subagents` 路径与 `useSubagents` 组合式 API，能把视图、测试和数据层一起对齐

- NestJS 的 injectable constructor 不能用“吞旧参数”的 rest 参数来兼容测试：
  - 运行时会把 rest 槽位也当成待注入依赖，最终触发 `UnknownDependenciesException`
  - 这类迁移应直接同步测试夹具，而不是在生产构造函数里留下假兼容参数

- `I1` judge 的有效阻塞顺序很明确：
  - 先看代码 owner 是否真的迁走
  - 再看 `TODO.md` 是否还在陈述旧事实
  - 代码通过但文档自相矛盾时，阶段仍应判失败
- `I3` 暴露了两个真实回归，不能靠改测试掩盖：
  - `ContextGovernanceService.injectMemoryContext(...)` 直接把 `string | ChatMessagePart[]` 传给 `readLatestUserTextFromMessages(...)`，会在字符串消息上触发 `.filter` 崩溃
  - 上下文治理 summary/sliding 两条路径都曾拿“原始 history 条数”算前缀；只要尾部有 pending assistant，就会把 persona `beginDialogs`、vision fallback 追加描述这类“非持久前缀消息”误判成可丢弃段
- 更稳的判断方式是：
  - 记忆检索前先把字符串统一包装成 text part
  - summary 路径按“真实历史 model message 数”判断是否需要重写
  - sliding 路径直接基于 `requestMessages` 的历史后缀裁剪，不能回退到未解析的 raw history parts
- `http-smoke` 的 route coverage 不该再借 builtin 残留凑数：
  - 删除上下文 builtin hook 后，缺口会落在通用插件治理路由
  - 最省边界歧义的补法是直接用已连接的远程插件跑一遍 `config / llm-preference / scopes / event-log / events / storage / crons`
- 当前计数回弹到 `15500`：
  - 这次回弹来自 `I3` 真迁移与 smoke 覆盖补齐，不是单纯样板膨胀
  - 在 `I3/I4` 结束前，不应为了压回 15000 再把 owner 迁移打断
- `I3` 首轮 judge 失败说明：只把运行时代码迁走还不够。
  - 如果启动阶段不主动清理退役 builtin 的持久化记录，旧工作区照样会在 `/plugins` 列表里看到它们
  - 如果 governance 仍把所有 local plugin 当作 builtin，对外继续暴露 `reload`，那就是“换壳未收口”
  - 如果 `plugin-sdk` authoring / 开发文档还在声明这些 builtin 存在，judge 会把它判成文档失真
- 更可靠的修法是三段一起收口：
  - server 启动时删除退役 builtin 记录
  - governance 只允许真实 builtin definition 暴露 `reload`
  - `plugin-sdk` 与 `docs/` 同步删掉上下文 builtin 的对外宣称
- 当前计数再次更新：
  - `packages/server/src` 当前 `15534`
  - 这次增长来自 `I3` 第二轮清理与测试替换，不是新增一套并行 owner
- `I4` 说明了“复用旧组件”也要看语义 owner：
  - 如果内部配置页继续直接 import 旧插件前缀配置组件，即使逻辑没错，judge 也会把它判成插件语义残留
  - 更稳的做法是把 schema 表单抽成通用 `SchemaConfig*` 组件，由插件页与内部配置页分别注入自己的文案
  - 这样既不复制逻辑，也不再把内部能力伪装成插件配置
- `provider-router / persona-router` 当前只该保留“内部 routing schema / 默认值”这层 authoring 常量：
  - 对 server 来说，它们已经不是 builtin plugin owner
  - 对 plugin-sdk 来说，继续导出 manifest 只会制造“服务端默认内建了这两个插件”的假象
  - 这类残影应直接删除，不需要兼容壳
- `I4` judge 通过后还剩两类非阻塞噪音：
  - `plugin-sdk` 里其他 builtin manifest 常量仍可能被维护者误会成“server 默认 builtin 集合”
  - 前端个别测试与过程记录里还保留旧 owner / 旧组件命名噪音
- `runtime-tools` 的前端 shell 枚举和底层已注册 backend 不是同一层概念：
  - `wsl-shell` 已经是真实现，Windows 下直接走 `wsl.exe --cd ... bash -lc ...`
  - `just-bash` 之前只是被配置层收口隐藏，不是执行层缺失
  - 因此补回前端选项只需要改配置 schema 与验收，不需要新增 backend owner
- `I9` 的验收不能只看测试文件名：
  - 测试夹具中的 owner 标识也要同步到当前内部语义
  - 同目录的相关前端测试也要一起清理，否则 judge 会把阶段视为“去噪未完成”
  - `TODO / task_plan / progress / findings` 四份文件都要出现同一阶段的计划、fresh 与结论链，judge 才会认定“文档同步完成”
- `V4` 证明 `conversation` owner 仍有大块净减空间：
  - `context-governance.service.ts` 里的预算计算、summary/sliding 预览、annotation 读写与 preview sanitize 可以在同 owner 内合并，不需要再拆中间层
  - `runtime-host-conversation-record.service.ts` 的序列化、history normalize、preview token 估算链也适合直接压成更短实现
  - 这轮四个文件一起收口后，`packages/server/src` 已从 `15206` 降到 `14925`
- 这轮回归面说明当前压缩没有伤到关键语义：
  - `conversation-message-planning / lifecycle` 仍通过
  - `runtime-host-conversation-record` 仍通过
  - `smoke:server` 184 项通过，说明上下文治理、标题生成、会话历史预览、provider token 回读都还在主链上
- `V4` judge 已给 `PASS`：
  - 这轮压缩没有把上下文治理逻辑挪到新的中间层
  - 当前 residual risk 只剩文档标题噪音：`task_plan.md / progress.md` 仍挂在 `V3 体积治理` 顶层标题下
- `plugin-sdk` 的 `builtin-manifest-data.json + builtin-manifests.ts` 是典型的语义混装：
  - 一边放内部默认值 / config schema
  - 一边放真实 builtin plugin manifest
  - 继续共用会让维护者误把“authoring 静态资产”理解成“服务端默认装载集合”
- 当前更稳的边界是：
  - 默认值 / schema 进独立 `authoring-config-data.json`
  - 真正的 builtin manifest 只在确实仍需要作者侧示例时，按语义单独暴露
  - 如果某批 manifest 在仓库里已无生产引用，就直接删，不保留空壳聚合文件
- `I5` judge 已给 `PASS`：
  - 当前 `plugin-sdk/authoring` 已不再同时用一个总入口表达“内部 schema/default”与“真实 builtin plugin manifest”
  - 剩余风险只是在根 barrel 继续堆过多 authoring 资产时，边界还可能再次发散
- `builtin-observers.ts` 的问题和前一阶段类似，但更细一层：
  - 同一文件里既有 observer manifest 常量，又有观测摘要/持久化逻辑
  - 即使没有混默认值/schema，也会让根 barrel 顺手把 manifest 一起暴露出去
- 更稳的做法是：
  - `builtin-observers.ts` 只保留 manifest 常量
  - 观测摘要与持久化逻辑独立成 `observation-summaries.ts`
  - 根 `authoring/index.ts` 只导出后者
- `I6` judge 已给 `PASS`：
  - 根 `authoring` 入口不再暴露 observer manifest
  - 反向断言已补上，后续若有人把 manifest 重新挂回根 barrel，`plugin-sdk` 测试会直接报警
- `builtin-observers.ts` / `builtin-observer-manifests.json` 在 `I6` 之后已经变成真死代码：
  - 根 `authoring` 入口不导出
  - 包导出面没有独立 subpath
  - 全仓没有生产或测试引用
  - 这类残留不该继续留着当“也许以后有用”的样板，应直接删除
- 即使代码边界已经收口，文档和测试名称里的 `builtin plugin` 说法也会继续制造误读：
  - 维护者会把“作者侧静态资产”读成“服务端启动时默认装载的 builtin”
  - 这种噪音不影响运行，但会持续污染后续判断
  - 因此需要单独清理措辞，而不是等下一轮再顺手带过
