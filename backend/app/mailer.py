"""Outgoing email (verification and password-reset codes).

EMAIL_PROVIDER=log  (default) nothing is sent; the message is printed to the server log. For development and
                    until Amazon SES is set up.
EMAIL_PROVIDER=ses  sent through Amazon SES's SMTP interface with the standard library (no extra package).
                    Needs SMTP_HOST (e.g. email-smtp.ap-northeast-2.amazonaws.com), SMTP_USER, SMTP_PASSWORD
                    (SES SMTP credentials, not AWS access keys) and EMAIL_FROM (a verified SES identity).
"""
from __future__ import annotations

import smtplib
from collections import deque
from email.message import EmailMessage

from . import config

# the last messages in log mode, so the tests (and a developer) can read the codes
SENT: deque[dict] = deque(maxlen=20)


def send(to: str, subject: str, text: str) -> bool:
    """Returns False if sending failed; the caller decides whether that matters."""
    if config.EMAIL_PROVIDER != "ses":
        SENT.append({"to": to, "subject": subject, "text": text})
        print(f"[mail] (log only) to={to} subject={subject!r}\n{text}", flush=True)
        return True
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = config.EMAIL_FROM, to, subject
    msg.set_content(text)
    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(config.SMTP_USER, config.SMTP_PASSWORD)
            s.send_message(msg)
        return True
    except Exception as e:  # network, credentials, unverified sender, SES sandbox recipient, ...
        print(f"[mail] sending to {to} failed: {e}", flush=True)
        return False


def provider_info() -> dict:
    return {"provider": "ses" if config.EMAIL_PROVIDER == "ses" else "log",
            "verification_required": config.EMAIL_VERIFICATION_REQUIRED}
