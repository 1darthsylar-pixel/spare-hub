/* ============================================================================
   FoodCostTracker.jsx — Gate City Hub
   Replaces the "[Month] Food Cost Tracker" tabs.

   Inputs:
     • Invoices/credits by category (Food, Produce, Bread, Paper, Kitchen,
       Cleaning, Transfer In/Out for food & paper, QIC)
     • Giveaways: entered as a RUNNING MTD TOTAL (a "Zero so far" button
       records $0). Each day you enter the cumulative month-to-date total;
       the latest-dated entry is the operative figure (not a sum). Mirrors
       the FCR workbook's single running tally cell.
     • Month-end: Ending Food Inventory, Ending Paper Inventory
       (beginning inventory auto-carries from the prior month's ending)

   Math (mirrors sheet Y37 / AC37):
     food %  = (BeginFood + FoodPurchases + FoodTransfers − FoodGiveaways
                − EndFood) ÷ ActualSales
     paper % = same, paper side
     ActualSales = live month total from Sales Allocation.

   Storage: gcfcr-foodcost-[YYYY-MM]-v1
     { version, month, beginFood, beginPaper, endFood, endPaper,
       entries:[{id,date,cat,amount,note}], giveaways:{ iso:{food,paper} } }

   Cross-tile export:
     monthFoodCostPct(ym) — used by FCR Projections' MTD panel so the
     Food Cost % shown there is always the live tracker number, not a
     static snapshot. Mirrors the same pattern as Planner's
     monthProductivityGoal(ym).
   ============================================================================ */

import React, { useEffect, useMemo, useRef, useState } from "react";
/* The one raised look and accent edge, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, accentEdge } from "./cardStyle.js";
import { hubToken, kvGet, kvSet, kvGetResult } from "./store";
import { loadSalesMonth, dayTotal } from "./SalesAllocation.jsx";
import MonthYearPicker from "./MonthYearPicker.jsx";
import { ITEM_GAPS_KEY, parseDrilldownPaste } from "./foodItemGaps.js";
import { INV_GAPS_KEY, mergeInvGaps, parseGapPaste, wasteUnderLogged, prevYm as invPrevYm } from "./inventoryGaps.js";
import { notifyChannel, CHANNELS } from "./notify.js";
import PasteMonth from "./PasteMonth.jsx";
/* "That is a long way outside anything you have ever typed" — the check that
   would have caught the Aug 11 paper invoice. See its header for why the
   comparison is per-side and never a number written in code. */
import { outlierCheck, outlierMessage } from "./costOutlier.js";

/* Ask the Worker for the June 2026 gap table. Returns {} on ANY failure — a
   refusal, a network blip, a non-director — and every caller treats {} as
   "fewer historical months", never as "that month had no gaps". */
async function fetchGapSeed() {
  try {
    const r = await fetch("/api/food-gaps-seed", { headers: { "x-hub-token": hubToken() } });
    const d = await r.json().catch(() => null);
    return (d && d.ok && d.seed) || {};
  } catch { return {}; }
}

/* Same deal for the July 2026 inventory activity report — see
   inventoryGapsSeed.js. Different route, different table, identical failure
   contract: {} means "fewer historical months", never "that month was clean".
   Two calls rather than one combined route because the two tables are read by
   two different sections and either can be absent on its own. */
async function fetchInvGapSeed() {
  try {
    const r = await fetch("/api/inventory-gaps-seed", { headers: { "x-hub-token": hubToken() } });
    const d = await r.json().catch(() => null);
    return (d && d.ok && d.seed) || {};
  } catch { return {}; }
}


const NAVY = "#1B3A5C", RED = "#DD0031", INK = "#232A31", GRAY = "#6B7480",
      LINE = "#E3E7EC", BG = "#F6F8FA", GREEN = "#166B4A", AMBER = "#7A5A00";

// Order = entry priority: food, paper, produce, bread, kitchen, cleaning,
// transfer food, transfer paper, QIC. `side` drives the food/paper math and
// is unchanged, so this reorder is display-only and safe for existing data.
const CATS = [
  { id: "food", label: "Food", side: "food" },
  { id: "paper", label: "Paper", side: "paper" },
  { id: "produce", label: "Produce", side: "food" },
  { id: "bread", label: "Bread", side: "food" },
  /* ★ RETIRED FROM ENTRY, NOT FROM THE DATA (Matt, Aug 5 2026: "I don't need to
     input cleaning or kitchen supplies rn because we are using the YTD function
     so remove those inputs to tidy it up. In the future I can add back if
     needed").
     ⚠️ 724 ENTRIES ALREADY EXIST IN THESE TWO CATEGORIES. Deleting them from
     CATS would make `catById` fall through to its `|| CATS[0]` default, so every
     one of those historical lines would silently relabel itself as FOOD and land
     on the food side of the math. That is the stored-shape rule: old records
     must still read.
     ⇒ `hidden` keeps them resolvable everywhere, and only the entry dropdown
     filters them out. Nothing that reads history changes at all.
     ⚠️ PUTTING THEM BACK IS DELETING ONE WORD, twice. That is the whole reason
     it is a flag rather than a deletion. */
  { id: "kitchen", label: "Kitchen Supplies", side: "other", hidden: true },
  { id: "cleaning", label: "Cleaning Supplies", side: "other", hidden: true },
  { id: "tfood", label: "Transfer — Food (± )", side: "food" },
  { id: "tpaper", label: "Transfer — Paper (±)", side: "paper" },
  { id: "qic", label: "QIC (food)", side: "food" },
];
const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];

/* ---------------- decimal-safe input cleaners ----------------
   Character-filtering regexes alone (e.g. /[^0-9.]/g) still let
   malformed strings like "12.5.6" or "1-2.3" through, which then
   silently evaluate to 0 via Number(v) || 0 — wrong number, no error.
   These cap input to a single leading minus (if allowed) and a
   single decimal point, same pattern as FCRPage.jsx's cleanDec. */
/* The food/paper budget % lives in the Planner's config key (shared).
   Food Cost owns the setting now, but the key stays put so other
   modules reading that config keep working unchanged. */
const PLANNER_CONFIG_KEY = "gcfcr-planner-config-v1";

const cleanUnsigned = (raw) => {
  const digitsAndDot = String(raw).replace(/[^0-9.]/g, "");
  const i = digitsAndDot.indexOf(".");
  return i === -1 ? digitsAndDot : digitsAndDot.slice(0, i + 1) + digitsAndDot.slice(i + 1).replace(/\./g, "");
};
const cleanSigned = (raw) => {
  const s = String(raw);
  const neg = s.trim().startsWith("-");
  const body = cleanUnsigned(s.replace(/-/g, ""));
  return neg ? `-${body}` : body;
};

/* ---------------- dates ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
function prevBusinessDay(from = new Date()) {
  const d = new Date(from); d.setDate(d.getDate() - 1);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return isoOf(d);
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
}
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

/* ---------------- storage + engine (exported for FCR) ---------------- */
export const foodcostKey = (ym) => `gcfcr-foodcost-${ym}-v1`;
export async function loadFoodCost(ym) {
  try { return (await kvGet(foodcostKey(ym))) || null; } catch { return null; }
}
const n = (v) => Number(v) || 0;

