# HOW TO RUN the OmniCave iOS app

## The short version

OmniCave is a **native SwiftUI iOS app**. It is not a React Native or Expo project, so it cannot be opened in Expo Go. Expo Go runs React Native projects; this app must be built with Xcode.

Windows alone cannot build or run this iOS project in Apple's iOS Simulator. To try the app, use one of these options:

| What you have | How to try OmniCave |
| --- | --- |
| A Mac | Open the Xcode project and run it in an iOS Simulator (instructions below). |
| Windows and an iPhone/iPad | Install a build shared by the team through Apple's TestFlight (instructions below). The iOS app runs on the iPhone/iPad, not on Windows. |
| Windows only, with no iPhone/iPad | You cannot run this iOS app locally. Ask a teammate to share screenshots or a screen recording, or use a Mac/iOS device for testing. |

Apple's simulator workflow is part of Xcode on Mac. Expo Go is not a substitute for it because Expo Go only runs Expo/React Native apps. See [Apple's device and Simulator guide](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices) and [Expo's FAQ](https://docs.expo.dev/faq/).

## Demo login

The app starts in local demo mode. On the sign-in screen, either tap **Use demo account**, or enter:

- **Email:** `test@omnicave.app`
- **Password:** `Cellar123!`

The demo account is created on the device the first time it is used. Alternatively, choose **Create account** and use a valid email plus a password with at least 8 characters, including one uppercase letter, one lowercase letter, one number, and one symbol.

This is a shared demo credential, not a private or production account. Demo accounts, bottles, and cellar changes are stored locally on each device; they are not shared between testers. Do not use real or sensitive information.

## Run it on a Mac with Xcode

1. Clone or pull the shared GitHub repository.
2. Open `mobile/ios/OmniCave.xcodeproj` in Xcode.
3. In the toolbar, select the **OmniCave** scheme and an iPhone Simulator destination.
4. Click the Run triangle, or press **Command-R**.
5. When the app opens, use the demo login above.

The project targets iOS 17. Xcode may ask to download an iOS Simulator runtime the first time you choose a simulator.

## Share a build with teammates who have iPhones or iPads

The team member who uploads the build needs access to an Apple Developer Program team and App Store Connect. This setup is done by the person managing the Apple developer account; testers do not need Xcode.

1. On a Mac, open `mobile/ios/OmniCave.xcodeproj` in Xcode and select the **OmniCave** scheme.
2. In the project’s **Signing & Capabilities** settings, select the team and confirm the app's bundle identifier is unique to that developer account.
3. Choose **Any iOS Device** as the destination, then use **Product → Archive**.
4. In Organizer, select the archive and choose **Distribute App → App Store Connect → Upload**. Resolve any signing or validation messages Xcode reports.
5. In App Store Connect, open the app's **TestFlight** tab, add the uploaded build to a tester group, and invite teammates by email or an available public link.
6. For external testers, Apple requires the first build to pass TestFlight App Review. Once the build is available, testers install Apple's **TestFlight** app on their iPhone/iPad, accept the invitation, and install OmniCave from TestFlight.
7. Testers open OmniCave and use the demo login above.

Apple's current instructions are in [TestFlight](https://developer.apple.com/testflight/) and [Invite external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers). Availability and review status are controlled in App Store Connect.

## What the current demo does (and does not) test

`AppConfig.useMock` is currently `true`. Sign-in, account creation, cellar, wine, and recommendation flows use the local mock service. This build does **not** contact the project backend or OpenAI, and demo changes made on one device do not appear on another. The displayed sensor readings and recommendations are sample content. This is a UI and flow preview, not an end-to-end backend test.

## Report a problem

When reporting an issue, include:

- iPhone/iPad model and iOS version (or Simulator model and runtime)
- The screen or action where it happened
- Steps to reproduce it
- What you expected and what happened instead
- A screenshot or screen recording, if possible

