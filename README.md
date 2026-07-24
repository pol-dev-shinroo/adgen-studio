# AdGen Studio (React + Vite)

React port of the `광고생성기_UI목업.html` mockup — competitor ad feed, generation
studio wizard, result gallery, and settings/product-review screens — plus a
Node/Express backend that collects competitor ads from the Meta Ads Library
(via Apify) into a Google Sheet.

## Run the frontend locally

```bash
cd adgen-studio
npm install
cp .env.example .env    # VITE_API_BASE_URL, defaults to http://localhost:4000
npm run dev
```

Then open **http://localhost:3000** (port is fixed in `vite.config.js`). The
backend must be running too (see below) — the Feed screen (경쟁사 광고 피드)
loads and searches real archived ads through it; without a backend it falls
back to sample data and shows a toast.

## Backend (`backend/`)

Express service that replaces the old n8n workflow: keywords in → Apify
`facebook-ads-scraper` actor → 22-column rows upserted into the client's
Google Sheet (matched on **Ad Archive ID**: existing rows are updated,
new ones appended).

Because Facebook CDN URLs are signed and expire, ad images and video
thumbnails are downloaded at collection time (while the signatures are still
fresh) and archived to Google Drive under `AdGen Media Archive/<search keyword>/`
as `<adArchiveId>_<index>.<ext>`, shared as "anyone with link can view".
Folders are grouped by **search keyword**, not by the ad's Facebook Page name
— a deliberate tradeoff: ads from different real advertisers that happen to
match the same keyword land in the same folder. The sheet stores the
permanent Drive links in **Archived Image Links** / **Archived Thumbnail**
(columns N/Q — listed before the raw fbcdn columns, since the Drive links are
the primary/permanent ones). Re-scrapes skip files that already exist; a
single failed download logs a warning and leaves the cell empty without
failing the job. Video files themselves are not archived (thumbnails only).

Full reset (clears the sheet and trashes — not permanently deletes — the
whole Drive archive folder): `node scripts/reset-archive.js`. Destructive;
confirm with whoever owns the data before running. **Restart the backend
process afterward** — Drive folder IDs are cached in memory per process.

**Rate-limit resilience**: every Apify/Google Sheets/Drive call goes through
`utils/retry.js`'s `withRetry` (exponential backoff, 1s/2s/4s by default) —
Apify 429/5xx responses and Google 429s / 403-with-quota-reason errors get
retried automatically rather than failing the job outright. If retries are
exhausted, the job fails with `errorCode: 'RATE_LIMITED'` (or
`'UPSTREAM_ERROR'` for Apify 5xx) so the frontend can show a specific "try
again shortly" toast instead of a generic failure message. One subtlety in
`drive.service.js`: the image download + Drive upload are retried together
(re-fetching the source URL fresh on every attempt) rather than retrying
the upload alone, because the upload streams the downloaded bytes directly
— a stream can only be read once, so retrying with a stale one would
silently upload a truncated file.

