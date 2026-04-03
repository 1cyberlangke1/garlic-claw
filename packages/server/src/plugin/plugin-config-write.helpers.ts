import { BadRequestException } from '@nestjs/common';
import type {
  JsonObject,
  PluginConfigSnapshot,
} from '@garlic-claw/shared';
import {
  readPersistedPluginManifestRecord,
  type PersistedPluginGovernanceRecord,
} from './plugin-governance.helpers';
import {
  resolvePluginConfig,
  validateAndNormalizePluginConfig,
} from './plugin-persistence.helpers';

export function preparePluginConfigUpdate(input: {
  name: string;
  plugin: PersistedPluginGovernanceRecord;
  values: JsonObject;
  onWarn?: (message: string) => void;
}): {
  persistedConfigJson: string;
  snapshot: PluginConfigSnapshot;
} {
  const manifest = readPersistedPluginManifestRecord(input);
  const schema = manifest.config ?? null;
  if (!schema) {
    throw new BadRequestException(`插件 ${input.name} 未声明配置 schema`);
  }

  const normalized = validateAndNormalizePluginConfig(schema, input.values);
  const persistedConfigJson = JSON.stringify(normalized);
  return {
    persistedConfigJson,
    snapshot: {
      schema,
      values: resolvePluginConfig({
        rawConfig: persistedConfigJson,
        manifest,
        onWarn: input.onWarn,
      }),
    },
  };
}
