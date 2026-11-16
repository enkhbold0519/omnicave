# OmniCave critics on Qwen2.5-7B (RunPod)

Goal: move the persona LoRA + RAG pipeline from the 1.5B PoC (`ai/lora/`) to
`Qwen/Qwen2.5-7B-Instruct` on a rented RunPod GPU, with four base personas, better training data
and vLLM serving that the webOS backend can reach. Reuse `ai/lora/` code; `AI-7B/` holds only what
differs for 7B and RunPod.

Requirements: paper FR "Cloud-Powered Multi-Agent LLM Dialog System" (central base model, no
aggressive quantization, server-side dynamic LoRA swapping, persona expansion without appliance
changes) and NFR "first dialogue response <= 1.5 s, streamed".

## Personas (all fictional; real critics and publications are never named in prompts or data)
| # | id (proposal) | Name (proposal) | Style | Evidence it reads |
| --- | --- | --- | --- | --- |
| 1 | `power-critic` | Victor Hale (exists) | 100-point power/ripeness scorer, favours France (Bordeaux, Rhône) | critic consensus by appellation + grape |
| 2 | `fruit-purist` | Livia Moretti (exists) | fruit-quality index, favours Italy | critic consensus + fruit descriptors |
| 3 | `value-critic` | new name | 100-point magazine-style score plus value: price vs peers, drink window, availability | critic points vs price within the same region and grape |
| 4 | `crowd-taste` | Jordan Reyes (exists) | everyday drinkers, peer-relative only | X-Wines peer ranking (as in the PoC) |

"Favours France/Italy" means a declared bias the persona states openly (for example "as a Bordeaux
lover..."). It must not change facts.

## What changes from the 1.5B PoC (and why)
1. **Base model**: Qwen2.5-7B-Instruct, bf16, no quantization (paper NFR). LoRA r=16 on the same 7
   modules; the rank study showed r=4 already loses some fact handling.
2. **Training data**: templates taught format only. 7B can learn real variety, so the targets come
   from a **teacher model with a verifier**: a larger open model on the same pod writes persona
   replies from the evidence, and the PoC's grounding checks (scale, years, notes, claims) keep only
   replies that pass. Seed examples per persona steer the style.
3. **Critic evidence becomes real**: the WineEnthusiast 2017-2020 reviews (OpenML mirror, research
   use only) give appellation + grape level facts: points distribution, price, common descriptors and
   stated drink-by years. Bottle-level critic data stays out of scope until a licensed source exists.
4. **Serving**: vLLM `--enable-lora` with all 4 LoRAs resident, plus the PoC gateway (`serve.py`) in
   front of it for the RAG step, both on the pod, behind one URL with an API key.

## Phases

### Phase 0: RunPod setup
Verified when: a pod reaches Hugging Face, vLLM serves the base 7B model, and TTFT is measured.
#### Step 0.1: Pod + network volume (Size: S)
- Acceptance: RTX A6000 48 GB pod created by the user (RunPod PyTorch template, container disk 80 GB,
  TCP 22 exposed, public key `~/.ssh/id_ed25519_runpod.pub` registered); Claude connects over SSH.
  No network volume during the build.
- Verification: `nvidia-smi`; `python -c "import torch; print(torch.cuda.get_device_name(0))"`
- Blocked by: none
#### Step 0.2: Baseline serving (Size: S)
- Acceptance: `vllm serve Qwen/Qwen2.5-7B-Instruct` streams a debate turn; license file checked
  (Apache-2.0); TTFT logged.
- Verification: `AI-7B/smoke_vllm.py`
- Blocked by: 0.1

### Phase 1: Real evidence
Verified when: every catalog wine has a critic block from real reviews (or an explicit "none").
#### Step 1.1: `build_critic_evidence.py` (Size: M)
- Acceptance: from the WineEnthusiast reviews, per (region/appellation, grape): review count, points
  median and IQR, price median, top descriptors, and the drink-by years that reviews state. No review
  text is copied, and no taster names are kept.
- Verification: `python AI-7B/build_critic_evidence.py --check`
- Blocked by: none (runs locally)
#### Step 1.2: Value signal (Size: S)
- Acceptance: for the value persona, points vs price percentile within the same region and grape.
- Verification: unit asserts in the script
- Blocked by: 1.1

### Phase 2: Data (teacher + verifier)
Verified when: at least 1,000 verified samples per persona, with held-out wines kept out.
#### Step 2.1: Persona cards + seeds (Size: S)
- Acceptance: one card per persona (philosophy, scale, bias, banned phrases, no real names) and
  10-20 hand-checked seed replies.
- Verification: review by the user
- Blocked by: decision D1, D2
#### Step 2.2: Wine pool (Size: M)
- Acceptance: the catalog's 20 wines plus a wider pool from X-Wines/WineEnthusiast (several hundred
  wines), so the LoRA does not memorize 20 bottles. Held-out wines and regions are kept for eval.
