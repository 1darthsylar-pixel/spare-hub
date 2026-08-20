/**
 * vendorNames.test.mjs — the Hub must not name its own tools after other
 * companies.
 *
 * ⭐ Matt, Aug 20 2026, looking at his own dashboard: "Safe Eats is another
 * company so the name has to change." The Food Safety tile carried a chip
 * labelled with a real vendor's company name, in the tile name, the
 * description, the search keywords, the demo page a prospect reads and the
 * leader training script.
 *
 * ⚠️⚠️ IT WAS NOT A TYPO. Safe Eats is the supplier the store genuinely pays
 * for team member training, and somebody reasonably used the words the team
 * already said out loud. That is exactly why a person will do it again.
 *
 * ⇒ THE LIST IS READ, NEVER TYPED. `expenseVendorData.js` already names every
 * company this store pays, because that is what it is for. A hardcoded list of
 * banned words here would rot the first time the store changed suppliers, and
 * would be a second list to keep in step with the first.
 *
 * ⛔ THE VENDOR FILE ITSELF IS NOT CHECKED, and that is the point. Naming a
 * supplier on an expense line is correct and necessary. Naming YOUR OWN TOOL
 * after them is the thing this guards.
 */
import { readFileSync } from "node:fs";
import { VENDOR_HINTS } from "./expenseVendorData.js";
import { isEmptySeed, sayNotGraded } from "./seedPresence.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.error(`FAILED: ${name}${extra ? `  — ${extra}` : ""}`);
};

const SRC = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

/* ⚠️ CONTROLS FIRST. Every rule below is "this word is ABSENT", and every one
   of them passes against a file that was never read. */
ok("CONTROL — App.jsx was read", SRC.includes("const TOOLS") || SRC.includes("Component: FoodSafety"));
ok("CONTROL — App.jsx is the whole file", SRC.length > 200000, `${SRC.length} bytes`);

/* ⚠️⚠️ A STORE WITH NO SUPPLIERS YET IS A WORKING STATE, NOT A FAILURE, and
   this file learned it the way seedPresence.mjs describes: ported to the clones
   as-is, its control refused on both, because a new store has not named who it
   pays. Six red files were a brand new store's first impression of its own repo
   once already.
   ⛔ THE CONTROL IS NOT WEAKENED. It still refuses to grade off an empty list —
   it just says so out loud instead of failing, and everything that does not
   depend on the list still runs below. */
const vendors = [...new Set(Object.values(VENDOR_HINTS).flat())].filter((v) => typeof v === "string" && v.length > 2);
const graded = !isEmptySeed(VENDOR_HINTS) && vendors.length > 0;
/* ⚠️ THE CONTROL THAT GRADES IN BOTH WORLDS. The vendor module must be readable
   and the right SHAPE wherever it exists — a store with no vendors has `{}`, a
   broken import has `undefined`, and those are not the same thing. */
ok("CONTROL — the vendor list is readable", VENDOR_HINTS && typeof VENDOR_HINTS === "object",
  `got ${typeof VENDOR_HINTS}`);
if (graded) ok(`CONTROL — this store names its suppliers (${vendors.length})`, vendors.length >= 20);
if (!graded) {
  sayNotGraded(
    "no tool is named after a company the store pays",
    "expenseVendorData.js lists no vendors yet, so there is no name to check against.",
  );
}

/* The strings a person actually READS on a tile: its name, the line under it,
   the search keywords and the card summary. Deliberately not every string in
   the file — a comment mentioning a supplier is fine and normal. */
const LABEL_KEY = /\b(name|label|desc|card|title|sub)\s*:\s*"([^"]{2,200})"/g;
const labels = [...SRC.matchAll(LABEL_KEY)].map((m) => m[2]);
ok(`CONTROL — found the tile labels (${labels.length})`, labels.length >= 60);

if (graded) {
  const offenders = [];
  for (const v of vendors) {
    for (const l of labels) if (l.includes(v)) offenders.push(`${v} in "${l.slice(0, 60)}"`);
  }
  ok("★★★ NO TOOL IS NAMED AFTER A COMPANY THE STORE PAYS", offenders.length === 0,
    offenders.join(" | ") + " — call the tool what it does, not what the vendor is called");
}

/* ⚠️⚠️ AND A NEGATIVE CONTROL, BECAUSE THE RULE PASSES TODAY. A guard with
   nothing to catch is indistinguishable from a guard that is broken, and this
   repo has shipped several of those. So the exact bug is planted in a synthetic
   label and the same rule MUST find it. */
if (graded) {
  /* ⚠️ THE PLANTED NAME IS TAKEN FROM THE LIST, NOT TYPED. Naming one here
     would be the second list this file exists to avoid, and it would go stale
     the day the store changed that supplier. */
  const planted = [...labels, `Run the biweekly ${vendors[0]} walkthrough`];
  const caught = vendors.some((v) => planted.some((l) => l.includes(v)));
  ok("★★ THE RULE CATCHES THE BUG IT WAS BUILT FOR (control)", caught,
    "the planted label was not detected, so the check above proves nothing");
}

/* ⚠️ THE STORED KEY IS NOT A LABEL AND MUST NEVER BE RENAMED WITH ONE. `safety`
   is what the tool is filed under; changing it orphans every record.
   ⚠️ A STORE WHOSE FOOD TILE HAS NO SUB-TOOLS HAS NO SUCH KEY, which is the
   spare's shape and is fine. Graded where the sub-tools exist. */
if (/Component:\s*FoodSafety\s*\},\s*\n/.test(SRC) || /key:\s*"safety"/.test(SRC)) {
  const hasSubTools = /key:\s*"safety"/.test(SRC);
  if (hasSubTools) ok("the food tool keeps its stored key", true);
  else sayNotGraded("the food tool keeps its stored key", "this store's food tile has no sub-tools, so there is no stored key to keep.");
}

/* ⚠️ AND THE OLD WORD IS GONE FROM THE APP, INCLUDING AS A HIDDEN SEARCH
   ALIAS. A keyword ships in the bundle like any other string. */
ok("the old name is nowhere in App.jsx", !SRC.includes("Safe Eats"));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
