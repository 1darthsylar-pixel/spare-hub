// Default expense categories seeded from the FCR Workbook Expense Tracker tabs.
// Grouped: General, Utilities, R&M, Other. Users can add/remove/rename in the tile.
/* ⚠️ ONE CATEGORY USES `get name()` — the team site programme's spending line.
   This array is module-level, built at import BEFORE `applyStoreOverrides`
   merges a store's saved settings, so a plain `programLabel()` call here would
   freeze the deployed default. The getter reads live instead.
   ⚠️ AND IT IS ONLY A SEED. These categories are copied into a store's own
   editable list the first time the tile is used; from then on the store owns
   the name and this file is not consulted. That is the correct handover point,
   so a getter evaluated once at seed time is exactly right rather than a
   compromise.
   ⚠️ `id` IS THE KEY, NEVER THE NAME. Renaming is safe; changing an id would
   orphan the spending already recorded against it. */
import { programLabel } from "./storeConfig.js";

export const EXPENSE_GROUPS = ["General", "Utilities", "R&M", "Other"];
export const DEFAULT_EXPENSE_CATEGORIES = [
  {
    "id": "bad-debt-expense",
    "name": "Bad Debt Expense",
    "group": "General"
  },
  {
    "id": "bank-service-charges",
    "name": "Bank Service Charges",
    "group": "General"
  },
  {
    "id": "beverage-lease-co2",
    "name": "Beverage/ Lease/CO2",
    "group": "General"
  },
  {
    "id": "bread-auto-rolls",
    "name": "Bread-Auto Rolls",
    "group": "General"
  },
  {
    "id": "catering-comissions-paid",
    "name": "Catering-Comissions Paid",
    "group": "General"
  },
  {
    "id": "catering-delivery-vehicle-exp",
    "name": "Catering Delivery Vehicle/Exp",
    "group": "General"
  },
  {
    "id": "drive-thru-tm-experience",
    "name": "Drive Thru Tm Experience",
    "group": "General"
  },
  {
    "id": "general-miscellaneous-exp",
    "name": "General Miscellaneous Exp",
    "group": "General"
  },
  {
    "id": "kitchen-supplies",
    "name": "Kitchen Supplies",
    "group": "General"
  },
  {
    "id": "linen-mops-cloths",
    "name": "Linen- Mops/cloths",
    "group": "General"
  },
  {
    "id": "license",
    "name": "License",
    "group": "General"
  },
  {
    "id": "local-co-op-storage",
    "name": "Local Co-Op Storage",
    "group": "General"
  },
  {
    "id": "marketing-restaurant-advertising",
    "name": "Marketing-Restaurant Advertising",
    "group": "General"
  },
  {
    "id": "music-expense",
    "name": "Music Expense",
    "group": "General"
  },
  {
    "id": "office-supplies",
    "name": "Office Supplies",
    "group": "General"
  },
  {
    "id": "operator-cell-phone",
    "name": "Operator Cell Phone",
    "group": "General"
  },
  {
    "id": "operator-development-expense",
    "name": "Operator Development Expense",
    "group": "General"
  },
  {
    "id": "operator-wellness",
    "name": "Operator Wellness",
    "group": "General"
  },
  {
    "id": "other-tm-expenses-benefits",
    "name": "Other TM Expenses/Benefits",
    "group": "General"
  },
  {
    "id": "non-fcr",
    "name": "Non-FCR",
    "group": "General"
  },
  {
    "id": "party-outing-expense",
    "name": "Party/Outing Expense",
    "group": "General"
  },
  {
    "id": "produce",
    "name": "Produce",
    "group": "General"
  },
  {
    "id": "recruiting",
    "name": "Recruiting",
    "group": "General"
  },
  {
    "id": "pest-control",
    "name": "Pest Control",
    "group": "General"
  },
  {
    "id": "security-expense-false-alarm",
    "name": "Security Expense / False Alarm",
    "group": "General"
  },
  {
    "id": "storage-expense",
    "name": "Storage Expense",
    "group": "General"
  },
  {
    "id": "tm-development",
    "name": "TM Development",
    "group": "General"
  },
  {
    "id": "tm-training",
    "name": "TM Training",
    "group": "General"
  },
  {
    "id": "telephone",
    "name": "Telephone",
    "group": "General"
  },
  {
    "id": "trash-compactor-lease",
    "name": "Trash Compactor- Lease",
    "group": "General"
  },
  {
    "id": "travel",
    "name": "Travel",
    "group": "General"
  },
  {
    "id": "uniforms",
    "name": "Uniforms",
    "group": "General"
  },
  {
    "id": "electric-util-utility-co",
    "name": "Electric Util - Utility Co.",
    "group": "Utilities"
  },
  {
    "id": "gas-utilty",
    "name": "Gas Utilty",
    "group": "Utilities"
  },
  {
    "id": "trash",
    "name": "Trash",
    "group": "Utilities"
  },
  {
    "id": "water-sewage-util-co",
    "name": "Water & Sewage - Util Co.",
    "group": "Utilities"
  },
  {
    "id": "building-repair",
    "name": "Building Repair",
    "group": "R&M"
  },
  {
    "id": "equipment-repair",
    "name": "Equipment Repair",
    "group": "R&M"
  },
  {
    "id": "building-maintenance",
    "name": "Building Maintenance",
    "group": "R&M"
  },
  {
    "id": "equipment-maintenance",
    "name": "Equipment Maintenance",
    "group": "R&M"
  },
  {
    "id": "pm-building",
    "name": "PM Building",
    "group": "R&M"
  },
  {
    "id": "pm-equipment",
    "name": "PM Equipment",
    "group": "R&M"
  },
  {
    "id": "peak-reachers",
    get name() { return programLabel(); },
    "group": "Other"
  },
  {
    "id": "paid-out",
    "name": "Paid Out",
    "group": "Other"
  },
  {
    "id": "pm-maintenance",
    "name": "PM Maintenance",
    "group": "R&M"
  },
  {
    "id": "tbr",
    "name": "TBR",
    "group": "Other"
  }
];

/* Usual companies per category, copied from the "Key / Recurring Amounts"
   column of Cindy's Expense Tracker tab in the FCR Workbook (July 2026).
   These seed the company suggestions in the ledger's entry form — they are
   HINTS, not restrictions; any name can be typed. */
/* 🐛 VENDOR_HINTS AND RECURRING_SEED USED TO BE HERE (Aug 8 2026).
   ExpenseTracker imports this file, so 91 supplier names and seven standing
   contracts shipped in a client chunk. They now live in expenseVendorData.js,
   which only worker.js imports, and come from GET /api/expense-vendors behind
   the Financials gate.
   ⚠️ The category and group lists below STAY — they are labels and disclose
   nothing. Do not move them, and do not move the vendors back. */

/* Cindy's standing contracts, from the "*Recurring Expenses FYI" block of the
   same tab. These seed the REPEATS list the first time the ledger runs —
   company + category only, amounts deliberately EMPTY: she enters the real
   amount when she pays, so a stale figure can never become a payment. */
