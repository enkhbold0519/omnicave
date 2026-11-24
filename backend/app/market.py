"""Market value provider.

Real prices come from WineAPI.io (https://wineapi.io, public beta) when WINEAPI_KEY is set:
  GET /wines/search?q=<producer name>  -> WineAPI wine id (stored, so the search runs only once)
  GET /wines/{id}                      -> wine detail: merchant `prices` (median in USD), else the middle of
                                          `priceRange`. Asking for the detail also queues WineAPI's own
                                          enrichment of that wine, so a price can appear on a later day.

The API allows ~100 requests a day, and prices barely move within a day, so nothing calls it while a
request is being served. A background thread refreshes each wine at most once a day (wines WineAPI
does not know at all: once a week), within PRICE_DAILY_LIMIT requests per UTC day.
Results live in the `market_prices` table and in memory; page loads only read memory.

Wines without a real price (no key, no match, no record yet) get a deterministic *simulated* price
history, labelled source="simulated". WineAPI has no price history on our plan (Pro feature), so a
real price only anchors the simulated curve: the whole series is scaled so its last point is the real price.
"""
from __future__ import annotations

import hashlib
import json
import random
import re
import statistics
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher

from . import config, db
from .catalog import CATALOG

SOURCE = "WineAPI.io"
REFRESH_OK = timedelta(hours=24)        # wine with a price: once a day
REFRESH_NONE = timedelta(days=7)        # wine WineAPI does not know: once a week
MIN_MATCH = 0.6                         # share of our producer+name words that must appear in the match

# Approximate fixed rates to USD (prices are shown in USD). Records in other currencies are skipped.
USD_RATES = {"USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.12, "CAD": 0.73, "AUD": 0.66, "NZD": 0.60,
             "JPY": 0.0067, "KRW": 0.00072, "HKD": 0.128, "SGD": 0.74, "ZAR": 0.055}

_cache: dict[str, dict] = {}            # wine key -> market_prices row
_state = {"running": False, "paused_until": None, "last_error": None}


# --------------------------------------------------------------------------- matching helpers
def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def wine_key(w: dict) -> str:
    return f"{_norm(w.get('producer'))}|{_norm(w.get('name'))}|{w.get('vintage') or ''}"


def _match_score(w: dict, r: dict) -> float:
    """How well a search result matches our wine (0..1): our words found in theirs, fuzzy per word."""
    ours = _norm(f"{w.get('producer')} {w.get('name')}").split()
    theirs = _norm(f"{r.get('winery') or ''} {r.get('name') or ''}").split()
    if not ours or not theirs:
        return 0.0
    hit = sum(1 for o in ours if any(o == t or SequenceMatcher(None, o, t).ratio() >= 0.85 for t in theirs))
    return hit / len(ours)


def best_match(w: dict, results: list[dict]) -> dict | None:
    """Prefer the same vintage, then the closest name; None if nothing is close enough."""
    scored = [(_match_score(w, r), r) for r in results]
    scored = [(s, r) for s, r in scored if s >= MIN_MATCH]
    if not scored:
        return None
    v = w.get("vintage")
    return max(scored, key=lambda sr: (sr[1].get("vintage") == v, sr[0], sr[1].get("confidence") or 0))[1]


def detail_price(d: dict) -> tuple[float, str | None] | None:
    """Price from a wine detail: merchant prices first, else the middle of priceRange (both in USD)."""
    got = usd_price(d.get("prices") or [])
    if got:
        return got
    pr = d.get("priceRange") or {}
    rate = USD_RATES.get((pr.get("currency") or "").upper())
    lo, hi = pr.get("min"), pr.get("max")
    if rate and isinstance(lo, (int, float)) and isinstance(hi, (int, float)) and hi > 0:
        return round((max(lo, 0) + hi) / 2 * rate, 2), "price range"
    return None


def usd_price(prices: list[dict]) -> tuple[float, str | None] | None:
    """Median of the merchant prices converted to USD; also returns one merchant name."""
    vals = []
    merchant = None
    for p in prices:
        rate = USD_RATES.get((p.get("currency") or "").upper())
        try:
            amount = float(str(p.get("price")).replace(",", ""))
        except (TypeError, ValueError):
            continue
        if rate and amount > 0:
            vals.append(amount * rate)
            merchant = merchant or p.get("merchantName")
    return (round(statistics.median(vals), 2), merchant) if vals else None


