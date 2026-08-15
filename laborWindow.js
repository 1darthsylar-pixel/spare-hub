/* ============================================================================
   laborWindow.js — Gate City Hub

   WHY THIS FILE EXISTS
   The labor row on the EOS scorecard (`eos:scorecard:{period}` → s3) is read by
   the dashboard KPI strip, Company Health, the L10 board and the AI digest. Only
   FCRPage publishes it, and it publishes ONLY when the payroll window is
   trustworthy — because labor % = (wages + PTO) ÷ salesThrough, so a missed
   sales day shortens the denominator while wages stay whole and the row goes out
   as a FALSE RED on four surfaces at once.

   The tier (Top 10/20/33/50%) is an input to the labor GOAL. Change it in the
   Planner and the goal on those four surfaces stays stale until someone happens
   to open the FCR page. Fixing that means the Planner has to be able to publish
   — and it must apply the SAME trust rule, or it reintroduces the false red.

   FCRPage already imports from LaborPlanner.jsx, so LaborPlanner cannot import from
   FCRPage — that would be a circular dependency. Hence a neutral module with
   ZERO imports that both sides can use. Same pattern as ipoPlan.js and
   inputRegistry.js.

   ⚠️ THE RULE CURRENTLY LIVES IN TWO PLACES. FCRPage.jsx computes `pinned`,
   `salesLagWindow`, `salesBeyondWindow`, `windowStaleDays`, `windowStale` and
   `wagesMovedSinceThrough` inline (~L679-705) and builds its own s3 row
   (~L758). The functions below are a faithful copy of those expressions.
   **If you change one, change the other**, or the Planner and the FCR page will
   publish different verdicts about the same month. Folding FCRPage onto this
   module is the next step and was deliberately left out of the pass that added
   it, so the live publish path was not touched in the same change.
   ============================================================================ */

export const STALE_AFTER_DAYS = 1;

/* Parsed at NOON so a timezone offset can never move a date across a day. */
const daysBetween = (a, b) =>
  Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86400000);

/**
 * laborWindow({ mtd, dayTotals })
 *
 * mtd       — the `gcfcr-fcr-mtd-{ym}-v1` record: { wages, hours, pto,
 *             hoursThrough, throughStamp, ... }. Missing/undefined is fine.
 * dayTotals — { "YYYY-MM-DD": number } for the month. Sales totals only; this
 *             module deliberately doesn't know how a day's total is computed.
 *
 * Returns the window state plus `trusted`, which is the ONLY thing a caller
 * needs to decide whether publishing the labor row is safe.
 */
export function laborWindow({ mtd, dayTotals } = {}) {
  const m = mtd || {};
  const days = dayTotals || {};

  /* ⚠️ THIS IS PLANNER'S CONVENTION, NOT FCRPage's. Planner treats the last
     sales day as the last day with a total ABOVE ZERO (matching monthLaborCard);
     FCRPage takes the last KEY in its salesDays map regardless of value. They
     agree unless a day is entered as an explicit 0. That difference is LEFT
     ALONE on purpose — changing FCRPage's definition would move effThrough,
     which moves salesThrough, which moves labor % and the profit projection.
     Callers that already have their own figures should use laborTrust() and
     pass them in, so nothing is recomputed underneath them. */
  const withSales = Object.keys(days).filter((iso) => Number(days[iso]) > 0).sort();
  const lastSalesIso = withSales.length ? withSales[withSales.length - 1] : null;
  const effThrough = m.hoursThrough || lastSalesIso;

  let salesThrough = 0, salesFull = 0;
  Object.keys(days).forEach((iso) => {
    const v = Number(days[iso]) || 0;
    salesFull += v;
    if (effThrough && iso <= effThrough) salesThrough += v;
  });

  return {
    lastSalesIso, effThrough, salesThrough, salesFull,
    ...laborTrust({ mtd: m, lastSalesIso, effThrough, salesThrough, salesFull }),
  };
}

/**
 * laborTrust({ mtd, lastSalesIso, effThrough, salesThrough, salesFull })
 *
 * The trust rule ON ITS OWN, taking sales figures the caller has ALREADY
 * computed. This is the entry point for anywhere that must not have its numbers
 * recomputed underneath it — FCRPage passes its own effThrough/salesThrough, so
 * folding it onto this module cannot move labor %, and therefore cannot move the
 * profit projection.
 */
