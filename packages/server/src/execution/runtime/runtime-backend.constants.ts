import type { RuntimeBackend } from './runtime-command.types';

export const RUNTIME_BACKENDS = Symbol('RUNTIME_BACKENDS');

export type RuntimeBackendList = RuntimeBackend[];
