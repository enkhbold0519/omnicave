# CLAUDE.md — AI-7B (critic-debate LoRAs on Qwen2.5-7B)

Four fictional critic personas debate a bottle in the apps' Sommelier table (display and Android). Each persona is one LoRA on
`Qwen/Qwen2.5-7B-Instruct`. Facts (scores, prices, drink windows, tasting notes, crowd ranks) come from
retrieved evidence (RAG), which is appended to the backend's prompt. The LoRA supplies the voice and
how the persona argues from that evidence. Full history, decisions and measured numbers: `PLAN.md`.

## Status (2026-11-18)
| Done | Not done |
| --- | --- |
| Real-evidence wine pool, teacher+verifier data, 4 LoRAs trained and evaluated (`eval/report.md`), vLLM serving with all 4 LoRAs (TTFT 0.05-0.07 s), weights in GitHub Release `lora-7b-2026-11-16` | Apps end to end against a live pod (only the backend's `llm.py` was checked) |
| Backend hookup (`backend/`): debate prompt shared by `/api/ai/dialogue` and the Sommelier table, 4 personas word for word, API key, silent fallback when the pod is off | |
| First live session (A40, vLLM 0.34.0): `gateway.py --check` 235/235, key enforced, all 4 personas stream with evidence through the RunPod proxy (first token 1.0-1.2 s) | |

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
| `prompts.py` | Mirror of the backend debate prompt (`backend/app/services.py`: `debate_label`, `debate_messages`). `OMNICAVE_PERSONAS` picks the persona file |
| `check_prompt_sync.py` | Fails if `services.py` drifted from `prompts.py`. **A prompt change means re-generating data and retraining** |
| `evidence7b.py` | Evidence blocks: `block_for(persona_id, pool_row)`, `format_critic`, `format_crowd` |
| `build_xwines.py`, `sources/xwines_catalog_map.json` | X-Wines crowd evidence for the 20 catalog wines |
| `build_pool.py` | 440-wine pool with real evidence -> `data/pool.jsonl` (local, stdlib only) |
| `generate.py` + `verify7b.py` | Teacher (Qwen2.5-32B-AWQ) writes candidates; only verified replies are kept |
| `train.py` | PEFT LoRA trainer (r=16, alpha 32, unmerged) |
| `eval7b.py`, `serve_check7b.py` | Base vs LoRA scoring; streaming TTFT through `vllm serve` |
| `gateway.py` | RAG step in front of vLLM (standard library only): adds the evidence block to debate prompts, passes everything else through. `--check` compares served prompts with `data/eval.jsonl` |
| `pod/*.sh` | Pod setup, background run/wait helpers, `train_all.sh`, `serve_check.sh`, `serve.sh` (vLLM + gateway for a test or demo session) |

**Weights:** GitHub Release [`lora-7b-2026-11-16`](https://github.com/enkhbold0519/omnicave/releases/tag/lora-7b-2026-11-16),
`omnicave-lora-7b-r16.zip` (569 MB, SHA-256 `d3ad96804949f43420f81958a59262836ecb7cf1475d7918f567fa2a432e2c76`).
Unzip it into `AI-7B/` to get `adapters/<name>/`. On a pod:
`curl -L -o lora.zip https://github.com/enkhbold0519/omnicave/releases/download/lora-7b-2026-11-16/omnicave-lora-7b-r16.zip && unzip lora.zip -d /root/omnicave`.

Local only (gitignored): `adapters/`, `data/` (raw downloads in `data/raw/`, pool, train/eval sets), `eval/*.jsonl`,
`logs/`. The data is on Sungbin's PC and is not published, because it is built from research-only reviews. Rebuild it
if needed (see below).

## Demo pod with a network volume (`pod/demo_up.sh`)
For demos, use one pod with a network volume on `/workspace` and **Stop** it between sessions, instead of
terminating it. The pod id, and so the proxy URL (`https://<pod-id>-8888.proxy.runpod.net/v1`), stays the
same, and the gateway key stays on the volume, so the backend `.env` is set once. RunPod's global volume is
S3-backed (geesefs: no chmod or executables), so it holds only `gateway_key`, `data/pool.jsonl` (copy it from
PC1) and logs. After each Start, run
`curl -sLO https://raw.githubusercontent.com/enkhbold0519/omnicave/main/AI-7B/pod/demo_up.sh && bash demo_up.sh`.
It installs vLLM and downloads the model and LoRAs into the container, which takes about 7.5 minutes on an A100.

## Serve the LoRAs on a RunPod pod (what "Sungbin starts the pod" means)
1. Pod: RunPod PyTorch template, container disk >= 40 GB, TCP 22 exposed. Register an SSH public key in RunPod
   first. The build ran on an A100. A 24 GB GPU (A5000, $0.27/h) should fit the bf16 7B model (~15 GB) plus 4 LoRAs,
   but that is an estimate, not tested.
2. Copy the `pod/` scripts to `/root/omnicave/` and download the weights there (command above). Then run
   `TEACHER=0 ./setup.sh`, which installs vllm in `/root/venv` and downloads only the 7B model.
3. Copy `gateway.py`, `prompts.py`, `evidence7b.py`, `personas.json` and `data/pool.jsonl` to `/root/omnicave/` too, expose
   **HTTP port 8001** on the pod, then start vLLM (local only, port 8000) and the gateway (port 8001):
   ```bash
   GATEWAY_API_KEY=<secret> ./serve.sh        # ./serve.sh stop  ends both
   ```
   Give the backend owner the address `https://<pod-id>-8001.proxy.runpod.net/v1` and the secret.
4. **Only Terminate stops all billing.** A stopped pod still bills its disk, and Stop wipes the container disk,
   so copy anything you need first, then Stop and Terminate.

## How the apps reach the LoRAs
```
apps -> backend (EC2) -> gateway.py (pod :8001) -> vLLM + 4 LoRAs (pod :8000)
```
1. **Backend** (`backend/`), with `LLM_PROVIDER=vllm`, `VLLM_BASE_URL=<gateway>/v1`, `VLLM_API_KEY=<secret>`,
   `VLLM_BASE_MODEL=Qwen/Qwen2.5-7B-Instruct` in `deploy/.env` (then `docker compose up -d`):
   - `/api/ai/dialogue` sends the debate prompt for every persona in `backend/personas.json`.
   - `/api/ai/table` (what the apps use) sends the same debate prompt for a built-in persona that has a
     `lora_adapter`, on a wine topic, **until the owner writes something**. From then on, and for questions
     ("what to open tonight") and the user's own sommeliers, it sends the table prompt to the base model: the LoRAs
     were trained on debates only and ignore questions.
   - When a LoRA turn states "NN points", the backend adds the table's closing line (`Score: … Peak: …`) so the
     apps show the badge. FQI and crowd ranks get no badge.
   - Pod off or unreachable: the mock answer is shown without an error text and the server is skipped for 60 s.
     `GET /api/health` -> `llm.last_error` tells whether the last request reached the pod.
   - `backend/personas.json` holds the four personas word for word (name, title, philosophy, `lora_adapter`), each with
     the table's `traits` block added. `backend/tests/test_ai.py` fails if they drift from `personas.json` here.
2. **Gateway** (`gateway.py`, on the pod): finds the wine (`prompts.parse_label`) and the persona
   (`prompts.parse_persona`, from `AI-7B/personas.json`), looks up the pool row whose `label` equals the parsed
   label and appends `evidence7b.block_for(persona_id, row)`. Unknown wine or missing `pool.jsonl`: `row = {}`, the
   "no evidence" blocks. Before the first session run `python gateway.py --check`: the served prompt must be
   byte-identical to training for every row of `data/eval.jsonl`.
3. **Reachability.** RunPod's HTTP proxy (`https://<pod-id>-8001.proxy.runpod.net`). Check on the first session that
   SSE streaming is not buffered (answers must arrive word by word). Keep the API key in the backend only, never
   in the apps. The pod address changes with every new pod, so `VLLM_BASE_URL` has to be set again each time.

## Drinking-window estimates and notes (`backend/app/drinking.py`, 2026-11-25)
Ground truth: the drink windows that reviews state, parsed from all 81k reviews by `drink_data.py`. The
OpenML mirror lost the dash in ranges ("Drink 20192031"). This gives 13,561 wines, 2,841 of them with both years.
Split by producer 80/20: `data/drink_{train,eval}.jsonl`.

| Step | File | Result on 2,730 held-out wines (year 2026) |
| --- | --- | --- |
| Old rule, vintage +2 to +12 | | start MAE 3.85 y, status match 69.2 % |
| Aging table (served) | `drink_table.py` -> `backend/app/aging_table.json` | start MAE 1.27 y, status 87.5 % |
| Qwen base + table evidence | `drink_llm.py predict` | copies the table (87.3 %) |
| LoRA `drink-window` (A40, 29 min) | `drink_llm.py data` + `train.py` | start 1.20 y, end MAE 4.91 -> 3.98 y, status 84.2 %; **not served** |
| Explanation, Qwen base + RAG (served) | `drink_notes.py` -> `aroma_table.json`, `drink_explain.py` | 137/137 pass `check_explanation()` |

- The table's end year is start + window length (both-year reviews only). "Drink now through X" is written
  for wines that are ready now, so the "to" median alone is biased short.
- Known gap: fortified wines, sweet wines and top Bordeaux. Port is missing from the data, and Bordeaux is mostly
  cheap wines (Léoville Barton gets 2019–2026, while the catalog says 2028–2050). The LoRA did not fix this.
- Mature-stage keywords are thin, because most reviews are written at release. Cells fall back to grape or color level.
- LoRA weights are kept for the record only: `adapters/drink-window.tgz` (local, sha256 `8d6a670c…`). The train log is
  in `logs/drink-window_train_log.json`.
- Rebuild: `python drink_data.py && python drink_table.py && python drink_notes.py` (needs the arff in
  `data/raw/`), then `python eval_drinking.py`.

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
- **RunPod template nginx.** The PyTorch template's nginx listens on 8001 and forwards to :8000 without a key.
  `serve.sh` moves it to `127.0.0.1:18001` before starting; without that, vLLM is public and the gateway cannot bind.
- **RunPod proxy and User-Agent.** The proxy answers 403 to `Python-urllib/*`. Clients must send their own
  User-Agent (`backend/app/llm.py` sends `omnicave-backend/1.0`).
- **Pod shell.** Ubuntu 24.04 blocks system pip (PEP 668), so use `/root/venv`. vLLM needs `ninja` on `PATH`.
  `pgrep -f name` also matches your own SSH command, so use `pgrep -f "python name"`.
- **From Windows.** Shell scripts must be LF without BOM (`.gitattributes` handles checkout). `scp` with a
  destination ending in `\` fails; pass the folder without a trailing slash. Launch long jobs with
  `run.sh` (setsid + nohup) and wait with `wait.sh`, so the SSH session can close.
- **Data licensing.** The review data is a scraped mirror: research/class use only. Only aggregated numbers and
  keywords are used, never review text or reviewer names. X-Wines is CC0.
