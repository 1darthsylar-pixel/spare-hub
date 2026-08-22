/* ══════════════════════════════════════════════════════════════════════════
   backupBudget.test.mjs — THE BACKUP HAS TWO BUDGETS AND NEEDS BOTH

   ⛔⛔ WHY. `backup` was the only job in the fleet that had never once
   completed a run. The live record held a `lastSkipAt` and nothing else — no
   `at`, no `ok`, no `prevAt` — while every other job carried a real `at`.
   `noteJobRun` is awaited BEFORE `confirmRanToday`, so a job reaching the end
   of the dispatcher stamps even on a throw. It never did, so the Worker was
   killed inside `runChain`.

   ⚠️ `BACKUP_FETCH_BUDGET` COUNTS SUBREQUESTS, which is Cloudflare's ceiling.
   What kills this job is the CALLER'S CLOCK, which is cron-job.org's. A run can
   sit far under one and be dead against the other.

   ⛔⛔ AND THE FIRST VERSION OF THE TIME BUDGET WAS WRONG IN THREE WAYS, all
   found by a Fable audit the day it shipped. Each has its own section below:
     3 · it timed the wrong stretch — `runBackupFiles` started its own clock
         AFTER the database dump, which the caller was also timing
     5 · it kept spending after it fired — `continue`, not `break`, so every
         remaining bucket was still listed and every file still HEADed
     6 · it could blame the wrong budget — the listings after the stop pushed
         the subrequest count up, and the note read it afterwards
   ══════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const W = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");

let pass = 0;
const fails = [];
const ok = (label, cond, extra = "") => {
  if (cond) pass += 1; else fails.push(label + (extra ? `  (${extra})` : ""));
};

/* ── 1 · CONTROL ─────────────────────────────────────────────────────────── */
ok("★ control — worker.js loaded and holds the backup job",
   W.length > 50000 && W.includes("runBackupFiles"));

/* ── 2 · BOTH BUDGETS EXIST AND CARRY REAL NUMBERS ───────────────────────── */
const countM = W.match(/const BACKUP_FETCH_BUDGET\s*=\s*(\d+)\s*;/);
const timeM  = W.match(/const BACKUP_TIME_BUDGET_MS\s*=\s*([^;]+);/);
ok("the subrequest budget is a named constant", !!countM);
ok("the time budget is a named constant", !!timeM);

const COUNT_BUDGET = countM ? Number(countM[1]) : null;
const TIME_BUDGET = timeM ? Function(`"use strict";return (${timeM[1]});`)() : null;

/* ⚠️ THE VALUE, NOT THE NAME. A test that greps a name is vouching for the
   name: zero disables the copy entirely, and a huge number is no budget. */
ok("the time budget is a real span, not zero and not a whole minute",
   typeof TIME_BUDGET === "number" && TIME_BUDGET >= 5000 && TIME_BUDGET <= 45000);
ok("the subrequest budget is still a real number",
   typeof COUNT_BUDGET === "number" && COUNT_BUDGET > 0);

/* ── 3 · THE CLOCK IS THE WHOLE REQUEST'S, RUN ───────────────────────────────
   ⛔⛔ THE BUG: `runBackupFiles` started its OWN `startedAt`, after the database
   dump had already finished. The caller times the dump AND the copy AND the
   stamp. So a ten-second dump left the copy free to spend twenty more, and the
   job died exactly as diagnosed with nothing stamped — a budget bounding a
   stretch nobody was measuring. */
const startM = W.match(/const bkStartClock\s*=\s*\(([^)]*)\)\s*=>\s*\{([^}]*)\};/);
const outM = W.match(/const bkOutOfTime\s*=\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*?)\n\};/);
ok("bkStartClock is defined", !!startM);
ok("bkOutOfTime is defined", !!outM);

