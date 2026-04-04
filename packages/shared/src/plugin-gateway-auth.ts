import type { AuthPayload } from './types/plugin';

export interface PluginGatewayVerifiedToken {
  role?: string;
  authKind?: string;
  pluginName?: string;
  deviceType?: string;
}

export function assertPluginGatewayAuthClaims(input: {
  verified: PluginGatewayVerifiedToken;
  payload: Pick<AuthPayload, 'pluginName' | 'deviceType'>;
}): void {
  const isAdminToken = input.verified.role === 'admin' || input.verified.role === 'super_admin';
  const isRemotePluginToken = input.verified.role === 'remote_plugin'
    && input.verified.authKind === 'remote-plugin';
  if (!isAdminToken && !isRemotePluginToken) {
    throw new Error('只有管理员或专用远程插件令牌可以接入远程插件');
  }

  if (
    isRemotePluginToken
    && (
      input.verified.pluginName !== input.payload.pluginName
      || input.verified.deviceType !== input.payload.deviceType
    )
  ) {
    throw new Error('远程插件令牌与当前插件标识不匹配');
  }
}
