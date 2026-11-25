"""The owner's own sommeliers (tasting.py): create, edit, delete, locked built-ins, and one at the table."""
import uuid

from tests.conftest import ADULT


def test_own_sommelier_lifecycle(user, call):
    tok = user["token"]
    builtins = call("GET", "/api/personas", token=tok)
    assert len(builtins) == 4 and all(p["built_in"] for p in builtins)

    call("POST", "/api/personas", {"name": "  "}, token=tok, expect=400)          # a name is required
    mine = call("POST", "/api/personas", {"name": "Clara", "title": "Burgundy purist", "traits": {
        "scoring": "stars", "focus": "old-world", "loves": ["acidity", "nonsense"], "strictness": 9, "tone": "dry"}},
        token=tok)
    assert mine["id"].startswith("u") and mine["built_in"] is False
    t = mine["traits"]
    assert t["scoring"] == "stars" and t["loves"] == ["acidity"] and t["strictness"] == 5   # cleaned and clamped
    assert "5 stars" in mine["philosophy"] and "Old World" in mine["philosophy"]
    assert len(call("GET", "/api/personas", token=tok)) == 5

    renamed = call("PATCH", f"/api/personas/{mine['id']}", {"name": "Clara B.", "traits": t}, token=tok)
    assert renamed["name"] == "Clara B."
    call("PATCH", f"/api/personas/{builtins[0]['id']}", {"name": "Hacked"}, token=tok, expect=403)
    call("DELETE", f"/api/personas/{builtins[0]['id']}", token=tok, expect=403)

    call("DELETE", f"/api/personas/{mine['id']}", token=tok)
    call("DELETE", f"/api/personas/{mine['id']}", token=tok, expect=404)
    assert len(call("GET", "/api/personas", token=tok)) == 4


def test_sommeliers_are_private_per_account(user, call):
    mine = call("POST", "/api/personas", {"name": "Private"}, token=user["token"])
    u = uuid.uuid4().hex[:10]
    other = call("POST", "/api/auth/register", {"username": f"t_{u}", "email": f"t_{u}@example.com",
                                               "password": "password123", **ADULT})["access_token"]
    call("PATCH", f"/api/personas/{mine['id']}", {"name": "Taken"}, token=other, expect=404)
    call("DELETE", f"/api/personas/{mine['id']}", token=other, expect=404)
    assert all(p["id"] != mine["id"] for p in call("GET", "/api/personas", token=other))


def test_own_sommelier_picks_a_bottle_tonight(user, call):
    mine = call("POST", "/api/personas", {"name": "Clara", "traits": {"loves": ["fruit"]}}, token=user["token"])
    events = call("POST", "/api/ai/table", {"topic": {"kind": "question", "intent": "tonight"},
                                            "persona_ids": [mine["id"]]}, token=user["token"], stream=True)
    turns = [e for e in events if e["type"] == "turn"]
    assert [e["persona"] for e in turns] == [mine["id"]] and turns[0]["adapter"] is None   # base model, no LoRA
    picks = [e for e in events if e["type"] == "pick"]
    assert picks and picks[0]["bottle"]["id"]                                              # a bottle from the cellar
    assert events[-1]["type"] == "done"

