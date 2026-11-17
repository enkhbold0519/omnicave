"""Cap the share of crowd-taste training samples without community evidence (most review-sourced
wines have none, so Jordan would otherwise mostly learn to say "no data").

Usage (pod):  python rebalance.py [--max-share 0.35]   (rewrites data/train.jsonl, keeps a backup)
"""
import argparse
import json
import random
import shutil
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"

ap = argparse.ArgumentParser()
ap.add_argument("--max-share", type=float, default=0.35)
args = ap.parse_args()
path = DATA / "train.jsonl"
shutil.copy(path, DATA / "train.full.jsonl")
rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()]
crowd = [r for r in rows if r["persona"] == "crowd-taste"]
with_ev = [r for r in crowd if r["row"]["crowd"]]
without = [r for r in crowd if not r["row"]["crowd"]]
keep_n = min(len(without), int(args.max_share / (1 - args.max_share) * len(with_ev)))
random.Random(42).shuffle(without)
drop = {r["id"] for r in without[keep_n:]}
kept = [r for r in rows if r["id"] not in drop]
path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in kept), encoding="utf-8")
print(f"crowd-taste: {len(with_ev)} with evidence, {len(without)} without -> kept {keep_n} without")
print("train counts:", dict(Counter(r["persona"] for r in kept)))
