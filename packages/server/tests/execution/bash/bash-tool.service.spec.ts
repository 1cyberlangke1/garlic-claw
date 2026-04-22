import { BashToolService } from '../../../src/execution/bash/bash-tool.service';

describe('BashToolService', () => {
  it('describes ask-style network access and non-persistent shell state', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'mock-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toBe([
      '在当前 session 的执行后端中执行 bash 命令。',
      '同一 session 下写入 backend 当前可见路径的文件，会在后续工具调用中继续可见。',
      '当前后端不会保留 shell 进程状态；不要依赖 cd、export、alias 或 shell function 在跨调用时继续存在。',
      '优先使用 workdir 指定目录，不要把 cd 写进命令里。',
      '读取、搜索或编辑文件时优先使用 read / glob / grep / write / edit，不要用 bash 代替。',
      '当前执行环境的网络访问可能需要审批；如需联网，请把依赖写进同一条命令中。',
      'workdir 必须位于当前 backend 可见路径内。',
    ].join('\n'));
  });

  it('describes denied network access inside a restricted visible root', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: false,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'mock-shell',
          permissionPolicy: {
            networkAccess: 'deny',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'allow',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toContain('当前执行环境不提供网络访问。');
    expect(service.buildToolDescription()).toContain('同一 session 下写入 /workspace 内的文件，会在后续工具调用中继续可见。');
    expect(service.buildToolDescription()).toContain('workdir 参数只能位于 /workspace 内。');
  });
});
