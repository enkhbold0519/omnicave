# LoRA rank study: r=4 vs r=16

Does a low-rank LoRA learn a persona as well as a higher-rank one? Two OmniCave critic personas
were trained twice on identical data and settings, changing only the rank. Both versions were
then evaluated on the same held-out prompts.

## Setup
| | Value |
| --- | --- |
| Base model | `Qwen/Qwen2.5-1.5B-Instruct` (Apache-2.0), bf16, frozen |
| Personas | `power-critic` (Victor Hale, 100-point scale) and `crowd-taste` (Jordan Reyes, X-Wines peer ranking) |
| Ranks | r=16, alpha=32 and r=4, alpha=8 (alpha/r = 2 in both, so the update scale is the same) |
| Target modules | q, k, v, o, gate, up, down_proj in all 28 layers; unmerged; LoRA weights stored in fp32 |
| Everything else | lr 2e-4 cosine, warmup 3%, 3 epochs, batch 2 x grad-accum 8, max length 768, dropout 0.05, seed 42 |
| Data | 304 train / 40 eval samples per persona; eval wines are held out of training. The r=4 runs record `data_sha256` (train `6071754c...`). The r=16 runs predate that field. crowd-taste r=16 used that same file (written before its run). power-critic r=16 used the previous generation of the file: same generator, seed and critic templates, so its power-critic rows should be identical, but this is not hash-verified |
| Hardware | RTX 3070 Ti 8 GB, Windows 11, torch 2.14.1+cu132; runs were sequential, not concurrent |
| Evaluation | All 40 held-out prompts per persona, served through `serve.py` with RAG on, temperature 0.8, max 180 tokens |

## Results
| Persona | Rank | Trainable params | LoRA file | Train time | Peak VRAM | Eval loss (start -> end) |
| --- | --- | --- | --- | --- | --- | --- |
| power-critic | 16 | 18,464,768 (1.18%) | 70.5 MB | 948 s | 4.77 GiB | 1.9415 -> 0.0858 |
| power-critic | 4 | 4,616,192 (0.30%) | 17.7 MB | 486 s | 4.57 GiB | 1.9415 -> 0.1102 |
| crowd-taste | 16 | 18,464,768 (1.18%) | 70.5 MB | 1167 s | 5.83 GiB | 2.4339 -> 0.0284 |
| crowd-taste | 4 | 4,616,192 (0.30%) | 17.7 MB | 534 s | 5.63 GiB | 2.4339 -> 0.0510 |

Behaviour on the 40 held-out prompts (`eval_report.md`, raw replies in `eval_replies.jsonl`):

| Persona | Rank | Own scale | Other scale | 2-3 sentences | Years grounded | Notes grounded | Uses evidence | Claims match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| power-critic | 16 | 100% | 0% | 100% | 100% | 100% | 98% | 100% |
| power-critic | 4 | 100% | 0% | 100% | 100% | 100% | 100% | 100% |
| crowd-taste | 16 | 100% | 0% | 100% | 100% | 100% | 100% | 100% |
| crowd-taste | 4 | 100% | 0% | 100% | 100% | 100% | 100% | **95%** |

## What it shows
- **Format and persona style survive a 4x smaller rank.** r=4 used a quarter of the parameters and
  file size and trained in about half the time. It held the persona's scale, length and voice on
  every held-out prompt.
- **The cost shows up in fact handling first, not in style.** End-of-training eval loss is higher
  at r=4 for both personas (+28% and +80% relative). The only behavioural miss is factual: on 2/40
  prompts the r=4 crowd persona said a non-vintage Champagne had no ratings, while the evidence
  listed 328. r=16 made no such error on the same prompts.
- The single r=16 miss (power-critic, 1/40) gave no evidence tasting note ("polished but lighter
  notes") but stated nothing false.

## Caveats
- Training targets are template-generated, so the style is narrow. A richer target distribution
  (real reviews, many phrasings) may need more rank, so this result does not transfer to that case.
- One seed, 40 prompts per cell and 4 held-out wines. The 95% vs 100% gap is 2 replies.
- Train time includes evaluation passes. Peak VRAM is dominated by the frozen base model and
  activations, so rank barely changes it.

## Files
```
persona-power-critic-r16/  persona-power-critic-r4/
persona-crowd-taste-r16/   persona-crowd-taste-r4/
    adapter_config.json          PEFT config (r, alpha, target modules, base model)
    adapter_model.safetensors    LoRA weights (in the GitHub Release zip, not in git)
    train_log.json               hyperparameters, losses, data SHA-256, timing
eval_report.md                   metrics table + one example per condition
eval_replies.jsonl               every generated reply with its per-check results
```

## Reproduce
From `ai/lora` with the CUDA venv (see `../README.md`):
```bat
python make_dataset.py
.venv\Scripts\python train.py --persona power-critic --r 4 --alpha 8 --batch 2 --grad-accum 8 --out-dir rank_study --name-suffix=-r4
.venv\Scripts\python train.py --persona power-critic --r 16 --alpha 32 --batch 2 --grad-accum 8 --out-dir rank_study --name-suffix=-r16
.venv\Scripts\python serve.py --adapters-dir rank_study
.venv\Scripts\python eval.py --limit 40 --personas power-critic,crowd-taste --adapter-suffixes=-r16,-r4 --skip-base --report rank_study_eval
```
(The r=16 LoRAs here were trained by the same command into `adapters/` and copied.)
Use them in another project with PEFT:
```python
from peft import PeftModel
from transformers import AutoModelForCausalLM
base = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-1.5B-Instruct", dtype="bfloat16")
model = PeftModel.from_pretrained(base, "rank_study/persona-crowd-taste-r4")
```
