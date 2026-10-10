@echo off
rem Brain Arcade stable server (PC + phone + headband), Windows.
rem Stops any server already on the port, builds the app, then starts it again.
rem Put this file anywhere. By default it uses the repo folder above this script.
rem
rem PC:    http://localhost:5180
rem Phone: http://localhost:5180  (through adb reverse, set up by the server)
rem
rem --- CONFIGURE (optional) --------------------------------------------------
rem ARCADE_PORT : server port (default 5180)
rem ADB         : full path to adb.exe, only if adb is not found by itself
rem ADB_SERIAL  : one phone only, for example 192.168.1.50:5555 or a USB serial
rem REPO        : repo folder, if you move this script out of the repo
rem ---------------------------------------------------------------------------
rem set "ADB=C:\platform-tools\adb.exe"
rem set "ADB_SERIAL=192.168.1.50:5555"
rem set "REPO=C:\path\to\BrainArcade"

if not defined ARCADE_PORT set ARCADE_PORT=5180
if not defined REPO set "REPO=%~dp0.."
title Brain Arcade server (%ARCADE_PORT%)

echo Checking port %ARCADE_PORT% ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%ARCADE_PORT% " ^| findstr "LISTENING"') do (
  echo Stopping old server, PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
"%SystemRoot%\System32\timeout.exe" /t 1 /nobreak >nul

cd /d "%REPO%" || goto :fail
if not exist package.json (
  echo No package.json in "%REPO%". Set REPO at the top of this file.
  goto :fail
)
if not exist node_modules (
  echo Installing packages ...
  call npm install || goto :fail
)

echo Building and starting the server ...
call npm run arcade
goto :eof

:fail
echo.
echo Start failed. Read the messages above.
pause
