# AdGen Studio (React + Vite)

React port of the `광고생성기_UI목업.html` mockup — competitor ad feed, generation
studio wizard, result gallery, and settings/product-review screens — plus a
Node/Express backend that collects competitor ads from the Meta Ads Library
(via Apify) into a Google Sheet.

## Run the frontend locally

```bash
cd adgen-studio
npm install
npm run dev
```

Then open **http://localhost:3000** (port is fixed in `vite.config.js`).

## Backend (`backend/`)

Express service that replaces the old n8n workflow: keywords in → Apify
`facebook-ads-scraper` actor → 22-column rows upserted into the client's
Google Sheet (matched on **Ad Archive ID**: existing rows are updated,
new ones appended).

Because Facebook CDN URLs are signed and expire, ad images and video
thumbnails are downloaded at collection time (while the signatures are still
fresh) and archived to Google Drive under `AdGen Media Archive/<brand>/` as
`<adArchiveId>_<index>.<ext>`, shared as "anyone with link can view". The
sheet stores the permanent Drive links in **Archived Image Links** /
**Archived Thumbnail** (columns O/P) alongside the original fbcdn URLs.
Re-scrapes skip files that already exist; a single failed download logs a
warning and leaves the cell empty without failing the job. Video files
themselves are not archived (thumbnails only).

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
