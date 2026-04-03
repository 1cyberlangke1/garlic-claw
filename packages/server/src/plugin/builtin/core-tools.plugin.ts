import {
  CORE_TOOLS_MANIFEST,
  createCalculateErrorResult,
  createCalculateSuccessResult,
  createCurrentTimeToolResult,
  createSystemInfoToolResult,
  readRequiredStringParam,
} from '@garlic-claw/plugin-sdk';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建通用内建工具插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 时间、系统信息、计算器三个基础工具的插件定义
 *
 * 预期行为:
 * - 取代原先硬编码在聊天工具集合里的通用内置工具
 * - 不依赖宿主 Host API 即可在本地直接执行
 */
export function createCoreToolsPlugin(): BuiltinPluginDefinition {
  return {
    manifest: CORE_TOOLS_MANIFEST,
    tools: {
      /**
       * 读取当前时间。
       * @returns 当前 ISO 时间字符串
       */
      getCurrentTime: async (): Promise<JsonValue> =>
        createCurrentTimeToolResult(new Date().toISOString()),

      /**
       * 读取当前进程的系统信息。
       * @returns 平台、版本、运行时与内存摘要
       */
      getSystemInfo: async (): Promise<JsonValue> =>
        createSystemInfoToolResult({
          platform: process.platform,
          nodeVersion: process.version,
          uptime: Math.floor(process.uptime()),
          memoryUsage: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
        }),

      /**
       * 计算简单数学表达式。
       * @param params 包含 expression 的 JSON 参数
       * @returns 计算结果或错误信息
       */
      calculate: async (params: JsonObject): Promise<JsonValue> => {
        const expression = readRequiredStringParam(params, 'expression');
        if (!/^[\d\s+\-*/().]+$/.test(expression)) {
          return createCalculateErrorResult(
            '无效的表达式。只允许数字和 +, -, *, /, (, )。',
          );
        }

        try {
          const fn = new Function(`"use strict"; return (${expression});`);
          const result = fn();
          return createCalculateSuccessResult(expression, Number(result));
        } catch {
          return createCalculateErrorResult('表达式计算失败');
        }
      },
    },
  };
}
