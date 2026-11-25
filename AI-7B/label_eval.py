"""Label reading: today's OCR word match vs. the Qwen label reader (backend/app/label_llm.py), on data/labels_eval.jsonl.

  baseline  the current labels.match(): catalog wine whose producer+name words appear in the raw OCR text,
            first 4-digit year as vintage
  qwen      the model turns the OCR lines into fields (label_llm.messages / parse); the same word match then runs on
            the cleaned fields instead of the raw text

Two scenarios:
  in catalog      the wine is in the catalog (2,000 wines): wine found, vintage exact (including "none printed"),
                  invented vintage, producer, country, color, "label correct" = right wine + right vintage
  not in catalog  the usual case at home (the app's catalog has 20 wines): the baseline returns no wine, so only
                  its year regex is left; Qwen's own fields are scored (producer, name, vintage, region, country,
                  color, and "all key fields" = producer + name + vintage) Run on the pod with vLLM serving the base model:
  python label_eval.py --base-url http://127.0.0.1:8000/v1 --model Qwen/Qwen2.5-7B-Instruct --tag base
  python label_eval.py --baseline-only        (no model needed)
Writes eval/labels_<tag>.jsonl (every prediction) and prints the table.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import time
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent
LLM_PY = next(p for p in (HERE / "label_llm.py", HERE.parent / "backend" / "app" / "label_llm.py") if p.exists())
_spec = importlib.util.spec_from_file_location("label_llm", LLM_PY)
label_llm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(label_llm)
MIN_MATCH = 0.6     # same threshold as backend/app/market.py


def norm(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()


def match_score(w: dict, text: str) -> float:
    """Same rule as market._match_score: share of the catalog wine's producer+name words found in the text."""
    ours, theirs = norm(f"{w['producer']} {w['name']}").split(), norm(text).split()
    if not ours or not theirs:
        return 0.0
    return sum(1 for o in ours if any(o == t or SequenceMatcher(None, o, t).ratio() >= 0.85 for t in theirs)) / len(ours)


def best_wine(catalog: list[dict], text: str) -> dict | None:
    best = max(catalog, key=lambda w: match_score(w, text))
    return best if match_score(best, text) >= MIN_MATCH else None


def same(a, b) -> bool:
    a, b = norm(a), norm(b)
    return bool(a) and bool(b) and (a == b or SequenceMatcher(None, a, b).ratio() >= 0.85)


def baseline(case: dict, catalog: list[dict]) -> dict:
    text = " ".join(case["lines"])
    years = re.findall(r"\b(19[5-9]\d|20[0-4]\d)\b", text)
    w = best_wine(catalog, text) if catalog else None
    return {"wine_id": w["wine_id"] if w else None, "vintage": int(years[0]) if years else None,
            "producer": w["producer"] if w else None, "country": w["country"] if w else None,
            "color": w["color"] if w else None}


