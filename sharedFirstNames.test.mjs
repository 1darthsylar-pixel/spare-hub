#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   sharedFirstNames.test.mjs — TWO RULES FOR ONE QUESTION, AND KEEPING THEM
   IS THE CORRECT ANSWER.

   ⭐ FOUND BY A SWEEP, Aug 20 2026, which reported them as drift and
   recommended merging them into one. ⛔ THAT RECOMMENDATION WAS WRONG, and
   this file exists so nobody acts on it later.

   `boardOwner.sharedFirstNames` and the private copy in `boardSwap.js` really
   do disagree — measured, 3 of 7 real cases — and each is RIGHT for its own
   question, because the two questions have OPPOSITE SAFE DIRECTIONS.

     boardOwner  decides WHO GETS A NOTIFICATION.
                 Its own comment names the bug it exists to avoid: one person
                 reading as two and being refused their own cell. The failure
                 is SILENCE, so it must be permissive — a bare first name is
                 absorbed into its initialled form and they are told.

     boardSwap   decides WHETHER TO REWRITE A NAME IN A BOX ON A PRINTED BOARD.
                 Its own comment names the real Friday Aug 14 board carrying
                 two people sharing a first name. The failure is THE WRONG NAME
                 IN A BOX, so it must be strict — a bare first name on a day
                 with two matches NOBODY and the cell is left as typed.

   ⚠️⚠️ AND THE TWO CASES ARE INDISTINGUISHABLE FROM THE NAMES ALONE. This
   roster contains both at once:
       a first name + that first name with an INITIAL   — often ONE person
       a first name + that first name with a SURNAME   — often TWO people
   No rule reading only these strings can separate them, which is why one rule
   cannot serve both callers. Merging them would silence a real person's
   notifications, or print somebody else's name on a board. There is no third
   option available to a matcher.

   ⇒ SO THE GUARD IS THE RELATIONSHIP, NOT SAMENESS. `boardSwap` must never be
   MORE PERMISSIVE than `boardOwner`. Verified across every subset of twelve
   real name-forms up to size four: 793 of 793.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sharedFirstNames as ownerRule } from "./boardOwner.js";
import { nameParts, normName } from "./nameMatch.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
const fails = [];
const ok = (what, cond, extra) => { if (cond) pass++; else fails.push(what + (extra ? `  — ${extra}` : "")); };

const SWAP_SRC = readFileSync(path.join(DIR, "boardSwap.js"), "utf8");

/* ⚠️ CONTROLS FIRST. Everything below runs extracted source, and an extraction
   that silently matched nothing would make every comparison trivially agree. */
ok("★ boardSwap.js was read (control)", SWAP_SRC.length > 4000, String(SWAP_SRC.length));

const m = SWAP_SRC.match(/function sharedFirstNames\(people\)\s*\{[\s\S]*?\n\}/);
ok("★★ the private copy was found and extracted (control)", !!m);

let swapRule = null;
if (m) {
  try {
    swapRule = new Function("nameParts", "normName", `${m[0]}; return sharedFirstNames;`)(nameParts, normName);
  } catch (e) { ok(`extracting the private copy — ${e.message}`, false); }
}
ok("★★ it compiled and is callable (control)", typeof swapRule === "function");

