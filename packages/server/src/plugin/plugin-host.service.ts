import type {
  HostCallPayload,
  PluginCallContext,
} from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { PluginHostAiFacade } from './plugin-host-ai.facade';
import { PluginHostConversationFacade } from './plugin-host-conversation.facade';
import { PluginHostStateFacade } from './plugin-host-state.facade';

/**
 * 插件 Host API 服务。
 *
 * NOTE: 当前保持单文件，因为 Host API 分发表、上下文校验和宿主能力映射仍共享同一套私有解析 helper；
 * 继续减法时会优先外提重复读写与摘要序列化，避免把强耦合的入口语义打散到多处。
 *
 * 输入:
 * - 插件 ID
 * - 调用上下文
 * - Host API 方法名与参数
 *
 * 输出:
 * - JSON 可序列化的 Host API 返回值
 *
 * 预期行为:
 * - 统一校验插件调用上下文
 * - 将宿主能力通过单一入口暴露给内建/远程插件
 * - 不直接把 Nest service 实例暴露给插件
 */
@Injectable()
export class PluginHostService {
  constructor(
    private readonly hostAiFacade: PluginHostAiFacade,
    private readonly hostConversationFacade: PluginHostConversationFacade,
    private readonly hostStateFacade: PluginHostStateFacade,
  ) {}

  /**
   * 执行一次 Host API 调用。
   * @param input 插件 ID、上下文和方法参数
   * @returns JSON 可序列化的调用结果
   */
  async call(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue> {
    switch (input.method) {
      case 'config.get':
        return this.hostStateFacade.getConfig(input.pluginId, input.params);
      case 'conversation.get':
        return this.hostConversationFacade.getConversation(
          input.context,
          input.params,
        );
      case 'kb.list':
        return this.hostConversationFacade.listKbEntries(input.params);
      case 'kb.search':
        return this.hostConversationFacade.searchKbEntries(input.params);
      case 'kb.get':
        return this.hostConversationFacade.getKbEntry(input.params);
      case 'log.list':
        return this.hostStateFacade.listLogs(input.pluginId, input.params);
      case 'log.write':
        return this.hostStateFacade.writeLog(input.pluginId, input.params);
      case 'persona.current.get':
        return this.hostConversationFacade.getCurrentPersona(input.context);
      case 'persona.list':
        return this.hostConversationFacade.listPersonas();
      case 'persona.get':
        return this.hostConversationFacade.getPersona(input.params);
      case 'persona.activate':
        return this.hostConversationFacade.activatePersona(
          input.context,
          input.params,
        );
      case 'provider.current.get':
        return this.hostAiFacade.getCurrentProvider(input.context);
      case 'provider.get':
        return this.hostAiFacade.getProvider(input.params);
      case 'provider.list':
        return this.hostAiFacade.listProviders();
      case 'provider.model.get':
        return this.hostAiFacade.getProviderModel(input.params);
      case 'memory.search':
        return this.hostConversationFacade.searchMemories(
          input.context,
          input.params,
        );
      case 'memory.save':
        return this.hostConversationFacade.saveMemory(input.context, input.params);
      case 'conversation.title.set':
        return this.hostConversationFacade.setConversationTitle(
          input.context,
          input.params,
        );
      case 'llm.generate':
        return this.hostAiFacade.generate(input.pluginId, input.context, input.params);
      case 'llm.generate-text':
        return this.hostAiFacade.generateText(input.pluginId, input.context, input.params);
      case 'plugin.self.get':
        return this.hostStateFacade.getPluginSelf(input.pluginId);
      case 'storage.delete':
        return this.hostStateFacade.deleteStorage(input.pluginId, input.context, input.params);
      case 'storage.get':
        return this.hostStateFacade.getStorage(input.pluginId, input.context, input.params);
      case 'storage.list':
        return this.hostStateFacade.listStorage(input.pluginId, input.context, input.params);
      case 'storage.set':
        return this.hostStateFacade.setStorage(input.pluginId, input.context, input.params);
      case 'state.delete':
        return this.hostStateFacade.deleteState(input.pluginId, input.context, input.params);
      case 'state.get':
        return this.hostStateFacade.getState(input.pluginId, input.context, input.params);
      case 'state.list':
        return this.hostStateFacade.listState(input.pluginId, input.context, input.params);
      case 'state.set':
        return this.hostStateFacade.setState(input.pluginId, input.context, input.params);
      case 'user.get':
        return this.hostConversationFacade.getUser(input.context);
      case 'conversation.messages.list':
        return this.hostConversationFacade.listConversationMessages(input.context);
      default:
        throw new BadRequestException(`不支持的 Host API 方法: ${input.method}`);
    }
  }
}