# --------------------------------------------------------------------------- WineAPI client
class RateLimited(Exception):
    pass


def _get(path: str, params: dict | None = None) -> dict:
    url = config.WINEAPI_URL.rstrip("/") + path + ("?" + urllib.parse.urlencode(params) if params else "")
    # explicit User-Agent: some API proxies (Cloudflare) block urllib's default one
    req = urllib.request.Request(url, headers={"X-API-Key": config.WINEAPI_KEY, "Accept": "application/json",
                                               "User-Agent": "omnicave-backend/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise RateLimited() from e
        raise


def lookup(w: dict, wineapi_id: str | None) -> dict:
    """Ask WineAPI for one wine. Returns the new cache row (without wine_key/checked_at)."""
    calls = 0
    matched_vintage = None
    if not wineapi_id:
        q = f"{w.get('producer') or ''} {w.get('name') or ''}".strip()
        res = _get("/wines/search", {"q": q, "limit": 10})
        calls += 1
        hit = best_match(w, res.get("results") or [])
        if not hit:
            return {"wineapi_id": "", "price": None, "merchant": None, "matched_vintage": None, "calls": calls}
        wineapi_id, matched_vintage = hit["id"], hit.get("vintage")
    try:
        data = _get(f"/wines/{wineapi_id}")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        data = {}
        wineapi_id = ""          # the stored id is gone: search again next time
    calls += 1
    got = detail_price(data)
    return {"wineapi_id": wineapi_id, "price": got[0] if got else None, "merchant": got[1] if got else None,
            "matched_vintage": matched_vintage, "calls": calls}


# --------------------------------------------------------------------------- cache + refresh loop
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def used_today() -> int:
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    return sum(r["calls"] for r in list(_cache.values()) if _parse(r["checked_at"]) >= start)


def _due(w: dict) -> bool:
    row = _cache.get(wine_key(w))
    if not row:
        return True
    age = _now() - _parse(row["checked_at"])
    return age >= (REFRESH_OK if row["wineapi_id"] else REFRESH_NONE)


def _wanted() -> list[dict]:
    """Wines that need a price: those in someone's cellar first, then the catalog (purchase suggestions)."""
    with db.tx() as c:
        stored = db.rows(c, "SELECT DISTINCT w.name, w.producer, w.vintage FROM wines w "
                            "JOIN bottles b ON b.wine_id = w.id WHERE b.status = 'stored'")
    seen, out = set(), []
    for w in stored + [dict(x) for x in CATALOG]:
        k = wine_key(w)
        if k not in seen:
            seen.add(k)
            out.append(w)
    return out


def _save(w: dict, row: dict) -> None:
    row = {"wine_key": wine_key(w), "checked_at": _now().isoformat(timespec="seconds"), **row}
    with db.tx() as c:
        c.execute("DELETE FROM market_prices WHERE wine_key=?", (row["wine_key"],))
        c.execute("INSERT INTO market_prices(wine_key, wineapi_id, price, merchant, matched_vintage, checked_at, calls) "
                  "VALUES(?,?,?,?,?,?,?)", (row["wine_key"], row["wineapi_id"], row["price"], row["merchant"],
                                            row["matched_vintage"], row["checked_at"], row["calls"]))
    _cache[row["wine_key"]] = row


def refresh_due(limit: int | None = None, recheck: bool = False) -> int:
    """Refresh wines whose price is due, oldest first, within the daily budget. Returns requests used."""
    if not config.WINEAPI_KEY:
        return 0
    if _state["paused_until"] and _now() < _state["paused_until"]:
        return 0
    budget = (config.PRICE_DAILY_LIMIT if limit is None else limit) - used_today()
    # recheck: also wines checked earlier today that have no price yet (manual run of this module)
    due = [w for w in _wanted() if _due(w) or (recheck and not real_price(w))]
    due.sort(key=lambda w: (_cache.get(wine_key(w)) or {}).get("checked_at", ""))   # never checked first
    used = 0
    for w in due:
        old = _cache.get(wine_key(w)) or {}
        need = 1 if old.get("wineapi_id") else 2
        if used + need > budget:
            break
        try:
            row = lookup(w, old.get("wineapi_id"))
        except RateLimited:
            # quota used up (e.g. requests made outside this server): wait for the next UTC day
            _state["paused_until"] = (_now() + timedelta(days=1)).replace(hour=0, minute=5, second=0, microsecond=0)
            _state["last_error"] = "rate limited (429), paused until the next UTC day"
            break
        except Exception as e:  # network / server error: keep the old price, try again later
            _state["last_error"] = f"{type(e).__name__}: {e}"[:200]
            break
        if row["price"] is None and old.get("price") is not None and row["wineapi_id"]:
            row["price"], row["merchant"] = old["price"], old.get("merchant")   # keep the last known price
        if row["wineapi_id"] and row["matched_vintage"] is None:
            row["matched_vintage"] = old.get("matched_vintage")
        _save(w, row)
        used += row["calls"]
        _state["last_error"] = None
    return used


def load() -> None:
    with db.tx() as c:
        for r in db.rows(c, "SELECT * FROM market_prices"):
            _cache[r["wine_key"]] = r


def _loop() -> None:
    time.sleep(5)            # let the server finish starting
    while _state["running"]:
        try:
            refresh_due()
        except Exception as e:  # keep the thread alive
            _state["last_error"] = f"{type(e).__name__}: {e}"[:200]
        time.sleep(600)      # check every 10 minutes; each wine is still asked at most once a day


def start() -> None:
    load()
    if not config.WINEAPI_KEY or _state["running"]:
        return
    _state["running"] = True
    threading.Thread(target=_loop, name="market-prices", daemon=True).start()


def stop() -> None:
    _state["running"] = False


def provider_info() -> dict:
    return {"provider": "wineapi" if config.WINEAPI_KEY else "simulated", "requests_today": used_today(),
            "daily_limit": config.PRICE_DAILY_LIMIT, "wines_priced": sum(1 for r in list(_cache.values()) if r["price"] is not None),
            "last_error": _state["last_error"]}


# --------------------------------------------------------------------------- public API used by the services
def real_price(w: dict) -> dict | None:
    row = _cache.get(wine_key(w))
    return row if row and row.get("price") is not None else None


def _seed(w: dict) -> int:
    key = f"{w['name']}|{w['producer']}|{w.get('vintage')}"
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


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
    real = real_price(w)
    if real:
        k = real["price"] / out[-1]["price"]
        for pt in out:
            pt["price"] = round(pt["price"] * k, 2)
        out[-1]["price"] = real["price"]
    return out


def current(w: dict) -> dict:
    h = history(w, 12)
    now, then = h[-1]["price"], h[0]["price"]
    real = real_price(w)
    out = {
        "price": now,
        "change_12m": round((now - then) / then * 100, 1) if then else 0.0,
        "currency": "USD",
        "source": SOURCE if real else "simulated",
    }
    if real:
        out["as_of"] = real["checked_at"][:10]
        if real.get("merchant"):
            out["merchant"] = real["merchant"]
        mv = real.get("matched_vintage")
        if mv and w.get("vintage") and mv != w["vintage"]:
            out["note"] = f"price of the {mv} vintage"
    return out


def summary_source(bottles: list[dict]) -> str:
    """SOURCE if every bottle has a real price, "simulated" if none, "mixed" otherwise."""
    n = sum(1 for b in bottles if real_price(b))
    return "simulated" if n == 0 else SOURCE if n == len(bottles) else "mixed"


if __name__ == "__main__":
    # Coverage check with the key in backend/.env:  cd backend && python -m app.market [--recheck]
    # Uses up to PRICE_DAILY_LIMIT requests (about 2 per wine the first time), then prints what was found.
    # --recheck asks again for wines without a price, even if they were checked today.
    import sys
    if not config.WINEAPI_KEY:
        raise SystemExit("WINEAPI_KEY is empty (set it in backend/.env)")
    db.init()
    load()
    print(f"requests used now: {refresh_due(recheck='--recheck' in sys.argv)}  (today: {used_today()} / {config.PRICE_DAILY_LIMIT})")
    if _state["last_error"]:
        print("last error:", _state["last_error"])
    for w in _wanted():
        row = _cache.get(wine_key(w))
        status = "not checked yet" if not row else f"${row['price']:.2f}  ({row.get('merchant') or 'merchant n/a'})" \
            if row["price"] is not None else "found, no price" if row["wineapi_id"] else "not found"
        print(f"  {w['producer']} {w['name']} {w.get('vintage') or 'NV'}: {status}")
