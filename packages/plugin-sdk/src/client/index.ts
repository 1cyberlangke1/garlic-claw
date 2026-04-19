import type {
  PluginCapability,
  PluginManifest,
  PluginRemoteEnvironment,
  PluginRouteDescriptor,
  RemotePluginConnectionInfo,
} from '@garlic-claw/shared';
export interface PluginManifestInput {
  name?: string;
  version?: string;
  description?: string;
  permissions?: PluginManifest["permissions"];
  tools?: PluginCapability[];
  commands?: NonNullable<PluginManifest["commands"]>;
  hooks?: NonNullable<PluginManifest["hooks"]>;
  config?: PluginManifest["config"];
  routes?: PluginRouteDescriptor[];
  remote?: PluginManifest['remote'];
}
export interface PluginClientOptions {
  serverUrl: string;
  pluginName: string;
  remoteEnvironment: PluginRemoteEnvironment;
  accessKey?: string | null;
  manifest?: PluginManifestInput;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  heartbeatInterval?: number;
}
export type { RemotePluginConnectionInfo };
export { PluginClient, REMOTE_ENVIRONMENT } from './plugin-client';
