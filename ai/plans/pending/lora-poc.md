# Persona LoRA PoC (local, Windows-native)

Goal: prove the whole persona-LoRA path on the local PC before renting a RunPod GPU.
The path is: template dataset -> LoRA training -> OpenAI-compatible server with per-request
adapter switching -> the existing webOS backend debate (`LLM_PROVIDER=vllm`).
PoC answer quality is not the goal. The scripts, data format and backend contract are, because
they carry over unchanged to the 7B run on RunPod.

Requirements: paper FR "Cloud-Powered Multi-Agent LLM Dialog System" (server-side dynamic LoRA
swapping, continuous persona expansion) and NFR "Multi-Agent LLM Dialogue Response Latency"
(first response <= 1.5 s, streamed).

## Ground truth (checked 2026-11-11)
- GPU: RTX 3070 Ti, 8 GB VRAM, driver 610.88. Disk: C 115 GB free, D 1136 GB free.
- No hypervisor on this PC: WSL2, Docker Desktop and vLLM are off the table locally.
- Python: 3.14 global (torch 2.14.1 **+cpu**, so it cannot train on the GPU), 3.12/3.13/3.10 installed.
- Backend debate prompt: `services.ai_dialogue` (`webos/backend/app/services.py:490`). System =
  persona name, title, philosophy + "Stay in character. 2-3 sentences..." + `LANG_HINT`; user =
  wine label + owner context + debate transcript; `max_tokens=180`. The user turn is English, so
  replies come out in English.
- Backend client: `llm.stream_chat` sends `model=<lora_adapter>` to `VLLM_BASE_URL`
  (default `http://localhost:8001/v1`) and parses OpenAI SSE (`choices[0].delta.content`, `[DONE]`).
- Adapter names come from `webos/backend/personas.json`: `persona-power-critic`,
  `persona-fruit-purist`, `persona-classicist`.
- Wine facts: `webos/backend/app/catalog.py` (`CATALOG`, about 17 wines).

## Ownership boundary
`webos/` may be edited by other team members, so this PoC lives in `ai/` and **does not edit
anything under `webos/`**. It only reads `webos/backend/personas.json` and
`webos/backend/app/catalog.py`, and talks to the backend through its existing OpenAI-compatible
contract. Local backend config (`webos/backend/.env`, never committed) is the only thing set
for the end-to-end check.

## Phases

### Phase 1: Environment and base model
Verified when: a CUDA venv runs the base model on the GPU and streams a reply.
Files to touch: `ai/lora/requirements.txt`, `ai/lora/README.md`, `ai/lora/smoke.py`, `.gitignore`

#### Step 1.1: CUDA venv (Size: S)
- Acceptance: Python 3.12 venv at `ai/lora/.venv`; `torch.cuda.is_available()` is True;
  exact versions pinned in `requirements.txt`.
- Verification: `.venv\Scripts\python -c "import torch; print(torch.cuda.get_device_name(0))"`
- Blocked by: none (needs approval: about 3 GB of downloads)

#### Step 1.2: Base model smoke test (Size: XS)
- Acceptance: `Qwen/Qwen2.5-1.5B-Instruct` loads in bf16 on the GPU; license file confirmed
  Apache-2.0; one chat reply generated.
- Verification: `python smoke.py`
- Blocked by: 1.1

### Phase 2: Prompt mirror and template dataset
Verified when: training samples use exactly the message layout the backend sends.
Files to touch: `ai/lora/prompts.py`, `ai/lora/check_prompt_sync.py`, `ai/lora/make_dataset.py`

#### Step 2.1: Prompt mirror + sync check (Size: S)
- Acceptance: `prompts.critic_messages(persona, label, owner_ctx, transcript)` reproduces the
  backend's debate messages. `check_prompt_sync.py` reads `webos/backend/app/services.py` and
  fails if the template strings or `LANG_HINT` differ, so a teammate's prompt edit is caught
  before training.
- Verification: `python check_prompt_sync.py`
- Blocked by: none

#### Step 2.2: Template dataset generator (Size: M)
- Acceptance: `data/train.jsonl` and `data/eval.jsonl` in chat-messages form, about 300 samples
  per persona, built with `critic_messages()`. Targets are generated from persona rules
  (100-point / fruit-quality index / 20-point scale, tone, aging logic from drink_from/drink_to)
  with varied phrasing. Eval wines are held out of train. Every fact comes from `CATALOG`.
- Verification: `python make_dataset.py --check` (counts, held-out split, scale regex on targets)
- Blocked by: 2.1

### Phase 3: Training
Verified when: three adapters exist and eval loss drops versus step 0.
Files to touch: `ai/lora/train.py`

