# OmniCave (Windows desktop web app + server)

A FastAPI server that hosts the OmniCave web app, stores accounts (scrypt-hashed passwords, signed tokens)
and each user's cellar data (SQLite by default, PostgreSQL via `DATABASE_URL`), and pushes live updates to
every signed-in browser over WebSocket.

## Run
- **Windows:** double-click `start.bat` (needs Python 3.12+), then open http://localhost:8000
- **Mac/Linux:** `./start.sh`
- **Docker (with PostgreSQL):** `docker compose up --build`

Demo data and AI replies are mock. Sign up, or create the demo account `alex@cellaros.app` / `Cellar#2026` by registering it.
For PostgreSQL outside Docker, also `pip install -r backend/requirements-postgres.txt`. Set `SECRET_KEY` for any real deployment.

## Test
`cd backend && pip install -r requirements-dev.txt && pytest`

## API
`POST /api/register` · `POST /api/login` · `PUT /api/profile` · `GET|PUT /api/state` · `WS /ws?token=` · `GET /api/health`

## Not included
Vision AI, real LLM/market-data calls, sensors, push notifications and offline caching.
