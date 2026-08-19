# SET-THIS-TO-THE-STORE-NAME Hub — project rules

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
