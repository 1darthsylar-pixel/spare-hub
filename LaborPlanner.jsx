/* ============================================================================
   LaborPlanner.jsx — Gate City Hub
   Labor budget engine. Replaces the "[Month] Planner" tabs in the FCR Workbook.

   Per day:
     Forecast   = 2-month weekday avg from Sales Allocation (override per day)
     Target     = DERIVED from the active productivity tier and that day's
                  forecast (see productivityTiers.js). Because the tier model
                  has a fixed-hours component, the target rises with volume:
                  a $34K Friday is held to a higher $/hr than a $28K Tuesday.
                  Per-day override still available, flagged "custom".
     Budget hrs = tier benchmark hours = fixedHours + forecast ÷ marginalRate
                  → split BOH 45% / FOH 55% (FOH: DT 70% / FC 30%)
     Scheduled  = FOH hrs + BOH hrs + standing non-op → variance per dept:
                  "+X hrs to cut" / "−X hrs to add", $ impact at planned wage
     Non-op hrs = training/meetings/orientation — excluded from productivity,
                  INCLUDED in total labor spend and in the labor % goal
     Actual $   = pulled live from Sales Allocation (no re-entry)

   WHAT CHANGED IN THIS REVISION
   -----------------------------
   1. The flat weekday divisor table (85/85/85/86/87/87) is gone. Those six
      numbers were a frozen snapshot of the tier formula taken at one volume
      level, which is why they slowly stopped agreeing with HotSchedules.
      Targets now compute from the tier. cfg.divisors is retained in storage
      for backwards compatibility but is no longer read.

   2. Planned wage is SEEDED from the prior CLOSED month's actual avg wage
      (from that month's saved FCR MTD record), not from the live month.
      An in-flight avg wage swings on a handful of opening shifts, and a
      labor budget that moves every time payroll posts is a budget you
      cannot schedule against. Type a value to switch to manual mode.

      This matters: the Top 20% tier computes to 21.23% labor at $18.50/hr
      but 20.46% at the real $17.83/hr. The stale wage assumption was
      overstating the labor goal by roughly three-quarters of a point.

   3. New export `monthLaborPlan(ym)` — the FCR reads productivity goal,
      labor % goal, and planned wage from here in one call, so the two
      goals are mathematically incapable of drifting apart.

   Storage:
     gcfcr-planner-[YYYY-MM]-v1  { version, month, days:{ iso:{ foh,boh,nonOp,
                                   target,forecast } } }
     gcfcr-planner-config-v1     { divisors(legacy), bohPct, dtPct, fpPct,
                                   wage(legacy), wageMode }
     gcfcr-productivity-tiers-v1 { selected, tiers, plannedWage }
   ============================================================================ */

import React, { useEffect, useMemo, useRef, useState } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, CARD_3D_SOFT, accentEdge, notePanel } from "./cardStyle.js";
import { kvGet, kvSet, kvGetResult, publishSharedRows, hubToken } from "./store";
import PasteMonth from "./PasteMonth.jsx";
import { parseDaypartPaste, parseLaborBenchPaste } from "./pasteImports.js";
import { loadSalesMonth, dayTotal, weekdayTwoMonthAvg } from "./SalesAllocation.jsx";
import MonthYearPicker from "./MonthYearPicker.jsx";
/* ⚠️ ZERO-IMPORT NEUTRAL MODULE. FCRPage.jsx imports FROM LaborPlanner, so LaborPlanner
   can never import from FCRPage — this exists so both sides can apply the SAME
   payroll-window trust rule without a circular dependency. Do not replace these
   with a FCRPage import. */
import { laborWindow, laborRow } from "./laborWindow.js";
/* The store's own holiday hours. Read at CALL time in holPolicy() below,
   never at module scope: applyStoreOverrides runs after this file is
   imported, so a module-level read freezes the shipped default. */
import { storeCfg } from "./storeConfig.js";
/* Leaf, imports nothing. dtShareOfFoh reads Sales Allocation's own day shape. */
import { dtShareOfFoh } from "./dayparts.js";
import CalendarGrid from "./CalendarGrid.jsx";
import {
  loadTierConfig,
  loadTierConfigResult,
  saveTierConfig,
  activeTier,
  dayProductivityTarget,
  benchmarkHours,
  seedPlannedWage,
  TIER_ORDER,
} from "./productivityTiers.js";

/* ★ THE ENGINE LIVES IN laborEngine.js NOW (Aug 6 2026). Everything below the
   fold that used to compute here — the month basis, the planned wage, the
   plan, the daypart split, the dashboard card, standing ops — moved to that
   leaf so worker.js can run the SAME maths for the daypart labor DMs. The
   storage reader is injected (inputRegistry's pattern): this file binds
   kvGet; the worker passes (k) => sbGet(env, k). One implementation, two
   doors — a second copy is how the dashboard and the Planner once disagreed
   about where a cut should land.
   ⚠️ The bound exports below keep every old signature, so FCRPage and
   App.jsx's dynamic import call exactly what they always called. */
import {
  ymOf, isoOf, fromIso, businessDaysOf, shiftMonth, monthLabel, num,
  CONFIG_KEY, DEFAULT_CONFIG, mergeCfg, plannerKey, fcrMtdKey,
  dayBudget, trailingDays, SCHED_SOURCE,
  DP_ORDER, DP_DOW, DP_KEY, DP_CFG_KEY, OPS_CFG_KEY,
  dpPeopleDay, stdOpsForIso, dpHouseSplit,
  monthLaborCard as engineMonthLaborCard,
  monthLaborPlan as engineMonthLaborPlan,
  monthForecastTotal as engineMonthForecastTotal,
  monthNonOpHours as engineMonthNonOpHours,
  monthProductivityGoal as engineMonthProductivityGoal,
  resolvePlannedWage as engineResolvePlannedWage,
  monthProjectedFinish as engineMonthProjectedFinish,
} from "./laborEngine.js";
export { plannerKey, dayBudget };

/* ⛔⛔ THE HOLIDAY BASIS WAS BUILT, TESTED AND WIRED TO NOTHING. Fixed Aug 21
   2026, the day it was found, hours after the hours themselves were typed in.

   🐛 `loadMonthBasis(ym, get, policy)` folds the holiday sales basis into
   `p.holiday`, and `forecastFor` reads it. Measured by RUNNING the real path
   rather than reading it: **not one of the eight call sites passed a third
   argument**, so `policy` was always undefined, `holidayBasisFor` returned `{}`
   on its first line, and `p.holiday` was empty every single time. The whole
   holiday arm of `forecastFor` was dead code in the shipped app.

   ⇒ WHAT THAT COST. Christmas Eve is a Thursday. The planner forecast a full
   Thursday's sales and budgeted a full Thursday's hours, on a day that shuts at
   four — and Christmas Day, which is closed, budgeted a crew. Matt typed the
   real figures into Store Settings and nothing read them. Nothing errored,
   because an empty map is exactly what a store with no holiday policy has.

   ★ AND NO TEST COULD HAVE CAUGHT IT. `holidayBasisFor` was tested by handing
   it a policy directly, which is the one thing the app never does. The same
   shape as `HUB_SCHEDULE_PULL_READY` and the announcement filter in this
   codebase's own history: correct at the leaf, reaching nobody.

   ⚠️⚠️ THIS IS THE ONE PLACE THE BROWSER BINDS, AND THAT IS WHY THE FIX IS
   HERE. Every screen calls these wrappers, never the engine, so binding the
   policy beside `kvGet` is ONE site rather than eight chances to miss one — the
   exact risk `loadMonthBasis`'s own comment warned about.
   ⚠️ READ AT CALL TIME, NEVER AT MODULE SCOPE. `applyStoreOverrides` runs after
   this file is imported, so a `const POLICY = storeCfg(...)` up here would
   freeze the shipped default and never see what the store saved. That is the
   same bug `swapPolicy` had in Availability.jsx.
   ⚠️ `laborEngine.js` STILL IMPORTS ONLY ZERO-IMPORT LEAVES, which its header
   requires so it stays runnable from the Worker. The config is read HERE and
   handed in. Do not import storeConfig.js into the engine to save this line. */
const holPolicy = () => storeCfg("holidays", null);

export const monthLaborCard = (ym, dow) => engineMonthLaborCard(ym, dow, kvGet, holPolicy());
export const monthLaborPlan = (ym) => engineMonthLaborPlan(ym, kvGet, holPolicy());
export const monthForecastTotal = (ym) => engineMonthForecastTotal(ym, kvGet, holPolicy());
export const monthNonOpHours = (ym, throughIso) => engineMonthNonOpHours(ym, throughIso, kvGet);
export const monthProductivityGoal = (ym) => engineMonthProductivityGoal(ym, kvGet, holPolicy());
export const resolvePlannedWage = (ym, cfg, tierCfg) => engineResolvePlannedWage(ym, cfg, tierCfg, kvGet);
export const monthProjectedFinish = (ym) => engineMonthProjectedFinish(ym, kvGet, holPolicy());

const NAVY = "#1B3A5C", RED = "#DD0031", INK = "#232A31", GRAY = "#6B7480",
      LINE = "#E3E7EC", BG = "#F6F8FA", GREEN = "#166B4A", AMBER = "#7A5A00";

/* ---------------- date helpers (Mon–Sat) ---------------- */
/* Shared date helpers (pad, ymOf, isoOf, fromIso, businessDaysOf,
   shiftMonth, monthLabel) come from laborEngine.js. These two are UI-only: */
function prevBusinessDay(from = new Date()) {
  const d = new Date(from); d.setDate(d.getDate() - 1);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return isoOf(d);
}
const mondayOf = (iso) => {
  const d = fromIso(iso); const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(mon);
};

/* ---------------- config ---------------- */
/* CONFIG_KEY, DEFAULT_CONFIG, mergeCfg, plannerKey, fcrMtdKey — moved to
   laborEngine.js, imported above. */

/* loadMonthBasis, forecastFor, targetFor, trailingDays, dayBudget,
   resolvePlannedWage, monthProductivityGoal, monthForecastTotal,
   standingNonOpPerDay, nonOpForIso, monthNonOpHours, monthLaborPlan —
   all moved to laborEngine.js. The bound exports above are the browser
   doors onto them. republishLaborRow stays here: it WRITES through
   publishSharedRows, and writes never left the browser. */

/* The EOS scorecard is keyed by CALENDAR QUARTER — `eos:scorecard:2026-Q3`.
   Derived from the MONTH being republished, not from today, so republishing a
   closed month can never land on the current quarter's board. */
const eosScorecardKey = (ym) => {
  const [y, m] = String(ym || "").split("-").map(Number);
  const q = Math.floor(((m || 1) - 1) / 3) + 1;
  return `eos:scorecard:${y}-Q${q}`;
};

/* ★ REPUBLISH THE LABOR ROW (s3) AFTER A TIER CHANGE.
   The tier is an input to the labor GOAL. Without this, changing it moves the
   Planner and the daypart console immediately while the KPI strip, Company
   Health, the L10 board and the AI digest keep the OLD goal until someone
   happens to open the FCR page.

   ⚠️ IT PUBLISHES ONLY WHEN THE PAYROLL WINDOW IS TRUSTED. labor % =
   (wages + PTO) ÷ salesThrough, so a missed sales day shortens the denominator
   while wages stay whole and the row goes out as a FALSE RED on four surfaces
   at once. `laborRow` returns null when untrusted and a null MUST mean "write
   nothing" — the merge never deletes, so the last good row stays on the board
   rather than blanking or lurching.

   Never throws. `saveTiers` calls it UNAWAITED: saving a tier must not wait on,
   or fail because of, a best-effort publish. */
export async function republishLaborRow(ym) {
  try {
    const [mtd, sales, plan] = await Promise.all([
      kvGet(fcrMtdKey(ym)).catch(() => null),
      loadSalesMonth(ym).catch(() => null),
      monthLaborPlan(ym).catch(() => null),
    ]);
    if (!plan || plan.laborGoal == null) return null;

    const dayTotals = {};
    const src = (sales && sales.days) || {};
    Object.keys(src).forEach((iso) => { dayTotals[iso] = dayTotal(src[iso]); });

    /* ★★ HONOUR THE HOLD AND THE OVERRIDE. FCRPage's publish guard is
       `laborPct != null && laborGoal != null && trusted && !laborHeld`, and it
       uses the typed override in place of the computed % when one is set.
       This function checked `trusted` and NEITHER of the other two.

       🐛 SO A TIER TAP UNDID A DELIBERATE FREEZE, SILENTLY (Aug 4 2026). Matt
       holds the labor % because PTO is not entered yet — the whole reason the
       hold checkbox exists — then taps a tier button over here, and this
       republished the live, flattering number to the L10 board, the KPI strip,
       Company Health and the AI digest. Still labelled frozen, because the
       `held` marker is written per row by FCRPage and this never cleared or
       set it. Every downstream reader was told a held number was current.
       ⚠️ Publishing the held MARKER rather than nothing, exactly as FCRPage
       does: a reader must be able to say "held" instead of quietly implying
       the last value is live. */
    const laborHeld = !!(mtd && mtd.laborHold);
    if (laborHeld) {
      const key = eosScorecardKey(ym);
      await publishSharedRows(key, { s3: { held: true } });
      return null;
    }
    const w = laborWindow({ mtd, dayTotals });
    const wages = Number(mtd && mtd.wages) || 0;
    const pto = Number(mtd && mtd.pto) || 0;
    /* The typed override wins over the computed figure, same as FCRPage:832ff.
       An empty string is not zero — `Number("") === 0` would publish 0.00%. */
    const overrideN = mtd && mtd.laborPctOverride !== "" && mtd.laborPctOverride != null
      ? Number(mtd.laborPctOverride) / 100 : null;
    const computed = w.salesThrough > 0 ? (wages + pto) / w.salesThrough : null;
    const laborPct = (overrideN != null && isFinite(overrideN)) ? overrideN : computed;

    const row = laborRow({
      laborPct, laborGoal: plan.laborGoal, trusted: w.trusted, effThrough: w.effThrough,
    });
    if (!row) return null;

    const key = eosScorecardKey(ym);
    // publishSharedRows: a FAILED read publishes nothing, instead of merging
    // onto {} and wiping every row but s3.
    if (!(await publishSharedRows(key, { s3: row }))) return null;
    return row;
  } catch { return null; }
}

/* todayDaypartSplit and monthLaborCard moved to laborEngine.js — the
   dashboard reaches monthLaborCard through the bound export above, so it
   still calls the same function the worker's daypart DMs compute from. */

/* ---------------- formatting ---------------- */
const fmt$ = (n) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtH = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
function VarChip({ diff, small }) {
  if (!isFinite(diff)) return null;
  const abs = Math.abs(diff);
  if (abs < 0.05) return <span style={{ fontSize: small ? 11 : 12, fontWeight: 800, color: GREEN }}>on budget ✓</span>;
  const cut = diff > 0;
  return (
    <span style={{ fontSize: small ? 11 : 12, fontWeight: 800, color: cut ? RED : GREEN }}>
      {cut ? `+${fmtH(abs)} hrs to cut` : `−${fmtH(abs)} hrs to add`}
    </span>
  );
}

/* ============================================================================
/* ============================================================================
   Daypart Labor — LIVING monthly view (both views: as-clocked vs non-ops stripped).
   Data persists in KV (gcfcr-daypart-labor-v1): one record per month, entered
   from the CFA Signal Labor Productivity table (no export exists — hand-entered,
   importer TBD). Non-ops config (gcfcr-daypart-nonops-v1) is editable. The Top-20%
   benchmark reads the Planner's ACTIVE productivity tier, so it moves when the tier
   is re-fit. Seeded with June 2026 actuals.
   ============================================================================ */
/* DP_ORDER, DP_DOW, DP_KEY, DP_CFG_KEY — moved to laborEngine.js. */
const DP_BARMAX = 120;

/* ── LABOR COST OPPORTUNITY (TIR Overview) ──────────────────────────────
   The gap between what we pay in wages and what the top performers pay, in
   both % of sales and dollars. Chick-fil-A publishes it monthly across four
   benchmark cuts; the report is a PDF behind SSO, so it is typed in here.

   One record holding every month, like the daypart table above, because the
   report's own value is the TREND — a single month in isolation says nothing
   about whether the gap is opening or closing.

   Top 20% is the headline because that is the cut the rest of the Hub already
   measures against (paper cost uses it too). The other three are stored so
   switching the headline later is a display change, never a re-transcription
   of months already keyed in. */
