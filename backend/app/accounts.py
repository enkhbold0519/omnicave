"""Account rules around sign-up and login: age gate, consents (PIPA), and 6-digit email codes for email
verification, email change and password reset. Emails go out through mailer.py (log-only until SES is set up).

Codes are stored only as hashes, expire after CODE_TTL seconds, allow MAX_ATTEMPTS tries, and a new one can be
requested every RESEND_AFTER seconds. Emails are sent after the database transaction, so a slow mail server
never holds the database lock.
"""
from __future__ import annotations

import hmac
import secrets
from datetime import date

from . import config, db, legal, mailer, security
from .common import ApiError, utc

CODE_TTL = 15 * 60
MAX_ATTEMPTS = 5
RESEND_AFTER = 60

SUBJECTS = {
    "verify": "Your OmniCave verification code",
    "email_change": "Confirm your new OmniCave email address",
    "reset": "Your OmniCave password reset code",
}
LINES = {
    "verify": "Use this code to verify your email address",
    "email_change": "Use this code to confirm your new email address",
    "reset": "Use this code to set a new password",
}


# ---------------------------------------------------------------- age gate and consents
def check_birth_date(value) -> str:
    """Returns the date as YYYY-MM-DD. Korean Youth Protection Act: you may use the service from 1 January of
    the year you turn 19 (so only the birth year counts)."""
    try:
        born = date.fromisoformat(str(value or "").strip())
    except ValueError:
        raise ApiError(400, "Enter your date of birth as YYYY-MM-DD")
    today = date.today()
    if born > today or born.year < 1900:
        raise ApiError(400, "Invalid date of birth")
    if today.year - born.year < config.MIN_AGE:
        raise ApiError(403, f"You must be {config.MIN_AGE} or older to use OmniCave")
    return born.isoformat()


def check_consents(given) -> dict[str, bool]:
    """All required consents must be true; optional ones default to false."""
    given = given if isinstance(given, dict) else {}
    missing = [c["title"] for c in legal.CONSENTS if c["required"] and given.get(c["key"]) is not True]
    if missing:
        raise ApiError(400, "Please accept: " + ", ".join(missing))
    return {c["key"]: given.get(c["key"]) is True for c in legal.CONSENTS}


def record_consents(c, uid: int, decisions: dict[str, bool]) -> None:
    for key, granted in decisions.items():
        c.execute("INSERT INTO consents(user_id,key,granted,version,created_at) VALUES(?,?,?,?,?)",
                  (uid, key, int(granted), legal.POLICY_VERSION, utc()))


def current_consents(c, uid: int) -> dict[str, dict]:
    """The latest decision per consent key."""
    out: dict[str, dict] = {}
    for r in db.rows(c, "SELECT key, granted, version, created_at FROM consents WHERE user_id=? ORDER BY id", (uid,)):
        out[r["key"]] = {"granted": bool(r["granted"]), "version": r["version"], "at": r["created_at"]}
    return out


def update_optional_consents(c, uid: int, given) -> None:
    """Profile: only optional consents can be changed. Withdrawing a required one means deleting the account."""
    if not isinstance(given, dict):
        raise ApiError(400, "consents must be an object")
    for key, value in given.items():
        if key not in legal.OPTIONAL:
            raise ApiError(400, f"'{key}' cannot be changed here; delete the account to withdraw it")
        if not isinstance(value, bool):
            raise ApiError(400, f"'{key}' must be true or false")
    now = current_consents(c, uid)
    record_consents(c, uid, {k: v for k, v in given.items() if now.get(k, {}).get("granted") != v})


# ---------------------------------------------------------------- email codes
def _hash(uid: int, purpose: str, code: str) -> str:
    return security.token_hash(f"{uid}:{purpose}:{code}")


def issue_code(c, uid: int, purpose: str, quiet: bool = False) -> str | None:
    """Creates a new code (replacing older ones of the same purpose) and returns it for send_code.
    Asking again within RESEND_AFTER seconds is refused, or silently ignored when quiet (so the answer does not
    reveal whether an account exists)."""
    last = db.one(c, "SELECT created_at FROM email_codes WHERE user_id=? AND purpose=? ORDER BY id DESC LIMIT 1", (uid, purpose))
    if last and last["created_at"] > utc(-RESEND_AFTER):
        if quiet:
            return None
        raise ApiError(429, "Please wait a minute before asking for another code")
    c.execute("DELETE FROM email_codes WHERE user_id=? AND purpose=?", (uid, purpose))
    code = f"{secrets.randbelow(10 ** 6):06d}"
    c.execute("INSERT INTO email_codes(user_id,purpose,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
              (uid, purpose, _hash(uid, purpose, code), utc(CODE_TTL), utc()))
    return code


