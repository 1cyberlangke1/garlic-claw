@echo off
setlocal EnableExtensions

REM Input:
REM - none
REM Output:
REM - stops the backend compiler watcher, backend app, and frontend dev server started by start-dev.bat
REM Expected behavior:
REM - stops recorded PIDs from other\dev-processes.env first
REM - then cleans up listeners on ports 23330, 23331, and 23333
REM - never uses a broad "kill all node" approach

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"

set "OTHER_DIR=%REPO_ROOT%\other"
set "STATE_FILE=%OTHER_DIR%\dev-processes.env"
set "SERVER_PORT=23330"
set "PLUGIN_WS_PORT=23331"
set "WEB_PORT=23333"

set "BACKEND_TSC_PID="
set "BACKEND_APP_PID="
set "WEB_PID="

if exist "%STATE_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%STATE_FILE%") do (
    if /I "%%A"=="BACKEND_TSC_PID" set "BACKEND_TSC_PID=%%B"
    if /I "%%A"=="BACKEND_APP_PID" set "BACKEND_APP_PID=%%B"
    if /I "%%A"=="WEB_PID" set "WEB_PID=%%B"
  )
)

call :kill_pid_tree "%BACKEND_TSC_PID%" backend-compiler
call :kill_pid_tree "%BACKEND_APP_PID%" backend-app
call :kill_pid_tree "%WEB_PID%" frontend-dev

call :kill_port_listener %SERVER_PORT% backend
call :kill_port_listener %PLUGIN_WS_PORT% plugin-websocket
call :kill_port_listener %WEB_PORT% frontend

del /f /q "%STATE_FILE%" >nul 2>&1

echo Dev services stopped.
exit /b 0

:kill_pid_tree
if "%~1"=="" exit /b 0

taskkill /PID %~1 /T /F >nul 2>&1
if errorlevel 1 (
  echo %~2 PID %~1 is already gone or could not be stopped.
  exit /b 0
)

echo Stopped %~2 PID %~1
exit /b 0

:kill_port_listener
for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":%~1 .*LISTENING"') do (
  taskkill /PID %%I /T /F >nul 2>&1
  if errorlevel 1 (
    echo %~2 PID %%I could not be stopped via port %~1
  ) else (
    echo Stopped %~2 PID %%I via port %~1
  )
)
exit /b 0
