
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
