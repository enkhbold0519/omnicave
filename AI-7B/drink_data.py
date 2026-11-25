"""Drinking windows stated in the review data -> train/eval sets (runs locally, standard library only).

Source: data/raw/Updated-Wine-Enthusiast-Reviews.arff (81k reviews 2017-2020, OpenML 43600; research/class
use only). Only the years a review states are kept, never review text or reviewer names.

The mirror dropped the dash in year ranges ("Drink 2019-2031" became "Drink 20192031"), so ranges are
parsed as two glued years too. Each row keeps whatever the review states:
  from  first year to drink (None for "drink now ...": the review date is not in the data)
  to    last year (None for "drink from 2025" with no end)
Split by producer (winery), 80/20, so a producer's wines never sit on both sides.

Output: data/drink_train.jsonl, data/drink_eval.jsonl and counts on stdout.
Usage:  python AI-7B/drink_data.py
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import build_pool as bp

HERE = Path(__file__).resolve().parent
OUT = HERE / "data"
Y = r"((?:19|20)\d\d)"
SEP = r"\s*(?:-|–|—|to|through|until|and)?\s*"
LEAD = r"(?:drink|best|enjoy|open|cellar|hold|age)\b[^.]{0,40}?"
QUAL = r"(?:(?:early|mid|late)[- ]?)?"
RANGE = re.compile(LEAD + r"(?:from|after|between|in)?\s*" + QUAL + Y + SEP + QUAL + Y, re.I)
START = re.compile(r"(?:drink|best|enjoy|open)\b[^.]{0,40}?\b(?:from|after|starting(?: in)?|beginning(?: in)?)\s+"
                   + QUAL + Y, re.I)
END = re.compile(r"(?:drink|best|enjoy|hold|age|cellar)\b[^.]{0,40}?\b(?:through|until|till|to|by|before)\s+"
                 + QUAL + Y, re.I)


def parse(text: str, vintage: int) -> dict | None:
    """{"from", "to"} stated in the text, or None. Years must be plausible for the vintage."""
    ok = lambda y: vintage <= y <= vintage + 60
    for m in RANGE.finditer(text):
        a, b = int(m.group(1)), int(m.group(2))
        if ok(a) and ok(b) and a <= b:
            return {"from": a, "to": b}
    s = next((int(m.group(1)) for m in START.finditer(text) if ok(int(m.group(1)))), None)
    e = next((int(m.group(1)) for m in END.finditer(text) if ok(int(m.group(1)))), None)
    if s and e and s > e:
        e = None
    return {"from": s, "to": e} if s or e else None


def split_of(winery: str) -> str:
    return "eval" if int(hashlib.sha1(bp.norm(winery).encode()).hexdigest(), 16) % 5 == 0 else "train"


def main() -> int:
    rows = {"train": [], "eval": []}
    for r in bp.load_reviews():
        if not r["vintage_i"] or not r["color"]:
            continue
        w = parse(r.get("description", ""), r["vintage_i"])
        if not w:
            continue
        row = {"producer": r.get("winery", ""), "title": r.get("title", ""), "grape": bp.grape_key(r["variety"]),
               "variety": r["variety"], "color": r["color"], "country": r.get("country", ""),
               "province": r.get("province", ""), "region": r["region"], "vintage": r["vintage_i"],
               "points": r["points"], "price": r["price"], "from": w["from"], "to": w["to"]}
        rows[split_of(row["producer"])].append(row)
    for name, rs in rows.items():
        with open(OUT / f"drink_{name}.jsonl", "w", encoding="utf-8") as f:
            for row in rs:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        full = [r for r in rs if r["from"] and r["to"]]
        print(f"{name}: {len(rs)} rows, both years {len(full)}, from only {sum(1 for r in rs if r['from'] and not r['to'])}, "
              f"to only {sum(1 for r in rs if r['to'] and not r['from'])}")
    allr = rows["train"] + rows["eval"]
    print("colors", Counter(r["color"] for r in allr).most_common())
    print("countries", Counter(r["country"] for r in allr).most_common(8))
    print("grapes", Counter(r["grape"] for r in allr).most_common(12))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
