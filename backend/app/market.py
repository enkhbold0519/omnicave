"""Market value provider.

Wine-Searcher's API is paid and key-gated. Without WINE_SEARCHER_API_KEY we
generate a deterministic, clearly-labelled *simulated* price history so the
valuation UI can be built and demoed. Swap `fetch_real_price` for the real call.
"""
import hashlib
import random
from datetime import date
from . import config


def _seed(w: dict) -> int:
    key = f"{w['name']}|{w['producer']}|{w.get('vintage')}"
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


def fetch_real_price(w: dict) -> float | None:
    if not config.WINE_SEARCHER_API_KEY:
        return None
    # TODO: call Wine-Searcher Market Price API here and return the average price (USD)
    return None


def history(w: dict, months: int = 24) -> list[dict]:
    rnd = random.Random(_seed(w))
    yearly = rnd.uniform(-0.02, 0.14)  # appreciation per year
    base = float(w.get("base_price") or 50)
    today = date.today()
    start = base / ((1 + yearly) ** (months / 12))
    out = []
    p = start
    for i in range(months + 1):
        m = (today.month - (months - i) - 1) % 12 + 1
        y = today.year + (today.month - (months - i) - 1) // 12
        p = p * (1 + yearly) ** (1 / 12) * (1 + rnd.uniform(-0.025, 0.025))
        out.append({"date": f"{y:04d}-{m:02d}", "price": round(p, 2)})
    real = fetch_real_price(w)
    if real:
        out[-1]["price"] = real
    return out


def current(w: dict) -> dict:
    h = history(w, 12)
    now, then = h[-1]["price"], h[0]["price"]
    return {
        "price": now,
        "change_12m": round((now - then) / then * 100, 1) if then else 0.0,
        "currency": "USD",
        "source": "wine-searcher" if config.WINE_SEARCHER_API_KEY else "simulated",
    }
