/* guestSeed.js — CHICK-FIL-A'S SCORING OF THIS STORE, SERVER SIDE ONLY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sweep finding 12 (Aug 9 2026). These two lists used to be module-level consts
 * in GuestExperience.jsx, so they compiled into a chunk that answers ANY
 * anonymous request. With no account you could read this restaurant's
 * Likelihood to Return of 63 against a market of 85, Fast Service 58 against
 * 72, the June Smart Shop index of 85 against a chain 87 formally graded
 * "Needs Improvement", and 2nd Mile Service at 59.
 *
 * ⚠️ THESE NUMBERS COME OFF analytics.cfahome.com, WHICH IS SSO-WALLED
 * PRECISELY SO THEY ARE NOT PUBLIC. worker.js says it in its own words: "CEM
 * and Smart Shop are typed in by hand from a report behind SSO." Publishing
 * them from our own bundle undoes that on Chick-fil-A's behalf.
 *
 * ⚠️ THE TILE GATE RAN TOO LATE TO HELP. GuestExperience is tier 2 and the edit
 * control is tier 3, but both of those decide what RENDERS — the bytes have
 * already landed on the device by then. A gate in a component cannot protect
 * data that shipped with the component.
 *
 * ⚠️ IMPORTED ONLY BY worker.js, SERVED ON GET /api/guest-seed. One import from
 * a .jsx and every score is back in the browser, silently.
 *
 * ⚠️ WHAT DELIBERATELY DID **NOT** MOVE: the metric names and the Smart Shop
 * category names and weights. Those are Chick-fil-A standard, identical at
 * every store, and carry no figure about this one. They stay client-side
 * because the editor and the paste importer need them to build a blank month
 * before any data has loaded — see CEM_METRIC_ORDER and SHOP_CATEGORY_TEMPLATE
 * in GuestExperience.jsx.
 */

// ── CEM: the 4/22–7/20/2026 Comparison Report (Gate City n=1164) ────────
// Core guest measures only — the report's long-tail breakdowns run on tiny
// samples and are noise. One entry = one report period.
export const CEM_SEED = [
  {
    id: "2026-07", label: "Jul 2026 (90-day)", count: 1164,
    metrics: [
      { id: "sat",       name: "Overall Satisfaction",       store: 70, market: 80, top: 83 },
      { id: "taste",     name: "Taste of Food",              store: 71, market: 80, top: 83 },
      { id: "fast",      name: "Fast Service",               store: 58, market: 72, top: 78 },
      { id: "friend",    name: "Attentive / Friendly",       store: 68, market: 81, top: 84 },
      { id: "clean",     name: "Cleanliness",                store: 68, market: 77, top: 81 },
      { id: "placing",   name: "Ease of Placing Order",      store: 75, market: 83, top: 85 },
      { id: "receiving", name: "Ease of Receiving Order",    store: 69, market: 79, top: 83 },
      { id: "portion",   name: "Portion Size of Food",       store: 64, market: 70, top: 73 },
      { id: "accuracy",  name: "Order Accuracy",             store: 95, market: 96, top: 96 },
      { id: "return",    name: "Likelihood to Return (30d)", store: 63, market: 85, top: 88 },
    ],
  },
];
/* ── Smart Shop ──────────────────────────────────────────────────────────
   Index-score trend transcribed from the Smart Shop "Index Score Trend"
   chart (store vs chain-wide, Jul 2025–Jun 2026). ⚠️ READ OFF THE IMAGE —
   verify / correct any month in the editor. Only Jun 2026 has full WHED
   category detail (that's all the report screenshot showed). */
export const SHOP_SEED = [
  { id: "2025-07", label: "Jul 2025", index: 88, chain: 88 },
  { id: "2025-08", label: "Aug 2025", index: 90, chain: 89 },
  { id: "2025-09", label: "Sep 2025", index: 90, chain: 88 },
  { id: "2025-10", label: "Oct 2025", index: 88, chain: 88 },
  { id: "2025-11", label: "Nov 2025", index: 86, chain: 88 },
  { id: "2025-12", label: "Dec 2025", index: 87, chain: 88 },
  { id: "2026-01", label: "Jan 2026", index: 87, chain: 88 },
  { id: "2026-02", label: "Feb 2026", index: 88, chain: 88 },
  { id: "2026-03", label: "Mar 2026", index: 88, chain: 88 },
  { id: "2026-04", label: "Apr 2026", index: 87, chain: 88 },
  { id: "2026-05", label: "May 2026", index: 87, chain: 88 },
  {
    id: "2026-06", label: "Jun 2026", index: 85, chain: 87, level: "Needs Improvement",
    categories: [
      { name: "Craveable Food",              weight: 33, score: 86 },
      { name: "Attentive & Friendly Team",   weight: 17, score: 88 },
      { name: "Fast & Accurate Service",     weight: 23, score: 86 },
      { name: "2nd Mile Service",            weight: 12, score: 59 },
      { name: "Welcoming Environment",       weight: 15, score: 97 },
    ],
  },
];
