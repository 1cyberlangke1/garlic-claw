@echo off
setlocal EnableExtensions

REM Input:
REM - none
REM Output:
REM - starts shared/server bootstrap build, backend compiler watcher, backend app, and Vite dev server
REM Expected behavior:
REM - only starts when ports 23330, 23331, and 23333 are free
REM - writes managed PIDs to other\dev-processes.env
REM - writes logs to other\logs\

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"

set "OTHER_DIR=%REPO_ROOT%\other"
set "LOG_DIR=%OTHER_DIR%\logs"
set "STATE_FILE=%OTHER_DIR%\dev-processes.env"
set "SERVER_DIR=%REPO_ROOT%\packages\server"
set "WEB_DIR=%REPO_ROOT%\packages\web"
set "SERVER_PORT=23330"
set "PLUGIN_WS_PORT=23331"
set "WEB_PORT=23333"

set "SERVER_TSC_STDOUT=%LOG_DIR%\server-tsc.log"
set "SERVER_TSC_STDERR=%LOG_DIR%\server-tsc.err.log"
set "SERVER_APP_STDOUT=%LOG_DIR%\server-app.log"
set "SERVER_APP_STDERR=%LOG_DIR%\server-app.err.log"
set "WEB_STDOUT=%LOG_DIR%\web-vite.log"
set "WEB_STDERR=%LOG_DIR%\web-vite.err.log"

pushd "%REPO_ROOT%" >nul
if errorlevel 1 (
  echo Failed to switch to repo root %REPO_ROOT%
  exit /b 1
)

if not exist "%OTHER_DIR%" mkdir "%OTHER_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

call :ensure_clean_state
if errorlevel 1 exit /b 1

call :assert_port_free %SERVER_PORT% backend
if errorlevel 1 exit /b 1

call :assert_port_free %PLUGIN_WS_PORT% plugin-websocket
if errorlevel 1 exit /b 1

call :assert_port_free %WEB_PORT% frontend
if errorlevel 1 exit /b 1

echo [1/6] Building shared...
call npm.cmd run build -w packages/shared
if errorlevel 1 goto :build_failed

echo [2/6] Building plugin-sdk...
call npm.cmd run build -w packages/plugin-sdk
if errorlevel 1 goto :build_failed

echo [3/6] Generating Prisma Client...
call npm.cmd run prisma:generate -w packages/server
if errorlevel 1 goto :build_failed

echo [4/6] Building server...
call npm.cmd run build -w packages/server
if errorlevel 1 goto :build_failed

del /f /q "%SERVER_TSC_STDOUT%" "%SERVER_TSC_STDERR%" "%SERVER_APP_STDOUT%" "%SERVER_APP_STDERR%" "%WEB_STDOUT%" "%WEB_STDERR%" >nul 2>&1

echo [5/6] Starting backend compiler watcher...
call :start_process BACKEND_TSC_PID "%SERVER_DIR%" "cmd.exe" "/c \"%REPO_ROOT%\node_modules\.bin\tsc.cmd\" -p tsconfig.build.json --watch --preserveWatchOutput" "%SERVER_TSC_STDOUT%" "%SERVER_TSC_STDERR%"
if errorlevel 1 goto :startup_failed

echo [6/6] Starting backend app...
call :start_process BACKEND_APP_PID "%SERVER_DIR%" "node.exe" "dist/main.js" "%SERVER_APP_STDOUT%" "%SERVER_APP_STDERR%"
if errorlevel 1 goto :startup_failed

echo [7/7] Starting Vite dev server...
call :start_process WEB_PID "%WEB_DIR%" "cmd.exe" "/c \"%REPO_ROOT%\node_modules\.bin\vite.cmd\" --host 127.0.0.1 --port %WEB_PORT% --strictPort --configLoader native" "%WEB_STDOUT%" "%WEB_STDERR%"
if errorlevel 1 goto :startup_failed

call :wait_for_port %SERVER_PORT% 60 backend
if errorlevel 1 goto :startup_failed

call :wait_for_port %WEB_PORT% 60 frontend
if errorlevel 1 goto :startup_failed

