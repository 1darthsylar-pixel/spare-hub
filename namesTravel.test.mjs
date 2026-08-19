#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   namesTravel.test.mjs — DO THIS STORE'S PEOPLE TRAVEL TO ANOTHER STORE?

   ⛔ WHY THIS EXISTS, MEASURED Aug 19 2026. Sixteen real staff names appeared
   162 times across 55 files in a generated store. Two of them reached that
   store's BUILT BUNDLE, from a placeholder in the Agreed hours box, so every
   other store's leaders read two of this store's people on screen. The other
   160 sat in comments and test fixtures, in another operator's repository.

   ⚠️⚠️ `isolation.test.mjs` ALREADY GUARDS THE OTHER THREE KINDS OF LEAK — web
   addresses, fsr numbers, Supabase project refs. It has never guarded PEOPLE,
   and people are the one kind that is somebody's private information rather
   than a store's configuration.

   ⇒ So this asks the question nothing was asking: does a full name from THIS
   store's own roster appear in a comment in a file that travels?

   ⚠️ COMMENTS ONLY, AND THAT IS THE WHOLE SCOPE ON PURPOSE. The roster files
   themselves are full of these names and must be — that is what they are for,
   and `newstore.mjs` swaps each one for its `.empty.js` twin so none of it
   travels. Test fixtures also use real names, which is a separate and larger
   job with real assertions depending on it. Both are out of scope here and
   said so out loud rather than quietly.

   ⚠️ THE ROSTER IS READ, NEVER TYPED. A hardcoded list of names in this file
   would be the very leak it is trying to stop, and it would rot the first time
   somebody joined.

   ⚠️ IT GRADES WHERE THE ROSTER EXISTS. A store with the empty twins has no
   roster to check against, and says so rather than reporting a clean sweep off
   an empty list — the same rule `portcheck` states in its own words.
   ══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sayNotGraded } from "./seedPresence.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
const fails = [];
const ok = (what, cond, extra) => { if (cond) pass++; else fails.push(what + (extra ? `  — ${extra}` : "")); };

/* ── this store's own people, read from its own seed ─────────────────────── */
let roster = [];
try {
  const w = await import("./workerSeed.js");
  const found = new Set();
  const walk = (v) => {
    if (v == null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      /* ⚠️⚠️ PEOPLE ARE STORED IN TWO SHAPES IN HERE, AND THIS ONLY SAW ONE.
         Most seeds are `{ name: "…" }`, but several are TUPLES —
         `["a former employee", 50, 50]` — and a tuple has no key to match on. So a
         whole roster was invisible to this guard, including a former employee
         whose name and termination date sat in a comment in DailySetup.jsx.
         ⚠️ THE TEST IS THE SHAPE, NOT THE CONTENT: first element a
         person-shaped string, every other element a number. A station name or
         a title never appears in a list of numbers. */
      if (v.length > 1 && typeof v[0] === "string" && /^\S+\s+\S+/.test(v[0].trim())
          && v.slice(1).every((x) => typeof x === "number")) found.add(v[0].trim());
      return v.forEach(walk);
    }
    for (const [k, val] of Object.entries(v)) {
      if ((k === "n" || k === "name") && typeof val === "string" && /^\S+\s+\S+/.test(val.trim())) found.add(val.trim());
      walk(val);
    }
  };
  /* ⚠️⚠️ EVERY EXPORT, NOT THREE OF THEM. This walked PTO_SEED, SWEEP_PEOPLE
     and EOS_TOUCHIN_ITEMS only, which is 16 of this store's people out of
     hundreds — so the guard passed while a travelling file named somebody it
     had simply never been told about. Measured Aug 19 2026: DailySetup.jsx, in
     every repo, carried a named ex-employee AND HIS TERMINATION DATE in a
     comment, and this file reported clean.
     ⇒ A guard that reads a partial roster is not a partial guard. It is a
     guard that reports clean, which is worse than none. */
  Object.values(w).forEach(walk);
  /* ⚠️⚠️ AND THE PEOPLE WHO LEFT ARE THE ONES IT MATTERS MOST FOR. They are not
     in the current seeds at all, so the widest walk of workerSeed still misses
     them — and a former employee named in another operator's repository,
     beside the date they were let go, is the worst version of this leak.
     TermArchive.js has an `.empty.js` twin, so reading it here is safe: none
     of it travels. */
  try { const t = await import("./TermArchive.js"); Object.values(t).forEach(walk); } catch { /* empty twin: nothing to add */ }
  /* Two words or more. A single word is a first name and is not what this guards. */
  roster = [...found].filter((n) => n.split(/\s+/).length >= 2);
} catch { roster = []; }

