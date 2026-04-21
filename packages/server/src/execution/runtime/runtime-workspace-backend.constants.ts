import type { RuntimeWorkspaceBackend } from './runtime-workspace-backend.types';

export const RUNTIME_WORKSPACE_BACKENDS = Symbol('RUNTIME_WORKSPACE_BACKENDS');

export type RuntimeWorkspaceBackendList = RuntimeWorkspaceBackend[];
