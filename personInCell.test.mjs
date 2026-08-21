#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   personInCell.test.mjs — A COMMENT PROMISING SAMENESS IS NOT SAMENESS.

   ⛔ WHAT WAS FOUND, Aug 20 2026. `laborDaypartPush.js` carried its own copy of
   the board's name-out-of-a-cell rule under a comment reading "THE SAME
   NAME-OUT-OF-A-CELL RULE THE BOARD USES". Measured: SIX of thirteen real cells
   answered differently, and every difference was the copy being too generous.

       cell             the board      the copy
       "6am"            ""             "6am"           ← a time, DM'd as a person
       "Split Duties"   ""             "Split Duties"  ← a marker, DM'd
       "x"              ""             "x"

   The board's rule carries a dated fix the copy never got — a cell STARTING
   WITH A DIGIT is a time or a count, never a person — and its own comment
   records that "6am" once became a team member called "am", found by a test
   rather than by reading. Which is precisely what a promise kept true by memory
   costs the second time.

   ⇒ There is one rule now, imported. This file makes that structural rather
   than a claim: it runs BOTH exports against the same cells and requires them
   to agree, so a future private copy fails here on the day it is written.

   ⚠️ ONE DELIBERATE DIFFERENCE, AND IT IS ASSERTED RATHER THAN TOLERATED. The
   DM path splits on a comma first. A seat cell reading "Ana, Ben" is two people
   sharing one leadership seat: the board's rule answers "" and would DM
   NEITHER, while the first part reaches one of them. Fewer people told is the
   worse direction for a DM. The split runs FIRST, so the board's rule still
   grades what comes out of it and "6am, Ben" is still nobody.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { personInCell as boardRule } from "./boardHistory.js";
import { personInCell as dmRule } from "./laborDaypartPush.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
const fails = [];
const ok = (what, cond, extra) => { if (cond) pass++; else fails.push(what + (extra ? `  — ${extra}` : "")); };

/* ── 1. the cells that cost something ──────────────────────────────────── */

/* ⛔ THE THREE THE COPY GOT WRONG. Each of these was a real cell that would
   have been handed to a roster matcher as a person's name. */
const NEVER_A_PERSON = ["6am", "11a", "Split Duties", "x", "✔️", "(Line!!)", "12", "", "   ", "3 people"];
for (const c of NEVER_A_PERSON) {
  ok(`★★ ${JSON.stringify(c)} is nobody, on the board`, boardRule(c) === "", JSON.stringify(boardRule(c)));
  ok(`★★★ ${JSON.stringify(c)} is nobody, in a DM`, dmRule(c) === "", JSON.stringify(dmRule(c)));
}

/* ⚠️ AND THE CONTROL THAT MAKES THOSE MEAN ANYTHING. If both rules returned ""
   for everything, every assertion above would pass and the pair would be
   useless. Real cells must still yield real names. */
const REAL = [["✔️ Thanh", "Thanh"], ["Monica @11:15", "Monica"], ["Ana", "Ana"]];
for (const [c, want] of REAL) {
  ok(`★★ CONTROL — ${JSON.stringify(c)} still reads as ${want}, on the board`, boardRule(c) === want, JSON.stringify(boardRule(c)));
  ok(`★★ CONTROL — ${JSON.stringify(c)} still reads as ${want}, in a DM`, dmRule(c) === want, JSON.stringify(dmRule(c)));
}

/* ── 2. they agree everywhere except the one documented place ──────────── */

const CELLS = [
  "6am", "11a", "✔️ Thanh", "Monica @11:15", "Split Duties", "x", "(Line!!)",
  "✔️", "", "   ", "12", "3 people", "Chris(2)", "Ana", "Thanh @5", "6am, Ben",
];
const differ = CELLS.filter((c) => boardRule(c) !== dmRule(c));
ok(`★★ CONTROL — enough cells to be worth comparing (${CELLS.length})`, CELLS.length >= 14);
ok("★★★ THE TWO RULES AGREE ON EVERY CELL WITHOUT A COMMA",
  differ.length === 0,
  differ.map((c) => `${JSON.stringify(c)}: board=${JSON.stringify(boardRule(c))} dm=${JSON.stringify(dmRule(c))}`).join(" | "));

/* The one deliberate difference, asserted in both directions. */
ok("★★★ a shared seat cell reaches one person in a DM", dmRule("Ana, Ben") === "Ana");
ok("★★ and the board still reads it whole", boardRule("Ana, Ben") === "Ana, Ben");
/* ⚠️ THE SPLIT RUNS FIRST, NOT INSTEAD. A time in front of a comma is still
   nobody, or the split would have re-opened the exact bug it sits beside. */
ok("★★★ the comma split does not re-open the digit bug", dmRule("6am, Ben") === "");

/* ── 3. no second copy may quietly appear ──────────────────────────────── */

const LD = readFileSync(path.join(DIR, "laborDaypartPush.js"), "utf8");
const BH = readFileSync(path.join(DIR, "boardHistory.js"), "utf8");

ok("★ laborDaypartPush.js was read (control)", LD.includes("export function personInCell"));
ok("★ boardHistory.js was read (control)", BH.includes("export function personInCell"));

ok("★★★ the DM path IMPORTS the board's rule rather than restating it",
  /import\s*\{[^}]*\bpersonInCell as boardPersonInCell\b[^}]*\}\s*from\s*"\.\/boardHistory\.js"/.test(LD));

/* ⚠️ THE SHAPE OF THE OLD BUG, NAMED. A private re-implementation would bring
   these back, and each of them is how a time became a person. */
ok("★★ the DM path no longer strips symbols itself",
  !/replace\(\/\[✔✅️\]\/g/.test(LD), "that strip is what ate the digit and left a name behind");
ok("★★ and no longer splits on @ or ( to find a name",
  !/split\(\/\[@\(,\]\//.test(LD));

/* ⛔ ONE DEFINITION. The board owns the rule; the DM path owns only the comma. */
/* ⚠️ THIS ASSERTION WAS UNREADABLE AND PROBABLY VACUOUS IN ITS FIRST FORM — a
   regex built from `.source` with a ternary, which is exactly the shape of a
   check that passes because nobody can tell what it asks. Two plain questions
   instead. */
ok("★★★ the board holds exactly one definition of the rule",
  (BH.match(/export function personInCell\b/g) || []).length === 1,
  String((BH.match(/export function personInCell\b/g) || []).length));

/* The DM path's export must be a one-line delegation, not a rebuild. Counting
   lines in its body is the plainest way to ask that: the real rule is eight
   lines, a delegation is one. */
{
  const i = LD.indexOf("export function personInCell(cell) {");
  ok("★★ CONTROL — found the DM path's export", i > 0);
  const body = LD.slice(i, LD.indexOf("\n}", i));
  const lines = body.split("\n").filter((l) => l.trim() && !l.trim().startsWith("/*") && !l.trim().startsWith("*")).length;
  ok("★★★ the DM path delegates rather than rebuilding the rule",
    lines <= 2 && body.includes("boardPersonInCell("),
    `${lines} lines of body`);
}

/* ⛔ THE SUMMARY GOES LAST. Anything below it runs, passes, and can never fail
   the build. */
if (fails.length) {
  console.log(`personInCell: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`personInCell: ${pass} passed`);
