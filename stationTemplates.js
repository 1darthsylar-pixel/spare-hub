/* ============================================================================
   stationTemplates.js — Gate City Hub · Daily Setups LOCKED station templates

   ★ THIS FILE IS THE SOURCE OF TRUTH. Station hours change HERE.

   It was originally generated from the Google Sheets (FOH Schedule(New) /
   BOH Schedule(New)) on July 9, 2026 — but the Sheet is being RETIRED and is
   no longer maintained. Do not "check the sheet first"; do not treat a
   Sheet/template difference as drift. The Sheet is the thing that drifts now.
   (Cross-checked all three FOH tabs against this file on July 15, 2026: every
   posted hour matched. The only differences were Register 4 and OT 3, which
   were deliberately removed from here and left in the Sheet.)

   Verified day-by-day facts:

   FOH — Mon/Tue/Wed identical. Thu: Expo 1 → 9PM, Register 3 → 11AM-8PM.
   Fri/Sat (identical weekend template): DRINKS 2 exists (weekend only,
   leader-covered at lunch), DRINKS/DESSERTS is a real 9-11AM station
   (weekdays: Leader), MOBILE BAGGER is a real 11AM-2PM station (weekdays:
   Leader), Register 1 6AM-9PM, Register 2 8:30AM-9PM, Register 3 11AM-2PM,
   Expo 1 11AM-9PM, Expo 2 continuous 11:15AM-9PM, OT 2 11:15AM-8PM.

   BOH — Mon/Tue/Wed identical. Thu: Primary Point → 10PM, Nuggets/Strips
   → 10PM, Grilled/Soup/Mac → 8:30AM-11PM, Loader #1 → 8:30AM-2PM.
   (July 16: Thursday's "Specials/Grilled/Buns → Leader" and its Dish 1
   lunch block were REMOVED — Thursday now matches the other weekdays:
   THREE people on PRIMARY 11-2, and no lunch dish position. Chloe reported
   the auto setup seating the buns person on Dishes at lunch and the team
   following it; with only two open PRIMARY stations, the third Boards-1
   body had nowhere to go and the fallback pass took the only other open
   cell. Matt: "Eliminate the lunch dish position and have 3 people on
   primary 11-2 everyday.")
   Fri/Sat (identical): Machines 4,5 adds 11AM-2PM lunch block, Loader #1
   8:30AM-2PM + 5PM-8PM, Kitchen Manager/FC opens 11AM, Primary Point →
   10PM, Grilled/Soup/Mac → 11PM, Nuggets/Strips → 10PM.

   OUTCOME-OVER-LABEL DECISIONS (the Sheet's label contradicted how it was
   actually staffed — encoded to the staffing, noted here):
   • Fri/Sat Dish 1: label said "11AM-2PM", staffed at night → 5PM-11PM.
   • Fri/Sat Hash/S Fry: label said "9AM-11AM", staffed through lunch on
     both days → 9AM-2PM.

   CELL MARKERS
   ------------
   The Auto Assignment engines NEVER overwrite a non-empty cell, so the
   markers below double as engine locks:
     ''              open — the engine may place someone here
     '❌'            closed this period
     '✔️' / '✔️(Line!!)' / 'split duties'   leader/line covers — locked

   SHAPE
   -----
   Times are minutes-from-midnight. hours = array of {start,end} blocks
   (split shifts = two blocks); hours: null = no posted hours (open all
   day unless every cell is marked). leader: true → "(Leader)" row.
   cellOverrides: per-period marker that beats the computed one.
   overflow: true → normally-closed spare: ❌ everywhere, manual-assign only.
   NOTE: all five overflow stations (Register 4, OT 3, Dish 2, Secondary
   Prep, Cookies & Brownies) were REMOVED on July 13, 2026 as unused. The
   `overflow` machinery is still live in cellsOf/stationOpenInPeriod, so
   re-adding one is just pasting the line back. Ad-hoc extras go in the
   board's "Additional — added today" section instead.

   buildDayBoard(side, dayKey) at the bottom returns a board in
   DailySetup's exact shape — FOH { stations, trainers, roster } or BOH
   { sections, roster, reminders, weights } — with role strings like
   "WINDOW (6AM-11PM)" and every cell pre-marked. DailySetup uses it for
   the Auto draft's first seed and as the base for every import, so the
   structure always comes from here. ("Reset stations" was removed with the
   Google Docs rip-out on July 14.)
   ========================================================================== */


