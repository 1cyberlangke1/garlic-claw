# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成阶段统一压成摘要；细节证据、失败记录、判断过程继续放 `task_plan.md / progress.md / findings.md`。

## 规范化目标

- 执行层文件工具最终目标不是“名字接近 OpenCode”，而是：
  - 工具使用体验接近 `other/opencode`
  - 工具结果质量、错误提示、可恢复性、诊断反馈接近 `other/opencode`
  - 中间抽象足够稳定，后续适配更多执行后端时不需要回改工具层 owner
- 不保留兼容壳，不接受“旧 owner 换目录继续活着”。
- `bash / read / glob / grep / write / edit` 的公开语义继续以“当前 backend 可见路径”为主，不反向绑死到单个 project/worktree；但能力成熟度要对齐 OpenCode 水平。

## 当前基线

- `packages/server/src` 当前生产代码：约 `19042` 行。
- 本轮交付硬门槛：`packages/server/src <= 15000`。
- 长期规范化目标不变：继续向 `<= 10000` 收敛，但当前验收先以 `<= 15000` 为硬门槛。

## 已完成摘要

- `packages/shared` 已收口为 type-only，共享契约已完成一轮整理。
- 主聊天链路、provider 自定义扩展块、非流式/流式统一执行、历史压缩、display 消息、聊天刷新链、命令提示、事件日志、前端主要治理页面都已打通，并通过 fresh 验收。
- persona 已改为目录化存储；插件配置协议已收口为声明式 schema；远程插件静态接入 key 与元数据缓存已完成一轮基础落地。
- `skill / todo / webfetch / invalid / subagent(session 化)` 已完成一轮对齐 OpenCode 的公开语义收口。
- `bash / read / glob / grep / write / edit` 已完成一轮 runtime 抽象与插件化：
  - backend 可见路径语义已收口
  - runtime 审批链与 yolo 模式已落地
  - `builtin.runtime-tools` 已接管这 6 个工具
  - `RuntimeSessionEnvironment / RuntimeFilesystemBackend / RuntimeCommandBackend` 三层 owner 已落地
  - 第二 shell/filesystem backend 的真路由测试已通过
  - Windows 与 WSL 内部目录 fresh 验收、独立 judge 均已通过
- `bash` 输出后处理 owner 已开始落地：
  - `runtime-command-output.ts` 已成为主聊天与 `builtin.runtime-tools` 的共用渲染层
  - `bashOutput.maxLines / maxBytes / showTruncationDetails` 已接到插件配置 UI
  - `smoke:server / smoke:web-ui / lint` 已重新通过

## 当前判断

- 对齐 OpenCode 的公开工具语义：约 `70%`
- 对齐 OpenCode 的工具成熟度与执行体验：约 `50% ~ 60%`
- 对齐“方便迁移到新执行后端”的抽象质量：约 `65% ~ 70%`

当前主要短板：

- `bash`
  - 仍缺 OpenCode 那种 parser/AST 级静态分析。
  - 当前仍以启发式 hints 为主，复杂 quoting / 变量展开 / 命令替换 / 更深 PowerShell 语法仍弱。
- `read`
  - 当前已具备缺失路径建议、分流和截断保护。
  - 仍缺更成熟的 loaded-files / system-reminder owner。
- `glob / grep`
  - 当前已有 base path、partial、skipped diagnostics、截断摘要共享 owner。
  - 仍缺更强的排序、搜索后处理和 project-aware overlay。
- `write / edit`
  - 当前已有 diff / freshness / post-write 第一轮增强。
  - 仍缺更强的 rewrite 纠偏、格式化、写后诊断与更细工程反馈。
- runtime 抽象
  - 第二 backend 已成立。
  - 仍缺“第三个生产级 backend 几乎不用回改工具层”的 judge 级证据。
- 代码体积
  - `execution + runtime` 仍是主膨胀来源。
  - 当前大文件、宿主编排 owner 和静态预扫 owner 还没压到交付线。

## 本轮交付硬门槛

以下条件必须同时成立，才算本轮完成：

