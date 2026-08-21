/* ============================================================================
   foodCostMonth.test.mjs — the two rulings that stop a wrong food % shipping

       node foodCostMonth.test.mjs

   ★★ THIS IS A CORRECTNESS TEST, NOT A CHANGE DETECTOR, and the distinction is
   the whole point of the testing handoff. Every expected value below comes from
   a WRITTEN DEFINITION — Matt's own words, quoted in `FoodCostTracker.jsx` at
   the line that implements them — never from running the function and pasting
   what it returned.

   ⚠️⚠️ THE HANDOFF SAID THIS DEFECT WAS LIVE. IT IS NOT, AND THAT MATTERS.
   It described the 107% open-month reading as current behaviour and asked which
   of two fixes to apply. Both would have REPLACED a ruling Matt already made on
   Aug 2 2026 and that has been shipped since. Reading the file first is what
   caught it. This file therefore pins what is there rather than changing it.

   ── RULING 1, Matt, Aug 2 2026 ──
   "make the starting and ending the same number, last month's ending, and at
   the end of the month I'll adjust it. same with paper"

   A BLANK ending inventory is read as EQUAL TO THE BEGINNING, so the two cancel
   and a mid-month figure is simply purchases minus giveaways over sales.
   Blank used to count as $0, which claimed the entire shelf had been eaten with
   nothing left: on Aug 2 the dashboard read 107% and the whole MTD block went
   red. ⚠️ A TYPED "0" IS A REAL COUNT and must still be respected — only blank
   means "not counted yet". That distinction is the bug's whole surface.

   ── RULING 2, Matt, Aug 12 2026 ──
   An IMPOSSIBLE usage is refused, not clamped. The paper giveaway box was typed
   as 329842 instead of 204.88; paperUse came out at −$310,759 and every screen
   published *−109.85% paper cost*, all agreeing with each other and all wrong.
   You cannot give away more than you started with plus everything you bought.
   ⚠️ NULL, NOT ZERO. A floor would be a different wrong number wearing a
   confident face.

   ⇒ RUNS THE REAL BYTES. `costBreakdown` is already exported and pure, but it
   lives in a `.jsx` that plain Node cannot parse, so the function and its two
   helpers are extracted and executed — the same pattern openDoors.test.mjs uses.
   No production file is touched, per the handoff's rule 3.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(DIR, "FoodCostTracker.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ── 0. control ─────────────────────────────────────────────────────────── */
group("0. the real function was extracted and runs (control)");
const fnSrc = src.match(/export function costBreakdown\(rec, salesTotal\) \{[\s\S]*?\n\}/);
t("FoodCostTracker.jsx is non-trivial (control)", src.length > 5000);
t("costBreakdown was found", !!fnSrc);

/* `catById(e.cat).side` decides which purchases are food and which are paper.
   Stubbed rather than extracted: this file is about the INVENTORY rulings, and
   a stub keeps a category-table change from turning these red for an unrelated
   reason. Every entry below states its own side explicitly. */
const costBreakdown = fnSrc
  ? new Function("catById", "n", `${fnSrc[0].replace(/^export /, "")}; return costBreakdown;`)(
      (cat) => ({ side: cat }),
      (v) => Number(v) || 0,
    )
  : null;
t("it runs", typeof costBreakdown === "function");

const rec = (over) => ({
  beginFood: 10000, beginPaper: 2000,
  entries: [{ cat: "food", amount: 5000 }, { cat: "paper", amount: 1000 }],
  giveaways: {},
  ...over,
});

/* ── 1. ruling 1: blank ending = beginning ──────────────────────────────── */
group("1. a blank ending inventory is read as the beginning (Aug 2 ruling)");
{
  const b = costBreakdown(rec({ endFood: "", endPaper: "" }), 20000);
  /* From the ruling, computed by hand, NOT from the function:
     begin 10000 + purchases 5000 − giveaways 0 − end(=begin) 10000 = 5000.
     5000 / 20000 sales = 25%. The held shelf cancels out entirely. */
  t("food use excludes the uncounted shelf", b.foodUse === 5000);
  t("food % is purchases over sales, 25%", Math.abs(b.foodPct - 0.25) < 1e-9);
  t("it says the ending was assumed", b.endFoodAssumed === true);
  t("paper follows the same rule", b.paperUse === 1000);
  /* ★★ THE REGRESSION ITSELF. If blank ever counts as $0 again, foodUse becomes
     15000 and the figure becomes 75% — the shape of the 107% Matt saw. */
  t("blank does NOT count as zero (the 107% bug)", b.foodUse !== 15000);
}