import { storeCfg } from "./storeConfig.js";

/* ⚠️ THIS FILE NO LONGER IMPORTS NOTHING, AND THAT IS THE ONE RULE THIS STEP
   BENDS. storeConfig.js is itself a strict leaf that imports nothing, so the
   chain still terminates and there is no cycle — cyclecheck confirms it. The
   reason it is safe is the reason storeConfig was built as a leaf in the first
   place: it is read by client tiles AND by worker.js, so it can never pull
   something one of the two cannot run. Do not import anything else here. */

/* The `T`, `st` and `blk` builders that used to live here are gone with the
   literal templates they built. Times are plain minute numbers in the config
   now, so nothing needs converting on the way in. */

/* ---- period windows (minutes) — Hub convention ----
   ★ NOW READ FROM storeConfig.js (step 2, Aug 11 2026). Same four windows,
   same minutes; the numbers moved, the meaning did not.
   ⚠️ THIS IS THE *OVERLAP* TEST, NOT THE LABOR MATHS. It decides whether a
   station is OPEN in a period and is deliberately generous. dayparts.js holds
   a SECOND, NARROWER definition of the same four windows that decides how many
   HOURS a filled cell is worth, and the two disagree about where breakfast
   ends. Both are carried in the config, in different units, with that
   disagreement written down. Do not reconcile one without the other. */
/* ★ A GETTER OBJECT, NOT A CAPTURED ONE (step 3, Aug 11 2026). Callers still
   write PERIODS.breakfast and are untouched, but the value is read when they
   ask rather than when this module loaded — so a store that edits its windows
   in settings has them take effect. laborEngine.js reads these inside
   dpHouseSplit at call time, which is exactly the shape a getter serves. */
export const PERIODS = Object.freeze({
  get breakfast() { return storeCfg("stations.boardPeriods.breakfast"); },
  get lunch() { return storeCfg("stations.boardPeriods.lunch"); },
  get mid() { return storeCfg("stations.boardPeriods.mid"); },
  get night() { return storeCfg("stations.boardPeriods.night"); },
});
const SHIFT_KEYS = ['breakfast', 'lunch', 'mid', 'night'];

export function stationOpenInPeriod(station, periodKey) {
  if (station.overflow || station.leader) return false;
  if (!station.hours) return true;
  const p = PERIODS[periodKey];
  return station.hours.some((b) => b.start < p.end && b.end > p.start);
}

/* ============================ TEMPLATES ================================= */

/* ★★ THE BOARD IS DATA NOW (step 2 of the store configuration layer, Aug 11
   2026). All six days for both houses live in storeConfig.js under `stations`,
   288 rows, so a new store types its own board in rather than having these
   templates hand-edited for it.

   ⚠️⚠️ WHERE THE REASONING WENT — READ IT BEFORE CHANGING ANYONE'S HOURS.
   This file used to carry ~90 lines of notes explaining why each station has
   the hours it has: Matt's rulings with dates and his own words, roster
   balances verified against a real Friday, and decisions that were made and
   then superseded. None of that is recoverable once lost, so it was moved
   VERBATIM to docs/station-template-history.md rather than deleted with the
   code it annotated.

   ⚠️ ONE REAL BEHAVIOUR PROPERTY CHANGED, AND IT IS NOT VISIBLE IN THE BOARD.
   Monday to Wednesday shared one template object, and Thursday and the weekend
   were built by TRANSFORMING it. The config holds all six days flat instead,
   which is what a days-across grid editor needs. So editing Monday no longer
   moves Thursday with it. Today's output is identical either way — that is
   proved by hash — but a future edit behaves differently, and that is a
   deliberate trade, not an accident.

   ⚠️ THE ENGINES NEVER OVERWRITE A NON-EMPTY CELL, so the markers below double
   as engine locks. That contract is unchanged:
     ''              open — the engine may place someone here
     '❌'            closed this period
     '✔️' / 'split duties'   leader/line covers — locked */
