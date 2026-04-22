import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RuntimeBackendRoutingService {
  getConfiguredFilesystemBackendKind(): RuntimeBackendKind | undefined {
    return normalizeRuntimeBackendKind(process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND);
  }

  getConfiguredShellBackendKind(): RuntimeBackendKind | undefined {
    return normalizeRuntimeBackendKind(process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND);
  }
}

function normalizeRuntimeBackendKind(value: string | undefined): RuntimeBackendKind | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
