import type { RuntimeBackendKind } from '@garlic-claw/shared';
import type { RuntimeBackendDescriptor } from './runtime-command.types';

export interface RuntimeWorkspaceResolvedPath {
  exists: boolean;
  type: 'directory' | 'file' | 'missing';
  virtualPath: string;
  workspaceRoot: string;
}

export interface RuntimeWorkspaceFileEntry {
  virtualPath: string;
}

export interface RuntimeWorkspaceWriteResult {
  created: boolean;
  path: string;
}

export interface RuntimeWorkspaceEditResult {
  occurrences: number;
  path: string;
}

export interface RuntimeWorkspaceBackend {
  editTextFile(
    sessionId: string,
    input: {
      filePath: string;
      newString: string;
      oldString: string;
      replaceAll?: boolean;
    },
  ): Promise<RuntimeWorkspaceEditResult>;
  getDescriptor(): RuntimeBackendDescriptor;
  getKind(): RuntimeBackendKind;
  getVisibleRoot(): string;
  listFiles(sessionId: string, inputPath?: string): Promise<{
    basePath: string;
    files: RuntimeWorkspaceFileEntry[];
  }>;
  readDirectoryEntries(sessionId: string, inputPath?: string): Promise<{
    entries: string[];
    path: string;
  }>;
  readExistingPath(sessionId: string, inputPath?: string): Promise<RuntimeWorkspaceResolvedPath>;
  readTextFile(sessionId: string, inputPath?: string): Promise<{
    content: string;
    path: string;
  }>;
  writeTextFile(sessionId: string, inputPath: string, content: string): Promise<RuntimeWorkspaceWriteResult>;
}