if (swapRule) {
  const S = (fn, list) => [...fn(list)].sort();

  /* ── 1. they really are two different rules ──────────────────────────── */

  /* ⚠️ IF THIS EVER PASSES AS "THEY AGREE", SOMEBODY HAS MERGED THEM and the
     header above explains why that is a regression rather than a tidy-up. */
  ok("★★★ THE TWO RULES GENUINELY DIFFER — do not merge them",
    JSON.stringify(S(ownerRule, ["Riley", "Riley R"])) !== JSON.stringify(S(swapRule, ["Riley", "Riley R"])),
    "if they now agree, read this file's header before 'fixing' anything");

  /* ── 2. each is right for its own question ───────────────────────────── */

  /* One person written two ways. The notifier must reach her. */
  ok("★★★ the notifier treats one person written two ways as ONE",
    S(ownerRule, ["Riley", "Riley R"]).length === 0);
  /* The same input, on a board that gets printed. A bare cell is left alone. */
  ok("★★★ the board rewriter refuses the same case as ambiguous",
    S(swapRule, ["Riley", "Riley R"]).join() === "riley");

  /* Two genuinely different people. BOTH must call it ambiguous. */
  ok("★★ two real people are ambiguous to the notifier", S(ownerRule, ["Riley R", "Riley V"]).join() === "riley");
  ok("★★ two real people are ambiguous to the rewriter", S(swapRule, ["Riley R", "Riley V"]).join() === "riley");

  /* ⚠️ THE CASE THAT PROVES NEITHER RULE CAN SERVE BOTH CALLERS. These two are
     different people on this roster, and they are the same SHAPE as the pair
     above, which is one person. No matcher reading only these strings
     can tell them apart. */
  ok("★★★ the notifier reads two real people as one here — the unavoidable cost",
    S(ownerRule, ["Sasha", "Sasha Whitfield"]).length === 0);
  ok("★★★ and the rewriter refuses them — the opposite, also correct",
    S(swapRule, ["Sasha", "Sasha Whitfield"]).join() === "sasha");

  /* ── 3. the relationship, which is the actual guard ──────────────────── */

  const FORMS = [
    "Riley", "Riley R", "Riley V", "Devon", "Devon G", "Devon L",
    "Marlow", "Marlow G", "Sasha", "Sasha Whitfield", "Toni", "Tonia",
  ];
  const combos = (arr, k) => (k === 0 ? [[]] : arr.flatMap((v, i) => combos(arr.slice(i + 1), k - 1).map((c) => [v, ...c])));

  let tested = 0;
  const violations = [];
  for (const k of [1, 2, 3, 4]) {
    for (const c of combos(FORMS, k)) {
      tested++;
      const a = new Set(ownerRule(c));
      const b = new Set(swapRule(c));
      if (![...a].every((x) => b.has(x))) violations.push(JSON.stringify(c));
    }
  }

  /* ⚠️ A FLOOR, NOT "> 0". A generator that produced two combinations would
     make the assertion below pass while proving nothing. */
  ok(`★★ CONTROL — the sweep really ran (${tested} combinations)`, tested >= 700, String(tested));

  ok("★★★ THE BOARD REWRITER IS NEVER MORE PERMISSIVE THAN THE NOTIFIER",
    violations.length === 0,
    violations.length ? `${violations.length} case(s), first: ${violations.slice(0, 3).join(" | ")}` : "");

  /* ⚠️ AND IT IS GENUINELY STRICTER SOMEWHERE, or the assertion above is
     satisfied by two identical rules and grades nothing. */
  const stricterAt = combos(FORMS, 2).filter((c) => swapRule(c).size > ownerRule(c).size);
  ok("★★ CONTROL — and it is strictly stricter on real cases",
    stricterAt.length > 0, `${stricterAt.length} pairs where the rewriter refuses and the notifier does not`);

  /* ── 4. neither file may quietly grow a third copy ───────────────────── */
  const OWNER_SRC = readFileSync(path.join(DIR, "boardOwner.js"), "utf8");
  ok("★ boardOwner.js was read (control)", OWNER_SRC.includes("export function sharedFirstNames"));
  ok("★★ boardSwap does not import the notifier's rule by accident",
    !/import\s*\{[^}]*\bsharedFirstNames\b[^}]*\}\s*from\s*"\.\/boardOwner\.js"/.test(SWAP_SRC),
    "importing it would silently make the board rewriter permissive");
  ok("★★ exactly one definition in each file",
    (OWNER_SRC.match(/function sharedFirstNames\b/g) || []).length === 1
    && (SWAP_SRC.match(/function sharedFirstNames\b/g) || []).length === 1);
}

/* ⛔ THE SUMMARY GOES LAST. Anything below it runs, passes, and can never fail
   the build. */
if (fails.length) {
  console.log(`sharedFirstNames: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`sharedFirstNames: ${pass} passed`);
