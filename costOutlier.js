/* ============================================================================
   costOutlier.js — "that number is a long way outside anything you have ever
   typed. Is it right?"

   WHY THIS EXISTS (Matt, Aug 12 2026). Two wrong numbers reached the Food Cost
   page in one month and neither was caught by anything:

     1. A paper giveaway MTD total typed as 329842 instead of 204.88. That one
        made the cost NEGATIVE, and the impossible-cost guard now refuses it.
     2. A paper invoice typed as $10,383.88. Paper cost read 6.67% against a
        3.27% goal — high, but perfectly possible, so nothing objected. It sat
        on the scorecard, the tracker, the FCR and the morning digest until a
        human went looking.

   The first guard cannot help with the second, and that is the whole point of
   this file. 6.67% is not impossible. It is just wrong. The only thing that
   makes it *recognisable* is the store's own history.

   ★ LEAF MODULE. Imports NOTHING. It is handed numbers and returns a verdict,
   so the threshold can be driven against the real invoice history rather than
   argued about.

   ⚠️⚠️ ONE THRESHOLD FOR ALL CATEGORIES WOULD BE WORSE THAN NOTHING, and the
   live data says so loudly. Measured across 2,530 real invoice lines:

       paper   517 lines · median $1,047 · biggest ever $2,408
       food  1,289 lines · median   $368 · biggest ever $15,849

   $10,383 is absurd for paper and unremarkable for food, whose 95th percentile
   is $9,602. A global rule tuned to catch the paper mistake would flag a normal
   food truck several times a month, and a rule loose enough not to would never
   have caught anything. So the comparison is ALWAYS against the same side's own
   history and never against a number written here.

   ⚠️ IT ASKS, IT DOES NOT REFUSE. A genuinely large invoice happens — a
   quarterly stock-up, a corrected double order. Blocking it would teach people
   to work around the page, and a store that cannot enter a true number will
   enter a false one. This returns a question; the caller confirms.

   ⚠️ NO OPINION WITHOUT EVIDENCE. Under MIN_HISTORY lines on that side it stays
   silent — a brand-new store has no idea what normal looks like yet, and
   guessing at one would make the first month unusable.

   ⚠️ NEGATIVES ARE NEVER FLAGGED. `tfood`/`tpaper` are transfers and are
   legitimately ± ("Transfer — Food (± )"). A transfer out is not an outlier,
   it is the feature working.
   ============================================================================ */

/* How far past the biggest thing ever seen on that side counts as "ask".
   1.5 was chosen against the real data, not picked for roundness:
     paper, this month + last:  biggest $2,021.22  → asks above $3,031.83
                                 the bad line was $10,383.88, caught
                                 a normal line is  $1,725.04, silent
     food,  this month + last:  biggest $11,375.58 → asks above $17,063.37
                                 the largest food line in the entire history is
                                 $15,849.84, so even the record-holder passes. */
export const OUTLIER_FACTOR = 1.5;

/* Below this many prior lines on the same side, say nothing. */
export const MIN_HISTORY = 20;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param amount        the figure just typed
 * @param priorAmounts  every prior amount on the SAME side, current record and
 *                      the previous month. The caller already holds both.
 * @returns { ask, biggest, threshold, times } — `ask` false means no opinion.
 */
export function outlierCheck(amount, priorAmounts) {
  const a = num(amount);
  const none = { ask: false, biggest: null, threshold: null, times: null };
  if (a === null || a <= 0) return none;

  const prior = (Array.isArray(priorAmounts) ? priorAmounts : [])
    .map(num)
    .filter((v) => v !== null && v > 0);
  if (prior.length < MIN_HISTORY) return none;

  const biggest = Math.max(...prior);
  if (!(biggest > 0)) return none;
  const threshold = biggest * OUTLIER_FACTOR;
  if (a <= threshold) return { ...none, biggest, threshold };

  return { ask: true, biggest, threshold, times: a / biggest };
}

/* The sentence a person reads. Written to be answerable at a glance: the number
   they typed, what normal looks like, and nothing else. No ratios, no
   percentiles, no mention of thresholds — the question is "did you mean this",
   and every extra clause makes it easier to click through without reading. */
export function outlierMessage(amount, sideLabel, biggest) {
  const money = (v) => Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `${money(amount)} is a lot for one ${sideLabel} line.\n\n`
    + `The biggest ${sideLabel} invoice in the last two months is ${money(biggest)}.\n\n`
    + `Add it anyway?`;
}