#### Step 3.1: `train.py` (Size: M)
- Acceptance: PEFT LoRA (r=16, alpha=32, dropout 0.05, all linear proj); loss on assistant
  tokens only; bf16 + gradient checkpointing, fits in 8 GB. One run per persona writes
  `adapters/<persona-id>/` (unmerged, about 40 MB each).
- Verification: `python train.py --persona power-critic --max-steps 20` (dry run), then full runs.
- Blocked by: 1.2, 2.2

### Phase 4: Serving
Verified when: the backend debate streams three different LoRA voices.
Files to touch: `ai/lora/serve.py`, `ai/lora/serve_check.py`

#### Step 4.1: `serve.py` (Size: M)
- Acceptance: FastAPI on :8001 with `GET /v1/models` (base + 3 adapters) and
  `POST /v1/chat/completions` (stream + non-stream). `model=<adapter>` -> `set_adapter`;
  `model=<base>` -> adapter disabled. The base is loaded once and all adapters stay resident.
  A lock serializes generation. The SSE format matches what `llm.py` parses.
- Verification: `python serve_check.py` (streams each adapter with the same SSE parsing as
  `llm.py`; asserts streamed text, distinct outputs per adapter, TTFT printed)
- Blocked by: 3.1

#### Step 4.2: End-to-end in the app (Size: XS)
- Acceptance: with `LLM_PROVIDER=vllm` in the local `webos/backend/.env`, the display's critic
  debate shows LoRA output and the `LoRA: persona-...` tags. No file under `webos/` is changed.
- Verification: manual check in the display (user), plus the backend log.
- Blocked by: 4.1

### Phase 5: Evaluation
Verified when: a short report compares prompt-only with prompt+LoRA on the held-out wines.
Files to touch: `ai/lora/eval.py`

#### Step 5.1: `eval.py` (Size: S)
- Acceptance: for each held-out sample, run base (adapter disabled) and the persona adapter.
  Report scale adherence %, fact consistency (vintage/producer match CATALOG), mean/p95 TTFT,
  and reply length. Results go to `ai/lora/eval/report.md`.
- Verification: `python eval.py`
- Blocked by: 4.1

## Decision log
| Decision | Chosen option | Why |
| --- | --- | --- |
| Where to run the PoC | Local PC first, RunPod for the 7B run | Debugging on paid GPU time wastes the professor's budget |
| Folder | Top-level `ai/`, no edits under `webos/` | Other members may edit `webos/` (user, 2026-11-11) |
| Prompt source of truth | Mirror in `ai/lora/prompts.py` + sync check against `services.py` | Keeps `webos/` untouched while catching prompt drift |
| PoC training data | Template-generated from `CATALOG` + persona rules | PoC verifies the pipeline, not quality (user, 2026-11-11) |
| Serving stack (local) | Own FastAPI + transformers + PEFT server | vLLM is Linux-only and WSL breaks this PC's boot; same OpenAI contract as vLLM, so the backend is unchanged |
| PoC base model | Qwen2.5-1.5B-Instruct (Apache-2.0) | Same family and chat template as the planned 7B; fits 8 GB in bf16 without quantization |
| Adapters | Unmerged, one per persona | Merging would create 3 full models and break dynamic swapping |
| Who does what | Claude writes all scripts and sets the hyperparameters; the user runs training | User, 2026-11-12: "set the hyperparameters yourself and just tell me" |

## Training hyperparameters (initial, set by Claude, revised after the dry run)
| Parameter | Value | Why |
| --- | --- | --- |
| LoRA rank r / alpha | 16 / 32 | Common starting point; alpha = 2r keeps the update scale near 2 |
| LoRA dropout | 0.05 | Light regularization for a small, repetitive template dataset |
| Target modules | q, k, v, o, gate, up, down proj (all 28 layers) | Style lives in both attention and MLP; about 18.5M trainable params (1.2%) |
| Learning rate / schedule | 2e-4, cosine, warmup 3% | Standard LoRA range; warmup avoids early spikes |
| Epochs | 3 | About 300 samples per persona; watch eval loss for overfitting on templates |
| Batch | 2 per step x 8 grad accumulation = 16 (was 4 x 4 until 2026-11-13) | 4 x 4 overflowed 8 GB once prompts reached 750 tokens (4th speaker), spilling into system RAM at ~2.5 min/step; same effective batch |
| Max sequence length | 768 tokens | Prompt with debate transcript (about 300-500) + reply (max 180) |
| Precision | bf16 weights and compute | Ampere supports bf16; no quantization needed at 1.5B |
| Loss | Assistant tokens only | The model should learn the reply, not to echo the prompt |
| Seed | 42 | Reproducible runs |

### Rank study and release (2026-11-13)
- Fixed the crowd wording: retrieval now writes the relation ("above its peers") into the evidence,
  and crowd-taste was retrained. Eval: all 4 personas 100% on every metric (`eval/report.md`).
