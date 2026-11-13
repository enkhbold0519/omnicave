"""Train one LoRA adapter per critic persona on the template dataset.

The base model stays frozen. Only the low-rank A/B matrices on the 7 linear projections of
every layer are trained, and the adapter is saved unmerged so the server can swap personas
per request. Loss is computed on the assistant reply only.

Usage (from ai/lora, with the CUDA venv):
  .venv\\Scripts\\python train.py --persona power-critic --max-steps 20   # dry run
  .venv\\Scripts\\python train.py --persona all                           # all three personas

Outputs: adapters/<lora_adapter>/ (adapter_model.safetensors, adapter_config.json, train_log.json)
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, get_cosine_schedule_with_warmup

import prompts

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ADAPTERS = HERE / "adapters"
DEFAULT_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
TARGETS = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--persona", default="all", help="persona id from personas.json, or 'all'")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--r", type=int, default=16)
    ap.add_argument("--alpha", type=int, default=32)
    ap.add_argument("--dropout", type=float, default=0.05)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--warmup", type=float, default=0.03, help="fraction of optimizer steps")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--max-len", type=int, default=768)
    ap.add_argument("--max-steps", type=int, default=-1, help="stop after N optimizer steps (dry run)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out-dir", type=Path, default=ADAPTERS,
                    help="parent folder for the saved LoRA (default adapters/)")
    ap.add_argument("--name-suffix", default="",
                    help="appended to the LoRA folder name, e.g. -r4 -> persona-power-critic-r4")
    return ap.parse_args()


def sha256(path: Path) -> str:
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rows(split: str, persona: str) -> list[dict]:
    path = DATA / f"{split}.jsonl"
    if not path.exists():
        raise SystemExit(f"{path} not found. Run: python make_dataset.py")
    return [r for r in map(json.loads, path.read_text(encoding="utf-8").splitlines()) if r["persona"] == persona]


def encode(tok, row: dict, max_len: int) -> dict | None:
    """input_ids for the whole chat; labels are -100 everywhere except the assistant reply."""
    msgs = row["messages"]
    prompt = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
    full = tok.apply_chat_template(msgs, tokenize=False)
    if not full.startswith(prompt):
        raise SystemExit("Chat template mismatch: the full chat does not start with the generation prompt")
    p_ids = tok(prompt, add_special_tokens=False)["input_ids"]
    f_ids = tok(full, add_special_tokens=False)["input_ids"]
    if f_ids[:len(p_ids)] != p_ids:
        raise SystemExit("Tokenization mismatch between prompt and full chat")
    if len(f_ids) > max_len:
        return None
    labels = [-100] * len(p_ids) + f_ids[len(p_ids):]
    return {"input_ids": f_ids, "labels": labels}


def batches(items: list[dict], size: int, pad_id: int, shuffle: bool, rng: random.Random):
    order = list(range(len(items)))
    if shuffle:
        rng.shuffle(order)
    for i in range(0, len(order), size):
        chunk = [items[j] for j in order[i:i + size]]
        n = max(len(x["input_ids"]) for x in chunk)
        ids = torch.full((len(chunk), n), pad_id, dtype=torch.long)
        lab = torch.full((len(chunk), n), -100, dtype=torch.long)
        att = torch.zeros((len(chunk), n), dtype=torch.long)
        for k, x in enumerate(chunk):
            L = len(x["input_ids"])
            ids[k, :L] = torch.tensor(x["input_ids"])
            lab[k, :L] = torch.tensor(x["labels"])
            att[k, :L] = 1
        yield ids.cuda(), att.cuda(), lab.cuda()


@torch.no_grad()
def eval_loss(model, items: list[dict], pad_id: int, size: int) -> float:
    """Mean loss per reply token over the eval split."""
    model.eval()
    total, tokens = 0.0, 0
    for ids, att, lab in batches(items, size, pad_id, False, random.Random(0)):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            logits = model(input_ids=ids, attention_mask=att).logits
        shift_logits, shift_lab = logits[:, :-1].float(), lab[:, 1:]
        loss = torch.nn.functional.cross_entropy(
            shift_logits.reshape(-1, shift_logits.size(-1)), shift_lab.reshape(-1), ignore_index=-100, reduction="sum")
        total += loss.item()
        tokens += (shift_lab != -100).sum().item()
    model.train()
    return total / max(1, tokens)


def train_one(persona: dict, args: argparse.Namespace, tok) -> dict:
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    out_dir = args.out_dir / (persona["lora_adapter"] + args.name_suffix)

    raw_train, raw_eval = load_rows("train", persona["id"]), load_rows("eval", persona["id"])
    train = [e for e in (encode(tok, r, args.max_len) for r in raw_train) if e]
    evals = [e for e in (encode(tok, r, args.max_len) for r in raw_eval) if e]
    dropped = (len(raw_train) - len(train)) + (len(raw_eval) - len(evals))
    longest = max(len(x["input_ids"]) for x in train + evals)
    print(f"\n=== {persona['id']} -> {out_dir.name}: {len(train)} train / {len(evals)} eval samples, "
          f"longest {longest} tokens, dropped {dropped} over {args.max_len}")

    base = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.bfloat16).cuda()
    base.config.use_cache = False
    base.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    cfg = LoraConfig(r=args.r, lora_alpha=args.alpha, lora_dropout=args.dropout, target_modules=TARGETS,
                     bias="none", task_type="CAUSAL_LM")
    model = get_peft_model(base, cfg)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"trainable params {trainable:,} / {total:,} ({100 * trainable / total:.2f}%)")

    steps_per_epoch = math.ceil(len(train) / (args.batch * args.grad_accum))
    total_steps = steps_per_epoch * args.epochs
    if args.max_steps > 0:
        total_steps = min(total_steps, args.max_steps)
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=0.0)
    sched = get_cosine_schedule_with_warmup(opt, max(1, round(args.warmup * total_steps)), total_steps)

    torch.cuda.reset_peak_memory_stats()
    log = {"persona": persona["id"], "adapter": persona["lora_adapter"], "base_model": args.model,
           "hparams": {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items() if k != "persona"},
           "data_sha256": {s: sha256(DATA / f"{s}.jsonl") for s in ("train", "eval")},
           "torch": torch.__version__,
           "trainable_params": trainable, "samples": {"train": len(train), "eval": len(evals)},
           "eval_loss": [], "train_loss": []}
    loss0 = eval_loss(model, evals, tok.pad_token_id, args.batch)
    log["eval_loss"].append({"step": 0, "loss": loss0})
    print(f"step 0 eval loss {loss0:.4f}")

    t0 = time.perf_counter()
    step, micro, running = 0, 0, 0.0
    model.train()
    done = False
    for epoch in range(args.epochs):
        for ids, att, lab in batches(train, args.batch, tok.pad_token_id, True, rng):
            with torch.autocast("cuda", dtype=torch.bfloat16):
                loss = model(input_ids=ids, attention_mask=att, labels=lab).loss / args.grad_accum
            loss.backward()
            running += loss.item()
            micro += 1
            if micro % args.grad_accum:
                continue
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
            opt.step()
            sched.step()
            opt.zero_grad(set_to_none=True)
            step += 1
            log["train_loss"].append({"step": step, "loss": running})
            if step % 5 == 0 or step == 1:
                print(f"epoch {epoch + 1} step {step}/{total_steps} loss {running:.4f} lr {sched.get_last_lr()[0]:.2e}")
            running = 0.0
            if step >= total_steps:
                done = True
                break
        le = eval_loss(model, evals, tok.pad_token_id, args.batch)
        log["eval_loss"].append({"step": step, "loss": le})
        print(f"epoch {epoch + 1} done: eval loss {le:.4f}")
        if done:
            break

    log["seconds"] = round(time.perf_counter() - t0, 1)
    log["peak_vram_gib"] = round(torch.cuda.max_memory_allocated() / 2**30, 2)
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out_dir)
    (out_dir / "train_log.json").write_text(json.dumps(log, indent=2), encoding="utf-8")
    size_mb = sum(f.stat().st_size for f in out_dir.glob("*.safetensors")) / 2**20
    print(f"saved {out_dir} ({size_mb:.1f} MB) in {log['seconds']}s, peak VRAM {log['peak_vram_gib']} GiB, "
          f"eval loss {loss0:.4f} -> {log['eval_loss'][-1]['loss']:.4f}")
    del model, base, opt
    torch.cuda.empty_cache()
    return log


def main() -> None:
    args = parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is not available. Run this with ai/lora/.venv, not the global Python.")
    personas = prompts.load_personas()
    chosen = personas if args.persona == "all" else [p for p in personas if p["id"] == args.persona]
    if not chosen:
        raise SystemExit(f"Unknown persona {args.persona}; choose from {[p['id'] for p in personas]} or 'all'")
    tok = AutoTokenizer.from_pretrained(args.model)
    logs = [train_one(p, args, tok) for p in chosen]
    print("\nSummary:")
    for lg in logs:
        print(f"  {lg['adapter']}: eval loss {lg['eval_loss'][0]['loss']:.4f} -> {lg['eval_loss'][-1]['loss']:.4f}, "
              f"{lg['seconds']}s, peak {lg['peak_vram_gib']} GiB")


if __name__ == "__main__":
    main()
