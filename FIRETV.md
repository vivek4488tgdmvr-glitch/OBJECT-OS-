# ObjectOS on Fire TV

## What is built (in this source)
- **TV mode** (`src/tv/`): a 10-foot UI — 26px+ text, 5% overscan-safe padding, large tiles, high-contrast focus ring with scale animation.
- **Remote navigation**: custom D-pad spatial navigation (`useSpatialNav.ts`). Arrow keys move to the nearest tile, Select/Enter opens, **Back** (Escape / GoBack / keyCode 4) returns one screen and, on Home, falls through so Fire OS exits the app.
- **Screens**: Home (search, rooms, warranties ending soon, lost items, recently updated) → Room → Box → Item. The item screen leads with a large "It's in: Room › Location › Box" answer.
- **Search without a keyboard**: on-screen A–Z / 0–9 keyboard with live results.
- **Sample household**: one-button demo data so the TV screen can be shown without a phone.
- **Auto-detect**: the TV UI loads on Fire TV (`AFT…` user agent). Use `?tv=1` to force it on any browser, `?tv=0` for the standard UI.

## Try it on a laptop
    npm install && npm run dev
    open http://localhost:5173/?tv=1   (arrow keys + Enter; Esc = Back)

## Run on a real Fire TV (needs testing — not yet verified)
1. Host the built app over HTTPS (`npm run build`, deploy `dist/`) and open it in the Silk browser, or
2. Package it for the Amazon Appstore as a web app / wrapped APK (check Amazon's current developer docs for the supported route for your target Fire TV generation), then sideload with `adb install` for testing.

## Not claimed as done
Alexa voice, casting, native Fire TV SDK integration, Appstore certification, and testing on physical Fire TV hardware.
The TV screen currently reads this device's local inventory (IndexedDB); signing in and pulling the household from the API on the TV is the next step.
