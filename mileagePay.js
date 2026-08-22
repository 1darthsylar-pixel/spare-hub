/* ═══════════════════════════════════════════════════════════════════════════
   mileagePay.js — what a mileage claim is worth

   ⛔⛔ CHANGING THE RATE USED TO RE-PRICE EVERY CLAIM EVER MADE.

   Matt, Aug 22 2026: *"So changing the rate silently re-prices every past
   claim, including months already paid and printed."*

   `emptyMileage()` stored no rate, so all three money sites in `CashAudit.jsx`
   multiplied miles by whatever `storeCfg("financial.mileageRate")` said at the
   moment the screen rendered. A month printed and paid in March re-priced
   itself the day somebody edited a settings box.

   ⚠️⚠️ **AND TWO COMMENTS SAID OTHERWISE.** `CashAudit.jsx` at `mileageRate`:
   *"Rows already recorded keep whatever they were calculated at."*
   `StoreSettings.jsx`: *"Only prices new claims."* Neither was true, and both
   read as a guarantee to whoever was about to change the number.

   ⇒ **THE RATE IS STAMPED ON THE ENTRY AT CREATE TIME AND NEVER MOVES.**

   ⛔ **NOTHING IS BACKFILLED.** A missing rate means "logged before we tracked
   this", and those entries keep using the current setting exactly as they
   always did. Writing a rate onto an old row would be inventing a fact about
   what somebody was paid, which is the surgical edit the money rules forbid.

   ⚠️ **THIS IS A LEAF, AND THAT IS THE REASON IT EXISTS.** The maths lived in
   a `.jsx`, which no Node test can import and nothing in `checks/` can run, so
   the one calculation that decides what a person is PAID was graded by nothing.
   Same split `tierMath.js` already got out of `productivityTiers.js`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Round to the cent. 32.5 × 0.655 is 21.287500000000002 in floating point, and
 *  a cent that appears on one screen and not another is how two totals for one
 *  month end up disagreeing in front of the person being paid. */
const cents = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** A usable rate, or null. */
const asRate = (v) => {
  const n = Number(v);
  /* ⚠️ ZERO AND NEGATIVE ARE NOT RATES. Honouring a stored 0 would pay nothing
     for a real trip and look deliberate rather than broken. */
  return isFinite(n) && n > 0 ? n : null;
};

/** A reading, or null. ⛔⛔ A BLANK IS NOT A ZERO, AND THIS IS A LIVE BUG THE
 *  TESTS FOUND. `Number("")` is `0` and `isFinite(0)` is true, so the old guard
 *  in `CashAudit.jsx` waved a BLANK START READING straight through: a trip with
 *  no start and an end of 1032 claimed **1032 miles**, which at $0.76 is
 *  **$784.32**, on a money screen, with nothing on it looking wrong.
 *  ⇒ An empty box means nobody has typed the reading yet. It is not a car that
 *  started at zero. */
const reading = (v) => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (t === "") return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};

/**
 * Miles on one entry.
 * ⛔ ZERO, NEVER A NEGATIVE. An end reading below the start is a typo, and a
 * negative would subtract from the month and quietly reduce what somebody else
 * is owed.
 * ⚠️ ROUNDED TO FOUR PLACES, WHICH CHANGES NO REAL READING. `1032.9 - 1000.4`
 * is `32.500000000000114` in floating point, and that error was being carried
 * into the money and summed across a month while the screen printed `32.5`.
 * Four places kills the error and cannot move a figure anybody typed; rounding
 * to a tenth would have been tidier and would have changed what somebody is
 * paid, which is not a tidy-up.
 */
export function mileageMiles(e) {
  if (!e) return 0;
  const s = reading(e.startMiles), en = reading(e.endMiles);
  if (s === null || en === null || en < s) return 0;
  return Math.round((en - s) * 1e4) / 1e4;
}

/**
 * The rate this entry is priced at: its own stamped rate, or the setting.
 * @param fallbackRate the store's current rate, for entries logged before we
 *                     stamped one. Null when the store has none either.
 */
export function rateFor(entry, fallbackRate) {
  return asRate(entry && entry.rate) ?? asRate(fallbackRate);
}

/** Miles, the rate applied, and the money. */
export function entryPay(entry, fallbackRate) {
  const miles = mileageMiles(entry);
  const rate = rateFor(entry, fallbackRate);
  return { miles, rate, amount: rate == null ? 0 : cents(miles * rate) };
}

/**
 * A month, totalled row by row.
 *
 * ⛔⛔ THE SUM OF EACH ROW AT ITS OWN RATE, NEVER THE MONTH'S MILES TIMES ONE
 * NUMBER. Ten miles at 0.70 plus twenty at 0.76 is 22.20; dividing that back
 * out gives 0.74, and printing 0.74 as "the rate" names a figure nobody set.
 *
 * `rate` is the single rate when every row shares one, and NULL when they do
 * not. `mixed` says which, so a screen can say so rather than showing a blend.
 */
export function monthPay(entries, fallbackRate) {
  const rows = Array.isArray(entries) ? entries : [];
  let miles = 0, amount = 0;
  const seen = new Set();
  for (const e of rows) {
    const p = entryPay(e, fallbackRate);
    miles += p.miles;
    amount += p.amount;
    if (p.rate != null) seen.add(p.rate);
  }
  const rates = [...seen].sort((a, b) => a - b);
  return {
    miles: cents(miles),
    amount: cents(amount),
    rates,
    mixed: rates.length > 1,
    rate: rates.length === 1 ? rates[0] : null,
  };
}

/**
 * The odometer total.
 *
 * ⚠️ THE ODOMETER HAS NO ENTRY OF ITS OWN TO READ A RATE FROM, so it borrows
 * the rate the month was actually being logged at: the newest entry that
 * carries one. Falling straight to the setting would re-price a closed month
 * the moment somebody edited the box, which is the whole bug.
 *
 * `rateFrom` says where the rate came from — `entry`, `setting` or `none` — so
 * the screen can show which rate was applied rather than a total with no
 * explanation.
 */
export function odometerPay(travelledMiles, entries, fallbackRate) {
  const rows = Array.isArray(entries) ? entries : [];
  const dated = rows
    .filter((e) => e && asRate(e.rate) != null)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const newest = dated.length ? dated[dated.length - 1] : null;

  const fromEntry = newest ? asRate(newest.rate) : null;
  const rate = fromEntry ?? asRate(fallbackRate);
  const rateFrom = fromEntry != null ? "entry" : (rate != null ? "setting" : "none");

  const m = Number(travelledMiles);
  const miles = isFinite(m) && m > 0 ? m : 0;
  return { miles, rate, rateFrom, amount: rate == null ? 0 : cents(miles * rate) };
}
