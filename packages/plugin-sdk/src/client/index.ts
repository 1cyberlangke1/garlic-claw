import type {
  DeviceType,
  PluginCapability,
  PluginManifest,
  PluginRouteDescriptor,
} from '@garlic-claw/shared';

/**
 * 插件客户端中的 manifest 输入。
 */
export interface PluginManifestInput {
  /** 展示名称。 */
  name?: string;
  /** 插件版本。 */
  version?: string;
  /** 插件描述。 */
  description?: string;
  /** 权限列表。 */
  permissions?: PluginManifest['permissions'];
  /** 工具描述列表。 */
  tools?: PluginCapability[];
  /** 命令描述列表。 */
  commands?: NonNullable<PluginManifest['commands']>;
  /** Hook 描述列表。 */
  hooks?: NonNullable<PluginManifest['hooks']>;
  /** 插件配置 schema。 */
  config?: PluginManifest['config'];
  /** 插件声明的 Web Route。 */
  routes?: PluginRouteDescriptor[];
}

export interface PluginClientOptions {
  /** WebSocket 服务器地址，例如 ws://localhost:23331 */
  serverUrl: string;
  /** 用于认证的 JWT 令牌 */
  token: string;
  /** 此插件实例的唯一名称 */
  pluginName: string;
  /** 设备类型 */
  deviceType: DeviceType;
  /** 新版 manifest 输入 */
  manifest?: PluginManifestInput;
  /** 断开时自动重连（默认：true） */
  autoReconnect?: boolean;
  /** 重连间隔（毫秒，默认：5000） */
  reconnectInterval?: number;
  /** 心跳间隔（毫秒，默认：20000） */
  heartbeatInterval?: number;
}

export { PluginClient } from '../index';
