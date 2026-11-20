# OmniCave iOS

Native SwiftUI app targeting iOS 17. Open `OmniCave.xcodeproj` in Xcode, select an iPhone simulator, then press **Run** (or Command-R). The app uses the forest palette and Avenir Next, which is available on iOS without adding font files.

## Backend mode

Backend mode is the default. `AppConfig.useMock` is `false`, and `AppConfig.backendURL` in `OmniCaveApp.swift` points to the team server. Change that one URL to use another server. The client uses bearer tokens in Keychain and JSON `snake_case` conversion; it does not contain an AI provider key.

Implemented backend flows include sign-up and login, email verification and password reset, profile and privacy settings, cellars and bottle inventory, climate readings and limits, tasting table and persona management, wine pairing, briefing, value, in-app notifications, label-photo review, and foreground WebSocket updates. Push notifications are not implemented.

Some server features intentionally return sample or estimated results: label reading currently produces sample wine data, market values may be simulated, and the briefing can mark news as sample. Sensor data depends on a connected device or server simulator. Check the server response and in-app labels when using these features.

### Local backend

From the repository root, start the backend using its instructions in `backend/README.md` (or create its Python virtual environment and install `backend/requirements.txt`). Run the API at `http://localhost:8000`. In `OmniCaveApp.swift`, set `AppConfig.backendURL` to `http://localhost:8000` while keeping `useMock` false. The project allows local networking for this simulator URL; it does not enable arbitrary HTTP loads. For email-code screens, start the server with `EMAIL_VERIFICATION_REQUIRED=1` as described in the handoff.

## Offline mock mode

Set `AppConfig.useMock` to `true` to use local sample data without contacting the backend. Mock accounts, cellars, bottles, and other changes stay on that device. Use **test@omnicave.app** / **Cellar123!** or tap **Use demo account**. This shared demo login is for mock mode only; it is not a backend account.

Mock tasting, pairing, climate, market, and label-photo results are illustrative sample content. They are not server responses.

## Useful build command

```sh
xcodebuild -project mobile/ios/OmniCave.xcodeproj \
  -scheme OmniCave \
  -destination 'platform=iOS Simulator,name=iPhone 15' build
```

Use any installed simulator if iPhone 15 is unavailable. See [how-to-run-ios-app.md](../how-to-run-ios-app.md) for setup details.
