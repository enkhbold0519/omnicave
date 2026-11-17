# CLAUDE.md — OmniCave

AI-driven wine cellar management system with a transparent-display door (Hanyang Univ. Software Engineering
team project, aimed at an LG SIGNATURE demo). The paper / spec is `documents/wine_cellar.tex`. Treat it as the
source of truth for requirements (FR1–FR10, NFRs). When proposing something the paper doesn't say, label it as a
proposal.

## Repository layout
Each component is independent. Each has its own backend/data model, and the API contracts are **not** shared yet.

| Path | What | Owner | Run |
|---|---|---|---|
| `webpage/` | Desktop web app + FastAPI server (WebSocket sync, SQLite/Postgres) | Enkhbold | `webpage\start.bat` → http://localhost:8000 |
| `mobile/android/` | Expo (SDK 58) companion app, mock data | Chiang | see `mobile/android/CLAUDE.md` (`npm install && npx expo start`) |
| `webos/` | webOS OSE 2.28 cellar-door display + dev backend + edge agent | Sungbin | see below |
| `AI-7B/` | Critic-debate AI: 4 persona LoRAs on Qwen2.5-7B + RAG evidence, trained on RunPod | Sungbin | see `AI-7B/CLAUDE.md` |
| `AI-1.5B-Legacy/` | Earlier 1.5B PoC, kept for the LoRA rank study (r=4 vs r=16) and its Critic Lab web demo | Sungbin | `AI-1.5B-Legacy/lora/README.md` |
| `documents/` | LaTeX paper | all | — |

Before changing a folder you don't own, check its README / CLAUDE.md first and keep the change scoped.

## webos/ — commands (Windows)
```bat
cd webos
setup.cmd                      :: one-time: Node LTS, portable Node16 + webOS CLI, VirtualBox + OSE emulator, Python venv
run-backend.cmd                :: FastAPI on :8000  (docs at /docs)
run-display.cmd                :: Vite dev server on :5173 (/api proxied to :8000)
cd backend && python -m tests.test_api          :: end-to-end API test — must pass before committing backend changes
cd wine-cellar-display && npx tsc --noEmit      :: type-check
cd wine-cellar-display && npm run webos:deploy  :: build → .ipk → install → launch on emulator (VM "webos-image" must be running)
python edge\edge_agent.py --server http://localhost:8000   :: fake cellar appliance (prints a pairing code)
```

## webos/ — things that are easy to get wrong
- **Two Node versions.** The webOS CLI (`ares-*`) is only tested on Node 14–16 and runs from `webos/tools/node16`. Vite 7 needs Node ≥ 20.19 (global). Run `ares` through `npm run ares -- <cmd>` or `. .\webos-env.ps1`, never by changing the global Node.
- **webOS loads apps from `file://`.** `vite.config.ts` builds one IIFE bundle and strips `type="module"`/`crossorigin`. Keep `base: './'`. Don't add code-splitting or dynamic imports.
- **Emulator networking.** Inside VirtualBox the host PC is `http://10.0.2.2:8000` (default API base when `location.protocol === 'file:'`).
- **Portrait canvas.** The UI is a fixed 1080×1920 canvas scaled by `<Stage>` and rotated 90° on landscape webOS screens. Design for portrait.
- **Transparent OLED.** Black pixels are see-through, so backgrounds stay `#000` and only content is lit.
- **Coordinates are centimetres**, not slots: `x` from the left wall, `y` from the floor, `z` from the door.
  - Racks have a *nominal* capacity. Overfilling is allowed (free mapping).
  - Stacked bottles need support (gravity). That logic lives in `backend/app/geometry.py`.
- **Backend structure.** Routes are a framework-agnostic table in `backend/app/routes.py`, mounted by `main.py` (FastAPI) and `devserver.py` (stdlib fallback). Put logic in `inventory.py` / `vision.py` / `devices.py` / `services.py`, never in route lambdas.
- **Schema changes.** Bump `SCHEMA_VERSION` in `backend/app/db.py`. The dev DB is then backed up and recreated (no migrations).
- **Vision.**
  - Every scan goes through `vision.reconcile()` (unchanged / moved / new → review / occluded / removed after `VISION_MISSING_SCANS`).
  - The detection contract is in the `vision.py` docstring.
  - Differences under 2.5 cm are noise. Don't remove that guard: without it, positions drift.
- **AI.**
  - Providers are chosen in `backend/.env` (`LLM_PROVIDER=mock|hf|openai|vllm`). API keys stay in the backend, never in the display.
  - Critic personas (`personas.json`) use fictional names inspired by scoring philosophies. Don't attribute quotes to real critics.
- **Windows scripts.** Keep `.ps1` files ASCII-only (Windows PowerShell 5.1 encoding) and `.cmd`/`.ps1` line endings CRLF.

## AI-7B — before you touch the critic AI
- Read `AI-7B/CLAUDE.md` first. It lists what is done, what is left (first live session on a pod) and how the
  apps reach the LoRAs (backend -> `AI-7B/gateway.py` -> vLLM).
- The LoRAs were trained on the backend's debate prompt (`backend/app/services.py`, mirrored in
  `AI-7B/prompts.py`). Changing that prompt breaks the LoRAs until they are retrained. Run
  `python AI-7B/check_prompt_sync.py` after any edit to it.
- Weights (`AI-7B/adapters/`), generated data and logs are not in git. GPU work runs on a rented RunPod pod.
  Terminate pods when done, because a stopped pod still bills its disk.

## Conventions
- READMEs and code comments in English.
- Never commit `.env`, databases (`*.db`), `node_modules/`, `.venv/`, `webos/tools/`, build output (`dist/`, `out/`, `*.ipk`),
  model weights (`*.safetensors`) or the AI data folders.
- Work on a branch and open a PR to `main`. Don't push to `main` directly.
- Before installing a new tool or dependency, say what it is and why it's needed.
