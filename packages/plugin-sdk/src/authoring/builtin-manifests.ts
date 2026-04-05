import type {
  PluginCapability,
  PluginManifest,
  PluginRouteDescriptor,
} from '@garlic-claw/shared';
import {
  CONVERSATION_TITLE_CONFIG_FIELDS,
} from './conversation-helpers';
import {
  PERSONA_ROUTER_CONFIG_FIELDS,
  PROVIDER_ROUTER_DEFAULT_SHORT_CIRCUIT_REPLY,
  PROVIDER_ROUTER_CONFIG_FIELDS,
} from './router-helpers';

export interface PluginSubagentDelegateConfig {
  targetProviderId?: string;
  targetModelId?: string;
  allowedToolNames?: string;
  maxSteps?: number;
}

export const MEMORY_CONTEXT_DEFAULT_LIMIT = 5;
export const MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX = '与此用户相关的记忆';
export const KB_CONTEXT_DEFAULT_LIMIT = 3;
export const KB_CONTEXT_DEFAULT_PROMPT_PREFIX = '与当前问题相关的系统知识';
export const SUBAGENT_DELEGATE_DEFAULT_MAX_STEPS = 4;
export const MEMORY_CONTEXT_CONFIG_FIELDS = [
  {
    key: 'limit',
    type: 'number',
    description: '每次检索长期记忆的最大条数',
    defaultValue: MEMORY_CONTEXT_DEFAULT_LIMIT,
  },
  {
    key: 'promptPrefix',
    type: 'string',
    description: '记忆摘要写入系统提示词时的前缀',
    defaultValue: MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
  },
] satisfies NonNullable<PluginManifest['config']>['fields'];

export const KB_CONTEXT_CONFIG_FIELDS = [
  {
    key: 'limit',
    type: 'number',
    description: '每次检索系统知识的最大条数',
    defaultValue: KB_CONTEXT_DEFAULT_LIMIT,
  },
  {
    key: 'promptPrefix',
    type: 'string',
    description: '知识摘要写入系统提示词时的前缀',
    defaultValue: KB_CONTEXT_DEFAULT_PROMPT_PREFIX,
  },
] satisfies NonNullable<PluginManifest['config']>['fields'];

export const SUBAGENT_DELEGATE_CONFIG_FIELDS = [
  {
    key: 'targetProviderId',
    type: 'string',
    description: '子代理默认使用的 provider ID',
  },
  {
    key: 'targetModelId',
    type: 'string',
    description: '子代理默认使用的 model ID',
  },
  {
    key: 'allowedToolNames',
    type: 'string',
    description: '允许子代理使用的工具名列表，使用英文逗号分隔',
  },
  {
    key: 'maxSteps',
    type: 'number',
    description: '子代理最多允许多少轮工具调用',
    defaultValue: SUBAGENT_DELEGATE_DEFAULT_MAX_STEPS,
  },
] satisfies NonNullable<PluginManifest['config']>['fields'];

const MEMORY_SAVE_TOOL_CAPABILITY: PluginCapability = {
  name: 'save_memory',
  description: '将重要信息保存到长期记忆中',
  parameters: {
    content: {
      type: 'string',
      description: '要记住的信息',
      required: true,
    },
    category: {
      type: 'string',
      description: '记忆类别',
    },
    keywords: {
      type: 'string',
      description: '逗号分隔的关键词',
    },
  },
};

const MEMORY_RECALL_TOOL_CAPABILITY: PluginCapability = {
  name: 'recall_memory',
  description: '搜索用户长期记忆',
  parameters: {
    query: {
      type: 'string',
      description: '搜索查询',
      required: true,
    },
  },
};

export const MEMORY_TOOLS_MANIFEST_TOOLS: NonNullable<PluginManifest['tools']> = [
  MEMORY_SAVE_TOOL_CAPABILITY,
  MEMORY_RECALL_TOOL_CAPABILITY,
];

const CORE_CURRENT_TIME_TOOL_CAPABILITY: PluginCapability = {
  name: 'getCurrentTime',
  description: '获取当前日期和时间',
  parameters: {},
};

const CORE_SYSTEM_INFO_TOOL_CAPABILITY: PluginCapability = {
  name: 'getSystemInfo',
  description: '获取服务器的基本系统信息',
  parameters: {},
};

const CORE_CALCULATE_TOOL_CAPABILITY: PluginCapability = {
  name: 'calculate',
  description: '执行数学计算',
  parameters: {
    expression: {
      type: 'string',
      description: '简单数学表达式，例如 2 + 3 * 4',
      required: true,
    },
  },
};

