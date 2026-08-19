#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   branchWatch.test.mjs — DOES THE BRANCH GUARD ACTUALLY FIRE?

   ⚠️⚠️ WHY THIS EXISTS, AND WHY IT DRIVES THE REAL FUNCTION. `branchWatch.mjs`
   was written after four branches sat in this repo with no pull request and one
   of their commits turned out to be already on `main`, written twice. A guard
   against that failing SILENTLY would be worse than no guard, because the daily
   report would keep arriving and keep saying nothing is wrong.

   ⇒ Every case below is driven through the exported function with plain data.
   No repo, no git, no network. That is deliberate: the four findings are the
   whole product, and a test that could not reach them would be decoration.

   ⚠️⚠️ EVERY LOOKUP BELOW IS OPTIONAL-CHAINED, AND THAT IS NOT STYLE. Written
   the plain way, a guard that stops firing makes this file die with a TypeError
   on the first assertion that reaches for the missing finding, and every later
   assertion never runs. Measured: deleting the NO PR check produced a stack
   trace and NOT ONE named failure. One broken guard would have hidden the rest.
   Chained, the same break reports the assertion by name and the file keeps
   going.

   ⚠️ THE SUMMARY IS AT THE BOTTOM OF THIS FILE AND MUST STAY THERE. Four test
   files in this repo have had assertions appended BELOW their own summary line,
   where they run, pass, and cannot fail the build. Add new blocks ABOVE it.
   ══════════════════════════════════════════════════════════════════════════ */

import { findingsFor, watch, STALE_DAYS, RECORD_FILES, HELD_FILE } from "./branchWatch.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; } else { fails.push(name + (extra ? `  — ${extra}` : "")); }
};

