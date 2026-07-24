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
| `POST /api/collect` `{ "keywords": ["뉴트리원"] }` | Starts a collection job, returns `202 { jobId }` immediately; scraping runs in the background |
| `GET /api/collect/:jobId` | Job status: `running` / `done` / `failed` + per-keyword summary (ads fetched, appended, updated) and sample rows |
| `GET /api/ads` | Every archived row from the sheet, as JSON objects keyed by the 22-column layout — what the frontend feed reads |
| `PATCH /api/ads/:adArchiveId` `{ "field": "Search Keyword", "value": "..." }` | Edits one cell for that ad's row. `field` is allowlisted — only `Search Keyword` for now — everything else in the sheet is scraper-owned |
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
    common/               Badge, Chip, Thumb, Modal, MultiLineText (shared primitives)
    feed/                 competitor ad feed screen (AdCard is compact; AdDetailModal
                           shows the full 22-field record on click)
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
