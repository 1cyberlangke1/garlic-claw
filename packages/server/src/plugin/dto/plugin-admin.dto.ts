import type { JsonObject } from '@garlic-claw/shared';
import { DeviceType } from '@garlic-claw/shared';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * 更新插件配置 DTO。
 *
 * 输入:
 * - `values`: 待保存的插件配置值对象
 *
 * 输出:
 * - 无；仅作为控制器参数约束
 *
 * 预期行为:
 * - 要求传入 JSON 对象
 */
export class UpdatePluginConfigDto {
  @IsObject()
  values!: JsonObject;
}

/**
 * 更新插件作用域 DTO。
 *
 * 输入:
 * - `conversations`: 会话级启停覆盖
 * - `defaultEnabled`: 仅做向后兼容接收，私有 scope 接口不再写这个字段
 *
 * 输出:
 * - 无；仅作为控制器参数约束
 *
 * 预期行为:
 * - 允许会话级覆盖缺省
 * - 兼容旧客户端继续发送 defaultEnabled，但控制器会忽略它
 */
export class UpdatePluginScopeDto {
  @IsOptional()
  @IsBoolean()
  defaultEnabled?: boolean;

  @IsOptional()
  @IsObject()
  conversations?: Record<string, boolean>;
}

/**
 * 更新插件持久化 KV 的 DTO。
 *
 * 输入:
 * - `key`: 存储键
 * - `value`: 任意 JSON 值
 *
 * 输出:
 * - 无；仅作为控制器参数约束
 *
 * 预期行为:
 * - 要求 key 为非空字符串
 * - 要求 value 必须显式提供
 */
export class UpdatePluginStorageDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsDefined()
  value!: unknown;
}

/**
 * 在线生成远程插件接入令牌的 DTO。
 */
export class CreateRemotePluginBootstrapDto {
  @IsString()
  @IsNotEmpty()
  pluginName!: string;

  @IsEnum(DeviceType)
  deviceType!: DeviceType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  version?: string;
}
