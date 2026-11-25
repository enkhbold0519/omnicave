"""Label text -> wine fields with the LLM (standard library only, so AI-7B/label_eval.py can load this file as is).

Rekognition reads the label as text lines, with OCR slips (0/O, 1/l, rn/m, lost accents), lines split in two and
lines that are not the wine (bottle size, alcohol, sulfites, "estate bottled", founding years). The model turns them
into fields and fixes the slips; labels.py then matches the fields against the catalog.

messages(lines) -> chat messages; parse(reply) -> dict with FIELDS (None where the label does not say).
"""
from __future__ import annotations

import json
import re

FIELDS = ("producer", "name", "vintage", "region", "country", "color", "grape")
COLORS = ("red", "white", "rose", "sparkling", "dessert")

SYSTEM = (
    "You read wine labels. You get the text lines an OCR engine found on one label, in no fixed order. "
    "OCR makes mistakes: 0 for O, 1 or I for l, rn for m, c for e, 5 for S, lost accents, and long lines split in two. "
    "Many lines are not about the wine itself: bottle size, alcohol, sulfites, bottling notes, importers, founding years.\n"
    "Return one JSON object with these keys:\n"
    '  "producer": the winery or estate, with OCR mistakes fixed and normal capitalisation\n'
    '  "name": the wine\'s own name or cuvee, without the producer, vintage or region; if the label only names the '
    'appellation or grape, use that\n'
    '  "vintage": the harvest year as an integer, or null if no harvest year is printed (a founding year is not a vintage)\n'
    '  "region": the region or appellation\n'
    '  "country": the country in English\n'
    '  "color": one of "red", "white", "rose", "sparkling", "dessert"; infer it from the name, region and grape if not printed\n'
    '  "grape": the main grape if printed or clear from the appellation, else null\n'
    "Use only what the lines say plus general wine knowledge to fix spelling. Never invent a vintage. "
    "Reply with the JSON object only."
)

EXAMPLE_LINES = ["CHATEAU LANGOA", "8ARTON", "Saint-Julien", "APPELLATION SAINT-JULIEN CONTROLEE",
                 "2O16", "MIS EN BOUTEILLE AU CHATEAU", "750 ml", "13,5% vol", "Product of France"]
EXAMPLE_REPLY = {"producer": "Chateau Langoa Barton", "name": "Saint-Julien", "vintage": 2016,
                 "region": "Saint-Julien", "country": "France", "color": "red", "grape": "Cabernet Sauvignon"}


def _user(lines: list[str]) -> str:
    return "OCR lines:\n" + "\n".join(f"- {l}" for l in lines)


def messages(lines: list[str]) -> list[dict]:
    return [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": _user(EXAMPLE_LINES)},
            {"role": "assistant", "content": json.dumps(EXAMPLE_REPLY)},
            {"role": "user", "content": _user(lines)}]


def _text(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("null", "none", "unknown", "n/a") else None


def parse(reply: str) -> dict | None:
    """The first JSON object in the reply, cleaned; None if there is none."""
    m = re.search(r"\{.*\}", reply or "", re.S)
    if not m:
        return None
    try:
        raw = json.loads(m.group(0))
    except ValueError:
        return None
    if not isinstance(raw, dict):
        return None
    out = {k: _text(raw.get(k)) for k in FIELDS}
    year = re.fullmatch(r"(19[0-9]{2}|20[0-4][0-9])", out["vintage"] or "")
    out["vintage"] = int(year.group(1)) if year else None
    color = (out["color"] or "").lower().replace("rosé", "rose")
    out["color"] = color if color in COLORS else None
    return out


if __name__ == "__main__":   # self-check of the parser
    assert parse('```json\n{"producer": "A", "name": "B", "vintage": "2015", "color": "Rosé"}\n```') == \
        {"producer": "A", "name": "B", "vintage": 2015, "region": None, "country": None, "color": "rose", "grape": None}
    assert parse('{"vintage": "1887?", "color": "orange", "producer": "null"}')["vintage"] is None
    assert parse("no json here") is None
    assert len(messages(["X"])) == 4
    print("label_llm self-check OK")