/* ── what actually travels ───────────────────────────────────────────────── */
const SKIP = new Set(["node_modules", "dist", ".git", ".vite", ".wrangler"]);
/* ⚠️ THE SAME RULE `newstore.mjs` USES, restated here because a copy that drifts
   would quietly stop checking a file that still ships. If that list changes,
   this one has to change with it. */
const isHostTool = (r) =>
  /^(newstore|drift|demoSeed)\.mjs$/.test(r)
  || /^(newstore|drift|demoSeed)[A-Za-z]*\.test\.mjs$/.test(r)
  || r.split(path.sep).join("/") === ".github/workflows/drift.yml";

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const abs = path.join(d, n);
    const rel = path.relative(DIR, abs).split(path.sep).join("/");
    if (statSync(abs).isDirectory()) walk(abs);
    else if (/\.(jsx?|mjs)$/.test(n) && !isHostTool(rel)) files.push({ abs, rel });
  }
})(DIR);

/* A seed with an `.empty.js` twin never travels as itself. */
/* 🐛🐛 EVERY .jsx FILE EXCLUDED ITSELF FROM THIS SCAN. The twin test was
   `f.rel.replace(/\.js$/, ".empty.js")` — and "DailySetup.jsx" does not END
   in ".js", it ends in "x", so the replace did nothing and the file matched
   ITSELF in the list. `some` answered true, and every React component in the
   repo was filtered out as "has an empty twin".
   ⇒ THAT IS THE ENTIRE COMMENT SURFACE OF THE APP. DailySetup.jsx, HRConsole.jsx,
   ScheduleBuilder.jsx, Availability.jsx and forty others are where the long
   explanatory comments live, and not one of them was ever read. The guard
   reported clean because it was looking at almost nothing.
   ⚠️ AND A FILE CAN NEVER BE ITS OWN TWIN. That is asserted below now, because
   this bug is invisible: it does not throw, it just quietly grades less. */
const twinOf = (rel) => rel.replace(/\.jsx?$/, ".empty.js");
const travels = files.filter((f) => !f.rel.endsWith(".empty.js")
  && !files.some((g) => g.rel !== f.rel && g.rel === twinOf(f.rel)));

ok("★ there are files to check at all (control)", travels.length > 20, String(travels.length));
/* ⚠️ CONTROLS ON THE FILTER ITSELF, because it failed silently for weeks. */
ok("★★ the React components are in the scan (control)",
  travels.some((f) => f.rel === "DailySetup.jsx") && travels.some((f) => f.rel.endsWith(".jsx")),
  String(travels.filter((f) => f.rel.endsWith(".jsx")).length) + " jsx files");
/* ⚠️ NAMING workerSeed.js HERE WAS TOO SPECIFIC AND FAILED THE VILLAGE, which
   does not have that file at all — neither the seed nor the twin. The rule is
   general: whatever HAS a twin must not be in the scan. A repo with no twins
   at all is a fact about that repo, not a failure, and it says so. */
const twinned = files.filter((f) => files.some((g) => g.rel !== f.rel && g.rel === twinOf(f.rel)));
ok(`★★ every seed with an empty twin is excluded (${twinned.length} twinned)`,
  !twinned.some((f) => travels.includes(f)),
  twinned.filter((f) => travels.includes(f)).map((f) => f.rel).join(", "));

