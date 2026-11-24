# CLAUDE.md — OmniCave

AI-driven wine cellar management system with a transparent-display door (Hanyang Univ. Software Engineering
team project, aimed at an LG SIGNATURE demo). The paper / spec is `documents/wine_cellar.tex`. Treat it as the
source of truth for requirements (FR1–FR10, NFRs). When proposing something the paper doesn't say, label it as a
proposal.

## Repository layout
All apps talk to **one shared backend** (`backend/`) over the same REST + WebSocket API.

| Path | What | Run |
|---|---|---|
| `backend/` | FastAPI server: accounts, inventory, vision reconcile, devices, AI critics, live sync. SQLite in dev, PostgreSQL in production | see `backend/README.md` |
| `deploy/` | Production: Docker Compose (API + Caddy) on EC2, database on RDS PostgreSQL | see `deploy/README.md` |
| `webos/wine-cellar-display/` | webOS OSE cellar-door display (React + Vite), also hosted on Vercel | see `webos/README.md` |
| `webos/edge/` | `edge_agent.py`: fake cellar appliance (pairing code, sensors, scans) | `python webos/edge/edge_agent.py --server http://localhost:8000` |
| `mobile/Kotlin/` | Native Android companion app (Jetpack Compose) | see `mobile/Kotlin/README.md` |
| `mobile/ios/` | Native SwiftUI iOS companion app (needs a Mac with Xcode) | see `mobile/ios/how-to-run-ios-app.md` |
| `AI-7B/` | Critic-debate AI: 4 persona LoRAs on Qwen2.5-7B + RAG evidence, trained and served on RunPod | see `AI-7B/CLAUDE.md` |
| `documents/` | LaTeX paper and requirements coverage | — |
| `.github/workflows/` | CI: backend tests (SQLite + PostgreSQL), prompt sync, display build, Android build | — |

Before changing a folder you don't own, check its README / CLAUDE.md first and keep the change scoped.

## Commands
```bash
cd backend && uvicorn app.main:app --reload       # API on :8000 (docs at /docs)
cd backend && python -m pytest -v                 # tests — must pass before committing backend changes
python AI-7B/check_prompt_sync.py                 # after any edit to the critic debate prompt
cd webos/wine-cellar-display && npm run dev       # display on :5173 (/api proxied to :8000)
cd webos/wine-cellar-display && npm run build     # type-check + build
cd webos/wine-cellar-display && npm run webos:deploy   # build → .ipk → install → launch (emulator, or WEBOS_DEVICE=tv)
```
PostgreSQL tests: `TEST_DATABASE_URL=postgresql://... python -m pytest` (the database is wiped first).

## Things that are easy to get wrong
- **webOS CLI.** The `ares-*` tools are only tested on Node 14–16 and are expected in `webos/tools/node16`
  (see `scripts/webos.mjs`). Vite 7 needs Node ≥ 20.19 (global). Run `ares` through `npm run ares -- <cmd>`,
  never by changing the global Node.
- **webOS loads apps from `file://`.** `vite.config.ts` builds one IIFE bundle and strips `type="module"`/`crossorigin`.
  Keep `base: './'`. Don't add code-splitting or dynamic imports.
- **Emulator networking.** Inside VirtualBox the host PC is `http://10.0.2.2:8000` (default API base when
  `location.protocol === 'file:'`). Production builds set `VITE_API_BASE` at build time.
- **Portrait canvas.** The display UI is a fixed 1080×1920 canvas scaled by `<Stage>` and rotated 90° on landscape
  webOS screens. Design for portrait.
- **Transparent OLED.** Black pixels are see-through, so backgrounds stay `#000` and only content is lit.
- **Coordinates are centimetres**, not slots: `x` from the left wall, `y` from the floor, `z` from the door.
  - Racks have a *nominal* capacity. Overfilling is allowed (free mapping).
  - Stacked bottles need support (gravity). That logic lives in `backend/app/geometry.py`.
- **Backend structure.** Routes are a framework-agnostic table in `backend/app/routes.py`, mounted by `main.py`
  (FastAPI) and `devserver.py` (stdlib fallback). Put logic in `inventory.py` / `vision.py` / `devices.py` /
  `services.py`, never in route lambdas.
- **Schema changes.** Bump `SCHEMA_VERSION` in `backend/app/db.py` and add the upgrade SQL to `db.MIGRATIONS`.
  A dev SQLite file is backed up and recreated; PostgreSQL is migrated and never reset. Keep SQL portable
  (see `backend/README.md`).
- **Vision.**
  - Every scan goes through `vision.reconcile()` (unchanged / moved / new → review / occluded / removed after
    `VISION_MISSING_SCANS`).
  - The detection contract is in the `vision.py` docstring (`VISION_PROVIDER=mock|http`).
  - Differences under 2.5 cm (`DRIFT_TOLERANCE`) are noise. Don't remove that guard: without it, positions drift.
- **AI.**
  - Providers are chosen in `backend/.env` (`LLM_PROVIDER=mock|openai|vllm`). API keys stay in the backend, never
    in the apps.
  - Critic personas (`backend/personas.json`) use fictional names inspired by scoring philosophies. Don't attribute
    quotes to real critics.
  - The LoRAs were trained on the backend's debate prompt (`backend/app/services.py`, mirrored in
    `AI-7B/prompts.py`). Changing that prompt breaks the LoRAs until they are retrained.
- **Legal texts.** Privacy policy and terms live in `backend/app/policies/`; bump `POLICY_VERSION` in `legal.py`
  when they change, so users are asked to accept again.
- **Windows scripts.** Keep `.ps1` files ASCII-only (Windows PowerShell 5.1 encoding) and `.cmd`/`.ps1` line endings
  CRLF (enforced by `.gitattributes`).

## AI-7B — before you touch the critic AI
- Read `AI-7B/CLAUDE.md` first. It explains how the apps reach the LoRAs (backend -> `AI-7B/gateway.py` -> vLLM).
- Weights (`AI-7B/adapters/`), generated data and logs are not in git. GPU work runs on a rented RunPod pod.
  Terminate pods when done, because a stopped pod still bills its disk.

## Conventions
- READMEs and code comments in English.
- Never commit `.env`, `local.properties`, databases (`*.db`), `node_modules/`, `.venv/`, `webos/tools/`, build output
  (`dist/`, `out/`, `build/`, `*.ipk`), model weights (`*.safetensors`) or the AI data folders.
- Work on a branch and open a PR to `main`. Don't push to `main` directly.
- Before installing a new tool or dependency, say what it is and why it's needed.