export const CORE_TOOLS_MANIFEST_TOOLS: NonNullable<PluginManifest['tools']> = [
  CORE_CURRENT_TIME_TOOL_CAPABILITY,
  CORE_SYSTEM_INFO_TOOL_CAPABILITY,
  CORE_CALCULATE_TOOL_CAPABILITY,
];

const AUTOMATION_CREATE_TOOL_CAPABILITY: PluginCapability = {
  name: 'create_automation',
  description:
    '创建自动化规则。支持 cron 计划（例如 "5m"、"1h"、"30s"）和设备命令。当用户要求设置重复任务或自动化操作时使用此工具。',
  parameters: {
    name: {
      type: 'string',
      description: '此自动化的描述性名称',
      required: true,
    },
    triggerType: {
      type: 'string',
      description: '触发类型：cron 为计划执行，manual 为手动触发，event 为事件触发',
      required: true,
    },
    cronInterval: {
      type: 'string',
      description: '对于 cron 触发：间隔如 "5m"、"1h"、"30s"',
    },
    eventName: {
      type: 'string',
      description: '对于 event 触发：要监听的事件名',
    },
    actions: {
      type: 'array',
      description: '要执行的动作列表',
      required: true,
    },
  },
};

const AUTOMATION_EVENT_TOOL_CAPABILITY: PluginCapability = {
  name: 'emit_automation_event',
  description: '发出一个自动化事件，触发当前用户下匹配该事件名的自动化。',
  parameters: {
    event: {
      type: 'string',
      description: '要发出的事件名',
      required: true,
    },
  },
};

const AUTOMATION_LIST_TOOL_CAPABILITY: PluginCapability = {
  name: 'list_automations',
  description: '列出当前用户的所有自动化。',
  parameters: {},
};

const AUTOMATION_TOGGLE_TOOL_CAPABILITY: PluginCapability = {
  name: 'toggle_automation',
  description: '通过 ID 启用或禁用自动化。',
  parameters: {
    automationId: {
      type: 'string',
      description: '要切换的自动化 ID',
      required: true,
    },
  },
};

const AUTOMATION_RUN_TOOL_CAPABILITY: PluginCapability = {
  name: 'run_automation',
  description: '手动触发自动化立即执行。',
  parameters: {
    automationId: {
      type: 'string',
      description: '要运行的自动化 ID',
      required: true,
    },
  },
};

export const AUTOMATION_TOOLS_MANIFEST_TOOLS: NonNullable<PluginManifest['tools']> = [
  AUTOMATION_CREATE_TOOL_CAPABILITY,
  AUTOMATION_EVENT_TOOL_CAPABILITY,
  AUTOMATION_LIST_TOOL_CAPABILITY,
  AUTOMATION_TOGGLE_TOOL_CAPABILITY,
  AUTOMATION_RUN_TOOL_CAPABILITY,
];

const SUBAGENT_DELEGATE_TOOL_CAPABILITY: PluginCapability = {
  name: 'delegate_summary',
  description: '将当前任务委托给宿主子代理做简短总结',
  parameters: {
    prompt: {
      type: 'string',
      description: '要交给子代理处理的提示词',
      required: true,
    },
  },
};

const SUBAGENT_DELEGATE_BACKGROUND_TOOL_CAPABILITY: PluginCapability = {
  name: 'delegate_summary_background',
  description: '将当前任务委托给宿主子代理后台执行，并可在完成后回写当前会话',
  parameters: {
    prompt: {
      type: 'string',
      description: '要交给后台子代理处理的提示词',
      required: true,
    },
    writeBack: {
      type: 'boolean',
      description: '完成后是否回写到当前会话；默认在存在会话上下文时开启',
    },
  },
};

export const SUBAGENT_DELEGATE_MANIFEST_TOOLS: NonNullable<PluginManifest['tools']> = [
  SUBAGENT_DELEGATE_TOOL_CAPABILITY,
  SUBAGENT_DELEGATE_BACKGROUND_TOOL_CAPABILITY,
];

const ROUTE_INSPECTOR_CONTEXT_ROUTE: PluginRouteDescriptor = {
  path: 'inspect/context',
  methods: ['GET'],
  description: '返回当前插件路由看到的用户与会话上下文',
};

export const ROUTE_INSPECTOR_MANIFEST_ROUTES: NonNullable<PluginManifest['routes']> = [
  ROUTE_INSPECTOR_CONTEXT_ROUTE,
];

export const MEMORY_CONTEXT_MANIFEST: PluginManifest = {
  id: 'builtin.memory-context',
  name: '记忆上下文',
  version: '1.0.0',
  runtime: 'builtin',
  description: '在模型调用前检索并注入用户长期记忆摘要的内建插件。',
  permissions: ['memory:read', 'config:read'],
  tools: [],
  hooks: [
    {
      name: 'chat:before-model',
      description: '在模型调用前补入用户长期记忆摘要',
    },
  ],
  config: {
    fields: MEMORY_CONTEXT_CONFIG_FIELDS,
  },
};

