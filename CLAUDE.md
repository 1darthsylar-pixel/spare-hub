# SET-THIS-TO-THE-STORE-NAME Hub — project rules

## 🛑 CURRENT HOLDS — read this before touching anything

**No session can see the one before it.** No shared memory exists. This block is
the only channel, because every session loads this file automatically before it
does anything else.

⚠️⚠️ **THIS BLOCK DID NOT EXIST UNTIL Aug 21 2026, AND THAT WAS THE GAP.** Every
other repo in this project opens with one. **Spare is the copy a new store starts
from**, so anything missing here is missing from every store that has not opened
yet — including the one channel sessions have for talking to each other.

**Three rules:**

1. **Read this block first.** Every session, every time.
2. **Update it in the same commit that changes the state.** A hold that has
   already lifted is worse than no hold, because the next session trusts it.
3. **Delete a hold when it lifts.** Do not leave it marked "(resolved)".

| Set | Hold | Who |
|---|---|---|
| Aug 21 | ❓ **`ownerSeed.empty.js` AND `HR_CONSOLE_OPEN_BY_RANK` DISAGREE, AND ONLY MATT CAN SETTLE IT.** The origin's template now carries `hrConsole: [{ id: null, names: ["matt jackson"] }]` with `HR_CONSOLE_OPEN_BY_RANK` **false** to match — Matt, Aug 16 2026: *"the Guilford store should only have me in the hr console. Can you build that into all repos currently and in the future."* ⛔ **This repo ships the flag `true`**, and its own section below records that as deliberate: with it false and the list empty, nobody can open HR Console at all, founder included, and the roster can then never be imported. ⇒ **Adopting the template alone would half-land a design whose other half is an access gate.** It was measured and left. ⚠️ **`ownerSeed.empty.js` is read only by `newstore.mjs`** — the live file is `ownerSeed.js`, which still has `hrConsole: []` — so nothing here is broken today. **This is about what store four is born with.** Matt decides. | — |
| Aug 21 | ⏳ **LINEUP AND THE BOARD ENGINE ARE HELD, BY MATT'S OWN INSTRUCTION.** Aug 15 2026: *"Wait on lineup to finish but each store will be very different."* ⇒ Seven files sit in the safe-to-adopt bucket and stay there on purpose: `FOHAutoAssign.js` `SchoolDates.jsx` `jobCodes.js` `scheduleWarnings.js` `shiftMarket.js`, plus `storeRules.test.mjs`, which grades scheduler rules this store does not have. ⛔ **Do not adopt them to make the drift number smaller.** ⭐ **And when Lineup does land here, the five harness drivers land in the SAME job** — Matt, Aug 19 2026: *"port the harness lineup drivers when lineup lands."* | — |

---

## ⛔⛔ `App.jsx` NEVER INDEXES THE RAW RANK MAP — Aug 19 2026

`HR_RANK_BY_TITLE` is the **built-in ladder only**. `hrRankOfTitle` is that
ladder **plus** the titles a store has named for itself in `hr.extraTitles`.

Until Aug 19 `App.jsx` read the raw map in **five** places, so at a store that
names its own roles a Kitchen Director scored rank 0 and got the **team member
Hub** while HR Console said leader. Nothing errored and nothing showed in a diff.
It is the reported Village symptom, *"they sign in and see almost nothing."*

⭐ **THE WHOLE FEATURE WAS MISSING HERE AND WAS PORTED THE SAME DAY.** This repo
is the pre-staged next store, so the gap would have shipped to store four. Four
pieces landed: `OPEN_KEY_MAPS` in the settings merge (without it a store's own
titles were **silently deleted on load**, because `mergeDeep` drops keys the
defaults do not know), the empty `hr.extraTitles` section, `extraTitleRanks()`
capped at rank 5, and the `hrRankOfTitle` fallback.

⇒ `storeTitleTier.test.mjs` fails if any raw-map index comes back. It travels
with the fix and says **NOT GRADED** out loud where the store-titles feature does
not exist, rather than passing on an absence.