- 功能成熟度对齐 `other/opencode`
  - `bash / read / glob / grep / write / edit` 的公开语义、错误反馈、继续操作提示达到“模型可直接继续下一步”的水平。
  - 不再存在明显落后于 `other/opencode` 的主链缺口。
- 抽象质量达标
  - 至少补出第三个生产风格 backend 试点或等价证据。
  - `bash / read / glob / grep / write / edit` 工具服务不因新增 backend 而回改 owner。
- 代码体积达标
  - `packages/server/src <= 15000`。
  - 不能靠删功能、降验收标准或把同等复杂度换目录伪压缩。
- 验收达标
  - 受影响定向测试 fresh 通过。
  - `packages/shared` build。
  - `packages/plugin-sdk` build。
  - `packages/server` build。
  - root `npm run lint`。
  - root `npm run smoke:server`。
  - root `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`。
  - root `npm run smoke:web-ui`。
- judge 达标
  - `G20-4 / G20-5 / G20-6` 必须有独立 judge。
  - judge 需要显式确认“不是只换壳或只挪位置”。

## 代码膨胀控制规则

- 新增能力优先收成共享规则、稳定 contract、overlay 或 adapter，不直接继续堆进工具服务。
- 不新增新的通用 `helper / helpers` 抽象；需要复用时必须挂到真实 owner 下。
- 每补一类命令或一类成熟度能力，都要同时判断：
  - 能否复用现有共享规则
  - 能否顺手压掉旧重复控制流
  - 是否会把复杂度重新抬回工具层
- 禁止为了追进度把同类逻辑复制到：
  - `BashToolService`
  - 审批 service
  - tool registry
  - 前端展示层
- 本轮所有重构以“功能完成后仍能压回 `<= 15000`”为前提，不接受先无限膨胀、最后再指望集中清理。

## 可落地执行计划

### 执行规则

- 下面阶段必须串行推进，不能跳步宣布完成。
- 每一步都必须满足 4 件事后，才允许进入下一步：
  - 范围内代码与测试已落地
  - 范围内 fresh 验收已通过
  - 独立 judge 明确 `PASS`
  - `TODO.md / task_plan.md / progress.md / findings.md` 已同步
- 任一步 judge 未通过，只允许继续修当前步，不进入后续阶段。

### P21-1 Bash 静态预扫收口第一段

- 状态：进行中
- 范围：
  - 继续收口仍偏粗粒度的 PowerShell 写入 / 删除命令
  - 只允许复用现有共享规则：
    - `destination`
    - `path + leaf-name`
    - `value-flag 跳过`
    - `首个 positional target`
- 产出：
  - 新增一批命令级定向测试
  - `runtime-shell-command-hints.ts` 不新增第二套散乱判定 owner
- fresh 验收：
  - `packages/server`: `node ../../node_modules/jest/bin/jest.js --runInBand tests/execution/bash/bash-tool.service.spec.ts tests/execution/tool/tool-registry.service.spec.ts`
- judge：
  - 独立 judge 检查是否只是继续堆特判
  - 独立 judge 检查是否把判断散回 `BashToolService / tool-registry / 审批 service`

### P21-2 Bash 静态预扫收口第二段

- 状态：待开始
- 范围：
  - 只处理复杂 quoting / variable expansion / command substitution 的高价值误判点
  - 不引完整 parser
- 产出：
  - 新增最小必要规则或更薄的 rule owner
  - 明确哪些语法仍故意不支持
- fresh 验收：
  - `packages/server`: 同 `P21-1` 定向 jest
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- judge：
  - 独立 judge 检查是否出现“半成品 parser”
  - 独立 judge 检查新增规则是否真的压掉误判，而不是只换位置

### P21-3 Read 成熟度补齐

- 状态：待开始
- 范围：
  - 把最小 loaded-files reminder 收成稳定 owner
  - 补缺失 / 文件 / 目录 / 截断 / 分流场景的统一继续操作提示
