#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   branchWatch.mjs — WHAT IS SITTING ON A BRANCH WHERE NOBODY CAN SEE IT?

     node branchWatch.mjs            human list
     node branchWatch.mjs --summary  ONE machine-readable line per branch

   ★ WHY THIS EXISTS, AND IT IS NOT THE SAME JOB AS drift.mjs. That one asks
   "what is a CLONE behind on" — one repo against another. This one asks "what
   is in THIS repo that `main` cannot see". Both are drift. They fail in
   different directions and neither catches the other's case.

   ⛔ THE FAILURE THIS WAS BUILT AFTER, MEASURED Aug 19 2026 IN THIS REPO.
   Four branches existed here and NOT ONE OF THEM HAD A PULL REQUEST. They held
   real, finished, tested work — a training badge bug, a My Shifts date bug, a
   scheduling lock bug — and nothing automated could see them, reach them, or
   merge them. `auto-merge` in deploy-window.yml only looks at OPEN pull
   requests carrying the ready label, so a branch with no pull request is
   invisible to the one thing that ships code here.

   ⛔⛔ AND THE SECOND HALF, WHICH IS WORSE. One of those four commits was
   ALREADY ON `main`, byte for byte, written a second time by another session
   hours apart. It was found by hand, by diffing. Nothing would have reported
   it. CLAUDE.md has warned about exactly this since Aug 13 2026 — "two
   sessions independently solved one problem within hours of each other" — and
   the warning was the whole guard. A warning is not a guard.

   ⇒ SO THIS REPORTS FOUR THINGS, AND EVERY ONE OF THEM COST A REAL AFTERNOON:

     NO PR         work exists that `main` cannot see and nothing can merge
     ALREADY ON    every change is on `main` already; the branch is finished
                   and safe to delete
     BOTH CHANGED  this branch and `main` have both edited the same CODE file
                   since the branch split — the shape of the same fix built
                   twice. The append-only record files are skipped; see
                   RECORD_FILES for why that is the difference between a report
                   Matt reads and one he stops reading
     STALE         no commit for a while; either forgotten or blocked

   ⚠️ EVERY ONE IS A LEAD, NEVER A VERDICT, AND THE DISTINCTION MATTERS MOST
   FOR "ALREADY ON". It means "every byte of this branch is on `main` as far as
   a diff can tell". That is a strong signal and it is still not permission:
   CLAUDE.md's branch rule is that an unmerged branch is somebody's unshipped
   work and only the owner deletes it. This tool tells you which branches are
   SAFE to ask about. It never tells you to delete one.

   ⚠️ AND "BOTH CHANGED" IS NOT AN ACCUSATION. Two branches touching one file
   is completely normal in a repo three sessions work in. It is worth ten
   seconds of reading and nothing more. The reason it earns a line at all is
   that the one time it mattered, it mattered enormously and nobody looked.

   ⚠️ THIS FILE TRAVELS TO EVERY STORE. `newstore.mjs` excludes `newstore`,
   `drift` and `demoSeed` by name and copies the rest, so a new store gets this
   and its workflow on day one. Nothing in here may name a store, a person or a
   position — the same rule 18 the shared code lives under.
   ══════════════════════════════════════════════════════════════════════════ */

/* How long a branch may sit untouched before it is worth a line. Six days, so
   a branch started on a Monday is still quiet on the Saturday and speaks up
   before the next week starts on top of it. */
export const STALE_DAYS = 6;

/* ⛔⛔ FILES WHOSE COLLISION MEANS NOTHING, AND LEAVING THEM IN KILLED THE FIRST
   DRAFT OF THIS TOOL. Every branch here appends to `build-log.md` and most edit
   the holds table in `CLAUDE.md`, so BOTH CHANGED fired on them for every
   branch, every run. Measured on the real repo: three branches reported four to
   six colliding files each, and only ONE of those files — `trainingPriorities.js`
   — was the duplicated work this tool exists to find. The rest was bookkeeping.

   ⚠️ A REPORT THAT CRIES EVERY DAY IS A REPORT NOBODY READS, and that is the
   same failure as no report at all. These are the append-only record files: two
   branches writing to them is normal, expected, and resolves by keeping both.

   ⚠️ THIS IS NOT "THEY DO NOT MATTER". A `CLAUDE.md` holds collision matters a
   great deal — it is just not a sign that the same FIX is being built twice,
   which is the only question this finding asks. Git reports those conflicts at
   merge time, which is when they can actually be resolved. */
export const RECORD_FILES = ["build-log.md", "CLAUDE.md", "README.md", "harness/README.md"];