def ask(base_url: str, model: str, key: str, lines: list[str]) -> str:
    body = {"model": model, "messages": label_llm.messages(lines), "temperature": 0, "max_tokens": 200}
    req = urllib.request.Request(f"{base_url.rstrip('/')}/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}",
                                          "User-Agent": "omnicave-eval/1.0"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["choices"][0]["message"]["content"]


def qwen(case: dict, catalog: list[dict], reply: str) -> dict:
    f = label_llm.parse(reply) or {}
    text = " ".join(str(f.get(k) or "") for k in ("producer", "name", "region"))
    w = best_wine(catalog, text) if text.strip() else None
    return {"wine_id": w["wine_id"] if w else None, "vintage": f.get("vintage"), "producer": f.get("producer"),
            "country": f.get("country"), "color": f.get("color"), "fields": f, "reply": reply}


def score(rows: list[dict]) -> dict:
    n = len(rows)
    def pct(fn): return round(100 * sum(1 for r in rows if fn(r)) / n, 1)
    return {"n": n,
            "wine found": pct(lambda r: r["pred"]["wine_id"] == r["wine_id"]),
            "vintage exact": pct(lambda r: r["pred"]["vintage"] == r["truth"]["vintage"]),
            "invented vintage": pct(lambda r: r["truth"]["vintage"] is None and r["pred"]["vintage"] is not None),
            "producer": pct(lambda r: same(r["pred"]["producer"], r["truth"]["producer"])),
            "country": pct(lambda r: same(r["pred"]["country"], r["truth"]["country"])),
            "color": pct(lambda r: r["pred"]["color"] == r["truth"]["color"]),
            "label correct": pct(lambda r: r["pred"]["wine_id"] == r["wine_id"]
                                 and r["pred"]["vintage"] == r["truth"]["vintage"])}


def contains(a, b) -> bool:
    """Lenient name/region check: equal, or every predicted word is in the truth text (X-Wines names often
    include the appellation, which the reader may put under region instead)."""
    pa, pb = norm(a).split(), norm(b).split()
    return same(a, b) or (bool(pa) and all(any(SequenceMatcher(None, x, y).ratio() >= 0.85 for y in pb) for x in pa))


def score_unknown(rows: list[dict]) -> dict:
    n = len(rows)
    def pct(fn): return round(100 * sum(1 for r in rows if fn(r)) / n, 1)
    def f(r): return r["fields"]
    def t(r): return r["truth"]
    def name_ok(r): return contains(f(r).get("name"), f"{t(r)['name']} {t(r)['region']}")
    return {"n": n,
            "producer": pct(lambda r: same(f(r).get("producer"), t(r)["producer"])),
            "name": pct(name_ok),
            "vintage exact": pct(lambda r: f(r).get("vintage") == t(r)["vintage"]),
            "invented vintage": pct(lambda r: t(r)["vintage"] is None and f(r).get("vintage") is not None),
            "region": pct(lambda r: contains(f(r).get("region"), f"{t(r)['region']} {t(r)['name']}")),
            "country": pct(lambda r: same(f(r).get("country"), t(r)["country"])),
            "color": pct(lambda r: f(r).get("color") == t(r)["color"]),
            "all key fields": pct(lambda r: same(f(r).get("producer"), t(r)["producer"]) and name_ok(r)
                                  and f(r).get("vintage") == t(r)["vintage"])}


def table(title: str, results: dict) -> None:
    keys = list(next(iter(results.values())).keys())
    print(f"\n{title}\n| method | " + " | ".join(keys) + " |\n|" + "---|" * (len(keys) + 1))
    for name, s in results.items():
        print(f"| {name} | " + " | ".join(str(s[k]) for k in keys) + " |")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--key", default="EMPTY")
    ap.add_argument("--tag", default="base")
    ap.add_argument("--baseline-only", action="store_true")
    ap.add_argument("--workers", type=int, default=16)
    args = ap.parse_args()
    data = HERE / "data"
    cases = [json.loads(l) for l in (data / "labels_eval.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    catalog = [json.loads(l) for l in (data / "labels_catalog.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    results = {"baseline (OCR word match)": score([{**c, "pred": baseline(c, catalog)} for c in cases])}
    unknown = {"baseline (OCR word match)": score_unknown([{**c, "fields": {"vintage": baseline(c, [])["vintage"]}}
                                                          for c in cases])}
    if not args.baseline_only:
        start = time.perf_counter()
        with ThreadPoolExecutor(args.workers) as ex:
            replies = list(ex.map(lambda c: ask(args.base_url, args.model, args.key, c["lines"]), cases))
        secs = time.perf_counter() - start
        rows = [{**c, "pred": qwen(c, catalog, r)} for c, r in zip(cases, replies)]
        results[f"qwen {args.tag}"] = score(rows)
        unknown[f"qwen {args.tag}"] = score_unknown([{**r, "fields": r["pred"]["fields"]} for r in rows])
        (HERE / "eval").mkdir(exist_ok=True)
        with open(HERE / "eval" / f"labels_{args.tag}.jsonl", "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"{len(cases)} labels in {secs:.1f}s; unparsable replies: {sum(1 for r in rows if not r['pred']['fields'])}")
    table("In catalog (2,000 wines)", results)
    table("Not in catalog (only the reader's own fields count)", unknown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
