/* ══════════════════════════════════════════════════════════════════════════
   scripts/doctor.mjs — IS THIS CLONE SAFE TO WORK IN RIGHT NOW?

       npm run doctor          the full report, and it exits 1 if anything is wrong
       npm test                runs this first, in --quick mode, and never blocks

   ⚠️ IT DOES NOT RUN DURING `npm run build`. Nothing here reaches a screen, a
   stored record or the Worker. It reads git and the filesystem and prints.

   ═══ WHY IT EXISTS ════════════════════════════════════════════════════════
   Every expensive mistake in these repos has the same first sentence: somebody
   worked confidently against a copy of the tree that was not the current one.
   `CLAUDE.md` records four of them by name. The branch rules record a handover
   written off a stale `git branch -r`. The port rules record a "safe adopt"
   that would have deleted five test files.

   ⇒ None of those are hard to CHECK. They are hard to REMEMBER to check. So
   this asks the four questions before any work starts, in plain words:

     1. which branch am I on
     2. how far behind `origin/main` is it
     3. is there uncommitted work sitting here
     4. is `node_modules` installed
     5. do the tests pass
     6. has this repo drifted from the other Hub repos beside it

   ═══ THE TWO MODES, AND WHY THE QUICK ONE NEVER FAILS ══════════════════════
   `npm test` runs `--quick` through `pretest`. That mode does everything
   EXCEPT running the tests, for two reasons:

   ⚠️⚠️ **RUNNING THEM WOULD RECURSE.** `pretest` fires immediately before
   `npm test`, so a doctor that shelled out to `npm test` would call itself
   forever.

   ⛔⛔ **AND IT EXITS 0 WHATEVER IT FINDS.** A stale clone is a warning worth
   reading; it is never a reason to refuse to run the tests. Blocking the suite
   over a dirty tree would stop the one thing that actually catches bugs, at the
   exact moment somebody is trying to catch a bug. It prints and stands aside.

   ⚠️ `npm run doctor` on its own is the opposite: it exits 1, because there
   somebody asked the question and wants an answer they can act on.
   ══════════════════════════════════════════════════════════════════════════ */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");

/* ⚠️ MINE, NOT MATT'S, WHICH IS WHY IT IS A NAMED CONSTANT RATHER THAN A
   NUMBER TYPED INTO AN `if`. One or two commits behind is an ordinary morning.
   Ten is how the same fix gets built twice, which these repos have recorded
   four times. Nothing measured this; it is a judgement and it is labelled one. */
const BEHIND_WARN = 10;

/* ⚠️ EVERY GIT CALL IS ALLOWED TO FAIL AND SAY SO. This runs on a fresh clone,
   in a container with no network, and inside CI. A doctor that throws its own
   stack trace at somebody checking whether their clone is healthy has answered
   the wrong question badly. `null` means "could not tell", which is a real
   answer and is printed as one. */
