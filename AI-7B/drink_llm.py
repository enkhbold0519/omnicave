"""Drinking-window model: training data for the LoRA, and predictions from a vLLM server.

  python drink_llm.py data         data/drink_sft/{train,eval}.jsonl for train.py (eval = 5% of the TRAIN
                                   producers, for the loss curve only; the real eval set stays unseen)
  python drink_llm.py predict --model Qwen/Qwen2.5-7B-Instruct --tag base       (on the pod, vLLM on :8000)
  python drink_llm.py predict --model drink-window --tag lora
predict writes eval/drink_<tag>.jsonl ({"i", "from", "to", "reply"} per data/drink_eval.jsonl row) for
eval_drinking.py --preds <tag>=eval/drink_<tag>.jsonl.

The prompt is backend/app/drinking.py messages(): the wine (as the app knows it: no score, no price) plus
the aging-table cell. The target is the years the review states ({"from": .., "to": ..}, null when the
review gives only one of them). Standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
PY = next(p for p in (HERE / "drinking.py", HERE.parent / "backend" / "app" / "drinking.py") if p.exists())


def load_drinking():
    """backend/app/drinking.py without the backend package (it only needs the catalog for estimate())."""
    import sys
    import types
    pkg = types.ModuleType("app")
    pkg.__path__ = [str(PY.parent)]
    sys.modules.setdefault("app", pkg)
    cat = PY.parent / "catalog.py"
    if cat.exists():
        spec = importlib.util.spec_from_file_location("app.catalog", cat)
    else:   # on the pod: catalog_pod.json if copied, else no catalog
        cj = PY.parent / "catalog_pod.json"
        sys.modules["app.catalog"] = types.SimpleNamespace(
            CATALOG=json.loads(cj.read_text(encoding="utf-8")) if cj.exists() else [])
        spec = None
    if spec:
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        sys.modules["app.catalog"] = mod
    # drinking.py imports config and llm for estimate(); this script only uses lookup/messages/parse/combine
    stub = types.SimpleNamespace(LLM_PROVIDER="mock")
    sys.modules.setdefault("app.config", stub)
    sys.modules.setdefault("app.llm", types.SimpleNamespace(stream_chat=None))
    pkg.config, pkg.llm = sys.modules["app.config"], sys.modules["app.llm"]
    spec = importlib.util.spec_from_file_location("app.drinking", PY)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["app.drinking"] = mod
    spec.loader.exec_module(mod)
    return mod


dk = load_drinking()


def wine_name(r: dict) -> str:
    """The wine's name as a label shows it: the review title without producer, vintage and (region)."""
    t = re.sub(r"\s*\([^)]*\)\s*$", "", r["title"])
    if t.lower().startswith(r["producer"].lower()):
        t = t[len(r["producer"]):]
    return re.sub(r"\b%d\b" % r["vintage"], "", t).strip(" -,") or r["variety"]


def as_wine(r: dict) -> dict:
    return {"producer": r["producer"], "name": wine_name(r), "grape": r["grape"], "region": r["region"],
            "province": r["province"], "country": r["country"], "color": r["color"], "vintage": r["vintage"]}


def rows(split: str) -> list[dict]:
    return [json.loads(l) for l in (DATA / f"drink_{split}.jsonl").read_text(encoding="utf-8").splitlines()]


def cmd_data(_args) -> int:
    out = DATA / "drink_sft"
    out.mkdir(exist_ok=True)
    n = {"train": 0, "eval": 0}
    files = {s: open(out / f"{s}.jsonl", "w", encoding="utf-8") for s in n}
    for r in rows("train"):
        w = as_wine(r)
        target = json.dumps({"from": r["from"], "to": r["to"]})
        msgs = dk.messages(w, dk.lookup(w)) + [{"role": "assistant", "content": target}]
        key = ("sft:" + r["producer"].lower()).encode()   # own salt: drink_data.py's split hash is on the same names
        split = "eval" if int(hashlib.sha1(key).hexdigest(), 16) % 20 == 0 else "train"
        files[split].write(json.dumps({"persona": "drink-window", "messages": msgs}, ensure_ascii=False) + "\n")
        n[split] += 1
    for f in files.values():
        f.close()
    (out / "personas.json").write_text(json.dumps([{"id": "drink-window", "lora_adapter": dk.LORA,
                                                     "name": "Drinking window"}]), encoding="utf-8")
    print(f"{out}: train {n['train']}, eval {n['eval']}; example:\n{msgs[1]['content']}\n-> {target}")
    return 0


def ask(base_url: str, model: str, msgs: list[dict]) -> str:
    body = {"model": model, "messages": msgs, "temperature": 0, "max_tokens": 40}
    req = urllib.request.Request(f"{base_url.rstrip('/')}/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer EMPTY",
                                          "User-Agent": "omnicave-eval/1.0"}, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["choices"][0]["message"]["content"]
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                return f"ERROR {e}"
            time.sleep(2)


def cmd_predict(args) -> int:
    ev = rows("eval")
    wines = [as_wine(r) for r in ev]
    t0 = time.perf_counter()
    with ThreadPoolExecutor(args.workers) as ex:
        replies = list(ex.map(lambda w: ask(args.base_url, args.model, dk.messages(w, dk.lookup(w))), wines))
    secs = time.perf_counter() - t0
    (HERE / "eval").mkdir(exist_ok=True)
    out = HERE / "eval" / f"drink_{args.tag}.jsonl"
    bad = errors = 0
    with open(out, "w", encoding="utf-8") as f:
        for i, (w, reply) in enumerate(zip(wines, replies)):
            p = dk.parse(reply, w["vintage"])
            errors += reply.startswith("ERROR")
            bad += not (p["from"] or p["to"])
            start, end = dk.combine(w["vintage"], dk.lookup(w), p)
            f.write(json.dumps({"i": i, "from": start, "to": end, "model_from": p["from"], "model_to": p["to"],
                                "reply": reply}, ensure_ascii=False) + "\n")
    print(f"{len(ev)} wines in {secs:.0f}s with {args.model}: {errors} request errors, {bad} replies without a year -> {out}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("data")
    p = sub.add_parser("predict")
    p.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    p.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    p.add_argument("--tag", default="base")
    p.add_argument("--workers", type=int, default=32)
    args = ap.parse_args()
    return cmd_data(args) if args.cmd == "data" else cmd_predict(args)


if __name__ == "__main__":
    raise SystemExit(main())
