@echo off
REM Starts the display app dev server on http://localhost:5173 (/api is proxied to the backend)
cd /d "%~dp0wine-cellar-display"
REM bring dependencies up to date after a git pull (about a second when nothing changed)
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo [!] npm install failed - run setup.cmd first.
  pause
  exit /b 1
)
call npm run dev
pause
