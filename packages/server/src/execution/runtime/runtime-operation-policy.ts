import type {
  RuntimeCapabilityName,
  RuntimeOperationName,
} from '@garlic-claw/shared';

const RUNTIME_OPERATION_CAPABILITIES: Record<RuntimeOperationName, RuntimeCapabilityName[]> = {
  'command.execute': ['shellExecution', 'workspaceRead', 'workspaceWrite', 'persistentFilesystem'],
  'file.delete': ['workspaceWrite', 'persistentFilesystem'],
  'file.edit': ['workspaceRead', 'workspaceWrite', 'persistentFilesystem'],
  'file.list': ['workspaceRead', 'persistentFilesystem'],
  'file.read': ['workspaceRead', 'persistentFilesystem'],
  'file.symlink': ['workspaceWrite', 'persistentFilesystem'],
  'file.write': ['workspaceWrite', 'persistentFilesystem'],
  'network.access': ['networkAccess'],
};

export function expandRuntimeOperationsToCapabilities(
  operations: RuntimeOperationName[],
): RuntimeCapabilityName[] {
  const capabilities = new Set<RuntimeCapabilityName>();
  for (const operation of operations) {
    for (const capability of RUNTIME_OPERATION_CAPABILITIES[operation]) {
      capabilities.add(capability);
    }
  }
  return [...capabilities];
}
