# Garlic Claw TODO

> 最高优先级要求：
> 后续主路线不再是“继续抛光几个热点文件”，而是完整重写计划。
> 目标是在不改变对外接口、现有协议语义和目标功能的前提下，把 Garlic Claw 改成长期可维护、可持续演进的结构。
>
> 已完成事项不再保留在本文件。
> 详细过程、阶段记录和验证流水账只保留在 `task_plan.md / progress.md / findings.md`。

## 当前基线

- 当前统计口径：
  - `packages/server/src` 只统计生产代码
  - 不含 `*.spec.ts`
  - 不含 `*.e2e-spec.ts`
- 当前最新实时口径：
  - `packages/server = 24566`
  - `packages/web = 16672`
  - `packages/shared = 7668`
  - `packages/plugin-sdk = 5063`
  - `packages/server/src/plugin = 9504`
  - `packages/server/src/ai = 4748`
  - `packages/server/src/chat = 3359`
- 当前最厚的结构热点：
  - `packages/shared/src/types/plugin.ts = 1372`
  - `packages/plugin-sdk/src/index.ts = 5063`
  - `packages/server/src/chat/chat-message-mutation.service.ts = 547`
  - `packages/server/src/plugin/plugin.gateway.ts = 320`
  - `packages/server/src/plugin/plugin-runtime.service.ts = 283`
  - `packages/web/src/views/SkillsView.vue = 549`
  - `packages/web/src/composables/use-plugin-management.ts = 542`
  - `packages/web/src/composables/use-chat-view.ts = 519`
- 当前最厚的测试热点：
  - `packages/server/src/plugin/plugin-runtime.service.spec.ts = 5711`
  - `packages/server/src/chat/chat-message.service.spec.ts = 2883`
  - `packages/server/src/plugin/builtin/builtin-plugin.transport.spec.ts = 2525`

## 计划依据（已核对的实际代码）

- 后端入口与模块边界：
  - `packages/server/src/app.module.ts`
  - `packages/server/src/plugin/plugin.module.ts`
  - `packages/server/src/chat/chat.module.ts`
  - `packages/server/src/ai/ai.module.ts`
  - `packages/server/src/tool/tool.module.ts`
  - `packages/server/src/skill/skill.module.ts`
- 后端核心 owner 与聚合点：
  - `packages/server/src/plugin/plugin-runtime.service.ts`
  - `packages/server/src/plugin/plugin.gateway.ts`
  - `packages/server/src/plugin/plugin-runtime-orchestrator.service.ts`
  - `packages/server/src/tool/tool-registry.service.ts`
  - `packages/server/src/mcp/mcp.service.ts`
  - `packages/server/src/chat/chat-message.service.ts`
  - `packages/server/src/ai/ai-provider.service.ts`
- 共享契约与 SDK：
  - `packages/shared/src/types/plugin.ts`
  - `packages/shared/src/index.ts`
  - `packages/plugin-sdk/src/index.ts`
  - `packages/plugins/plugin-pc/src/index.ts`
- 前端壳层、状态与 API：
  - `packages/web/src/router/index.ts`
  - `packages/web/src/views/AppLayout.vue`
  - `packages/web/src/stores/chat.ts`
  - `packages/web/src/composables/use-chat-view.ts`
  - `packages/web/src/composables/use-plugin-management.ts`
  - `packages/web/src/api/base.ts`
  - `packages/web/src/api/plugins.ts`

## 历史路线状态

- [已被新计划替代] 2026-04-04 之前的局部抛光路线：
  - `chat-message-mutation.service.ts`
  - `chat-message-generation.service.ts`
  - `chat-task.service.ts`
  - `plugin.gateway.ts`
  - `plugin.controller.ts`
  - `plugin-runtime.service.ts`
  - `plugin-runtime-host.facade.ts`
  - `plugin-runtime-transport.facade.ts`
- 替代原因：
  - 当前维护成本已经横跨 `server / shared / plugin-sdk / web`
  - 继续只做文件级减法，会把复杂度从一个包转移到另一个包
  - 后续执行必须改为“总纲 + 施工版”，不能继续停留在局部压行

## 固定约束

- [ ] 对外保持不变：
  - HTTP API 路径、DTO 语义、返回语义
  - 插件 WebSocket 协议语义
  - 现有 `plugin / MCP / skill` 作者格式兼容
  - 用户可见能力和目标功能