const LB_KEY = "gcfcr-laborbench-v1";
const LB_HEADLINE = "20";
const LB_TIER_ORDER = ["10", "20", "33", "50"];
const LB_TREND_MONTHS = 6;

/* Module level, and deliberately so: a useMemo below reads these during the
   first render, which is exactly where an in-component helper sits in its
   temporal dead zone. Every one guards its input — a record written by an
   older build may have no `tiers` at all, and a missing tier must read as
   "not entered", never crash the labor console. */
const lbTier = (rec, tier) => {
  const t = rec && rec.tiers && typeof rec.tiers === "object" ? rec.tiers[tier] : null;
  return t && typeof t === "object" ? t : null;
};
const lbSorted = (rows) =>
  (Array.isArray(rows) ? rows.filter((r) => r && r.id) : [])
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
const lbLatest = (rows) => { const s = lbSorted(rows); return s.length ? s[s.length - 1] : null; };
/* Trend of the headline tier's opportunity %. Months with no headline tier are
   skipped rather than plotted as 0 — a gap in the record is not a good month. */
const lbTrend = (rows, tier, n) =>
  lbSorted(rows)
    .map((r) => ({ id: r.id, label: r.label || r.id, pct: lbTier(r, tier)?.oppPct }))
    .filter((p) => Number.isFinite(p.pct))
    .slice(-n);
const lbPct = (n) => (Number.isFinite(n) ? `${n.toFixed(2)}%` : "—");
/* ★ THE DAYPART TABLE — TRANSCRIBED FROM CFA AnalyticsHub, Labor Productivity
   Analytics → Labor Cost, Time Granularity "Display Daypart", Sundays included.
   Per weekday Mon..Sat, in the order DP_DOW lists them.

   ⚠️ THIS IS A SEED, NOT STORAGE. `gcfcr-daypart-labor-v1` had never been
   written, so this card has always been showing a hardcoded month while looking
   like entered data — which is exactly why the day-level daypart block came up
   empty. Open the card and SAVE once to persist these to KV; until then the
   Input Health row stays amber and it is right to.

   ⚠️ July is MONTH TO DATE (through Jul 25), not a closed month. It will move
   when July closes — re-enter it then.

   ★ WHAT THIS DATA SAYS, so nobody has to re-derive it: breakfast takes ~23% of
   the labor dollars to make ~15% of the sales. Its labor cost runs 33.8% of
   sales while lunch, afternoon and dinner all land within half a point of 20%.
   At the store's own 22.5% breakfast would cost ~$6.3K/wk instead of ~$9.4K —
   roughly 166 hours a week, and far bigger than the $29,238 whole-store IPO gap. */
/* ⚠️ THE TWO MONTHS OF REAL SALES AND HOURS THAT USED TO SIT HERE ARE GONE
   FROM THE CLIENT (Aug 9 2026, sweep finding 11). They compiled into the Labor
   chunk, which answers any anonymous request with no account — six weekdays x
   four dayparts x two months of SALES with the matching PAID HOURS beside them,
   which is the store's revenue shape and its sales per labor hour.
   ⚠️ THE AUG 8 FIX MISSED THEM AND LOOKED LIKE IT HAD NOT: it stripped four
   named leaders' hours from this same file and added a note saying this chunk
   is "downloadable by anyone" — 45 lines BELOW these arrays, which it never
   touched. A fix that documents the danger while leaving the data is the most
   convincing kind of miss.
   ⇒ They live in daypartSeed.js now, imported ONLY by worker.js and served on
   GET /api/labor-seed behind the same tier-3 gate as the Financials tile.
   ⚠️ DO NOT IMPORT daypartSeed.js FROM ANY .jsx. One import and the whole table
   is back in the browser, silently.

   EMPTY_DP is the shape, with no numbers. It keeps `rec` a valid record on the
   very first render so the maths below can run and return zeros, which is what
   lets the loading state be a plain early UI branch instead of an early RETURN
   — a return above these hooks would be the hooks-after-early-return fault that
   took the whole dashboard down once already. */
const EMPTY_DP = { id: "", label: "", sales: {}, hours: {}, late: [] };

/* ONE fetch, memoised, shared by the console and the day block below — they run
   independent effects and two fetches are two chances to disagree.
   ⚠️ A FAILURE IS NOT CACHED. A refused or dropped read clears the promise so
   the next open retries, rather than freezing the card for the whole session. */
let dpSeedPromise = null;
const loadDpSeed = () => {
  if (dpSeedPromise) return dpSeedPromise;
  dpSeedPromise = (async () => {
    try {
      const r = await fetch("/api/labor-seed", { headers: { "x-hub-token": hubToken() } });
      const j = await r.json().catch(() => null);
      if (j && j.ok && Array.isArray(j.dpMonths) && j.dpMonths.length) return j.dpMonths;
    } catch { /* fall through to the retry below */ }
    dpSeedPromise = null;
    return null;
  })();
  return dpSeedPromise;
};
// ★ NON-OPS IS NOW A LIST OF PEOPLE, NOT FOUR DAYPART BUCKETS.
// The four daypart numbers were only ever SUMMED (see nonOpWk below) — nothing
// used them separately, so the split was decorative. Hannah supplies these as
// hours per person per weekday, which is also how she thinks about them and how
// they can be checked: you can see WHOSE hours are being stripped.
// The old Breakfast/Lunch/Afternoon/Dinner fields are kept ONLY as a fallback
// for a config saved before this change, so nobody's stored setting breaks.
//
// Seeded from Hannah's Jul 25 request, effective the week of Mon Jul 27.
/* ⚠️ SEATS, NOT NAMES (Aug 8 2026). This shipped four named leaders with each
   one’s individual daily paid hours in a client chunk — a person’s working
   pattern, downloadable by anyone. These are only the FALLBACK: the live values
   come from stored config and override this entirely, so the real names and
   hours live in KV where they belong.
   ⚠️ Do not put names back. A clone gets these seats too, and a seat travels
   where a name cannot. */
const DP_PEOPLE_DEFAULT = [
  { id: "np1", name: "Operator", hrsPerDay: 10 },
  { id: "np2", name: "HR", hrsPerDay: 10 },
  { id: "np3", name: "Office", hrsPerDay: 8 },
  { id: "np4", name: "Leadership Dev", hrsPerDay: 4 },
];
const DP_CFG_DEFAULT = { Breakfast: 12, Lunch: 13, Afternoon: 11, Dinner: 3,
  note: "9–6×3, 8–4, 8–12 · Mon–Fri", people: DP_PEOPLE_DEFAULT };

/* ★★ STANDING OPERATIONAL HOURS — worked, clocked and paid, but never on the
   board (Matt, Jul 27: "Kyleeka is ops for the rest of her time but its
   unscheduled 40 hrs a week but she is supposed to clock in").

   ⚠️ THIS IS NOT NON-OPS AND MUST NEVER BE MERGED WITH IT. Non-op hours are
   admin time stripped OUT of the operational productivity figure. These hours
   ARE operations — floor time that simply never appears on a schedule. The two
   lists behave identically in the DAY maths (both are paid, both consume budget
   the board can't spend) and differently everywhere productivity is judged, so
   they stay separate lists with separate keys.

   THE BUG THIS FIXES: `schedOp` was FOH + BOH + non-op, and 40 h/week of real
   paid operational labour sat in none of the three. Every "hrs to cut" figure
   was short by ~6.7 h/day — Mon Jul 27 read +48.08 when the true gap was ~55 —
   on the single number the store is managing hardest. */
/* OPS_CFG_KEY — moved to laborEngine.js. */
/* ★★ EMPTY, AND THAT IS THE CORRECT ANSWER TODAY (Matt, Aug 5 2026: "remove the
   hardcode hrs because she clocks in now").

   🐛 IT WAS DOUBLE COUNTING. This existed because of Matt, Jul 27: "Kyleeka is
   ops for the rest of her time but its unscheduled 40 hrs a week but she is
   supposed to clock in" — supposed to, and was not. Standing ops exists for
   hours that are worked and paid but reach no system. Now that she clocks in,
   those 8 hours arrive through the time punch report like everybody else's, and
   adding them here counted them a SECOND time. The labor budget has been
   reserving 8 phantom hours every weekday, which made every cut recommendation
   8 hours too aggressive.

   ⚠️ THE MECHANISM STAYS, THE ENTRY GOES. stdOpsForIso still honours a list and
   an optional `until`, so the next person who genuinely works off-system can be
   added in Daypart labor → Standing ops without touching code. An empty default
   means nobody is currently in that state, which is the truth.

   ⚠️ NOTHING STORED IS AFFECTED. `gcfcr-standing-ops-v1` has never been written,
   so this default was the live value. A store that HAS written that key keeps
   whatever it configured; this only changes what "unconfigured" means. */
const OPS_PEOPLE_DEFAULT = [];
const OPS_CFG_DEFAULT = { people: OPS_PEOPLE_DEFAULT };

/* dpPeopleDay, stdOpsForIso, standingOpsPeople — moved to laborEngine.js
   (imported above), so the worker counts standing ops exactly as this
   screen does. */
const dpNoteFrom = (people) => (people || []).length
  ? (people || []).map((p) => `${p.name} ${Number(p.hrsPerDay) || 0}`).join(" · ") + " · Mon–Fri"
  : "";
