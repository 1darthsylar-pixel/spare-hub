/* ============================================================================
   cashCount.test.mjs — RUNS the money rules, never greps them.

       node cashCount.test.mjs

   ⛔⛔ WHY. Matt, Aug 21 2026: "we need a gaurd to prevent this from
   happening." A Cash Audit entry had been saved reading

       every denomination $0.00 · Tills $1000.00 · Counted $1000.00
       Expected $3290.00 · Over / Short −$2290.00

   Nobody counted the safe. `emptyAudit` ships tills prefilled at "1000" and
   every denomination blank, so opening the form and pressing Save files a
   $2,290 shortage into the month's net over/short, into the flagged list, and
   onto the EOS scorecard.

   ⚠️ THE NUMBERS BELOW ARE HIS, THE PEOPLE ARE NOT. His ledger names the
   leaders on every row and this file travels to three other stores, so the
   fixtures carry the figures and nothing else. namesTravel.test.mjs is what
   catches the other way round.
   ============================================================================ */
import { DENOMS, FLAG_AT, countedTotal, isOff, denomsBlank, uncountedSafe } from "./cashCount.js";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};

/* The form as it opens: tills prefilled, every denomination untouched. */
const blankForm = () => {
  const o = { id: "x", tills: "1000", loose: "", expected: "3290.00" };
  DENOMS.forEach((d) => (o[d.key] = ""));
  return o;
};

console.log("\n── 0. the shape the leaf describes");
t("★ ten denominations, and the grid is what a count IS", DENOMS.length === 10);
t("★ FLAG_AT is the one $10 threshold", FLAG_AT === 10);
t("★ countedTotal adds the grid, the tills and the loose",
  countedTotal({ d20: "100", tills: "1000", loose: "5" }) === 1105);

console.log("\n── 1. ★★ the entry that shipped, with his own figures");
{
  const e = blankForm();
  t("★ it really does compute his −$2290 (control — the bug reproduces)",
    Math.round(countedTotal(e) - Number(e.expected)) === -2290,
    countedTotal(e) - Number(e.expected));
  t("★ and the old reader could not tell (control — countedTotal says $1000)",
    countedTotal(e) === 1000);
  t("★★ uncountedSafe refuses it, and names the same figure", uncountedSafe(e) === -2290, uncountedSafe(e));
  t("★★ isOff would have flagged it too, which is the damage", isOff(e) === true);
}

console.log("\n── 2. ★★ BLANK and ZERO are different facts");
{
  const counted = { ...blankForm() };
  DENOMS.forEach((d) => (counted[d.key] = "0"));
  t("★★ a safe counted and found empty SAVES", uncountedSafe(counted) === null);
  t("★ ...and one typed zero anywhere is enough to be a statement",
    uncountedSafe({ ...blankForm(), p: "0" }) === null);
  t("★ an untouched grid is blank", denomsBlank(blankForm()) === true);
  t("★ ten typed zeroes are not blank", denomsBlank(counted) === false);
  t("★ a tabbed-through space is still blank", denomsBlank({ ...blankForm(), d5: "   " }) === true);
  t("★ an old row with no denomination keys at all reads blank", denomsBlank({ tills: "1000" }) === true);
  t("★★ but the two still sum identically, which is why this needed its own reader",
    countedTotal(blankForm()) === countedTotal(counted));
}

console.log("\n── 3. ★★ it refuses only what it should");
{
  t("★★ a real count saves", uncountedSafe({ ...blankForm(), d20: "2000", d100: "290" }) === null);
  t("★★ editing an old row is never refused (rule 1)",
    uncountedSafe(blankForm(), { isNew: false }) === null);
  t("★ nothing expected means no shortage to manufacture",
    uncountedSafe({ ...blankForm(), expected: "" }) === null);
  t("★ a zero expected is the same", uncountedSafe({ ...blankForm(), expected: "0" }) === null);
  t("★ it survives a missing entry rather than throwing", uncountedSafe(undefined) === null);
  t("★ isNew defaults to true, so a caller that forgets is still guarded",
    uncountedSafe(blankForm()) === -2290);
}

console.log("\n── 4. ★★ the screen asks the leaf, and holds no copy of it");
{
  const src = readFileSync(new URL("./CashAudit.jsx", import.meta.url), "utf8");
  /* ⚠️ BY IMPORT STATEMENT, NEVER BY SUBSTRING. A comment naming the module has
     counted as the import twice in these repos. */
  t("★★ CashAudit imports the leaf",
    /^import \{[^}]*\buncountedSafe\b[^}]*\} from "\.\/cashCount\.js";/m.test(src));
  t("★★ and the save path actually calls it", /uncountedSafe\(\s*entry/.test(src));
  t("★★ it returns before writing, rather than warning and saving anyway",
    /uncountedSafe\([\s\S]{0,120}?\n\s*if \(uncounted != null\) \{[\s\S]{0,300}?\breturn;/.test(src));
  /* ⚠️ RULE 8. These four moved out of the .jsx; a copy coming back is how the
     screen and the guard start disagreeing about what a count is. */
  for (const name of ["DENOMS", "countedTotal", "FLAG_AT", "isOff"]) {
    t(`★★ no second copy of ${name} in the screen`,
      !new RegExp(String.raw`^(const|function|let)\s+${name}\b`, "m").test(src));
  }
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
