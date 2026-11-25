"""Drinking-window explanations (RAG, no training): Qwen base writes the note, check_explanation() verifies it.

Cases: 120 held-out wines (data/drink_eval.jsonl, window from the aging table) + the catalog wines that have
keyword evidence (their own windows). Year 2026. Prompt and checks: backend/app/drinking.py
(explain_messages, check_explanation).

  python drink_explain.py --model Qwen/Qwen2.5-7B-Instruct --tag base      (on the pod, vLLM on :8000)
Writes eval/explain_<tag>.jsonl and prints the pass rate, the failure reasons and a few examples.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import drink_llm as dl

HERE = Path(__file__).resolve().parent
YEAR = 2026


def cases() -> list[dict]:
    rng = random.Random(7)
    out = []
    ev = dl.rows("eval")
    for r in rng.sample(ev, len(ev)):
        w = dl.as_wine(r)
        hit, ev_notes = dl.dk.lookup(w), dl.dk.notes(w)
        if not (hit and ev_notes):
            continue
        w["drink_from"], w["drink_to"] = dl.dk.combine(w["vintage"], hit, {})
        out.append({"source": "eval", "wine": w, "notes": ev_notes})
        if len(out) == 120:
            break
    for w in dl.dk.CATALOG:
        ev_notes = dl.dk.notes(w)
        if w["vintage"] and ev_notes:
            out.append({"source": "catalog", "wine": dict(w), "notes": ev_notes})
    return out


def ask(base_url: str, model: str, msgs: list[dict]) -> str:
    import urllib.request
    body = {"model": model, "messages": msgs, "temperature": 0, "max_tokens": 180}
    req = urllib.request.Request(f"{base_url}/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer EMPTY",
                                          "User-Agent": "omnicave-eval/1.0"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)["choices"][0]["message"]["content"].strip()
    except Exception as e:  # noqa: BLE001
        return f"ERROR {e}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--tag", default="base")
    args = ap.parse_args()
    cs = cases()
    t0 = time.perf_counter()
    with ThreadPoolExecutor(32) as ex:
        replies = list(ex.map(lambda c: ask(args.base_url, args.model,
                                            dl.dk.explain_messages(c["wine"], YEAR, c["notes"])), cs))
    secs = time.perf_counter() - t0
    reasons = Counter()
    (HERE / "eval").mkdir(exist_ok=True)
    out = HERE / "eval" / f"explain_{args.tag}.jsonl"
    ok = 0
    with open(out, "w", encoding="utf-8") as f:
        for c, reply in zip(cs, replies):
            probs = ["request error"] if reply.startswith("ERROR") else dl.dk.check_explanation(reply, c["wine"], YEAR, c["notes"])
            ok += not probs
            reasons.update(p.split(":")[0] for p in probs)
            f.write(json.dumps({**c, "reply": reply, "problems": probs}, ensure_ascii=False, default=str) + "\n")
    print(f"{len(cs)} explanations in {secs:.0f}s; pass {ok}/{len(cs)} ({100 * ok / len(cs):.1f}%)")
    print("failures:", dict(reasons))
    for c, reply in list(zip(cs, replies))[-4:] + list(zip(cs, replies))[:2]:
        w = c["wine"]
        print(f"\n[{w['producer']} {w['name']} {w['vintage']}, window {w['drink_from']}-{w['drink_to']}]\n{reply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
