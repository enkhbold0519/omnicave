"""Stream one held-out debate turn per persona from a running `vllm serve` and report TTFT.

Start the server first (pod):
  vllm serve Qwen/Qwen2.5-7B-Instruct --enable-lora --max-lora-rank 16 --max-loras 4 --port 8000 \
    --lora-modules persona-power-critic=adapters/persona-power-critic ... (all 4)
Usage:  python serve_check7b.py [--url http://127.0.0.1:8000/v1]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "lora"))
import prompts  # noqa: E402

import verify7b  # noqa: E402


def stream(url: str, model: str, messages: list[dict]) -> tuple[str, float, float]:
    body = json.dumps({"model": model, "messages": messages, "stream": True, "max_tokens": 180,
                       "temperature": 0.8}).encode()
    req = urllib.request.Request(url.rstrip("/") + "/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    start, first, text = time.perf_counter(), None, ""
    with urllib.request.urlopen(req, timeout=120) as r:
        for raw in r:
            line = raw.decode().strip()
            if not line.startswith("data:") or line.endswith("[DONE]"):
                continue
            piece = (json.loads(line[5:])["choices"][0].get("delta") or {}).get("content")
            if piece:
                first = first or time.perf_counter() - start
                text += piece
    return text.strip(), first or float("nan"), time.perf_counter() - start


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/v1")
    args = ap.parse_args()
    with urllib.request.urlopen(args.url.rstrip("/") + "/models", timeout=10) as r:
        print("served:", [m["id"] for m in json.load(r)["data"]])
    rows = [json.loads(l) for l in (HERE / "data" / "eval.jsonl").read_text(encoding="utf-8").splitlines()]
    worst = 0.0
    for p in prompts.load_personas():
        r = next(x for x in rows if x["persona"] == p["id"])
        text, ttft, total = stream(args.url, p["lora_adapter"], r["messages"][:2])
        ok, failed = verify7b.passes(text, p["id"], r["row"], prompt=r["messages"][1]["content"])
        worst = max(worst, ttft)
        print(f"[{p['lora_adapter']}] TTFT {ttft:.3f}s total {total:.2f}s pass={ok} {failed}\n  {text}")
    print(f"max TTFT {worst:.3f}s (paper target 1.5 s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
