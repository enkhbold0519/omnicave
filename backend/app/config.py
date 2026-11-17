"""Settings loaded from backend/.env (no python-dotenv dependency)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(BASE_DIR / ".env")


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


LLM_PROVIDER = env("LLM_PROVIDER", "mock").lower()
HF_TOKEN = env("HF_TOKEN")
HF_MODEL = env("HF_MODEL", "Qwen/Qwen2.5-7B-Instruct")
OPENAI_API_KEY = env("OPENAI_API_KEY")
OPENAI_MODEL = env("OPENAI_MODEL", "gpt-4o-mini")
VLLM_BASE_URL = env("VLLM_BASE_URL", "http://localhost:8001/v1")
VLLM_BASE_MODEL = env("VLLM_BASE_MODEL", "Qwen/Qwen2.5-7B-Instruct")
WINE_SEARCHER_API_KEY = env("WINE_SEARCHER_API_KEY")
NEWS_FEEDS = [u.strip() for u in env("NEWS_FEEDS", "").split(",") if u.strip()]
SENSOR_INTERVAL = float(env("SENSOR_INTERVAL", "5"))
# 0 -> no simulated readings (real cellar devices only); alerts and daily briefings still run
SIMULATE_SENSORS = env("SIMULATE_SENSORS", "1") not in ("0", "false", "no", "off")
VISION_PROVIDER = env("VISION_PROVIDER", "mock").lower()   # mock | http
VISION_ENDPOINT = env("VISION_ENDPOINT", "http://localhost:8100/detect")
VISION_API_KEY = env("VISION_API_KEY")
VISION_MISSING_SCANS = int(env("VISION_MISSING_SCANS", "2"))
DB_PATH = BASE_DIR / env("DB_PATH", "data/cellar.db")
# empty -> SQLite at DB_PATH (local dev); postgresql://user:pass@host:5432/db -> PostgreSQL
DATABASE_URL = env("DATABASE_URL")
CORS_ORIGINS = [o.strip() for o in env("CORS_ORIGINS", "*").split(",")]
PERSONAS_PATH = BASE_DIR / "personas.json"
TOKEN_TTL_HOURS = 24 * 7
