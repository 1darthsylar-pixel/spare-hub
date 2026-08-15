# CFA reports the Hub eats

analytics.cfahome.com is SSO-walled with no API, so every CFA number enters the
Hub by hand. This is the complete list: which report, the exact export
settings, how often, and where it goes. If a report is not on this list, the
Hub has no home for it yet.

Two ways a report gets in:

- **Type it** — small reports (two or three numbers). No Claude needed.
- **Drop the PDF on Claude** — Claude parses it and hands back a paste block.
  Paste that into the tile's paste button. The tile checks the numbers against
  the report's own total where the report prints one, so a typo is refused
  instead of stored.

## Monthly, after the month closes

| Report | Export settings | Where it goes |
|---|---|---|
| **Target Food Cost Report** ⭐ | The whole page. This is the easiest source for Item Gaps: every subcategory and its Gap $ at Cost in one table, and its "Positive Gap" is the figure the paste is checked against. **Use this instead of the drilldown.** | Food Cost tile → **Paste the drilldown** (via Claude) |
| **Food Cost Drilldown** | Only if the Target report is not to hand. Month = the closed month, "$ Amount \| % of Sales" = **$ Amount**. **One export is enough** — the Hub stores the Subcategories panel only. Exporting once per subcategory (like the seven July pulls on Aug 6) adds nothing; the item panels have no home in the Hub. It gives cents where the Target report rounds to whole dollars, which is its only advantage. | Food Cost tile → **Paste the drilldown** (via Claude) |
| **Inventory Activity Report** (the gap report) | Full month window, all items | Food Cost tile → Gap Watch → **Paste a month** (via Claude) |
| **Labor Productivity by daypart** (CFA Signal → Labor Productivity) | Time granularity = **Display Daypart**, Sundays **included** | Labor tab → Daypart labor → **Paste a month** (via Claude) |
| **Labor Cost Opportunity** (TIR Overview) | All four benchmark pages (Top 10/20/33/50) | Labor tab → **Paste the benchmark** (via Claude) |
| **CEM** (AnalyticsHub Customer Experience Monitor) | 90-day view, with survey count | Guest Experience tile → **Paste the CEM report** (via Claude) |
| **AHA dashboard** | Current month | Shift Leader Scorecard → **Paste the AHA dashboard** (via Claude) |

## On its own schedule

| Report | When | Where it goes |
|---|---|---|
| **Discounts & Giveaways** | Every few days, month to date. Only two numbers matter: **D&G Totals (Food Cost)** and **D&G Totals (Paper Cost)**. Type them straight in — no Claude needed. A newer pull replaces an older one from the same month; the tile keeps a running MTD total. | Food Cost tile → **Giveaways** (food + paper, running MTD) |
| **Smart Shop** | After each shop | Guest Experience tile → **Paste the Smart Shop** (via Claude) |
| **Restaurant Data Report** (AnalyticsHub) | Quarterly | Business Scorecard tile → **Paste the RDR quarter** (via Claude) |
| **FCR / payroll MTD** | With each payroll post | FCR tile → **Paste the FCR** (via Claude). The month-end upload also triggers the monthly money report to #operational-success on its own. |

## Not built yet

| Report | Status |
|---|---|
| **RPIS invoices** | Highest-demand unbuilt item. Whether it becomes a paste importer depends on whether RPIS can export a report at all — Cindy was asked Aug 6 2026. Until then invoices are typed into the Food Cost tile by category. |

## Rules that keep this honest

- **The drilldown wants OVER-target lines only.** Blue bars, positive gaps.
  Under-target subcategories stay out. The lines must sum to the report's own
  "Positive Food Cost Gap" within a dollar or the tile refuses the paste.
- **Do not confuse the drilldown with the Cost of Goods Sold Impact report.**
  One measures gap vs target, the other measures price inflation. They never mix.
- **Do not confuse the gap report with the drilldown.** Inventory Activity is
  per item (cases missing); the drilldown and the Target report are per
  subcategory (dollars vs target). Different sections of the Food Cost tile.
  Telling them apart in one glance: **if the lines are food categories, it is
  Item Gaps. If they are things you order in cases, it is Gap Watch.**
  This is not theoretical — on Aug 6 2026 the drilldown block went into Gap
  Watch, which took it and overwrote the real July inventory month. Gap Watch
  now refuses a drilldown by name, but the two reports still land in two
  different boxes and only you know which is which.
- **A re-pull of the same month replaces, never adds.** Safe to pull D&G or the
  drilldown twice; the newer numbers win.
