/* ============================================================================
   laborEngine.js — Gate City Hub

   THE LABOR MATHS, OUT OF THE COMPONENT, SO THE WORKER CAN RUN THEM.

   Every function here used to live inside LaborPlanner.jsx (the card, the
   plan, the wage, the daypart split) or SalesAllocation.jsx (the sales month
   loaders) or productivityTiers.js (the tier maths). They moved here in one
   piece, bodies unchanged, for one reason: the daypart labor DMs run in
   worker.js, and worker.js can import neither a React component nor store.js
   (its top-level `import.meta.env` throws and takes every scheduled job down
   with it — see inputRegistry.js, which learned this first).

   ★ THE STORAGE READER IS INJECTED. Same house pattern as inputRegistry.js
   ("★ INJECTABLE, so the WORKER can read the same rows"):

     browser: LaborPlanner.jsx / SalesAllocation.jsx bind `kvGet` from store.js
     worker:  the labor-daypart job passes `(k) => sbGet(env, k)`

   Contract: `get(key)` resolves to the PARSED stored value, or null when the
   key is absent or the read failed. Both doors already behave exactly that
   way. One store, two doors, ONE implementation of the maths — a second copy
   is how the dashboard and the Planner once disagreed about where a cut
   should land.

   ⚠️ `get` IS REQUIRED, AND A MISSING ONE THROWS BEFORE ANY try/catch CAN
   SWALLOW IT. Most functions here return null/[] on failure by design (the
   dashboard renders what it can), so a forgotten injection would otherwise
   read as "no data" forever, silently. Failing loudly at the door is rule 1:
   when a path is uncertain, break visibly rather than produce something wrong.

   ⚠️ IMPORTS ONLY ZERO-IMPORT LEAVES (laborWindow.js, stationTemplates.js,
   dayparts.js). Keep it that way: anything more drags the browser bundle —
   or store.js — into the worker.
   ============================================================================ */

import { laborTrust } from "./laborWindow.js";
/* The Daily Setup board template. Used ONLY to derive each daypart's real
   front/back shape — see dpHouseSplit. stationTemplates.js has zero imports of
   its own, so this cannot create a cycle. Reading it live rather than hardcoding
   the percentages means the split follows the board when station hours change. */
import { templatesFor, PERIODS as BOARD_PERIODS } from "./stationTemplates.js";
/* Leaf, imports nothing. dtShareOfFoh reads Sales Allocation's own day shape. */
import { dtShareOfFoh, splitFohHours } from "./dayparts.js";
/* ⚠️ LEAVES ONLY. Both import nothing but each other, so pulling them in here
   does not drag config or React into the engine. */
import { holidaysFrom, holidaysForYear } from "./usHolidays.js";
import { holidayDefault } from "./holidayPolicy.js";

/* The loud door-check described above. */
function requireGet(get) {
  if (typeof get !== "function") {
    throw new TypeError("laborEngine: no storage reader injected — pass kvGet (browser) or (k) => sbGet(env, k) (worker)");
  }
}

/* ---------------- date helpers (Mon–Sat) ---------------- */
export const pad = (n) => String(n).padStart(2, "0");
export const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function businessDaysOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  const out = []; const d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) { if (d.getDay() !== 0) out.push(isoOf(d)); d.setDate(d.getDate() + 1); }
  return out;
}
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
}
export const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
export const num = (v) => Number(v) || 0;

/* ---------------- productivity tiers (pure parts) ----------------
   Moved from productivityTiers.js, which now re-exports these so its own
   callers are untouched. The store-bound loaders (loadTierConfig etc.) stay
   there; the MERGE lives here so both sides normalise a saved config the
   same way. See that file for the model's provenance and the fit warning. */

export const TIERS_KEY = "gcfcr-productivity-tiers-v1";

// Fitted 7/5/26–7/11/26. fixedHours = hrs/day that don't scale.
// marginalRate = incremental sales $ carried per additional labor hour.
export const TIER_DEFAULTS = {
  top10: { key: "top10", label: "Top 10%", fixedHours: 46.6, marginalRate: 104.56 },
  top20: { key: "top20", label: "Top 20%", fixedHours: 43.9, marginalRate: 99.59 },
  top33: { key: "top33", label: "Top 33%", fixedHours: 42.6, marginalRate: 95.68 },
  top50: { key: "top50", label: "Top 50%", fixedHours: 43.7, marginalRate: 93.07 },
};

export const TIER_ORDER = ["top10", "top20", "top33", "top50"];

// Gate City has historically been measured against Top 20%.
export const DEFAULT_TIER = "top20";

// Planned wage rate. Seeded from the prior CLOSED month's actual avg
// wage (see seedPlannedWage). Never seeded from live MTD — an in-flight
// month is noisy and would make the labor budget drift daily.
export const DEFAULT_PLANNED_WAGE = 18.5;

/** Benchmark labor hours for a single day at a given forecast. */
export function benchmarkHours(tier, forecastSales) {
  if (!tier || !(forecastSales > 0)) return null;
  const { fixedHours, marginalRate } = tier;
  if (!(marginalRate > 0)) return null;
  return fixedHours + forecastSales / marginalRate;
}

/** Effective productivity target ($/labor-hr) for a single day. */
export function dayProductivityTarget(tier, forecastSales) {
  const h = benchmarkHours(tier, forecastSales);
  return h > 0 ? forecastSales / h : null;
}

export function defaultConfig() {
  return {
    selected: DEFAULT_TIER,
    tiers: JSON.parse(JSON.stringify(TIER_DEFAULTS)),
    plannedWage: DEFAULT_PLANNED_WAGE,
  };
}

/** Merge saved edits over defaults so a new tier field can be added later. */
export function mergeConfig(saved) {
  const base = defaultConfig();
  if (!saved || typeof saved !== "object") return base;
  const tiers = { ...base.tiers };
  for (const k of TIER_ORDER) {
    tiers[k] = { ...base.tiers[k], ...(saved.tiers?.[k] || {}) };
  }
  return {
    selected: TIER_ORDER.includes(saved.selected) ? saved.selected : base.selected,
    tiers,
    plannedWage: Number(saved.plannedWage) > 0 ? Number(saved.plannedWage) : base.plannedWage,
  };
}

export async function loadTierConfig(get) {
  requireGet(get);
  try {
    return mergeConfig(await get(TIERS_KEY));
  } catch {
    return defaultConfig();
  }
}

/** The currently selected tier object. */
export function activeTier(cfg) {
  const c = mergeConfig(cfg);
  return c.tiers[c.selected];
}

/**
 * Seed the planned wage from the prior CLOSED month's actual avg wage.
 * Deliberately NOT the live month: an in-flight avg wage swings with a
 * handful of opening shifts, and a labor budget that moves every time
 * payroll posts is a budget you cannot schedule against.
 *
 * `priorMonthWages` / `priorMonthHours` come from that month's saved
 * MTD record. Returns null if the prior month is incomplete — callers
 * should keep the existing plannedWage rather than overwrite it.
 */
export function seedPlannedWage(priorMonthWages, priorMonthHours) {
  if (!(priorMonthWages > 0) || !(priorMonthHours > 0)) return null;
  return priorMonthWages / priorMonthHours;
}

/* ---------------- sales month (moved from SalesAllocation.jsx) ---------------- */
export const SA_CHANNELS = [
  { id: "dt", label: "Drive Thru", short: "DT", color: "#DD0031" },
  { id: "co", label: "Carry Out", short: "CO", color: "#1B3A5C" },
  { id: "di", label: "Dine In", short: "DI", color: "#0E7C7B" },
  { id: "od", label: "On Demand", short: "OD", color: "#B4690E" },
  { id: "ca", label: "Catering", short: "CAT", color: "#6B4FA0" },
];

