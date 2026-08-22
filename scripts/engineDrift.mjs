#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   engineDrift.mjs — WHAT DOES ONE HUB HAVE THAT THE OTHER DOES NOT?

       npm run drift                      find the sibling repo automatically
       npm run drift -- /path/to/other    say which repo to compare against
       npm run drift -- --summary         ONE machine-readable line per repo

   ⚠️ `--summary` EXISTS SO `npm run doctor` DOES NOT HAVE TO SCRAPE THIS PROSE,
   and `drift.mjs` already learned why: a caller parsing sentences breaks the
   first time somebody improves the wording, and it breaks SILENTLY, reporting
   zero drift. Anything automated reading this output is owed a stable line.

   ⛔ THE BUG THIS EXISTS FOR, and it is a real one. `village-hub` PR #145 fixed
   the nightly file backup so it can see inside folders. `gate-city-hub` did not
   get it, kept listing only the bucket root, and backed up 19 files out of 602
   — writing a clean manifest and reporting success every night. Nobody knew
   until somebody went looking. There will be a third store, and a fourth.

   ⚠️⚠️ THIS IS NOT `drift.mjs`, AND THE TWO ANSWER DIFFERENT QUESTIONS.
   `drift.mjs` (repo root, origin only) compares BYTES and asks "which FILES
   differ, and is adopting one safe". This asks "which FUNCTIONS and JOBS exist
   in one repo and not the other". You need both, and the byte one alone could
   never have found the bug above: `worker.js` differs between every pair of
   repos on every day of the year, so "worker.js differs" carries no signal at
   all. A whole missing FUNCTION does.

   ⛔⛔ AND HERE IS WHY IT READS TOP-LEVEL FUNCTIONS RATHER THAN EXPORTS.
   Measured before this was written: `worker.js` has exactly ONE export, its
   `export default`, and 250 top-level functions. A tool comparing exported
   names would have found nothing in it, ever, and printed "No drift" on the one
   file the whole exercise is about. `walkBucket` itself is not even in
   `worker.js` — it is exported from `backupWalk.js`, which is why that file is
   on the list below.

   ⚠️ IT IS A LEAD, NOT A VERDICT. A name present in both proves nothing about
   what is inside it. A name missing from one is worth a look, and that is all
   this claims. Read the code before you port anything.

   ⚠️ IT NEVER FAILS THE BUILD. It runs inside `npm run doctor`, and a repo with
   no sibling checked out is a completely normal state — most containers only
   ever hold one. It says so plainly and exits 0.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/* ── THE LIST. Add to it here and nowhere else. ────────────────────────────────
   ⛔⛔ STORE-SPECIFIC FILES ARE DELIBERATELY ABSENT AND MUST STAY ABSENT.
   Rosters, station templates, seeds, branding, `storeConfig.js` — anything
   holding a store's own people or numbers — are SUPPOSED to differ. Listing
   them would report drift on every run for things that are working exactly as
   designed, and a report that is always wrong is a report nobody reads.

   ⚠️ THIS IS THE SHARED ENGINE: the same product, doing the same arithmetic,
   at every store. If two stores should get the same answer from it, it belongs
   here. */
const SHARED_ENGINE = [
  "worker.js",
  "laborEngine.js",
  "laborWindow.js",
  "tierMath.js",
  "profitRebalance.js",
  "slScore.js",
  "fcrImport.js",
  "foodItemGaps.js",
  "inventoryGaps.js",
  "goalsWindow.js",
  "shiftHours.js",
  "weekCutReport.js",
  "teamScoreboard.js",
  "nameMatch.js",
  "finShared.js",
  /* ⭐ ADDED BEYOND THE ORIGINAL FIFTEEN, and this one is the reason the tool
     exists: `walkBucket` lives here, not in worker.js. Leaving it off would
     have made this tool blind to the exact bug it was built to catch. */
  "backupWalk.js",
];

/* ⛔⛔ THE CONTROL, AND ITS FIRST SHAPE WAS WRONG. A discovery scan that finds
   three names looks identical to one that found everything, and both print a
   clean report — so this owes a control. The first attempt was an absolute
   floor of 40 names across the whole run, and it was measured failing on two
   small fixtures that were perfectly readable. `slackChannels.test.mjs` already
   records the mirror image: a RATIO control that went red for the wrong reason
   and punished the one habit the codebase is built on.

   ⇒ THE REAL FAILURE IS NARROWER THAN EITHER: a regex that stops matching on a
   BIG file. So the control is per file and it names that exactly — a
   substantial file that yields no names at all has not been read, whatever the
   totals say. A small file yielding few names is just a small file. */
