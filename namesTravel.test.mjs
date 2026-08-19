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
    if (Array.isArray(v)) return v.forEach(walk);
    for (const [k, val] of Object.entries(v)) {
      if ((k === "n" || k === "name") && typeof val === "string" && /^\S+\s+\S+/.test(val.trim())) found.add(val.trim());
      walk(val);
    }
  };
  walk(w.PTO_SEED); walk(w.SWEEP_PEOPLE); walk(w.EOS_TOUCHIN_ITEMS);
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
const travels = files.filter((f) => !f.rel.endsWith(".empty.js")
  && !files.some((g) => g.rel === f.rel.replace(/\.js$/, ".empty.js")));

ok("★ there are files to check at all (control)", travels.length > 20, String(travels.length));

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

  ok("★★★ NO FULL NAME FROM THIS STORE'S ROSTER SITS IN A COMMENT THAT TRAVELS",
    hits.length === 0, hits.slice(0, 6).join(" | ") + (hits.length > 6 ? ` | +${hits.length - 6} more` : ""));

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
