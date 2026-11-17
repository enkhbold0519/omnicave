"""Check serve.py through the webOS backend's own LLM client (webos/backend/app/llm.py).

This exercises the real backend code path with LLM_PROVIDER=vllm without editing webos/:
llm.stream_chat sends the persona's adapter name as `model` and parses the SSE stream.

Checks:
  1. /v1/models lists the base model and every persona adapter from personas.json.
  2. Each adapter (and the base) streams a reply for a held-out eval prompt; TTFT is printed.
  3. Replies are not the backend's offline fallback; adapters do not all say the same thing.
  4. An unknown adapter name makes the backend fall back to its offline text (404 path).
  5. Reports scale use and grounding (years and tasting notes only from the retrieved evidence);
     informational, because a dry-run LoRA is not expected to pass them yet.

Usage (server running):  python serve_check.py [--url http://127.0.0.1:8001/v1]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

import prompts
from evidence import from_dict, load_catalog
from make_dataset import DATA, grounding, short_label

FALLBACK = "__OFFLINE_FALLBACK__"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8001/v1")
    ap.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    ap.add_argument("--partial", action="store_true", help="allow missing adapters (dry run with one persona)")
    args = ap.parse_args()

    # app.config uses os.environ.setdefault, so these win over webos/backend/.env.
    os.environ["LLM_PROVIDER"] = "vllm"
    os.environ["VLLM_BASE_URL"] = args.url
    os.environ["VLLM_BASE_MODEL"] = args.model
    sys.path.insert(0, str(prompts.BACKEND))
    from app import llm  # noqa: E402  (webos backend client, imported read-only)

    failures: list[str] = []
    with urllib.request.urlopen(args.url.rstrip("/") + "/models", timeout=10) as r:
        served = {m["id"] for m in json.load(r)["data"]}
    personas = prompts.load_personas()
    expected = {args.model} | {p["lora_adapter"] for p in personas}
    print("served models:", sorted(served))
    if expected - served:
        msg = f"missing from /v1/models: {sorted(expected - served)}"
        (print("note:", msg) if args.partial and args.model in served else failures.append(msg))

    with urllib.request.urlopen(args.url.rstrip("/").removesuffix("/v1") + "/health", timeout=10) as r:
        if not json.load(r).get("rag"):
            failures.append("server runs with --no-rag; debate prompts get no evidence")
    wines = {short_label(w): w for w in load_catalog()}
    rows = [json.loads(line) for line in (DATA / "eval.jsonl").read_text(encoding="utf-8").splitlines()]
    replies: dict[str, str] = {}
    targets = [(p["id"], p["lora_adapter"]) for p in personas if p["lora_adapter"] in served]
    targets += [(p["id"], None) for p in personas[:1]]  # base model, same prompt as the first persona
    for pid, adapter in targets:
        row = next(r for r in rows if r["persona"] == pid)
        msgs = row["backend_messages"]  # exactly what the backend sends; the server adds evidence
        start, ttft, text = time.perf_counter(), None, ""
        for piece in llm.stream_chat(msgs, FALLBACK, adapter=adapter, max_tokens=prompts.MAX_TOKENS):
            if ttft is None:
                ttft = time.perf_counter() - start
            text += piece
        name = adapter or f"base ({args.model})"
        g = grounding(text.strip(), pid, wines[row["wine"]], row["wine"], from_dict(row["evidence"]), row["year"])
        print(f"\n[{name}] TTFT {ttft:.3f}s, total {time.perf_counter() - start:.2f}s, "
              + ", ".join(f"{k}={'yes' if v else 'no'}" for k, v in g.items()) + f"\n  {text.strip()}")
        if FALLBACK in text or text.startswith("[LLM"):
            failures.append(f"{name}: backend fell back to offline text: {text[:120]}")
        if ttft is not None and ttft > 1.5:
            print(f"  note: TTFT above the paper's 1.5 s target")
        replies[name] = text.strip()

    adapter_replies = [t for n, t in replies.items() if not n.startswith("base")]
    if len(adapter_replies) > 1 and len(set(adapter_replies)) == 1:
        failures.append("all adapters returned identical text")

    text = "".join(llm.stream_chat([{"role": "user", "content": "hi"}], FALLBACK, adapter="persona-does-not-exist",
                                   max_tokens=8))
    print(f"\n[unknown adapter] -> {text[:100]!r}")
    if FALLBACK not in text:
        failures.append("unknown adapter did not trigger the backend's offline fallback")

    print()
    for f in failures:
        print("FAIL", f)
    if failures:
        return 1
    print("OK: models listed, adapters stream through the backend client, fallback path works")
    return 0


if __name__ == "__main__":
    sys.exit(main())