- [ ] 不接受：
  - 新增兼容层维持旧结构
  - 把 `server` 复杂度平移到 `shared / plugin-sdk / web`
  - 新增泛化 `helper / helpers`
  - 把同等复杂度换个名字继续留在 `core`
- [ ] 默认原则：
  - `plugin / MCP / skill` 的统一只发生在 runtime contract
  - kernel 一等原语只保留 `action call` 与 `event subscription`
  - builtin 只做参考实现，不保留长期特权
  - 新能力优先进入 `SDK / adapter / plugin-side facade`

## 项目最终目标

- [ ] `packages/server/src <= 10000`
- [ ] `core` 只保留：
  - runtime contract
  - extension governance
  - host capability
  - minimal state primitives
  - runtime dispatch / orchestration
- [ ] `packages/shared` 不再存在“一个文件承载整套扩展协议”的总线文件
- [ ] `packages/plugin-sdk` 不再存在单文件超大入口
- [ ] `packages/web` 不再由单一 shell 绑定聊天与后台管理
- [ ] `PluginModule <-> ToolModule` 双向循环依赖消失
- [ ] 巨型系统真相源测试被拆成：
  - contract tests
  - domain tests
  - adapter tests
  - 少量端到端集成测试

## 完成判定

- [ ] 同时满足下面条件才算完成：
  - `packages/server/src <= 10000`
  - `plugin / MCP / skill / builtin` 作者侧复杂度主要位于 `SDK / adapter`
  - Host API、hook family、runtime exported surface 已变成少量稳定 contract
  - `shared / plugin-sdk / web` 没有因为迁移无序回涨
  - 不再依赖历史 owner、临时 facade、兼容壳维持主流程

## 工期与人力预估

- [ ] 单人全职推进：
  - 预计 `12 ~ 16 周`
  - 前提：先冻结当前工作树的大迁移中间态
- [ ] 双人并行推进：
  - 预计 `8 ~ 10 周`
  - 分工建议：
    - A：`shared + plugin-sdk + server/plugin`
    - B：`chat + ai + web`
- [ ] 三人并行推进：
  - 预计 `6 ~ 8 周`
  - 前提：必须先把 contract freeze 和模块分工做实
- [ ] 当前估时失效条件：
  - 当前工作树的未提交迁移不先收口
  - 执行中继续允许新需求进入 core 主链
  - 一边重写一边维持两套长期并行结构

## 并行策略

- [ ] 允许并行的前提：
  - `shared` 的 contract freeze 已完成
  - 各自写集不重叠
  - 每个阶段有独立回归命令
- [ ] 推荐并行顺序：
  - 先串行：
    - 阶段 -1
    - 阶段 0
  - 再并行：
    - 阶段 1 和阶段 2
  - 再串行汇合：
    - 阶段 3
  - 再有限并行：
    - 阶段 4 / 阶段 5 / 阶段 6
  - 最后串行收口：
    - 阶段 7
    - 阶段 8

## 完整重写计划（施工版）

### 阶段 -1：冻结当前工作树，建立可施工起点

- [ ] 目标：
  - 先收口当前大范围未提交迁移，避免一边重写一边踩并行改动
