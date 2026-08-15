// FCR reference data extracted from the Gate City FCR Workbook.
// *** DO NOT DELETE *** — FCRPage.jsx imports this permanently.
// This is NOT a one-time backfill file, despite the name.
/* historicalProfit: net profit % by month, by YEAR.
   ⚠️ RELABELLED Aug 9 2026. Every year key here was one year too early. The
   column called p2023 held 2024's results, p2024 held 2025's, and p2025 held
   2026's — which is why Aug-Dec "2025" read as 0: those are 2026 months that
   have not closed. Nothing was missing; the labels were wrong, and the screen
   Matt shows visiting operators had been off by a year the whole time.
   PROVED against the store's own Fee Calculation Reports for Aug-Dec 2025:
   the 31-AUG-25 statement prints Aug 2025 = 12.13% and Aug 2024 = 12.08%,
   which are exactly the numbers that sat under p2024 and p2023. Weighting the
   p2024 column by real 2025 monthly sales reproduces that statement's stated
   YTD of 12.74% to within 0.01 points; the as-written labels miss it by 2.20.
   So the shift is uniform across all twelve months, not just the blank ones.
   2023 is now genuinely absent and renders as a dash until those FCRs are
   pulled. FCRPage reads these as `p${year}`, so nothing else had to change. */
// ytd: year-to-date average $ and % per line item (Sheet cols E/F).
// Used by FCRPage for the YTD column and the historical-profit reference row.
export const FCR_REFERENCE = {
  "historicalProfit": {
    "01": {
      "p2024": 0.0996,
      "p2025": 0.1082,
      "p2026": 0.0875
    },
    "02": {
      "p2024": 0.1399,
      "p2025": 0.1209,
      "p2026": 0.1556
    },
    "03": {
      "p2024": 0.1313,
      "p2025": 0.1485,
      "p2026": 0.1212
    },
    "04": {
      "p2024": 0.1355,
      "p2025": 0.126,
      "p2026": 0.132
    },
    "05": {
      "p2024": 0.1279,
      "p2025": 0.1303,
      "p2026": 0.0983
    },
    "06": {
      "p2024": 0.1264,
      "p2025": 0.1313,
      "p2026": 0.1226
    },
    "07": {
      "p2024": 0.1241,
      "p2025": 0.1288,
      "p2026": 0.1289
    },
    "08": {
      "p2024": 0.1208,
      "p2025": 0.1213,
      "p2026": 0
    },
    "09": {
      "p2024": 0.0887,
      "p2025": 0.1018,
      "p2026": 0
    },
    "10": {
      "p2024": 0.1213,
      "p2025": 0.1462,
      "p2026": 0
    },
    "11": {
      "p2024": 0.122,
      "p2025": 0.1107,
      "p2026": 0
    },
    "12": {
      "p2024": 0.1193,
      "p2025": 0.1264,
      "p2026": 0
    }
  },
  "ytd": {
    "LY Sales": { "avg": 0, "pct": 0 },
    "Growth": { "avg": 86629.80811, "pct": 0 },
    "Est Sales": { "avg": 807976.4667, "pct": 0.113 },
    "Last Month's Numbers": { "avg": 0, "pct": 0 },
    "Misc. Revenue": { "avg": -80.79764667, "pct": -0.0001 },
    "Food Cost": { "avg": 225829.4224, "pct": 0.2795 },
    "Paper Cost": { "avg": 29491.14103, "pct": 0.0365 },
    "Wages": { "avg": 171937.3921, "pct": 0.2128 },
    "Wage Taxes": { "avg": 14624.37405, "pct": 0.0181 },
    "Team Member Expenses": { "avg": 9776.515247, "pct": 0.0121 },
    "Marketing/Giveaways": { "avg": 9857.312893, "pct": 0.0122 },
    "Discounts": { "avg": 2262.334107, "pct": 0.0028 },
    "Repairs and Maintenance": { "avg": 8160.562313, "pct": 0.0101 },
    "Restaurant Supplies And Expenses": { "avg": 9453.32466, "pct": 0.0117 },
    "Optional Equipment And Facilties": { "avg": 1050.369407, "pct": 0.0013 },
    "Other Business Expenses": { "avg": 3231.905867, "pct": 0.004 },
    "Additional FCR Expenses": { "avg": 5251.847033, "pct": 0.0065 },
    "Cash Management": { "avg": 161.5952933, "pct": 0.0002 },
    "Beyond the Resteraunt": { "avg": 17209.89874, "pct": 0.0213 },
    "Market Acceleration Program": { "avg": 969.57176, "pct": 0.0012 },
    "Business Insurance": { "avg": 2908.71528, "pct": 0.0036 },
    "Utilities": { "avg": 9210.93172, "pct": 0.0114 },
    "Rent": { "avg": 48478.588, "pct": 0.06 },
    "Propery Tax": { "avg": 4201.477627, "pct": 0.0052 },
    "Additional Occupancy Expenses": { "avg": 0, "pct": 0 },
    "Licences And Other Taxes": { "avg": 565.5835267, "pct": 0.0007 },
    "Bank Card and Fees": { "avg": 14599.26084, "pct": 0.0173 },
    "Equipment Rent": { "avg": 5000.0, "pct": 0.006188299049 },
    "Business Service Fee": { "avg": 300.0, "pct": 0.0003712979429 },
    "Franchise Fee Credits": { "avg": 0, "pct": 0 },
    "Total Expenses": { "avg": 594451.3263, "pct": 0 },
    "Operating Profit": { "avg": 213525.1404, "pct": 0.2642714846 },
    "Base Profit": { "avg": 1000.0, "pct": 0.00123765981 },
    "Base Operating Fee": { "avg": 115896.47, "pct": 0.143440403 },
    "Net Profit": { "avg": 96628.67038, "pct": 0.1195934218 }
  }
};

