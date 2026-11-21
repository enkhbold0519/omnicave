
"""Account, legal consent, authentication security and privacy tests."""

from datetime import date

from app import config


def test_multi_cellar_cross_search_and_user_isolation(user, call):
    """Verify cross-cellar search and isolation between different users."""

    token = user["token"]
    cid = user["cellar_id"]

    # Create a second cellar and add a bottle.
    second = call(
        "POST",
        "/api/cellars",
        {"name": "Office", "preset": "compact"},
        token=token,
    )

    call(
        "POST",
        "/api/bottles",
        {
            "cellar_id": second["id"],
            "wine": {
                "name": "Office Red",
                "producer": "Zed",
                "color": "red",
            },
        },
        token=token,
    )

    # Create a third cellar and add a bottle.
    third = call(
        "POST",
        "/api/cellars",
        {"name": "Third Cellar", "preset": "compact"},
        token=token,
    )

    call(
        "POST",
        "/api/bottles",
        {
            "cellar_id": third["id"],
            "wine": {
                "name": "Third Cellar Red",
                "producer": "Test Producer",
                "color": "red",
            },
        },
        token=token,
    )

    results = call(
        "GET",
        "/api/bottles?q=",
        token=token,
    )

    assert {cid, second["id"], third["id"]} <= {
        bottle["cellar_id"] for bottle in results
    }

    # Register another user without demo data.
    other = call(
        "POST",
        "/api/auth/register",
        {
            "username": "mallory",
            "email": "m@example.com",
            "password": "password123",
            "seed_demo": False,
            **{
                "birth_date": "1990-05-01",
                "consents": {
                    "terms": True,
                    "privacy": True,
                    "overseas": True,
                },
            },
        },
    )

    other_token = other["access_token"]

    # The second user cannot access the first user's cellar.
    call(
        "GET",
        f"/api/cellars/{cid}",
        token=other_token,
        expect=404,
    )

    # The second user's bottle search must be empty.
    assert call(
        "GET",
        "/api/bottles?q=",
        token=other_token,
    ) == []


def test_gdpr_export_logout_and_account_deletion(user, call):
    """Verify data export, logout, account deletion and login rejection."""

    token = user["token"]
    username = user["username"]

    # Export account data.
    exported = call(
        "GET",
        "/api/me/export",
        token=token,
    )

    assert exported["bottles"]
    assert exported["user"]["username"] == username

    # Logout invalidates the current session.
    call(
        "POST",
        "/api/auth/logout",
        token=token,
    )

    call(
        "GET",
        "/api/me",
        token=token,
        expect=401,
    )

    # Log in again before deleting the account.
    login = call(
        "POST",
        "/api/auth/login",
        {
            "username": username,
            "password": "password123",
        },
    )

    deletion_token = login["access_token"]

    call(
        "DELETE",
        "/api/me",
        token=deletion_token,
    )

    # Deleted accounts cannot log in.
    call(
        "POST",
        "/api/auth/login",
        {
            "username": username,
            "password": "password123",
        },
        expect=401,
    )


