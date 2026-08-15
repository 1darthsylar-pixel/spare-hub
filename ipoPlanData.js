/* ══════════════════════════════════════════════════════════════════════════
   ipoPlanData.js — THE AUTHORED IPO QUARTER PLANS. SERVER SIDE ONLY.

   ★ LEAF. Imports nothing.

   🐛🐛 THIS WAS PUBLIC, AND IN THE MAIN BUNDLE. Aug 8 2026. These plans lived in
   ipoPlan.js, which App.jsx imports — so they shipped inside the entry chunk
   every anonymous visitor downloads, not even behind a lazy tile. Inside: every
   cost category the store runs over Chick-fil-A benchmark, and the dollar
   variance on each. It reads as a public list of the restaurant's weak spots
   with a price against every one.

   App.jsx imported it to COUNT CHECKBOXES for a dashboard pill. The count needed
   the shape; it never needed the numbers, and the numbers came anyway.

   ⚠️ ONLY worker.js MAY IMPORT THIS. wrangler builds the worker separately from
   vite's client build, so a module imported nowhere else never lands in
   dist/assets. One import from any .jsx puts the whole plan back in the browser.

   ⚠️ ipoPlan.js KEEPS THE LOGIC — quarterOf, keyFor, ord, weekShells,
   latestAuthored and ipoQuarter. Those are date maths and a week skeleton and
   disclose nothing, and the client still imports them. They take the plans as
   an ARGUMENT now, so there is still exactly one implementation serving both
   the worker and the browser.
   ══════════════════════════════════════════════════════════════════════════ */

export const QUARTER_PLANS = {
  "2026-Q3": {
    fin: {
      caption: "3-Month Spend \u00b7 Apr\u2013Jun 2026",
      cols: ["Apr", "May", "Jun", "3-Mo"],
      rows: [
        { label: "Repairs & Maintenance", vals: ["11,650.14", "9,118.90", "3,310.41", "24,079.45"], strong: true },
        { label: "Repairs", vals: ["1,499.47", "4,136.14", "1,449.27", "7,084.88"], sub: true },
        { label: "FCR-Maintenance", vals: ["10,017.07", "4,982.76", "1,581.92", "16,581.75"], sub: true },
        { label: "Team Member Training", vals: ["949.02", "949.02", "1,008.95", "2,906.99"], strong: true },
      ],
      note:
        "R&M down 72% Apr\u2192Jun — $11,650 to $3,310. The #1 critical IPO item is already trending right; hold it there with the contracts and the $500 approval gate.",
      footnote:
        "R&M sub-lines don't fully tie to the parent total in Apr (+$133.60) and Jun (+$279.22) — a minor third R&M sub-account isn't captured in the source screenshots. Training = Team Member Training only (Education Assistance and Training Materials were $0 all three months).",
    },
    weeks: [
      {
        dollars: 98375,
        cats: [
          {
            id: "rm", name: "Repairs & Maintenance", tier: "Critical", variance: 55703, pct: "+0.60%",
            detail: "Repairs +$34,417 · Maintenance +$21,286",
            note: "90-day pull is done — see the ledger above. R&M is down 72% Apr→Jun already; the remaining items are about locking that gain in, not finding it.",
            items: [
              "Pull all repair/maintenance invoices from past 90 days",
              "Calculate emergency vs. preventive repair ratio",
              "Negotiate annual service contracts (HVAC, fryers, ice machines)",
              "Implement weekly equipment check log",
              "Set $500 approval threshold for all unplanned repair spending",
              "Identify deferred maintenance driving emergency costs",
            ],
          },
          {
            id: "paper", name: "Paper Cost", tier: "Critical", variance: 42672, pct: "+0.46%",
            detail: "$344K actual vs $302K target · 3.74% vs 3.27%",
            items: [
              "Calculate paper cost per transaction vs. CFA benchmark",
              "Observe bag-to-order sizing at dispatch — right-size all orders",
              "Implement napkin & condiment distribution controls",
              "Audit 3rd-party delivery packaging vs. delivery sales volume",
              "Retrain all positions on proper packaging selection",
              "Add paper cost % to weekly shift leader scorecard",
            ],
          },
        ],
      },
      {
        dollars: 51670,
        cats: [
          {
            id: "food", name: "Food Cost", tier: "Critical", variance: 35269, pct: "+0.38%",
            detail: "27.94% actual vs 27.56% target",
            items: [
              "Pull 30-day waste log by daypart — rank top waste categories",
              "Conduct observed portion control audit on all proteins",
              "Review hot case holding times and dump frequency by item",
              "Compare production sheets to actual hourly sales",
              "Validate all food transfer records for accuracy",
              "Assign corrective action owners for top 3 waste items",
            ],
          },
          {
            id: "wages", name: "Wages", tier: "Critical", variance: 16401, pct: "+0.18%",
            detail: "21.47% actual vs 21.29% target",
            items: [
              "Pull scheduling vs. sales-per-labor-hour for past 4 weeks",
              "Identify all overtime occurrences — who, how much, and why",
              "Review labor % by daypart vs. CFA benchmark targets",
              "Evaluate current staffing model against actual sales volume",
              "Implement schedule approval process to prevent unauthorized OT",
            ],
          },
        ],
      },
      {
        dollars: 21038,
        cats: [
          {
            id: "supplies", name: "Restaurant Supplies", tier: "Medium", variance: 13853, pct: "+0.15%",
            detail: "Kitchen +$5,683 · Linen +$4,935 · Cleaning +$2,537",
            items: [
              "Linen: audit items sent vs. returned from laundry service",
              "Kitchen Supplies: small wares inventory — find shrinkage/breakage",
              "Cleaning: verify dilution ratios on all chemical dispensers",
              "Establish bi-weekly supply count with team leader",
              "Lock supply storage and implement sign-out log",
            ],
          },
          {
            id: "utilities", name: "Utilities / Telephone", tier: "Medium", variance: 3923, pct: "+0.04%",
            detail: "Telephone jumped from $716 to $4,229 this period",
            items: [
              "Pull all telecom invoices — review line-by-line",
              "Confirm no unauthorized phone lines or services were added",
              "Compare current plan to lower-cost alternatives",
              "Review operator cell phone expense vs. policy ($1,254 actual)",
            ],
          },
          {
            id: "misc", name: "Miscellaneous Expenses", tier: "Medium", variance: 3262, pct: "+0.04%",
            detail: "General Misc +$3,134 · Meals +$128",
            items: [
              "Pull and categorize all miscellaneous expense receipts",
              "Reclassify charges that belong in named categories",
              "Require pre-approval for all discretionary misc. spending",
            ],
          },
        ],
      },
      {
        dollars: 2756,
        cats: [
          {
            id: "wagetax", name: "Wage Taxes & Team Expenses", tier: "Monitor", variance: 2756, pct: "+0.02%",
            detail: "Wage Taxes +$1,381 · Team Member Expenses +$1,375",
            items: [
              "Review overtime impact on total FICA tax burden",
              "Ensure all team events are pre-budgeted and approved",
              "Set annual team events budget line and track monthly",
              "Add both categories to monthly IPO review checklist",
            ],
          },
        ],
      },
    ],
  },
};