const BIG_ENOUGH_TO_EXPECT_NAMES = 2000;

const HERE = process.cwd();
const meName = path.basename(HERE);

/* ── Reading ─────────────────────────────────────────────────────────────── */
const readOrNull = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

/* ⚠️ COMMENTS ARE STRIPPED BEFORE ANY SCAN. This repo writes more comment than
   code on purpose, and a comment explaining a function reads exactly like the
   function to a regex. `hubCopies.test.mjs` already paid for that one: a
   comment naming a helper made a function that posts nowhere report as a
   channel poster. Newlines are preserved so nothing downstream shifts. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
     .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));

/* Every shape a top-level name is written in here. Exported or not: a missing
   internal helper is just as much a missing fix as a missing export, and in
   `worker.js` internal is the only kind there is. */
const NAME_PATTERNS = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm,
  /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
];

function namesIn(src) {
  const clean = stripComments(src);
  const out = new Set();
  for (const re of NAME_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean))) out.add(m[1]);
  }
  return out;
}

/* ── MOVED IS NOT MISSING, AND THIS IS THE HALF THAT DECIDES WHETHER ANYBODY
   TRUSTS THIS TOOL ──────────────────────────────────────────────────────────
   ⛔⛔ Caught on the very first run. `isJobLate` came back as "village-hub has
   this and gate-city-hub does not". It was a FALSE ALARM: gate-city has it, in
   `jobHealth.js`, because that rule was deliberately moved out of `worker.js`
   into a leaf so `checks/` could execute it. Reporting that as a missing fix
   sends somebody to re-build something that already exists — and a warning
   that is usually wrong is one people stop reading, on the one signal here
   that has to be believed.

   ⇒ So before calling a name missing, look for it ANYWHERE in that repo. Found
   elsewhere gets its own quieter line; not found anywhere is genuinely missing.

   ⚠️ AND IT SAYS ONLY WHAT A NAME MATCH CAN SUPPORT. Finding `clock` in another
   file does NOT prove the function moved — two files can use one short word for
   two different things, and this cannot tell those apart. So the line names both
   files and says "probably moved, possibly just the same word twice", which is
   the true answer. Either way it is not a missing fix, which is the only claim
   that has to be right here.

   ⚠️ The whole-repo index is built once per repo and cached. It reads the root
   `.js` and `.jsx` files, which is where this codebase keeps everything —
   there is no `src/`. */
const repoIndexCache = new Map();
function repoIndex(root) {
  if (repoIndexCache.has(root)) return repoIndexCache.get(root);
  const idx = new Map();
  let names = [];
  try { names = readdirSync(root); } catch { names = []; }
  for (const f of names) {
    if (!/\.(js|jsx)$/.test(f)) continue;
    if (/\.test\.mjs$/.test(f)) continue;
    const src = readOrNull(path.join(root, f));
    if (src === null) continue;
    for (const n of namesIn(src)) if (!idx.has(n)) idx.set(n, f);
  }
  repoIndexCache.set(root, idx);
  return idx;
}

/* ⚠️ THE JOB LIST IS `worker.js` ONLY AND IT IS THE OTHER HALF OF THE SIGNAL.
   A job one store runs and another does not is a whole automation missing, and
   it is invisible in a function-name compare because the branch is a string. */
const jobsIn = (src) => {
  const clean = stripComments(src);
  const out = new Set();
  const re = /job === "([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(clean))) out.add(m[1]);
  return out;
};

/* ── Finding the other repo ───────────────────────────────────────────────────
   ⛔ NO LIST OF REPO NAMES, ON PURPOSE. A hardcoded "village-hub" would be
   wrong at store three on its first day, and this whole tool exists because
   there is going to be a store three. A sibling is a hub if it LOOKS like one:
   its own git repo, with a package.json and a worker.js. That needs no
   maintenance and cannot go stale. */