export function costBreakdown(rec, salesTotal) {
  const r = rec || {};
  const entries = r.entries || [];
  const sum = (side) => entries.filter((e) => catById(e.cat).side === side).reduce((s, e) => s + n(e.amount), 0);
  const gv = r.giveaways || {};
  // Giveaways are entered as a RUNNING MTD TOTAL, not per-day amounts —
  // each day you type the new cumulative total, replacing the prior.
  // So the operative figure is the LATEST-dated entry, not the sum of
  // all entries (summing would stack each day's running total on top
  // of the last, massively overstating giveaways). Mirrors the Sheet's
  // single B47/B50 tally cell.
  const gvDates = Object.keys(gv).sort();
  const latestGv = gvDates.length ? gv[gvDates[gvDates.length - 1]] : null;
  const gvFood = latestGv ? n(latestGv.food) : 0;
  const gvPaper = latestGv ? n(latestGv.paper) : 0;
  /* ★ A BLANK ENDING IS ASSUMED EQUAL TO THE BEGINNING (Matt, Aug 2 2026:
     "make the starting and ending the same number, last month's ending, and at
     the end of the month I'll adjust it. same with paper").
     Blank used to count as $0 — the formula assumed the ENTIRE shelf would be
     eaten with nothing left, so on Aug 2 the dashboard read 107% food cost
     ($28,974 of held inventory + one truck against a single day of sales) and
     the whole MTD block went red. With end = begin they cancel, and mid-month
     the %% is simply purchases − giveaways over sales (Aug 1 reads 27.27%).
     Month-end: type the real count over it and the month trues up.
     ⚠️ A TYPED "0" IS A REAL COUNT and is respected — only blank means
     "not counted yet". Computed here, NEVER written into the record, so the
     stored shape is untouched and his typed count always wins.
     ⚠️ This is the ONE shared engine — tracker header, math line, and
     monthFoodCostPct (Financials/FCR) all read it, so no screen can disagree. */
  const blank = (v) => v === undefined || v === null || v === "";
  const endFoodEff = blank(r.endFood) ? n(r.beginFood) : n(r.endFood);
  const endPaperEff = blank(r.endPaper) ? n(r.beginPaper) : n(r.endPaper);
  const foodUse = n(r.beginFood) + sum("food") - gvFood - endFoodEff;
  const paperUse = n(r.beginPaper) + sum("paper") - gvPaper - endPaperEff;
  /* ⚠️⚠️ A NEGATIVE USE IS NOT A COST PERCENTAGE, AND IT WILL NOT BE PUBLISHED
     AS ONE (Matt, Aug 12 2026).
     🐛 WHAT HAPPENED. The paper giveaway MTD box was typed as 329842 instead of
     204.88 — a running total larger than the entire month's sales. paperUse came
     out at −$310,759 and every screen that reads this engine cheerfully rendered
     *−109.85% paper cost*: the scorecard pill, the tracker header, the FCR and
     the morning digest, all agreeing with each other and all wrong. Nothing
     anywhere said a word.

     ⚠️ THE POINT IS NOT THAT THE NUMBER WAS BIG. It is that the number was
     IMPOSSIBLE and got published anyway. You cannot give away, or count as
     ending inventory, more than you started with plus everything you bought.
     A figure that cannot exist must not be shown as a measurement — the same
     ruling as the food-cost window guard from Aug 8, arrived at the same way.

     ⚠️ REFUSED, NOT CLAMPED. Showing 0% or a floor would be a different wrong
     number wearing a confident face. Null means "this cannot be computed", every
     caller already renders that as a dash, and `…Impossible` says WHY so a screen
     can print the reason instead of a silent blank.

     ⚠️ THE RAW NUMBERS ARE STILL RETURNED. foodUse, paperUse and the purchase
     totals come back untouched, because the tracker's own math line shows the
     working and that is exactly where somebody diagnoses a bad entry. Only the
     PERCENTAGE — the thing that gets graded against a goal — is withheld.
     ⚠️ NOTHING STORED CHANGES. This is computed on read, so no record is
     rewritten and Matt's typed figures always remain his. */
  const foodImpossible = foodUse < 0;
  const paperImpossible = paperUse < 0;
  return {
    foodPurch: sum("food"), paperPurch: sum("paper"), otherPurch: sum("other"),
    gvFood, gvPaper, foodUse, paperUse,
    endFoodEff, endPaperEff,
    endFoodAssumed: blank(r.endFood), endPaperAssumed: blank(r.endPaper),
    foodImpossible, paperImpossible,
    foodPct: salesTotal > 0 && !foodImpossible ? foodUse / salesTotal : null,
    paperPct: salesTotal > 0 && !paperImpossible ? paperUse / salesTotal : null,
  };
}

/**
 * monthFoodCostPct(ym)
 * Live food/paper % for the given "YYYY-MM", built the same way the
 * tracker's own header chips are (beginning inventory auto-carried from
 * the prior month's ending, sales basis from Sales Allocation).
 *
 * Returns null if there's no tracker record yet for that month (e.g.
 * brand-new month with no entries), so FCR can fall back to its static
 * DATA value cleanly.
 *
 * Returns: { foodPct, paperPct, foodUse, paperUse, salesTotal } | null
 */
export async function monthFoodCostPct(ym) {
  const [cur, prev, sales] = await Promise.all([
    loadFoodCost(ym),
    loadFoodCost(shiftMonth(ym, -1)),
    loadSalesMonth(ym).catch(() => null),
  ]);
  if (!cur) return null;

  const rec = { ...cur };
  if ((rec.beginFood === undefined || rec.beginFood === "") && prev?.endFood) rec.beginFood = prev.endFood;
  if ((rec.beginPaper === undefined || rec.beginPaper === "") && prev?.endPaper) rec.beginPaper = prev.endPaper;

  const salesTotal = sales?.days
    ? Object.values(sales.days).reduce((s, d) => s + dayTotal(d), 0)
    : 0;

  const bk = costBreakdown(rec, salesTotal);
  /* ⚠️ THE TEST IS "NO SALES", NOT "NO FOOD PERCENTAGE", and the difference is
     new. `foodPct` used to be null for exactly one reason — no sales entered —
     so the two readings were the same thing. Now it is ALSO null when the food
     side is impossible, and leaving this as `bk.foodPct == null` would throw the
     whole month away over a bad FOOD entry, taking a perfectly good PAPER figure
     with it. Same condition as before, said in terms of what it actually means. */
  if (!(salesTotal > 0)) return null;

  /* ★★ THE TWO WINDOWS, REPORTED SEPARATELY (Matt, Aug 8 2026: "food costs cant
     be right").
     🐛 THE BUG THIS EXISTS TO STOP. On the morning of Aug 8 the Hub published
     food cost as 23.91% against a 27.56% goal, and the 7am digest told 35 people
     in #operational-success it was meeting goal. It was not: the real figure was
     28.77%, OVER goal. Sales were entered through the 7th and food invoices only
     through the 6th, so a whole day of sales sat in the denominator with no food
     in the numerator. Reproduced to the penny from the stored record.

     ⚠️ A RATIO IS ONLY HONEST WHEN BOTH SIDES COVER THE SAME DAYS. Labor already
     knew this — it refuses to publish when payroll lags sales — and food cost was
     the one prime-cost row with no such guard. It divided whatever had been typed
     by whatever had been typed and reported the answer with no window at all.

     ⚠️ THE FOOD SIDE COUNTS ONLY FOOD-SIDE CATEGORIES. A paper invoice on the 7th
     does not mean the food was entered, and treating it as proof of coverage is
     the same mistake one level down. */
  const foodDates = (rec.entries || [])
    .filter((e) => catById(e.cat).side === "food")
    .map((e) => e.date)
    .filter(Boolean)
    .sort();
  const salesDates = Object.keys((sales && sales.days) || {}).sort();
  const foodThrough = foodDates.length ? foodDates[foodDates.length - 1] : null;
  const salesThrough = salesDates.length ? salesDates[salesDates.length - 1] : null;

  return {
    foodPct: bk.foodPct,
    paperPct: bk.paperPct,
    /* Passed through so a caller can say WHY there is no number instead of
       rendering a bare dash that reads like "nothing entered yet". */
    foodImpossible: bk.foodImpossible,
    paperImpossible: bk.paperImpossible,
    foodUse: bk.foodUse,
    paperUse: bk.paperUse,
    salesTotal,
    foodThrough,
    salesThrough,
    /* True when food invoices cover at least as many days as sales. Both null
       (nothing entered at all) is NOT trusted — an empty month must not read as
       a clean one. */
    windowTrusted: !!foodThrough && !!salesThrough && foodThrough >= salesThrough,
  };
}



