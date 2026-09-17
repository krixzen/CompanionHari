@echo off
REM Double-click this file in File Explorer to start Study Planner.
REM No terminal typing needed -- this window is just here to show the app's logs.
cd /d "%~dp0"

if not exist node_modules (
  echo Setting things up for the first time -- this can take a minute or two...
  call npm install
)

echo.
echo Starting Study Planner...
echo Your browser will open automatically in a few seconds.
echo Leave this window open while you use the app. Close it to stop.
echo.

start "" cmd /c "timeout /t 4 >nul && start http://localhost:5173"
call npm run dev
