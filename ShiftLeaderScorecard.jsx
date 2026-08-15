import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
/* The one raised look, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
/* Grading thresholds live in the leaf too, so the digest grades identically. */
import { SL_LEAD_SLOTS, SL_METRIC_DEFS, SCAN_GREEN, SCAN_AMBER, TX_BANDS, TX_BANDS_FALLBACK, SOS_GREEN, SOS_RED, AHA_GREEN, AHA_RED } from "./slScorecardDefs.js";
import { kvGetResult, kvGetMany, kvSet, publishSharedRows } from "./store.js";
import PasteMonth from "./PasteMonth.jsx";
/* Monthly AHA off the dashboard. A leaf that imports nothing — see ahaMonthly.js. */
import { AHA_MONTHLY_KEY, parseAhaDashboard, monthFromPage, lastClosedMonth, ahaStatus } from "./ahaMonthly.js";
/* The five scores, in one copy, shared with Food Quality — see AhaScores.jsx.
   Matt, Aug 6 2026: "AHA is quality." The paste stays here because this is
   where the input lives; the reading of it belongs in both places. */
import AhaScores from "./AhaScores.jsx";
// The season pin and score bands live in slScore.js (a leaf) so the
// dashboard reads them without importing this whole tile — that import is
// what kept the Scorecard out of lazy loading. Re-exported for compatibility.
import { SEASON_START, scoreBand, scoreColor } from "./slScore.js";
import { storeCfg, STORE } from "./storeConfig.js"; // the paper goal, read at use time; STORE for the masthead
export { SEASON_START, scoreBand, scoreColor };
import { eosPeriod } from "./eosPeriod.js"; // s4 publish target — quarter-derived, never hardcoded (a frozen "2026-Q3" here goes dark on 10/1).
/* ⚠️⚠️ HR_TEAM IS NO LONGER A ROSTER — IT IS AN EMPTY ARRAY, and reading it is
   what emptied this screen on Aug 11 2026. "Move the roster into storage,
   step 2" deleted the in-code copy, so `RAW_TEAM = []` and therefore
   `TEAM`/`HR_TEAM` are `[]` for everybody, not just for people hired since the
   seed. This file read HR_TEAM directly with no fallback, so the leader list
   came back empty and there was nothing to enter a shift against.
   ⚠️ loadHRTeamResult IS THE RESULT-STYLE LOADER, matching this file's own rule
   at the top: every load goes through a result, never a bare value, so a FAILED
   read is distinguishable from a genuinely empty roster. DailySetup already did
   this and survived the same change; this file was the one that did not. */
import { HR_RANK, loadHRTeamResult } from "./HRConsole.jsx";
// Paper cost % seed. THE SAME FUNCTION FCR AND THE DASHBOARD USE — the formula
// (begin + purchases - giveaways - ending) / sales lives in ONE place and is
// not restated here. Restating it is how two screens end up disagreeing.
import { monthFoodCostPct } from "./FoodCostTracker.jsx";

/* ════════════════════════════════════════════════════════════════
   ShiftLeaderScorecard.jsx — Gate City Hub
   People & Team → Leader Scorecard   (tier 2)

   SLICE 1 — the daily loop.
   Enter each day's operational metrics by daypart; the tool
   attributes every metric to whoever led that daypart and rolls it
   up per leader into a 1-5 coaching score AND a green/amber/red
   flag that feeds the EOS scorecard + Leadership Dev pipeline.

   SCORING SHAPES — three of the six metrics never take a goal:
     sosTime  raw M:SS bands, DERIVED from SOS_GREEN / SOS_RED — never write
              these thresholds into UI copy by hand, they drifted once already.
              Applies to DT SOS, FC SOS. Speed is speed at any daypart.
     ahaPct   % of transactions held < 20 MINUTES (hold time, NOT speed).
              green >= 95 · yellow 90-95 · red < 90.
     scanPct  Good Scans %.  green >= 99 · yellow 96-98 · red < 96.
     txCount  Trans w/o AHA — a raw COUNT with a target of ZERO, so it
              can't be a ratio (v/0 is meaningless). Scores on PER-DAYPART
              count bands (TX_BANDS) instead. See the note there.
     ratio    value vs a per-daypart goal. Only DT Cars + FC Transactions.

   THE CFA SOURCE (Signal → "AHA Hold Time Performance") publishes three
   columns per daypart, all BOH-owned here:
     Good Scans · Trans w/o AHA · % < 20 mins
   "% < 20" is computed ONLY over transactions that HAVE an AHA record;
   "Trans w/o AHA" counts transactions with NO AHA at all and is EXCLUDED
   from that percentage. So 100% <20min alongside 20 trans w/o AHA is
   consistent, not a contradiction — they measure different populations.

   METRIC → LEADER (each metric credits exactly ONE lead slot):
     DT lead      : DT SOS, DT Cars
     FOH lead     : FC SOS, FC Transactions
     BOH leads    : Trans w/o AHA, AHA, Good Scans  (both kitchen slots)
   Nothing is shared between slots.

   COMPOSITE is a WEIGHTED average, re-normalized over whatever metrics
   have data:
     DT  : DT SOS 70 · DT Cars 30
     FOH : FC SOS 70 · FC Transactions 30
     BOH : Trans w/o AHA 50 · AHA 25 · Good Scans 25

   ROSTER — imported live from the HR Console. Everyone Trainer
   through Director (rank 2-5) who isn't terminated shows up. The
   roster REFRESHES: on open, on window focus, on tab switch, on
   opening Manage Roster, and via the Refresh button — so a
   promotion / add / termination in HR never leaves this stale.
   Per-person hide overrides live in gcfcr-sl-meta-v1 keyed by HR id
   and are MERGED on every refresh (never wiped).

   EOS / LD FEED — writes gcfcr-sl-eos-rollup-v1 with each leader's
   composite + RAG, an "independent" flag (composite >= 4.0), and an
   independentCount vs goal. EOSTile reads independentCount as the
   live leading indicator for Kyleeka's Rock #1; the LD tile reads
   the same key for the promotion-ready pipeline.

   TWO CADENCES (only the daily one ships here):
     • Daily   → DT SOS, DT Cars, FC SOS, FC Transactions,
                 Trans w/o AHA, AHA, Good Scans   (this file)
     • Period  → Smart Shop, CEM, 2MS, Trainer Tasks  (store-level, agenda feed)

   STORAGE (store.js → Supabase kv_store, localStorage fallback)
     gcfcr-hr-roles / gcfcr-hr-status → HR Console (read-only here)
     gcfcr-sl-meta-v1               → { [hrId]: { hidden } }
     gcfcr-sl-goals-v1             → { cars, transactions }  (per daypart)
     gcfcr-sl-daily-{YYYY-MM-DD}-v1 → { breakfast:{...}, lunch:{...}, … }
     gcfcr-sl-eos-rollup-v1        → { updated, from, to, goal,
                                       independentCount, scored, leaders }
     gcfcr-sl-agenda-v1            → { updated, from, to, focus:[
                                       { name, station, metric, value, rag,
                                         line } ] }  ← L10 Meeting Focus reads this
   ════════════════════════════════════════════════════════════════ */

const K = {
  hrRoles: "gcfcr-hr-roles",
  hrStatus: "gcfcr-hr-status",
  meta: "gcfcr-sl-meta-v1",
  goals: "gcfcr-sl-goals-v1",
  daily: (d) => `gcfcr-sl-daily-${d}-v1`,
  rollup: "gcfcr-sl-eos-rollup-v1",
  agenda: "gcfcr-sl-agenda-v1",
  paper: "gcfcr-sl-paper-v1",
};


// Who lands on the scorecard: Trainer (2) through Director (5).
const MIN_RANK = 2;
const MAX_RANK = 5;

// "Independent" bar for the EOS/LD feed.
const INDEPENDENT_AT = 4.0;
const INDEPENDENT_GOAL = 3; // Kyleeka Rock #1: develop 3-4 shift leaders

// ── STORE-LEVEL SOS, for the EOS board's s4 row ──────────────────
// Deliberately LEADER-INDEPENDENT. Every other number this file produces is
// "how did this leader do"; s4 asks "how fast was the store," so it averages
// every SOS reading in the window regardless of who was credited — the same
// reasoning as aggActual. A reading with no lead assigned still counts.
//
// ⚠️ JUDGMENT CALL (flagged to Matt, one-line change either way): this is an
// UNWEIGHTED mean of readings — DT and FC pooled, every daypart equal. It is
// NOT transaction-weighted, so a slow breakfast counts as much as a slow lunch
// even though lunch serves far more cars. Volume weighting is possible (cars
// and transactions are captured on the same entry) but it would make the board
// number stop matching the M:SS averages leaders see on their own cards.
// EOS goal is SOS_GREEN, the same threshold this tile scores green on, so board and tile
// call "too slow" at exactly the same point — keep them in sync if either moves.
const SOS_KEYS = ["dtSos", "fcSos"];
const storeSosOver = (days) => {
  let sum = 0, n = 0;
  (days || []).forEach((d) => {
    if (!d) return;
    DAYPARTS.forEach((dp) => {
      const e = d[dp.key]; if (!e) return;
      SOS_KEYS.forEach((k) => {
        const v = parseMSS(e[k]);
        if (v !== null && !Number.isNaN(v)) { sum += v; n += 1; }
      });
    });
  });
  return n ? { avg: sum / n, n } : null;
};

/* Every load below goes through kvGetResult, never kvGet. kvGet returns null
   for BOTH "nothing stored" and "read failed", so a dropped connection used to
   look like an empty record — and the next save would write that emptiness
   over the real data. kvGetResult returns { ok, value }; ok:false is a
   transport failure, and every write path refuses while one is outstanding. */

/* ═══ TYPE + PALETTE ════════════════════════════════════════════
   Fonts load at MODULE SCOPE (a guarded <link>), not in a useEffect —
   same pattern as DailySetup. Archivo carries the headings, Instrument
   Sans the UI, Azeret Mono every number. None of the three are used by
   another Hub tile, so this tile reads as itself.
   ★ COLOUR RULE: indigo is the masthead and nothing else. Teal / amber /
   orange appear ONLY where they mean a score. If it has colour on this
   page, it is telling you how something did. ═══ */
if (typeof document !== "undefined" && !document.getElementById("sl-fonts")) {
  const l = document.createElement("link");
  l.id = "sl-fonts";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Instrument+Sans:wght@400;500;600;700&family=Azeret+Mono:wght@400;500;700&display=swap";
  document.head.appendChild(l);
}
const FONT_DISPLAY = "'Archivo',system-ui,sans-serif";
const FONT_BODY = "'Instrument Sans',-apple-system,BlinkMacSystemFont,sans-serif";
const FONT_MONO = "'Azeret Mono',ui-monospace,'SF Mono',Menlo,monospace";
const INK = "#171523", INK2 = "#4A4560", INK3 = "#807B92";
const PAPER_BG = "#EEEDF3", RULE = "#E3E1EB";
const INDIGO = "#3730A3", INDIGO_DP = "#241C6E";


// Short keys for the composite spine. Kept OUT of METRICS so the metric
// table itself is untouched — this is a label lookup, nothing scores off it.
// Time-of-day tint for the entry card's progress cap. Presentational only.
const DP_TINT = {
  breakfast: "linear-gradient(90deg,#E8A33D,#C77D0A)",
  lunch: "linear-gradient(90deg,#4FA3E3,#2166A8)",
  afternoon: "linear-gradient(90deg,#7B87D6,#3730A3)",
  dinner: "linear-gradient(90deg,#5B4FD6,#241C6E)",
};

const M_SHORT = {
  dtSos: "SOS", cars: "CARS", fcSos: "SOS", transactions: "TX",
  txNoAha: "NOAHA", aha: "AHA", goodScans: "SCAN",
};

/* ═══ DAYPARTS + METRIC CONFIG ══════════════════════════════════ */

const DAYPARTS = [
  { key: "breakfast", label: "Breakfast", window: "6-10:30" },
  { key: "lunch", label: "Lunch", window: "10:30-2" },
  { key: "afternoon", label: "Afternoon", window: "2-5" },
  { key: "dinner", label: "Dinner", window: "5-10" },
];

/* METRIC MODEL
   score: see the SCORING SHAPES block at the top of the file.
   owner: which lead slot the metric credits — "dt" / "foh" / "boh".
     Four lead slots per daypart, pulled straight off the Daily Setup board:
       DT lead      ← FOH board "LEADER DT" row      → DT SOS + DT Cars
       FOH lead     ← FOH board "LEADER FC" row      → FC SOS + FC Transactions
       BOH DT lead  ← BOH board "Machines 1,2,3" row ⎫ both → Trans w/o AHA
       BOH FOH lead ← BOH board "Machines 4,5" row   ⎭        + AHA + Good Scans
     Each metric has exactly ONE owner. The two BOH slots SHARE the owner "boh",
     so both kitchen leads are credited the kitchen numbers for the daypart
     they're named on — and only that daypart.
   w: the metric's weight inside its owner's composite. Weights total 100 per owner:
       dt  → DT SOS 70 · DT Cars 30
       foh → FC SOS 70 · FC Transactions 30
       boh → Trans w/o AHA 50 · AHA 25 · Good Scans 25
     BOH's split is weighted by DISCRIMINATION, not importance: AHA runs 96-100%
     and Good Scans 94-100%, so both are near-permanent green and mostly inflate
     the composite. Trans w/o AHA is the only BOH metric with real spread (0→20)
     and a hard zero target, so it carries half. If the composite ever needs to
     bite harder, 60 · 20 · 20 is the dial.
   NB "Trans w/o AHA" (BOH, a miss COUNT, lower-better, target 0) and
   "FC Transactions" (FOH volume count, higher-better vs goal) are DIFFERENT
   metrics — opposite directions, different leads.
   unit: shown after the value on the scorecard (AHA/Good Scans → "%").
   ORDER = entry flow. The list is grouped by owner (DT → FOH → BOH) so the
   daily entry card reads in the same order as the lead pickers above it and
   you're not jumping between sides while typing. Nothing keys off position —
   scoring and composites read `owner`/`w` — so this list can be reordered
   freely; it only drives the order the fields appear in. */
