"""SQLite storage. One connection per call; a global lock serialises writes."""
import json
import sqlite3
import threading
from contextlib import contextmanager
from . import config

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


def _connect() -> sqlite3.Connection:
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


def init() -> None:
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


def rows(c: sqlite3.Connection, sql: str, params=()) -> list[dict]:
    return [dict(r) for r in c.execute(sql, params).fetchall()]


def one(c: sqlite3.Connection, sql: str, params=()) -> dict | None:
    r = c.execute(sql, params).fetchone()
    return dict(r) if r else None


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False)
