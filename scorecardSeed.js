/* ══════════════════════════════════════════════════════════════════════════
   scorecardSeed.js — THE FY26 OPERATOR SCORECARD. SERVER SIDE ONLY.

   ★ LEAF. Imports nothing.

   🐛 THIS SHIPPED TO THE BROWSER. Aug 8 2026. It lived in BusinessScorecard.jsx
   as `SEED`, so the tile's own chunk carried this restaurant's whole FY26
   operator results next to the CFA benchmarks they are measured against:

     - Net Profit %, and the region average beside it
     - Labor Cost Gap, Food Cost Gap, Repairs & Maintenance overrun
     - Average Wage, Retention, Turnover
     - Catering and On Demand sales in dollars
     - Speed of Service, Order Accuracy, OSAT, Food Safety score
     - Director / AD / Team Leader / Trainer headcount against target
     - Operator Contest rank (#37 in both windows)

   Tier 3 gating on the tile never mattered. The gate decides what RENDERS; the
   chunk downloads either way, and it answers HTTP 200 to anyone. Same class as
   the food gaps, the inventory gaps and the supplier roster, found by the same
   question: what does the browser download, not who can call this route.

   ⚠️ MOVED, NOT DELETED, AND THE MERGE IS WHY. This is not decoration. The
   tile's load merges these values into the live record to FILL BLANKS — a
   fresh row gets its seed number, an edited one is left alone (see the two
   bug notes on that merge in BusinessScorecard.jsx, both of which were
   revert-and-persist). Deleting the table would stop new rows from ever
   getting their corp figures.

   ⚠️ Q2 IS THE AUTHORITATIVE COLUMN. Q1/Q3/Q4 here are cold-start fallbacks
   only; live KV keeps whatever has been entered.

   ⚠️ ONLY worker.js MAY IMPORT THIS. wrangler builds the worker separately from
   vite's client build, so a module imported nowhere else never lands in
   dist/assets. One import from any .jsx puts the whole scorecard back in the
   browser.

   ⚠️ SHAPE AND LABELS ARE THE CONTRACT. The merge matches rows by `label` and
   sections by `id`, so renaming either here silently stops that row merging
   rather than throwing. Change a label only alongside the stored record.
   ══════════════════════════════════════════════════════════════════════════ */

// q: [Q1, Q2, Q3, Q4]. Only the Q2 slot is authoritative here — it's what
// the merge on load pushes into KV. Q1/Q3/Q4 in this seed are fallbacks for
// a cold start only; live KV keeps whatever you've already entered.
function seedRow(label, goal, bench, q, status, extra = {}) {
  return { label, goal, bench, q, status, note: "", ...extra };
}

export const SEED = {
  period: "FY26",
  updated: "7/16",
  activeQ: 2, // index → Q3
  sections: [
    {
      id: "revenue",
      colMode: "ytd",
      title: "Revenue Generation",
      short: "Revenue",
      benchLabel: "Bench = Region Avg · columns are cumulative YTD",
      rows: [
        seedRow("Sales Increase", "5%", "3.40%", ["", "11.30%", "", ""], "hit"),
        seedRow("Check Average", "$15.00", "$15.08", ["", "$14.62", "", ""], "close"),
        seedRow("Transaction Count Increase", "6%", "3.32%", ["", "11.13%", "", ""], "hit"),
        seedRow("Frequency Increase", "3%", "", ["", "", "", ""], "pending"),
        seedRow("Mobile %", "40%", "36.24%", ["", "33.79%", "", ""], "miss"),
        seedRow("Catering Sales", "$180,483", "$211,112", ["", "$177,455", "", ""], "hit", { note: "YTD 6/26 — pacing ~2x goal" }),
        seedRow("On Demand Sales", "$350,258", "$420,023", ["", "$521,100", "", ""], "hit"),
        seedRow("Drive-Thru % of Sales", "65%", "61.55%", ["", "59.90%", "", ""], "miss"),
        seedRow("Avg. Peak Hour Cars", "140", "139", ["", "130", "", ""], "miss"),
        seedRow("DT Avg. Peak Hour Sales", "$2,100", "$2,114", ["", "$1,888", "", ""], "miss"),
      ],
    },
    {
      id: "operations",
      colMode: "quarter",
      title: "Operations Management",
      short: "Operations",
      benchLabel: "Bench = Top 20% · true quarter actuals",
      rows: [
        seedRow("OSAT", "72%", "78%", ["73%", "69%", "", ""], "close"),
        seedRow("Taste", "70%", "77%", ["76%", "71%", "", ""], "hit"),
        seedRow("Speed of Service", "70%", "76%", ["59%", "57%", "", ""], "miss"),
        seedRow("Order Accuracy", "96%", "96%", ["94%", "94%", "", ""], "miss"),
        seedRow("Attentive & Courteous", "70%", "80%", ["71%", "67%", "", ""], "close"),
        seedRow("Food Safety Score", "1", "", ["2", "", "", ""], "miss"),
        seedRow("Aha % Days Over 90%", "100%", "23%", ["28%", "23%", "", ""], "miss"),
        seedRow("QIV %", "98%", "96.3%", ["96.0%", "94.9%", "", ""], "miss"),
      ],
    },
    {
      id: "org",
      colMode: "ytd",
      title: "Organizational Development",
      short: "People",
      benchLabel: "Bench = Chain / Region Avg · columns are cumulative YTD",
      rows: [
        seedRow("Directors", "6", "", ["", "3", "", ""], "miss", { bar: true, note: "Ops · HR · LD · Mktg · Kitchen · FOH" }),
        seedRow("Assistant Directors", "8", "", ["", "6", "", ""], "close", { bar: true, note: "2 in queue" }),
        seedRow("Team Leaders", "10", "", ["", "8", "", ""], "close", { bar: true, note: "1 seasonal" }),
        seedRow("Trainers", "30", "", ["", "21", "", ""], "miss", { bar: true }),
        seedRow("Team Member Engagement", "Top 20", "54% / 70%", ["", "", "", ""], "pending"),
        seedRow("Retention", ">60", "56.40", ["", "64.97", "", ""], "hit"),
        seedRow("Turnover", "<80", "81.78", ["", "54.49", "", ""], "hit"),
        seedRow("Average Wage", "$18.37", "$17.80", ["", "$18.07", "", ""], "close"),
      ],
    },
    {
      id: "financial",
      colMode: "ytd",
      title: "Financial Management",
      short: "Financial",
      benchLabel: "Bench = Region Avg · columns are cumulative YTD",
      rows: [
        seedRow("Net Profit %", "13%", "11.41%", ["", "12.04%", "", ""], "close"),
        seedRow("Labor Cost Gap", "−1%", "−0.27%", ["", "−0.94%", "", ""], "close"),
        seedRow("Food Cost Gap", "0.25%", "1.03%", ["", "0.37%", "", ""], "close"),
        seedRow("Repairs & Maintenance Gap", "<$2,000/mo", "", ["", "$4,642", "", ""], "miss", { note: "Q3 priority" }),
      ],
    },
    {
      id: "daypart",
      colMode: "ytd",
      title: "Daypart Sales Growth",
      short: "Dayparts",
      benchLabel: "Growth vs goal · columns are cumulative YTD",
      rows: [
        seedRow("Breakfast", "5%", "", ["", "4.20%", "", ""], "miss"),
        seedRow("Lunch", "5%", "", ["", "6.10%", "", ""], "hit"),
        seedRow("Afternoon", "5%", "", ["", "8.00%", "", ""], "hit"),
        seedRow("Dinner", "5%", "", ["", "23.90%", "", ""], "hit"),
      ],
    },
    {
      id: "contest",
      colMode: "ytd",
      title: "Operator Contest Rank",
      short: "Contest",
      benchLabel: "Rank by contest window",
      rows: [
        seedRow("Jalapeño Ranch / Strawberry Hibiscus", "Top 12", "", ["", "#37", "", ""], "miss", { note: "3/9 – 6/6" }),
        seedRow("Honey Pimento / PDF", "Top 12", "", ["", "#37", "", ""], "miss", { note: "6/8 – 8/22" }),
      ],
    },
  ],
};

