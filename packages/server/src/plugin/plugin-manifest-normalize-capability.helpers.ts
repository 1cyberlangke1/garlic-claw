import type {
  PluginCapability,
  PluginConfigFieldSchema,
  PluginConfigSchema,
  PluginParamSchema,
  PluginPermission,
} from '@garlic-claw/shared';
import {
  isJsonValue,
  isOneOf,
  readArray,
  readRecord,
} from './plugin-manifest-normalize-base.helpers';

const PLUGIN_PERMISSIONS: PluginPermission[] = [
  'automation:read',
  'automation:write',
  'cron:read',
  'cron:write',
  'conversation:read',
  'conversation:write',
  'config:read',
  'kb:read',
  'log:read',
  'llm:generate',
  'log:write',
  'memory:read',
  'memory:write',
  'persona:read',
  'persona:write',
  'provider:read',
  'storage:read',
  'storage:write',
  'subagent:run',
  'state:read',
  'state:write',
  'user:read',
];

const PLUGIN_PARAM_TYPES: PluginParamSchema['type'][] = [
  'string',
  'number',
  'boolean',
  'object',
  'array',
];

export function readPermission(value: unknown): PluginPermission | null {
  return isOneOf(value, PLUGIN_PERMISSIONS) ? value : null;
}

export function readPluginCapability(value: unknown): PluginCapability | null {
  const record = readRecord(value);
  if (
    !record
    || typeof record.name !== 'string'
    || typeof record.description !== 'string'
  ) {
    return null;
  }

  return {
    name: record.name,
    description: record.description,
    parameters: readPluginParameterRecord(record.parameters),
  };
}

export function readPluginConfigSchema(value: unknown): PluginConfigSchema | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const fields = readArray(record.fields, readPluginConfigFieldSchema);
  if (fields.length === 0) {
    return null;
  }

  return {
    fields,
  };
}

function readPluginParameterRecord(
  value: unknown,
): Record<string, PluginParamSchema> {
  const record = readRecord(value);
  if (!record) {
    return {};
  }

  const parameters: Record<string, PluginParamSchema> = {};
  for (const [key, entry] of Object.entries(record)) {
    const schema = readPluginParamSchema(entry);
    if (schema) {
      parameters[key] = schema;
    }
  }

  return parameters;
}

function readPluginParamSchema(value: unknown): PluginParamSchema | null {
  const record = readRecord(value);
  if (!record || !isOneOf(record.type, PLUGIN_PARAM_TYPES)) {
    return null;
  }

  const schema: PluginParamSchema = {
    type: record.type,
  };

  if (typeof record.description === 'string') {
    schema.description = record.description;
  }
  if (typeof record.required === 'boolean') {
    schema.required = record.required;
  }

  return schema;
}

function readPluginConfigFieldSchema(
  value: unknown,
): PluginConfigFieldSchema | null {
  const record = readRecord(value);
  if (
    !record
    || typeof record.key !== 'string'
    || !isOneOf(record.type, PLUGIN_PARAM_TYPES)
  ) {
    return null;
  }

  const field: PluginConfigFieldSchema = {
    key: record.key,
    type: record.type,
  };

  if (typeof record.description === 'string') {
    field.description = record.description;
  }
  if (typeof record.required === 'boolean') {
    field.required = record.required;
  }
  if (typeof record.secret === 'boolean') {
    field.secret = record.secret;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'defaultValue') && isJsonValue(record.defaultValue)) {
    field.defaultValue = record.defaultValue;
  }

  return field;
}
