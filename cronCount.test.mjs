/* ============================================================================
   cronCount.test.mjs — the number Matt counts his cron account against

       node cronCount.test.mjs

   ⛔ WHY IT EXISTS. Matt, Aug 17 2026: "i have 39 crons. make sure i need then
   all." Nothing in this repo can see cron-job.org, so CRON-JOBS.md answers with
   what the CODE requires and he compares by hand.

   ⚠️⚠️ THAT NUMBER WAS WRONG BY SIX JOBS. The section said the Worker dispatches
   38 names and needs 39 entries. It dispatched 44. Every job added since Aug 17
   went in without the arithmetic moving, so the one figure he was told to check
   his account against had quietly stopped describing this repo.

   ⇒ A HAND-COUNT IN A DOCUMENT IS RIGHT ON THE DAY IT IS TYPED. This recomputes
   it from KNOWN_JOBS and the document's own no-entry table, and fails when the
   two disagree. Nobody has to remember.

   ★ THE POLICY STAYS IN THE DOCUMENT AND THE JOB LIST STAYS IN THE CODE. Which
   jobs deliberately get no entry is a decision, and decisions belong in prose
   where the reason is next to them. This only checks that the sum still adds up.
   ============================================================================ */
import { readFileSync, existsSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const SRC = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
/* ⛔⛔ THE RUNBOOK IS NOT IN EVERY REPO, AND READING IT UNGUARDED KILLED A NEW
   STORE'S FIRST CHECK RUN. Added Aug 21 2026 off issue #850.

   `newstore.mjs` strips `CRON-JOBS.md` on purpose — it is the HOST's runbook and
   it names the origin store's recipients. So in a generated store this
   `readFileSync` threw ENOENT, took the whole file down before a single
   assertion ran, and the store's own `node checks/run.mjs` ended
   "NOTHING SHIPS until this is zero" on its first day, about a document it is
   deliberately not given.

   ⇒ ABSENT IS GRADED, NEVER SKIPPED IN SILENCE. "An empty haystack is not a
   clean search" is this repo's own rule and the reason for the second half:

     runbook present                  → graded exactly as before
     runbook absent, newstore.mjs also absent → NOT GRADED, said out loud
     runbook absent, newstore.mjs PRESENT     → FAIL

   ★ THE PAIRING IS THE WHOLE GUARD, and it is not a coincidence to be tidied
   away. `isOriginDoc` in newstore.mjs strips both files in the same step, so
   "both gone" is a scrubbed store and "the runbook gone but the generator still
   here" is the origin having lost its own runbook — which must be loud. */
const hasDoc = existsSync(new URL("./CRON-JOBS.md", import.meta.url));
const hostRepo = existsSync(new URL("./newstore.mjs", import.meta.url));
const DOC = hasDoc ? readFileSync(new URL("./CRON-JOBS.md", import.meta.url), "utf8") : "";

group("0. controls");
t("worker.js was read", SRC.length > 100000);
if (!hasDoc) {
  t("★ no runbook here, and the generator is gone too, so that is by design", !hostRepo,
    hostRepo ? "newstore.mjs is present, so this IS the host repo and it has lost CRON-JOBS.md" : undefined);
  console.log("        NOT GRADED — this repo has no CRON-JOBS.md. The runbook is the host's.");
  console.log(`  ${fails.length ? "FAILED" : "ok"} — ${fails.length ? fails.join(", ") : "nothing to grade here"}`);
  process.exit(fails.length ? 1 : 0);
}
t("CRON-JOBS.md was read", DOC.length > 5000);

const block = SRC.match(/const KNOWN_JOBS = \[([\s\S]*?)\];/);
t("KNOWN_JOBS was found (control)", !!block);
const JOBS = [...(block ? block[1] : "").matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
t(`KNOWN_JOBS parsed — ${JOBS.length} names`, JOBS.length > 30);
t("a known name is really in it (control)", JOBS.includes("backup"));
t("no duplicates in KNOWN_JOBS", new Set(JOBS).size === JOBS.length);

group("1. the document's own no-entry list");
/* The table sits under the "must NOT have an entry" sentence. Read from the
   sentence rather than by line number, so an edit above it cannot silently
   point this at a different table.
   ⚠️ FROM THE HEADER SEPARATOR, NOT FROM THE SENTENCE. My first version sliced
   to the first blank line after the sentence, which is the blank line BEFORE
   the table, so it parsed an empty string and found nothing. It then reported
   "every no-entry name is a real job" as a pass, because every name in an empty
   list is anything you like. The controls under it are what caught that, and
   they are the reason a count assertion is never enough on its own. */
const noEntrySection = DOC.slice(DOC.indexOf("must NOT have an entry"));
const tableStart = noEntrySection.indexOf("|---");
const tableBody = tableStart < 0 ? "" : noEntrySection.slice(tableStart);
const NO_ENTRY = [...tableBody.slice(0, tableBody.indexOf("\n\n")).matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]);
t(`the no-entry table was parsed — ${NO_ENTRY.length} jobs`, NO_ENTRY.length > 0, NO_ENTRY);
t("a known exception is really in it (control)", NO_ENTRY.includes("pin-hash-migrate"));
/* ⚠️ A NAME HERE THAT IS NOT A JOB EXCUSES NOTHING AND SHRINKS THE COUNT. */
const ghosts = NO_ENTRY.filter((j) => !JOBS.includes(j));
if (ghosts.length) console.log(`        listed as no-entry but not a job: ${ghosts.join(", ")}`);
t("★ every no-entry name is a job the Worker actually dispatches", ghosts.length === 0);

group("2. the jobs that take four entries each");
/* Read from the document's prose, then PROVED against worker.js — a job only
   needs four lines if it really reads &dp=. */
const DAYPART = [...DOC.matchAll(/`(labor-daypart|shift-where)`/g)].map((m) => m[1]);
const dayparts = [...new Set(DAYPART)];
t(`the document names ${dayparts.length} daypart jobs (control)`, dayparts.length === 2, dayparts);
const dpGuard = SRC.match(/const dedupJobKey = \(job === "([a-z-]+)" \|\| job === "([a-z-]+)"\)/);
t("worker.js's own daypart pair was found (control)", !!dpGuard);
const realDp = dpGuard ? [dpGuard[1], dpGuard[2]].sort() : [];
t("★★ the document's daypart pair is the code's daypart pair",
  JSON.stringify(realDp) === JSON.stringify([...dayparts].sort()), { doc: dayparts, code: realDp });

group("3. ★★ the arithmetic");
const withEntries = JOBS.length - NO_ENTRY.length;
const expected = withEntries - dayparts.length + dayparts.length * 4;

const saidNames = Number((DOC.match(/dispatches \*\*(\d+) job names\*\*/) || [])[1]);
const saidLeft = Number((DOC.match(/That leaves \*\*(\d+) names\*\*/) || [])[1]);
const saidSum = (DOC.match(/^\s{4}(\d+) names − (\d+) \+ (\d+) daypart lines = (\d+) entries$/m) || []).slice(1).map(Number);
const saidTotal = Number((DOC.match(/\*\*(\d+) is exactly the right number\.\*\*/) || [])[1]);

t("the document states a name count (control)", Number.isFinite(saidNames), saidNames);
t("the document states the sum line (control)", saidSum.length === 4, saidSum);
t("the document states a total (control)", Number.isFinite(saidTotal), saidTotal);

t(`★★ "dispatches N job names" matches KNOWN_JOBS — doc ${saidNames}, code ${JOBS.length}`,
  saidNames === JOBS.length);
t(`★★ "that leaves N names" matches names minus no-entry — doc ${saidLeft}, computed ${withEntries}`,
  saidLeft === withEntries);
t(`★ the sum line starts from the same number — ${saidSum[0]} vs ${withEntries}`,
  saidSum[0] === withEntries);
t(`★ the sum line subtracts and re-adds the daypart jobs — ${saidSum[1]}, ${saidSum[2]}`,
  saidSum[1] === dayparts.length && saidSum[2] === dayparts.length * 4);
t(`★★ the sum line's own arithmetic is right — ${saidSum[0]} − ${saidSum[1]} + ${saidSum[2]} = ${saidSum[3]}`,
  saidSum[0] - saidSum[1] + saidSum[2] === saidSum[3]);
t(`★★ and it equals what the code requires — doc ${saidSum[3]}, computed ${expected}`,
  saidSum[3] === expected);
t(`★★ the headline total agrees with the sum — ${saidTotal} vs ${saidSum[3]}`,
  saidTotal === saidSum[3]);

/* ⚠️ NON-VACUOUS. If the document had NO number at all, every comparison above
   would be NaN === NaN, which is false, so the controls carry it. This proves
   the parse found real digits rather than an accident. */
t("★ the numbers really were parsed, not defaulted",
  saidNames > 0 && saidTotal > 0 && saidSum.every((n) => n > 0));

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
if (fails.length) process.exit(1);