function git(...args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/* ⚠️ AN UNREADABLE package.json IS REPORTED, NOT THROWN. This runs in places a
   repo may be half-checked-out, and a stack trace is the wrong answer to
   "is my copy healthy". */
function readPkg() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

const problems = [];   // things to fix, in plain words
const notes = [];      // true but not a problem
const lines = [];      // the report body

const say = (s) => lines.push(s);

/* ── 1. which branch ─────────────────────────────────────────────────────── */
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (!branch) {
  say("Branch            could not read git. Is this a git clone?");
  problems.push("This folder does not look like a git clone, so nothing below could be checked.");
} else if (branch === "main") {
  say(`Branch            ${branch}`);
  /* ⚠️ NOT A PROBLEM, A NOTE. Reading on `main` is normal and correct. It is
     only WRITING there that these repos forbid, and this script cannot tell
     what somebody is about to do. */
  notes.push("You are on main. Make a branch before you change anything.");
} else {
  say(`Branch            ${branch}`);
}

/* ── 2. how far behind origin/main ───────────────────────────────────────── */
/* ⚠️ THE FETCH IS BEST EFFORT AND ITS FAILURE IS REPORTED, NEVER SWALLOWED.
   Without it the count below is measured against whatever `origin/main` was
   the last time anybody fetched, which is exactly the stale-cache mistake
   `git branch -r` already caused here once. Saying "could not reach origin"
   out loud is the difference between an old number and a wrong one. */
let reachedOrigin = false;
if (branch) {
  const f = spawnSync("git", ["fetch", "origin", "main", "--quiet"], { cwd: ROOT, timeout: 30000, stdio: "ignore" });
  reachedOrigin = f.status === 0;
}

if (!branch) {
  /* already reported */
} else if (!reachedOrigin) {
  say("Behind main       could not reach origin, so this number is not current");
  notes.push("Could not reach GitHub, so 'commits behind' could not be refreshed. It may be worse than it says.");
  const stale = git("rev-list", "--count", "HEAD..origin/main");
  if (stale != null) say(`                  last known: ${stale} commits behind`);
} else {
  const behind = git("rev-list", "--count", "HEAD..origin/main");
  const ahead = git("rev-list", "--count", "origin/main..HEAD");
  if (behind == null) {
    say("Behind main       could not compare against origin/main");
    notes.push("Could not compare this branch against origin/main.");
  } else {
    const b = Number(behind), a = Number(ahead || 0);
    say(`Behind main       ${b} commit${b === 1 ? "" : "s"} behind, ${a} ahead`);
    /* ⚠️ THE THRESHOLD IS MINE, NOT MATT'S, WHICH IS WHY IT IS NAMED HERE.
       One or two commits behind is ordinary during a normal day's work. A clone
       tens of commits behind is how the same fix gets built twice, which this
       repo has recorded four times. */
    if (b >= BEHIND_WARN) {
      problems.push(`This copy is ${b} commits behind main. Run: git pull origin main   (before you write anything)`);
    }
  }
}

/* ── 3. uncommitted work ─────────────────────────────────────────────────── */
const dirty = git("status", "--porcelain");
if (dirty == null) {
  say("Uncommitted       could not read git status");
} else if (dirty === "") {
  say("Uncommitted       nothing, the folder is clean");
} else {
  const files = dirty.split("\n").filter(Boolean);
  say(`Uncommitted       ${files.length} file${files.length === 1 ? "" : "s"} changed and not committed`);
  for (const f of files.slice(0, 8)) say(`                    ${f}`);
  if (files.length > 8) say(`                    ...and ${files.length - 8} more`);
  /* ⚠️ A NOTE, NOT A PROBLEM. Work in progress is the normal state of a working
     folder. It only matters because a `git pull` on top of it can conflict, and
     because it is the usual reason somebody's change "did not reach" a branch. */
  notes.push("You have changes that are not committed yet. They are not on any branch until you commit them.");
}

/* ── 4. is node_modules there ────────────────────────────────────────────── */
/* ⚠️⚠️ "THE FOLDER EXISTS" IS NOT "IT IS INSTALLED", and the difference is not
   cosmetic: an interrupted `npm ci` leaves the directory behind holding almost
   nothing, and what that produces downstream reads as a broken import rather
   than a missing install. So this checks that a package the repo actually
   DECLARES is really on disk.

   ⛔⛔ AND IT ASKS THE REPO WHICH PACKAGE, NEVER NAMES ONE. `backline-books`
   has no packages at all and says so in its own rules — "no packages, no build
   step". A doctor that looked for `vite` would report that repo permanently
   broken, every run, for being exactly what it is meant to be. */
const pkg = readPkg();
const declared = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
const NM = path.join(ROOT, "node_modules");
let packagesOk = true;
if (declared.length === 0) {
  say("Packages          none needed, this repo has no dependencies");
} else if (!fs.existsSync(NM)) {
  say("Packages          not installed");
  problems.push("The packages are not installed. Run: npm ci");
  packagesOk = false;
} else if (!declared.some((d) => fs.existsSync(path.join(NM, ...d.split("/"))))) {
  /* ⚠️ `some`, NOT `every`. An optional package that legitimately did not
     install would make `every` accuse a healthy clone, and a check that is
     usually wrong gets ignored, which is worse than not having it. */
  say("Packages          the folder is there but looks empty");
  problems.push("The package folder is there but nothing is in it, so a build would fail. Run: npm ci");
  packagesOk = false;
} else {
  say(`Packages          installed (${declared.length} listed)`);
}

/* ── 5. do the tests pass ────────────────────────────────────────────────── */
/* ⛔⛔ THE REPO SAYS WHAT ITS TESTS ARE, THIS FILE NEVER DECIDES. All five repos
   answer differently: this one runs `node --test test/**`, the three clones run
   `node checks/run.mjs`, and `backline-books` runs its own root scripts. A list
   of those five commands typed in here would be a second copy of a fact each
   repo already states in its own `package.json`, and rule 8 says how that ends.

   ⚠️⚠️ AND IT IS RUN DIRECTLY, NEVER THROUGH `npm test`. `pretest` calls this
   script, so a doctor that shelled out to `npm test` would call itself. It
   terminates today only because `--quick` skips this block, which is a
   coincidence of the current design and not something to rely on. */
if (QUICK) {
  say("Tests             skipped here, they are about to run");
} else if (!packagesOk) {
  say("Tests             not run, because the packages are missing");
} else if (!pkg.scripts || !pkg.scripts.test) {
  /* ⚠️ A PROBLEM, NOT A NOTE. A repo with no way to run its own tests is a repo
     where nothing catches a regression, and that is worth saying out loud
     rather than passing over in silence. */
  say("Tests             this repo has no test command");
  problems.push('This repo has no "test" script in package.json, so nothing here can check itself.');
} else {
  const r = spawnSync(pkg.scripts.test, { cwd: ROOT, shell: true, encoding: "utf8", timeout: 300000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  /* ⚠️ READ THE COUNT OUT OF THE RUNNER'S OWN SUMMARY, never re-count and never
     guess. A second place counting tests is a second answer that can disagree
     with the first (rule 8).

     ⛔⛔ AND ONLY A FORMAT THIS KNOWS, ANCHORED TO THE START OF A LINE. The
     first version of this also tried a loose `(\d+) passed` anywhere in the
     output, and in the three clones that matched the QUARANTINED test's own
     line — so a 99-file suite reported "all 18 passed", which is both wrong and
     the most misleading 18 in that output. ⇒ **No number is honest. A wrong
     number is not.** If the runner does not print a summary this recognises,
     say "passed" and leave the counting to it. */
  const passN = (out.match(/^# pass (\d+)$/m) || [])[1];
  const failN = (out.match(/^# fail (\d+)$/m) || [])[1];
  if (r.status === 0) {
    say(`Tests             ${passN ? `all ${passN} ` : ""}passed`);
  } else {
    say(`Tests             ${failN || "some"} FAILED${passN ? ` (${passN} passed)` : ""}`);
    problems.push(`${failN || "Some"} test${failN === "1" ? " is" : "s are"} failing. Run: npm test   and read the first failure.`);
  }
}

/* ── 6. drift against the other Hub repos ─────────────────────────────────────
   ⛔⛔ A NOTE, NEVER A PROBLEM, AND THAT IS NOT timidity. `npm run doctor`
   exits 1 on a problem, and drift between two live stores is the NORMAL state
   every day of the year — the clones are hundreds of commits apart by design.
   Counting it as a fault would make `doctor` fail forever, and a check that
   always fails is one people learn to ignore, which would cost the other five.

   ⚠️ IT SHELLS OUT AND READS ONE STABLE LINE rather than re-implementing the
   comparison here. Two copies of "what has drifted" would drift (rule 8), and
   this is the copy nobody would think to update.

   ⚠️ SKIPPED IN --quick, exactly like the tests, because `pretest` fires before
   every `npm test` and this takes a few seconds. */
if (!QUICK) {
  const drift = path.join(ROOT, "scripts", "engineDrift.mjs");
  if (!fs.existsSync(drift)) {
    say("Drift             no drift check in this repo");
  } else {
    const r = spawnSync(process.execPath, [drift, "--summary"],
      { cwd: ROOT, encoding: "utf8", timeout: 120000 });
    const rows = String(r.stdout || "").trim().split("\n").filter((l) => l.startsWith("DRIFT\t"));
    if (r.status !== 0) {
      /* ⚠️ SAY IT DID NOT RUN. Silence here would read as "no drift", which is
         the one answer this must never give by accident. */
      say("Drift             the drift check would not run");
      notes.push("`npm run drift` failed to run. It cannot say whether this repo has drifted.");
    } else if (!rows.length) {
      say("Drift             no other Hub repo is checked out beside this one");
    } else {
      const parts = [];
      let anything = 0;
      for (const row of rows) {
        const f = Object.fromEntries(row.split("\t").slice(1).map((kv) => kv.split("=")));
        const n = Number(f.mineOnly || 0) + Number(f.theirsOnly || 0);
        anything += n;
        parts.push(`${f.other} ${n}`);
      }
      say(`Drift             ${parts.join(" \u00b7 ")}`);
      if (anything) notes.push("Those are functions or jobs one repo has and another does not. Run: npm run drift");
    }
  }
}

/* ── the report ──────────────────────────────────────────────────────────── */
console.log("");
console.log(`  ${path.basename(ROOT)} — checkup`);
console.log("  " + "-".repeat(52));
for (const l of lines) console.log(`  ${l}`);
console.log("");

if (problems.length === 0) {
  console.log("  PASS. Nothing is wrong with this copy.");
} else {
  console.log(`  ${problems.length} thing${problems.length === 1 ? "" : "s"} to fix:`);
  for (const [i, p] of problems.entries()) console.log(`    ${i + 1}. ${p}`);
}
for (const n of notes) console.log(`  Note: ${n}`);
console.log("");

/* ⛔ THE QUICK RUN NEVER BLOCKS. See the header — refusing to run the tests
   because the clone is behind stops the one thing that finds bugs. */
process.exit(QUICK ? 0 : problems.length ? 1 : 0);
