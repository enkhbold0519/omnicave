@echo off
REM Starts the display app dev server on http://localhost:5173 (/api is proxied to the backend)
cd /d "%~dp0wine-cellar-display"
npm run dev
pause
