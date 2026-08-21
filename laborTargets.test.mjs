/* ============================================================================
   laborTargets.test.mjs — the labor budget's three numbers

       node laborTargets.test.mjs

   These are the figures the FCR displays as its labor and productivity goals.
   `FCRPage.jsx` says so in its own words: "Labor & productivity goals come from
   the Planner's active tier and planned wage." So testing them here covers the
   FCR's goals without touching a screen 106 people open.

   ★ EVERY EXPECTED VALUE BELOW IS COMPUTED BY HAND FROM A WRITTEN DEFINITION,
   never from running the function and pasting what came back. The definitions:

     benchmarkHours       `fixedHours + forecastSales / marginalRate`, stated in
                          the function and its JSDoc
     dayProductivityTarget  "Effective productivity target ($/labor-hr) for a
                          single day", i.e. forecast over those hours
     seedPlannedWage      "Seeded from the prior CLOSED month's actual avg wage.
                          Never seeded from live MTD — an in-flight month is
                          noisy and would make the labor budget drift daily."
                          Returns null if the prior month is incomplete, and
                          "callers should keep the existing plannedWage rather
                          than overwrite it."

   ⚠️⚠️ THE MOST IMPORTANT ASSERTIONS HERE ARE THE NULLS, NOT THE ARITHMETIC.
   The division is easy and would be noticed. What would not be noticed is a
   zero or a NaN quietly becoming a labor goal: `seedPlannedWage` returning 0
   instead of null means a caller OVERWRITES a good planned wage with nothing,
   and the whole month's labor budget silently rebases. The comment says
   callers keep the existing value on null — that only works if null is what
   comes back.

   This is a CORRECTNESS test, not a change detector.
   ============================================================================ */
import { benchmarkHours, dayProductivityTarget, seedPlannedWage } from "./laborEngine.js";

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);
const near = (a, b) => a != null && Math.abs(a - b) < 1e-9;

/* ── 0. control ─────────────────────────────────────────────────────────── */
group("0. the real functions are loaded (control)");
t("benchmarkHours imported", typeof benchmarkHours === "function");
t("dayProductivityTarget imported", typeof dayProductivityTarget === "function");
t("seedPlannedWage imported", typeof seedPlannedWage === "function");

/* A tier is `{ fixedHours, marginalRate }`. Chosen so the arithmetic is
   checkable in your head: 40 fixed hours, and one labor hour per $250 of
   sales. $10,000 of sales is 40 marginal hours, so 80 hours total. */
const tier = { fixedHours: 40, marginalRate: 250 };

/* ── 1. benchmark hours ─────────────────────────────────────────────────── */
group("1. benchmark hours = fixed + sales / marginal");
t("$10,000 at 40 + 1/250 is 80 hours", near(benchmarkHours(tier, 10000), 80));
t("$0 marginal still carries the fixed hours", near(benchmarkHours(tier, 2500), 50));
/* ⚠️ THE GUARDS, WHICH ARE THE PART THAT MATTERS. A labor benchmark computed
   from a missing forecast is a budget built on nothing. */
t("no tier gives null", benchmarkHours(null, 10000) === null);
t("no forecast gives null", benchmarkHours(tier, 0) === null);
t("a negative forecast gives null", benchmarkHours(tier, -5000) === null);
/* ★ A ZERO marginalRate would be a divide-by-zero and produce Infinity hours.
   Infinity renders as a number on a screen. */
t("a zero marginal rate gives null, not Infinity",
  benchmarkHours({ fixedHours: 40, marginalRate: 0 }, 10000) === null);

/* ── 2. productivity target ─────────────────────────────────────────────── */
group("2. productivity target = forecast / benchmark hours");
/* $10,000 over 80 hours is $125 per labor hour, by hand. */
t("$10,000 over 80 hours is $125/hr", near(dayProductivityTarget(tier, 10000), 125));
t("$2,500 over 50 hours is $50/hr", near(dayProductivityTarget(tier, 2500), 50));
/* ⚠️ IT INHERITS THE GUARDS ABOVE, and must — a target derived from a null
   benchmark is the same budget built on nothing, one step later. */
t("no tier gives no target", dayProductivityTarget(null, 10000) === null);
t("no forecast gives no target", dayProductivityTarget(tier, 0) === null);
t("a zero marginal rate gives no target",
  dayProductivityTarget({ fixedHours: 40, marginalRate: 0 }, 10000) === null);

/* ── 3. planned wage, seeded only from a COMPLETE prior month ───────────── */
group("3. planned wage seeds from the prior closed month, or not at all");
/* $45,000 of wages over 3,000 hours is $15.00, by hand. */
t("$45,000 over 3,000 hours is $15.00", near(seedPlannedWage(45000, 3000), 15));
/* ⚠️⚠️ THE NULLS ARE THE POINT. The comment says a caller KEEPS its existing
   planned wage when this returns null. If any of these returned 0 or NaN
   instead, a caller would overwrite a good wage with nothing and the entire
   month's labor budget would silently rebase off a wrong rate. */
t("no hours gives null, not a divide by zero", seedPlannedWage(45000, 0) === null);
t("no wages gives null", seedPlannedWage(0, 3000) === null);
t("both missing gives null", seedPlannedWage(0, 0) === null);
t("undefined gives null", seedPlannedWage(undefined, undefined) === null);
t("negative hours gives null", seedPlannedWage(45000, -100) === null);
/* ★ AND IT MUST NEVER RETURN A NUMBER-LIKE NON-NUMBER. `0` is falsy and would
   pass a lazy `if (seed)` check the same way null does, but `Infinity` and
   `NaN` are not falsy and WOULD be written. */
for (const [w, h, label] of [[45000, 0, "zero hours"], [0, 0, "nothing at all"]]) {
  const got = seedPlannedWage(w, h);
  t(`${label} is exactly null, not NaN or Infinity`,
    got === null && !Number.isNaN(got) && got !== Infinity);
}

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
