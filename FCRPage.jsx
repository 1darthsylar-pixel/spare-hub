// ── FCR Projections ────────────────────────────────────────────────
// Money group · Tier 3 (Director). Mirrors the monthly "FCR Projections"
// tab in the Gate City FCR Workbook.
//
// PAST-PROFIT FIX: per-month data comes from fcrProjectionData.js (18
// months, Feb 2025 → Jul 2026, transcribed from the workbook — projection
// AND the tab's ACTUALS column). A CLOSED month now shows its real actual
// Net Profit (headline, MTD stat, history) instead of a recomputed
// projection; the current month stays live. A `hasTemplate` guard warns
// instead of borrowing when a month is out of range. Also: MTD LABOR prints
// the sales-through-date it divides into (so the dollar overage
// reconstructs on screen); actual % uses actual sales, not forecast.
// (Retained: collapsible MTD inputs; "Hours through" shared window;
//  operational-hours denominator; Planner-derived goals.)
//
// CARRY MODEL (July 13 rebuild — "non-live lines should track YTD, not last
// month" + the fixed-15% fee structure). The open-month projection carries
// each line in one of FOUR buckets:
//   1. LIVE      — Food / Paper / Wages / Wage Taxes = live % × Est Sales.
//   2. FIXED $   — Equipment Rent ($5,000) + Business Service Fee ($300) held
//                  flat (never a %, or they drift as sales move). Base Profit
//                  ($1,000) likewise flat.
//   3. BASE OP   — Base Operating Fee = 0.15 × Est Sales − Equip Rent − Biz
//                  Svc Fee. Those three lines total exactly 15% of sales; the
//                  fee is the plug. Recomputes live (was a frozen dollar).
//   4. YTD       — every other non-live line = YTD % × Est Sales, where the
//                  YTD %s come from the FCR "This Year · YTD" column, entered
//                  once when the FCR comes back (gcfcr-fcr-ytd-v1, seeded from
//                  the 30-JUN-26 report). This is the R&M fix: R&M carries at
//                  its 1.01% YTD instead of a fluke-low prior month.

import { useEffect, useMemo, useRef, useState } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, accentEdge } from "./cardStyle.js";
import { hubToken, kvGetResult, kvSet, publishSharedRows } from "./store";
import { loadSalesMonth, dayTotal } from "./SalesAllocation.jsx";
import { monthLaborPlan, monthForecastTotal, monthNonOpHours, monthProjectedFinish } from "./LaborPlanner.jsx";
import { laborTrust } from "./laborWindow.js";
import { storeCfg, STORE } from "./storeConfig.js"; // fee share + fixed-dollar line names, read at use time; STORE for the masthead
import { monthFoodCostPct } from "./FoodCostTracker.jsx";
import MonthYearPicker from "./MonthYearPicker.jsx";
import { parseFcrPaste } from "./fcrImport.js";
import PasteMonth from "./PasteMonth.jsx";
import { eosPeriod } from "./eosPeriod.js";

const TEAL = "#0F766E";
const RED = "#DD0031";
const GREEN = "#047857";
const INDIGO = "#6366F1";

// Per-month projection data lives in fcrProjectionData.js so this file stays
// under the paste limit. DATA is keyed "YYYY-MM"; every closed month carries
// its own real numbers instead of borrowing a single hardcoded template.
/* 🐛🐛 THIS USED TO BE `const DATA = FCR_PROJECTIONS` (Aug 8 2026).
   Importing it here put 18 months of the complete P&L — every expense line and
   the real month-end net profit — into a client chunk that answered HTTP 200 to
   anyone on the internet. The tile is tier 3; the file it downloads to draw the
   tile was not gated at all.
   It now arrives from GET /api/fcr-data, which needs a signed-in session AND
   tier 3 (or Payroll), the same gate App.jsx puts on Financials itself.

   ⚠️ EMPTY_MONTH EXISTS BECAUSE `const m = d.mtd` RUNS BEFORE THE DATA LANDS.
   That line sits above the hooks, so there is no early return that could guard
   it, and an undefined `d` would throw and blank the page on every first paint.
   The shape below covers every field the render reaches for — sales, groups,
   totals, mtd — so the page draws empty for one frame and then fills in.
   ⚠️ ADD TO THIS SHAPE if the render ever reads a new top-level key off `d`. */
const EMPTY_MONTH = { sales: {}, groups: [], totals: {}, mtd: {} };

// KV key holding the current per-line YTD figures. Entered from the FCR
// "This Year · YTD" column when the report comes back — the workbook already
// rolled these up, so the Hub never recomputes and never drifts from it.
const YTD_KEY = "gcfcr-fcr-ytd-v1";

// Lines carried as FIXED DOLLARS (flat every month regardless of sales).
// ★ The two line NAMES come from storeConfig.js (step 2, Aug 11 2026) so a
//   store that words its statement differently is not editing this file.
//   ⚠️ THEY ARE MATCHED AGAINST THE STATEMENT'S OWN LABELS, so a rename here
//   silently drops a line out of the fixed-dollar set and lets it float with
//   sales instead of holding flat. Rename only alongside the data.
/* Rebuilt per call (step 3), so a store that renames a statement line in
   settings has the next projection honour it. A Set of two strings. */
const fixedDollar = () => new Set(storeCfg("financial.fixedDollarLines", []));
// Lines computed LIVE from % × Est Sales (never carried at YTD).
const LIVE_LINES = new Set(["Food Cost", "Paper Cost", "Wages", "Wage Taxes"]);
// CFA base operating service fee is the plug that makes Equip Rent + Biz Svc
// Fee + Base Op Fee total exactly this share of sales.
// ★ From storeConfig.js. Same 0.15.
// ⚠️ THIS ONE MOVES THE PROJECTED NET PROFIT. It is not a display figure: it
//   sets the base operating fee, which is subtracted on the way to the number
//   the whole Financials tile exists to show. A wrong value here is a wrong
//   month-end projection that still looks entirely reasonable.
const feeShare = () => storeCfg("financial.feeShare");

/* ★★ THE DOLLARS ARE NOT IN THIS FILE ANY MORE (Aug 9 2026 sweep, finding 5).
   🐛 `SEED_YTD` was a module-level const holding the store's whole Jan–Jun 2026
   profit and loss, and `useState` consumed it, so it compiled into
   dist/assets/FinancialSuite-*.js: $4,847,858.80 sales, $583,706.31 net profit,
   $695,378.82 base operating fee and all 26 expense lines, downloadable by
   anyone with no account.

   ⚠️ THE AUG 8 FIX MISSED IT BY ONE FILE. Commit 00a27b9 moved
   fcrProjectionData.js and fcrReferenceData.js behind /api/fcr-data and proved
   "0 of 40 sampled figures survive in ANY built chunk" — but it sampled the
   modules it had moved, and this constant was written inline here. The check
   passed. A verification is only as wide as the list it draws from.

   ⚠️ THE LABELS STAY, AND THAT IS DELIBERATE. The YTD editor renders one input
   per key of `ytdRec.lines` (see the table below), so a client with no labels
   shows an editor with no rows and nobody can type a number in. The shape is
   the app; the amounts are the business. Only the amounts moved.
   The dollars arrive as `ytdSeed` inside GET /api/fcr-data, behind the same
   rank >= 6 / Payroll gate as the Financials tile. */
const YTD_LINE_LABELS = [
  "Misc. Revenue",
  "Food Cost",
  "Paper Cost",
  "Wages",
  "Wage Taxes",
  "Team Member Expenses",
  "Marketing / Giveaways",
  "Discounts",
  "Repairs and Maintenance",
  "Restaurant Supplies and Expenses",
  "Optional Equipment and Facilities",
  "Other Business Expenses",
  "Additional FCR Expenses",
  "Cash Management",
  "Beyond the Restaurant",
  "Market Acceleration Program",
  "Business Insurance",
  "Utilities",
  "Rent",
  "Property Tax",
  "Additional Occupancy Expenses",
  "Licenses and Other Taxes",
  "Bank Card and Fees",
  "Equipment Rent",
  "Business Service Fee",
  "Franchise Fee Credits",
];
const YTD_PROFIT_LABELS = ["Base Profit", "Base Operating Fee", "Net Profit"];

/* The empty column: right shape, right labels, no figures. Used as the initial
   state (never rendered — the page holds a loading gate until /api/fcr-data
   answers) and as the fallback when the seed cannot be read. Blank is the only
   honest fallback here; zeros would render as real money. */
const YTD_BLANK = {
  throughYm: "",
  sales: "",
  lines: Object.fromEntries(YTD_LINE_LABELS.map((l) => [l, ""])),
  profit: Object.fromEntries(YTD_PROFIT_LABELS.map((l) => [l, ""])),
};

/* ★ ONE FETCH OF /api/fcr-data, SHARED. Two effects need it and they run
   independently — the page-data effect keyed on [] and the month effect keyed
   on [ym]. Before the YTD dollars moved server-side only the first one needed
   the call; now both do, and letting them race means the month effect either
   fetches a second time or reads a seed that has not arrived and falls back to
   blank for good. Module level, so a helper can never be read in its temporal
   dead zone by something rendering above it.

   ⚠️ A FAILURE IS NOT CACHED. The handle is cleared before the empty shape is
   returned, so the next mount tries again. Caching one blip on shop wifi would
   leave the Financials tile empty for the rest of the session with no way back
   except a full reload — and the person who needs it is standing at a counter. */
let fcrDataPromise = null;
function loadFcrData() {
  if (!fcrDataPromise) {
    fcrDataPromise = (async () => {
      try {
        const r = await fetch("/api/fcr-data", { headers: { "x-hub-token": hubToken() } });
        const d = await r.json().catch(() => null);
        if (d && d.ok) return d;
      } catch { /* fall through to the empty shape below */ }
      fcrDataPromise = null;
      /* EMPTY SHAPES, never a crash and never a wrong number. The page renders
         blank rather than confidently showing zero. ytdSeed is null rather than
         {} so the reset button can tell "no seed" from "a seed of nothing" and
         refuse instead of writing blanks over real figures. */
      return { projections: {}, reference: {}, lySales: {}, ytdSeed: null };
    })();
  }
  return fcrDataPromise;
}

// ── Helpers ────────────────────────────────────────────────────────
const money = (n) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Thousands-grouped for showing a number back in an input while it is NOT being
// edited (empty stays empty, a non-number is left as typed). The STORED value is
// always the raw digits — this only changes what the field displays.
/* ★ THE YTD NET PROFIT, NOT OPERATING PROFIT.
   `ytdSales − every line` stops BEFORE Chick-fil-A's service fee, so it is
   OPERATING profit. The monthly "actual net" it gets compared against is already
   past that fee, and comparing the two put a ~15-point gap on the board that was
   almost entirely the fee rather than the month (Matt, Aug 1 2026: "?" on a
   $212,983.30 YTD average sitting beside an $86,700 actual).
   The FCR's real YTD Net Profit rides in ytdRec.profit — use it, and fall back to
   the derived operating figure only when a hand-entered YTD never filled that
   line, so an old record degrades to its previous number instead of a blank.
   Module level because TWO call sites need it and a drifting second copy of the
   number that decides "ahead or behind pace" is exactly the bug worth avoiding. */
const ytdNetProfitOf = (ytdRec, ytdSalesN) => {
  const raw = ytdRec?.profit?.["Net Profit"];
  const n = Number(raw);
  if (raw != null && raw !== "" && Number.isFinite(n)) return n;
  const lines = ytdRec?.lines;
  if (!lines || !(ytdSalesN > 0)) return null;
  return ytdSalesN - Object.values(lines).reduce((a, b) => a + (Number(b) || 0), 0);
};
const fmtGroup = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : s;
};
const pct = (n) => (n == null ? "—" : (n * 100).toFixed(2) + "%");

/* ★ A ZERO IN THE HISTORICAL TABLE MEANS "NOT KNOWN", NOT "ZERO PERCENT"
   (Matt, Aug 5 2026, screenshot of NET PROFIT % — AUGUST HISTORY reading
   2023 12.08 · 2024 12.13 · 2025 0.00 · 2026 11.33).

   fcrReferenceData.js carries `p2025: 0` for August through December, which is
   the fill value left behind when that column was pulled from the sheet before
   those months closed. The reader said `h[...] ?? null`, and `??` only catches
   null and undefined — 0 is neither, so a placeholder sailed through and
   rendered as a confident 0.00% next to two real years. On a screen Matt opens
   in front of visiting operators, an invented number is worse than a dash.

   ⚠️ NOT `> 0`. A month can genuinely lose money, and a negative net profit %
   is a real figure that must still show. Only EXACTLY zero is the placeholder:
   no real month lands on 0.0000. */
const histPct = (v) => (Number.isFinite(v) && v !== 0 ? v : null);

/* ★★ THE SAME BUSINESS DAY LAST YEAR — 364 DAYS BACK, NOT THE SAME DATE.
   364 is 52 whole weeks, so it always lands on the same weekday. This is the
   rule CFA Now uses ("compares daily sales from this month with the same
   business days from last year"), and matching it is the whole point: the Hub
   used to compare by DATE, which pairs a Saturday against a Friday.
   🐛 Aug 1 2026 is a Saturday. Aug 1 2025 was a Friday and took $30,528; the
   Saturday next to it took $33,270. So the Hub read +18.5% growth while CFA
   Now read +8.8% — a ten point gap on the number the L10 board publishes. Over
   a full month the mismatches roughly average out, which is why this was
   filed as a ~0.2 point rounding difference. At the START of a month nothing
   averages: on day one the mismatch IS the number.
   ⚠️ Verified against the real records before building: every shifted day
   reproduces CFA Now's chart exactly (8/1→8/2, 8/3→8/4, 8/4→8/5, 8/5→8/6,
   8/6→8/7).
   ⚠️ Noon, not midnight — a date built at midnight can slip a day either side
   of a daylight-saving change. */
