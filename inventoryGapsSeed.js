/* ══════════════════════════════════════════════════════════════════════════
   inventoryGapsSeed.js — JULY 2026 INVENTORY GAPS. SERVER SIDE ONLY.

   ★ LEAF. Imports nothing.

   🐛 THIS SHIPPED TO THE BROWSER. Aug 8 2026. It lived in inventoryGaps.js as
   INV_GAPS_SEED, and FoodCostTracker imports that file for its parser and its
   helpers, so a client chunk carried the whole table: $8,701.90 of product
   unaccounted for across 141 items, the top 25 itemised by name, cost, cases
   missing, cases used and waste credited.

   That is this restaurant's shrink for a month, item by item, downloadable by
   anyone who loaded the site. Same class as the food gaps and the supplier
   roster, found by the same question — what does the browser download, rather
   than who can call this route.

   ⚠️ MOVED, NOT DELETED. The stored July record has been rewritten at least
   once already (Aug 6, when a drilldown paste overwrote it — see the two bug
   notes in inventoryGaps.js), so this code copy is the reference for what the
   Inventory Activity Report actually said. Deleting it to close a hole would
   throw away the only clean copy of the month.
   ⚠️ NOT re-verified against live KV on this pass. It is treated as a
   first-run fallback either way: the tile merges KV OVER this, so a month
   present in the database always wins and this can only ever fill a blank.

   ⚠️ ONLY worker.js MAY IMPORT THIS. wrangler builds the worker separately from
   vite's client build, so a module imported nowhere else never lands in
   dist/assets. One import from any .jsx puts the table straight back in the
   browser.

   ⚠️ THE PARSER AND THE HELPERS STAYED BEHIND on purpose. parseGapPaste,
   mergeInvGaps, wasteUnderLogged, invMonthLabel, prevYm and INV_GAPS_KEY are
   all code, not data, and FoodCostTracker needs them in the browser to read a
   paste. Only the numbers moved.

   Shape, unchanged from where it used to live:
     { [ym]: { label, total, unmappedTotal,
               items: [{ name, cost, qty, used, waste, unmapped? }] } }
   ══════════════════════════════════════════════════════════════════════════ */

/* July 2026 — parsed from the Inventory Activity Report Matt dropped
   Aug 1 2026 (6/30–7/31, 141 items, $8,701.90 total missing; $785.52 of
   it unmapped). Top 25 by missing cost. */
export const SEED = {
  "2026-07": {
    label: "July 2026",
    total: 8701.90,
    unmappedTotal: 785.52,
    items: [
      { name: "Potato, Waffle 6/5 Lb Bag", cost: 1054.59, qty: 27.9, used: 780.0, waste: 0.75 },
      { name: "Sugar, 50# Bags 50 Lb", cost: 493.25, qty: 15.2, used: 82.25, waste: 0.12 },
      { name: "Icedream, Mix 3/1.5", cost: 450.13, qty: 11.11, used: 149.5, waste: 5.65 },
      { name: "Sauce, Honey 576 Ct Case", cost: 429.43, qty: 12.17, used: 17.83, waste: 0.0 },
      { name: "Soda, Hy Sprite 5 Gallon", cost: 427.46, qty: 3.33, used: 23.75, waste: 0.0 },
      { name: "Bag, Kids Meal 600 Ct", cost: 362.1, qty: 10.0, used: 10.0, waste: 0.0, unmapped: true },
      { name: "Cow, Plush Mini 125 Ct Case", cost: 341.05, qty: 1.0, used: 1.0, waste: 0.0, unmapped: true },
      { name: "Oil, Bun Buttery 6/1 Gal.", cost: 272.3, qty: 4.58, used: 12.78, waste: 0.08 },
      { name: "Cup, 20 Oz Cfa 20/25 Ct", cost: 237.84, qty: 7.46, used: 76.5, waste: 0.03 },
      { name: "Strawberries 8/1 Lb", cost: 219.85, qty: 9.14, used: 54.38, waste: 0.4 },
      { name: "Chicken, 6/6 Lb Bag", cost: 209.37, qty: 1.37, used: 38.33, waste: 0.05 },
      { name: "Fruit, Diced 18/1 Lb.", cost: 201.08, qty: 4.17, used: 26.5, waste: 0.06 },
      { name: "Cheese, Mont/ 4/5 Lb Bag", cost: 178.02, qty: 3.54, used: 31.19, waste: 0.05 },
      { name: "Soda, Pwrade 5 Gal. Case", cost: 167.79, qty: 1.53, used: 6.93, waste: 0.0 },
      { name: "Soda, Dr Pepper 5 Gal. Case", cost: 164.51, qty: 1.81, used: 19.2, waste: 0.0 },
      { name: "Coffee, Iced 12/16 Oz", cost: 157.3, qty: 0.97, used: 4.33, waste: 0.0 },
      { name: "Potato, 6/5 Lb Bag", cost: 150.79, qty: 4.41, used: 80.5, waste: 0.88 },
      { name: "Cheese, Blue, 10/1 # Bags", cost: 142.3, qty: 3.15, used: 4.55, waste: 0.04 },
      { name: "Coffee, Regular 128/3.125", cost: 138.73, qty: 0.56, used: 1.72, waste: 0.02 },
      { name: "Cup, 32oz Cfa 16/25 Ct", cost: 129.54, qty: 2.94, used: 36.19, waste: 0.03 },
      { name: "Corn, Roasted, 30/1# Bags", cost: 117.13, qty: 1.61, used: 4.23, waste: 0.01 },
      { name: "Kale 4/1 Lb Bags", cost: 112.08, qty: 6.13, used: 23.83, waste: 0.0 },
      { name: "Cookie, Choc 180 Ct Case", cost: 108.05, qty: 1.62, used: 20.64, waste: 0.22 },
      { name: "Dill Chip, Cfa 5 Gal. Case", cost: 105.03, qty: 3.57, used: 21.3, waste: 0.03 },
      { name: "Lid, #4/8 Round 20/50 Ct", cost: 102.73, qty: 3.67, used: 17.6, waste: 0.02 },
    ],
  },
};
