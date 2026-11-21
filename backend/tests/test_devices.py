
"""Physical cellar device registration, pairing and telemetry tests."""


def test_device_pairing_telemetry_and_linked_cellars(user, call):
    token = user["token"]
    cid = user["cellar_id"]

    # --------------------------------------------------
    # 1. Register a physical cellar device
    # --------------------------------------------------

    registration = call(
        "POST",
        "/api/devices/register",
        {
            "uid": "WC-TEST-0001",
            "model": "Test cellar",
        },
        token=token,
    )

    assert len(registration["pairing_code"]) == 6

    # --------------------------------------------------
    # 2. Check unpaired device status
    # --------------------------------------------------

    initial_status = call(
        "POST",
        "/api/devices/status",
        {
            "uid": "WC-TEST-0001",
            "device_secret": registration["device_secret"],
        },
        token=token,
    )

    assert initial_status["paired"] is False

    # Invalid pairing code must fail.
    call(
        "POST",
        "/api/devices/pair",
        {
            "code": "000000x",
        },
        token=token,
        expect=404,
    )

    # --------------------------------------------------
    # 3. Pair the physical cellar
    # --------------------------------------------------

    pairing = call(
        "POST",
        "/api/devices/pair",
        {
            "code": registration["pairing_code"],
            "name": "Kitchen",
            "preset": "compact",
        },
        token=token,
    )

    second_cellar_id = pairing["cellar"]["id"]

    # --------------------------------------------------
    # 4. Check paired device status
    # --------------------------------------------------

    paired_status = call(
        "POST",
        "/api/devices/status",
        {
            "uid": "WC-TEST-0001",
            "device_secret": registration["device_secret"],
        },
        token=token,
    )

    assert paired_status["paired"]
    assert paired_status["device_token"].startswith("dev_")

    # Device token must not be exposed through status.
    status_without_token = call(
        "POST",
        "/api/devices/status",
        {
            "uid": "WC-TEST-0001",
            "device_secret": registration["device_secret"],
        },
        token=token,
    )

    assert "device_token" not in status_without_token

    # --------------------------------------------------
    # 5. Device authentication and cellar access
    # --------------------------------------------------

    # Unauthenticated requests must not access the device cellar.
    call(
        "GET",
        "/api/device/cellar",
        expect=401,
    )

    device_token = paired_status["device_token"]

    device_cellar = call(
        "GET",
        "/api/device/cellar",
        token=device_token,
    )

    assert device_cellar["id"] == second_cellar_id
    assert device_cellar["racks"]

    # A device token cannot act as a user.
    call(
        "GET",
        "/api/me",
        token=device_token,
        expect=401,
    )

    # --------------------------------------------------
    # 6. Submit device telemetry
    # --------------------------------------------------

    telemetry = call(
        "POST",
        "/api/device/telemetry",
        {
            "readings": [
                {"y_cm": 70, "temp": 9.1, "hum": 66},
                {"y_cm": 10, "temp": 13.8, "hum": 67},
            ],
        },
        token=device_token,
    )

    assert telemetry["stored"] == 2

    # --------------------------------------------------
    # 7. Submit device vision detections
    # --------------------------------------------------

    shelf = [
        rack for rack in device_cellar["racks"]
        if rack["kind"] == "shelf"
    ][0]

    detections = call(
        "POST",
        "/api/device/vision/detections",
        {
            "detections": [
                {
                    "position": {
                        "x": 10,
                        "y": shelf["y_cm"] + 4,
                        "z": 6,
                    },
                    "confidence": 0.9,
                    "label": {
                        "name": "Barolo",
                        "producer": "G.D. Vajra",
                        "vintage": 2018,
                        "color": "red",
                    },
                },
                {
                    "position": {
                        "x": 20,
                        "y": shelf["y_cm"] + 4,
                        "z": 6,
                    },
                    "confidence": 0.4,
                    "label": None,
                },
            ],
        },
        token=device_token,
    )

    assert len(detections["new"]) == 2
    assert detections["new"][1]["note"].startswith(
        "Label unreadable"
    )

    # --------------------------------------------------
    # 8. Verify device is listed under user account
    # --------------------------------------------------

    devices = call(
        "GET",
        "/api/devices",
        token=token,
    )

    assert devices[0]["online"]
    assert devices[0]["cellar_id"] == second_cellar_id

    assert any(
        cellar["id"] == second_cellar_id
        and cellar["devices"]
        for cellar in call(
            "GET",
            "/api/cellars",
            token=token,
        )
    )

    # --------------------------------------------------
    # 9. Confirm all device-generated detections
    # --------------------------------------------------

    for detection in call(
        "GET",
        "/api/detections",
        token=token,
    ):
        wine = detection["payload"]["wine"]

        call(
            "POST",
            f"/api/detections/{detection['id']}/confirm",
            {
                "wine": {
                    "name": wine.get("name") or "Mystery",
                    "producer": wine.get("producer") or "Unknown",
                },
            },
            token=token,
        )

    # --------------------------------------------------
    # 10. Move a bottle between linked cellars
    # --------------------------------------------------

    second_cellar = call(
        "GET",
        f"/api/cellars/{second_cellar_id}",
        token=token,
    )

    bottle = second_cellar["bottles"][0]

    moved = call(
        "PATCH",
        f"/api/bottles/{bottle['id']}",
        {"cellar_id": cid},
        token=token,
    )

    assert moved["cellar_id"] == cid

    # --------------------------------------------------
    # 11. Delete device and verify token invalidation
    # --------------------------------------------------

    call(
        "DELETE",
        f"/api/devices/{devices[0]['id']}",
        token=token,
    )

    call(
        "GET",
        "/api/device/cellar",
        token=device_token,
        expect=401,
    )