const lyMatchIso = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 364);
  return d.toISOString().slice(0, 10);
};
const pad2 = (n) => String(n).padStart(2, "0");
const curYm = () => { const n = new Date(); return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}`; };
/* The last COMPLETED day, in the device's own clock. NOT toISOString — that is
   UTC, and after 8 PM Eastern it names tomorrow, which is the known wrong-date
   bug class in this repo. en-CA formats as YYYY-MM-DD. */
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("en-CA"); };
const mtdKey = (ym) => `gcfcr-fcr-mtd-${ym}-v1`;
const actualKey = (ym) => `gcfcr-fcr-actual-${ym}-v1`;
const shiftYm = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const cleanDec = (raw) => {
  const c = String(raw).replace(/[^0-9.]/g, "");
  const i = c.indexOf(".");
  return i === -1 ? c : c.slice(0, i + 1) + c.slice(i + 1).replace(/\./g, "");
};
/* ── H:MM ↔ decimal hours ─────────────────────────────────────────
 * HotSchedules' Time Summary Report prints time as H:MM — "8086:51" is 8086
 * hours and 51 MINUTES, not 8086.51 hours. Proof is in the report's own
 * arithmetic: Valadez 95:06 × $12.00 prints $1141.20, which is (95 + 6/60) × 12;
 * read as decimal it would be $1140.72. Six rows checked, six agree.
 *
 * Two things were wrong here. Retyping the colon as a dot files 51 minutes as
 * 51 hundredths — 0.34 hrs light on a month total, but 3% out on a single day's
 * 7:38. And PASTING it was worse: cleanDec strips everything but digits and a
 * dot, so "8086:51" arrived as 808651.
 *
 * So the fields now understand both. Paste the report value or type a decimal;
 * either way what gets STORED is decimal hours, because Planner's labor card
 * and the dashboard register both read this record with a plain Number().
 */
/* Hours are TYPED AND SHOWN in H:MM — the format the report prints — and stored
 * as decimal, because Planner's labor card and the dashboard register both read
 * this record with a plain Number(). The field is the translation layer.
 *
 * 🐛 WHY IT SHOWS H:MM NOW: it used to convert to decimal on screen, so the
 * field held 8086.85 while the report said 8086:51. Retyping from the report
 * then produced 8086:85 — a mix of the two — which is not valid H:MM, and the
 * fallback stripped the colon and ran the digits together into 808685. Showing
 * the same format the source document uses removes the whole class of error.
 *
 * Minutes are accepted up to 99 rather than 59. 8086:85 is a typo, but
 * 8086 + 85/60 is unambiguous arithmetic and lands near the truth; silently
 * turning it into 808685 is the outcome worth preventing.
 */
const HMM = /^(\d+):(\d{1,2})$/;

// Characters a time expression may contain: digits, dot, colon, and + to add
// pay periods together.
const cleanTimeExpr = (raw) => String(raw).replace(/[^0-9.:+ ]/g, "");
const cleanMoneyExpr = (raw) => String(raw).replace(/[^0-9.+ ]/g, "");

const oneTime = (part) => {
  const m = HMM.exec(part.trim());
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const n = Number(cleanDec(part));
  return Number.isFinite(n) ? n : null;
};

/* Sum a "+"-separated expression. Returns null if any part is unreadable, so a
 * bad entry reverts to what was there instead of overwriting it with rubbish. */
const sumExpr = (raw, one) => {
  const parts = String(raw).split("+").map((x) => x.trim()).filter((x) => x !== "");
  if (!parts.length) return null;
  let total = 0;
  for (const p of parts) {
    const v = one(p);
    if (v === null || !Number.isFinite(v)) return null;
    total += v;
  }
  return total;
};
const sumTime  = (raw) => sumExpr(raw, oneTime);
const sumMoney = (raw) => sumExpr(raw, (p) => { const n = Number(cleanDec(p)); return Number.isFinite(n) ? n : null; });

// Decimal hours → "H:MM" for display. Rounds minutes, carrying 60 up to the hour.
const hoursToHmm = (dec) => {
  const n = Number(dec);
  if (!Number.isFinite(n) || n <= 0) return "";
  let h = Math.floor(n + 1e-9);
  let m = Math.round((n - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return `${h}:${String(m).padStart(2, "0")}`;
};
const round2 = (n) => String(Math.round(n * 100) / 100);

// Like cleanDec but keeps a leading minus (Cash Management / Misc can be < 0).
const cleanSigned = (raw) => {
  let c = String(raw).replace(/[^0-9.\-]/g, "");
  const neg = c[0] === "-";
  c = c.replace(/-/g, "");
  const i = c.indexOf(".");
  c = i === -1 ? c : c.slice(0, i + 1) + c.slice(i + 1).replace(/\./g, "");
  return neg ? "-" + c : c;
};
const prettyDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const prettyMonth = (ym) => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "—";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};
// Months elapsed in the (calendar) fiscal year through `throughYm`.
const ytdMonthCount = (ym) => Math.max(Number((ym || "").split("-")[1]) || 0, 1);

// ── Live projection engine ──────────────────────────────────────────
// ytd: { [label]: fraction } — YTD % per line, used for every non-live,
// non-fixed line. Falls back to the month template % when a line has no YTD.
function buildLiveProjection(d, estSales, foodPct, paperPct, laborPct, ytd) {
  /* 🐛🐛 THIS CRASHED THE WHOLE FINANCIALS TILE FOR NICK, Aug 8 2026:
     "undefined is not an object (evaluating 'A.items')".

     When the projection data moved to a fetch earlier today, EMPTY_MONTH gave
     `d` a groups ARRAY so nothing would throw. That was not enough: this
     function does not just read groups, it ASSUMES a "Prime Costs" group is in
     there. With an empty array find() returns undefined and .items throws — and
     it throws HERE, above the loading gate, so the gate never got the chance to
     render and the tile went to its crash boundary instead.

     ⚠️ THE LESSON, WRITTEN DOWN: an empty-shape fallback has to satisfy every
     LOOKUP the render does, not merely every top-level key. groups: [] is a
     valid array and still a broken template.
     ⚠️ RETURNS A USABLE EMPTY PROJECTION rather than null, because every caller
     reads .groups and .totals off this without checking. */
  const primeGroup = (d && Array.isArray(d.groups) ? d.groups : []).find((g) => g && g.name === "Prime Costs");
  const primeItems = (primeGroup && Array.isArray(primeGroup.items)) ? primeGroup.items : null;
  if (!primeItems) {
    return {
      groups: [], liveLabels: new Set(), ytdLabels: new Set(),
      totals: {
        totalExpenses: [0, 0],
        operatingProfit: [0, 0],
        baseProfit: [0, 0],
        baseOperatingFee: [0, 0],
        netProfit: [0, 0],
      },
    };
  }
  const staticWages = primeItems.find(([label]) => label === "Wages") || ["Wages", 0, 0];
  const staticTax = primeItems.find(([label]) => label === "Wage Taxes") || ["Wage Taxes", 0, 0];
  const wageTaxRate = staticWages[1] > 0 ? staticTax[1] / staticWages[1] : 0;

  const wagesDollars = laborPct != null ? laborPct * estSales : null;
  const foodDollars = foodPct != null ? foodPct * estSales : null;
  const paperDollars = paperPct != null ? paperPct * estSales : null;
  const wageTaxDollars = wagesDollars != null ? wagesDollars * wageTaxRate : null;

  const ytdPct = (label) => {
    const v = ytd ? ytd[label] : null;
    return v != null && isFinite(v) ? v : null;
  };

  const liveLabels = new Set();
  const ytdLabels = new Set();
  const groups = d.groups.map((g) => {
    const items = g.items.map(([label, dollars, p]) => {
      // 1. LIVE prime-cost lines (when we have a live figure)
      if (label === "Food Cost" && foodDollars != null) { liveLabels.add(label); return [label, foodDollars, estSales > 0 ? foodDollars / estSales : 0]; }
      if (label === "Paper Cost" && paperDollars != null) { liveLabels.add(label); return [label, paperDollars, estSales > 0 ? paperDollars / estSales : 0]; }
      if (label === "Wages" && wagesDollars != null) { liveLabels.add(label); return [label, wagesDollars, estSales > 0 ? wagesDollars / estSales : 0]; }
      if (label === "Wage Taxes" && wageTaxDollars != null) { liveLabels.add(label); return [label, wageTaxDollars, estSales > 0 ? wageTaxDollars / estSales : 0]; }
      // 2. FIXED-DOLLAR lines — hold the flat dollar, show % vs Est Sales
      if (fixedDollar().has(label)) { return [label, dollars, estSales > 0 ? dollars / estSales : 0]; }
      // 3. Everything else — carry at YTD % when we have it (incl. a live line
      //    that had no live figure this month, e.g. Wages before payroll)
      const y = ytdPct(label);
      if (y != null) { ytdLabels.add(label); return [label, y * estSales, y]; }
      // 4. Fallback — the month template value (no YTD on file for this line)
      return [label, dollars, p];
    });
    return { ...g, items };
  });

  const totalExpenses = groups.reduce((s, g) => s + g.items.reduce((s2, [, v]) => s2 + v, 0), 0);
  const operatingProfitDollars = estSales - totalExpenses;
  const operatingProfitPct = estSales > 0 ? operatingProfitDollars / estSales : 0;

  // Base Profit — fixed dollar carried from the template ($1,000).
  const baseProfitDollars = d.totals.baseProfit[0];
  const baseProfitPct = estSales > 0 ? baseProfitDollars / estSales : 0;

  // Base Operating Fee — the plug: Equip Rent + Biz Svc Fee + this = 15% of
  // sales. Read the two fixed lines back out of the carried groups so the
  // identity always holds, then recompute the fee live off Est Sales.
  const feesGroup = groups.find((g) => g.name === "Fees & Taxes");
  const equipRent = feesGroup?.items.find(([l]) => l === "Equipment Rent")?.[1] || 0;
  const bizSvcFee = feesGroup?.items.find(([l]) => l === "Business Service Fee")?.[1] || 0;
  const baseOperatingFeeDollars = feeShare() * estSales - equipRent - bizSvcFee;
  const baseOperatingFeePct = estSales > 0 ? baseOperatingFeeDollars / estSales : 0;

  const netProfitDollars = operatingProfitDollars - baseProfitDollars - baseOperatingFeeDollars;
  const netProfitPct = estSales > 0 ? netProfitDollars / estSales : 0;

  return {
    groups, liveLabels, ytdLabels,
    totals: {
      totalExpenses,
      operatingProfit: [operatingProfitDollars, operatingProfitPct],
      baseProfit: [baseProfitDollars, baseProfitPct],
      baseOperatingFee: [baseOperatingFeeDollars, baseOperatingFeePct],
      netProfit: [netProfitDollars, netProfitPct],
    },
  };
}

const num = { fontVariantNumeric: "tabular-nums" };

// ── Small pieces ───────────────────────────────────────────────────
function SectionLabel({ children, color = "#6B7280" }) {
  return <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", color, marginBottom: 8 }}>{children}</div>;
}

/* ytdD/ytdP: the workbook's "Ytd Avg $ | YTD %" pair, rendered beside the
   month pair when Actual mode asks for the side-by-side (Matt, Jul 31 —
   "look at my fcr workbook for example": every line in his monthly sheet
   carries Ytd Avg $ and YTD % columns next to the month's own). Indigo like
   the YTD reference card, so the eye pairs them across the page. */
function Row({ label, dollars, percent, strong, muted, rail, live, ytd, ytdD, ytdP }) {
  const showYtdPair = ytdD !== undefined || ytdP !== undefined;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10,
      padding: "6px 0 6px " + (rail ? "10px" : "0"),
      borderBottom: "1px dotted #D1D5DB",
      borderLeft: rail ? `3px solid ${rail}` : "none",
      opacity: muted ? 0.5 : 1,
    }}>
      <span style={{ fontSize: 14, fontWeight: strong ? 800 : 600, flex: 1, color: "#1F2937", minWidth: 90 }}>
        {label}
        {live && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0F766E", marginLeft: 6, letterSpacing: "0.06em" }}>LIVE</span>}
        {ytd && <span style={{ fontSize: 9.5, fontWeight: 800, color: INDIGO, marginLeft: 6, letterSpacing: "0.06em" }}>YTD</span>}
      </span>
      {/* ⚠️ PHONE-FIRST: the two pairs live in ONE wrapping group. On a phone
          the YTD pair drops to its own right-aligned line under the month's
          (Matt's screenshot, Jul 31: fixed side-by-side cells shoved the YTD %
          clean off the screen edge and crushed every label). Wide screens keep
          the workbook's side-by-side. The tiny YTD chip keeps the stacked
          line self-describing when the column header is off-screen. */}
      <span className="fcrNums">
        <span className="fcrPair">
          <span style={{ ...num, fontSize: showYtdPair ? 13 : 14.5, fontWeight: strong ? 900 : 700, minWidth: 84, textAlign: "right" }}>{money(dollars)}</span>
          <span style={{ ...num, fontSize: showYtdPair ? 11.5 : 12.5, fontWeight: 700, color: "#6B7280", minWidth: 48, textAlign: "right" }}>
            {percent != null ? pct(percent) : "—"}
          </span>
        </span>
        {showYtdPair && (
          <span className="fcrPair">
            <span style={{ fontSize: 8.5, fontWeight: 800, color: INDIGO, letterSpacing: "0.08em", alignSelf: "baseline" }}>YTD</span>
            <span style={{ ...num, fontSize: 13, fontWeight: strong ? 900 : 700, color: INDIGO, minWidth: 84, textAlign: "right" }}>
              {ytdD != null ? money(ytdD) : "—"}
            </span>
            <span style={{ ...num, fontSize: 11.5, fontWeight: 700, color: INDIGO, minWidth: 48, textAlign: "right" }}>
              {ytdP != null ? pct(ytdP) : "—"}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

function GroupHeader({ name, color, subtotal, subtotalPct }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10,
      background: cardSurface(color, 0.65), borderLeft: `3px solid ${color}`, borderTop: `3px solid ${color}`,
      borderRadius: "0 7px 7px 0", padding: "7px 10px", marginTop: 12,
    }}>
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", color, flex: 1, textTransform: "uppercase" }}>{name}</span>
      <span style={{ ...num, fontSize: 13.5, fontWeight: 900, color, minWidth: 96, textAlign: "right" }}>{money(subtotal)}</span>
      <span style={{ ...num, fontSize: 12, fontWeight: 800, color, opacity: 0.75, minWidth: 58, textAlign: "right" }}>{pct(subtotalPct)}</span>
    </div>
  );
}

function Stat({ label, value, sub, tone, variance, advice }) {
  const toneColor = tone === "over" ? RED : tone === "good" ? GREEN : "#111827";
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px dotted #D1D5DB" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6B7280" }}>{label}</div>
      <div style={{ ...num, fontSize: 20, fontWeight: 900, marginTop: 2, color: toneColor }}>{value}</div>
      {variance != null && isFinite(variance) && Math.abs(variance) >= 0.005 && (
        <div style={{ ...num, fontSize: 12.5, fontWeight: 800, marginTop: 2, color: variance > 0 ? RED : GREEN }}>
          {variance > 0 ? `${money(variance)} over MTD` : `${money(Math.abs(variance))} under MTD`}
        </div>
      )}
      {sub && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 1 }}>{sub}</div>}
      {/* Recommendation line — shows ONLY when this stat is over goal, and only
          when a caller passes advice. Deliberately gated on tone === "over", not
          on variance: a stat that's on or under goal never gets told to fix
          itself. One plain sentence, no deep-link yet (the Waste Log jump is a
          fast-follow once WasteTracker's open payload is wired). */}
      {tone === "over" && advice && (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#78350F", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7, padding: "6px 9px", marginTop: 6, lineHeight: 1.4 }}>
          {advice}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────
export default function FCRPage() {
  const [ym, setYm] = useState(curYm());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [viewMode, setViewMode] = useState("proj");
  const [inputsOpen, setInputsOpen] = useState(true);
  const [ytdOpen, setYtdOpen] = useState(false);
  /* Est. Sales day-by-day, folded away by default (Matt, Aug 7 2026: "let's
     make est sales a dropdown"). On his screenshot the table ran five rows deep
     under a three-line SALES card and pushed everything below it off the fold.
     ⚠️ ONLY THE TABLE FOLDS. Day-over-day and month-over-month stay open — he
     asked for both of those explicitly (Jul 30, then Aug 6) and they are two
     lines, not fifteen. Folding what somebody asked to see is not tidying.
     ⚠️ Same disclosure pattern as ytdOpen above, on purpose. Two ways to open a
     panel on one page is one way too many. */
  const [daysOpen, setDaysOpen] = useState(false);

  /* ⚠️ THIS HOOK SITS HERE, ABOVE THE FIRST USE OF THE DATA AND BELOW THE OTHER
     useStates, ON PURPOSE. React needs the ORDER of hooks to be identical on
     every render; putting it anywhere above line ~480 satisfies that, and this
     is the last position where it still runs before `hasTemplate` reads it. */
  const [fcr, setFcr] = useState(null);   // null = still loading
  useEffect(() => {
    let alive = true;
    (async () => {
      // loadFcrData owns the fetch, the failure shape and the no-cache-on-error
      // rule; the month effect below awaits the same call for the YTD seed.
      const d = await loadFcrData();
      if (alive) setFcr(d);
    })();
    return () => { alive = false; };
  }, []);
  const DATA = (fcr && fcr.projections) || {};

  // hasTemplate: does this month have its own real projection in DATA? If not,
  // we render the nearest month as a visible placeholder rather than pretending
  // another month's numbers are this month's.
  const hasTemplate = !!DATA[ym];
  const dataKey = hasTemplate ? ym : Object.keys(DATA).sort().pop();
  const d = DATA[dataKey] || EMPTY_MONTH;
  const [py, pm] = ym.split("-").map(Number);
  const period = new Date(py, pm - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  const monthNameCased = new Date(py, pm - 1, 1).toLocaleString("en-US", { month: "long" });
  const m = d.mtd;

  // hoursThrough: the last date payroll covers. Defaults to the last day
  // with sales entered, so both sides of every ratio share a window.
  const [mtd, setMtd] = useState({ wages: "", hours: "", ot: "", pto: "", ptoA: "", ptoB: "", ptoC: "", lyMtd: "", laborHold: false, laborPctOverride: "", hoursThrough: "" });
  /* What's being typed, before it's committed. Storage always holds a plain
     number; this holds the H:MM or the "408 + 122.50" the person is entering,
     so the field can show their working instead of fighting them mid-keystroke. */
  const [draft, setDraft] = useState({});
  // Hold + hand-set window live behind a link now; see the note where it renders.
  const [showLaborAdvanced, setShowLaborAdvanced] = useState(false);
  const [salesDays, setSalesDays] = useState({});   // iso -> total
  const [lySalesDays, setLySalesDays] = useState({}); // same, for last year's matching month
  const [plan, setPlan] = useState(null);           // monthLaborPlan()
  const [projFinish, setProjFinish] = useState(null); // monthProjectedFinish() — the Month over month tile
  const [nonOpThrough, setNonOpThrough] = useState(0);
  const [estSalesLive, setEstSalesLive] = useState(null);
  const [foodCostLive, setFoodCostLive] = useState(null);
  const [foodCostErr, setFoodCostErr] = useState(null);
  const [actual, setActual] = useState(null);
  const [netFocus, setNetFocus] = useState(false); // show the Actual Net Profit grouped with commas until it is being edited
  const [ytdRec, setYtdRec] = useState(YTD_BLANK);
  const [saveState, setSaveState] = useState("idle");
  const [ytdSaveState, setYtdSaveState] = useState("idle");
  // loadFailed = the month record, actual record, or YTD read came back
  // ok:false. The real data may exist, so every write here refuses until a
  // clean re-read — one typed field would otherwise persist a near-blank
  // month over the stored one. Ref mirrors state for the debounce closures.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);
  const saveTimer = useRef(null);
  const ytdTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      /* ★ LAST YEAR'S SAME MONTH, DAY BY DAY. Matt, Jul 30 2026: "i have the day
         to day sales in the planner and sales allocation pages" — and he does,
         back to Jan 2025. So growth does not need typing in; the Hub already
         holds both sides of the comparison and can work it out. */
      const lyYm = `${Number(ym.slice(0, 4)) - 1}-${ym.slice(5, 7)}`;
      /* ⚠️ LAST YEAR'S NEXT MONTH IS NEEDED TOO. Shifting back 364 days moves
         FORWARD about a day within the month, so the last day or two of this
         month land in the following month last year — Aug 31 2026 matches
         Sep 1 2025. Without this the month would silently lose its final days
         from the comparison, which is the quiet kind of wrong. */
      const lyNextYm = (() => {
        const y = Number(lyYm.slice(0, 4)); const m = Number(lyYm.slice(5, 7));
        return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      })();
      /* The three records THIS page writes (month inputs, actual, YTD) load
         through kvGetResult, which tells "nothing stored" apart from "read
         failed" — kvGet returns null for both, and a failed read used to open
         the month blank, where one typed field would save near-blank over the
         real record. The rest are display feeds owned by other pages; their
         failures show as dashes here and gate nothing. */
      const [savedR, sales, lySales, lyNextSales, laborPlan, foodCost, forecastTotal, projFin, actualR, ytdSavedR] = await Promise.all([
        kvGetResult(mtdKey(ym)),
        loadSalesMonth(ym),
        loadSalesMonth(lyYm).catch(() => null),
        loadSalesMonth(lyNextYm).catch(() => null),
        monthLaborPlan(ym).catch(() => null),
        monthFoodCostPct(ym).catch((e) => { setFoodCostErr(e?.message || String(e) || "unknown error"); return null; }),
        monthForecastTotal(ym).catch(() => null),
        monthProjectedFinish(ym).catch(() => null),
        kvGetResult(actualKey(ym)),
        kvGetResult(YTD_KEY),
      ]);
      if (!alive) return;
      const failed = !savedR.ok || !actualR.ok || !ytdSavedR.ok;
      loadFailedRef.current = failed;
      setLoadFailed(failed);
      setProjFinish(projFin);
      const saved = savedR.value, actualRec = actualR.value, ytdSaved = ytdSavedR.value;

      const dayMap = {};
      if (sales?.days) Object.entries(sales.days).forEach(([iso, r]) => { const t = dayTotal(r); if (t > 0) dayMap[iso] = t; });
      const lastSalesIso = Object.keys(dayMap).sort().pop() || "";
      const lyDayMap = {};
      if (lySales?.days) Object.entries(lySales.days).forEach(([iso, r]) => { const t = dayTotal(r); if (t > 0) lyDayMap[iso] = t; });
      // …plus the spill into last year's following month, for the days above.
      if (lyNextSales?.days) Object.entries(lyNextSales.days).forEach(([iso, r]) => { const t = dayTotal(r); if (t > 0) lyDayMap[iso] = t; });

      const next = { wages: "", hours: "", ot: "", pto: "", ptoA: "", ptoB: "", ptoC: "", lyMtd: "", laborHold: false, laborPctOverride: "", hoursThrough: "", ...(saved || {}) };
      /* ⚠️ IN-MEMORY MIGRATION, NEVER A REWRITE OF STORED DATA.
         Months saved before the three boxes existed hold a single `pto` total.
         Drop it into the first box so the month opens showing the number that
         is already inside the labor %, instead of three empty boxes beside a
         non-zero total — which would read as "my PTO disappeared". It persists
         on his next save anyway, so nothing is edited behind him. */
      if (!next.ptoA && !next.ptoB && !next.ptoC && Number(next.pto) > 0) next.ptoA = next.pto;
      // Effective window = a pinned "hours through" date if the user set one,
      // else auto-track the last day sales are entered for. We DELIBERATELY do
      // NOT write the auto value into next.hoursThrough — persisting it would
      // freeze the window at today's last-sales date, so entering a later day's
      // sales wouldn't move productivity/labor (the "entered 7/13 and nothing
      // reconciled" bug). Empty hoursThrough = auto-track; a value = pinned.
      const effThroughLoad = next.hoursThrough || lastSalesIso;

      const nonOp = effThroughLoad ? await monthNonOpHours(ym, effThroughLoad).catch(() => 0) : 0;
      if (!alive) return;

      setMtd(next);
      setSalesDays(dayMap);
      setLySalesDays(lyDayMap);
      setPlan(laborPlan);
      setNonOpThrough(nonOp);
      setFoodCostLive(foodCost);
      setEstSalesLive(forecastTotal);
      setActual(actualRec);
      /* YTD table: stored value if present, else the seeded June column —
         which now arrives over the wire. Awaiting the SAME shared call the page
         effect uses, so this cannot read a seed that has not landed yet.
         ⚠️ Blank, not zeros, when the seed cannot be read. An unreadable seed
         must never render as $0.00 sitting under a real-looking label. */
      const seedYtd = (await loadFcrData()).ytdSeed;
      setYtdRec(ytdSaved && ytdSaved.lines ? ytdSaved : (seedYtd && seedYtd.lines ? seedYtd : YTD_BLANK));
      if (foodCost != null) setFoodCostErr(null);
      // A closed month with an actual on file in the workbook defaults to
      // Actual view, so navigating to a past month shows its real result.
      const closedWithSheetActual = ym < curYm() && DATA[ym]?.actual != null;
      setViewMode((actualRec || closedWithSheetActual) ? "actual" : "proj");
      // Collapse the input panel if it already has values in it.
      setInputsOpen(!(Number(next.wages) > 0 && Number(next.hours) > 0));
    })();
    return () => { alive = false; };
  }, [ym]);

  /* kvSet never throws — it returns false on failure, so the boolean is the
     only truth about whether a record landed. On false the badge goes to
     "Save failed" and STAYS there (no 2s fade back to idle — a failure that
     blinks away reads as saved). The next successful save clears it. */
  const persistActual = (next) => {
    if (loadFailedRef.current) return; // month never loaded — banner explains, edits are off
    setActual(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await kvSet(actualKey(ym), next);
      if (ok === false) { setSaveState("error"); return; }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    }, 600);
  };

  const persistMtd = (next) => {
    if (loadFailedRef.current) return; // month never loaded — banner explains, edits are off
    setMtd(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await kvSet(mtdKey(ym), next);
      if (ok === false) { setSaveState("error"); return; }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    }, 600);
  };

  // YTD table is a single shared record (not month-scoped) — it's the rolling
  // FY-to-date column from the FCR. Persist debounced, like the MTD inputs.
  const persistYtd = (next) => {
    if (loadFailedRef.current) return; // YTD never loaded — banner explains, edits are off
    setYtdRec(next);
    setYtdSaveState("saving");
    if (ytdTimer.current) clearTimeout(ytdTimer.current);
    ytdTimer.current = setTimeout(async () => {
      const ok = await kvSet(YTD_KEY, next);
      if (ok === false) { setYtdSaveState("error"); return; }
      setYtdSaveState("saved");
      setTimeout(() => setYtdSaveState("idle"), 2000);
    }, 600);
  };

  /* One-paste FCR import (Matt, Aug 1 2026: "give me an import button for
     the monthly FCR, but don't kill the hand edit option"). Writes through
     the SAME gated persists the hand forms use, filters YTD labels against
     this page's own table so a mistyped label is named and ignored, never
     invented as a new line, and refuses cross-month pastes the same way
     the giveaways form refuses cross-month dates. Hand edits stay. */
  const importFcrPaste = (text) => {
    if (loadFailedRef.current) return { ok: false, message: "This month's records never loaded — the banner explains. Reopen the tile before importing." };
    const p = parseFcrPaste(text);
    if (p.error) return { ok: false, message: p.error };
    if (p.ym !== ym) return { ok: false, message: `This paste is for ${p.ym}. Flip the month arrows to it first, then import.` };
    const done = [];
    const dropped = [];
    if (p.ytd) {
      const known = new Set([...YTD_LINE_LABELS, ...Object.keys(ytdRec.lines || {})]);
      const lines = { ...ytdRec.lines };
      Object.entries(p.ytd.lines).forEach(([l, v]) => { if (known.has(l)) lines[l] = v; else dropped.push(l); });
      persistYtd({ throughYm: p.ytd.throughYm, sales: p.ytd.sales, lines, profit: { ...ytdRec.profit, ...p.ytd.profit } });
      done.push("the YTD column");
    }
    if (p.actual) {
      persistActual({ ...(actual || {}), netProfit: String(p.actual.netProfit), sales: String(p.actual.sales) });
      done.push("actual net + sales");
    }
    return { ok: true, message: `Imported for ${monthNameCased}: ${done.join(" and ")}.${dropped.length ? ` Ignored unknown lines: ${dropped.join(", ")}.` : ""} The hand-edit fields still work — give the numbers a once-over.` };
  };

  const setYtdLine = (label, raw) => persistYtd({ ...ytdRec, lines: { ...ytdRec.lines, [label]: cleanSigned(raw) } });
  const setYtdSales = (raw) => persistYtd({ ...ytdRec, sales: cleanDec(raw) });
  const setYtdThrough = (raw) => persistYtd({ ...ytdRec, throughYm: String(raw).replace(/[^0-9-]/g, "") });
  /* ⚠️ THE ONE PATH THAT WRITES THE SEED, SO IT IS THE ONE THAT MUST REFUSE.
     The figures are no longer compiled in; if the fetch was forbidden or failed,
     `ytdSeed` is null and persisting it would blank a real stored YTD column
     behind a confirm box that promised to restore numbers. Refuse and say so. */
  const resetYtdSeed = () => {
    const seed = fcr && fcr.ytdSeed;
    if (!seed || !seed.lines) {
      window.alert("The seeded 30-JUN-26 column could not be read, so there is nothing to reset to. Your entered numbers are untouched. Close the tile and reopen it, then try again.");
      return;
    }
    if (window.confirm("Reset the YTD figures to the seeded 30-JUN-26 column? Your entered YTD numbers will be replaced.")) persistYtd(seed);
  };

  // Typing wages, hours, or PTO clears the labor % override — otherwise the
  // override silently shadows the number you just typed and nothing on
  // screen appears to respond.
  const isTimeField = (f) => f === "hours" || f === "ot";

  /* ── PTO IN THREE BOXES ─────────────────────────────────────────────────
     Matt, Jul 28: "I update PTO twice monthly" and "I need to see up to 3
     inputs per month." So three fixed boxes, not a list with buttons — he can
     see each pay period's amount and change one without retyping the others.
     ⚠️ `pto` REMAINS THE STORED TOTAL and is recomputed from the three on every
     commit, so labor %, projected wages and the MTD stat all keep reading the
     one field they already read. The boxes are the input; the total is derived.
     There is no second source of truth to drift. */
  const PTO_SLOTS = ["ptoA", "ptoB", "ptoC"];
  const isPtoSlot = (f) => PTO_SLOTS.includes(f);
  const ptoTotalOf = (o) => round2(PTO_SLOTS.reduce((sum, k) => sum + (Number(o[k]) || 0), 0));

  // Typing only touches the draft. Nothing reaches storage until blur, so a
  // half-finished "8086:" or "408 +" can never be persisted or read as a number.
  const editMtdField = (field, raw) =>
    setDraft((d) => ({ ...d, [field]: isTimeField(field) ? cleanTimeExpr(raw) : cleanMoneyExpr(raw) }));

  /* Commit on blur. An unreadable entry REVERTS rather than overwriting — losing
     what someone typed is annoying; replacing a real month's payroll with a
     mangled number is the thing that actually costs money. */
  /* ★★ SAVING PAYROLL PINS THE WINDOW BY ITSELF.
     Matt, Jul 29 2026: "if I only input labor 1 time weekly the % shouldn't
     change", and "it needs to stay simple… without me having to check or
     uncheck a box or date".

     THE PROBLEM IN ONE LINE: sales go in daily, payroll goes in weekly. Labor %
     is (wages + PTO) ÷ sales-in-the-window, and with no pinned date the window
     auto-tracks the last sales day. So every day he entered sales, the
     denominator grew while the numerator sat still from Monday's payroll, and
     the labor % drifted DOWN on its own — better-looking, and wrong. The date
     picker and the hold checkbox both existed to stop that by hand. He was
     doing the Hub's job for it.

     ⇒ The moment wages or hours are saved, pin the window to the last sales day
     that exists AT THAT MOMENT. The % then holds exactly where it landed until
     the next payroll entry, however many days of sales go in between. Nothing
     to tick, nothing to date.

     ⚠️ PINNED ON PAYROLL ONLY, never on a PTO or OT edit. Those correct a
     number inside a window already agreed; re-pinning on them would silently
     move the window every time he fixed a typo.
     ⚠️ THE STAMP STILL MATTERS. It records the wages and hours the date was
     agreed against, which is what lets the page notice later that payroll moved
     and the date did not. Auto-pinning does not remove that check, it feeds it.
     ⚠️ An explicit date he set by hand is NOT overwritten — see the guard on
     `manualThrough`. Automatic behaviour must never quietly undo a deliberate
     choice. */
  const pinWindowOnPayroll = (next, field) => {
    if (field !== "wages" && field !== "hours") return next;
    if (mtd.manualThrough) return next;            // he chose a date himself; leave it
    /* ★★ PIN TO THE LAST COMPLETED DAY, NOT THE LAST TYPED SALES DAY.
       🐛 Jul 31 2026: payroll was saved BEFORE that morning's sales entry, so
       the window pinned one day short — the wages covered through Jul 30 but
       the window stopped at Jul 29. Labor printed 23.27% against CFA's 22.2,
       a full point high, from entry order alone. Payroll always covers through
       yesterday whether or not yesterday's sales are typed yet, and sales
       typed later flow into a window that already spans them. So pin to
       yesterday and the order stops mattering.
       ⚠️ Never pinned to a date before this month begins — a save on the 1st
       would window zero days and blank the %. That morning stays auto-track,
       exactly what the old no-sales-yet guard did. */
    const iso = yesterdayISO();
    if (iso < `${ym}-01`) return next;
    return { ...next, hoursThrough: iso, throughStamp: { wages: next.wages || "", hours: next.hours || "" } };
  };

  const commitMtdField = (field) => {
    const raw = draft[field];
    setDraft((d) => { const n = { ...d }; delete n[field]; return n; });
    if (raw === undefined) return;
    if (String(raw).trim() === "") {
      let next = { ...mtd, [field]: "" };
      if (isPtoSlot(field)) next.pto = ptoTotalOf(next) || "";
      if (field === "wages" || field === "hours" || field === "pto" || isPtoSlot(field)) next.laborPctOverride = "";
      next = pinWindowOnPayroll(next, field);
      persistMtd(next);
      return;
    }
    const total = isTimeField(field) ? sumTime(raw) : sumMoney(raw);
    if (total === null) return;                       // unreadable → keep what was there
    let next = { ...mtd, [field]: round2(total) };
    if (isPtoSlot(field)) next.pto = ptoTotalOf(next) || "";
    if (field === "wages" || field === "hours" || field === "pto" || isPtoSlot(field)) next.laborPctOverride = "";
    next = pinWindowOnPayroll(next, field);
    persistMtd(next);
  };

  // What the box shows: the draft while editing, otherwise the stored value —
  // rendered back into H:MM for the two time fields.
  const mtdShown = (field) =>
    draft[field] !== undefined ? draft[field]
      : isTimeField(field) ? hoursToHmm(mtd[field])
      : String(mtd[field] ?? "");

  // Live echo under the fields so a sum or a conversion is never a mystery.
  const draftEcho = (field) => {
    const raw = draft[field];
    if (raw === undefined || String(raw).trim() === "") return null;
    const total = isTimeField(field) ? sumTime(raw) : sumMoney(raw);
    if (total === null) return "can't read that — leave the field to keep the old value";
    return isTimeField(field) ? `${hoursToHmm(total)} · ${round2(total)} hrs` : `$${Number(total).toFixed(2)}`;
  };

  const echoStyle = { fontSize: 10.5, fontWeight: 700, color: "#0F766E", marginTop: 3 };

  const setHoursThrough = async (iso) => {
    // Snapshot the payroll numbers this date was set against. Wages/hours and
    // the through-date always move together in real life, so if wages later
    // change and this date doesn't, that mismatch IS the error — see
    // `wagesMovedSinceThrough` below. Clearing the date clears the snapshot
    // (empty = auto-track, nothing to go stale).
    const next = { ...mtd, hoursThrough: iso };
    /* `manualThrough` marks a date HE chose, so saving payroll does not quietly
       move it back. Clearing the date clears the flag too — an empty date means
       "auto", and auto-pinning is exactly what should resume. */
    if (iso) { next.throughStamp = { wages: mtd.wages || "", hours: mtd.hours || "" }; next.manualThrough = true; }
    else { delete next.throughStamp; delete next.manualThrough; }
    persistMtd(next);
    setNonOpThrough(iso ? await monthNonOpHours(ym, iso).catch(() => 0) : 0);
  };

  // ── Sales summed through the SAME date the hours cover ──
  // The window follows a PINNED "hours through" date if set, else auto-tracks
  // the last day sales exist for. Auto-tracking is what makes entering a new
  // day's sales advance the window so productivity/labor reconcile as you
  // catch up — the old code froze this date once saved.
  const lastSalesIso = useMemo(() => Object.keys(salesDays).sort().pop() || "", [salesDays]);
  const effThrough = mtd.hoursThrough || lastSalesIso;
  const salesThrough = useMemo(() => {
    return Object.entries(salesDays).reduce((s, [iso, v]) => (!effThrough || iso <= effThrough ? s + v : s), 0);
  }, [salesDays, effThrough]);
  const salesFull = useMemo(() => Object.values(salesDays).reduce((s, v) => s + v, 0), [salesDays]);

  // ── YTD % per line for the projection carry (line ÷ YTD sales) ──
  const ytdSalesN = Number(ytdRec?.sales) || 0;
  const ytdMonths = ytdMonthCount(ytdRec?.throughYm);
  const ytdPctMap = useMemo(() => {
    const out = {};
    if (ytdSalesN > 0 && ytdRec?.lines) {
      for (const [label, amt] of Object.entries(ytdRec.lines)) {
        const a = Number(amt);
        if (isFinite(a)) out[label] = a / ytdSalesN;
      }
    }
    return out;
  }, [ytdRec, ytdSalesN]);

  // Per-line YTD AVERAGE dollars — the workbook's "Ytd Avg $" column: the
  // line's FY total spread over the months the YTD table covers.
  const ytdAvgD = (label) => {
    const a = Number(ytdRec?.lines?.[label]);
    return isFinite(a) && ytdMonths > 0 ? a / ytdMonths : null;
  };

  const wagesN = Number(mtd.wages) || 0;
  const ptoN = Number(mtd.pto) || 0;       // PTO dollars — a real labor cost, no worked hours attached
  const laborHeld = !!mtd.laborHold;       // his manual freeze — see the publish guard
  const laborCostN = wagesN + ptoN;        // what labor % and MTD labor cost run on
  // Storage always holds decimal hours — commitMtdField guarantees it, and the
  // H:MM only ever exists on screen. So these stay plain Number() reads.
  const hoursN = Number(mtd.hours) || 0;   // total PAID hours
  const otN = Number(mtd.ot) || 0;
  const opHours = Math.max(hoursN - nonOpThrough, 0); // operational hours (reference only)

  const liveAvgWage = hoursN > 0 && wagesN > 0 ? wagesN / hoursN : null;
  // Productivity now divides by TOTAL PAID hours to match CFA's reported
  // labor-productivity metric (was operational hours, which read high).
  const liveProd = hoursN > 0 && salesThrough > 0 ? salesThrough / hoursN : null;
  // Labor % now includes PTO dollars — PTO is real labor cost.
  const liveLaborPct = salesThrough > 0 && laborCostN > 0 ? laborCostN / salesThrough : null;

  // Goals — one source, from the Planner's tier + planned wage.
  const prodGoal = plan?.productivityGoal ?? null;
  const laborGoal = plan?.laborGoal ?? null;
  const plannedWage = plan?.plannedWage ?? null;

  const laborOverrideN = mtd.laborPctOverride !== "" && mtd.laborPctOverride != null
    ? Number(mtd.laborPctOverride) / 100 : null;
  const laborPct = laborOverrideN != null ? laborOverrideN : liveLaborPct;

  /* ⚠️ MOVED UP FROM ~L1030 (Aug 5 2026). It has to be declared BEFORE the
     profit projection at ~L980 reads `windowTrusted`. A useMemo body runs during
     render, so naming a const declared further down is a temporal dead zone
     crash, not a lint nit — see the TDZ check in CLAUDE.md. Every input it takes
     (mtd, lastSalesIso, effThrough, salesThrough, salesFull) is settled well
     above this line, so moving it changes no value anywhere. */
  const {
    pinned, salesLagWindow, salesBeyondWindow,
    windowStaleDays, windowStale, wagesMovedSinceThrough,
    /* ★ `trusted` IS READ FOR THE RENDER TOO (Aug 4 2026).
       The publish path has always been guarded — the effect below withholds s3
       and publishes a `held` state instead, so the dashboard, the L10 board and
       the digest never see an untrustworthy labor %. What was NOT guarded is
       THIS PAGE. The red "check the hours-through date" panel would be up, and
       three inches below it MTD LABOR still showed a percentage with a green or
       red tone and a dollar variance, as if it were measured.
       ⚠️ SAME VALUE THE PUBLISH EFFECT COMPUTES as laborWindowTrusted. If either
       moves, move both. */
    trusted: windowTrusted,
  } = laborTrust({ mtd, lastSalesIso, effThrough, salesThrough, salesFull });
  const laborSubTag = laborOverrideN != null
    ? " · entered manually"
    : liveLaborPct != null
      ? (ptoN > 0 ? ` · live ((wages + ${money(ptoN)} PTO) ÷ sales through date)` : " · live (wages ÷ sales through date)")
      : "";

  const avgWage = liveAvgWage != null ? liveAvgWage : m.avgWage;
  const wagesShown = wagesN > 0 ? wagesN : m.wages;
  const hoursShown = hoursN > 0 ? hoursN : m.hours;
  const otShown = mtd.ot !== "" ? otN : m.ot;
  const prodShown = liveProd != null ? liveProd.toFixed(2) : "—";

  const foodCostPctShown = foodCostLive?.foodPct != null ? foodCostLive.foodPct : m.foodCostPct;
  const foodCostGoalShown = m.foodCostGoal;
  /* The on-screen half of the same guard. The number still renders — hiding it
     would be worse — but it says out loud that one side is short, and by how
     many days, so nobody reads it as a clean figure. */
  const foodWindowShort = foodCostLive?.foodPct != null && !foodCostLive.windowTrusted;
  const foodCostSubTag = foodWindowShort
    ? ` · NOT COMPARABLE — food entered through ${prettyDate(foodCostLive.foodThrough)}, sales through ${prettyDate(foodCostLive.salesThrough)}`
    : foodCostLive?.foodPct != null
    ? " · live from Food Cost Tracker"
    : foodCostErr ? ` · live fetch failed (${foodCostErr}) — showing static fallback`
    : " · no tracker data yet — showing static fallback";

  const staticPaperPct = d.groups.find((g) => g.name === "Prime Costs")?.items.find(([l]) => l === "Paper Cost")?.[2] ?? null;
  const paperCostPctShown = foodCostLive?.paperPct != null ? foodCostLive.paperPct : staticPaperPct;

  /* ── The viewed month's own sales header (Matt, Aug 1 2026 — "the long
     term fix for the workbook"). A HAND-AUTHORED month keeps its transcribed
     figures. An AUTO-BUILT month (no workbook tab) stops borrowing the
     nearest tab's sales: LY is last year's SAME month — the Hub's own record
     when it has days, else the workbook's monthly history — and Est. Sales
     must be the live Planner forecast. With no forecast entered there is no
     projection, and the page says so instead of dressing another month's
     numbers as this one's. */
  /* 🐛 $1,472,314 WAS TWO MONTHS WEARING ONE MONTH'S LABEL (Matt, Aug 6 2026:
     "We didn't do that number for August last year" — he was right).
     lySalesDays deliberately merges last year's month AND the month after it,
     because the day-matching needs the spill (Aug 31 2026 pairs with
     Sep 1 2025). This line then summed the WHOLE map: Aug 2025 $759,025 +
     Sep 2025 $713,289 = the $1,472,314 the page printed as "LY Sales", which
     also drove Growth to −$643,920 while every day row read +13-15%.
     Verified three ways before fixing: the Hub's own daily records, the
     workbook reference table (758,957 / 713,217), and the two sums matching
     the printed figure to the dollar. The total now counts ONLY the days this
     month's business days actually pair with — same-weekday matched, spill
     included, nothing else — so it is one month, the same month the day rows
     show. */
  const lyMonthMatched = useMemo(() => {
    if (!ym) return 0;
    const [fy, fm] = ym.split("-").map(Number);
    let s = 0;
    const d = new Date(fy, fm - 1, 1);
    while (d.getMonth() === fm - 1) {
      if (d.getDay() !== 0) {
        s += Number(lySalesDays[lyMatchIso(`${fy}-${pad2(fm)}-${pad2(d.getDate())}`)]) || 0;
      }
      d.setDate(d.getDate() + 1);
    }
    return s;
  }, [ym, lySalesDays]);
  const lyHubTotal = lyMonthMatched;
  const refLy = ((fcr && fcr.lySales) || {})[String(py - 1)]?.[pad2(pm)] ?? null;
  const lySalesShown = hasTemplate ? d.sales.lySales : (lyHubTotal > 0 ? lyHubTotal : refLy);
  const estUsable = hasTemplate || estSalesLive != null;
  const estSalesShown = estSalesLive != null ? estSalesLive : d.sales.estSales;
  const growthShown = lySalesShown != null ? estSalesShown - lySalesShown : null;
  /* ⚠️ THIS IS A FORECAST, NOT PERFORMANCE. It compares a projection of the
     WHOLE month against last year's WHOLE month. Useful on this page next to
     the projection it belongs to; NOT the number to publish as "Sales vs LY".
     See growthMtdPct below. */
  const growthPctShown = lySalesShown > 0 && growthShown != null ? growthShown / lySalesShown : 0;
  /* ⚠️ "0%" AND "WE DO NOT KNOW" ARE DIFFERENT ANSWERS. growthPctShown falls
     back to 0 when last year's sales are missing, which renders as flat growth
     — a real number, on a card leaders read for the trend. This says which it
     is so the display can show a dash instead of inventing a zero. */
  const growthKnown = lySalesShown > 0 && growthShown != null;

  /* ★★ ACTUAL SALES GROWTH, MONTH TO DATE.
     🐛 Matt, Jul 30 2026: "our cfa now app says mtd productivity is 78.66 but %
     of sales is 22.3" — those two reconciled perfectly. What did not was
     growth. The Hub was publishing +9.3% to the L10 scorecard while CFA Now
     read +6.1%.

     Neither number was wrong; they answered different questions.
       Hub      — forecast of the WHOLE month vs last year's WHOLE month
       CFA Now  — actual sales SO FAR vs last year's SAME DAYS
     The scorecard row is labelled "Sales vs LY", which every reader takes as
     what the store has actually done. Publishing a projection there flattered
     the number by three points on a company metric, and it flattered in the
     direction that looks good — the same failure shape as turnover reading
     0.0%.

     ⚠️ LAST YEAR'S SAME-PERIOD SALES CANNOT BE DERIVED. This repo holds monthly
     LY totals only, and prorating a month by days elapsed would invent a daily
     curve that does not exist — weekends and a closed Sunday are not one
     twenty-ninth of a month each. So it is entered, like every other CFA
     figure, because analytics.cfahome.com is SSO-walled with no API.
     ⚠️ NO ENTRY MEANS NO PUBLISH. If he has not entered it, s1 is left alone
     rather than falling back to the forecast — a stale-but-real number beats a
     projection wearing performance's label. */
  /* ★★ DAY BY DAY AGAINST THE SAME WEEKDAY LAST YEAR — the CFA Now rule.
     Matt: "day over day but at month end its month over month". Every day in
     the window is paired with its match 364 days back (see lyMatchIso), and
     the month-to-date figure is just the sum of those pairs — so at month end
     it IS month over month, on the same footing corporate uses.

     This replaces matching by DAY NUMBER, which paired a Saturday against a
     Friday and had the Hub reporting +18.5% while CFA Now reported +8.8%.

     ⚠️ DRIVEN BY THE WINDOW, NOT BY WHICH DAYS HAVE ENTRIES. It walks every
     day from the 1st to `effThrough` and takes each one's match, whether or not
     sales were entered this year. Summing only the days somebody got round to
     entering would flatter the number every time entry ran behind, which is the
     trap the old version was deliberately avoiding — that protection is kept.
     ⚠️ Days with no LY record contribute 0 on both sides rather than being
     skipped, so a missing history day cannot silently inflate growth. */
  const lyThroughDay = Number(String(effThrough || "").slice(8, 10)) || 0;

  /* One row per day: what we took, what the matching day took last year, and
     the gap. This is the table the app shows, and the roll-up is built FROM it
     so the headline and the detail can never disagree. */
  const dayCompare = useMemo(() => {
    if (!lyThroughDay || !ym) return [];
    const rows = [];
    for (let day = 1; day <= lyThroughDay; day++) {
      const iso = `${ym}-${String(day).padStart(2, "0")}`;
      const lyIso = lyMatchIso(iso);
      const tySales = Number(salesDays[iso]) || 0;
      const lySale = Number(lySalesDays[lyIso]) || 0;
      if (tySales <= 0 && lySale <= 0) continue;      // store closed both years
      rows.push({
        iso, lyIso, ty: tySales, ly: lySale,
        diff: tySales - lySale,
        pct: lySale > 0 ? (tySales - lySale) / lySale : null,
      });
    }
    return rows;
  }, [ym, lyThroughDay, salesDays, lySalesDays]);

  const lySalesThrough = useMemo(
    () => dayCompare.reduce((sum, r) => sum + r.ly, 0),
    [dayCompare]);
  /* lyMonthMatched — the same-weekday-matched LY month total — is declared up
     with lyHubTotal, where the two-months-in-one-label bug lived. The Month
     over month tile below reads it too. */

  /* His typed figure WINS when present. The Hub's own history is the default
     because it needs no upkeep, but CFA Now is the number the business is
     judged on, so he must be able to say so. */
  const lyMtdN = Number(mtd.lyMtd) || 0;
  const lyBasis = lyMtdN > 0 ? lyMtdN : lySalesThrough;
  const lyFromHub = lyMtdN <= 0 && lySalesThrough > 0;
  const growthMtdPct = lyBasis > 0 && salesThrough > 0 ? (salesThrough - lyBasis) / lyBasis : null;

  // Projection uses the live labor % when we have one, else the plan's goal.
  /* 🐛 THE PROJECTION WAS RUNNING ON THE NUMBER THIS PAGE REFUSES TO SHOW
     (Aug 5 2026 sweep, high severity — and I introduced it yesterday).
     Yesterday's change made MTD LABOR withhold its percentage, its tone and its
     dollar variance whenever the hours-through window is in doubt. It did not
     touch this line, so Net Profit went on being projected from that same
     distrusted labor %. The page ended up saying "this number is not reliable"
     directly above a profit figure computed from it, which is worse than either
     showing both or hiding both.
     ⇒ An untrusted window now falls through to the plan's GOAL, which is the
     branch that already existed for "we have no live number". A projection built
     on the target is a stated assumption. One built on a figure we have just
     told the reader not to trust is a guess wearing a decimal point. */
  const projLaborPct = (windowTrusted && laborPct != null) ? laborPct : laborGoal;
  const live = useMemo(
    () => buildLiveProjection(d, estSalesShown, foodCostPctShown, paperCostPctShown, projLaborPct, ytdPctMap),
    [d, estSalesShown, foodCostPctShown, paperCostPctShown, projLaborPct, ytdPctMap]
  );

  // Actual net profit for headline / history / MTD stat. Precedence: value
  // YOU typed (KV) > workbook ACTUAL column for a CLOSED month > none.
  // Current/future months never use the workbook actual (partial), so they
  // stay on live projection. Workbook actual shows its own % (not net÷forecast).
  const sheetActual = (ym < curYm() && DATA[ym]?.actual != null) ? DATA[ym].actual : null;
  const kvActualNet = actual && actual.netProfit !== undefined && actual.netProfit !== ""
    ? Number(actual.netProfit) : null;
  const kvActualSales = actual && actual.sales !== undefined && actual.sales !== ""
    ? Number(actual.sales) : null;

  const savedActualNet = kvActualNet != null ? kvActualNet
    : (sheetActual?.netProfit ?? null);
  const actualSalesBasis = kvActualSales != null ? kvActualSales
    : (sheetActual?.sales ?? null);
  const savedActualDenom = actualSalesBasis != null && actualSalesBasis > 0 ? actualSalesBasis : estSalesShown;
  const savedActualPct = kvActualNet == null && sheetActual?.netProfitPct != null
    ? sheetActual.netProfitPct
    : (savedActualNet != null && savedActualDenom > 0 ? savedActualNet / savedActualDenom : null);

  const inActual = viewMode === "actual";
  const headlineNet = inActual && savedActualNet != null ? savedActualNet : live.totals.netProfit[0];
  const headlineNetPct = inActual && savedActualPct != null ? savedActualPct : live.totals.netProfit[1];
  const headlineLabel = inActual ? "ACTUAL NET PROFIT" : "PROJECTED NET PROFIT";

  const inputStyle = {
    ...num, fontSize: 16, fontWeight: 700, padding: "8px 10px", borderRadius: 8,
    border: "1.5px solid #E5E7EB", width: "100%", boxSizing: "border-box", textAlign: "right",
  };
  const ytdLabelStyle = { fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3 };
  const ytdInputStyle = { ...num, fontSize: 14, fontWeight: 700, padding: "6px 8px", borderRadius: 7, border: "1.5px solid #E5E7EB", boxSizing: "border-box", textAlign: "right" };

  const savedBadge =
    saveState === "saving" ? <span style={{ fontSize: 11, fontWeight: 800, color: "#7A5A00" }}>Saving…</span> :
    saveState === "saved" ? <span style={{ fontSize: 11, fontWeight: 800, color: GREEN }}>Saved ✓</span> :
    saveState === "error" ? <span style={{ fontSize: 11, fontWeight: 800, color: RED }}>Save failed</span> : null;

  const ytdBadge =
    ytdSaveState === "saving" ? <span style={{ fontSize: 11, fontWeight: 800, color: "#7A5A00" }}>Saving…</span> :
    ytdSaveState === "saved" ? <span style={{ fontSize: 11, fontWeight: 800, color: GREEN }}>Saved ✓</span> :
    ytdSaveState === "error" ? <span style={{ fontSize: 11, fontWeight: 800, color: RED }}>Save failed</span> : null;

  /* Five of these sit side by side, so the tint runs at 55% — at full strength
     the page reads as five coloured blocks rather than five cards (Matt: "the
     fcr colors are just a tad too strong"). And the accent runs down the LEFT
     as well as the top now, which every other card in the Hub does and these
     were missing ("those are missing the side colors"). */
  const card = (accent) => ({ background: cardSurface(accent, 0.55), border: "1px solid #E5E7EB", ...accentEdge(accent, 3), borderRadius: 14, padding: "16px 18px", boxShadow: CARD_3D });
  const arrowBtn = { fontSize: 18, fontWeight: 800, width: 34, height: 34, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#1B3A5C", cursor: "pointer" };
  const toggleBtn = (on, color) => ({ fontSize: 12.5, fontWeight: 800, padding: "6px 14px", borderRadius: 6, border: "none", background: on ? color : "transparent", color: on ? "#fff" : "#6B7280", cursor: "pointer" });

  // Window state for the inline hints:
  //  - pinned: the user set an explicit "hours through" date (else auto-track).
  //  - salesLagWindow: a pinned payroll window runs PAST the last entered sales
  //    day → productivity/labor read low until those days are entered.
  //  - salesBeyondWindow: sales exist past the window → those dollars excluded.
  /* ⚠️ THE TRUST RULE NOW LIVES IN laborWindow.js — ONE definition, shared with
     Planner so switching the productivity tier can republish this page's labor
     row safely. It is passed THIS PAGE'S OWN lastSalesIso / effThrough /
     salesThrough / salesFull, so nothing here is recomputed: labor % is
     untouched and the profit projection cannot move. */

  // ── STALE-WINDOW GUARDS ──
  // The through-date can't be derived — only Matt knows the last day payroll
  // covers — so instead of guessing it, we detect when it's gone stale.
  //
  // 1. windowStaleDays: a pinned date sitting more than a day behind the last
  //    entered sales day. The dollars past it are silently excluded, which is
  //    correct ONLY if payroll really stops there. Past a day, that's usually a
  //    forgotten date, so the hint below turns loud and states the excluded $.
  // 2. wagesMovedSinceThrough: wages/hours changed since the date was last set
  //    (compared against throughStamp). Payroll numbers and the date they cover
  //    always move together — one moving without the other IS the mistake, and
  //    it's the only signal here that catches a stale date even when sales are
  //    also behind.
  // (computed above by laborTrust — STALE_AFTER_DAYS lives in laborWindow.js)

  // Sales vs LY goal. Lives here (not just as an EOSTile seed) because this
  // page computes the actual — publishing actual+goal+hit together keeps the
  // KPI strip and the L10 board reading the same pair. EOSTile's hardcoded
  // seed can't be trusted to survive: this effect read-merge-writes s1, so
  // whichever wrote last won, and the strip was rendering Sales with a number
  // and no goal under it.
  const SALES_GROWTH_GOAL = 0.05; // +5%

  // ── Publish current-month headline metrics to the EOS scorecard feed ──
  // EOSTile reads eos:scorecard:2026-Q3 and merges these over its seeds, so
  // Food cost %, Labor %, and Sales vs LY on the L10 board are the SAME numbers
  // AND goals shown here — one source of truth, no hand-copied goals. Only the
  // live month feeds the weekly board. Read-merge-write so we touch only our
  // own rows (s1/s2/s3) and never clobber rows other tools publish.
  useEffect(() => {
    if (ym !== curYm()) return;
    // Never publish off a failed load — s1/s3 lean on the month record, and a
    // blank fallback would post wrong numbers to the L10 board. When the flag
    // clears on a clean re-read, this effect refires and publishes fresh.
    if (loadFailed) return;
    const rows = {};
    /* ⚠️ PUBLISHES THE ACTUAL, NEVER THE FORECAST. See growthMtdPct above.
       Without last year's same-period figure entered, this row is skipped
       entirely — the read-merge-write below never deletes, so the last real
       number holds rather than being replaced by a projection. */
    if (growthMtdPct != null && isFinite(growthMtdPct)) {
      rows.s1 = {
        actual: `${growthMtdPct >= 0 ? "+" : ""}${(growthMtdPct * 100).toFixed(1)}%`,
        goal: `+${(SALES_GROWTH_GOAL * 100).toFixed(0)}%`,
        hit: growthMtdPct >= SALES_GROWTH_GOAL,
        asOf: effThrough || null,
        at: new Date().toISOString(),
      };
    }
    /* ⚠️ FOOD IS PUBLISHED ONLY WHEN ITS WINDOW IS TRUSTWORTHY — the same rule
       labor has had all along, and the one food cost was missing on Aug 8 2026
       when it reported 23.91% (meeting goal) instead of 28.77% (over goal),
       because sales were entered a day further than the food invoices.
       ⚠️ THE STATIC FALLBACK IS ALWAYS TRUSTED. It is a whole closed month out of
       the workbook, so it has no window problem — only the LIVE tracker figure
       can be half a day short. */
    const foodWindowTrusted = foodCostLive?.foodPct == null ? true : !!foodCostLive.windowTrusted;
    if (foodCostPctShown != null && foodCostGoalShown != null && foodWindowTrusted) {
      rows.s2 = {
        /* 2 decimals, not 1. Producers publish DISPLAY STRINGS and every reader
           (dashboard KPI strip, EOS board, digest) renders them verbatim — so
           whatever precision is dropped here is gone downstream, unrecoverable.
           At ~$60k of monthly food a tenth of a point is ~$60, and the goal on
           the very next line has always been 2 decimals (27.56%), so a 1-decimal
           actual was being compared against a 2-decimal target. Matt, Jul 29:
           "only shows 28.7 instead of 28.73". */
        actual: `${(foodCostPctShown * 100).toFixed(2)}%`,
        goal: `≤ ${(foodCostGoalShown * 100).toFixed(2)}%`,
        hit: foodCostPctShown <= foodCostGoalShown,
        // Flagged when we're showing the STATIC workbook fallback rather than a
        // live tracker number, so a stale figure is identifiable downstream.
        stale: foodCostLive?.foodPct == null,
        // asOf = the last day this % actually covers, same as sales and labor.
        // Food cost was the only prime-cost row publishing without one, which is
        // why nobody could see it had gone out mid-entry.
        asOf: foodCostLive?.foodThrough || null,
        at: new Date().toISOString(),
        held: false,
      };
    } else if (foodCostPctShown != null) {
      /* ★★ SAY IT IS HELD RATHER THAN GO QUIET — the same shape as the labor row
         below. Read-merge-write per row, so the previous actual, goal, hit and
         asOf all stay exactly as they were: this marks the frozen number, it does
         not replace or re-date it. A reader can then say "held" instead of
         showing a figure that has quietly stopped moving. */
      rows.s2 = { held: true };
    }
    // ⚠️ LABOR IS PUBLISHED ONLY WHEN ITS WINDOW IS TRUSTWORTHY.
    // laborPct = (wages + PTO) ÷ salesThrough. Wages is an MTD PAYROLL TOTAL
    // covering a whole pay period; salesThrough only sums the days actually
    // entered. So a missed sales day shortens the DENOMINATOR while the
    // numerator stays whole, and labor % publishes HIGH — a false RED on the
    // dashboard, the L10 board and the digest, all reading this one row.
    //
    // This page already detects all three ways that window goes bad
    // (salesLagWindow / windowStale / wagesMovedSinceThrough) and warns about
    // them inline — but it published the bad number anyway. Now it doesn't.
    //
    // Skipping the row is exactly the carry-forward behaviour we want: the
    // effect below READ-MERGE-WRITES and never deletes, so the last trustworthy
    // labor % stays on the board until a good one replaces it. The number holds
    // instead of lurching, and nothing invents a value that was never measured.
    /* ★ AND A FOURTH SIGNAL, WHICH IS A SWITCH RATHER THAN A TEST (Jul 28).
       Matt: "If I forget to add the PTO labor hr then it's not accurate profit.
       The labor % needs locked in until I adjust it."
       ⚠️ A MISSING PTO CANNOT BE DETECTED. Blank PTO and "nobody took PTO this
       month" look identical, and a missing one makes labor read LOW — better
       than reality — which is the opposite direction from the false RED the
       other three signals catch. There is no honest automatic test for it.
       ⇒ So it is his switch. While it is on the labor row is not published and
       the last trustworthy figure holds, exactly as with the other three. */
    const laborWindowTrusted = !salesLagWindow && !windowStale && !wagesMovedSinceThrough;
    if (laborPct != null && laborGoal != null && laborWindowTrusted && !laborHeld) {
      rows.s3 = {
        // 2 decimals for the same reason as s2 above — readers render the string
        // verbatim, so precision dropped here cannot be recovered. The GOAL stays
        // at 1 decimal on purpose: it's a round target somebody set (24.0%), not
        // a measured figure, and "≤ 24.00%" reads as false precision.
        actual: `${(laborPct * 100).toFixed(2)}%`,
        goal: `≤ ${(laborGoal * 100).toFixed(1)}%`,
        hit: laborPct <= laborGoal,
        // asOf = the last day this % actually covers. Readers can render
        // "as of <date>" so a carried-forward number never looks live.
        asOf: effThrough || null,
        at: new Date().toISOString(),
        held: false,
      };
    } else if (laborPct != null) {
      /* ★★ WHEN THE ROW IS NOT PUBLISHED, SAY SO — DON'T JUST GO QUIET.
         Matt, Jul 28, looking at his own dashboard: the Today block said
         "payroll only covers through Jul 25" while the labor cell read
         "as of Jul 27". Both were true and they still misled him. The number
         and its date are BOTH from the last trusted publish; the guard had
         since frozen the row, and nothing said the figure had stopped moving.
         A date alone reads as freshness.
         ⇒ Publish ONLY the flag. The write below is read-merge-write PER ROW,
         so `actual`, `goal`, `hit` and `asOf` are all left exactly as they
         were — this adds a marker to the frozen number, it does not replace or
         re-date it. Readers can then say "held" instead of implying live.
         ⚠️ Covers BOTH reasons a row stops: Matt's manual hold, and the three
         window tests. From a reader's point of view they are the same fact —
         this number is not moving right now. */
      rows.s3 = { held: true };
    }
    if (!Object.keys(rows).length) return;
    let cancelled = false;
    (async () => {
      const period = `eos:scorecard:${eosPeriod()}`; // derived — one key for read+write
      // publishSharedRows: a FAILED read publishes nothing, instead of
      // arriving here as {} and wiping every other tool's rows (s4–s11). It
      // returns false rather than throw; a missed publish self-heals on the
      // next refire of this effect (any dep change or reopening the page).
      if (!cancelled) await publishSharedRows(period, rows);
    })();
    return () => { cancelled = true; };
    /* ⚠️ growthMtdPct, NOT growthPctShown, is what s1 now rides on. Leaving the
       forecast in this list and not the actual would mean entering last year's
       figure did not republish. */
  }, [ym, loadFailed, growthMtdPct, foodCostPctShown, foodCostGoalShown, laborPct, laborGoal,
      salesLagWindow, windowStale, wagesMovedSinceThrough, laborHeld, effThrough, foodCostLive]);

  /* ⚠️ THIS EARLY RETURN IS BELOW EVERY HOOK IN THIS COMPONENT, AND HAS TO STAY
     THERE. React needs the same hooks to run in the same order on every render;
     a return above one of them is the outage this repo already has written down
     (the dashboard rendered and every tool went blank). hookcheck enforces it —
     if you add a hook below this line the build stops.

     WHY IT EXISTS: the P&L now arrives over the network instead of being
     compiled in, so there is one frame where there is nothing to draw. Without
     this, that frame renders real-looking money — em dashes and the literal word
     undefined — which is worse than a spinner, because somebody screenshots it. */
  if (fcr === null) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: "#6B7480", fontSize: 13.5, fontWeight: 700 }}>
        Loading the FCR…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "22px 16px 48px", color: "#111827" }}>
      <style>{`
        .fcrNums { display: flex; align-items: baseline; gap: 10px; }
        .fcrNums .fcrPair { display: flex; align-items: baseline; gap: 8px; }
        .fcrNums .fcrPair + .fcrPair { border-left: 1px solid #E5E7EB; padding-left: 10px; }
        @media (max-width: 640px) {
          .fcrNums { flex-direction: column; align-items: flex-end; gap: 2px; }
          .fcrNums .fcrPair + .fcrPair { border-left: none; padding-left: 0; }
          .fcrColHead { display: none; }
        }
      `}</style>

      {showMonthPicker && <MonthYearPicker ym={ym} onPick={setYm} onClose={() => setShowMonthPicker(false)} />}

      {loadFailed && (
        <div style={{ background: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
          This month did not load, so typing is off — one saved field would write a
          near-blank month over the real record. Check the wifi, then switch months
          and back (or refresh the page) to retry.
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.14em", color: RED }}>FCR PROJECTIONS · #{STORE.fsr}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <button onClick={() => setYm(shiftYm(ym, -1))} style={arrowBtn}>‹</button>
            <button onClick={() => setShowMonthPicker(true)} style={{
              fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", background: "none", border: "none",
              cursor: "pointer", color: "#111827", padding: 0, borderBottom: "2px dotted #9CA3AF",
            }}>{period}</button>
            <button onClick={() => setYm(shiftYm(ym, +1))} style={arrowBtn}>›</button>
          </div>
          <div style={{ display: "inline-flex", marginTop: 10, background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
            <button onClick={() => setViewMode("proj")} style={toggleBtn(viewMode === "proj", TEAL)}>Projection</button>
            <button onClick={() => setViewMode("actual")} style={toggleBtn(viewMode === "actual", RED)}>Actual {actual ? "✓" : ""}</button>
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: inActual ? RED : GREEN }}>{headlineLabel}</div>
          <div style={{
            ...num, fontSize: 32, fontWeight: 900, lineHeight: 1.15, marginTop: 2, color: inActual ? RED : GREEN,
            borderTop: `1.5px solid ${inActual ? RED : GREEN}`, borderBottom: `4px double ${inActual ? RED : GREEN}`, padding: "3px 0 5px",
          }}>
            {/* No Planner forecast on an auto-built month = no projection.
                A dash is honest; another month's math in big green is not. */}
            {estUsable ? money(headlineNet) : "—"}
            <span style={{ fontSize: 15, fontWeight: 800, opacity: 0.7, marginLeft: 8 }}>{estUsable ? pct(headlineNetPct) : ""}</span>
          </div>
        </div>
      </div>

      {/* Auto-built month: no workbook tab. LY sales come from history, Est.
          Sales lives on the Planner forecast, every other line carries at YTD
          — the same math the open month always uses. A hand tab, if one is
          ever added to DATA, takes over automatically. */}
      {!hasTemplate && (
        <div style={{
          background: estUsable ? "#F0FDFA" : "#FFFBEB", border: `1px solid ${estUsable ? "#99F6E4" : "#FDE68A"}`, borderRadius: 12,
          padding: "12px 16px", marginBottom: 16, fontSize: 13, color: estUsable ? "#134E4A" : "#78350F",
        }}>
          {estUsable ? (
            <>
              <b>Auto-built {monthNameCased} — no hand sheet needed.</b> Last-year sales
              {lyHubTotal > 0 ? " come from the Hub's own sales record" : " come from the workbook's monthly history"},
              Est. Sales is live from the Planner, and every other line carries at YTD — the same math the open
              month always uses. Enter the month-end Net Profit under Actual when the FCR report returns.
            </>
          ) : (
            <>
              <b>No Planner forecast for {monthNameCased} yet.</b> Enter {monthNameCased}'s sales forecast in the
              Planner and this page builds the projection live — last-year sales and the YTD carry are already on
              file. Until then the line items below are {dataKey}'s math, not {monthNameCased}'s.
            </>
          )}
        </div>
      )}

      {viewMode === "actual" && (
        <div style={{ background: cardSurface(), border: "1px solid #E5E7EB", borderRadius: 12, ...accentEdge(TEAL, 3), boxShadow: CARD_3D, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
            <b>FCR back from corporate?</b> Drop the PDF on Claude, paste the block it hands back, and this fills the actual and the YTD column in one go. Every hand-edit field below keeps working.
          </div>
          {/* 🐛 A PLACEHOLDER TEACHES A FORMAT. IT DOES NOT NEED REAL MONEY.
              (Aug 9 2026 sweep, findings 14 and 31.) These strings are compiled
              verbatim into a public chunk that answers any anonymous request,
              so the example numbers WERE the store's real figures: July's month
              sales, the year-to-date, the food cost, and last year's same-days
              sales in the field further down. Two curls and a stranger has this
              restaurant's top line — the same door as the safe counts and the
              P&L, both closed earlier today, in the same file class.
              ⚠️ THE FORMAT IS PRESERVED EXACTLY and only the values changed —
              same pipes, same two decimals, same hh:mm and "a + b" shapes — so
              every hint still teaches what it always taught. Round numbers read
              as an example; a precise one reads as data.
              ⚠️ Placeholders computed at RUNTIME from live values (the net
              profit hint below, the labor percent further down) are a different
              thing and are left alone: they are shown to someone already signed
              in and are never compiled into the bundle. */}
          <PasteMonth buttonLabel="Paste the FCR"
            placeholder={"FCR " + ym + "\nactual | 50000.00 | 800000.00\nytd | " + ym + " | 5000000.00\nFood Cost | 1500000.00\n…"}
            onImport={importFcrPaste} />
        </div>
      )}

      {viewMode === "actual" && (
        <div style={{
          background: (actual || sheetActual) ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${(actual || sheetActual) ? "#FECACA" : "#FDE68A"}`,
          borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex",
          justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ fontSize: 13, color: "#78350F" }}>
            <b>Actual mode.</b> {actual
              ? "Showing the month-end Net Profit you entered. Edit the figure below; changes save automatically."
              : sheetActual
              ? "Showing this month's actual Net Profit from the FCR workbook. Type a figure to override it with corporate's final."
              : "Enter the real month-end Net Profit below once corporate sends the FCR back — saved separately from the projection."}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#78350F" }}>Actual Net Profit $</span>
            <input inputMode="decimal" value={netFocus ? (actual?.netProfit ?? "") : fmtGroup(actual?.netProfit)} placeholder={money(sheetActual?.netProfit ?? live.totals.netProfit[0])}
              onFocus={() => setNetFocus(true)}
              onBlur={() => setNetFocus(false)}
              onChange={(e) => persistActual({ ...(actual || {}), netProfit: e.target.value.replace(/[^0-9.\-]/g, "") })}
              style={{ ...num, fontSize: 15, fontWeight: 700, padding: "7px 10px", borderRadius: 8, border: "1.5px solid #FCA5A5", width: 140, textAlign: "right" }} />
            {actual && (
              <button onClick={() => { if (window.confirm("Clear the entered actual numbers for this month? The projection stays intact.")) persistActual(null); }}
                style={{ fontSize: 12, fontWeight: 700, color: RED, background: "#fff", border: "1px solid #FECACA", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
                Clear
              </button>
            )}
            {savedBadge}
          </div>
        </div>
      )}

      {/* ★ ACTUAL vs YTD AVERAGE, side by side (Matt, Jul 31: "the actual
          should be a side by side view vs the ytd avg"). The YTD column is the
          rolling FY table below: net = YTD sales minus every line, and the
          monthly pace divides by the months it covers. Renders only when both
          sides exist — a half-empty comparison would invite reading a blank
          as a number. */}
      {viewMode === "actual" && (() => {
        const ytdNet = ytdNetProfitOf(ytdRec, ytdSalesN);
        const haveYtd = ytdNet != null && ytdMonths > 0;
        const haveActual = savedActualNet != null;
        if (!haveActual || !haveYtd) {
          return (
            <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontSize: 12.5, color: "#64748B" }}>
              {!haveActual
                ? "Enter the actual net profit above and it compares against the YTD average here."
                : "Fill in the YTD table below (sales, lines, and the through-month) and the comparison appears here."}
            </div>
          );
        }
        const avgNet = ytdNet / ytdMonths;
        /* ⚠️ Guarded because a YTD sales of 0 printed "Infinity%" straight into
           the comparison card. That happens on a part-filled YTD table — net
           entered, sales not yet — which is exactly the state this card is
           meant to be looked at in. null renders as the em dash the other
           cells already use for "not known yet", which is the honest answer. */
        const ytdPct = ytdSalesN > 0 ? ytdNet / ytdSalesN : null;
        const avgSales = ytdSalesN / ytdMonths;
        const dNet = savedActualNet - avgNet;
        // Both sides required. `savedActualPct - null` is silently `- 0`, which
        // would print the actual as if the YTD baseline were zero.
        const dPts = savedActualPct != null && ytdPct != null ? (savedActualPct - ytdPct) * 100 : null;
        const cell = (label, val, sub) => (
          <div style={{ flex: "1 1 200px", padding: "10px 14px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: "#6B7280" }}>{label}</div>
            <div style={{ ...num, fontSize: 22, fontWeight: 900, marginTop: 2 }}>{val}</div>
            {sub && <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>{sub}</div>}
          </div>
        );
        return (
          <div style={{ background: cardSurface(), border: "1px solid #E5E7EB", borderRadius: 12, ...accentEdge(TEAL, 3), boxShadow: CARD_3D, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid #F3F4F6" }}>
              {cell("THIS MONTH · ACTUAL NET",
                money(savedActualNet),
                savedActualPct != null ? `${pct(savedActualPct)} of ${money(savedActualDenom)} sales` : null)}
              <div style={{ width: 1, background: "#E5E7EB" }} />
              {cell(`YTD MONTHLY AVERAGE · THROUGH ${String(ytdRec?.throughYm || "").toUpperCase()}`,
                money(avgNet),
                `${pct(ytdPct)} of sales · avg month ${money(avgSales)} over ${ytdMonths} months`)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "9px 14px", background: dNet >= 0 ? "#F0FDF4" : "#FEF2F2" }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: dNet >= 0 ? "#166534" : "#991B1B" }}>
                {dNet >= 0 ? "Ahead of the YTD pace" : "Behind the YTD pace"}
              </span>
              <span style={{ ...num, fontSize: 13.5, fontWeight: 800, color: dNet >= 0 ? "#166534" : "#991B1B" }}>
                {dNet >= 0 ? "+" : "−"}{money(Math.abs(dNet))}{dPts != null ? ` · ${dPts >= 0 ? "+" : "−"}${Math.abs(dPts).toFixed(2)} pts` : ""}
              </span>
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>

        {/* ── Statement column ───────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={card(TEAL)}>
            <SectionLabel color={TEAL}>SALES</SectionLabel>
            <Row label="LY Sales" dollars={lySalesShown} percent={null} />
            <Row label="Growth" dollars={growthShown} percent={null} live={estSalesLive != null} />
            <Row label="Misc. Revenue" dollars={d.sales.miscRevenue} percent={0} muted={d.sales.miscRevenue === 0} />
            {/* ★ THE HEADLINE IS THE HANDLE. The day-by-day table folds under
                this band rather than sitting open forever.
                ⚠️ IT IS ONLY A BUTTON WHEN THERE IS SOMETHING TO OPEN. With no
                entered days the band renders as the plain row it always was —
                a chevron that opens nothing reads as broken, and this is the
                first month of the year where that state is normal.
                ⚠️ `font: inherit` and `border: none` are load-bearing: a bare
                <button> would take the browser's chrome font and grey face and
                the band would stop matching the three rows above it. */}
            {(() => {
              const bandStyle = {
                display: "flex", alignItems: "baseline", gap: 10, width: "100%", background: cardSurface(TEAL, 0.65),
                border: "none", borderLeft: `3px solid ${TEAL}`, borderTop: `3px solid ${TEAL}`,
                borderRadius: "0 7px 7px 0", padding: "7px 10px", marginTop: 10, font: "inherit", textAlign: "left",
              };
              const inner = (
                <>
                  <span style={{ fontSize: 13, fontWeight: 900, color: TEAL, flex: 1 }}>
                    Est. Sales
                    {estSalesLive != null && <span style={{ fontSize: 9.5, fontWeight: 800, marginLeft: 6, letterSpacing: "0.06em", opacity: 0.8 }}>LIVE · from Planner forecast</span>}
                  </span>
                  <span style={{ ...num, fontSize: 15, fontWeight: 900, color: TEAL, minWidth: 96, textAlign: "right" }}>{money(estSalesShown)}</span>
                  <span style={{ ...num, fontSize: 12, fontWeight: 800, color: TEAL, opacity: 0.75, minWidth: 58, textAlign: "right" }}>{growthKnown ? `${growthPctShown >= 0 ? "+" : ""}${pct(growthPctShown)}` : "—"}</span>
                </>
              );
              if (!dayCompare.length) return <div style={bandStyle}>{inner}</div>;
              return (
                <button
                  onClick={() => setDaysOpen((o) => !o)}
                  aria-expanded={daysOpen}
                  style={{ ...bandStyle, cursor: "pointer" }}
                >
                  {inner}
                  <span style={{ fontSize: 11, fontWeight: 800, color: TEAL, opacity: 0.85, whiteSpace: "nowrap" }}>
                    {daysOpen ? "▾" : `${dayCompare.length} ${dayCompare.length === 1 ? "day" : "days"} ▸`}
                  </span>
                </button>
              );
            })()}

            {/* ★ BOTH GROWTH NUMBERS, SIDE BY SIDE, LABELLED (Matt, Jul 30 2026:
                "i actually want to see both 6.3 and 9.3").

                They are not a disagreement — they answer two questions:
                  ACTUAL   what the store has really done, days 1..n vs the same
                           days last year. This is what publishes to the L10.
                  FORECAST where the month lands if the projection holds, whole
                           month vs whole month.
                ⚠️ THE LABELS ARE THE WHOLE POINT. Showing two growth figures
                without saying which is which is worse than showing one — that
                ambiguity is exactly what put a forecast on the scorecard under
                the words "Sales vs LY". */}
            {/* ★ DAY BY DAY, THE WAY CFA NOW SHOWS IT. The roll-up above is the
                sum of these rows, so the headline and the detail cannot drift
                apart — and each row names the day last year it is measured
                against, which is the thing that was wrong and invisible. */}
            {dayCompare.length > 0 && daysOpen && (
              <div style={{ marginTop: 10, border: "1px solid #E5E7EB", borderRadius: 9, overflow: "hidden" }}>
                <div style={{ display: "flex", background: "#F9FAFB", padding: "6px 10px", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", color: "#6B7280", textTransform: "uppercase" }}>
                  <span style={{ flex: "0 0 78px" }}>Day</span>
                  <span style={{ flex: 1, textAlign: "right" }}>Sales</span>
                  <span style={{ flex: 1, textAlign: "right" }}>LY same day</span>
                  <span style={{ flex: "0 0 64px", textAlign: "right" }}>Change</span>
                </div>
                {dayCompare.map((r) => (
                  <div key={r.iso} style={{ display: "flex", alignItems: "center", padding: "6px 10px", borderTop: "1px solid #F1F3F5", fontSize: 12 }}>
                    <span style={{ flex: "0 0 78px", color: INDIGO, fontWeight: 700 }}>
                      {r.iso.slice(5).replace("-", "/")}
                      <span style={{ color: "#9CA3AF", fontWeight: 600 }}> {new Date(`${r.iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</span>
                    </span>
                    <span style={{ ...num, flex: 1, textAlign: "right" }}>{money(r.ty)}</span>
                    <span style={{ ...num, flex: 1, textAlign: "right", color: "#6B7280" }} title={`vs ${r.lyIso}`}>{money(r.ly)}</span>
                    <span style={{ ...num, flex: "0 0 64px", textAlign: "right", fontWeight: 800, color: r.pct == null ? "#9CA3AF" : r.pct >= 0 ? TEAL : RED }}>
                      {r.pct == null ? "—" : `${r.pct >= 0 ? "+" : ""}${(r.pct * 100).toFixed(1)}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {growthMtdPct != null && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 150px", background: "#F0FDF9", border: `1px solid ${TEAL}33`, borderRadius: 9, padding: "8px 11px" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.07em", color: TEAL, textTransform: "uppercase" }}>Day over day</div>
                  <div style={{ ...num, fontSize: 19, fontWeight: 900, color: TEAL, marginTop: 2 }}>
                    {growthMtdPct >= 0 ? "+" : ""}{(growthMtdPct * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>
                    {money(salesThrough)} vs {money(lyBasis)} last year, days 1&ndash;{lyThroughDay},
                    matched to the same weekday.
                    <b> This is what the L10 board shows.</b>
                  </div>
                </div>
                {/* ★ MONTH OVER MONTH — the projected finish (Matt, Aug 6 2026:
                    "it should have a good idea for the projected finish over
                    last year. There should be a day over day % and a month over
                    month%"). Actual dollars for the days that are entered plus
                    the Planner's own per-day forecast for the days that are not
                    — his holiday overrides live there, so a zeroed holiday
                    projects as zero, not as an average Tuesday. Computed in
                    laborEngine.monthProjectedFinish, ONE implementation, so no
                    other surface can drift from this number. Replaced the
                    forecast-only tile: a projection that ignores the month's own
                    actuals answers a weaker question than this one. */}
                {(() => {
                  const lyMonthBasis = lyMonthMatched > 0 ? lyMonthMatched : lySalesShown;
                  return (
                <div style={{ flex: "1 1 150px", background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9, padding: "8px 11px" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.07em", color: "#6B7280", textTransform: "uppercase" }}>Month over month</div>
                  <div style={{ ...num, fontSize: 19, fontWeight: 900, color: "#6B7280", marginTop: 2 }}>
                    {projFinish && lyMonthBasis > 0
                      ? `${projFinish.projected >= lyMonthBasis ? "+" : ""}${(((projFinish.projected - lyMonthBasis) / lyMonthBasis) * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2, lineHeight: 1.4 }}>
                    {projFinish
                      ? <>{money(projFinish.projected)} projected finish vs {money(lyMonthBasis)} last {monthNameCased}{lyMonthMatched > 0 ? ", matched to the same weekdays" : ""} — {projFinish.entered} {projFinish.entered === 1 ? "day" : "days"} actual, planner forecast for the rest.</>
                      : <>Needs at least one entered sales day this month.</>}
                  </div>
                </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div style={card(RED)}>
            <SectionLabel color={RED}>EXPENSES</SectionLabel>
            {inActual && (
              <div className="fcrColHead" style={{ display: "flex", gap: 10, padding: "2px 0 6px", borderBottom: "1.5px solid #E5E7EB", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", color: "#9CA3AF" }}>
                <span style={{ flex: 1 }} />
                <span style={{ minWidth: 132, textAlign: "right", color: "#6B7280" }}>THIS MONTH</span>
                <span style={{ minWidth: 142, textAlign: "right", color: INDIGO, paddingLeft: 10 }}>YTD AVG</span>
              </div>
            )}
            {live.groups.map((g) => {
              const subtotal = g.items.reduce((s, [, v]) => s + v, 0);
              const subtotalPct = g.items.reduce((s, [, , p]) => s + (p || 0), 0);
              return (
                <div key={g.name}>
                  <GroupHeader name={g.name} color={g.color} subtotal={subtotal} subtotalPct={subtotalPct} />
                  {g.items.map(([label, dollars, p]) => (
                    <Row key={label} label={label} dollars={dollars} percent={p} muted={dollars === 0} rail={`${g.color}55`} live={live.liveLabels.has(label)} ytd={!inActual && live.ytdLabels.has(label)}
                      ytdD={inActual ? ytdAvgD(label) : undefined} ytdP={inActual ? (ytdPctMap[label] ?? null) : undefined} />
                  ))}
                </div>
              );
            })}
            <div style={{ marginTop: 12 }}>
              <Row label="Total Expenses" dollars={live.totals.totalExpenses} percent={null} strong
                ytdD={inActual && ytdRec && ytdRec.lines && ytdMonths > 0 ? Object.values(ytdRec.lines).reduce((a, b) => a + (Number(b) || 0), 0) / ytdMonths : undefined}
                ytdP={inActual && ytdSalesN > 0 && ytdRec && ytdRec.lines ? Object.values(ytdRec.lines).reduce((a, b) => a + (Number(b) || 0), 0) / ytdSalesN : undefined} />
            </div>
          </div>

          <div style={card(GREEN)}>
            <SectionLabel color={GREEN}>PROFIT</SectionLabel>
            <Row label="Operating Profit" dollars={live.totals.operatingProfit[0]} percent={live.totals.operatingProfit[1]} strong />
            <Row label="Base Profit" dollars={live.totals.baseProfit[0]} percent={live.totals.baseProfit[1]} />
            <Row label="Base Operating Fee" dollars={live.totals.baseOperatingFee[0]} percent={live.totals.baseOperatingFee[1]} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 0 2px", borderTop: `1.5px solid ${GREEN}`, marginTop: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: GREEN, flex: 1, minWidth: 90 }}>Net Profit</span>
              <span className="fcrNums">
                <span className="fcrPair">
                  <span style={{ ...num, fontSize: 17, fontWeight: 900, color: GREEN, borderBottom: `3px double ${GREEN}`, paddingBottom: 2 }}>
                    {money(live.totals.netProfit[0])}
                  </span>
                  <span style={{ ...num, fontSize: 13, fontWeight: 800, color: GREEN, minWidth: 48, textAlign: "right" }}>{pct(live.totals.netProfit[1])}</span>
                </span>
                {inActual && (() => {
                  // The workbook's Net Profit row carries the YTD pair too — the
                  // FCR's real YTD net over the months it covers. Same helper as
                  // the comparison card above, so the two can never disagree.
                  const ytdNet = ytdNetProfitOf(ytdRec, ytdSalesN);
                  if (ytdNet == null || ytdMonths <= 0) return null;
                  return (
                    <span className="fcrPair">
                      <span style={{ fontSize: 8.5, fontWeight: 800, color: INDIGO, letterSpacing: "0.08em" }}>YTD</span>
                      <span style={{ ...num, fontSize: 13.5, fontWeight: 900, color: INDIGO, minWidth: 84, textAlign: "right" }}>
                        {money(ytdNet / ytdMonths)}
                      </span>
                      <span style={{ ...num, fontSize: 11.5, fontWeight: 800, color: INDIGO, minWidth: 48, textAlign: "right" }}>{pct(ytdNet / ytdSalesN)}</span>
                    </span>
                  );
                })()}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 8, lineHeight: 1.5 }}>
              Equipment Rent + Business Service Fee + Base Operating Fee = a fixed 15% of sales; the fee is the plug and recomputes with Est Sales.
            </div>
            {savedActualNet != null && (
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                Actual on file: {money(savedActualNet)} · {pct(savedActualPct)} — this card shows the projection.
              </div>
            )}
          </div>

          {/* ── YTD average reference (drives non-live projection lines) ── */}
          <div style={card(INDIGO)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <SectionLabel color={INDIGO}>YEAR-TO-DATE AVERAGE</SectionLabel>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>
                through {prettyMonth(ytdRec?.throughYm)} · {ytdMonths} mo
              </span>
            </div>

            {/* ★ THE PER-LINE LIST THAT USED TO SIT HERE IS GONE (Matt, Aug 2
                2026: "I like the view on the projected and actual line … it
                would really declutter if we can remove it"). Every figure it
                printed — Est Sales, each expense line's avg/mo and YTD %, and
                Net Profit — already appears as the blue YTD row under its own
                line in the statement above, which is the view he actually
                reads. Two copies of the same number is one copy too many, and
                it doubled the scroll on a phone.
                ⚠️ THE CARD ITSELF STAYS. It is the only way YTD figures get IN
                — the "Update YTD from FCR" editor below is what the monthly
                paste and every hand edit write through. Deleting the whole
                card would have decluttered the screen by removing the input. */}
            <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>
              Each line's year-to-date figure shows under it in the statement above.
              Non-live projection lines recompute from these percentages.
            </div>

            <button
              onClick={() => setYtdOpen((o) => !o)}
              style={{ marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: cardSurface(INDIGO, 0.65), border: `1px solid ${INDIGO}33`, borderRadius: 8, cursor: "pointer", padding: "9px 12px", textAlign: "left" }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", color: INDIGO }}>Update YTD from FCR</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{ytdBadge}<span style={{ fontSize: 12, color: INDIGO }}>{ytdOpen ? "▾" : "▸"}</span></span>
            </button>

            {ytdOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C7D2FE" }}>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10, lineHeight: 1.5 }}>
                  When the FCR comes back, type each line's <b>YTD $</b> straight from the report's “This Year · YTD” column, plus YTD total sales and the month it runs through. Saves automatically; the projection's non-live lines recompute from these.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <label>
                    <div style={ytdLabelStyle}>THROUGH (YYYY-MM)</div>
                    <input style={{ ...ytdInputStyle, width: "100%", textAlign: "left" }} value={ytdRec?.throughYm || ""} onChange={(e) => setYtdThrough(e.target.value)} placeholder="2026-06" />
                  </label>
                  <label>
                    <div style={ytdLabelStyle}>YTD TOTAL SALES ($)</div>
                    <input style={{ ...ytdInputStyle, width: "100%" }} inputMode="decimal" value={String(ytdRec?.sales ?? "")} onChange={(e) => setYtdSales(e.target.value)} placeholder="0.00" />
                  </label>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {Object.keys(ytdRec?.lines || {}).map((label) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 12, color: "#374151" }}>{label}</span>
                      <input style={{ ...ytdInputStyle, width: 130 }} inputMode="decimal" value={String(ytdRec.lines[label] ?? "")} onChange={(e) => setYtdLine(label, e.target.value)} />
                    </div>
                  ))}
                </div>
                <button onClick={resetYtdSeed} style={{ marginTop: 12, fontSize: 11.5, fontWeight: 700, color: "#6B7280", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
                  Reset to June seed
                </button>
              </div>
            )}
          </div>

          {/* Historical net profit for this month. Years derive from the
              selected month; current-year row prefers the actual. */}
          <div style={card("#B45309")}>
            <SectionLabel color="#B45309">NET PROFIT % — {period.split(" ")[0]} HISTORY</SectionLabel>
            {(() => {
              const mm = ym.split("-")[1];
              const selYear = Number(ym.split("-")[0]);
              const h = (((fcr && fcr.reference) || {}).historicalProfit || {})[mm] || {};
              const priorYears = [selYear - 3, selYear - 2, selYear - 1];
              /* ★ A YEAR WE NEVER PULLED IS NOT A ROW (Matt, Aug 9 2026: "im ok
                 with not having 2023"). After the labels were shifted back to
                 their true years, 2023 had no data at all and sat there as a
                 permanent dash next to three real figures — on a card whose
                 whole job is comparing this month against prior years.
                 ⚠️ FILTERED, NOT HARD-CODED TO TWO YEARS. Drop the year and the
                 row returns by itself the day those FCRs are entered, and the
                 same code keeps working when the calendar rolls forward. The
                 CURRENT year is pushed after this and is never filtered — it is
                 live or actual, and a blank current month is information. */
              const rows = priorYears
                .map((yr) => [yr, histPct(h[`p${yr}`]), null])
                .filter(([, val]) => val != null);
              const curVal = savedActualPct != null ? savedActualPct : live.totals.netProfit[1];
              const curTag = savedActualPct != null ? " · actual" : " · live";
              rows.push([selYear, curVal, curTag]);

              return rows.map(([yr, val, tag]) => {
                const isCur = yr === selYear;
                return (
                  <div key={yr} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dotted #D1D5DB" }}>
                    <span style={{ fontSize: 13.5, fontWeight: isCur ? 800 : 600, color: isCur ? RED : "#1F2937" }}>
                      {yr}{tag || ""}
                    </span>
                    <span style={{ ...num, fontSize: 13.5, fontWeight: 800, color: isCur ? RED : "#1F2937" }}>
                      {val != null ? pct(val) : "—"}
                    </span>
                  </div>
                );
              });
            })()}
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
              Same month across years — a quick read on whether this month is tracking above or below prior years.
            </div>
          </div>
        </div>

        {/* ── MTD panel ──────────────────────────────────────────── */}
        <div style={{ ...card("#111827"), alignSelf: "start" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <SectionLabel>MONTH TO DATE</SectionLabel>
            {savedBadge}
          </div>

          {/* Collapsible inputs */}
          <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 10, marginBottom: 6 }}>
            <button
              onClick={() => setInputsOpen((o) => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, background: "none", border: "none", cursor: "pointer", padding: "10px 12px", textAlign: "left",
              }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", color: "#6B7280" }}>
                MTD INPUTS
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!inputsOpen && (
                  <span style={{ ...num, fontSize: 11.5, fontWeight: 700, color: "#111827" }}>
                    {money(wagesN)} · {hoursN.toLocaleString("en-US")} hrs · {otN} OT{ptoN > 0 ? ` · ${money(ptoN)} PTO` : ""}
                  </span>
                )}
                <span style={{ fontSize: 12, color: "#6B7280" }}>{inputsOpen ? "▾" : "▸"}</span>
              </span>
            </button>

            {inputsOpen && (
              <div style={{ padding: "0 12px 10px" }}>
                {/* Not three equal columns: wages carries the longest value in the
                    row (142865.29, and six figures once a bigger month lands, more
                    again with a "+" expression), while OT is the shortest thing on
                    the page. Equal thirds truncated the one number that matters
                    most. Widths follow the content. */}
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.15fr 0.85fr", gap: 8 }}>
                  <label>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3 }}>WAGES ($)</div>
                    <input style={inputStyle} inputMode="text" placeholder="0.00 or 4 + 4" value={mtdShown("wages")}
                      onChange={(e) => editMtdField("wages", e.target.value)} onBlur={() => commitMtdField("wages")} />
                    {draftEcho("wages") && <div style={echoStyle}>{draftEcho("wages")}</div>}
                  </label>
                  <label>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3 }}>HOURS (PAID)</div>
                    {/* inputMode TEXT, not decimal, on the two TIME fields only:
                        a decimal keypad has no colon key, so H:MM could be
                        pasted but never typed. The other MTD fields are dollars
                        and keep their keypad. */}
                    <input style={inputStyle} inputMode="text" placeholder="8000:00" value={mtdShown("hours")}
                      onChange={(e) => editMtdField("hours", e.target.value)} onBlur={() => commitMtdField("hours")} />
                    {draftEcho("hours") && <div style={echoStyle}>{draftEcho("hours")}</div>}
                  </label>
                  <label>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3 }}>OT HRS</div>
                    <input style={inputStyle} inputMode="text" placeholder="100:00" value={mtdShown("ot")}
                      onChange={(e) => editMtdField("ot", e.target.value)} onBlur={() => commitMtdField("ot")} />
                    {draftEcho("ot") && <div style={echoStyle}>{draftEcho("ot")}</div>}
                  </label>
                </div>

                {/* The hours fields speak HotSchedules' format. Say so, and show
                    the conversion as it happens so a paste is never a mystery. */}
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                  {/* ⚠️ EXAMPLES IN HELP TEXT SHIP TOO. This sentence is not a
                      placeholder, it is rendered prose, and it carried the same
                      real paid-hours figure as the input above it — so changing
                      only the placeholder would have left the number on screen
                      and in the public chunk. Caught by grepping the BUILT
                      bundle rather than the source. Round numbers teach H:MM
                      just as well. */}
                  Hours show as <b>H:MM</b>, the way the Time Summary Report prints them — paste or type <b>8000:00</b> straight across.
                  Adding pay periods? Type them with a <b>+</b> (e.g. <b>400 + 100.50</b>) in any of these four and it totals them for you.
                </div>

                {/* PTO dollars — a real labor cost with no worked hours. Rolls into
                    the labor % and the projected wages, not into productivity. */}
                <div style={{ marginTop: 8 }}>
                  <label>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3 }}>
                      PTO ($) <span style={{ fontWeight: 500, color: "#9CA3AF" }}>(adds to labor cost)</span>
                    </div>
                  </label>

                  {/* ★ ONE BOX THAT ADDS UP, not three (Matt, Jul 29 2026: "PTO
                      can be one as long as it auto adds"). Three fixed slots
                      existed so he could see each pay period separately, but the
                      page already sums an expression in every other money field
                      — "408 + 112" reads as 520 and echoes the total under the
                      box. So the second and third boxes were solving a problem
                      the typing already solved, at the cost of two thirds of the
                      clutter he was complaining about. */}
                  <input style={inputStyle} inputMode="text" placeholder="400 + 100"
                    value={mtdShown("pto")}
                    onChange={(e) => editMtdField("pto", e.target.value)}
                    onBlur={() => commitMtdField("pto")} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3 }}>
                    LAST YEAR, SAME DAYS <span style={{ fontWeight: 500, color: "#9CA3AF" }}>{lyFromHub ? "(auto — override only if CFA Now differs)" : "(for sales growth)"}</span>
                  </div>
                  <input style={inputStyle} inputMode="text" placeholder="700000.00"
                    value={mtdShown("lyMtd")}
                    onChange={(e) => editMtdField("lyMtd", e.target.value)}
                    onBlur={() => commitMtdField("lyMtd")} />
                  {draftEcho("lyMtd") && <div style={echoStyle}>{draftEcho("lyMtd")}</div>}
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, lineHeight: 1.45 }}>
                    {lyFromHub ? (
                      <>
                        <b style={{ color: "#0F766E" }}>Worked out from your own Sales Allocation history</b> — last
                        year&rsquo;s same month, days 1&ndash;{lyThroughDay}. Leave this blank unless CFA Now disagrees.
                      </>
                    ) : (
                      <>From CFA Now — last year&rsquo;s sales for the same days this window covers.
                      At month end that is simply last year&rsquo;s month, so one field covers both.</>
                    )}
                    {growthMtdPct != null && (
                      <> Growth = ({money(salesThrough)} − {money(lyBasis)}) ÷ {money(lyBasis)} = <b>{(growthMtdPct * 100).toFixed(1)}%</b>.</>
                    )}
                    {growthMtdPct == null && <> No last-year figure yet, so the L10 sales row is left alone rather than showing the forecast.</>}
                    {lyFromHub && (
                      <div style={{ marginTop: 4 }}>
                        ⚠️ Expect this to sit a little away from CFA Now. Days are matched by DATE, not weekday —
                        the 1st fell on a different day of the week last year — and last year&rsquo;s figures were
                        rounded to the dollar. Type CFA Now&rsquo;s number above to override.
                      </div>
                    )}
                  </div>
                  {draftEcho("pto") && <div style={echoStyle}>{draftEcho("pto")}</div>}
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>
                    Type each amount separated by <b>+</b> and they add up. The total shows underneath.
                  </div>
                  {ptoN > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0F766E", marginTop: 4 }}>
                      Total PTO {money(ptoN)}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                    Added to wages for labor % and the projection. Leaves productivity and average wage on worked hours.
                    {ptoN > 0 && <> Labor cost = {money(wagesN)} + {money(ptoN)} PTO = <b>{money(laborCostN)}</b>.</>}
                  </div>
                </div>

                {/* ── HOLD + WINDOW: OUT OF THE WAY UNLESS THEY MATTER ──
                    Matt, Jul 29 2026: "MTD inputs for labor looks messy and
                    confusing… it needs to stay simple… without me having to
                    check or uncheck a box or date."

                    Saving payroll now pins the window by itself, so neither of
                    these is part of the weekly job any more. They are still
                    RIGHT — a deliberate hold and a hand-set date both have real
                    uses — but they were sitting at full size in a panel he
                    touches every week and never needs them in.

                    ⚠️ FOLDED, NOT REMOVED. Deleting the hold would take away the
                    one switch that covers a missing PTO, which is a thing no
                    automatic test can detect. The rule is: out of the way when
                    nothing is wrong, and IMPOSSIBLE TO MISS when it is.
                    ⚠️ It opens by itself whenever the hold is on or the date was
                    set by hand — a frozen labor % hidden behind a closed panel
                    is exactly the silent-wrong-number failure this whole page
                    keeps guarding against.
                    🐛 `pinned` used to hide this link too. That was written when
                    pinned meant a HAND-set date, which force-opens the panel.
                    Auto-pin (Jul 29) made pinned the everyday state WITHOUT
                    force-opening anything, so after the first payroll save of a
                    month the window controls were unreachable — Matt hit the
                    dead end Jul 31 trying to correct the window. The link now
                    hides only when the panel is already forced open. */}
                {(laborHeld || mtd.manualThrough) ? null : (
                  <button type="button" onClick={() => setShowLaborAdvanced((v) => !v)}
                    style={{ marginTop: 8, background: "none", border: "none", padding: 0, cursor: "pointer",
                             fontSize: 11, fontWeight: 700, color: "#6B7280", textDecoration: "underline" }}>
                    {showLaborAdvanced ? "Hide" : "Change the window or hold the %"}
                  </button>
                )}
                <div style={{ display: (showLaborAdvanced || laborHeld || mtd.manualThrough) ? "block" : "none" }}>
                <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${laborHeld ? "#F0C36D" : "#E5E7EB"}`, background: laborHeld ? "#FFF8E6" : "#fff" }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={laborHeld} style={{ marginTop: 2 }}
                      onChange={(e) => { const on = e.target.checked; persistMtd({ ...mtd, laborHold: on }); }} />
                    <span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#6B7280" }}>Hold the labor % where it is</span>
                      <span style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
                        Turn this on when something is still missing, like a PTO amount. The dashboard, the L10 board and
                        the digest keep showing the last good labor % until you turn it off. Nothing is lost, and this
                        does not stop you editing anything here.
                      </span>
                    </span>
                  </label>
                  {laborHeld && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8A6D1F", marginTop: 5 }}>
                      Held. This month's labor % is not being published{laborPct != null ? ` — it would currently read ${(laborPct * 100).toFixed(2)}%` : ""}.
                    </div>
                  )}
                </div>

                {/* Hours-through date — anchors the shared sales/hours window */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E5E7EB" }}>
                  {/* ── STALE-WINDOW BANNER ──
                      The through-date can't be derived (only you know the last day
                      payroll covers), so instead of guessing it we shout when it's
                      gone stale. Two triggers, either one fires this:
                        · wagesMovedSinceThrough — wages/hours changed but the date
                          didn't. They always move together, so this IS the mistake.
                        · windowStale — the date sits >1 day behind entered sales and
                          real dollars are being excluded.
                      Loud red, above the field, states the excluded $ — not the grey
                      hint below that's easy to scroll past. */}
                  {(wagesMovedSinceThrough || windowStale) && (
                    <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#B91C1C", marginBottom: 2 }}>
                        ⚠ Check the hours-through date
                      </div>
                      <div style={{ fontSize: 10.5, color: "#991B1B", lineHeight: 1.45 }}>
                        {wagesMovedSinceThrough
                          ? <>Payroll numbers changed but <b>HOURS THROUGH is still {prettyDate(mtd.hoursThrough)}</b>. Those normally move together — if this pay period now covers more days, update the date or labor % and productivity are wrong.</>
                          : <>Sales are entered through {prettyDate(lastSalesIso)} but this window stops at <b>{prettyDate(mtd.hoursThrough)}</b> ({windowStaleDays} days back), so <b>{money(salesFull - salesThrough)}</b> of sales is excluded. Right only if your paid hours really stop there.</>}
                      </div>
                      <button
                        onClick={() => setHoursThrough("")}
                        style={{ marginTop: 6, fontSize: 10.5, fontWeight: 700, color: "#B91C1C", background: "#fff", border: "1px solid #FCA5A5", borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}
                      >
                        Auto-track my last sales day instead
                      </button>
                    </div>
                  )}
                  <label>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>HOURS THROUGH <span style={{ fontWeight: 500, color: "#9CA3AF" }}>(last day your paid hours cover)</span></span>
                      {/* ⚠️ THE CONTROL USED TO LIE ABOUT ITS OWN STATE (Matt, Jul 25:
                          "when I input sales it still pulls labor down and doesn't stay
                          save on last day entered"). The input shows `effThrough`, which
                          is `mtd.hoursThrough || lastSalesIso` — so when NOTHING is
                          pinned it still displays a date, and it reads as saved. It
                          isn't: enter another day's sales and the box silently changes,
                          the window widens and labor % drops. The explanation said so,
                          but in 10px grey under the field. The state now sits ON the
                          control. */}
                      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, padding: "1px 6px", borderRadius: 999,
                                     background: pinned ? "#DCF5E8" : "#FFF3CD", color: pinned ? "#0F766E" : "#B45309" }}>
                        {pinned ? "PINNED" : "AUTO"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="date" style={{ ...inputStyle, textAlign: "left", flex: 1, minWidth: 0 }} value={effThrough || ""} onChange={(e) => setHoursThrough(e.target.value)} />
                      {/* Picking the date already shown fires no change event, so before
                          this there was NO WAY to pin the window to the date on screen —
                          you had to choose a different day and come back. */}
                      {!pinned && effThrough && (
                        <button type="button" onClick={() => setHoursThrough(effThrough)}
                          style={{ fontSize: 11, fontWeight: 800, padding: "7px 10px", borderRadius: 8, border: "1px solid #0F766E",
                                   background: "#fff", color: "#0F766E", cursor: "pointer", whiteSpace: "nowrap" }}>
                          Pin this date
                        </button>
                      )}
                    </div>
                  </label>
                  <div style={{ fontSize: 10, color: (salesLagWindow || salesBeyondWindow) ? "#B45309" : "#9CA3AF", marginTop: 4 }}>
                    {pinned
                      ? "Sales are summed only through this date so productivity and labor % share the same window."
                      : `Auto-tracking your last entered sales day (${prettyDate(effThrough)}) — enter a new day's sales and this advances with it. Pick a date to pin it to your payroll period instead.`}
                    {salesLagWindow && ` Heads up: sales are only entered through ${prettyDate(lastSalesIso)} but this window runs to ${prettyDate(mtd.hoursThrough)} — productivity and labor read low until you enter the missing days.`}
                    {salesBeyondWindow && ` ${money(salesFull - salesThrough)} of sales sits past this window and is excluded.`}
                    {!pinned && !salesBeyondWindow && ` If your paid hours cover days beyond ${prettyDate(effThrough)}, enter those sales too so the number stays accurate.`}
                  </div>
                </div>
                </div>{/* end folded hold + window */}

                <div style={{ display: (showLaborAdvanced || mtd.laborPctOverride) ? "block" : "none", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E5E7EB" }}>
                  <label>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 3 }}>
                      ACTUAL LABOR % <span style={{ fontWeight: 500, color: "#9CA3AF" }}>(optional override)</span>
                    </div>
                    <input style={{ ...inputStyle, width: "100%" }} inputMode="decimal" placeholder={liveLaborPct != null ? (liveLaborPct * 100).toFixed(2) : "e.g. 23.50"}
                      value={mtd.laborPctOverride} onChange={(e) => persistMtd({ ...mtd, laborPctOverride: cleanDec(e.target.value) })} />
                  </label>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                    Enter as a percent (23.50 = 23.50%). Leave blank to auto-compute from (wages + PTO) ÷ sales.
                    {laborOverrideN != null && liveLaborPct != null && (
                      <> Computed value is <b>{pct(liveLaborPct)}</b> — the override is hiding it.</>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 8, lineHeight: 1.5 }}>
                  Sales basis: <b>{money(salesThrough)}</b> through {prettyDate(effThrough)}.<br />
                  Productivity = sales ÷ <b>paid</b> hours ({hoursN.toLocaleString("en-US")} paid) — matches the CFA labor-productivity metric. Non-op hours ({nonOpThrough.toFixed(2)}) are tracked for reference only.
                </div>
              </div>
            )}
          </div>

          <Stat
            label="MTD PROFIT"
            value={pct(savedActualPct != null ? savedActualPct : live.totals.netProfit[1])}
            sub={`Budgeted ${pct(m.profitPct)} · ${savedActualPct != null ? "actual on file" : "live, drives Net Profit above"}`}
            tone={(savedActualPct != null ? savedActualPct : live.totals.netProfit[1]) >= m.profitPct ? "good" : "over"}
          />
          {/* ★ AN UNTRUSTED WINDOW STOPS THIS BEING A CONFIDENT NUMBER.
              Failing loud beats failing green. Everything below is withheld
              rather than guessed: no percentage, no tone, no dollar variance,
              and no advice about trimming hours off a figure we do not believe.
              The date is the fix, so the sub-line points at the panel above
              rather than restating the arithmetic.
              ⚠️ NOT AUTO-ADVANCED. Only Matt knows the last day payroll covers,
              so the panel's own button is still the only thing that moves it. */}
          <Stat
            label="MTD LABOR"
            value={windowTrusted ? pct(laborPct) : "—"}
            sub={!windowTrusted
              ? "Hours-through date needs confirming above. Labor % is not reliable until it is."
              : laborGoal != null
                ? `Goal ${pct(laborGoal)} · on ${money(salesThrough)} sales thru ${prettyDate(effThrough)} · ${plan?.tierLabel || "tier"} @ ${money(plannedWage)}/hr${laborSubTag}`
                : `Goal — · Planner not configured${laborSubTag}`}
            tone={windowTrusted && laborPct != null && laborGoal != null ? (laborPct > laborGoal ? "over" : "good") : undefined}
            variance={windowTrusted && salesThrough > 0 && laborPct != null && laborGoal != null ? (laborPct - laborGoal) * salesThrough : null}
            advice={windowTrusted ? "Trim scheduled hours on the softest dayparts — labor is running above goal." : undefined}
          />
          <Stat
            label="MTD FOOD COST"
            value={pct(foodCostPctShown)}
            sub={`Goal ${pct(foodCostGoalShown)}${foodCostSubTag}`}
            tone={foodCostPctShown > foodCostGoalShown ? "over" : "good"}
            variance={salesFull > 0 && foodCostPctShown != null ? (foodCostPctShown - foodCostGoalShown) * salesFull : null}
            advice="Check the waste log and inventory variance — over-prepped proteins are the usual driver."
          />
          <Stat
            label="MTD PRODUCTIVITY"
            value={prodShown}
            sub={prodGoal != null
              ? `Goal ${Number(prodGoal).toFixed(2)} · sales ÷ paid hrs · ${plan?.tierLabel || "tier"}, from Planner`
              : "Goal — · Planner not configured"}
            tone={liveProd != null && prodGoal != null ? (liveProd >= prodGoal ? "good" : "over") : undefined}
          />
          <Stat
            label="MTD AVG WAGE"
            value={`$${avgWage.toFixed(2)}/hr`}
            sub={`Chain avg $${m.chainAvg}${liveAvgWage != null ? " · live (wages ÷ paid hours)" : ""}${
              plannedWage != null && liveAvgWage != null ? ` · planned ${money(plannedWage)}` : ""}`}
            tone={plannedWage != null && liveAvgWage != null ? (liveAvgWage <= plannedWage ? "good" : "over") : undefined}
          />
          <Stat label="MTD WAGES" value={money(wagesShown)} sub={ptoN > 0 ? `+ ${money(ptoN)} PTO · ${money(wagesN + ptoN)} total labor cost` : undefined} />
          <Stat label="MTD HOURS" value={`${Number(hoursShown).toLocaleString("en-US")} paid`} sub={nonOpThrough > 0 ? `${opHours.toFixed(2)} operational · ${nonOpThrough.toFixed(2)} non-op` : undefined} />
          <Stat label="MTD OVERTIME" value={otShown} tone={otShown > 0 ? "over" : "good"} />
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "#9CA3AF" }}>
        Projection mirrors the {period.charAt(0) + period.slice(1).toLowerCase()} FCR Projections tab; Food/Paper/Wages/Wage Taxes (LIVE) recompute from live % × Estimated Sales; other expense lines carry at their YTD %, with Equipment Rent, Business Service Fee and Base Profit held as fixed dollars and Base Operating Fee as the 15% plug. Closed months show the workbook's actual Net Profit. Labor & productivity goals come from the Planner's active tier and planned wage. Productivity = sales ÷ paid hours (matches CFA). Food/paper % come from the Food Cost Tracker. Director access required.
      </div>
    </div>
  );
}
