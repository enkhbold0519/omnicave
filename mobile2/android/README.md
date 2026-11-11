# CellarOS Companion — Phase 1 (Home)

Expo SDK 58 · Expo Router · TypeScript. Home, Inventory, Wine Details, History, Cellar Map, Sommelier and Profile are
built; Notifications, Add Bottle and Briefing are labeled placeholders.
All data, including log-in, is mock and in memory (demo account: alex@cellaros.app / Cellar#2026) — no network, database or AI services.

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

Open **Profile → Developer** (rendered only when `__DEV__`) to switch the mock repository between *Normal*,
*Load failure*, *Sensor offline* and *Empty inventory*, then return to Home. Pull down on Home to reload.

## Inventory

Each cellar is modelled on the 65-bottle LG SIGNATURE Wine Cellar: 13 shelves × 5 positions in three zones
(sparkling 1–3, white 4–7, red 8–13; see `src/data/cellarLayout.ts`). Every bottle is its own record with an ID
and points at a storage slot by `slotId`. Inventory searches wine, winery, region, vintage and grape (accents ignored), filters by style and
"ready to drink", sorts, switches between this cellar and all cellars, and toggles a list or compact grid.
Opened bottles leave the inventory and appear under **History** (clock icon). Tapping any wine opens its details:
drinking window, every bottle's location, facts, and opening history.

## Cellar Map

Each cellar names its layout (`Cellar.layoutId` → `src/data/cellarLayout.ts`); both demo cellars use the LG
SIGNATURE config. Slots are generated from the layout with stable IDs (`cellar-signature:s09-p3`), and the map
is drawn from those records, not fixed positions (`src/data/cellarMap.ts`). Tap a slot to see the bottle or the
empty position; **View wine** opens Wine Details. On Wine Details, tap a bottle (**Find**) to open the map on
its cellar with the slot highlighted. A bottle without a slot (one Brut in the Signature Cellar is "just
delivered") shows as *Location unavailable* and is listed under **Not placed**.

The map is drawn as the cabinet behind its smoked-glass door (dark in both themes; colors in `cabinet` in
`src/theme/tokens.ts`): SVG glass bottle ends, shadowed empty recesses, an interior light, per-zone temperature
tints and shelf rails. Shelves light up top to bottom on entry, a selected bottle slides out while the rest dim,
and a found bottle pulses twice; reduced motion keeps only fades. Uses `react-native-svg`,
`expo-linear-gradient` and `expo-haptics`, all included in Expo Go.

**Interactions.** Every position opens a bottom sheet: a bottle offers **Move**, **Remove** (opened → History, or
removed unopened) and **View wine**; an empty position offers **Add a bottle here** (wines suited to the zone
first) and **Place** a bottle that has no position. The search field highlights matching bottles, dims the rest
and scrolls to each match (↑/↓). Bottles the sensors placed with low confidence (< 80 %) get a dashed amber ring
and can be confirmed or moved. Zone headers show the configured **Target** next to the sensor's **Now** reading
(amber when outside target, aged when stale).

## Sommelier

A table of 2–5 sommeliers debates a wine, what to open tonight, a meal pairing or any question. Each speaks once,
then the table waits: **Continue**, **Join in** (type, quick replies, or `@Name` to ask one sommelier) or **End**
for a verdict (scores side by side with a drinking-window timeline, or each sommelier's pick). Three fictional
default sommeliers; add, edit or delete your own in the personality editor (values, scoring scale, region focus,
strictness, tone, free-text description). Preferences you state ("I love Riesling") are remembered per sommelier
and can be cleared. Start from the Sommelier tab, Wine Details or the map's bottom sheet.

The replies come from a rule-based mock (`src/data/sommelier/mockEngine.ts`) that uses the wine's real data and
each persona's traits. With the backend, one LLM speaks for every persona, prompted from the same persona fields and
memory; `SommelierRepository` stays the same and streamed messages land in `sommelierStore`.

**One source of truth.** At runtime all bottles live in `src/data/cellarStore.ts`; every repository reads it
and every change goes through it, so Home, Inventory, Wine Details and the map stay consistent. Screens refetch
quietly when its version changes. Changes are in memory only and reset when the app reloads.

## Appearance

**Profile → Appearance** offers *System*, *Light* and *Dark*; **Profile → Palette** offers *Forest* (default), *Bordeaux*,
*Oak* and *Slate*, each with a light and dark version. Both choices are saved on the device (AsyncStorage).
`src/theme/__tests__/palettes.test.ts` checks every palette and mode for ≥4.5:1 text contrast.

The two demo cellars differ on their own: **The Signature Cellar** is live and balanced (10 bottles);
**Private Reserve** has a low-humidity sensor warning and a 3-hour-old (stale) reading (6 bottles).

## Layout

```
src/
  app/                 Expo Router routes (thin; screens live in components)
    (tabs)/            Home, Inventory, Cellar, Profile; Sommelier placeholder
    wine/[id].tsx, history.tsx; notifications.tsx, add-bottle.tsx, briefing/[id].tsx are placeholders
  components/home/     HomeScreen and its sections
  components/inventory/ InventoryScreen, list row, grid tile, HistoryScreen
  components/wine/     WineDetailsScreen
  components/sommelier/ SommelierHome, NewTasting, Debate (+ bubbles, verdict), persona list and editor
  components/cellar/   CellarMapScreen, SlotGrid (cabinet), BottleEnd (SVG glass), SlotSheet, MapSearch, PickerSheet
  components/profile/  ProfileScreen (appearance) and the dev scenario panel
  components/ui/       AppText, Button, PlaceholderScreen
  data/                types, mockDb (seed data), cellarStore (runtime bottles), cellarLayout (layout config), cellarMap, derive + inventory
                       (pure logic), mockHomeRepository, mockInventoryRepository, devScenario
  hooks/               ActiveCellarContext, useQuery, useAccessibilityPrefs, useNow
  theme/tokens.ts      palettes (each light + dark), type, spacing, radii, thresholds
  theme/ThemeContext   active theme, saved preference, makeStyles()
```

Bottle counts are derived from individual `bottles` in `mockDb.ts`, never stored.
