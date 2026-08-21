# Where this repo came from, and how to sync it

This repo is a **scrubbed snapshot** of another store's Hub, not a fork. It has
**no shared git history with the origin repo, on purpose** — that is what stops
the origin store's people, pay and sales travelling in `git log`.

The cost of that choice is that `git merge` and `git cherry-pick` **cannot work
here.** There is no common ancestor. Every upstream change is a deliberate port.

**This file is the only record of what this repo is missing.** Keep it current or
nobody can answer that question again.

---

## Baseline

| | |
|---|---|
| Origin repo | `1darthsylar-pixel/gate-city-hub` |
| **Code baseline** | **`d6965ec`** |
| Snapshot taken by | `newstore.mjs` |
| Store | SET-THIS-TO-THE-STORE-NAME · FSR `00000` |

⚠️ **`d6965ec` IS THE NUMBER THAT MATTERS.** Everything upstream
after it is drift. In the origin repo, `node drift.mjs /path/to/this/repo` reads
this row and sorts every shared file into what is safe to adopt, what needs a
hand port, and what this store has customised. **It refuses to classify anything
if this row is missing or malformed**, so do not reformat it.

⚠️ **THIS SNAPSHOT WAS TAKEN AT ONE COMMIT, WHICH IS THE ONLY TIME THAT IS TRUE.**
The moment anything here is edited, one sha stops describing this repo. That is
expected and it is what the three buckets are for. **Diff the file. Believe the
diff.**

---

## Synced since the snapshot

Add a row per port, in the same commit as the port.

| Date | What | Why it was worth porting |
|---|---|---|
| Aug 21 2026 | **Twenty-six files the origin had moved on and this store never touched, plus ten modules they import that this repo did not have at all.** Screens: `Announcements` `BusinessScorecard` `CatalogImportBox` `DailyCleaning` `EquipmentLog` `FCRPage` `L101Template` `ManualTile` `OpsChecklists` `PasteMonth` `PayRates` `SalesAllocation` `ShiftLeaderScorecard` `StoreHours` `SupplyCentral` `TokensTile` `TrainingPriorities`. Leaves: `aiSummary` `laborDaypartPush` `store.js` `payRates.js` `fcrImport` `ipoPlan` `productivityTiers` `main.jsx`. New here: `storeConfigLoad` `tierMath` `rdrReport` `fcrMath` `holidayPaste` `sheetText` `importFile` `ImportFileZone` `SectionBand` `starReasons`. Plus the sign-in config reload in `App.jsx`. | ⚠️⚠️ **THE BUILD FOUND THE DEPENDENCIES, NOT THE TOOL.** `drift.mjs` compares bytes, so a file in the safe bucket that imports something this repo has never had still reads as safe. Ten modules and **one npm package** (`read-excel-file`, pinned to the origin's exact `9.3.10`, installed `--ignore-scripts`, rule 21) came out of the build one failure at a time. ⭐ **AND TWO ADOPTS TURNED OUT TO BE HALF PORTS, WHICH IS WHY THE TESTS TRAVEL WITH THE CODE.** `storeConfigLoad.test.mjs` arrived RED: `main.jsx` had the loader and `App.jsx` did not, so a lapsed session still ran the whole visit on the ORIGIN STORE'S defaults. `ipoPlanLoad.test.mjs` arrived red too and found that a refused plan read blanked the quarter. Both were real bugs here. ⛔ **AND TWO FILES WERE DELIBERATELY LEFT.** `storeRules.test.mjs` grades scheduler rules this store does not have and Lineup is on hold; `ownerSeed.empty.js` half-lands an access-gate design (Matt-only HR Console with `HR_CONSOLE_OPEN_BY_RANK` false) whose other half contradicts this repo's live `true` — **that flag is Matt's call, not a tidy-up.** |
| Aug 18 2026 | The closed-hours deploy window. `deployWindow.mjs`, `deployWindow.test.mjs`, `.github/workflows/deploy-window.yml`, `.github/deploy-window.json` | Built in `guilford-hub` and `village-hub` on Aug 17 and never sent back to the origin, so this repo and every store cloned after it would have been born without it. Ported here **and into `gate-city-hub` in the same change** — the origin copy is the half that makes `newstore.mjs` carry it to the next store. Byte-identical to the two stores that already had it, 40 assertions passing. Left `"live": false`, which is correct until this store starts entering its own numbers. |
| Aug 18 2026 | **This store's copies of ten of the origin store's data files, emptied.** `fcrProjectionData` `fcrReferenceData` `fcrYtdSeed` `ipoPlanData` `cashAuditSeed` `daypartSeed` `guestSeed` `inventoryGapsSeed` `foodItemGapsSeed`, plus `ecosureSeed` split out of `ecosureVisits.js` | All ten were **byte-identical to the origin store's** here: eighteen months of its P&L, its cash counts with the counting leader named, its guest and mystery-shop scores, and its Q2-2026 Ecosure round. The Village was scrubbed by hand months ago and the generator was never told, so this repo kept them. **Nine never left `worker.js` and are gated there by an fsr check.** The tenth, `ECOSURE_SEED`, is imported by `FoodSafetyWalkthrough.jsx`, so it shipped: the origin store's findings were measured inside this repo's own `dist/` before the fix and are 0 after. Root fix is upstream in `newstore.mjs`, so no store after this one is born with them. |

---

## How to sync, when you do

1. **Read the gap first.** In the origin repo: `node drift.mjs /path/to/this/repo`.
   Then `git log <baseline>..origin/main` for the why. Decide per change, never
   in bulk.
2. ⚠️ **A FILE IN THE "SAFE TO ADOPT" BUCKET IS A LEAD, NOT A VERDICT.** The tool
   compares bytes, so it cannot see that an upstream change was **half of a
   two-file fix**. Before adopting anything, run `git show --stat <commit>` on
   the commit it came from and check whether the other files in it are already
   here. This is not theoretical: on the first real sync **every one of the six
   files that looked safe needed a companion** — one imported a module this repo
   did not have, one needed a helper that did not exist here, and two were
   comment-only changes whose real content was a missing test file.
3. **Check every import resolves here before adopting a file.** A dead import
   fails the one `vite build` that gates the whole repo, **including the
   Worker**, so a client-side mistake stops a server-side deploy.
4. **Prefer adopting a whole file over replaying a diff** when upstream has
   restructured it. Patches onto scrubbed files conflict in exactly the scrubbed
   regions, which is the signal to stop and look, not to resolve quickly.
5. **Re-scrub every adopted file.** Upstream keeps its own people and figures
   legitimately, so assume each adopted file carries some. Check rather than
   remember, and check the WHOLE file rather than the diff.
6. ⛔ **NEVER SYNC THESE. They are this store's, and copying them undoes the
   handover:** `.env`, `wrangler.toml`, `storeConfig.js` identity, `CLAUDE.md`,
   this file, and every file the snapshot deliberately left behind.
7. **Then prove it, or the sync is not finished:**
   ```
   node checks/run.mjs <files touched>
   npx vite build && node scrubcheck.mjs --dist --count "<origin store name>"
   ```
   ⚠️ Give every sweep a **control string that must be FOUND**. A grep against a
   path that does not exist reports clean for everything, which is how "gone
   from every chunk" once meant "I looked nowhere".
8. **Update the baseline row and the table above in the same commit as the port.**
   A stale record here is worse than none, because the next session trusts it.