**Re-scrapes are classified new / updated / unchanged**, not just
appended-vs-updated. `upsertAdRows` compares the incoming row to what was
already in the sheet and reports which of the 22 columns actually changed.
A few columns are deliberately excluded from that comparison:
`Date Scraped` (always differs, that's its job), and the raw
`Image Links` / `Video Link` / `Video Thumbnail` columns — these hold
signed Facebook CDN URLs that get re-signed with a new query string on
*every* scrape regardless of whether the ad itself changed (confirmed by
re-collecting the same keyword twice in a row and seeing 100% "updated"
before this exclusion was added). The Drive-hosted `Archived ...`
counterparts are stable and do count.

**Everything is still auto-saved on scrape — discarding is an after-the-fact
undo, not a staging gate.** `deleteAdRows` genuinely removes rows (a
`deleteDimension` batch request, not a values-clear) and `deleteAdMedia`
trashes the matching Drive files (same recoverable-trash convention as
`reset-archive.js`), both behind `POST /api/ads/discard`. Row numbers are
collected then sorted **descending** before building the delete batch, so
removing a later row never shifts the index of an earlier one still queued
in the same request — verified live: deleting two out of fifteen rows left
the other thirteen's fields correctly aligned, not shifted.

### Setup

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
| --- | --- |
| `APIFY_TOKEN` | Apify console → Settings → Integrations |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client (Web application) with authorized redirect URI `http://localhost:3001/oauth2callback`; **Google Sheets API and Google Drive API** must be enabled and the signing-in account added as a test user on the consent screen |
| `GOOGLE_REFRESH_TOKEN` | One-time: `node scripts/google-auth.js` (requests `spreadsheets` + `drive.file` scopes), approve in the browser **signed in as an account with edit access to the target sheet**, paste the printed token |
| `SHEET_ID` | The long ID in the spreadsheet URL |
| `SHEET_TAB_NAME` | Tab name (default `시트1`) |
| `DRIVE_FOLDER_ID` | Optional — pin the media-archive root folder; empty = find/create "AdGen Media Archive" automatically |
| `CORS_ORIGIN` | Origin allowed to call this API; default `http://localhost:3000` (the Vite dev server) |
| `PORT` | Default `4000` |

Migrating a sheet created with the old 20-column layout:
`node scripts/migrate-sheet-22cols.js` (idempotent; inserts the two archive
columns at O/P and rewrites the header, shifting existing data to stay
aligned).

Sheets auth uses OAuth2 + refresh token (not a service-account key — org
policy blocks key creation). While the OAuth consent screen is in Testing
mode, Google expires refresh tokens after ~7 days; re-run the auth script or
publish the app to Production if collections start failing with
`invalid_grant`.

### Run

```bash
npm start        # or: npm run dev (auto-restart on change)
```

### Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /api/collect` `{ "keywords": ["뉴트리원"], "resultsLimit": 50 }` | Starts a collection job, returns `202 { jobId }` immediately; scraping runs in the background. `resultsLimit` is optional (default 200), must be an integer 10–200 — how many ads Apify returns per keyword, capped for sync-endpoint timeout safety |
| `GET /api/collect/:jobId` | Job status: `running` / `done` / `failed`, `errorCode` (`'RATE_LIMITED'` / `'UPSTREAM_ERROR'` / `null`), live `progress` (`{phase, currentKeyword, totalAdsFound, adsProcessed, recentItems[]}` — `phase` is `'scraping'` → `'archiving'` → `'saving'` → `'done'`), per-keyword `summary` (ads fetched, appended/updated/unchanged counts, `statuses[]` — one `{adArchiveId, status, changedFields}` per touched ad) and sample rows |
| `GET /api/ads` | Every archived row from the sheet, as JSON objects keyed by the 22-column layout — what the frontend feed reads |
| `PATCH /api/ads/:adArchiveId` `{ "field": "Search Keyword", "value": "..." }` | Edits one cell for that ad's row. `field` is allowlisted — only `Search Keyword` for now — everything else in the sheet is scraper-owned |
| `POST /api/ads/discard` `{ "keyword": "안티칼", "adArchiveIds": [...] }` | Removes the given ads' sheet rows and trashes their Drive media. Returns `{ deleted, driveFilesTrashed, failures[] }` — a failure on one ad's Drive cleanup or sheet row never blocks the others, everything is attempted and every failure reported |
| `GET /api/health` | `{ ok: true }` |

### Tests

```bash
cd backend
npm test    # node built-in test runner; covers the ad → row mapper
```

## Structure

```
src/
  main.jsx              entry point
  App.jsx               top-level layout (sidebar + active screen + toast)
  api/                   backend HTTP client + raw-sheet-row -> UI-shape adapter
    backendClient.js        getAds/startCollect/getJobStatus/updateAdField
    adaptAd.js               adapts a sheet row into the feed's ad shape (keeps ad.raw)
  context/               one React Context per feature area (state + actions)
    NavigationContext.jsx   current screen, toast
    AdsContext.jsx          competitor ad archive, search/collect, dedupe, rename
    StudioContext.jsx       4-step generation wizard state
    GalleryContext.jsx      generated results, approve/retry
    SettingsContext.jsx     product-info review/override state
    AppProviders.jsx        composes all providers
  data/                  mock data (stand-ins for Meta/Cafe24/n8n responses)
  components/
    layout/              Sidebar, Toast
    common/               Badge, Chip, Thumb, Modal, ImageLightbox, RetryImage, MultiLineText
    feed/                 competitor ad feed screen (AdCard is compact; AdDetailModal
                           shows the full 22-field record on click; CollectionProgress
                           renders the live search/archive/save progress while a
                           collection job is running)
    studio/               generation wizard (steps/ holds the 4 step panels)
    gallery/              result gallery screen
    settings/             brand sync + product review + n8n integration
  styles/                global.css (tokens/shared classes, incl. Modal) + one css
                         file per screen
```

## Notes / deviations from the mockup

- All interactive behavior (search+collect simulation, dedupe, wizard
  validation, product review overrides) is preserved from the original JS.
- One intentional enhancement: clicking "생성 시작" in the wizard now actually
  pushes a new "생성중" card into the Result Gallery (the original mockup left
  the gallery static). Easy to revert if you'd rather keep it static until
  real generation is wired up.
- Edits still use `window.prompt()` to match the mockup's interaction — swap
  for a real modal whenever you're ready to polish the UI. On the Feed
  screen the rename now persists for real (`PATCH /api/ads/:adArchiveId`,
  optimistic with rollback on failure); Settings' product-field edits are
  still local-only mock state.
- **The Feed screen (경쟁사 광고 피드) is wired to the real backend** — it loads
  the archived Meta ad set via `GET /api/ads` and "실시간 수집" runs a real
  Apify collection job. Studio/Gallery/Settings are still UI-only with mock
  data, since their real data sources (Cafe24/Pinecone, image generation)
  don't exist yet. Note: because `AdsContext` is shared app-wide, the Studio
  wizard's "레퍼런스 브랜드" step (which reads the same ad archive) now shows
  real collected ads too, even though Studio's own code wasn't touched.
- **Feed card is compact-by-design, click-through for detail**: with 22 real
  sheet columns, cramming everything onto the browsing grid stopped scaling.
  `AdCard` now shows a clean photo + brand + one truncated line + meta +
  CTA; clicking anywhere on the card (except the pencil/CTA, which stop
  propagation) opens `AdDetailModal` with the full record — gallery, header,
  copy, dates, footer links — built from `ad.raw`, the original sheet row
  the adapter keeps attached to every ad.
- **Brand label = Search Keyword, not the raw Facebook Page name** — Drive
  folders were already grouped by keyword (see backend section above), so
  the feed's primary label follows the same axis for consistency. The ad's
  actual Page name survives as `ad.pageName` and shows as a muted sub-line
  when it differs (e.g. a real page literally named "antical.1").
- **Re-scrape status is real, not guessed**: the collected-results tab shows
  new / updated / unchanged per ad, sourced from the backend's actual diff
  (see backend section) rather than a "was this ID already in the list I
  had loaded" client-side guess. Updated ads show which fields changed,
  translated to friendly Korean labels where one's defined.
- **Feed filter chips are wired up** (archive tab only): 🖼 이미지 / 🎬 동영상
  filter by media type (click the active one again to reset to all — same
  toggle pattern as the brand chips), 🗓 최근 7일 filters to ads scraped in
  the last 7 days. All three combine with the brand filter.
- **Gallery images open a full-size lightbox** on click (`ImageLightbox`,
  stacked on `AdDetailModal`): larger Drive thumbnail request (`sz=w1600`
  vs the grid's `w1000`), a link to the true original file, and
  left/right-arrow navigation when there's more than one image. Escape
  closes the lightbox first and the detail view on a second press — both
  reuse the shared `Modal` component's own Escape handling, so the detail
  view's `onClose` is wrapped to swallow the first Escape while the
  lightbox is open rather than closing both at once.
- **실시간 수집 now shows live progress instead of a blank wait**: clicking
  the button switches to the results tab *instantly* (before the network
  request even goes out — `AdsContext.collect()` sets a placeholder
  `activeJob` synchronously on click), then `CollectionProgress` renders an
  indeterminate bar during the search phase, a real percentage bar during
  archiving, and a live newest-first list of ads as they're processed
  (thumbnail, brand, snippet, a status chip). Poll interval dropped to
  900ms (from 1.5s) so this actually feels live. When a run finds nothing
  new or changed, the results view leads with a plain-language "모두 최신
  상태입니다" line instead of just bare zero counts.
- **User-controlled collection size**: a slider next to the search bar (10–200,
  step 10, default 50) controls how many ads Apify returns per search —
  purely a fetch-size knob, the dedupe/diff logic underneath is unaffected.
  Kept as local state in `SearchBar.jsx` itself (not `AdsContext`) since
  it's only ever read at the moment `collect()` is called and nothing else
  needs it.
- **Thumbnail images retry before falling back**: `drive.google.com/thumbnail`
  is an undocumented endpoint that can intermittently throttle under bursts
  of many simultaneous requests (a full grid loading at once) or fail
  briefly right after a file's sharing permission is set but hasn't
  propagated yet — neither means the image is actually missing. `RetryImage`
  retries the same URL up to twice more (with a cache-busting query param
  so the browser doesn't just replay the cached failure) before giving up;
  `Thumb.jsx` falls back to its existing gradient placeholder once retries
  are exhausted, and the detail modal / lightbox show a plain "이미지를
  불러올 수 없습니다" message instead of a broken-image icon.
- **Select mode on the collected-results tab**: "선택하기" enters select
  mode with every ad pre-checked (i.e. "keep everything" is the default —
  you uncheck the few you don't want, not check the ones you do). A
  per-card checkbox replaces the status badge while active (top-left of the
  thumbnail); the pencil/CTA are hidden — editing or generating from an ad
  you might be about to discard doesn't make sense. "보관하기" discards
  whatever's left unchecked via `AdsContext.discardAds()` → `POST
  /api/ads/discard`, removing those IDs from both `collected` and `ads` on
  success and reporting kept-vs-discarded counts in a toast; if nothing's
  unchecked it just exits select mode with a "모든 항목이 보관되었습니다"
  toast instead of calling the backend at all.
- **The "실시간 수집" button pulses while a job is running and can't be
  double-clicked**: a small green dot (only rendered — and only
  animating — while `activeJob` is truthy, not just hidden) plus
  `disabled={!!activeJob}`. The guard actually lives in the click handler
  itself (checked before calling `collect()`), not only the `disabled`
  attribute, so a stray Enter keypress in the search input can't slip a
  second overlapping job past it either — this closes a real double-submit
  race an earlier session's testing had noted but not fixed at the time.
