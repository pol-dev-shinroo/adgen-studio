# Progress Log

## 2026-07-22 — Initial scaffold (Claude Cowork)
- Converted the original `광고생성기_UI목업.html` mockup into a componentized React + Vite app.
- Structure: one Context per feature area for state, components split by screen, CSS split per screen (see CLAUDE.md for the full layout).
- Not yet installed/run — the Cowork sandbox has no network access to the npm registry, so `npm install` couldn't be verified there. Manually checked all imports/exports resolve and braces/parens balance across all 41 source files.
- Two intentional deviations from the mockup, documented in README.md: gallery auto-populates a new "생성중" card when you click "생성 시작" (the original mockup left the gallery static); gallery filter chips are wired up to actually filter (were dead in the original markup).
- Open items handed to Claude Code: first real `npm install && npm run dev` verification, initialize git, create a public GitHub repo and push, then connect the repo to Vercel for auto-deploy on push.

## 2026-07-22 — First-run verification + GitHub push blocked (Claude Code)
- `npm install` + `npm run dev` confirmed clean: loads at http://localhost:3000 with zero console errors (checked all 4 screens — feed, studio wizard, gallery, settings). No build/runtime fixes were needed; the scaffold from the prior session was already correct.
- GitHub push blocked: `gh` (GitHub CLI) is not installed on this machine, so `gh auth status` fails before auth can even be checked. Did not run `git init`/commit yet, per the plan's "stop and tell me" branch.
- Open item: user needs to either install + `gh auth login` the GitHub CLI, or create the `adgen-studio` repo manually (public) at github.com/new — then Claude Code can do `git init`, first commit, `git remote add origin <url>`, `git push -u origin main`.
- Vercel connection still untouched, per instructions — user will do that manually via the dashboard once the repo exists.