export function laborTrust({ mtd, lastSalesIso, effThrough, salesThrough, salesFull } = {}) {
  const m = mtd || {};
  const pinned = !!m.hoursThrough;
  const salesLagWindow = !!(pinned && lastSalesIso && m.hoursThrough > lastSalesIso);
  const salesBeyondWindow = !!effThrough && (Number(salesFull) || 0) - (Number(salesThrough) || 0) > 0.005;

  const windowStaleDays = pinned && lastSalesIso && m.hoursThrough < lastSalesIso
    ? daysBetween(m.hoursThrough, lastSalesIso)
    : 0;
  const windowStale = windowStaleDays > STALE_AFTER_DAYS && salesBeyondWindow;

  const stamp = m.throughStamp;
  const wagesMovedSinceThrough = !!(
    pinned && stamp &&
    ((stamp.wages || "") !== (m.wages || "") || (stamp.hours || "") !== (m.hours || ""))
  );

  return {
    pinned, salesLagWindow, salesBeyondWindow,
    windowStaleDays, windowStale, wagesMovedSinceThrough,
    trusted: !salesLagWindow && !windowStale && !wagesMovedSinceThrough,
  };
}

/**
 * laborRow({ laborPct, laborGoal, trusted, effThrough })
 *
 * Builds the s3 payload in the SHAPE FCRPage publishes — display strings, not
 * numbers, because every consumer renders them as text. Returns null when there
 * is nothing safe to say, and a null return must mean "write nothing": the
 * publish is a read-merge-write that never deletes, so the last trustworthy row
 * stays on the board rather than lurching or blanking.
 */
export function laborRow({ laborPct, laborGoal, trusted, effThrough } = {}) {
  if (!trusted) return null;
  if (laborPct == null || laborGoal == null) return null;
  if (!isFinite(laborPct) || !isFinite(laborGoal)) return null;
  /* ⚠️ THE PRECISION HERE MUST MATCH FCRPage's s3 BLOCK EXACTLY — actual at 2
     decimals, goal at 1. Two files publish this same row (FCRPage when the FCR
     page is open, Planner via this helper), and whichever ran last is what the
     store sees. On Jul 29 FCRPage went to 2 decimals and this did not, so the
     labor % flipped between 22.53% and 22.5% depending on which tile a leader
     happened to open. It reads as a number that will not sit still.
     ⚠️ This function exists BECAUSE the shape has to stay identical. Changing
     one side alone is the exact failure it was written to prevent. */
  /* 🐛 `held: false` WAS MISSING, AND THE WARNING DIRECTLY ABOVE PREDICTED IT
     (found by the Aug 5 2026 sweep, confirmed by three independent reviewers).

     publishSharedRows merges PER ROW and never deletes a key:
       next[k] = { ...(cur[k] || {}), ...rows[k] }
     FCRPage's trusted branch writes `held: false` on purpose, to clear the
     marker its own untrusted branch sets. This helper did not, so a stored
     `held: true` survived every publish the Planner made.

     THE SEQUENCE, all of it ordinary:
       1. Payroll is saved before yesterday's sales are typed. That pins the
          window short and FCRPage publishes s3 = { held: true }.
       2. The missing sales day is entered in the SALES tab. The window is
          trustworthy again, but FinancialSuite mounts one tab at a time so
          FCRPage is unmounted and cannot republish.
       3. A labor tier is tapped in the LABOR tab. republishLaborRow publishes
          this row: fresh, correct, and with no `held` key.
       4. The merge keeps `held: true` from step 1.
     ⇒ A correct labor % renders in red, captioned "held", on the dashboard KPI
     strip, the L10 board, Company Health and the digest, until somebody happens
     to reopen the FCR page. A false red on four surfaces at once is exactly what
     this file's header says it exists to prevent.

     ⚠️ NOT `held: undefined`. A spread copies an explicit undefined over the top
     and some readers test `"held" in cell` rather than truthiness. False is the
     value FCRPage writes, so false is what keeps the two shapes identical. */
  return {
    actual: `${(laborPct * 100).toFixed(2)}%`,
    goal: `≤ ${(laborGoal * 100).toFixed(1)}%`,
    hit: laborPct <= laborGoal,
    asOf: effThrough || null,
    at: new Date().toISOString(),
    held: false,
  };
}

/**
 * mergeScorecardRow(current, key, row)
 *
 * Read-merge-write helper. Touches ONLY the named row and never deletes, so a
 * caller can publish s3 without disturbing rows other tools own (s1/s2/s5/s6/s8).
 * Returns the object to write, or null when there is nothing to do.
 */
export function mergeScorecardRow(current, key, row) {
  if (!row || !key) return null;
  const cur = current && typeof current === "object" ? current : {};
  return { ...cur, [key]: { ...(cur[key] || {}), ...row } };
}
