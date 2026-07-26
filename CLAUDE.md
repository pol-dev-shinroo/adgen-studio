# AdGen Studio — Project Notes for Claude Code

## What this is
React + Vite front end for AdGen Studio, an ad-automation tool. It pulls competitor
ads from the Meta Ads Library, cross-references our own Cafe24 product data (synced
via a Pinecone vector DB), and uses OpenAI's `gpt-5.5` + the Responses API's hosted
`image_generation` tool (which renders through OpenAI's current flagship image model,
`gpt-image-2`) to generate new ad creative that swaps a competitor ad's overlaid text
and product photo for our own brand's, while preserving the original layout/structure
— not literally copying their pixels, for copyright-safety reasons. A Node/Express
backend (`backend/`) is the job runner — n8n was an earlier candidate for this role
(two of its workflows were used as the source of the exact system prompts/instructions
carried into the real pipeline below) but isn't used anywhere in the current
implementation.

Every major pipeline is now wired up for real against the backend, end-to-end:
- Ad collection (Apify -> Google Sheets/Drive)
- Product sync (Cafe24 -> OpenAI -> Pinecone -> Google Sheets, Studio Step 3)
- Product reference-image extraction (상품관리 — isolates a clean product cutout via
  `gpt-5.5`'s `image_generation` tool, stored per-product in the sheet)
- Ad generation (Studio Step 4 + Gallery, "생성 시작") — per selected reference ad:
  vision analysis of overlaid text + product instances, brand counter-fact retrieval
  from Pinecone, replacement copywriting, then one `image_generation`-tool render call
  per format x quantity that swaps both the text and the product in a single pass.
  Requires the selected product to already have an extracted reference image (상품관리)
  — the UI surfaces a clear message if not, rather than falling back to the raw photo.

Every one of these calls real, metered APIs (OpenAI, Apify, Pinecone) — be
cost-conscious when testing changes to any of them: verify with dry runs / a single
real call before looping over multiple items.

## Architecture
- One React Context per feature area under `src/context/` (Navigation, Ads, Studio,
  Gallery, Settings), composed together in `AppProviders.jsx`.
- `src/data/` holds mock data standing in for Meta/Cafe24/n8n responses — swap these
  for real API/webhook calls when wiring up integrations.
- `src/components/` is split by screen (`feed/`, `studio/`, `gallery/`, `settings/`)
  plus `common/` and `layout/` for shared primitives (Badge, Chip, Thumb, Sidebar, Toast).
- Styles: `global.css` (tokens + shared classes) plus one CSS file per screen. Plain
  CSS, no CSS modules/Tailwind/styled-components.
- Dev server is pinned to port 3000 in `vite.config.js`.

## Conventions
- Keep components small and single-purpose — one file per component, not one big file.
- New shared UI primitives go in `components/common/`.
- Don't introduce a new state library (Redux/Zustand/etc.) — Context + useState/
  useCallback is the established pattern here.
- Korean UI text should stay in Korean, matching the original mockup content.

## Deployment
- GitHub repo is public.
- Vercel is connected to the GitHub repo and auto-deploys on every push to main —
  no manual deploy steps needed once that's set up.

## Session handoff
This project is planned in Claude Cowork and implemented in Claude Code. At the end
of every work session, append a dated entry to `PROGRESS.md`: what changed,
decisions made, anything left broken or half-done, and open questions for the next
planning session. Keep entries short — a few bullet points, not a full report.
