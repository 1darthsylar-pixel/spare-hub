/* ============================================================================
   mileagePay.test.mjs — WHAT A CLAIM IS WORTH.

   ⛔⛔ THE RATE WAS NEVER STORED, so all three money sites multiplied miles by
   whatever the settings box said AT THE MOMENT THE SCREEN RENDERED. Matt,
   Aug 22 2026: "changing the rate silently re-prices every past claim,
   including months already paid and printed."

   ⚠️⚠️ AND TWO COMMENTS IN THE CODE PROMISED THE OPPOSITE. `CashAudit.jsx`:
   "Rows already recorded keep whatever they were calculated at."
   `StoreSettings.jsx`: "Only prices new claims." Neither was true, and both
   read as a guarantee to whoever was about to change the number.

   ★ THE MATHS LIVED IN A `.jsx`, which no Node test can import and nothing in
   `checks/` can execute — so the one function deciding what a person is PAID
   was graded by nothing. That is why it is a leaf now, and why writing this
   file found two live bugs on the first run.
   ============================================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mileageMiles, rateFor, entryPay, monthPay, odometerPay } from "./mileagePay.js";

const trip = (o) => ({ startMiles: "1000", endMiles: "1032", ...o });

/* ── the miles ──────────────────────────────────────────────────────────── */

test("a plain trip", () => {
  assert.equal(mileageMiles(trip()), 32);
});

/* 🐛 A LIVE BUG THIS FILE FOUND. `Number("")` is 0 and `isFinite(0)` is true,
   so a blank start reading with an end of 1032 claimed the WHOLE ODOMETER —
   1032 miles, $784.32 at the current rate, filed as a real claim with nothing
   on screen looking wrong. */
test("a blank start reading is NOT zero miles travelled", () => {
  assert.equal(mileageMiles({ startMiles: "", endMiles: "1032" }), 0);
  assert.equal(mileageMiles({ startMiles: "   ", endMiles: "1032" }), 0);
  assert.equal(mileageMiles({ endMiles: "1032" }), 0);
  assert.equal(mileageMiles({ startMiles: null, endMiles: "1032" }), 0);
});

test("a typed zero still works, because 0 is a real reading", () => {
  assert.equal(mileageMiles({ startMiles: "0", endMiles: "32" }), 32);
});

/* 🐛 THE SECOND LIVE BUG. 1032.9 − 1000.4 is 32.500000000000114 in JavaScript.
   The screen printed 32.5 and the money was computed on the longer number, then
   summed across the month. Rounded to four places, which cannot move a figure
   anybody typed. A tenth would have been tidier and would have changed what
   somebody is paid. */
test("floating point does not ride into the money", () => {
  assert.equal(mileageMiles({ startMiles: "1000.4", endMiles: "1032.9" }), 32.5);
});

test("end before start is zero, never negative", () => {
  assert.equal(mileageMiles({ startMiles: "1032", endMiles: "1000" }), 0);
});

test("missing and rubbish are zero, never NaN", () => {
  for (const e of [null, undefined, {}, { startMiles: "x", endMiles: "y" }]) {
    const m = mileageMiles(e);
    assert.equal(m, 0);
    assert.ok(Number.isFinite(m));
  }
});

/* ── the rate a row was logged at ───────────────────────────────────────── */

test("a stored rate wins over the setting, which is the whole point", () => {
  assert.equal(rateFor({ rate: 0.70 }, 0.76), 0.70);
  assert.equal(entryPay(trip({ rate: 0.70 }), 0.76).amount, 22.4);
});

test("no stored rate falls back to the setting, and never to zero", () => {
  assert.equal(rateFor({}, 0.76), 0.76);
  assert.equal(entryPay(trip(), 0.76).amount, 24.32);
});

/* ⚠️ A ZERO OR MISSING RATE IS ZERO MONEY, NOT A DIVIDE BY ZERO. Nothing here
   divides by the rate, which is why this is safe. Stated because the money
   rules require the answer written down rather than assumed. */
test("a zero or missing rate is zero money, never Infinity or NaN", () => {
  for (const r of [0, null, undefined, -1]) {
    const a = entryPay(trip(), r).amount;
    assert.ok(Number.isFinite(a), `rate ${r}`);
    assert.equal(a, 0, `rate ${r}`);
  }
});

/* ── a month ────────────────────────────────────────────────────────────── */

test("a month at one rate", () => {
  const m = monthPay([trip({ rate: 0.76 }), trip({ rate: 0.76 })], 0.76);
  assert.equal(m.miles, 64);
  assert.equal(m.amount, 48.64);
  assert.equal(m.mixed, false);
  assert.equal(m.rate, 0.76);
});

/* ⛔⛔ EACH ROW AT ITS OWN RATE, NEVER THE MONTH'S MILES TIMES ONE NUMBER.
   32 at 0.70 plus 32 at 0.76 is 46.72. Sixty-four miles times either rate is
   44.80 or 48.64, and BOTH are wrong. */
test("a month spanning a rate change totals each row at its own rate", () => {
  const m = monthPay([trip({ rate: 0.70 }), trip({ rate: 0.76 })], 0.76);
  assert.equal(m.miles, 64);
  assert.equal(m.amount, 46.72);
  assert.notEqual(m.amount, 64 * 0.70);
  assert.notEqual(m.amount, 64 * 0.76);
});

/* ⚠️ AND IT SAYS SO RATHER THAN NAMING A BLENDED RATE. 46.72 ÷ 64 is 0.73, a
   number nobody set and no row was paid at. */
test("and it is flagged, never averaged into one rate", () => {
  const m = monthPay([trip({ rate: 0.70 }), trip({ rate: 0.76 })], 0.76);
  assert.equal(m.mixed, true);
  assert.deepEqual(m.rates, [0.70, 0.76]);
  assert.equal(m.rate, null, "a mixed month has no single rate to name");
});

test("an empty month is zero and not mixed", () => {
  const m = monthPay([], 0.76);
  assert.equal(m.miles, 0);
  assert.equal(m.amount, 0);
  assert.equal(m.mixed, false);
});

test("a month of unrated rows uses the setting and is not mixed", () => {
  const m = monthPay([trip(), trip()], 0.76);
  assert.equal(m.amount, 48.64);
  assert.equal(m.mixed, false);
});

/* ── the odometer ───────────────────────────────────────────────────────── */

/* ⚠️ THE ODOMETER HAS NO TRIP AND SO NO RATE OF ITS OWN. It borrows the newest
   RATED trip in the month. Going straight to the settings box would re-price a
   closed month the moment somebody edited it, which is the whole bug. */
test("the odometer borrows the newest rated trip in the month", () => {
  const od = odometerPay(100, [trip({ rate: 0.70, date: "2026-06-01" }),
                               trip({ rate: 0.76, date: "2026-07-02" })], 0.99);
  assert.equal(od.rate, 0.76);
  assert.equal(od.amount, 76);
  assert.equal(od.rateFrom, "entry");
});

test("with no rated trip it falls to the setting, and says which", () => {
  const od = odometerPay(100, [trip()], 0.76);
  assert.equal(od.rate, 0.76);
  assert.equal(od.rateFrom, "setting");
});

test("with nothing at all it says so rather than inventing a rate", () => {
  const od = odometerPay(100, [], 0);
  assert.equal(od.amount, 0);
  assert.equal(od.rateFrom, "none");
});

test("zero miles travelled is zero money", () => {
  assert.equal(odometerPay(0, [trip({ rate: 0.76 })], 0.76).amount, 0);
});
