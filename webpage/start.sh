#!/bin/sh
cd "$(dirname "$0")/backend" && { [ -d .venv ] || python3 -m venv .venv; } && . .venv/bin/activate
pip install -q -r requirements.txt && echo "Open http://localhost:8000" && uvicorn app.main:app --port 8000
