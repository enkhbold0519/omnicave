
"""Cellar, bottle, rack and inventory API tests."""


def test_cellar_inventory_and_rack_management(user, call):
    token = user["token"]
    cid = user["cellar_id"]

    # --------------------------------------------------
    # 1. Initial cellar structure and seeded inventory
    # --------------------------------------------------

    cellars = call("GET", "/api/cellars", token=token)
    cellar = call("GET", f"/api/cellars/{cid}", token=token)

    n0 = len(cellar["bottles"])

    assert n0 >= 20
    assert len(cellar["zones"]) == 2
    assert len(cellar["racks"]) == 9

    over = [
        rack for rack in cellar["racks"]
        if rack["over_capacity"]
    ]

    assert over
    assert over[0]["count"] == 12
    assert over[0]["capacity"] == 10

    assert any(
        bottle["level"] == 1
        for bottle in cellar["bottles"]
    ), "stacked bottles seeded"

    assert all(
        0 <= bottle["x"] <= cellar["width_cm"]
        and 0 <= bottle["y"] <= cellar["height_cm"]
        for bottle in cellar["bottles"]
    )

    # --------------------------------------------------
    # 2. Search across all bottle fields
    # --------------------------------------------------

    assert call(
        "GET", "/api/bottles?q=Pinot&field=grape", token=token
    )

    assert call(
        "GET", "/api/bottles?q=2019&field=vintage", token=token
    )

    assert call(
        "GET", "/api/bottles?q=Burgundy", token=token
    )

    # --------------------------------------------------
    # 3. Storage recommendation and manual bottle addition
    # --------------------------------------------------

    recommendation = call(
        "POST",
        "/api/recommendations/storage",
        {"cellar_id": cid, "color": "sparkling"},
        token=token,
    )

    assert recommendation["zone_match"]
    assert "Upper" in recommendation["zone"]

    bottle = call(
        "POST",
        "/api/bottles",
        {
            "cellar_id": cid,
            "wine": {
                "name": "Test Cuvée",
                "producer": "Test",
                "color": "sparkling",
                "vintage": 2020,
            },
        },
        token=token,
    )

    assert bottle["serial"].startswith("CC-")
    assert bottle["zone"]["name"].startswith("Upper")

    # --------------------------------------------------
    # 4. Free placement by point
    # --------------------------------------------------

    rack = next(
        (
            rack for rack in cellar["racks"]
            if rack["kind"] == "shelf" and rack["count"] == 0
        ),
        cellar["racks"][1],
    )

    free_bottle = call(
        "POST",
        "/api/bottles",
        {
            "cellar_id": cid,
            "wine": {
                "name": "Free Red",
                "producer": "Free",
                "color": "red",
            },
            "position": {
                "x": 33,
                "y": rack["y_cm"] + 9,
                "z": 7,
            },
        },
        token=token,
    )

    assert free_bottle["rack_id"] == rack["id"]
    assert free_bottle["level"] == 0
    assert abs(
        free_bottle["y"] - (rack["y_cm"] + 3.8)
    ) < 0.2

    # --------------------------------------------------
    # 5. Rack placement with stacking level
    # --------------------------------------------------

    stacked_bottle = call(
        "POST",
        "/api/bottles",
        {
            "cellar_id": cid,
            "wine": {
                "name": "Stack Red",
                "producer": "Free",
                "color": "red",
            },
            "position": {
                "rack_id": rack["id"],
                "x": 36.8,
                "z": 7,
                "level": 1,
            },
        },
        token=token,
    )

    assert stacked_bottle["level"] == 1

    # Invalid placement outside cellar boundaries.
    call(
        "POST",
        "/api/bottles",
        {
            "cellar_id": cid,
            "wine": {"name": "X", "producer": "Y"},
            "position": {"x": 999, "y": 10},
        },
        token=token,
        expect=400,
    )

    # --------------------------------------------------
    # 6. Update and move bottles
    # --------------------------------------------------

    updated_bottle = call(
        "PATCH",
        f"/api/bottles/{bottle['id']}",
        {"wine": {"vintage": 2018, "base_price": 99}},
        token=token,
    )

    assert updated_bottle["wine"]["vintage"] == 2018

    moved_bottle = call(
        "PATCH",
        f"/api/bottles/{free_bottle['id']}",
        {
            "position": {
                "x": 60,
                "y": rack["y_cm"] + 4,
                "z": 7,
            }
        },
        token=token,
    )

    assert moved_bottle["x"] == 60

    # Removing the base bottle drops the stacked one (gravity).
    call(
        "DELETE",
        f"/api/bottles/{free_bottle['id']}?reason=removed",
        token=token,
    )

    # --------------------------------------------------
    # 7. Rack removal with bottles
    # --------------------------------------------------

    full_rack = over[0]

    # Removing a populated rack without specifying bottle handling fails.
    call(
        "PATCH",
        f"/api/racks/{full_rack['id']}",
        {"present": False},
        token=token,
        expect=409,
    )

    # Remove the rack with its bottles.
    removed_rack = call(
        "PATCH",
        f"/api/racks/{full_rack['id']}",
        {
            "present": False,
            "bottles": "with_rack",
        },
        token=token,
    )

    current_cellar = call(
        "GET",
        f"/api/cellars/{cid}",
        token=token,
    )

    assert len(removed_rack["bottles"]) == len(
        current_cellar["bottles"]
    )
    assert removed_rack["bottles_out_with_racks"] == 12

    # Put the rack back.
    restored_rack = call(
        "PATCH",
        f"/api/racks/{full_rack['id']}",
        {"present": True},
        token=token,
    )

    assert restored_rack["bottles_out_with_racks"] == 0

    # --------------------------------------------------
    # 8. Relocate bottles when removing a rack
    # --------------------------------------------------

    small_rack = next(
        rack for rack in restored_rack["racks"]
        if rack["kind"] == "shelf"
        and 0 < rack["count"] <= 3
        and not rack["over_capacity"]
    )

    relocated = call(
        "PATCH",
        f"/api/racks/{small_rack['id']}",
        {
            "present": False,
            "bottles": "relocate",
        },
        token=token,
    )

    assert not any(
        bottle["rack_id"] == small_rack["id"]
        for bottle in relocated["bottles"]
    )

    # Put the rack back.
    call(
        "PATCH",
        f"/api/racks/{small_rack['id']}",
        {"present": True},
        token=token,
    )

    # --------------------------------------------------
    # 9. Create, update and delete racks
    # --------------------------------------------------

    new_rack_response = call(
        "POST",
        f"/api/cellars/{cid}/racks",
        {"y_cm": 147, "capacity": 6},
        token=token,
    )

    new_rack = max(
        new_rack_response["racks"],
        key=lambda rack: rack["y_cm"],
    )

    call(
        "PATCH",
        f"/api/racks/{new_rack['id']}",
        {"y_cm": 145, "name": "Top tray"},
        token=token,
    )

    call(
        "DELETE",
        f"/api/racks/{new_rack['id']}",
        token=token,
    )

    # The floor rack cannot be removed.
    call(
        "PATCH",
        f"/api/racks/{new_rack_response['racks'][0]['id']}",
        {"present": False},
        token=token,
        expect=400,
    )
