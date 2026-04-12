"""Garlic Claw 开发环境一键启停脚本。

当前以此脚本作为开发态主入口：
- 自动初始化 `.env`
- 检查 `package-lock.json` 变化并按需安装依赖
- 启动 shared / plugin-sdk / server 引导构建
- 启动后端 TypeScript watch、后端 `node --watch`、前端 Vite
- 统一使用 `other/dev-processes.json` 记录受管进程
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import dev_script_common as common


ROOT = common.ROOT
OTHER_DIR = common.OTHER_DIR
LOG_DIR = common.LOG_DIR
STATE_FILE = common.STATE_FILE
DEFAULT_PORTS = common.DEFAULT_PORTS

SERVER_DIR = common.SERVER_DIR
WEB_DIR = common.WEB_DIR
SERVER_PORT = common.SERVER_PORT
PLUGIN_WS_PORT = common.PLUGIN_WS_PORT
WEB_PORT = common.WEB_PORT

INSTALL_STATE_FILE = ROOT / '.cache' / 'install-state.json'
SERVER_TSC_STDOUT = LOG_DIR / 'server-tsc.log'
SERVER_TSC_STDERR = LOG_DIR / 'server-tsc.err.log'
SERVER_APP_STDOUT = LOG_DIR / 'server-app.log'
SERVER_APP_STDERR = LOG_DIR / 'server-app.err.log'
WEB_STDOUT = LOG_DIR / 'web-vite.log'
WEB_STDERR = LOG_DIR / 'web-vite.err.log'


def 获取状态输出宽度(messages: list[str]) -> int:
    if not messages:
        return 0
    return max(len(message) for message in messages)


def 计算文件哈希(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def 获取依赖描述文件列表() -> list[Path]:
    packageFiles = [ROOT / 'package.json']
    packageFiles.extend(sorted((ROOT / 'packages').glob('*/package.json')))
    packageFiles.extend(sorted((ROOT / 'packages' / 'plugins').glob('*/package.json')))
    return [path for path in packageFiles if path.exists()]


def 计算依赖指纹(lockPath: Path) -> dict[str, Any]:
    descriptorFiles = 获取依赖描述文件列表()
    fileHashes = [
        {
            'path': str(path.relative_to(ROOT)).replace('\\', '/'),
            'hash': 计算文件哈希(path),
        }
        for path in descriptorFiles
    ]

    combinedHash = hashlib.md5()
    combinedHash.update(计算文件哈希(lockPath).encode('utf-8'))
    for item in fileHashes:
        combinedHash.update(item['path'].encode('utf-8'))
        combinedHash.update(item['hash'].encode('utf-8'))

    return {
        'lockHash': 计算文件哈希(lockPath),
        'descriptorFiles': fileHashes,
        'combinedHash': combinedHash.hexdigest(),
    }


def 读取安装状态() -> dict[str, Any]:
    if not INSTALL_STATE_FILE.exists():
        return {}
    try:
        return json.loads(INSTALL_STATE_FILE.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {}


def 保存安装状态(state: dict[str, Any]) -> None:
    INSTALL_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    INSTALL_STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def 确保env文件() -> bool:
    envPath = ROOT / '.env'
    if envPath.exists():
        return False

    examplePath = ROOT / '.env.example'
    if not examplePath.exists():
        print('警告：未找到 .env.example，跳过自动初始化。')
        return False

    shutil.copyfile(examplePath, envPath)
    print('已自动从 .env.example 创建 .env。')
    return True


def 确保npm依赖已安装() -> bool:
    lockPath = ROOT / 'package-lock.json'
    nodeModulesPath = ROOT / 'node_modules'
    if not lockPath.exists():
        return True

    dependencyFingerprint = 计算依赖指纹(lockPath)
    installState = 读取安装状态()
    savedHash = installState.get('dependency_fingerprint')

    if savedHash is None:
        savedHash = installState.get('package_lock_hash')

    if nodeModulesPath.exists() and savedHash == dependencyFingerprint['combinedHash']:
        return True

    statusMessage = '安装根目录 npm 依赖'
    width = 获取状态输出宽度([statusMessage])
    common.startSingleLineStatus(statusMessage, width=width)
    result = subprocess.run(
        common.normalizeCommand(['npm', 'install']),
        cwd=ROOT,
        check=False,
    )
    if result.returncode != 0:
        common.finishSingleLineStatus(
            statusMessage,
            width=width,
            result='(失败)',
            success=False,
        )
        return False

    installState['package_lock_hash'] = dependencyFingerprint['lockHash']
    installState['dependency_fingerprint'] = dependencyFingerprint['combinedHash']
    installState['dependency_descriptor_files'] = dependencyFingerprint['descriptorFiles']
    保存安装状态(installState)
    common.finishSingleLineStatus(
        statusMessage,
        width=width,
        result='(完成)',
        success=True,
    )
    return True


def http服务是否就绪(url: str, timeoutSeconds: int = 30) -> bool:
    deadline = time.monotonic() + timeoutSeconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if 200 <= response.status < 500:
                    return True
        except urllib.error.HTTPError as exc:
            if 200 <= exc.code < 500:
                return True
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1)
    return False


def createBuildSteps() -> list[tuple[str, list[str]]]:
    return [
        ('构建 shared', ['npm', 'run', 'build', '-w', 'packages/shared']),
        ('构建 plugin-sdk', ['npm', 'run', 'build', '-w', 'packages/plugin-sdk']),
        ('生成 Prisma Client', ['npm', 'run', 'prisma:generate', '-w', 'packages/server']),
        ('构建 server', ['npm', 'run', 'build', '-w', 'packages/server']),
    ]


def createDevServices() -> dict[str, dict[str, Any]]:
    return {
        'backend_tsc': {
            'name': '后端编译器',
            'cwd': SERVER_DIR,
            'command': [
                common.resolveNodeBin('tsc'),
                '-p',
                'tsconfig.build.json',
                '--watch',
                '--preserveWatchOutput',
            ],
            'stdoutPath': str(SERVER_TSC_STDOUT),
            'stderrPath': str(SERVER_TSC_STDERR),
            'stdoutLabel': '后端编译器',
            'stderrLabel': '后端编译器',
            'mergeStreams': False,
        },
        'backend_app': {
            'name': '后端应用',
            'cwd': SERVER_DIR,
            'command': ['node', '--watch', 'dist/main.js'],
            'stdoutPath': str(SERVER_APP_STDOUT),
            'stderrPath': str(SERVER_APP_STDERR),
            'stdoutLabel': '后端',
            'stderrLabel': '后端',
            'mergeStreams': False,
            'port': SERVER_PORT,
        },
        'web': {
            'name': '前端开发服务器',
            'cwd': WEB_DIR,
            'command': [
                common.resolveNodeBin('vite'),
                '--host',
                '127.0.0.1',
                '--port',
                str(WEB_PORT),
                '--strictPort',
                '--configLoader',
                'native',
            ],
            'stdoutPath': str(WEB_STDOUT),
            'stderrPath': str(WEB_STDERR),
            'stdoutLabel': '前端',
            'stderrLabel': '前端',
            'mergeStreams': False,
            'port': WEB_PORT,
        },
    }


def getPortWaitTimeoutSeconds(serviceName: str) -> int:
    if serviceName == 'backend_app' and not common.IS_WINDOWS:
        return 180
    return 60


def stopServices(
    state: dict[str, Any],
    ports: list[int] | None = None,
    killPid=None,
    findPortPids=None,
) -> list[tuple[str, int]]:
    kwargs: dict[str, Any] = {
        'state': state,
        'ports': ports or list(DEFAULT_PORTS),
    }
    if killPid is not None:
        kwargs['killPid'] = killPid
    if findPortPids is not None:
        kwargs['findPortPidsFn'] = findPortPids
    return common.stopServices(
        **kwargs,
    )


def 读取受管状态() -> dict[str, Any]:
    state = common.loadState()
    if not isinstance(state, dict):
        return {}
    return state


def 保存受管状态(services: dict[str, dict[str, Any]]) -> None:
    common.saveState(
        {
            'services': services,
            'startedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
            'mode': 'dev',
        },
    )


def 确保端口空闲() -> bool:
    for port in DEFAULT_PORTS:
        pids = common.findPortPids(port)
        if not pids:
            continue
        print(
            f'端口 {port} 已被 PID {pids[0]} 占用。'
            '请先运行 "python tools\\一键启停脚本.py --stop" 或释放该端口。'
        )
        return False
    return True


def 执行启动前预检() -> bool:
    checks: list[tuple[str, bool, str]] = []

    npmPath = common.findFirstCommand(['npm.cmd', 'npm.exe', 'npm'])
    checks.append(
        (
            '检查 npm 命令',
            npmPath is not None,
            npmPath or '未找到 npm，请确认 Node.js 已安装并已加入 PATH。',
        )
    )

    nodePath = common.findFirstCommand(['node.exe', 'node'])
    checks.append(
        (
            '检查 node 命令',
            nodePath is not None,
            nodePath or '未找到 node，请确认 Node.js 已安装并已加入 PATH。',
        )
    )

    requiredPaths = [
        ('检查 package-lock.json', ROOT / 'package-lock.json'),
        ('检查 server tsconfig.build.json', SERVER_DIR / 'tsconfig.build.json'),
        ('检查 Prisma schema', SERVER_DIR / 'prisma' / 'schema.prisma'),
        ('检查 web vite.config.ts', WEB_DIR / 'vite.config.ts'),
    ]
    for label, path in requiredPaths:
        checks.append(
            (
                label,
                path.exists(),
                str(path),
            )
        )

    statusWidth = 获取状态输出宽度([label for label, _, _ in checks])
    for label, passed, detail in checks:
        common.startSingleLineStatus(label, width=statusWidth)
        common.finishSingleLineStatus(
            label,
            width=statusWidth,
            result='(通过)' if passed else '(失败)',
            success=passed,
        )
        if passed:
            continue
        print(detail)
        return False

    return True


def 执行构建步骤() -> bool:
    steps = createBuildSteps()
    statusWidth = 获取状态输出宽度([label for label, _ in steps])
    for label, command in steps:
        common.startSingleLineStatus(label, width=statusWidth)
        result = subprocess.run(
            common.normalizeCommand(command),
            cwd=ROOT,
            check=False,
        )
        if result.returncode != 0:
            common.finishSingleLineStatus(
                label,
                width=statusWidth,
                result='(失败)',
                success=False,
            )
            return False
        common.finishSingleLineStatus(
            label,
            width=statusWidth,
            result='(完成)',
            success=True,
        )
    return True


def 记录已启动服务(
    serviceName: str,
    service: dict[str, Any],
    process: subprocess.Popen[str],
) -> dict[str, Any]:
    state = dict(service)
    state['pid'] = process.pid
    state['cwd'] = str(service['cwd'])
    return state


def 启动开发服务(allowAutoStop: bool, tailLogs: bool) -> int:
    state = 读取受管状态()
    activeServices = state.get('services', {}) if isinstance(state.get('services'), dict) else {}
    if activeServices:
        hasRunning = any(
            common.isPidRunning(int(service.get('pid', 0) or 0))
            for service in activeServices.values()
            if isinstance(service, dict)
        )
        if hasRunning:
            if not allowAutoStop:
                print('检测到上一次启动的受管进程仍在运行。请先停止后再启动。')
                return 1
            print('检测到上一次启动的受管进程仍在运行，正在自动停止并重启...')
            stop()
        else:
            common.clearStateFiles()

    if not 确保端口空闲():
        return 1

    common.ensureRuntimeDirs()
    common.ensureGitHooksEnabled()
    if not 执行启动前预检():
        return 1
    确保env文件()
    if not 确保npm依赖已安装():
        return 1
    if not 执行构建步骤():
        return 1

    services = createDevServices()
    startedServices: dict[str, dict[str, Any]] = {}
    startedProcesses: list[subprocess.Popen[str]] = []

    try:
        for index, (serviceName, service) in enumerate(services.items(), start=1):
            print(f'[{index}/{len(services)}] 正在启动{service["name"]}...')
            process = common.startRelayManagedProcess(service) if tailLogs else common.startManagedProcess(service)
            startedProcesses.append(process)
            startedServices[serviceName] = 记录已启动服务(serviceName, service, process)

        保存受管状态(startedServices)

        portStatusWidth = 获取状态输出宽度(
            [
                f'等待{service["name"]}端口就绪'
                for service in startedServices.values()
                if isinstance(service.get('port'), int)
            ]
        )
        for serviceName, service in startedServices.items():
            port = service.get('port')
            if not isinstance(port, int):
                continue
            timeoutSeconds = getPortWaitTimeoutSeconds(serviceName)
            statusLabel = f'等待{service["name"]}端口就绪'
            common.startSingleLineStatus(statusLabel, width=portStatusWidth)
            if not common.waitForPort(port, timeoutSeconds):
                common.finishSingleLineStatus(
                    statusLabel,
                    width=portStatusWidth,
                    result=f'(失败, {timeoutSeconds}s)',
                    success=False,
                )
                print(f'{service["name"]} 未在 {timeoutSeconds} 秒内打开端口 {port}。')
                return 启动失败清理(startedServices)
            common.finishSingleLineStatus(
                statusLabel,
                width=portStatusWidth,
                result=f'(端口 {port})',
                success=True,
            )

        httpChecks = [
            ('检查后端 HTTP 健康状态', f'http://127.0.0.1:{SERVER_PORT}'),
            ('检查前端 HTTP 健康状态', f'http://127.0.0.1:{WEB_PORT}'),
        ]
        httpStatusWidth = 获取状态输出宽度([label for label, _ in httpChecks])
        for label, url in httpChecks:
            common.startSingleLineStatus(label, width=httpStatusWidth)
            if not http服务是否就绪(url, timeoutSeconds=30):
                common.finishSingleLineStatus(
                    label,
                    width=httpStatusWidth,
                    result='(失败)',
                    success=False,
                )
                print(f'{label}未通过。')
                return 启动失败清理(startedServices)
            common.finishSingleLineStatus(
                label,
                width=httpStatusWidth,
                result='(通过)',
                success=True,
            )

        print()
        print('开发服务已启动：')
        print(f'- 前端：http://127.0.0.1:{WEB_PORT}')
        print(f'- 后端：http://127.0.0.1:{SERVER_PORT}')
        print(f'- 状态文件：{STATE_FILE}')
        print(f'- 日志目录：{LOG_DIR}')
        if tailLogs:
            print('- 运行模式：前台 relay 日志（按 Ctrl+C 停止开发环境）')
        else:
            print('- 运行模式：后台启动后自动退出脚本')
            print('- 如需前台看日志：python tools\\一键启停脚本.py --tail-logs')
        print()

        if not tailLogs:
            return 0

        try:
            while True:
                time.sleep(1)
                if not common.isPidRunning(int(startedServices['backend_app']['pid'])) and not common.isPidRunning(int(startedServices['web']['pid'])):
                    print('检测到后端和前端进程均已退出。')
                    break
            return 0
        except KeyboardInterrupt:
            print()
            print('收到中断信号，正在停止开发环境...')
            return stop()
    except Exception as exc:
        print(f'开发服务启动失败：{exc}')
        return 启动失败清理(startedServices)


def 启动失败清理(services: dict[str, dict[str, Any]]) -> int:
    print('开发服务启动失败。正在清理已拉起的进程...')
    stopServices({'services': services})
    common.clearStateFiles()
    print('请检查日志：')
    print(f'- {SERVER_TSC_STDOUT}')
    print(f'- {SERVER_TSC_STDERR}')
    print(f'- {SERVER_APP_STDOUT}')
    print(f'- {SERVER_APP_STDERR}')
    print(f'- {WEB_STDOUT}')
    print(f'- {WEB_STDERR}')
    return 1


def stop() -> int:
    state = 读取受管状态()
    stopServices(
        state=state,
        ports=list(DEFAULT_PORTS),
    )
    common.clearStateFiles()
    print('开发服务已停止。')
    return 0


def status() -> int:
    state = 读取受管状态()
    services = state.get('services')
    if not isinstance(services, dict) or not services:
        print('没有已记录的受管服务。')
        return 0

    print('当前受管服务状态：')
    for serviceName in ['backend_tsc', 'backend_app', 'web']:
        service = services.get(serviceName)
        if not isinstance(service, dict):
            continue
        pid = int(service.get('pid', 0) or 0)
        label = str(service.get('name', serviceName))
        statusText = '运行中' if common.isPidRunning(pid) else '已停止'
        print(f'- {label}：{statusText} (PID={pid or "-"})')
    return 0


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Garlic Claw 开发环境一键启停脚本')
    parser.add_argument(
        '--start',
        action='store_true',
        help='启动服务（不自动停止旧进程，遇到残留直接报错）',
    )
    parser.add_argument(
        '--restart',
        action='store_true',
        help='重启服务（自动停止旧进程后再启动）',
    )
    parser.add_argument(
        '--stop',
        action='store_true',
        help='停止所有受管服务',
    )
    parser.add_argument(
        '--status',
        action='store_true',
        help='查看当前受管服务状态',
    )
    parser.add_argument(
        '--tail-logs',
        action='store_true',
        help='启动成功后实时尾随日志到终端',
    )
    parser.add_argument('--log', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--logs', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--build', action='store_true', help=argparse.SUPPRESS)
    return parser.parse_args()


def main() -> int:
    args = parseArgs()
    if args.stop:
        return stop()
    if args.status:
        return status()

    allowAutoStop = not args.start
    tailLogs = args.tail_logs or args.log or args.logs
    return 启动开发服务(allowAutoStop=allowAutoStop, tailLogs=tailLogs)


if __name__ == '__main__':
    raise SystemExit(main())
