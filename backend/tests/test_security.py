
"""Unit tests for password hashing and bearer-token utilities."""

from app.security import (
    hash_password,
    verify_password,
    new_token,
    token_hash,
)


def test_hash_password_does_not_store_plaintext():
    password = "SecurePassword123!"

    stored = hash_password(password)

    assert stored != password
    assert stored.startswith("pbkdf2_sha256$")


def test_hash_password_uses_unique_salts():
    password = "SecurePassword123!"

    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash != second_hash


def test_verify_password_accepts_correct_password():
    password = "SecurePassword123!"
    stored = hash_password(password)

    assert verify_password(password, stored) is True


def test_verify_password_rejects_incorrect_password():
    stored = hash_password("SecurePassword123!")

    assert verify_password("WrongPassword123!", stored) is False


def test_verify_password_rejects_malformed_hash():
    assert verify_password("password", "invalid-hash") is False


def test_new_token_generates_unique_tokens():
    first_token = new_token()
    second_token = new_token()

    assert first_token != second_token
    assert len(first_token) > 0
    assert len(second_token) > 0


def test_token_hash_is_deterministic():
    token = "example-bearer-token"

    first_hash = token_hash(token)
    second_hash = token_hash(token)

    assert first_hash == second_hash


def test_token_hash_does_not_expose_original_token():
    token = "example-bearer-token"

    hashed = token_hash(token)

    assert hashed != token
    assert len(hashed) == 64
