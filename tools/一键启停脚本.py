"""Garlic Claw 开发环境一键启停脚本。

与 tools/start-dev.bat 和 tools/stop-dev.bat 行为完全一致。
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

脚本目录 = Path(__file__).resolve().parent
REPO_ROOT = 脚本目录.parent
OTHER_DIR = REPO_ROOT / 'other'
LOG_DIR = OTHER_DIR / 'logs'
STATE_FILE = OTHER_DIR / 'dev-processes.env'
SERVER_DIR = REPO_ROOT / 'packages' / 'server'
WEB_DIR = REPO_ROOT / 'packages' / 'web'
SERVER_PORT = 23330
PLUGIN_WS_PORT = 23331
WEB_PORT = 23333

SERVER_TSC_STDOUT = LOG_DIR / 'server-tsc.log'
SERVER_TSC_STDERR = LOG_DIR / 'server-tsc.err.log'
SERVER_APP_STDOUT = LOG_DIR / 'server-app.log'
SERVER_APP_STDERR = LOG_DIR / 'server-app.err.log'
WEB_STDOUT = LOG_DIR / 'web-vite.log'
WEB_STDERR = LOG_DIR / 'web-vite.err.log'


def 进程是否存活(进程号: int) -> bool:
    if 进程号 <= 0:
        return False
    if os.name == 'nt':
        结果 = subprocess.run(
            ['tasklist', '/FI', f'PID eq {进程号}'],
            capture_output=True, text=True, check=False,
        )
        return str(进程号) in 结果.stdout
    try:
        os.kill(进程号, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False
    except OSError:
        return False


def 端口是否被监听(端口: int) -> bool:
    结果 = subprocess.run(
        ['netstat', '-ano', '-p', 'tcp'],
        capture_output=True, text=True, check=False,
    )
    for 行 in 结果.stdout.splitlines():
        if f':{端口}' in 行 and 'LISTENING' in 行:
            片段 = 行.split()
            if 片段 and 片段[-1].isdigit():
                return True
    return False


def 确保端口空闲(端口: int, 名称: str) -> bool:
    结果 = subprocess.run(
        ['netstat', '-ano', '-p', 'tcp'],
        capture_output=True, text=True, check=False,
    )
    for 行 in 结果.stdout.splitlines():
        if f':{端口}' in 行 and 'LISTENING' in 行:
            片段 = 行.split()
            if 片段 and 片段[-1].isdigit():
                占用进程号 = 片段[-1]
                print(
                    f'{名称} 端口 {端口} 已被 PID {占用进程号} 占用。'
                    f'请先运行 tools\\stop-dev.bat 或释放该端口。'
                )
                return False
    return True


def 执行npm步骤(提示: str, *参数: str) -> bool:
    print(提示)
    结果 = subprocess.run(
        ['npm.cmd' if os.name == 'nt' else 'npm', *参数],
        cwd=REPO_ROOT,
        check=False,
    )
    return 结果.returncode == 0


def 启动后台进程(
    工作目录: Path,
    可执行文件: str,
    参数: str,
    标准输出路径: Path,
    错误输出路径: Path,
) -> int | None:
    OTHER_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    标准输出路径.write_text('', encoding='utf-8')
    错误输出路径.write_text('', encoding='utf-8')

    命令 = (
        f'$p = Start-Process -FilePath "{可执行文件}" '
        f'-ArgumentList "{参数}" '
        f'-WorkingDirectory "{工作目录}" '
        f'-RedirectStandardOutput "{标准输出路径}" '
        f'-RedirectStandardError "{错误输出路径}" '
        f'-WindowStyle Hidden -PassThru; '
        f'Write-Output $p.Id'
    )

    结果 = subprocess.run(
        [
            'powershell.exe',
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            命令,
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    try:
        进程号 = int(结果.stdout.strip())
    except ValueError:
        进程号 = -1

    if 进程号 <= 0 or not 进程是否存活(进程号):
        print(f'启动进程失败 {可执行文件} {参数}')
        return None

    return 进程号


def 等待端口就绪(端口: int, 超时秒数: int, 名称: str) -> bool:
    for _ in range(超时秒数):
        if 端口是否被监听(端口):
            return True
        time.sleep(1)
    print(f'{名称} 未在 {超时秒数} 秒内打开端口 {端口}。')
    return False


def 关闭进程(进程号: int | None, 名称: str) -> None:
    if 进程号 is None or 进程号 <= 0:
        return
    结果 = subprocess.run(
        ['taskkill', '/PID', str(进程号), '/T', '/F'],
        capture_output=True, text=True, check=False,
    )
    if 结果.returncode != 0:
        print(f'{名称} PID {进程号} 已经不存在或无法停止。')
    else:
        print(f'已停止 {名称} PID {进程号}')


def 按端口关闭进程(端口: int, 名称: str) -> None:
    结果 = subprocess.run(
        ['netstat', '-ano', '-p', 'tcp'],
        capture_output=True, text=True, check=False,
    )
    for 行 in 结果.stdout.splitlines():
        if f':{端口}' in 行 and 'LISTENING' in 行:
            片段 = 行.split()
            if 片段 and 片段[-1].isdigit():
                进程号 = 片段[-1]
                subprocess.run(
                    ['taskkill', '/PID', 进程号, '/T', '/F'],
                    capture_output=True, text=True, check=False,
                )
                print(f'已停止 {名称} PID {进程号}（通过端口 {端口}）')


def 确保无旧进程残留() -> bool:
    if not STATE_FILE.exists():
        return True

    有存活进程 = False
    文本 = STATE_FILE.read_text(encoding='utf-8', errors='ignore')
    for 行 in 文本.splitlines():
        if '=' not in 行:
            continue
        键, 值 = 行.split('=', 1)
        键 = 键.strip().upper()
        值 = 值.strip()
        if 键 in ('BACKEND_TSC_PID', 'BACKEND_APP_PID', 'WEB_PID'):
            if 值.isdigit() and 进程是否存活(int(值)):
                有存活进程 = True

    if 有存活进程:
        print(
            '上一次启动的受管进程仍在运行。'
            '请先运行 tools\\stop-dev.bat。'
        )
        return False

    STATE_FILE.unlink(missing_ok=True)
    return True


def 启动失败清理(
    编译器进程号: int | None,
    应用进程号: int | None,
    前端进程号: int | None,
) -> int:
    print('开发服务启动失败。正在清理已拉起的进程...')
    关闭进程(编译器进程号, '后端编译器')
    关闭进程(应用进程号, '后端应用')
    关闭进程(前端进程号, '前端开发服务器')
    STATE_FILE.unlink(missing_ok=True)
    print('请检查日志：')
    print(f'- {SERVER_TSC_STDOUT}')
    print(f'- {SERVER_TSC_STDERR}')
    print(f'- {SERVER_APP_STDOUT}')
    print(f'- {SERVER_APP_STDERR}')
    print(f'- {WEB_STDOUT}')
    print(f'- {WEB_STDERR}')
    return 1


def 构建失败() -> int:
    print('共享包/服务端引导构建失败。未启动开发服务。')
    return 1


def 启动() -> int:
    if not 确保无旧进程残留():
        return 1

    if not 确保端口空闲(SERVER_PORT, '后端'):
        return 1
    if not 确保端口空闲(PLUGIN_WS_PORT, '插件WebSocket'):
        return 1
    if not 确保端口空闲(WEB_PORT, '前端'):
        return 1

    if not 执行npm步骤(
        '[1/6] 正在构建 shared...', 'run', 'build', '-w', 'packages/shared'
    ):
        return 构建失败()

    if not 执行npm步骤(
        '[2/6] 正在构建 plugin-sdk...', 'run', 'build', '-w', 'packages/plugin-sdk'
    ):
        return 构建失败()

    if not 执行npm步骤(
        '[3/6] 正在生成 Prisma Client...',
        'run', 'prisma:generate', '-w', 'packages/server',
    ):
        return 构建失败()

    if not 执行npm步骤(
        '[4/6] 正在构建 server...', 'run', 'build', '-w', 'packages/server'
    ):
        return 构建失败()

    for 日志路径 in [
        SERVER_TSC_STDOUT,
        SERVER_TSC_STDERR,
        SERVER_APP_STDOUT,
        SERVER_APP_STDERR,
        WEB_STDOUT,
        WEB_STDERR,
    ]:
        日志路径.unlink(missing_ok=True)

    print('[5/6] 正在启动后端编译器监视器...')
    编译器命令路径 = REPO_ROOT / 'node_modules' / '.bin' / 'tsc.cmd'
    编译器进程号 = 启动后台进程(
        SERVER_DIR,
        'cmd.exe',
        f'"{编译器命令路径}" -p tsconfig.build.json --watch --preserveWatchOutput',
        SERVER_TSC_STDOUT,
        SERVER_TSC_STDERR,
    )
    if 编译器进程号 is None:
        return 启动失败清理(None, None, None)

    print('[6/6] 正在启动后端应用...')
    应用进程号 = 启动后台进程(
        SERVER_DIR,
        'node.exe',
        'dist/main.js',
        SERVER_APP_STDOUT,
        SERVER_APP_STDERR,
    )
    if 应用进程号 is None:
        return 启动失败清理(编译器进程号, None, None)

    print('[7/7] 正在启动 Vite 开发服务器...')
    前端命令路径 = REPO_ROOT / 'node_modules' / '.bin' / 'vite.cmd'
    前端进程号 = 启动后台进程(
        WEB_DIR,
        'cmd.exe',
        f'"{前端命令路径}" --host 127.0.0.1 --port {WEB_PORT} --strictPort --configLoader native',
        WEB_STDOUT,
        WEB_STDERR,
    )
    if 前端进程号 is None:
        return 启动失败清理(编译器进程号, 应用进程号, None)

    if not 等待端口就绪(SERVER_PORT, 60, '后端'):
        return 启动失败清理(编译器进程号, 应用进程号, 前端进程号)
    if not 等待端口就绪(WEB_PORT, 60, '前端'):
        return 启动失败清理(编译器进程号, 应用进程号, 前端进程号)

    STATE_FILE.write_text(
        f'BACKEND_TSC_PID={编译器进程号}\n'
        f'BACKEND_APP_PID={应用进程号}\n'
        f'WEB_PID={前端进程号}\n'
        f"STARTED_AT={time.strftime('%Y-%m-%d %H:%M:%S')}\n",
        encoding='utf-8',
    )

    print()
    print('开发服务已启动：')
    print(f'- 后端：http://127.0.0.1:{SERVER_PORT}')
    print(f'- 前端：http://127.0.0.1:{WEB_PORT}')
    print(f'- 状态文件：{STATE_FILE}')
    print(f'- 日志目录：{LOG_DIR}')
    return 0


def 停止() -> int:
    编译器进程号 = None
    应用进程号 = None
    前端进程号 = None

    if STATE_FILE.exists():
        文本 = STATE_FILE.read_text(encoding='utf-8', errors='ignore')
        for 行 in 文本.splitlines():
            if '=' not in 行:
                continue
            键, 值 = 行.split('=', 1)
            键 = 键.strip().upper()
            值 = 值.strip()
            if 键 == 'BACKEND_TSC_PID' and 值.isdigit():
                编译器进程号 = int(值)
            elif 键 == 'BACKEND_APP_PID' and 值.isdigit():
                应用进程号 = int(值)
            elif 键 == 'WEB_PID' and 值.isdigit():
                前端进程号 = int(值)

    关闭进程(编译器进程号, '后端编译器')
    关闭进程(应用进程号, '后端应用')
    关闭进程(前端进程号, '前端开发服务器')

    按端口关闭进程(SERVER_PORT, '后端')
    按端口关闭进程(PLUGIN_WS_PORT, '插件WebSocket')
    按端口关闭进程(WEB_PORT, '前端')

    STATE_FILE.unlink(missing_ok=True)
    print('开发服务已停止。')
    return 0


def 主入口() -> int:
    解析器 = argparse.ArgumentParser(
        description='Garlic Claw 开发环境启动脚本',
    )
    解析器.add_argument(
        '--stop', action='store_true', help='停止所有受管服务'
    )
    参数 = 解析器.parse_args()

    if 参数.stop:
        return 停止()
    return 启动()


if __name__ == '__main__':
    raise SystemExit(主入口())
