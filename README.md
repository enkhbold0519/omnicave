# CellarOS Companion — Phase 1 (Home)

Expo SDK 58 · Expo Router · TypeScript. Home screen only; other tabs and detail screens are labeled placeholders.
All data is mock and local — no network, auth, database or AI services.

## Run in Expo Go

Requires Node.js **22.13+** (Expo SDK 58) and the **Expo Go** app for SDK 58 on your phone.

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). Phone and computer must be on the same network;
if they can't see each other (e.g. WSL2), use `npx expo start --tunnel`.

## Scripts

| Command             | What it does                 |
| ------------------- | ---------------------------- |
| `npm run typecheck` | `tsc --noEmit`               |
| `npm run lint`      | `expo lint`                  |
| `npm test`          | Jest unit tests (data layer) |

## Simulating states (development only)

At the bottom of Home, a **Developer · simulate scenario** panel (rendered only when `__DEV__`) switches the mock
repository between *Normal*, *Load failure*, *Sensor offline* and *Empty inventory*. Pull down on Home to reload.

The two demo cellars differ on their own: **The Signature Cellar** is live and balanced (10 bottles);
**Private Reserve** has a low-humidity sensor warning and a 3-hour-old (stale) reading (6 bottles).

## Layout

```
src/
  app/                 Expo Router routes (thin; screens live in components)
    (tabs)/            Home + Inventory/Cellar/Sommelier/Profile placeholders
    notifications.tsx, add-bottle.tsx, wine/[id].tsx, briefing/[id].tsx   placeholders
  components/home/     HomeScreen and its sections
  components/ui/       AppText, Button, PlaceholderScreen
  data/                types, mockDb (single source of truth), derive (pure logic),
                       mockHomeRepository, devScenario
  hooks/               ActiveCellarContext, useHomeData, useAccessibilityPrefs, useNow
  theme/tokens.ts      colors, type, spacing, radii, thresholds
```

Bottle counts are derived from `inventory` records in `mockDb.ts`, never stored.