/* A fixed clock, so "stale" is arithmetic rather than whatever day it is. */
const NOW = Date.parse("2026-08-19T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 864e5).toISOString();
const at = (o) => findingsFor(o, { nowMs: NOW });
const codes = (o) => at(o).map((f) => f.code);

/* A branch with nothing wrong with it: fresh, has a pull request, and touches
   a file nobody else has. Every case below is this one with one thing changed,
   so a finding that fires can only have come from that one difference. */
const HEALTHY = {
  name: "claude/a-normal-branch",
  base: "main",
  ahead: 2,
  behind: 1,
  lastCommit: daysAgo(1),
  openPR: 41,
  changed: ["someFile.js"],
  baseChanged: ["anotherFile.js"],
};

{
  /* ── the baseline, which is the control for everything else ───────────── */
  ok("★★ A HEALTHY BRANCH PRODUCES NO FINDINGS AT ALL",
    at(HEALTHY).length === 0, JSON.stringify(codes(HEALTHY)));
}

{
  /* ── NO PR: the one that cost four branches ───────────────────────────── */
  ok("★★ NO PULL REQUEST IS REPORTED",
    codes({ ...HEALTHY, openPR: null }).includes("NO PR"));
  ok("★★ AND IT IS A STOP, NOT A NOTE",
    at({ ...HEALTHY, openPR: null }).find((f) => f.code === "NO PR")?.level === "stop");
  ok("★ pull request 0 is not a real number here, so it still reports",
    codes({ ...HEALTHY, openPR: 0 }).includes("NO PR"));

  /* ⚠️⚠️ THE SCAN THAT CANNOT READ ITS SOURCE MUST NOT REPORT AN ALL-CLEAR OR
     AN ALL-ALARM. When `gh` is missing the CLI passes "unknown" rather than
     null, because a run that stamped NO PR on every branch would be the
     wrong-directory grep this repo's own rules warn about: one alarm for
     everything, which reads as no information at all. */
  ok("★★ AN UNREADABLE PULL REQUEST LIST DOES NOT FAKE A NO PR FINDING",
    !codes({ ...HEALTHY, openPR: "unknown" }).includes("NO PR"));
  ok("★ and the rest of the findings still work while it is unknown",
    codes({ ...HEALTHY, openPR: "unknown", lastCommit: daysAgo(40) }).includes("STALE"));
}

{
  /* ── ALREADY ON: finished work, safe to ask about ─────────────────────── */
  const done = { ...HEALTHY, changed: [], ahead: 3, openPR: null };
  ok("★★ AN EMPTY CHANGE SET READS AS ALREADY ON THE BASE",
    codes(done).join("|") === "ALREADY ON", codes(done).join("|"));

  /* ⚠️⚠️ THE POINT OF MEASURING CONTENT RATHER THAN COMMITS. A squash merge
     always leaves the branch carrying commits the base does not have, so
     `ahead` stays above zero for ever on a branch that is completely merged.
     Reading `ahead` would report every tidy branch as unshipped work. */
  ok("★★ AHEAD BY MANY COMMITS AND STILL ALREADY ON, BECAUSE SQUASH MERGES DO THAT",
    codes({ ...done, ahead: 99 }).join("|") === "ALREADY ON");

  ok("★★ AND IT SUPPRESSES THE OTHERS, BECAUSE THEY WOULD BE NOISE",
    codes({ ...done, lastCommit: daysAgo(400), baseChanged: ["someFile.js"] }).join("|")
      === "ALREADY ON");
  ok("★ its level is done, so it sorts below anything needing action",
    at(done)[0]?.level === "done");
}

{
  /* ── BOTH CHANGED: the duplicate-work lead ────────────────────────────── */
  const clash = { ...HEALTHY, changed: ["shared.js", "mine.js"], baseChanged: ["shared.js"] };
  ok("★★ A FILE EDITED ON BOTH SIDES SINCE THE SPLIT IS REPORTED",
    codes(clash).includes("BOTH CHANGED"));
  ok("★★ AND IT NAMES THE FILE, BECAUSE A COUNT IS NOT ACTIONABLE",
    at(clash).find((f) => f.code === "BOTH CHANGED")?.files?.join("|") === "shared.js");
  ok("★ a file only this branch touched is not a clash",
    !codes({ ...HEALTHY, changed: ["mine.js"], baseChanged: ["theirs.js"] })
      .includes("BOTH CHANGED"));
  ok("★ a base that has moved on files this branch never touched is not a clash",
    !codes({ ...HEALTHY, baseChanged: ["a.js", "b.js", "c.js"] }).includes("BOTH CHANGED"));
}

{
  /* ── STALE ────────────────────────────────────────────────────────────── */
  ok("★ a branch touched today is not stale",
    !codes({ ...HEALTHY, lastCommit: daysAgo(0) }).includes("STALE"));
  ok(`★ one day under the ${STALE_DAYS} day line is not stale`,
    !codes({ ...HEALTHY, lastCommit: daysAgo(STALE_DAYS - 1) }).includes("STALE"));
  ok(`★★ ON the ${STALE_DAYS} day line it IS stale`,
    codes({ ...HEALTHY, lastCommit: daysAgo(STALE_DAYS) }).includes("STALE"));

  /* ⚠️⚠️ THE NaN CASE, WRITTEN `!(age < staleDays)` FOR THIS REASON. Every
     comparison against NaN is false, so the plain `age >= staleDays` form would
     call a branch with an unreadable date FRESH and say nothing about it. This
     form calls it stale, which is a line in a report rather than a branch
     nobody ever looks at again. */
  ok("★★ AN UNPARSABLE DATE FAILS TOWARDS REPORTING, NEVER TOWARDS SILENCE",
    codes({ ...HEALTHY, lastCommit: "not a date" }).includes("STALE"));
  ok("★ and it says so in words rather than printing NaN at Matt",
    at({ ...HEALTHY, lastCommit: "not a date" })
      .find((f) => f.code === "STALE")?.say?.includes("unreadable") === true);
  ok("★ a missing date is treated the same way",
    codes({ ...HEALTHY, lastCommit: undefined }).includes("STALE"));
}

{
  /* ── the list, and the order it comes back in ─────────────────────────── */
  const rows = [
    { ...HEALTHY, name: "zzz-finished", changed: [] },
    { ...HEALTHY, name: "mmm-quiet" },
    { ...HEALTHY, name: "aaa-invisible", openPR: null },
    { ...HEALTHY, name: "bbb-clash", changed: ["shared.js"], baseChanged: ["shared.js"] },
  ];
  const got = watch(rows, { nowMs: NOW });

  ok("★★ A BRANCH WITH NOTHING TO SAY IS LEFT OUT ENTIRELY",
    !got.some((r) => r.branch === "mmm-quiet"), got.map((r) => r.branch).join("|"));
  ok("★★ THE ONE NOTHING CAN MERGE COMES FIRST, BECAUSE IT IS READ ON A PHONE",
    got[0]?.branch === "aaa-invisible", got.map((r) => r.branch).join("|"));
  ok("★ the finished one comes last",
    got[got.length - 1]?.branch === "zzz-finished", got.map((r) => r.branch).join("|"));
  ok("★ three of the four are reported", got.length === 3, String(got.length));
  ok("★ every row carries the base it was measured against",
    got.every((r) => r.base === "main"));

  /* Same findings, given in a different order, must come back the same way. */
  const shuffled = watch([rows[2], rows[0], rows[3], rows[1]], { nowMs: NOW });
  ok("★★ THE ORDER OF THE INPUT DOES NOT CHANGE THE ORDER OF THE REPORT",
    shuffled.map((r) => r.branch).join("|") === got.map((r) => r.branch).join("|"),
    shuffled.map((r) => r.branch).join("|"));
}

{
  /* ── missing and malformed input, because git output is not a promise ─── */
  ok("★ a branch with no change list at all reads as already on the base",
    codes({ ...HEALTHY, changed: undefined }).join("|") === "ALREADY ON");
  ok("★ a missing baseChanged list is not a clash",
    !codes({ ...HEALTHY, baseChanged: undefined }).includes("BOTH CHANGED"));
  ok("★ an empty branch list is an empty report, not a crash",
    watch([], { nowMs: NOW }).length === 0);
}

{
  /* ── the record files, which is what made the first draft unreadable ──── */
  /* ⛔⛔ MEASURED ON THE REAL REPO BEFORE THIS EXISTED: three branches each
     reported four to six colliding files, and exactly ONE of them was the
     duplicated work the finding is for. The rest was `build-log.md` and the
     `CLAUDE.md` holds table, which every branch touches by design. A finding
     that fires on every branch every day is one nobody reads. */
  const onlyRecords = {
    ...HEALTHY,
    changed: ["build-log.md", "CLAUDE.md"],
    baseChanged: ["build-log.md", "CLAUDE.md"],
  };
  ok("★★ TWO BRANCHES BOTH APPENDING TO THE RECORD FILES IS NOT A FINDING",
    !codes(onlyRecords).includes("BOTH CHANGED"), codes(onlyRecords).join("|"));

  const mixed = {
    ...HEALTHY,
    changed: ["build-log.md", "CLAUDE.md", "realCode.js"],
    baseChanged: ["build-log.md", "CLAUDE.md", "realCode.js"],
  };
  ok("★★ BUT A CODE FILE ALONGSIDE THEM STILL FIRES",
    codes(mixed).includes("BOTH CHANGED"));
  ok("★★ AND THE RECORD FILES ARE NOT NAMED IN IT, WHICH IS THE WHOLE POINT",
    at(mixed).find((f) => f.code === "BOTH CHANGED")?.files?.join("|") === "realCode.js",
    JSON.stringify(at(mixed).find((f) => f.code === "BOTH CHANGED")?.files));

  ok("★ every name in the skip list is a record file, not source",
    RECORD_FILES.every((f) => /\.md$/.test(f)), RECORD_FILES.join("|"));
  ok("★ the skip list is overridable, so a repo with different bookkeeping can say so",
    findingsFor(mixed, { nowMs: NOW, recordFiles: [] })
      .find((f) => f.code === "BOTH CHANGED")?.files?.length === 3);
}

{
  /* ── branches held on purpose ─────────────────────────────────────────── */
  /* ⛔ `backline-books` parks `claude/store-intake-uploads` deliberately, and
     its own CLAUDE.md says in capitals not to delete it. Without the hold list
     it would earn NO PR and STALE every morning for ever, about a decision
     already made. Same failure as the record files: an alarm that fires daily
     stops being read. */
  const parked = { ...HEALTHY, name: "claude/parked-on-purpose", openPR: null, lastCommit: daysAgo(90) };
  const busy = { ...HEALTHY, name: "claude/real-work", openPR: null };

  ok("★★ WITHOUT THE HOLD, A PARKED BRANCH SHOUTS EVERY DAY",
    watch([parked, busy], { nowMs: NOW }).length === 2);
  ok("★★ HELD, IT PRODUCES NOTHING AT ALL",
    watch([parked, busy], { nowMs: NOW, held: ["claude/parked-on-purpose"] })
      .map((r) => r.branch).join("|") === "claude/real-work",
    watch([parked, busy], { nowMs: NOW, held: ["claude/parked-on-purpose"] })
      .map((r) => r.branch).join("|"));

  /* ⚠️ HOLDING ONE MUST NOT QUIET THE OTHERS, which is the mistake that would
     turn this into an off switch for the whole report. */
  ok("★★ AND EVERY OTHER BRANCH IS STILL REPORTED IN FULL",
    watch([parked, busy], { nowMs: NOW, held: ["claude/parked-on-purpose"] })[0]
      ?.findings.some((f) => f.code === "NO PR"));

  ok("★ an empty hold list holds nothing",
    watch([parked, busy], { nowMs: NOW, held: [] }).length === 2);
  ok("★ no hold list at all holds nothing, so a repo that never needed one is unchanged",
    watch([parked, busy], { nowMs: NOW }).length === 2);
  ok("★ a name in the list that matches no branch is harmless",
    watch([busy], { nowMs: NOW, held: ["claude/long-gone"] }).length === 1);
  ok("★ the hold file is under .github, where a repo's own settings live",
    HELD_FILE === ".github/branches-held.txt", HELD_FILE);
}

/* ⛔ THE SUMMARY GOES LAST. Anything added below this line still runs, still
   passes, and can never fail the build. Add blocks above it. */
if (fails.length) {
  console.log(`branchWatch: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`branchWatch: ${pass} passed`);