/* ── 2. a typed 0 is a real count ───────────────────────────────────────── */
group("2. a typed zero is respected, because it is a real count");
{
  const b = costBreakdown(rec({ endFood: 0, endPaper: 0 }), 20000);
  /* 10000 + 5000 − 0 − 0 = 15000. The shelf really was emptied, and the store
     said so. This is the case the blank rule must NOT swallow. */
  t("a typed 0 empties the shelf", b.foodUse === 15000);
  t("and it is not marked assumed", b.endFoodAssumed === false);
  t("so 0 and blank give DIFFERENT answers", b.foodUse !== 5000);
}

/* ── 3. a real month-end count trues up ─────────────────────────────────── */
group("3. a real count wins over the assumption");
{
  const b = costBreakdown(rec({ endFood: 9000, endPaper: 1800 }), 20000);
  t("food use is begin + buys − end", b.foodUse === 6000);
  t("not assumed", b.endFoodAssumed === false);
}

/* ── 4. ruling 2: impossible is refused, not clamped ────────────────────── */
group("4. an impossible usage is refused (Aug 12 ruling)");
{
  /* The real incident: a giveaway typed as a running total larger than
     everything the store ever held. */
  const b = costBreakdown(rec({ endFood: "", giveaways: { "2026-08-12": { food: 329842, paper: 0 } } }), 20000);
  t("the usage is negative, so it cannot be a cost", b.foodUse < 0);
  t("it is flagged impossible", b.foodImpossible === true);
  /* ⚠️ NULL, NOT ZERO AND NOT A FLOOR. A clamped 0% is a different wrong number
     wearing a confident face, and every caller already renders null as a dash. */
  t("the percentage is withheld, not floored", b.foodPct === null);
  t("it is not clamped to 0", b.foodPct !== 0);
  /* ⚠️ THE RAW WORKING IS STILL RETURNED, because the tracker's math line is
     exactly where somebody diagnoses the bad entry. */
  t("the raw numbers still come back for diagnosis", typeof b.foodUse === "number");
  t("paper is judged separately, not dragged down with food", b.paperImpossible === false);
}

/* ── 5. no sales yet ────────────────────────────────────────────────────── */
group("5. no sales means no percentage");
{
  const b = costBreakdown(rec({ endFood: "" }), 0);
  /* Dividing by zero sales would produce Infinity and render as a number. */
  t("food % is null with no sales", b.foodPct === null);
  t("the use figure is still computed", b.foodUse === 5000);
}

/* ── 6. the day list is newest first ────────────────────────────────────── */
group("6. ★ the invoice day list opens on the day he is typing into");
/* Matt, Aug 20 2026: "I would like the invoices to show the current or most
   recent day first so I don't have to scroll when inputting."

   ⚠️ GRADED BY SOURCE, NOT BY RUNNING IT, and that is a real limitation stated
   rather than hidden: `entryGroups` is a `useMemo` inside a `.jsx` component
   and nothing in `checks/` can execute it. What this can do is prove the two
   sorts still point opposite ways, which is the whole ruling.

   ⚠️ THE INNER SORT MUST STAY ASCENDING. It orders the items INSIDE one day,
   so flipping it too would reverse each invoice against the order he entered
   them in. One ascending and one descending is correct and looks like a
   mistake, which is exactly why it is pinned here. */
{
  const SRC = fs.readFileSync(new URL("./FoodCostTracker.jsx", import.meta.url), "utf8");
  t("the component source was read (control)", SRC.length > 40000);
  const memo = SRC.match(/const entryGroups = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[rec\]\);/);
  t("entryGroups was found (control)", !!memo);
  const body = memo ? memo[0] : "";
  t("★ the DAY list is newest first",
    /\[\.\.\.map\.values\(\)\]\.sort\(\(a, b\) => b\.date\.localeCompare\(a\.date\)\)/.test(body));
  t("★ and the entries INSIDE a day are still oldest first",
    /rec\.entries\)[^\n]*\.sort\(\(a, b\) => a\.date\.localeCompare\(b\.date\)\)/.test(body));
}

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
