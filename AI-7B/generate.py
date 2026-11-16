"""Teacher + verifier data generation for the 7B persona LoRAs (runs on the GPU pod).

For every wine in data/pool.jsonl, debates are generated turn by turn in persona order. The
prompt each persona sees is exactly the backend's (prompts.critic_messages) plus its evidence
block. The teacher (Qwen2.5-32B-Instruct-AWQ via vLLM) writes N candidates per turn from a
persona card. verify7b.check() keeps the first candidate that passes; that reply then goes
into the transcript for the next persona. A turn with no passing candidate ends that debate.

Output: data/train.jsonl, data/eval.jsonl (train.py format) and data/gen_report.json.
Usage (pod):  python generate.py [--debates-train 3] [--debates-eval 1] [--n 4]
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
import prompts  # noqa: E402

import evidence7b as ev7  # noqa: E402
import verify7b  # noqa: E402

DATA = HERE / "data"
YEAR = 2026
TEACHER = "Qwen/Qwen2.5-32B-Instruct-AWQ"

CARDS = {
    "power-critic": (
        "Victor Hale: confident, lavish, rewards power, ripeness, concentration and polish. Openly loves French "
        "wine (Bordeaux, Rhone) and may say so as personal taste. MUST give his score as a two-point range in "
        "exactly this form: '93-95 points' (high number at most 3 above the low one). If the evidence has a "
        "published score, keep the middle of the range within 4 points of it."),
    "fruit-purist": (
        "Livia Moretti: analytical, judges fruit quality against acidity and tannin, prefers soft ripe wines, "
        "skeptical of hard tannins and heavy oak. Openly favours Italian wine and may say so as personal taste. "
        "MUST give her fruit quality index in exactly this form: 'FQI 1.6' (one decimal, between 0.6 and 2.2). "
        "Never give a points score."),
    "value-critic": (
        "Marcus Reed: practical buying-guide editor. MUST give one single score and a value grade in exactly this "
        "form: '91 points and a value grade B+' (grade A to D, optional + or -). If the evidence has a published "
        "score, stay within 3 points of it. Judge value only from the evidence (price, value percentile, peer "
        "group). Never use a points range."),
    "crowd-taste": (
        "Jordan Reyes: friendly voice of everyday drinkers. Uses only the community evidence. If the evidence has "
        "a community comparison, MUST say it in this form: 'top 15% of 188' using the exact numbers, and use the "
        "evidence's own wording for the relation (above / below / about the same as its peers). If there is no "
        "comparison, say the crowd data cannot rank it and do not compare it with other regions. Never give "
        "points, FQI or value grades, never state drinking dates, never name tasting notes."),
}
RULES = (
    "Write ONLY this critic's next turn in the debate, in English, 2 or 3 sentences, no lists, no headings. "
    "Use only facts from the retrieved evidence for scores, prices, drinking dates and tasting notes; if the "
    "evidence lacks something, say it is not available instead of inventing it. Mention only descriptors that "
    "appear in the evidence. Do not quote other critics' numbers or scales; react to them by name only. "
    "Never name real critics, magazines, websites or reviewers. Do not mention the owner context unless it "
    "matters for a recommendation.")


def owner_ctx(rng: random.Random) -> str:
    prefs = rng.choice([{}, {}, {"style": "bold reds"}, {"style": "fresh whites"}, {"budget": "under 60 USD"},
                        {"note": "likes older vintages"}, {"occasion": "dinner parties"}])
    total = rng.choice([0, 0, 4, 9, 18, 35])
    if total == 0:
        return prompts.owner_context(prefs, 0, [], [], [])
    colors = rng.sample(["red", "white", "sparkling", "rose"], 2)
    regions = rng.sample(["Bordeaux", "Burgundy", "Tuscany", "Piedmont", "Rioja", "California", "Champagne"], 2)
    grapes = rng.sample(["Pinot Noir", "Cabernet Sauvignon", "Nebbiolo", "Sangiovese", "Chardonnay", "Syrah"], 2)
    c = sorted([rng.randint(1, total) for _ in range(2)], reverse=True)
    return prompts.owner_context(prefs, total, list(zip(colors, c)), list(zip(regions, c)), list(zip(grapes, c)))


def teacher_messages(p: dict, train_msgs: list[dict]) -> list[dict]:
    return [{"role": "system", "content": f"{CARDS[p['id']]}\n\n{RULES}\n\nThe critic's own brief:\n"
                                          f"{train_msgs[0]['content']}"},
            {"role": "user", "content": train_msgs[1]['content'] + f"\n\nNow write {p['name']}'s turn."}]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debates-train", type=int, default=3)
    ap.add_argument("--debates-eval", type=int, default=1)
    ap.add_argument("--n", type=int, default=4, help="teacher candidates per turn")
    ap.add_argument("--limit", type=int, default=0, help="only the first N wines (smoke test)")
    args = ap.parse_args()

    from vllm import LLM, SamplingParams
    personas = prompts.load_personas()
    pool = [json.loads(l) for l in (DATA / "pool.jsonl").read_text(encoding="utf-8").splitlines()]
    if args.limit:
        pool = pool[:args.limit]
    rng = random.Random(42)
    debates = []
    for row in pool:
        for d in range(args.debates_train if row["split"] == "train" else args.debates_eval):
            debates.append({"row": row, "uctx": owner_ctx(rng), "transcript": [], "alive": True, "d": d, "turns": []})
    print(f"{len(pool)} wines -> {len(debates)} debates x {len(personas)} turns; teacher {TEACHER}, n={args.n}")

    llm = LLM(model=TEACHER, max_model_len=4096, gpu_memory_utilization=0.90, enable_prefix_caching=True)
    sp = SamplingParams(n=args.n, temperature=0.9, top_p=0.95, max_tokens=220, seed=7)
    stats = defaultdict(Counter)
    t0 = time.perf_counter()
    for p in personas:
        live = [db for db in debates if db["alive"]]
        batch = []
        for db in live:
            backend = prompts.critic_messages(p, db["row"]["label"], db["uctx"], db["transcript"])
            train_msgs = prompts.add_evidence(backend, ev7.block_for(p["id"], db["row"]))
            db["_cur"] = (backend, train_msgs)
            batch.append(teacher_messages(p, train_msgs))
        outs = llm.chat(batch, sp, use_tqdm=False)
        for db, out in zip(live, outs):
            chosen = None
            for cand in out.outputs:
                text = cand.text.strip().strip('"')
                ok, failed = verify7b.passes(text, p["id"], db["row"], YEAR, prompt=db["_cur"][1][1]["content"])
                stats[p["id"]]["candidates"] += 1
                if ok:
                    chosen = text
                    break
                for f in failed:
                    stats[p["id"]][f"fail:{f}"] += 1
            if chosen is None:
                db["alive"] = False
                stats[p["id"]]["dead_turns"] += 1
                continue
            stats[p["id"]]["kept"] += 1
            backend, train_msgs = db.pop("_cur")
            db["turns"].append({"persona": p["id"], "adapter": p["lora_adapter"], "backend_messages": backend,
                                "messages": train_msgs + [{"role": "assistant", "content": chosen}]})
            db["transcript"].append(prompts.transcript_line(p, chosen))
        print(f"{p['id']:13s} kept {stats[p['id']]['kept']}/{len(live)} turns "
              f"({time.perf_counter() - t0:.0f}s)", flush=True)

    counts = Counter()
    for split in ("train", "eval"):
        with open(DATA / f"{split}.jsonl", "w", encoding="utf-8") as fh:
            i = 0
            for db in debates:
                if db["row"]["split"] != split:
                    continue
                for t in db["turns"]:
                    rec = {"id": f"{split}-{i:05d}", "split": split, "wine_id": db["row"]["id"], "wine": db["row"]["label"],
                           "year": YEAR, "row": {k: db["row"][k] for k in ("wine", "critic", "crowd", "label")}} | t
                    fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    counts[f"{split}/{t['persona']}"] += 1
                    i += 1
    report = {"teacher": TEACHER, "n": args.n, "seconds": round(time.perf_counter() - t0), "counts": dict(counts),
              "per_persona": {k: dict(v) for k, v in stats.items()}}
    (DATA / "gen_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
