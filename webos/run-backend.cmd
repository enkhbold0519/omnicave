@echo off
REM Starts the FastAPI dev backend on http://localhost:8000 (API docs: /docs)
cd /d "%~dp0backend"
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else (
  echo [!] backend\.venv not found - run setup.cmd first. Falling back to the no-install dev server.
  python -m app.devserver 8000
)
pause
