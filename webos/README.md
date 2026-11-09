# OmniCave — webOS display prototype

Portrait (1080×1920) cellar-door UI for **webOS OSE 2.28**, plus a FastAPI dev backend, a simulated
Vision AI pipeline, and an edge agent for the cellar hardware. Full feature list and requirement
coverage: [`docs/DETAILS.md`](docs/DETAILS.md).

## Requirements
Windows 10/11 x64. `setup.cmd` installs everything else: Node.js LTS, webOS CLI (`ares-*`) on a portable Node 16,
VirtualBox 7 + the webOS OSE emulator image, and Python 3.12 + FastAPI.

## Run
```bat
cd webos
setup.cmd            :: once (re-running skips finished steps)
run-backend.cmd      :: API on http://localhost:8000  (docs: /docs)
run-display.cmd      :: UI  on http://localhost:5173  → create an account (a demo cellar is seeded)
```

Deploy to the webOS emulator (start VM `webos-image` in VirtualBox first):
```bat
cd webos\wine-cellar-display
npm run webos:deploy     :: build → .ipk → install → launch
```
The packaged app talks to the backend at `http://10.0.2.2:8000` (the host PC as seen from VirtualBox).

## Configuration (`backend/.env`, created from `.env.example`)
| Key | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `hf` (Hugging Face, needs `HF_TOKEN` + paid credits) · `openai` · `vllm` (own server, LoRA per persona) |
| `VISION_PROVIDER` | `mock` | `http` → your model server at `VISION_ENDPOINT` (see `edge/vision_server_example.py`) |

## Pretend to be a cellar appliance
```bat
python edge\edge_agent.py --server http://localhost:8000
```
It prints a 6-digit code. Enter it in the display under **Settings → Linked cellars**.

## Tests
```bat
cd backend && python -m tests.test_api
```
