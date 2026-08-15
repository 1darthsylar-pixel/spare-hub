/* ============================================================================
   sweepHistory.js — Gate City Hub

   One job: turn a list of filed submissions into ONE ROW PER WEEK for a
   history panel.

   ★ LEAF. Imports nothing. It lives out here rather than inside FoodQuality.jsx
   for the same reason heroColor.js does: a helper that decides what a leader
   sees needs a test that RUNS it, and nothing can import a function out of a
   .jsx component file without a JSX transform. A source grep cannot tell you a
   function works — this repo proved that the hard way with newstore.mjs.

   ═══ THE BUG THIS EXISTS FOR ═══════════════════════════════════════════════

   Matt, Aug 14 2026, with a screenshot: Food Quality's "Recent weeks" listed
   the week of Aug 3 FIVE times and the week of Aug 10 twice — same person,
   same score, same finish time to the minute.

   ⚠️ THE STORAGE WAS RIGHT AND THE SCREEN WAS WRONG. `saveSubmission` appends
   on purpose: a filed sweep is a record, and re-filing must not destroy the
   earlier one. What was wrong is that the Finish button promised "Save again
   (REPLACES this week)" and then the list printed every save. Somebody pressed
   it four times in one minute, each press believing the last had been
   replaced, and was told four times that it had not been.

   ⇒ Newest per week wins the row. The older ones are COUNTED on that row, not
   deleted and not silently dropped.
   ============================================================================ */

/* ⚠️ ORDER IN IS ORDER OUT, AND THAT IS A DEPENDENCY WORTH NAMING.
   `listSubmissions` returns newest first — FoodQuality.jsx already relies on
   that for `recent[0]` — so the FIRST time a week is seen is its latest sweep.
   Re-sorting here would be a second opinion about an order the rest of the
   file already trusts, and the two could disagree.

   ⚠️ A RECORD WITH NO WEEK NEVER MERGES WITH ANOTHER. Sweeps filed before the
   two-arg `saveSubmission` bug was fixed stored `payload` as undefined, so
   `week` is missing on every one of them. Keyed together they would collapse
   into a single row and HIDE real records — the opposite of the bug being
   fixed. Keyed on their own id, each one stands alone. Design rule 1: the old
   shape still reads.

   Returns [{ row, earlier, key }] — `earlier` is how many older submissions
   that week has behind the one being shown, so the screen can say so. */
export function latestPerWeek(rows) {
  const seen = new Map();
  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const p = (r && r.payload) || {};
    /* The index is the last resort, never a random value: this runs during
       render, so a fresh key each pass would churn React's list every time. */
    const key = p.week ? `w:${p.week}` : `r:${(r && r.id) || `i${i}`}`;
    const hit = seen.get(key);
    if (hit) hit.earlier += 1;
    else seen.set(key, { row: r, earlier: 0, key });
  }
  return Array.from(seen.values());
}
