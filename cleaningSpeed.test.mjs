#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   cleaningSpeed.test.mjs — DOES THE WEEKLY CLEANING SUMMARY STILL SAY THE SAME
   THING, AND DOES IT STILL TAKE 24 ROUND TRIPS TO SAY IT?

   ⛔ WHY THIS EXISTS. Matt, Aug 19 2026: "One failed. Cleaning summary."

   Measured: two houses times six days, twice over — a config read and a
   signature read each — was **24 sequential fetches to Supabase**, every one
   waiting on the one before it, before the job even reached its channel post,
   its DM, its push and its hub recap. Nothing in that list depended on anything
   else in it, so all that waiting bought nothing.

   ⚠️⚠️ THE ASSERTION THAT MATTERS IS NOT THE SPEED, IT IS THE SAMENESS. A
   faster job that reports different numbers is a worse job. This runs the real
   extracted block against a reference implementation of the ORIGINAL nested
   loops, over the same made-up store, and fails on any difference in the totals
   or in the wording or ORDER of the lines.

   ⚠️ IT RUNS THE REAL BLOCK, extracted from worker.js. A regex asserting the
   file "mentions Promise.all" would pass on a version that batched the wrong
   keys.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
const fails = [];
const ok = (what, cond, extra) => { if (cond) pass++; else fails.push(what + (extra ? `  — ${extra}` : "")); };

const SRC = readFileSync(path.join(DIR, "worker.js"), "utf8");
ok("worker.js was read (control)", SRC.length > 500000, String(SRC.length));

const CLEAN_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLEAN_DEFAULT_CFG = { def: true };

/* A made-up store: every house/day has tasks, and some are signed off. */
const cleanBuildTasks = (house, day) =>
  Array.from({ length: house === "FOH" ? 3 : 2 }, (_, i) => ({ key: `${house}-${day}-${i}` }));
const store = {};
for (const house of ["FOH", "BOH"]) {
  for (const [d, day] of CLEAN_DAYS.entries()) {
    const field = house === "FOH" ? "cleaned" : "checked";
    const sigs = {};
    /* Sign off a different number each day so a mis-indexed batch shows up. */
    for (let i = 0; i < (d % 3); i++) sigs[`${house}-${day}-${i}`] = { [field]: "someone" };
    store[`cleaning-cfg:${house}:${day}`] = { house, day };
    store[`cleaning:W1:${house}:${day}`] = sigs;
  }
}

/* ── the real block, extracted and run ───────────────────────────────────── */
/* ⚠️ EXTRACTION IS GUARDED, AND IT HAD TO LEARN THAT THE HARD WAY. The first
   version built the function outside a try. When the sequential loops were put
   back as a control, the non-greedy match ran on to a `});` far below, handed
   `new Function` a broken fragment, and the whole file CRASHED with a stack
   trace instead of printing one named failure. A test that dies cannot tell you
   which assertion died — the same lesson branchWatch.test.mjs records. */
let real = null;
let realSrc = "";
try {
  const m = SRC.match(/  const lines = \[\];\n  let grandDone = 0, grandTotal = 0;\n[\s\S]*?\n  \}\);/);
  if (!m) throw new Error("the parallel batch is not in worker.js — did the loops go back to sequential?");
  realSrc = m[0];
  real = new Function("sbGetStrict", "CLEAN_DAYS", "CLEAN_DEFAULT_CFG", "cleanBuildTasks", "env", "weekKey",
    `return (async () => {\n${m[0]}\n return { lines, grandDone, grandTotal, unreadable };\n})();`);
} catch (e) {
  real = null;
  fails.push(`could not extract and build the summary block — ${e.message}`);
}

/* ⚠️ THE BLOCK IS HANDED `sbGetStrict`, AND ASSERTING THAT IS NOT PEDANTRY.
   `new Function` only binds the names it is given, so a worker.js that went
   back to plain `sbGet` would throw ReferenceError at CALL time, killing the
   whole file with a stack trace instead of printing one named failure. This
   says which thing changed, before anything runs. */
