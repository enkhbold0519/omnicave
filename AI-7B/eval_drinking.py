"""Drinking-window estimates vs the windows reviews state, on the held-out producers (data/drink_eval.jsonl).

Methods (more are added with --preds, e.g. model outputs from drink_llm.py):
  rule   the old default: vintage + 2 .. vintage + 12
  table  backend/app/drinking.py with the aging table built from the train split

Metrics (a review may state only a start or only an end, so each uses the rows that have it):
  start MAE / end MAE   years off
  start within 2y / end within 3y
  status 2026           ready / young / past-peak agreement, rows with both years
Also a sanity check on the 20 catalog wines (hand-entered windows, not used to build anything).

  python AI-7B/eval_drinking.py [--preds name=path.jsonl ...]
A preds file has one {"i": row index, "from": year, "to": year} per line (missing rows fall back to rule).
"""
import argparse
import json
from pathlib import Path
from statistics import mean
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))
from app import drinking  # noqa: E402
from app.catalog import CATALOG  # noqa: E402

YEAR = 2026


def status(a, b, year=YEAR):
    return "young" if year < a else "past-peak" if year > b else "ready"


def rule(w):
    return (w["vintage"] + 2, w["vintage"] + 12)


def report(title, rows, methods):
    print(f"\n{title}")
    print("| method | n start | start MAE | start ±2y | n end | end MAE | end ±3y | n both | status 2026 |")
    print("|---|---|---|---|---|---|---|---|---|")
    for m in methods:
        st = [r for r in rows if r["from"]]
        en = [r for r in rows if r["to"]]
        bo = [r for r in rows if r["from"] and r["to"]]
        smae = mean(abs(r[m][0] - r["from"]) for r in st) if st else 0
        emae = mean(abs(r[m][1] - r["to"]) for r in en) if en else 0
        s2 = 100 * sum(abs(r[m][0] - r["from"]) <= 2 for r in st) / max(1, len(st))
        e3 = 100 * sum(abs(r[m][1] - r["to"]) <= 3 for r in en) / max(1, len(en))
        sm = 100 * sum(status(*r[m]) == status(r["from"], r["to"]) for r in bo) / max(1, len(bo))
        print(f"| {m} | {len(st)} | {smae:.2f} | {s2:.1f}% | {len(en)} | {emae:.2f} | {e3:.1f}% | {len(bo)} | {sm:.1f}% |")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preds", nargs="*", default=[], help="name=path.jsonl")
    ap.add_argument("--split", default="eval")
    args = ap.parse_args()
    rows = [json.loads(l) for l in (HERE / "data" / f"drink_{args.split}.jsonl").read_text(encoding="utf-8").splitlines()]
    methods = ["rule", "table"]
    for i, r in enumerate(rows):
        r["rule"] = rule(r)
        r["table"] = drinking.estimate(r, catalog=[])
    for spec in args.preds:
        name, path = spec.split("=", 1)
        preds = {p["i"]: p for p in map(json.loads, Path(path).read_text(encoding="utf-8").splitlines())}
        for i, r in enumerate(rows):
            p = preds.get(i)
            r[name] = (p["from"], p["to"]) if p and p.get("from") and p.get("to") else r["rule"]
        print(f"{name}: {len(preds)} predictions, {sum(1 for i in range(len(rows)) if not (preds.get(i) or {}).get('from'))} fell back to rule")
        methods.append(name)
    hits = sum(1 for r in rows if drinking.lookup(r))
    print(f"{args.split}: {len(rows)} wines; aging table has a cell for {hits} ({100 * hits / len(rows):.1f}%)")
    report(f"Held-out producers ({args.split})", rows, methods)
    for color in ("red", "white"):
        report(f"  {color} only", [r for r in rows if r["color"] == color], methods)

    cat = [dict(w, **{"from": w["drink_from"], "to": w["drink_to"]}) for w in CATALOG if w["vintage"]]
    for r in cat:
        r["rule"] = rule(r)
        inputs = {k: v for k, v in r.items() if k not in ("drink_from", "drink_to", "from", "to")}
        r["table"] = drinking.estimate(inputs, catalog=[])
    report("Catalog sanity check (18 vintage wines, hand-entered windows)", cat, ["rule", "table"])


if __name__ == "__main__":
    main()
