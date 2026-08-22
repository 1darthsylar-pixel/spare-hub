#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   storeTitleTier.test.mjs — DOES A STORE'S OWN LEADERSHIP TITLE ACTUALLY GET
   LEADERSHIP ACCESS?

   ⛔⛔ WHAT WAS WRONG, MEASURED Aug 19 2026. `App.jsx` read the RAW built-in
   rank map. `hrRankOfTitle` reads that map PLUS the titles a store has named
   for itself in `hr.extraTitles` — Kitchen Director, Talent Director,
   Hospitality Director at the Village. hrRoster.js added that fallback and said
   why in its own words: "every one of those scored 0 here, which is Limited."

   ⇒ THE FIX LANDED THERE AND NEVER REACHED App.jsx, so the two disagreed:

       Kitchen Director   hrRankOfTitle -> rank 5 -> tier 2, Leader
                          App.jsx       -> rank 0 -> tier 1, Team Member

   ⛔ A LEADER SIGNED IN AND GOT THE TEAM MEMBER HUB, while HR said they were a
   leader. Nothing errored, nothing showed in a diff, and it is the reported
   Village symptom: "until those titles are set they sign in and see almost
   nothing."

   ⚠️ THE POINT OF THIS FILE IS THAT ONE LOOKUP ANSWERS FOR EVERYBODY. It is not
   about a number. It fails if App.jsx ever reads the raw map again, in any of
   the five places it used to.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HR_RANK_BY_TITLE, hrRankOfTitle } from "./hrRoster.js";
import * as cfg from "./storeConfig.js";
import { sayNotGraded } from "./seedPresence.mjs";

/* ⚠️ THIS FILE TRAVELS, AND NOT EVERY STORE IS AT THE SAME VERSION. `spare-hub`
   is an older snapshot with no `extraTitleRanks` at all. The structural half of
   this test — App.jsx must never index the raw rank map — is right everywhere
   and runs everywhere. The half about a store's OWN titles cannot run where the
   feature does not exist, so it says NOT GRADED out loud rather than passing on
   an absence. That is the same rule `portcheck` and `namesTravel` state. */
const hasExtraTitles = typeof cfg.extraTitleRanks === "function"
  && typeof cfg.applyStoreOverrides === "function";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
const fails = [];
const ok = (what, cond, extra) => { if (cond) pass++; else fails.push(what + (extra ? `  — ${extra}` : "")); };

const APP = readFileSync(path.join(DIR, "App.jsx"), "utf8");
ok("App.jsx was read (control)", APP.length > 100000, String(APP.length));

/* ── 1. the raw map is gone from App.jsx ─────────────────────────────────── */
const raw = (APP.match(/HR_RANK\[/g) || []).length;
ok("★★★ App.jsx NEVER INDEXES THE RAW RANK MAP. That map is the built-in ladder only, so a store's own title scores 0 and its holder drops to Team Member.",
  raw === 0, `found ${raw}`);
/* ⚠️⚠️ IT MATCHES THE NAME INSIDE THE BRACES, NOT THE WHOLE IMPORT LIST. The
   first version pinned the exact string `import { hrRankOfTitle } from` and
   went red the day a SECOND name joined that import — `titleOrTier`, so the
   header could print a person's title instead of their access level — while
   the lookup this guards was imported perfectly. **A guard that pins a list
   accuses working code the first time anybody adds to it.** Same shape hit
   `holidayWiring.test.mjs` on an argument list the same morning. */
ok("★★ IT IMPORTS THE LOOKUP THAT KNOWS A STORE'S OWN TITLES",
  /^import\s*\{[^}]*\bhrRankOfTitle\b[^}]*\}\s*from\s*"\.\/hrRoster\.js"/m.test(APP));

const calls = (APP.match(/hrRankOfTitle\(/g) || []).length;
ok(`★★★ AND EVERY PLACE THAT USED TO READ THE MAP NOW CALLS IT — ${calls} call sites`,
  calls >= 5, String(calls));

/* ⚠️ CONTROL ON THAT SCAN. Matching nothing would pass the first assertion. */
ok("★★ THE SCAN CAN FIND THINGS IN THIS FILE (control)", /const roleTier = \(role\) =>/.test(APP));

/* ── 2. the two lookups agree, with a store's titles configured ──────────── */
const tier = (r) => (r >= 6 ? 3 : r >= 3 ? 2 : 1);

if (!hasExtraTitles) {
  sayNotGraded("a store's own leadership titles",
    "this store's storeConfig.js has no extraTitleRanks, so there is no store-named title to grade. The structural half above still ran.");
} else {
  cfg.applyStoreOverrides({ hr: { extraTitles: { "Kitchen Director": 5, "Talent Director": 5 } } });
  ok("★ the store's own titles are configured for this test (control)",
    Object.keys(cfg.extraTitleRanks()).length === 2, JSON.stringify(cfg.extraTitleRanks()));

  /* ⛔ THE ASSERTION THIS FILE EXISTS FOR. */
  ok("★★★ A STORE'S OWN DIRECTOR TITLE IS A LEADER, NOT A TEAM MEMBER",
    tier(hrRankOfTitle("Kitchen Director")) === 2, `tier ${tier(hrRankOfTitle("Kitchen Director"))}`);
  ok("★★★ AND THE RAW MAP STILL GETS IT WRONG, which is why App.jsx must not use it (control on the bug itself)",
    tier(HR_RANK_BY_TITLE["Kitchen Director"] || 0) === 1);

  /* ⚠️ THE STORE MAY ADD A NAME, NEVER REDEFINE ONE. hrRoster.js states this as
     the safety on the whole feature: if a store's list could override the
     built-in map, typing "Team Member: 5" into a settings screen would hand
     every team member every personnel file. */
  cfg.applyStoreOverrides({ hr: { extraTitles: { "Team Member": 8 } } });
  ok("★★★ A STORE CANNOT PROMOTE A BUILT-IN TITLE BY NAMING IT — Team Member stays tier 1",
    tier(hrRankOfTitle("Team Member")) === 1, `tier ${tier(hrRankOfTitle("Team Member"))}`);
}

/* ── 3. it widens nothing ────────────────────────────────────────────────── */
ok("★★★ A TITLE NOBODY HAS DEFINED IS STILL TIER 1. Adding a lookup must not turn a typo into access.",
  tier(hrRankOfTitle("Chief Vibes Officer")) === 1);
ok("★★★ AN EMPTY TITLE IS STILL TIER 1", tier(hrRankOfTitle("")) === 1);
ok("★★ AND THE BUILT-IN LADDER IS UNCHANGED, top to bottom",
  tier(hrRankOfTitle("Owner")) === 3
  && tier(hrRankOfTitle("Executive Director")) === 3
  && tier(hrRankOfTitle("Director")) === 2
  && tier(hrRankOfTitle("Team Member")) === 1);

/* ⛔ THE SUMMARY GOES LAST. Anything below it runs, passes, and can never fail
   the build. Four files in this repo have already been caught doing that. */
if (fails.length) {
  console.log(`storeTitleTier: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`storeTitleTier: ${pass} passed`);
