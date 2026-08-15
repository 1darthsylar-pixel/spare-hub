#!/usr/bin/env node
// Gate City Hub -- pre-ship checks.
//
//   node checks/run.mjs                 all source files in the repo
//   node checks/run.mjs App.jsx         one or more named files
//
// Exit 0 = clean. Exit 1 = something failed. Exit 2 = the harness itself broke.
//
// READ THE NUMBERS, NOT JUST THE WORD. A check that reports "ok" while
// suppressing part of its own output is worse than no check at all. That is
// exactly how the Leadership 101 crash shipped.

import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { validate } from "./validate.mjs";
import { hookcheck } from "./hookcheck.mjs";
import { scopecheck } from "./scope.mjs";
import { tdzcheck } from "./tdzcheck.mjs";
import { eventcheck } from "./eventcheck.mjs";
import { cyclecheck, listSourceFiles } from "./cyclecheck.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const files = args.length ? args.map((a) => path.resolve(root, a)) : listSourceFiles(root);

if (!files.length) {
  console.error("No source files found.");
  process.exit(2);
}

const PER_FILE = [validate, hookcheck, scopecheck, tdzcheck, eventcheck];
const results = [];

for (const f of files) {
  for (const check of PER_FILE) {
    try {
      results.push(check(f));
    } catch (err) {
      results.push({ name: check.name, file: f, failures: [`CHECK CRASHED: ${err.message}`] });
    }
  }
}
results.push(cyclecheck(root, args.length ? files : listSourceFiles(root)));

let failed = 0;
for (const r of results) {
  const rel = r.file === "(repo)" ? "(repo)" : path.relative(root, r.file);
  if (!r.failures.length) continue;
  failed += r.failures.length;
  console.log(`\nFAIL  ${r.name}  ${rel}   ${r.failures.length} finding(s)`);
  for (const line of r.failures) console.log(`      ${line}`);
}

const byCheck = {};
for (const r of results) byCheck[r.name] = (byCheck[r.name] || 0) + r.failures.length;

console.log("\n--------------------------------------------");
console.log(`files checked: ${files.length}`);
for (const [name, n] of Object.entries(byCheck)) {
  console.log(`  ${name.padEnd(12)} ${n === 0 ? "clean" : `${n} finding(s)`}`);
}
console.log("--------------------------------------------");

if (failed) {
  console.log(`\n${failed} finding(s). NOTHING SHIPS until this is zero.\n`);
  process.exit(1);
}
/* ══ THE TEST FILES ════════════════════════════════════════════════════════
   ⚠️⚠️ THIS RUNNER GRADED SIX CHECKS AND RAN NO TEST FILE AT ALL, and that is
   how `newstore.mjs` shipped DEAD: it exited 1 before writing a byte, while
   `newstoreIdentity.test.mjs` sat red beside it the whole time. Two more were
   red the same way and nobody knew: `checks/hrGate.test.mjs` (9 failures) and
   the second store's `featureSwitches.test.mjs` (its CONTROL, which means its
   other 14 passes proved nothing). One command is supposed to answer "is
   anything broken". It was answering a narrower question in the same words.

   ⚠️ PURELY ADDITIVE, ON PURPOSE, BECAUSE THIS FILE GRADES THE THING EDITING
   IT. The six checks above still exit 1 on their own, ABOVE this block, so
   nothing here can rescue a failing check or soften what one means. This can
   only ever ADD a reason to fail.

   ⚠️ ALWAYS RUNS, not only on a full sweep. Measured: all eight finish in
   about 0.85s. Gating them behind "no file arguments" would mean the loop's
   own `node checks/run.mjs <files touched>` never ran a single one, which is
   precisely the hole being closed.

   ⚠️ A TEST THAT CANNOT BE RUN COUNTS AS FAILED, NEVER AS SKIPPED. A crash, a
   missing import, a timeout: all failures. "It did not run" is the exact state
   that let three of these rot unnoticed. */
const testFiles = [
  ...fs.readdirSync(root).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join(root, f)),
  ...(fs.existsSync(path.join(root, "checks"))
    ? fs.readdirSync(path.join(root, "checks")).filter((f) => f.endsWith(".test.mjs"))
        .map((f) => path.join(root, "checks", f))
    : []),
].sort();

/* ⚠️⚠️ KNOWN-STALE TESTS, QUARANTINED BY NAME. They still RUN and their result
   is still PRINTED on every sweep; they just do not fail the build. Read this
   list as a debt column, not a settings block.

   ⛔ THE BAR FOR ADDING A NAME IS HIGH, because this is the one mechanism here
   that can hide a real failure. A test goes on this list ONLY when it grades
   something that no longer exists BY DESIGN, and the thing it was protecting
   has been verified working by hand. Never because it is noisy, never because
   it is inconvenient, and never to get a green run.

   Each entry says why and what would retire it. An entry with no plan to leave
   is how a quarantine becomes a graveyard. */
const KNOWN_STALE = {
  "checks/hrGate.test.mjs":
    "grades titles from HR_SEED_ROLES, deliberately emptied so a clone inherits nobody. "
    + "The gate itself was verified by hand Aug 13 2026: hrInConsole() returns true for all "
    + "five listed ids and names, isGateCity() is true, live titles come from the roster. "
    + "RETIRE BY: rebuilding it on roster-shaped inputs instead of the seed, then deleting this line.",
};

let testFailed = 0;
if (testFiles.length) {
  const bad = [];
  const stale = [];
  for (const t of testFiles) {
    const rel = path.relative(root, t);
    try {
      execFileSync(process.execPath, [t], { cwd: root, stdio: "pipe", timeout: 120000 });
    } catch (e) {
      /* ⚠️ A QUARANTINED TEST IS STILL RUN AND STILL SHOWN. Skipping it would
         make the list a way to stop looking, which is the failure this whole
         block exists to end. */
      if (KNOWN_STALE[rel]) {
        const o = String((e.stdout || "") + (e.stderr || "")).trim().split("\n");
        stale.push([rel, o[o.length - 1] || "no output"]);
        continue;
      }
      testFailed++;
      /* The last line of a test's own output is its summary, and that is the
         most useful thing to surface. A test that died before printing gets
         the reason instead, never silence. */
      const out = String((e.stdout || "") + (e.stderr || "")).trim().split("\n");
      bad.push([rel, out[out.length - 1] || e.message || "no output"]);
    }
  }
  console.log(`  ${"tests".padEnd(12)} ${testFailed === 0 ? `${testFiles.length} file(s), all pass` : `${testFailed} of ${testFiles.length} FAILING`}${stale.length ? `, ${stale.length} known-stale` : ""}`);
  for (const [rel, why] of bad) console.log(`      FAIL  ${rel}  ${why.slice(0, 90)}`);
  /* Printed every single run, deliberately. A debt you stop seeing is a debt
     you stop paying. */
  for (const [rel, why] of stale) console.log(`      STALE ${rel}  ${why.slice(0, 70)}  (quarantined, see KNOWN_STALE)`);
  console.log("--------------------------------------------");
} else {
  /* ⚠️ NO TEST FILES IS REPORTED, NOT PASSED OVER. A sweep that finds nothing
     reads exactly like a sweep that found nothing wrong. */
  console.log(`  ${"tests".padEnd(12)} none found`);
  console.log("--------------------------------------------");
}

if (testFailed) {
  console.log(`\nSix checks clean, but ${testFailed} test file(s) FAILING. NOTHING SHIPS until this is zero.\n`);
  process.exit(1);
}

console.log("\nAll six checks clean.\n");
process.exit(0);