def test_account_registration_consents_and_password_security(
    call,
    last_code,
):
    """Verify legal requirements, email verification and password security."""

    adult = {
        "birth_date": "1990-05-01",
        "consents": {
            "terms": True,
            "privacy": True,
            "overseas": True,
        },
    }

    base = {
        "username": "dora",
        "email": "d@example.com",
        "password": "password123",
        "seed_demo": False,
    }

    # --------------------------------------------------
    # 1. Legal documents and required consents
    # --------------------------------------------------

    legal = call(
        "GET",
        "/api/legal",
    )

    assert {
        consent["key"]
        for consent in legal["consents"]
        if consent["required"]
    } == {"terms", "privacy", "overseas"}

    assert "Privacy Policy" in legal["documents"]["privacy"]

    # --------------------------------------------------
    # 2. Age verification
    # --------------------------------------------------

    call(
        "POST",
        "/api/auth/register",
        base | adult | {
            "birth_date": f"{date.today().year - 18}-01-01",
        },
        expect=403,
    )

    call(
        "POST",
        "/api/auth/register",
        base | adult | {
            "birth_date": "not a date",
        },
        expect=400,
    )

    # --------------------------------------------------
    # 3. Required consent validation
    # --------------------------------------------------

    call(
        "POST",
        "/api/auth/register",
        base | {
            "birth_date": "1990-05-01",
            "consents": {
                "terms": True,
                "privacy": True,
            },
        },
        expect=400,
    )

    # --------------------------------------------------
    # 4. Register with all required and optional consents
    # --------------------------------------------------

    registration = call(
        "POST",
        "/api/auth/register",
        base | {
            "birth_date": f"{date.today().year - 19}-12-31",
            "consents": adult["consents"] | {
                "marketing": True,
            },
        },
    )

    token = registration["access_token"]
    account = registration["user"]

    assert account["email_verified"]
    assert account["consents"] == {
        "terms": True,
        "privacy": True,
        "overseas": True,
        "marketing": True,
    }

    # --------------------------------------------------
    # 5. Optional and required consent changes
    # --------------------------------------------------

    updated = call(
        "PATCH",
        "/api/me",
        {"consents": {"marketing": False}},
        token=token,
    )

    assert updated["consents"]["marketing"] is False

    call(
        "PATCH",
        "/api/me",
        {"consents": {"privacy": False}},
        token=token,
        expect=400,
    )

    exported = call(
        "GET",
        "/api/me/export",
        token=token,
    )

    assert [
        consent["key"]
        for consent in exported["consents"]
    ].count("marketing") == 2, "consent history kept"

    # --------------------------------------------------
    # 6. Password change and session invalidation
    # --------------------------------------------------

    other_session = call(
        "POST",
        "/api/auth/login",
        {
            "username": "dora",
            "password": "password123",
        },
    )["access_token"]

    call(
        "PATCH",
        "/api/me",
        {"password": "newpassword1"},
        token=token,
        expect=403,
    )

    call(
        "PATCH",
        "/api/me",
        {
            "password": "newpassword1",
            "current_password": "wrong",
        },
        token=token,
        expect=403,
    )

    call(
        "PATCH",
        "/api/me",
        {
            "password": "newpassword1",
            "current_password": "password123",
        },
        token=token,
    )

    # The current session remains valid.
    call(
        "GET",
        "/api/me",
        token=token,
    )

    # The other session must be invalidated.
    call(
        "GET",
        "/api/me",
        token=other_session,
        expect=401,
    )

    # --------------------------------------------------
    # 7. Email verification required
    # --------------------------------------------------

    original_email_verification_required = (
        config.EMAIL_VERIFICATION_REQUIRED
    )

    config.EMAIL_VERIFICATION_REQUIRED = True

    try:
        registration = call(
            "POST",
            "/api/auth/register",
            {
                "username": "erin",
                "email": "e@example.com",
                "password": "password123",
                **adult,
            },
        )

        assert registration == {
            "verification_required": True,
            "email": "e@example.com",
        }

        call(
            "POST",
            "/api/auth/login",
            {
                "username": "erin",
                "password": "password123",
            },
            expect=403,
        )

        # Resending within a minute is quietly ignored.
        call(
            "POST",
            "/api/auth/resend-code",
            {"email": "e@example.com"},
            expect=200,
        )

        # An incorrect verification code is rejected.
        call(
            "POST",
            "/api/auth/verify-email",
            {
                "email": "e@example.com",
                "code": "000000",
            },
            expect=400,
        )

        # The correct emailed code verifies the account.
        verified = call(
            "POST",
            "/api/auth/verify-email",
            {
                "email": "e@example.com",
                "code": last_code("e@example.com"),
            },
        )

        assert verified["access_token"]
        assert verified["user"]["email_verified"]

        # The code cannot be reused.
        call(
            "POST",
            "/api/auth/verify-email",
            {
                "email": "e@example.com",
                "code": "000000",
            },
            expect=400,
        )

        call(
            "POST",
            "/api/auth/login",
            {
                "username": "erin",
                "password": "password123",
            },
        )

        # --------------------------------------------------
        # 8. Email address change
        # --------------------------------------------------

        erin_token = verified["access_token"]

        call(
            "PATCH",
            "/api/me",
            {"email": "e2@example.com"},
            token=erin_token,
            expect=403,
        )

        pending = call(
            "PATCH",
            "/api/me",
            {
                "email": "e2@example.com",
                "current_password": "password123",
            },
            token=erin_token,
        )

        assert pending["email"] == "e@example.com"
        assert pending["pending_email"] == "e2@example.com"

        confirmed = call(
            "POST",
            "/api/me/email/verify",
            {"code": last_code("e2@example.com")},
            token=erin_token,
        )

        assert confirmed["email"] == "e2@example.com"
        assert confirmed["pending_email"] is None

        # --------------------------------------------------
        # 9. Too many incorrect verification codes
        # --------------------------------------------------

        call(
            "POST",
            "/api/auth/register",
            {
                "username": "fay",
                "email": "f@example.com",
                "password": "password123",
                **adult,
            },
        )

        for _ in range(5):
            call(
                "POST",
                "/api/auth/verify-email",
                {
                    "email": "f@example.com",
                    "code": "999999",
                },
                expect=400,
            )

        # Even the correct code must now be rejected.
        call(
            "POST",
            "/api/auth/verify-email",
            {
                "email": "f@example.com",
                "code": last_code("f@example.com"),
            },
            expect=400,
        )

    finally:
        config.EMAIL_VERIFICATION_REQUIRED = (
            original_email_verification_required
        )

    # --------------------------------------------------
    # 10. Forgot password and password reset
    # --------------------------------------------------

    assert call(
        "POST",
        "/api/auth/forgot-password",
        {"email": "nobody@example.com"},
    ) == {"ok": True}

    call(
        "POST",
        "/api/auth/forgot-password",
        {"email": "d@example.com"},
    )

    call(
        "POST",
        "/api/auth/reset-password",
        {
            "email": "d@example.com",
            "code": "123456",
            "password": "resetpass1",
        },
        expect=400,
    )

    call(
        "POST",
        "/api/auth/reset-password",
        {
            "email": "d@example.com",
            "code": last_code("d@example.com"),
            "password": "resetpass1",
        },
    )

    # Password reset invalidates existing sessions.
    call(
        "GET",
        "/api/me",
        token=token,
        expect=401,
    )

    # The previous password no longer works.
    call(
        "POST",
        "/api/auth/login",
        {
            "username": "dora",
            "password": "newpassword1",
        },
        expect=401,
    )

    # The new password works with the email address.
    call(
        "POST",
        "/api/auth/login",
        {
            "username": "d@example.com",
            "password": "resetpass1",
        },
    )
