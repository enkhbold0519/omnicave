
"""Market briefing, summary and bottle price history tests."""


def test_market_briefing_and_price_history(user, call):
    token = user["token"]
    cid = user["cellar_id"]

    # --------------------------------------------------
    # 1. Market briefing
    # --------------------------------------------------

    briefing = call(
        "GET",
        "/api/briefing",
        token=token,
    )

    assert briefing["insights"]
    assert briefing["news"]

    # --------------------------------------------------
    # 2. Market summary
    # --------------------------------------------------

    market = call(
        "GET",
        "/api/market/summary",
        token=token,
    )

    assert market["total"] > 0
    assert len(market["history"]) == 25

    # --------------------------------------------------
    # 3. Bottle price history
    # --------------------------------------------------

    cellar = call(
        "GET",
        f"/api/cellars/{cid}",
        token=token,
    )

    bottle_id = cellar["bottles"][0]["id"]

    price_history = call(
        "GET",
        f"/api/bottles/{bottle_id}/price-history",
        token=token,
    )

    assert len(price_history["history"]) == 25


# --------------------------------------------------
# Real prices (WineAPI.io), with the API faked
# --------------------------------------------------

import urllib.error  # noqa: E402

import pytest  # noqa: E402

from app import config, db, market  # noqa: E402

WINE_A = {"name": "Gevrey-Chambertin", "producer": "Domaine Fourrier", "vintage": 2019, "base_price": 140}
WINE_B = {"name": "Unknown Cuvée", "producer": "Nobody Estate", "vintage": 2020, "base_price": 30}


@pytest.fixture
def fake_api(server, monkeypatch):
    """Fake WineAPI: knows WINE_A (EUR + USD prices), not WINE_B. Records every request."""
    calls = []

    def fake_get(path, params=None):
        calls.append(path)
        if path == "/wines/search":
            if "Fourrier" in params["q"]:
                return {"results": [
                    {"id": "id-2018", "name": "Gevrey-Chambertin", "winery": "Domaine Fourrier", "vintage": 2018, "confidence": 0.9},
                    {"id": "id-2019", "name": "Gevrey Chambertin", "winery": "Dom. Fourrier", "vintage": 2019, "confidence": 0.8},
                    {"id": "other", "name": "Chablis", "winery": "Someone Else", "vintage": 2019, "confidence": 0.95},
                ]}
            return {"results": [{"id": "x", "name": "Barolo", "winery": "Other", "vintage": 2020}]}
        if path == "/wines/id-2019":
            return {"id": "id-2019", "prices": [{"price": "100.00", "currency": "EUR", "merchantName": "Shop EU"},
                                                {"price": "120", "currency": "USD", "merchantName": "Shop US"},
                                                {"price": "9", "currency": "XYZ"}]}
        raise AssertionError(f"unexpected request {path}")

    monkeypatch.setattr(config, "WINEAPI_KEY", "test-key")
    monkeypatch.setattr(market, "_get", fake_get)
    monkeypatch.setattr(market, "_wanted", lambda: [WINE_A, WINE_B])
    market._cache.clear()
    market._state.update(paused_until=None, last_error=None)
    yield calls
    market._cache.clear()
    with db.tx() as c:
        c.execute("DELETE FROM market_prices")


def test_match_prefers_same_vintage_and_rejects_other_wines():
    results = [{"id": "a", "name": "Gevrey-Chambertin", "winery": "Domaine Fourrier", "vintage": 2018},
               {"id": "b", "name": "Gevrey Chambertin", "winery": "Fourrier", "vintage": 2019},
               {"id": "c", "name": "Barolo", "winery": "Other", "vintage": 2019}]
    assert market.best_match(WINE_A, results)["id"] == "b"
    assert market.best_match(WINE_A, results[2:]) is None


def test_usd_price_median_and_unknown_currency():
    price, merchant = market.usd_price([{"price": "100", "currency": "EUR", "merchantName": "A"},
                                        {"price": "120", "currency": "usd"}, {"price": "5", "currency": "XYZ"},
                                        {"price": "n/a", "currency": "USD"}])
    assert price == 114.0 and merchant == "A"
    assert market.usd_price([]) is None


def test_detail_price_falls_back_to_price_range():
    assert market.detail_price({"prices": [], "priceRange": {"min": 40, "max": 60, "currency": "EUR"}}) == (54.0, "price range")
    assert market.detail_price({"prices": [], "priceRange": None}) is None
    assert market.detail_price({"prices": [{"price": 30, "currency": "USD"}]}) == (30.0, None)


def test_refresh_once_a_day_and_real_price_shown(fake_api):
    assert market.current(WINE_A)["source"] == "simulated"

    used = market.refresh_due()
    assert used == 3                      # A: search + prices, B: search only (no match)
    assert fake_api == ["/wines/search", "/wines/id-2019", "/wines/search"]

    cur = market.current(WINE_A)
    assert cur["source"] == market.SOURCE and cur["price"] == 114.0 and cur["currency"] == "USD"
    assert market.history(WINE_A, 24)[-1]["price"] == 114.0
    assert market.current(WINE_B)["source"] == "simulated"
    assert market.summary_source([WINE_A]) == market.SOURCE
    assert market.summary_source([WINE_A, WINE_B]) == "mixed"

    # same day: nothing is due, no request is made
    assert market.refresh_due() == 0 and len(fake_api) == 3
    assert market.used_today() == 3

    # survives a restart: the cache is reloaded from the database
    market._cache.clear()
    market.load()
    assert market.current(WINE_A)["price"] == 114.0


def test_daily_budget_and_rate_limit(fake_api, monkeypatch):
    assert market.refresh_due(limit=2) == 2         # only A fits (needs 2), B waits for budget
    assert market.real_price(WINE_B) is None and market.wine_key(WINE_B) not in market._cache

    def limited(path, params=None):
        raise market.RateLimited()
    monkeypatch.setattr(market, "_get", limited)
    assert market.refresh_due() == 0
    assert market._state["paused_until"] is not None
    assert market.current(WINE_A)["price"] == 114.0  # old price kept


def test_health_reports_price_provider(call):
    info = call("GET", "/api/health")["prices"]
    assert info["provider"] == "simulated" and info["daily_limit"] == config.PRICE_DAILY_LIMIT