/* Moved to slScorecardDefs.js so the morning digest reads the SAME table.
   It had its own drifted copy; see that file. Add metrics THERE. */
const METRICS = SL_METRIC_DEFS;

// The lead slots on each daypart. `owner` is the tag matched against a
// METRIC's `owner`; `field` is the id stored on the daypart entry (and the key
// for leadOptions). There is NO per-person station tag — people swap slots by
// daypart (Daisy leads DT at breakfast and FC at lunch), so a fixed tag can
// never be right. A lead is scored on whatever slots they actually filled on
// the board, and every dropdown offers every leader as a manual backup.
// BOH has TWO slots — there are two kitchen leaders at night and on weekends.
// Both share owner "boh", so both are credited the kitchen numbers, and only
// for the daypart they're actually named on. Either may be left blank.
// NB Machines 4,5 is night-only on weekdays (it opens at 5PM Mon-Thu and adds
// an 11-2 block Fri/Sat), so a BLANK "BOH FOH lead" at breakfast/lunch/mid on
// a weekday is CORRECT — the station is closed, nobody led it. Don't hand-pick
// someone into it to fill the gap; that credits them for a shift they weren't on.
const LEAD_SLOTS = SL_LEAD_SLOTS;
// Display tag for a metric's owner — still written into the rollup + agenda
// feeds that other tiles read, but now derived per METRIC instead of from a
// per-person tag.
const OWNER_LABEL = { dt: "DT", foh: "FOH", boh: "BOH" };

// Ratio metrics score against a goal — a metric with no goal scores null and
// drops out of the composite. Goals are PER-DAYPART, because these are raw
// COUNTS that swing hard with the daypart: Mon 7/13 ran 67 DT cars at breakfast
// vs 157 at lunch. One flat goal graded the DAYPART, not the leader — whoever
// led breakfast was red every day just for leading breakfast.
// Only `score: "ratio"` metrics appear here. SOS scores on fixed time bands
// (speed is speed, breakfast or lunch), AHA + Good Scans are percentages
// (already volume-normalized), and Trans w/o AHA has a target of ZERO — which
// is not a ratio at all — so none of those four take a goal.
// Matt's starting numbers (July 15) — a starting point, tuned in the goals
// editor as real data comes in. NB "mid" in his phrasing = the `afternoon` (2-5)
// daypart.
const GOAL_SEED = {
  cars:         { breakfast: 100, lunch: 160, afternoon: 100, dinner: 120 },
  transactions: { breakfast: 50,  lunch: 100, afternoon: 50,  dinner: 75 },
};

// The goal for metric `key` on daypart `dp`. Tolerates the LEGACY FLAT SHAPE —
// a goals record saved before per-daypart goals is a plain number, and applying
// it to every daypart keeps an old KV record working instead of scoring null
// and silently dropping the metric out of everyone's composite.
const goalFor = (goals, key, dp) => {
  const g = goals && goals[key];
  if (g === null || g === undefined || g === "") return "";
  if (typeof g === "object") return g[dp] === undefined ? "" : g[dp];
  return g; // legacy flat number — same goal for every daypart
};

/* ── ADAPTIVE GOALS — per WEEKDAY, on top of per-daypart (Matt, Aug 2 2026) ──
   "Every Sat lunch will only have 115-120 cars but during the week it's more.
   I want a smart system from top to bottom that adapts … apply to every day
   and daypart."

   Per-daypart goals fixed grading-the-daypart (Jul 15). This fixes the same
   disease one level deeper: one flat lunch goal graded the WEEKDAY — a
   Saturday lunch lead was red every Saturday against a Tuesday-sized number.

   The bar for a ratio metric (DT Cars, FC Transactions — the DEMAND counts a
   leader does not control) is now the store's own normal for that exact
   weekday + daypart: the MEDIAN of the last 6 same-weekday entries out of the
   scorecard's own history, once at least 3 exist. Until then, the hand-set
   goal applies unchanged. The controllable metrics (SOS, AHA, scans) keep
   their fixed bands on purpose — speed is speed on any weekday.

   ⚠️ THE FLOOR IS 60% OF THE HAND-SET GOAL, NOT 100%. A floor at the full
   goal would un-fix the exact case that started this: max(118 Sat normal,
   160 goal) = 160, Saturday red forever. 60% lets the bar meet a genuinely
   slower weekday while a chronically sliding shift can never drag it below
   more than that. Median, not mean, so one blowout day cannot move the bar. */
