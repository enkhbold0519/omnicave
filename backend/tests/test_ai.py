
"""AI recommendations, streaming, dialogue and persona tests."""

import json

from app import config


def test_ai_recommendations_and_dialogue(user, call):
    token = user["token"]
    cid = user["cellar_id"]

    # --------------------------------------------------
    # 1. Recommendation windows
    # --------------------------------------------------

    windows = call(
        "GET",
        "/api/recommendations/windows",
        token=token,
    )

    assert windows["ready"]

    # --------------------------------------------------
    # 2. AI meal pairing (mock streaming)
    # --------------------------------------------------

    events = call(
        "POST",
        "/api/ai/pairing/meal",
        {"meal": "소고기 스테이크"},
        token=token,
        stream=True,
    )

    assert events[0]["type"] == "items"
    assert events[0]["items"][0]["wine"]["color"] == "red"
    assert events[-1]["type"] == "done"

    # --------------------------------------------------
    # 3. AI wine pairing
    # --------------------------------------------------

    cellar = call(
        "GET",
        f"/api/cellars/{cid}",
        token=token,
    )

    bottle_id = cellar["bottles"][0]["id"]

    events = call(
        "POST",
        "/api/ai/pairing/wine",
        {"bottle_id": bottle_id},
        token=token,
        stream=True,
    )

    assert any(
        event["type"] == "delta"
        for event in events
    )

    # --------------------------------------------------
    # 4. AI wine curation
    # --------------------------------------------------

    events = call(
        "POST",
        "/api/ai/curate",
        {
            "budget": 100,
            "flavor": "light",
            "theme": "birthday party",
        },
        token=token,
        stream=True,
    )

    assert all(
        item["market"]["price"] <= 100
        for item in events[0]["items"]
    )

    # --------------------------------------------------
    # 5. Personal recommendations
    # --------------------------------------------------

    events = call(
        "POST",
        "/api/ai/personal",
        {},
        token=token,
        stream=True,
    )

    assert events[0]["profile"]["total"] >= 8

    # --------------------------------------------------
    # 6. AI assistant chat
    # --------------------------------------------------

    events = call(
        "POST",
        "/api/ai/ask",
        {"query": "오늘 마실 와인?"},
        token=token,
        stream=True,
    )

    assert events[-1]["type"] == "done"

    # Empty queries must be rejected.
    call(
        "POST",
        "/api/ai/ask",
        {"query": ""},
        token=token,
        expect=400,
    )

    # --------------------------------------------------
    # 7. Multi-persona AI dialogue
    # --------------------------------------------------

    events = call(
        "POST",
        "/api/ai/dialogue",
        {"bottle_id": bottle_id},
        token=token,
        stream=True,
    )

    turns = [
        event for event in events
        if event["type"] == "turn"
    ]

    personas = json.loads(
        config.PERSONAS_PATH.read_text(encoding="utf-8")
    )

    assert len(turns) == len(personas)
    assert events[0]["type"] == "meta"

    # --------------------------------------------------
    # 8. AI tasting table
    # --------------------------------------------------

    events = call(
        "POST",
        "/api/ai/table",
        {
            "topic": {
                "kind": "wine",
                "bottle_id": bottle_id,
            },
        },
        token=token,
        stream=True,
    )

    assert len([
        event for event in events
        if event["type"] == "turn"
    ]) == len(personas)

    assert events[-1]["type"] == "done"

    # --------------------------------------------------
    # 9. Verify critic LoRA persona compatibility
    # --------------------------------------------------

    trained_personas_path = (
        config.BASE_DIR.parent
        / "AI-7B"
        / "personas.json"
    )

    if trained_personas_path.exists():
        trained_personas = json.loads(
            trained_personas_path.read_text(encoding="utf-8")
        )

        current_personas = {
            persona["id"]: persona
            for persona in personas
        }

        for trained in trained_personas:
            assert all(
                current_personas[trained["id"]][key] == trained[key]
                for key in (
                    "name",
                    "title",
                    "philosophy",
                    "lora_adapter",
                )
            ), trained["id"]
