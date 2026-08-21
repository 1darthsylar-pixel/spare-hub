/* ============================================================================
   scorecardWeights.test.mjs — do the SHIFT LEADER weights still sum to 100?

       node scorecardWeights.test.mjs

   ⚠️ THIS IS THE SHIFT LEADER SCORECARD, NOT THE BUSINESS SCORECARD.
   `ShiftLeaderScorecard.jsx` and `BusinessScorecard.jsx` are different screens
   with different weights. The file name and every assertion below say which,
   because a green suite that vouched for the wrong screen is worse than no
   suite.

   ★★ THE INVARIANT IS WRITTEN DOWN, WHICH IS THE ONLY REASON THIS FILE MAY
   ASSERT IT. `slScorecardDefs.js` states it directly:

     "`w` is the metric's weight inside its owner's composite, totalling 100
      per owner. `wBoh` is the smaller weight the same metric carries inside
      the BOH composite, for the two speed numbers BOH also moves."

   Nothing here was derived by adding up what the table currently contains.
   The expected total is 100 because the file says 100.

   ⚠️⚠️ WHY THIS IS THE HIGHEST-VALUE TEST IN THE SUITE, AND IT IS NOT CLOSE.
   Every other number in scope renders on a screen where somebody might notice
   it looks wrong. This one does not render at all. If a weight is edited and
   an owner's column stops summing to 100, every composite under that owner
   silently re-scales and LEADERS GET RANKED AGAINST EACH OTHER ON A DIFFERENT
   BASIS than the one they were told about. No error, no red pill, no dash —
   just a quietly different order. The people it misjudges are the last to know.

   ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT ASSERT. There is no written
   definition of what the BOH composite totals once `wBoh` is added on top of
   BOH's own 100, so no total is claimed for it. Asserting a number nobody
   wrote down is the "makes a bug look proven" failure the testing handoff
   calls its most important rule. Section 3 pins only what the comment states:
   that `wBoh` exists on the two speed metrics and nowhere else.
   ============================================================================ */
import { SL_METRIC_DEFS } from "./slScorecardDefs.js";

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ── 0. control ─────────────────────────────────────────────────────────── */
group("0. the real table is loaded (control)");
t("SL_METRIC_DEFS imported", Array.isArray(SL_METRIC_DEFS));
t("it is not empty", SL_METRIC_DEFS.length > 0);
/* ⚠️ AN EMPTY OR MISSING TABLE WOULD MAKE EVERY SUM BELOW 0, and 0 !== 100
   would fail loudly — but a table of one owner would pass section 1 while
   silently dropping two thirds of the scorecard. So the owners are named. */
const owners = [...new Set(SL_METRIC_DEFS.map((m) => m.owner))].sort();
t("all three owners are present", JSON.stringify(owners) === JSON.stringify(["boh", "dt", "foh"]));

/* ── 1. THE INVARIANT ───────────────────────────────────────────────────── */
group("1. every owner's weights total 100, because the file says 100");
for (const owner of owners) {
  const rows = SL_METRIC_DEFS.filter((m) => m.owner === owner);
  const total = rows.reduce((s, m) => s + (Number(m.w) || 0), 0);
  t(`${owner}: ${rows.length} metrics summing to ${total}`, total === 100);
}

/* ── 2. every metric actually carries a weight ──────────────────────────── */
group("2. no metric rides along unweighted");
/* A metric with no `w` contributes nothing to its owner's composite while
   still rendering as a row. It would look scored and count for zero, and the
   sum in section 1 would still be 100, so that check alone cannot see it. */
for (const m of SL_METRIC_DEFS) {
  t(`${m.owner}/${m.key} has a numeric weight`, typeof m.w === "number" && m.w > 0);
}

/* ── 3. wBoh, only where the comment says ───────────────────────────────── */
group("3. wBoh is on the two speed numbers and nowhere else");
const withBoh = SL_METRIC_DEFS.filter((m) => m.wBoh != null).map((m) => m.key).sort();
/* The comment names them as "the two speed numbers BOH also moves". The two
   SOS metrics are the speed numbers; nothing else should carry a BOH share. */
t("exactly two metrics carry wBoh", withBoh.length === 2);
t("they are the two SOS metrics", JSON.stringify(withBoh) === JSON.stringify(["dtSos", "fcSos"]));
for (const m of SL_METRIC_DEFS.filter((x) => x.wBoh != null)) {
  t(`${m.key} wBoh is smaller than its own weight`, m.wBoh < m.w);
  /* ⚠️ "SMALLER" IS THE WORD THE FILE USES. The specific value is not asserted
     because no definition states what it should be — only that it is the
     lesser share BOH carries for a number it only partly moves. */
}
/* ⚠️ NO TOTAL IS CLAIMED FOR THE BOH COMPOSITE WITH wBoh ADDED. Nobody wrote
   down what that should come to, so nothing here pretends to know. */

/* ── 4. keys are unique ─────────────────────────────────────────────────── */
group("4. no duplicate metric keys");
/* A duplicated key would double-count one metric inside a composite and the
   owner sum would still read 100 if the weights were split, so section 1
   cannot catch it. This repo has already shipped one duplicate-key bug in an
   icon map, where the second silently won. */
const keys = SL_METRIC_DEFS.map((m) => m.key);
t(`${keys.length} metrics, ${new Set(keys).size} unique keys`, new Set(keys).size === keys.length);

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