export const KB_CONTEXT_MANIFEST: PluginManifest = {
  id: 'builtin.kb-context',
  name: '知识库上下文',
  version: '1.0.0',
  runtime: 'builtin',
  description: '在模型调用前检索并注入系统知识摘要的内建插件。',
  permissions: ['kb:read', 'config:read'],
  tools: [],
  hooks: [
    {
      name: 'chat:before-model',
      description: '在模型调用前补入系统知识摘要',
    },
  ],
  config: {
    fields: KB_CONTEXT_CONFIG_FIELDS,
  },
};

export const PROVIDER_ROUTER_MANIFEST: PluginManifest = {
  id: 'builtin.provider-router',
  name: '模型路由',
  version: '1.0.0',
  runtime: 'builtin',
  description: '按规则切换 provider/model、裁剪工具或直接短路回复的内建插件。',
  permissions: ['config:read', 'provider:read'],
  tools: [],
  hooks: [
    {
      name: 'chat:before-model',
      description: '按配置改写当前 provider/model、裁剪工具或直接短路回复',
    },
  ],
  config: {
    fields: PROVIDER_ROUTER_CONFIG_FIELDS,
  },
};

export const PERSONA_ROUTER_MANIFEST: PluginManifest = {
  id: 'builtin.persona-router',
  name: '人设路由',
  version: '1.0.0',
  runtime: 'builtin',
  description: '按规则切换当前会话人设并同步改写系统提示词的内建插件。',
  permissions: ['config:read', 'persona:read', 'persona:write'],
  tools: [],
  hooks: [
    {
      name: 'chat:before-model',
      description: '按规则切换当前会话 persona，并同步改写本轮系统提示词',
    },
  ],
  config: {
    fields: PERSONA_ROUTER_CONFIG_FIELDS,
  },
};

export const CRON_HEARTBEAT_MANIFEST: PluginManifest = {
  id: 'builtin.cron-heartbeat',
  name: '定时心跳',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于验证统一 cron 插件协议链路的内建插件',
  permissions: ['cron:read', 'cron:write', 'storage:read', 'storage:write'],
  tools: [],
  hooks: [
    {
      name: 'cron:tick',
      description: '处理插件定时任务 tick',
    },
  ],
  crons: [
    {
      name: 'heartbeat',
      cron: '10s',
      description: '定时写入插件心跳计数',
    },
  ],
};

export const CORE_TOOLS_MANIFEST: PluginManifest = {
  id: 'builtin.core-tools',
  name: '内建工具',
  version: '1.0.0',
  runtime: 'builtin',
  description: '提供时间、系统信息和计算器等基础能力的内建插件。',
  permissions: [],
  tools: CORE_TOOLS_MANIFEST_TOOLS,
  hooks: [],
};

export const MEMORY_TOOLS_MANIFEST: PluginManifest = {
  id: 'builtin.memory-tools',
  name: '记忆工具',
  version: '1.0.0',
  runtime: 'builtin',
  description: '提供长期记忆写入与检索能力的内建插件。',
  permissions: ['memory:read', 'memory:write'],
  tools: MEMORY_TOOLS_MANIFEST_TOOLS,
  hooks: [],
};

export const AUTOMATION_TOOLS_MANIFEST: PluginManifest = {
  id: 'builtin.automation-tools',
  name: '自动化工具',
  version: '1.0.0',
  runtime: 'builtin',
  description: '提供自动化创建、事件触发、启停和执行能力的内建插件。',
  permissions: ['automation:read', 'automation:write'],
  tools: AUTOMATION_TOOLS_MANIFEST_TOOLS,
  hooks: [],
};

export const SUBAGENT_DELEGATE_MANIFEST: PluginManifest = {
  id: 'builtin.subagent-delegate',
  name: '子代理委派',
  version: '1.0.0',
  runtime: 'builtin',
  description: '将当前任务委派给宿主子代理执行的内建插件。',
  permissions: ['config:read', 'conversation:write', 'subagent:run'],
  tools: SUBAGENT_DELEGATE_MANIFEST_TOOLS,
  config: {
    fields: SUBAGENT_DELEGATE_CONFIG_FIELDS,
  },
};

export const ROUTE_INSPECTOR_MANIFEST: PluginManifest = {
  id: 'builtin.route-inspector',
  name: '路由探针',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于查看插件 Web Route 可见上下文的内建诊断插件。',
  permissions: ['conversation:read', 'user:read'],
  tools: [],
  routes: ROUTE_INSPECTOR_MANIFEST_ROUTES,
};
