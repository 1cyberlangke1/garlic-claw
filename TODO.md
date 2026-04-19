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
- `[已完成] N13 插件配置元数据协议重构（AstrBot 方向）`：
  - 插件配置已从扁平 `fields[]` 收口为 object-tree 声明式协议，主语义覆盖 section/object/items、`hint / obvious_hint / options / condition / collapsed / _special`。
  - `shared / plugin-sdk / server / web` 已统一到新协议；宿主可以按 schema 渲染配置 UI，server 会按新协议生成快照并递归校验。
  - 受影响 build、lint、server smoke、web smoke 与独立 judge 已通过。
- `[已完成] N15 模型上下文长度与 usage 估算`：
  - `AiModelConfig` 已新增 `contextLength`，默认值为 `128 * 1024`；模型能力与上下文长度会持久化到 AI 设置文件。
  - usage 已收口到统一模型执行层：优先读取 AI SDK 统一字段，缺失时按 `ceil(utf8Bytes / 4)` 估算，并统一返回稳定 usage 结构。
  - 前端 AI 设置页已支持真实编辑 `contextLength`；provider 整体保存会清理被移除模型的陈旧元数据，定向测试、server smoke、web smoke 与独立 judge 已通过。
- `[已完成] N16 插件化上下文压缩（参考 OpenCode / AstrBot）`：
  - 已通过通用 Host API `conversation.history.get / preview / replace`、通用 `metadata.annotations[]` 与确定性 hook 顺序完成插件化上下文压缩，不给宿主增加压缩专用后门。
  - `builtin.context-compaction` 已支持自动压缩、手动压缩、正式摘要消息写回、送模视图裁剪，以及 assistant 消息上方默认折叠的压缩摘要展示。
  - 受影响定向测试、`smoke:server`、`smoke:web-ui`、`lint` 与独立 judge 已 fresh 通过；期间暴露的 state 权限缺口和浏览器 smoke 脆弱点都已修复。

## 当前阶段：[进行中] N14 远程插件静态接入密钥与元数据缓存

### 目标

- 把当前远程插件语义从模糊的 `deviceType` 收口成明确的四段模型：
  - `runtimeKind`
  - `remoteEnvironment`
  - `auth.mode`
  - `capabilityProfile`
- 把当前远程插件接入从“宿主签发远程插件 token”调整为“用户手动填写静态接入 key”。
- 宿主自动为远程插件提供统一的“远程接入”配置面板，不要求插件作者重复声明相同字段。
- 远程插件提供的静态元数据要在服务端缓存，避免前端查看插件详情、配置页或工具面板时反复向远端请求相同内容。
- 缓存语义要覆盖未来可能出现的远程插件 UI 元数据，不只限于当前 manifest / tools / routes。
- 冒烟测试要补一条模拟 IoT 远程插件链路，验证高风险远程插件的接入、鉴权、缓存与工具调用。

### 当前问题

- 当前共享类型只有：
  - `runtimeKind: 'local' | 'remote'`
  - `deviceType: 'builtin' | 'pc' | 'mobile' | 'iot' | 'api'`
  但它没有把“运行位置 / 鉴权要求 / 能力风险 / 远程环境类型”拆开。
- 当前远程插件接入依赖 `/plugins/remote/bootstrap` 由宿主签发 JWT token，再由插件带 token 建立 WebSocket 连接。
- 这套模式对“用户自己维护一把长期 key，填完就不再管”这种使用方式不够贴近。
- 当前远程插件如果需要鉴权，没有统一的宿主自动面板；只能靠未来继续扩散零散字段。
- 当前远程插件如果只是查询类插件，也没有地方表达“允许匿名 / 可选鉴权 / 必须鉴权”这三种差异。
- 当前远程插件如果具备设备控制能力，也没有一等语义表达“这是控制型插件，需要更强风险提示”。
- 当前远程插件的静态元数据虽然会在注册后驻留在宿主内存记录里，但还不是明确的持久缓存设计：
  - 进程重启后会丢失
  - 还没有区分“静态元数据快照”和“实时运行态健康信息”
  - 未来如果远程插件增加 UI schema / 静态资源描述，也没有稳定 owner
- 当前远程插件重新连接时，manifest 仍以“远端重新注册后覆盖宿主当前记录”为主，没有 manifest 版本 / 哈希 / 缓存命中语义。

### 当前决定

- A 方案成立，不保留旧的远程插件公开语义：
  - `runtimeKind: 'local' | 'remote'`
  - `remoteEnvironment: 'api' | 'iot'`
  - `auth.mode: 'none' | 'optional' | 'required'`
  - `capabilityProfile: 'query' | 'actuate' | 'hybrid'`
- 旧的 `deviceType: pc | mobile` 不再作为未来方向；`deviceType` 要么删除，要么降成内部迁移字段，不能继续作为公开主语义。
- 按用户要求，远程插件接入主语义改成“静态 key 由用户输入后自行承担外发风险”；只要不是程序泄露，宿主不再试图替用户管理这把 key 的后续传播。
- 远程接入 key 不是全局强制必填，而是由 `auth.mode` 控制：
  - `none`: 不显示或不要求 key
  - `optional`: 显示 key 输入，但允许留空
  - `required`: 宿主自动显示并强制校验 key
- 宿主自动为所有远程插件生成统一的远程接入面板，至少包含：
  - `serverUrl`
  - `accessKey`
  - 鉴权模式说明
  - 最近同步时间 / 缓存状态
- 宿主自动为高风险远程插件加风险提示：
  - `remoteEnvironment === 'iot'`
  - 或 `capabilityProfile === 'actuate' | 'hybrid'`
