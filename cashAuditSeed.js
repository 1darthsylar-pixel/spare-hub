/* ══════════════════════════════════════════════════════════════════════════
   cashAuditSeed.js — THE JULY SAFE COUNTS. SERVER SIDE ONLY.

   ★ LEAF. Imports nothing.

   🐛 THIS SHIPPED TO THE BROWSER. Aug 9 2026 sweep, finding 4. It lived in
   CashAudit.jsx as `JULY_SEED`, so `dist/assets/CashAudit-*.js` carried eight
   dated counts of the safe in a real physical restaurant, downloadable by
   anyone on the internet with no account:

     - safe balances of $3,683 to $4,658 on named dates
     - the denomination mix, including $1,655 in fives and $630 in quarters
     - a $1,000 standing till float
     - deposits of $60 to $750, and which shifts deposited nothing
     - a $900 change order arriving Jul 3

   ⚠️ THIS IS REAL DATA, NOT A SAMPLE, AND THE ARITHMETIC IS THE PROOF.
   Row one: 100 + 1655 + 918 + 630 + 315 + 40 + 1000 = 4658, which is that row's
   own `expected`. Invented figures do not reconcile across eight rows. Anyone
   tempted to leave a copy behind as an example should read that sentence twice —
   a placeholder built by editing these numbers is a second copy of them, and
   that mistake has now been made twice in this repo within one hour.

   ⚠️ THE TILE'S `tier: 2, allow: ["Payroll"]` NEVER MATTERED. A gate decides
   what RENDERS. The chunk downloads either way and `/assets/*` answers 200 to
   anyone, with a year-long immutable cache header. Same class as the food gaps,
   the inventory gaps, the scorecard and the supplier roster, found by the same
   question: what does the browser download, not who can call this route.

   ⚠️ WHY MOVED AND NOT DELETED. `seedJulyEntries` backfills these rows into a
   ledger that does not already have them, keyed by date+shift. Deleting them
   would mean a store whose ledger is missing July can never get it back. Moving
   them keeps that recovery path and costs the browser nothing.

   Served by GET /api/cashaudit-seed, gated to mirror the tile: tier 2
   (rank >= 3) or the Payroll title. A route STRICTER than its tile is invisible
   — the tile renders, the data is missing, and nothing on screen says why.
   ══════════════════════════════════════════════════════════════════════════ */

export const NOTE = "Imported from $ Audit Sheet";

export const SEED = [
  { date: "2026-07-01", shift: "AM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1655", d1: "918", q: "630", dime: "315", n: "40", p: "0", tills: "1000", deposited: "", received: "", expected: "4658", leader: "" },
  { date: "2026-07-01", shift: "PM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1450", d1: "844", q: "550", dime: "305", n: "34", p: "0", tills: "1000", deposited: "380", received: "", expected: "4278", leader: "LC" },
  { date: "2026-07-02", shift: "AM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1450", d1: "844", q: "550", dime: "305", n: "34", p: "0", tills: "1000", deposited: "", received: "", expected: "4283", leader: "Dhe" },
  { date: "2026-07-02", shift: "PM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1270", d1: "561", q: "450", dime: "275", n: "28", p: "0", tills: "1000", deposited: "600", received: "", expected: "3683", leader: "" },
  { date: "2026-07-03", shift: "AM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1270", d1: "561", q: "450", dime: "275", n: "28", p: "0", tills: "1000", deposited: "", received: "900", expected: "3684", leader: "Dhe" },
  { date: "2026-07-03", shift: "PM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1295", d1: "797", q: "380", dime: "255", n: "22", p: "0", tills: "1000", deposited: "750", received: "", expected: "3834", leader: "Dhe" },
  { date: "2026-07-04", shift: "AM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1295", d1: "797", q: "380", dime: "255", n: "22", p: "0", tills: "1000", deposited: "", received: "", expected: "3849", leader: "Dhe" },
  { date: "2026-07-04", shift: "PM", d100: "0", d50: "0", d20: "100", d10: "0", d5: "1290", d1: "753", q: "370", dime: "255", n: "20", p: "0", tills: "1000", deposited: "60", received: "", expected: "3789", leader: "Tcc" },
];
