# CLAUDE.md — AI-7B (critic-debate LoRAs on Qwen2.5-7B)

Four fictional critic personas debate a bottle on the cellar-door display. Each persona is one LoRA on
`Qwen/Qwen2.5-7B-Instruct`. Facts (scores, prices, drink windows, tasting notes, crowd ranks) come from
retrieved evidence (RAG), which is appended to the backend's prompt. The LoRA supplies the voice and
how the persona argues from that evidence. Full history, decisions and measured numbers: `PLAN.md`.

## Status (2026-11-16)
| Done | Not done (next owner) |
| --- | --- |
| Real-evidence wine pool, teacher+verifier data, 4 LoRAs trained and evaluated (`eval/report.md`), vLLM serving with all 4 LoRAs (TTFT 0.05-0.07 s), weights in GitHub Release `lora-7b-2026-11-16` | 7B **gateway** (RAG step in front of vLLM), **`webos/backend` hookup** |

## Personas (`personas.json`)
| id | LoRA | Scale the verifier expects |
| --- | --- | --- |
| `power-critic` Victor Hale | `persona-power-critic` | `93-95 points` (range of 2-3) |
| `fruit-purist` Livia Moretti | `persona-fruit-purist` | `FQI 1.6` |
| `value-critic` Marcus Reed | `persona-value-critic` | `91 points and a value grade B+` |
| `crowd-taste` Jordan Reyes | `persona-crowd-taste` | `top 15% of 188` (only when crowd evidence ranks the bottle) |

All personas are fictional. Never put real critics, magazines or review sites in prompts, data, UI or
replies (`evidence7b.BANNED_NAMES`, enforced by `verify7b.py`).

## Files
| File | Role |
| --- | --- |
| `prompts.py` | Mirror of the backend debate prompt (`webos/backend/app/services.py`). `OMNICAVE_PERSONAS` picks the persona file |
| `check_prompt_sync.py` | Fails if `services.py` drifted from `prompts.py`. **A prompt change means re-generating data and retraining** |
| `evidence7b.py` | Evidence blocks: `block_for(persona_id, pool_row)`, `format_critic`, `format_crowd` |
| `build_xwines.py`, `sources/xwines_catalog_map.json` | X-Wines crowd evidence for the 20 catalog wines |
| `build_pool.py` | 440-wine pool with real evidence -> `data/pool.jsonl` (local, stdlib only) |
| `generate.py` + `verify7b.py` | Teacher (Qwen2.5-32B-AWQ) writes candidates; only verified replies are kept |
| `train.py` | PEFT LoRA trainer (r=16, alpha 32, unmerged) |
| `eval7b.py`, `serve_check7b.py` | Base vs LoRA scoring; streaming TTFT through `vllm serve` |
| `pod/*.sh` | Pod setup, background run/wait helpers, `train_all.sh`, `serve_check.sh` |

