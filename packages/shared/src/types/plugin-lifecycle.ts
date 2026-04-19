import type { JsonObject } from './json';
import type {
  PluginCallContext,
  PluginManifest,
  PluginRemoteDescriptor,
  PluginRuntimeKind,
} from './plugin';

/** 插件生命周期 Hook 可见的插件摘要。 */
export interface PluginLifecycleHookInfo {
  id: string;
  runtimeKind: PluginRuntimeKind;
  remote: PluginRemoteDescriptor | null;
  manifest: PluginManifest | null;
}

/** 插件加载 Hook 的输入。 */
export interface PluginLoadedHookPayload {
  context: PluginCallContext;
  plugin: PluginLifecycleHookInfo;
  loadedAt: string;
}

/** 插件卸载 Hook 的输入。 */
export interface PluginUnloadedHookPayload {
  context: PluginCallContext;
  plugin: PluginLifecycleHookInfo;
  unloadedAt: string;
}

/** 插件失败 Hook 的输入。 */
export interface PluginErrorHookPayload {
  context: PluginCallContext;
  plugin: PluginLifecycleHookInfo;
  error: {
    type: string;
    message: string;
    metadata: JsonObject | null;
  };
  occurredAt: string;
}
