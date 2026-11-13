"""Smoke test: load the base model on the GPU and stream one critic-style reply.

Checks, in order:
  1. CUDA is available.
  2. The model's LICENSE file is Apache-2.0.
  3. The model loads in bf16 and streams a reply. Prints time to first token (TTFT),
     total time and peak VRAM.

Usage:  .venv\\Scripts\\python smoke.py [--model Qwen/Qwen2.5-1.5B-Instruct]
"""
import argparse
import threading
import time

import torch
from huggingface_hub import hf_hub_download
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer

DEFAULT_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("CUDA is not available. Run this with ai/lora/.venv, not the global Python.")
    print(f"GPU: {torch.cuda.get_device_name(0)}")

    license_text = open(hf_hub_download(args.model, "LICENSE"), encoding="utf-8").read()
    if "Apache License" not in license_text or "Version 2.0" not in license_text:
        raise SystemExit(f"{args.model}: LICENSE is not Apache-2.0. Check the model card before using it.")
    print("License: Apache-2.0")

    t0 = time.perf_counter()
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.bfloat16).to("cuda").eval()
    print(f"Loaded {args.model} in {time.perf_counter() - t0:.1f}s")

    messages = [
        {"role": "system", "content": "You are a fictional wine critic. Stay in character. 2-3 sentences. "
                                      "Give tasting notes and an aging prediction."},
        {"role": "user", "content": "Wine on the table: G.D. Vajra Barolo 2018 (Piedmont, Nebbiolo, red). "
                                    "Debate so far:\n(you speak first)"},
    ]
    inputs = tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt",
                                     return_dict=True).to("cuda")
    streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)
    gen = threading.Thread(target=model.generate, kwargs=dict(
        **inputs, streamer=streamer, max_new_tokens=180, do_sample=True, temperature=0.8, top_p=0.9))

    torch.cuda.reset_peak_memory_stats()
    start = time.perf_counter()
    gen.start()
    ttft = None
    parts = []
    for piece in streamer:
        if ttft is None and piece:
            ttft = time.perf_counter() - start
        parts.append(piece)
        print(piece, end="", flush=True)
    gen.join()
    total = time.perf_counter() - start
    print()
    print(f"TTFT {ttft:.3f}s | total {total:.2f}s | peak VRAM {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB")
    if not "".join(parts).strip():
        raise SystemExit("Empty reply")


if __name__ == "__main__":
    main()