⚠️ **IT WIDENS NOTHING.** Unknown is still rank 0 and 0 is still tier 1, so a
typo still fails closed. The built-in map still wins over a store's list, so a
store may add a name the Hub does not have but can never redefine one it does.

⚠️ **THIS FIX CAME FROM THE ORIGIN AND IS IN ALL FOUR REPOS.** If you find
yourself fixing it again in one repo, stop — it is already done, and a fix living
in one clone is the drift this whole project keeps being bitten by.

---

## 🛑 READ THIS FIRST

This repo is a **scrubbed snapshot** of another Chick-fil-A's Hub, taken as ONE
commit with no inherited history. That is deliberate: it is what stops the origin
store's people travelling in `git log`.

⚠️ **THE COST: `git merge` AND `git cherry-pick` CANNOT WORK HERE.** There is no
common ancestor with the origin repo. Every upstream change is a deliberate port.

⚠️ **IF YOU FIND A REAL PERSON'S NAME, A DOLLAR FIGURE OR A ROSTER ID IN THIS
REPO, IT IS ALMOST CERTAINLY THE ORIGIN STORE'S AND IT IS A BUG.** The snapshot
measured ZERO of their names in both the app and the server bundle on the day it
was taken. Anything you find arrived later or was missed.

⚠️ **EMPTY IS A WORKING STATE EVERYWHERE IN THIS CODEBASE.** No lock, no
seniority, no owner, no seed. Every reader handles it. **Never fill a blank with
a plausible guess** — uneditable-and-wrong is worse than blank, because blank
gets reported in an hour and plausible gets believed and repeated to a team.

---

## This store

| | |
|---|---|
| Store | SET-THIS-TO-THE-STORE-NAME |
| FSR | `00000` |
| Worker | `spare-hub` |

⚠️ **`identity.fsr` MUST STAY `"00000"`.** One comparison in `storeConfig.js`
is what withholds the origin store's board rules, EOS data, chart seats and
admin lists. Change it and this store inherits another restaurant's setup.

---

## Not set up yet

| Item | State |
|---|---|
| **Supabase project** | ⛔ **NOT SET.** Two files read `SET-THIS-TO-THE-NEW-STORE-SUPABASE-PROJECT`: `.env` and `worker.js`. Fix one and not the other and the browser reads this store while the Worker reads another. |
| **`SETUP_KEY`** | Needed for the one-time first sign-in. No secret means the route 404s, never "no key needed". |
| **Icons and logo** | ⛔ **THERE ARE NONE, AND THAT IS DELIBERATE.** Every piece of the origin store's artwork was left behind: `public/icon-192`, `icon-512`, `icon-maskable-512`, `appleTouchIcon.png` and the masthead logo. So `manifest.webmanifest` points at three files that are not there, a phone installing the Hub falls back to a default icon, push notifications do the same, the header badge draws its own built-in shape, and `branding.logo` is blank. **Nothing is broken and the build passes** — index.html's two icon `<link>` tags were removed, because a dangling absolute href fails `vite build`, and one build gates the Worker too. ⇒ Add this store's three PNGs to `public/` at those exact names, put its logo at the repo root, and set `branding.logo` in Store Settings. |
| Stations and hours | The board carries the ORIGIN store's building. Their kitchen, their counts, their times. Rebuild from this store's own list. |
| Mission, vision, values | On the team site, in the origin store's words and their city. |
| Hub training decks | `HUB_DECKS` in `hubTraining.js` was **emptied on purpose** — the origin store's five deck pages did not come across. Empty is working: first sign-in requires nothing. Refill it only when this store has decks of its own. |
| Store Settings | Identity, area owners, features, financial goals. |
| Push notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. |
| Scheduled jobs | cron-job.org entries hitting `/api/run-job`. Native Cloudflare Cron Triggers do not deploy on this account. |

---

### ✅ WHAT THE NIGHT OF Aug 21 2026 BROUGHT ACROSS — measured

**Matt: "I want to wake up tomorrow with all repos In line and no loose ends so
I can focus on the lineup."** ⛔ **Everything here is measured with `drift.mjs`
and the build. Nothing in it is a plan.**

