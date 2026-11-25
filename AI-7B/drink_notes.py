"""Young vs mature tasting keywords per aging-table cell -> backend/app/aroma_table.json (keywords only).

For every review with a vintage (all 81k, not only those that state a window), the wine's age at review is
taken as 2019 - vintage (the reviews are from 2017-2020, the review date is not in the data). Relative to
its aging-table cell, a review is
  young   age < the cell's typical start
  mature  age >= typical start + 3
For each cell (and its coarser parents, as in the aging table), the keywords that stand out in one stage
compared with the other (document frequency ratio, smoothed), seen in at least MIN_DF reviews of that stage.
Only descriptor keywords from evidence7b.DESCRIPTORS are kept; no review text.

Usage:  python AI-7B/drink_notes.py      (after drink_table.py)
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import build_pool as bp
import evidence7b as ev7

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))
from app import drinking  # noqa: E402

OUT = HERE.parent / "backend" / "app" / "aroma_table.json"
REVIEW_YEAR = 2019
MIN_DF = 4
MIN_REVIEWS = 15     # reviews per stage for a cell to have notes
TOP = 6


def main() -> int:
    df = defaultdict(lambda: {"young": Counter(), "mature": Counter()})
    n = defaultdict(lambda: {"young": 0, "mature": 0})
    used = 0
    for r in bp.load_reviews():
        if not r["vintage_i"] or not r["color"]:
            continue
        w = {"grape": bp.grape_key(r["variety"]), "color": r["color"], "country": r.get("country", ""),
             "province": r.get("province", ""), "region": r["region"], "vintage": r["vintage_i"]}
        hit = drinking.lookup(w)
        if not hit:
            continue
        age = REVIEW_YEAR - r["vintage_i"]
        stage = "young" if age < hit["from"] else "mature" if age >= hit["from"] + 3 else None
        if not stage:
            continue
        notes = set(ev7.fact_notes(r.get("description", "")))
        used += 1
        for level in drinking.LEVELS:
            key = drinking.cell_key(w, level)
            if key:
                n[key][stage] += 1
                df[key][stage].update(notes)
    table = {}
    for key, c in df.items():
        if min(n[key].values()) < MIN_REVIEWS:
            continue
        cell = {"n_young": n[key]["young"], "n_mature": n[key]["mature"]}
        for stage, other in (("young", "mature"), ("mature", "young")):
            ratio = {d: ((k + 1) / (n[key][stage] + 2)) / ((c[other][d] + 1) / (n[key][other] + 2))
                     for d, k in c[stage].items() if k >= MIN_DF}
            cell[stage] = [d for d, _ in sorted(ratio.items(), key=lambda x: -x[1]) if ratio[d] > 1.2][:TOP]
        if cell["young"] and cell["mature"]:
            table[key] = cell
    # the vocabulary, so the backend can check that an explanation names only keywords from its evidence
    table["_vocab"] = {"notes": sorted(set(ev7.DESCRIPTORS) - ev7.STYLE), "style": sorted(ev7.STYLE),
                       "banned_names": ev7.BANNED_NAMES}
    OUT.write_text(json.dumps(dict(sorted(table.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"{used} reviews with a stage -> {len(table)} cells -> {OUT}")
    for k in ("color|grape=red|nebbiolo", "color|grape|country|province=red|bordeaux-style red blend|france|bordeaux",
              "color|grape|country|province=red|pinot noir|france|burgundy", "color|grape=white|riesling",
              "color|grape|country|province=white|chardonnay|france|burgundy"):
        print(k.split("=", 1)[1], table.get(k))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
