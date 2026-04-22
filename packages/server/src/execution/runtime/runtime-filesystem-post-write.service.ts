import { Inject, Injectable, Optional } from '@nestjs/common';
import type { RuntimeFilesystemPostWriteResult } from './runtime-filesystem-backend.types';

export const RUNTIME_FILESYSTEM_POST_WRITE_PROVIDERS = Symbol('RUNTIME_FILESYSTEM_POST_WRITE_PROVIDERS');

export interface RuntimeFilesystemPostWriteInput {
  content: string;
  hostPath: string;
  path: string;
  sessionRoot: string;
  visibleRoot: string;
}

export interface RuntimeFilesystemPostWriteOutput {
  content: string;
  postWrite: RuntimeFilesystemPostWriteResult;
}

export interface RuntimeFilesystemPostWriteProvider {
  processTextFile(input: RuntimeFilesystemPostWriteInput): RuntimeFilesystemPostWriteOutput;
}

@Injectable()
export class RuntimeFilesystemPostWriteService {
  constructor(
    @Optional()
    @Inject(RUNTIME_FILESYSTEM_POST_WRITE_PROVIDERS)
    private readonly providers: RuntimeFilesystemPostWriteProvider[] = [],
  ) {}

  processTextFile(input: RuntimeFilesystemPostWriteInput): RuntimeFilesystemPostWriteOutput {
    let nextContent = input.content;
    let formatting = null as RuntimeFilesystemPostWriteResult['formatting'];
    const diagnostics: RuntimeFilesystemPostWriteResult['diagnostics'] = [];
    for (const provider of this.providers) {
      const result = provider.processTextFile({
        content: nextContent,
        hostPath: input.hostPath,
        path: input.path,
        sessionRoot: input.sessionRoot,
        visibleRoot: input.visibleRoot,
      });
      nextContent = result.content;
      if (result.postWrite.formatting) {
        formatting = result.postWrite.formatting;
      }
      diagnostics.push(...result.postWrite.diagnostics);
    }
    return {
      content: nextContent,
      postWrite: {
        diagnostics,
        formatting,
      },
    };
  }
}
