import type { RuntimeFilesystemBackend } from './runtime-filesystem-backend.types';

export const RUNTIME_FILESYSTEM_BACKENDS_TOKEN = Symbol('RUNTIME_FILESYSTEM_BACKENDS');

export type RuntimeFilesystemBackendList = RuntimeFilesystemBackend[];
