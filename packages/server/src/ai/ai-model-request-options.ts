import type { JsonObject, JsonValue } from '../common/types/json-value';
import type { ModelConfig } from './types/provider.types';

export interface AiModelExecutionRequestOptionsInput {
  variant?: string;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
}

export interface ResolvedAiModelExecutionRequestOptions {
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
}

export function resolveAiModelExecutionRequestOptions(input: {
  modelConfig: ModelConfig;
  requestOptions: AiModelExecutionRequestOptionsInput;
}): ResolvedAiModelExecutionRequestOptions {
  const variantOptions = resolveVariantOptions(
    input.modelConfig,
    input.requestOptions.variant,
  );

  return {
    providerOptions: mergeJsonObjects(
      input.modelConfig.options,
      variantOptions,
      input.requestOptions.providerOptions,
    ),
    headers: mergeHeaders(
      input.modelConfig.headers,
      input.requestOptions.headers,
    ),
    maxOutputTokens:
      input.requestOptions.maxOutputTokens ?? input.modelConfig.limit?.output,
  };
}

function resolveVariantOptions(
  modelConfig: ModelConfig,
  variant?: string,
): JsonObject | undefined {
  if (!variant) {
    return undefined;
  }

  const variantOptions = modelConfig.variants?.[variant];
  if (variantOptions) {
    return variantOptions;
  }

  throw new Error(
    `Model variant "${variant}" is not configured for "${String(modelConfig.providerId)}/${String(modelConfig.id)}"`,
  );
}

function mergeHeaders(
  defaults?: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> | undefined {
  const merged = {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeJsonObjects(
  ...sources: Array<JsonObject | undefined>
): JsonObject | undefined {
  const result: JsonObject = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      const currentValue = result[key];
      if (isJsonObject(currentValue) && isJsonObject(value)) {
        result[key] = mergeJsonObjects(currentValue, value) ?? {};
        continue;
      }

      result[key] = cloneJsonValue(value);
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }

  const cloned: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = cloneJsonValue(entry);
  }
  return cloned;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
