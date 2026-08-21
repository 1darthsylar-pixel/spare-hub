/* ============================================================================
   cashCount.js — what a safe count IS, and when one has not happened.

   ⛔⛔ WHY THIS IS A LEAF AND NOT PART OF CashAudit.jsx.

   These rules decide whether the store is told it is short money. They lived in
   a `.jsx`, which no Node test can import and nothing in `checks/` can execute,
   so the one thing in the cash tile that most needs grading was the one thing
   that could not be. That is the same reason setupRows.js, jobHealth.js and
   docChase.js exist. It imports nothing.

   ══════════════════════════════════════════════════════════════════════════
   ⛔⛔ A BLANK DENOMINATION GRID IS NOT A COUNT OF ZERO.

   Matt, Aug 21 2026, off his own ledger: "we need a guard to prevent this from
   happening." The entry was Fri Aug 21 PM, and it read

       every denomination $0.00 · Tills $1000.00 · Counted $1000.00
       Expected $3290.00 · Over / Short −$2290.00

   Nobody counted the safe. `emptyAudit` ships `tills: "1000"` prefilled and
   every denomination blank, so opening the form and pressing Save files a
   $2,290 shortage — into the month's net over/short, into the flagged list, and
   onto the EOS scorecard.

   ⭐ THE DISTINCTION THE FIX TURNS ON IS ONE THIS REPO ALREADY KEEPS RELEARNING:
   **absent and zero are different facts.** An untouched box holds `""`. A
   counted-and-empty box holds `"0"`. `Number()` flattens both to 0, so
   `countedTotal` cannot tell them apart and never could — which is why this
   needed a separate reader rather than a bigger sum.

   ⇒ So the guard needs no new control on the screen at all. If a leader counted
   the safe, at least one box has a number in it. If the safe genuinely was
   empty, typing `0` says so, and that is a statement somebody made rather than
   a form nobody touched.

   ⚠️ IT ONLY EVER FIRES ON A NEW ENTRY. Rows written before the denomination
   grid existed carry no keys at all, so they read as blank forever, and
   refusing to let somebody edit an old row would be worse than what it
   prevents. Rule 1: old records must still read.
   ⚠️ AND IT NEEDS A NON-ZERO EXPECTED. With nothing expected there is no
   shortage to manufacture and nothing to warn about.
   ══════════════════════════════════════════════════════════════════════════ */

export const DENOMS = [
  { key: "d100", label: "$100" },
  { key: "d50", label: "$50" },
  { key: "d20", label: "$20" },
  { key: "d10", label: "$10" },
  { key: "d5", label: "$5" },
  { key: "d1", label: "$1" },
  { key: "q", label: "Quarters $" },
  { key: "dime", label: "Dimes $" },
  { key: "n", label: "Nickels $" },
  { key: "p", label: "Pennies $" },
];

/* ★ WHEN A SHIFT COUNTS AS OFF. Written out twice as a bare `>= 10` before it
   became one constant, because the drawer flag reads it too and three copies of
   a money threshold is how they drift apart. It is also what CashAudit
   publishes to the EOS scorecard as "≤ $10". */
export const FLAG_AT = 10;

export function countedTotal(entry) {
  return DENOMS.reduce((sum, d) => sum + (Number(entry[d.key]) || 0), 0)
    + (Number(entry.tills) || 0) + (Number(entry.loose) || 0);
}

export const isOff = (e) => Math.abs(countedTotal(e) - (Number(e.expected) || 0)) >= FLAG_AT;

/* ⚠️ TRIMMED, so a leader who tabbed through the grid and left a space in one
   box has still not counted anything. `null` and `undefined` are blank too —
   an old row simply has no key. */
const isBlank = (v) => String(v ?? "").trim() === "";

/* True when NOT ONE denomination box has been filled in. Deliberately not
   "the denominations sum to zero": a safe counted and found empty is ten
   zeroes, which is a real reading and must save. */
export const denomsBlank = (entry) => DENOMS.every((d) => isBlank(entry[d.key]));

/* ⭐ THE ONE ANSWER, so the screen and any future caller cannot disagree about
   what an uncounted safe is (rule 8).

   Returns the SHORTAGE this entry would file if it were saved, or null when
   there is nothing to refuse. A number rather than a boolean on purpose: the
   message has to name the figure, and a caller recomputing it is the drift
   that puts a different number in the warning than in the ledger. */
export function uncountedSafe(entry, { isNew = true } = {}) {
  if (!isNew) return null;
  const expected = Number(entry?.expected) || 0;
  if (!(expected > 0)) return null;
  if (!denomsBlank(entry || {})) return null;
  return Math.round((countedTotal(entry) - expected) * 100) / 100;
}