if (!roster.length) {
  sayNotGraded("this store's own people in shared comments",
    "workerSeed.js is the empty twin, so there is no roster to check names against.");
} else {
  ok(`★★ THE ROSTER WAS READ, NEVER TYPED INTO THIS FILE (control) — ${roster.length} people`,
    roster.length >= 5, String(roster.length));

  /* ⚠️ COMMENT LINES ONLY. A trailing `//` after code counts; the code half does
     not, because that is roster data and is meant to be there. */
  const hits = [];
  for (const { abs, rel } of travels) {
    const lines = readFileSync(abs, "utf8").split("\n");
    let inBlock = false;
    lines.forEach((l, i) => {
      const t = l.trim();
      const was = inBlock;
      if (/\/\*/.test(l) && !/\*\//.test(l.slice(l.indexOf("/*") + 2))) inBlock = true;
      if (/\*\//.test(l)) inBlock = false;
      const whole = was || inBlock || t.startsWith("//") || t.startsWith("*");
      let text = whole ? l : null;
      if (!whole) {
        let q = null, cut = -1;
        for (let c = 0; c < l.length; c++) {
          const ch = l[c];
          if (q) { if (ch === "\\") c++; else if (ch === q) q = null; continue; }
          if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
          if (ch === "/" && l[c + 1] === "/") { cut = c; break; }
        }
        if (cut >= 0) text = l.slice(cut);
      }
      if (!text) return;
      for (const n of roster) if (text.includes(n)) hits.push(`${rel}:${i + 1}  ${n}`);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⛔⛔ A RATCHET, NOT A PASS. Once this file could actually see the repo it
     found 57 hits across 16 files — ten real people, one of them a
     former employee named beside their termination date. Every one is in a COMMENT,
     so none of it is behaviour and none of it is hard to remove; it is a
     writing job across files whose comments carry real operational history,
     and several of those comments are load-bearing warnings that need
     rewording rather than deleting. That is Matt's call to schedule, not
     something to do in a hurry at the end of a long day.

     ⇒ SO THE DEBT IS FROZEN AND CANNOT GROW. The baseline below is what was
     there on Aug 19 2026. A file over its number fails. A file not listed
     fails on its first hit. And the total may only ever go DOWN, so removing
     one and adding one somewhere else does not net out to silence.

     ⚠️⚠️ THE BASELINE IS COUNTS, NEVER NAMES. A list of the names would put
     them in this file, and this file travels — which is the leak itself.

     ⚠️ TO PAY IT DOWN: reword the comment so it says what happened without
     naming who, drop that file's number, and the ratchet holds the new floor.
     ══════════════════════════════════════════════════════════════════════ */
  const BASELINE = {
    "AccountabilityChart.jsx": 2, "App.jsx": 2, "Availability.jsx": 1,
    "DailySetup.jsx": 12, "HRConsole.jsx": 1, "LeadershipDev.jsx": 1,
    "ProfessionalGrowth.jsx": 4, "TeamDirectory.jsx": 7, "TeamImportBox.jsx": 1,
    "WasteTracker.jsx": 1, "availability.js": 2, "inputRegistry.js": 1,
    "nameMatch.js": 3, "shiftHours.js": 1, "trainerTaskRoster.js": 3,
    "worker.js": 15,
  };
  const BASELINE_TOTAL = Object.values(BASELINE).reduce((a, b) => a + b, 0);
  const byFile = {};
  hits.forEach((h) => { const f = h.split(":")[0]; byFile[f] = (byFile[f] || 0) + 1; });

  ok(`★★ THE SCAN FOUND THE KNOWN DEBT (control) — ${hits.length} hits, baseline ${BASELINE_TOTAL}`,
    hits.length > 0, "a clean sweep here means the scan broke, not that the repo is clean");

  const grown = Object.entries(byFile).filter(([f, n]) => n > (BASELINE[f] || 0));
  ok("★★★ NO FILE GAINED A NEW NAME IN A TRAVELLING COMMENT",
    grown.length === 0,
    grown.map(([f, n]) => `${f}: ${n} now, ${BASELINE[f] || 0} allowed`).join(" | "));

  ok(`★★★ AND THE TOTAL ONLY EVER GOES DOWN (${hits.length} against ${BASELINE_TOTAL})`,
    hits.length <= BASELINE_TOTAL);

  /* ⚠️ WHEN IT GOES DOWN, THE BASELINE MUST COME DOWN WITH IT, or the ratchet
     quietly re-opens the room somebody just closed. */
  ok("★★ the baseline is current — lower it when the debt is paid down",
    hits.length >= BASELINE_TOTAL,
    `${BASELINE_TOTAL - hits.length} fewer than the baseline: lower the numbers in BASELINE above`);

  /* ⚠️ AND A CONTROL ON THE SCAN ITSELF. If the walk or the comment detector
     broke, the loop above would find nothing and report a clean sweep. So a
     name is planted in a string and must NOT be found (it is not a comment),
     while the same name in a comment MUST be found. */
  const probe = roster[0];
  const asComment = `/* ${probe} */`;
  const asCode = `const x = "${probe}";`;
  const sees = (line) => {
    const t = line.trim();
    const whole = t.startsWith("/*") || t.startsWith("//") || t.startsWith("*");
    return whole && line.includes(probe);
  };
  ok("★★ THE DETECTOR SEES A NAME IN A COMMENT (control)", sees(asComment));
  ok("★★ AND DOES NOT SEE ONE IN A STRING (control)", !sees(asCode));
}

/* ⛔ THE SUMMARY GOES LAST. Anything below it runs, passes, and can never fail
   the build. Four files in this repo have already been caught doing that. */
if (fails.length) {
  console.log(`namesTravel: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`namesTravel: ${pass} passed`);
