# iOS test suite

## Run

```sh
cd mobile/ios
swift test --enable-code-coverage
xcodebuild -project OmniCave.xcodeproj -scheme OmniCave \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
```

To see production-source line coverage after the run:

```sh
xcrun llvm-cov report \
  -instr-profile .build/arm64-apple-macosx/debug/codecov/default.profdata \
  .build/arm64-apple-macosx/debug/OmniCaveBackendTests.xctest/Contents/MacOS/OmniCaveBackendTests \
  --sources OmniCave/BackendModels.swift \
  --sources OmniCave/Services.swift
```

The test package compiles the production API models/client and both service implementations. Mock data uses a per-test `UserDefaults` suite. Network tests use a custom `URLProtocol`; they do not call the production server.

## Current suite

| Layer | Test cases | Coverage |
| --- | ---: | --- |
| Unit: backend models and offline service behavior | 14 | Codable contracts, identifiers, registration validation, local cellar/bottle/label/climate/profile flows |
| Integration: API client and backend service with stubbed HTTP | 15 | URL construction, methods, headers, encoding, decoding, HTTP errors, SSE parsing, and service route mapping |
| UI end-to-end | 1 | Demo sign-in, Cellar load, and 3D ↔ map switching on iOS Simulator |

The current test mix is 47% unit, 50% integration, and 3% UI E2E, so it does not yet meet the requested 80/15/5 split. The integration tests are kept as separate cases because each checks a distinct HTTP contract or failure mode. The Swift Package deliberately excludes `AppModel.swift` and `Views.swift`, so the measured production coverage does not represent the whole app.

## Coverage limits

Latest runs: **29 Swift Package tests passed** and **1 UI E2E test passed** on iPhone 17 Simulator. The measured line coverage for the package's production sources was **64.04%** (BackendModels 94.74%, Services 55.39%). The app UI and AppModel are outside that denominator. Coverage for this package is not 100%; the uncovered service code includes BackendService routes and live WebSocket reconnect/error paths.

`llvm-cov` did not report branch counters for this build (the report shows `0` branches), so branch, condition, and path coverage have not been demonstrated. Full path coverage across UI state, network outcomes, and live updates cannot be inferred from line coverage.

The generic iOS app build and UI-test target build both succeed. The UI test ran on an installed iPhone 17 Simulator runtime.
