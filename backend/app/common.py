"""Helpers shared by all service modules."""
from datetime import datetime, timedelta, timezone

from . import db


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def utc(delta_seconds: float = 0) -> str:
    """UTC timestamp in sqlite's 'YYYY-MM-DD HH:MM:SS' format (string-comparable)."""
    t = datetime.now(timezone.utc) + timedelta(seconds=delta_seconds)
    return t.strftime("%Y-%m-%d %H:%M:%S")


def notify(c, uid: int, kind: str, level: str, message: str, dedupe_key: str | None = None,
           within_minutes: float = 15, push: bool = True) -> bool:
    if dedupe_key and db.one(
        c, "SELECT 1 FROM notifications WHERE user_id=? AND dedupe_key=? AND created_at > ?",
        (uid, dedupe_key, utc(-within_minutes * 60)),
    ):
        return False
    c.execute(
        "INSERT INTO notifications(user_id,kind,level,message,dedupe_key,push,created_at) VALUES(?,?,?,?,?,?,?)",
        (uid, kind, level, message, dedupe_key, 1 if push else 0, utc()),
    )
    return True
