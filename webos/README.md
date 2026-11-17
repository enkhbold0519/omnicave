# OmniCave cellar-door display

The app on the cellar's transparent OLED door, written in React, TypeScript and Vite and packaged for webOS (the OSE
emulator or an LG TV in Developer Mode). It shows the cellar, inventory, sommelier, briefing and value pages, and
talks to the shared backend (`/api`).

## Requirements
- Node.js 20.19 or later
- A running OmniCave backend (see [`../backend`](../backend/README.md))
- For webOS only: the webOS CLI (`npm install -g @webos-tools/cli`)

## Setup
1. Install and start in the browser:
   ```bash
   cd wine-cellar-display
   npm install
   npm run dev          # http://localhost:5173, /api goes to a local backend on :8000
   ```
   To use the AWS server instead, start with `VITE_API_BASE=https://your-server-address npm run dev`.
2. Create an account; a demo cellar is added automatically.
3. To run it on webOS, build, package and install in one step:
   ```bash
   VITE_API_BASE=https://your-server-address npm run webos:deploy
   ```
   Set `WEBOS_DEVICE=tv` for an LG TV (default: the emulator).

## Structure
| Path | What |
|---|---|
| `wine-cellar-display/src/views/` | One file per page: cellar, inventory, sommelier, briefing, value, profile, wine details |
| `wine-cellar-display/src/components/` | Shared parts: door map, 3D view, charts, dialogs |
| `wine-cellar-display/src/api.ts` | Backend client with offline cache |
| `wine-cellar-display/scripts/webos.mjs` | Packages, installs and launches the app with the webOS CLI |
| `edge/edge_agent.py` | Simulates the cellar appliance: run it, then enter its 6-digit code under Profile → My cellars |

## Notes
- **Portrait and transparent:** the UI is a fixed 1080×1920 canvas. Black pixels are see-through, so backgrounds stay `#000`.
- **webOS loads apps from `file://`:** keep `base: './'` in `vite.config.ts` and don't add code splitting.
- **Type check:** `npx tsc --noEmit` in `wine-cellar-display`.
