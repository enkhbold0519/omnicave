"""Compare base + RAG with persona LoRA + RAG on held-out wines.

Both conditions get the same retrieved evidence from serve.py (RAG on), so the comparison isolates
what the LoRA adds. Requests go through the webOS backend's own client (webos/backend/app/llm.py)
at the backend's settings (temperature 0.8, max_tokens 180), so the numbers match the display.

Metrics per persona and condition:
  scale           reply uses its persona's scale (93-95 points / FQI 1.6 / 17.5/20)
  leak            reply uses another persona's scale
  sentences       2-3 sentences, as the system prompt asks
  years_grounded  every year mentioned is the vintage or comes from the evidence window
  notes_grounded  every known tasting descriptor mentioned is in the evidence
  uses_evidence   at least one evidence tasting note is mentioned
  TTFT            time to first streamed piece (mean and p95), paper target <= 1.5 s

Usage (server running with RAG on):  python eval.py [--limit 20]
Writes eval/report.md (summary) and eval/results.jsonl (every reply).
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from datetime import date
from pathlib import Path

import prompts
from evidence import from_dict, load_catalog
from make_dataset import DATA, grounding, short_label

HERE = Path(__file__).resolve().parent
OUT = HERE / "eval"
FALLBACK = "__OFFLINE_FALLBACK__"
METRICS = ["scale", "leak", "sentences", "years_grounded", "notes_grounded", "uses_evidence", "claims_match"]


def pct(xs: list[bool]) -> str:
    return f"{100 * sum(xs) / len(xs):.0f}%" if xs else "-"


def p95(xs: list[float]) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, round(0.95 * (len(xs) - 1)))] if xs else float("nan")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8001/v1")
    ap.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    ap.add_argument("--limit", type=int, default=20, help="eval prompts per persona (max 40)")
    ap.add_argument("--personas", default="", help="comma-separated persona ids (default: all)")
    ap.add_argument("--adapter-suffixes", default="",
                    help="comma-separated LoRA name suffixes to compare, e.g. '-r16,-r4' (default: the plain name)")
    ap.add_argument("--skip-base", action="store_true", help="do not run the base+RAG condition")
    ap.add_argument("--report", default="report", help="output name: eval/<report>.md and .jsonl")
    args = ap.parse_args()

    os.environ["LLM_PROVIDER"] = "vllm"
    os.environ["VLLM_BASE_URL"] = args.url
    os.environ["VLLM_BASE_MODEL"] = args.model
    sys.path.insert(0, str(prompts.BACKEND))
    from app import llm  # noqa: E402  (webos backend client, imported read-only)

    wines = {short_label(w): w for w in load_catalog()}
    rows = [json.loads(line) for line in (DATA / "eval.jsonl").read_text(encoding="utf-8").splitlines()]
    personas = prompts.load_personas()
    if args.personas:
        wanted = args.personas.split(",")
        personas = [p for p in personas if p["id"] in wanted]
    suffixes = args.adapter_suffixes.split(",") if args.adapter_suffixes else [""]
    conditions = lambda p: ([] if args.skip_base else [("base+RAG", None)]) + [
        (f"LoRA{s}+RAG", p["lora_adapter"] + s) for s in suffixes]
    OUT.mkdir(exist_ok=True)
    results = []
    for p in personas:
        mine = [r for r in rows if r["persona"] == p["id"]][:args.limit]
        for cond, adapter in conditions(p):
            for i, row in enumerate(mine):
                start, ttft, text = time.perf_counter(), None, ""
                for piece in llm.stream_chat(row["backend_messages"], FALLBACK, adapter=adapter,
                                             max_tokens=prompts.MAX_TOKENS, temperature=0.8):
                    if ttft is None:
                        ttft = time.perf_counter() - start
                    text += piece
                reply = text.strip()
                g = grounding(reply, p["id"], wines[row["wine"]], row["wine"], from_dict(row["evidence"]), row["year"])
                res = {"id": row["id"], "persona": p["id"], "condition": cond, "wine": row["wine"], "ttft": ttft,
                       "seconds": time.perf_counter() - start, "words": len(reply.split()),
                       "fallback": FALLBACK in reply or reply.startswith("[LLM"), "reply": reply} | g
                results.append(res)
                print(f"{p['id']:13s} {cond:13s} {i + 1:2d}/{len(mine)} scale={g['scale']!s:5s} "
                      f"years={g['years_grounded']!s:5s} notes={g['notes_grounded']!s:5s} ttft={ttft:.2f}s", flush=True)

    jsonl = OUT / ("results.jsonl" if args.report == "report" else f"{args.report}.jsonl")
    with open(jsonl, "w", encoding="utf-8") as fh:
        for r in results:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    head = ["Persona", "Condition"] + METRICS + ["TTFT mean", "TTFT p95", "Words", "Fallback"]
    lines = [f"# Persona LoRA + RAG eval ({date.today().isoformat()})", "",
             f"Base `{args.model}`, {args.limit} held-out prompts per persona, temperature 0.8, max_tokens "
             f"{prompts.MAX_TOKENS}. Both conditions receive the same retrieved evidence: critics get the "
             "simulated critic store, crowd-taste gets real X-Wines peer-relative data (CC0). "
             "Held-out wines are not in the training set. claims_match (crowd-taste only) checks that "
             "'right around / above / below its neighbours' matches the evidence delta.", "",
             "| " + " | ".join(head) + " |", "|" + " --- |" * len(head)]
    for p in personas:
        for cond, _ in conditions(p):
            rs = [r for r in results if r["persona"] == p["id"] and r["condition"] == cond]
            tt = [r["ttft"] for r in rs if r["ttft"] is not None]
            cells = [p["id"], cond] + [pct([r[m] for r in rs]) for m in METRICS] + [
                f"{statistics.mean(tt):.2f}s", f"{p95(tt):.2f}s", f"{statistics.mean(r['words'] for r in rs):.0f}",
                str(sum(r["fallback"] for r in rs))]
            lines.append("| " + " | ".join(cells) + " |")
    lines += ["", "## One example per persona and LoRA condition", ""]
    for p in personas:
        for cond, adapter in conditions(p):
            if adapter is None:
                continue
            ex = next((r for r in results if r["persona"] == p["id"] and r["condition"] == cond), None)
            if ex:
                lines.append(f"- **{p['name']}** ({cond}) on {ex['wine']}: {ex['reply']}")
    md = OUT / f"{args.report}.md"
    md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(l for l in lines if l.startswith("|")))
    print(f"\nwrote {md}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