| | before | after |
|---|---|---|
| shared files in sync | 72% | **84%** |
| files in the safe-to-adopt bucket | 28 | **7** |
| guards that run here | 74 | **95** |

⭐⭐ **FOUR BUGS CAME OFF MATT'S OWN SCREENSHOTS AT THE ORIGIN AND EVERY ONE WAS
LIVE HERE TOO.** Six checks, every test file and a green `vite build` were
passing on all four.

| what it looked like | what it was |
|---|---|
| ordinary inputs listed under a heading reading **OPEN LISTS** | the default All-inputs view drew every row with **no band of its own**. The other three views each head their groups, which is why only the default was wrong |
| *"the day's 17.24 h"* on a day scheduled **393h** | `dayVar` is a **variance**, printed in the vocabulary of total hours, with `Math.abs` stripping the sign the rest of the planner insists on |
| a Cash Audit entry filing a **shortage nobody counted** | `emptyAudit` ships `tills: "1000"` prefilled with every denomination blank, so opening the form and pressing Save is enough |
| **16 flat cards across 6 screens** | nothing had been undone. Each screen had raised cards from one day and flat ones from another |

⇒ **The guards travel with the fixes**: `cashCount.test.mjs` (a blank grid is not
a count of zero — an untouched box holds `""`, a counted-and-empty box holds
`"0"`, and `Number()` flattens both), `varianceWords.test.mjs` (a variance may
never print without a word saying which way it goes), and `flatCards.test.mjs`,
which **arrived RED here** and is what found the sixteen.

⚠️⚠️ **THE LESSON THAT REPEATED IN EVERY PASS: `drift.mjs` COMPARES BYTES, SO A
FILE IN THE SAFE BUCKET THAT IMPORTS SOMETHING THIS REPO HAS NEVER HAD STILL
READS AS SAFE.** The **build** found those, one failure at a time, not the tool.
⇒ **Adopt, build, read the error, repeat.** Never adopt a list and assume.

⚠️ **AND TWO ADOPTED TESTS ARRIVED RED BECAUSE THEY FOUND REAL BUGS HERE**, which
is the whole argument for tests travelling with the code:
- `storeConfigLoad.test.mjs` — a lapsed session ran the **whole visit on the
  origin store's defaults**, because nothing asked again after sign-in.
- `ipoPlanLoad.test.mjs` — **a refused plan read blanked the quarter**, which is
  the "all of my ipo action items dissapeared" shape.

⭐ **ONE NPM PACKAGE CAME WITH IT, AND IT WAS A DELIBERATE, DATED DECISION (rule 21).** `read-excel-file`, pinned to the origin's exact `9.3.10` and installed `--ignore-scripts`. It is what the RDR import on the scorecard paste box needs. ⚠️ **A store generated from the origin today would already have it** — this repo is an older snapshot, so adding it is alignment, not a new dependency.

---

#### 📋 WHAT IS LEFT HERE, AND IT IS NOT STARTED

⭐ **EVERY ORIGIN GUARD THAT RUNS GREEN HERE IS NOW HERE.** Each missing test
file was copied in and **RUN**: green stays, red was **backed straight out**
rather than quarantined, because a test that cannot be run counts as FAILED and
`KNOWN_STALE` must never become a place to park work.

⚠️⚠️ **A RED ONE MEANS TWO DIFFERENT THINGS AND CONFUSING THEM IS THE TRAP.**
Most grade code this store genuinely does not have, and those arrive **with the
feature**. But some are red for the other reason — **the code is here and it has
drifted.** Measured at the spare, and the same shape is expected here:

| guard | what it found | state |
|---|---|---|
| `pageWidth` | the page cap still **860, typed twice**, so the tile grid fit three columns and the rest of a laptop was white | ✅ **fixed.** One named constant; the guard fails if the header and the body ever disagree |
| `notePanelRing` | the inset panel **written out by hand eight times**, and *three of them with no border at all* — Matt: *"in labor and sales there are 3 boxes without a border"* | ✅ **fixed.** One definition in `cardStyle.js` |
| `sectionBands` | `WasteTracker` not using the shared band | ⛔ **NOT STARTED, and deliberately so** |

