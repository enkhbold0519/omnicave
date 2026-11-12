"""Password hashing (PBKDF2-SHA256, salted) and opaque bearer tokens."""
import hashlib
import hmac
import secrets

_ITER = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITER)
    return f"pbkdf2_sha256${_ITER}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, it, salt, h = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(dk.hex(), h)
    except ValueError:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    # only the hash is stored, so a leaked DB does not leak live sessions
    return hashlib.sha256(token.encode()).hexdigest()
