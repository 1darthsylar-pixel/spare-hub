/* ══════════════════════════════════════════════════════════════════════════
   expenseVendorData.js — THE STORE'S SUPPLIER ROSTER. SERVER SIDE ONLY.

   ★ LEAF. Imports nothing.

   🐛 THIS SHIPPED TO THE BROWSER. Aug 8 2026. Both tables lived in
   expenseDefaults.js, which ExpenseTracker imports, so a client chunk carried
   the store's whole supplier list by expense category — 91 vendor names,
   including at least one that is a PERSON rather than a company — plus the seven
   standing contracts with their cadence and service terms.

   Not the worst thing found today, and still nobody else's business: it is who
   this restaurant buys from, on what schedule, laid out by category.

   ⚠️ MOVED, NOT DELETED, AND THE DATABASE WAS CHECKED FIRST. KV already holds
   gcfcr-expenses-cats-v1 and gcfcr-expenses-recurring-v1 with real data, so these
   are first-run fallbacks rather than the live record — but a fallback that is
   never reachable is a tile that comes up empty for a store that has not seeded
   yet, so they move rather than vanish.

   ⚠️ ONLY worker.js MAY IMPORT THIS. wrangler builds the worker separately from
   vite's client build, so a module imported nowhere else never lands in
   dist/assets. One import from any .jsx puts the roster back in the browser.

   ⚠️ THE CATEGORY LISTS STAYED BEHIND on purpose. DEFAULT_EXPENSE_CATEGORIES and
   EXPENSE_GROUPS are labels — "Kitchen Supplies", "PM Maintenance" — and they
   disclose nothing. Only the two tables naming real suppliers moved.
   ══════════════════════════════════════════════════════════════════════════ */

export const VENDOR_HINTS = {
  "beverage-lease-co2": ["Carolina Carbonic"],
  "bread-auto-rolls": ["Auto Rolls"],
  "drive-thru-tm-experience": ["HME", "Costco"],
  "general-miscellaneous-exp": ["J. Evans"],
  "kitchen-supplies": ["EcoLab", "UniFirst Safety"],
  "linen-mops-cloths": ["Cintas"],
  "license": ["NC DHHS"],
  "local-co-op-storage": ["Extra Space"],
  "marketing-restaurant-advertising": ["Dollar General", "Food Lion"],
  "music-expense": ["Mood Media"],
  "office-supplies": ["Costco"],
  "operator-cell-phone": ["Verizon"],
  "operator-development-expense": ["C-12", "Audible"],
  "operator-wellness": ["Proehilific Park"],
  "other-tm-expenses-benefits": ["Corporate Chaplains"],
  "non-fcr": ["Verizon"],
  "party-outing-expense": ["Amazon", "Harris Teeter", "Walmart"],
  "produce": ["Pride of the Morning"],
  "recruiting": ["Workstream"],
  "pest-control": ["BugOut"],
  "security-expense-false-alarm": ["Strong Systems"],
  "storage-expense": ["Ray Storage"],
  "tm-development": ["Carol Marsh"],
  "tm-training": ["Safe Eats"],
  "telephone": ["Inktel", "Ring Central"],
  "trash-compactor-lease": ["CTI", "Mil-Tek Lease"],
  "uniforms": ["Oobe"],
  "electric-util-utility-co": ["Duke Energy"],
  "gas-utilty": ["Piedmont Gas"],
  "trash": ["Piedmont Recycling", "City of Greensboro", "Republic"],
  "water-sewage-util-co": ["City of Greensboro"],
  "building-repair": ["Power Investments", "Pye Barker", "Buckeye"],
  "equipment-repair": ["Buckeye", "Coca-Cola"],
  "building-maintenance": ["A-1 Backflow", "Pye Barker"],
  "pm-maintenance": ["Buckeye-Derek", "Pye Barker", "Stanley Environmental", "The Plumbing Service", "A-1 Backflow", "Strong Systems", "NC DHHS"],
};

export const RECURRING_SEED = [
  { id: "rec-buckeye", company: "Buckeye-Derek", cat: "pm-maintenance", note: "" },
  { id: "rec-pyebarker", company: "Pye Barker", cat: "pm-maintenance", note: "Qrtly — hood cleaning & extinguishers" },
  { id: "rec-stanley", company: "Stanley Environmental", cat: "pm-maintenance", note: "Grease" },
  { id: "rec-plumbing", company: "The Plumbing Service", cat: "pm-maintenance", note: "" },
  { id: "rec-a1", company: "A-1 Backflow", cat: "pm-maintenance", note: "Backflow testing — water" },
  { id: "rec-strong", company: "Strong Systems", cat: "pm-maintenance", note: "Alarm monitoring — Qrtly" },
  { id: "rec-ncdhhs", company: "NC DHHS", cat: "license", note: "Food licence — yearly" },
];
