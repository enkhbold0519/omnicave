# OmniCave for Android

The companion app for the OmniCave cellar, written in Kotlin with Jetpack Compose. It shows the same cellar, inventory,
sommelier, briefing and value pages as the cellar-door display, and talks to the same backend (`/api`).

## Requirements
- Android Studio (current stable release)
- A phone or emulator running Android 7.0 (API 24) or later
- A running OmniCave backend (see [`../../backend`](../../backend/README.md))

## Setup
1. Open `mobile/Kotlin` in Android Studio and let Gradle sync.
2. Add the backend address to `mobile/Kotlin/local.properties` (this file is not committed):
   ```properties
   API_BASE=https://your-server-address
   ```
   Use an `https` address: the app does not allow plain `http` traffic.
3. Run the `app` configuration on a phone or emulator. Create an account; a demo cellar is added automatically.

## Structure
| Path | What |
|---|---|
| `data/` | API client (OkHttp + kotlinx.serialization), models, saved session |
| `ui/<page>/` | One file per screen: cellar, inventory, sommelier, briefing, value, profile, wine details |
| `ui/components/` | Shared buttons, charts and icons |
| `ui/theme/` | Colours and type, matching the display |

## Notes
- **From photo** on the Cellar page photographs a wine label; the server reads it and the bottle is added after you confirm.
- Application ID: `kr.ac.hanyang.omnicave`.
