# OmniCave webOS prototype — details

AI-driven interactive wine cellar management system with a transparent-display door
(target: webOS OSE 2.28.0, portrait 1080×1920).

```
webos/
├─ setup.cmd / setup.ps1     one-time installer (Node, webOS CLI, VirtualBox, OSE emulator, Python backend)
├─ run-backend.cmd           start FastAPI backend  → http://localhost:8000/docs
├─ run-display.cmd           start display dev UI   → http://localhost:5173
├─ webos-env.ps1             load ares-* commands into a PowerShell session
├─ backend/                  FastAPI + SQLite dev backend (auth, inventory, sensors, vision, devices, AI, briefing, market)
├─ edge/                     code for the cellar hardware side
│   ├─ edge_agent.py         runs on the appliance: pairing, telemetry, camera frames (stdlib only)
│   └─ vision_server_example.py   reference Vision AI server for VISION_PROVIDER=http
└─ wine-cellar-display/      React + TypeScript + Vite app packaged as a webOS .ipk
```

## Quick start

1. `setup.cmd` (once). Every tool it installs and why:

   | Tool | What it is | Why |
   |---|---|---|
   | Node.js LTS + npm | JavaScript runtime + package manager | Vite/React build and dev server |
   | Node 16 (portable, `tools\node16`) | old Node kept inside the project | webOS CLI is only tested on Node 14–16 |
   | `@webos-tools/cli` | LG's official webOS SDK CLI (`ares-*`) | package / install / launch / inspect apps |
   | VirtualBox 7 | virtual-machine host | runs the webOS OSE emulator |
   | webOS OSE 2.28.0 image | prebuilt emulator disk | a virtual webOS device |
   | Python 3.12 + venv | Python runtime, isolated package folder | backend runs here (`backend\.venv`) |
   | FastAPI + Uvicorn | Python web framework + its server | the REST/streaming API the display talks to |

2. `run-backend.cmd` → keep it open.
3. `run-display.cmd` → open http://localhost:5173, create an account (a demo cellar is seeded).
4. On the emulator: start VM `webos-image`, then `cd wine-cellar-display` → `npm run webos:deploy`.
   The packaged app reaches the backend at `http://10.0.2.2:8000` (VirtualBox NAT address of the host PC).
   Allow Python through Windows Firewall when asked.

## Free 3D mapping
Bottle positions are stored in **centimetres** (`x` from the left wall, `y` from the floor, `z` from the door),
not in grid slots.
- **Racks** have a height and a *nominal* capacity. Overfilling is allowed: a "10-bottle" rack can hold 12 when bottles nest on top (`level` 1, 2 …). The display marks it `12/10 over nominal`.
- **Gravity.** A stacked bottle needs a bottle underneath. When you remove the bottom one, the bottles above drop a level.
- **Pull a rack out** (Settings → Racks):
  - *They come out with the rack*: serving or display. The bottles come back when the rack is put back.
  - *Re-home them*: each bottle is moved to the best free spot left in the cellar.
- **Floor.** Free-standing or upright bottles (open bottles, magnums) sit on the floor or wherever there is support.
- **Views.** *Door* is a 1:1 elevation of the glass door: back-row bottles are dimmed, tap ✥ Move then tap a new spot. *3D* is a dependency-free SVG orbit view (drag to rotate). It needs no WebGL on the low-power module.

## Vision AI integration
```
camera in cellar ─frame─▶ POST /api/device/vision/frame ─▶ VISION_PROVIDER (mock | http → your model server)
edge-side model  ─detections─▶ POST /api/device/vision/detections
                                     └──────────────▶ reconcile(): unchanged / moved / new (review) / removed
```
- The detection contract (cellar coordinates in cm + optional label) is documented at the top of `backend/app/vision.py`.
- Matching order:
  1. stable tag id
  2. same spot and compatible label
  3. same label elsewhere → **moved**
  4. bottles hidden behind a front bottle are **occluded**, so they aren't removed
  5. a bottle missing for `VISION_MISSING_SCANS` scans in a row → **taken out**