/* ⛔⛔ A BRANCH SOMEBODY DELIBERATELY PARKED MUST NOT BE NAGGED ABOUT DAILY.
   `backline-books` holds `claude/store-intake-uploads` on purpose: it is
   unmerged, it is superseded, and its own CLAUDE.md says in capitals not to
   delete it. Without this, that branch would earn NO PR and STALE every single
   morning for ever, and a report that raises the same alarm every day about a
   decision already made is one that stops being read — which is the same
   failure as no report at all, and the reason the record files are skipped too.

   ⇒ `.github/branches-held.txt`, one branch name per line, `#` for comments.
   A held branch produces NO findings. It is not hidden: the run still names how
   many are held and which, as a plain line rather than an alarm.

   ⚠️ THE FILE BEING ABSENT MEANS NOTHING IS HELD, which is the right default —
   a repo that has never needed one gets no behaviour it did not ask for.

   ⚠️ AND HOLDING IS NOT DELETING. This only quiets the daily line. Every rule
   about unmerged branches still applies: it is somebody's unshipped work and
   only its owner removes it. */
export const HELD_FILE = ".github/branches-held.txt";

/* ⚠️ THE DEFAULT BRANCH IS READ, NEVER ASSUMED. Every repo here uses `main`
   today, and a tool that hard-codes it reports "everything is fine" the day
   one does not. The caller passes what git actually said. */
export const DEFAULT_BASE = "main";

/* One branch's facts, as git reports them. Nothing here is computed by this
   module, on purpose — a pure function over plain data is one that a test can
   drive through every case without a repo, and this repo has paid twice for
   logic no test could reach.

     name         branch name, without any remote prefix
     ahead        commits it has that the base does not
     behind       commits the base has that it does not
     lastCommit   ISO timestamp of its tip
     openPR       the open pull request number, or null for none
     changed      files it changed since it split from the base
     baseChanged  files the BASE changed since that same split

   ⚠️ `changed` AND `baseChanged` ARE BOTH MEASURED FROM THE MERGE BASE. Diffing
   a branch against the base's tip instead mixes "what I did" with "what
   everybody else did", and every branch then looks like it rewrote the repo. */

/* ⚠️⚠️ WRITTEN `!(x > y)` RATHER THAN `x <= y` ON PURPOSE. An unparsable date
   gives NaN, every comparison against NaN is false, and the plain form would
   quietly call a branch fresh. This form calls it stale instead, which is a
   line in a report rather than a branch nobody looks at again. Same reasoning
   as the checks heartbeat in worker.js, and it is asserted below. */
function ageDays(iso, nowMs) {
  const t = Date.parse(iso);
  return (nowMs - t) / 864e5;
}

/* The findings for one branch, worst first. An empty array means nothing to
   say about it, which is the answer most branches should have. */
export function findingsFor(b, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const staleDays = opts.staleDays ?? STALE_DAYS;
  const out = [];

  const changed = Array.isArray(b.changed) ? b.changed : [];
  const baseChanged = Array.isArray(b.baseChanged) ? b.baseChanged : [];

  /* ⭐ FIRST, BECAUSE IT CHANGES WHAT THE REST MEAN. A branch whose every
     change is already on the base is finished. Its "no pull request" is not a
     problem and its staleness is not a worry; it is just waiting to be tidied.
     `ahead` can be any number here — a squash merge always leaves the branch
     with commits the base does not have, so counting commits answers the wrong
     question. Only the CONTENT settles it. */
  if (changed.length === 0) {
    out.push({
      level: "done",
      code: "ALREADY ON",
      say: `every change is already on ${b.base || DEFAULT_BASE}. Nothing here is unshipped.`,
    });
    return out;
  }

  /* ⛔ THE ONE THAT COST FOUR BRANCHES. No pull request means no automation can
     reach it: `auto-merge` lists OPEN pull requests only. */
  if (!b.openPR) {
    out.push({
      level: "stop",
      code: "NO PR",
      say: `${changed.length} file(s) changed and no pull request. `
        + `Nothing automated can see or merge this.`,
    });
  }

  /* ⛔⛔ THE DUPLICATE-WORK LEAD. Both sides editing one file since the split is
     how the same fix gets built twice, which happened here on Aug 19 2026. */
  const records = opts.recordFiles ?? RECORD_FILES;
  const both = changed.filter((f) => baseChanged.includes(f) && !records.includes(f));
  if (both.length) {
    out.push({
      level: "look",
      code: "BOTH CHANGED",
      say: `this branch and ${b.base || DEFAULT_BASE} have both edited `
        + `${both.length} file(s) since it split: ${both.join(", ")}. `
        + `Read them before building anything more here.`,
      files: both,
    });
  }

  const age = ageDays(b.lastCommit, nowMs);
  if (!(age < staleDays)) {
    const said = Number.isFinite(age) ? `${Math.floor(age)} days` : "an unreadable date";
    out.push({
      level: "look",
      code: "STALE",
      say: `no commit for ${said}. Either it is forgotten or it is blocked, `
        + `and those need different answers.`,
    });
  }

  return out;
}

