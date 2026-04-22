import { BashToolService } from '../../../src/execution/bash/bash-tool.service';

describe('BashToolService', () => {
  it('describes ask-style network access and non-persistent shell state for just-bash', () => {
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
      '在当前 session 的执行后端中执行命令。',
      '当前 shell backend 使用 bash 语法。',
      '如果后续命令依赖前序命令成功，请把它们放进同一条命令，并用 && 串起来。',
      '同一 session 下写入 backend 当前可见路径的文件，会在后续工具调用中继续可见。',
      '当前后端不会保留 shell 进程状态；不要依赖 cd、export、alias 或 shell function 在跨调用时继续存在。',
      '优先使用 workdir 指定目录，不要把 cd 写进命令里。',
      '读取、搜索或编辑文件时优先使用 read / glob / grep / write / edit，不要用 bash 代替。',
      '当前执行环境的网络访问可能需要审批；如需联网，请把依赖写进同一条命令中。',
      'workdir 必须位于当前 backend 可见路径内。',
    ].join('\n'));
  });

  it('describes native-shell syntax according to the host platform', () => {
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toContain(
      process.platform === 'win32'
        ? '当前 shell backend 使用 PowerShell 语法。'
        : '当前 shell backend 使用 bash 语法。',
    );
    expect(service.buildToolDescription()).toContain(
      process.platform === 'win32'
        ? '如果后续命令依赖前序命令成功，不要使用 &&；请改用 PowerShell 条件写法，例如 cmd1; if ($?) { cmd2 }。'
        : '如果后续命令依赖前序命令成功，请把它们放进同一条命令，并用 && 串起来。',
    );
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

  it('adds static shell hints into runtime access metadata and summary', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cd /tmp && cat /etc/hosts && rm logs/tmp.txt',
      description: '检查静态命令提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cd /tmp && cat /etc/hosts && rm logs/tmp.txt',
        commandHints: {
          absolutePaths: ['/tmp', '/etc/hosts'],
          externalAbsolutePaths: ['/tmp', '/etc/hosts'],
          fileCommands: ['cd', 'cat', 'rm'],
          usesCd: true,
        },
        description: '检查静态命令提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查静态命令提示 (/workspace)；静态提示: 含 cd、文件命令: cd, cat, rm、外部绝对路径: /tmp, /etc/hosts',
    });
  });

  it('includes network command hints in static access metadata and summary', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl -fsSL https://example.com/install.sh',
      description: '检查联网命令提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh',
        commandHints: {
          networkCommands: ['curl'],
          usesNetworkCommand: true,
        },
        description: '检查联网命令提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查联网命令提示 (/workspace)；静态提示: 联网命令: curl',
    });
  });

  it('highlights when a network command also touches external absolute paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl -fsSL https://example.com/install.sh -o /tmp/install.sh',
      description: '检查联网外部路径组合提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh -o /tmp/install.sh',
        commandHints: {
          absolutePaths: ['/tmp/install.sh'],
          externalAbsolutePaths: ['/tmp/install.sh'],
          externalWritePaths: ['/tmp/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查联网外部路径组合提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查联网外部路径组合提示 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: /tmp/install.sh、写入命令涉及外部绝对路径: /tmp/install.sh、外部绝对路径: /tmp/install.sh',
    });
  });

  it('treats curl --output external paths as external writes', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
      description: '检查 curl output 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 curl output 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 curl output 外部写入提示 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
    });
  });

  it('treats wget output-document external paths as external writes', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'wget -O /tmp/install.sh https://example.com/install.sh',
      description: '检查 wget 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'wget -O /tmp/install.sh https://example.com/install.sh',
        commandHints: {
          absolutePaths: ['/tmp/install.sh'],
          externalAbsolutePaths: ['/tmp/install.sh'],
          externalWritePaths: ['/tmp/install.sh'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 wget 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 wget 外部写入提示 (/workspace)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: /tmp/install.sh、写入命令涉及外部绝对路径: /tmp/install.sh、外部绝对路径: /tmp/install.sh',
    });
  });

  it('does not treat lowercase wget -p as a write path flag', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'wget -p ~/downloads https://example.com/index.html',
      description: '检查 wget 短参数大小写',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'wget -p ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 wget 短参数大小写',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 wget 短参数大小写 (/workspace)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
    });
  });

  it('does not treat uppercase curl --Output as a write path flag', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl --Output ~/download.txt https://example.com/file.txt',
      description: '检查 curl 长参数大小写',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl --Output ~/download.txt https://example.com/file.txt',
        commandHints: {
          absolutePaths: ['~/download.txt'],
          externalAbsolutePaths: ['~/download.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 curl 长参数大小写',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 curl 长参数大小写 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/download.txt、外部绝对路径: ~/download.txt',
    });
  });

  it('does not treat mixed-case wget --Directory-Prefix as a write path flag', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
      description: '检查 wget 长参数大小写',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 wget 长参数大小写',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 wget 长参数大小写 (/workspace)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
    });
  });

  it('treats git clone explicit external destination as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git clone https://example.com/repo.git /tmp/repo-copy',
      description: '检查 git clone 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git clone https://example.com/repo.git /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 git clone 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 git clone 外部写入提示 (/workspace)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: /tmp/repo-copy、写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats git clone separate git dir as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git clone --separate-git-dir /tmp/repo.git https://example.com/repo.git',
      description: '检查 git clone 单独 git 目录提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git clone --separate-git-dir /tmp/repo.git https://example.com/repo.git',
        commandHints: {
          absolutePaths: ['/tmp/repo.git'],
          externalAbsolutePaths: ['/tmp/repo.git'],
          externalWritePaths: ['/tmp/repo.git'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 git clone 单独 git 目录提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 git clone 单独 git 目录提示 (/workspace)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: /tmp/repo.git、写入命令涉及外部绝对路径: /tmp/repo.git、外部绝对路径: /tmp/repo.git',
    });
  });

  it('treats git init explicit external destination as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git init /tmp/repo-copy',
      description: '检查 git init 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git init /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git init 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git init 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats git init external destination as write target but keeps template path out of external write paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git init --template /tmp/template-dir /tmp/repo-copy',
      description: '检查 git init 模板参数误报',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git init --template /tmp/template-dir /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/template-dir', '/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/template-dir', '/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git init 模板参数误报',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git init 模板参数误报 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/template-dir, /tmp/repo-copy',
    });
  });

  it('treats git archive output file as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git archive --output /tmp/repo.tar HEAD',
      description: '检查 git archive 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git archive --output /tmp/repo.tar HEAD',
        commandHints: {
          absolutePaths: ['/tmp/repo.tar'],
          externalAbsolutePaths: ['/tmp/repo.tar'],
          externalWritePaths: ['/tmp/repo.tar'],
          writesExternalPath: true,
        },
        description: '检查 git archive 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git archive 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo.tar、外部绝对路径: /tmp/repo.tar',
    });
  });

  it('treats git bundle create output file as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git bundle create /tmp/repo.bundle HEAD',
      description: '检查 git bundle 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git bundle create /tmp/repo.bundle HEAD',
        commandHints: {
          absolutePaths: ['/tmp/repo.bundle'],
          externalAbsolutePaths: ['/tmp/repo.bundle'],
          externalWritePaths: ['/tmp/repo.bundle'],
          writesExternalPath: true,
        },
        description: '检查 git bundle 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git bundle 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo.bundle、外部绝对路径: /tmp/repo.bundle',
    });
  });

  it('treats git format-patch output directory as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git format-patch --output-directory /tmp/patches HEAD~2',
      description: '检查 git format-patch 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git format-patch --output-directory /tmp/patches HEAD~2',
        commandHints: {
          absolutePaths: ['/tmp/patches'],
          externalAbsolutePaths: ['/tmp/patches'],
          externalWritePaths: ['/tmp/patches'],
          writesExternalPath: true,
        },
        description: '检查 git format-patch 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git format-patch 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/patches、外部绝对路径: /tmp/patches',
    });
  });

  it('treats tar create archive file as external write but not source paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'tar -cf /tmp/archive.tar ~/source.txt',
      description: '检查 tar create 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'tar -cf /tmp/archive.tar ~/source.txt',
        commandHints: {
          absolutePaths: ['/tmp/archive.tar', '~/source.txt'],
          externalAbsolutePaths: ['/tmp/archive.tar', '~/source.txt'],
          externalWritePaths: ['/tmp/archive.tar'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 tar create 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 tar create 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/archive.tar、文件命令: tar、外部绝对路径: /tmp/archive.tar, ~/source.txt',
    });
  });

  it('treats tar extract directory as external write but not archive input', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'tar -xf ~/archive.tar -C /tmp/output',
      description: '检查 tar extract 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'tar -xf ~/archive.tar -C /tmp/output',
        commandHints: {
          absolutePaths: ['~/archive.tar', '/tmp/output'],
          externalAbsolutePaths: ['~/archive.tar', '/tmp/output'],
          externalWritePaths: ['/tmp/output'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 tar extract 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 tar extract 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/output、文件命令: tar、外部绝对路径: ~/archive.tar, /tmp/output',
    });
  });

  it('treats cp destination as external write but keeps source out of external write paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cp ~/source.txt /tmp/copied.txt',
      description: '检查 cp 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cp ~/source.txt /tmp/copied.txt',
        commandHints: {
          absolutePaths: ['~/source.txt', '/tmp/copied.txt'],
          externalAbsolutePaths: ['~/source.txt', '/tmp/copied.txt'],
          externalWritePaths: ['/tmp/copied.txt'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 cp 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 cp 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/copied.txt、文件命令: cp、外部绝对路径: ~/source.txt, /tmp/copied.txt',
    });
  });

  it('treats mv destination as external write but keeps source out of external write paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'mv ~/source.txt /tmp/moved.txt',
      description: '检查 mv 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'mv ~/source.txt /tmp/moved.txt',
        commandHints: {
          absolutePaths: ['~/source.txt', '/tmp/moved.txt'],
          externalAbsolutePaths: ['~/source.txt', '/tmp/moved.txt'],
          externalWritePaths: ['/tmp/moved.txt'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 mv 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mv 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/moved.txt、文件命令: mv、外部绝对路径: ~/source.txt, /tmp/moved.txt',
    });
  });

  it('treats cp target-directory flag as external write but keeps sources out of external write paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cp -t /tmp/copied-dir ~/source-a.txt ~/source-b.txt',
      description: '检查 cp target-directory 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cp -t /tmp/copied-dir ~/source-a.txt ~/source-b.txt',
        commandHints: {
          absolutePaths: ['/tmp/copied-dir', '~/source-a.txt', '~/source-b.txt'],
          externalAbsolutePaths: ['/tmp/copied-dir', '~/source-a.txt', '~/source-b.txt'],
          externalWritePaths: ['/tmp/copied-dir'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 cp target-directory 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 cp target-directory 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/copied-dir、文件命令: cp、外部绝对路径: /tmp/copied-dir, ~/source-a.txt, ~/source-b.txt',
    });
  });

  it('treats mv target-directory flag as external write but keeps sources out of external write paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'mv --target-directory /tmp/moved-dir ~/source-a.txt ~/source-b.txt',
      description: '检查 mv target-directory 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'mv --target-directory /tmp/moved-dir ~/source-a.txt ~/source-b.txt',
        commandHints: {
          absolutePaths: ['/tmp/moved-dir', '~/source-a.txt', '~/source-b.txt'],
          externalAbsolutePaths: ['/tmp/moved-dir', '~/source-a.txt', '~/source-b.txt'],
          externalWritePaths: ['/tmp/moved-dir'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 mv target-directory 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mv target-directory 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/moved-dir、文件命令: mv、外部绝对路径: /tmp/moved-dir, ~/source-a.txt, ~/source-b.txt',
    });
  });

  it('treats git worktree add explicit external destination as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git worktree add -b feature /tmp/repo-copy main',
      description: '检查 git worktree 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git worktree add -b feature /tmp/repo-copy main',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git worktree 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git worktree 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats git submodule add explicit external destination as an external write', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git submodule add https://example.com/repo.git /tmp/repo-copy',
      description: '检查 git submodule 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git submodule add https://example.com/repo.git /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git submodule 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git submodule 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats scp destination external paths as external writes', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'scp user@example.com:/var/log/app.log /tmp/app.log',
      description: '检查 scp 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'scp user@example.com:/var/log/app.log /tmp/app.log',
        commandHints: {
          absolutePaths: ['/tmp/app.log'],
          externalAbsolutePaths: ['/tmp/app.log'],
          externalWritePaths: ['/tmp/app.log'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 scp 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 scp 外部写入提示 (/workspace)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: /tmp/app.log、写入命令涉及外部绝对路径: /tmp/app.log、外部绝对路径: /tmp/app.log',
    });
  });

  it('does not treat curl upload-file local input paths as external writes', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl --upload-file /tmp/input.txt https://example.com/upload',
      description: '检查 curl upload-file 误报',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl --upload-file /tmp/input.txt https://example.com/upload',
        commandHints: {
          absolutePaths: ['/tmp/input.txt'],
          externalAbsolutePaths: ['/tmp/input.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 curl upload-file 误报',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 curl upload-file 误报 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: /tmp/input.txt、外部绝对路径: /tmp/input.txt',
    });
  });

  it('does not treat scp local source paths as external writes', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'scp /tmp/input.txt user@example.com:/var/log/app.log',
      description: '检查 scp 本地源文件误报',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'scp /tmp/input.txt user@example.com:/var/log/app.log',
        commandHints: {
          absolutePaths: ['/tmp/input.txt'],
          externalAbsolutePaths: ['/tmp/input.txt'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 scp 本地源文件误报',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 scp 本地源文件误报 (/workspace)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: /tmp/input.txt、外部绝对路径: /tmp/input.txt',
    });
  });

  it('highlights when a write command targets external absolute paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
      description: '检查写入外部路径提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查写入外部路径提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查写入外部路径提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\copied.txt',
    });
  });

  it('treats Copy-Item destination as external write but keeps external source out of external write paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
      description: '检查 Copy-Item 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 Copy-Item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Copy-Item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied.txt',
    });
  });

  it('treats Move-Item destination as external write but keeps external source out of external write paths', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
      description: '检查 Move-Item 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 Move-Item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Move-Item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved.txt',
    });
  });

  it('treats shell redirection to external absolute paths as external writes', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
      description: '检查重定向写入外部路径提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\redirected.txt'],
          writesExternalPath: true,
        },
        description: '检查重定向写入外部路径提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查重定向写入外部路径提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\redirected.txt、外部绝对路径: filesystem::C:\\temp\\redirected.txt',
    });
  });

  it('recognizes out-file filepath writes as external write hints', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
      description: '检查 out-file 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['get-content', 'out-file'],
          writesExternalPath: true,
        },
        description: '检查 out-file 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 out-file 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: get-content, out-file、外部绝对路径: filesystem::C:\\temp\\copied.txt',
    });
  });

  it('recognizes powershell native network commands in static hints', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'iwr https://example.com/api; irm https://example.com/data',
      description: '检查 powershell 联网提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'iwr https://example.com/api; irm https://example.com/data',
        commandHints: {
          networkCommands: ['invoke-webrequest', 'invoke-restmethod'],
          usesNetworkCommand: true,
        },
        description: '检查 powershell 联网提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 powershell 联网提示 (/workspace)；静态提示: 联网命令: invoke-webrequest, invoke-restmethod',
    });
  });

  it('treats new-item path plus name as the external write target', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
      description: '检查 new-item 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 new-item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 new-item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
    });
  });

  it('treats rename-item path plus newname as the external write target', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
      description: '检查 rename-item 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old.txt',
    });
  });

  it('treats new-item positional path plus name as the external write target', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
      description: '检查 new-item positional 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created-positional.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 new-item positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 new-item positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created-positional.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
    });
  });

  it('treats rename-item positional path plus positional newname as the external write target', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
      description: '检查 rename-item positional 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed-positional.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed-positional.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old-positional.txt',
    });
  });

  it('keeps windows drive separators in new-item external write targets', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
      description: '检查 new-item 裸盘符外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-drive.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 new-item 裸盘符外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 new-item 裸盘符外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-drive.txt、文件命令: new-item、外部绝对路径: C:\\temp',
    });
  });

  it('keeps windows drive separators in rename-item external write targets', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
      description: '检查 rename-item 裸盘符外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-drive.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-drive.txt'],
          externalWritePaths: ['C:\\temp\\renamed-drive.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item 裸盘符外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item 裸盘符外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-drive.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-drive.txt',
    });
  });

  it('treats mkdir path plus name as the external write target in powershell style syntax', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'mkdir -Path C:\\temp -Name created-dir',
      description: '检查 mkdir 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'mkdir -Path C:\\temp -Name created-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 mkdir 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mkdir 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
    });
  });

  it('treats md alias path plus name as the external write target in powershell style syntax', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'md -Path C:\\temp -Name created-alias-dir',
      description: '检查 md 外部写入提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'md -Path C:\\temp -Name created-alias-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 md 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 md 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
    });
  });

  it('recognizes invoke-webrequest outfile writes as combined network and external write hints', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
      description: '检查 powershell 联网写入外部路径提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalWritePaths: ['filesystem::C:\\temp\\install.ps1'],
          networkCommands: ['invoke-webrequest'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 powershell 联网写入外部路径提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 powershell 联网写入外部路径提示 (/workspace)；静态提示: 联网命令: invoke-webrequest、联网命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、写入命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、外部绝对路径: filesystem::C:\\temp\\install.ps1',
    });
  });

  it('marks redundant cd when workdir is already provided', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cd nested && cat app.txt',
      description: '检查重复目录切换',
      sessionId: 'session-1',
      workdir: 'nested',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cd nested && cat app.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          redundantCdWithWorkdir: true,
          usesCd: true,
        },
        description: '检查重复目录切换',
        workdir: 'nested',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查重复目录切换 (nested)；静态提示: 含 cd、已提供 workdir，命令里仍含 cd、文件命令: cd, cat',
    });
  });

  it('highlights parent traversal paths in static hints', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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

    expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cd .. && cat ../notes.txt',
      description: '检查上级目录提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cd .. && cat ../notes.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          parentTraversalPaths: ['..', '../notes.txt'],
          usesCd: true,
          usesParentTraversal: true,
        },
        description: '检查上级目录提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查上级目录提示 (/workspace)；静态提示: 含 cd、相对上级路径: .., ../notes.txt、文件命令: cd, cat',
    });
  });

  it('recognizes powershell aliases and filesystem provider paths in static hints', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'sl filesystem::C:\\temp; gc ~/notes.txt; ni -Path /workspace/tmp -ItemType Directory',
      description: '检查 powershell 静态提示',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'sl filesystem::C:\\temp; gc ~/notes.txt; ni -Path /workspace/tmp -ItemType Directory',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp', '~/notes.txt', '/workspace/tmp'],
          externalAbsolutePaths: ['filesystem::C:\\temp', '~/notes.txt'],
          fileCommands: ['set-location', 'get-content', 'new-item'],
          usesCd: true,
        },
        description: '检查 powershell 静态提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 powershell 静态提示 (/workspace)；静态提示: 含 cd、文件命令: set-location, get-content, new-item、外部绝对路径: filesystem::C:\\temp, ~/notes.txt',
    });
  });

  it('treats bare home path as external but keeps visible provider paths internal', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'gc ~; gc filesystem::/workspace/app.txt',
      description: '检查 home 与 provider 路径',
      sessionId: 'session-1',
    })).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'gc ~; gc filesystem::/workspace/app.txt',
        commandHints: {
          absolutePaths: ['~', 'filesystem::/workspace/app.txt'],
          externalAbsolutePaths: ['~'],
          fileCommands: ['get-content'],
        },
        description: '检查 home 与 provider 路径',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 home 与 provider 路径 (/workspace)；静态提示: 文件命令: get-content、外部绝对路径: ~',
    });
  });

  it('warns about && in windows native-shell static hints', () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
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
          kind: 'native-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    const access = service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Write-Output first && Write-Output second',
      description: '检查 windows chaining 提示',
      sessionId: 'session-1',
    });

    if (process.platform === 'win32') {
      expect(access).toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Write-Output first && Write-Output second',
          commandHints: {
            usesWindowsAndAnd: true,
          },
          description: '检查 windows chaining 提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 windows chaining 提示 (/workspace)；静态提示: Windows native-shell 中不建议使用 &&',
      });
      return;
    }

    expect(access).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Write-Output first && Write-Output second',
        description: '检查 windows chaining 提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 windows chaining 提示 (/workspace)',
    });
  });
});
