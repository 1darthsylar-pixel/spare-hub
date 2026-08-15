// metricPlaybooks.js
// Standing "when this metric is red, work these" checklists for the KPI cards.
//
// This is a STATIC teaching asset — no live data, no scorecard read, no forecast.
// It answers "the number is bad, now what do I actually check?" for a leader who
// isn't financial. Salvaged from the ChatGPT 10/10/11/10 mockups; the ONLY part of
// their "Recommended Actions" idea that doesn't require data the Hub doesn't have.
//
// Keyed by the eos:scorecard row id the KPI strip already uses:
//   s2 = Food, s3 = Labor, s8 = Cash  (add s1 Sales / s5 Turnover / s6 Evals if wanted)
//
// EDIT THESE. They're seeded with generic CFA best-practice so the structure is real,
// but the steps should be Matt's actual process, in Matt's words. A leader will read
// them literally — anything wrong here teaches the wrong thing.

export const METRIC_PLAYBOOKS = {
  s2: {
    label: "Food Cost",
    when: "over goal",
    steps: [
      "Recount inventory — confirm the last count wasn't off",
      "Review the waste / expo waste log for the period",
      "Verify transfers in and out were all logged",
      "Spot-check portioning and recipe adherence on high-cost items",
      "Match invoices to what was received (shorts / overages)",
    ],
  },
  s3: {
    label: "Labor",
    when: "over goal",
    steps: [
      "Check for open / unfilled shifts that pushed hours onto others",
      "Review punches — early clock-ins, late clock-outs, missed breaks",
      "Compare scheduled hours to actual sales by daypart",
      "Flag anyone approaching 40h before overtime hits",
    ],
  },
  s8: {
    label: "Cash",
    when: "over / short",
    steps: [
      "Recount the drawers involved",
      "Review the void and refund log",
      "Reconcile the change fund",
      "Confirm the deposit matches recorded sales",
    ],
  },
};

// Convenience lookup: returns the playbook for a row id, or null.
export function playbookFor(rowId) {
  return METRIC_PLAYBOOKS[rowId] || null;
}
