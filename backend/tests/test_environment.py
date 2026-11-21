
"""Environment monitoring, sensor and notification tests."""

import time

from app import config


def test_environment_monitoring_and_alerts(user, call):
    token = user["token"]
    cid = user["cellar_id"]

    original_sensor_interval = config.SENSOR_INTERVAL

    try:
        # Allow the sensor simulator to produce initial readings.
        time.sleep(1.5)

        # --------------------------------------------------
        # 1. Check cellar environment
        # --------------------------------------------------

        environment = call(
            "GET",
            f"/api/cellars/{cid}/environment",
            token=token,
        )

        zone = environment["zones"][0]

        assert zone["latest"]
        assert zone["sensor_online"]

        # --------------------------------------------------
        # 2. Update zone configuration
        # --------------------------------------------------

        call(
            "PATCH",
            f"/api/zones/{zone['id']}",
            {
                "alert_minutes": 0.02,
                "target_temp": 9,
            },
            token=token,
        )

        # Invalid target temperature must be rejected.
        call(
            "PATCH",
            f"/api/zones/{zone['id']}",
            {"target_temp": 50},
            token=token,
            expect=400,
        )

        # --------------------------------------------------
        # 3. Simulate abnormal sensor readings
        # --------------------------------------------------

        call(
            "POST",
            "/api/simulator/sensors",
            {
                "zone_id": zone["id"],
                "action": "spike",
            },
            token=token,
        )

        call(
            "POST",
            "/api/simulator/sensors",
            {
                "zone_id": environment["zones"][1]["id"],
                "action": "disconnect",
            },
            token=token,
        )

        # Wait for the sensor simulator and alert system.
        time.sleep(3)

        config.SENSOR_INTERVAL = 0.5

        # --------------------------------------------------
        # 4. Verify environment notifications
        # --------------------------------------------------

        notifications = call(
            "GET",
            "/api/notifications",
            token=token,
        )

        kinds = {
            notification["kind"]
            for notification in notifications["items"]
        }

        assert "environment" in kinds, notifications

        # --------------------------------------------------
        # 5. Restore normal sensor conditions
        # --------------------------------------------------

        call(
            "POST",
            "/api/simulator/sensors",
            {
                "zone_id": zone["id"],
                "action": "normal",
            },
            token=token,
        )

        # --------------------------------------------------
        # 6. Mark notifications as read
        # --------------------------------------------------

        call(
            "POST",
            "/api/notifications/read",
            {},
            token=token,
        )

        notifications_after = call(
            "GET",
            "/api/notifications",
            token=token,
        )

        assert notifications_after["unread"] == 0

    finally:
        # Restore the original global configuration.
        config.SENSOR_INTERVAL = original_sensor_interval