**Weights:** GitHub Release [`lora-7b-2026-11-16`](https://github.com/enkhbold0519/omnicave/releases/tag/lora-7b-2026-11-16),
`omnicave-lora-7b-r16.zip` (569 MB, SHA-256 `d3ad96804949f43420f81958a59262836ecb7cf1475d7918f567fa2a432e2c76`).
Unzip it into `AI-7B/` to get `adapters/<name>/`. On a pod:
`curl -L -o lora.zip https://github.com/enkhbold0519/omnicave/releases/download/lora-7b-2026-11-16/omnicave-lora-7b-r16.zip && unzip lora.zip -d /root/omnicave`.

Local only (gitignored): `adapters/`, `data/` (raw downloads in `data/raw/`, pool, train/eval sets), `eval/*.jsonl`,
`logs/`. The data is on Sungbin's PC and is not published, because it is built from research-only reviews. Rebuild it
if needed (see below).

## Serve the LoRAs on a RunPod pod (what "Sungbin starts the pod" means)
1. Pod: RunPod PyTorch template, container disk >= 40 GB, TCP 22 exposed. Register an SSH public key in RunPod
   first. The build ran on an A100. A 24 GB GPU (A5000, $0.27/h) should fit the bf16 7B model (~15 GB) plus 4 LoRAs,
   but that is an estimate, not tested.
2. Copy the `pod/` scripts to `/root/omnicave/` and download the weights there (command above). Then run
   `TEACHER=0 ./setup.sh`, which installs vllm in `/root/venv` and downloads only the 7B model.
3. Start vLLM with the 4 LoRAs (as in `pod/serve_check.sh`):
   ```bash
   vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000 --enable-lora --max-lora-rank 16 --max-loras 4 \
     --max-model-len 4096 --lora-modules persona-power-critic=/root/omnicave/adapters/persona-power-critic ...
   ```
4. **Only Terminate stops all billing.** A stopped pod still bills its disk, and Stop wipes the container disk,
   so copy anything you need first, then Stop and Terminate.

## Hooking it up to webOS (the remaining work)
1. **Gateway (RAG step).** vLLM only switches LoRAs; it does not add evidence. Put a small OpenAI-compatible
   proxy in front of it, on the pod:
   - Find the wine label: `prompts.parse_label(messages)`. Find the persona: `prompts.parse_persona(messages)`.
     The persona file must be `AI-7B/personas.json`.
   - Look up the pool row whose `label` equals the parsed label (`data/pool.jsonl`). Append
     `evidence7b.block_for(persona_id, row)` with `prompts.add_evidence`. Unknown wine: use `row = {}`, which
     gives the "no evidence" blocks.
   - Forward to vLLM and stream back. `AI-1.5B-Legacy/lora/serve.py` (`with_evidence`) is a working model of this
     step for the 1.5B PoC.
   - The appended prompt must be byte-identical to training (`messages[:2]` in `data/eval.jsonl`). Check it the
     way the PoC did (served prompt == training prompt for every eval row).
2. **`webos/backend`** (edit with the webos owner):
   - `personas.json` <- `AI-7B/personas.json`. Persona names must match, because the gateway reads them from the
     system prompt.
   - `app/services.py` `_mock_turn`: add `value-critic` and `crowd-taste` branches (mock mode prints the
     classicist's text for unknown ids).
   - `app/llm.py`: send a `VLLM_API_KEY` bearer token (today it sends `"EMPTY"`).
   - `.env`: `LLM_PROVIDER=vllm`, `VLLM_BASE_URL=<gateway>/v1`, `VLLM_BASE_MODEL=Qwen/Qwen2.5-7B-Instruct`.
   - Run `python -m tests.test_api` (it counts personas from `personas.json`).
3. **Reachability.** From the backend, use RunPod's HTTP proxy (`https://<pod-id>-<port>.proxy.runpod.net`) or a
   direct TCP port. Check that SSE streaming is not buffered. Keep the API key in the backend only, never in the
   display.

## Rebuild from scratch (measured: about 2 h on an A100, $4.45)
```bash
python build_xwines.py && python build_pool.py          # local, needs data/raw (see PLAN.md for sources)
# on the pod, files in /root/omnicave, scripts from pod/:
./setup.sh                                              # with the teacher model
./run.sh gen_full.log generate.py --debates-train 3 --debates-eval 1 --n 4
./train_all.sh                                          # rebalance -> train 4 LoRAs -> eval7b.py
./serve_check.sh                                        # vLLM + TTFT
```

## Easy to get wrong
- **An adapter only works on its base.** Use `Qwen/Qwen2.5-7B-Instruct` exactly. Keep `--max-lora-rank 16`.
- **Facts come from evidence only.** The verifier allows years, prices and tasting notes only if they appear in the
  prompt (evidence + earlier turns). Style words (rich, polished, ...) are opinion and are allowed.
- **Crowd numbers.** Compare only within the same region and grape; never use raw rating averages. The relation
  words ("above its peers") are written by retrieval, not decided by the model.
- **Pod shell.** Ubuntu 24.04 blocks system pip (PEP 668), so use `/root/venv`. vLLM needs `ninja` on `PATH`.
  `pgrep -f name` also matches your own SSH command, so use `pgrep -f "python name"`.
- **From Windows.** Shell scripts must be LF without BOM (`.gitattributes` handles checkout). `scp` with a
  destination ending in `\` fails; pass the folder without a trailing slash. Launch long jobs with
  `run.sh` (setsid + nohup) and wait with `wait.sh`, so the SSH session can close.
- **Data licensing.** The review data is a scraped mirror: research/class use only. Only aggregated numbers and
  keywords are used, never review text or reviewer names. X-Wines is CC0.
