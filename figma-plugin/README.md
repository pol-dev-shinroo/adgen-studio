# AdGen Studio Import — Figma plugin (Phase 1)

Private, internal-use plugin. Not published to the Figma Community — loaded
locally via Figma desktop's "Import plugin from manifest" flow.

## What it does

Lets you pick a recently-generated ad result from AdGen Studio and pull it
into a Figma file as:

- A frame (`AdGen — <generationId>`), sized to match the render, containing
  the flat generated image as a reference.
- A second frame ("카피 (편집 가능)") next to it, listing the actual
  replacement copy (headline/CTA/promo text) as real, independently-editable
  Figma text layers — one text node per replacement, with a small gray
  caption showing where that text was in the original (a free-text
  description, e.g. "top-center within red-bordered box" — there's no
  bounding-box data in the pipeline yet, so this is a labeled list next to
  the image, not a pixel-accurate overlay on it).

If a result predates this feature (no saved replacement copy), only the
image frame is created, with a status message explaining why.

This makes **zero new paid API calls** — it only reads already-generated
data from the backend.

## Loading it

1. Open Figma desktop.
2. Menu → Plugins → Development → **Import plugin from manifest…**
3. Select `figma-plugin/manifest.json` in this repo.
4. It now shows up under Plugins → Development → "AdGen Studio Import".

## Using it

1. Open (or create) any Figma file.
2. Plugins → Development → AdGen Studio Import.
3. The panel lists recent generated results (brand, format, created-at,
   thumbnail). Filter by typing a brand/format.
4. Click "가져오기" (Import) on the one you want.
5. Figma scrolls/zooms to the newly-created frames automatically.

## Verifying it actually works

There's no automated test harness for this — it has to be checked by hand
inside real Figma:

- The image layer renders the actual generated ad (not a broken/placeholder
  image).
- The text layers in "카피 (편집 가능)" are real Figma text nodes — click
  one, retype it, confirm the edit sticks (not a flattened image of text).
- If the plugin's own results-list or import fails, check Figma's plugin
  console (Plugins → Development → Show/hide console) for the actual error.

## Notes for future maintenance

- `manifest.json`'s `networkAccess.allowedDomains` is pinned to the real
  production Railway backend URL. If that URL ever changes (e.g. a Railway
  redeploy under a new domain), this file needs updating too — it's not
  derived from `.env.production` automatically, since this plugin is a
  separate artifact outside the Vite/Express build.
- `BASE_URL` is duplicated as a literal constant in both `code.js` and
  `ui.html` — they're two separate script contexts (main thread vs. UI
  iframe) with no module system connecting them, so this can't be shared via
  a normal import the way the rest of the app does.
- CORS: only `GET /api/generate/results` (list) and
  `GET /api/generate/results/:id/figma-export` (single result) are opened up
  cross-origin on the backend (see `backend/src/app.js`) — specifically for
  this plugin. Every other endpoint, including the mutating
  `PATCH /api/generate/results/:id` and the paid `POST /api/generate`, stays
  locked to the app's own Vercel origin exactly as before.
- Phase 2 (pixel-accurate placement: product cutout as its own layer, text
  positioned exactly where the original ad had it) depends on the
  vision-analysis step gaining real bounding-box output first — out of scope
  here by design.
