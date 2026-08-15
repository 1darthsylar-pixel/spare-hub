/* ══════════════════════════════════════════════════════════════════════════
   foodItemGapsSeed.js — JUNE 2026 FOOD GAPS. SERVER SIDE ONLY.

   ★ LEAF. Imports nothing.

   🐛🐛 THIS WAS IN THE MAIN BUNDLE. Aug 8 2026. It lived in foodItemGaps.js,
   which App.jsx imports, so it shipped inside the ENTRY chunk every anonymous
   visitor downloads — not even behind a lazy tile. Itemised food-cost leakage
   for the restaurant: Condiments $1,680.24, Waffle Potato Fries $1,151.77 and
   five more lines, by name and dollar.

   ⚠️ IT IS MOVED, NOT DELETED, AND THAT MATTERS. KV holds only 2026-07. June
   2026 exists in this table and NOWHERE ELSE — deleting it would have thrown
   away a month of history to close a hole, which is the wrong trade. Checked
   against the live database before touching it rather than assumed.

   ⚠️ ONLY worker.js MAY IMPORT THIS. wrangler builds the worker separately from
   vite's client build, so a module imported nowhere else never lands in
   dist/assets. One import from any .jsx puts it straight back in the browser.

   ⚠️ foodItemGaps.js KEEPS THE LOGIC — the parser, the merge and the
   prior-month lookup disclose nothing and the client still imports them. They
   take the seed as an ARGUMENT now, so there is one implementation for both
   sides.
   ══════════════════════════════════════════════════════════════════════════ */

export const SEED = {
  "2026-06": {
    label: "June 2026",
    items: [
      { name: "Condiments", gap: 1680.24 },
      { name: "Waffle Potato Fries", gap: 1151.77 },
      { name: "Other Food", gap: 395.55 },
      { name: "Dessert", gap: 311.58 },
      { name: "Chicken - Grld Nggts", gap: 140.40 },
      { name: "Chicken - Strips", gap: 31.75 },
      { name: "Chicken - Nuggets", gap: 19.55 },
    ],
  },
};