- Verification: split report
- Blocked by: 1.1
#### Step 2.3: `generate.py` + `verify.py` (Size: M)
- Acceptance: the teacher (decision D4) writes N candidates per prompt. The PoC grounding checks plus
  new checks (bias stated only as opinion, no real names) filter them. The pass rate and rejection
  reasons are logged.
- Verification: `python AI-7B/verify.py --report`
- Blocked by: 0.2, 2.1, 2.2

### Phase 3: Training
Verified when: 4 LoRAs exist with eval loss below the step-0 baseline and no OOM.
#### Step 3.1: Train (Size: S)
- Acceptance: `ai/lora/train.py` reused with `--model Qwen/Qwen2.5-7B-Instruct` (batch/accum tuned to
  the GPU); hyperparameters reported to the user before the full run.
- Verification: 20-step dry run, then full runs; `train_log.json` per persona
- Blocked by: 2.3

### Phase 4: Serving + app
Verified when: the webOS display shows a 4-persona debate from RunPod.
#### Step 4.1: vLLM + gateway on the pod (Size: M)
- Acceptance: `vllm serve ... --enable-lora --lora-modules <4> --max-lora-rank 16 --max-loras 4`;
  `serve.py` gains a vLLM engine option (proxy instead of local transformers); one public URL with an
  API key; Critic Lab works from the laptop.
- Verification: `ai/lora/serve_check.py --url <pod>/v1`
- Blocked by: 3.1
#### Step 4.2: Backend hookup (Size: S)
- Acceptance: `webos/backend/app/llm.py` sends `VLLM_API_KEY` (today it sends "EMPTY"), and
  `personas.json` gets the 4 base personas. These are `webos/` edits, so they need decision D5.
- Verification: `python -m tests.test_api`; display check on the emulator
- Blocked by: 4.1, D5

### Phase 5: Evaluation
Verified when: a report compares 1.5B PoC vs 7B, base vs LoRA, on held-out wines.
#### Step 5.1: `eval.py` reuse + style metrics (Size: S)
- Acceptance: PoC metrics plus diversity (distinct n-grams), persona separability (a classifier on
  replies) and TTFT per turn.
- Verification: `AI-7B/eval/report.md`
- Blocked by: 4.1

## Decision log
| Decision | Chosen option | Why |
| --- | --- | --- |
| Folder | `AI-7B/` at the repo root (user, 2026-11-16) | Keeps the 7B work apart from the PoC |
| Base model | Qwen2.5-7B-Instruct, bf16 | Same family and template as the PoC; paper asks for no aggressive quantization |
| LoRA rank | r=16, alpha 32 | Rank study: r=4 kept style but made 2/40 factual slips |
| Personas | Fictional names and wording only | CLAUDE.md rule; avoids controversy and copyright |
| D1 Persona set | 4 only: Victor, Livia, new value critic, Jordan; Eleanor leaves `personas.json` (user, 2026-11-16) | The user's list |
| D2 Language | English (user) | Matches the backend prompt and the paper; direct comparison with the PoC |
| D4 Teacher | Qwen2.5-32B-Instruct on the pod (user) | Open weights; license checked again before download |
| D6 Pod access | Claude runs commands over SSH from this PC (user) | The user only creates the pod and registers the public key |