if (startM && outM) {
  const mk = () => Function(
    "BACKUP_TIME_BUDGET_MS", "NOW",
    `"use strict";
     const Date = { now: () => NOW.t };
     const bkStartClock = (${startM[1]}) => {${startM[2]}};
     const bkOutOfTime = (${outM[1]}) => {${outM[2]}};
     return { bkStartClock, bkOutOfTime };`,
  )(TIME_BUDGET, NOW);

  const NOW = { t: 1_000_000 };
  const api = mk();
  const env = {};

  api.bkStartClock(env);
  ok("a run that just started is not out of time", api.bkOutOfTime(env) === false);
  NOW.t += TIME_BUDGET - 1;
  ok("one millisecond short of the budget is not out of time", api.bkOutOfTime(env) === false);
  NOW.t += 1;
  ok("exactly at the budget IS out of time", api.bkOutOfTime(env) === true);

  /* ⛔⛔ THE ONE THAT WAS BROKEN. The dump burns most of the budget, then the
     file half asks — and must inherit what is LEFT, not start again. */
  const env2 = {};
  NOW.t = 2_000_000;
  api.bkStartClock(env2);                       // job starts
  NOW.t += TIME_BUDGET - 500;                   // the database dump runs long
  ok("★★ the file half inherits what the dump already spent",
     api.bkOutOfTime(env2) === false);
  NOW.t += 600;                                 // 100ms past the whole budget
  ok("★★ and the deadline is the WHOLE request's, not the file half's",
     api.bkOutOfTime(env2) === true);

  /* ⚠️ A caller that never started the clock is bounded, not unbounded. */
  const env3 = {};
  ok("★ an unstarted clock starts itself rather than running free",
     api.bkOutOfTime(env3) === false && typeof env3.__backupDeadline === "number");
}

ok("★★ the clock starts at the top of the job, before the database dump",
   /async function runBackup\(env\) \{[\s\S]{0,400}?bkStartClock\(env\);/.test(W));
ok("★★ and the file half no longer starts a second one",
   !/bkOutOfTime\(startedAt\)/.test(W));

/* ── 4 · THE COPY LOOP READS BOTH BUDGETS ────────────────────────────────── */
ok("★★ the copy loop checks the SUBREQUEST budget",
   /if \(bkSpent\(env\) >= BACKUP_FETCH_BUDGET\) \{ stoppedBy = "count"/.test(W));
ok("★★ the copy loop checks the TIME budget",
   /if \(bkOutOfTime\(env\)\) \{ stoppedBy = "time"/.test(W));

/* ── 5 · IT STOPS DOING WORK WHEN IT STOPS ───────────────────────────────────
   ⛔⛔ It used `continue`, so remaining buckets were still fully LISTED (real
   fetches, one subrequest a page) and every remaining file still got an R2
   HEAD. Measured: a 20-second budget produced a 26.7 second run, and the
   overrun grows with whatever is left — largest exactly when the budget fires.
   A budget that keeps spending after it is exhausted is not a budget. */
ok("★★ hitting a budget BREAKS the file loop rather than continuing",
   /stoppedBy = "count"; remaining\+\+; break;/.test(W) &&
   /stoppedBy = "time"; remaining\+\+; break;/.test(W));
ok("★★ and a stopped run does not list the remaining buckets at all",
   /if \(stoppedBy\) \{ bucketsNotChecked\+\+; continue; \}/.test(W));

/* ── 6 · THE NOTE NAMES THE BUDGET THAT ACTUALLY FIRED ───────────────────────
   ⚠️ The listings after a stop spend subrequests too, so a run stopped by the
   CLOCK could be pushed past the count budget a moment later and then report
   "subrequest budget spent" — the precise misdirection this note exists to
   prevent. The reason is captured at the moment it fires. */
ok("★★ the note reads the CAPTURED reason, not the counter afterwards",
   /const why = stoppedBy === "count"/.test(W));
ok("the note can still name the subrequest budget", /subrequest budget spent/.test(W));
ok("the note can still name the time budget", /time budget spent/.test(W));

/* ── 7 · NO SILENT CAP ───────────────────────────────────────────────────────
   ⚠️⚠️ `remaining` IS A FLOOR NOW, NOT A COUNT. Counting what is left in the
   buckets we stopped before would mean LISTING them, which is the exact work
   the budget just refused. A silent truncation reads as "covered everything"
   when it did not, so the shortfall is named. */
ok("★★ it says `at least`, because it stopped before counting the rest",
   /at least \$\{remaining\} file\(s\) left/.test(W));
ok("★★ and it names the buckets it never looked at",
   /bucket\(s\) not looked at yet/.test(W) && /bucketsNotChecked,/.test(W));

/* ── 8 · NOTHING ELSE MOVED ─────────────────────────────────────────────────
   ⚠️ A partial run must still write NO manifest. One listing files that are not
   in R2 is the "looks complete and is not" failure the whole job exists to
   avoid, and two budgets must not have loosened it. */
const afterGuard = W.slice(W.indexOf("if (remaining) {"));
ok("a partial run still returns before the manifest is written",
   afterGuard.indexOf("return { done: false") < afterGuard.indexOf("env.BACKUPS.put(name"));

console.log(`backupBudget: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAILED: ${f}`);
if (fails.length) process.exit(1);
