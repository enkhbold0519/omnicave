"""Storage: SQLite for local dev, PostgreSQL in production (DATABASE_URL=postgresql://...).

The app writes SQLite-style SQL (`?` placeholders, `cur.lastrowid`). For PostgreSQL a thin
adapter rewrites each statement (`?` -> `%s`, LIKE -> ILIKE, INSERT ... RETURNING id), so the
service modules stay database-agnostic. One connection per transaction; a global lock serialises them.
"""
import json
import re
import sqlite3
import threading
from contextlib import contextmanager
from functools import lru_cache
from . import config

IS_PG = config.DATABASE_URL.startswith(("postgres://", "postgresql://"))

_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL,
  display_name TEXT,
  preferences TEXT DEFAULT '{}',
  briefing_time TEXT DEFAULT '08:00',
  last_briefing_push TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cellars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT,
  width_cm REAL NOT NULL, height_cm REAL NOT NULL, depth_cm REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
-- shelves / racks. capacity is the *nominal* count; overfilling is allowed (free mapping)
CREATE TABLE IF NOT EXISTS racks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cellar_id INTEGER NOT NULL REFERENCES cellars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'shelf',      -- shelf | floor
  y_cm REAL NOT NULL,                      -- height of the rack surface from the cellar floor
  depth_cm REAL NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 10,
  present INTEGER NOT NULL DEFAULT 1       -- 0 = rack pulled out
);
CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cellar_id INTEGER NOT NULL REFERENCES cellars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  y_from REAL NOT NULL, y_to REAL NOT NULL,
  target_temp REAL NOT NULL,
  target_hum REAL NOT NULL,
  temp_min REAL NOT NULL, temp_max REAL NOT NULL,
  hum_min REAL NOT NULL, hum_max REAL NOT NULL,
  alert_minutes REAL NOT NULL DEFAULT 1
);
-- physical cellar appliances / camera modules linked to an account
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE NOT NULL,
  model TEXT, kind TEXT NOT NULL DEFAULT 'cellar',
  name TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cellar_id INTEGER REFERENCES cellars(id) ON DELETE SET NULL,
  secret_hash TEXT NOT NULL,
  pairing_code TEXT, pairing_expires TEXT,
  token_hash TEXT, token_pending TEXT,
  last_seen TEXT, last_telemetry TEXT, last_scan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, producer TEXT NOT NULL,
  region TEXT, country TEXT, grape TEXT,
  color TEXT NOT NULL, vintage INTEGER,
  drink_from INTEGER, drink_to INTEGER,
  base_price REAL DEFAULT 50,
  UNIQUE(name, producer, vintage)
);
CREATE TABLE IF NOT EXISTS bottles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cellar_id INTEGER NOT NULL REFERENCES cellars(id) ON DELETE CASCADE,
  wine_id INTEGER NOT NULL REFERENCES wines(id),
  -- free 3D position (cm): x from left wall, y from floor, z from the door
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
  orientation TEXT NOT NULL DEFAULT 'lying',   -- lying | standing
  rack_id INTEGER REFERENCES racks(id) ON DELETE SET NULL,
  level INTEGER NOT NULL DEFAULT 0,            -- 0 = on the rack, 1+ = stacked on other bottles
  status TEXT NOT NULL DEFAULT 'stored',
  source TEXT NOT NULL DEFAULT 'manual',
  confidence REAL,
  missing_scans INTEGER NOT NULL DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now')),
  removed_at TEXT
);
CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cellar_id INTEGER NOT NULL REFERENCES cellars(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS consumption (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wine_id INTEGER NOT NULL REFERENCES wines(id),
  consumed_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  temp REAL NOT NULL, hum REAL NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_readings_zone_ts ON sensor_readings(zone_id, ts);
CREATE TABLE IF NOT EXISTS user_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS persona_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  dedupe_key TEXT,
  push INTEGER NOT NULL DEFAULT 1,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
"""


# ---------------------------------------------------------------- PostgreSQL adapter

_NO_ID_TABLES = {"tokens", "schema_version"}   # tables without an integer `id` column (no RETURNING id)


def _pg_schema(sql: str) -> str:
    sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
    sql = re.sub(r"\bREAL\b", "DOUBLE PRECISION", sql)
    return sql.replace("(datetime('now'))", "(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))")


@lru_cache(maxsize=512)
def _pg_sql(sql: str) -> tuple[str, bool]:
    """SQLite-style statement -> (PostgreSQL statement, returns_id)."""
    out = sql.replace("%", "%%").replace("?", "%s")
    out = re.sub(r"\bLIKE\b", "ILIKE", out)          # SQLite LIKE is case-insensitive
    m = re.match(r"\s*INSERT\s+INTO\s+(\w+)", out, re.I)
    want_id = bool(m) and m.group(1).lower() not in _NO_ID_TABLES and "RETURNING" not in out.upper()
    if want_id:
        out = out.rstrip().rstrip(";") + " RETURNING id"
    return out, want_id


class _PgCursor:
    def __init__(self, cur, want_id: bool):
        self._cur, self._want_id, self._id = cur, want_id, None

    @property
    def lastrowid(self):
        if self._want_id and self._id is None:
            r = self._cur.fetchone()
            self._id = r["id"] if r else None
        return self._id

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()


class _PgConn:
    """Looks enough like sqlite3.Connection for the service modules."""

    def __init__(self):
        import psycopg
        from psycopg.rows import dict_row
        from psycopg.types.numeric import FloatLoader
        self._c = psycopg.connect(config.DATABASE_URL, row_factory=dict_row)
        self._c.adapters.register_loader("numeric", FloatLoader)   # Decimal is not JSON-serialisable

    def execute(self, sql: str, params=()):
        q, want_id = _pg_sql(sql)
        return _PgCursor(self._c.execute(q, tuple(params)), want_id)

    def executescript(self, sql: str) -> None:
        self._c.execute(sql)

    def commit(self): self._c.commit()
    def rollback(self): self._c.rollback()
    def close(self): self._c.close()


# ---------------------------------------------------------------- connections

def _connect():
    if IS_PG:
        return _PgConn()
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def tx():
    """Transaction: commits on success, rolls back on error."""
    with _lock:
        conn = _connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


SCHEMA_VERSION = 2

# PostgreSQL holds real data, so schema changes are migrations, never a reset:
# MIGRATIONS[n] upgrades version n-1 -> n. Add an entry here and bump SCHEMA_VERSION.
MIGRATIONS: dict[int, str] = {}


def init() -> None:
    if IS_PG:
        return _init_pg()
    # dev database: on a schema change, keep the old file as a backup and start fresh
    if config.DB_PATH.exists():
        conn = sqlite3.connect(config.DB_PATH)
        ver = conn.execute("PRAGMA user_version").fetchone()[0]
        has_tables = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'").fetchone()[0]
        conn.close()
        if has_tables and ver != SCHEMA_VERSION:
            for suf in ("", "-wal", "-shm"):
                f = config.DB_PATH.with_name(config.DB_PATH.name + suf)
                if f.exists():
                    f.replace(f.with_name(f.name + f".v{ver}.bak"))
    with tx() as c:
        c.executescript(SCHEMA)
        c.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


def _init_pg() -> None:
    with tx() as c:
        c.execute("SELECT pg_advisory_xact_lock(4242)")   # one initialiser at a time
        c.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
        r = c.execute("SELECT version FROM schema_version").fetchone()
        if r is None:
            c.executescript(_pg_schema(SCHEMA))
            c.execute("INSERT INTO schema_version(version) VALUES(?)", (SCHEMA_VERSION,))
            return
        ver = r["version"]
        if ver > SCHEMA_VERSION:
            raise RuntimeError(f"database schema v{ver} is newer than this backend (v{SCHEMA_VERSION})")
        for v in range(ver + 1, SCHEMA_VERSION + 1):
            if v not in MIGRATIONS:
                raise RuntimeError(f"no migration from schema v{v - 1} to v{v} (see db.MIGRATIONS)")
            c.executescript(MIGRATIONS[v])
            c.execute("UPDATE schema_version SET version=?", (v,))


def rows(c, sql: str, params=()) -> list[dict]:
    return [dict(r) for r in c.execute(sql, params).fetchall()]


def one(c, sql: str, params=()) -> dict | None:
    r = c.execute(sql, params).fetchone()
    return dict(r) if r else None


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False)
