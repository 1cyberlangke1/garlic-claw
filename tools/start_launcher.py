from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / '一键启停脚本.py'
MIN_PYTHON = (3, 10)


def ensureSupportedPython() -> None:
    if sys.version_info >= MIN_PYTHON:
        return

    required = '.'.join(str(part) for part in MIN_PYTHON)
    current = '.'.join(str(part) for part in sys.version_info[:3])
    raise RuntimeError(
        f'当前 Python 版本过低: {current}。'
        f'Garlic Claw 启动脚本至少需要 Python {required}。'
        '请升级 Python，或改用支持 3.10+ 的解释器执行 tools/start_launcher.py。'
    )


def loadMain() -> callable:
    ensureSupportedPython()
    spec = importlib.util.spec_from_file_location('garlic_claw_launcher', SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'无法加载入口脚本: {SCRIPT_PATH}')

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    main = getattr(module, 'main', None)
    if not callable(main):
        raise RuntimeError(f'入口脚本未暴露 main(): {SCRIPT_PATH}')
    return main


if __name__ == '__main__':
    main = loadMain()
    raise SystemExit(main())
