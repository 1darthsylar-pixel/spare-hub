/* ══════════════════════════════════════════════════════════════════════════
   backupBudget.test.mjs — THE BACKUP JOB HAS TWO BUDGETS AND NEEDS BOTH

   ⛔⛔ WHY THIS FILE EXISTS. `backup` is the only job in the fleet that has
   never once completed a run. Read from the live record on Aug 22 2026,
   `gcfcr-job-run-v1:backup` carried a `lastSkipAt` and NOTHING ELSE — no `at`,
   no `ok`, no `prevAt`. Every other job carries a real `at`.

   ⇒ THE DIAGNOSIS, and it is what this file grades. `noteJobRun` is awaited
   BEFORE `confirmRanToday`, so a job that reached the end of the dispatcher
   would have stamped even on a throw. It never did. The Worker was killed
   inside `runChain`, and the skip landed 25 seconds past the hour against a
   15-minute lease — a caller retry hitting a run that was still working.

   ⚠️⚠️ `BACKUP_FETCH_BUDGET` COULD NOT HAVE SAVED IT, AND ITS OWN COMMENT SAYS
   SO. It counts SUBREQUESTS, which is Cloudflare's limit. The thing killing
   this job is the CALLER'S CLOCK, which is cron-job.org's limit. Two different
   ceilings; a job can sit far under one and be dead against the other.

   ⭐ SO THE FIX IS A SECOND BUDGET ON TIME, and it is graded here by EXECUTION
   rather than by grep: `bkOutOfTime` is lifted out of the real worker.js and
   RUN against fake clocks. A regex asserting the constant exists would pass on
   a constant nothing reads.

   ⚠️ THE COPY LOOP MUST READ BOTH. Wiring only one back in is the whole bug
   returning, and it is invisible in a diff — the loop still says "budget".
   ══════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const W = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");

let pass = 0;
const fails = [];
const ok = (label, cond) => { if (cond) pass += 1; else fails.push(label); };

/* ── 1 · THE CONTROL. A grep against a file that did not load reports clean for
   everything, so prove the haystack first. ─────────────────────────────────── */
ok("★ control — worker.js loaded and holds the backup job",
   W.length > 50000 && W.includes("runBackupFiles"));

/* ── 2 · BOTH BUDGETS EXIST AND CARRY REAL NUMBERS ────────────────────────── */
const countM = W.match(/const BACKUP_FETCH_BUDGET\s*=\s*(\d+)\s*;/);
const timeM  = W.match(/const BACKUP_TIME_BUDGET_MS\s*=\s*([^;]+);/);

ok("the subrequest budget is a named constant", !!countM);
ok("the time budget is a named constant", !!timeM);

const COUNT_BUDGET = countM ? Number(countM[1]) : null;
const TIME_BUDGET = timeM ? Function(`"use strict";return (${timeM[1]});`)() : null;

/* ⚠️ THE VALUE IS ASSERTED, NOT ONLY THE NAME. A test that greps a name is
   vouching for the name — the lesson `daypartTone` already paid for, where
   `DAYPART_BAND = 0` passed "the guesses are named constants" and coloured
   every cell. A time budget of 0 stops the job copying anything at all. */
ok("the time budget is a real span, not zero and not a whole minute",
   typeof TIME_BUDGET === "number" && TIME_BUDGET >= 5000 && TIME_BUDGET <= 45000);
ok("the subrequest budget is still a real number",
   typeof COUNT_BUDGET === "number" && COUNT_BUDGET > 0);

/* ── 3 · `bkOutOfTime` IS RUN, NOT READ ───────────────────────────────────────
   ⚠️ Lifted out of the shipped file and executed. Its OWN constant is passed
   in, so the test cannot drift from the code the way a second hardcoded
   number would. */
const fnM = W.match(/const bkOutOfTime\s*=\s*\(([^)]*)\)\s*=>\s*([^;]+);/);
ok("bkOutOfTime is defined", !!fnM);

