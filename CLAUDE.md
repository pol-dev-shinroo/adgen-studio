# AdGen Studio

AI-assisted ad creative pipeline for 헬시키키/키키뷰티. Scrapes competitor ad creative, analyzes it, and
generates counter-marketing ad images/copy in our own brand's voice using OpenAI's Responses API
(`gpt-5.5` orchestrating the hosted `image_generation` tool, which renders through `gpt-image-2`).

## Architecture

- `src/` — React + Vite frontend. One `Context` per feature under `src/context/` (AdsContext, ProductsContext,
  StudioContext, AIStudioContext, GalleryContext, etc.) composed once in `AppProviders.jsx`, never remounted
  as the user navigates between screens (`NavigationContext`'s `go()` just swaps which screen renders).
- `backend/` — Express + TypeScript-via-tsx (plain `.js` for most files, `.ts` only where the mapper layer
  benefits from real types — see `backend/src/mappers/*.ts`). Layering: `routes/` → `controllers/` →
  `services/`. `services/generation/` holds the actual AI pipeline (vision analysis → counter-fact research
  → copywriting → image render), one file per pipeline stage.
- **Datastore: Google Sheets + Drive, not a traditional database.** Every "table" is a Sheets tab; every
  generated/uploaded image lives in Drive, referenced by URL. `backend/src/services/sheets/` wraps all of
  this. Mappers (`backend/src/mappers/`) translate between raw Sheet rows (literal Korean column names as
  object keys, e.g. `row['제품특성']`) and the shapes the rest of the app uses.
- **Two brands, one app**: 헬시키키 and 키키뷰티, each with independent Cafe24 credentials/product catalogs,
  selected via a `brandKey` threaded through most of the generation pipeline (`findBrandDef` in
  `backend/src/services/generation/helpers.js`).
- **Vector search**: Pinecone, one namespace per brand, storing each product's own `analyzeProduct.service.js`
  analysis (제품특성/효과효능/페인포인트/etc.) as `aiAnalysis` JSON metadata, used for few-shot retrieval.

## Conventions — read before writing code here

- **DI on every function that makes a real external call** (OpenAI/Sheets/Pinecone/Drive/Cafe24): an
  optional trailing parameter, e.g. `{ getClientFn = getClient } = {}`, defaulting to the real
  implementation. This is the ONLY way these functions get unit-tested — never add a real external call
  without this pattern, and never write a test that hits a real API.
- **Comment convention: `// Part <LETTER>: ...`** on any non-trivial code addition or change, explaining
  the actual reasoning/trade-off, not just restating what the code does. Parts are sequential letters
  (A, B, C, ... Z, AA, BB, ... currently up to `SS`), assigned once per logical unit of work, referenced
  both in code comments and commit messages. When you do new work here, keep incrementing this sequence —
  check `claude-code-prompts/` for the highest letter already used before picking the next one, and don't
  restart or reuse a letter even if the two of you are working in parallel (coordinate the next letter with
  whoever's currently ahead, e.g. by checking the other person's latest pushed commits first).
- **Model-choice decisions are backed by a real comparison, documented in a comment.** When choosing which
  OpenAI model to use for a given pipeline step, don't guess based on general reputation — run the same
  real input through the cheaper candidate and the incumbent, compare actual output quality, and leave a
  comment explaining the specific, material difference found (see `AA-5`/`AA-6` comments in
  `counterFacts.service.js`/`copywriting.service.js` for the pattern). If a cheaper model is just as good,
  switch and document that too — this isn't "always use the most expensive model," it's "never guess."
- **Never invent, never silently drop.** Vision/analysis prompts throughout this codebase are explicit
  about not hallucinating facts/text that aren't really there ("do not invent information," "do not
  fabricate a packaging form factor," etc.) — hold any new prompt you write to the same standard, and when
  something can legitimately fail (a missing reference image, an empty Pinecone namespace), fail loud with
  a clear Korean-language error message the frontend can show a real user, not a silent empty result.
- **Partial-failure tolerance in batch operations**: a job that processes N items (N reference ads, N
  products) never aborts the whole batch over one item's failure — it collects `{ succeeded, failed,
  failures }` and keeps going. See `run.js`'s per-ad/per-render try/catch for the pattern.
- **Frontend/backend field naming**: backend service functions and Sheet columns use literal Korean keys
  where that's the natural business term (`제품특성`, `효과효능`, `Product ID`); the adapter layer
  (`src/api/adapt*.js`) is what translates a raw Sheet row into the camelCase shape components consume —
  don't skip the adapter and read raw Korean keys directly in a component.

## Working with the AI generation pipeline specifically

Every prompt sent to OpenAI in `backend/src/services/generation/` is a deliberately engineered, tested
piece of the product — treat prompt-text changes with the same care as logic changes, not as free-form
copy edits:

1. Read the exact current prompt text and its surrounding comments before changing it — several of these
   prompts have already been tightened once or twice after a live bug was found (see
   `productSwapInstructionFor`'s Part MM → NN → PP history for an example of iterative, evidence-based
   tightening after each one turned out to be incomplete).
2. A prompt change is not verified by a passing unit test alone — unit tests here mock the OpenAI call
   entirely (per the DI convention above), so they only prove the code *sends* the right prompt text, never
   that the model actually *behaves* the way the new wording asks. Real verification means running an
   actual generation and reading the resulting image/copy yourself.
3. Write up any new pipeline behavior change as a file in `claude-code-prompts/`, following the existing
   `claude-code-prompt-part-<letter>.md` files' format: what was found (grounded in exact current code, not
   assumption), the fix, and a "Verify" section that requires live testing, not just `npm test`.

## Running locally

Backend: `cd backend && npm start` (or `npm run dev` for auto-restart) — needs `backend/.env` populated
(see `backend/.env.example`; ask a project owner for real values, never invent placeholder secrets and
commit them). Frontend: `npm run dev` from the repo root (Vite). Tests: `npm test` in `backend/` (Node's
built-in test runner via `tsx`, `node --import tsx --test test/*.test.js test/*.test.ts`) and `npm test` at
the repo root (Vitest, React Testing Library, `vitest run`). Backend also has `npm run typecheck` (`tsc
--noEmit`) — run it alongside `npm test` there, it isn't implied by the test script.

## Deployment

Frontend: **Vercel**, https://adgen-studio-red.vercel.app, auto-deploys on push to `main`. `VITE_API_BASE_URL`
is baked in at build time from the committed `.env.production` — a backend URL change needs a new frontend
build, not just a backend redeploy, to take effect in production.

Backend: **Railway**, intended URL https://backend-production-5a23.up.railway.app, auto-deploys on push to
`main` — but this webhook has been observed to occasionally miss a push or redeploy a stale commit; after
pushing a backend change, confirm the LIVE deployed commit hash actually matches what you just pushed
(check Railway's dashboard/logs) before telling anyone the change is live. Never report a deployment as done
without that confirmation.

**Known issue as of Part SS**: the Railway project's free trial expired, and the backend URL above currently
returns Railway's own 404 ("Application not found") rather than the app. This is a billing/account action
only the project owner can take (selecting a paid plan in the Railway dashboard) — no amount of redeploying
from Claude Code will fix it. Confirm `curl <backend-url>/api/health` actually returns `{"ok":true}` before
assuming the backend is live.

## Session handoff

This project keeps a running log in `PROGRESS.md` at the repo root — one dated entry per work session,
covering what changed, decisions made, anything left broken/half-done, and open questions. It's the
project's memory across sessions (and between whoever else works on this repo) in addition to the per-Part
files in `claude-code-prompts/`; skim recent entries before starting substantial new work, and append a
short entry of your own when you finish a session.
