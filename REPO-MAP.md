# Gate City Hub — Repo Map

A single-page guide to what every file in this repo does and how the pieces fit
together. Nothing here changes the code — it's a map, so the flat file list at
the repo root becomes easy to navigate.

**Live site:** gatecityhub.com · **Stack:** React + Vite → Cloudflare Workers ·
**Storage:** Supabase KV (via `store.js`) · **Automation:** cron-job.org →
`worker.js` `/api/run-job`

**Companion doc:** `SWEEP-2026-08-02.md`, repo root — the Aug 2 2026
top-to-bottom sweep. Ten findings, each read in the real code line by line, plus
a **"Checked and cleared"** list of claims that did NOT survive checking so
nobody re-chases them. Read **"What was fixed"** and **"Still open,
deliberately"** at the bottom FIRST: the numbered findings above them are
written against the code *as it was before the fixes*, so their line numbers are
stale on purpose.

---

## ONE WORKER BUILDS FROM THIS REPO, AND `wrangler.toml` IS ITS CONFIG

⚠️⚠️ **THIS SECTION SAID THE OPPOSITE UNTIL AUG 13 2026, AND IT WAS THE MOST
DANGEROUS WRONG LINE IN THE MAP.** It described two Workers, and said of the
app: *"Cloudflare dashboard build settings. It does NOT read `wrangler.toml`."*
Anyone acting on that would either skip a real config change as pointless, or
edit that file believing it could not reach production. It reaches production.

| Worker | Serves | Built from |
|--------|--------|-----------|
| `gate-city-hub` | gatecityhub.com — the React app **and** every `/api/*` route | repo-root `wrangler.toml` (`name = "gate-city-hub"`, `main = "worker.js"`) |

**`gate-city-hr-api` no longer exists.** The account holds three Workers and it
is not one of them: `gate-city-hub`, `village-hub` (the clone store) and one
unrelated project.

Four things settle it, listed because one of them alone would not:

1. The Cloudflare account has no Worker by that name.
2. `wrangler.toml` declares `[assets] directory = "./dist"` with
   `not_found_handling = "single-page-application"`. That is the React app's
   config. An email API does not serve an SPA.
3. This same file, under **Deploy flow**, says cron-job.org calls `worker.js`
   at `/api/run-job` — and every one of those URLs in `CRON-JOBS.md` is on
   gatecityhub.com. One `worker.js`, one host.
4. CLAUDE.md records a full-file rewrite of `wrangler.toml` that dropped the
   `[assets]` block and **took gatecityhub.com down with Error 1101**. A file
   the app ignores cannot do that.

⚠️ **THE JULY 2026 TEST WAS REAL AND ITS CONCLUSION WAS TOO WIDE.** Cloudflare's
bot renamed `name` from `gate-city-hub` → `gate-city-hr-api`, that was merged,
and the app was unaffected. True. But it only shows the file was pointing at a
*different* Worker at that moment, which is what `name` decides. The name is
back to `gate-city-hub`, so the same file now deploys the app. An experiment
that changes the variable under test cannot be quoted afterwards as a permanent
property.

⚠️ **SO A CHANGE TO `wrangler.toml` IS A PRODUCTION CHANGE**, in front of ~106
people about a minute after the merge. Change only the line that needs
changing; never hand over a rewritten copy of the whole file. The Error 1101
outage above is what that rule is made of.

---

## Naming conventions (already in use)

- **`PascalCase.jsx`** → a React component. If it ends in **`Tile.jsx`** it's the
  card registered in the App tile grid; the matching non-Tile file is usually the
  inner content it renders.
- **`camelCase.js`** → a plain data or logic module (no JSX). Roster data, config
  defaults, parsers, engines.
- Filenames must stay camelCase/PascalCase with no underscores — underscores break
  Vite's resolver silently.

---

## Build & config — keep at repo root, don't move