⛔⛔ **`sectionBands` IS A REDESIGN, NOT A FIX, AND THAT IS WHY IT WAS LEFT.**
Measured: **12 failing assertions**, covering the band, the end figure, the area
card heads, the period colours and the empty-period state. `WasteTracker.jsx` is
`bothChanged` here, so none of it can be copied. ⇒ **It is a real job with its
own plan**, and half-doing it on a live store's waste screen is worse than
leaving it named.

⚠️⚠️ **AND TWO TRAPS FROM FIXING THE OTHER TWO, BOTH WORTH KEEPING:**
- **`notePanel` HARDCODES `1px`.** A first pass converted two warning panels
  carrying `1.5px solid #F59E0B` and `1.5px solid #DC2626`, thinning a
  deliberate heavy ring **and turning a red error edge grey**. The origin leaves
  exactly those two alone. ⇒ **Only ever convert a panel whose border is `1px
  solid`.**
- **ONE PANEL WAS WRITTEN THE OLDER WAY AND NO REGEX FOUND IT.**
  `SalesAllocation`'s *"sales could not be reached"* notice used a hand-rolled
  `borderLeft`/`borderTop` accent with no surface and no shadow. It had to be
  found by **counting against the origin** (8 against 9) rather than by matching
  the current shape.

---

## Checks before shipping any file

`node checks/run.mjs <files touched>` — all six must be clean. Every one exists
because a bug got past careful reading.

⚠️ **Never edit anything in `checks/`.** If a check looks wrong, report it and
stop.

⚠️ **VERIFY BY OUTPUT, NEVER BY CONFIGURATION.** A patch that printed success and
a check that printed "ok" have both been wrong in this codebase. Grep for the
change and show the count, and give every sweep a **control string that must be
FOUND** — a grep against a path that does not exist reports clean for everything.

⚠️ **`grep -o | wc -l`, NEVER `grep -c`.** A minified chunk is one enormous
line, so `grep -c` answers 1 however many times a string appears.

⚠️ **GREP THE BUILT BUNDLE, NOT THE SOURCE**, for anything about what ships. But
remember what that misses: **prose is not in the bundle**, and `node
scrubcheck.mjs` reads source properly. Ask what a human can OPEN, not only what
a browser downloads.

---

## Deploying

1. Commit to `main`. Branch protection routes this through a PR, then merge.
2. Cloudflare auto-builds the `spare-hub` worker.
3. **It promotes itself, about 60 seconds after the build goes green.**
4. Hard-refresh.

⚠️ **A MERGE REACHES THE WHOLE STORE IN ABOUT A MINUTE with no human step in
between.** The six checks and a green `vite build` are the whole safety net.

⚠️ **NEVER hand over a full-file `wrangler.toml` replacement.** Change only the
line that needs changing. A stripped rewrite once dropped the `[assets]` block
and took a live site down with Error 1101.

⚠️ Engine and template changes (`FOHAutoAssign.js`, `BOHAutoAssign.js`,
`stationTemplates.js`) only take effect on **re-import**, which rebuilds the day
and wipes leaders' manual board edits. Never mid-shift.

---

## The first sign-in

**Nobody can sign in at a brand new store.** That is the safe starting state and
there is no default PIN. The loop is broken exactly once, by `/api/store-claim`.

1. Set `SETUP_KEY` as a Worker secret. **No secret means the route returns 404.**
2. Sign-in card → **First time here? Set up your PIN** → **Setting up a new store?**
3. Enter the key, a full name, a title, and a PIN of 4 to 6 digits.
4. The route then refuses forever, because a PIN now exists.

⚠️⚠️ **THE TITLE MUST BE RANK 7 OR 8 OR THE ROUTE REJECTS IT.** Accepted:
`Owner` (8), `Executive Director`, `Executive`, `Human Resources`,
`Accounts Payable` (all 7). ⛔ **`Operator` IS NOT ACCEPTED** — it is absent
from the rank ladder and scores ZERO, which would stand the store up with a
founder holding team-member access and the setup route already spent.