if (fnM) {
  const bkOutOfTime = Function(
    "BACKUP_TIME_BUDGET_MS",
    `"use strict";return (${fnM[1]}) => ${fnM[2]};`
  )(TIME_BUDGET);

  const now = Date.now();
  ok("a run that just started is not out of time", bkOutOfTime(now) === false);
  ok("a run one millisecond short of the budget is not out of time",
     bkOutOfTime(now - (TIME_BUDGET - 1)) === false);
  ok("a run exactly at the budget IS out of time",
     bkOutOfTime(now - TIME_BUDGET) === true);
  ok("a run well past the budget is out of time",
     bkOutOfTime(now - TIME_BUDGET * 3) === true);

  /* ⚠️ THE ZERO CASE. `startedAt` of 0 is the epoch, which is 56 years ago and
     genuinely out of time. It must not be read as "no start recorded" and
     waved through — a run whose clock is broken should stop copying, not
     copy forever. */
  ok("a zero start reads as out of time rather than as unset",
     bkOutOfTime(0) === true);
}

/* ── 4 · THE COPY LOOP READS BOTH BUDGETS ────────────────────────────────────
   ⛔ This is the assertion that matters. A constant nothing consults is a
   comment. */
const loopM = W.match(/if \(bkSpent\(env\) >= BACKUP_FETCH_BUDGET[^\n]*\n?[^\n]*\{ remaining\+\+; continue; \}/);
const guardLine = W.split("\n").find((l) => l.includes("remaining++; continue;"));
ok("the copy loop has a budget guard", !!guardLine);
ok("★★ the copy loop checks the SUBREQUEST budget",
   !!guardLine && guardLine.includes("bkSpent(env) >= BACKUP_FETCH_BUDGET"));
ok("★★ the copy loop checks the TIME budget",
   !!guardLine && guardLine.includes("bkOutOfTime(startedAt)"));
ok("the two budgets are an OR, so either one alone stops the copying",
   !!guardLine && /BACKUP_FETCH_BUDGET\s*\|\|\s*bkOutOfTime/.test(guardLine));

/* ── 5 · `startedAt` IS IN SCOPE WHERE THE GUARD READS IT ─────────────────────
   ⚠️ The guard naming a variable declared in another function parses clean,
   passes every one of the six checks, and throws at run time inside a job
   nobody watches. */
const fnBody = (() => {
  const i = W.indexOf("async function runBackupFiles");
  if (i < 0) return "";
  return W.slice(i, i + 6000);
})();
ok("runBackupFiles declares startedAt before the guard reads it",
   fnBody.includes("const startedAt = Date.now()") &&
   fnBody.indexOf("const startedAt = Date.now()") <
   fnBody.indexOf("bkOutOfTime(startedAt)"));

/* ── 6 · THE PARTIAL RUN SAYS WHICH BUDGET STOPPED IT ────────────────────────
   ⚠️⚠️ Out of subrequests and out of time mean OPPOSITE things to whoever reads
   the run record. The first says the library is large and the copy is working.
   The second says the caller is hanging up mid-run. One sentence for both
   sends the next reader to the wrong half, which is exactly how `shift-where`
   was declared broken while it was working fine. */
ok("★★ the partial-run note names the subrequest budget by name",
   /subrequest budget spent/.test(W));
ok("★★ the partial-run note can name the TIME budget instead",
   /time budget spent/.test(W));
ok("the note picks between them rather than printing both",
   /bkSpent\(env\) >= BACKUP_FETCH_BUDGET\s*\n?\s*\?\s*`subrequest budget spent/.test(W));

/* ── 7 · NOTHING ELSE MOVED ──────────────────────────────────────────────────
   ⚠️ A partial run must still write NO manifest. A manifest listing files that
   are not in R2 is the "looks complete and is not" failure the whole job
   exists to avoid, and a second budget must not have loosened it. */
const afterGuard = W.slice(W.indexOf("if (remaining) {"));
ok("a partial run still returns before the manifest is written",
   afterGuard.indexOf("return { done: false") <
   afterGuard.indexOf("env.BACKUPS.put(name"));
ok("a partial run still reports how many are left",
   /remaining, files: manifest\.length/.test(W));

console.log(`backupBudget: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAILED: ${f}`);
if (fails.length) process.exit(1);
