
import json
import os
import tempfile
import threading
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pytest


# --------------------------------------------------
# 1. Test environment
# --------------------------------------------------

# Give SQLite tests their own temporary database.
_TEST_DIR = tempfile.TemporaryDirectory(prefix="omnicave-tests-")
TEST_DB_PATH = str(Path(_TEST_DIR.name) / "test.db")

os.environ["DB_PATH"] = TEST_DB_PATH
os.environ["SENSOR_INTERVAL"] = "0.5"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["EMAIL_PROVIDER"] = "log"
os.environ["EMAIL_VERIFICATION_REQUIRED"] = "0"
# Never call the real price API from tests, even if backend/.env has a key.
os.environ["WINEAPI_KEY"] = ""

# Ignore DATABASE_URL from backend/.env.
# PostgreSQL is used only when TEST_DATABASE_URL is explicitly set.
test_database_url = os.environ.get("TEST_DATABASE_URL", "")
os.environ["DATABASE_URL"] = test_database_url


# Safety check: PostgreSQL test database must end in _test.
if test_database_url:
    database_name = urlparse(test_database_url).path.lstrip("/")

    if not database_name.endswith("_test"):
        raise RuntimeError(
            "Refusing to run tests: PostgreSQL database name "
            "must end in '_test'."
        )


# Import the application only AFTER setting environment variables.
from app import config, db, mailer, market, simulator  # noqa: E402
from app.devserver import Handler  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402


# Required information for user registration.
ADULT = {
    "birth_date": "1990-05-01",
    "consents": {
        "terms": True,
        "privacy": True,
        "overseas": True,
    },
}


# --------------------------------------------------
# 2. Server fixture
# --------------------------------------------------

@pytest.fixture(scope="session")
def server():
    """Initialize the database and start the test server."""

    # PostgreSQL test database is wiped before initialization.
    if db.IS_PG:
        with db.tx() as connection:
            connection.executescript(
                "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
            )

        print(
            "[test] PostgreSQL:",
            config.DATABASE_URL.split("@")[-1],
        )

    db.init()

    # Start sensor simulator.
    simulator.start()
    market.start()

    # Start development server on an automatically selected port.
    http_server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        Handler,
    )

    server_thread = threading.Thread(
        target=http_server.serve_forever,
        daemon=True,
    )
    server_thread.start()

    base_url = (
        f"http://127.0.0.1:{http_server.server_address[1]}"
    )

    yield base_url

    # Stop the sensor simulator.
    simulator.stop()

    # Shut down the HTTP server.
    http_server.shutdown()
    http_server.server_close()

    # Wait for the HTTP server thread to finish.
    server_thread.join(timeout=5)


# --------------------------------------------------
# 3. HTTP request helper
# --------------------------------------------------

@pytest.fixture
def call(server):
    """Send HTTP requests to the local development server."""

    def _call(
        method,
        path,
        body=None,
        token=None,
        stream=False,
        expect=200,
    ):
        headers = {
            "Content-Type": "application/json",
        }

        if token:
            headers["Authorization"] = f"Bearer {token}"

        request = urllib.request.Request(
            server + path,
            method=method,
            data=(
                json.dumps(body).encode()
                if body is not None
                else None
            ),
            headers=headers,
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=30,
            ) as response:
                raw = response.read().decode()
                status = response.status

        except urllib.error.HTTPError as error:
            raw = error.read().decode()
            status = error.code

        assert status == expect, (
            f"{method} {path} -> {status} {raw[:300]}"
        )

        if stream:
            return [
                json.loads(line[5:])
                for line in raw.split("\n")
                if line.startswith("data:")
            ]

        return json.loads(raw) if raw else None

    return _call


# --------------------------------------------------
# 4. Fresh user fixture
# --------------------------------------------------

@pytest.fixture
def user(call):
    """Register a fresh user for each test."""

    unique_id = uuid.uuid4().hex[:10]

    username = f"testuser_{unique_id}"
    email = f"test_{unique_id}@example.com"

    response = call(
        "POST",
        "/api/auth/register",
        {
            "username": username,
            "email": email,
            "password": "password123",
            **ADULT,
        },
    )

    token = response["access_token"]

    # Get the first cellar belonging to this user.
    cellars = call(
        "GET",
        "/api/cellars",
        token=token,
    )

    assert cellars, "New user should have at least one cellar"

    return {
        "token": token,
        "cellar_id": cellars[0]["id"],
        "username": username,
        "email": email,
    }


# --------------------------------------------------
# 5. Email verification helper
# --------------------------------------------------

@pytest.fixture
def last_code():
    """Get the newest six-digit email code for an address."""

    def _last_code(to):
        message = next(
            message
            for message in reversed(mailer.SENT)
            if message["to"] == to
        )

        return next(
            word
            for word in message["text"].split()
            if word.isdigit() and len(word) == 6
        )

    return _last_code


# --------------------------------------------------
# 6. Registration payload fixture
# --------------------------------------------------

@pytest.fixture
def adult_payload():
    """Return the required adult birth date and consents."""

    return ADULT.copy()
