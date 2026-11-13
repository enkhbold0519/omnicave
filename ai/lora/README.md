# Persona LoRA + RAG PoC

Facts come from retrieval and style comes from LoRA. Retrieved evidence (drinking window,
critic consensus, community notes) is appended to each critic-debate prompt. One LoRA per critic
persona, on a shared base model (Qwen2.5-1.5B-Instruct), decides how that critic reads and argues
from the evidence. PEFT calls a trained LoRA an "adapter", so each `adapters/<name>/` folder holds
one persona's LoRA weights. Everything is served through an OpenAI-compatible endpoint that
switches LoRA per request.

**PoC limitation:** retrieval uses a simulated evidence store for the 20 catalog wines. Real
sources (community tasting notes, published critic evaluations) are connected later, once each
source's terms of use are checked. The webOS backend
already speaks this contract (`LLM_PROVIDER=vllm` sends the persona's `lora_adapter` as
`model`), so nothing under `webos/` changes. Plan and progress: `ai/plans/pending/lora-poc.md`.

This PoC runs natively on Windows. vLLM needs Linux, and WSL / Hyper-V cannot be enabled on the
development PC, so `serve.py` stands in for `vllm serve --enable-lora` locally. The 7B run on a
rented RunPod GPU can use vLLM with the same adapter names.

## Files
| File | What it does |
| --- | --- |
| `prompts.py` | Mirror of the backend's critic-debate prompt (`webos/backend/app/services.py`) |
| `check_prompt_sync.py` | Fails if the backend prompt changed; run before generating data |
| `evidence.py` | Retrieval interface and evidence block (simulated store in the PoC) |
| `make_dataset.py` | Evidence-grounded template dataset; `--check` validates scales and grounding |
| `smoke.py` | Loads the base model on the GPU, checks the license, measures TTFT |
| `train.py` | Trains one unmerged adapter per persona into `adapters/<lora_adapter>/` |
| `serve.py` | OpenAI-compatible server on :8001: adds evidence to debate prompts, switches LoRA per request |
| `serve_check.py` | Drives the server through the backend's own `llm.py` client |
| `eval.py` | base+RAG vs LoRA+RAG on held-out wines -> `eval/report.md` |

## Setup (Windows, NVIDIA driver with CUDA >= 13.2)
```bat
cd ai\lora
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu132
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python smoke.py
```

## Run
```bat
python check_prompt_sync.py
python make_dataset.py
.venv\Scripts\python train.py --persona power-critic --max-steps 20   :: dry run
.venv\Scripts\python train.py --persona all                           :: full training
.venv\Scripts\python serve.py                                         :: keep running
.venv\Scripts\python serve_check.py
.venv\Scripts\python eval.py
```
`check_prompt_sync.py` and `make_dataset.py` only need the standard library.

## Use it from the webOS app
Add to the local `webos/backend/.env` (never committed), then restart the backend:
```
LLM_PROVIDER=vllm
VLLM_BASE_URL=http://localhost:8001/v1
VLLM_BASE_MODEL=Qwen/Qwen2.5-1.5B-Instruct
```
`VLLM_BASE_MODEL` must match the served base model; the backend default is the 7B model.

## Notes
- Hyperparameters are the `train.py` defaults; the reasoning is in the plan file.
- An adapter only works on the base model it was trained on. `serve.py` refuses mismatches.
- Adapters, generated data, eval replies and model weights are gitignored.
- Personas are fictional. Never put real critics' names or reviews in training data.