- [ ] 主要文件范围：
  - `packages/server/src/plugin/**`
  - `packages/server/src/chat/**`
  - `packages/shared/src/**`
  - `TODO.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- [ ] 交付物：
  - 当前迁移的稳定中间态
  - 清晰的“哪些文件还在迁移、哪些文件已经冻结”的边界
  - 可供后续阶段切分的基线分支
- [ ] 前置依赖：
  - 无
- [ ] 阻塞因素：
  - 当前 `git status` 仍覆盖 `plugin / chat / shared` 大量文件
- [ ] 验收命令：
  - `git diff --check`
  - `cd packages/server && npx tsc --noEmit`
- [ ] 估时：
  - 单人 `2 ~ 4 天`
  - 双人 `1 ~ 2 天`
- [ ] 并行性：
  - 不允许并行

### 阶段 0：冻结 contract，建立迁移锚点

- [ ] 目标：
  - 把所有对外 contract 固定下来，后面只替换实现，不替换外部语义
- [ ] 主要文件范围：
  - `packages/server/src/app.module.ts`
  - `packages/server/src/plugin/plugin.module.ts`
  - `packages/server/src/chat/chat.module.ts`
  - `packages/server/src/ai/ai.module.ts`
  - `packages/server/src/tool/tool.module.ts`
  - `packages/server/src/skill/skill.module.ts`
  - `packages/web/src/api/*.ts`
  - `packages/shared/src/types/plugin.ts`
  - `packages/plugin-sdk/src/index.ts`
- [ ] 交付物：
  - HTTP contract 索引
  - WS contract 索引
  - plugin manifest / host method / hook family 索引
  - contract tests 清单
- [ ] 前置依赖：
  - 阶段 -1 完成
- [ ] 验收命令：
  - `cd packages/server && npm test -- --runInBand`
  - `cd packages/web && npm run test:run`
- [ ] 估时：
  - 单人 `3 ~ 5 天`
  - 双人 `2 ~ 3 天`
- [ ] 并行性：
  - 不允许并行

### 阶段 1：重写 `packages/shared`

- [ ] 目标：
  - 拆掉共享契约总线，建立按 concern 分层的稳定 contract
- [ ] 主要文件范围：
  - `packages/shared/src/types/plugin.ts`
  - `packages/shared/src/index.ts`
  - `packages/shared/src/chat-context.ts`
  - `packages/shared/src/chat-host-services.ts`
  - `packages/shared/src/chat-message-parts.ts`
  - `packages/shared/src/plugin-event-view.ts`
  - `packages/shared/src/plugin-gateway-*.ts`
  - `packages/shared/src/plugin-host-*.ts`
  - `packages/shared/src/plugin-runtime-*.ts`
  - `packages/shared/src/plugin-subagent-task.ts`
- [ ] 交付物：
  - 分层 contract 文件集
  - 新的 re-export 规则
  - 旧 contract 到新 contract 的映射表
- [ ] 前置依赖：
  - 阶段 0 完成
- [ ] 验收命令：
  - `cd packages/shared && npm run build`
  - `npm run lint`
- [ ] 估时：
  - 单人 `1.5 ~ 2 周`
  - 双人 `1 周`
- [ ] 并行性：
  - 可与阶段 2 部分并行

### 阶段 2：重写 `packages/plugin-sdk`

- [ ] 目标：
  - 从单文件超集入口改成可维护的多入口 SDK
- [ ] 主要文件范围：
  - `packages/plugin-sdk/src/index.ts`
  - `packages/plugins/plugin-pc/src/index.ts`
  - 新增：
    - `packages/plugin-sdk/src/client/*`
    - `packages/plugin-sdk/src/authoring/*`
    - `packages/plugin-sdk/src/host/*`
    - `packages/plugin-sdk/src/codec/*`
    - `packages/plugin-sdk/src/recipes/*`
- [ ] 交付物：
  - 多入口 SDK
  - typed authoring DSL
  - 示例插件迁移到新 API
- [ ] 前置依赖：
  - 阶段 0 完成
  - 阶段 1 的新 contract 初步稳定
- [ ] 验收命令：
  - `cd packages/plugin-sdk && npm run build`
  - `cd packages/plugins/plugin-pc && npm run build`
- [ ] 估时：
  - 单人 `1 ~ 1.5 周`
  - 双人 `4 ~ 6 天`
- [ ] 并行性：
  - 可与阶段 1 后半段并行

### 阶段 3：重写 `packages/server/src/plugin`

- [ ] 目标：
  - 把 plugin 系统真正拆成 `kernel / adapter / governance`
- [ ] 主要文件范围：
  - `packages/server/src/plugin/plugin.module.ts`
  - `packages/server/src/plugin/plugin-runtime.service.ts`
  - `packages/server/src/plugin/plugin-runtime-orchestrator.service.ts`
  - `packages/server/src/plugin/plugin-runtime-*.facade.ts`
  - `packages/server/src/plugin/plugin.gateway.ts`
  - `packages/server/src/plugin/plugin.controller.ts`
  - `packages/server/src/plugin/plugin-route.controller.ts`
  - `packages/server/src/plugin/plugin.service.ts`
  - `packages/server/src/plugin/plugin-read.service.ts`
  - `packages/server/src/plugin/plugin-host*.ts`
  - `packages/server/src/plugin/builtin/*`
  - `packages/server/src/tool/tool.module.ts`
- [ ] 交付物：
  - 新 plugin kernel
  - adapter 层
  - governance 层
  - 去掉 `PluginModule <-> ToolModule` 双向引用
- [ ] 前置依赖：
  - 阶段 1 完成
  - 阶段 2 完成
- [ ] 阻塞因素：
  - 当前 `plugin` 域仍有大量迁移中文件
- [ ] 验收命令：
  - `cd packages/server && npx tsc --noEmit`
  - `cd packages/server && npm test -- --runInBand src/plugin/plugin-runtime.service.spec.ts src/plugin/plugin.gateway.spec.ts src/plugin/plugin.controller.spec.ts`
  - `cd packages/server && npm run build`
  - `cd packages/server && npm run smoke:http`
- [ ] 估时：
  - 单人 `2.5 ~ 3.5 周`
  - 双人 `1.5 ~ 2 周`
- [ ] 并行性：
  - 只允许内部按写集小范围并行

### 阶段 4：重写 `packages/server/src/tool / skill / mcp / automation`

- [ ] 目标：
  - 让这些模块都变成 kernel 的消费者，不再互相硬绑定
- [ ] 主要文件范围：
  - `packages/server/src/tool/tool.module.ts`
  - `packages/server/src/tool/tool-registry.service.ts`
  - `packages/server/src/tool/*tool.provider.ts`
  - `packages/server/src/skill/skill.module.ts`
  - `packages/server/src/skill/skill-*.ts`
  - `packages/server/src/mcp/mcp.service.ts`
  - `packages/server/src/mcp/mcp-*.ts`
  - `packages/server/src/automation/automation.service.ts`
  - `packages/server/src/automation/automation.module.ts`
- [ ] 交付物：
  - tool 聚合层和 plugin 内核解耦
  - skill / MCP adapter 化
  - automation 不再维护扩展特判路径
- [ ] 前置依赖：
  - 阶段 3 完成
- [ ] 验收命令：
  - `cd packages/server && npx tsc --noEmit`
  - `cd packages/server && npm test -- --runInBand src/tool/tool-registry.service.spec.ts src/skill/skill-execution.service.spec.ts src/mcp/mcp.service.spec.ts src/automation/automation.service.spec.ts`
  - `cd packages/server && npm run build`
- [ ] 估时：
  - 单人 `1.5 ~ 2 周`
  - 双人 `1 周`
- [ ] 并行性：
  - 可拆成 `tool/skill` 与 `mcp/automation` 两条线

### 阶段 5：重写 `packages/server/src/chat`

- [ ] 目标：
  - 让 chat 只保留会话状态机、消息持久化和编排，不再承载扩展 payload 装配
- [ ] 主要文件范围：
  - `packages/server/src/chat/chat.module.ts`
  - `packages/server/src/chat/chat-message.service.ts`
  - `packages/server/src/chat/chat-message-mutation.service.ts`
  - `packages/server/src/chat/chat-message-generation.service.ts`
  - `packages/server/src/chat/chat-message-orchestration.service.ts`
  - `packages/server/src/chat/chat-task.service.ts`
  - `packages/server/src/chat/chat-task-persistence.service.ts`
  - `packages/server/src/chat/chat-message-session.ts`
  - `packages/server/src/chat/chat-message-*.ts`
- [ ] 交付物：
  - 新 chat 用例边界
  - message mutation / generation / task 的职责重划
  - 移除 chat 中对扩展协议的重复装配
- [ ] 前置依赖：
  - 阶段 3 完成
  - 阶段 4 的 tool 能力聚合稳定
- [ ] 验收命令：
  - `cd packages/server && npx tsc --noEmit`
  - `cd packages/server && npm test -- --runInBand src/chat/chat-message.service.spec.ts src/chat/chat-message-mutation.service.spec.ts src/chat/chat-message-generation.service.spec.ts src/chat/chat-task.service.spec.ts`
  - `cd packages/server && npm run build`
  - `cd packages/server && npm run smoke:http`
- [ ] 估时：
  - 单人 `1.5 ~ 2 周`
  - 双人 `1 周`
- [ ] 并行性：
  - 只能在 `generation/task` 与 `read/projection` 之间小范围并行

### 阶段 6：重写 `packages/server/src/ai`

- [ ] 目标：
  - 让 AI 模块收敛为独立能力模块，不再向 chat/plugin 泄露杂糅 helper
- [ ] 主要文件范围：
  - `packages/server/src/ai/ai.module.ts`
  - `packages/server/src/ai/ai-provider.service.ts`
  - `packages/server/src/ai/ai-model-execution.service.ts`
  - `packages/server/src/ai/ai-management.service.ts`
  - `packages/server/src/ai/config/*`
  - `packages/server/src/ai/registry/*`
  - `packages/server/src/ai/providers/*`
  - `packages/server/src/ai/vision/*`
- [ ] 交付物：
  - provider / model / execution / config / vision 分层
  - AI 模块稳定导出面
- [ ] 前置依赖：
  - 阶段 3 完成
  - 阶段 5 的 chat 调用面已稳定
- [ ] 验收命令：
  - `cd packages/server && npx tsc --noEmit`
  - `cd packages/server && npm test -- --runInBand src/ai/ai-provider.service.spec.ts src/ai/ai-model-execution.service.spec.ts src/ai/ai-management.service.spec.ts src/ai/vision/image-to-text.service.spec.ts`
  - `cd packages/server && npm run build`
- [ ] 估时：
  - 单人 `1 ~ 1.5 周`
  - 双人 `4 ~ 6 天`
- [ ] 并行性：
  - 可与阶段 5 后半段有限并行

### 阶段 7：重写 `packages/web`

- [ ] 目标：
  - 从单一 shell 改成聊天工作台和管理后台双壳层
- [ ] 主要文件范围：
  - `packages/web/src/router/index.ts`
  - `packages/web/src/views/AppLayout.vue`
  - `packages/web/src/views/ChatView.vue`
  - `packages/web/src/views/PluginsView.vue`
  - `packages/web/src/views/ProviderSettings.vue`
  - `packages/web/src/views/SkillsView.vue`
  - `packages/web/src/views/ToolsView.vue`
  - `packages/web/src/views/AutomationsView.vue`
  - `packages/web/src/stores/chat.ts`
  - `packages/web/src/composables/use-chat-view.ts`
  - `packages/web/src/composables/use-plugin-management.ts`
  - `packages/web/src/composables/use-provider-settings.ts`
  - `packages/web/src/api/*.ts`
- [ ] 交付物：
  - 双 shell
  - feature 化目录结构
  - store 只做 resource cache / command dispatch
  - composable 只做页面交互
- [ ] 前置依赖：
  - 阶段 1 完成
  - 阶段 3 ~ 6 的 API/contract 已冻结
- [ ] 验收命令：
  - `cd packages/web && npx vue-tsc --noEmit`
  - `cd packages/web && npm run test:run`
  - `cd packages/web && npm run build`
- [ ] 估时：
  - 单人 `2 ~ 3 周`
  - 双人 `1.5 ~ 2 周`
- [ ] 并行性：
  - 可拆成 `chat shell` 与 `admin shell` 两条线

### 阶段 8：重写测试体系、清退旧结构、完成验收

- [ ] 目标：
  - 拆掉大 spec，清退临时桥接和历史 owner，完成最终验收
- [ ] 主要文件范围：
  - `packages/server/src/plugin/plugin-runtime.service.spec.ts`
  - `packages/server/src/chat/chat-message.service.spec.ts`
  - `packages/server/src/plugin/builtin/builtin-plugin.transport.spec.ts`
  - 各阶段引入的 contract/domain/adapter tests
  - `README.md`
  - `docs/插件开发指南.md`
  - `docs/扩展内核契约说明.md`
  - `docs/后端模型调用接口说明.md`
- [ ] 交付物：
  - 四层测试结构
  - 清理后的目录树
  - 更新后的文档
  - 最终验收报告
- [ ] 前置依赖：
  - 阶段 1 到阶段 7 完成
- [ ] 验收命令：
  - `cd packages/shared && npm run build`
  - `cd packages/plugin-sdk && npm run build`
  - `cd packages/server && npx tsc --noEmit`
  - `cd packages/server && npm test -- --runInBand`
  - `cd packages/server && npm run build`
  - `cd packages/server && npm run smoke:http`
  - `cd packages/web && npx vue-tsc --noEmit`
  - `cd packages/web && npm run test:run`
  - `cd packages/web && npm run build`
- [ ] 估时：
  - 单人 `1 ~ 1.5 周`
  - 双人 `4 ~ 6 天`
- [ ] 并行性：
  - 前半段可拆文档与测试
  - 最终验收必须串行

## 当前真正的下一步

- [ ] 当前迁移基线已进入冻结提交阶段：
  - 本轮工作树已通过 `shared build`、`server tsc`、`web vue-tsc`、`plugin/chat/tool/automation` 定向测试、`server/web build` 与 `smoke:http x3`
  - 下一步不再继续追加局部迁移，直接以这版基线进入阶段 0
- [ ] 立即进入阶段 0：
  - 冻结 HTTP / WS / manifest / host method / hook family contract
  - 建立回归锚点与 contract tests 清单