| D3 GPU | Build on **RTX A6000 48 GB ($0.69/h)**; demo on **RTX A5000 24 GB ($0.27/h)** | Budget is $48 total and must also cover demos (user). A40 ($0.59/h) was out of capacity on 2026-11-16; A6000 is the same Ampere 48 GB class. A100 80 GB is $2.09/h |
| D3 Teacher size | `Qwen/Qwen2.5-32B-Instruct-AWQ` (4-bit, ~19 GB, Apache-2.0) | Fits the A40 next to the 7B; the quantized teacher only writes candidates that the verifier filters |
| Standing approvals (user, 2026-11-16, before going away) | Deploy in this order: A6000, A40, L40S, A100 80 GB. No "deploy when available" subscriptions. Downloads: Qwen2.5-7B-Instruct, Qwen2.5-32B-Instruct-AWQ, PyPI packages. Uploads: `ai/data` evidence. Copy the LoRAs back. Terminate the pod only after the copies are hash-verified. Cost cap $15: on reaching it, copy results, stop and terminate. Push code to branch `ai-7b` (no PR or Release without asking) | The user asked for all permissions up front |
| D5 webos edits | Deferred: build the AI first, change `llm.py`/`personas.json` later (user) | Step 4.2 waits; Critic Lab is the demo surface until then |

## Budget ($48 RunPod credit; Secure Cloud prices checked 2026-11-16)
| Item | GPU | Hours (estimate) | Cost (estimate) |
| --- | --- | --- | --- |
| Setup + downloads (7B 15 GB, 32B-AWQ 19 GB) | A6000 | 0.5 | $0.35 |
| Teacher generation + verify (about 6,000 candidates) | A6000 | 1.0-1.5 | $0.70-1.05 |
| 4 LoRA trainings (7B, r=16, about 1,000 samples each) | A6000 | 2.0-3.0 | $1.40-2.10 |
| Serving check + eval | A6000 | 0.5-1.0 | $0.35-0.70 |
| **Build total** | | **4-6 h** | **$2.80-4.10**, with a 2x buffer $6-9 |
| Each demo hour | A5000 | 1.0 | $0.27 |
Storage is the hidden cost: an idle volume disk bills $0.20/GB/month even while the pod is stopped.
So the build pod is **terminated** (not stopped) after the LoRAs and data are copied back. Demo pods
download the 7B model (~15 GB, a few minutes) at start, or use a 20 GB network volume ($1.40/month).
All hour figures are estimates and are replaced with measured times as phases finish.

## Not yet specified
- Phase 4: the exact RunPod proxy URL format and whether streaming passes through it unbuffered.
  This is checked in step 0.2.
- Drinking-window predictor (a model trained on WineEnthusiast drink-by labels): fog. It is a
  separate plan after this one.

## Always / Never
- Always: fictional personas; facts only from retrieved evidence; held-out wines out of training;
  weights and data outside git; stop the pod when idle.
- Never: real critic or publication names in prompts, data or UI; copying review text into training
  targets; hypervisor/WSL on the local PC; API keys in the display app.

## Progress
| Phase | Status |
| --- | --- |
| 0 RunPod setup | done 2026-11-16. A6000/A40 were out of capacity, so the user deployed **A100 SXM 80 GB ($2.20/h)**. Setup took 4.5 min: torch 2.14.0+cu130, transformers 5.20.2, peft 0.21.3, vllm 0.33.0 (+ ninja); both models Apache-2.0 (`logs/setup.log`, `logs/pip-freeze.txt`) |
| 1 Real evidence | done: `build_pool.py` -> 440 wines (300 review bottles, 120 X-Wines, 20 catalog), 67 held out; 370 critic and 138 crowd evidence blocks; 61 reviews state a drink window |
| 2 Data | done: teacher Qwen2.5-32B-AWQ, n=4, verified. Kept turns: power 1112, fruit 1065, value 1060, crowd 892. After capping crowd turns without evidence at 35%, train: 1048 / 1004 / 999 / 227; eval: 64 / 61 / 61 / 49 |
| 3 Training | done: r=16, alpha 32, lr 2e-4, 3 epochs, batch 8x2, max length 1536. Eval loss: power 1.59 -> 0.65, fruit 1.72 -> 0.70, value 1.42 -> 0.59, crowd 1.29 -> 0.58. 3-11 min each, peak 23-27 GiB. Epoch 3 was slightly worse than epoch 2 for all four (mild overfit) |
| 4 Serving + app | vLLM serve with 4 LoRAs: TTFT 0.05-0.07 s per persona. Gateway/Critic Lab for 7B and the `webos` hookup are not done (deferred, D5) |
| 5 Evaluation | done (`eval/report.md`): all checks pass, LoRA vs base on 40 held-out prompts each: power 100% vs 0%, fruit 100% vs 0%, value 100% vs 0%, crowd 98% vs 28% |
| Wrap-up | 25 result files copied and SHA-256 verified (`logs/manifest.sha256`); pod stopped and terminated; total RunPod cost $4.45 (balance $43.55) |
