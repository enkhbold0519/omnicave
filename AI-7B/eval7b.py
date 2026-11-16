"""Score base 7B vs persona LoRA on held-out wines with verify7b (runs on the GPU pod).

Both conditions get the identical prompt (backend messages + evidence). Batched with vLLM offline
and the same sampling as the backend (temperature 0.8, max_tokens 180).

Usage (pod):  python eval7b.py [--limit 40]
Writes eval/report.md and eval/replies.jsonl.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "lora"))
import prompts  # noqa: E402

import verify7b  # noqa: E402

BASE = "Qwen/Qwen2.5-7B-Instruct"


def pct(xs) -> str:
    xs = list(xs)
    return f"{100 * sum(xs) / len(xs):.0f}%" if xs else "-"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--adapters", type=Path, default=HERE / "adapters")
    args = ap.parse_args()
    from vllm import LLM, SamplingParams
    from vllm.lora.request import LoRARequest

    personas = prompts.load_personas()
    rows = [json.loads(l) for l in (HERE / "data" / "eval.jsonl").read_text(encoding="utf-8").splitlines()]
    llm = LLM(model=BASE, enable_lora=True, max_lora_rank=16, max_loras=4, max_model_len=4096,
              gpu_memory_utilization=0.85)
    sp = SamplingParams(temperature=0.8, top_p=0.9, max_tokens=180, seed=11)
    results = []
    for i, p in enumerate(personas):
        mine = [r for r in rows if r["persona"] == p["id"]][:args.limit]
        msgs = [r["messages"][:2] for r in mine]
        lora = LoRARequest(p["lora_adapter"], i + 1, str(args.adapters / p["lora_adapter"]))
        for cond, req in (("base", None), ("LoRA", lora)):
            outs = llm.chat(msgs, sp, lora_request=req, use_tqdm=False)
            for r, o in zip(mine, outs):
                reply = o.outputs[0].text.strip()
                c = verify7b.check(reply, p["id"], r["row"], prompt=r["messages"][1]["content"])
                results.append({"id": r["id"], "persona": p["id"], "condition": cond, "wine": r["wine"],
                                "reply": reply, "words": len(reply.split()), "all_pass": all(c.values())} | c)
        print(p["id"], "done", flush=True)

    out = HERE / "eval"
    out.mkdir(exist_ok=True)
    with open(out / "replies.jsonl", "w", encoding="utf-8") as fh:
        for r in results:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    cols = ["all_pass"] + verify7b.CHECKS
    lines = ["# 7B persona LoRA eval", "",
             f"Base `{BASE}`; held-out wines; up to {args.limit} prompts per persona; temperature 0.8, max 180 tokens. "
             "Both conditions get the same prompt and retrieved evidence. Checks: see verify7b.py.", "",
             "| Persona | Condition | n | " + " | ".join(cols) + " | words |", "|" + " --- |" * (len(cols) + 4)]
    for p in personas:
        for cond in ("base", "LoRA"):
            rs = [r for r in results if r["persona"] == p["id"] and r["condition"] == cond]
            if rs:
                lines.append(f"| {p['id']} | {cond} | {len(rs)} | " + " | ".join(pct(r[c] for r in rs) for c in cols)
                             + f" | {sum(r['words'] for r in rs) / len(rs):.0f} |")
    lines += ["", "## Examples (LoRA)", ""]
    for p in personas:
        for r in [x for x in results if x["persona"] == p["id"] and x["condition"] == "LoRA"][:2]:
            lines.append(f"- **{p['name']}** on {r['wine']}: {r['reply']}")
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