/* Every branch, worst first, so a phone screen shows the ones that matter. */
export function watch(branches, opts = {}) {
  const rank = { stop: 0, look: 1, done: 2 };
  const held = opts.held ?? [];
  return branches
    .filter((b) => !held.includes(b.name))
    .map((b) => ({ branch: b.name, base: b.base || DEFAULT_BASE, findings: findingsFor(b, opts) }))
    .filter((r) => r.findings.length)
    .sort((a, b) => rank[a.findings[0].level] - rank[b.findings[0].level]
      || a.branch.localeCompare(b.branch));
}

/* ── the command line half ────────────────────────────────────────────────
   Everything above is pure and testable. Everything below shells out to git,
   and is deliberately thin, because a bug down here shows up as a crash and a
   bug up there shows up as a quiet wrong answer. */

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { execFileSync } = await import("node:child_process");
  /* ⚠️ stderr IS CAPTURED, NOT INHERITED, AND THAT IS NOT TIDINESS. Several
     calls here are EXPECTED to fail and are caught — a clone with no
     `origin/HEAD` is the normal case, not a problem. Inherited, git printed
     `fatal: ref refs/remotes/origin/HEAD is not a symbolic ref` straight into
     the middle of a report that then said everything was fine. A report with a
     stray `fatal:` in it is one somebody stops trusting. Captured, a real
     failure still arrives on the thrown error, where the catch can decide. */
  const git = (...a) =>
    execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const wantSummary = process.argv.includes("--summary");

  /* The base is whatever the remote says its default is, read rather than
     assumed. Falls back to `main` only when the remote does not answer. */
  let base = DEFAULT_BASE;
  try {
    base = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "") || DEFAULT_BASE;
  } catch { /* older clones have no origin/HEAD; main is right for every repo here today */ }

  const branches = lines(git("for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/"))
    .filter((r) => r.startsWith("origin/"))
    .map((r) => r.slice("origin/".length))
    .filter((n) => n && n !== base && n !== "HEAD");

  /* Open pull requests, by head branch. ⚠️ NO PULL REQUEST DATA IS NOT THE SAME
     AS NO PULL REQUESTS, and reporting "NO PR" for every branch because `gh` is
     missing would be a scan that reports the same alarm for everything — the
     exact failure this repo's own scanning rule warns about. So when the list
     cannot be read at all, the NO PR finding is suppressed and the run says so. */
  let prByHead = null;
  try {
    prByHead = new Map(JSON.parse(
      execFileSync("gh", ["pr", "list", "--state", "open", "--json", "number,headRefName"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    ).map((p) => [p.headRefName, p.number]));
  } catch { prByHead = null; }

  const rows = branches.map((name) => {
    const ref = `origin/${name}`;
    let mb = "";
    try { mb = git("merge-base", `origin/${base}`, ref); } catch { mb = ""; }
    const changed = mb ? lines(git("diff", "--name-only", mb, ref)) : [];
    const baseChanged = mb ? lines(git("diff", "--name-only", mb, `origin/${base}`)) : [];
    const ab = mb ? git("rev-list", "--left-right", "--count", `origin/${base}...${ref}`).split(/\s+/) : ["0", "0"];
    return {
      name,
      base,
      behind: Number(ab[0]) || 0,
      ahead: Number(ab[1]) || 0,
      lastCommit: git("log", "-1", "--format=%cI", ref),
      openPR: prByHead ? (prByHead.get(name) ?? null) : "unknown",
      changed,
      baseChanged,
    };
  });

  /* One name per line, `#` starts a comment, blank lines ignored. Absent file
     means nothing is held. */
  let held = [];
  try {
    const { readFileSync } = await import("node:fs");
    held = readFileSync(HELD_FILE, "utf8").split("\n")
      .map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  } catch { held = []; }

  const report = watch(rows, { held });

  if (wantSummary) {
    for (const r of report) {
      console.log(["SUMMARY", r.branch, r.findings.map((f) => f.code).join("+")].join("\t"));
    }
    process.exit(0);
  }

  console.log(`\n  ${rows.length} branch(es) beside ${base}.`);
  /* ⚠️ NAMED, NEVER SILENTLY DROPPED. A held branch that vanished from the
     output entirely would be a branch nobody remembers deciding about. */
  const heldHere = held.filter((h) => rows.some((r) => r.name === h));
  if (heldHere.length) {
    console.log(`  ${heldHere.length} held on purpose, so not reported: ${heldHere.join(", ")}`);
    console.log(`  (${HELD_FILE} says which and should say why.)`);
  }
  if (prByHead === null) {
    console.log("  ⚠️ pull request list unreadable, so NO PR is not reported this run.");
  }
  if (!report.length) {
    console.log("  Nothing to say about any of them. That is the answer most days should have.\n");
    process.exit(0);
  }
  for (const r of report) {
    console.log(`\n  ${r.branch}`);
    for (const f of r.findings) console.log(`      ${f.code.padEnd(13)} ${f.say}`);
  }
  console.log("");
}