(
  echo BACKEND_TSC_PID=%BACKEND_TSC_PID%
  echo BACKEND_APP_PID=%BACKEND_APP_PID%
  echo WEB_PID=%WEB_PID%
  echo STARTED_AT=%DATE% %TIME%
) > "%STATE_FILE%"

echo.
echo Dev services started:
echo - Backend: http://127.0.0.1:%SERVER_PORT%
echo - Frontend: http://127.0.0.1:%WEB_PORT%
echo - PID state file: %STATE_FILE%
echo - Log directory: %LOG_DIR%
popd >nul
exit /b 0

:build_failed
echo Shared/server bootstrap build failed. Dev services were not started.
popd >nul
exit /b 1

:startup_failed
echo Dev startup failed. Cleaning managed processes...
call :kill_if_defined %BACKEND_TSC_PID%
call :kill_if_defined %BACKEND_APP_PID%
call :kill_if_defined %WEB_PID%
del /f /q "%STATE_FILE%" >nul 2>&1
echo Check logs:
echo - %SERVER_TSC_STDOUT%
echo - %SERVER_TSC_STDERR%
echo - %SERVER_APP_STDOUT%
echo - %SERVER_APP_STDERR%
echo - %WEB_STDOUT%
echo - %WEB_STDERR%
popd >nul
exit /b 1

:ensure_clean_state
if not exist "%STATE_FILE%" exit /b 0

for /f "usebackq tokens=1,* delims==" %%A in ("%STATE_FILE%") do (
  if /I "%%A"=="BACKEND_TSC_PID" call :is_pid_running "%%B" && set "STATE_STATUS=alive"
  if /I "%%A"=="BACKEND_APP_PID" call :is_pid_running "%%B" && set "STATE_STATUS=alive"
  if /I "%%A"=="WEB_PID" call :is_pid_running "%%B" && set "STATE_STATUS=alive"
)

if /I "%STATE_STATUS%"=="alive" (
  echo Managed processes from a previous start are still running. Run tools\stop-dev.bat first.
  set "STATE_STATUS="
  exit /b 1
)

del /f /q "%STATE_FILE%" >nul 2>&1
set "STATE_STATUS="
exit /b 0

:assert_port_free
set "PORT_PID="
for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":%~1 .*LISTENING"') do set "PORT_PID=%%I"

if defined PORT_PID (
  echo %~2 port %~1 is already in use by PID %PORT_PID%. Run tools\stop-dev.bat or free the port first.
  set "PORT_PID="
  exit /b 1
)

exit /b 0

:start_process
set "%~1="
set "PID_FILE=%TEMP%\garlic-claw-%RANDOM%-%RANDOM%.pid"
del /f /q "%PID_FILE%" >nul 2>&1

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath '%~3' -ArgumentList '%~4' -WorkingDirectory '%~2' -RedirectStandardOutput '%~5' -RedirectStandardError '%~6' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath '%PID_FILE%' -Value $p.Id -NoNewline"
if errorlevel 1 (
  del /f /q "%PID_FILE%" >nul 2>&1
  echo Failed to start process %~3 %~4
  exit /b 1
)

if exist "%PID_FILE%" set /p %~1=<"%PID_FILE%"
del /f /q "%PID_FILE%" >nul 2>&1

if not defined %~1 (
  echo Failed to start process %~3 %~4
  exit /b 1
)

exit /b 0

:wait_for_port
set /a WAIT_COUNT=0

:wait_for_port_loop
call :port_has_listener %~1
if not errorlevel 1 exit /b 0

if %WAIT_COUNT% GEQ %~2 (
  echo %~3 did not open port %~1 within %~2 seconds.
  exit /b 1
)

set /a WAIT_COUNT+=1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1"
goto :wait_for_port_loop

:port_has_listener
for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":%~1 .*LISTENING"') do exit /b 0
exit /b 1

:is_pid_running
if "%~1"=="" exit /b 1
tasklist /FI "PID eq %~1" | findstr /R "\<%~1\>" >nul
if errorlevel 1 exit /b 1
exit /b 0

:kill_if_defined
if "%~1"=="" exit /b 0
taskkill /PID %~1 /T /F >nul 2>&1
exit /b 0