export const saKey = (ym) => `gcfcr-salesalloc-${ym}-v1`;
export async function loadSalesMonth(ym, get) {
  requireGet(get);
  try { return (await get(saKey(ym))) || null; } catch { return null; }
}
export const dayTotal = (rec) =>
  rec ? SA_CHANNELS.reduce((s, c) => s + (Number(rec[c.id]) || 0), 0) : 0;

/* What a day contributes to AVERAGES (not to real totals):
   normal day  → its real total
   holiday day → its adjusted value if one was entered, otherwise 0
                 (0 = the day is skipped entirely by the averagers) */
export const avgBasisTotal = (rec) => {
  if (!rec) return 0;
  if (rec.hol) {
    const a = Number(rec.adj);
    return isFinite(a) && a > 0 ? a : 0;
  }
  return dayTotal(rec);
};

/* PLANNER FORECAST BASIS — weekday averages, holidays excluded (or
   substituted with their adjusted value when one was entered). */
export function weekdayTwoMonthAvg(recA, recB) {
  const sums = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  [recA, recB].filter(Boolean).forEach((rec) => {
    Object.keys(rec.days || {}).forEach((iso) => {
      const t = avgBasisTotal(rec.days[iso]);
      if (t <= 0) return;
      const dow = fromIso(iso).getDay();
      sums[dow] += t; counts[dow] += 1;
    });
  });
  const out = {};
  for (let d = 1; d <= 6; d++) out[d] = counts[d] ? sums[d] / counts[d] : 0;
  return out;
}

/* ---------------- planner config ---------------- */
export const CONFIG_KEY = "gcfcr-planner-config-v1";
export const DEFAULT_CONFIG = {
  divisors: { 1: 83, 2: 84, 3: 86, 4: 86, 5: 86, 6: 86 }, // LEGACY — no longer read
  bohPct: 0.45,   // FOH = 1 - bohPct
  dtPct: 0.70,    // of FOH; FC = 1 - dtPct
  fpPct: 0.3082,  // food+paper budget as % of sales (UI lives on Food Cost page)
  wage: 16,       // LEGACY fallback only
  wageMode: "auto", // "auto" | "live" | "manual" — see resolvePlannedWage
};
export const plannerKey = (ym) => `gcfcr-planner-${ym}-v1`;

/* The FCR's saved MTD record for a month — { wages, hours, ot, ... } */
export const fcrMtdKey = (ym) => `gcfcr-fcr-mtd-${ym}-v1`;

export const mergeCfg = (c) => ({
  ...DEFAULT_CONFIG,
  ...(c || {}),
  divisors: { ...DEFAULT_CONFIG.divisors, ...((c || {}).divisors || {}) },
});

/* ---------------- shared loaders (used by exports below) ---------------- */
/* ⚠️ `policy` IS PASSED IN, NOT READ. This file is the engine and it has no
   store config; the caller already holds it. Optional, so every existing
   caller keeps working untouched. */
export async function loadMonthBasis(ym, get, policy) {
  requireGet(get);
  const [p, c, tiers, a, b] = await Promise.all([
    get(plannerKey(ym)).catch(() => null),
    get(CONFIG_KEY).catch(() => null),
    loadTierConfig(get),
    loadSalesMonth(shiftMonth(ym, -1), get),
    loadSalesMonth(shiftMonth(ym, -2), get),
  ]);
  /* ⭐ THE HOLIDAY SALES BASIS, FOLDED IN HERE RATHER THAN AT EIGHT CALL SITES.
     `forecastFor` reads `p.holiday`, so every consumer of this basis — the
     month card, the daypart DMs, the Schedule Builder's budget — inherits it
     without knowing it exists.

     ⚠️ THE POLICY IS OPTIONAL AND ITS ABSENCE IS SILENT. A store that has set
     no holiday hours gets `{}` and the engine behaves exactly as it did. */
  const holiday = await holidayBasisFor(ym, policy, get);
  return { p: { ...(p || {}), holiday }, cfg: mergeCfg(c), tierCfg: tiers, wk: weekdayTwoMonthAvg(a, b) };
}

/* iso → expected sales, for every holiday inside `ym` this store has a figure
   for. Exported so a test can drive it without a store.

   ⭐⭐ WHAT THIS HOLIDAY ACTUALLY TOOK LAST YEAR BEATS ANY TYPED DEFAULT.
   Matt, Aug 21 2026: "you actually have the holiday sales in my labor planner
   history." He is right, and the history is far better than the placeholder.

   ⛔ MEASURED AGAINST THIS STORE'S OWN 20 MONTHS OF RECORDS, not reasoned. The
   single typed figure was wrong for every holiday and wrong in both directions:

       Christmas Eve     real 22,560   flat 14,000    -38%
       New Year's Eve    real 18,265   flat 14,000    -23%
       Independence Day  real 16,435   flat 14,000    -15%
       Labor Day         real 16,153   flat 14,000    -13%
       Memorial Day      real 12,446   flat 14,000    +12%
       New Year's Day    real  8,807   flat 14,000    +59%

   ⇒ One number cannot describe six days that range from 8.8k to 22.6k. Under-
   budgeting Christmas Eve by 38% is a real staffing problem on the busiest week
   of the year, and over-budgeting New Year's Day by 59% is money.

   ★ AND IT KEEPS ITSELF CURRENT. Every holiday the store trades becomes next
   year's basis with nobody typing anything, which is what a typed default can
   never do — a number entered once rots quietly from the day it is entered.

   THE ORDER, and each step exists for a reason:
     1. the store says CLOSED        → 0. A fact about the store beats any
                                       history; last year's figure would budget
                                       a crew for a shut door.
     2. what this holiday really took → the same holiday key one year back,
                                       totalled from that month's own record.
     3. the store's typed baseSales   → the fallback for a holiday with no
                                       history: a new store, or one this store
                                       has not traded before.
     4. nothing                       → falls through to the weekday average,
                                       exactly as a store with no policy does.

   ⚠️ A ZERO IN THE HISTORY IS NOT A BASIS. A holiday the store was CLOSED for
   last year records 0, and if the store opens this year that 0 would budget
   nobody. Step 2 only accepts a figure above zero, so a newly-traded holiday
   falls to the typed default rather than to nothing.
   ⚠️ ONE EXTRA READ PER PRIOR-YEAR MONTH, and only for a month that has a
   holiday in it. The months are de-duplicated first, so a month with three
   holidays in it still costs one read, and a month with none costs nothing.
   ⚠️ A FAILED READ IS NOT A ZERO. `loadSalesMonth` already answers null on a
   throw, and null falls to step 3 — the typed default — rather than pretending
   the store took nothing. */
