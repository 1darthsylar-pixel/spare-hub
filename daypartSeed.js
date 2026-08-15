/* daypartSeed.js — THE DAYPART TABLE, SERVER SIDE ONLY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sweep finding 11 (Aug 9 2026). These two months used to be module-level
 * consts inside LaborPlanner.jsx, which meant they compiled verbatim into the
 * Labor chunk — a file that answers any anonymous request with no account.
 *
 * What that gave away: six weekdays × four dayparts × two months of SALES,
 * with the matching PAID HOURS beside them. June Monday sums to about $29,962
 * and June Friday to about $37,076, and sales-per-labor-hour falls straight out
 * of the two arrays together. That is the store's revenue shape, reconstructable
 * by anyone who knows the filename.
 *
 * ⚠️ THE AUG 8 FIX MISSED THIS AND LOOKED LIKE IT HAD NOT. That commit stripped
 * four named leaders' individual hours from this same file and added a comment
 * saying the chunk is "downloadable by anyone" — 45 lines BELOW these arrays,
 * which it never touched. A fix that documents the danger while leaving the data
 * is the most convincing kind of miss.
 *
 * ⚠️ IMPORTED ONLY BY worker.js, WHICH SERVES IT ON A TIER-3 ROUTE. One import
 * from a .jsx and the whole table is back in the browser, silently — the same
 * warning fcrYtdSeed.js and profitShareSeed.js carry, for the same reason.
 *
 * ⚠️ THIS IS A SEED, NOT STORAGE, AND THE DIFFERENCE IS LOAD-BEARING.
 * `gcfcr-daypart-labor-v1` has never been written, so the card has always shown
 * a hardcoded month while looking like entered data. Input Health is amber
 * because of that and it is RIGHT to be. Serving these numbers through the
 * normal storage read would turn that amber green while nothing had been saved,
 * which is why this has its own route instead.
 *
 * Source: CFA AnalyticsHub → Labor Productivity Analytics → Labor Cost, time
 * granularity "Display Daypart", Sundays included. Per weekday Mon..Sat, in the
 * order DP_DOW lists them in LaborPlanner.jsx.
 */

export const DP_SEED_JUNE = {
  id: "2026-06", label: "June 2026",
  sales: {
    Breakfast: [4501, 4595, 4816, 5983, 6417, 5081],
    Lunch: [9794, 9584, 9618, 10415, 11041, 10377],
    Afternoon: [6366, 6044, 6122, 6702, 7830, 7890],
    Dinner: [9301, 9707, 9863, 11259, 11788, 10905],
  },
  hours: {
    Breakfast: [85.9, 87.4, 85.7, 89.3, 88.9, 77.5],
    Lunch: [107.4, 105.7, 105.4, 106.9, 121.2, 105.5],
    Afternoon: [70.3, 68.7, 68.4, 70.5, 83.1, 71.5],
    Dinner: [115.3, 119.2, 115.5, 133.0, 140.1, 137.9],
  },
  late: [0.2, 0.2, 0.9, 0.2, 0.1, 0.3],
};

/* ⚠️ July is MONTH TO DATE (through Jul 25), not a closed month. */
export const DP_SEED_JULY = {
  id: "2026-07", label: "July 2026",
  sales: {
    Breakfast: [4044, 4337, 4619, 5054, 5763, 4065],
    Lunch: [9711, 9208, 9234, 9669, 10551, 8961],
    Afternoon: [6064, 6049, 6243, 6695, 7582, 6474],
    Dinner: [9046, 9436, 9789, 10004, 10778, 7344],
  },
  hours: {
    Breakfast: [85.9, 90.5, 84.2, 88.0, 89.2, 58.5],
    Lunch: [106.5, 112.5, 103.3, 108.0, 122.3, 101.8],
    Afternoon: [68.1, 71.4, 69.3, 71.8, 82.1, 69.5],
    Dinner: [114.4, 120.5, 119.5, 133.9, 136.2, 101.2],
  },
  // Latenight from the report, kept for completeness. The console models four
  // dayparts; at 0.2-0.8 hrs/day this is noise and is deliberately NOT folded
  // into Dinner, which would quietly inflate it.
  late: [0.8, 0.4, 0.3, 0.2, 0.2, 0.2],
};

export const DP_SEED_MONTHS = [DP_SEED_JUNE, DP_SEED_JULY];