/* ⛔⛔ AND `worker.js` IS NOT THE TEST. The first version used it and picked up
   `backline-books`, which is a DIFFERENT PRODUCT — invoices and payments, on
   D1, sharing none of this engine. It has a `worker.js`, a `package.json` and a
   git repo, so it passed every check, and it produced 341 lines of noise that
   buried every real finding underneath it. That repo's own CLAUDE.md says it
   outright: "nothing in the Hub belongs here."

   ⇒ A sibling is a Hub if it carries MOST OF THE SHARED ENGINE ITSELF.
   Measured: the three Hub clones hold 16 of 16, `backline-books` holds 1. That
   is not a close call, and the test tunes itself off the list this whole tool
   is built around rather than off a second thing to maintain. */
const HUB_FLOOR = Math.ceil(SHARED_ENGINE.length / 2);
const engineFilesIn = (dir) =>
  SHARED_ENGINE.filter((f) => existsSync(path.join(dir, f))).length;
const looksLikeAHub = (dir) => engineFilesIn(dir) >= HUB_FLOOR;

function siblings() {
  const parent = path.dirname(HERE);
  let names = [];
  try { names = readdirSync(parent); } catch { return []; }
  const out = [];
  for (const n of names) {
    const p = path.join(parent, n);
    if (p === HERE) continue;
    try { if (!statSync(p).isDirectory()) continue; } catch { continue; }
    if (!existsSync(path.join(p, ".git"))) continue;
    if (!looksLikeAHub(p)) continue;
    out.push(p);
  }
  return out.sort();
}

/* ── Compare one pair ────────────────────────────────────────────────────── */
function compare(otherPath) {
  const otherName = path.basename(otherPath);
  /* Each side is { label, list } where list holds plain-language lines. */
  const mineOnly = [];
  const theirsOnly = [];
  const moved = [];
  const differing = [];
  const sameFiles = [];
  const unread = [];
  let namesSeen = 0;

  for (const rel of SHARED_ENGINE) {
    const a = readOrNull(path.join(HERE, rel));
    const b = readOrNull(path.join(otherPath, rel));

    /* A file one repo has and the other does not is drift, and it is the
       loudest kind. Say it once, at the file level, and do not then list every
       function inside it — that would bury the other findings. */
    if (a === null && b === null) continue;
    if (b === null) { mineOnly.push(`the whole file ${rel}`); continue; }
    if (a === null) { theirsOnly.push(`the whole file ${rel}`); continue; }

    if (a === b) { sameFiles.push(rel); continue; }
    differing.push(rel);

    const an = namesIn(a);
    const bn = namesIn(b);
    namesSeen += an.size + bn.size;

    /* ⚠️ A SUBSTANTIAL FILE THAT YIELDS NO NAMES WAS NOT READ. That is the
       failure this control exists for, and it is the only one a name count can
       actually detect. Named per side, because one repo's copy can be fine
       while the other's is not. */
    if (a.length > BIG_ENOUGH_TO_EXPECT_NAMES && an.size === 0) unread.push(`${rel} here`);
    if (b.length > BIG_ENOUGH_TO_EXPECT_NAMES && bn.size === 0) unread.push(`${rel} at ${otherName}`);

    /* ⚠️ Each side is checked against the OTHER repo as a whole, so a name that
       simply lives in a different file there is never called missing. */
    const theirIdx = repoIndex(otherPath);
    const myIdx = repoIndex(HERE);

    for (const n of [...an].sort()) {
      if (bn.has(n)) continue;
      const where = theirIdx.get(n);
      if (where) moved.push(`${n}  ${rel} here, ${where} at ${otherName}`);
      else mineOnly.push(`${n}  (in ${rel})`);
    }
    for (const n of [...bn].sort()) {
      if (an.has(n)) continue;
      const where = myIdx.get(n);
      if (where) moved.push(`${n}  ${rel} at ${otherName}, ${where} here`);
      else theirsOnly.push(`${n}  (in ${rel})`);
    }

    if (rel === "worker.js") {
      const aj = jobsIn(a);
      const bj = jobsIn(b);
      for (const j of [...aj].sort()) if (!bj.has(j)) mineOnly.push(`the job "${j}"`);
      for (const j of [...bj].sort()) if (!aj.has(j)) theirsOnly.push(`the job "${j}"`);
    }
  }

  return { otherName, mineOnly, theirsOnly, moved, differing, sameFiles, unread, namesSeen };
}