export async function holidayBasisFor(ym, policy, get) {
  const out = {};
  if (!policy) return out;
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return out;
  const from = `${m[1]}-${m[2]}-01`;

  /* Which holidays land in this month, and what each was called a year ago. */
  const here = [];
  for (const h of holidaysFrom(from, 24)) {
    if (h.iso.slice(0, 7) !== `${m[1]}-${m[2]}`) continue;
    const row = holidayDefault(policy, h.iso);
    if (!row) continue;
    /* ⚠️ A CLOSED DAY TAKES NOTHING, and that is a figure, not a gap. Leaving
       it out would fall through to the weekday average and budget a full crew
       for Christmas Day. */
    if (row.closed) { out[h.iso] = 0; continue; }
    const y = Number(h.iso.slice(0, 4));
    const last = holidaysForYear(y - 1).find((p) => p.key === h.key);
    here.push({ iso: h.iso, row, lastIso: last ? last.iso : null });
  }
  if (!here.length) return out;

  /* ⚠️ DE-DUPLICATED BEFORE READING. December carries Christmas Eve, Christmas
     Day and New Year's Eve; all three look back at the same month. */
  const months = [...new Set(here.map((x) => x.lastIso).filter(Boolean).map((iso) => iso.slice(0, 7)))];
  const recs = {};
  if (typeof get === "function") {
    await Promise.all(months.map(async (mm) => { recs[mm] = await loadSalesMonth(mm, get); }));
  }

  for (const x of here) {
    const rec = x.lastIso ? recs[x.lastIso.slice(0, 7)] : null;
    const was = rec && rec.days ? dayTotal(rec.days[x.lastIso]) : 0;
    if (was > 0) { out[x.iso] = was; continue; }
    if (x.row.baseSales != null) out[x.iso] = x.row.baseSales;
  }
  return out;
}

/* Forecast for one ISO day: per-day override, else 2-month weekday avg. */
export function forecastFor(iso, p, wk) {
  const d = (p && p.days && p.days[iso]) || {};
  /* A figure somebody typed for this day always wins. */
  if (d.forecast !== undefined && d.forecast !== "") return Number(d.forecast) || 0;

  /* ⭐⭐ A HOLIDAY CANNOT FORECAST OFF AN ORDINARY WEEKDAY. Matt, Aug 21 2026:
     "it also needs to talk to the labor planner. use 14k as the base sales for
     a 10:30-4 day until you get a real holidays numbers to smart schedule and
     budget."

     Christmas Eve is a Thursday, so without this the store is forecast a full
     Thursday's sales and budgeted a full Thursday's hours, on a day it shuts at
     four. The board then looks entirely normal while being wrong by half a day
     — the same failure shape storeHours.js exists to prevent, arriving through
     the money instead of through the clock.

     ⚠️ IT IS A DEFAULT, NOT A CLAMP. The moment a real holiday has been traded
     and its actual sales recorded, the typed figure above wins and this never
     runs again for that date. That is what "until you get a real holidays
     numbers" means.

     ⚠️ AND IT IS ABSENT-MEANS-UNCHANGED. A store with no holiday policy has no
     `p.holiday`, and every one of the eight callers behaves exactly as before.
     Threading a fourth argument through all of them instead would have been
     eight chances to miss one. */
  const hol = p && p.holiday && p.holiday[iso];
  const h = Number(hol);
  if (hol !== undefined && hol !== null && hol !== "" && Number.isFinite(h) && h >= 0) return h;


  const dow = fromIso(iso).getDay();
  return wk[dow] || 0;
}

/* Target for one ISO day: per-day override, else tier-derived from forecast. */
export function targetFor(iso, p, wk, tier) {
  const d = (p && p.days && p.days[iso]) || {};
  if (d.target !== undefined && d.target !== "") return Number(d.target) || 0;
  return dayProductivityTarget(tier, forecastFor(iso, p, wk)) || 0;
}

/* ★ THE LAST 28 DAYS ACROSS HOWEVER MANY MONTH RECORDS THEY SPAN.
   ⚠️ NOT "last calendar month". The mix drifts a couple of points month to
   month and a calendar boundary makes the labor budget jump on the 1st for no
   operational reason. Merging the loaded months and cutting by date keeps the
   window honest across a month end. */
export function trailingDays(months, n) {
  const cut = new Date();
  cut.setDate(cut.getDate() - n);
  const iso = cut.toISOString().slice(0, 10);
  const out = {};
  (Array.isArray(months) ? months : []).forEach((m) => {
    const days = m && m.days;
    if (!days || typeof days !== "object") return;
    Object.keys(days).forEach((k) => { if (k >= iso) out[k] = days[k]; });
  });
  return out;
}

/* ---------------- engine ---------------- */
/* ⚠️ `dtShare` IS THE REAL SALES MIX AND IT WINS. cfg.dtPct is now an OVERRIDE,
   used only when no mix could be worked out — which is what the fixed setting
   always was, without anybody being able to see it.
   The old behaviour made DT exactly on budget by construction: both sides came
   from one number, so the screen could never say which needed cutting. */
export function dayBudget(forecast, target, cfg, dtShare) {
  const total = target > 0 ? forecast / target : 0;
  const boh = total * cfg.bohPct;
  const foh = total - boh;
  const share = Number.isFinite(dtShare) ? dtShare : cfg.dtPct;
  return { total, boh, foh, dt: foh * share, fc: foh * (1 - share) };
}

/* Resolve the planned wage for a month. Three modes:

     manual → whatever was typed. Nothing overwrites it.
     live   → THIS month's FCR MTD record (wages ÷ hours). Moves as payroll
              posts. Note avg wage is a ratio of two figures from the same
              payroll run, so the hours-through date does not affect it —
              only things divided by SALES depend on that date.
     auto   → prior CLOSED month's actual, falling back to this month's live
              record, falling back to the default. This is the safe default:
              a closed month is complete and stable, so the labor budget does
              not drift every time payroll posts. Early-month live wage is
              noisy — a handful of opening shifts skew it.

   Returns { wage, source } where source is shown under the input. */
export async function resolvePlannedWage(ym, cfg, tierCfg, get) {
  requireGet(get);
  const fallback = { wage: tierCfg.plannedWage || cfg.wage, source: "default" };

  if (cfg.wageMode === "manual") {
    return { wage: tierCfg.plannedWage, source: "manual" };
  }

  const readWage = async (target) => {
    const rec = await get(fcrMtdKey(target)).catch(() => null);
    return seedPlannedWage(Number(rec?.wages) || 0, Number(rec?.hours) || 0);
  };

  if (cfg.wageMode === "live") {
    const now = await readWage(ym);
    if (now) return { wage: now, source: `${monthLabel(ym)} MTD · live` };
    return fallback;
  }

  // auto
  const prev = shiftMonth(ym, -1);
  const closed = await readWage(prev);
  if (closed) return { wage: closed, source: `${monthLabel(prev)} actual` };

  const now = await readWage(ym);
  if (now) return { wage: now, source: `${monthLabel(ym)} MTD · no closed month yet` };

  return fallback;
}

/* Month productivity goal = total forecast ÷ total benchmark hours.
   Sales-weighted by construction. Pulled live by the FCR tile.
   Denominator is OPERATIONAL hours only — that is what the tier model
   describes, and it is the basis the tier's own targets were built on.
   Non-op hours are excluded here and accounted for in the labor % goal. */
export async function monthProductivityGoal(ym, get, policy) {
  requireGet(get);
  const { p, tierCfg, wk } = await loadMonthBasis(ym, get, policy);
  const tier = activeTier(tierCfg);
  let forecast = 0, hours = 0;
  businessDaysOf(ym).forEach((iso) => {
    const f = forecastFor(iso, p, wk);
    const t = targetFor(iso, p, wk, tier);
    forecast += f;
    if (t > 0) hours += f / t;
  });
  return hours > 0 ? forecast / hours : null;
}

/* Month forecast total = sum of each business day's forecast. The Hub
   equivalent of the Sheet Planner's J83, which the Sheet's FCR tab uses
   as its LIVE Est. Sales (G5). */
export async function monthForecastTotal(ym, get, policy) {
  requireGet(get);
  const { p, wk } = await loadMonthBasis(ym, get, policy);
  let forecast = 0;
  businessDaysOf(ym).forEach((iso) => { forecast += forecastFor(iso, p, wk); });
  return forecast > 0 ? forecast : null;
}