def send_code(to: str, purpose: str, code: str | None) -> None:
    """Call after the transaction that issued the code has committed."""
    if not code:
        return
    text = (f"{LINES[purpose]}:\n\n    {code}\n\nThe code expires in {CODE_TTL // 60} minutes. "
            "If you did not ask for it, you can ignore this email.\n\nOmniCave")
    mailer.send(to, SUBJECTS[purpose], text)


def check_code(c, uid: int, purpose: str, code) -> str:
    """'ok' (the code is used up), 'wrong' (one attempt counted) or 'expired'. The caller raises the error
    after the transaction, so the counted attempt is committed."""
    row = db.one(c, "SELECT * FROM email_codes WHERE user_id=? AND purpose=? ORDER BY id DESC LIMIT 1", (uid, purpose))
    if not row or row["expires_at"] < utc() or row["attempts"] >= MAX_ATTEMPTS:
        return "expired"
    if not hmac.compare_digest(row["code_hash"], _hash(uid, purpose, str(code or "").strip())):
        c.execute("UPDATE email_codes SET attempts=attempts+1 WHERE id=?", (row["id"],))
        return "wrong"
    c.execute("DELETE FROM email_codes WHERE id=?", (row["id"],))
    return "ok"


def raise_for(result: str) -> None:
    if result == "expired":
        raise ApiError(400, "This code has expired or was used too many times. Ask for a new one.")
    if result == "wrong":
        raise ApiError(400, "Wrong code")


def _find(c, email_or_username) -> dict | None:
    v = str(email_or_username or "").strip()
    return db.one(c, "SELECT * FROM users WHERE email=? OR username=?", (v.lower(), v))


# ---------------------------------------------------------------- flows (called from services / routes)
def resend_verification(body: dict) -> dict:
    """Always answers ok, so it cannot be used to find out which emails have accounts."""
    with db.tx() as c:
        u = _find(c, body.get("email"))
        code = issue_code(c, u["id"], "verify", quiet=True) if u and not u["email_verified"] else None
    if code:
        send_code(u["email"], "verify", code)
    return {"ok": True}


def verify_email(body: dict) -> int:
    """Checks the sign-up code; returns the user id (the caller logs the user in)."""
    with db.tx() as c:
        u = _find(c, body.get("email"))
        if u and u["email_verified"]:
            # never hand out a session here without a code check
            raise ApiError(400, "This email is already verified. Please log in.")
        result = check_code(c, u["id"], "verify", body.get("code")) if u else "expired"
        if result == "ok":
            c.execute("UPDATE users SET email_verified=1 WHERE id=?", (u["id"],))
    raise_for(result)
    return u["id"]


def forgot_password(body: dict) -> dict:
    with db.tx() as c:
        u = _find(c, body.get("email"))
        code = issue_code(c, u["id"], "reset", quiet=True) if u else None
    if code:
        send_code(u["email"], "reset", code)
    return {"ok": True}


def reset_password(body: dict) -> dict:
    password = str(body.get("password") or "")
    if len(password) < 8:
        raise ApiError(400, "Password must be at least 8 characters")
    with db.tx() as c:
        u = _find(c, body.get("email"))
        result = check_code(c, u["id"], "reset", body.get("code")) if u else "expired"
        if result == "ok":
            # the code proves the address, so it also counts as verified; every session is logged out
            c.execute("UPDATE users SET pw_hash=?, email_verified=1 WHERE id=?", (security.hash_password(password), u["id"]))
            c.execute("DELETE FROM tokens WHERE user_id=?", (u["id"],))
    raise_for(result)
    return {"ok": True}


def confirm_email_change(user: dict, body: dict) -> None:
    with db.tx() as c:
        u = db.one(c, "SELECT * FROM users WHERE id=?", (user["id"],))
        if not u["pending_email"]:
            raise ApiError(400, "There is no email change to confirm")
        result = check_code(c, u["id"], "email_change", body.get("code"))
        if result == "ok":
            if db.one(c, "SELECT 1 FROM users WHERE email=? AND id<>?", (u["pending_email"], u["id"])):
                raise ApiError(409, "Email already in use")
            c.execute("UPDATE users SET email=pending_email, pending_email=NULL, email_verified=1 WHERE id=?", (u["id"],))
    raise_for(result)
