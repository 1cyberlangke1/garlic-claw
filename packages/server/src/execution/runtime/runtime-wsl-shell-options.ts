import { BadRequestException } from '@nestjs/common';
import type { RuntimeBackendDescriptor, RuntimePermissionPolicy } from './runtime-command.types';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export interface RuntimeWslShellOptions {
  defaultTimeoutMs: number;
  descriptor: RuntimeBackendDescriptor;
  maxTimeoutMs: number;
}

export function readRuntimeWslShellOptions(): RuntimeWslShellOptions {
  const networkEnabled = readBooleanEnv('GARLIC_CLAW_RUNTIME_WSL_SHELL_ENABLE_NETWORK', true);
  const networkPolicy = readNetworkPolicy(networkEnabled);
  return {
    defaultTimeoutMs: readPositiveIntegerEnv(
      'GARLIC_CLAW_RUNTIME_WSL_SHELL_DEFAULT_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
    ),
    descriptor: {
      capabilities: {
        networkAccess: networkEnabled,
        persistentFilesystem: true,
        persistentShellState: false,
        shellExecution: true,
        workspaceRead: true,
        workspaceWrite: true,
      },
      kind: 'wsl-shell',
      permissionPolicy: {
        networkAccess: networkPolicy,
        persistentFilesystem: 'allow',
        persistentShellState: 'deny',
        shellExecution: 'ask',
        workspaceRead: 'allow',
        workspaceWrite: 'allow',
      } satisfies RuntimePermissionPolicy,
    },
    maxTimeoutMs: readPositiveIntegerEnv(
      'GARLIC_CLAW_RUNTIME_WSL_SHELL_MAX_TIMEOUT_MS',
      MAX_TIMEOUT_MS,
    ),
  };
}

export function readRuntimeWslShellTimeout(inputTimeout: number | undefined): number {
  const options = readRuntimeWslShellOptions();
  if (options.defaultTimeoutMs > options.maxTimeoutMs) {
    throw new BadRequestException('wsl-shell 默认超时不能大于最大超时');
  }
  if (inputTimeout === undefined) {
    return options.defaultTimeoutMs;
  }
  if (!Number.isFinite(inputTimeout) || inputTimeout <= 0) {
    throw new BadRequestException('bash.timeout 必须是大于 0 的毫秒数');
  }
  const timeoutMs = Math.ceil(inputTimeout);
  if (timeoutMs > options.maxTimeoutMs) {
    throw new BadRequestException(`bash.timeout 不能超过 ${options.maxTimeoutMs}`);
  }
  return timeoutMs;
}

function readNetworkPolicy(networkEnabled: boolean): RuntimePermissionPolicy['networkAccess'] {
  if (!networkEnabled) {
    return 'deny';
  }
  const configuredPolicy = process.env.GARLIC_CLAW_RUNTIME_WSL_SHELL_NETWORK_POLICY?.trim();
  if (!configuredPolicy) {
    return 'ask';
  }
  if (configuredPolicy === 'allow' || configuredPolicy === 'ask' || configuredPolicy === 'deny') {
    return configuredPolicy;
  }
  throw new BadRequestException('GARLIC_CLAW_RUNTIME_WSL_SHELL_NETWORK_POLICY 只能是 allow / ask / deny');
}

function readBooleanEnv(envKey: string, fallback: boolean): boolean {
  const configured = process.env[envKey]?.trim().toLowerCase();
  if (!configured) {
    return fallback;
  }
  if (configured === '1' || configured === 'true' || configured === 'yes' || configured === 'on') {
    return true;
  }
  if (configured === '0' || configured === 'false' || configured === 'no' || configured === 'off') {
    return false;
  }
  throw new BadRequestException(`${envKey} 只能是布尔值`);
}

function readPositiveIntegerEnv(envKey: string, fallback: number): number {
  const configured = process.env[envKey]?.trim();
  if (!configured) {
    return fallback;
  }
  const value = Number(configured);
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${envKey} 必须是大于 0 的整数`);
  }
  return Math.ceil(value);
}