const ADAPT_LOOKBACK = 6;   // same-weekday days considered
const ADAPT_MIN_N = 3;      // entries required before history outranks the hand-set goal
const ADAPT_FLOOR = 0.6;    // × the hand-set goal — the lowest history may take the bar
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const wdOf = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
const sameWeekdayBefore = (iso, n) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const p = new Date(base);
    p.setDate(base.getDate() - 7 * i);
    out.push(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}-${String(p.getDate()).padStart(2, "0")}`);
  }
  return out;
};
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/* History medians for every ratio metric × daypart × weekday touched by
   `dates`. One kvGetMany for ALL the prior-week records — 36 keys is still a
   couple of round trips, not 36. Anchor per weekday = the EARLIEST date of
   that weekday in the window, so a window never reads its own days as its own
   history. A failed batch read simply yields fewer samples; below ADAPT_MIN_N
   the hand-set goal quietly takes over — adaptive goals degrade, never block. */
async function fetchGoalHistory(dates) {
  const earliestByWd = {};
  for (const d of dates || []) {
    if (!d) continue;
    const wd = wdOf(d);
    if (!earliestByWd[wd] || d < earliestByWd[wd]) earliestByWd[wd] = d;
  }
  const wanted = [];   // [{ wd, key }]
  for (const wd of Object.keys(earliestByWd)) {
    for (const iso of sameWeekdayBefore(earliestByWd[wd], ADAPT_LOOKBACK)) {
      wanted.push({ wd: Number(wd), key: K.daily(iso) });
    }
  }
  if (!wanted.length) return {};
  const reads = await kvGetMany(wanted.map((w) => w.key));
  const samples = {};   // "metric|dp|wd" -> [values]
  for (const { wd, key } of wanted) {
    const rec = reads[key] && reads[key].ok ? reads[key].value : null;
    if (!rec || typeof rec !== "object") continue;
    for (const dp of DAYPARTS) {
      const e = rec[dp.key];
      if (!e) continue;
      for (const m of METRICS) {
        if (m.score !== "ratio") continue;
        const raw = e[m.key];
        const n = raw === "" || raw === null || raw === undefined ? null : Number(raw);
        if (n === null || Number.isNaN(n)) continue;
        (samples[`${m.key}|${dp.key}|${wd}`] = samples[`${m.key}|${dp.key}|${wd}`] || []).push(n);
      }
    }
  }
  const hist = {};
  for (const k of Object.keys(samples)) {
    if (samples[k].length >= ADAPT_MIN_N) hist[k] = median(samples[k]);
  }
  return hist;
}

// The bar actually used: weekday history when it exists, hand-set otherwise,
// never below ADAPT_FLOOR × the hand-set goal. Returns "" like goalFor when
// there is nothing to score against.
const smartGoal = (goals, hist, key, dp, wd) => {
  const hand = goalFor(goals, key, dp);
  const med = hist && wd !== null && wd !== undefined ? hist[`${key}|${dp}|${wd}`] : undefined;
  if (med === undefined || med === null) return hand;
  const handN = hand === "" ? null : Number(hand);
  return handN === null || Number.isNaN(handN) ? med : Math.max(med, Math.round(handN * ADAPT_FLOOR));
};

// AHA bands (% under 20 MIN hold, higher is better): green >= 95 · yellow 90-95 · red < 90
/* AHA thresholds live in slScorecardDefs.js too. */

// Good Scans bands (%, higher is better), Matt July 15: green 100-99 ·
// amber 98-96 · red 95 or less. Written as >= thresholds so a decimal
// (98.5) can't fall through the gap between two written ranges.

/* TRANS W/O AHA — PER-DAYPART COUNT BANDS.
   The target is ZERO (Matt, July 15: "the goal is no trans"), so this can't be
   a ratio: v/0 is meaningless, and treating 0 as "no goal" would silently drop
   the metric out of every BOH composite with no error shown.
   Bands are per-daypart because lunch carries ~3x the transaction volume of
   breakfast — 20 misses at lunch is a lower RATE than 4 at breakfast, so a flat
   band would paint every lunch lead red for leading lunch while afternoon and
   dinner leads sit green for free. (A true rate — misses ÷ transactions — would
   normalize this properly, but the CFA report publishes a count, not a rate,
   so that needs a denominator nobody wants to type. Per-daypart bands are the
   cheap proxy.)
   ⚠️ Matt supplied the LUNCH set (green 0-5 · amber 6-15 · red >15). The other
   three are Claude's, EXTRAPOLATED FROM ONE DAY of real data — bf 4 · lunch 20 ·
   afternoon 0 · dinner 0. Thin evidence. Expect to retune here once August has
   real spread; this is the only place these numbers live.
   `green` = at-or-under scores 5 · `amber` = at-or-under scores 3 · else 1.
   Open-topped on purpose: a 40 is red, not off the end of a range. */

/* ── PAPER COST % — a KPI PILL, not a scored metric ───────────────
   Paper cost is a STORE-level weekly number off the FCR report. It is NOT
   attributable to one lead's daypart, so it deliberately stays out of
   METRICS: adding it there would force a re-split of composite weights that
   are settled at 100 per owner, and would credit or punish a lead for a
   number they only partly drive. It reads as a pill in the masthead so it
   sits in front of leaders every day, which is the whole point of the IPO
   action item ("add paper cost % to weekly shift leader scorecard").
   GOAL 3.27% is the CFA target from the Q3 IPO report (actual ran 3.74%). ── */
/* ★ FROM storeConfig.js (step 2, Aug 11 2026). Same 3.27.
   ⚠️ inputRegistry.js DECLARED THIS SAME NUMBER SEPARATELY and neither file
   knew about the other. Both read the config now, so the scorecard cannot
   grade a week against one paper goal while the input register chases another.
   ⚠️ The band was duplicated the same way (PAPER_BAND in inputRegistry.js, same
   0.25, different name) and is fixed now too. It grades the same figure, so a
   drift there meant this card could call a week amber while the input register
   called it red. */
const paperGoal = () => storeCfg("financial.goals.paper");
// at or under goal = green; up to +0.25 = watch; above = red
const paperAmberBand = () => storeCfg("financial.paperBand");
const paperRag = (pct) => {
  if (pct === null || pct === undefined || pct === "" || !isFinite(Number(pct))) return "gray";
  const v = Number(pct);
  if (v <= paperGoal()) return "green";
  if (v <= paperGoal() + paperAmberBand()) return "amber";
  return "red";
};

/* ═══ M:SS parsing / formatting ═════════════════════════════════ */

const pad2 = (v) => String(v).padStart(2, "0");

// "3:44" → 224 ; "224" → 224 ; blank/garbage → null
function parseMSS(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  if (s.includes(":")) {
    const parts = s.split(":");
    const m = Number(parts[0]);
    const sec = Number(parts[1]);
    if (Number.isNaN(m) || Number.isNaN(sec)) return null;
    return m * 60 + sec;
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : n; // bare number read as seconds
}
function fmtMSS(sec) {
  if (sec === null || sec === undefined) return "—";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/* ═══ SCORING (dual: 1-5 + RAG) ═════════════════════════════════ */

/* Matt, Jul 25 (corrected from his first "under 2:30"): "Under 2 good, 2-5
   middle and over 5 bad." So GREEN is UNCHANGED at 2:00 and only the red edge
   moves, 3:30 → 5:00 — the middle band widens rather than the good one loosening.
   ★ That matters beyond this tile: SOS_GREEN is ALSO the EOS s4 goal published
   to the L10 board (see the publish below), so leaving it at 120 keeps that
   board's goal at ≤2:00 exactly as it is today. Nothing Nick sees changes.
   5:00 exactly reads amber, matching the existing `<` green / `<=` amber
   convention rather than inventing a third rule. */
/* ⚠️ IMPORTED, NOT DECLARED. aiSummary.js kept its own copy and sat a quarter
   behind at 210, so the digest and this tile disagreed about the same shift.
   One home now: slScorecardDefs.js. */

const bandRag = (sub) => (sub >= 4 ? "green" : sub === 3 ? "amber" : "red");

// `dp` is the daypart key the value came from. Only txCount needs it (its
// bands are per-daypart), but it's on the signature so any future
// daypart-sensitive band scorer doesn't have to re-thread it.
function scoreMetric(cfg, value, goal, dp) {
  if (value === null || value === undefined || value === "") return null;

  if (cfg.score === "sosTime") {
    const v = Number(value); // seconds
    if (Number.isNaN(v)) return null;
    if (v < SOS_GREEN) return { sub: 5, rag: "green" };
    if (v <= SOS_RED) return { sub: 3, rag: "amber" };
    return { sub: 1, rag: "red" };
  }

  if (cfg.score === "ahaPct") {
    const v = Number(value); // percent, higher is better
    if (Number.isNaN(v)) return null;
    if (v >= AHA_GREEN) return { sub: 5, rag: "green" };
    if (v >= AHA_RED) return { sub: 3, rag: "amber" };
    return { sub: 1, rag: "red" };
  }

  if (cfg.score === "scanPct") {
    const v = Number(value); // percent, higher is better
    if (Number.isNaN(v)) return null;
    if (v >= SCAN_GREEN) return { sub: 5, rag: "green" };
    if (v >= SCAN_AMBER) return { sub: 3, rag: "amber" };
    return { sub: 1, rag: "red" };
  }

  // txCount — a raw miss count against per-daypart bands, target zero.
  // No goal, no denominator, nothing to divide.
  if (cfg.score === "txCount") {
    const v = Number(value);
    if (Number.isNaN(v)) return null;
    const b = TX_BANDS[dp] || TX_BANDS_FALLBACK;
    if (v <= b.green) return { sub: 5, rag: "green" };
    if (v <= b.amber) return { sub: 3, rag: "amber" };
    return { sub: 1, rag: "red" };
  }

  // ratio (DT Cars / FC Transactions — value vs a per-daypart goal)
  if (goal === null || goal === undefined || goal === "") return null;
  const v = Number(value), g = Number(goal);
  if (Number.isNaN(v) || Number.isNaN(g)) return null;
  if (g === 0) return null; // no ratio metric should carry a zero goal
  const r = v / g;
  let sub;
  if (cfg.dir === "low") {
    if (r <= 0.9) sub = 5;
    else if (r <= 1.0) sub = 4;
    else if (r <= 1.1) sub = 3;
    else if (r <= 1.25) sub = 2;
    else sub = 1;
  } else {
    if (r >= 1.05) sub = 5;
    else if (r >= 1.0) sub = 4;
    else if (r >= 0.92) sub = 3;
    else if (r >= 0.85) sub = 2;
    else sub = 1;
  }
  return { sub, rag: bandRag(sub) };
}

const RAG_COLOR = { green: "#0F766E", amber: "#C77D0A", red: "#DD0031", gray: "#9CA3AF" };
const RAG_LABEL = { green: "On track", amber: "Watch", red: "Off track", gray: "No data" };

// A composite (or an averaged metric sub) → its RAG. One function, used for
// BOTH the per-metric dots and the leader's status chip, so the number and the
// words can never disagree.
// This REPLACES rollupRag() on the leader row. rollupRag was any-red-means-red:
// a leader at composite 3.0 with one red metric rendered an AMBER score pill
// next to a RED "Off track" chip — two different scoring systems on one row,
// and the "Watch" tier could never appear. Same reason per-metric rag already
// avoided rollupRag: over a month, one bad daypart out of twenty shouldn't
// paint the whole person red.
const ragOfScore = (s) => (s === null || s === undefined ? "gray" : s >= 4 ? "green" : s >= 3 ? "amber" : "red");

// The composite number → a plain word a leader understands, plus a one-line
// explanation. FOUR bands off the actual composite (finer than the 3-band RAG,
// because leaders see the number): Strong 4.5+ · On track 3.5-4.4 · Watch
// 2.5-3.4 · Needs work <2.5. Every metric scores 5/3/1 (on goal / watch / off
// goal) and the composite is the weighted average across the shifts they led —
// so 3.5 = "mostly on goal, a metric or two to sharpen."
// ⚠️ BAND WORDS ARE DELIBERATELY THE CLIMB LANGUAGE, not the old
// Strong/On track/Watch/Needs work set. Leaders were reading the 1-5 number as


/* ═══ DATES ═════════════════════════════════════════════════════ */

const fmtKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseKey = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => fmtKey(new Date());

function mondayOf(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function datesInRange(fromKey, toKey) {
  const out = [];
  let d = parseKey(fromKey);
  const end = parseKey(toKey);
  while (d <= end) { out.push(fmtKey(d)); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
  return out;
}
function fmtNice(key) {
  return parseKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
const clampStart = (key) => (key < SEASON_START ? SEASON_START : key);

/* ── SUNDAY IS NOT A BUSINESS DAY ────────────────────────────────────────
   Matt, Jul 25: "remove Sunday from the leader scorecard because I just input
   a whole day and wasted my time." The store is closed Sundays, so a Sunday
   entry has no shift, no leads and no numbers — but the date nav stepped onto
   it like any other day and the form rendered exactly the same, so there was
   nothing on screen to say the day couldn't count. Hiding the fields wouldn't
   have been enough; the day has to be unreachable.
   `stepOpenDate` walks in the requested direction PAST Sunday and returns null
   when there is nowhere valid to land, so the ‹ › buttons disable instead of
   sitting there doing nothing. The 8-step cap is a guard against an infinite
   loop if these rules are ever widened (e.g. holidays) and a range closes
   entirely. */
const isClosedDay = (key) => parseKey(key).getDay() === 0;
const stepOpenDate = (key, delta) => {
  let d = parseKey(key);
  for (let i = 0; i < 8; i++) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
    const k = fmtKey(d);
    if (k < SEASON_START || k > todayKey()) return null;
    if (!isClosedDay(k)) return k;
  }
  return null;
};
/* Opening date: never land on a Sunday. Step BACK to Saturday rather than
   forward, so opening the tile on a Sunday shows the last day that actually
   had a shift instead of jumping to a Monday that hasn't happened. */
const clampOpen = (key) => {
  let k = clampStart(key);
  for (let i = 0; i < 8 && isClosedDay(k); i++) {
    const d = parseKey(k);
    k = clampStart(fmtKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)));
  }
  return k;
};

/* ═══ DAILYSETUP AUTO-BOARD PREFILL ═════════════════════════════
   Reads the Daily Setup Auto Assignment board and pre-fills the lead
   dropdowns for each daypart. Additive only — fills EMPTY picks,
   never overwrites a saved or hand-picked lead.

   CROSS-STORAGE: Daily Setup writes its board to window.storage (shared
   Worker storage), NOT store.js/kvGet. So we read it with the SAME call
   Daily Setup uses — window.storage.get(key, true) — instead of kvGet,
   which reads a different backend and wouldn't see the board.

   SHAPE (mirrors DailySetup.jsx):
     key   : gcfcr-dailysetup-{foh|boh}-v2-{MondayISO}-auto
     board : { Monday:{…}, Tuesday:{…}, … }  ← by full weekday name
     FOH day board : { stations: [ { role, breakfast, lunch, mid, night }, … ] }
     BOH day board : { sections: [ { stations: [ …same row shape… ] }, … ] }
     columns       : breakfast · lunch · mid · night
   The board only carries names AFTER that day is imported in Auto mode;
   un-imported days read empty and simply prefill nothing. */

const SL_SHIFT_KEYS = ["breakfast", "lunch", "mid", "night"];
// scorecard daypart → board column
const DP_TO_SHIFT = { breakfast: "breakfast", lunch: "lunch", afternoon: "mid", dinner: "night" };
const stripCheck = (s) => (s || "").replace(/✔️|✔/g, "").trim();

function slExtractLeaderMap(stations, test) {
  const row = (stations || []).find((s) => test(s.role));
  if (!row) return null;
  const m = {};
  SL_SHIFT_KEYS.forEach((k) => { m[k] = stripCheck(row[k]); });
  return m;
}
// first name (+ optional last initial) from a board cell like
// "Thania 6a-2p", "Thania H.", "Karla ✔️", "Jamar @11 / Dee"
function slOccupant(cell) {
  let s = stripCheck(cell);
  if (!s) return null;
  s = s.split(/[\/@(]/)[0].trim(); // drop handoff, @time, (hours)
  const toks = s.split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const first = (toks[0] || "").replace(/[^A-Za-z'-]/g, "").toLowerCase();
  if (!first) return null;
  let lastInit = null;
  if (toks[1]) { const mm = toks[1].match(/^([A-Za-z])\.?$/); if (mm) lastInit = mm[1].toLowerCase(); }
  return { first, lastInit };
}
// match a cell to exactly one person in the roster pool → their HR id, else null
function slMatchId(cell, pool) {
  const o = slOccupant(cell);
  if (!o) return null;
  const firstOf = (n) => (n.split(/\s+/)[0] || "").toLowerCase();
  const lastInitOf = (n) => { const p = n.split(/\s+/); const l = p[p.length - 1] || ""; return (l[0] || "").toLowerCase(); };
  const cands = pool.filter((p) => firstOf(p.name) === o.first);
  if (cands.length === 1) return cands[0].id;
  if (cands.length > 1 && o.lastInit) {
    const nn = cands.filter((p) => lastInitOf(p.name) === o.lastInit);
    if (nn.length === 1) return nn[0].id;
  }
  return null; // ambiguous or unmatched → leave the slot for manual pick
}
async function slReadBoard(side, weekStart) {
  try {
    if (typeof window === "undefined" || !window.storage) return null;
    const r = await window.storage.get(`gcfcr-dailysetup-${side}-v2-${weekStart}-auto`, true);
    return r && r.value ? JSON.parse(r.value) : null;
  } catch { return null; }
}
// Four lead maps off the boards, one per slot:
//   DT  ← FOH board "LEADER DT" row · FOH ← FOH board "LEADER FC" row
//   BOH DT ← BOH board Machines 1,2,3 · BOH FOH ← BOH board Machines 4,5
// Each is { breakfast, lunch, mid, night } of raw cell text, or null if the row
// isn't on that day's board.
function slDtLeadMap(dayBoard) {
  if (!dayBoard) return null;
  return slExtractLeaderMap(dayBoard.stations, (r) => /^LEADER DT/i.test(r));
}
function slFohLeadMap(dayBoard) {
  if (!dayBoard) return null;
  return slExtractLeaderMap(dayBoard.stations, (r) => /^LEADER FC/i.test(r));
}
// The two kitchen leaders come off the BOH board's MACHINES rows, NOT the
// Kitchen Lead / Kitchen Manager leadership rows. VERIFIED against
// stationTemplates.js — roleOf() builds these rows literally as:
//   "Machines 1,2,3 — DT Lead (8:30AM-11PM)"
//   "Machines 4,5 / Grills — FOH Lead (5PM-11PM)"
// Match on the LEAD LABEL, not the machine numbers: the numbers are incidental
// and the label survives someone renumbering machines.
// Matt: "Machines 123 is BOH DT lead and machine2 45 is BOH fc lead."
const BOH_DT_ROW = /machines?\b.*\bDT\s*Lead\b/i;
const BOH_FC_ROW = /machines?\b.*\b(FOH|FC)\s*Lead\b/i;
function slBohMachinesMap(dayBoard, re) {
  if (!dayBoard) return null;
  const all = (dayBoard.sections || []).flatMap((s) => s.stations || []);
  return slExtractLeaderMap(all, (r) => re.test(r));
}
// { [daypartKey]: { dtLeadId, fohLeadId, bohLeadId, bohLead2Id } }, or null.
// `leads` is the single active roster — every slot matches against everyone,
// since there's no per-person station tag to narrow by.
async function slComputeFills(dateKey, leads) {
  const weekStart = fmtKey(mondayOf(parseKey(dateKey)));
  const dayName = parseKey(dateKey).toLocaleDateString("en-US", { weekday: "long" });
  const [fohWeek, bohWeek] = await Promise.all([slReadBoard("foh", weekStart), slReadBoard("boh", weekStart)]);
  if (!fohWeek && !bohWeek) return null;
  const fohDay = fohWeek && fohWeek[dayName];
  const bohDay = bohWeek && bohWeek[dayName];
  const maps = {
    dtLeadId: slDtLeadMap(fohDay),
    fohLeadId: slFohLeadMap(fohDay),
    bohLeadId: slBohMachinesMap(bohDay, BOH_DT_ROW),
    bohLead2Id: slBohMachinesMap(bohDay, BOH_FC_ROW),
  };
  if (!Object.values(maps).some(Boolean)) return null;
  const fills = {};
  DAYPARTS.forEach((dp) => {
    const sk = DP_TO_SHIFT[dp.key];
    const entry = {};
    LEAD_SLOTS.forEach((slot) => {
      const cell = maps[slot.field] && maps[slot.field][sk];
      if (!cell) { entry[slot.field] = null; return; }
      entry[slot.field] = slMatchId(cell, leads || []);
    });
    fills[dp.key] = entry;
  });
  return fills;
}
// apply fills to a day, filling ONLY empty lead slots (never overwrites)
function mergeFills(day, fills) {
  const next = { ...day };
  DAYPARTS.forEach((dp) => {
    const cur = { ...(next[dp.key] || {}) };
    const f = fills[dp.key] || {};
    let ch = false;
    LEAD_SLOTS.forEach((slot) => {
      if (!cur[slot.field] && f[slot.field]) { cur[slot.field] = f[slot.field]; ch = true; }
    });
    if (ch) next[dp.key] = cur;
  });
  return next;
}

/* ═══ STYLES ════════════════════════════════════════════════════ */

const S = {
  page: { padding: "0 20px 60px", maxWidth: 1240, margin: "0 auto", minHeight: "100vh", background: PAPER_BG, fontFamily: FONT_BODY, color: INK },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  h1: { fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800, margin: 0, color: INK },
  sub: { fontSize: 12, color: INK3, margin: "4px 0 12px", lineHeight: 1.5 },
  tabs: { display: "flex", gap: 6, marginBottom: 14 },
  tab: (on) => ({ flex: 1, border: "none", background: on ? "#fff" : "rgba(255,255,255,.10)", color: on ? INDIGO_DP : "#C3BEF2", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_BODY }),
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", background: cardSurface(), border: `1px solid ${RULE}`, borderRadius: 12, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, padding: "8px 10px", marginBottom: 14 },
  navBtn: (dis) => ({ border: `1px solid ${RULE}`, background: "#fff", borderRadius: 9, width: 34, height: 34, fontSize: 15, cursor: dis ? "default" : "pointer", color: dis ? "#D1CFDA" : INK2 }),
  barLabel: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: INK },
  /* ★ TINTED, AND IT CARRIES THE STRIP (Matt, Aug 4 2026: "these are blocked at
     the edge"). Two things were off. `cardSurface()` with no tint is white
     fading to transparent, which over a white card is a gradient nobody can see
     — the same nothing-happened mistake as the first 3% version. And this style
     had the shadow but never the 3px edge, so the daypart cards were the only
     big surfaces on the screen with no strip at all while `bar` right above them
     had one. */
  card: { backgroundColor: "#fff", backgroundImage: cardSurface(ACCENT_NEUTRAL, 0.5), border: `1px solid ${RULE}`, borderRadius: 15, padding: 16, marginBottom: 12, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D },
  cardHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 },
  name: { fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em", color: INK },
  stationTag: (foh) => ({ marginLeft: 8, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.11em", color: INK3, background: "none", border: `1px solid ${RULE}`, borderRadius: 4, padding: "2px 5px" }),
  badge: (c) => ({ fontFamily: FONT_MONO, color: c, fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em" }),
  ragChip: (c) => ({ background: c, color: "#fff", borderRadius: 999, padding: "3px 10px", fontWeight: 700, fontSize: 11.5, marginLeft: 8 }),
  dpHead: { fontFamily: FONT_DISPLAY, fontSize: 14.5, fontWeight: 700, color: INK, margin: 0 },
  dpWin: { fontFamily: FONT_MONO, fontSize: 10, color: INK3, marginLeft: 7, fontWeight: 400 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid #F2F1F6" },
  label: { fontSize: 12.5, color: INK2 },
  metricVal: { display: "flex", alignItems: "center", gap: 9 },
  cellVal: { fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: INK, minWidth: 62, textAlign: "right" },
  dot: (c) => ({ width: 7, height: 7, borderRadius: "50%", background: c, flex: "0 0 auto" }),
  sel: { border: `1px solid ${RULE}`, borderRadius: 9, padding: "8px 10px", fontSize: 13.5, background: "#fff", color: INK, maxWidth: 190, fontFamily: FONT_BODY },
  inNum: { border: `1px solid ${RULE}`, borderRadius: 9, padding: "9px 11px", fontSize: 15, width: 96, textAlign: "right", fontFamily: FONT_MONO, fontWeight: 600, background: "#FBFBFD", color: INK },
  leadRow: { display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  leadSummary: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 9 },
  leadEdit: { flexShrink: 0, background: "#fff", border: `1px solid ${RULE}`, borderRadius: 7, padding: "5px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: INDIGO, whiteSpace: "nowrap", fontFamily: FONT_BODY },
  leadCol: { display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 150 },
  smallLbl: { fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.09em", color: INK3 },
  metricEntry: { display: "flex", alignItems: "center", gap: 12, padding: "5px 0" },
  prim: { border: "none", background: INDIGO, color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT_BODY },
  ghost: { border: `1px solid ${RULE}`, background: "#fff", color: INK2, borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT_BODY },
  footer: { display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" },
  saved: { fontSize: 12, color: INK3 },
  empty: { color: INK3, fontSize: 13, padding: "10px 0" },
  goalRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid #F2F1F6" },
  seg: { display: "flex", gap: 6, marginBottom: 12 },
  segBtn: (on) => ({ flex: 1, border: `1px solid ${on ? INDIGO : RULE}`, background: on ? "#fff" : "transparent", color: on ? INDIGO : INK3, borderRadius: 9, padding: "8px 0", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT_BODY }),
  toggle: (foh) => ({ border: `1px solid ${RULE}`, background: "#fff", color: INK2, borderRadius: 999, padding: "3px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", minWidth: 48 }),
  hideBtn: (hidden) => ({ border: "none", background: "transparent", color: hidden ? INDIGO : INK3, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", fontWeight: 600 }),
  rosterRow: (hidden) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #F2F1F6", opacity: hidden ? 0.5 : 1 }),
  roleLbl: { fontFamily: FONT_MONO, fontSize: 10, color: INK3 },
  note: { fontSize: 11.5, color: INK3, marginTop: 8, lineHeight: 1.5 },
  refresh: { border: "none", background: "transparent", color: INDIGO, fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  eosBar: { display: "flex", alignItems: "center", justifyContent: "space-between", background: cardSurface(), border: `1px solid ${RULE}`, borderRadius: 12, boxShadow: CARD_3D, padding: "9px 12px", marginBottom: 12 },

  /* ── standings rail ── */
  railName: { fontFamily: FONT_DISPLAY, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  railScore: { fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, textAlign: "right" },
  railScaleTick: (l) => ({ position: "absolute", left: `${l}%`, transform: "translateX(-50%)", fontFamily: FONT_MONO, fontSize: 9, color: INK3 }),

  /* ── composite spine ── */
  spineCap: { fontSize: 11, color: INK3, marginTop: 9, lineHeight: 1.45 },

  /* ── daily entry field ── */
  fieldLbl: { fontSize: 13, color: INK },
  fieldHint: { display: "block", fontFamily: FONT_MONO, fontSize: 9.5, color: INK3, marginTop: 1 },
  ownerHead: { display: "flex", alignItems: "center", gap: 8, padding: "11px 0 3px" },
  ownerWord: { fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.13em", color: INK3 },
  ownerRule: { flex: 1, height: 1, background: "#F2F1F6" },
  dpFoot: { display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid #F2F1F6", fontSize: 11, color: INK3 },
};

/* ═══ COMPONENT ═════════════════════════════════════════════════ */

// `initialDate` (ISO yyyy-mm-dd, optional) — the date to open Daily Entry on.
// App.jsx's Today-block task passes the previous business day it's nagging
// about, so tapping "Mon 7/13 leader scorecard not entered" lands ON 7/13
// instead of today (which meant tapping ‹ back every single time). Clamped to
// SEASON_START like any other date, and only an INITIAL value — the date nav
// still moves freely once you're in.
// `tier` (number, optional) — the viewer's access tier, passed by App.jsx.
// Tier 3+ (directors) get the full tool: Daily Entry, Save Day, Set goals,
// Roster, and the per-daypart "Edit leaders" override. Tier 2 (shift leaders)
// get VIEW-ONLY — the Scorecard page and nothing that writes. Entry stays with
// directors so the numbers have one owner. Defaults to 3 when the prop is
// absent, so any caller that doesn't pass tier keeps today's full behaviour
// rather than silently locking itself out.
export default function ShiftLeaderScorecard({ initialDate, tier } = {}) {
  const canEdit = (tier === null || tier === undefined ? 3 : tier) >= 3;
  const [tab, setTab] = useState(canEdit ? "entry" : "scorecard"); // "entry" | "scorecard"
  const [roster, setRoster] = useState(null); // [{ id, name, role, active }]
  const [meta, setMeta] = useState({});       // { [hrId]: { hidden } }
  const [goals, setGoals] = useState(GOAL_SEED);
  const [manage, setManage] = useState(false);
  const [editLeads, setEditLeads] = useState({}); // { [daypartKey]: true } — reveal that daypart's lead dropdowns (override)
  const [explainOpen, setExplainOpen] = useState({}); // { [leaderId]: true } — reveal the score explainer on that leader's card
  const [rosterAt, setRosterAt] = useState(null);

  // Read/write health. cfgFailed = one of the loadRoster reads (roles, status,
  // meta, goals, paper) came back ok:false — every write to those keys refuses
  // until a clean re-read, or a save would erase what is really stored.
  // cfgSaveErr = a goals/paper/roster write returned false after a clean load.
  // Refs mirror the state for closures (timers, memoized callbacks).
  const [cfgFailed, setCfgFailed] = useState(false);
  const cfgFailedRef = useRef(false);
  const [cfgSaveErr, setCfgSaveErr] = useState(false);
  const [rollupWarn, setRollupWarn] = useState(false);

  // Paper cost % — one number per week, keyed by that week's Monday.
  const [paper, setPaper] = useState({}); // { [mondayISO]: number }
  /* Monthly AHA dashboard, one record per closed month. Kept RAW: the import
     writes the whole map back, so a failed read must never become the write
     base or every other month is erased. `ahaOk` gates the import for exactly
     that reason, the same guard the food-gap import uses. */
  const [ahaAll, setAhaAll] = useState({});
  const [ahaOk, setAhaOk] = useState(false);
  // Live MONTH-TO-DATE paper % off the Food Cost tracker, used as the SEED when
  // no weekly number has been typed. { ym, pct } | null — pct is already in
  // percent points (3.78), not a ratio.
  const [paperLive, setPaperLive] = useState(null);
  // true = the month's paper figure was REFUSED as impossible, not merely absent
  const [paperBad, setPaperBad] = useState(false);

  // entry state
  const [dateKey, setDateKey] = useState(() => clampOpen(initialDate || todayKey()));
  const [day, setDay] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  // dayFailed = the read for the CURRENT dateKey came back ok:false. The real
  // record may exist, so every save of this date refuses until it loads clean.
  const [dayFailed, setDayFailed] = useState(false);
  const dayFailedRef = useRef(false);
  const [saveErr, setSaveErr] = useState(false); // last day-save returned false
  const prefilledRef = useRef({});             // { [dateKey]: true } — prefill ran once
  const poolsRef = useRef([]);                 // latest active roster for the load effect

  // scorecard state
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [dpActuals, setDpActuals] = useState({}); // { [metricKey]: { [dpKey]: { sum, n } } } — window actual averages for the goals editor hint
  const [showGoals, setShowGoals] = useState(false);

  /* ── build/refresh the roster from HR Console (+ local overrides) ──
     Re-reads roles/status/meta from KV every call, so promotions and
     terminations in HR show up. Overrides in meta are merged, not wiped. */
  const loadRoster = useCallback(async () => {
    const [rolesR, statusR, mR, gR, pcR, teamR] = await Promise.all([
      kvGetResult(K.hrRoles), kvGetResult(K.hrStatus), kvGetResult(K.meta), kvGetResult(K.goals), kvGetResult(K.paper),
      /* The roster itself, from storage. Joined to the same Promise.all rather
         than awaited separately so the page still costs one round trip. */
      loadHRTeamResult().catch(() => ({ ok: false, team: [] })),
    ]);
    // Any failed read: still render with fallbacks so the page stays readable,
    // but flag it — the banner shows and goals/paper/roster writes refuse.
    // Re-runs on focus and tab switch, so the flag clears itself once a
    // re-read comes back clean.
    /* ⚠️ A FAILED ROSTER READ COUNTS AS A FAILURE HERE TOO. cfgFailed makes the
       banner show and makes goals/paper/roster writes refuse — which is exactly
       right for a roster that could not be read, because scoring or hiding
       people against a list we never saw is how the wrong person gets credited. */
    const failed = !rolesR.ok || !statusR.ok || !mR.ok || !gR.ok || !pcR.ok || !teamR.ok;
    cfgFailedRef.current = failed;
    setCfgFailed(failed);
    const rolesMap = rolesR.value, statusMap = statusR.value, m = mR.value, g = gR.value, pc = pcR.value;
    setPaper(pc && typeof pc === "object" ? pc : {});
    /* Monthly AHA, read on its own so a failure here cannot block the page.
       ⚠️ `ahaOk` GATES THE IMPORT. The import writes the whole month map back,
       so importing off a failed read would erase every month already stored.
       Same guard the food-gap drilldown import uses, for the same reason. */
    try {
      const ar = await kvGetResult(AHA_MONTHLY_KEY);
      setAhaOk(!!ar.ok);
      setAhaAll(ar.ok && ar.value && typeof ar.value === "object" ? ar.value : {});
    } catch { setAhaOk(false); }
    const rm = rolesMap || {}, sm = statusMap || {};
    const mm = m && typeof m === "object" ? m : {};
    setMeta(mm);
    setGoals(g && typeof g === "object" ? { ...GOAL_SEED, ...g } : GOAL_SEED);

    const list = (Array.isArray(teamR.team) ? teamR.team : [])
      .filter((p) => sm[p.id] !== "terminated")
      .map((p) => ({ id: p.id, name: p.name, role: rm[p.id] || p.role }))
      .filter((p) => { const r = HR_RANK[p.role] || 0; return r >= MIN_RANK && r <= MAX_RANK; })
      .map((p) => ({
        ...p,
        // No station tag. People swap slots by daypart, so a fixed per-person
        // DT/FOH/BOH tag can never be right — a lead is scored on whatever
        // slots they actually filled on the Daily Setup board. `hidden` (from
        // the old meta) still hides anyone who doesn't lead shifts.
        active: !(mm[p.id] && mm[p.id].hidden),
      }))
      .sort((a, b) => (HR_RANK[b.role] || 0) - (HR_RANK[a.role] || 0) || a.name.localeCompare(b.name));
    setRoster(list);
    setRosterAt(new Date());
  }, []);

  // initial load
  useEffect(() => { loadRoster(); }, [loadRoster]);

  // refresh when the window regains focus (came back from HR Console)
  useEffect(() => {
    const h = () => loadRoster();
    window.addEventListener("focus", h);
    return () => window.removeEventListener("focus", h);
  }, [loadRoster]);

  // refresh on tab switch (cheap; catches mid-session HR edits)
  useEffect(() => { loadRoster(); }, [tab, loadRoster]);

  /* Weekday history behind the adaptive cars/transactions bars on the entry
     cards. Loads per selected date; a failed read leaves {} and every bar
     falls back to the hand-set goal — adaptive degrades, never blocks. */
  const [dayHist, setDayHist] = useState(null);
  useEffect(() => {
    let alive = true;
    setDayHist(null);
    fetchGoalHistory([dateKey])
      .then((h) => { if (alive) setDayHist(h); })
      .catch(() => { if (alive) setDayHist({}); });
    return () => { alive = false; };
  }, [dateKey]);

  /* load the day being edited, then additively prefill empty lead slots
     from the Daily Setup auto board (imported days only) */
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await kvGetResult(K.daily(dateKey));
      if (!r.ok) {
        // The record may exist — show a blank day WITH the banner, and refuse
        // every save of this date so a retyped partial day can't erase it.
        if (alive) {
          dayFailedRef.current = true;
          setDayFailed(true);
          setDay({}); setSavedAt(null); setSaveErr(false); dirtyRef.current = false;
        }
        return;
      }
      const d = r.value;
      let base = d && typeof d === "object" ? d : {};
      const pool = poolsRef.current;
      if (pool && pool.length) {
        try {
          const fills = await slComputeFills(dateKey, pool);
          if (fills) base = mergeFills(base, fills);
          prefilledRef.current[dateKey] = true;
        } catch {}
      }
      if (alive) {
        dayFailedRef.current = false;
        setDayFailed(false);
        setDay(base); setSavedAt(null); setSaveErr(false); dirtyRef.current = false;
      }
    })();
    return () => { alive = false; };
  }, [dateKey]);

  /* memoized derived lists — stable identity per roster, so the
     scorecard effect doesn't refire (and re-write KV) every render */
  const active = useMemo(() => (roster || []).filter((l) => l.active), [roster]);
  // Every slot offers EVERY active leader — the manual backup for when the
  // board didn't name someone, or named the wrong person. No pool filtering:
  // there's no per-person station tag to filter on (people swap slots by
  // daypart), so nothing has to be tagged for the dropdowns to be usable.
  const leadOptions = useMemo(() => {
    const out = {};
    LEAD_SLOTS.forEach((slot) => { out[slot.field] = active; });
    return out;
  }, [active]);

  // id → display name, for the read-only "who led" line on Daily Entry.
  const nameById = useMemo(() => {
    const m = {};
    active.forEach((l) => { m[l.id] = l.name; });
    return m;
  }, [active]);

  // keep the load effect's pool current without retriggering the day load
  useEffect(() => { poolsRef.current = active; }, [active]);

  // if the roster wasn't ready when this date first loaded, prefill once it is
  useEffect(() => {
    if (!active.length || prefilledRef.current[dateKey]) return;
    if (dayFailedRef.current) return; // day never loaded — don't dress a blank
    let alive = true;
    (async () => {
      try {
        const fills = await slComputeFills(dateKey, active);
        prefilledRef.current[dateKey] = true;
        if (alive && fills) setDay((prev) => mergeFills(prev, fills));
      } catch {}
    })();
    return () => { alive = false; };
  }, [active, dateKey]);

  /* ── entry helpers ── */
  // AUTOSAVE dirty tracking. Only USER edits (setDp — metric inputs + lead
  // dropdown overrides) mark the day dirty. Auto-fill mergeFills and the
  // day-load setDay do NOT — persisting an auto-fill would make it sticky and
  // break the "blank slot re-imports on reopen" self-correction.
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const setDp = (dpKey, patch) => {
    dirtyRef.current = true;
    setDay((prev) => ({ ...prev, [dpKey]: { ...(prev[dpKey] || {}), ...patch } }));
  };
  const saveDay = async () => {
    if (dayFailedRef.current) {
      window.alert("This day never loaded, so saving is off — it would erase what is really stored. Check the wifi and refresh the page.");
      return;
    }
    setSaving(true);
    // kvSet never throws — it returns false on failure, so the boolean is the
    // only truth about whether the day landed.
    const ok = await kvSet(K.daily(dateKey), day);
    if (ok === false) {
      setSavedAt(null);
      setSaveErr(true);
      window.alert("The day did not save — check the wifi and hit Save Day again. Your numbers are still on the screen.");
    } else {
      dirtyRef.current = false;
      setSaveErr(false);
      setSavedAt(new Date());
      // Refresh the published rollup so the dashboard Top Leaders board tracks
      // saves, not just visits to the Scorecard tab.
      computeRollup();
    }
    setSaving(false);
  };
  const shiftDate = (delta) => {
    // Skips Sunday in whichever direction you're going; null = nowhere to land.
    const next = stepOpenDate(dateKey, delta);
    if (!next) return;
    // Flush any unsaved edits for the day being left — async, so a quick ‹/›
    // tap inside the debounce window can't lose the last entry. A failed-load
    // day is never flushed: the banner already said saving is off for it.
    if (dirtyRef.current) {
      dirtyRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (!dayFailedRef.current) {
        kvSet(K.daily(dateKey), day).then((ok) => {
          if (ok === false) window.alert("The day you just left did not save — go back to it, check the wifi, and hit Save Day.");
          else computeRollup();
        });
      }
    }
    setDateKey(next);
  };
  // Disabled when there is no OPEN day left in that direction — otherwise the
  // arrow looks live on a Saturday and simply does nothing.
  const atStart = !stepOpenDate(dateKey, -1);
  const atToday = !stepOpenDate(dateKey, 1);

  /* ── roster overrides (persist to meta, keyed by HR id) ── */
  const persistMeta = async (next) => {
    // Refuse after a failed load — this map holds EVERY person's hidden flag,
    // and writing it off a blank read would unhide/erase everyone else's.
    if (cfgFailedRef.current) return false;
    const prev = meta;
    setMeta(next);
    const ok = await kvSet(K.meta, next);
    if (ok === false) {
      setMeta(prev);
      setCfgSaveErr(true);
      return false;
    }
    setCfgSaveErr(false);
    return true;
  };
  // No setStation — the per-person DT/FOH/BOH tag was removed. `meta` still
  // carries `hidden` per person; any leftover `station` value in saved meta is
  // simply ignored (harmless, and preserved if it's ever wanted back).
  const toggleHidden = (id) => {
    const cur = meta[id] || {};
    const hidden = !cur.hidden;
    const next = { ...meta, [id]: { ...cur, hidden } };
    // Flip the visible roster only after the write lands — a refused or failed
    // write leaves the row exactly as stored.
    persistMeta(next).then((ok) => {
      if (ok) setRoster((prev) => (prev || []).map((r) => (r.id === id ? { ...r, active: !hidden } : r)));
    });
  };

  /* ── goals (ratio metrics only, per daypart; SOS/AHA/Good Scans/Trans w/o
        AHA all score on fixed bands and never appear here) ── */
  const setGoal = async (key, dp, val) => {
    // Refuse after a failed load — goals fell back to the seed, and saving
    // one edit would write the whole seed over the real goals.
    if (cfgFailedRef.current) return;
    const cur = goals && goals[key];
    // If this metric is still on the legacy FLAT shape (a plain number saved
    // before per-daypart goals), spread it across all four dayparts first so
    // editing one daypart doesn't wipe the other three to blank.
    const base = cur && typeof cur === "object"
      ? cur
      : DAYPARTS.reduce((o, d) => {
          o[d.key] = (cur === "" || cur === undefined || cur === null) ? "" : cur;
          return o;
        }, {});
    const next = { ...goals, [key]: { ...base, [dp]: val === "" ? "" : Number(val) } };
    const prev = goals;
    setGoals(next);
    const ok = await kvSet(K.goals, next);
    if (ok === false) { setGoals(prev); setCfgSaveErr(true); }
    else setCfgSaveErr(false);
  };

  /* ── period range ── */
  const range = useMemo(() => {
    const t = todayKey();
    if (period === "month") {
      const d = parseKey(t);
      const first = fmtKey(new Date(d.getFullYear(), d.getMonth(), 1));
      return { from: clampStart(first), to: t };
    }
    const from = clampStart(fmtKey(mondayOf(parseKey(t))));
    return { from, to: t };
  }, [period]);

  /* ── compute the scorecard + write the EOS/LD rollup ── */
  // Score every active leader over an arbitrary list of day-records. Pulled out
  // of computeRollup so the on-screen window (range) and the board's always-MTD
  // window can BOTH run the identical scoring, with no second copy to drift.
  // Returns { out, independentCount, scored } — `out` is the per-leader rows.
  /* `dayWds[i]` = weekday of days[i]; `hist` = fetchGoalHistory medians.
     Either may be null — scoring then falls back to the hand-set goals,
     which is byte-for-byte the old behaviour. */
  const scoreLeadersOver = useCallback((days, collectActuals, hist = null, dayWds = null) => {
    const acc = {};
    const dpAgg = {};
    const aggActual = (m, raw, dpKey) => {
      if (m.score !== "ratio") return;
      const n = raw === "" || raw === null || raw === undefined ? null : Number(raw);
      if (n === null || Number.isNaN(n)) return;
      const slot = ((dpAgg[m.key] = dpAgg[m.key] || {})[dpKey] =
        dpAgg[m.key][dpKey] || { sum: 0, n: 0 });
      slot.sum += n;
      slot.n += 1;
    };
    // `w` is the weight THIS credit was earned at. A metric no longer has one
    // weight for everyone: speed counts 70 for the lead who owns it and 20 for
    // the kitchen lead who partly drives it, so the weight has to travel with
    // the reading instead of being looked up from METRICS later.
    const bump = (leadId, m, raw, dpKey, w, wd) => {
      if (!leadId) return;
      const n = m.score === "sosTime"
        ? parseMSS(raw)
        : (raw === "" || raw === null || raw === undefined ? null : Number(raw));
      if (n === null || Number.isNaN(n)) return;
      (acc[leadId] = acc[leadId] || {});
      // wd rides with the credit so the composite can score each reading
      // against ITS OWN weekday's bar — a Saturday entry is never judged
      // against a Tuesday's history.
      (acc[leadId][m.key] = acc[leadId][m.key] || []).push({ n, dp: dpKey, w, wd });
    };
    days.forEach((d, di) => {
      if (!d) return;
      const wd = dayWds ? dayWds[di] : null;
      DAYPARTS.forEach((dp) => {
        const e = d[dp.key]; if (!e) return;
        METRICS.forEach((m) => {
          // id -> the weight that id earns this metric at.
          const targets = new Map();
          LEAD_SLOTS.forEach((slot) => {
            if (m.owner === slot.owner && e[slot.field]) targets.set(e[slot.field], m.w || 0);
          });
          /* ── SPEED ALSO CREDITS THE KITCHEN — Matt, Jul 25 ──────────────
             "the speed is impacting the front leaders and it's determined
             partly by the back so the back needs some of that to affect their
             scores" and "without entering again". So the SAME reading counts
             twice: full weight for the lead who owns it, a smaller share for
             the kitchen lead. NOTHING new is typed.
             His split rule, verbatim: "When there is only 1 kitchen leader they
             are responsible for both speeds but when there are 2 then it can be
             split by dt and fc." Slot 1 (bohLeadId) is the DT-side kitchen lead
             and slot 2 (bohLead2Id) the FC-side, which is what those slots are
             already labelled.
             ⚠️ `!targets.has` matters: someone who led DT *and* covered kitchen
             on the same daypart keeps the full 70 and is not quietly demoted to
             the 20 share. */
          if (m.wBoh) {
            const b1 = e.bohLeadId, b2 = e.bohLead2Id;
            const share = (b1 && b2) ? (m.key === "dtSos" ? b1 : b2) : (b1 || b2 || null);
            if (share && !targets.has(share)) targets.set(share, m.wBoh);
          }
          targets.forEach((w, id) => bump(id, m, e[m.key], dp.key, w, wd));
          aggActual(m, e[m.key], dp.key);
        });
      });
    });
    if (collectActuals) setDpActuals(dpAgg);

    const out = active.map((l) => {
      const mine = acc[l.id] || {};
      const perMetric = METRICS
        .filter((m) => (mine[m.key] || []).length > 0)
        .map((m) => {
          const entries = mine[m.key] || [];
          const avg = entries.reduce((a, e) => a + e.n, 0) / entries.length;
          const value = m.score === "sosTime"
            ? Math.round(avg)
            : (m.dir === "low" ? Math.round(avg) : Math.round(avg * 10) / 10);
          const scored = entries
            .map((e) => scoreMetric(m, e.n, smartGoal(goals, hist, m.key, e.dp, e.wd), e.dp))
            .filter(Boolean);
          const sub = scored.length
            ? Math.round((scored.reduce((a, s) => a + s.sub, 0) / scored.length) * 10) / 10
            : null;
          const rag = ragOfScore(sub);
          // The weight now travels with each credit. MAX, not first: if someone
          // led DT on some dayparts and covered kitchen on others, DT SOS is
          // genuinely theirs at 70 — the kitchen share must not pull it down.
          const weight = entries.reduce((a, x) => Math.max(a, x.w === undefined || x.w === null ? (m.w || 0) : x.w), 0);
          return { m, value, days: entries.length, sub, rag, weight };
        });
      // ⚠️ EACH METRIC IS WEIGHTED BY ITS OWN WEIGHT **× ITS DAY COUNT**.
      // The old math used p.weight alone, which made one daypart of evidence
      // worth exactly as much as a month of it. Concretely: a lead who ran DT
      // for 20 days and covered ONE BOH dinner scored 70 (DT SOS) + 30 (Cars)
      // + 50 (txNoAha) = 150, so that single dinner's miss count carried 33% of
      // a month-long composite and DT SOS fell from 70% to 47%. Multiplying by
      // days makes the same case 1400 + 600 + 50 — the dinner is worth 2.4%,
      // which is what one shift out of twenty-one actually is.
      // Within an owner nothing changes when metrics are entered together
      // (SOS and Cars both at 20 days still split 70/30). The correction only
      // bites where the DAY COUNTS DIFFER — across owners, or when a metric is
      // typed on only some days. That second case is deliberate: a metric with
      // less evidence behind it now carries proportionally less of the score
      // instead of the all-or-nothing "drop it entirely if blank" it had before.
      const scoredM = perMetric.filter((p) => p.sub !== null && p.weight > 0 && p.days > 0);
      const wSum = scoredM.reduce((a, p) => a + p.weight * p.days, 0);
      const composite = wSum > 0
        ? Math.round((scoredM.reduce((a, p) => a + p.sub * p.weight * p.days, 0) / wSum) * 10) / 10
        : null;
      const rag = ragOfScore(composite);
      const ownerDays = {};
      perMetric.forEach((p) => {
        const o = p.m.owner;
        ownerDays[o] = (ownerDays[o] || 0) + p.days;
      });
      const topOwner = Object.keys(ownerDays).sort(
        (a, b) => (ownerDays[b] - ownerDays[a]) || a.localeCompare(b)
      )[0];
      const station = topOwner ? OWNER_LABEL[topOwner] : null;
      return { id: l.id, name: l.name, station, perMetric, composite, rag };
    });

    let independentCount = 0, scored = 0;
    out.forEach((r) => {
      if (r.composite !== null) scored += 1;
      if (r.composite !== null && r.composite >= INDEPENDENT_AT) independentCount += 1;
    });
    return { out, independentCount, scored };
  }, [active, goals]);

  const computeRollup = useCallback(async () => {
    if (!roster) return;
    const dates = datesInRange(range.from, range.to);
    // Both windows' dates are known up front, so the weekday history feeding
    // the adaptive cars/transactions bars loads in ONE sweep alongside the day
    // records. A failed history read degrades to the hand-set goals.
    const mtdFrom = clampStart(fmtKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    const mtdTo = todayKey();
    const mtdDates = (mtdFrom === range.from && mtdTo === range.to) ? dates : datesInRange(mtdFrom, mtdTo);
    const [dayRs, hist] = await Promise.all([
      Promise.all(dates.map((d) => kvGetResult(K.daily(d)))),
      fetchGoalHistory([...new Set([...dates, ...mtdDates])]).catch(() => ({})),
    ]);
    const days = dayRs.map((r) => (r.ok ? r.value : null));

    const acc = {};
    // ── DISPLAY window (follows the on-screen week/month toggle) ──
    const { out } = scoreLeadersOver(days, /* collectActuals */ true, hist, dates.map(wdOf));

    setRows(out);

    // ── BOARD window — ALWAYS month-to-date, independent of the toggle ──
    // The dashboard Top Leaders board reads K.rollup. If we wrote the display
    // window here, the board would blank every Monday when the week resets to a
    // single empty day. Instead the rollup is ALWAYS computed over the current
    // month (1st → today, clamped to SEASON_START), so the board holds all
    // month and only resets on the 1st. The on-screen scorecard still follows
    // its own toggle above — this pass only changes what the board reads.
    const mtdRs = mtdDates === dates
      ? dayRs // display window already IS this month → reuse, no refetch
      : await Promise.all(mtdDates.map((d) => kvGetResult(K.daily(d))));
    const mtdDays = mtdRs.map((r) => (r.ok ? r.value : null));
    // A failed day read means the scores are computed off PART of the record.
    // Show them (the banner says they may be incomplete) but PUBLISH nothing —
    // the dashboard board, the L10 agenda and the EOS row must never be
    // rebuilt from a partial read. The next clean compute republishes all
    // three. cfgFailed counts too: fallback goals/roster would mis-score.
    const readFailed = dayRs.some((r) => !r.ok) || mtdRs.some((r) => !r.ok) || cfgFailedRef.current;
    let publishFailed = false;
    const mtd = scoreLeadersOver(mtdDays, /* collectActuals */ false, hist, mtdDates.map(wdOf));
    const rollupOut = mtd.out;
    const independentCount = mtd.independentCount;
    const scored = mtd.scored;

    // ── the EOS / LD feed ──
    const leadersOut = {};
    rollupOut.forEach((r) => {
      const independent = r.composite !== null && r.composite >= INDEPENDENT_AT;
      leadersOut[r.id] = { name: r.name, station: r.station, composite: r.composite, rag: r.rag, independent };
    });
    if (!readFailed) {
      const okRoll = await kvSet(K.rollup, {
        updated: new Date().toISOString(),
        from: mtdFrom, to: mtdTo, period: "month",
        independentAt: INDEPENDENT_AT,
        goal: INDEPENDENT_GOAL,
        independentCount, scored,
        leaders: leadersOut,
      });
      if (okRoll === false) publishFailed = true;
    }

    // ── the AGENDA feed (gcfcr-sl-agenda-v1) — also month-to-date, so the L10
    // coaching lines match the board the directors are looking at. ──
    const rank = { red: 0, amber: 1, green: 2, gray: 3 };
    const focus = [];
    rollupOut.forEach((r) => {
      const scoredMetrics = r.perMetric.filter((p) => p.sub !== null);
      if (!scoredMetrics.length) return;
      const weakest = scoredMetrics
        .slice()
        .sort((a, b) => (rank[a.rag] - rank[b.rag]) || (a.sub - b.sub))[0];
      if (!weakest || weakest.rag === "green") return; // only surface real misses
      focus.push({
        leadId: r.id, name: r.name, station: r.station,
        metric: weakest.m.label,
        value: weakest.value === null ? null
          : (weakest.m.score === "sosTime" ? fmtMSS(weakest.value) : `${weakest.value}${weakest.m.unit || ""}`),
        rag: weakest.rag, sub: weakest.sub,
        line: `Coach ${r.name} on ${weakest.m.label}`,
      });
    });
    // worst first, so the L10 works top-down
    focus.sort((a, b) => (rank[a.rag] - rank[b.rag]) || (a.sub - b.sub));
    if (!readFailed) {
      const okAgenda = await kvSet(K.agenda, {
        updated: new Date().toISOString(),
        from: mtdFrom, to: mtdTo, period: "month",
        source: "shift-leader-scorecard",
        focus,
      });
      if (okAgenda === false) publishFailed = true;
    }

    // ── the EOS SCORECARD feed (row s4, Speed of service) ──
    // s4 was the last seed row on the EOS board — a hardcoded 3:24 nobody
    // produced. It now comes from the SOS you type here, over the same MTD
    // window as the rollup above, so the board and this tile can never disagree.
    // Read-merge-write: touches only s4, never clobbers the rows FCR, HR
    // Console, LeadershipDev, CashAudit and GuestExperience publish.
    // Publishes NOTHING when no SOS has been entered this month — an empty
    // month must not render as a fast store.
    const sos = storeSosOver(mtdDays);
    if (sos && !readFailed) {
      const key = `eos:scorecard:${eosPeriod()}`;
      // ⚠️ THE GOAL IS SOS_GREEN, NOT SOS_RED. This published `≤ 3:30` and
      // `hit: avg <= 210` — the RED line — so a 3:29 store average posted to
      // the EOS board as a green hit while every leader standing on that same
      // number scored 3/5 (amber) on this very page. Two definitions of good
      // SOS, 90 seconds apart, in one file. The board now uses the same
      // threshold scoreMetric does, and the same strict `<` (see the sosTime
      // branch: green is UNDER 2:00, not at it).
      // publishSharedRows: a FAILED read publishes nothing, instead of
      // arriving here as {} and wiping every other tool's rows.
      const okS4 = await publishSharedRows(key, {
        s4: { actual: fmtMSS(sos.avg), goal: `≤ ${fmtMSS(SOS_GREEN)}`, hit: sos.avg < SOS_GREEN },
      });
      if (okS4 === false) publishFailed = true;
    }

    // One banner covers both halves of honesty: reads that failed (scores may
    // be incomplete) and publishes that failed (the boards may be stale). It
    // clears on the next compute where every read and publish lands.
    setRollupWarn(readFailed || publishFailed);
  }, [roster, active, range, scoreLeadersOver, goals]);

  useEffect(() => {
    if (tab === "scorecard") computeRollup();
  }, [tab, computeRollup]);

  /* ── AUTOSAVE — debounced write 1.5s after the last user edit. Reads the
        dirty flag so day loads / auto-fills never phantom-save; a newer edit
        re-runs this effect, which clears and re-arms the timer, so exactly one
        write lands per burst of typing. On failure the flag is re-set so the
        next edit (or Save Day, or date nav) retries — data is never silently
        dropped. Also refreshes the published rollup so the dashboard's Top
        Leaders board tracks entry in near-real-time. ── */
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (dayFailedRef.current) return; // this date never loaded — banner explains, writes stay off
      dirtyRef.current = false;
      const ok = await kvSet(K.daily(dateKey), day);
      if (ok === false) {
        // Put the dirty flag back so the next edit, Save Day, or date nav
        // retries, and say so on the footer instead of pretending it saved.
        dirtyRef.current = true;
        setSavedAt(null);
        setSaveErr(true);
      } else {
        setSaveErr(false);
        setSavedAt(new Date());
        computeRollup();
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [day, dateKey, computeRollup]);

  /* ── Paper cost % for the week the entry date falls in ──
     ★ Jul 28 2026 — Matt: "the paper cost % should seed into the leader
     scorecard from either the fcr or the food cost page."

     A TYPED WEEKLY NUMBER ALWAYS WINS. When none exists, the pill falls back
     to the LIVE MONTH-TO-DATE paper % from Food Cost, so the number is in
     front of leaders every shift instead of a dash.

     ⚠️ THE SEED IS MTD, NOT THAT WEEK. Food Cost and the FCR both keep paper
     cost as a monthly figure; there is no weekly paper % anywhere in the Hub
     to read. So the seed is labelled MTD wherever it shows, and it is never
     written into `gcfcr-sl-paper-v1` — writing it would freeze a month figure
     into a weekly slot and become indistinguishable from a real weekly entry.
     It is derived live on every render instead.

     ⚠️ A week that straddles two months seeds from the MONDAY's month. Fine
     for the current week (MTD is the month in progress); for a historical
     straddling week, type the real number. */
  const paperWeek = fmtKey(mondayOf(parseKey(dateKey)));
  const paperYm = paperWeek.slice(0, 7);
  const paperTyped = paper[paperWeek];
  const paperHasTyped = paperTyped !== undefined && paperTyped !== null && paperTyped !== "";
  const paperSeed = paperLive && paperLive.ym === paperYm ? paperLive.pct : null;
  const paperIsSeed = !paperHasTyped && paperSeed !== null;
  const paperPct = paperHasTyped ? paperTyped : paperSeed;
  const paperFlag = paperRag(paperPct);

  // Read the tracker for whichever month the shown week sits in. An unreadable
  // or empty month clears the seed rather than holding a stale one from the
  // month before — a wrong number on the masthead is worse than a dash.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await monthFoodCostPct(paperYm);
        if (!alive) return;
        const pct = r && r.paperPct != null && isFinite(r.paperPct) ? r.paperPct * 100 : null;
        /* ⚠️ "IMPOSSIBLE" IS NOT THE SAME AS "NOT ENTERED YET", and the pill
           must not show the same dash for both. A month whose paper figure was
           refused says so, so nobody stands here wondering why the number went
           away. See costBreakdown in FoodCostTracker for what gets refused. */
        setPaperBad(!!(r && r.paperImpossible));
        setPaperLive(pct === null ? null : { ym: paperYm, pct });
      } catch { if (alive) { setPaperLive(null); setPaperBad(false); } }
    })();
    return () => { alive = false; };
  }, [paperYm]);

  /* ★ IMPORT THE AHA DASHBOARD FOR ONE MONTH (Matt, Aug 5 2026).
     ⚠️ RAW MAP IS THE WRITE BASE, and `ahaOk` gates it. This writes the whole
     record back, so importing off a failed read would erase every month already
     stored. Same discipline as the food-gap drilldown import.
     ⚠️ THE MONTH COMES OFF THE PAGE. Nothing to pick, so nothing to pick wrong;
     a page with no date range falls back to the last closed month.
     ⚠️ kvSet RETURNS FALSE on a refused write and never throws, so the boolean
     is checked. A silent failure here reads as "saved" and the month vanishes. */
  /* What is already on file, for the line above the paste box. Derived rather
     than stored, so it cannot fall out of step with the record itself. */
  const ahaLatest = ahaStatus(ahaAll);

  const importAhaMonth = async (text) => {
    if (!ahaOk) return { ok: false, message: "Import is off — the AHA record could not be read. Reopen the tool." };
    const ym = monthFromPage(text) || lastClosedMonth();
    const r = parseAhaDashboard(text, { ym });
    if (!r.ok) return { ok: false, message: r.error };
    const base = { ...(ahaAll || {}) };
    base[r.ym] = r.rec;
    const wrote = await kvSet(AHA_MONTHLY_KEY, base);
    if (!wrote) return { ok: false, message: "That did not save. Check the wifi and press Import again." };
    setAhaAll(base);
    const tz = r.rec.targetZone;
    return {
      ok: true,
      message: `${r.ym} saved · ${r.found} fields${tz != null ? ` · target zone ${tz}%` : ""}${r.error ? ` · ${r.error}` : ""}`,
    };
  };

  const savePaper = async (raw) => {
    // Refuse after a failed load — this map holds every week's number, and a
    // write off a blank read would erase the other weeks. Banner explains.
    if (cfgFailedRef.current) return;
    const next = { ...paper };
    const v = String(raw).trim();
    if (v === "") delete next[paperWeek];
    else next[paperWeek] = Math.max(0, Number(v));
    // No rollback here — this fires per keystroke, and yanking the input back
    // mid-typing fights the keyboard. The typed value stays on screen; the
    // banner says it has not stored, and the next keystroke retries the write.
    setPaper(next);
    const ok = await kvSet(K.paper, next);
    setCfgSaveErr(ok === false);
  };

  // Score ONE typed value for the daypart read shown on the entry card.
  // Display only — it never writes, and computeRollup still re-reads KV and
  // does its own per-daypart scoring exactly as before. sosTime has to go
  // through parseMSS first, same as bump() does.
  const liveScore = (m, raw, dpKey) =>
    scoreMetric(m, m.score === "sosTime" ? parseMSS(raw) : raw, smartGoal(goals, dayHist, m.key, dpKey, wdOf(dateKey)), dpKey);

  // What a leader should be aiming at in this field, in this daypart.
  const fieldHint = (m, dpKey) => {
    if (m.score === "ratio") {
      const hand = goalFor(goals, m.key, dpKey);
      const g = smartGoal(goals, dayHist, m.key, dpKey, wdOf(dateKey));
      if (g === "") return "no goal set";
      // Adaptive bar in play → say so, and name the weekday it came from,
      // so a leader can see the number they are actually judged against.
      return g === hand ? `goal ${g}` : `bar ${g} · ${WD_SHORT[wdOf(dateKey)]} normal`;
    }
    if (m.score === "txCount") return `green \u2264 ${(TX_BANDS[dpKey] || TX_BANDS_FALLBACK).green}`;
    if (m.score === "sosTime") return `M:SS \u00b7 under ${fmtMSS(SOS_GREEN)} green`;
    if (m.score === "ahaPct") return "95%+ green";
    if (m.score === "scanPct") return "99%+ green";
    return m.unit || "";
  };

  /* ═══ RENDER ═══ */
  if (roster === null) return <div style={S.page}>Loading scorecard…</div>;

  const goalMetrics = METRICS.filter((m) => m.score === "ratio");

  return (
    <div style={S.page}>
      <style>{`
        .sl-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;}
        .sl-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;}
        .sl-rail-row{display:grid;grid-template-columns:88px 1fr 44px;align-items:center;gap:12px;padding:3px 0;}
        .sl-track{position:relative;height:22px;}
        .sl-track:before{content:"";position:absolute;left:0;right:0;top:10px;height:2px;background:#F1F0F5;border-radius:2px;}
        .sl-fill{position:absolute;left:0;top:10px;height:2px;border-radius:2px;opacity:.28;}
        .sl-mark{position:absolute;top:5px;width:12px;height:12px;border-radius:50%;border:2px solid #fff;}
        .sl-line{position:absolute;left:75%;top:0;bottom:0;width:1.5px;background:repeating-linear-gradient(180deg,#0F766E 0 4px,transparent 4px 8px);}
        .sl-spine{display:flex;height:15px;border-radius:5px;overflow:hidden;background:#F1F0F5;}
        .sl-spine>i+i{border-left:1.5px solid #fff;}
        .sl-keys{display:flex;margin-top:5px;}
        .sl-keys>span{font-family:'Azeret Mono',ui-monospace,monospace;font-size:8.5px;letter-spacing:.06em;color:#807B92;text-align:center;overflow:hidden;white-space:nowrap;}
      ` +
      /* ⚠️ THE STRING IS BROKEN IN TWO SO THIS COMMENT IS JS, NOT CSS (Aug 8
         2026). A block comment INSIDE a style template literal is part of the
         string, so the minifier cannot touch it and it shipped to the browser
         verbatim — including Matt's quoted words below. Concatenating two
         literals with the note between them keeps it next to the rule it
         explains and strips it from the bundle.
         🐛 IT WAS A SQUARE BAR (Matt, Aug 6 2026: "shift leader card is the
         square progress bar"). This was full-bleed to the card edges via
         -16px side margins with no radius at all, so it read as a hard
         rectangle capping a rounded card — the same mismatch that made the
         cleaning panel look "off layer".
         Now it is a pill sitting inside the card's own padding, which is what
         .sl-spine four lines up already does and what every other progress bar
         in the Hub does. Inset rather than flush on purpose: a flush bar has
         to match the CARD's corner radius exactly or the two curves fight, and
         a pill inside the padding cannot get that wrong.
         overflow:hidden so the fill is clipped to the pill at 0% and at 100%. */
      `
        .sl-cap{height:5px;background:#F1F0F5;margin:-6px 0 12px;border-radius:999px;overflow:hidden;}
        .sl-cap>i{display:block;height:100%;border-radius:999px;}
        .sl-pipwrap{position:relative;flex:0 0 auto;}
        .sl-pip{position:absolute;right:9px;top:50%;transform:translateY(-50%);width:7px;height:7px;border-radius:50%;}
        @media (max-width:520px){ .sl-rail-row{grid-template-columns:74px 1fr 40px;gap:9px;} }
      `}</style>

      {/* Masthead — quiet on purpose. It carries identity, ONE number
          (paper cost, which belongs to nobody's composite) and the tabs.
          The coaching-independent count moved down into the standings
          rail, where it can sit on the same scale it describes. */}
      <div style={{ margin: "0 -20px 20px", background: `linear-gradient(120deg,#5B4FD6 0%,${INDIGO} 30%,${INDIGO_DP} 55%)`, color: "#fff", padding: "20px 22px", borderRadius: "0 0 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "0.16em", color: "#B7B1EE", fontWeight: 500 }}>{STORE.name.toUpperCase()} · LEADERSHIP</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "4px 0 3px" }}>Shift Leader Scorecard</div>
            <div style={{ fontSize: 12.5, color: "#C3BEF2" }}>
              {tab === "scorecard"
                ? `${fmtNice(range.from)} – ${fmtNice(range.to)} · credited by who led each daypart`
                : "Type the day's numbers · leaders pull from the setup board"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0 }}>
            <div style={{ border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.07)", borderRadius: 12, padding: "8px 13px", textAlign: "right" }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "0.14em", color: "#B7B1EE", fontWeight: 500 }}>PAPER · {paperIsSeed ? "MTD" : "WK"}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 19, fontWeight: 700, lineHeight: 1.15, color: paperFlag === "gray" ? "#7C74C9" : RAG_COLOR[paperFlag] === "#0F766E" ? "#5EE3C0" : RAG_COLOR[paperFlag] === "#C77D0A" ? "#FFC864" : "#FF8A9B" }}>
                {paperPct === undefined || paperPct === null
                  ? (paperBad ? "check" : "—")
                  : `${Number(paperPct).toFixed(2)}%`}
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#B7B1EE" }}>goal {paperGoal().toFixed(2)}</div>
            </div>
            {canEdit && (
              <button style={{ border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.08)", color: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: FONT_BODY }} onClick={() => { const n = !manage; setManage(n); if (n) loadRoster(); }}>
                {manage ? "Done" : "Roster"}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 18, background: "rgba(255,255,255,.10)", borderRadius: 11, padding: 4, width: "fit-content" }}>
          {canEdit && <button onClick={() => setTab("entry")} style={{ ...S.tab(tab === "entry"), flex: "0 0 auto", padding: "8px 18px" }}>Daily entry</button>}
          <button onClick={() => setTab("scorecard")} style={{ ...S.tab(tab === "scorecard"), flex: "0 0 auto", padding: "8px 18px" }}>Scorecard</button>
        </div>
      </div>

      <p style={S.sub}>
        Credited by who led each daypart · rolled into a 1-5 coaching score + green / amber / red flag for the EOS scorecard. SOS on raw time: under {fmtMSS(SOS_GREEN)} green · {fmtMSS(SOS_GREEN)}-{fmtMSS(SOS_RED)} yellow · over {fmtMSS(SOS_RED)} red.
      </p>

      {/* Storage honesty. Amber = a load failed, so goal/roster/paper edits are
          off (saving would erase what is really stored). Red = a change made
          after a clean load did not store. Both clear themselves on a clean
          re-read / next successful save. */}
      {cfgFailed && (
        <div style={{ background: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14, fontFamily: FONT_BODY }}>
          Part of this page did not load (goals, roster settings, or paper cost), so
          those can't be edited right now — saving would erase what is really stored.
          Check the wifi and refresh the page.
        </div>
      )}
      {!cfgFailed && cfgSaveErr && (
        <div style={{ background: "#FEF2F2", border: "1.5px solid #DC2626", color: "#991B1B", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14, fontFamily: FONT_BODY }}>
          A change just now did not save — check the wifi and make the change again.
        </div>
      )}

      {manage && (
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Roster</div>
            <button style={S.refresh} onClick={loadRoster}>Refresh roster</button>
          </div>
          <div style={S.note}>
            Pulled live from the HR Console — every Trainer through Director. Promote,
            add, or terminate someone in HR and it shows here on refresh, focus, or tab
            switch. Nobody is tagged FOH/DT/BOH: leads swap posts by daypart, so each
            person is scored on whatever slots they actually filled on the Daily Setup
            board (DT lead = DT SOS + DT Cars · FOH lead = FC SOS + FC Transactions ·
            both BOH leads = Trans w/o AHA + AHA + Good Scans). Hide anyone who doesn't
            lead shifts.
            {rosterAt && <span> · synced {rosterAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          </div>
          {roster.map((l) => (
            <div key={l.id} style={S.rosterRow(!l.active)}>
              <span>
                <span style={S.name}>{l.name}</span>
                <span style={{ ...S.roleLbl, marginLeft: 8 }}>{l.role}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button style={S.hideBtn(!l.active)} onClick={() => toggleHidden(l.id)}>
                  {l.active ? "hide" : "show"}
                </button>
              </span>
            </div>
          ))}
          {roster.length === 0 && (
            <div style={S.empty}>No trainers or leaders found in the HR Console yet.</div>
          )}
        </div>
      )}

      {/* ── DAILY ENTRY ── */}
      {canEdit && tab === "entry" && (
        <>
          <div style={S.bar}>
            <button style={S.navBtn(atStart)} onClick={() => shiftDate(-1)} disabled={atStart}>‹</button>
            <span style={S.barLabel}>{fmtNice(dateKey)}</span>
            <button style={S.navBtn(atToday)} onClick={() => shiftDate(1)} disabled={atToday}>›</button>
          </div>

          {dayFailed && (
            <div style={{ background: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14, fontFamily: FONT_BODY }}>
              This day did not load, so saving is off — anything typed here can't
              land until it loads clean, or a half-blank day would erase the real
              record. Check the wifi and refresh the page.
            </div>
          )}

          {/* ── Paper cost % · one number for the whole week ── */}
          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  Paper cost % · week of {fmtNice(paperWeek)}
                </div>
                <div style={{ ...S.note, marginTop: 2 }}>
                  Store-level, off the FCR report. Target {paperGoal().toFixed(2)}%. Not scored into
                  anyone's composite — it shows as a pill so leaders see it every shift.
                </div>
                {paperSeed !== null && (
                  <div style={{ ...S.note, marginTop: 4, fontWeight: 600 }}>
                    {paperIsSeed
                      ? `Showing ${paperSeed.toFixed(2)}% month to date from Food Cost. Type a number to pin this week instead.`
                      : `Food Cost reads ${paperSeed.toFixed(2)}% month to date.`}
                  </div>
                )}
                {/* ⚠️ SAYS WHAT IS WRONG AND WHERE TO GO. A refused figure that
                    renders as a bare dash reads as "nobody has entered it yet",
                    which is the one thing it definitely is not. */}
                {paperBad && !paperHasTyped && (
                  <div style={{ ...S.note, marginTop: 4, fontWeight: 700, color: RAG_COLOR.red }}>
                    Food Cost can't work out a paper % for this month — the giveaway or ending
                    inventory is bigger than everything bought, which would make the cost negative.
                    Check the Food Cost page for August. Nothing here is wrong; the number it reads is.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  value={paperHasTyped ? paperTyped : ""}
                  onChange={(e) => savePaper(e.target.value)}
                  placeholder={paperSeed === null ? "—" : paperSeed.toFixed(2)}
                  style={{ width: 92, padding: "8px 10px", border: `1.5px solid ${paperFlag === "gray" ? "#E5E7EB" : RAG_COLOR[paperFlag]}`, borderRadius: 9, fontSize: 15, fontWeight: 700, fontFamily: FONT_MONO, textAlign: "right", color: "#111827" }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#6B7280" }}>%</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 99, color: "#fff", background: RAG_COLOR[paperFlag], whiteSpace: "nowrap" }}>
                  {RAG_LABEL[paperFlag]}
                </span>
              </div>
            </div>
          </div>

          {/* ── Monthly AHA · paste the dashboard page ──────────────────
              ⚠️ THE DAILY ENTRY BELOW IS UNTOUCHED (Matt: "for the daily
              scoreboard i need to input the same way"). This is a separate
              monthly record and does not read, write or replace one daily
              field. */}
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>AHA dashboard · monthly</div>
            <div style={{ ...S.note, marginTop: 2 }}>
              Open the AHA dashboard for a closed month, select all, and paste the whole
              page. It reads system usage, hold times, target zone, scans and demand
              variance itself. Nothing to retype, and it takes the month off the page.
            </div>
            {ahaLatest.has && (
              <>
                <AhaScores month={ahaLatest.latest} rec={ahaLatest.rec} />
                <div style={{ ...S.note, marginTop: 8 }}>
                  {ahaLatest.months > 1 ? `${ahaLatest.months} months on file. ` : ""}
                  {ahaLatest.current
                    ? "Up to date."
                    : `${ahaLatest.want} has not been pasted yet.`}
                </div>
              </>
            )}
            <div style={{ marginTop: 8 }}>
              <PasteMonth
                buttonLabel="Paste the AHA dashboard"
                accent={INDIGO}
                disabled={!ahaOk}
                disabledNote="Import is off — the AHA record could not be read. Reopen the tool to retry."
                placeholder={"Select all on the AHA dashboard, then paste the whole page here."}
                onImport={importAhaMonth}
              />
            </div>
          </div>

          {active.length === 0 ? (
            <div style={S.card}>
              <div style={{ fontSize: 13.5, color: "#374151" }}>
                No one to lead yet. Roster comes from the HR Console — make sure your
                trainers and leaders are entered there, then reopen this tool.
              </div>
            </div>
          ) : (
            <div className="sl-days">{DAYPARTS.map((dp) => {
              const e = day[dp.key] || {};
              return (
                <div key={dp.key} style={S.card}>
                  {(() => {
                    // Live read of what's typed here. Display only.
                    const scored = METRICS
                      .map((m) => ({ m, s: liveScore(m, e[m.key], dp.key) }))
                      .filter((x) => x.s);
                    const den = scored.reduce((a, x) => a + (x.m.w || 0), 0);
                    const dpSub = den
                      ? Math.round((scored.reduce((a, x) => a + x.s.sub * (x.m.w || 0), 0) / den) * 10) / 10
                      : null;
                    const credited = LEAD_SLOTS
                      .map((slot) => ({ slot, name: nameById[e[slot.field]] }))
                      .filter((x) => x.name);
                    const open = !!editLeads[dp.key];
                    return (
                      <>
                        {/* fills as the daypart gets entered */}
                        <div className="sl-cap"><i style={{ width: `${(scored.length / METRICS.length) * 100}%`, background: DP_TINT[dp.key] }} /></div>

                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                          <h3 style={S.dpHead}>{dp.label}<span style={S.dpWin}>{dp.window}</span></h3>
                          <span style={{ textAlign: "right" }}>
                            <span style={{ display: "block", fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.1em", color: INK3 }}>DAYPART READ</span>
                            <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: dpSub === null ? INK3 : scoreColor(dpSub) }}>
                              {dpSub === null ? "\u2014" : dpSub.toFixed(1)}
                            </span>
                          </span>
                        </div>

                        {/* ★ Leaders pull from the Daily Setup board and are
                            credited automatically. Tap "Edit leaders" to
                            override on a day the board is wrong. */}
                        <div style={S.leadSummary}>
                          <span style={{ fontSize: 11.5, color: INK2, lineHeight: 1.5, minWidth: 0 }}>
                            {credited.length === 0
                              ? "Leaders pull from the setup board"
                              : credited.map((x) => `${x.slot.label.replace(" lead", "")} ${x.name.split(" ")[0]}`).join(" \u00b7 ")}
                          </span>
                          <button style={S.leadEdit} onClick={() => setEditLeads((mm) => ({ ...mm, [dp.key]: !mm[dp.key] }))}>
                            {open ? "Done" : "Edit leaders"}
                          </button>
                        </div>
                        {open && (
                          <div style={{ ...S.leadRow, marginTop: 10 }}>
                            {LEAD_SLOTS.map((slot) => (
                              <div key={slot.field} style={S.leadCol}>
                                <span style={S.smallLbl}>{slot.label}</span>
                                <select
                                  style={S.sel}
                                  value={e[slot.field] || ""}
                                  onChange={(ev) => setDp(dp.key, { [slot.field]: ev.target.value })}
                                >
                                  <option value="">— pick —</option>
                                  {(leadOptions[slot.field] || []).map((l) => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* fields grouped under the lead who gets credit */}
                        {["dt", "foh", "boh"].map((own) => (
                          <div key={own}>
                            <div style={S.ownerHead}>
                              <span style={S.ownerWord}>{(OWNER_LABEL[own] || own).toUpperCase()} LEAD</span>
                              <span style={S.ownerRule} />
                            </div>
                            {METRICS.filter((m) => m.owner === own).map((m) => {
                              const sc = liveScore(m, e[m.key], dp.key);
                              return (
                                <div key={m.key} style={S.metricEntry}>
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={S.fieldLbl}>{m.label}</span>
                                    <span style={S.fieldHint}>{fieldHint(m, dp.key)}</span>
                                  </span>
                                  <span className="sl-pipwrap">
                                    <input
                                      style={{ ...S.inNum, paddingRight: 24 }}
                                      type={m.score === "sosTime" ? "text" : "number"}
                                      inputMode={m.score === "sosTime" ? "text" : "decimal"}
                                      value={e[m.key] === undefined ? "" : e[m.key]}
                                      placeholder={m.score === "sosTime" ? "M:SS" : "—"}
                                      onChange={(ev) => setDp(dp.key, { [m.key]: ev.target.value })}
                                      // Enter exits the cell. There's no <form> here, so Enter
                                      // otherwise did nothing at all — the field kept focus and
                                      // the iPad keyboard stayed up, so the cell felt stuck.
                                      onKeyDown={(ev) => {
                                        if (ev.key === "Enter") { ev.preventDefault(); ev.currentTarget.blur(); }
                                      }}
                                    />
                                    <i className="sl-pip" style={{ background: sc ? RAG_COLOR[ragOfScore(sc.sub)] : "transparent" }} />
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ))}

                        <div style={S.dpFoot}>
                          <span>{scored.length} of {METRICS.length} entered</span>
                          <span>Saves as you type</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })}</div>
          )}

          {active.length > 0 && (
            <div style={S.footer}>
              <button style={S.prim} onClick={saveDay} disabled={saving}>
                {saving ? "Saving…" : "Save Day"}
              </button>
              {savedAt && (
                <span style={S.saved}>
                  Saved {savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
              {saveErr && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#DC2626", fontFamily: FONT_BODY }}>
                  Not saved — check the wifi and hit Save Day again
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* ── SCORECARD ── */}
      {tab === "scorecard" && (
        <>
          {rollupWarn && (
            <div style={{ background: "#FFFBEB", border: "1.5px solid #F59E0B", color: "#92400E", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14, fontFamily: FONT_BODY }}>
              Couldn't reach storage for part of this view — scores may be missing
              days, and the dashboard board was not refreshed from them. Check the
              wifi; the next clean load fixes both.
            </div>
          )}

          {/* Who led each daypart on the selected day — reads the same `day`
              object Daily Entry uses, with its own date nav. Read-only. */}
          <div style={S.card}>
            <div style={S.bar}>
              <button style={S.navBtn(atStart)} onClick={() => shiftDate(-1)} disabled={atStart}>‹</button>
              <span style={S.barLabel}>Who led · {fmtNice(dateKey)}</span>
              <button style={S.navBtn(atToday)} onClick={() => shiftDate(1)} disabled={atToday}>›</button>
            </div>
            {DAYPARTS.map((dp) => {
              const e = day[dp.key] || {};
              const led = LEAD_SLOTS
                .map((slot) => ({ label: slot.label.replace(" lead", ""), name: nameById[e[slot.field]] }))
                .filter((x) => x.name);
              return (
                <div key={dp.key} style={S.row}>
                  <span style={S.label}>{dp.label}</span>
                  <span style={{ fontSize: 12.5, color: led.length ? "#374151" : "#9CA3AF", fontWeight: 600, textAlign: "right" }}>
                    {led.length === 0 ? "—" : led.map((x) => `${x.label} ${x.name.split(" ")[0]}`).join(" · ")}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={S.seg}>
            <button style={S.segBtn(period === "week")} onClick={() => setPeriod("week")}>This week</button>
            <button style={S.segBtn(period === "month")} onClick={() => setPeriod("month")}>This month</button>
          </div>

          {/* ★ STANDINGS RAIL — one row per leader, one shared 4.0 rule.
              This replaces the old flat "Coaching independently N/3" bar.
              A single shared AXIS was tried first and thrown out: composites
              bunch between 2.5 and 4.5, so plotting everyone on one line put
              the names on top of each other, and it got worse the more
              leaders there were. A row each can never collide. */}
          {(() => {
            const ranked = rows.filter((r) => r.composite !== null).sort((a, b) => b.composite - a.composite);
            const pos = (c) => Math.max(0, Math.min(100, ((c - 1) / 4) * 100));
            return (
              <div style={S.card}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700 }}>Where everyone stands</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: INK3 }}>{ranked.length} scored</span>
                </div>
                {ranked.length === 0 && <div style={S.empty}>Nobody has a scored shift in this window yet.</div>}
                {ranked.map((r) => (
                  <div key={r.id} className="sl-rail-row">
                    <span style={S.railName}>{r.name.split(" ")[0]}</span>
                    <span className="sl-track">
                      <i className="sl-fill" style={{ width: `${pos(r.composite)}%`, background: scoreColor(r.composite) }} />
                      <i className="sl-line" />
                      <i className="sl-mark" style={{ left: `calc(${pos(r.composite)}% - 6px)`, background: scoreColor(r.composite), boxShadow: `0 0 0 1.5px ${scoreColor(r.composite)}` }} />
                    </span>
                    <span style={{ ...S.railScore, color: scoreColor(r.composite) }}>{r.composite.toFixed(1)}</span>
                  </div>
                ))}
                <div className="sl-rail-row" style={{ paddingTop: 8, borderTop: `1px solid #F2F1F6`, marginTop: 6 }}>
                  <span />
                  <span style={{ position: "relative", height: 12 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} style={S.railScaleTick((n - 1) * 25)}>{n}</span>
                    ))}
                  </span>
                  <span />
                </div>
                <div style={S.note}>
                  Dotted line is {INDEPENDENT_AT.toFixed(1)} — coaching independently.{" "}
                  {ranked.filter((r) => r.composite >= INDEPENDENT_AT).length} of {INDEPENDENT_GOAL} target.
                </div>
              </div>
            );
          })()}

          {canEdit && <button style={{ ...S.ghost, marginBottom: 12 }} onClick={() => setShowGoals(!showGoals)}>
            {showGoals ? "Hide goals" : "Set goals"}
          </button>}

          {canEdit && showGoals && (
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Goals</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>
                Set per daypart — a raw count means something different at breakfast than at lunch.
              </div>
              {goalMetrics.map((m) => (
                <div key={m.key} style={{ marginBottom: 12 }}>
                  <div style={S.label}>
                    {m.label} <span style={{ color: "#9CA3AF", fontSize: 11 }}>{m.dir === "low" ? "lower is better" : "higher is better"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                    {DAYPARTS.map((dp) => (
                      <div key={dp.key} style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", marginBottom: 2, whiteSpace: "nowrap" }}>{dp.label}</div>
                        <input
                          style={{ ...S.inNum, width: "100%", boxSizing: "border-box" }}
                          type="number"
                          inputMode="decimal"
                          value={goalFor(goals, m.key, dp.key)}
                          placeholder="set"
                          onChange={(ev) => setGoal(m.key, dp.key, ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") { ev.preventDefault(); ev.currentTarget.blur(); }
                          }}
                        />
                        {(() => {
                          // What the store ACTUALLY ran this window — evidence
                          // for tuning the goal above it. Blank until data exists.
                          const a = dpActuals[m.key] && dpActuals[m.key][dp.key];
                          if (!a || !a.n) return null;
                          return (
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", marginTop: 3, whiteSpace: "nowrap" }}>
                              avg {Math.round(a.sum / a.n)} · {a.n} day{a.n === 1 ? "" : "s"}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={S.note}>
                Only DT Cars and FC Transactions take goals. The other four score on fixed
                bands and need nothing here: SOS on raw time (under {fmtMSS(SOS_GREEN)} green ·
                {fmtMSS(SOS_GREEN)}-{fmtMSS(SOS_RED)} yellow · over {fmtMSS(SOS_RED)} red) ·
                AHA on % held under 20 min (95+ green · 90-95
                yellow) · Good Scans on % (99+ green · 96-98 yellow) · Trans w/o AHA on a
                per-daypart miss count with a target of zero (breakfast 0-2 green · lunch
                0-5 green · afternoon and dinner 0 green).
              </div>
            </div>
          )}

          {active.length === 0 && <div style={S.card}><div style={S.empty}>No roster yet.</div></div>}

          <div className="sl-cards">{rows.map((r) => {
            const band = scoreBand(r.composite);
            const open = !!explainOpen[r.id];
            return (
            <div key={r.id} style={S.card}>
              <div style={S.cardHead}>
                <span>
                  <span style={S.name}>{r.name}</span>
                  <span style={S.stationTag(r.station !== "BOH")}>{r.station}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: scoreColor(r.composite) }}>{band.word}</span>
                  <span style={S.badge(scoreColor(r.composite))}>{r.composite === null ? "—" : r.composite.toFixed(1)}</span>
                  <button
                    onClick={() => setExplainOpen((m) => ({ ...m, [r.id]: !m[r.id] }))}
                    style={{ background: "none", border: "1px solid #D1D5DB", borderRadius: 999, width: 20, height: 20, padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 800, color: "#6B7280", lineHeight: 1, flexShrink: 0 }}
                    aria-label="What does this score mean?"
                  >
                    {open ? "×" : "?"}
                  </button>
                </span>
              </div>
              {open && (
                <div style={{ background: "#F8FAFC", border: "1px solid #EEF0F2", borderRadius: 10, padding: "10px 12px", margin: "2px 0 10px", fontSize: 12.5, color: "#374151", lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.composite === null ? "—" : r.composite.toFixed(1)} · {band.word}</div>
                  <div style={{ marginBottom: 6 }}>{band.desc}</div>
                  <div style={{ color: "#6B7280" }}>
                    Each metric scores 5 (on goal), 3 (close) or 1 (off goal). The score is
                    the average across the shifts {r.name.split(" ")[0]} led — see the metric
                    dots below for which pulled it up or down. Summit 4.5+ · Climbing 3.5+ ·
                    Finding footing 2.5+ · Base camp under 2.5.
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #E5E7EB", color: "#6B7280" }}>
                    This is a coaching score for the <em>shift</em>, not an HR record — it has
                    nothing to do with points. It's here so you can see which numbers moved on
                    the shifts you led, and pick what to work on next.
                  </div>
                </div>
              )}
              {/* ★ THE COMPOSITE SPINE — the score taken apart. Segment width
                  is weight x days, which IS the composite formula, so a metric
                  with one shift behind it looks exactly as small as it counts. */}
              {(() => {
                const parts = r.perMetric.filter((p) => p.sub !== null && p.weight > 0 && p.days > 0);
                const tot = parts.reduce((a, p) => a + p.weight * p.days, 0);
                if (!tot) return null;
                const segs = parts.map((p) => ({ p, pct: (p.weight * p.days * 100) / tot }));
                const weak = parts.slice().sort((a, b) => a.sub - b.sub)[0];
                return (
                  <div style={{ margin: "13px 0 2px" }}>
                    <div className="sl-spine">
                      {segs.map((sg) => (
                        <i key={sg.p.m.key} style={{ width: `${sg.pct}%`, background: RAG_COLOR[sg.p.rag] }}
                          title={`${sg.p.m.label} \u00b7 ${sg.p.sub}/5 \u00b7 ${sg.p.days} days`} />
                      ))}
                    </div>
                    <div className="sl-keys">
                      {segs.map((sg) => (
                        <span key={sg.p.m.key} style={{ width: `${sg.pct}%` }}>{sg.pct > 11 ? M_SHORT[sg.p.m.key] : ""}</span>
                      ))}
                    </div>
                    <div style={S.spineCap}>
                      Weakest link: <b style={{ color: INK2, fontWeight: 600 }}>{weak.m.label}</b> at {weak.sub} over {weak.days} day{weak.days === 1 ? "" : "s"}.
                    </div>
                  </div>
                );
              })()}
              {r.perMetric.map((p) => (
                <div key={p.m.key} style={S.row}>
                  <span style={S.label}>{p.m.label}</span>
                  <span style={S.metricVal}>
                    <span style={S.dot(RAG_COLOR[p.rag])} />
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK3 }}>{p.days}d</span>
                    <span style={S.cellVal}>
                      {p.value === null ? "—" : (p.m.score === "sosTime" ? fmtMSS(p.value) : `${p.value}${p.m.unit || ""}`)}
                      {p.sub !== null && <span style={{ color: "#9CA3AF", fontWeight: 600 }}> · {p.sub}/5</span>}
                    </span>
                  </span>
                </div>
              ))}
              <div style={S.note}>
                {r.perMetric.every((p) => p.value === null)
                  ? "No days led in this window yet."
                  : `Averaged over the days ${r.name.split(" ")[0]} led.`}
              </div>
            </div>
            );
          })}</div>
        </>
      )}
    </div>
  );
}