| File | Role |
|------|------|
| `index.html` | Vite entry HTML; references `main.jsx` |
| `main.jsx` | React mount point |
| `App.jsx` | Top-level shell — registers every tile, handles routing/session `{ name, tier }` |
| `hrTeam.js` | Roster seed + `loadHRTeam(Result)` + default PIN + handbook exemption — the dashboard's small door into HR data (near-leaf: imports only `store.js`). HRConsole re-exports it all |
| `slScore.js` | Shift Leader Scorecard season pin + score bands (leaf) — dashboard reads these without loading the tile |
| `finShared.js` | Financial Suite tab-handoff key (leaf) |
| `facilitiesData.js` | Facilities punch-list seed + actions table (leaf) — feeds the input register |
| `index.css` | Global styles |
| `vite.config.js` · `postcss.config.js` · `tailwind.config.js` | Build tooling |
| `package.json` | Dependencies |
| `.env` | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` only. **Correct as-is.** Anything `VITE_`-prefixed is compiled into the browser bundle and is public by design; the anon key is *meant* to be public and RLS is what protects the data. Real secrets are Cloudflare Worker secrets, never here. |
| `wrangler.toml` | **The live app's config.** Editing it deploys. This row said "NOT the app's" until Aug 13 2026 — see the Worker section at the top for why that was wrong and how it was checked |
| `worker.js` | The `gate-city-hub` Worker — serves gatecityhub.com, every `/api/*` route, Slack automation and the scheduled jobs |
| `supabase-schema.sql` | KV table definition |
| `public/` | Static assets + standalone training HTML pages |

**Cloudflare Worker secrets** (set in the dashboard, not in the repo):
`ANTHROPIC_API_KEY` · `GOOGLE_SHEETS_API_KEY` · `RESEND_API_KEY` ·
`RUN_JOB_KEY` · `SLACK_BOT_TOKEN` · `SUPABASE_SERVICE_KEY` · `SUPABASE_URL`

---

## Shared modules — imported almost everywhere

| File | Role |
|------|------|
| `store.js` | `kvGet` / `kvSet` — the browser storage layer. **Reads and writes take different roads (Aug 2 2026).** *Writes go through the Worker and only the Worker:* `kvSet` posts to `/api/kv-set`, HR keys to `/api/hr-store`. The direct-to-Supabase write fallback was **deleted**, which is what let the `kv_store` write policy close. A refused write now returns `false` loudly instead of silently succeeding around the Worker. *Reads still go direct* to Supabase with the **anon** key for non-HR keys (`kvReadDirect`); HR keys read through `/api/hr-store`. localStorage is the local-dev path only (`isShared === false`), not a production fallback. Most tiles persist through here. |
| `MonthYearPicker.jsx` | Reusable month/year selector |
| `CalendarGrid.jsx` | Reusable calendar/week grid |

⚠️ **Two storage paths exist and they are not the same backend.**
`store.js` (`kvGet`/`kvSet`) reads with the browser anon key and writes through
the Worker (see the row above). `DailySetup.jsx` and
the Daily Setup boards use `window.storage.get/set(key, true)` — shared Worker
storage via the service key. A tile reading the wrong one sees nothing and
fails silently. `ShiftLeaderScorecard.jsx` deliberately uses `window.storage`
to read the Daily Setup board for exactly this reason.

All KV keys are prefixed `gcfcr-`.

---

## Daily Operations tiles

| File | Role |
|------|------|
| `WasteTracker.jsx` | Waste + donation logging; posts daily summary to `#inventory-management` |
| `OpsChecklists.jsx` | Opening/closing/position checklists |
| `DailyCleaning.jsx` | Daily cleaning sign-off — per-day FOH AM/MID/PM + BOH lists (storage key is week-scoped for the Sunday reset) |
| `FoodSafetyWalkthrough.jsx` | Food safety walkthrough |
| `CashAudit.jsx` | Dollar-denomination cash audit + change fund order |
| `EquipmentLog.jsx` | Equipment check log |
| `ThawAllocation.jsx` | Freezer→cooler thaw cabinet allocation (auto-fills from case pars) |
| `SupplyCentral.jsx` | Supply/par management |
| `DailySetup.jsx` | Per-week FOH/BOH board. **Auto Assignment is the only board** — the Google Docs source and the Reset action were removed. Import is the only way to (re)build a day. Also holds the director-only Edit History panel. |

---

## Auto-Assignment engine (feeds DailySetup)

| File | Role |
|------|------|
| `FOHAutoAssign.js` | Front-of-house placement engine — time-aware, chains handoffs (`"Maria →Hanna 6"`), returns `{ data, placed, unplaced, gaps }` |
| `BOHAutoAssign.js` | Back-of-house placement engine — station-pair matching, sequential blocks (`"Tyler @8:30"`), fills empty stations before doubling anyone up |
| `stationTemplates.js` | Per-day FOH/BOH station templates + posted hours. ⚠️ **This is now the SOURCE OF TRUTH.** It was originally generated from the Google Sheets, but the Sheet is being retired — station hours change *here*. The file's own header now says so too — "★ THIS FILE IS THE SOURCE OF TRUTH. Station hours change HERE." |

**`FOHAutoAssign.js` returns a `gaps` array** (`:987`) — the sub-intervals of a
station's staffed window that nobody covers. **`DailySetup.applyImport` keeps
them now.** The FOH branch stores `dayData.gaps = res.gaps || []`
(`DailySetup.jsx:3209`), the import summary appends `· N uncovered — see the
board` (`:3213`), and the day renders a red **"N uncovered slots"** banner
listing station · daypart · window (`:2134`). A blank cell named in that banner
is a real staffing hole, not a bug, and the list is rebuilt on every import.

⚠️ **FOH only, in all three places.** An uncovered BOH station is still a blank
cell with no explanation. Turning it on is a **three-part** change, not one:

1. `BOHAutoAssign.js:809` returns `{ data, placed, unplaced }` with no `gaps`.
2. The BOH branch of `applyImport` never sets `data.gaps` — the assignment at
   `DailySetup.jsx:3209` is inside the `if (toFoh.length && curFoh)` branch.
3. **The banner markup lives inside `FOHView` (`DailySetup.jsx:2091`), at
   `:2134`. It is not shared.** `BOHView` would need it too.

⚠️ An earlier version of this note said the banner "reads `data.gaps` off
whichever board it renders, so it will light up on its own the day BOH grows the
array." **That is wrong** — point 3 is why. Corrected 2026-08-02 rather than
deleted, because the wrong version makes the job look like a one-line engine
change when it is three coordinated edits across two never-batch files.

The good news for whoever picks this up: the hole data already exists. The BOH
chain-cover loop (`:518-548`) walks a cursor across the station window and, when
nobody is on the clock, explicitly skips to the next later block — so
`[cursor, nextStart]` at `:530` and `[cursor, W.end]` at the `break` are the
uncovered intervals, in hand, already computed. `fmtClockShort` (`:105`) is
there to render them. It does **not** need FOH's `coverage`/`subtractCovered`
subsystem ported over; BOH has none of that and does not need it.

---

## Financial tiles

| File | Role |
|------|------|
| `FinancialSuite.jsx` | Wrapper tab-set: FCR · Labor · Sales · Food Cost · Expenses · Profit Share |
| `FCRPage.jsx` | Food Cost Report / sales-allocation page |
| `SalesAllocation.jsx` | Per-channel daily sales entry (DT/CO/DI/OD/CAT) |
| `FoodCostTracker.jsx` | Invoice + giveaway food-cost tracking |
| `ExpenseTracker.jsx` | Expense entry |
| `ProfitShare.jsx` | Profit-share pot calculator (`pot = basis × tier% × multiplier`) |
| `BusinessScorecard.jsx` | Business Scorecard (Q1–Q4 actuals vs goal) |
| `LaborPlanner.jsx` | Labor budget planner UI. Still exports `monthProductivityGoal`, `monthLaborPlan`, `monthLaborCard` — as browser-bound wrappers over `laborEngine.js` |
| `laborEngine.js` | ★ LEAF. The labor maths (month basis, planned wage, plan, dashboard card, daypart split, standing ops, sales loaders, tier maths) with the storage reader INJECTED — browser binds `kvGet`, worker passes `sbGet`. Feeds the dashboard AND the `labor-daypart` DMs from ONE implementation |

**Financial data modules:** `expenseDefaults.js` · `fcrProjectionData.js` ·
`fcrReferenceData.js` · `productivityTiers.js` (store-bound tier config doors; pure tier maths re-exported from `laborEngine.js`)

*(This list used to end with `historicalProfit-correction*.js`, hedged "exact
filename — confirm". Confirmed Aug 2 2026: **no such file exists**, under any
spelling, anywhere in the repo or in `archive/`. Removed. Do not re-add it from
an older copy of this map.)*

---

## People & Team tiles

| File | Role |
|------|------|
| `HRConsole.jsx` | **Canonical roster.** Exports `HR_TEAM`, `HR_RANK`, `HR_DEFAULT_PIN` — other tiles import these rather than keeping their own copy |
| `PeakReachers.jsx` | Peak Reachers team site — mission/values + launchers into Goals, Growth, L101, Trainer Orientation, Resources |
| `NewHireOrientation.jsx` | New-hire orientation session + files completion records to HR. Renders **inside HR Console**, not as a tile |
| `TrainingSite.jsx` | Training videos + station checklists (trainee dropdown pulls from `HR_TEAM`) + leader modules |
| `RosterImportTraining.jsx` | Slideshow: importing the HotSchedules roster |
| `TrainerTasks.jsx` | Trainer Weekly Cleaning rotation — weekly tasks with photo proof |
| `ShiftLeaderScorecard.jsx` | Per-leader daily entry + scoring; auto-fills lead slots by reading the Daily Setup board |

**People data modules:** `TermArchive.js` (528 terminated-employee records) ·
`trainerTaskRoster.js`

⚠️ **`hrAutomations.js` is NOT at the root and is NOT live.** It sits in
`archive/hrAutomations.js` and **nothing imports it** — confirmed Aug 2 2026,
zero references anywhere outside the docs. It was the backend HR automation
reached via `?job=hr`; that route no longer exists in `worker.js`. Archived
rather than deleted because it is the only written record of how HR automation
was built. See `archive/README.md`. It is left on this page on purpose: knowing
where a file *went* is more useful than a silent gap.

---

## Leadership & EOS tiles

| File | Role |
|------|------|
| `EOSTile.jsx` | EOS dashboard + Accountability Chart + Run Meeting (L10) |
| `AccountabilityChart.jsx` | Company Rocks + leadership tree + open seats |
| `LeadershipDev.jsx` / `LeadershipDevTile.jsx` | Leadership pipeline + roster (content + tile) |
| `Leadership101.jsx` | Leadership 101 course (double-PIN gated) |
| `IPOActionItems.jsx` | IPO action items ledger (tile "IPO Action Items") |

---

## Branding / visual components

| File | Role |
|------|------|
| `MountainBackdrop.jsx` · `PeakReachersBadge.jsx` · `RankClimb.jsx` | Peak Reachers climb/summit visuals |
| `appleTouchIcon.png` · `peakReachers.png` | Icons / logo |

---

## Backend / other modules

| File | Role |
|------|------|
| `worker.js` | The `gate-city-hub` Worker (also listed above) — the one Worker, serving both the app and `/api/*` |
| `aiSummary.js` | AI morning digest |
| `notify.js` | Notification helper |

⚠️ **There are no signing-helper files.** This table used to list
`worker-sign-request-*.js` and `dashboard-sign-*.js`, hedged "exact filenames —
confirm". Confirmed Aug 2 2026: **neither exists**, under any spelling, at the
root or in `archive/`. The only root files matching `*sign*` are
`FOHAutoAssign.js` and `BOHAutoAssign.js`, which are the board engines and
nothing to do with signing. Removed. Do not re-add them from an older copy of
this map.

---

## Deploy flow (reference)

1. Commit the changed file to `main` (GitHub web editor; Files-app upload-replace for files > ~40K chars). **The Commit button at the bottom is a separate step — choosing the file doesn't commit it.**
2. Cloudflare auto-builds.
3. **It promotes itself**, about a minute after the build goes green. Matt confirmed Aug 10 2026. This line used to say to promote by hand and that was the step everyone missed; it is now automatic and there is nothing to do. ⚠️ Which also means a merge is in front of ~106 people a minute later, with no human step in between.
4. Force-refresh.
5. **Re-import the roster** if you changed anything in the Auto-Assignment path — the engines only run on Import. An already-built board keeps its old names forever otherwise.

Rollback = Cloudflare → `gate-city-hub` → Deployments → roll back to last good.
Reverts the app only; never touches Supabase data.

Automation runs off cron-job.org hitting `worker.js` `/api/run-job` (native
Cloudflare Cron Triggers don't work on this account; `RUN_JOB_KEY` is that
endpoint's auth).

---

## If you ever do want real folders

It's doable but it's an import-path rewrite across ~40 files, done in a specific
order, one broken path = white screen. Cheaper alternative if tidiness ever
becomes worth it: add a Vite alias (e.g. `@/` → repo root) in `vite.config.js`
first, convert imports to `@/store` etc., *then* move files freely. Not
recommended unless there's a concrete reason — a working flat repo beats a broken
tidy one.
