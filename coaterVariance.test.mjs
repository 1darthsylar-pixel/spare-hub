/* ============================================================================
   coaterVariance.test.mjs — bags allotted against bags used

       node coaterVariance.test.mjs

   The coater sheet is a DAILY LOG with two different writers: the director sets
   "# bags allotted", the manager fills in "# bags used" after each daypart, and
   the variance between the two columns is the entire point of the sheet.

   ★ THE DEFINITION, quoted from `coaterSheet.js` at the function itself:

     "null WHEN EITHER SIDE IS BLANK. A variance needs both numbers; inventing
      one to make a row look complete is how a screen reports a store is on plan
      when nobody has counted yet."

   and from `num()` directly above it:

     "…must not read as a perfect zero-use dinner. Blank stays null. Zero is a
      real answer and is kept. `payRates.js` carries this scar with an hourly
      rate that returned 0 instead of null and made an unknown wage look like
      free labour."

   ⚠️⚠️ SO THE WHOLE TEST IS ONE DISTINCTION: BLANK IS NOT ZERO. A blank that
   reads as 0 does not produce an obviously broken screen — it produces a row
   that says the daypart went exactly to plan. That is a store being told it is
   on target when nobody has counted, which is the same failure the food cost
   blank-ending rule exists to stop, and the same one `payRates.js` already paid
   for once.

   This is a CORRECTNESS test, not a change detector. Every expectation comes
   from the two comments above, not from running the function.
   ============================================================================ */
import { varianceOf, num } from "./coaterSheet.js";

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

const day = (allotted, used) => ({ allotted, used });

/* ── 0. control ─────────────────────────────────────────────────────────── */
group("0. the real functions are loaded (control)");
t("varianceOf imported", typeof varianceOf === "function");
t("num imported", typeof num === "function");
/* ★ A REAL VARIANCE COMPUTES, so a file of nulls below cannot pass by accident. */
t("a complete row computes (control)",
  varianceOf(day({ breakfast: 5 }, { breakfast: 7 }), "breakfast") === 2);

/* ── 1. the arithmetic ──────────────────────────────────────────────────── */
group("1. variance is used minus allotted");
t("used 7, allotted 5, over by 2", varianceOf(day({ breakfast: 5 }, { breakfast: 7 }), "breakfast") === 2);
t("used 3, allotted 5, under by 2", varianceOf(day({ breakfast: 5 }, { breakfast: 3 }), "breakfast") === -2);
t("used equals allotted, level at 0", varianceOf(day({ lunch: 4 }, { lunch: 4 }), "lunch") === 0);
/* "half bags are real; thirds are a typo" — one decimal place. */
t("half bags survive", varianceOf(day({ lunch: 4 }, { lunch: 4.5 }), "lunch") === 0.5);

/* ── 2. THE POINT: blank is not zero ────────────────────────────────────── */
group("2. a blank side gives null, never a variance");
t("no used figure gives null", varianceOf(day({ breakfast: 5 }, {}), "breakfast") === null);
t("no allotted figure gives null", varianceOf(day({}, { breakfast: 5 }), "breakfast") === null);
t("neither side gives null", varianceOf(day({}, {}), "breakfast") === null);
t("an empty string is blank, not zero", varianceOf(day({ breakfast: "" }, { breakfast: 5 }), "breakfast") === null);
t("undefined is blank", varianceOf(day({ breakfast: undefined }, { breakfast: 5 }), "breakfast") === null);
/* ★★ THE REGRESSION ITSELF. If blank ever read as 0, this row would report
   "used 5 against 0 allotted, over by 5" — or worse, a blank-against-blank
   would report a perfect 0 and the screen would say the daypart went exactly
   to plan when nobody had counted at all. */
t("a blank row does NOT report a tidy zero", varianceOf(day({}, {}), "breakfast") !== 0);
t("a blank allotted does NOT report the used figure as the variance",
  varianceOf(day({}, { breakfast: 5 }), "breakfast") !== 5);

/* ── 3. a typed zero is a real answer and is kept ───────────────────────── */
group("3. a typed zero is a real count, not a blank");
/* ⚠️ THE DAYPARTS ARE breakfast, lunch, mid, night. An earlier draft of this
   file used "dinner", which readDay simply never picks up, so three rows
   silently graded null against null and read as failures of the CODE. The
   assertion was wrong, not the function — the trap this repo names as "when a
   test fails, suspect the assertion first".
   Allotted 5, used 0 — a daypart where the coater genuinely ran nothing.
   That is a real and important variance of −5, and the blank rule must not
   swallow it. */
t("used 0 against allotted 5 is −5", varianceOf(day({ night: 5 }, { night: 0 }), "night") === -5);
t("allotted 0 against used 3 is +3", varianceOf(day({ night: 0 }, { night: 3 }), "night") === 3);
t("num keeps a typed zero", num(0) === 0);
t("num turns a blank into null", num("") === null);
t("so zero and blank are different answers", num(0) !== num(""));

/* ── 4. junk does not become a number ───────────────────────────────────── */
group("4. an unusable entry is null, not NaN");
/* "must not read as a perfect zero-use dinner" — a NaN or a negative reaching
   a screen is a figure somebody would act on. */
t("text is null", num("abc") === null);
t("a negative bag count is null", num(-3) === null);
t("Infinity is null", num(Infinity) === null);
t("a junk side makes the variance null", varianceOf(day({ night: "abc" }, { night: 3 }), "night") === null);

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
