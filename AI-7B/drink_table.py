"""Aging table from the train split -> backend/app/aging_table.json (aggregated years only, no review text).

For every cell (color, grape, country, province, region) and its coarser parents: the median number of
years after the vintage that the reviews say to start ("from") and to stop ("to") drinking, and the median
window length ("len", only reviews that state both years), with the row counts.
A cell needs MIN_N rows for an offset; otherwise lookups fall back to the next coarser level.

Usage:  python AI-7B/drink_table.py      (after drink_data.py)
"""
from __future__ import annotations

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))
from app.drinking import LEVELS, cell_key  # noqa: E402

OUT = HERE.parent / "backend" / "app" / "aging_table.json"
MIN_N = 5


def main() -> int:
    rows = [json.loads(l) for l in (HERE / "data" / "drink_train.jsonl").read_text(encoding="utf-8").splitlines()]
    acc = defaultdict(lambda: {"from": [], "to": [], "len": []})
    for r in rows:
        for level in LEVELS:
            key = cell_key(r, level)
            if key is None:
                continue
            if r["from"]:
                acc[key]["from"].append(r["from"] - r["vintage"])
            if r["to"]:
                acc[key]["to"].append(r["to"] - r["vintage"])
            if r["from"] and r["to"]:   # window length only from reviews that state both years (see drinking.py)
                acc[key]["len"].append(r["to"] - r["from"])
    table = {}
    for key, v in acc.items():
        cell = {}
        for side in ("from", "to", "len"):
            if len(v[side]) >= MIN_N:
                cell[side] = round(statistics.median(v[side]))
                cell[f"n_{side}"] = len(v[side])
        if cell:
            table[key] = cell
    OUT.write_text(json.dumps(dict(sorted(table.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"{len(rows)} train rows -> {len(table)} cells -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
