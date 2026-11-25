from app import news_brief as nb

BOTTLES = [
    {"producer": "Domaine Fourrier", "name": "Gevrey-Chambertin", "vintage": 2019, "region": "Burgundy",
     "country": "France", "grape": "Pinot Noir", "drink_from": 2025, "drink_to": 2035, "location": "Rack 1"},
    {"producer": "G.D. Vajra", "name": "Barolo", "vintage": 2018, "region": "Piedmont", "country": "Italy",
     "grape": "Nebbiolo", "drink_from": 2027, "drink_to": 2040, "location": "Rack 2"},
]
NEWS = [
    {"title": "Burgundy growers report a small 2025 harvest", "summary": "Yields down 20% in Pinot Noir.",
     "link": "https://example.com/a", "source": "www.decanter.com"},
    {"title": "Hops prices rise", "summary": "Beer news.", "link": "https://example.com/b", "source": "example.com"},
    {"title": "Piedmont Nebbiolo draws collectors", "summary": "Barolo demand grows.", "link": "https://example.com/c",
     "source": "vinepair.com"},
]
PROFILE = {"regions": [("Piedmont", 3)], "grapes": [], "colors": [], "total": 3}


def test_pick_keeps_cellar_news_with_matching_bottles():
    arts = nb.pick(NEWS, BOTTLES, PROFILE, 2026)
    assert [a["title"] for a in arts] == [NEWS[2]["title"], NEWS[0]["title"]]   # history favourite ranks first
    assert arts[0]["n"] == 1 and arts[0]["bottles"][0]["wine"] == "G.D. Vajra Barolo 2018"
    assert arts[0]["bottles"][0]["status"] == "young"
    assert arts[1]["bottles"][0]["status"] == "ready"
    assert all("Hops" not in a["title"] for a in arts)


def test_check_grounding():
    arts = nb.pick(NEWS, BOTTLES, PROFILE, 2026)
    ok = ("Barolo is drawing collectors [1]; your G.D. Vajra Barolo 2018 is still young until 2027. "
          "Burgundy reports a small 2025 harvest with yields down 20% [2], and your Gevrey-Chambertin 2019 is ready.")
    assert nb.check(ok, arts, 2026) == []
    assert nb.check("Barolo is drawing collectors.", arts, 2026) == ["cites no article"]
    assert "cites a missing article" in nb.check("See [3].", arts, 2026)[0]
    assert nb.check("Prices jumped in 2021 [1].", arts, 2026)[0].startswith("years not in evidence")
    assert nb.check("Yields fell 35% [2].", arts, 2026)[0].startswith("percentages not in evidence")
    assert nb.check("Decanter reports a small harvest [2].", arts, 2026) == ["names a publication or critic"]
    assert nb.check("I would open the Barolo [1].", arts, 2026) == ["first person"]
    assert nb.check("My pick is the Barolo [1].", arts, 2026) == ["first person"]
    assert nb.check("US Pinot Noir news aside, the Barolo is young [1].", arts, 2026) == []


def test_generate_uses_model_only_when_it_passes(monkeypatch):
    assert nb.generate(1, NEWS, BOTTLES, PROFILE, 2026) is None   # mock provider
    monkeypatch.setattr(nb.config, "LLM_PROVIDER", "vllm")
    nb._cache.clear()
    seen = {}
    monkeypatch.setattr(nb.llm, "stream_chat", lambda msgs, *a, **k: seen.update(msgs=msgs, k=k) or iter(["My pick [1]."]))
    assert nb.generate(1, NEWS, BOTTLES, PROFILE, 2026) is None
    assert seen["k"].get("adapter") is None and "your_bottles" in seen["msgs"][1]["content"]
    good = "Barolo is drawing collectors [1]; your G.D. Vajra Barolo 2018 is still young."
    monkeypatch.setattr(nb.llm, "stream_chat", lambda *a, **k: iter([good]))
    out = nb.generate(1, NEWS, BOTTLES, PROFILE, 2026)
    assert out["text"] == good and [r["n"] for r in out["refs"]] == [1, 2]
    monkeypatch.setattr(nb.llm, "stream_chat", lambda *a, **k: (_ for _ in ()).throw(AssertionError("cached")))
    assert nb.generate(1, NEWS, BOTTLES, PROFILE, 2026)["text"] == good
    assert nb.generate(1, [NEWS[1]], BOTTLES, PROFILE, 2026) is None   # no cellar news today


def test_briefing_ai_endpoint_without_llm(user, call):
    out = call("GET", "/api/briefing/ai", token=user["token"])
    assert out["text"] is None and out["refs"] == [] and "news_is_sample" in out