/* ══ THE SAME SCORECARD WITH THE FIGURES TAKEN OUT ═════════════════════════
   🐛 A STORE THAT IS NOT GATE CITY GOT `{}` HERE, AND THE TILE NEVER LOADED.
   Gating the route was right about the data and wrong about the shape. An
   empty payload makes `hasSeed` false, which makes `seedCopy()` return null,
   which makes `setData(null)` run, which makes BusinessScorecard.jsx render
   "Loading scorecard…" — forever, at a store that had finished loading and
   simply had nothing. Reported from The Village on Aug 12 2026, where the
   tile had sat on that line since the store went live.

   ⇒ A clone gets the SHAPE and none of the numbers. Same six sections, same
   row labels, every figure blank. The store types its own goals into a
   scorecard that already has the right rows in it.

   ★ DERIVED, NEVER RETYPED. Six sections and thirty-six row labels kept by
   hand in two places would drift, and the merge on load matches rows by
   `label` and sections by `id` — so a drifted label stops that row merging
   SILENTLY rather than throwing. One list, two readings of it. Rule 8.

   ⚠️ EVERY ROW IS `pending`, AND THAT IS THE WHOLE POINT, NOT A DETAIL. The
   tile already filters pending out of its score
   (`allRows.filter((r) => r.status !== "pending")`), so a store that has
   typed nothing scores nothing and shows a dash. A template seeded "hit", or
   with 0 in the quarter slots, would paint a green tick on a number nobody
   entered — the exact bug the financials wage guard was written for, and the
   one that gets believed instead of reported.

   ⚠️ `goal` IS BLANK ON PURPOSE, AND IT IS THE COLUMN THIS EXISTS FOR. Every
   other column is a CFA figure the store reads off AnalyticsHub. `goal` is
   the one thing that is their own decision.

   ⚠️ THE NOTES GO TOO. "Q3 priority" and "pacing ~2x goal" are Gate City's
   own working notes, not labels, and they would read as another store's
   commentary on numbers that store never entered.

   ⚠️ `updated` IS BLANK, AND THE MERGE HAS TO KNOW THAT. BusinessScorecard's
   load does `merged.updated = seed.updated` unconditionally and then writes.
   With this template that would blank a store's own date and persist it, so
   that line is guarded on the seed actually carrying one. Do not remove the
   guard while this export exists.

   ⚠️ SERVER SIDE ONLY, exactly like SEED above. One import from any .jsx and
   the real scorecard goes back into the browser bundle with it. */
const blankRow = (r) => ({
  ...r,
  goal: "",
  bench: "",
  /* Length preserved rather than hardcoded to four, so a section that ever
     grows a fifth column blanks all five instead of silently dropping one. */
  q: (Array.isArray(r.q) && r.q.length ? r.q : ["", "", "", ""]).map(() => ""),
  status: "pending",
  note: "",
});

export const BLANK = {
  ...SEED,
  updated: "",
  sections: SEED.sections.map((s) => ({
    ...s,
    rows: (Array.isArray(s.rows) ? s.rows : []).map(blankRow),
  })),
};
