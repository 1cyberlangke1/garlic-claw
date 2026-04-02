import type { JsonValue } from '../../common/types/json-value';
import type { ProviderProtocolDriver } from '../provider-catalog';
import { extractDiscoveredModels } from '../ai-provider-diagnostics.helpers';
import { getProviderProtocolMetadata } from '../provider-protocol.helpers';
import type {
  DiscoveredModel,
  RegisterCustomProviderDto,
} from './custom-provider.types';
import { inferCustomProviderCapabilities } from './custom-provider-model.helpers';

/**
 * 发现协议接入的模型列表。
 *
 * 输入:
 * - 注册请求
 * - 协议族格式
 * - API key 解析函数
 * - 调试日志回调
 *
 * 输出:
 * - 发现到的模型列表
 *
 * 预期行为:
 * - 优先请求远端 `/models`
 * - 失败时回退到默认模型
 */
export async function discoverProtocolModels(input: {
  dto: RegisterCustomProviderDto;
  protocol: ProviderProtocolDriver;
  resolveApiKey: (dto: RegisterCustomProviderDto) => string;
  logDebug: (message: string) => void;
}): Promise<DiscoveredModel[]> {
  const { dto, protocol, resolveApiKey, logDebug } = input;
  const discovered: DiscoveredModel[] = [];
  const apiKey = resolveApiKey(dto);
  const protocolMetadata = getProviderProtocolMetadata(protocol);

  try {
    const response = await fetch(`${dto.baseUrl}/models`, {
      method: 'GET',
      headers: protocolMetadata.buildHeaders(apiKey),
    });

    if (response.ok) {
      const payload = await response.json() as JsonValue;
      for (const item of extractDiscoveredModels(payload)) {
        discovered.push({
          id: item.id,
          name: item.name,
          capabilities: inferCustomProviderCapabilities(item.id, dto.models),
        });
      }
    }
  } catch (error) {
    logDebug(`模型发现失败，将回退到默认模型: ${String(error)}`);
  }

  if (discovered.length === 0 && dto.defaultModel) {
    discovered.push({
      id: dto.defaultModel,
      name: dto.defaultModel,
      capabilities: inferCustomProviderCapabilities(dto.defaultModel, dto.models),
    });
  }

  return discovered;
}
