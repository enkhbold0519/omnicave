from app import drinking
from app.catalog import CATALOG

LEOVILLE = next(w for w in CATALOG if w["name"] == "Château Léoville Barton")
BAROLO = next(w for w in CATALOG if w["name"] == "Barolo")


def unknown(**kw):
    """A catalog wine under another name, so the catalog shortcut does not apply."""
    return dict({k: v for k, v in LEOVILLE.items() if k not in ("drink_from", "drink_to")}, name="Test wine", **kw)


def test_catalog_wine_keeps_its_window():
    w = {k: v for k, v in LEOVILLE.items() if k not in ("drink_from", "drink_to")}
    assert drinking.estimate(w) == (LEOVILLE["drink_from"], LEOVILLE["drink_to"])


def test_table_cell_and_blend_mapping():
    hit = drinking.lookup(unknown())
    assert hit and "bordeaux-style red blend" in hit["from_key"]
    start, end = drinking.estimate(unknown())
    assert start == 2016 + hit["from"] and end == start + hit["len"]


def test_no_vintage_or_no_cell_uses_old_rule():
    s, e = drinking.estimate(unknown(vintage=0))
    assert e - s == 10
    assert drinking.estimate(unknown(color="orange", grape="Unknown grape")) == (2018, 2028)


def test_estimate_never_calls_the_model(monkeypatch):
    monkeypatch.setattr(drinking.config, "LLM_PROVIDER", "vllm")
    monkeypatch.setattr(drinking.llm, "stream_chat", lambda *a, **k: (_ for _ in ()).throw(AssertionError("called")))
    drinking.estimate(unknown())


def test_lora_reply_parsing_kept_for_the_record():
    assert drinking.parse('{"from": 2026, "to": null}', 2016) == {"from": 2026, "to": None}
    assert drinking.parse('{"from": 1900, "to": 2045}', 2016) == {"from": None, "to": 2045}
    assert drinking.parse("I think 2030", 2016) == {"from": None, "to": None}


def test_explanation_checker():
    ev = drinking.notes(BAROLO)
    assert ev and ev["young"] and ev["mature"]
    good = f"Ready now; open it by 2040. It shows {ev['young'][0]} now and {ev['mature'][0]} with age."
    assert drinking.check_explanation(good, BAROLO, 2026, ev) == []
    invented = [n for n in ("leather", "tar", "petrol", "cassis") if n not in ev["young"] + ev["mature"]][0]
    assert "notes not in evidence" in drinking.check_explanation(f"Ready now, with {invented}.", BAROLO, 2026, ev)[0]
    assert drinking.check_explanation("Ready now; peak in 2033.", BAROLO, 2026, ev)[0].startswith("other years")
    assert drinking.check_explanation("I would open it now.", BAROLO, 2026, ev) == ["first person"]
    assert drinking.check_explanation("My pick: open it now.", BAROLO, 2026, ev) == ["first person"]
    assert drinking.check_explanation("Ready now, unlike some US Pinot Noir.", BAROLO, 2026, ev) == []
    named = dict(BAROLO, producer="Villa I Cipressi")   # "I" inside a name is not first person
    assert drinking.check_explanation("Villa I Cipressi Barolo is ready now.", named, 2026, ev) == []


def test_explanation_uses_model_only_when_it_passes(monkeypatch):
    w = dict(BAROLO, vintage=2019)   # a key no other test caches
    ev = drinking.notes(w)
    assert drinking.explanation(w, 2026)["source"] == "template"   # mock provider
    monkeypatch.setattr(drinking.config, "LLM_PROVIDER", "vllm")
    seen = {}
    bad = "I love it. It tastes of leather and petrol."
    monkeypatch.setattr(drinking.llm, "stream_chat", lambda msgs, *a, **k: seen.update(k=k, msgs=msgs) or iter([bad]))
    out = drinking.explanation(w, 2026)
    assert out == {"text": drinking.advice(w, 2026), "source": "template"}
    assert seen["k"].get("adapter") is None and seen["k"]["temperature"] == 0
    assert ev["young"][0] in seen["msgs"][1]["content"]
    good = f"Ready now; open it by 2040. It shows {ev['young'][0]} now and {ev['mature'][0]} with age."
    monkeypatch.setattr(drinking.llm, "stream_chat", lambda *a, **k: iter([good]))
    # a failed note is remembered for RETRY_AFTER seconds, so the next request answers at once without the model
    assert drinking.explanation(w, 2026)["source"] == "template"
    monkeypatch.setattr(drinking.time, "monotonic", lambda: 1e12)   # retry window over
    assert drinking.explanation(w, 2026) == {"text": good, "source": "model"}


def test_drinking_note_endpoint(user, call):
    bottle = call("GET", f"/api/cellars/{user['cellar_id']}", token=user["token"])["bottles"][0]
    note = call("GET", f"/api/bottles/{bottle['id']}/drinking-note", token=user["token"])
    assert note["source"] == "template" and note["text"] == bottle["drinking_advice"]
    assert note["window"] == {"from": bottle["wine"]["drink_from"], "to": bottle["wine"]["drink_to"]}


def test_window_boundaries_and_regional_evidence():
    wine = dict(CATALOG[0], drink_from=2026, drink_to=2030)
    for year, expected in [(2025, "holding"), (2026, "Ready"), (2030, "last year"), (2031, "ended")]:
        assert expected in drinking.advice(wine, year)
    assert "cherry" in drinking.advice(wine, 2026)
    assert "cherry" not in drinking.advice(dict(wine, region="Other"), 2026)