if (real) {
  /* ⚠️ SCOPED TO THE EXTRACTED BLOCK, NOT THE WHOLE FILE. worker.js has a
     legitimate `sbGet(env, \`cleaning:...\`)` in another function entirely, and
     five other `const lines = []`. A file-wide grep answers about the wrong
     code and reads as a failure here. */
  ok("★★ the extracted block reads through sbGetStrict, not sbGet",
    /\bsbGetStrict\(env,/.test(realSrc) && !/\bsbGet\(env,/.test(realSrc),
    `strict ${/\bsbGetStrict\(env,/.test(realSrc)}, loose ${/\bsbGet\(env,/.test(realSrc)}`);
  ok("★★ and it is the cleaning block, not one of the other five (control)",
    realSrc.includes("cleaning-cfg:") && realSrc.includes("signed off"));
}

/* Every call into the extracted block goes through this, so a ReferenceError
   from a drifted signature is ONE named failure and not a dead test file. */
const run = async (get, label) => {
  try { return await real(get, CLEAN_DAYS, CLEAN_DEFAULT_CFG, cleanBuildTasks, {}, "W1"); }
  catch (e) { fails.push(`the extracted block threw on ${label} — ${e.message}`); return null; }
};

/* ── the ORIGINAL nested loops, as the reference answer ──────────────────── */
async function reference(sbGet, env, weekKey) {
  const lines = []; let grandDone = 0, grandTotal = 0;
  for (const house of ["FOH", "BOH"]) {
    const cfgAll = {};
    for (const day of CLEAN_DAYS) cfgAll[day] = (await sbGet(env, `cleaning-cfg:${house}:${day}`)) || CLEAN_DEFAULT_CFG;
    for (const day of CLEAN_DAYS) {
      const tasks = cleanBuildTasks(house, day, cfgAll[day]);
      const sigs = (await sbGet(env, `cleaning:${weekKey}:${house}:${day}`)) || {};
      const field = house === "FOH" ? "cleaned" : "checked";
      const done = tasks.filter((t) => (sigs[t.key]?.[field] || "").trim()).length;
      grandDone += done; grandTotal += tasks.length;
      if (tasks.length > 0 && done < tasks.length) lines.push(`• ${house} ${day}: ${done}/${tasks.length} signed off`);
    }
  }
  return { lines, grandDone, grandTotal };
}

if (real) {
  /* Each read takes a tick, and we record when each STARTED relative to how many
     had already finished. Sequential reads finish one before the next starts. */
  let open = 0, maxOpen = 0, calls = 0;
  const slowGet = async (_env, key) => {
    calls++; open++; maxOpen = Math.max(maxOpen, open);
    await new Promise((r) => setTimeout(r, 5));
    open--;
    return store[key];
  };

  const got = (await run(slowGet, "the timing pass")) || { lines: [], grandDone: -1, grandTotal: -1 };
  const want = await reference(async (_e, k) => store[k], {}, "W1");

  ok("★★★ THE REPORT IS IDENTICAL TO THE ORIGINAL — same total",
    got.grandDone === want.grandDone && got.grandTotal === want.grandTotal,
    `got ${got.grandDone}/${got.grandTotal}, want ${want.grandDone}/${want.grandTotal}`);
  ok("★★★ AND THE SAME LINES IN THE SAME ORDER. A reordered report reads as a different bug.",
    JSON.stringify(got.lines) === JSON.stringify(want.lines),
    `\n    got  ${JSON.stringify(got.lines)}\n    want ${JSON.stringify(want.lines)}`);

  /* ⚠️ CONTROL ON THE COMPARISON. If both sides returned nothing, the two
     assertions above would pass on emptiness. */
  ok("★★ THERE WAS A REAL REPORT TO COMPARE (control)",
    want.grandTotal > 20 && want.lines.length >= 4, `${want.grandTotal} tasks, ${want.lines.length} lines`);

  ok(`★★★ ALL ${calls} READS RUN TOGETHER, NOT ONE AFTER ANOTHER — ${maxOpen} were in flight at once`,
    maxOpen === calls && calls === 24, `calls ${calls}, max in flight ${maxOpen}`);

  /* ⚠️ AND THE READ COUNT ITSELF IS ASSERTED. Batching the wrong keys could
     fetch fewer and quietly default half the store to the empty config. */
  ok("★★ IT STILL READS EVERY KEY — 2 houses x 6 days x 2", calls === 24, String(calls));
}

/* ══════════════════════════════════════════════════════════════════════════
   🐛 A REFUSED READ IS NOT AN EMPTY ONE — and this report used to say it was.

   `sbGet` answers null for "the key is not there" and for "Supabase refused
   the read" alike. `|| {}` turned both into an empty signature sheet, so a
   dropped read printed `FOH Monday: 0/12 signed off`, counted twelve misses
   into the store total, and DMed and pushed the cleaning owner that her week
   was outstanding when it may have been finished.

   ⚠️ THE ASSERTION IS THAT THE DAY LEAVES THE TOTALS, not that it reports some
   other number. Counting it as zero and counting it as complete are both claims
   we cannot make.
   ══════════════════════════════════════════════════════════════════════════ */
if (real) {
  /* Everything readable and fully signed off, EXCEPT one day whose signature
     read is refused. */
  const full = {};
  for (const house of ["FOH", "BOH"]) {
    for (const day of CLEAN_DAYS) {
      const field = house === "FOH" ? "cleaned" : "checked";
      const sigs = {};
      cleanBuildTasks(house, day).forEach((t) => { sigs[t.key] = { [field]: "someone" }; });
      full[`cleaning-cfg:${house}:${day}`] = { house, day };
      full[`cleaning:W1:${house}:${day}`] = sigs;
    }
  }
  const REFUSED = "cleaning:W1:FOH:Monday";
  const flaky = async (_env, key) => {
    if (key === REFUSED) throw new Error("kv read refused: 500");
    return full[key];
  };
  const clean = async (_env, key) => full[key];

  const allOk = (await run(clean, "every read working")) || { lines: [], grandDone: -1, grandTotal: -1, unreadable: [] };
  ok("★★ CONTROL: with every read working the week is complete and nothing is unreadable",
    allOk.grandDone === allOk.grandTotal && allOk.grandTotal === 30 && allOk.unreadable.length === 0,
    `${allOk.grandDone}/${allOk.grandTotal}, unreadable ${JSON.stringify(allOk.unreadable)}`);

  const one = (await run(flaky, "one refused signature read")) || { lines: [], grandDone: -1, grandTotal: -1, unreadable: [] };
  ok("★★★ THE REFUSED DAY IS NAMED, NOT COUNTED AS ZERO",
    one.unreadable.length === 1 && one.unreadable[0] === "FOH Monday",
    JSON.stringify(one.unreadable));
  ok("★★★ AND IT DOES NOT APPEAR AS AN INCOMPLETE LINE — that is the false alarm",
    !one.lines.some((l) => l.includes("FOH Monday")), JSON.stringify(one.lines));
  ok("★★★ ITS TASKS LEAVE THE TOTAL ENTIRELY, so the percentage stays true",
    one.grandTotal === allOk.grandTotal - 3 && one.grandDone === allOk.grandDone - 3,
    `${one.grandDone}/${one.grandTotal} against ${allOk.grandDone}/${allOk.grandTotal}`);
  ok("★★ EVERY OTHER DAY STILL READ — one bad key does not lose the other 23",
    one.lines.length === 0, JSON.stringify(one.lines));

  /* A refused CONFIG read must drop the day too: without the config we do not
     know what the task list even is, so "0 signed off" is doubly a guess. */
  const cfgRefused = async (_env, key) => {
    if (key === "cleaning-cfg:BOH:Friday") throw new Error("kv read refused: 500");
    return full[key];
  };
  const two = (await run(cfgRefused, "one refused config read")) || { unreadable: [] };
  ok("★★★ A REFUSED CONFIG READ DROPS THE DAY TOO",
    two.unreadable.length === 1 && two.unreadable[0] === "BOH Friday", JSON.stringify(two.unreadable));

  /* ⚠️ AN ABSENT KEY IS STILL ABSENT. sbGetStrict answers null for a key that
     genuinely is not there, and that must keep reading as "nothing signed off
     yet" rather than as a failure. Getting this backwards would hide a real
     week of missed cleaning behind a warning about Supabase. */
  const missingKey = async (_env, key) =>
    (key === "cleaning:W1:BOH:Tuesday" ? null : full[key]);
  const three = (await run(missingKey, "an absent key")) || { lines: [], unreadable: [] };
  ok("★★★ AN ABSENT KEY IS NOT A FAILURE — it still reports 0 signed off",
    three.unreadable.length === 0 && three.lines.length === 1
      && three.lines[0] === "• BOH Tuesday: 0/2 signed off",
    `unreadable ${JSON.stringify(three.unreadable)}, lines ${JSON.stringify(three.lines)}`);

  /* ⚠️ CONTROL THAT MUST BE FOUND. The wording lives in worker.js, not here, so
     assert the real file carries the sentence and that it cannot claim a clean
     week while a read was refused. */
  ok("worker.js names the unreadable days in the report (control)",
    SRC.includes("so they are NOT counted above"));
  ok("★★★ AND IT CANNOT SAY \"Everything is signed off\" WHILE A READ WAS REFUSED",
    SRC.includes(`(lines.length ? \`Incomplete:\\n\${lines.join("\\n")}\` : (missed ? "" : "Everything is signed off. ✅"))`));
}

/* ⛔ THE SUMMARY GOES LAST. Anything below it runs, passes, and can never fail
   the build. Four files in this repo have already been caught doing that. */
if (fails.length) {
  console.log(`cleaningSpeed: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`cleaningSpeed: ${pass} passed`);
