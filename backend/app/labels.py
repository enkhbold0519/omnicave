"""Label photo -> wine details (the entry-camera step: a bottle is read once, when it goes in).

LABEL_PROVIDER=mock         (default) a random catalog wine with simulated reading errors.
LABEL_PROVIDER=rekognition  Amazon Rekognition DetectText reads the label text; it is matched against the wine
                            catalog (same fuzzy word match as market.py) and a year on the label sets the vintage.
                            Credentials come from the EC2 instance role (rekognition:DetectText); needs boto3.

With an LLM configured (LLM_PROVIDER=vllm or openai), the model first turns the OCR lines into fields
(label_llm.py): it fixes OCR slips, drops boilerplate and founding years, and reads wines that are not in the
catalog, which then go to the review queue with the fields it read. Without an LLM, or when the model gives no
usable answer, the plain word match on the raw text is used.

read() returns {"label": dict | None, "confidence": 0..1, "note": str | None}. A None label means "not
recognised": the bottle still goes to the review queue and the owner fills in the details.
"""
from __future__ import annotations

import base64
import random
import re

from . import config, label_llm, llm, market
from .catalog import CATALOG
from .common import ApiError

FIELDS = ("name", "producer", "region", "country", "grape", "color", "vintage")


def provider() -> str:
    return "rekognition" if config.LABEL_PROVIDER == "rekognition" else "mock"


def _mock(rnd: random.Random) -> dict:
    truth = rnd.choice(CATALOG)
    label = {k: truth.get(k) for k in FIELDS}
    if rnd.random() < 0.25 and truth.get("vintage"):
        label["vintage"] = truth["vintage"] + rnd.choice([-1, 1])
        return {"label": label, "confidence": rnd.uniform(0.62, 0.8), "note": "Vintage digits partly hidden — please verify"}
    return {"label": label, "confidence": rnd.uniform(0.86, 0.98), "note": None}


def detect_text(image: bytes) -> list[str]:
    """Text lines Rekognition reads with at least 80 % confidence."""
    import boto3  # only needed with LABEL_PROVIDER=rekognition
    res = boto3.client("rekognition", region_name=config.AWS_REGION).detect_text(Image={"Bytes": image})
    return [t["DetectedText"] for t in res["TextDetections"] if t["Type"] == "LINE" and t["Confidence"] >= 80]


def read_fields(lines: list[str]) -> dict | None:
    """The LLM's reading of the label (label_llm.FIELDS), or None without an LLM or a usable answer."""
    if config.LLM_PROVIDER == "mock" or not lines:
        return None
    reply = "".join(llm.stream_chat(label_llm.messages(lines), fallback="", max_tokens=200, temperature=0))
    fields = label_llm.parse(reply)
    return fields if fields and (fields["producer"] or fields["name"]) else None


def match_fields(fields: dict) -> dict:
    """Catalog wine for the fields the LLM read; a wine outside the catalog keeps those fields for review."""
    text = " ".join(str(fields.get(k) or "") for k in ("producer", "name", "region"))
    best = max(CATALOG, key=lambda w: market._match_score(w, {"name": text}))
    score = market._match_score(best, {"name": text})
    if score >= market.MIN_MATCH:
        label = {k: best.get(k) for k in FIELDS}
        label["vintage"] = fields["vintage"]
        note = "Vintage not found on the label — please check" if fields["vintage"] is None and best.get("vintage") else None
        return {"label": label, "confidence": round(0.5 + 0.5 * score, 2), "note": note}
    label = {k: fields.get(k) for k in FIELDS}
    if label["color"] not in ("red", "white", "sparkling", "rose"):   # the cellar has no "dessert" colour
        label["color"] = None
    return {"label": label, "confidence": 0.6,
            "note": "Not in our catalog — read from the label by the AI, please check the details"}


def match(lines: list[str]) -> dict:
    """Best catalog wine for the label text; None label if no wine's producer+name words are on the label."""
    text = " ".join(lines)
    best = max(CATALOG, key=lambda w: market._match_score(w, {"name": text}))
    score = market._match_score(best, {"name": text})
    if score < market.MIN_MATCH:
        return {"label": None, "confidence": 0.3,
                "note": f"Not in our catalog — please fill in the details. Label text: {text[:120] or 'none'}"}
    label = {k: best.get(k) for k in FIELDS}
    years = re.findall(r"\b(19[5-9]\d|20[0-4]\d)\b", text)
    note = None
    if years:
        label["vintage"] = int(years[0])
    elif label.get("vintage"):
        note = "Vintage not found on the label — please check"
    return {"label": label, "confidence": round(0.5 + 0.5 * score, 2), "note": note}


def read(image_b64: str) -> dict:
    try:
        image = base64.b64decode(image_b64)
    except ValueError as e:
        raise ApiError(400, "image_b64 is not valid base64") from e
    if provider() == "mock":
        return _mock(random.Random())
    if len(image) > 5 * 1024 * 1024:
        raise ApiError(413, "Photo is larger than 5 MB")
    try:
        lines = detect_text(image)
    except Exception as e:  # no credentials, network, invalid image, ...
        print(f"[labels] Rekognition failed: {e}", flush=True)
        raise ApiError(502, "The label could not be read. Try again or add the bottle manually.") from e
    fields = read_fields(lines)
    return match_fields(fields) if fields else match(lines)
