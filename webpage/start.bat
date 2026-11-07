@echo off
cd /d "%~dp0backend"
if not exist .venv\Scripts\activate.bat py -m venv .venv
call .venv\Scripts\activate.bat
pip install -r requirements.txt
echo Open http://localhost:8000
python -m uvicorn app.main:app --port 8000
pause
