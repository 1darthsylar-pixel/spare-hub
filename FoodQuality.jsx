/* FoodQuality.jsx — Gate City Hub
 * ---------------------------------------------------------------------------
 * WEEKLY food quality sweep, derived from the CFA Q2 2026 Restaurant Quality
 * Improvement Visit (QIV).
 *
 * THE POINT OF THE DESIGN: every item keeps its QIV id and its QIV point
 * value, so the weekly score is directly comparable to the corporate visit
 * score. This is a rehearsal for the visit, not a second opinion about it.
 *
 * OWNER: whoever holds the "quality" seat. `ownerName()` below reads it from
 * `owners.seats`, so this screen has no name of its own to keep in step — set
 * the seat and all three call sites follow. An unfilled seat reads "the food
 * quality owner" rather than a blank.
 * ⚠️ This line said "OWNER_NAME below is the ONLY place her name appears;
 * change that one const" until Aug 13 2026, three commits after that const was
 * replaced by the seat lookup. Kept as a note because the instruction was still
 * being followed by eye long after the code stopped matching it.
 *
 * 0-POINT ITEMS STILL FLAG. Weights, counts and the grilled readings score
 * nothing on the QIV but a fry that weighs 3.1 oz is still wrong, so they are
 * recorded and flagged without moving the percentage. That is exactly how the
 * QIV treats them.
 *
 * Cadence: one sweep per operating week, keyed to the Monday (mondayKeyOf
 * mirrors ShiftLeaderScorecard's mondayOf + fmtKey — Sunday belongs to the
 * week that began the previous Monday).
 * ------------------------------------------------------------------------- */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
/* One row per week in the history. Lives in a leaf so a test can RUN it —
   see sweepHistory.js for the duplicate-rows bug it exists for. */
import { latestPerWeek } from "./sweepHistory.js";
/* The one raised look and accent edge, shared with every tool — see cardStyle.js. */
import { CARD_3D, cardSurface, accentEdge, ACCENT_NEUTRAL } from "./cardStyle.js";
import { kvGetResult, kvSet, saveSubmission, listSubmissions } from "./store.js";
/* ★ AHA LIVES HERE TOO. Matt, Aug 6 2026: "AHA is quality." The dashboard is
   pasted in the Shift Leader Scorecard, where the input belongs, but the five
   scores are a quality read and this is where somebody goes looking for one.
   ⚠️ READ-ONLY, AND DELIBERATELY SO. This tile never writes gcfcr-aha-monthly-v1;
   one writer, one place to paste, no second path that can disagree. */
import { AHA_MONTHLY_KEY, ahaStatus } from "./ahaMonthly.js";
import AhaScores from "./AhaScores.jsx";
import { notifyChannel, CHANNELS } from "./notify.js";
import { STORE_CONFIG } from "./storeConfig.js";

/* IDENTITY — "the standard".
 * Dark gradient masthead over a light page, the profile Matt settled on:
 *   linear-gradient(120deg, <light> 0%, <mid> 30%, <dark> 55%)
 * 120deg and a 55% finish, NOT 135deg corner-to-corner — a 135deg ramp
 * stretches across an iPad-width masthead and reads flat.
 *
 * Warm graphite + gold, deliberately: every other Daily Operations tile is a
 * cool blue-green (Food Safety #0F766E, Ops Checklists #0891B2), and graphite
 * is the one anchor not already spent somewhere in the Hub.
 * GOLD LIVES ONLY ON THE MASTHEAD. On the light body, colour means a score
 * band and nothing else — so gold can never be mistaken for a grade.
 */
const MAST = "linear-gradient(120deg,#3E3B33 0%,#22201A 30%,#12110D 55%)";
const GOLD = "#E0B040";
const GRAPHITE = "#2B2720";
const PAPER = "#F7F5F1";

const ACCENT = GRAPHITE;
const OK = "#15803D";
const BAD = "#B91C1C";
const MID = "#B45309";
const INK = "#1F2937";
const MUTE = "#6B7280";
const LINE = "#E5E7EB";

/* band colours lightened for use ON the dark masthead */
const OK_D = "#5CD68A";
const BAD_D = "#FCA5A5";

const TOOL = "food-quality";
const CONFIG_KEY = "gcfcr-foodquality-config-v1";
const STAMP_KEY = "gcfcr-foodquality-stamp-v1";
const DRAFT_KEY = (week) => `gcfcr-foodquality-${week}-v1`;

/* Sweep duration for the history rows. Minutes in, words out; anything
   unknown renders as nothing — never a fake number. */
const fmtDur = (min) => {
  if (typeof min !== "number" || !isFinite(min) || min < 0) return "";
  if (min < 1) return "under 1m";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
};
const fmtFinish = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
};


/* ★ THE ACTOR STAMP (Hannah + Matt, Jul 31). A sweep carried Lupe's name on a
   day the schedule board says she was not in the building, and nothing
   recorded who was actually signed in — the `by` field is whatever the person
   running the sweep types. The signed-in identity is now read FRESH from the
   session at the moment Finish is pressed (never from a prop, which can be
   stale) and stored separately as `signedInAs`. The typed name still stands
   as the claim; this records who made it. */
const signedInNow = () => {
  try {
    const u = JSON.parse(localStorage.getItem("gcfcr-access-user"));
    return u && (u.name || u.id != null)
      ? { id: u.id != null ? String(u.id) : "", name: u.name || "" }
      : null;
  } catch { return null; }
};
// DELIBERATELY LOOSER than nameMatch.js's normName, and named differently so
// nobody "consolidates" the two. The canonical normName strips punctuation,
// accents and spaces; this one keeps them and only collapses whitespace. It
// compares a typed name against the signed-in name to decide whether to show
// the "signed in as" note, so switching it to the canonical rules would change
// who counts as the same person. That is a behaviour change, not a cleanup.
const looseName = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/* ★ THE OWNER COMES FROM THE FOOD QUALITY SEAT, NOT A LITERAL. The same fact
   already lives in ownerSeed.js under `owners.seats` with id "quality", which
   is where a store sets it and where the accountability chart reads it.
   ⚠️ FIRST NAME ONLY, because all three call sites below are spoken copy
   ("Lupe owns this"), not a record.
   ⚠️ EMPTY IS A REAL ANSWER AND EVERY CALL SITE HANDLES IT: a store that has
   not filled the seat gets "the food quality owner" rather than a blank or a
   dangling separator. */
