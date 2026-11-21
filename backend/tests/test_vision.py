
"""Vision scanning, detection and reconciliation API tests."""


def test_vision_scan_and_detection_workflow(user, call):
    token = user["token"]
    cid = user["cellar_id"]

    # --------------------------------------------------
    # 1. Record initial cellar state
    # --------------------------------------------------

    before = len(
        call("GET", f"/api/cellars/{cid}", token=token)["bottles"]
    )

    positions_before = {
        bottle["id"]: (
            bottle["x"],
            bottle["y"],
            bottle["z"],
        )
        for bottle in call(
            "GET", f"/api/cellars/{cid}", token=token
        )["bottles"]
    }

    # --------------------------------------------------
    # 2. Repeated scans without changes
    # --------------------------------------------------

    for _ in range(8):
        scan = call(
            "POST",
            f"/api/cellars/{cid}/vision/scan",
            {"event": "none"},
            token=token,
        )

        assert scan["unchanged"] + scan["occluded"] == before
        assert not scan["removed"]
        assert not scan["new"]

    positions_after = {
        bottle["id"]: (
            bottle["x"],
            bottle["y"],
            bottle["z"],
        )
        for bottle in call(
            "GET", f"/api/cellars/{cid}", token=token
        )["bottles"]
    }

    assert positions_before == positions_after

    # --------------------------------------------------
    # 3. Detect and confirm a newly inserted bottle
    # --------------------------------------------------

    scan = call(
        "POST",
        f"/api/cellars/{cid}/vision/scan",
        {"event": "insert"},
        token=token,
    )

    assert len(scan["new"]) == 1

    detection = call(
        "GET",
        "/api/detections",
        token=token,
    )[0]

    confirmed = call(
        "POST",
        f"/api/detections/{detection['id']}/confirm",
        {"wine": {"vintage": 2019}},
        token=token,
    )

    assert confirmed["bottle"]["source"] == "vision"
    assert confirmed["bottle"]["wine"]["vintage"] == 2019

    # Confirming the same detection again must fail.
    call(
        "POST",
        f"/api/detections/{detection['id']}/confirm",
        {},
        token=token,
        expect=404,
    )

    # --------------------------------------------------
    # 4. Detect and reject a stacked bottle
    # --------------------------------------------------

    scan = call(
        "POST",
        f"/api/cellars/{cid}/vision/scan",
        {"event": "stack"},
        token=token,
    )

    assert scan["new"]
    assert scan["new"][0]["level"] == 1

    call(
        "POST",
        f"/api/detections/{scan['new'][0]['detection_id']}/reject",
        token=token,
    )

    # --------------------------------------------------
    # 5. Detect a moved bottle
    # --------------------------------------------------

    scan = call(
        "POST",
        f"/api/cellars/{cid}/vision/scan",
        {"event": "move"},
        token=token,
    )

    assert len(scan["moved"]) == 1
    assert not scan["new"]

    # --------------------------------------------------
    # 6. Detect a removed bottle
    # --------------------------------------------------

    # The simulator may randomly select a bottle that is already
    # occluded. Retry until it selects a visible bottle.
    for _ in range(20):
        scan = call(
            "POST",
            f"/api/cellars/{cid}/vision/scan",
            {"event": "remove"},
            token=token,
        )

        if scan["removed"]:
            break

    assert len(scan["removed"]) == 1

    # --------------------------------------------------
    # 7. Image labelling
    # --------------------------------------------------

    labelled = call(
        "POST",
        f"/api/cellars/{cid}/vision/label",
        {"image_b64": "aGVsbG8="},
        token=token,
    )

    assert len(labelled["new"]) == 1
    assert labelled["new"][0]["wine"].get("name")

    # --------------------------------------------------
    # 8. Reject all remaining detections
    # --------------------------------------------------

    for detection in call(
        "GET",
        "/api/detections",
        token=token,
    ):
        call(
            "POST",
            f"/api/detections/{detection['id']}/reject",
            token=token,
        )