- 不再把宿主签发短期 token 作为唯一接入主链；如保留，也只能是过渡或内部实现细节，不能继续作为公开主语义。
- 远程插件静态 key 仍然要绑定插件身份，至少包含：
  - `pluginName`
  - `remoteEnvironment`
  - 可选固定 `serverUrl` / 来源域
- 静态缓存只缓存“声明型元数据”，不缓存实时执行结果：
  - 缓存：manifest / tools / commands / hooks / routes / config schema / 未来 UI schema
  - 不缓存：health / event log / route 动态结果 / tool 执行结果
- 缓存 owner 放在服务端插件持久化与读取链，不放到前端本地存储，也不散落到网关连接层临时 Map。
- 不做兼容层；目标完成后，旧的远程 bootstrap token 主语义要退场。

### 实现计划

#### R14-1. Shared 远程插件语义模型改造

- shared 契约新增或重写远程插件公开字段，明确：
  - `runtimeKind`
  - `remoteEnvironment`
  - `auth.mode`
  - `capabilityProfile`
- 远程插件管理信息、bootstrap/config 接口、前端展示与 smoke 夹具全部改用这套新语义。
- `deviceType` 旧公开字段从主链退场，不继续扩散到新接口与新页面。

#### R14-2. 远程插件接入配置与宿主自动面板

- shared / server 新增远程插件静态接入配置结构，至少包含：
  - `serverUrl`
  - `accessKey`
  - `auth.mode`
- 插件管理后端接口改成面向“用户手填 key”的配置读写，而不是只返回宿主签发 token。
- Web 前端为远程插件自动渲染统一接入面板：
  - `auth.mode=required` 时 `accessKey` 必填
  - `auth.mode=optional` 时 `accessKey` 选填
  - `auth.mode=none` 时隐藏或禁用 key 输入
- 这个面板属于宿主能力，不混进插件自己的 config schema。

#### R14-3. 远程插件记录与缓存模型

- 在插件持久化记录中显式区分：
  - 远程接入配置
  - 静态元数据缓存
  - 运行态连接状态
- 静态元数据缓存至少包含：
  - manifest 快照
  - 最近成功同步时间
  - 可选 manifest 版本 / 哈希
- `buildPluginInfo()` 与插件详情读取链优先走缓存快照，而不是依赖当前连接还活着。

#### R14-4. 失效与刷新语义

- 远程插件首次连接成功时写入静态元数据缓存。
- 当远端声明版本 / 哈希变化，或用户手动执行 `reload / reconnect / refresh-metadata` 时刷新缓存。
- 健康检查失败、临时离线、运行态断线时，不清掉静态元数据缓存；插件详情页仍可展示最近一次成功同步的元数据。

#### R14-5. 前端插件管理改造

- 远程插件管理页新增自动远程接入面板，字段语义明确为“手动填写后宿主保存”。
- 插件详情页若远程插件已离线但本地有缓存，仍显示缓存的：
  - 工具描述
  - hooks / routes
  - 配置 schema / UI schema
- 前端文案避免再强调“token 过期 / bootstrap”，改成用户可理解的：
  - `API 远程插件`
  - `IoT 远程插件`
  - `接入 key`
  - `鉴权模式`
  - `能力类型`
  - `元数据缓存`
  - `最后同步时间`
- 对 `remoteEnvironment === 'iot'` 或 `capabilityProfile !== 'query'` 的插件显示更强风险提示。

#### R14-6. 冒烟与测试补强

- 补 server 测试覆盖：
  - 静态 key 校验
  - 连接断开后缓存仍可读
  - 重新注册刷新 manifest 缓存
  - 运行态健康信息与静态缓存分离
- 补 smoke 的模拟 IoT 远程插件：
  - 例如 `remote.smoke-iot-light`
  - `runtimeKind='remote'`
  - `remoteEnvironment='iot'`
  - `auth.mode='required'`
  - `capabilityProfile='actuate'`
  - 暴露 `light.getState / light.turnOn / light.turnOff`
  - 内部只维护一个布尔灯状态，模拟 ESP32 点灯
- 补 web 测试覆盖：
  - 远程插件 key 表单
  - 离线时仍显示缓存元数据
  - `auth.mode` 对必填行为的影响
  - `iot / actuate` 风险提示
  - 最后同步时间 / 缓存状态展示
- fresh 跑完受影响 build、lint、server smoke、web 定向测试；如插件管理真实 UI 变化明显，再补 `smoke:web-ui`。

### 验收标准

- 远程插件公开模型已明确为：
  - `runtimeKind`
  - `remoteEnvironment(api|iot)`
  - `auth.mode`
  - `capabilityProfile`
- 用户可以直接为远程插件填写静态接入 key，宿主不再要求依赖宿主签发 token 才能作为公开主链使用。
- 远程插件接入面板由宿主自动生成，而不是要求每个远程插件自己声明重复字段。
- `auth.mode` 能真实控制 key 的必填 / 选填 / 不需要。
- 远程插件的静态元数据在服务端有明确缓存语义，而不是只活在当前进程内存里。
- 插件离线时，详情页仍可展示最近一次成功同步的静态元数据。
- `iot` 或控制型远程插件会显示更强风险提示。
- 健康状态、事件日志、动态执行结果不会被误混进静态缓存。
- `reload / reconnect / 元数据刷新` 能触发缓存更新。
- 模拟 IoT 远程插件的 smoke 链路 fresh 通过。
- 受影响测试、构建与 smoke fresh 通过。

## 固定约束

- 不允许引入绝对路径。
- WSL 测试必须在 WSL 内部目录执行；如当前环境本身就在 Linux / WSL 内部目录则忽略迁移动作。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过才能继续。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 不接受把 persona 复杂度继续藏在普通插件顺序或隐式 prompt 覆盖里。
