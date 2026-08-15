/* ══════════════════════════════════════════════════════════════════════════
   fcrYtdSeed.js — THE 30-JUN-26 YTD COLUMN. SERVER SIDE ONLY.

   ★ LEAF. Imports nothing.

   🐛 THIS SHIPPED TO THE BROWSER. Aug 9 2026 sweep, finding 5. It lived in
   FCRPage.jsx as `SEED_YTD`, a module-level const consumed by `useState`, so it
   compiled straight into `dist/assets/FinancialSuite-*.js`. Anyone on the
   internet, with no account, could read Gate City's FY2026 January–June profit
   and loss in full:

     - $4,847,858.80 sales and $583,706.31 net profit
     - $695,378.82 base operating fee
     - all 26 expense lines, including $1,031,786.15 wages,
       $1,355,169.69 food cost and $290,871.53 rent

   ⚠️ THE AUG 8 FIX MISSED THIS BY ONE FILE, AND ITS VERIFICATION SAID SO
   WITHOUT ANYONE NOTICING. Commit 00a27b9 moved fcrProjectionData.js and
   fcrReferenceData.js behind /api/fcr-data and proved "0 of 40 sampled figures
   survive in ANY built chunk". That sample was drawn from the two IMPORTED
   modules. This constant was written inline in the React file, so it was never
   in the sample and the check passed while six months of P&L stayed public.
   A verification is only as wide as the list it draws from.

   ⚠️ THE LABELS ARE NOT SECRET AND DELIBERATELY STAY IN THE CLIENT.
   FCRPage renders one input per key of `ytdRec.lines`, so a browser with no
   labels shows a YTD editor with no rows — nothing to type into. The label list
   lives there as YTD_LINE_LABELS; only the DOLLARS moved here. Splitting them
   is the whole point: the shape is the app, the amounts are the business.

   Served inside GET /api/fcr-data, which already gates at rank >= 6 or the
   Payroll title — the same gate as the Financials tile that opens it.
   ══════════════════════════════════════════════════════════════════════════ */

export const FCR_YTD_SEED = {
  throughYm: "2026-06",
  sales: 4847858.80,
  lines: {
    "Misc. Revenue": -403.40,
    "Food Cost": 1355169.69,
    "Paper Cost": 176994.24,
    "Wages": 1031786.15,
    "Wage Taxes": 87870.70,
    "Team Member Expenses": 58497.37,
    "Marketing / Giveaways": 59164.86,
    "Discounts": 13802.73,
    "Repairs and Maintenance": 48773.55,
    "Restaurant Supplies and Expenses": 56600.96,
    "Optional Equipment and Facilities": 6095.66,
    "Other Business Expenses": 19178.06,
    "Additional FCR Expenses": 31700.17,
    "Cash Management": 927.91,
    "Beyond the Restaurant": 103470.43,
    "Market Acceleration Program": 5817.43,
    "Business Insurance": 17316.33,
    "Utilities": 55045.71,
    "Rent": 290871.53,
    "Property Tax": 25003.84,
    "Additional Occupancy Expenses": 0.0,
    "Licenses and Other Taxes": 3388.94,
    "Bank Card and Fees": 83900.81,
    "Equipment Rent": 30000.0,
    "Business Service Fee": 1800.0,
    "Franchise Fee Credits": 0.0,
  },
  profit: {
    "Base Profit": 6000.0,
    "Base Operating Fee": 695378.82,
    "Net Profit": 583706.31,
  },
};