⇒ **The Operator's Hub title is `Owner`.** Tell them; do not just ask.

### 🐛 THE HUB SCHEDULE PULL LOOKED UP THE WRONG DAY — Aug 19 2026

Found at Gate City from a Fable audit finding; this store had the same code.

⛔ `scheduleRowsFor` looked up `sched.days['Monday']` on a week keyed `Mon`, so a
fully built week answered **"has nobody on Monday"** every day of every week.
`buildWeek` writes `out[d.day]` and `boardDays` hands it `Mon`…`Sat`;
`DailySetup`'s `const DAYS` is full names. Two spellings, one lookup, no match.

**Fixed at the cause.** It could not be tested because it lived in a `.jsx` no
Node test can import. It is now **`setupRows.js`** (leaf, imports nothing) with
**`setupRows.test.mjs`, 88 assertions**. `dayKeyIn` asks the week what its days
are called: exact key first, then a three-letter compare — three, because `Sat`
and `Sun` share two.

⚠️⚠️ **THIS IS THE NEXT STORE'S STARTING POINT, SO IT MATTERS THAT IT SHIPS
CORRECT.** `HUB_SCHEDULE_PULL_READY` stays `false` here: a new store has no
built weeks to pull, and the button discards manual board edits. It greys with
the reason on it and unlocks when that store is running Lineup.

### HR Console is open by rank here, and that was set deliberately

`HR_CONSOLE_OPEN_BY_RANK` is **`true`** in `storeConfig.js`. The snapshot set it,
because the alternative locks the store out of itself: with it false, HR Console
is gated by the `owners.hrConsole` **name list**, and that list arrived empty, so
nobody could open HR Console at all — including the founder who just claimed the
store. The roster could then never be imported.

⚠️ **IT DOES NOT REMOVE A GATE.** Rank is still required on top: full read needs
5, editing the roster needs 6, seeing terminated records needs 6.

⚠️⚠️ **ONE REAL WIDENING. ANYBODY TITLED `Payroll` READS EVERY PERSONNEL FILE.**
Three of those rank checks let that title skip the rank test. It is rank 1
otherwise. **If this store does not want that, do not use that title** — the
title is the access level here, so this is decided by what gets typed into HR
Console, not by code.

---

## Keeping this repo up to date

📄 **`SYNCED-FROM.md` is the record. Read it before porting anything.**

There is **no shared git history with the origin repo**, on purpose, so
`git merge` and `git cherry-pick` cannot work here. Every upstream fix is a
deliberate port, and `SYNCED-FROM.md` holds the baseline that makes it possible
to tell a safe adopt from one that would undo this store's own work.

In the **origin** repo: `node drift.mjs /path/to/this/repo` sorts every shared
file three ways. Read `SYNCED-FROM.md` here for what the buckets mean and the
traps in each.

⚠️ **UPDATE THE BASELINE IN THE SAME COMMIT AS THE PORT.** A stale record is
worse than none, because the next session trusts it.

---

## Repo shape

- React/Vite SPA served by a Cloudflare Worker.
- **FLAT ROOT. There is no `src/`.** Every component sits at the repo root.
- **camelCase / PascalCase filenames only.** Underscores silently break Vite.
- **Filename does not equal component name.** Check the import line in
  `App.jsx`, never the component name.
- **`App.jsx`, `worker.js` and `HRConsole.jsx` are multi-session files.**
  Always read the current file from disk before patching.

## Where this store's own people live

`ownerSeed.js`, `workerSeed.js`, `eosSeed.js`, `TermArchive.js`,
`facilitiesSeed.js` and `profitShareSeed.js` arrived EMPTY on purpose. They are
where this store's people, seats, access lists and recipients go as it fills in.

⚠️ **A GATE IS NOT A SCRUB.** Hiding a tile stops it rendering; the chunk still
downloads and still answers 200 to anyone.

⚠️ **ANYTHING THIS STORE SAYS ABOUT ITSELF IS DATA WITH A SCREEN, never a
constant in the source.** The test: would another operator have to change this,
and can they change it without a developer? Yes and no means it is a bug.