/* ── Say it ──────────────────────────────────────────────────────────────── */
function summary(r) {
  const { otherName, mineOnly, theirsOnly, moved, differing, sameFiles, unread, namesSeen } = r;
  console.log([
    "DRIFT",
    `other=${otherName}`,
    `mineOnly=${mineOnly.length}`,
    `theirsOnly=${theirsOnly.length}`,
    `elsewhere=${moved.length}`,
    `filesDiffer=${differing.length}`,
    `filesSame=${sameFiles.length}`,
    `namesRead=${namesSeen}`,
    `unread=${unread.length}`,
  ].join("\t"));
}

function report(r) {
  const { otherName, mineOnly, theirsOnly, moved, differing, sameFiles, unread, namesSeen } = r;
  /* ⚠️ EACH COMPARISON NAMES ITSELF AND STANDS ALONE. With three siblings the
     blocks run together otherwise, and a finding read against the wrong repo is
     worse than one nobody read. */
  console.log("");
  console.log(`  ── ${meName} vs ${otherName} ──`);

  /* ⛔⛔ THE CONTROL, AND IT COMES FIRST. A scan that read almost nothing
     prints a clean report, which is worse than no report because somebody
     believes it. If the haystack is not there, say so and claim nothing. */
  if (unread.length) {
    console.log(`  Drift check against ${otherName}: PROVED NOTHING.`);
    console.log(`  ${unread.length} file(s) are large and yielded no function names at all,`);
    console.log(`  so this did not read them and is reporting nothing:`);
    for (const u of unread) console.log(`    ${u}`);
    return;
  }

  if (!mineOnly.length && !theirsOnly.length) {
    console.log(`  No drift against ${otherName}.`);
    console.log(`  ${sameFiles.length} of ${sameFiles.length + differing.length} shared engine files are identical; the rest differ only in their lines.`);
    return;
  }

  const say = (who, other, list) => {
    if (!list.length) return;
    console.log(`  ${who} has ${list.length} thing${list.length === 1 ? "" : "s"} ${other} does not:`);
    for (const line of list) console.log(`    ${line}`);
  };
  say(meName, otherName, mineOnly);
  say(otherName, meName, theirsOnly);
  /* ⚠️ LAST AND QUIETER, ON PURPOSE. A moved function is not a missing fix and
     must not compete for attention with one that is. */
  if (moved.length) {
    console.log(`  ${moved.length} name${moved.length === 1 ? " is" : "s are"} in both repos but in different files.`);
    console.log(`  Probably moved, possibly just the same word twice. Not a missing fix either way:`);
    for (const line of moved) console.log(`    ${line}`);
  }
  console.log(`  Everything else matches.`);
}

/* ── Run ─────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const wantSummary = argv.includes("--summary");
const arg = argv.find((a) => !a.startsWith("--"));
let targets = [];

/* ⚠️ SUMMARY MODE SAYS NOTHING WHEN THERE IS NOTHING TO SAY. `npm run doctor`
   runs on every clone including ones with no sibling, and a line explaining
   that on every single run is how a report trains people to skim it. */
const skip = (...msg) => { if (!wantSummary) for (const m of msg) console.log(m); process.exit(0); };

if (arg) {
  /* ⚠️ AN EXPLICIT PATH GETS THE SAME TEST, and that is deliberate. Pointing
     this at a different product does not make the answer useful, it makes it
     341 lines of noise. Say which repo and why, and stop. */
  if (!looksLikeAHub(arg)) {
    const n = existsSync(arg) ? engineFilesIn(arg) : 0;
    skip(`  Drift check skipped: ${arg} is not a Hub repo.`,
         `  It has ${n} of the ${SHARED_ENGINE.length} shared engine files; a Hub has nearly all of them.`);
  }
  targets = [path.resolve(arg)];
} else {
  targets = siblings();
  if (!targets.length) {
    /* ⚠️ A NORMAL STATE, NOT AN ERROR. Most containers hold one repo. */
    skip("  Drift check skipped: no other Hub repo found beside this one.",
         "  Point it at one with:  npm run drift -- /path/to/the/other/repo");
  }
}

for (const t of targets) (wantSummary ? summary : report)(compare(t));
if (!wantSummary) console.log("");
process.exit(0);
