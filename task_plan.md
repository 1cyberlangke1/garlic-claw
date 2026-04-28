# Task Plan

## 2026-04-27 runtime/workspace 路径收口与 tmp 清理

1. 新建统一路径 owner
  - 区分 `runtime-workspaces / server-state / test-artifacts`
  - 删除 `packages/server/tmp` 的 legacy 读取分支
2. 补自动清理
  - 服务启动时清理旧 `packages/server/tmp`
  - Jest 通过 `globalSetup/globalTeardown` 清理 `workspace/test-artifacts/server`
  - `http-smoke` 在脚本结束时清理自己的临时目录
3. fresh 验收
  - `npm run typecheck:server`
  - 定向 Jest
  - `npm run smoke:server`

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成

## 2026-04-27 skill 链路运行时故障修复

1. 更新计划文件
  - 记录 `skill` 已成功加载，但后续链路存在运行时故障
  - 明确本轮验收聚焦 `tool repair / shell backend / webfetch`
2. 根因调查
  - 追踪 `toolName` 被污染为 `<|channel|>commentary` 的进入点
  - 核对 shell backend 默认选择、配置落点与运行宿主不一致的问题
  - 核对 `webfetch` 的文本内容类型白名单
3. 实现修复
  - 工具名污染时优先清洗并自动修正到真实工具
  - Windows 下 shell backend 默认与配置语义收口到可执行、与模型习惯一致的 backend
  - `webfetch` 支持 `application/text` 这类文本响应
4. fresh 验收
  - `packages/server` typecheck
  - 相关 Jest：`ai-model-execution / runtime-native-shell / runtime-tools-settings / webfetch`
  - `npm run smoke:server`

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成

## 2026-04-28 shell 工具名动态化与 PowerShell workdir 修复

1. 更新计划文件
  - 记录当前 PowerShell backend 下 `workdir` 被错误解析成 `/D:\...`
  - 记录当前 shell 工具名仍固定为 `bash`
2. 根因调查
  - 追踪 runtime shell `workdir` 的路径归一化链路
  - 盘点 `bash` 工具名在注册、执行、测试与冒烟中的硬编码位置
3. 实现修复
  - 修 PowerShell / native-shell 下的绝对路径 `workdir` 解析
  - 让 shell 工具名按 backend 动态暴露
  - 保证现有 runtime 权限审查、结果展示与工具执行链路仍正常
4. fresh 验收
  - 相关 Jest
  - `npm run typecheck:server`
  - `npm run smoke:server`

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成

## 2026-04-27 默认模型重启后恢复错误

1. 更新计划文件
  - 记录“前端把默认模型切到 `openai/gpt-oss-20b` 后，重启又显示错误”的现象
  - 明确区分“provider 配置写盘”与“聊天页默认模型恢复”
2. 根因调查
  - 核对 `setDefaultModel` 后端写盘是否成功
  - 核对前端重启后是否读取了后端默认选择，还是本地重新猜测
3. 实现修复
  - 聊天页恢复默认模型时，改为优先读取后端默认 provider/model
  - 仅在后端默认不可用时，才回退到本地枚举逻辑
4. fresh 验收
  - `packages/web` 相关 Vitest
  - `packages/web` typecheck
  - 必要时补跑前端 smoke

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成

## 2026-04-27 LLM 覆盖矩阵与 smoke 复用收口

1. 同步计划文件
   - 压缩旧的 provider 修复阶段
   - 切到当前“LLM 全覆盖 + smoke 复用 + 自动清理”任务
2. 盘点覆盖矩阵
   - 对照所有 `generateText / streamText` owner
   - 标注现有 fake / real 覆盖来源与缺口
3. 重构 smoke 编排
   - 把 fake / real 共用 provider/chat 步骤收口为同一套流程
   - 把临时目录、临时配置、会话清理逻辑收口
4. 补齐 fake / real 缺口
   - fake：`context-compaction / runtime-host llm / vision / subagent`
   - real：`chat / context-compaction / runtime-host llm / subagent`
5. fresh 验收
  - 相关 Jest
  - `npm run smoke:server`
  - `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=nvidia npm run smoke:server:real`
  - `GARLIC_CLAW_SMOKE_REAL_PROVIDER_ID=ds2api npm run smoke:server:real`
  - `npm run typecheck:server`
  - `npm run lint`
6. judge
  - 独立检查覆盖矩阵、代码复用与清理是否达标

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成
- 步骤 5 已完成

## 2026-04-28 weather skill 默认入口收口

1. 更新计划文件
  - 记录当前 weather skill 仍默认引导到 shell 内联 HTTP，而不是脚本入口
  - 记录本轮只处理天气 skill / 脚本链路，不扩展到其他纠错能力
2. 追历史实现
  - 查改成 skill 之前的天气 MCP / 直连工具实现
  - 对照旧能力边界，确认当前脚本至少不能比旧入口更弱
3. 修改 skill 与脚本
  - skill 文案改成中性描述
  - 默认入口改为 `scripts/weather.js`
  - 完善脚本的参数校验、编码、异常输出与单行结果格式
4. fresh 验收
  - 相关 Jest
  - 必要时直接执行脚本验证

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成

## 2026-04-27 provider 接入语义收口与新对话默认模型修复

1. 收口 provider 公开语义
  - 删除 `AiProviderMode`
  - 前后端 provider API 只保留 `driver`
  - 旧 `mode` 仅允许作为历史输入被忽略，不再继续写出
2. 修默认模型选择
  - 持久化“显式默认 provider/model”
  - 设置页改默认模型后，新对话应直接命中该选择
  - 删除默认 provider / 默认模型后，选择应自动回退
3. 修 smoke 与前端表单
  - provider 编辑弹窗移除“接入方式”下拉
  - browser smoke / http smoke 改成新表单与新请求体
4. fresh 验收
  - `npm run build -w packages/shared`
  - `npm run typecheck:server`
  - `npm run typecheck -w packages/web`
  - 定向 Jest / Vitest
  - `npm run smoke:server`
  - `npm run smoke:web-ui`

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成

## 2026-04-27 CRUD 覆盖补齐

1. 更新计划文件
  - 压缩上一轮已完成阶段
  - 切到当前“CRUD 覆盖补齐”任务
2. 盘点缺口
  - 查 `AiController` 未覆盖的方法
  - 查 smoke 中删除后缺失的读回/列表校验
3. 补测试
  - 增补 `AiController` 的 provider/model/config CRUD 单测
  - 增补 smoke 的删后不可见断言
4. fresh 验收
  - 相关 Jest
  - `npm run smoke:server`
  - 必要时补跑真实 smoke
5. judge
  - 独立检查 CRUD 覆盖是否补齐，且未破坏既有 LLM 覆盖

## 当前进度

- 步骤 1 已完成
- 步骤 2 已完成
- 步骤 3 已完成
- 步骤 4 已完成
- 步骤 5 已完成
