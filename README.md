# AdGen Studio (React + Vite)

React port of the `광고생성기_UI목업.html` mockup — competitor ad feed, generation
studio wizard, result gallery, and settings/product-review screens.

## Run locally

```bash
cd adgen-studio
npm install
npm run dev
```

Then open **http://localhost:3000** (port is fixed in `vite.config.js`).

## Structure

```
src/
  main.jsx              entry point
  App.jsx               top-level layout (sidebar + active screen + toast)
  context/               one React Context per feature area (state + actions)
    NavigationContext.jsx   current screen, toast
    AdsContext.jsx          competitor ad archive, search/collect, dedupe
    StudioContext.jsx       4-step generation wizard state
    GalleryContext.jsx      generated results, approve/retry
    SettingsContext.jsx     product-info review/override state
    AppProviders.jsx        composes all providers
  data/                  mock data (stand-ins for Meta/Cafe24/n8n responses)
  components/
    layout/              Sidebar, Toast
    common/               Badge, Chip, Thumb, MultiLineText (shared primitives)
    feed/                 competitor ad feed screen
    studio/               generation wizard (steps/ holds the 4 step panels)
    gallery/              result gallery screen
    settings/             brand sync + product review + n8n integration
  styles/                global.css (tokens/shared classes) + one css file per screen
```

## Notes / deviations from the mockup

- All interactive behavior (search+collect simulation, dedupe, wizard
  validation, product review overrides) is preserved from the original JS.
- One intentional enhancement: clicking "생성 시작" in the wizard now actually
  pushes a new "생성중" card into the Result Gallery (the original mockup left
  the gallery static). Easy to revert if you'd rather keep it static until
  real generation is wired up.
- Edits (rename brand, override a product field) still use `window.prompt()`
  to match the mockup's interaction — swap for a real modal whenever you're
  ready to polish the UI.
- This is UI-only: no real Meta Ads / Cafe24 / Pinecone / n8n calls are made.
  Wiring those up means replacing the mock data + the functions inside each
  context with real API/webhook calls.
