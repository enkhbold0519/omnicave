# OmniCave backend

The cloud API behind OmniCave. It serves the cellar-door display, the Android app and the cellar appliance, and it
runs all AI work so the clients stay thin.

**Stack:** Python 3.12, FastAPI, SQLite (development) or PostgreSQL 17 (production), WebSocket for live sync,
Server-Sent Events for streamed AI answers.

## Run locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                 # defaults work without any keys
uvicorn app.main:app --reload        # http://localhost:8000, interactive API docs at /docs
```

With no `DATABASE_URL`, data goes to the SQLite file `data/cellar.db`. Each new account gets a demo cellar.
Production runs the same code in Docker against AWS RDS: see [`../deploy`](../deploy/README.md).

## Structure

| Module | Responsibility |
|---|---|
| `main.py` | FastAPI app; mounts the route table and starts the background simulator |
| `routes.py` | Every endpoint in one table (method, path, handler, auth). Contains no logic |
| `services.py` | Accounts, climate, notifications, recommendations, daily briefing, critic debate prompt |
| `inventory.py` | Cellars, racks, bottles, search, storage recommendations |
| `geometry.py` | Bottle positions in centimetres, stacking and gravity, free-spot search |
| `vision.py`, `labels.py` | Detection reconciliation (new / moved / removed / occluded), label photos (Amazon Rekognition or mock), review queue |
| `devices.py` | Appliance pairing (6-digit code), device tokens, telemetry |
| `tasting.py` | Sommelier tasting table: personas, memory, streamed multi-critic sessions |
| `llm.py` | Client for OpenAI-compatible chat APIs, with mock fallback |
| `live.py` | Live updates: tells a user's open clients over WebSocket (`/api/ws`) that something changed |
| `market.py`, `news.py`, `catalog.py` | Market prices (WineAPI.io, cached, refreshed at most daily; simulated without `WINEAPI_KEY`), wine news feeds, reference wine catalogue |
| `simulator.py` | Simulated climate sensors and the daily briefing job |
| `db.py` | Schema and database access for SQLite and PostgreSQL |
| `security.py` | Password hashing and session tokens |
| `devserver.py` | Minimal standard-library server used by the tests |

Rule: handlers in `routes.py` call one function in a service module. Put logic in the modules, never in the route table.

## Configuration

Settings come from `backend/.env` (template: `.env.example`). Never commit `.env`; API keys stay on the server.

| Setting | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | empty (SQLite) | `postgresql://user:password@host:5432/cellar` for PostgreSQL |
| `LLM_PROVIDER` | `mock` | `mock`, `openai` (`OPENAI_API_KEY`) or `vllm` (`VLLM_BASE_URL`, `VLLM_API_KEY`, persona LoRAs, see [`../AI-7B`](../AI-7B/CLAUDE.md)) |
| `VISION_PROVIDER` | `mock` | `mock`, or `http` to call a detection server at `VISION_ENDPOINT` |
| `SIMULATE_SENSORS` | `1` | Simulated climate data for cellars without a paired appliance |
| `CORS_ORIGINS` | `*` | Allowed browser origins |

AI critic personas are defined in `personas.json`.

## Database

The modules write portable SQLite-style SQL (`?` placeholders). For PostgreSQL, `db.py` rewrites each statement
(`?` → `%s`, `LIKE` → `ILIKE`, `INSERT … RETURNING id`) and translates the schema, so the rest of the code is
database-independent. Keep new SQL portable: no SQLite-only functions, no `IS ?`, no SQL `round()` on floats.

**Schema changes:** bump `SCHEMA_VERSION` in `db.py` and add the upgrade SQL to `db.MIGRATIONS`.
A development SQLite file with an old version is backed up and recreated; PostgreSQL is migrated and never reset.
The API refuses to start if a migration is missing.

## Tests

pytest suite in `tests/` (accounts, auth, inventory, geometry, vision, devices, AI, market, security). CI runs it on
SQLite and PostgreSQL.

```bash
pip install -r requirements-dev.txt
python -m pytest -v                                       # SQLite, temporary file
TEST_DATABASE_URL=postgresql://... python -m pytest -v    # PostgreSQL (the database is WIPED first)
```

Run it before committing backend changes. After editing the critic debate prompt in `services.py`, also run
`python ../AI-7B/check_prompt_sync.py`: the persona LoRAs were trained on that exact prompt.
