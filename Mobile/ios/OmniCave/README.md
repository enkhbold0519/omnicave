# OmniCave iOS

Native SwiftUI companion app, targeting iOS 17. The project is in `mobile/ios/OmniCave.xcodeproj`; open that file in Xcode. Select an iPhone simulator in the device menu beside the OmniCave scheme, then press **Run** (or Command-R).

The interface follows the supplied forest cellar design: warm cream surfaces, forest-green accents, wine-style colors, and a dark cellar map. The design reference names Montserrat, which is not bundled with this project; the app uses iOS's Avenir Next font so it works without adding font files.

## Demo mode

`AppConfig.useMock` in `OmniCaveApp.swift` is `true` initially. Create an account using a valid email and a password with at least 8 characters, one uppercase letter, one lowercase letter, one number, and one symbol. Mock accounts, cellar settings, and bottles persist locally. Password verifiers are salted and iterated; this local demo store is not a replacement for backend authentication.

For immediate access, use **test@omnicave.app** with password **Cellar123!**, or tap **Use demo account** on the login screen. The test account is created locally the first time it is used.

Demo wine recommendations are illustrative text. Sensor history and values are sample data. News, live market pricing, push notifications, computer vision, and cloud multi-agent/streaming inference need their backend or appliance services.

## Backend switch

Set `AppConfig.useMock` to `false` and replace `AppConfig.backendURL` with the FastAPI base URL. The app then uses `BackendService`; bearer tokens are kept in Keychain and AI prompts go to the backend `ai/chat` route. The app never contains an OpenAI key or calls OpenAI directly.

The report does not define API routes or JSON schemas, so the REST client currently uses this proposed contract. Align it with the backend OpenAPI schema before switching out of demo mode:

| Method | Route | Expected payload/result |
| --- | --- | --- |
| POST | `/auth/register` | `{email,password}` → `{email}` |
| POST | `/auth/login` | `{email,password}` → `{access_token,user:{email}}` |
| POST | `/auth/logout` | bearer token → success |
| GET/PATCH | `/users/me` | account; PATCH accepts `{email}` |
| PATCH | `/users/me/password` | `{password}` |
| GET/PUT/DELETE | `/wines`, `/wines/{id}` | JSON wine records |
| GET/PUT | `/cellars`, `/cellars/{id}` | JSON cellar records |
| POST | `/ai/chat` | `{message}` → `{answer}` |
| GET/DELETE | `/users/me/export`, `/users/me` | authenticated export or account deletion |

JSON fields use `snake_case`; the client maps those to Swift properties. HTTPS is expected for deployed URLs. The prototype does not yet implement WebSocket updates, token refresh, APNs, or streaming chat.

## Scope notes

Implemented flows cover account creation/login/profile/logout/deletion, local inventory CRUD and search, cellar selection/renaming, bottle location display, environment controls, recommendations, critic prompt requests, cellar summaries, and data export. Automatic bottle recognition and sensor/news/market/push integrations belong to the cellar hardware or backend and are represented as demo content until those services exist.
