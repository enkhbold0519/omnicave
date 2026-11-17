# OmniCave — Requirements Coverage

This document traces each requirement in the project specification (`wine_cellar.tex`) to its implementation in
the current build. It is updated whenever a requirement changes status.

**Status definitions**

| Status | Meaning |
|---|---|
| **Implemented** | Built and working end to end. |
| **Simulated** | Built end to end, but driven by a simulator or mock in place of real hardware or a paid service. The real source connects through the same interface. |
| **Partial** | Built in the backend or in some clients only. |
| **Not implemented** | Not built in the current release. |

## 1. Summary

| Area | Requirements | Implemented | Simulated | Partial |
|---|---|---|---|---|
| FR1 Accounts | 1 | 1 | — | — |
| FR2 Vision and inventory | 6 | 4 | 2 | — |
| FR3 Search and location | 2 | 2 | — | — |
| FR4 Climate monitoring | 2 | 1 | 1 | — |
| FR5 Recommendations | 4 | 3 | — | 1 |
| FR6 News and briefing | 2 | 1 | 1 | — |
| FR7 Market value | 1 | — | 1 | — |
| FR8 Multiple cellars | 1 | 1 | — | — |
| FR9 Critic debate | 4 | 3 | 1 | — |
| FR10 Mobile app | 1 | — | — | 1 |
| Non-functional | 8 | 8 | — | — |

## 2. Functional requirements

| ID | Requirement | Status | Implementation |
|---|---|---|---|
| FR1 | Sign up, log in, log out and edit profile | Implemented | Login screen; Profile → Account. API: `/api/auth/*`, `/api/me` |
| FR2.1 | Detect bottles, map their positions, track moves, removals and stacked bottles | Simulated | Reconciliation engine `backend/app/vision.py` (`reconcile`); device endpoints `/api/device/vision/*`. Detection model: `VISION_PROVIDER=mock` |
| FR2.2 | Extract wine details from a label | Simulated | **From photo** on the display and the Android app. API: `POST /api/cellars/{id}/vision/label` |
| FR2.3 | Review and correct extracted details before registration | Implemented | Review dialog for pending detections, with confidence and warnings |
| FR2.4 | One record per physical bottle, no duplicates | Implemented | Unique bottle serial; duplicate check on confirmation |
| FR2.5 | Register bottles automatically after confirmation | Implemented | Confirmed detections become stored bottles at the detected position |
| FR2.6 | Add, edit and remove bottles manually | Implemented | Cellar → Add bottle; Wine details → Edit, Opened, Remove |
| FR3.1 | Search by name, producer, region, vintage and grape | Implemented | Inventory page: search, filters, scope (this cellar / all cellars) |
| FR3.2 | Show a bottle's physical location | Implemented | Door view (to scale, in cm) and 3D view with highlight |
| FR4.1 | Record sensor history per climate zone | Simulated | Cellar status and climate history (1 h / 6 h / 24 h). Readings come from the backend simulator or a paired appliance |
| FR4.2 | Alert on out-of-range conditions and silent sensors | Implemented | Profile → Climate (limits, alert delay); notifications |
| FR5.1 | Food pairing for a wine | Implemented | Wine details → Food pairing |
| FR5.2 | Ready-to-drink suggestions | Implemented | Inventory → Ready to drink; featured bottle on the screen saver |
| FR5.3 | Storage location recommendation | Implemented | Add bottle → recommended position by wine type, eye level and row |
| FR5.4 | Meal-based, personal and curated recommendations; free-text questions | Partial | Backend only: `/api/ai/pairing/meal`, `/api/ai/personal`, `/api/ai/curate`, `/api/ai/ask` |
| FR6.1 | Personalised news and daily briefing | Implemented | Briefing page |
| FR6.2 | Push summary at a user-defined time | Simulated | Briefing time in Profile; the backend creates the notification. Delivery to phones is not implemented |
| FR7 | Market prices, total value and price trends | Simulated | Value page; prices are generated until a market data provider is connected |
| FR8 | Multiple cellars per account, appliance pairing, cross-cellar search | Implemented | Profile → My cellars (6-digit pairing code); Inventory → All cellars |
| FR9.1 | Multi-critic debate streamed to the display | Implemented | Sommelier page (tasting table) |
| FR9.2 | Debate starts on registration and on selection | Implemented | Opens after a bottle is confirmed and from Wine details |
| FR9.3 | Debate uses the owner's cellar, history and preferences | Implemented | Owner context included in every persona prompt |
| FR9.4 | One base model with a LoRA adapter per persona, swapped on the server | Simulated | `LLM_PROVIDER=vllm` through `AI-7B/gateway.py`. Integrated and tested against a stand-in server; live run pending |
| FR10 | Companion mobile app | Partial | Android (`mobile/Kotlin`) uses the live API. iOS (`mobile/ios`) is a preview on sample data |

## 3. Non-functional requirements

| Requirement | Status | Implementation |
|---|---|---|
| First AI token within 1.5 s | Implemented | Responses are streamed token by token (Server-Sent Events) |
| Thin client, at most 1 GB RAM in the cellar | Implemented | No model runs on the display; all inference is in the cloud |
| Offline operation for inventory and climate control | Implemented | Cached data on the display; climate changes queued and sent on reconnect |
| Unsaved input survives restarts and network loss | Implemented | Drafts kept in local storage |
| Secure authentication and per-user isolation | Implemented | PBKDF2-SHA256 password hashes; tokens stored only as hashes; every query scoped to the user |
| Encrypted transport | Implemented | HTTPS through Caddy with Let's Encrypt certificates |
| Data export and account deletion | Implemented | Profile → Privacy. API: `GET /api/me/export`, `DELETE /api/me` |
| Cloud backup and recovery | Implemented | All state in PostgreSQL on AWS RDS with automated backups; clients hold only a cache |

## 4. Deviations from the specification

| Specification | Current build | Reason |
|---|---|---|
| Vision model in the cloud | Simulated detector behind the same interface | Pipeline, review flow and data model are complete; a trained model is outside the project scope |
| Push notifications | In-app notifications only | Requires a push service account |
| OAuth 2.0 | Bearer tokens issued by the backend | Equivalent security for a single first-party service |
| SQLAlchemy | Plain SQL through a thin database layer | Supports SQLite and PostgreSQL with less code |
