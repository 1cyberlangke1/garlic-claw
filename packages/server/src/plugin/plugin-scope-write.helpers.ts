import type { PluginScopeSettings } from '@garlic-claw/shared';
import {
  assertPluginScopeCanBeUpdated,
  normalizePluginScopeForGovernance,
} from './plugin-governance-policy';
import { validatePluginScope } from './plugin-persistence.helpers';

export function preparePluginScopeUpdate(input: {
  plugin: {
    name: string;
    runtimeKind: string | null;
  };
  scope: PluginScopeSettings;
}) {
  validatePluginScope(input.scope);
  assertPluginScopeCanBeUpdated({
    pluginId: input.plugin.name,
    runtimeKind: input.plugin.runtimeKind,
    scope: input.scope,
  });
  const normalizedScope = normalizePluginScopeForGovernance({
    pluginId: input.plugin.name,
    runtimeKind: input.plugin.runtimeKind,
    scope: input.scope,
  });

  return {
    normalizedScope,
    updateData: {
      defaultEnabled: normalizedScope.defaultEnabled,
      conversationScopes: JSON.stringify(normalizedScope.conversations),
    },
  };
}
