# Findings

## 2026-04-27 LLM 覆盖矩阵与 smoke 复用收口

- 当前真实可用 provider 能力：
  - `nvidia` 已通过真实 smoke，适合覆盖文本与 tool-call 链路
  - `ds2api` 在更正为 `https://dsapi.cyberlangke.dpdns.org/v1` 后已通过真实 smoke
- 当前真实不可达能力：
  - 仓库内没有已配置且可直接用于真实图片输入的 provider，因此 `AiVisionService` 只能走 fake 覆盖
- 当前主要重复点：
  - `http-smoke.mjs` 原先在 fake/real 间复制 provider/chat 控制流；本轮已收口为共用 smoke 步骤函数
- 当前主要 LLM owner：
  - `AiManagementService.testConnection / discoverModels`
  - `ConversationMessagePlanningService` 主对话流
  - `ContextGovernanceService` 标题生成、压缩摘要
  - `AiVisionService` 图片转文本
  - `RuntimeHostService` 的 `llm.generate / llm.generate-text`
  - `RuntimeHostSubagentRunnerService` 子代理执行
- 当前覆盖结论：
  - fake smoke：
    - `ConversationMessagePlanningService` 主对话
    - `ContextGovernanceService` 命令压缩
    - `RuntimeHostService` 的 `llm.generate-text / llm.generate`
    - `RuntimeHostSubagentRunnerService` 子代理工具链
  - real smoke：
    - `AiManagementService.testConnection`
    - `ConversationMessagePlanningService` 主对话
    - `ContextGovernanceService` 标题生成与压缩摘要
    - 真实 `/compact` 目前需要至少两轮可压缩历史，`nvidia` 在“只压单条用户消息”的摘要 prompt 上会返回 `Invalid JSON response`
  - Jest：
    - `AiVisionService`
    - `RuntimeHostService`
    - `RuntimeHostSubagentRunnerService`
    - `AiManagementService`
    - `ContextGovernanceService`

## 2026-04-27 真实 provider 冒烟与默认 provider 行为修复

- `testConnection` 当前是占位实现，不联网。
- 现有 `smoke:server` 用 fake provider 验证内部链路，不能证明真实 provider 可用。
- 当前默认 provider 选择依赖 provider 列表顺序；若配置目录里存在占位 provider，则可能被误选。
- 新增真实 smoke 时，不能直接复用仓库主配置写盘；应复制指定 provider 到临时 smoke 配置目录，避免污染真实配置。
- 当前新增的真实 smoke 已证明两点：
  - 代码路径已经不再伪装成功，真实失败会在 smoke 中直接暴露
  - 本机当前对 `ds2api` 的真实失败点在 `testConnection`，错误为 `Client network socket disconnected before secure TLS connection was established`
- 因为真实 smoke 现在先走真实 `testConnection`，所以后续如果聊天仍失败，可以确认不是旧的假 `testConnection` 掩盖问题。
- 新增外链证据表明失败不局限于项目代码：
  - Windows `node:https` 直连 `/v1/models` 同样在 TLS 握手前被对端断开
  - Windows `curl.exe` 同样在 TLS 握手阶段失败
  - WSL `curl` 与 `openssl s_client` 结果一致，说明不是单一运行时的 TLS 栈问题
  - 当前域名 `ds2api.cyberlangke.dpdns.org` 在本机解析到 `198.18.0.66`，流量走 `FlClash` 接口；这说明还需要结合本机代理 / TUN / fake-ip 环境判断是否属于仓库外部条件
