"""Garlic Claw 开发环境一键启停脚本。

与 start-dev.bat / stop-dev.bat 行为对齐，但已迁移为 Python 实现。
额外提供：
- --tail-logs    启动成功后实时尾随日志到终端
- --status       查看当前受管服务状态
- 自动 .env 初始化、package-lock.json 变更检测、HTTP 健康检查
- 默认自动重启，--start 可禁用自动重启
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import shlex
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

脚本目录 = Path(__file__).resolve().parent
REPO_ROOT = 脚本目录.parent
OTHER_DIR = REPO_ROOT / 'other'
LOG_DIR = OTHER_DIR / 'logs'
STATE_FILE = OTHER_DIR / 'dev-processes.env'
CACHE_DIR = REPO_ROOT / '.cache'
INSTALL_STATE_FILE = CACHE_DIR / 'install-state.json'
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


def 计算文件哈希(路径: Path) -> str:
    return hashlib.md5(路径.read_bytes()).hexdigest()


def 读取安装状态() -> dict:
    if not INSTALL_STATE_FILE.exists():
        return {}
    try:
        return json.loads(INSTALL_STATE_FILE.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {}


def 保存安装状态(数据: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    INSTALL_STATE_FILE.write_text(
        json.dumps(数据, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def 确保env文件() -> bool:
    env文件 = REPO_ROOT / '.env'
    if env文件.exists():
        return False
    示例文件 = REPO_ROOT / '.env.example'
    if not 示例文件.exists():
        print('警告：未找到 .env 且没有 .env.example 可供复制')
        return False
    shutil.copyfile(示例文件, env文件)
    print('已自动从 .env.example 创建 .env，请根据需要修改其中的配置。')
    return True


def 确保npm依赖已安装() -> bool:
    lock文件 = REPO_ROOT / 'package-lock.json'
    node_modules = REPO_ROOT / 'node_modules'
    if not lock文件.exists():
        return True

    当前哈希 = 计算文件哈希(lock文件)
    状态 = 读取安装状态()
    保存哈希 = 状态.get('package_lock_hash')

    if node_modules.exists() and 保存哈希 == 当前哈希:
        return True

    print('[依赖检查] 检测到 package-lock.json 变化或 node_modules 缺失，正在执行 npm install...')
    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
    结果 = subprocess.run([npm, 'install'], cwd=REPO_ROOT, check=False)
    if 结果.returncode != 0:
        print('npm install 失败')
        return False

    状态['package_lock_hash'] = 当前哈希
    保存安装状态(状态)
    print('npm install 完成')
    return True


def http服务是否就绪(url: str, 超时秒数: int = 30) -> bool:
    截止时间 = time.monotonic() + 超时秒数
    while time.monotonic() < 截止时间:
        try:
            with urllib.request.urlopen(url, timeout=2) as 响应:
                if 200 <= 响应.status < 500:
                    return True
        except urllib.error.HTTPError as e:
            if 200 <= e.code < 500:
                return True
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1)
    return False


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
                    f'请先运行 "python tools\\一键启停脚本.py --stop" 或释放该端口。'
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
    前缀: str | None = None,
) -> subprocess.Popen | None:
    OTHER_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    标准输出路径.write_text('', encoding='utf-8')
    错误输出路径.write_text('', encoding='utf-8')

    cmd = [可执行文件] + shlex.split(参数, posix=False)

    try:
        进程 = subprocess.Popen(
            cmd,
            cwd=工作目录,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )
    except Exception as e:
        print(f'启动进程失败 {" ".join(cmd)}: {e}')
        return None

    def _relay(stream, log_path: Path, prefix: str | None) -> None:
        with open(log_path, 'w', encoding='utf-8', errors='replace') as f:
            for line in stream:
                f.write(line)
                f.flush()
                if prefix:
                    try:
                        sys.stdout.write(f'[{prefix}] {line}')
                        sys.stdout.flush()
                    except UnicodeEncodeError:
                        safe = f'[{prefix}] {line}'.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8')
                        sys.stdout.write(safe)
                        sys.stdout.flush()

    threading.Thread(target=_relay, args=(进程.stdout, 标准输出路径, 前缀), daemon=True).start()
    threading.Thread(target=_relay, args=(进程.stderr, 错误输出路径, 前缀), daemon=True).start()

    if 进程.pid <= 0 or not 进程是否存活(进程.pid):
        print(f'启动进程失败 {" ".join(cmd)}')
        return None

    return 进程


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


def 确保无旧进程残留(允许自动停止: bool = True) -> bool:
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
        if 允许自动停止:
            print('检测到上一次启动的受管进程仍在运行，正在自动停止并重启...')
            停止()
            return True
        print('上一次启动的受管进程仍在运行。请先停止后再启动。')
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


def 启动(是否尾随日志: bool = False, 允许自动停止: bool = True) -> int:
    if not 确保无旧进程残留(允许自动停止):
        return 1

    if not 确保端口空闲(SERVER_PORT, '后端'):
        return 1
    if not 确保端口空闲(PLUGIN_WS_PORT, '插件WebSocket'):
        return 1
    if not 确保端口空闲(WEB_PORT, '前端'):
        return 1

    确保env文件()
    if not 确保npm依赖已安装():
        return 构建失败()

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
    编译器进程 = 启动后台进程(
        SERVER_DIR,
        str(编译器命令路径),
        '-p tsconfig.build.json --watch --preserveWatchOutput',
        SERVER_TSC_STDOUT,
        SERVER_TSC_STDERR,
        前缀='后端编译器',
    )
    编译器进程号 = 编译器进程.pid if 编译器进程 else None
    if 编译器进程号 is None:
        return 启动失败清理(None, None, None)

    print('[6/6] 正在启动后端应用...')
    应用进程 = 启动后台进程(
        SERVER_DIR,
        'node.exe',
        'dist/main.js',
        SERVER_APP_STDOUT,
        SERVER_APP_STDERR,
        前缀='后端',
    )
    应用进程号 = 应用进程.pid if 应用进程 else None
    if 应用进程号 is None:
        return 启动失败清理(编译器进程号, None, None)

    print('[7/7] 正在启动 Vite 开发服务器...')
    前端命令路径 = REPO_ROOT / 'node_modules' / '.bin' / 'vite.cmd'
    前端进程 = 启动后台进程(
        WEB_DIR,
        str(前端命令路径),
        f'--host 127.0.0.1 --port {WEB_PORT} --strictPort --configLoader native',
        WEB_STDOUT,
        WEB_STDERR,
        前缀='前端',
    )
    前端进程号 = 前端进程.pid if 前端进程 else None
    if 前端进程号 is None:
        return 启动失败清理(编译器进程号, 应用进程号, None)

    if not 等待端口就绪(SERVER_PORT, 60, '后端'):
        return 启动失败清理(编译器进程号, 应用进程号, 前端进程号)

    print('正在检查后端 HTTP 健康状态...')
    if not http服务是否就绪(f'http://127.0.0.1:{SERVER_PORT}', 超时秒数=30):
        print('后端 HTTP 健康检查未通过')
        return 启动失败清理(编译器进程号, 应用进程号, 前端进程号)

    if not 等待端口就绪(WEB_PORT, 60, '前端'):
        return 启动失败清理(编译器进程号, 应用进程号, 前端进程号)

    print('正在检查前端 HTTP 健康状态...')
    if not http服务是否就绪(f'http://127.0.0.1:{WEB_PORT}', 超时秒数=30):
        print('前端 HTTP 健康检查未通过')
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
    print()
    print('按 Ctrl+C 停止开发环境并退出。')
    print()

    try:
        while True:
            time.sleep(1)
            if not 进程是否存活(应用进程号) and not 进程是否存活(前端进程号):
                print('检测到后端和前端进程均已退出。')
                break
    except KeyboardInterrupt:
        print()
        print('收到中断信号，正在停止开发环境...')
        return 停止()

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


def 显示状态() -> int:
    if not STATE_FILE.exists():
        print('没有已记录的受管服务。')
        return 0

    编译器进程号 = None
    应用进程号 = None
    前端进程号 = None

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

    def 状态文本(进程号: int | None) -> str:
        if 进程号 is None:
            return '未记录'
        return '运行中' if 进程是否存活(进程号) else '已停止'

    print('当前受管服务状态：')
    print(f'- 后端编译器：{状态文本(编译器进程号)} (PID={编译器进程号 or "-"})')
    print(f'- 后端应用：  {状态文本(应用进程号)} (PID={应用进程号 or "-"})')
    print(f'- 前端服务器：{状态文本(前端进程号)} (PID={前端进程号 or "-"})')
    return 0


def 主入口() -> int:
    解析器 = argparse.ArgumentParser(
        description='Garlic Claw 开发环境启动脚本（默认自动重启）',
    )
    解析器.add_argument(
        '--start', action='store_true', help='启动服务（不自动停止旧进程，遇到残留直接报错）'
    )
    解析器.add_argument(
        '--restart', action='store_true', help='重启服务（自动停止旧进程后再启动）'
    )
    解析器.add_argument(
        '--stop', action='store_true', help='停止所有受管服务'
    )
    解析器.add_argument(
        '--status', action='store_true', help='查看当前受管服务状态'
    )
    解析器.add_argument(
        '--tail-logs', action='store_true', help='启动成功后实时显示后端和前端日志到终端（按 Ctrl+C 停止）'
    )
    解析器.add_argument(
        '--log', action='store_true', help=argparse.SUPPRESS
    )
    解析器.add_argument(
        '--logs', action='store_true', help=argparse.SUPPRESS
    )
    参数 = 解析器.parse_args()

    if 参数.stop:
        return 停止()
    if 参数.status:
        return 显示状态()

    允许自动停止 = not 参数.start
    return 启动(
        是否尾随日志=True,
        允许自动停止=允许自动停止,
    )


if __name__ == '__main__':
    raise SystemExit(主入口())
