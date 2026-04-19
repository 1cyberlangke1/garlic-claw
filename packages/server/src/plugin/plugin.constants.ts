import type {
  PluginAuthMode,
  PluginCapabilityProfile,
  PluginRemoteEnvironment,
  PluginStatus,
} from '@garlic-claw/shared';

export const REMOTE_ENVIRONMENT = {
  API: 'api',
  IOT: 'iot',
} as const satisfies Record<string, PluginRemoteEnvironment>;

export const PLUGIN_AUTH_MODE = {
  NONE: 'none',
  OPTIONAL: 'optional',
  REQUIRED: 'required',
} as const satisfies Record<string, PluginAuthMode>;

export const PLUGIN_CAPABILITY_PROFILE = {
  ACTUATE: 'actuate',
  HYBRID: 'hybrid',
  QUERY: 'query',
} as const satisfies Record<string, PluginCapabilityProfile>;

export const PLUGIN_STATUS = {
  ERROR: 'error',
  OFFLINE: 'offline',
  ONLINE: 'online',
} as const satisfies Record<string, PluginStatus>;