## 2026-07-22 — GitHub repo created and pushed (Claude Code)
- GitHub CLI was installed since the last session (needed the full path `C:\Program Files\GitHub CLI\gh.exe` — not yet on this shell's PATH); authenticated as `pol-dev-shinroo`.
- Caught and fixed a near-miss: first `git init` accidentally ran at the parent `image-automation` folder (would have pushed local Claude settings + the original mockup HTML to a public repo). Deleted that `.git` and re-initialized inside `adgen-studio/` only.
- Initial commit (54 files) pushed to **https://github.com/pol-dev-shinroo/adgen-studio** (public, branch `main`).
- Remaining: user connects the repo to Vercel via dashboard (Import Git Repository) for auto-deploy on push.

## 2026-07-22 — Vercel connected, deployment confirmed live (Claude Cowork)
- User imported `pol-dev-shinroo/adgen-studio` into Vercel via the dashboard.
- Verified via the Vercel MCP connector (`get_project`): framework auto-detected as `vite`, latest deployment `readyState: READY`, `target: production`.
- Live URL: https://adgen-studio-red.vercel.app
- Pipeline is now fully wired: push to `main` → Vercel auto-builds → auto-deploys. No further manual deploy steps needed.
- Full loop confirmed working end-to-end: Cowork plans/scaffolds → Claude Code implements/verifies/pushes → Vercel auto-deploys → Cowork can check status via the connector without hopping tools.

## 2026-07-22 — Native Meta Ads collection backend, n8n dropped (Claude Code)
- **Decision: n8n is dropped entirely.** The Meta Ads collection pipeline is now a native Express backend under `backend/`, replicating the logic of the old n8n workflow (`(벡엔드) 1. Meta Ads v2.json`, kept outside the repo as reference).
- Flow: `POST /api/collect {keywords}` → 202 + jobId (job runs in background, in-memory job store) → Apify `facebook-ads-scraper` sync actor per keyword → pure mapper to the 20-column layout → Google Sheets upsert matched on Ad Archive ID. `GET /api/collect/:jobId` for status, `GET /api/health`.
- **Sheets auth pivoted mid-session from service-account key to OAuth2 + refresh token** — org policy `iam.disableServiceAccountKeyCreation` blocks key creation. One-time `scripts/google-auth.js` helper obtains the refresh token (localhost:3001 callback). Note: consent screen is in Testing mode → Google expires refresh tokens after ~7 days; publish to Production or re-run the script on `invalid_grant`.
- Mapper unit tests (node built-in runner): 4/4 pass — camelCase fixture, snake_case variants, near-empty item, column order.
- Real end-to-end run verified with keyword `뉴트리원`: 77 ads fetched, 77 appended / 0 updated (first run), sheet confirmed at 78 rows incl. header; existing sheet header matched our 20 columns exactly. Sample rows spot-checked — field alignment correct (note: keyword search also pulls third-party ads mentioning the keyword, e.g. Naver smartstore DPA ads).
- Secrets: `backend/.env` gitignored (verified with `git check-ignore` before commit); no tokens in code or logs.
- Frontend still calls nothing — wiring the feed screen's "실시간 수집" to `POST /api/collect` is the natural next step.

## 2026-07-23 — Drive media archiving (fbcdn URLs expire) (Claude Code)
- Problem solved: fbcdn URLs in the sheet are signed/short-lived. Media is now downloaded at collection time (signatures still fresh) and archived permanently to Google Drive: `AdGen Media Archive/<brand>/<adArchiveId>_<index>.<ext>`, "anyone with link" viewer permission.
- Sheet grew to 22 columns (A..V): `Archived Image Links` / `Archived Thumbnail` inserted at O/P after `Image Links`; original fbcdn columns kept for reference. Existing sheet migrated with `scripts/migrate-sheet-22cols.js` (inserts columns so old rows stay aligned; idempotent).
- OAuth re-scoped: refresh token now carries `spreadsheets` + `drive.file` (user re-ran `scripts/google-auth.js`); **Drive API had to be enabled in the Cloud project** — the token had the scope but the API was off, failing with "has not been used in project... or it is disabled".
- New `drive.service.js` (folder ensure/cache, per-brand subfolders, streaming upload, re-scrape dedupe via cached folder listing), `utils/pool.js` (3 parallel downloads per ad, no new deps), shared `google.client.js` for Sheets+Drive auth. Download failures log + leave cell empty, never fail the job.
- Verified with a real `뉴트리원` run: 77 ads → 0 appended / **77 updated** (upsert matching proven on re-scrape), **161 files uploaded, 0 failed**, Drive links confirmed in sheet cells O/P and click-verified.
- Video files still not archived (thumbnails only) — revisit if needed; consider Drive storage quota if many brands are collected.

## 2026-07-23 — Column reorder + destructive full reset (Claude Code)
- Reordered `AD_COLUMNS` so archived (permanent Drive) links are primary and raw fbcdn links are reference-only: `Archived Image Links` now sits before `Image Links`, `Archived Thumbnail` before `Video Thumbnail`. Still 22 columns A..V; `sheets.service.js` `LAST_COLUMN` untouched (already `'V'`). Mapper tests updated for the new indices, still 4/4 passing.
- **Full reset, client-approved**: new `scripts/reset-archive.js` clears the whole sheet tab (A:V, header included) and trashes (not permanently deletes — 30-day Drive trash recovery) the old "AdGen Media Archive" folder tree. Ran it: sheet cleared, old root folder (id `1H_dMcQNQN3xe5Wky4Sk5etktDr3pNtla`) trashed.
- Restarted the backend process afterward — `drive.service.js` caches folder IDs in memory for process lifetime, so a stale process would've kept uploading into the trashed folder. Confirmed a fresh process recreates "AdGen Media Archive" cleanly (new id `1CzOIlVVR_oNpWaoLf9YeHTkBi1a4a8Hj`) with no manual folder cleanup needed.
- Fresh end-to-end verification with keyword `안티칼` on the reset archive: 15 ads → 15 appended / 0 updated, 24 files uploaded / 0 failed. Header row confirmed in the new column order; sample Drive links (brand `antical.1`) click-verified.
- `reset-archive.js` kept in the repo as a reusable admin script (no secrets — reads env like everything else).

## 2026-07-23 — Keyword-named Drive folders, frontend wired to real backend (Claude Code)
- **Drive folders now grouped by search keyword, not Page name** — a real Facebook Page literally named "antical.1" made it obvious that grouping by the ad's raw `Brand` was the wrong axis. Renamed `getBrandFolder`→`getKeywordFolder` (drive.service.js) and the `brand`→`keyword` param throughout collect.service.js/drive.service.js. **Accepted tradeoff, client's explicit choice**: ads from different real advertisers that both match the same search term now land in the same folder — noted inline in code and here, not something to "fix" later.
- Ran the full reset again (sheet cleared, old folder trashed) and a fresh `안티칼` collection to verify: 15 ads, 24 files, 0 failures, Drive folder now literally named `안티칼` with images directly inside (previously `antical.1`).
- **Frontend now talks to the real backend for the Feed screen** (경쟁사 광고 피드 only — Studio/Gallery/Settings intentionally untouched, their real data sources don't exist yet):
  - Backend: added `cors` (env-configurable `CORS_ORIGIN`, defaults to the Vite dev server origin) and `GET /api/ads` (reads the sheet, returns rows as objects keyed by the 22-column layout) — reused `sheets.service.js`, no new auth path.
  - Frontend: new `src/api/backendClient.js` (getAds/startCollect/getJobStatus) and `src/api/adaptAd.js`. **Design choice**: adapted the real sheet-row shape into the mock UI shape (id/brand/title/gradient/media/desc/live/image) rather than reshaping AdCard/AdGrid/CollectedResults/BrandFilterBar — one adapter file is far less invasive than touching four components. `initialAds.js` kept as a fallback if the backend is unreachable on mount (not as the default state anymore).
  - `AdsContext.collect()` now does the real thing: POST to start a job, poll every 1.5s, re-fetch `/api/ads` on completion, and diff by Ad Archive ID against what the UI already had to drive the fresh/dup styling — same UX, real data.
  - **Bug caught before shipping**: the sheet stores Drive's `webViewLink` (an HTML viewer page, `.../file/d/<id>/view`), which does **not** render as `<img src>` — confirmed via `naturalWidth: 0`-style failure before the fix. `adaptAd.js` now converts it to Drive's public thumbnail endpoint (`drive.google.com/thumbnail?id=<id>&sz=w1000`) for the `<img>` tag; the sheet itself still stores the original webViewLink (the human-clickable link), unchanged.
  - `Thumb.jsx` renders a real `<img object-fit:cover>` when an ad has an archived image, with a dark gradient overlay (new CSS in `feed.css`, scoped to `.ad .thumb.has-image`) so the title/badges stay legible over a photo; falls back to the original gradient box when there's no image. Change kept localized — gallery/studio's separate raw `.thumb` divs are untouched.
  - Verified live in-browser with both dev servers running: feed loads 15 real `antical.1`/`안티칼` ads with real photos (network-confirmed `naturalWidth: 1000`), zero console errors, and a real "실시간 수집" run for `안티칼` correctly reported 15/15 as duplicates (already archived) with the right badges. Side effect (not a bug): Studio's step-1 reference-brand list now shows real brands too, since it reads the same shared `AdsContext` — Studio's own code was not modified.
  - One test-only false alarm worth recording: the browser automation's "type" action fired a trailing Enter that double-submitted the search once, racing two collection jobs — not a code bug, resolved by using a direct value-set instead. Left a `console.error` in `collect()`'s catch block (previously silent) since it was genuinely useful for debugging and has no downside.
