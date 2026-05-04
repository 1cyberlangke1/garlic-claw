import type { PluginAuthMode, PluginRemoteEnvironment } from '@garlic-claw/shared';

export interface RuntimeGatewayAuthClaims {
  authMode?: PluginAuthMode;
  pluginName?: string;
  remoteEnvironment?: PluginRemoteEnvironment;
}

export interface RuntimeGatewayConnectionRecord {
  authenticated: boolean;
  claims: RuntimeGatewayAuthClaims | null;
  connectionId: string;
  remoteEnvironment: PluginRemoteEnvironment | null;
  lastHeartbeatAt: string;
  pluginId: string | null;
  remoteAddress?: string;
}