const dpNowYm = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const dpMonthLabel = (ym) => { const [y, m] = String(ym).split("-").map(Number); return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
const dpBlank = (ym) => ({
  id: ym, label: dpMonthLabel(ym),
  sales: Object.fromEntries(DP_ORDER.map(dp => [dp, ["", "", "", "", "", ""]])),
  hours: Object.fromEntries(DP_ORDER.map(dp => [dp, ["", "", "", "", "", ""]])),
  late: ["", "", "", "", "", ""],
});

/* dpHouseSplit (each daypart's real front/back shape, off the board
   template) — moved to laborEngine.js, imported above. */

function DpBar({ val, color }) {
  const h = Math.max(4, Math.round((val / DP_BARMAX) * 108));
  return (
    <div style={{ width: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color, marginBottom: 2 }}>{Math.round(val)}</div>
      <div style={{ width: "100%", height: h, background: color, borderRadius: "4px 4px 0 0" }} />
    </div>
  );
}

/* Props, all three added Jul 26:
   tierCfg        — the LIVE tier from the Planner. This component used to read
                    the tier ONCE on mount, so changing the benchmark left this
                    card measuring against whatever tier happened to be active
                    when it rendered. The prop is now the ONLY writer of `bench`;
                    a second (async, mount-time) writer previously raced it and
                    pinned the table to the wrong tier.
   onNonOpsSaved  — fires when the non-ops list is saved, so the Planner's day
                    maths re-derives immediately instead of at next reload.
   onMonthsSaved  — same for the daypart table itself, so the per-day daypart
                    block follows an edit without a refresh. */
function DaypartLabor({ tierCfg, onNonOpsSaved, onOpsSaved, onMonthsSaved }) {
  /* ⚠️ STANDING OPS IS ITS OWN LIST, ITS OWN KEY AND ITS OWN EDITOR — never
     folded into the non-ops panel. They look identical and mean opposite
     things: non-op hours are stripped from the operational productivity
     figure, standing-ops hours are the operations. One editor for both would
     make it a matter of remembering which list you were in. */
  const [opsCfg, setOpsCfg] = useState(OPS_CFG_DEFAULT);
  const [opsEdit, setOpsEdit] = useState(false);
  const [opsDraft, setOpsDraft] = useState(OPS_CFG_DEFAULT);
  // Any of this console's three reads (standing ops, daypart months, non-ops
  // cfg) failed → its editors refuse to save until a clean reload. All three
  // states fall back to SEEDS on a failed read, and every save here writes the
  // whole record — one save would replace the real lists with the seeds, and
  // the planner's budget and the FCR productivity denominator ride on them.
  // saveWarn = a write after a clean load came back false (kvSet returns
  // false, it never throws — every catch this component had was dead code).
  const [dpLoadFailed, setDpLoadFailed] = useState(false);
  const dpFailedRef = useRef(false);
  const [dpSaveWarn, setDpSaveWarn] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const c = await kvGetResult(OPS_CFG_KEY);
      if (!live) return;
      if (!c.ok) { dpFailedRef.current = true; setDpLoadFailed(true); }
      else if (c.value && typeof c.value === "object") setOpsCfg(c.value);
    })();
    return () => { live = false; };
  }, []);
  const openOps = () => { setOpsDraft(opsCfg); setOpsEdit(true); };
  const saveOps = async () => {
    if (dpFailedRef.current) return; // banner explains
    const people = (opsDraft.people || [])
      .map((p) => ({ ...p, name: String(p.name || "").trim(), hrsPerDay: Number(p.hrsPerDay) || 0 }))
      .filter((p) => p.name);
    const c = { ...opsDraft, people };
    const prev = opsCfg;
    setOpsCfg(c);
    const ok = await kvSet(OPS_CFG_KEY, c);
    if (ok === false) {
      // Editor stays open with the draft — nothing to retype for the retry.
      setOpsCfg(prev);
      setDpSaveWarn(true);
      return;
    }
    setDpSaveWarn(false);
    if (onOpsSaved) onOpsSaved(c);   // the Planner's day maths re-derives at once
    setOpsEdit(false);
  };
  const [months, setMonths] = useState([]);
  const [sel, setSel] = useState("");
  /* The seeded months arrive from GET /api/labor-seed instead of being compiled
     in — see the note at the top of this file for what they were leaking.
     ⚠️ ONLY WHEN NOTHING IS STORED. A real saved table wins, exactly as before;
     the effect further down loads KV first and only asks for the seed if that
     comes back empty. This one feeds the CONSOLE, which had the seed as its
     opening state.
     ⚠️ A FAILED SEED READ RAISES dpLoadFailed, the flag this console already
     has, which freezes the editors. That is the correct direction: saving with
     no seed would write an empty table over whatever is really there. */
  useEffect(() => {
    let live = true;
    (async () => {
      const seeded = await loadDpSeed();
      if (!live) return;
      if (!seeded) { setDpLoadFailed(true); return; }
      setMonths((cur) => (cur.length ? cur : seeded));
      setSel((cur) => cur || seeded[seeded.length - 1].id);
    })();
    return () => { live = false; };
  }, []);
  /* Labor Cost Opportunity. Seeded EMPTY, never with a sample month — a made-up
     figure here would read as a real gap against a real benchmark. Its own
     failed-read flag, so a dropped read blocks the benchmark import without
     also blocking the daypart editors that loaded fine. */
  const [benchRows, setBenchRows] = useState([]);
  const [lbFailed, setLbFailed] = useState(false);
  const lbFailedRef = useRef(false);
  const [cfg, setCfg] = useState(DP_CFG_DEFAULT);
  const [bench, setBench] = useState({ fixed: 43.9, marg: 99.59, label: "Top 20%" });
  const [open, setOpen] = useState(true);
  /* ★ THE BASIS TOGGLE IS GONE (Matt, Jul 26: "the as clocked, operational and
     top 20 make it confusing. Ther has to be a better way").
     Three stat cards were answering ONE question in three currencies, and
     tapping one silently changed what the table underneath measured — so the
     same column could mean two different things depending on a tap you might
     not remember making. The basis is now pinned to OPERATIONAL, which is the
     goal basis the tier's own targets were built on (see fcr-formulas), and it
     is stated in words instead of implied by a highlight.
     `view` is kept as a constant so every downstream reference still reads. */
  const view = "ops";
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(null);
  const [cfgEdit, setCfgEdit] = useState(false);
  const [cfgDraft, setCfgDraft] = useState(DP_CFG_DEFAULT);

  useEffect(() => {
    (async () => {
      const [vR, cR, bR] = await Promise.all([kvGetResult(DP_KEY), kvGetResult(DP_CFG_KEY), kvGetResult(LB_KEY)]);
      if (!vR.ok || !cR.ok) { dpFailedRef.current = true; setDpLoadFailed(true); }
      if (vR.ok && Array.isArray(vR.value) && vR.value.length) { setMonths(vR.value); setSel(vR.value[vR.value.length - 1].id); }
      if (cR.ok && cR.value && typeof cR.value === "object") setCfg({ ...DP_CFG_DEFAULT, ...cR.value });
      /* ⚠️ Its own flag, NOT dpFailedRef. Folding it in would mean a benchmark
         read failing takes the daypart editors down with it, and the daypart
         table is the one that actually feeds the planner's budget. */
      if (!bR.ok) { lbFailedRef.current = true; setLbFailed(true); }
      else if (Array.isArray(bR.value)) setBenchRows(bR.value);
      // ⚠️ NO TIER READ HERE. It used to live in this effect and raced the prop
      // below — whichever settled last won, so the table could pin to a tier the
      // buttons weren't showing. `bench` has exactly ONE writer now.
    })();
  }, []);

  /* The only writer of `bench`. Re-derives whenever the Planner's tier changes. */
  useEffect(() => {
    if (!tierCfg) return;
    let t = null;
    try { t = activeTier(tierCfg); } catch { t = null; }
    if (!t) return;
    // fixedHours 0 is a legitimate setting, so test for null rather than falsy;
    // a marginalRate of 0 would divide by zero downstream and is ignored.
    if (t.fixedHours == null || !t.marginalRate) return;
    setBench({ fixed: t.fixedHours, marg: t.marginalRate, label: t.label || "Top 20%" });
  }, [tierCfg]);

  const rec = months.find((x) => x.id === sel) || months[months.length - 1] || EMPTY_DP;
  const latestId = months.length ? months.reduce((a, b) => (String(b.id) > String(a.id) ? b : a)).id : null;
  const stale = latestId && String(latestId) < dpNowYm();

  const m = useMemo(() => {
    const g = (o, dp, i) => num(o[dp] ? o[dp][i] : 0);
    const carries = (i) => i < 5;                      // DP_DOW is Mon..Sat, so i<5 = Mon-Fri
    // ★ ONE per-day figure for this whole console. Both the daypart rows and
    // the day-level table used to sum cfg[dp] — the four decorative buckets —
    // while the headline used the people list. That printed "Strip 160.00
    // hrs/wk" above a table showing −39.00 a day. Same source now.
    const perDayNonOp = (cfg.people && cfg.people.length)
      ? dpPeopleDay(cfg.people)
      : (num(cfg.Breakfast) + num(cfg.Lunch) + num(cfg.Afternoon) + num(cfg.Dinner));
    // The daypart ROWS still need a per-daypart split to strip. With a people
    // list there is no split to use, so the day's hours are apportioned across
    // the four dayparts BY THE HOURS ACTUALLY WORKED in each — which is closer
    // to the truth than the old fixed 12/13/11/3 ever was.
    const dpShare = (dp, i) => {
      const dayHrs = DP_ORDER.reduce((z, k) => z + g(rec.hours, k, i), 0);
      if (dayHrs <= 0) return 0;
      return perDayNonOp * (g(rec.hours, dp, i) / dayHrs);
    };
    const stripFor = (dp, i) => (!carries(i) ? 0
      : (cfg.people && cfg.people.length) ? dpShare(dp, i) : num(cfg[dp]));
    const rows = DP_ORDER.map((dp) => {
      let s = 0, hr = 0, op = 0;
      for (let i = 0; i < 6; i++) { s += g(rec.sales, dp, i); hr += g(rec.hours, dp, i); op += g(rec.hours, dp, i) - stripFor(dp, i); }
      return { dp, clocked: hr > 0 ? s / hr : 0, ops: op > 0 ? s / op : 0 };
    });
    const days = DP_DOW.map((d, i) => {
      let s = 0, clk = num(rec.late ? rec.late[i] : 0), nonOp = 0;
      DP_ORDER.forEach((dp) => {
        s += g(rec.sales, dp, i);
        clk += g(rec.hours, dp, i);
        nonOp += stripFor(dp, i);
      });
      const op = clk - nonOp;
      const b = bench.fixed + (bench.marg > 0 ? s / bench.marg : 0);
      return { d, clkHr: clk, nonOpHr: nonOp, opsHr: op, bench: b, gap: op - b, clkGap: clk - b };
    });
    const avg = (f) => (days.length ? days.reduce((a, x) => a + f(x), 0) / days.length : 0);
    const totSales = DP_ORDER.reduce((z, dp) => z + (rec.sales[dp] || []).reduce((a, b) => a + num(b), 0), 0);
    const totClk = DP_ORDER.reduce((z, dp) => z + (rec.hours[dp] || []).reduce((a, b) => a + num(b), 0), 0) + (rec.late || []).reduce((a, b) => a + num(b), 0);
    const nonOpWk = perDayNonOp * 5;
    const totOp = totClk - nonOpWk;
    const totBench = days.reduce((a, x) => a + x.bench, 0);
    const daysOver = days.filter((x) => x.gap > 0.5);
    const daysOverClk = days.filter((x) => x.clkGap > 0.5);
    const softest = [...rows].filter(r => r.ops > 0).sort((a, b) => a.ops - b.ops)[0] || rows[0];
    return {
      rows, days, nonOpWk,
      avgClk: avg((x) => x.clkHr), avgNonOp: avg((x) => x.nonOpHr), avgOps: avg((x) => x.opsHr),
      avgBench: avg((x) => x.bench), avgGap: avg((x) => x.gap), avgClkGap: avg((x) => x.clkGap),
      clockedProd: totClk > 0 ? totSales / totClk : 0,
      opsProd: totOp > 0 ? totSales / totOp : 0,
      top20Prod: totBench > 0 ? totSales / totBench : 0,
      daysOver: daysOver.map((x) => x.d), overHrs: daysOver.reduce((a, x) => a + x.gap, 0),
      daysOverClk: daysOverClk.map((x) => x.d), overHrsClk: daysOverClk.reduce((a, x) => a + x.clkGap, 0),
      softest,
    };
  }, [rec, cfg, bench]);

  const persist = async (next) => {
    if (dpFailedRef.current) return false; // banner explains
    const prev = months;
    setMonths(next);
    const ok = await kvSet(DP_KEY, next);
    if (ok === false) { setMonths(prev); setDpSaveWarn(true); return false; }
    setDpSaveWarn(false);
    if (onMonthsSaved) onMonthsSaved(next);
    return true;
  };
  const startNew = () => { setDraft(dpBlank(dpNowYm())); setEdit(true); };
  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(rec))); setEdit(true); };
  const cancel = () => { setEdit(false); setDraft(null); };
  const setCell = (kind, dp, i, v) => setDraft((d) => { const nd = { ...d, [kind]: { ...d[kind] } }; nd[kind][dp] = d[kind][dp].map((x, j) => (j === i ? v : x)); return nd; });
  const setLate = (i, v) => setDraft((d) => ({ ...d, late: d.late.map((x, j) => (j === i ? v : x)) }));
  const save = async () => {
    const id = (draft.id || "").trim() || (draft.label || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!id) { cancel(); return; }
    const co = (o) => Object.fromEntries(DP_ORDER.map((dp) => [dp, o[dp].map(num)]));
    const recNew = { id, label: draft.label || id, sales: co(draft.sales), hours: co(draft.hours), late: draft.late.map(num) };
    const i = months.findIndex((x) => x.id === id);
    const next = (i >= 0 ? months.map((x, j) => (j === i ? recNew : x)) : [...months, recNew]).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    // The editor only closes when the month really stored — a refused write
    // keeps the grid open with everything typed, ready to retry.
    if (await persist(next)) { setSel(id); cancel(); }
  };
  /* Paste import — the same button as every monthly. The file's own header
     said "importer TBD" since the day this card shipped; this is it. Writes
     through the SAME persist (rollback + dpFailedRef guard) the editor uses. */
  const importDaypart = async (text) => {
    if (dpFailedRef.current) return { ok: false, message: "The daypart record never loaded — the banner explains. Reopen the tile before importing." };
    const p = parseDaypartPaste(text);
    if (p.error) return { ok: false, message: p.error };
    const recNew = { id: p.ym, label: p.label, sales: p.sales, hours: p.hours, late: p.late };
    const i = months.findIndex((x) => x.id === p.ym);
    const next = (i >= 0 ? months.map((x, j) => (j === i ? recNew : x)) : [...months, recNew]).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const ok = await persist(next);
    if (ok) setSel(p.ym);
    return ok
      ? { ok: true, message: `Imported ${p.label} — ${i >= 0 ? "replaced that month's table" : "added as a new month"}.` }
      : { ok: false, message: "That did not save — check the wifi and try again." };
  };

  /* Labor Cost Opportunity import. Same shape as importDaypart above: refuse
     after a failed read, roll the screen back on a refused write, and say in
     plain words which of the two happened. The parser already rejected any
     block whose opportunity % does not equal wages minus benchmark, so nothing
     that reaches here can be internally inconsistent. */
  const importBench = async (text) => {
    if (lbFailedRef.current) return { ok: false, message: "The benchmark record never loaded. Refresh the page before importing." };
    const p = parseLaborBenchPaste(text);
    if (p.error) return { ok: false, message: p.error };
    const recNew = { id: p.ym, label: p.label, wagesPct: p.wagesPct, productivity: p.productivity, tiers: p.tiers };
    const i = benchRows.findIndex((x) => x && x.id === p.ym);
    const next = lbSorted(i >= 0 ? benchRows.map((x, j) => (j === i ? recNew : x)) : [...benchRows, recNew]);
    const prev = benchRows;
    setBenchRows(next);
    const ok = await kvSet(LB_KEY, next);
    if (ok === false) { setBenchRows(prev); return { ok: false, message: "That did not save — check the wifi and try again." }; }
    return { ok: true, message: `Imported ${p.label} — ${i >= 0 ? "replaced that month" : "added as a new month"}.` };
  };

  // Plain consts, not useMemo: this is a dozen rows of arithmetic on a list
  // that never exceeds a couple of years. A memo here would be ceremony.
  const lbNow = lbLatest(benchRows);
  const lbHead = lbTier(lbNow, LB_HEADLINE);
  const lbSeries = lbTrend(benchRows, LB_HEADLINE, LB_TREND_MONTHS);
  const openCfg = () => { setCfgDraft({ ...cfg }); setCfgEdit(true); };
  const saveCfg = async () => {
    // ⚠️ This used to save only the four daypart numbers, so the people list
    // would have been silently dropped on the first save.
    // Rows with no name AND no hours are discarded — an empty "+ Add a person"
    // left behind shouldn't persist. Hours are coerced here so a typed "8 " or
    // "" can never reach the arithmetic as a string.
    const people = (cfgDraft.people || [])
      .map((pp) => ({ id: pp.id || "np" + Math.random().toString(36).slice(2, 8),
        name: String(pp.name || "").trim(), hrsPerDay: num(pp.hrsPerDay) }))
      .filter((pp) => pp.name || pp.hrsPerDay);
    const c = {
      Breakfast: num(cfgDraft.Breakfast), Lunch: num(cfgDraft.Lunch),
      Afternoon: num(cfgDraft.Afternoon), Dinner: num(cfgDraft.Dinner),
      people,
      // Derived, never hand-typed — the sentence under the chart can't drift
      // away from the numbers it's describing.
      note: people.length ? dpNoteFrom(people) : (cfgDraft.note || ""),
    };
    if (dpFailedRef.current) return; // banner explains
    const prevCfg = cfg;
    setCfg(c);
    const ok = await kvSet(DP_CFG_KEY, c);
    if (ok === false) {
      // Editor stays open with the draft; the maths keeps the stored figures.
      setCfg(prevCfg);
      setDpSaveWarn(true);
      return;
    }
    setDpSaveWarn(false);
    setCfgEdit(false);
    // ★ The Planner's budget, board split and every day total ride on these
    // hours. Without this the day card kept the pre-edit figures until a full
    // reload — one screen saying one thing while the maths used another.
    if (onNonOpsSaved) onNonOpsSaved(c);
  };

  const nin = (val, on, w) => <input value={val} inputMode="decimal" onChange={(e) => on(e.target.value)} style={{ width: w || 46, textAlign: "center", fontSize: 13, padding: "5px 3px", border: `1.5px solid ${LINE}`, borderRadius: 6, boxSizing: "border-box" }} />;
  const gridHead = () => (<div style={{ display: "grid", gridTemplateColumns: "92px repeat(6, 1fr)", gap: 5, marginBottom: 4 }}><span /> {DP_DOW.map((d) => <span key={d} style={{ fontSize: 10, fontWeight: 700, color: GRAY, textAlign: "center" }}>{d}</span>)}</div>);
  const gridRows = (kind) => DP_ORDER.map((dp) => (
    <div key={dp} style={{ display: "grid", gridTemplateColumns: "92px repeat(6, 1fr)", gap: 5, marginBottom: 5, alignItems: "center" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{dp}</span>
      {DP_DOW.map((d, i) => <span key={d} style={{ textAlign: "center" }}>{nin(draft[kind][dp][i], (v) => setCell(kind, dp, i, v), "100%")}</span>)}
    </div>
  ));

  return (
    <div style={{ background: cardSurface(NAVY), border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, marginBottom: 12, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}`, boxShadow: CARD_3D }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ cursor: "pointer" }} onClick={() => setOpen(!open)}>
          {/* ⚠️ "Loading" RATHER THAN AN EMPTY TABLE. The months now arrive over
              the network, so there is a moment with no data. This card is read
              to make cut decisions, and a daypart table showing zeros for a beat
              is a wrong answer presented confidently — worse than a blank one.
              rec is EMPTY_DP until then, so nothing below crashes. */}
          <div style={{ fontWeight: 800, color: NAVY, fontSize: 15 }}>
            Daypart labor {"—"} {months.length ? rec.label : (dpLoadFailed ? "unavailable" : "loading…")}
          </div>
          <div style={{ fontSize: 11, color: GRAY, marginTop: 1 }}>Productivity by daypart, as-clocked vs non-ops stripped</div>
        </div>
        <span onClick={() => setOpen(!open)} style={{ fontSize: 13, fontWeight: 800, color: NAVY, cursor: "pointer" }}>{open ? "▾" : "▸"}</span>
      </div>

      {dpLoadFailed && (
        <div style={{ backgroundColor: "#FFFBEB", backgroundImage: cardSurface("#B45309", 0.4), border: "1.5px solid #F59E0B", ...accentEdge("#B45309", 3), boxShadow: CARD_3D_SOFT, color: "#92400E", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>
          Part of this console did not load, so its editors won't save — a save now
          would write the built-in defaults over the real lists, and the planner's
          budget rides on them. Check the wifi and refresh the page.
        </div>
      )}
      {!dpLoadFailed && dpSaveWarn && (
        <div style={{ backgroundColor: "#FEF2F2", backgroundImage: cardSurface("#DC2626", 0.4), border: "1.5px solid #DC2626", ...accentEdge("#DC2626", 3), boxShadow: CARD_3D_SOFT, color: "#991B1B", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>
          That change did not save — your typing is still in the editor. Check the
          wifi and hit Save again.
        </div>
      )}

      {/* Same reason as the title: show nothing rather than a table of zeros. */}
      {open && !months.length && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: GRAY, fontWeight: 600 }}>
          {dpLoadFailed
            ? "The daypart months could not be loaded, so this console is read-only. Check the wifi and refresh."
            : "Loading the daypart months…"}
        </div>
      )}

      {open && !!months.length && (
        <div style={{ marginTop: 12 }}>
          {/* controls */}
          {!edit && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ fontSize: 13, fontWeight: 600, color: INK, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 8, padding: "7px 10px" }}>
                {[...months].reverse().map((mo) => <option key={mo.id} value={mo.id}>{mo.label}</option>)}
              </select>
              <button onClick={startNew} style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: NAVY, border: "none", borderRadius: 9, padding: "8px 12px", cursor: "pointer" }}>+ Add month</button>
              <button onClick={startEdit} style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer" }}>✎ Edit</button>
              <button onClick={openCfg} style={{ fontSize: 12.5, fontWeight: 700, color: GRAY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer" }}>Non-ops</button>
              <button onClick={openOps} style={{ fontSize: 12.5, fontWeight: 700, color: GRAY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer" }}>Standing ops</button>
            </div>
          )}
          {!edit && (
            <div style={{ marginBottom: 12 }}>
              <PasteMonth buttonLabel="Paste a month" accent={NAVY}
                disabled={dpLoadFailed} disabledNote="Import is off — the record never loaded. Reopen the tile to retry."
                placeholder={"DAYPART " + dpNowYm() + "\nsales Breakfast | 4044 | 4337 | 4619 | 5054 | 5763 | 4065\nsales Lunch | …\nsales Afternoon | …\nsales Dinner | …\nhours Breakfast | …\nhours Lunch | …\nhours Afternoon | …\nhours Dinner | …\nlate | 0.2 | 0.2 | 0.9 | 0.2 | 0.1 | 0.3"}
                onImport={importDaypart} />
            </div>
          )}

          {/* monthly nudge */}
          {!edit && stale && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", ...notePanel(AMBER, "#E7D08A", "#FBF3DC"), borderRadius: 12, padding: "11px 14px", marginBottom: 12 }}>
              <div style={{ flex: "1 1 auto", minWidth: 170 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: AMBER }}>New month {"—"} add {dpMonthLabel(dpNowYm())} daypart labor</div>
                <div style={{ fontSize: 11.5, color: GRAY, marginTop: 2 }}>Latest on file is {dpMonthLabel(latestId)}. Pull the CFA Signal Labor Productivity table and drop it in.</div>
              </div>
              <button onClick={startNew} style={{ background: AMBER, color: "#fff", border: "none", borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add {dpMonthLabel(dpNowYm()).split(" ")[0]}</button>
            </div>
          )}

          {/* ── LABOR COST OPPORTUNITY ────────────────────────────────────
              What the TIR Overview says we are leaving on the table against
              the Top 20%. Sits under the daypart console because it answers
              the same question the console asks, just from the outside. */}
          {!edit && (
            <div style={{ border: `1px solid ${LINE}`, ...accentEdge(NAVY, 3), boxShadow: CARD_3D, borderRadius: 12, padding: "13px 14px", marginBottom: 12, backgroundColor: "#fff", backgroundImage: cardSurface(NAVY, 0.5) }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: NAVY }}>Labor Cost Opportunity</div>
                <div style={{ fontSize: 11, color: GRAY }}>
                  {lbNow ? `${lbNow.label} · vs Top 20%` : "TIR Overview · monthly"}
                </div>
              </div>

              {lbFailed && (
                <div style={{ ...notePanel("#B45309", "#F59E0B", "#FFFBEB"), color: "#92400E", borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                  This did not load, so importing is off. Refresh the page.
                </div>
              )}

              {!lbNow && !lbFailed && (
                <div style={{ fontSize: 12.5, color: GRAY, marginBottom: 10, lineHeight: 1.5 }}>
                  Nothing entered yet. Open the TIR Overview, go to Labor Cost
                  Opportunity, and paste one block per month. Each benchmark page
                  carries the same wages and productivity figure, so one paste
                  covers all four.
                </div>
              )}

              {lbHead && (
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: lbHead.oppPct > 0 ? RED : GREEN, lineHeight: 1.1 }}>
                      {fmt$(lbHead.oppDollars)}
                    </div>
                    <div style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>
                      {lbPct(lbHead.oppPct)} of sales · {Number(lbHead.oppHours || 0).toFixed(1)} hrs a day
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: INK, lineHeight: 1.6 }}>
                    We pay <strong>{lbPct(lbNow.wagesPct)}</strong> of sales in wages.<br />
                    The Top 20% pay <strong>{lbPct(lbHead.benchPct)}</strong>.
                  </div>
                  {Number.isFinite(lbNow.productivity) && (
                    <div style={{ fontSize: 12, color: GRAY, lineHeight: 1.6 }}>
                      Productivity<br /><strong style={{ color: INK, fontSize: 14 }}>{fmt$(lbNow.productivity)}</strong>
                    </div>
                  )}
                </div>
              )}

              {lbNow && (
                <div style={{ overflowX: "auto", marginBottom: 10 }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: 380, width: "100%" }}>
                    <thead>
                      <tr style={{ color: GRAY, textAlign: "right" }}>
                        <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 700 }}>Benchmark</th>
                        <th style={{ padding: "4px 6px", fontWeight: 700 }}>They pay</th>
                        <th style={{ padding: "4px 6px", fontWeight: 700 }}>Gap</th>
                        <th style={{ padding: "4px 6px", fontWeight: 700 }}>Dollars</th>
                        <th style={{ padding: "4px 6px", fontWeight: 700 }}>Hrs/day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LB_TIER_ORDER.map((t) => {
                        const row = lbTier(lbNow, t);
                        const on = t === LB_HEADLINE;
                        return (
                          <tr key={t} style={{ borderTop: `1px solid ${LINE}`, background: on ? BG : "transparent", textAlign: "right" }}>
                            <td style={{ textAlign: "left", padding: "5px 6px", fontWeight: on ? 800 : 600, color: on ? NAVY : INK }}>Top {t}%</td>
                            <td style={{ padding: "5px 6px" }}>{row ? lbPct(row.benchPct) : "—"}</td>
                            <td style={{ padding: "5px 6px", fontWeight: 700, color: row ? (row.oppPct > 0 ? RED : GREEN) : GRAY }}>{row ? lbPct(row.oppPct) : "—"}</td>
                            <td style={{ padding: "5px 6px" }}>{row ? fmt$(row.oppDollars) : "—"}</td>
                            <td style={{ padding: "5px 6px" }}>{row ? Number(row.oppHours || 0).toFixed(1) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {lbSeries.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: GRAY, textTransform: "uppercase", marginBottom: 5 }}>
                    Top 20% gap, last {lbSeries.length} months
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {lbSeries.map((p) => (
                      <div key={p.id} style={{ fontSize: 11, color: GRAY, whiteSpace: "nowrap" }}>
                        {String(p.label).split(" ")[0].slice(0, 3)}{" "}
                        <strong style={{ color: p.pct > 0 ? RED : GREEN, fontSize: 12 }}>{lbPct(p.pct)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <PasteMonth buttonLabel="Paste the benchmark" accent={NAVY}
                disabled={lbFailed} disabledNote="Import is off — the record never loaded. Refresh to retry."
                placeholder={"LABORBENCH " + dpNowYm() + "\nwages | 22.37\nproductivity | 79.09\ntop 10 | 19.56 | 2.81 | 23137 | 48.58\ntop 20 | 20.24 | 2.13 | 17495 | 36.74\ntop 33 | 20.89 | 1.48 | 12173 | 25.56\ntop 50 | 21.47 | 0.90 | 7392 | 15.52"}
                onImport={importBench} />
            </div>
          )}

          {/* standing-ops settings */}
          {opsEdit && (
            <div style={{ ...notePanel(NAVY, LINE, BG), borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 2 }}>Standing operational hours per person, per weekday (Mon–Fri)</div>
              <div style={{ fontSize: 11, color: GRAY, marginBottom: 8 }}>
                People who work operations but are never scheduled on the board. These hours ARE counted
                in productivity — they are the work. They are added to the day total and taken out of what
                the board can spend, so the cut figure is the real one.
              </div>
              {/* ⚠️ value captured before the updater, same as the non-ops panel. */}
              {(opsDraft.people || []).map((pp, i) => (
                <div key={pp.id || i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input value={pp.name || ""} placeholder="Name"
                    onChange={(e) => { const v = e.target.value; setOpsDraft((d) => { const ps = (d.people || []).slice(); ps[i] = { ...ps[i], name: v }; return { ...d, people: ps }; }); }}
                    style={{ flex: "1 1 120px", fontSize: 12, padding: "6px 8px", border: `1.5px solid ${LINE}`, borderRadius: 6, boxSizing: "border-box" }} />
                  <input value={pp.hrsPerDay ?? ""} inputMode="decimal" placeholder="hrs"
                    onChange={(e) => { const v = e.target.value; setOpsDraft((d) => { const ps = (d.people || []).slice(); ps[i] = { ...ps[i], hrsPerDay: v }; return { ...d, people: ps }; }); }}
                    style={{ width: 66, fontSize: 12, padding: "6px 8px", border: `1.5px solid ${LINE}`, borderRadius: 6, boxSizing: "border-box", textAlign: "center" }} />
                  <span style={{ fontSize: 11, color: GRAY, width: 62 }}>{((Number(pp.hrsPerDay) || 0) * 5).toFixed(0)}/wk</span>
                  <button onClick={() => setOpsDraft((d) => ({ ...d, people: (d.people || []).filter((_, k) => k !== i) }))}
                    style={{ fontSize: 11, fontWeight: 700, color: RED, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 6, padding: "5px 9px", cursor: "pointer" }}>Remove</button>
                </div>
              ))}
              <button onClick={() => setOpsDraft((d) => ({ ...d, people: [...(d.people || []), { id: "so" + Date.now(), name: "", hrsPerDay: "" }] }))}
                style={{ fontSize: 11.5, fontWeight: 700, color: GRAY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", marginTop: 2 }}>+ Add a person</button>
              <div style={{ fontSize: 12, color: NAVY, fontWeight: 700, marginTop: 10 }}>
                {dpPeopleDay(opsDraft.people).toFixed(1)} hrs/weekday · <b>{(dpPeopleDay(opsDraft.people) * 5).toFixed(1)} hrs/week</b> counted
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={saveOps} style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: GREEN, border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer" }}>Save standing ops</button>
                <button onClick={() => setOpsEdit(false)} style={{ fontSize: 12.5, fontWeight: 700, color: GRAY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 8, padding: "7px 13px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* non-ops settings */}
          {cfgEdit && (
            <div style={{ ...notePanel(NAVY, LINE, BG), borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 2 }}>Non-op hours per person, per weekday (Mon–Fri)</div>
              <div style={{ fontSize: 11, color: GRAY, marginBottom: 8 }}>
                These hours are stripped out before the operational $/hr is worked out. Anyone salaried or off the floor belongs here.
              </div>
              {/* ⚠️ Every onChange below captures e.target.value BEFORE calling the
                  updater. Reading it inside the updater throws once React runs that
                  updater after the event is recycled — it broke Bri's prep-work
                  field the same way. */}
              {(cfgDraft.people || []).map((pp, i) => (
                <div key={pp.id || i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input value={pp.name || ""} placeholder="Name"
                    onChange={(e) => { const v = e.target.value; setCfgDraft((d) => { const ps = (d.people || []).slice(); ps[i] = { ...ps[i], name: v }; return { ...d, people: ps }; }); }}
                    style={{ flex: "1 1 120px", fontSize: 12, padding: "6px 8px", border: `1.5px solid ${LINE}`, borderRadius: 6, boxSizing: "border-box" }} />
                  <input value={pp.hrsPerDay ?? ""} inputMode="decimal" placeholder="hrs"
                    onChange={(e) => { const v = e.target.value; setCfgDraft((d) => { const ps = (d.people || []).slice(); ps[i] = { ...ps[i], hrsPerDay: v }; return { ...d, people: ps }; }); }}
                    style={{ width: 66, fontSize: 12, padding: "6px 8px", border: `1.5px solid ${LINE}`, borderRadius: 6, boxSizing: "border-box", textAlign: "center" }} />
                  <span style={{ fontSize: 11, color: GRAY, width: 62 }}>{((Number(pp.hrsPerDay) || 0) * 5).toFixed(0)}/wk</span>
                  <button onClick={() => setCfgDraft((d) => ({ ...d, people: (d.people || []).filter((_, k) => k !== i) }))}
                    style={{ fontSize: 11, fontWeight: 700, color: RED, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 6, padding: "5px 9px", cursor: "pointer" }}>Remove</button>
                </div>
              ))}
              <button onClick={() => setCfgDraft((d) => ({ ...d, people: [...(d.people || []), { id: "np" + Date.now(), name: "", hrsPerDay: "" }] }))}
                style={{ fontSize: 11.5, fontWeight: 700, color: GRAY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", marginTop: 2 }}>+ Add a person</button>
              <div style={{ fontSize: 12, color: NAVY, fontWeight: 700, marginTop: 10 }}>
                {dpPeopleDay(cfgDraft.people).toFixed(1)} hrs/weekday · <b>{(dpPeopleDay(cfgDraft.people) * 5).toFixed(1)} hrs/week</b> stripped
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={saveCfg} style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: GREEN, border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer" }}>Save non-ops</button>
                <button onClick={() => setCfgEdit(false)} style={{ fontSize: 12.5, fontWeight: 700, color: GRAY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 8, padding: "7px 13px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* EDITOR */}
          {edit && draft ? (
            <div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div><div style={{ fontSize: 10, fontWeight: 700, color: GRAY, textTransform: "uppercase" }}>Month label</div><input value={draft.label} onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, label: v })); }} style={{ width: 160, fontSize: 13, padding: "7px 9px", border: `1.5px solid ${LINE}`, borderRadius: 8 }} placeholder="August 2026" /></div>
                <div><div style={{ fontSize: 10, fontWeight: 700, color: GRAY, textTransform: "uppercase" }}>Key (id)</div><input value={draft.id} onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, id: v })); }} style={{ width: 110, fontSize: 13, padding: "7px 9px", border: `1.5px solid ${LINE}`, borderRadius: 8 }} placeholder="2026-08" /></div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 420 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, margin: "4px 0 6px" }}>Sales $ (Mon–Sat)</div>
                  {gridHead()}{gridRows("sales")}
                  <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, margin: "14px 0 6px" }}>Timekeeping hours (Mon–Sat)</div>
                  {gridHead()}{gridRows("hours")}
                  <div style={{ display: "grid", gridTemplateColumns: "92px repeat(6, 1fr)", gap: 5, marginTop: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GRAY }}>Latenight</span>
                    {DP_DOW.map((d, i) => <span key={d} style={{ textAlign: "center" }}>{nin(draft.late[i], (v) => setLate(i, v), "100%")}</span>)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: GRAY, margin: "10px 0" }}>From the CFA Signal Labor Productivity table (day-of-week averages). Sunday is closed — omit. Leave blanks as 0.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={save} style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: GREEN, border: "none", borderRadius: 9, padding: "9px 15px", cursor: "pointer" }}>✓ Save month</button>
                <button onClick={cancel} style={{ fontSize: 13, fontWeight: 700, color: GRAY, background: "#fff", border: `1.5px solid ${LINE}`, borderRadius: 9, padding: "9px 15px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {/* ONE number, one comparison, one footnote. */}
              {(() => {
                /* Same correction as the table: the Top 20% line is an
                   ALL-PAID benchmark, so the honest comparison is every paid
                   hour. The floor figure is kept below as the diagnostic it is. */
                const over = m.clockedProd >= m.top20Prod;
                const diff = Math.abs(m.clockedProd - m.top20Prod);
                return (
                  <div style={{ ...notePanel(NAVY, LINE, BG), borderRadius: 12, padding: "14px 15px", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: NAVY, letterSpacing: "-0.5px" }}>
                        ${m.clockedProd.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>per paid labor hour</span>
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, color: INK }}>
                      {bench.label} line is <b>${m.top20Prod.toFixed(2)}</b> —{" "}
                      <b style={{ color: over ? GREEN : RED }}>
                        {over ? `+$${diff.toFixed(2)} over` : `−$${diff.toFixed(2)} under`}
                      </b>
                    </div>
                    <div style={{ fontSize: 11.5, color: GRAY, marginTop: 6, lineHeight: 1.5 }}>
                      Every paid hour, because that is what the {bench.label} benchmark counts — same basis as the
                      Planner above. Strip the {fmtH(m.nonOpWk)} non-op hrs/wk
                      ({(cfg.people && cfg.people.length) ? dpNoteFrom(cfg.people) : cfg.note}) and the floor alone
                      runs <b>${m.opsProd.toFixed(2)}/hr</b> — a useful diagnostic, but not the number the target is set against.
                    </div>
                  </div>
                );
              })()}

              {/* bars */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "0 4px 4px" }}>
                {m.rows.map((r) => (
                  <div key={r.dp} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", justifyContent: "center", height: 118 }}>
                      <DpBar val={r.clocked} color={GRAY} /><DpBar val={r.ops} color={NAVY} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, color: INK }}>{r.dp}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", fontSize: 11, color: GRAY, margin: "8px 0 14px" }}>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: GRAY, borderRadius: 2, marginRight: 4 }} />As clocked</span>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: NAVY, borderRadius: 2, marginRight: 4 }} />Operational</span>
                <span style={{ color: INK }}>$/labor-hr</span>
              </div>

              {/* day-level table */}
              {(() => {
                /* One table, both bases side by side, so the daily difference is
                   readable without switching. The TOGGLE decides which basis the
                   Gap column measures — ops (the goal basis) or every clocked hour. */
                /* ★★ JUL 26 — THE GAP IS NOW CLOCKED vs BENCHMARK, NOT OPS.
                   `bench` here is the SAME tier formula the Planner budgets from,
                   and Matt confirmed CFA's benchmark hours count ALL PAID HOURS.
                   So measuring OPERATIONAL hours against it was the identical
                   basis mismatch fixed in the day card earlier today, still live
                   one card down: Monday read +9.96 (343.70 ops vs 333.74) when
                   like-for-like it is +41.96 (375.70 clocked vs 333.74), and the
                   week read ~72.66 h over instead of ~232.
                   Matt: "I want consistency so fix."
                   The Ops hrs column STAYS — it is the floor-productivity view
                   and it is useful — but it no longer decides the Gap. */
                const onClk = true;
                const gapOf = (x) => x.clkGap;
                const avgGap = m.avgClkGap;
                const overNow = m.daysOverClk;
                const overHrsNow = m.overHrsClk;
                const hd = { padding: "5px 6px", fontWeight: 700, borderBottom: `1px solid ${LINE}` };
                const td = { padding: "5px 6px", textAlign: "right", borderBottom: `1px solid ${LINE}` };
                const hot = (on) => ({ background: on ? "#EAF0F6" : "transparent", fontWeight: on ? 800 : 400, color: on ? INK : GRAY });
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>Day-level vs {bench.label}</div>
                      <div style={{ fontSize: 11, color: GRAY }}>gap measured on every paid hour</div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead><tr style={{ textAlign: "right", color: GRAY, fontSize: 11 }}>
                        <th style={{ ...hd, textAlign: "left" }}>Day</th>
                        <th style={{ ...hd, ...hot(onClk) }}>Clocked</th>
                        <th style={hd}>Non-op</th>
                        <th style={{ ...hd, ...hot(!onClk) }}>Ops hrs</th>
                        <th style={hd}>{bench.label}</th>
                        <th style={hd}>Gap</th>
                      </tr></thead>
                      <tbody>
                        {m.days.map((x) => { const g2 = gapOf(x); const isOver = g2 > 0.5; return (
                          <tr key={x.d} style={{ background: isOver ? "#FDE2E2" : "transparent" }}>
                            <td style={{ ...td, textAlign: "left", fontWeight: 700, color: INK }}>{x.d}</td>
                            <td style={{ ...td, ...hot(onClk), background: isOver ? "transparent" : hot(onClk).background }}>{fmtH(x.clkHr)}</td>
                            <td style={{ ...td, color: GRAY }}>{x.nonOpHr > 0 ? `−${fmtH(x.nonOpHr)}` : fmtH(0)}</td>
                            <td style={{ ...td, ...hot(!onClk), background: isOver ? "transparent" : hot(!onClk).background }}>{fmtH(x.opsHr)}</td>
                            <td style={{ ...td, color: GRAY }}>{fmtH(x.bench)}</td>
                            <td style={{ ...td, fontWeight: 800, color: isOver ? "#8A1220" : GREEN }}>{g2 > 0 ? `+${fmtH(g2)}` : fmtH(g2)}</td>
                          </tr>); })}
                        <tr>
                          <td style={{ ...td, textAlign: "left", fontWeight: 800, color: NAVY, borderBottom: "none" }}>Avg/day</td>
                          <td style={{ ...td, ...hot(onClk), borderBottom: "none" }}>{fmtH(m.avgClk)}</td>
                          <td style={{ ...td, color: GRAY, borderBottom: "none" }}>{m.avgNonOp > 0 ? `−${fmtH(m.avgNonOp)}` : fmtH(0)}</td>
                          <td style={{ ...td, ...hot(!onClk), borderBottom: "none" }}>{fmtH(m.avgOps)}</td>
                          <td style={{ ...td, color: GRAY, borderBottom: "none" }}>{fmtH(m.avgBench)}</td>
                          <td style={{ ...td, fontWeight: 800, color: avgGap > 0.5 ? "#8A1220" : GREEN, borderBottom: "none" }}>{avgGap > 0 ? `+${fmtH(avgGap)}` : fmtH(avgGap)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ fontSize: 11.5, color: GRAY, marginTop: 8 }}>
                      Average day carries <b style={{ color: INK }}>{fmtH(m.avgNonOp)}</b> non-op hrs {"—"} {fmtH(m.avgClk)} clocked vs {fmtH(m.avgOps)} operational.{" "}
                      {overNow.length
                        ? <>Over the line on <b style={{ color: "#8A1220" }}>{overNow.join(", ")}</b> (~{fmtH(overHrsNow)} paid hrs). Softest daypart this month: <b>{m.softest.dp}</b> at ${m.softest.ops.toFixed(0)}/hr {"—"} a MONTHLY average on operational hours, so it reads higher than the same daypart on a single day&rsquo;s board hours in the Planner above. Neither is wrong; they answer different questions.</>
                        : <>No day over the {bench.label} line on this basis.</>}
                      {" "}Benchmark = live {bench.label} tier ({fmtH(bench.fixed)} fixed + sales ÷ ${bench.marg}); re-fit it in Targets &amp; settings and this moves with it.
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================ */
export default function LaborPlanner() {
  const [ym, setYm] = useState(ymOf(new Date()));
  const [rec, setRec] = useState(null);
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [tierCfg, setTierCfg] = useState(null);
  const [wagePlan, setWagePlan] = useState({ wage: DEFAULT_CONFIG.wage, source: "default" });
  const [sales, setSales] = useState(null);
  /* null = not enough sales data. The screen must SAY so rather than fall back
     to a percentage — falling back is how the hardcoded 70 became believable. */
  const [dtMix, setDtMix] = useState(null);
  const [wkAvg, setWkAvg] = useState({});
  const [selected, setSelected] = useState(null);
  /* ★ CARRY-FORWARD SOURCE (Matt, Jul 31: "i still want the labor to carry over
     for july to Aug and use the last week of july as the base for aug. it saves
     inputting evry single day of the month.") The PREVIOUS month's plan record,
     loaded alongside everything else. A failed read leaves it null, which only
     hides the offer — it can never corrupt anything, so this read stays
     best-effort while the month's own record keeps its strict result path. */
  const [prevPlan, setPrevPlan] = useState(null);
  const [carryMsg, setCarryMsg] = useState("");
  // The SAME non-ops config the daypart console edits (gcfcr-daypart-nonops-v1),
  // so the standing salaried hours are written down once and read in both places
  // rather than typed twice and drifting.
  const [nonOpCfg, setNonOpCfg] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try { const c = await kvGet(DP_CFG_KEY); if (live && c && typeof c === "object") setNonOpCfg(c); }
      catch { /* the field just falls back to a plain 0 placeholder */ }
    })();
    return () => { live = false; };
  }, []);

  /* ⚠️ DEFAULTS TO THE SEEDED LIST, NOT TO NULL. Non-ops falls back to a typed
     field when nothing is stored; standing ops has no typed field to fall back
     to, so a null would silently drop the hours back out of the day total and
     re-create the exact understatement this exists to fix. */
  const [opsCfg, setOpsCfg] = useState(OPS_CFG_DEFAULT);
  useEffect(() => {
    let live = true;
    (async () => {
      try { const c = await kvGet(OPS_CFG_KEY); if (live && c && typeof c === "object") setOpsCfg(c); }
      catch { /* the seeded default stands */ }
    })();
    return () => { live = false; };
  }, []);
  // ⚠️ MON–FRI ONLY. Hannah specified all four people as Monday to Friday, so a
  // weekend day derives 0 — NOT the weekday figure. If someone is genuinely
  // non-ops at a weekend that belongs in the config as its own answer, not as an
  // assumption made here.
  /* The CFA Signal daypart table. STRUCTURALLY ALWAYS ONE MONTH BEHIND — Signal
     only publishes a month after it closes, so the newest record on file is the
     right one to use and is never "stale". Labelled as a basis on screen, not as
     a warning. */
  const [dpMonths, setDpMonths] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      /* ⚠️ FALL BACK TO THE SEED, exactly as the daypart console does. If the
         table has never been saved to KV the console still shows the seeded
         month — so leaving this null made the block silently absent while the
         console right below it looked populated. Same source, same fallback, or
         the two disagree about whether data exists.
         ⚠️ THE SEED IS NOW A FETCH, so this awaits it rather than reading a
         const. Same memoised promise the console uses, so the two can never
         disagree and it costs one request, not two. A seed that cannot be read
         leaves this null, which is the pre-existing "block absent" state and is
         honest — it does NOT invent zeros. */
      try {
        const v = await kvGet(DP_KEY);
        if (Array.isArray(v) && v.length) { if (live) setDpMonths(v); return; }
      } catch { /* fall through to the seed */ }
      const seeded = await loadDpSeed();
      if (live && seeded) setDpMonths(seeded);
    })();
    return () => { live = false; };
  }, []);

  /* Mon–Fri, same rule and same reason as non-ops: a weekend day derives 0
     rather than the weekday figure. If someone genuinely works standing ops
     hours at a weekend that belongs in the list as its own answer. */
  // Same rule the dashboard card uses — see stdOpsForIso.
  const stdOps = (iso) => stdOpsForIso(iso, opsCfg && opsCfg.people);

  const stdNonOp = (iso) => {
    const people = nonOpCfg && nonOpCfg.people;
    if (!people || !people.length || !iso) return null;
    const [y, m, d] = String(iso).split("-").map(Number);
    const dow = new Date(y, (m || 1) - 1, d || 1).getDay();   // 0 Sun … 6 Sat
    if (dow === 0 || dow === 6) return 0;
    return dpPeopleDay(people);
  };
  const [showCfg, setShowCfg] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [cfgDraft, setCfgDraft] = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const cleanNum = (raw) => {
    let v = String(raw).replace(/[^0-9.]/g, "");
    const i = v.indexOf(".");
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
    return v;
  };
  const [saveState, setSaveState] = useState("idle");
  // true = the plan, config, or tier read FAILED (not "empty") — every write
  // path refuses, because saving defaults over records we never saw destroys
  // the month's plan, the FOH/BOH split config, or the tier the goal rides on.
  const [loadFailed, setLoadFailed] = useState(false);
  const saveTimer = useRef(null);

  /* ---- load everything on month change ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [pR, cR, tcR, s, a, b, prevP] = await Promise.all([
        kvGetResult(plannerKey(ym)),
        kvGetResult(CONFIG_KEY),
        loadTierConfigResult(),
        loadSalesMonth(ym),
        loadSalesMonth(shiftMonth(ym, -1)),
        loadSalesMonth(shiftMonth(ym, -2)),
        kvGet(plannerKey(shiftMonth(ym, -1))).catch(() => null),
      ]);
      if (!alive) return;
      setLoadFailed(!pR.ok || !cR.ok || !tcR.ok);
      setPrevPlan(prevP);
      setCarryMsg("");
      const p = pR.ok ? pR.value : null;
      const tc = tcR.cfg;
      const mc = mergeCfg(cR.ok ? cR.value : null);
      const plan = await resolvePlannedWage(ym, mc, tc);
      if (!alive) return;
      setRec(p || { version: 1, month: ym, days: {} });
      setCfg(mc);
      setTierCfg(tc);
      setWagePlan(plan);
      setSales(s);
      setWkAvg(weekdayTwoMonthAvg(a, b));
      /* ★ THE REAL DRIVE THRU SHARE (Matt, Aug 5 2026: "you actually said
         earlier to use the real sales data to decide", then "do the planner
         split").
         Trailing four weeks across whichever months they fall in — the two
         previous months are ALREADY loaded here for the weekday averages, so
         this costs no extra read. */
      setDtMix(dtShareOfFoh(trailingDays([s, a, b], 28)));
      const days = businessDaysOf(ym);
      const pbd = prevBusinessDay();
      setSelected(days.includes(pbd) ? pbd : days[0]);
    })();
    return () => { alive = false; };
  }, [ym]);

  const tier = tierCfg ? activeTier(tierCfg) : null;
  const wage = wagePlan.wage;

  /* ---- persist (debounced) ---- */
  const persist = (next) => {
    // Refuse before the optimistic update — with the month unloaded, even the
    // typed digit must not appear.
    if (loadFailed) { setSaveState("error"); return; }
    setRec(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // kvSet returns false on a refused write, never throws — the old catch
      // was unreachable, so "error" had never once shown.
      const ok = await kvSet(plannerKey(ym), next);
      setSaveState(ok ? "saved" : "error");
      setTimeout(() => setSaveState("idle"), 2000);
    }, 600);
  };
  const setDayField = (iso, field, raw) => {
    let v = String(raw).replace(/[^0-9.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    /* ⚠️ TYPING OVER A PUSHED NUMBER CLEARS THE MARK. Without this the day
       would still read "from the Schedule" while showing a hand-typed figure,
       which is worse than no label at all — the label is only worth having if
       it can be trusted. Only the two hour fields carry the mark. */
    const day = { ...(rec.days[iso] || {}), [field]: v };
    if (field === "foh" || field === "boh") { delete day.hoursFrom; delete day.hoursAt; }
    persist({ ...rec, days: { ...rec.days, [iso]: day } });
  };
  const saveCfg = async (next) => {
    if (loadFailed) { setSaveState("error"); return; }
    setCfg(next);
    if (!(await kvSet(CONFIG_KEY, next))) setSaveState("error");
  };
  const saveTiers = async (next) => {
    if (loadFailed) { setSaveState("error"); return; }
    setTierCfg(next);
    // saveTierConfig passes kvSet's boolean through — false = not written.
    if (!(await saveTierConfig(next))) setSaveState("error");
    // Unawaited on purpose — the tier must save even if the publish can't run.
    republishLaborRow(ym);
  };

  /* ---- per-day compute ---- */
  const days = useMemo(() => businessDaysOf(ym), [ym]);
  const compute = (iso) => {
    const d = rec?.days?.[iso] || {};
    const dow = fromIso(iso).getDay();
    const forecastDefault = wkAvg[dow] || 0;
    const forecast = d.forecast !== undefined && d.forecast !== "" ? num(d.forecast) : forecastDefault;
    /* ⚠️ DECLARED BEFORE BOTH USES. It was originally below `budget`, which
       would have been a temporal dead zone the moment budget started reading
       it — the exact class of bug the tdz check exists for.
       The measured mix wins; the setting is the fallback used only when there
       is not enough sales data to work one out. */
    const dtShare = dtMix && Number.isFinite(dtMix.share) ? dtMix.share : cfg.dtPct;
    const targetDefault = tier ? (dayProductivityTarget(tier, forecast) || 0) : 0;
    const target = d.target !== undefined && d.target !== "" ? num(d.target) : targetDefault;
    const customTarget = d.target !== undefined && d.target !== "" && num(d.target) !== targetDefault;
    const customForecast = d.forecast !== undefined && d.forecast !== "" && num(d.forecast) !== Math.round(forecastDefault);
    /* ⚠️ THE SAME SHARE THE BOARD USES, PASSED EXPLICITLY. These two sat next
       to each other computing DT from different numbers the moment the board
       started using the real mix — the all-paid budget on the setting, the
       board pot on sales. One screen quoting two Drive Thru splits is the
       drift this codebase keeps paying for. */
    const budget = dayBudget(forecast, target, cfg, dtShare);
    const foh = num(d.foh), boh = num(d.boh);
    // ⚠️ MUST match the locked cell. Reading d.nonOp here while the field shows
    // the standing figure would print one number and add a different one to the
    // day total — the exact conflict locking the cell was meant to remove.
    const stdN = stdNonOp(iso);
    const nonOp = stdN == null ? num(d.nonOp) : stdN;
    /* ★ JULY 26 2026 — NON-OP IS NOW INSIDE THE DAY TOTAL.
       `budget.total` is forecast ÷ tier target, and the CFA tier benchmark
       counts ALL PAID HOURS — salaried and off-floor time included. Measuring
       FOH + BOH alone against it understated every weekday by the standing
       non-op load: a 347 h budget carries ~32 h of non-op capacity, the board
       gets scheduled to ~347 on its own, and 32 h/weekday went over budget
       invisibly. Across July that is 736 h ≈ $12.9K, which is the gap between
       this page's "$2,471 vs budget" and the dashboard's "$15,530 over".
       ⚠️ IT HID ON SATURDAYS, where non-op is 0 and the two figures are
       identical — every spot-check happened to be a Saturday.
       `monthLaborCard`'s dowAvgOver already counted non-op (Matt, Jul 24:
       "non ops needs accounted for"); this brings the day card into line. */
    /* ⚠️ `ops` joins the day total for the same reason non-op did: the CFA tier
       benchmark counts ALL PAID HOURS. These are paid and worked. Leaving them
       out understated every weekday by a full-time person. */
    const ops = stdOps(iso);
    const schedOp = foh + boh + nonOp + ops;
    /* What is actually schedulable on the board once the standing non-op load
       comes out of the all-paid budget. The FOH and BOH inputs are measured
       against THIS, while the day total above stays all-paid — otherwise the
       non-op hours would be asked for twice. */
    /* …and comes OUT of what the board can spend, again like non-op: these
       hours consume budget but are not available to schedule against. That is
       what makes FOH/BOH's "hrs to cut" tell the truth. */
    const boardTotal = Math.max(0, budget.total - nonOp - ops);
    const boardBoh = boardTotal * cfg.bohPct;
    const boardFoh = boardTotal - boardBoh;
    const board = { total: boardTotal, boh: boardBoh, foh: boardFoh,
      dt: boardFoh * dtShare, fc: boardFoh * (1 - dtShare) };
    const actual = sales?.days?.[iso] ? dayTotal(sales.days[iso]) : 0;
    const prodActual = schedOp > 0 && actual > 0 ? actual / schedOp : null;
    return {
      d, dow, forecast, target, targetDefault, customTarget, customForecast, budget, board,
      foh, boh, nonOp, ops, schedOp, actual, prodActual,
      fohVar: foh - board.foh, bohVar: boh - board.boh, totVar: schedOp - budget.total,
      dollarVar: (schedOp - budget.total) * wage,
      fpBudget: forecast * cfg.fpPct, fpNeeded: actual * cfg.fpPct,
      entered: d.foh !== undefined || d.boh !== undefined,
    };
  };
  const computed = useMemo(() => {
    const m = {}; days.forEach((iso) => (m[iso] = compute(iso))); return m;
    // nonOpCfg IS a dependency now — it loads a moment after mount, and without
    // it here every day total would keep the pre-load value (non-ops treated as
    // whatever was typed) until something else happened to invalidate the memo.
  }, [days, rec, cfg, tier, wage, sales, wkAvg, nonOpCfg, opsCfg]); // eslint-disable-line

  /* ── CARRY LAST MONTH FORWARD ─────────────────────────────────────────
     Matt, Jul 31: "i still want the labor to carry over for july to Aug and use
     the last week of july as the base for aug. it saves inputting evry single
     day of the month."

     The base is PER WEEKDAY: for each of Mon–Sat, the LAST day of the previous
     month with typed FOH/BOH hours. For a fully planned July that is literally
     his last week — Mon–Fri from Jul 27–31 and Saturday from Jul 25, because
     the last calendar week has no Saturday in it. A weekday he never planned
     contributes nothing rather than a zero.

     ⚠️ ONLY foh/boh CARRY. Forecast auto-derives from the 2-month weekday sales
     average (which now includes the month being copied), target derives from
     the tier, and non-op/ops derive from the standing config — copying any of
     those would freeze a derived number at last month's value.

     ⚠️ NEVER OVERWRITES A TYPED DAY. The fill covers only days with no typed
     hours, so tapping it after hand-planning a few days completes the month
     around them instead of replacing them. */
  const prevYm = shiftMonth(ym, -1);
  const carryBase = useMemo(() => {
    const src = prevPlan && prevPlan.days;
    if (!src) return null;
    const base = {};
    Object.keys(src).sort().forEach((iso) => {
      const d = src[iso] || {};
      const has = (d.foh !== undefined && d.foh !== "") || (d.boh !== undefined && d.boh !== "");
      if (!has) return;
      base[fromIso(iso).getDay()] = { iso, foh: d.foh, boh: d.boh };
    });
    return Object.keys(base).length ? base : null;
  }, [prevPlan]);
  const seedable = useMemo(() => {
    if (!carryBase) return [];
    return days.filter((iso) => {
      const d = (rec && rec.days && rec.days[iso]) || {};
      const typed = (d.foh !== undefined && d.foh !== "") || (d.boh !== undefined && d.boh !== "");
      return !typed && !!carryBase[fromIso(iso).getDay()];
    });
  }, [carryBase, days, rec]);
  const applyCarry = () => {
    if (loadFailed || !carryBase || !seedable.length) return;
    const dowName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const baseDesc = [1, 2, 3, 4, 5, 6].filter((dw) => carryBase[dw])
      .map((dw) => `${dowName[dw]} ${carryBase[dw].foh || 0}/${carryBase[dw].boh || 0}`).join(" · ");
    if (!window.confirm(
      `Fill ${seedable.length} ${monthLabel(ym)} day(s) with FOH/BOH hours from ${monthLabel(prevYm)}'s last entered week?\n\nPer weekday (FOH/BOH): ${baseDesc}\n\nDays you already typed are not changed, and every filled day stays editable.`)) return;
    const next = { ...(rec || { version: 1, month: ym, days: {} }), days: { ...((rec && rec.days) || {}) } };
    let n = 0;
    seedable.forEach((iso) => {
      const b = carryBase[fromIso(iso).getDay()];
      if (!b) return;
      const seeded = { ...(next.days[iso] || {}) };
      if (b.foh !== undefined && b.foh !== "") seeded.foh = String(b.foh);
      if (b.boh !== undefined && b.boh !== "") seeded.boh = String(b.boh);
      next.days[iso] = seeded;
      n += 1;
    });
    if (!n) return;
    persist(next);
    setCarryMsg(`Filled ${n} day(s) from ${monthLabel(prevYm)}'s last entered week. Adjust any day as needed.`);
  };

  /* ---- weekly rollups ---- */
  const weeks = useMemo(() => {
    const map = new Map();
    days.forEach((iso) => {
      const wk = mondayOf(iso);
      if (!map.has(wk)) map.set(wk, { weekStart: wk, isos: [] });
      map.get(wk).isos.push(iso);
    });
    return [...map.values()].map((w) => {
      const t = { budget: 0, sched: 0, nonOp: 0, forecast: 0, actual: 0 };
      w.isos.forEach((iso) => {
        const c = computed[iso];
        if (!c) return;
        t.budget += c.budget.total; t.sched += c.schedOp; t.nonOp += c.nonOp;
        t.forecast += c.forecast; t.actual += c.actual;
      });
      return { ...w, ...t, hrVar: t.sched - t.budget, dollarVar: (t.sched - t.budget) * wage, nonOpCost: t.nonOp * wage };
    });
  }, [days, computed, wage]);

  const monthTotals = useMemo(() => weeks.reduce((a, w) => ({
    budget: a.budget + w.budget, sched: a.sched + w.sched, nonOp: a.nonOp + w.nonOp,
    forecast: a.forecast + w.forecast, actual: a.actual + w.actual,
  }), { budget: 0, sched: 0, nonOp: 0, forecast: 0, actual: 0 }), [weeks]);

  /* Month goals — same math as the exported monthLaborPlan, shown here so
     what the Planner displays and what the FCR imports are the same number.
     Labor goal = budget hrs × wage ÷ forecast (non-op already sits inside the
     tier benchmark, so it is not added again). Floats with volume. */
  const goals = useMemo(() => {
    const prod = monthTotals.budget > 0 ? monthTotals.forecast / monthTotals.budget : null;
    const labor = monthTotals.forecast > 0 && wage > 0
      ? (monthTotals.budget * wage) / monthTotals.forecast
      : null;
    return { prod, labor };
  }, [monthTotals, wage]);

  const sel = selected ? computed[selected] : null;

  /* ★ WHERE THE DAY'S HOURS SIT, BY DAYPART.
     BOARD hours only on both sides — the non-op load isn't worked in a daypart
     and isn't what gets cut, so it stays out of this and inside the day total
     above. That makes the four gaps sum EXACTLY to the day's variance.

     Benchmark is SALES-PROPORTIONAL (Matt, Jul 26: "Breakfast does carry with
     sales"), so no daypart gets a fixed-hours allowance the others don't.
     Scheduled is split by that weekday's actual hour shape from the daypart
     table. Front/back comes from the board template, per daypart — not the
     flat 45%. */
  const [dayPartOpen, setDayPartOpen] = useState(false);
  const dpDay = useMemo(() => {
    if (!sel || !selected || !dpMonths || !dpMonths.length) return null;
    const dow = fromIso(selected).getDay();
    if (dow === 0) return null;                       // closed
    const i = dow - 1;                                // DP_DOW is Mon..Sat
    const dayKey = DP_DOW[i];
    if (!dayKey) return null;
    const recDp = dpMonths.reduce((a, b) => (String(b.id) > String(a.id) ? b : a));
    const g = (o, dp) => num(o && o[dp] ? o[dp][i] : 0);
    let sTot = 0, hTot = 0;
    const sale = {}, hour = {};
    DP_ORDER.forEach((dp) => {
      sale[dp] = g(recDp.sales, dp); hour[dp] = g(recDp.hours, dp);
      sTot += sale[dp]; hTot += hour[dp];
    });
    if (sTot <= 0 || hTot <= 0) return null;
    const boardSched = sel.foh + sel.boh;
    const split = dpHouseSplit(dayKey);
    /* ⚠️⚠️ REWRITTEN JUL 26 — THE FIRST VERSION PRODUCED A FAKE INSTRUCTION.
       It compared a daypart's SALES share of the budget against its HOURS share
       of the schedule. Both shares come from the SAME monthly record, so the
       difference between them is just the store's structural daypart profile
       restated — it landed on ~39 hours off breakfast EVERY Monday, scaling only
       with the day's totals, and told you nothing about that particular day.
       Matt: "cutting 30ish hrs for the breakfast day part has to be an error."
       He was right. It was arithmetically correct and operationally nonsense.

       ★ AND THE HOURS ARE NOT CUTTABLE ANYWAY. The Sales Curve shows ~96 hours
       before 11AM producing ~$5,560; the 9AM and 10AM hours alone are 22.4 and
       24.0 at $59 and $64/hr. That is prep, breading and biscuits for LUNCH,
       clocked inside the breakfast window. Strip it and lunch breaks — and lunch
       already runs thin at $94/hr.

       NOW: take the day's ACTUAL variance (live, from the board) and show WHERE
       THOSE HOURS SIT, allocated by the daypart hour shape. Productivity is
       shown alongside as CONTEXT for which daypart to lean a cut toward — it is
       no longer used to manufacture a per-daypart target. The parts still sum to
       the day total exactly, because they are shares of it. */
    const dayVar = boardSched - sel.board.total;
    const rows = DP_ORDER.map((dp) => {
      const share = hour[dp] / hTot;
      const amt = dayVar * share;
      const sched = boardSched * share;
      const hs = split[dp] || { foh: 0, boh: 0 };
      const tot = hs.foh + hs.boh;
      const bohPct = tot > 0 ? hs.boh / tot : cfg.bohPct;
      return {
        dp, share, amt, sched, bohPct,
        boh: amt * bohPct, foh: amt * (1 - bohPct),
        rate: sched > 0 ? (sel.forecast * (sale[dp] / sTot)) / sched : 0,
      };
    });
    /* ★ JUL 26 — RENDER IN DAY ORDER: Breakfast, Lunch, Afternoon, Dinner.
       This briefly sorted softest-$/hr-first so the eye landed on the cheapest
       cut. Matt: "This should be breakfast, lunch, afternoon and dinner."
       He is right — the block sits under a DAY, and reordering the dayparts
       breaks the mental model of walking a shift start to finish. `rows` is
       built by mapping DP_ORDER, so leaving it unsorted IS day order.
       `worst` is still the softest daypart — computed on a COPY, so finding it
       can never reorder what is displayed. */
    const worst = rows.filter((r) => r.rate > 0)
      .slice()
      .sort((a, b) => a.rate - b.rate)[0] || null;
    return { rows, label: recDp.label || recDp.id, worst, dayVar,
      max: Math.max(...rows.map((r) => Math.abs(r.amt)), 0.001) };
  }, [sel, selected, dpMonths, cfg]); // eslint-disable-line

  /* ---- styles ---- */
  const S = {
    page: { fontFamily: "Inter, -apple-system, sans-serif", background: BG, minHeight: "100vh", padding: 14, color: INK },
    /* ★ Same fix as SalesAllocation's S.card, same reason, same day. Callers
       paint a 3px coloured top and left on top of this; without the gradient and
       the shadow underneath, that reads as a hard L on a flat block rather than
       a lit card. Every card on the Planner spreads this one style. */
    /* ⚠️⚠️ THE ACCENT EDGE LIVES HERE, NOT AT THE CALL SITE, AND THAT IS THE
       WHOLE POINT. A card is three things: the surface, the shadow and the
       coloured edge. The first two were shared and the edge was typed by hand at
       each caller, so two thirds were impossible to forget and one third was
       forgotten constantly. Nothing is left to remember now, and a caller
       wanting its own tone still writes borderLeft/borderTop and wins, because
       its spread comes after.
       ⛔ IT MUST SIT AFTER `border`, AND MOVING IT ABOVE IS INVISIBLE IN A DIFF.
       `border` is the shorthand; React applies these in insertion order, so a
       spread placed above it is overwritten and every card on the screen goes
       flat again with every check still green. cardEdge.test.mjs grades both. */
    card: { backgroundColor: "#fff", backgroundImage: cardSurface(NAVY, 0.5), border: `1px solid ${LINE}`, ...accentEdge(NAVY, 3), borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: CARD_3D },
    h1: { fontSize: 20, fontWeight: 800, color: NAVY, margin: 0 },
    sub: { fontSize: 13, color: GRAY, marginTop: 2 },
    smallInput: { fontSize: 16, padding: "6px 8px", border: `1.5px solid ${LINE}`, borderRadius: 8, width: 84, boxSizing: "border-box", textAlign: "right" },
    btn: (bg) => ({ fontSize: 15, fontWeight: 700, padding: "10px 14px", borderRadius: 10, border: "none", background: bg, color: "#fff", cursor: "pointer" }),
    chip: (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg, color: fg, marginRight: 6, marginTop: 4 }),
    row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, fontSize: 14 },
    label: { fontWeight: 700, fontSize: 14 },
    mini: { fontSize: 11, color: GRAY },
    tierBtn: (on) => ({
      flex: 1, fontSize: 13, fontWeight: 800, padding: "9px 4px", borderRadius: 9, cursor: "pointer",
      border: on ? `2px solid ${RED}` : `1.5px solid ${LINE}`,
      background: on ? "#FFF1F4" : "#fff", color: on ? RED : INK,
    }),
  };

  const savedBadge =
    saveState === "saving" ? <span style={S.chip("#FFF3CD", AMBER)}>Saving…</span> :
    saveState === "saved" ? <span style={S.chip("#DCF5E8", GREEN)}>Saved ✓</span> :
    saveState === "error" ? <span style={S.chip("#FDE2E2", "#8A1220")}>Save failed — retry</span> : null;

  return (
    <div style={S.page}>
      {loadFailed && (
        <div style={{ background: "#F5EAD3", border: "1px solid #E4CE9E", borderLeft: "3px solid #A9741C", borderTop: "3px solid #A9741C", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#7A5410" }}>
          The saved plan could not be reached — the numbers below are defaults, not the real month. Entry is off so nothing overwrites the plan, the split config, or the tier. Reopen the tile to retry.
        </div>
      )}
      {/* header */}
      <div style={{ ...S.card, borderLeft: `3px solid ${RED}`, borderTop: `3px solid ${RED}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={S.h1}>Planner — Labor Budget</h1>
            <div style={S.sub}>Forecast → budget hours → schedule to the target</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={S.btn(NAVY)} onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
            <button
              onClick={() => setShowMonthPicker(true)}
              style={{
                fontWeight: 800, color: NAVY, minWidth: 130, textAlign: "center",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: `1.5px dotted ${NAVY}`, padding: "2px 4px", fontSize: 15,
              }}
            >
              {monthLabel(ym)}
            </button>
            <button style={S.btn(NAVY)} onClick={() => setYm(shiftMonth(ym, +1))}>›</button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={S.chip("#EAF0F6", NAVY)}>Budget {fmtH(monthTotals.budget)} h</span>
          <span style={S.chip("#EAF0F6", NAVY)}>Scheduled {fmtH(monthTotals.sched)} h</span>
          <span style={S.chip(monthTotals.sched - monthTotals.budget > 0 ? "#FDE2E2" : "#DCF5E8", monthTotals.sched - monthTotals.budget > 0 ? "#8A1220" : GREEN)}>
            {fmt$((monthTotals.sched - monthTotals.budget) * wage)} vs budget
          </span>
          {monthTotals.nonOp > 0 && <span style={S.chip("#F1ECF9", "#6B4FA0")}>incl. non-op {fmtH(monthTotals.nonOp)} h · {fmt$(monthTotals.nonOp * wage)}</span>}
          {savedBadge}
        </div>
        {tier && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: GRAY }}>
            <b style={{ color: NAVY }}>{tier.label}</b> · productivity goal{" "}
            <b style={{ color: INK }}>{goals.prod ? `$${goals.prod.toFixed(2)}/hr` : "—"}</b>{" "}
            · labor goal <b style={{ color: INK }}>{goals.labor ? `${(goals.labor * 100).toFixed(2)}%` : "—"}</b>{" "}
            · wage <b style={{ color: INK }}>{fmt$(wage)}</b> <span style={{ fontSize: 11 }}>({wagePlan.source})</span>
          </div>
        )}
      </div>

      {showMonthPicker && (
        <MonthYearPicker ym={ym} onPick={setYm} onClose={() => setShowMonthPicker(false)} />
      )}

      {/* Carry-forward offer — only while there are unplanned days a previous-
          month base can fill, so it disappears on its own once the month is
          planned. Hidden entirely on a failed load: filling days would write. */}
      {!loadFailed && seedable.length > 0 && (
        <div style={{ ...S.card, borderLeft: `3px solid ${GREEN}`, borderTop: `3px solid ${GREEN}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px" }}>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: 14 }}>Carry {monthLabel(prevYm)} forward</div>
            <div style={{ fontSize: 12.5, color: GRAY, marginTop: 2 }}>
              One tap fills {seedable.length} unplanned day{seedable.length === 1 ? "" : "s"} with FOH/BOH hours
              from {monthLabel(prevYm)}'s last entered week, matched by weekday. Days you typed stay as typed.
            </div>
          </div>
          <button style={S.btn(GREEN)} onClick={applyCarry}>Fill {seedable.length} day{seedable.length === 1 ? "" : "s"}</button>
        </div>
      )}
      {carryMsg && (
        <div style={{ ...S.card, borderLeft: `3px solid ${GREEN}`, borderTop: `3px solid ${GREEN}`, fontSize: 13, fontWeight: 700, color: GREEN }}>
          {carryMsg}
        </div>
      )}

      {/* calendar */}
      <div style={S.card}>
        <CalendarGrid
          ym={ym}
          selected={selected}
          onSelect={setSelected}
          getDay={(iso) => {
            const c = computed[iso];
            if (!c) return null;
            return {
              total: c.schedOp > 0 ? c.schedOp : 0,
              entered: c.entered,
              badge: c.customTarget ? "custom" : undefined,
            };
          }}
          accent={RED}
          fmtTotal={(n) => `${fmtH(n)}h`}
        />
      </div>

      {/* day detail */}
      {sel && (
        <div style={{ ...S.card, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}` }}>
          <div style={{ fontWeight: 800, color: NAVY, marginBottom: 10 }}>
            {fromIso(selected).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>

          <div style={S.row}>
            <div>
              <div style={S.label}>Forecast sales</div>
              <div style={S.mini}>{sel.customForecast ? "manual override" : "auto · 2-month weekday avg"}</div>
            </div>
            <input style={S.smallInput} inputMode="decimal"
              value={sel.d.forecast !== undefined && sel.d.forecast !== "" ? sel.d.forecast : Math.round(sel.forecast) || ""}
              onChange={(e) => setDayField(selected, "forecast", e.target.value)} />
          </div>
          <div style={S.row}>
            <div>
              <div style={S.label}>Productivity target <span style={S.mini}>($/labor-hr)</span></div>
              <div style={{ ...S.mini, color: sel.customTarget ? AMBER : GRAY, fontWeight: sel.customTarget ? 800 : 400 }}>
                {sel.customTarget
                  ? `custom — ${tier?.label || "tier"} default is ${sel.targetDefault.toFixed(2)}`
                  : `${tier?.label || "tier"} · rises with volume`}
              </div>
            </div>
            <input style={S.smallInput} inputMode="decimal"
              value={sel.d.target !== undefined && sel.d.target !== "" ? sel.d.target : sel.targetDefault.toFixed(2)}
              onChange={(e) => setDayField(selected, "target", e.target.value)} />
          </div>

          <div style={{ ...notePanel(NAVY, LINE, BG), borderRadius: 10, padding: "8px 12px", margin: "10px 0", fontSize: 13 }}>
            <b>Budget: {fmtH(sel.budget.total)} h</b>
            <span style={{ color: GRAY }}> all paid</span>
            {/* The board figure is the one he schedules to. Showing only the
                all-paid total invited scheduling the whole thing on the board,
                which is exactly how the non-op hours went over unnoticed. */}
            <div style={{ marginTop: 3 }}>
              <b style={{ color: NAVY }}>Schedule to {fmtH(sel.board.total)} h</b>
              <span style={{ color: GRAY }}> · BOH {fmtH(sel.board.boh)} · FOH {fmtH(sel.board.foh)} (DT {fmtH(sel.board.dt)} / FC {fmtH(sel.board.fc)})</span>
            </div>
            {/* ⚠️ THIS SENTENCE HAS TO ACCOUNT FOR THE WHOLE GAP. It explained
                only the non-op hours, so once standing ops also came out of the
                schedulable total the arithmetic stopped matching the words:
                budget 320.42 − "32.00 h" read as 288.42 while the line above
                said 280.42. A number that doesn't add up on screen costs more
                trust than the number it was hiding. */}
            {(sel.nonOp > 0 || sel.ops > 0) && (
              <div style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>
                {fmtH(sel.nonOp + sel.ops)} h of the budget is not scheduled on the board
                {sel.nonOp > 0 && sel.ops > 0
                  ? ` — ${fmtH(sel.nonOp)} h standing non-op, ${fmtH(sel.ops)} h standing ops.`
                  : sel.ops > 0 ? ` — standing ops.` : ` — standing non-op.`}
              </div>
            )}
          </div>

          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <div style={S.label}>FOH scheduled hrs</div>
              <VarChip diff={sel.fohVar} small />
              {/* ★ WHERE THIS NUMBER CAME FROM (Aug 13 2026). The Schedule tile
                  can now send a built week's hours straight in, which overwrites
                  whatever was typed. Saying so is what stops somebody wondering
                  why the figure they typed this morning has changed — and
                  typing over it still works, it just stops being marked. */}
              {sel.d.hoursFrom === SCHED_SOURCE ? (
                <div style={S.mini}>
                  from the Schedule{sel.d.hoursAt ? ` · ${new Date(sel.d.hoursAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </div>
              ) : null}
            </div>
            <input style={S.smallInput} inputMode="decimal" placeholder={fmtH(sel.budget.foh)}
              value={sel.d.foh ?? ""} onChange={(e) => setDayField(selected, "foh", e.target.value)} />
          </div>
          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <div style={S.label}>BOH scheduled hrs</div>
              <VarChip diff={sel.bohVar} small />
            </div>
            <input style={S.smallInput} inputMode="decimal" placeholder={fmtH(sel.budget.boh)}
              value={sel.d.boh ?? ""} onChange={(e) => setDayField(selected, "boh", e.target.value)} />
          </div>
          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <div style={S.label}>Non-operational hrs</div>
              <div style={S.mini}>training / meetings — not counted in productivity</div>
              {/* ★ LOCKED ON PURPOSE (Matt, Jul 25) — one input, one source.
                  It reads the standing non-ops config, so there is no second
                  place to type the same number and no way for the two to
                  disagree. Adjust the FOH/BOH hours instead. */}
              {stdNonOp(selected) !== null && (
                <div style={{ ...S.mini, marginTop: 2 }}>
                  Set from non-ops · {dpNoteFrom((nonOpCfg && nonOpCfg.people) || [])}
                </div>
              )}
            </div>
            {stdNonOp(selected) === null ? (
              <input style={S.smallInput} inputMode="decimal" placeholder="0"
                value={sel.d.nonOp ?? ""} onChange={(e) => setDayField(selected, "nonOp", e.target.value)} />
            ) : (
              <input style={{ ...S.smallInput, background: BG, color: GRAY, cursor: "not-allowed" }}
                readOnly value={fmtH(stdNonOp(selected))}
                title="Set from the non-ops list — edit it under Daypart labor → Non-ops" />
            )}
          </div>

          <div style={{ borderTop: `1px dashed ${LINE}`, paddingTop: 10, marginTop: 6, fontSize: 13.5 }}>
            {/* ★ THE CUT OPENS UP (Matt, Aug 4 2026, relaying Nick: "for the
                daily hrs to cut I would like an expandable view to show by
                daypart").
                The daypart split already existed further down the card, but it
                sat as its own section — a leader read "cut 8 hours" here and
                had to scroll to find out WHERE. Tapping the number now opens the
                same breakdown against it, which is the question that follows
                the number every time.
                ⚠️ Only a handle when there is something to show. `dpDay` is null
                on a Sunday and on any month with no daypart record, and a button
                that opens nothing is worse than plain text. */}
            {dpDay ? (
              <button
                type="button"
                onClick={() => setDayPartOpen((v) => !v)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                  marginBottom: 4, background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontFamily: "inherit", fontSize: "inherit", textAlign: "left" }}>
                <span style={{ fontWeight: 800, color: INK }}>
                  Day total <span style={{ fontSize: 11, fontWeight: 700, color: GRAY }}>{dayPartOpen ? "hide by daypart ▲" : "by daypart ▾"}</span>
                </span>
                <VarChip diff={sel.totVar} />
              </button>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 800 }}>Day total</span>
                <VarChip diff={sel.totVar} />
              </div>
            )}

            {/* The split, right under the number it explains. Same rows the
                section lower down renders — one source, so they cannot disagree
                about where a cut should land. */}
            {dpDay && dayPartOpen && (
              <div style={{ marginTop: 6, marginBottom: 8, padding: "8px 10px", background: BG, borderRadius: 8 }}>
                {/* ★ FRONT AND BACK PER DAYPART (Matt, Aug 4 2026: "it should
                    show how much to cut in front and back by dayparts"). The
                    split was already computed on each row — it just was not
                    being shown, so a leader got "cut 3 hours off lunch" and
                    still had to decide which side it came from. The two halves
                    use each daypart's REAL shape, not the flat board
                    percentage, which is the whole reason it is worth showing. */}
                {dpDay.rows.map((r) => {
                  const word = (v) => Math.abs(v) < 0.05 ? "—" : v > 0 ? `+${fmtH(v)}` : `−${fmtH(Math.abs(v))}`;
                  const tone = (v) => Math.abs(v) < 0.05 ? GRAY : v > 0 ? RED : GREEN;
                  return (
                    <div key={r.dp} style={{ padding: "4px 0", borderTop: `1px solid ${LINE}55` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                        <span style={{ color: INK, fontWeight: 700 }}>{r.dp}</span>
                        <span style={{ color: tone(r.amt), fontWeight: 800 }}>
                          {Math.abs(r.amt) < 0.05 ? "on budget" : r.amt > 0 ? `+${fmtH(r.amt)} h to cut` : `−${fmtH(Math.abs(r.amt))} h to add`}
                        </span>
                      </div>
                      {Math.abs(r.amt) >= 0.05 && (
                        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: GRAY, marginTop: 1 }}>
                          <span>front <b style={{ color: tone(r.foh) }}>{word(r.foh)} h</b></span>
                          <span>back <b style={{ color: tone(r.boh) }}>{word(r.boh)} h</b></span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {dpDay.worst && (
                  <div style={{ fontSize: 11.5, color: GRAY, marginTop: 6, lineHeight: 1.45 }}>
                    Softest is <b style={{ color: INK }}>{dpDay.worst.dp}</b> at ${dpDay.worst.rate.toFixed(0)}/hr.
                    Check the Sales Curve before stripping a morning — prep and breading for lunch clock inside breakfast.
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", color: GRAY }}>
              <span>$ impact vs budget</span>
              <b style={{ color: sel.dollarVar > 0 ? RED : GREEN }}>{fmt$(sel.dollarVar)}</b>
            </div>
            {sel.nonOp > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: GRAY }}>
                <span>Non-op labor cost</span><b>{fmt$(sel.nonOp * wage)}</b>
              </div>
            )}

            {/* ★ WHAT THE NON-OPS ARE COSTING THIS DAY, BY NAME (Matt, Jul 25:
                "I still want the ability to see the list Hannah sent on the
                planner to show how it impacts labor").
                Shown on the day card because this is where he decides what to
                cut — putting it only in the daypart console means reading one
                screen and acting on another. Weekdays only; a Saturday shows
                nothing because nobody on the list is standing that day. */}
            {stdNonOp(selected) > 0 && (nonOpCfg && nonOpCfg.people || []).length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dotted ${LINE}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 3 }}>
                  <span>Non-ops in this day</span>
                  <span>{fmtH(stdNonOp(selected))} hrs · {fmt$(stdNonOp(selected) * wage)}</span>
                </div>
                {(nonOpCfg.people || []).map((pp, i) => (
                  <div key={pp.id || i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: GRAY }}>
                    <span>{pp.name}</span>
                    <span>{fmtH(Number(pp.hrsPerDay) || 0)} hrs · {fmt$((Number(pp.hrsPerDay) || 0) * wage)}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: GRAY, marginTop: 5, lineHeight: 1.45 }}>
                  {/* The point he's managing to: these hours are already inside
                      the day total above, so the cut he's looking for comes off
                      FOH/BOH, never off this. */}
                  Already counted in the day total. Cuts come off FOH or BOH.
                </div>
              </div>
            )}

            {/* ★ STANDING OPS — the mirror of the block above, and deliberately
                worded differently. These hours ARE operations; they are simply
                never on a schedule. Someone reading the two blocks has to be
                able to tell in one line why one is stripped from productivity
                and the other isn't. */}
            {stdOps(selected) > 0 && ((opsCfg && opsCfg.people) || []).length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dotted ${LINE}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 3 }}>
                  <span>Standing ops in this day</span>
                  <span>{fmtH(stdOps(selected))} hrs · {fmt$(stdOps(selected) * wage)}</span>
                </div>
                {(opsCfg.people || []).map((pp, i) => (
                  <div key={pp.id || i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: GRAY }}>
                    <span>{pp.name}</span>
                    <span>{fmtH(Number(pp.hrsPerDay) || 0)} hrs · {fmt$((Number(pp.hrsPerDay) || 0) * wage)}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: GRAY, marginTop: 5, lineHeight: 1.45 }}>
                  Operational hours that are worked and paid but never scheduled on the board.
                  Counted in the day total and taken out of what the board can spend — so the
                  cut above is the real one. Edit under Daypart labor → Standing ops.
                </div>
              </div>
            )}
            {sel.actual > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: GRAY }}>
                <span>Actual sales {fmt$(sel.actual)} → productivity</span>
                <b style={{ color: sel.prodActual >= sel.target ? GREEN : RED }}>
                  {sel.prodActual ? `$${sel.prodActual.toFixed(2)}/hr vs $${Number(sel.target).toFixed(2)}` : "—"}
                </b>
              </div>
            )}
          </div>

          {/* ── WHERE THE HOURS SIT, BY DAYPART ──────────────────────────
              No plus/minus anywhere: the word IS the instruction. A "−3.54 to
              add" reads as a minus that means add. Cut is the loud one because
              it is the action usually being taken; add is deliberately quiet
              and NOT green — red/green reads as bad/good, and having room is
              neither. */}
          {dpDay && (
            <div style={{ borderTop: `1px dashed ${LINE}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: NAVY }}>Where the hours sit</span>
                <span style={{ fontSize: 11, color: GRAY }}>board hours · {dpDay.label} shape</span>
              </div>

              {dpDay.rows.map((r) => {
                /* ★ ONE SIGN CONVENTION IN THE WHOLE PLANNER (Matt, Jul 26):
                   OVER budget is + and RED, UNDER is − and GREEN. Same as
                   VarChip, the day total and the weekly rows. The earlier
                   verb-only chips ("Cut 39.2") were the odd one out. */
                const over = r.amt > 0.05, under = r.amt < -0.05;
                const w = Math.min(92, (Math.abs(r.amt) / dpDay.max) * 92);
                return (
                  <div key={r.dp} style={{ display: "grid", gridTemplateColumns: "84px 1fr 74px", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.dp}</div>
                      <div style={{ fontSize: 10.5, color: GRAY }}>${r.rate.toFixed(0)}/hr</div>
                    </div>
                    <div style={{ position: "relative", height: 22, background: "#F4F7F9", borderRadius: 5 }}>
                      <div style={{ position: "absolute", left: 0, top: 4, height: 14, width: `${w}%`,
                        borderRadius: 3, overflow: "hidden", display: "flex", opacity: over || under ? 1 : 0 }}>
                        <div style={{ width: `${(1 - r.bohPct) * 100}%`, background: "#2F5597" }} />
                        <div style={{ width: `${r.bohPct * 100}%`, background: "#8B5E34" }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, fontWeight: 800,
                      color: over ? RED : under ? GREEN : GRAY }}>
                      {over ? `+${fmtH(r.amt)}` : under ? `−${fmtH(Math.abs(r.amt))}` : "—"}
                    </div>
                  </div>
                );
              })}

              <div style={{ fontSize: 10.5, color: GRAY, marginTop: 6, lineHeight: 1.5 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#2F5597", marginRight: 4 }} />front
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#8B5E34", margin: "0 4px 0 10px" }} />back
                <span style={{ marginLeft: 10 }}>split is each daypart&rsquo;s real shape, not the flat {Math.round(cfg.bohPct * 100)}%</span>
              </div>

              {dpDay.worst && (() => {
                /* ⛔⛔ THE NUMBER IS A VARIANCE AND THE WORDS CALLED IT THE
                   DAY'S HOURS. Matt, Aug 21 2026, off his own screen.

                   It read: "These are the day's 17.24 h spread across the
                   dayparts ... they add up to the day total above" — on a
                   Thursday whose calendar cell three inches up says 393.00h.
                   `dayVar` is boardSched − budget, so 17.24 is how far the day
                   sits FROM budget, and this block's own comment already says
                   so: "the parts still sum to the day total exactly, because
                   they are shares of it" — shares of the VARIANCE.

                   ⚠️⚠️ A READER HAS NO WAY TO TELL, WHICH IS WHAT MAKES IT
                   EXPENSIVE. 17.24 is a plausible number of hours, and "the day
                   total above" is a real thing on the same screen holding a
                   different number. Nothing errors and nothing looks broken.
                   Same shape as the HR badge already written up: the number
                   came from one thing and the wording came from another.

                   ⚠️ AND `Math.abs` DROPPED THE SIGN, in a file whose own
                   comment thirty lines up states the one convention for the
                   whole planner — over is + and RED, under is − and GREEN. The
                   rows above honour it. This sentence printed identical words
                   for a day 17 hours over budget and a day 17 hours under it,
                   which are opposite instructions to the person reading it. */
                const varOver = dpDay.dayVar > 0.05;
                const varUnder = dpDay.dayVar < -0.05;
                return (
                <div style={{ fontSize: 12, color: INK, background: BG, borderRadius: 8, padding: "8px 10px", marginTop: 8, lineHeight: 1.5 }}>
                  These are the <b>{fmtH(Math.abs(dpDay.dayVar))} h</b> this day sits{" "}
                  <b style={{ color: varOver ? RED : varUnder ? GREEN : GRAY }}>
                    {varOver ? "over" : varUnder ? "under" : "away from"}
                  </b>{" "}budget, spread across the dayparts by where the hours actually sit.
                  They add up to the day&rsquo;s variance above, not to the hours it is scheduled.
                  {" "}<b>{dpDay.worst.dp}</b> is the softest at <b>${dpDay.worst.rate.toFixed(0)}/hr</b> against
                  a ${Number(sel.target).toFixed(0)} target, so lean a cut there first — but check the Sales Curve
                  before stripping a morning: prep and breading for lunch clock inside breakfast.
                </div>
                );
              })()}
              <div style={{ fontSize: 10.5, color: GRAY, marginTop: 6 }}>
                Day and board totals are live. The split inside the day is a typical {DP_DOW[fromIso(selected).getDay() - 1]} from {dpDay.label} — Signal only publishes a month once it closes.
              </div>
            </div>
          )}
        </div>
      )}

      {/* weekly rollup */}
      <div style={S.card}>
        <div style={{ fontWeight: 800, color: NAVY, marginBottom: 8 }}>Weekly Labor</div>
        {/* ★ FIVE EXPANDABLE ROWS → ONE STRIP (mockup, approved Jul 26).
            The old list needed five taps to compare five numbers that fit on one
            line. The strip shows every week at once; tapping one opens its
            detail BELOW rather than pushing the other four down. */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
          {weeks.map((w, i) => {
            const open = !!expandedWeeks[w.weekStart];
            const over = w.hrVar > 0.05, under = w.hrVar < -0.05;
            return (
              <button
                key={w.weekStart} type="button"
                onClick={() => setExpandedWeeks((st) => ({ ...st, [w.weekStart]: !st[w.weekStart] }))}
                style={{
                  flex: "1 0 auto", minWidth: 92, font: "inherit", cursor: "pointer", textAlign: "center",
                  padding: "9px 8px", borderRadius: 10, background: open ? "#EAF0F6" : "#FBFCFD",
                  border: open ? `1.5px solid ${NAVY}` : `1px solid ${LINE}`,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: GRAY }}>W{i + 1}</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 3,
                  color: over ? RED : under ? GREEN : GRAY }}>
                  {over ? `+${fmtH(w.hrVar)}` : under ? `−${fmtH(Math.abs(w.hrVar))}` : "0.0"}
                </div>
                <div style={{ fontSize: 10, color: GRAY, marginTop: 2 }}>{w.weekStart.slice(5)}</div>
              </button>
            );
          })}
        </div>
        {weeks.filter((w) => expandedWeeks[w.weekStart]).map((w, i) => (
          <div key={w.weekStart} style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${LINE}`, fontSize: 12.5, color: GRAY }}>
            <b style={{ color: INK, fontSize: 13 }}>Week of {w.weekStart.slice(5)}</b>{" "}
            <VarChip diff={w.hrVar} small />
            <div style={{ marginTop: 3 }}>
              Budget {fmtH(w.budget)} h · Scheduled {fmtH(w.sched)} h · {fmt$(w.dollarVar)} vs budget
              {w.nonOp > 0 ? ` · non-op ${fmtH(w.nonOp)} h (${fmt$(w.nonOpCost)})` : ""}
            </div>
            <div>Forecast {fmt$(w.forecast)}{w.actual > 0 ? ` · Actual ${fmt$(w.actual)}` : ""}</div>
          </div>
        ))}
      </div>

      {/* settings */}
      <div style={S.card}>
        <button style={S.btn(NAVY)} onClick={() => setShowCfg(!showCfg)}>
          {showCfg ? "Hide settings" : "Targets & settings"}
        </button>
        {showCfg && tierCfg && (
          <div style={{ marginTop: 12 }}>

            {/* ── Tier selector ── */}
            <div style={{ fontWeight: 800, color: NAVY, fontSize: 14, marginBottom: 2 }}>Productivity benchmark</div>
            <div style={{ ...S.mini, marginBottom: 8 }}>
              Benchmark hrs = fixed hrs + forecast ÷ marginal rate. The target rises with volume.
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {TIER_ORDER.map((k) => (
                <button key={k} style={S.tierBtn(tierCfg.selected === k)}
                  onClick={() => saveTiers({ ...tierCfg, selected: k })}>
                  {tierCfg.tiers[k].label}
                </button>
              ))}
            </div>

            {/* Editable constants for the ACTIVE tier */}
            <div style={S.row}>
              <div>
                <div style={S.label}>Fixed hrs / day</div>
                <div style={S.mini}>opening, prep, close — does not scale</div>
              </div>
              <input style={S.smallInput} inputMode="decimal"
                value={cfgDraft.fixedHours !== undefined ? cfgDraft.fixedHours : tier.fixedHours}
                onChange={(e) => setCfgDraft({ ...cfgDraft, fixedHours: cleanNum(e.target.value) })}
                onBlur={() => {
                  if (cfgDraft.fixedHours !== undefined) {
                    const k = tierCfg.selected;
                    saveTiers({ ...tierCfg, tiers: { ...tierCfg.tiers, [k]: { ...tierCfg.tiers[k], fixedHours: Number(cfgDraft.fixedHours) || 0 } } });
                    const nd = { ...cfgDraft }; delete nd.fixedHours; setCfgDraft(nd);
                  }
                }} />
            </div>
            <div style={S.row}>
              <div>
                <div style={S.label}>Marginal rate ($/hr)</div>
                <div style={S.mini}>sales each additional labor hour carries</div>
              </div>
              <input style={S.smallInput} inputMode="decimal"
                value={cfgDraft.marginalRate !== undefined ? cfgDraft.marginalRate : tier.marginalRate}
                onChange={(e) => setCfgDraft({ ...cfgDraft, marginalRate: cleanNum(e.target.value) })}
                onBlur={() => {
                  if (cfgDraft.marginalRate !== undefined) {
                    const k = tierCfg.selected;
                    saveTiers({ ...tierCfg, tiers: { ...tierCfg.tiers, [k]: { ...tierCfg.tiers[k], marginalRate: Number(cfgDraft.marginalRate) || 0 } } });
                    const nd = { ...cfgDraft }; delete nd.marginalRate; setCfgDraft(nd);
                  }
                }} />
            </div>

            {/* Preview — what this tier implies at real volumes */}
            <div style={{ ...notePanel(NAVY, LINE, BG), borderRadius: 10, padding: "8px 12px", margin: "6px 0 14px", fontSize: 12.5, color: GRAY }}>
              <b style={{ color: INK }}>At this tier:</b>{" "}
              {[28000, 30000, 34000].map((v) => (
                <span key={v} style={{ marginRight: 10 }}>
                  ${(v / 1000).toFixed(0)}K day → <b style={{ color: INK }}>${(dayProductivityTarget(tier, v) || 0).toFixed(2)}/hr</b> ({fmtH(benchmarkHours(tier, v))}h)
                </span>
              ))}
            </div>

            {/* ── Planned wage ── */}
            <div style={{ fontWeight: 800, color: NAVY, fontSize: 14, marginBottom: 2 }}>Planned wage rate</div>
            <div style={{ ...S.mini, marginBottom: 8 }}>
              Labor goal = wage ÷ productivity, so this moves the goal. Auto prefers the last
              closed month; live follows this month's FCR as payroll posts.
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[
                ["auto", "Auto"],
                ["live", "Live MTD"],
                ["manual", "Manual"],
              ].map(([mode, label]) => (
                <button key={mode} style={S.tierBtn((cfg.wageMode || "auto") === mode)}
                  onClick={async () => {
                    const next = { ...cfg, wageMode: mode };
                    await saveCfg(next);
                    if (mode !== "manual") setWagePlan(await resolvePlannedWage(ym, next, tierCfg));
                  }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={S.row}>
              <div>
                <div style={S.label}>Avg wage ($/hr)</div>
                <div style={{ ...S.mini, color: cfg.wageMode === "manual" ? AMBER : GRAY, fontWeight: cfg.wageMode === "manual" ? 800 : 400 }}>
                  {wagePlan.source}
                </div>
              </div>
              <input style={S.smallInput} inputMode="decimal"
                disabled={cfg.wageMode !== "manual"}
                value={cfgDraft.wage !== undefined ? cfgDraft.wage : Number(wage).toFixed(2)}
                onChange={(e) => setCfgDraft({ ...cfgDraft, wage: cleanNum(e.target.value) })}
                onBlur={async () => {
                  if (cfgDraft.wage !== undefined) {
                    const v = Number(cfgDraft.wage) || 0;
                    await saveTiers({ ...tierCfg, plannedWage: v });
                    setWagePlan({ wage: v, source: "manual" });
                    const nd = { ...cfgDraft }; delete nd.wage; setCfgDraft(nd);
                  }
                }} />
            </div>
            {wagePlan.source === "default" && (
              <div style={{ ...S.mini, color: AMBER, fontWeight: 700, marginBottom: 10 }}>
                No FCR wage data for {monthLabel(shiftMonth(ym, -1))} or {monthLabel(ym)} — showing the default.
                Enter wages and hours on the FCR page to seed this.
              </div>
            )}

            {/* ── Splits ── */}
            <div style={{ fontWeight: 800, color: NAVY, fontSize: 14, margin: "8px 0 6px" }}>Hour splits</div>
            <div style={S.row}>
              <div style={S.label}>BOH share of hours (%)</div>
              <input style={S.smallInput} inputMode="decimal"
                value={cfgDraft.bohPct !== undefined ? cfgDraft.bohPct : Math.round(cfg.bohPct * 100)}
                onChange={(e) => setCfgDraft({ ...cfgDraft, bohPct: cleanNum(e.target.value) })}
                onBlur={() => {
                  if (cfgDraft.bohPct !== undefined) {
                    saveCfg({ ...cfg, bohPct: (Number(cfgDraft.bohPct) || 0) / 100 });
                    const nd = { ...cfgDraft }; delete nd.bohPct; setCfgDraft(nd);
                  }
                }} />
            </div>
            <div style={S.row}>
              <div style={S.label}>DT share of FOH (%)</div>
              <input style={S.smallInput} inputMode="decimal"
                value={cfgDraft.dtPct !== undefined ? cfgDraft.dtPct : Math.round(cfg.dtPct * 100)}
                onChange={(e) => setCfgDraft({ ...cfgDraft, dtPct: cleanNum(e.target.value) })}
                onBlur={() => {
                  if (cfgDraft.dtPct !== undefined) {
                    saveCfg({ ...cfg, dtPct: (Number(cfgDraft.dtPct) || 0) / 100 });
                    const nd = { ...cfgDraft }; delete nd.dtPct; setCfgDraft(nd);
                  }
                }} />
            </div>
            <div style={S.mini}>Settings apply to all months. Per-day overrides live on each day.</div>

            {/* ★ THE MONTHLY DAYPART CONSOLE LIVES HERE NOW (mockup, approved
                Jul 26). It is reference and entry — the month's shape and the
                CFA Signal table — not something to read every time the Planner
                opens. The per-DAY daypart block on the day card is the one that
                answers "what do I do today", and it stays up there.
                ⚠️ CONSEQUENCE: this is now the ONLY place to enter a month or
                edit the non-ops list, so it must never be gated behind anything
                narrower than the settings toggle itself. */}
            <div style={{ marginTop: 18, paddingTop: 4, borderTop: `1px solid ${LINE}` }}>
              <DaypartLabor
                tierCfg={tierCfg}
                onNonOpsSaved={setNonOpCfg}
                onOpsSaved={setOpsCfg}
                onMonthsSaved={setDpMonths}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
