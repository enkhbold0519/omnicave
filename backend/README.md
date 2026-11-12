# CellarOS backend

FastAPI backend shared by the webOS display, the mobile apps and the cellar edge agent.

| | Database | How to run |
|---|---|---|
| Local dev | SQLite file `data/cellar.db` (no setup) | Windows: `webos\run-backend.cmd` · or `uvicorn app.main:app --reload` · or `python -m app.devserver` (no pip) |
| Production | PostgreSQL 17 (`DATABASE_URL`) | Docker Compose in [`../deploy`](../deploy/README.md) |

API docs: `http://localhost:8000/docs`

## Configuration
`.env` (copy from `.env.example`). Unset means SQLite. To use PostgreSQL locally, set
`DATABASE_URL=postgresql://user:password@localhost:5432/cellar`.

## How the database layer works
The service modules write plain SQLite-style SQL (`?` placeholders, `cur.lastrowid`). For PostgreSQL, `app/db.py`
rewrites each statement (`?` → `%s`, `LIKE` → `ILIKE`, `INSERT … RETURNING id`) and translates the schema.
The rest of the code doesn't know which database is in use. Keep new SQL portable: no SQLite-only functions,
no `IS ?` with a parameter, no SQL `round()` on floats.

## Tests
```bash
python -m tests.test_api                                         # SQLite
TEST_DATABASE_URL=postgresql://... python -m tests.test_api      # PostgreSQL (WIPES that database)
```