- Rank study (`ai/lora/rank_study/`, user request, kept for another project): power-critic and
  crowd-taste at r=4/alpha 8 vs r=16/alpha 32. r=4 has 1/4 of the parameters (17.7 MB vs 70.5 MB)
  and trains in about half the time. Same style metrics; higher eval loss; 2/40 factual misses for
  crowd r=4 (says an N.V. wine is unrated). `claims_match` now checks that claim, and the sentence
  counter ignores "N.V.". `eval.py --rescore` re-grades saved replies.
- Critic Lab web page (`web/index.html`, served by `serve.py`); not yet checked live.
- LoRA weights are published as GitHub Release assets (pre-release `lora-poc-2026-11-13`):
  `omnicave-lora-r16.zip` and `omnicave-lora-rank-study.zip`. The GitHub CLI is the portable build
  in %LOCALAPPDATA%\gh-portable, because the MSI install needed a UAC click that Remote Control
  cannot give.

## Not yet specified
- Gate answers still open: weight source (HF Hub or ModelScope), reply language.
- RunPod phase: base model (Qwen2.5-7B-Instruct or a newer Qwen), GPU type, budget, vLLM flags,
  `VLLM_API_KEY` support in the backend, and a real health check for `provider_info()`. These
  touch `webos/backend`, so they need the backend owner's agreement. Planned after this PoC.
- Real training data for quality (hand-written, teacher model, or mixed): fog, decided after the
  PoC shows what template data can and cannot teach.
- Persona separability metric (judge model or classifier): fog.

## Always / Never
- Always: the backend's OpenAI-compatible contract is kept; personas stay fictional; adapters,
  datasets, model weights and `.venv` are gitignored.
- Never: edits under `webos/`; WSL, Hyper-V, Docker Desktop or other hypervisor features on this
  PC; real critics' names or reviews in training data; Hugging Face Inference Providers.