/* ── STANDING NON-OPS ────────────────────────────────────────────────────
   Matt, Jul 25: "have it match Hannah's numbers and lock the cell so there
   won't be a double input conflict."
   So the per-day non-op figure is no longer typed. It is DERIVED from the
   people list in gcfcr-daypart-nonops-v1 — the same config the daypart console
   edits — which means the number is written down once and read everywhere.

   ⚠️ THIS HAD TO BE DONE AT MODULE LEVEL, NOT JUST IN THE COMPONENT. Both
   monthNonOpHours (which feeds the FCR's productivity denominator) and the
   weekday-average calc read the SAVED record directly. Deriving only in the UI
   would have shown one number on screen and used another in the financials.

   Mon–Fri carry the full figure; Saturday is 0 because Hannah specified all
   four people as Monday-to-Friday. ⚠️ Saturday IS a business day here
   (businessDaysOf excludes Sunday only), so it is genuinely included in these
   sums at zero — not skipped. If someone is non-ops at a weekend that belongs
   in the config as its own entry, not as an assumption made here.
   Returns null when no people are configured, and every caller then falls back
   to whatever was typed before — so nothing that predates this changes. */
export const DP_CFG_KEY = "gcfcr-daypart-nonops-v1";

// Mon–Fri only, which is what Hannah specified for all four.
export const dpPeopleDay = (people) => (people || []).reduce((n, p) => n + (Number(p.hrsPerDay) || 0), 0);