/* ★ THE BOARD, READ WHEN ASKED. Same shape — STATION_TEMPLATES.FOH.Mon still
   works — but a store's saved stations reach it.
   ⚠️ ONLY FOH AND BOH ARE EXPOSED. `stations` in the config also carries the
   two daypart-window definitions, and this object has always been houses only.
   Handing callers the windows as if they were a third house would put them in
   every loop over Object.keys. */
export const STATION_TEMPLATES = Object.freeze({
  get FOH() { return storeCfg("stations.FOH"); },
  get BOH() { return storeCfg("stations.BOH"); },
});

export function templatesFor(house, dayKey) {
  /* Straight through the reader so a saved board is picked up, and an unknown
     house or day still answers with an empty list rather than throwing. */
  return storeCfg(`stations.${house}.${dayKey}`, []) || [];
}

/* ==================== BOARD BUILDER (DailySetup shape) ================== */

export const BOH_REMINDERS = [
  "Pls have Secondary Fry open @11!!!",
  "Breading tables CAN'T be broken down until the LAST order is taken!!",
  "DO NOT start floors until CLOSE!!",
  "DONT FORGET TO RECORD WASTE!!!",
];
export const BOH_WEIGHTS = {
  weights: "Filet Weight: 3.3   |   Nugget Weight: 4.2   |   Fry Weight: 4.4   |   ERQA",
  foodsafety5: "Food Safety 5:  1. Health & Hygiene   2. Time & Temperature   3. Cleaning & Sanitation   4. Pests   5. Cross-Contamination",
};

function fmtClockLabel(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const mer = h >= 12 ? "PM" : "AM";
  let disp = h % 12;
  if (disp === 0) disp = 12;
  return m ? `${disp}:${String(m).padStart(2, "0")}${mer}` : `${disp}${mer}`;
}

function roleOf(stn) {
  if (stn.leader) return `${stn.name} (Leader)`;
  if (!stn.hours) return stn.name;
  const label = stn.hours.map((b) => `${fmtClockLabel(b.start)}-${fmtClockLabel(b.end)}`).join(", ");
  return `${stn.name} (${label})`;
}

function cellsOf(stn) {
  const out = {};
  SHIFT_KEYS.forEach((k) => {
    if (stn.cellOverrides && stn.cellOverrides[k] != null) out[k] = stn.cellOverrides[k];
    else if (stn.overflow) out[k] = "❌";
    else if (stn.leader) out[k] = stn.cellText || "✔️";
    else out[k] = stationOpenInPeriod(stn, k) ? "" : "❌";
  });
  return out;
}

/* buildDayBoard('foh'|'boh', 'Mon'…'Sat') → a board day in DailySetup's
   exact shape, structure and markers locked to the verified templates. */
export function buildDayBoard(side, dayKey) {
  const house = side === "foh" ? "FOH" : "BOH";
  const list = templatesFor(house, dayKey);
  if (side === "foh") {
    const stations = list.map((s) => ({ role: roleOf(s), ...cellsOf(s), duty: s.duty || "" }));
    return { stations, trainers: [], roster: [] };
  }
  const order = [];
  const secs = {};
  list.forEach((s) => {
    if (!secs[s.section]) { secs[s.section] = { name: s.section, stations: [] }; order.push(s.section); }
    secs[s.section].stations.push({ role: roleOf(s), ...cellsOf(s), duty: s.duty || "" });
  });
  return {
    sections: order.map((k) => secs[k]),
    roster: [],
    reminders: [...BOH_REMINDERS],
    weights: { ...BOH_WEIGHTS },
  };
}

export default STATION_TEMPLATES;
