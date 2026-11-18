"""Consents and policy texts (PIPA). Required and optional consents are kept separate, as PIPA demands.
Changing a text: edit app/policies/*.md and bump POLICY_VERSION."""
from __future__ import annotations

from pathlib import Path

POLICY_VERSION = "2026-11-18"
_DIR = Path(__file__).resolve().parent / "policies"

CONSENTS = [
    {"key": "terms", "required": True, "title": "Terms of Service", "document": "terms",
     "summary": "I agree to the OmniCave Terms of Service."},
    {"key": "privacy", "required": True, "title": "Collection and use of personal information", "document": "privacy",
     "summary": "Username, email, date of birth, and my cellar, drinking and taste data are used to run the service "
                "and personalise the sommeliers. Kept until I delete my account."},
    {"key": "overseas", "required": True, "title": "Processing outside Korea", "document": "privacy",
     "summary": "My data may be processed by hosting and AI providers outside Korea (AWS Sydney, Vercel and "
                "RunPod in the US), as listed in section 3 of the Privacy Policy."},
    {"key": "marketing", "required": False, "title": "News and product emails", "document": None,
     "summary": "Send me wine news and OmniCave updates by email. I can withdraw this at any time."},
]
REQUIRED = [c["key"] for c in CONSENTS if c["required"]]
OPTIONAL = [c["key"] for c in CONSENTS if not c["required"]]


def document(name: str) -> str:
    return (_DIR / f"{name}.md").read_text(encoding="utf-8")


def info() -> dict:
    """What a sign-up screen needs: the consent list and the full texts."""
    return {"version": POLICY_VERSION, "consents": CONSENTS,
            "documents": {n: document(n) for n in ("terms", "privacy")}}