- 产出：
  - `read` 结果文本更接近 OpenCode 的可继续操作提示
  - `ReadToolService` 进一步变薄
- fresh 验收：
  - 受影响定向测试
  - root: `npm run smoke:server`
- judge：
  - 独立 judge 检查 loaded-files 语义是否仍只是 freshness 壳
  - 独立 judge 检查 `ReadToolService` 是否真实变薄

### P21-4 Glob / Grep 成熟度补齐

- 状态：进行中
- 范围：
  - 排序、continuation hint、搜索后处理、project-aware overlay
  - 压缩搜索结果摘要与 skipped diagnostics 的重复 owner
- 产出：
  - `glob / grep` 输出可直接接 `read / edit / write`
  - 继续减少重复文案和重复控制流
- fresh 验收：
  - 受影响定向测试
  - root: `npm run smoke:server`
- judge：
  - 独立 judge 检查是否只是增加文案，没有补真实搜索成熟度
  - 独立 judge 检查搜索 owner 是否继续停留在工具层

### P21-5 Write / Edit 成熟度补齐

- 状态：进行中
- 范围：
  - rewrite / edit 匹配修正
  - post-write formatting / diagnostics
  - diff / patch / freshness 的重复控制流压缩
- 产出：
  - `write / edit` 结果接近 OpenCode 的工程反馈
  - 核心 owner 继续向 filesystem / overlay 下沉
- fresh 验收：
  - 受影响定向测试
  - root: `npm run smoke:server`
- judge：
  - 独立 judge 检查是否真实增强修改质量，而不是只增输出字段
  - 独立 judge 检查 post-write 能力是否仍然挂在错误 owner 下

### P21-6 第三 backend 试点

- 状态：待开始
- 范围：
  - 补出第三个生产风格 backend 试点或等价强证据
  - 工具服务不得因 backend 增加而回改 owner
- 产出：
  - 第三 backend 真路由证据
  - 对应 fresh 验收与迁移性判断
- fresh 验收：
  - 受影响定向测试
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
- judge：
  - 独立 judge 检查不是 mock 迁移性
  - 独立 judge 检查 6 个工具服务未因 backend 增加而回改

### P21-7 代码体积压缩到 `<= 15000`

- 状态：待开始
- 范围：
  - 主战场只看：
    - `execution`
    - `runtime`
    - 少量 `plugin / conversation / ai` 大 owner
  - 不允许删功能伪达标
- 产出：
  - `packages/server/src <= 15000`
  - 大文件、宿主编排 owner、静态预扫 owner 明显变薄
- fresh 验收：
  - 每次压缩后重新统计 `packages/server/src`
  - 最终跑完整 fresh 链
- judge：
  - 独立 judge 检查是否存在“把同等复杂度换目录继续活着”
  - 独立 judge 检查压缩是否损伤前面已补的成熟度

### P21-8 最终总验收

- 状态：待开始
- 范围：
  - 汇总 `P21-1 ~ P21-7`
  - 做最终成熟度比对、fresh 验收、独立 judge
- fresh 验收：
  - `packages/shared`: `npm run build`
  - `packages/plugin-sdk`: `npm run build`
  - `packages/server`: `npm run build`
  - root: `npm run lint`
  - root: `npm run smoke:server`
  - root: `GARLIC_CLAW_RUNTIME_SHELL_BACKEND=native-shell npm run smoke:server`
  - root: `npm run smoke:web-ui`
- judge：
  - `G20-4 / G20-5 / G20-6` 各自独立 judge
  - 最终总 judge 检查：
    - 成熟度已对齐 `other/opencode`
    - `packages/server/src <= 15000`
    - 不存在假完成

## 完成定义

以下四条同时满足，才允许说“本轮做完”：

- 对齐 `other/opencode` 的功能成熟度达到可交付水平。
- `packages/server/src <= 15000`。
- fresh 验收全通过。
- 独立 judge PASS。

## 固定约束

- 不保留旧兼容层，不接受把旧 owner 换个位置继续保留。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 准备把阶段标记为已完成时，必须先做独立 judge 复核。