## Progress
| Phase | Status |
| --- | --- |
| 1 Environment | venv done (torch 2.14.1+cu132, CUDA OK); smoke.py passed 2026-11-12 (Apache-2.0, TTFT 0.469 s, peak VRAM 2.90 GiB) |
| 2 Prompt + dataset | done: check_prompt_sync OK (drift test fails as expected); 304 train / 40 eval per persona, --check OK |
| 3 Training | first dry run OK 2026-11-13 on the old dataset (20 steps: eval loss 2.06 -> 0.50, 307 s, peak 5.77 GiB, LoRA file 70.5 MB fp32). RAG dataset built and checked (105/912 training debates without evidence). RAG dry run OK (20 steps: eval loss 1.91 -> 0.24, 481 s, peak 6.47 GiB). Full run done 2026-11-13 (run by Claude at the user's request): eval loss power 1.91 -> 0.094, fruit 2.77 -> 0.109, classicist 2.99 -> 0.101; about 20-22 min each; peak VRAM 6.47 / 7.02 / 7.45 GiB (classicist close to the 8 GB limit) |
| 4 Serving | serve.py + serve_check.py OK with the first dry-run LoRA (TTFT 0.69 s, 404 fallback works). RAG step added; served prompt equals training prompt for 120/120 eval rows. RAG dry-run LoRA on a held-out wine: scale, sentences, years and notes all grounded (TTFT 0.60 s); the base model with the same evidence ignored it. App check pending |
| 5 Evaluation | done 2026-11-13, `ai/lora/eval/report.md`: LoRA+RAG 100% on scale, sentences, years and notes for all 3 personas (classicist uses_evidence 95%), 0% scale leak; base+RAG 0-15% scale, 5-25% sentences, up to 45% leak. TTFT 0.13-0.15 s mean. Caveats: template data (low diversity), only 4 held-out wines, the notes metric only sees descriptors in our vocabulary (so base hallucination is undercounted), no no-evidence cases in eval |

### Finding 2026-11-13: targets teach facts the prompt does not contain
The backend label has producer, name, vintage, region, grape and color, but **no drinking
window**. The template targets quote `drink_from`/`drink_to` from the catalog, so the model
learns to state window years it cannot see. On a held-out wine the dry-run adapter said "will
hold to 2035"; the catalog says 2029. Options: (a) the backend adds the window to the label
(edit in `webos/`, needs the owner's agreement); (b) targets derive the window only from what
the prompt shows (vintage + grape/color aging rule). Decision pending with the user.

**Decision 2026-11-13 (user): RAG + LoRA.** Rule-based facts are rejected; the point of the AI
is to ground each bottle's evaluation in retrieved evidence (CellarTracker-style community notes,
sommelier/critic evaluations). LoRA learns persona style and how to interpret evidence; facts
come from retrieval at inference time.
- `ai/lora/evidence.py`: retrieval interface. In the PoC it is a **simulated** store for the 20
  catalog wines (window, critic consensus, community average, tasting notes), clearly labelled
  as simulated. Real connectors come later, after checking each source's terms of use.
- `serve.py` finds the wine in the backend's debate prompt (`prompts.parse_label`) and appends
  the evidence block (`prompts.add_evidence`). The backend and `webos/` stay unchanged.
- Dataset: the prompt includes the evidence block, and targets use only evidence facts for dates
  and tasting notes. Evidence values are perturbed per sample so the model reads instead of
  memorizing; about 10% of samples have no evidence, and their targets state no dates.
- Eval: base + RAG vs LoRA + RAG on held-out wines; facts must match the served evidence.

### Real data, step 1 (2026-11-13): X-Wines
- Downloaded into `ai/data/raw/` (gitignored): X-Wines Full wines (4.4 MB zip) and ratings
  (297 MB zip, 21M rows), CC0-1.0, from the authors' official Google Drive; and the OpenML mirror
  of WineEnthusiast 2017-2020 (41.7 MB ARFF, 81,115 reviews, uploader-labelled CC0 but scraped from
  winemag.com, so treat it as research-only). Kaggle needs the user's login, so it was skipped.
- `sources/xwines_catalog_map.json`: hand-reviewed mapping, 18/20 catalog wines (François Cotat and
  the Ridge Napa Cabernet have no true match). `build_xwines.py` -> `ai/data/xwines_evidence.json`
  with real ratings, body, acidity, pairings and type percentile.
- X-Wines ratings stop in 2022, so 2021-2023 vintages have no vintage-level ratings; evidence
  must fall back to the all-vintage average and say so.
- WineEnthusiast matches only 3 catalog wines (no same vintage), so it is not bottle-level
  evidence here. 15.5% of its reviews (12,590) state a drink-by year, which makes them training
  labels for a drinking-window predictor.
- Decision 2026-11-13 (user): no raw rating averages. Raw stars are not comparable across
  regions and grapes, so `build_xwines.py` only exports a peer-relative signal: same X-Wines region,
  primary grape and type, at least 30 ratings per wine and at least 5 peers (16/18 mapped wines
  qualify). Critic-side facts should come from RAG over real sommelier/critic evaluations.
- Decision 2026-11-13 (user): added persona `crowd-taste` (Jordan Reyes, "Crowd-Taste Tracker",
  LoRA `persona-crowd-taste`) to `webos/backend/personas.json`; it speaks fourth. `tests/test_api.py`
  now compares turn count with personas.json instead of a hard-coded 3; ALL TESTS PASSED.
- Known gap: in mock mode, `services._mock_turn` has no branch for `crowd-taste`, so it falls back
  to the classicist's text (17.5/20). Fixing it means a `webos/backend/app/services.py` edit.
- Done 2026-11-13: per-persona evidence (`evidence.block_for`; the server detects the persona from
  the system prompt, so the base model gets the same block). Jordan's templates added; 160/160 eval
  prompts match. `persona-crowd-taste` was trained with batch 2 x grad-accum 8 because batch 4
  overflowed 8 GB VRAM (Jordan's prompts reach 750 tokens) and spilled into system RAM (~2.5 min/step).
  Result: eval loss 2.47 -> 0.032, 13 min, peak 5.85 GiB. Eval with 4 personas (`eval/report.md`):
  LoRA+RAG 100% on every metric; base+RAG for crowd-taste: scale 50%, years 25%, notes 10%.
- Found in eval: (1) the critics' simulated block still has a raw "Community average" line, and
  Livia's template quotes it ("community average of 87.9"). That contradicts the no-raw-averages
  decision; removing it means retraining the 3 critic LoRAs. (2) The near/above rule for Jordan
  slipped once: the LoRA said "right around its neighbours" at +0.17 (the rule is |delta| < 0.1).
  No metric checks this yet.
- Fixed 2026-11-13 (user approved): removed the raw "Community average" line from the critics'
  simulated evidence and Livia's template; retrained the 3 critics with batch 2 x 8 (eval loss
  power 1.94 -> 0.086, fruit 2.81 -> 0.100, classicist 2.96 -> 0.097; peak 4.8-5.2 GiB, no OOM).
  Added the `claims_match` metric. Re-eval: all critics 100% on every metric; crowd-taste 100%
  except claims_match 85%. All 3 misses are the held-out Roulot Meursault (+0.17 -> "right around"):
  the LoRA does not apply the 0.1 threshold reliably. Proposed fix: retrieval renders the label
  ("above its peers") in the evidence block, so the model copies it instead of comparing numbers;
  that needs a crowd-taste retrain (about 13 min).