/* Monthly sales history, from the workbook's side table (July 2026 tab, read
   Aug 1 2026). FCRPage's AUTO-BUILT months use this for last-year sales until
   the Hub's own record covers the month — the Hub wins whenever it has days.
   July 2025 note: the side table says $762,709 but the workbook's own July
   2026 statement says $766,635.47 — the sheet disagrees with itself by ~$3.9k;
   the statement's figure is kept here because every hand tab used it. */
/* ★★ WHOSE NUMBERS THESE ARE, STATED IN THE DATA ITSELF ══════════════════════
   storeConfig.js calls `lastYearMonthlySales` "the worst clone hazard in the
   repo", and this is the file it means: "a NEW STORE SILENTLY READS GATE CITY'S
   SALES AS THEIR LAST YEAR for a whole year — every growth number and every
   projected finish measured against a restaurant they have never seen."

   ⚠️⚠️ A CLONE COPIES THIS FILE. That is the part that makes it dangerous. The
   figures were correctly kept out of the browser bundle and put behind
   /api/fcr-data at tier 3 — but a second store standing up the Hub clones the
   REPO, gets this file verbatim, and their own Worker then serves them our
   numbers through a route that is working exactly as designed. Nothing is
   misconfigured and nothing looks wrong.

   ⇒ SO THE DATA SAYS WHO IT BELONGS TO, and /api/fcr-data refuses to serve it
   to anybody else. A clone gets empty history and an honest dash rather than a
   confident number about a restaurant they have never seen.

   ⚠️ IT FAILS SAFE AND NEEDS NO ACTION FROM A CLONE. They do not have to
   remember to empty this file; forgetting is the normal case and it is now
   harmless. A store that DOES enter its own history changes this stamp to its
   own FSR in the same edit, which is the moment it is impossible to forget.

   ⚠️ IT IS THE FSR, NOT THE NAME. A store renames itself; its FSR number is
   what CFA calls it and is what `storeConfig.identity.fsr` already holds. */
export const REFERENCE_FSR = "04010";

export const LY_MONTHLY_SALES = {
  "2025": {
    "01": 642585, "02": 673429, "03": 750183, "04": 771260,
    "05": 765296, "06": 752872, "07": 766635.47, "08": 758957,
    "09": 713217, "10": 790077, "11": 684109, "12": 754818,
  },
};