const ownerName = () => {
  const seat = (STORE_CONFIG.owners.seats || []).find((x) => x.id === "quality");
  return String((seat && seat.holder) || "").trim().split(/\s+/)[0] || "";
};
const ownerLabel = () => ownerName() || "the food quality owner";
const QIV_SOURCE = "CFA Q2 2026 Restaurant Quality Improvement Visit";

/* ---------------------------------------------------------------- week keys */

function mondayKeyOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/* Which calendar quarter — the unit CFA publishes the QIV on. Mirrors
 * quarterOf in inputRegistry.js; the register's quarterly row reads the block
 * this tile writes. */
function quarterOf(d) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function prettyWeek(key) {
  if (!key) return "";
  const parts = String(key).split("-");
  if (parts.length !== 3) return key;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------- the checklist */

/* type "yn"  → Yes / No / N/A
 * type "num" → a number, pass when it lands inside `pass: [lo, hi]`
 * pts        → the QIV point value, carried through verbatim
 */
const BASE_SECTIONS = [
  {
    id: "fp",
    name: "Finished Product",
    hint:
      "Pull one sandwich, one 8-count Nugget, one medium fry and one grilled Nugget straight off the line. Temp and weigh before anything else — both change while you look at the rest.",
    items: [
      { id: "fp1", qiv: "4.1.2", pts: 4, type: "num", unit: "°F", pass: [140, 400], text: "Sandwich filet internal temp is 140°F or higher out of the chutes" },
      { id: "fp2", qiv: "4.1.3", pts: 4, type: "yn", text: "Filet has acceptable bun coverage" },
      { id: "fp3", qiv: "4.1.4", pts: 4, type: "yn", text: "Filet is golden brown" },
      { id: "fp4", qiv: "4.1.5", pts: 4, type: "yn", text: "Filet entirely covered in a generous layer of seasoned coater — no large lumps, no uncooked coater" },
      { id: "fp5", qiv: "4.1.19", pts: 1, type: "yn", text: "Bare spots on the filet total no larger than a quarter" },
      { id: "fp6", qiv: "4.1.7", pts: 0, type: "num", unit: "oz", pass: [3.3, 6], text: "Cooked filet weighs at least 3.3 oz" },
      { id: "fp7", qiv: "4.1.8", pts: 2, type: "yn", text: "2 well-drained pickle chips on the sandwich (3 if they are under 1¼\")" },
      { id: "fp8", qiv: "4.1.16", pts: 2, type: "yn", text: "Bun is buttered with butter-flavored oil" },
      { id: "fp9", qiv: "4.1.18", pts: 2, type: "yn", text: "Bun crown is toasted evenly to the correct color" },
      { id: "fp10", qiv: "4.1.17", pts: 2, type: "yn", text: "Bun heel is toasted evenly to the correct color" },
      { id: "fp11", qiv: "4.1.15", pts: 1, type: "yn", text: "Bun is not torn or crushed, with no flaking or peeling" },
      { id: "fp12", qiv: "4.3.2a", pts: 4, type: "num", unit: "°F", pass: [140, 400], text: "Nugget internal temp is 140°F or higher out of the chutes" },
      { id: "fp13", qiv: "4.3.5", pts: 4, type: "yn", text: "Nuggets meet color requirements" },
      { id: "fp14", qiv: "4.3.6", pts: 4, type: "yn", text: "Nuggets entirely covered in a generous layer of seasoned coater — no large lumps, no uncooked coater" },
      { id: "fp15", qiv: "4.3.4", pts: 2, type: "yn", text: "There are 8 Nuggets in the box" },
      { id: "fp16", qiv: "4.3.3", pts: 0, type: "num", unit: "oz", pass: [4.2, 6], text: "8-count Nugget packaged weight is at least 4.2 oz" },
      { id: "fp17", qiv: "4.3.12", pts: 1, type: "yn", text: "No scraps in the Nugget box" },
      { id: "fp18", qiv: "6.1.1", pts: 4, type: "num", unit: "°F", pass: [170, 300], text: "Waffle fry internal temp is 170°F or higher out of the chutes" },
      { id: "fp19", qiv: "6.1.6", pts: 4, type: "yn", text: "Fries meet color requirements" },
      { id: "fp20", qiv: "6.1.2", pts: 2, type: "yn", text: "Fry package appears full" },
      { id: "fp21", qiv: "6.1.5", pts: 2, type: "yn", text: "Fries are evenly cooked — crisp outside, soft inside, not scorched or soggy" },
      { id: "fp22", qiv: "6.1.10", pts: 0, type: "num", unit: "oz", pass: [4.2, 5.2], text: "Medium fry weight is in range (4.2 – 5.2 oz)" },
      { id: "fp23", qiv: "6.1.10-a", pts: 0, type: "num", unit: "oz", pass: [3, 4], text: "Small fry weight is in range (3 – 4 oz)" },
      { id: "fp24", qiv: "6.1.10-b", pts: 0, type: "num", unit: "oz", pass: [5.6, 6.7], text: "Large fry weight is in range (5.6 – 6.7 oz)" },
      { id: "fp25", qiv: "GN 1.3", pts: 0, type: "num", unit: "°F", pass: [140, 300], text: "Grilled Nugget temp recorded" },
      { id: "fp26", qiv: "GN 1.7", pts: 0, type: "yn", text: "Grilled Nuggets are the correct color and free of excessive carbon" },
    ],
  },
  {
    id: "br",
    name: "Breading",
    hint: "Watch a real batch go through. Do not ask — stand at the table and watch.",
    items: [
      { id: "br1", qiv: "2.2.23", pts: 2, type: "yn", text: "Raw filets are free of loose or hanging fat, bone fragments and cartilage" },
      { id: "br2", qiv: "2.2.22", pts: 2, type: "yn", text: "Each raw chicken pan is dedicated to one type of raw chicken" },
      { id: "br3", qiv: "2.2.25", pts: 2, type: "yn", text: "Seasoned coater pans hold 2\"–3\" of coater at all times" },
      { id: "br4", qiv: "2.2.31", pts: 2, type: "yn", text: "Raw filets are held by the tips" },
      { id: "br5", qiv: "2.2.30", pts: 2, type: "yn", text: "1–2 raw filets are dipped into the milk and egg wash at a time" },
      { id: "br6", qiv: "2.2.29", pts: 4, type: "yn", text: "Raw chicken is fully submerged into the milk and egg wash" },
      { id: "br7", qiv: "2.2.33", pts: 4, type: "yn", text: "Raw chicken is completely and generously covered with evenly-distributed seasoned coater" },
      { id: "br8", qiv: "2.2.10", pts: 2, type: "yn", text: "Breaded filets are transferred without delay" },
      { id: "br9", qiv: "2.2.27", pts: 2, type: "yn", text: "Breaded filets are transferred in the correct transfer pan" },
      { id: "br10", qiv: "2.3.3", pts: 4, type: "yn", text: "Raw Nuggets go into the wash in a perforated pan or wire basket, separated where clumped" },
      { id: "br11", qiv: "2.3.5", pts: 4, type: "yn", text: "Nuggets are separated and rolled with gentle pressure until every surface is evenly covered" },
      { id: "br12", qiv: "2.3.18", pts: 2, type: "yn", text: "Nugget seasoned coater pans hold 2\"–3\" of coater at all times" },
      { id: "br13", qiv: "2.3.20", pts: 2, type: "yn", text: "Breaded Nuggets are transferred without delay" },
      { id: "br14", qiv: "2.3.21", pts: 2, type: "yn", text: "Nuggets are transferred in a wire basket" },
      { id: "br15", qiv: "2.3.22", pts: 2, type: "yn", text: "Nuggets are transferred in the correct transfer pan" },
    ],
  },
  {
    id: "ck",
    name: "Cooking",
    hint: "Henny Penny and the grill. Catch a load going in — most of this is invisible once the lid is down.",
    items: [
      { id: "ck1", qiv: "3.1.18", pts: 2, type: "yn", text: "Filets are not overlapping on the tiered basket shelves" },
      { id: "ck2", qiv: "3.1.19", pts: 2, type: "yn", text: "CFA filets are cooked in a machine set to pressure mode" },
      { id: "ck3", qiv: "3.18.11", pts: 2, type: "yn", text: "Nuggets are cooked in a machine set to pressure mode" },
      { id: "ck4", qiv: "3.16.13", pts: 2, type: "yn", text: "Spicy chicken is cooked in the designated hybrid fryer in open mode, or in the narrow fryer" },
      { id: "ck5", qiv: "3.23.14", pts: 2, type: "yn", text: "Grilled filets are loaded smooth-side down" },
      { id: "ck6", qiv: "3.23.19", pts: 2, type: "yn", text: "Only one type of grilled product is cooked in the same batch" },
      { id: "ck7", qiv: "3.23.16a", pts: 2, type: "yn", text: "Less than a full batch (8 filets or fewer) is loaded starting on the second row" },
    ],
  },
  {
    id: "hd",
    name: "Holding",
    hint: "The kanbans and the Duke/Merco. Check a timer against the pan it belongs to, not just that a timer is running.",
    items: [
      { id: "hd1", qiv: "3.59.5", pts: 4, type: "yn", text: "A timer device is set when breaded chicken is transferred to the kanban" },
      { id: "hd2", qiv: "3.59.6", pts: 1, type: "yn", text: "The timer corresponds with the unique identifier on that breaded chicken kanban" },
      { id: "hd3", qiv: "3.24.3", pts: 4, type: "yn", text: "Grilled chicken past its 30-minute hold time is not served" },
      { id: "hd4", qiv: "3.24.6", pts: 1, type: "yn", text: "Holding pans and kanbans are pushed in fully, with no air gaps" },
      { id: "hd5", qiv: "3.24.8", pts: 1, type: "yn", text: "Juice level is below the insert and no water has been added to the kanban" },
    ],
  },
  {
    id: "fr",
    name: "Fries",
    hint:
      "Salting is a 4-pointer and the dispenser is the usual reason it misses. Clean it daily — CFA calls clogging the key cause of uneven and under-salted fries.",
    items: [
      { id: "fr1", qiv: "3.6.6", pts: 4, type: "yn", text: "Fries are salted with the approved dispenser and the correct number of clicks for the batch size" },
      { id: "fr2", qiv: "WPF 1.10", pts: 1, type: "yn", text: "Salt is above the minimum fill line in the dispenser" },
      { id: "fr3", qiv: "3.6.8", pts: 1, type: "yn", text: "After draining, fries reach the warming station within 5 seconds" },
      { id: "fr4", qiv: "3.7.2", pts: 4, type: "yn", text: "Batches of fries are kept separated in the warming station" },
      { id: "fr5", qiv: "3.7.1", pts: 4, type: "yn", text: "Once packaged, fries are served within 2 minutes" },
    ],
  },
];

/* ------------------------------------------------ config merge (Manage items) */

function buildSections(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const removed = new Set(Array.isArray(cfg.removed) ? cfg.removed : []);
  const overrides = cfg.overrides && typeof cfg.overrides === "object" ? cfg.overrides : {};
  const added = cfg.added && typeof cfg.added === "object" ? cfg.added : {};
  return BASE_SECTIONS.map((sec) => {
    const kept = sec.items
      .filter((it) => !removed.has(it.id))
      .map((it) => ({ ...it, ...(overrides[it.id] || {}) }));
    const extra = (Array.isArray(added[sec.id]) ? added[sec.id] : []).filter(
      (it) => it && it.id && !removed.has(it.id)
    );
    return { ...sec, items: kept.concat(extra) };
  });
}

/* ------------------------------------------------------------------ scoring */

function scoreOf(sections, answers) {
  let earned = 0;
  let available = 0;
  let unanswered = 0;
  let na = 0;
  let total = 0;
  const flagged = [];
  for (const sec of sections) {
    for (const it of sec.items) {
      total += 1;
      const a = answers[it.id] || {};
      const v = a.v;
      if (v === undefined || v === null || v === "") {
        unanswered += 1;
        continue;
      }
      if (v === "na") {
        na += 1;
        continue;
      }
      let ok;
      let shown = v;
      if (it.type === "num") {
        const n = Number(v);
        if (!isFinite(n)) {
          unanswered += 1;
          continue;
        }
        const lo = Array.isArray(it.pass) ? it.pass[0] : -Infinity;
        const hi = Array.isArray(it.pass) ? it.pass[1] : Infinity;
        ok = n >= lo && n <= hi;
        shown = `${n}${it.unit || ""}`;
      } else {
        ok = v === "yes";
      }
      available += it.pts || 0;
      if (ok) earned += it.pts || 0;
      else
        flagged.push({
          section: sec.name,
          id: it.id,
          qiv: it.qiv,
          text: it.text,
          pts: it.pts || 0,
          value: shown,
          note: a.note || "",
        });
    }
  }
  const pct = available > 0 ? Math.round((earned / available) * 1000) / 10 : null;
  return { earned, available, pct, flagged, unanswered, na, total, answered: total - unanswered };
}

function bandColor(pct) {
  if (pct === null || pct === undefined) return MUTE;
  if (pct >= 95) return OK;
  if (pct >= 85) return MID;
  return BAD;
}

function bandColorDark(pct) {
  if (pct === null || pct === undefined) return "rgba(255,255,255,.55)";
  if (pct >= 95) return OK_D;
  if (pct >= 85) return GOLD;
  return BAD_D;
}

/* ------------------------------------------------------------------ the tile */

export default function FoodQuality({ tier = 1, user = null }) {
  const [view, setView] = useState("home"); // home | run | done | manage
  const [config, setConfig] = useState(null);
  const [answers, setAnswers] = useState({});
  const [leader, setLeader] = useState("");
  const [secIdx, setSecIdx] = useState(0);
  const [recent, setRecent] = useState([]);
  // Newest AHA month on file. null until read, and stays null on a failed read.
  const [aha, setAha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  /* ★ THE SWEEP CLOCK (Hannah, Jul 31: "I want to know what time Guadalupe
     completed the QIV today and how long it took her to complete" — the
     completion time was on record, the duration was not; Matt: "make the
     sweep clock"). `startedAt` is stamped ONCE, on the first answer of a
     FRESH sweep, and rides in the draft so a multi-sitting sweep keeps its
     true start. It is deliberately NOT stamped on open (looking is not
     working) and NOT stamped when a draft already carries answers — a sweep
     started before this shipped must read "not recorded", never a fake
     start that makes a two-day sweep look like two minutes. */
  const [startedAt, setStartedAt] = useState(null);
  const answersRef = useRef({});
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const week = useMemo(() => mondayKeyOf(new Date()), []);
  const sections = useMemo(() => buildSections(config), [config]);
  const score = useMemo(() => scoreOf(sections, answers), [sections, answers]);
  const canManage = tier >= 3;

  // cfgFailed → item edits refuse (a save off the default list would erase
  // the team's item changes). draftFailed → the autosave refuses (this week's
  // draft may hold 30 answered items; one fresh answer would save over it).
  // Submitting a finished sweep stays open either way — it appends, never
  // rewrites.
  const cfgFailedRef = useRef(false);
  const draftFailedRef = useRef(false);

  /* ---- load: config, this week's draft, recent submissions ---------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      /* kvGetResult so a failed read is not mistaken for "nothing stored" —
         kvGet returns null for both and never throws (the old .catch chains
         and outer catch were dead code). */
      const [cfgR, draftR, subs, ahaR] = await Promise.all([
        kvGetResult(CONFIG_KEY),
        kvGetResult(DRAFT_KEY(week)),
        listSubmissions(TOOL, 20).catch(() => []),
        kvGetResult(AHA_MONTHLY_KEY),
      ]);
      if (!alive) return;
      /* ⚠️ A FAILED AHA READ SHOWS NOTHING AND WARNS ABOUT NOTHING. It is a
         read-only extra on this screen; letting it set the sweep's error line
         would tell a leader their food safety draft is broken when it is not. */
      setAha(ahaR.ok ? ahaStatus(ahaR.value) : null);
      cfgFailedRef.current = !cfgR.ok;
      draftFailedRef.current = !draftR.ok;
      if (!cfgR.ok || !draftR.ok) {
        setErr("Part of this week's sweep did not load — check the wifi and refresh. Finishing a full sweep still works.");
      }
      setConfig(cfgR.value || null);
      const draft = draftR.value;
      setStartedAt(null); // never carry one week's clock into another
      if (draft && typeof draft === "object") {
        setAnswers(draft.answers && typeof draft.answers === "object" ? draft.answers : {});
        if (draft.leader) setLeader(draft.leader);
        if (draft.savedAt) setSavedAt(draft.savedAt);
        if (draft.startedAt) setStartedAt(draft.startedAt);
      }
      setRecent(Array.isArray(subs) ? subs : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [week]);

  /* ---- draft autosave: a 58-item sweep will not happen in one sitting ----- */
  useEffect(() => {
    if (loading) return;
    if (!Object.keys(answers).length && !leader) return;
    // The stored draft never loaded — an autosave now would write today's few
    // answers over everything already drafted this week. The banner explains.
    if (draftFailedRef.current) return;
    const t = setTimeout(() => {
      const at = new Date().toISOString();
      // savedAt only moves when the write really lands — kvSet resolves false
      // on failure, so the old .then stamped "Saved" over a refused write.
      kvSet(DRAFT_KEY(week), { week, answers, leader, savedAt: at, startedAt })
        .then((ok) => { if (ok !== false) setSavedAt(at); });
    }, 900);
    return () => clearTimeout(t);
  }, [answers, leader, week, loading, startedAt]);

  const setAnswer = useCallback((id, patch) => {
    /* First answer of a FRESH sweep starts the clock. answersRef (not state)
       so this callback needs no deps; the s || guard makes StrictMode's
       double-invoke harmless. Hydration never passes through here, and a
       legacy draft arrives with answers already in the ref, so neither can
       stamp a false start. */
    if (!Object.keys(answersRef.current).length) setStartedAt((s) => s || new Date().toISOString());
    setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }, []);

  const lastSubmitted = recent.length ? recent[0] : null;

  /* ---- submit ------------------------------------------------------------ */
  const submit = useCallback(async () => {
    setSaving(true);
    setErr("");
    try {
      const s = scoreOf(sections, answers);
      /* The clock's two ends ride in the payload. durationMin is derived and
         stored purely for easy reading in history — both raw timestamps are
         here too, so nothing is lost if the rounding ever matters. null =
         "not recorded" (a sweep started before the clock shipped), which the
         history renders as nothing rather than a fake number. */
      const finishedAt = new Date().toISOString();
      const payload = {
        week,
        weekLabel: prettyWeek(week),
        by: leader || (user && user.name) || "",
        source: QIV_SOURCE,
        owner: ownerName(),
        earned: s.earned,
        available: s.available,
        overallPct: s.pct,
        counts: { total: s.total, answered: s.answered, na: s.na, flagged: s.flagged.length },
        flaggedItems: s.flagged,
        answers,
        startedAt: startedAt || null,
        finishedAt,
        durationMin: startedAt
          ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000))
          : null,
        // Who was actually signed in when Finish was pressed — the claim
        // above (`by`) is typed; this is recorded. null = nobody signed in,
        // which the history says out loud rather than hiding.
        signedInAs: signedInNow(),
      };
      /* ⚠️ TWO BUGS LIVED ON ONE LINE. (1) saveSubmission takes (tool,
         submittedBy, payload) and was called with TWO args — so every sweep
         ever submitted stored payload=undefined, which is why the history list
         (r.payload below) rendered blanks and the "submitted this week" check
         never once said yes. Old records keep the wrong shape; new ones are
         right. (2) The result was discarded, and saveSubmission reports a
         refused write by RETURNING FALSE, never throwing — so the catch below
         could not fire, and the stamp still marked the register Done over a
         sweep that did not exist. No save, no stamp, no Done. */
      const ok = await saveSubmission(TOOL, payload.by, payload);
      if (!ok) {
        setErr("The sweep did not save. Nothing was lost — try Finish again.");
        return;
      }
      /* Hannah, Aug 1 2026: "when a sweep is finished automatically post
         moving forward." The same summary shape she approved, posted once
         per successful Finish, beside the food safety walk posts. Best
         effort — the sweep above already saved; a failed post never blocks
         or un-saves it. */
      const durPart = payload.durationMin != null ? ` · took ${fmtDur(payload.durationMin)}` : "";
      const flaggedPart = s.flagged.length ? `${s.flagged.length} flagged` : "none flagged";
      const whoLine = payload.signedInAs && payload.signedInAs.name
        ? (looseName(payload.signedInAs.name) === looseName(payload.by)
            ? `Run by ${payload.signedInAs.name}.`
            : `Name on the sweep: ${payload.by || "—"} · signed in as ${payload.signedInAs.name}.`)
        : (payload.by ? `Name on the sweep: ${payload.by}. Nobody was signed in at Finish.` : "Nobody was signed in at Finish.");
      notifyChannel(CHANNELS.opsSuccess,
        `*QIV sweep, ${payload.weekLabel}*\nFinished ${fmtFinish(finishedAt)}${durPart}. ${s.earned} of ${s.available} points, ${s.answered} of ${s.total} items answered, ${flaggedPart}.\n${whoLine}`);
      const stamped = await kvSet(STAMP_KEY, {
        at: Date.now(),
        week,
        pct: s.pct,
        flagged: s.flagged.length,
        by: payload.by,
      });
      if (stamped === false) {
        // The sweep itself IS saved — only the register's Done stamp missed.
        // Nothing re-posts the stamp later, so say exactly that.
        setErr("Sweep saved. The Input Health stamp did not post, so the register may not show this week as Done.");
      }
      const subs = await listSubmissions(TOOL, 20).catch(() => []);
      setRecent(Array.isArray(subs) ? subs : []);
      setView("done");
    } catch (e) {
      setErr("The sweep did not save. Nothing was lost — try Finish again.");
    } finally {
      setSaving(false);
    }
  }, [sections, answers, week, leader, user, startedAt]);

  /* ---- styles ------------------------------------------------------------ */
  const card = {
    background: "#fff",
    border: `1px solid ${LINE}`,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  };
  const btn = (bg, fg) => ({
    background: bg,
    color: fg || "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  });

  if (loading) {
    return (
      <div style={{ padding: 20, color: MUTE }}>Loading the week&rsquo;s food quality sweep&hellip;</div>
    );
  }

  /* ================================================================== HOME */
  if (view === "home") {
    const started = Object.keys(answers).length > 0;
    return (
      <Shell
        mast={
          <Masthead
            eyebrow={`FOOD QUALITY · WEEKLY${ownerName() ? ` · ${ownerName().toUpperCase()}` : ""}`}
            title={`Week of ${prettyWeek(week)}`}
            sub={
              started
                ? `In progress — ${score.answered} of ${score.total} items checked.`
                : `${score.total} items, five sections, scored the way the visit scores them.`
            }
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "baseline", marginTop: 18 }}>
              <BigDark value={score.pct === null ? "—" : `${score.pct}%`} color={bandColorDark(score.pct)} sub="projected QIV score" />
              <BigDark value={`${score.answered}/${score.total}`} color="#fff" sub="items checked" />
              <BigDark value={String(score.flagged.length)} color={score.flagged.length ? BAD_D : OK_D} sub="flagged" />
              <BigDark value={`${score.earned}/${score.available}`} color="rgba(255,255,255,.72)" sub="points earned" />
            </div>
          </Masthead>
        }
      >
        <div style={card}>
          <Label>How this is scored</Label>
          <p style={{ color: MUTE, fontSize: 13, margin: 0 }}>
            Every item carries its {QIV_SOURCE} point value, so the percentage above is the score the
            visit would give you today. Weights and counts are recorded and flagged but carry no
            points — same as the real audit.
          </p>
        </div>

        {score.flagged.length > 0 && (
          <div style={{ ...card, borderLeft: `3px solid ${BAD}`, borderTop: `3px solid ${BAD}` }}>
            <Label>Flagged so far</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {score.flagged.slice(0, 10).map((f) => (
                <span
                  key={f.id}
                  style={{
                    background: "#FEE2E2",
                    color: BAD,
                    borderRadius: 999,
                    padding: "5px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {f.pts > 0 ? `−${f.pts} ` : ""}
                  {f.text.length > 54 ? `${f.text.slice(0, 54)}…` : f.text}
                </span>
              ))}
              {score.flagged.length > 10 && (
                <span style={{ color: MUTE, fontSize: 12, alignSelf: "center" }}>
                  +{score.flagged.length - 10} more
                </span>
              )}
            </div>
          </div>
        )}

        {aha && aha.has && aha.rec && (
          <div style={card}>
            <Label>AHA · {aha.latest}</Label>
            <AhaScores month={aha.latest} rec={aha.rec} title="From the AHA dashboard" />
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: MUTE, lineHeight: 1.5 }}>
              Pasted in the Shift Leader Scorecard. Shown here because it is a quality read.
              {aha.months > 1 ? ` ${aha.months} months on file.` : ""}
              {aha.current ? "" : ` ${aha.want} has not been pasted yet.`}
            </p>
          </div>
        )}

        <div style={card}>
          <Label>Who is running it</Label>
          <input
            value={leader}
            onChange={(e) => setLeader(e.target.value)}
            placeholder={`Leader name — ${ownerLabel()} owns this, anyone can run it`}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 12px",
              fontSize: 15,
              border: `1px solid ${LINE}`,
              borderRadius: 10,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <button style={btn(MAST)} onClick={() => { setSecIdx(0); setView("run"); }}>
            {started ? "Resume sweep" : "Start this week's sweep"}
          </button>
          {started && (
            <button style={btn("#fff", INK)} onClick={() => setView("done")}>
              Review &amp; finish
            </button>
          )}
          {canManage && (
            <button style={btn("#fff", MUTE)} onClick={() => setView("manage")}>
              ✎ Manage items
            </button>
          )}
        </div>

        <div style={card}>
          <Label>Sections</Label>
          {sections.map((sec, i) => {
            const s = scoreOf([sec], answers);
            return (
              <button
                key={sec.id}
                onClick={() => { setSecIdx(i); setView("run"); }}
                style={{
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: "none",
                  border: "none",
                  borderBottom: i === sections.length - 1 ? "none" : `1px solid ${LINE}`,
                  padding: "12px 2px",
                  cursor: "pointer",
                  color: INK,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 15 }}>{sec.name}</span>
                <span style={{ fontSize: 13, color: s.unanswered === 0 ? OK : MUTE }}>
                  {s.answered}/{s.total}
                  {s.flagged.length > 0 ? ` · ${s.flagged.length} flagged` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {recent.length > 0 && (() => {
          /* Deduped FIRST, then cut to 8 — slicing first would spend the eight
             visible rows on four copies of one week, which is the bug. */
          const weeks = latestPerWeek(recent).slice(0, 8);
          return (
          <div style={card}>
            <Label>Recent weeks</Label>
            {weeks.map(({ row: r, earlier, key }, i) => {
              const p = (r && r.payload) || {};
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "9px 2px",
                    borderBottom: i === weeks.length - 1 ? "none" : `1px solid ${LINE}`,
                    fontSize: 14,
                  }}
                >
                  <span style={{ color: MUTE }}>
                    Week of {p.weekLabel || prettyWeek(p.week)}
                    {p.by ? ` · ${p.by}` : ""}
                    {p.finishedAt ? ` · finished ${fmtFinish(p.finishedAt)}` : ""}
                    {/* The stamp only speaks when it disagrees with the typed
                        name, or when nobody was signed in at all. A record
                        from before the stamp existed has no key and says
                        nothing — absence of evidence, said as absence. */}
                    {p.signedInAs && p.signedInAs.name && looseName(p.signedInAs.name) !== looseName(p.by)
                      ? ` · signed in as ${p.signedInAs.name}` : ""}
                    {Object.prototype.hasOwnProperty.call(p, "signedInAs") && p.signedInAs === null
                      ? " · nobody signed in" : ""}
                    {/* Said out loud rather than quietly dropped. The earlier
                        saves are still filed; this row is the one that counts. */}
                    {earlier > 0
                      ? ` · saved ${earlier + 1} times, showing the last` : ""}
                  </span>
                  <span style={{ fontWeight: 700, color: bandColor(p.overallPct) }}>
                    {p.overallPct === null || p.overallPct === undefined ? "—" : `${p.overallPct}%`}
                    {p.counts && p.counts.flagged ? ` · ${p.counts.flagged} flagged` : ""}
                    {typeof p.durationMin === "number" ? ` · took ${fmtDur(p.durationMin)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          );
        })()}

        {err && <ErrLine text={err} />}
        {savedAt && (
          <p style={{ color: MUTE, fontSize: 12 }}>Draft saved {shortDate(savedAt)} — pick it back up any time this week.</p>
        )}
      </Shell>
    );
  }

  /* =================================================================== RUN */
  if (view === "run") {
    const sec = sections[secIdx];
    if (!sec) {
      setView("home");
      return null;
    }
    const secScore = scoreOf([sec], answers);
    return (
      <Shell
        mast={
          <Masthead
            back={() => setView("home")}
            eyebrow={`SECTION ${secIdx + 1} OF ${sections.length}`}
            title={sec.name}
            sub={sec.hint}
          >
            <p style={{ margin: "14px 0 0", fontSize: 13, fontWeight: 700, color: GOLD }}>
              {secScore.answered}/{secScore.total} checked
              {secScore.flagged.length > 0 ? ` · ${secScore.flagged.length} flagged` : ""}
            </p>
          </Masthead>
        }
      >

        {sec.items.map((it) => (
          <ItemRow key={it.id} item={it} answer={answers[it.id] || {}} onChange={(p) => setAnswer(it.id, p)} />
        ))}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0 40px" }}>
          {secIdx > 0 && (
            <button style={btn("#fff", INK)} onClick={() => { setSecIdx(secIdx - 1); window.scrollTo(0, 0); }}>
              ‹ {sections[secIdx - 1].name}
            </button>
          )}
          {secIdx < sections.length - 1 ? (
            <button style={btn(MAST)} onClick={() => { setSecIdx(secIdx + 1); window.scrollTo(0, 0); }}>
              {sections[secIdx + 1].name} ›
            </button>
          ) : (
            <button style={btn(MAST)} onClick={() => setView("done")}>
              Review &amp; finish ›
            </button>
          )}
        </div>
      </Shell>
    );
  }

  /* ================================================================== DONE */
  if (view === "done") {
    const submitted = lastSubmitted && lastSubmitted.payload && lastSubmitted.payload.week === week;
    return (
      <Shell
        mast={
          <Masthead
            back={() => setView("home")}
            eyebrow="REVIEW & FILE"
            title={`Week of ${prettyWeek(week)}`}
            sub={score.unanswered > 0
              ? `${score.unanswered} item${score.unanswered === 1 ? "" : "s"} still unchecked — they are left out of the score rather than counted as misses.`
              : "Every item checked."}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "baseline", marginTop: 18 }}>
              <BigDark value={score.pct === null ? "—" : `${score.pct}%`} color={bandColorDark(score.pct)} sub="projected QIV score" />
              <BigDark value={`${score.earned}/${score.available}`} color="#fff" sub="points" />
              <BigDark value={String(score.flagged.length)} color={score.flagged.length ? BAD_D : OK_D} sub="flagged" />
              <BigDark value={String(score.na)} color="rgba(255,255,255,.72)" sub="N/A" />
            </div>
          </Masthead>
        }
      >

        <div style={card}>
          <Label>Corrective items</Label>
          {score.flagged.length === 0 ? (
            <p style={{ color: OK, fontWeight: 700, margin: 0 }}>✓ Nothing flagged this week.</p>
          ) : (
            score.flagged
              .slice()
              .sort((a, b) => b.pts - a.pts)
              .map((f, i) => (
                <div key={f.id} style={{ padding: "10px 0", borderBottom: i === score.flagged.length - 1 ? "none" : `1px solid ${LINE}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{f.text}</span>
                    <span style={{ color: f.pts > 0 ? BAD : MUTE, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>
                      {f.pts > 0 ? `−${f.pts} pts` : "0 pts"}
                    </span>
                  </div>
                  <div style={{ color: MUTE, fontSize: 12, marginTop: 3 }}>
                    {f.section} · QIV {f.qiv}
                    {f.value && f.value !== "no" ? ` · read ${f.value}` : ""}
                    {f.note ? ` · “${f.note}”` : ""}
                  </div>
                </div>
              ))
          )}
        </div>

        {err && <ErrLine text={err} />}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
          <button style={btn(saving ? MUTE : MAST)} disabled={saving} onClick={submit}>
            {/* ⚠️ NOT "replaces this week". It never replaced anything —
                saveSubmission appends — and the promise is what made someone
                press it four times in one minute on Aug 3's sweep, each press
                adding a row rather than replacing one. The history now shows
                the newest per week, so pressing this twice reads correctly;
                the label just stops claiming something the storage does not
                do. */}
            {saving ? "Saving…" : submitted ? "Save this week again" : "Finish and file the week"}
          </button>
          <button style={btn("#fff", INK)} onClick={() => setView("run")}>
            Keep checking
          </button>
        </div>
      </Shell>
    );
  }

  /* ================================================================ MANAGE */
  return (
    <ManageItems
      sections={sections}
      config={config}
      onClose={() => setView("home")}
      onSave={async (next) => {
        // The stored config never loaded — saving would erase the team's item
        // changes with whatever this screen was seeded with.
        if (cfgFailedRef.current) {
          setErr("The item list did not load, so edits are off — refresh and try again.");
          return;
        }
        const prev = config;
        setConfig(next);
        // kvSet returns false on failure, it never throws — the old catch here
        // was dead code and a refused save kept the edited list on screen.
        const ok = await kvSet(CONFIG_KEY, next);
        if (ok === false) {
          setConfig(prev);
          setErr("Item changes did not save — check the wifi and try again.");
        }
      }}
    />
  );
}

/* ------------------------------------------------------------ small pieces */

/* Dark gradient masthead over a light page — the Hub's shared header effect,
 * with this tile's own colour. Full-bleed: App.jsx renders a tool component
 * with no padding wrapper of its own, so the bar can run edge to edge and the
 * BODY carries the max-width and the padding.
 */
function Shell({ mast, children }) {
  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK }}>
      {mast}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>{children}</div>
    </div>
  );
}

function Masthead({ eyebrow, title, sub, back, children }) {
  return (
    <div style={{ background: MAST, borderBottom: `3px solid ${GOLD}`, color: "#fff", overflow: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 16px 22px" }}>
        {back && (
          <button
            onClick={back}
            style={{
              background: "rgba(255,255,255,.10)",
              border: "none",
              borderRadius: 8,
              color: GOLD,
              fontWeight: 800,
              fontSize: 13,
              padding: "6px 12px",
              marginBottom: 12,
              cursor: "pointer",
            }}
          >
            ‹ Back
          </button>
        )}
        <div style={{ fontSize: 11, letterSpacing: 1.2, color: GOLD, fontWeight: 800 }}>{eyebrow}</div>
        <h1 style={{ margin: "6px 0 4px", fontSize: 27, fontWeight: 800, lineHeight: 1.15 }}>{title}</h1>
        {sub && (
          <p style={{ margin: 0, color: "rgba(255,255,255,.68)", fontSize: 13, maxWidth: 720, lineHeight: 1.45 }}>
            {sub}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function BigDark({ value, sub, color }) {
  return (
    <div>
      <div style={{ fontSize: 32, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, letterSpacing: 0.5, color: "rgba(255,255,255,.55)", fontWeight: 700, textTransform: "uppercase" }}>
        {sub}
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: 0.8, color: MUTE, fontWeight: 800, marginBottom: 8 }}>
      {String(children).toUpperCase()}
    </div>
  );
}

function ErrLine({ text }) {
  return (
    <p style={{ color: BAD, fontSize: 13, fontWeight: 700 }}>{text}</p>
  );
}

function ItemRow({ item, answer, onChange }) {
  const v = answer.v;
  const isNum = item.type === "num";
  let state = "none";
  if (v === "na") state = "na";
  else if (v !== undefined && v !== "") {
    if (isNum) {
      const n = Number(v);
      if (isFinite(n)) {
        const lo = Array.isArray(item.pass) ? item.pass[0] : -Infinity;
        const hi = Array.isArray(item.pass) ? item.pass[1] : Infinity;
        state = n >= lo && n <= hi ? "ok" : "bad";
      }
    } else state = v === "yes" ? "ok" : "bad";
  }
  const edge = state === "ok" ? OK : state === "bad" ? BAD : state === "na" ? MUTE : LINE;

  const pill = (label, val) => (
    <button
      key={val}
      onClick={() => onChange({ v: val })}
      style={{
        border: `1px solid ${v === val ? edge : LINE}`,
        background: v === val ? (val === "yes" ? "#DCFCE7" : val === "no" ? "#FEE2E2" : "#F3F4F6") : "#fff",
        color: v === val ? (val === "yes" ? OK : val === "no" ? BAD : MUTE) : INK,
        borderRadius: 999,
        padding: "8px 16px",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${LINE}`,
        borderLeft: `3px solid ${edge}`, borderTop: `3px solid ${edge}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{item.text}</span>
        <span style={{ fontSize: 11, color: MUTE, whiteSpace: "nowrap", fontWeight: 700 }}>
          {item.pts > 0 ? `${item.pts} pt${item.pts === 1 ? "" : "s"}` : "0 pts"}
          <br />
          <span style={{ fontWeight: 400 }}>QIV {item.qiv}</span>
        </span>
      </div>

      {isNum ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            inputMode="decimal"
            value={v === "na" ? "" : v || ""}
            onChange={(e) => onChange({ v: e.target.value })}
            placeholder={`${item.pass[0]} – ${item.pass[1]}`}
            style={{
              width: 130,
              padding: "9px 11px",
              fontSize: 15,
              border: `1px solid ${LINE}`,
              borderRadius: 10,
            }}
          />
          <span style={{ color: MUTE, fontSize: 13 }}>{item.unit}</span>
          {pill("N/A", "na")}
          {state === "bad" && (
            <span style={{ color: BAD, fontWeight: 700, fontSize: 13 }}>
              Out of range ({item.pass[0]}–{item.pass[1]}{item.unit})
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pill("Yes", "yes")}
          {pill("No", "no")}
          {pill("N/A", "na")}
        </div>
      )}

      {state === "bad" && (
        <input
          value={answer.note || ""}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="What did you see? (goes on the corrective list)"
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 10,
            padding: "9px 11px",
            fontSize: 14,
            border: `1px solid ${LINE}`,
            borderRadius: 10,
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Manage items UI */

function ManageItems({ sections, config, onClose, onSave }) {
  const cfg = config && typeof config === "object" ? config : {};
  const [removed, setRemoved] = useState(new Set(Array.isArray(cfg.removed) ? cfg.removed : []));
  const [overrides, setOverrides] = useState(cfg.overrides && typeof cfg.overrides === "object" ? cfg.overrides : {});
  const [added, setAdded] = useState(cfg.added && typeof cfg.added === "object" ? cfg.added : {});
  const [qiv, setQiv] = useState(cfg.qiv && typeof cfg.qiv === "object" ? cfg.qiv : null);
  const [newFor, setNewFor] = useState("");
  const [newText, setNewText] = useState("");
  const [newPts, setNewPts] = useState("0");

  const toggleRemoved = (id) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addItem = () => {
    if (!newFor || !newText.trim()) return;
    const id = `x-${newFor}-${Date.now().toString(36)}`;
    const item = { id, qiv: "local", pts: Number(newPts) || 0, type: "yn", text: newText.trim() };
    setAdded((prev) => ({ ...prev, [newFor]: (prev[newFor] || []).concat([item]) }));
    setNewText("");
    setNewPts("0");
  };

  const save = () => {
    onSave({ removed: Array.from(removed), overrides, added, qiv });
    onClose();
  };

  /* ★ THE QUARTERLY HANDLE. CFA reissues the QIV every quarter, so the item
     list has a shelf life the weekly sweep can't see. Marking it reviewed
     stamps the quarter into the config, which is what the Input Health
     "Item list vs new quarter" row reads. Nothing here edits production data
     behind anyone's back — it records that a human looked. */
  const thisQuarter = quarterOf(new Date());
  const current = qiv && qiv.quarter === thisQuarter;
  const markReviewed = () =>
    setQiv({ quarter: thisQuarter, version: QIV_SOURCE, reviewedAt: new Date().toISOString() });

  return (
    <Shell
      mast={
        <Masthead
          back={onClose}
          eyebrow="EDIT THE LIST"
          title="Manage items"
          sub={`Reword or retire an item, or add one of your own. Changes are stored separately from the ${QIV_SOURCE} list, so next quarter's QIV can be dropped in without losing them.`}
        />
      }
    >

      <div style={{ background: "#fff", boxShadow: CARD_3D, border: `1px solid ${LINE}`, borderLeft: `3px solid ${current ? OK : MID}`, borderTop: `3px solid ${current ? OK : MID}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        {/* ⚠️ SAYS PLAINLY THAT THIS IS NOT THE WEEKLY SWEEP (Matt, Aug 2 2026).
            "Source list" plus a QIV reference read as the sweep itself, and he
            answered the Input Register's nag with "QIV was done on Thursday" —
            it had been. This card is the QUARTERLY list-versus-new-edition
            check, and the copy now leads with that difference. */}
        <Label>Item list vs new quarter</Label>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: MUTE }}>
          {current
            ? `Checked against ${qiv.version || thisQuarter} on ${shortDate(qiv.reviewedAt)}.`
            : qiv && qiv.quarter
            ? `Last checked against ${qiv.version || qiv.quarter}. ${thisQuarter} has not been checked yet — Chick-fil-A reissues the QIV with a changed item list each quarter.`
            : `Our item list has never been checked against a new quarter. It is seeded from the ${QIV_SOURCE}, and Chick-fil-A reissues the QIV each quarter with changes.`}
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTE, lineHeight: 1.5 }}>
          This is <b>not</b> the weekly sweep. It asks whether the list of items
          being swept still matches the edition Chick-fil-A publishes this quarter.
        </p>
        <button
          onClick={markReviewed}
          disabled={current}
          style={{
            background: current ? "#F3F4F6" : MAST,
            color: current ? MUTE : "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 14,
            fontWeight: 700,
            cursor: current ? "default" : "pointer",
          }}
        >
          {current ? `✓ Reviewed for ${thisQuarter}` : `Mark reviewed for ${thisQuarter}`}
        </button>
      </div>

      {sections.map((sec) => (
        <div key={sec.id} style={{ background: cardSurface(), border: `1px solid ${LINE}`, borderRadius: 14, ...accentEdge(ACCENT_NEUTRAL, 3), boxShadow: CARD_3D, padding: 14, marginBottom: 12 }}>
          <Label>{sec.name}</Label>
          {sec.items.map((it) => {
            const gone = removed.has(it.id);
            return (
              <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                <input
                  value={(overrides[it.id] && overrides[it.id].text) || it.text}
                  onChange={(e) => { const v = e.target.value; setOverrides((p) => ({ ...p, [it.id]: { ...(p[it.id] || {}), text: v } })); }}
                  disabled={gone}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    fontSize: 14,
                    border: `1px solid ${LINE}`,
                    borderRadius: 8,
                    textDecoration: gone ? "line-through" : "none",
                    color: gone ? MUTE : INK,
                  }}
                />
                <button
                  onClick={() => toggleRemoved(it.id)}
                  style={{ background: "none", border: "none", color: gone ? ACCENT : BAD, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                >
                  {gone ? "Restore" : "Remove"}
                </button>
              </div>
            );
          })}
          <button
            onClick={() => setNewFor(sec.id)}
            style={{ background: "none", border: "none", color: ACCENT, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: "10px 0 0" }}
          >
            + Add an item to {sec.name}
          </button>
          {newFor === sec.id && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="What should be checked?"
                style={{ flex: 1, minWidth: 220, padding: "9px 11px", fontSize: 14, border: `1px solid ${LINE}`, borderRadius: 8 }}
              />
              <input
                value={newPts}
                onChange={(e) => setNewPts(e.target.value)}
                inputMode="decimal"
                style={{ width: 70, padding: "9px 11px", fontSize: 14, border: `1px solid ${LINE}`, borderRadius: 8 }}
              />
              <button
                onClick={addItem}
                style={{ background: MAST, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}
              >
                Add
              </button>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={save}
        style={{ background: MAST, color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 40 }}
      >
        Save changes
      </button>
    </Shell>
  );
}