export async function standingNonOpPerDay(get) {
  requireGet(get);
  try {
    const c = await get(DP_CFG_KEY);
    const people = c && c.people;
    return (people && people.length) ? dpPeopleDay(people) : null;
  } catch { return null; }
}
export function nonOpForIso(iso, perDay) {
  if (perDay == null || !iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  const dow = new Date(y, (m || 1) - 1, d || 1).getDay();
  return (dow === 0 || dow === 6) ? 0 : perDay;
}

/* Non-operational hours for this month, optionally only through a given ISO
   date. The FCR subtracts these from typed payroll hours so its productivity
   denominator is operational hours — matching the goal. */
export async function monthNonOpHours(ym, throughIso, get) {
  requireGet(get);
  const p = await get(plannerKey(ym)).catch(() => null);
  const perDay = await standingNonOpPerDay(get);
  let total = 0;
  businessDaysOf(ym).forEach((iso) => {
    if (throughIso && iso > throughIso) return;
    const std = nonOpForIso(iso, perDay);
    total += std == null ? (Number((p && p.days && p.days[iso] || {}).nonOp) || 0) : std;
  });
  return total;
}

/* ── STANDING OPS ──────────────────────────────────────────────────── */
export const OPS_CFG_KEY = "gcfcr-standing-ops-v1";

/* Standing OPS hours for one date. ONE definition, because two disagreeing
   copies are exactly what this fixes.

   🐛 THE DASHBOARD WAS 8 HOURS LIGHT EVERY WEEKDAY (found Aug 4 2026). The day
   card inside the Planner counts standing ops in its day total — the comment
   there says why, "the CFA tier benchmark counts ALL PAID HOURS… Leaving them
   out understated every weekday by a full-time person". `monthLaborCard`, which
   feeds the DASHBOARD, never got that line. It could not: `stdOps` was a
   closure over component state and monthLaborCard is module level, so the two
   surfaces could not share the rule even in principle.
   ⇒ Two screens answered the same question about eight hours apart. The
   dashboard said "cut ~30 hrs today" while the Planner said 38, and a leader
   acts on whichever one is in front of them mid-shift.
   ⚠️ Weekend rule matches nonOpForIso deliberately: a standing block is a
   weekday block, and Saturday is where this hid, because both figures are
   identical when the standing hours are zero. */
export function stdOpsForIso(iso, people) {
  if (!people || !people.length || !iso) return 0;
  const [y, m, d] = String(iso).split("-").map(Number);
  const dow = new Date(y, (m || 1) - 1, d || 1).getDay();
  if (dow === 0 || dow === 6) return 0;
  /* ★ SOMEBODY WHO HAS LEFT STOPS COSTING HOURS (Aug 5 2026).
     `until` is their last day and it COUNTS — a leaver works that day. Compared
     as plain ISO strings, which sort correctly by date and avoids building two
     Date objects per person per day just to compare them.
     ⚠️ NO `until` MEANS NO END, not "ended". Every entry stored before today
     lacks the field and must keep counting exactly as it did. */
  /* ⚠️ `p &&` DROPS A NULL ENTRY, it does not keep it. Written the other way
     round first, and a test with a null in the list threw immediately, because
     dpPeopleDay reads p.hrsPerDay with no guard. That crash predates this
     change — the raw list was passed straight in — but a filter that reads as
     though it handles null while passing it through is worse than no filter. */
  const active = people.filter((p) => p && (!p.until || String(iso) <= String(p.until)));
  return dpPeopleDay(active);
}

/* The standing-ops roster, for callers outside the component that holds it in
   state. Mirrors standingNonOpPerDay. Returns [] on any failure, which makes
   the hours zero — the same answer as "nobody configured", and never a crash. */
export async function standingOpsPeople(get) {
  requireGet(get);
  try {
    const c = await get(OPS_CFG_KEY);
    const people = c && c.people;
    return Array.isArray(people) ? people : [];
  } catch { return []; }
}

/* ── THE ONE CALL THE FCR MAKES ──────────────────────────────────────
   Productivity goal and labor % goal come from the same tier, the same
   forecast, and the same planned wage. They cannot drift apart.

     productivityGoal = forecast ÷ benchmarkHours          (operational)
     laborGoal        = benchmarkHours × wage ÷ forecast

   The tier benchmark (fixedHours + forecast ÷ marginalRate) IS the total-
   hours labor target — CFA's tier % already accounts for a normal non-op
   load, so non-op is not added again here (that double-counted training
   pay and pushed the goal high). Because benchmarkHours carries a fixed-
   hours term, this goal still floats with volume: it eases down as sales
   rise and up as they fall — it is not a fixed percent. */
export async function monthLaborPlan(ym, get, policy) {
  requireGet(get);
  const { p, cfg, tierCfg, wk } = await loadMonthBasis(ym, get, policy);
  const tier = activeTier(tierCfg);
  const { wage, source } = await resolvePlannedWage(ym, cfg, tierCfg, get);

  const fcPerDay = await standingNonOpPerDay(get);
  let forecast = 0, benchHours = 0, nonOp = 0;
  businessDaysOf(ym).forEach((iso) => {
    const f = forecastFor(iso, p, wk);
    const t = targetFor(iso, p, wk, tier);
    forecast += f;
    if (t > 0) benchHours += f / t;
    { const std = nonOpForIso(iso, fcPerDay);
      nonOp += std == null ? (Number(((p && p.days && p.days[iso]) || {}).nonOp) || 0) : std; }
  });

  const productivityGoal = benchHours > 0 ? forecast / benchHours : null;
  const laborGoal = forecast > 0 && wage > 0 ? (benchHours * wage) / forecast : null;

  return {
    productivityGoal,
    laborGoal,
    plannedWage: wage,
    wageSource: source,
    benchmarkHours: benchHours,
    nonOpHours: nonOp,
    forecast,
    tierKey: tierCfg.selected,
    tierLabel: tier.label,
  };
}

/* ── THE DAYPART TABLE + BOARD SHAPE ───────────────────────────────── */
export const DP_ORDER = ["Breakfast", "Lunch", "Afternoon", "Dinner"];
export const DP_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DP_KEY = "gcfcr-daypart-labor-v1";

/* ★ EACH DAYPART'S REAL FRONT/BACK SHAPE, read from the deployed board template.
   `cfg.bohPct` is ONE flat number for the whole day (0.45), but the store is
   nothing like flat: breakfast runs ~60% back (biscuits, eggs, breading) while
   the afternoon runs ~36% back. Averaging those to 45% can invert the answer —
   a day can read "cut front, add back" when the truth is the opposite.

   Counts POSTED BODY-SPOT HOURS inside each daypart window: leader rows, AD
   rows, training/trainer and any cell the template marks ❌/✔️/split-duties are
   excluded, because none of them is a body being scheduled.
   ⚠️ Spot hours are a SHAPE, not a measurement — a station's posted window is
   not the same as a body's shift. Good enough to allocate a split, not a
   substitute for real per-daypart hours. */
export const DP_TO_PERIOD = { Breakfast: "breakfast", Lunch: "lunch", Afternoon: "mid", Dinner: "night" };
const DP_HOUSE_SKIP = /^(TRAINING|TRAINER|ASSISTANT DIRECTOR|LEADER DT|LEADER FC|Kitchen Lead|Kitchen Manager|Assistant Director)/i;
const dpHouseCache = {};
export function dpHouseSplit(dayKey) {
  if (dpHouseCache[dayKey]) return dpHouseCache[dayKey];
  const out = {};
  DP_ORDER.forEach((dp) => { out[dp] = { foh: 0, boh: 0 }; });
  ["FOH", "BOH"].forEach((house) => {
    let list = [];
    try { list = templatesFor(house, dayKey) || []; } catch { list = []; }
    list.forEach((st) => {
      if (!st || st.leader || DP_HOUSE_SKIP.test(st.name || "")) return;
      DP_ORDER.forEach((dp) => {
        const k = DP_TO_PERIOD[dp];
        if (st.cellOverrides && st.cellOverrides[k] != null) return;
        const per = BOARD_PERIODS[k];
        if (!per) return;
        const blocks = st.hours || [{ start: per.start, end: per.end }];
        let mins = 0;
        blocks.forEach((b) => { mins += Math.max(0, Math.min(b.end, per.end) - Math.max(b.start, per.start)); });
        out[dp][house === "FOH" ? "foh" : "boh"] += mins / 60;
      });
    });
  });
  dpHouseCache[dayKey] = out;
  return out;
}

/* Today's hours-to-cut, spread across the dayparts and split front/back.
   Returns [] when there is no daypart record for the month, which is the honest
   answer — the dashboard then shows the day total on its own, exactly as before.
   ⚠️ The parts SUM to the day total by construction: every row is a share of the
   same number, never a separately computed target. That is the property that
   makes the block safe to read next to the headline. */
export async function todayDaypartSplit(ym, todayOver, cfg, get, forIso) {
  requireGet(get);
  if (todayOver == null || !isFinite(todayOver)) return [];
  try {
    /* ⚠️ `forIso` ADDED Aug 7 2026 and DEFAULTS TO TODAY, so every existing
       caller behaves exactly as before. The Sunday cut report needs this same
       split for each day of the week ahead, and a second copy of the
       hours-shape arithmetic is how the board and the report would start
       disagreeing about where a cut lands. */
    const iso = forIso || isoOf(new Date());
    if (!iso.startsWith(ym)) return [];
    const dow = fromIso(iso).getDay();
    if (dow === 0) return [];
    const i = dow - 1;
    const dayKey = DP_DOW[i];
    if (!dayKey) return [];
    const all = await get(DP_KEY);
    const months = Array.isArray(all) ? all : (all && all.months) || [];
    if (!months.length) return [];
    const rec = months.reduce((a, b) => (String(b.id) > String(a.id) ? b : a));
    const g = (o, dp) => num(o && o[dp] ? o[dp][i] : 0);
    let hTot = 0;
    const hour = {};
    DP_ORDER.forEach((dp) => { hour[dp] = g(rec.hours, dp); hTot += hour[dp]; });
    if (hTot <= 0) return [];
    const split = dpHouseSplit(dayKey);
    return DP_ORDER.map((dp) => {
      const amt = todayOver * (hour[dp] / hTot);
      const hs = split[dp] || { foh: 0, boh: 0 };
      const tot = hs.foh + hs.boh;
      const bohPct = tot > 0 ? hs.boh / tot : cfg.bohPct;
      return { dp, amt, foh: amt * (1 - bohPct), boh: amt * bohPct };
    });
  } catch { return []; }
}

/* ── DASHBOARD LABOR CARD ────────────────────────────────────────────
   One call for App.jsx's landing card. Two numbers, deliberately from two
   different places, because they answer two different questions:

     laborOver  = MTD dollars OVER (or under) the labor goal — the same
                  variance the FCR tile prints, to the cent. `laborPaid`
                  carries the raw payroll total alongside it as context.
                  Payroll does not separate training/meeting time from floor
                  time, so NON-OPS ARE ALREADY INSIDE BOTH — nothing to add,
                  nothing shown separately. `laborPaid` falls back to
                  scheduled hours × planned wage when no payroll record
                  exists yet (early in a month), and says which one it used
                  via `laborSource`.

     dowAvgOver = for ONE weekday (today's), the average of
                  (FOH + BOH + non-op) − budget across every day of that
                  weekday this month that has hours scheduled. POSITIVE means
                  overstaffed — that is the number of hours to cut today.
                  Non-op hours ARE counted in the scheduled total (Matt,
                  Jul 24: "non ops needs accounted for"). ★ As of Jul 26 the
                  Planner's own day card counts them too, so this card and
                  that one now agree — previously the day card compared
                  operational hours only and read under while this read over.

   Never throws: any failure returns nulls and the card just doesn't render
   that half. ──────────────────────────────────────────────────────────── */
export async function monthLaborCard(ym, dow, get, policy) {
  requireGet(get);
  try {
    const { p, cfg, tierCfg, wk } = await loadMonthBasis(ym, get, policy);
    const tier = activeTier(tierCfg);
    const { wage } = await resolvePlannedWage(ym, cfg, tierCfg, get);
    /* ⚠️ THE PREVIOUS MONTH IS LOADED FOR ONE REASON: the drive-thru share.
       dtShareOfFoh refuses to answer on fewer than 14 days, and on the 6th of a
       month this month alone has five. Without the month before, the DT/FC split
       would be blank for the first fortnight of every month — which is exactly
       when a leader is deciding where to cut. It rides in the SAME Promise.all,
       so it costs a request, not a wait. */
    const [mtd, plan, salesRec, prevSalesRec] = await Promise.all([
      get(fcrMtdKey(ym)).catch(() => null),
      monthLaborPlan(ym, get, policy).catch(() => null),
      loadSalesMonth(ym, get).catch(() => null),
      loadSalesMonth(shiftMonth(ym, -1), get).catch(() => null),
    ]);

    /* ── MTD LABOR $ OVER / SHORT — must equal the FCR tile to the cent ──
       Matt, Jul 24: the card shows the VARIANCE, not total spend. Built to
       FCRPage's own definition (see fcr-formulas):

         laborCost   = mtd.wages + mtd.pto        (a whole MTD payroll total)
         effThrough  = mtd.hoursThrough || last day with sales entered
         salesThrough= sales summed THROUGH that date  ← not full-month sales
         laborPct    = laborCost ÷ salesThrough
         over$       = (laborPct − laborGoal) × salesThrough

       ⚠️ salesThrough, NOT full MTD sales. Labor is measured against the
       payroll window; food is not. That asymmetry is deliberate and is why
       the two cards do not share a denominator — see the Food card.
       ⚠️ laborGoal comes from monthLaborPlan, the SAME call FCRPage makes, so
       the goal cannot drift between the two surfaces.
       Verified against Matt's Jul 24 FCR panel: wages 133,820.41 + PTO 408.00
       on sales-through 599,315.82 → 22.40% vs a 20.10% goal → $13,765.60 over,
       matching the tile exactly. */
    const days = (salesRec && salesRec.days) || {};
    const withSales = Object.keys(days).filter((iso) => dayTotal(days[iso]) > 0).sort();
    const lastSalesIso = withSales.length ? withSales[withSales.length - 1] : null;
    const effThrough = (mtd && mtd.hoursThrough) || lastSalesIso;
    let salesThrough = 0;
    if (effThrough) {
      Object.keys(days).forEach((iso) => { if (iso <= effThrough) salesThrough += dayTotal(days[iso]); });
    }
    const laborCost = mtd ? (Number(mtd.wages) || 0) + (Number(mtd.pto) || 0) : 0;
    const laborPct = salesThrough > 0 && laborCost > 0 ? laborCost / salesThrough : null;
    const laborGoal = plan && plan.laborGoal != null ? plan.laborGoal : null;
    const laborOver = laborPct != null && laborGoal != null ? (laborPct - laborGoal) * salesThrough : null;

    /* ★ THE DASHBOARD CARD NOW KNOWS WHETHER TO BELIEVE ITS OWN NUMBER
       (Aug 5 2026 sweep, high severity).
       This computes labor % from exactly the same wages-over-sales window
       FCRPage does, and applied NONE of the three trust tests to it. FCRPage
       withholds the figure when the payroll window is in doubt, and the publish
       path withholds the scorecard row, but this card carried on printing a
       confident percentage with an under-goal dollar figure beside it. So the
       two screens could disagree about the same month, and the dashboard — the
       screen everyone opens first — was the confident one about a number its
       own source page had already disowned.
       ⚠️ SAME laborTrust EVERY OTHER CALLER USES, not a fourth copy of the rule.
       `salesFull` is the whole month; the test needs it to tell "sales exist
       past the window" from "the window covers everything".
       ⚠️ IT RETURNS A FLAG RATHER THAN BLANKING laborPct. The productivity
       figures beside it are computed from paid hours and are not affected by
       the window, so blanking here would take down numbers that are fine. */
    let salesFull = 0;
    Object.keys(days).forEach((iso) => { salesFull += dayTotal(days[iso]); });
    const { trusted: laborTrusted } = laborTrust({ mtd, lastSalesIso, effThrough, salesThrough, salesFull });

    const nonOpPerDay = await standingNonOpPerDay(get);
    // See stdOpsForIso: these are paid, worked, and were missing from here only.
    const opsPeople = await standingOpsPeople(get);
    const want = dow == null ? new Date().getDay() : dow;
    let schedDollars = 0, sum = 0, sumOps = 0, sumNonOp = 0, count = 0, todayOver = null;
    let sumFoh = 0, sumBoh = 0;
    const todayIso = isoOf(new Date());

    businessDaysOf(ym).forEach((iso) => {
      const d = (p && p.days && p.days[iso]) || {};
      // Same standing rule as monthNonOpHours — falls back to whatever was
      // typed if no people are configured.
      const std = nonOpForIso(iso, nonOpPerDay);
      const nonOp = std == null ? (Number(d.nonOp) || 0) : std;
      const ops = (Number(d.foh) || 0) + (Number(d.boh) || 0);
      const stdOpsH = stdOpsForIso(iso, opsPeople);
      const sched = ops + nonOp + stdOpsH;
      /* ⚠️ TESTS OPS, NOT OPS + NON-OP, AND THAT IS THE WHOLE POINT.
         🐛 This guard says "nothing scheduled = nothing to say" and then tested
         `ops + nonOp`. Non-op is a STANDING block — about 35 hours every single
         day whether or not a soul is rostered — so the sum is never zero and
         the guard could never fire. A day nobody had scheduled yet still
         produced a variance line, counted those 35 hours as if they were
         scheduled labour, and told a leader to cut hours on a day with no
         schedule at all.
         That lands on exactly the sore spot: the flat non-op block is already
         the whole labour overage, and the floor is roughly on budget. This made
         it look worse and pointed it at the wrong days.
         A standing block is not a schedule. If no ops hours are rostered,
         there is nothing to compare. */
      if (ops <= 0) return;
      schedDollars += sched * wage;
      if (fromIso(iso).getDay() !== want) return;
      const b = dayBudget(forecastFor(iso, p, wk), targetFor(iso, p, wk, tier), cfg);
      if (!(b.total > 0)) return;                   // no budget = no comparison
      sum += sched - b.total;
      sumOps += ops - b.total;
      sumNonOp += nonOp;
      /* ── PER-AREA VARIANCE (Matt, Jul 31 2026) ──
         "the non ops gets the same split for foh and boh… Non op and ops have
         to be a combination", and "I still want to see how many hrs to cut for
         foh and boh even if the leveler is the non ops."

         So non-op is APPORTIONED on the same ratio the budget uses
         (cfg.bohPct), not dropped. Each house then carries its share of the
         standing training/meeting block and is compared to its own budget
         slice.

         ★ THE POINT OF DOING IT THIS WAY: fohOver + bohOver === sum, exactly.
         The two tiles add up to the headline, so a leader reading "cut 21" and
         then "front 11, back 10" sees one consistent story. An earlier pass
         made these operational-only; they summed to LESS than the headline and
         showed room on the floor while the headline said cut, which is a real
         answer to a different question and reads as a contradiction on a card
         people act on mid-shift.
         ⚠️ Non-op has no true house — it is one store-wide standing figure —
         so this split is an ALLOCATION, not a measurement. That is exactly why
         App.jsx shows the training/meeting composition to directors only. */
      /* 🐛 STANDING OPS WAS IN THE HEADLINE AND NOT IN THESE TWO LINES, so the
         invariant above was false the moment anybody was added to it (Aug 7
         2026 sweep, finding 35). The headline is `ops + nonOp + stdOpsH -
         b.total`; these summed to `ops + nonOp - b.total`, because
         `b.foh + b.boh === b.total` by construction in dayBudget. The gap was
         exactly stdOpsH. The Aug 4 pass added the term to the headline and to
         schedDollars and stopped there.

         ⚠️ DORMANT, NOT HARMLESS. It only reads correctly today because
         OPS_PEOPLE_DEFAULT was emptied on Aug 5 and gcfcr-standing-ops-v1 has
         never been written, so stdOpsForIso returns 0. LaborPlanner's own note
         tells a director to add the next person who works off-system there —
         and the first one they add would make the card say "cut 38" over tiles
         reading 15 and 15. apportion() would not hide it either: an 8-hour gap
         is bigger than the number of tiles, so its guard fires and prints the
         raw mismatch on a card people act on mid-shift.

         ⚠️ SPLIT ON cfg.bohPct, THE SAME AS NON-OP, and for the same reason: a
         standing-ops person carries `hrsPerDay` and nothing else — no house.
         It is one store-wide figure, so this is an ALLOCATION, not a
         measurement, exactly as the note above says of non-op. */
      const nonOpBoh = nonOp * cfg.bohPct;
      const stdOpsBoh = stdOpsH * cfg.bohPct;
      sumFoh += (Number(d.foh) || 0) + (nonOp - nonOpBoh) + (stdOpsH - stdOpsBoh) - b.foh;
      sumBoh += (Number(d.boh) || 0) + nonOpBoh + stdOpsBoh - b.boh;
      count += 1;
      if (iso === todayIso) todayOver = sched - b.total;
    });

    /* One calculation, read twice below. Computing it inside each field ran
       dtShareOfFoh over four weeks of days twice for one card. */
    const dtMix = dtShareOfFoh(trailingDays([salesRec, prevSalesRec], 28));
    const fohSplit = splitFohHours(count > 0 ? sumFoh / count : null, dtMix && dtMix.share);

    return {
      /* Whether the labor window can be believed. The dashboard card must not
         state laborPct or laborOver as fact while this is false. */
      laborTrusted,
      laborOver,                                         // + = over goal, − = under
      laborPct, laborGoal, salesThrough, effThrough,
      laborPaid: laborCost > 0 ? laborCost : (schedDollars > 0 ? schedDollars : null),
      laborSource: laborCost > 0 ? "actual" : "scheduled",
      mtdHours: mtd ? Number(mtd.hours) || 0 : 0,
      dowAvgOver: count > 0 ? sum / count : null,        // non-ops INCLUDED (Matt's ruling)
      dowAvgOverOps: count > 0 ? sumOps / count : null,  // not rendered — kept for other surfaces
      // Per house, WITH each house's apportioned share of the non-op block.
      // These two sum to dowAvgOver — the headline — by construction.
      dowAvgOverFoh: count > 0 ? sumFoh / count : null,
      dowAvgOverBoh: count > 0 ? sumBoh / count : null,
      /* ★ THE FRONT NUMBER, SPLIT DRIVE THRU vs FRONT COUNTER (Matt, Aug 6
         2026: "the cut hrs still doesnt show how mch to cut for dt vs fc").
         "Cut 13 up front" does not tell a leader which side to take it off, and
         those are two different decisions with two different people on them.
         ⚠️ OFF THE REAL SALES MIX, NOT A SETTING. dtShareOfFoh reads the last
         four weeks of Sales Allocation and returns null on fewer than 14 days,
         so a store with a thin window gets NO split rather than a made-up one.
         cfg.dtPct is deliberately not used as a fallback here — on the Planner
         it is an override a human chose, and quietly substituting it on the
         dashboard would present an assumption as a measurement.
         ⚠️ COMPUTED HERE, NOT IN App.jsx. Same reason todayByDaypart is: two
         surfaces doing this arithmetic separately is how the dashboard and the
         Planner already disagreed once about where a cut should land. */
      dowAvgOverDt: fohSplit ? fohSplit.dt : null,
      dowAvgOverFc: fohSplit ? fohSplit.fc : null,
      /* So the card can say WHY there is no split rather than just omitting it. */
      dtMixDays: dtMix ? dtMix.days : 0,
      dowAvgNonOp: count > 0 ? sumNonOp / count : null,
      dowDays: count,
      todayOver,
      /* ★ THE DAYPART SPLIT, ON THE DASHBOARD (Matt, Aug 4 2026: "The daypart
         cuts should be viewable here without going to the planner").
         Same arithmetic the Planner's own block uses — today's variance spread
         across the dayparts by where the hours actually sit, then each daypart
         split front/back by that daypart's real shape. Computed here rather
         than duplicated in App.jsx so the two surfaces cannot drift into
         disagreeing about where a cut should land, which is the exact bug the
         dashboard and the Planner already had once today over standing ops. */
      todayByDaypart: await todayDaypartSplit(ym, todayOver, cfg, get),
      wage,
    };
  } catch {
    return null;
  }
}

/* ★ THE MONTH'S PROJECTED FINISH — actual dollars for the days that are
   entered, the Planner's own per-day forecast for the days that are not
   (Matt, Aug 6 2026: "in the planner it shows the projected sales and I even
   update the upcoming holidays so it should have a good idea for the
   projected finish"). forecastFor honours his per-day overrides, so a
   holiday he zeroed projects as zero rather than as an average Tuesday.
   ⚠️ dayTotal, not avgBasisTotal: this sums real money taken, and the
   holiday-adjusted basis exists only for AVERAGES.
   Returns null until at least one real day is entered — a projection made of
   nothing but forecast IS the forecast, and that number has its own surface. */
export async function monthProjectedFinish(ym, get, policy) {
  requireGet(get);
  try {
    const [{ p, wk }, salesRec] = await Promise.all([
      loadMonthBasis(ym, get, policy),
      loadSalesMonth(ym, get),
    ]);
    const days = (salesRec && salesRec.days) || {};
    let actual = 0, entered = 0, forecastRest = 0, total = 0;
    businessDaysOf(ym).forEach((iso) => {
      total += 1;
      const t = dayTotal(days[iso]);
      if (t > 0) { actual += t; entered += 1; }
      else forecastRest += forecastFor(iso, p, wk) || 0;
    });
    if (!entered) return null;
    return { projected: actual + forecastRest, actual, entered, days: total, forecastRest };
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE WEEK AHEAD, DAY BY DAY, DAYPART BY DAYPART, AREA BY AREA.

   Matt, Aug 7 2026: "i want to know what to cut exactly where so when im
   cutting im not guessing."

   🐛 WHY THIS COULD NOT REUSE THE CARD. monthLaborCard walks the month with
   `if (fromIso(iso).getDay() !== want) return;` — it only ever sees ONE
   weekday, which is what makes dowAvgOver an average — and it keeps the raw
   per-day variance for exactly one date: `if (iso === todayIso) todayOver =
   sched - b.total;`. Every other day's number is computed and thrown away.
   A Sunday report built on that would print today's figure six times.

   ★ SAME ARITHMETIC, NOT A SECOND OPINION. Every line below is the card's own
   loop body: the same standing non-op and standing ops, the same `ops <= 0`
   guard, the same dayBudget, the same nonOpBoh allocation. If the card and
   this ever disagree about a day, one of them has been edited alone.

   ⚠️ `ops <= 0` MEANS NOTHING SCHEDULED, AND THAT DAY IS OMITTED, not reported
   as a zero cut. A day with no roster yet is the normal state on a Sunday
   looking at Friday, and "cut 0 hours" reads as "you are fine" rather than
   "nobody is on it yet".
   ⚠️ IT IS A PLAN AGAINST A BUDGET, NOT A FORECAST OF ANYTHING. Wording that
   claims otherwise is the exact defect the Aug 7 sweep found in the daypart
   DMs, which said "last 4 weeks" over a single day's number.
   ══════════════════════════════════════════════════════════════════════════ */
export async function weekCutPlan(ym, startIso, dayCount, get, policy) {
  requireGet(get);
  try {
    const { p, cfg, tierCfg, wk } = await loadMonthBasis(ym, get, policy);
    const tier = activeTier(tierCfg);
    const [nonOpPerDay, opsPeople, salesRec, prevSalesRec] = await Promise.all([
      standingNonOpPerDay(get),
      standingOpsPeople(get),
      loadSalesMonth(ym, get).catch(() => null),
      loadSalesMonth(shiftMonth(ym, -1), get).catch(() => null),
    ]);
    /* The DT share of front hours, from the real sales mix — the same source
       the dashboard tiles use, so a report cannot disagree with the tile a
       leader is looking at. Null when it is unmeasurable, and then a row
       carries front/back only and says so by leaving dt/fc null. */
    const dtMix = dtShareOfFoh(trailingDays([salesRec, prevSalesRec], 28));
    const dtShare = dtMix && dtMix.share != null ? dtMix.share : null;

    const out = [];
    const start = fromIso(startIso);
    for (let n = 0; n < dayCount; n += 1) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
      const iso = isoOf(day);
      if (day.getDay() === 0) continue;                  // closed Sunday
      if (!iso.startsWith(ym)) continue;                 // next month needs its own basis
      const d = (p && p.days && p.days[iso]) || {};
      const std = nonOpForIso(iso, nonOpPerDay);
      const nonOp = std == null ? (Number(d.nonOp) || 0) : std;
      const ops = (Number(d.foh) || 0) + (Number(d.boh) || 0);
      if (ops <= 0) continue;                            // nothing rostered yet
      const stdOpsH = stdOpsForIso(iso, opsPeople);
      const sched = ops + nonOp + stdOpsH;
      const b = dayBudget(forecastFor(iso, p, wk), targetFor(iso, p, wk, tier), cfg);
      if (!(b.total > 0)) continue;                      // no budget, no comparison
      const over = sched - b.total;
      const nonOpBoh = nonOp * cfg.bohPct;
      const fohOver = (Number(d.foh) || 0) + (nonOp - nonOpBoh) - b.foh;
      const bohOver = (Number(d.boh) || 0) + nonOpBoh - b.boh;
      const dayparts = (await todayDaypartSplit(ym, over, cfg, get, iso)).map((r) => ({
        ...r,
        dt: dtShare == null ? null : r.foh * dtShare,
        fc: dtShare == null ? null : r.foh * (1 - dtShare),
      }));
      out.push({ iso, dow: DOW[day.getDay()], over, foh: fohOver, boh: bohOver, dayparts });
    }
    return { ym, dtShare, days: out };
  } catch { return null; }
}

/* ★ ONE DAYPART'S CUT, SPLIT DT / FC / BACK — for the labor-daypart DMs.
   Derives the DT share exactly the way App.jsx's daypart rows do: from the
   card's own dowAvgOverDt / dowAvgOverFc, so a DM can never disagree with the
   tiles on the dashboard about the same daypart. (Matt: "for fc and dt" — the
   two numbers above already carry the real sales mix; dividing them gives the
   same share without a second source.)
   Returns null when there is no row for the daypart (unimported table, no
   schedule today) or when the DT/FC mix is unmeasurable — and null means SEND
   NOTHING, never guess a split. */
export function daypartCutNums(card, periodKey) {
  if (!card || !Array.isArray(card.todayByDaypart)) return null;
  const row = card.todayByDaypart.find((r) => DP_TO_PERIOD[r.dp] === periodKey);
  if (!row) return null;
  const dtPlusFc = (card.dowAvgOverDt || 0) + (card.dowAvgOverFc || 0);
  const dtShare = (card.dowAvgOverDt != null && card.dowAvgOverFc != null && dtPlusFc !== 0)
    ? card.dowAvgOverDt / dtPlusFc
    : null;
  if (dtShare == null) return null;
  return { dp: row.dp, dt: row.foh * dtShare, fc: row.foh * (1 - dtShare), back: row.boh };
}

/* ══════════════════════════════════════════════════════════════════════════
   SCHEDULED HOURS, PUSHED BACK FROM THE WEEK. Matt, Aug 13 2026: "the
   sechedule would need to talk to the labor planner as well", then
   "overwrite it with the button".

   ★★ THIS INVENTS NOTHING. The planner has ALWAYS had a scheduled number per
   day — `days[iso].foh` and `days[iso].boh` — and has always compared it to the
   budget to produce "+3 hrs to cut". The only thing that was manual is HOW
   those two numbers got there: somebody read the week and retyped them.

   So this writes the two fields the planner already reads, in the shape it
   already writes them (strings, the way `setDayField` stores a typed digit),
   and the variance column starts being true on its own.

   ⚠️⚠️ A BUTTON PRESS, NEVER A SIDE EFFECT OF SAVING. Matt chose overwrite,
   and overwrite is only safe when a human asked for it in that moment. Saving
   a week must not quietly replace a number somebody typed.

   ⚠️ ONLY THE DAYS HANDED IN ARE TOUCHED. A day the week has nothing for is
   left exactly as it was, never zeroed — zero is a real answer meaning "nobody
   works", and a week that simply does not cover Sunday must not say that.

   ⚠️ A WEEK CAN STRADDLE TWO MONTHS, and the planner stores one record per
   month. Mon-Sat can cross the 1st, so this groups by month and may write two
   records. Writing only the first month would silently drop the tail of the
   week — which would read as a light month rather than as a bug.

   ⚠️ RE-READ BEFORE MERGE. The planner is open on somebody else's iPad and
   debounces its own saves. Reading fresh and merging per day is what keeps a
   forecast typed thirty seconds ago from being thrown away. Rule 1.
   ══════════════════════════════════════════════════════════════════════════ */

/* Marks a day whose hours came from the schedule rather than somebody's
   fingers, so the planner can say so and nobody wonders where it came from. */
export const SCHED_SOURCE = "schedule";

/* Hours are stored as STRINGS because that is what `setDayField` writes for a
   typed digit, and `num()` reads both. Matching the existing shape exactly
   means no reader anywhere has to learn a second one. Rule 1. */
const hourStr = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v.toFixed(2) : null;
};

/* Merge one month's worth of scheduled hours into a planner record. Pure, so
   the merge can be checked without a database.
     rec    the month record, or null
     byIso  { "2026-08-10": { foh: 14.5, boh: 22 } }
   Returns { rec, changed } — `changed` counts days actually written. */
export function mergeScheduledHours(rec, byIso, ym, stamp) {
  const base = rec && typeof rec === "object" ? rec : { version: 1, month: ym, days: {} };
  const days = { ...((base && base.days) || {}) };
  let changed = 0;
  Object.keys(byIso || {}).forEach((iso) => {
    const foh = hourStr((byIso[iso] || {}).foh);
    const boh = hourStr((byIso[iso] || {}).boh);
    /* ⚠️ BOTH OR NEITHER. A day with one readable side would leave the other
       holding a stale typed number and the variance would be nonsense — worse
       than not writing, because it still looks filled in. */
    if (foh === null || boh === null) return;
    days[iso] = {
      ...(days[iso] || {}),
      foh, boh,
      hoursFrom: SCHED_SOURCE,
      hoursAt: (stamp && stamp.at) || "",
    };
    changed++;
  });
  return { rec: { ...base, version: base.version || 1, month: base.month || ym, days }, changed };
}

/* Group a week's days by the month they fall in. Exported because the screen
   needs to say "two months" BEFORE it writes anything. */
export function byMonth(byIso) {
  const out = {};
  Object.keys(byIso || {}).forEach((iso) => {
    const ym = String(iso).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    (out[ym] = out[ym] || {})[iso] = byIso[iso];
  });
  return out;
}

/* Read, merge, write, one record per month touched.
   ⚠️ A REFUSED WRITE STOPS THE WHOLE THING AND SAYS WHICH MONTH. Carrying on
   would leave half a week pushed, which is the state hardest to notice and
   hardest to undo. */
export async function pushScheduledHours(byIso, { get, set, stamp }) {
  const groups = byMonth(byIso);
  const months = Object.keys(groups).sort();
  if (!months.length) return { ok: true, months: [], days: 0 };
  const done = [];
  let total = 0;
  for (const ym of months) {
    const fresh = await get(plannerKey(ym));
    const { rec, changed } = mergeScheduledHours(fresh, groups[ym], ym, stamp);
    if (!changed) { done.push({ ym, days: 0 }); continue; }
    const ok = await set(plannerKey(ym), rec);
    if (ok === false) return { ok: false, months: done, days: total, failedMonth: ym };
    done.push({ ym, days: changed });
    total += changed;
  }
  return { ok: true, months: done, days: total };
}