- New bottles always go to the owner for review first (OCR confidence, warnings, unreadable labels).
- Sub-2.5 cm differences are treated as detection noise, so positions don't drift.
- `edge/vision_server_example.py` is a working starting point. It uses YOLO's `bottle` class if `ultralytics` is installed, with a simple front-camera calibration. Label OCR and depth estimation are marked TODO.
- On the display: **📷 Scan** runs the simulated camera with a chosen change, and **⬆ Photo** sends a real image through the same pipeline.

## Linking several cellars
1. A new appliance registers itself and shows a 6-digit code (`edge_agent.py` prints it; Settings → *Simulate a new appliance* fakes one).
2. The owner enters the code in Settings → Linked cellars, choosing either a **new cellar** (cabinet preset) or **attach to an existing cellar** (e.g. a second camera).
3. The appliance receives a one-time device token and then sends telemetry and scans. Telemetry responses carry the current set-points, so remote temperature changes reach the compressor.

All cellars share one account: cross-cellar search, total collection value, and bottles can be moved between cellars (Edit → position / cellar).
```
python edge/edge_agent.py --server http://localhost:8000 --images some_photos/   # pretend to be a cellar
```

## AI (Hugging Face / OpenAI / own LoRA server)

Edit `backend\.env` then restart the backend:

| `LLM_PROVIDER` | Needs | Notes |
|---|---|---|
| `mock` (default) | nothing | templated answers, still streamed — UI fully works offline |
| `hf` | `HF_TOKEN` (fine-grained, *Make calls to Inference Providers*) | `Qwen/Qwen2.5-7B-Instruct` via `https://router.huggingface.co/v1`, same model as the paper |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` by default |
| `vllm` | your server at `VLLM_BASE_URL` | each persona's `lora_adapter` is sent as `model` → **server-side dynamic LoRA swapping** (vLLM `--enable-lora --lora-modules ...`) |

API keys live only in the backend. The display never sees them.
Critic personas live in `backend/personas.json`. Add one there and it appears in the debate with no display update (FR9 "continuous persona expansion").
The personas have fictional names. They are *inspired by* the scoring philosophies the paper cites, so the app never puts invented quotes in real critics' mouths.

## Requirement coverage

✅ implemented · 🧪 implemented against a simulator (real hardware/API plugs into the same interface) · ⛔ outside this repo

| # | Requirement | Status | Where |
|---|---|---|---|
| FR1 | Register (username, email, password), log in/out, edit profile | ✅ | Login screen, Settings → Profile · `/api/auth/*`, `/api/me` |
| FR2 | Vision detection, label extraction, auto-register, location, move, remove, stacked bottles | ✅ pipeline · 🧪 model | `reconcile()` + device endpoints; simulated camera (📷 Scan) or `VISION_PROVIDER=http` |
| FR2 | Unique ID per physical bottle, no duplicates | ✅ | `serial` (e.g. `CC-1A2B3C4D`), duplicate tag check on confirm |
| FR2 | Review & correct AI-extracted info before registration | ✅ | review dialog (OCR confidence, warnings, unreadable labels); pending bottles shown as “?” on the door view |
| FR2 | Manual add / edit / remove | ✅ | ＋ Add bottle, bottle sheet → Edit info / Opened / Remove |
| FR3 | Search by name, winery, region, vintage, grape | ✅ | Search tab (field chips) |
| FR3 | Show selected bottle's physical location; visual map | ✅ | Door view (1:1, cm-accurate) + 3D view, pulsing highlight from search |
| FR4 | Collect & store sensor history, per-location conditions | 🧪 | Zone cards + 30-min charts; bottle sheet shows its zone's live reading |
| FR4 | Alert on threshold exceeded for user-defined duration | ✅ | Settings → Climate control (min/max, *Alert after (min)*), *Heat spike* simulator |
| FR4 | Alert on sensor disconnect / stale data | ✅ | *Disconnect sensor* simulator → “Sensor offline” badge + notification |
| FR5 | Meal → pairing from inventory | ✅ | Sommelier → Meal pairing (rule ranking + LLM explanation) |
| FR5 | Wine → dishes, recipes, delivery category | ✅ | Bottle sheet → Food pairing |
| FR5 | Ready-to-drink + approaching-window notifications | ✅ | Sommelier → Ready to drink; yearly window notifications |
| FR5 | Personalised from consumption history | ✅ | Sommelier → For you (uses Opened / Take-out history) |
| FR5 | Budget / flavor / theme → curated list (cellar + external purchases) | ✅ | Sommelier → Curated list (catalog = external DB) |
| FR5 | Storage location recommendation | ✅ | Add → 📍 Recommend: zone by wine type, eye level, front row, then stacking |
| FR5 | Natural-language queries via cloud LLM | ✅ | Sommelier → Ask |
| FR6 | Aggregate news, personalise to owned regions/grapes/producers | ✅ | Briefing tab (RSS feeds; falls back to flagged samples offline) |
| FR6 | Daily briefing on display incl. peak wines & humidity stability | ✅ | Briefing → “Your cellar today” |
| FR6 | Push summary at user-defined time | 🧪 | Settings → briefing time; backend creates a `push` notification daily (mobile app consumes) |
| FR7 | Market prices, total value, price-trend charts | 🧪 | Value tab + bottle sheet → Price trend (simulated until `WINE_SEARCHER_API_KEY`) |
| FR8 | Multiple cellars, synced, cross-cellar search | ✅ | pairing-code linking of appliances, per-device tokens & status, Search → All cellars, move bottles between cellars |
| FR9 | Multi-agent critic debate, streamed chat on the display | ✅ | Bottle sheet → Critic debate |
| FR9 | Auto-trigger on registration **and** on touch selection | ✅ | Opens automatically after confirm / tap |
| FR9 | Uses user's cellar, history, preferences | ✅ | Owner context injected into every persona prompt |
| FR9 | Central base model, server-side LoRA swapping, add personas server-side | ✅ (`vllm`) | `personas.json` + `LLM_PROVIDER=vllm` |
| FR10 | Companion mobile app (Android/iOS) | ⛔ | Separate Kotlin / Swift apps. They use the same `/api` endpoints |
| NFR | Search < 2 s, inventory refresh < 10 s, first AI token < 1.5 s via streaming | ✅ | search shows ms; 5-s polling; SSE streaming shows “first token … ms” |
| NFR | Thin client / ≤ 1 GB RAM | ✅ | display does no inference; all AI on backend |
| NFR | Offline fallback (view inventory, temperature control) | ✅ | cached data + “Cloud offline · cached” chip; zone changes queued and synced |
| NFR | Preserve unsaved input across restarts / network drops | ✅ | drafts in localStorage (forms, search, AI prompts) |
| NFR | Secure auth, hashed passwords, per-user isolation | ✅ | bearer tokens (hashed at rest), PBKDF2-SHA256 passwords, every query scoped by user |
| NFR | TLS 1.3 end-to-end | ⛔ | deployment concern: put the backend behind HTTPS (Caddy / Nginx / Cloudflare) |
| NFR | GDPR export / delete | ✅ | Settings → Export my data / Delete account |
| NFR | Network + auth state on main display | ✅ | header chips |
| NFR | Cloud backup & recovery | ✅ | all state lives in the backend DB; display is stateless apart from cache |

## Display notes
- **Portrait first.** The app draws a fixed 1080×1920 canvas and scales it to any screen.
  Settings → *Display* picks Auto (rotates 90° on landscape webOS screens such as the emulator), Portrait panel, or Always rotate.
- **Transparent OLED.** Black pixels are see-through, so the background stays `#000`.
- Packaged build is a single IIFE bundle (`vite.config.ts`), because webOS loads apps from `file://`.

## Tests
```
cd backend
python -m tests.test_api      # end-to-end API test, stdlib only (no pip needed)
```

## Team
| Role | Name |
|---|---|
| User | Chiang Jun Han |
| Customer | Naomi K. Fossaberg |
| Software developer | Enkhbold Myagmarjav |
| Development manager | Sungbin Bae |
