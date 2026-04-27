# Task Plan

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
- 步骤 6 已完成

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
