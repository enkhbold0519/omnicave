
"""Authentication and basic API tests."""

def test_health_check(call):
    response = call("GET", "/api/health")
    assert response["status"] == "ok"


def test_registration_rejects_invalid_details(call):
    call(
        "POST",
        "/api/auth/register",
        {
            "username": "x",
            "email": "bad",
            "password": "1",
        },
        expect=400,
    )


def test_duplicate_registration_returns_conflict(call, user, adult_payload):
    call(
        "POST",
        "/api/auth/register",
        {
            "username": user["username"],
            "email": user["email"],
            "password": "password123",
            **adult_payload,
        },
        expect=409,
    )


def test_profile_update(user, call):
    response = call(
        "PATCH",
        "/api/me",
        {"display_name": "Charlie", "briefing_time": "07:30"},
        token=user["token"],
    )
    assert response["briefing_time"] == "07:30"


def test_login_and_logout(user, call):
    token = user["token"]

    # The authenticated session should be accessible.
    call("GET", "/api/me", token=token)

    # Logout invalidates the current session.
    call("POST", "/api/auth/logout", token=token)
    call("GET", "/api/me", token=token, expect=401)

    # Logging in creates a new valid session.
    response = call(
        "POST",
        "/api/auth/login",
        {
            "username": user["username"],
            "password": "password123",
        },
    )

    assert response["access_token"]
    call("GET", "/api/me", token=response["access_token"])
