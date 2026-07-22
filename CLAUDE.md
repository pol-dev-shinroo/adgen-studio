# AdGen Studio — Project Notes for Claude Code

## What this is
React + Vite front end for AdGen Studio, an ad-automation tool. It pulls competitor
ads from the Meta Ads Library, cross-references our own Cafe24 product data (synced
via a Pinecone vector DB), and uses generative AI (Higgsfield Soul ID under
evaluation) to create new ad creative inspired by competitor ad structure/layout
without copying their actual pixels, for copyright-safety reasons. n8n is the
intended backend job runner (see the webhook URL on the Settings screen).

Right now this app is UI-only with mock data — no real Meta/Cafe24/Pinecone/n8n
calls are wired in yet.

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
