# Garlic Claw TODO

> 校正 2026-04-01：
> 之前把“contract 已固化 / 局部 primitive 已落地”误记成“顶层长期目标已完成”，这个状态不准确。
> 下面这些顶层条目恢复为长期目标；具体已经落地的内容继续以阶段记录和进展记录为准。
>
> 2026-04-02 起：
> `TODO.md` 只保留长期目标、当前切片和压缩后的里程碑摘要；
> 详细阶段流水账留在本地规划文件，不再继续堆回项目级 TODO。

## 北极星

- [ ] 把 Garlic Claw 收敛成 `内核像 C 一样简单, SDK 像 C++ 有丰富的语法糖`
- [ ] 本体只做稳定边界，不继续做功能堆叠
- [ ] 作者侧格式兼容现有 plugin / MCP / skill 生态
- [ ] 运行时统一到同一个 extension kernel contract
- [ ] 官方 builtin 优先做参考实现，而不是长期特权实现

## Kernel 边界

- [ ] 将本体一等责任收敛到：
  - `auth / user`
  - `conversation / message / chat`
  - `ai invocation facade`
  - `extension runtime`
  - `permission / governance`
  - `minimal persistence primitives`
- [ ] 新能力默认先判断能否落在 `plugin / MCP / skill / tool`，只有明确不能时才进入 core
- [ ] 持续删除 builtin / plugin / skill / MCP 的核心特判路径

## 统一扩展模型

- [ ] 保持 `plugin` 作为宿主原生扩展协议
- [ ] 保持 `MCP` 作为外部能力/资源协议，通过 adapter 接入 kernel
- [ ] 保持 `skill` 兼容现有生态，不强制改写为原生 plugin 包格式
- [ ] 明确“统一发生在 runtime contract，不发生在 authoring format”

## Skill 角色

- [ ] 将 `skill` 定义为双面层
- [ ] 对 AI：`prompt / policy / constraint / context assembly`
- [ ] 对 runtime：`workflow / orchestration / task template`
- [ ] 依赖解析默认走 `capability contract`
- [ ] 允许具体扩展名作为覆盖项，而不是默认绑定方式
- [ ] 避免把 `skill` 做成第三套厚 runtime

## 扩展联动协议

- [ ] kernel 一等原语只保留：
  - `action call`
  - `event subscription`
- [ ] `resource` 建在 `action / event` 之上，而不是独立长成第三套核心协议
- [ ] `workflow delegation` 建在 `action / event` 之上，而不是进入 kernel 成为并列原语
- [ ] 默认私有，只有显式导出后才允许被调用或订阅
- [ ] capability 发现与 skill 解析默认只能看到 exported 面
- [ ] 禁止扩展之间裸对象直连
- [ ] 允许 runtime 内部对合法 kernel 调用做本地 fast-path，但不能暴露成开发者可依赖语义

## 状态与持久化

- [ ] kernel 默认只提供少量通用状态原语
- [x] 保留 `private scoped KV`
- [ ] 保留 `exported resource snapshot`
- [x] 保留 `conversation / user scoped state`
- [x] 保留 `append-only event log`
- [x] 默认不再为扩展继续新增核心专用 Prisma schema

## 减法优先级

- [ ] 第一阶段：收薄 `plugin host core`
- [x] 第二阶段：定义并固化统一 `extension kernel contract`
- [ ] 第三阶段：给 `MCP / skill` 做 adapter / bridge，而不是硬改其生态格式
- [ ] 第四阶段：把更多 builtin 迁成普通扩展消费者
- [ ] 第五阶段：删除不再必要的核心特判、专用持久化面和历史兼容层
- 进展摘要：
  - `extension kernel contract` 已固化到 `docs/扩展内核契约说明.md`
  - 已补齐 `plugin / conversation / user` scoped `storage.*`、`state.*`、`state.list`、`state.delete`
  - builtin / host / runtime / gateway / manifest / tool registry / plugin service 已完成多轮减法，核心职责已逐步退回到 facade、helper 与聚焦 service 的委派关系
  - 已删除一批无人消费死入口、核心特判和历史兼容命名，并补齐 `docs/扩展内核维护说明.md`

## 当前减法切片

- [x] AI provider runtime 只保留 `openai / anthropic / gemini` 三个协议族
- [x] provider catalog 只保留“目录模板 + 协议映射”职责，不回退到按厂商 SDK 扩张
- [x] 继续删除 AI 模块内部残留的 `official / format` 历史命名与空壳 helper 字段
- 进展摘要：
  - 聊天链路已按职责拆成 `plugin-target / completion / mutation / generation / response-hooks / task-persistence` 等聚焦 service
  - 插件治理与持久化链路已按职责拆成 `storage / event-write / lifecycle-write / read / governance-write` 等聚焦 service
  - AI provider runtime 已收敛到 `openai / anthropic / gemini` 三个协议族，`official / compatible / format` 等历史命名已基本清空

## 当前基线

- `builtin-plugin.transport.ts`: `1069 -> 246`
- `plugin-host.service.ts`: `1000+ -> 126`
- `plugin-runtime.service.ts`: `4287 -> 684`
- `plugin-runtime-input.helpers.ts`: `362 -> 5`
- `plugin-runtime-hook-result.helpers.ts`: `555 -> 4`
- `plugin.gateway.ts`: `1269 -> 364`
- `tool-registry.service.ts`: `487 -> 226`
- `plugin.service.ts`: `1059 -> 342`
- `chat-message.service.ts`: `1030 -> 65`
- `chat-message-generation.service.ts`: `503 -> 463`
- `chat-message-orchestration.service.ts`: `359 -> 242`
- `chat-task.service.ts`: `443 -> 379`
- `config-manager.loader.ts`: `426 -> 392`

## 当前下一步

- [x] 本轮已完成 `plugin-runtime-input.helpers.ts` 的按域拆分，并保留 barrel 导出面不变
- [x] 本轮已完成 `plugin-runtime-hook-result.helpers.ts` 的按域拆分，并保留 barrel 导出面不变
- [ ] 继续按域拆分仍超过建议线的 runtime / plugin helper 或 facade
- [ ] 优先处理不改变外部 contract 的参数读取、结果归一化和路由样板
- [ ] 下一候选优先查看 `plugin-runtime-hook-mutation.helpers.ts`、`plugin-runtime-host.facade.ts`、`plugin-runtime-subagent-hook-result.helpers.ts`