/* ---------------- formatting ---------------- */
const fmt$ = (v) => (Number(v) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);

/* ============================================================================ */
export default function FoodCostTracker() {
  const [ym, setYm] = useState(ymOf(new Date()));
  const [rec, setRec] = useState(null);
  const [prevRec, setPrevRec] = useState(null);
  const [salesTotal, setSalesTotal] = useState(0);
  const [saveState, setSaveState] = useState("idle");
  // false = that read FAILED (not "empty") — the matching save path refuses,
  // because saving over a record we never saw destroys it.
  const [loadOk, setLoadOk] = useState(true);
  const [gapsOk, setGapsOk] = useState(true);
  const saveTimer = useRef(null);
  const invAmtRef = useRef(null);  // invoice amount input — for Enter-to-add + refocus
  const gvPaperRef = useRef(null); // giveaway paper input — for Enter-to-advance

  // giveaway entry form
  const [gvDate, setGvDate] = useState(prevBusinessDay());
  const [gvFood, setGvFood] = useState("");
  const [gvPaper, setGvPaper] = useState("");

  // invoice entry form
  /* Defaults to the PREVIOUS business day, same as the giveaways date above
     (Matt, Aug 2 2026: "I want the day I input food to open or start on the
     previous business day"). Invoices are entered the morning after — Saturday's
     truck gets typed on Sunday/Monday — so "today" was wrong every single time
     and had to be corrected by hand. Sundays are skipped (store closed). */
  const [invDate, setInvDate] = useState(prevBusinessDay());
  const [invCat, setInvCat] = useState("food");
  const [invAmt, setInvAmt] = useState("");
  const [invNote, setInvNote] = useState("");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [expandedDays, setExpandedDays] = useState({}); // iso -> true when expanded; all collapsed on load
  // Food/paper budget % of sales — moved here from the Planner. Still stored
  // in the shared planner config key so nothing else has to change.
  const [fpPct, setFpPct] = useState(0.3082);
  /* ★ SPLIT TARGETS (Matt, Jul 31: "this shouldnt be combined. i want to see
     the budget split"). foodPct/paperPct are the two real targets; fpPct stays
     stored AS THEIR SUM so the Labor Planner (fpBudget/fpNeeded) and anything
     else reading the combined number keeps working untouched. null = the
     split has never been typed — the panel shows the combined view and the
     first typed side derives the other from the known combined (arithmetic
     from Matt's own numbers, never an invented figure). */
  const [foodPctT, setFoodPctT] = useState(null);
  const [paperPctT, setPaperPctT] = useState(null);
  const [fdDraft, setFdDraft] = useState(undefined); // raw text while typing (food %)
  const [ppDraft, setPpDraft] = useState(undefined); // raw text while typing (paper %)

  /* ---- item gaps (monthly transcription from the CFA Food Cost Drilldown) ---- */
  const [gapsRaw, setGapsRaw] = useState(null);   // EXACTLY what KV holds — the write base
  /* The seed arrives over the network now — see foodItemGapsSeed.js. {} until it
     does, which shows fewer historical months rather than empty ones. */
  const [gapSeed, setGapSeed] = useState({});
  const [gapName, setGapName] = useState("");
  const [gapAmt, setGapAmt] = useState("");
  const [gapErr, setGapErr] = useState("");       // inline entry error, "" when clean
  // ── Gap Watch (CFA inventory activity report) — see inventoryGaps.js ──
  const [invGapsRaw, setInvGapsRaw] = useState(null); // EXACTLY what KV holds — the write base
  const [invGapsOk, setInvGapsOk] = useState(true);   // failed read → import refuses
  /* The July table arrives over the network now — see inventoryGapsSeed.js. {}
     until it does, and {} for anyone the route refuses, which shows fewer
     historical months rather than empty ones. Deliberately NOT tied to
     invGapsOk: a missing seed must never block the import, only the KV read
     can do that. */
  const [invGapSeed, setInvGapSeed] = useState({});
  const [gapImportState, setGapImportState] = useState("idle"); // idle | saving | done | error
  const [gapTarget, setGapTarget] = useState(""); // report's own total, for the cross-check only
  const [gapsSave, setGapsSave] = useState("idle");

  useEffect(() => {
    (async () => {
      try {
        const cfg = await kvGet(PLANNER_CONFIG_KEY);
        if (cfg && typeof cfg.fpPct === "number") setFpPct(cfg.fpPct);
        if (cfg && typeof cfg.foodPct === "number" && typeof cfg.paperPct === "number") {
          setFoodPctT(cfg.foodPct);
          setPaperPctT(cfg.paperPct);
        }
      } catch {}
    })();
  }, []);

  /* Saves the SPLIT and keeps fpPct = food + paper in the same write, so the
     combined readers can never disagree with the split by even one render.
     Same guard as saveFpPct below: read result-style, refuse on a failed
     read, roll everything back on a refused write. */
  const saveBudgetSplit = async (nextFood, nextPaper) => {
    const prev = { f: foodPctT, p: paperPctT, c: fpPct };
    setFoodPctT(nextFood);
    setPaperPctT(nextPaper);
    setFpPct(nextFood + nextPaper);
    const r = await kvGetResult(PLANNER_CONFIG_KEY);
    if (!r.ok) {
      setFoodPctT(prev.f); setPaperPctT(prev.p); setFpPct(prev.c);
      window.alert("The budget split did not save — the planner settings couldn't be read. Check the wifi and try again.");
      return;
    }
    const cfg = (r.value && typeof r.value === "object") ? r.value : {};
    const ok = await kvSet(PLANNER_CONFIG_KEY, { ...cfg, foodPct: nextFood, paperPct: nextPaper, fpPct: nextFood + nextPaper });
    if (ok === false) {
      setFoodPctT(prev.f); setPaperPctT(prev.p); setFpPct(prev.c);
      window.alert("The budget split did not save — check the wifi and try again.");
    }
  };

  // One side typed: the other side comes from Matt's own numbers — the typed
  // value against the known combined (or the other side already on file).
  const commitSide = (side, raw) => {
    /* ⚠️ AN EMPTY BOX IS NOT A ZERO TARGET. `Number("") || 0` is 0, so
       clearing the food or paper box and tapping away SAVED a 0% budget — to
       the shared planner, for everyone, silently. Nobody types 0% on purpose
       here; they clear it to retype it, and the blur fires first. A 0% target
       makes every variance read as a blowout.
       Same rule for anything unparseable. Leave the stored split alone and let
       them finish typing. */
    const s = String(raw == null ? "" : raw).trim();
    if (s === "" || !Number.isFinite(Number(s))) return;
    const typed = Number(s) / 100;
    if (side === "food") {
      const other = paperPctT != null ? paperPctT : Math.max(0, fpPct - typed);
      saveBudgetSplit(typed, other);
    } else {
      const other = foodPctT != null ? foodPctT : Math.max(0, fpPct - typed);
      saveBudgetSplit(other, typed);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      // ⚠️ The CURRENT month reads with kvGetResult: a FAILED read used to
      // arrive as null, render as an empty month, and one keystroke then saved
      // that emptiness over the month's invoices, counts and giveaways. The
      // prior month and sales stay on their plain loaders — display inputs
      // that never feed a write from here.
      const [curR, prev, sales] = await Promise.all([
        kvGetResult(foodcostKey(ym)), loadFoodCost(shiftMonth(ym, -1)), loadSalesMonth(ym),
      ]);
      if (!alive) return;
      setLoadOk(curR.ok);
      const cur = curR.ok ? curR.value : null;
      const base = cur || { version: 1, month: ym, entries: [], giveaways: {} };
      // auto-carry beginning inventory from prior month's ending
      if ((base.beginFood === undefined || base.beginFood === "") && prev?.endFood) base.beginFood = prev.endFood;
      if ((base.beginPaper === undefined || base.beginPaper === "") && prev?.endPaper) base.beginPaper = prev.endPaper;
      setRec(base);
      setPrevRec(prev);
      const tot = sales?.days
        ? Object.values(sales.days).reduce((s, d) => s + dayTotal(d), 0)
        : 0;
      setSalesTotal(tot);
      const pbd = prevBusinessDay();
      setGvDate(pbd.startsWith(ym) ? pbd : `${ym}-01`);
      // Same clamp for the invoice date: viewing a past month, "yesterday" is
      // not in that month, so fall to the 1st — addEntry refuses out-of-month
      // dates, and a default the form itself rejects would be a dead button.
      setInvDate(pbd.startsWith(ym) ? pbd : `${ym}-01`);
    })();
    return () => { alive = false; };
  }, [ym]);

  const persist = (next) => {
    // Refuse before the optimistic update: with the month unloaded, even the
    // typed digit must not appear, or the screen shows costs that cannot save.
    if (!loadOk) { setSaveState("error"); return; }
    setRec(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // kvSet returns false on a refused write and never throws — the old
      // catch here was unreachable, so "error" had never once shown.
      const ok = await kvSet(foodcostKey(ym), next);
      setSaveState(ok ? "saved" : "error");
      setTimeout(() => setSaveState("idle"), 2000);
    }, 500);
  };

  const bk = useMemo(() => costBreakdown(rec, salesTotal), [rec, salesTotal]);

  /* Group entries by date — FIRST TO LAST (Matt, Aug 2 2026: "annoying because
     they don't populate first to last"). The 1st of the month sits at the top
     and each new day lands at the bottom, reading like the ledger it is.
     Each group carries the day's signed subtotal across all categories.
     Kept above the early-return guard so hook order stays stable. */
  const entryGroups = useMemo(() => {
    const sorted = [...((rec && rec.entries) || [])].sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map();
    sorted.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, { date: e.date, items: [], subtotal: 0 });
      const g = map.get(e.date);
      g.items.push(e);
      g.subtotal += Number(e.amount) || 0;
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rec]);

  /* ---- giveaways ---- */
  const saveGiveaway = (food, paper) => {
    if (!gvDate.startsWith(ym)) { alert(`Date must be in ${monthLabel(ym)} — flip the month arrows first.`); return; }
    // ⚠️ A BLANK FIELD MUST NOT SAVE AS $0.
    // Giveaways are RUNNING MTD TOTALS and costBreakdown uses only the
    // LATEST-dated entry. n("") === 0, so filling in food and leaving paper
    // blank used to write paper:0 — which doesn't just lose that day, it wipes
    // the whole month's paper giveaway credit, and paperUse (begin + purchases
    // − giveaways − end) jumps by the full amount. Paper % then reads high on
    // this tile, in FCR, on the KPI strip and on the L10 board, with nothing
    // on screen to say why.
    // A blank side now CARRIES FORWARD the most recent prior total instead.
    const gv = (rec && rec.giveaways) || {};
    const priorIso = Object.keys(gv).filter((iso) => iso < gvDate).sort().pop();
    const prior = priorIso ? gv[priorIso] : null;
    const keep = (v, side) => (String(v ?? "").trim() === "" ? (prior ? n(prior[side]) : 0) : n(v));
    persist({ ...rec, giveaways: { ...gv, [gvDate]: { food: keep(food, "food"), paper: keep(paper, "paper") } } });
    setGvFood(""); setGvPaper("");
  };
  const gvDone = rec?.giveaways?.[gvDate] !== undefined;

  /* ---- invoices ---- */
  const addEntry = () => {
    if (!invAmt) return;
    if (!invDate.startsWith(ym)) { alert(`Date must be in ${monthLabel(ym)}.`); return; }
    /* ⚠️ THE HISTORY IS THIS MONTH PLUS LAST, AND IT IS ALREADY IN MEMORY.
       `prevRec` is loaded anyway to carry the beginning inventory forward, so
       this costs no extra read. Roughly 50 paper lines and 100 food lines at
       Gate City — comfortably past MIN_HISTORY without reaching for a year of
       records on every keystroke.
       ⚠️ SAME SIDE ONLY. Comparing a paper invoice against food lines is the
       one thing that makes this useless: food's 95th percentile is nine
       thousand dollars and paper has never once passed twenty-five hundred. */
    const side = catById(invCat).side;
    const prior = [...(rec.entries || []), ...((prevRec && prevRec.entries) || [])]
      .filter((x) => x && catById(x.cat).side === side)
      .map((x) => Number(x.amount));
    const verdict = outlierCheck(invAmt, prior);
    /* ⚠️ ASKS, NEVER REFUSES. A real stock-up has to be enterable, or the page
       stops being where the truth goes. Cancel leaves the amount in the box so
       a typo is one keystroke from fixed rather than retyped from scratch. */
    if (verdict.ask && !window.confirm(outlierMessage(invAmt, side, verdict.biggest))) return;
    const e = { id: Date.now().toString(36), date: invDate, cat: invCat, amount: Number(invAmt) || 0, note: invNote };
    persist({ ...rec, entries: [...(rec.entries || []), e] });
    setInvAmt(""); setInvNote("");
  };
  /* Enter in the amount or note field adds the entry and drops the cursor
     back on the amount field, so a laptop user can chain invoices without
     reaching for the mouse. */
  const addEntryAndContinue = () => {
    addEntry();
    setTimeout(() => invAmtRef.current?.focus(), 0);
  };
  const delEntry = (id) => {
    if (!window.confirm("Delete this entry?")) return;
    persist({ ...rec, entries: (rec.entries || []).filter((e) => e.id !== id) });
  };

  const setField = (field, raw) => {
    const v = raw === "" ? "" : cleanSigned(raw);
    persist({ ...rec, [field]: v });
  };

  /* ---- item gaps: load, derive, persist ------------------------------------
     The dashboard Food card reads these through loadItemGaps(), which merges KV
     OVER the module SEED. So the write base has to be RAW KV, never the merged
     object — writing the merge back would freeze today's seed into storage and
     any later correction to the seed would be silently ignored forever. */
  useEffect(() => {
    let alive = true;
    (async () => {
      // ⚠️ kvGetResult: a FAILED read used to arrive as {}, and persistGaps
      // writes the WHOLE map back — so saving one month's gaps after a failed
      // read erased every other month on file.
      const sd = await fetchGapSeed();
      if (alive) setGapSeed(sd);
      const r = await kvGetResult(ITEM_GAPS_KEY);
      if (!alive) return;
      if (!r.ok) { setGapsOk(false); setGapsRaw({}); return; }
      setGapsRaw(r.value && typeof r.value === "object" ? r.value : {});
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { setGapErr(""); setGapTarget(""); }, [ym]);

  /* Gap Watch record — same discipline as the drilldown gaps below: the
     write base is RAW KV, the seed only merges for display, and a failed
     read refuses the import so one paste can never erase other months. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const sd = await fetchInvGapSeed();
      if (alive) setInvGapSeed(sd);
      const r = await kvGetResult(INV_GAPS_KEY);
      if (!alive) return;
      if (!r.ok) { setInvGapsOk(false); setInvGapsRaw({}); return; }
      setInvGapsRaw(r.value && typeof r.value === "object" ? r.value : {});
    })();
    return () => { alive = false; };
  }, []);

  const importGapMonth = async (text) => {
    if (!invGapsOk) {
      return { ok: false, message: "The gap record could not be reached when the tile opened — importing now could erase other months. Reopen the tile and try again." };
    }
    const parsed = parseGapPaste(text);
    if (parsed.error) return { ok: false, message: parsed.error };
    setGapImportState("saving");
    const next = { ...(invGapsRaw || {}), [parsed.ym]: parsed.rec };
    const ok = await kvSet(INV_GAPS_KEY, next);
    if (!ok) { setGapImportState("error"); return { ok: false, message: "That did not save — check the wifi and try again." }; }
    setInvGapsRaw(next);
    setGapImportState("done");
    // One clean channel post per landed month — a deliberate leader action,
    // the same pattern as the waste log's Signal button, never a cron.
    const r = parsed.rec;
    const real = r.total - (r.unmappedTotal || 0);
    const top = r.items.filter((x) => !x.unmapped).slice(0, 3).map((x) => `• ${x.name} — ${fmt$(x.cost)}`).join("\n");
    const under = r.items.filter(wasteUnderLogged).slice(0, 3).map((x) => x.name.split(",")[0]);
    notifyChannel(CHANNELS.inventory,
      `*Inventory gaps — ${r.label}*\nMissing product: ${fmt$(r.total)} · ${fmt$(real)} of it real (the rest is unmapped items)\nTop gaps:\n${top}` +
      (under.length ? `\nWaste badly under-logged on: ${under.join(", ")} — tossing without logging shows up as missing.` : ""));
    return { ok: true, message: `Imported ${r.label} and posted the summary to #inventory-management.` };
  };

  /* Drilldown paste — writes through the SAME single writer the add-row form
     uses (persistGaps), aimed at the pasted month, replacing that month's
     list outright: the drilldown is authoritative for its month. */
  const importDrilldown = async (text) => {
    if (!gapsOk) return { ok: false, message: "Item gaps could not be reached when the tile opened — importing could erase other months. Reopen the tile first." };
    const p = parseDrilldownPaste(text);
    if (p.error) return { ok: false, message: p.error };
    const ok = await persistGaps(p.items, p.ym);
    return ok
      ? { ok: true, message: `Imported ${p.items.length} gap line${p.items.length === 1 ? "" : "s"} for ${monthLabel(p.ym)}.` }
      : { ok: false, message: "That did not save — check the wifi and try again." };
  };

  const gapsMerged = { ...gapSeed, ...(gapsRaw || {}) };
  const gapRec = gapsMerged[ym] || null;
  const gapItems = [...((gapRec && gapRec.items) || [])]
    .filter((x) => x && Number(x.gap) > 0)
    .sort((a, b) => Number(b.gap) - Number(a.gap));
  const gapSum = gapItems.reduce((s, x) => s + (Number(x.gap) || 0), 0);
  // Seeded but never saved: editing materialises the seed as Matt's own copy.
  const gapFromSeed = !!(gapSeed[ym] && !(gapsRaw || {})[ym]);
  const gapIsOpenMonth = ym === ymOf(new Date());
  /* ★ THE EXAMPLE BLOCK NAMES THE LAST CLOSED MONTH, NOT THE TAB (Matt, Aug 3
     2026: "this is the aug tab but the report will be from the month before").
     CFA publishes the drilldown after a month closes, so on the open month the
     placeholder was suggesting "DRILLDOWN 2026-08" for a report that is always
     the month before. Copying that shape files July's gaps under August: right
     numbers, wrong month, and nothing downstream would ever question it.
     importDrilldown already writes to the month the PASTED BLOCK names, so the
     paste self-routes and no tab switching is needed. Only the example was
     teaching the wrong thing. */
  const gapPasteYm = gapIsOpenMonth ? shiftMonth(ym, -1) : ym;
  const gapTargetN = gapTarget.trim() === "" ? null : Number(gapTarget) || 0;
  const gapDiff = gapTargetN == null ? null : Math.round((gapSum - gapTargetN) * 100) / 100;

  /* Writes the WHOLE map back, with this month replaced. An empty list removes
     the month outright rather than saving an empty one — priorMonthGaps treats
     an empty month as "nothing to show" and stops falling back to the last
     month on file, which would quietly blank the dashboard card. */
  const persistGaps = async (items, forYm = ym) => {
    // Whole-map write over a map we never saw = every other month erased.
    if (!gapsOk) { setGapsSave("error"); return false; }
    const base = { ...(gapsRaw || {}) };
    if (!items.length) delete base[forYm];
    else base[forYm] = { label: monthLabel(forYm), items };
    setGapsRaw(base);
    setGapsSave("saving");
    // kvSet returns false on a refused write and never throws — the old catch
    // was unreachable, so "error" had never once shown.
    const ok = await kvSet(ITEM_GAPS_KEY, base);
    setGapsSave(ok ? "saved" : "error");
    return ok;
  };

  const addGap = () => {
    const name = gapName.trim();
    const amt = Number(gapAmt);
    if (!name) { setGapErr("Name the subcategory the way the drilldown prints it."); return; }
    if (!(amt > 0)) { setGapErr("Only over-target lines belong here. The gap has to be more than zero."); return; }
    if (gapItems.some((x) => String(x.name).toLowerCase() === name.toLowerCase())) {
      setGapErr(`${name} is already on the list. Delete that line to change its amount.`); return;
    }
    setGapErr("");
    persistGaps([...gapItems, { name, gap: Math.round(amt * 100) / 100 }]);
    setGapName(""); setGapAmt("");
  };

  const delGap = (name) => {
    if (!window.confirm(`Remove ${name} from ${monthLabel(ym)}?`)) return;
    persistGaps(gapItems.filter((x) => x.name !== name));
  };


  /* ---- styles ---- */
  const S = {
    page: { fontFamily: "Inter, -apple-system, sans-serif", background: BG, minHeight: "100vh", padding: 14, color: INK },
    card: { background: cardSurface(), border: `1px solid ${LINE}`, borderRadius: 12, ...accentEdge(NAVY, 3), boxShadow: CARD_3D, padding: 14, marginBottom: 12 },
    h1: { fontSize: 20, fontWeight: 800, color: NAVY, margin: 0 },
    sub: { fontSize: 13, color: GRAY, marginTop: 2 },
    input: { fontSize: 16, padding: "9px 11px", border: `1.5px solid ${LINE}`, borderRadius: 10, boxSizing: "border-box" },
    btn: (bg) => ({ fontSize: 14.5, fontWeight: 700, padding: "10px 14px", borderRadius: 10, border: "none", background: bg, color: "#fff", cursor: "pointer" }),
    chip: (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg, color: fg, marginRight: 6, marginTop: 4 }),
    row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, fontSize: 14 },
    label: { fontWeight: 700, fontSize: 14 },
    mini: { fontSize: 11, color: GRAY },
    sec: { fontWeight: 800, color: NAVY, marginBottom: 8 },
  };

  const savedBadge =
    saveState === "saving" ? <span style={S.chip("#FFF3CD", AMBER)}>Saving…</span> :
    saveState === "saved" ? <span style={S.chip("#DCF5E8", GREEN)}>Saved ✓</span> :
    saveState === "error" ? <span style={S.chip("#FDE2E2", "#8A1220")}>Save failed — retry</span> : null;

  if (!rec) return <div style={S.page}>Loading…</div>;

  // Most recent 8, shown FIRST TO LAST to match the invoice sections — the
  // in-use figure (the latest) is therefore the BOTTOM row, not the top.
  const gvList = Object.keys(rec.giveaways || {}).sort().slice(-8);

  return (
    <div style={S.page}>
      {(!loadOk || !gapsOk) && (
        <div style={{ background: "#F5EAD3", border: "1px solid #E4CE9E", borderLeft: "3px solid #A9741C", borderTop: "3px solid #A9741C", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#7A5410" }}>
          {loadOk
            ? "Item gaps could not be reached — gap edits are off so other months are not erased. Reopen the tile to retry."
            : "This month's food cost record could not be reached — what you see is blank, not real, and entry is off so it cannot overwrite the real month. Reopen the tile to retry."}
        </div>
      )}
      {/* header */}
      <div style={{ ...S.card, borderLeft: `3px solid ${RED}`, borderTop: `3px solid ${RED}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={S.h1}>Food Cost Tracker</h1>
            <div style={S.sub}>Invoices, giveaways &amp; inventory → live food/paper %</div>
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
          {/* ⚠️ A REFUSED FIGURE GETS ITS OWN CHIP, not the same neutral dash as
              "nothing entered yet". This is the page somebody fixes it on, so
              this is the page that has to say it out loud. */}
          <span style={S.chip(bk.foodImpossible ? "#FDE2E2" : "#EAF0F6", bk.foodImpossible ? "#8A1220" : NAVY)}>
            Food {bk.foodImpossible ? "check entries" : fmtPct(bk.foodPct)}
          </span>
          <span style={S.chip(bk.paperImpossible ? "#FDE2E2" : "#EAF0F6", bk.paperImpossible ? "#8A1220" : NAVY)}>
            Paper {bk.paperImpossible ? "check entries" : fmtPct(bk.paperPct)}
          </span>
          <span style={S.chip(BG, GRAY)}>Sales basis {fmt$(salesTotal)}</span>
          {savedBadge}
        </div>
      </div>

      {showMonthPicker && (
        <MonthYearPicker ym={ym} onPick={setYm} onClose={() => setShowMonthPicker(false)} />
      )}

      {/* giveaways — entered as a RUNNING MTD TOTAL (latest wins) */}
      <div style={{ ...S.card, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}` }}>
        <div style={S.sec}>Giveaways — MTD running total {gvDone && <span style={S.chip("#DCF5E8", GREEN)}>updated today ✓</span>}</div>
        <div style={{ fontSize: 12, color: GRAY, marginBottom: 8 }}>
          Enter the <b>cumulative month-to-date total</b> each day (not just today's amount) — the latest entry is used as the figure. Mirrors the FCR workbook's single running tally.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input type="date" style={{ ...S.input, width: 165 }} value={gvDate} onChange={(e) => setGvDate(e.target.value)} />
          <input style={{ ...S.input, width: 130, textAlign: "right" }} inputMode="decimal" placeholder="Food $ (MTD)"
            value={gvFood} onChange={(e) => setGvFood(cleanUnsigned(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); gvPaperRef.current?.focus(); gvPaperRef.current?.select?.(); } }} />
          <input ref={gvPaperRef} style={{ ...S.input, width: 130, textAlign: "right" }} inputMode="decimal" placeholder="Paper $ (MTD)"
            value={gvPaper} onChange={(e) => setGvPaper(cleanUnsigned(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveGiveaway(gvFood, gvPaper); } }} />
          <button style={S.btn(GREEN)} onClick={() => saveGiveaway(gvFood, gvPaper)}>Update total</button>
          <button style={S.btn(GRAY)} onClick={() => saveGiveaway(0, 0)}>Zero so far</button>
        </div>
        {gvList.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: GRAY }}>
            <div style={{ fontWeight: 700, color: INK, marginBottom: 2 }}>History (latest is the figure in use):</div>
            {gvList.map((iso, i) => (
              <div key={iso} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px dotted ${LINE}`, opacity: i === gvList.length - 1 ? 1 : 0.55 }}>
                <span>{iso.slice(5)}{i === gvList.length - 1 ? " · in use" : ""}</span>
                <span>food {fmt$(rec.giveaways[iso].food)} · paper {fmt$(rec.giveaways[iso].paper)}</span>
              </div>
            ))}
            <div style={{ marginTop: 4, fontWeight: 700, color: INK }}>Current MTD: food {fmt$(bk.gvFood)} · paper {fmt$(bk.gvPaper)}</div>
          </div>
        )}
      </div>

      {/* invoices */}
      <div style={S.card}>
        <div style={S.sec}>Invoices &amp; Transfers</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input type="date" style={{ ...S.input, width: 165 }} value={invDate} onChange={(e) => setInvDate(e.target.value)} />
          <select style={{ ...S.input, width: 190 }} value={invCat} onChange={(e) => setInvCat(e.target.value)}>
            {/* Retired categories are filtered HERE and nowhere else, so a historical
                entry in one still renders with its real label. */}
            {CATS.filter((c) => !c.hidden).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input ref={invAmtRef} style={{ ...S.input, width: 110, textAlign: "right" }} inputMode="decimal" placeholder="$ (− for out)"
            value={invAmt} onChange={(e) => setInvAmt(cleanSigned(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEntryAndContinue(); } }} />
          <input style={{ ...S.input, flex: 1, minWidth: 120 }} placeholder="note (optional)"
            value={invNote} onChange={(e) => setInvNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEntryAndContinue(); } }} />
          <button style={S.btn(GREEN)} onClick={addEntry}>Add</button>
        </div>
        {entryGroups.length === 0 && <div style={{ color: GRAY, fontSize: 13.5 }}>No entries yet this month.</div>}
        {entryGroups.map((g) => {
          const collapsed = !expandedDays[g.date];
          const dLabel = fromIso(g.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          return (
            <div key={g.date} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpandedDays((c) => ({ ...c, [g.date]: !c[g.date] }))}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "8px 0", borderBottom: `1.5px solid ${LINE}`, cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: GRAY, fontSize: 13, width: 14 }}>{collapsed ? "▸" : "▾"}</span>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{dLabel}</span>
                  <span style={{ color: GRAY, fontSize: 12 }}>{g.items.length} item{g.items.length === 1 ? "" : "s"}</span>
                </div>
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: g.subtotal < 0 ? RED : INK }}>{fmt$(g.subtotal)}</span>
              </div>
              {!collapsed && g.items.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0 5px 22px", borderBottom: `1px solid ${LINE}`, fontSize: 13.5 }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{catById(e.cat).label}{e.note ? <span style={{ color: GRAY, fontWeight: 400 }}> · {e.note}</span> : null}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: (Number(e.amount) || 0) < 0 ? RED : INK }}>{fmt$(e.amount)}</span>
                  <button onClick={() => delEntry(e.id)} style={{ background: "none", border: "none", color: RED, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>×</button>
                </div>
              ))}
            </div>
          );
        })}
        {entryGroups.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: GRAY }}>
            MTD purchases — food {fmt$(bk.foodPurch)} · paper {fmt$(bk.paperPurch)} · supplies {fmt$(bk.otherPurch)}
          </div>
        )}
      </div>

      {/* Gap Watch — the CFA inventory activity report, month by month.
          Fed by a monthly paste (Claude parses the PDF); a successful import
          posts one summary to #inventory-management. */}
      <div style={{ ...S.card, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}` }}>
        <div style={S.sec}>Inventory gaps — CFA activity report</div>
        {(() => {
          const all = mergeInvGaps(invGapsRaw, invGapSeed);
          const recIG = all[ym];
          const shownYm = recIG ? ym : Object.keys(all).sort().pop();
          const shown = recIG || (shownYm ? all[shownYm] : null);
          if (!shown) return <div style={{ fontSize: 13, color: GRAY }}>No months on file yet.</div>;
          const prior = all[invPrevYm(shownYm)];
          const priorCost = (name) => { const hit = prior && prior.items ? prior.items.find((x) => x.name === name) : null; return hit ? hit.cost : null; };
          const real = shown.total - (shown.unmappedTotal || 0);
          return (
            <>
              {!recIG && <div style={{ fontSize: 12.5, color: "#7A5A00", fontWeight: 700, marginBottom: 6 }}>No report for {monthLabel(ym)} yet — showing {shown.label}.</div>}
              <div style={{ fontSize: 13.5, marginBottom: 8 }}>
                <b>{fmt$(shown.total)}</b> of product unaccounted for · <b>{fmt$(real)}</b> real
                {shown.unmappedTotal > 0 ? <span style={{ color: GRAY }}> · {fmt$(shown.unmappedTotal)} is unmapped items, not loss</span> : null}
                {prior ? <span style={{ color: GRAY }}> · prior month {fmt$(prior.total)}</span> : null}
              </div>
              {/* Same guard as priorCost above (and gapItems below): a stored
                  month with no items list must not blank the whole tile. */}
              {((shown && shown.items) || []).slice(0, 10).map((it) => {
                const was = priorCost(it.name);
                const delta = was != null ? it.cost - was : null;
                return (
                  <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px dotted ${LINE}`, fontSize: 13 }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>
                      {it.name}
                      {it.unmapped ? <span style={{ fontSize: 10.5, fontWeight: 800, color: GRAY, marginLeft: 6 }}>UNMAPPED</span> : null}
                      {wasteUnderLogged(it) ? <span style={{ fontSize: 10.5, fontWeight: 800, color: RED, marginLeft: 6 }}>WASTE UNDER-LOGGED</span> : null}
                    </span>
                    {delta != null && <span style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: delta > 0 ? RED : GREEN }}>{delta > 0 ? "▲" : "▼"}{fmt$(Math.abs(delta))}</span>}
                    <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt$(it.cost)}</span>
                  </div>
                );
              })}
              {gapImportState === "done" && (
                <div style={{ marginTop: 10 }}>
                  <span style={S.chip("#DCF5E8", GREEN)}>Imported ✓ posted to #inventory-management</span>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: GRAY, marginBottom: 4 }}>
                  Drop the month's gap report PDF on Claude, then paste the block it hands back.
                </div>
                {/* 🐛 THIS PLACEHOLDER WAS THE REAL JULY NUMBERS (Aug 8 2026).
                    It carried the month's whole-report total and the top item's
                    actual cost, cases missing, cases used and waste credited —
                    so moving the seed table to the worker closed nothing, and a
                    grep of the built chunk still found $8,701.90 sitting here.
                    ⚠️ SECOND COPIES LIVE IN PLACEHOLDERS. The food gaps did the
                    exact same thing earlier the same day. A format example only
                    needs the SHAPE, never a real figure — these are round and
                    obviously invented on purpose. */}
                <PasteMonth buttonLabel="Paste a month" accent={NAVY}
                  disabled={!invGapsOk} disabledNote="Import is off — the record could not be read. Reopen the tile to retry."
                  placeholder={"2026-08 | 1000.00\nPotato, Waffle 6/5 Lb Bag | 100.00 | 4 | 500 | 0.5\nBag, Kids Meal 600 Ct | 50.00 | 2 | 2 | 0 | unmapped"}
                  onImport={importGapMonth} />
              </div>
            </>
          );
        })()}
      </div>

      {/* inventory */}
      <div style={S.card}>
        <div style={S.sec}>Inventory</div>
        <div style={S.row}>
          <div>
            <div style={S.label}>Beginning Food</div>
            <div style={S.mini}>{prevRec?.endFood ? "auto from last month's ending" : "enter manually"}</div>
          </div>
          <input style={{ ...S.input, width: 110, textAlign: "right" }} inputMode="decimal"
            value={rec.beginFood ?? ""} onChange={(e) => setField("beginFood", e.target.value)} />
        </div>
        <div style={S.row}>
          <div>
            <div style={S.label}>Beginning Paper</div>
            <div style={S.mini}>{prevRec?.endPaper ? "auto from last month's ending" : "enter manually"}</div>
          </div>
          <input style={{ ...S.input, width: 110, textAlign: "right" }} inputMode="decimal"
            value={rec.beginPaper ?? ""} onChange={(e) => setField("beginPaper", e.target.value)} />
        </div>
        <div style={{ borderTop: `1px dashed ${LINE}`, marginTop: 8, paddingTop: 8 }}>
          <div style={S.row}>
            <div>
              <div style={S.label}>Ending Food <span style={S.mini}>(month-end)</span></div>
              {bk.endFoodAssumed && <div style={S.mini}>blank = assumed same as beginning · type the real count at month end</div>}
            </div>
            <input style={{ ...S.input, width: 110, textAlign: "right" }} inputMode="decimal"
              placeholder={bk.endFoodAssumed ? String(n(rec.beginFood) || "") : ""}
              value={rec.endFood ?? ""} onChange={(e) => setField("endFood", e.target.value)} />
          </div>
          <div style={S.row}>
            <div>
              <div style={S.label}>Ending Paper <span style={S.mini}>(month-end)</span></div>
              {bk.endPaperAssumed && <div style={S.mini}>blank = assumed same as beginning · type the real count at month end</div>}
            </div>
            <input style={{ ...S.input, width: 110, textAlign: "right" }} inputMode="decimal"
              placeholder={bk.endPaperAssumed ? String(n(rec.beginPaper) || "") : ""}
              value={rec.endPaper ?? ""} onChange={(e) => setField("endPaper", e.target.value)} />
          </div>
        </div>
      </div>

      {/* food/paper budget — moved here from the Planner */}
      <div style={{ ...S.card, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}` }}>
        <div style={S.sec}>Food / Paper Budget</div>
        {/* ★ SPLIT VIEW (Matt, Jul 31). Two targets, two actuals, two verdicts —
            a paper problem can no longer hide inside a good food month or the
            other way around. The combined line stays as the summary, and until
            the split is typed once, the first typed side derives the other
            from the known combined target. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Food budget (% of sales)</div>
          </div>
          <input
            style={{ ...S.input, width: 110, textAlign: "right" }}
            inputMode="decimal"
            placeholder={foodPctT == null ? "—" : undefined}
            value={fdDraft !== undefined ? fdDraft : (foodPctT == null ? "" : (foodPctT * 100).toFixed(2))}
            onChange={(e) => setFdDraft(cleanUnsigned(e.target.value))}
            onBlur={() => {
              if (fdDraft !== undefined) { commitSide("food", fdDraft); setFdDraft(undefined); }
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Paper budget (% of sales)</div>
            <div style={{ fontSize: 11.5, color: GRAY }}>Both apply to all months. Together they are the combined target below.</div>
          </div>
          <input
            style={{ ...S.input, width: 110, textAlign: "right" }}
            inputMode="decimal"
            placeholder={paperPctT == null ? "—" : undefined}
            value={ppDraft !== undefined ? ppDraft : (paperPctT == null ? "" : (paperPctT * 100).toFixed(2))}
            onChange={(e) => setPpDraft(cleanUnsigned(e.target.value))}
            onBlur={() => {
              if (ppDraft !== undefined) { commitSide("paper", ppDraft); setPpDraft(undefined); }
            }}
          />
        </div>
        {foodPctT == null && (
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 8 }}>
            The split hasn't been set yet — type either box once and the other fills in
            from the current combined target of {(fpPct * 100).toFixed(2)}%. Adjust both any time.
          </div>
        )}
        {(() => {
          const rows = [];
          if (foodPctT != null && paperPctT != null) {
            rows.push({ label: "Food", pct: foodPctT, actual: bk.foodUse || 0 });
            rows.push({ label: "Paper", pct: paperPctT, actual: bk.paperUse || 0 });
          }
          const combined = { label: "Combined", pct: fpPct, actual: (bk.foodUse || 0) + (bk.paperUse || 0) };
          const line = (r, bold) => {
            const budget = salesTotal * r.pct;
            const variance = r.actual - budget;   // + = over budget
            const actualPct = salesTotal > 0 ? r.actual / salesTotal : null;
            return (
              <div key={r.label} style={{ padding: "6px 0", borderBottom: bold ? "none" : `1px solid ${LINE}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ color: GRAY }}>{r.label} budget ({(r.pct * 100).toFixed(2)}% × {fmt$(salesTotal)} MTD sales)</span>
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmt$(budget)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ color: GRAY }}>{r.label} actual{actualPct != null ? ` · ${fmtPct(actualPct)}` : ""}</span>
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmt$(r.actual)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontWeight: bold ? 800 : 700 }}>
                  <span>{variance > 0 ? "Over budget" : "Under budget"}</span>
                  <span style={{ color: variance > 0 ? RED : GREEN, fontVariantNumeric: "tabular-nums" }}>
                    {fmt$(Math.abs(variance))}
                  </span>
                </div>
              </div>
            );
          };
          return (
            <div style={{ fontSize: 13.5 }}>
              {rows.map((r) => line(r, false))}
              {line(combined, true)}
            </div>
          );
        })()}
      </div>

      {/* item gaps — the monthly drilldown transcription */}
      <div style={{ ...S.card, borderLeft: `3px solid ${NAVY}`, borderTop: `3px solid ${NAVY}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={S.sec}>Item Gaps — {monthLabel(ym)}</div>
          {gapsSave === "saving" ? <span style={S.chip("#FFF3CD", AMBER)}>Saving…</span> :
           gapsSave === "saved" ? <span style={S.chip("#DCF5E8", GREEN)}>Saved ✓</span> :
           gapsSave === "error" ? <span style={S.chip("#FDE2E2", "#8A1220")}>Save failed — retry</span> : null}
        </div>
        <div style={{ fontSize: 11.5, color: GRAY, marginBottom: 10 }}>
          From the CFA Food Cost Drilldown. Enter only the subcategories that ran <b>over</b> target —
          those are the dollars lost. Leave the under-target lines out. This is what names the focus
          areas on the dashboard Food card.
        </div>
        <div style={{ marginBottom: 10 }}>
          <PasteMonth buttonLabel="Paste the drilldown" accent={NAVY}
            disabled={!gapsOk} disabledNote="Import is off — the record could not be read. Reopen the tile to retry."
            /* ⚠️ MADE-UP NUMBERS, ON PURPOSE (Aug 8 2026). This placeholder used the
               REAL June 2026 figures — Condiments 1680.24, Waffle Potato Fries
               1151.77 — so the store’s actual food-cost leakage shipped in the
               bundle as sample text, and survived the seed being moved
               server-side because nobody looks for live data in a placeholder.
               Round, obviously-fake numbers show the format just as well. */
            placeholder={"DRILLDOWN " + gapPasteYm + " | 1000.00\nCondiments | 500.00\nWaffle Potato Fries | 250.00"}
            onImport={importDrilldown} />
        </div>

        {gapIsOpenMonth && (
          <div style={{ fontSize: 12, color: AMBER, background: "#FFF8E1", border: `1px solid #F0E0A8`, borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>
            {monthLabel(ym)} is still open, so CFA has not published its drilldown yet. The report you have
            is {monthLabel(gapPasteYm)}. Paste it right here. The block names its own month, so it files
            under {monthLabel(gapPasteYm)} without switching tabs. The list below still shows {monthLabel(ym)}.
          </div>
        )}
        {gapFromSeed && (
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 10 }}>
            Showing the built-in list for {monthLabel(ym)}. Adding or removing a line saves your own copy and replaces it.
          </div>
        )}

        {gapItems.length === 0 ? (
          <div style={{ color: GRAY, fontSize: 13.5, marginBottom: 10 }}>
            Nothing entered for {monthLabel(ym)} yet. Add the over-target subcategories below.
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            {gapItems.map((g) => (
              <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13.5 }}>
                <span style={{ flex: 1 }}>{g.name}</span>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmt$(g.gap)}</b>
                <button
                  onClick={() => delGap(g.name)}
                  aria-label={`Remove ${g.name}`}
                  style={{ background: "none", border: "none", color: RED, fontSize: 16, cursor: "pointer", padding: "0 4px" }}
                >×</button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontWeight: 800, fontSize: 14 }}>
              <span>{gapItems.length} line{gapItems.length === 1 ? "" : "s"}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt$(gapSum)}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            style={{ ...S.input, flex: "2 1 190px", minWidth: 0 }}
            placeholder="Subcategory (e.g. Condiments)"
            value={gapName}
            onChange={(e) => { setGapName(e.target.value); if (gapErr) setGapErr(""); }}
          />
          <input
            style={{ ...S.input, flex: "1 1 110px", minWidth: 0, textAlign: "right" }}
            inputMode="decimal"
            placeholder="0.00"
            value={gapAmt}
            onChange={(e) => { setGapAmt(cleanUnsigned(e.target.value)); if (gapErr) setGapErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") addGap(); }}
          />
          <button style={S.btn(NAVY)} onClick={addGap}>Add line</button>
        </div>
        {gapErr && <div style={{ marginTop: 8, fontSize: 12.5, color: RED }}>{gapErr}</div>}

        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Check against the report</div>
              <div style={{ fontSize: 11.5, color: GRAY }}>
                Type the drilldown&rsquo;s own Positive Food Cost Gap. Used to check this sitting, never saved.
              </div>
            </div>
            <input
              style={{ ...S.input, width: 120, textAlign: "right" }}
              inputMode="decimal"
              placeholder="0.00"
              value={gapTarget}
              onChange={(e) => setGapTarget(cleanUnsigned(e.target.value))}
            />
          </div>
          {gapDiff != null && (
            <div style={{ marginTop: 8, fontSize: 13.5, fontWeight: 700, color: gapDiff === 0 ? GREEN : AMBER }}>
              {gapDiff === 0
                ? `Entered ${fmt$(gapSum)} — matches the report to the cent.`
                : `Entered ${fmt$(gapSum)} — ${gapDiff > 0 ? "over" : "under"} the report by ${fmt$(Math.abs(gapDiff))}. A line is missing or an amount is off.`}
            </div>
          )}
        </div>
      </div>


      {/* the math */}
      <div style={S.card}>
        <div style={S.sec}>The Math</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: GRAY }}>Food: {fmt$(n(rec.beginFood))} begin + {fmt$(bk.foodPurch)} purch − {fmt$(bk.gvFood)} giveaways − {fmt$(bk.endFoodEff)} end{bk.endFoodAssumed ? " (assumed)" : ""}</span>
            <b>{fmt$(bk.foodUse)} used</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: GRAY }}>÷ sales {fmt$(salesTotal)}</span>
            <b style={{ color: NAVY }}>{fmtPct(bk.foodPct)} food</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ color: GRAY }}>Paper: {fmt$(n(rec.beginPaper))} + {fmt$(bk.paperPurch)} − {fmt$(bk.gvPaper)} − {fmt$(bk.endPaperEff)}{bk.endPaperAssumed ? " (assumed)" : ""}</span>
            <b>{fmt$(bk.paperUse)} used</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: GRAY }}>÷ sales {fmt$(salesTotal)}</span>
            <b style={{ color: NAVY }}>{fmtPct(bk.paperPct)} paper</b>
          </div>
          {/* ★ THE WORKING ABOVE IS DELIBERATELY STILL SHOWN. Every figure that
              went into the refusal stays on screen — begin, purchases,
              giveaways, ending — because this line is where somebody spots
              which one is wrong. Only the PERCENTAGE is withheld. */}
          {(bk.foodImpossible || bk.paperImpossible) && (
            <div style={{ marginTop: 10, background: "#FDE2E2", border: "1px solid #F2B8B8", borderRadius: 8, padding: "9px 11px", fontSize: 12.5, color: "#8A1220", fontWeight: 700, lineHeight: 1.5 }}>
              {bk.foodImpossible && bk.paperImpossible ? "Food and paper both come out negative." :
               bk.foodImpossible ? "Food comes out negative." : "Paper comes out negative."}
              {" "}That can't happen — it means the giveaway total or the ending inventory above is
              bigger than what was started with plus everything bought. The percentage is being held
              back rather than published wrong; it comes back as soon as the numbers add up.
              Check the line just above this one to see which figure is off.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
