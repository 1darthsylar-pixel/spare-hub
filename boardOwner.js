/* boardOwner.js — WHO IS RESPONSIBLE, RESOLVED OFF THE DAILY SETUP BOARD
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Matt, Jul 26 2026: "For the checklist and cleaning lists I want it to assign
 * by using the setup. Audit is by open and closing leaders."
 *
 * The board already records who is on which station on which day and daypart.
 * This module is the ONE place that reads it and answers "who owns this today".
 * The input register ([[input-health]]) routes its shift-owned rows through
 * here; the worker routes push notifications through the same answers.
 *
 * ⚠️ WHY THIS IS A LEAF MODULE AND NOT A FUNCTION INSIDE DailySetup.jsx
 * The food safety rota rule lives in TWO places today — `fsAssignFor` in
 * DailySetup.jsx and a copy inside worker.js — because the worker cannot import
 * a .jsx component. Change one and the board and the Slack post silently name
 * different people. That duplication was avoidable: worker.js already imports
 * plain .js modules (trainerTaskRoster, aiSummary, eosTouchIn). So this file
 * imports NOTHING but nameMatch.js (itself dependency-free), has no React, no
 * store.js, and no `import.meta.env` — which means both halves of the app can
 * import it and there is exactly one copy of the rule.
 *
 * ⚠️ NEVER add a store/React/env import here. `import.meta.env` in a worker
 * bundle throws at module scope and takes down every scheduled job with it.
 */

import { normName, nameParts } from "./nameMatch.js";

export const DAYPARTS = ["breakfast", "lunch", "mid", "night"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n) => String(n).padStart(2, "0");

/* ── Board addressing ────────────────────────────────────────────────────
 * Boards are stored one row PER WEEK keyed to that week's Monday:
 *   gcfcr-dailysetup-{foh|boh}-v2-{YYYY-MM-DD}-auto
 * and the value is keyed by DAY NAME. Local dates on purpose — DailySetup
 * writes local, and a UTC key slides a day for half the year.
 * Sunday walks BACK six days (the store is shut, but the key must still be
 * the week that began the previous Monday, never the week ahead).
 */
export function mondayKeyOf(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export const dayNameOf = (d = new Date()) => DAY_NAMES[new Date(d).getDay()];
export const boardKey = (house, monday) =>
  `gcfcr-dailysetup-${house === "boh" ? "boh" : "foh"}-v2-${monday}-auto`;

/* ── Reading a cell ──────────────────────────────────────────────────────
 * VERIFIED AGAINST THE REAL BOARD (week of 2026-07-20, both houses, all six
 * days). A cell is NOT just a name. Every one of these is live data:
 *
 *   "✔️Daisy"          leader-covered AND staffed — the ✔️ is a marker, not a name
 *   "✔️"               leader-covered, NOBODY named → must resolve to nobody
 *   "✔️(Line!!)"       marker plus a note
 *   "❌"               station closed this daypart
 *   "split duties"     covered by whoever is already there
 *   "Samuel @8:30"     starts partway through the daypart
 *   "Camila G →Saray 6"  HANDOFF — two people, first one owns the daypart
 *   " Caymen" / "Ashley "  stray leading/trailing space
 *   ""                 empty
 *
 * A naive read hands "✔️Daisy" to a name matcher, it matches nobody, and the
 * row silently routes to no one — the exact failure mode that kept Thania's
 * trainer reminder from ever sending. Strip the furniture FIRST.
 */
const MARKERS = /[✔✅❌✖✗☑️\uFE0F]/g;

export function cellName(cell) {
  let s = String(cell == null ? "" : cell);
  s = s.replace(MARKERS, "");            // ✔️ / ❌ / variation selectors
  s = s.split(/→|->/)[0];                // handoff: the first name owns it
  s = s.split("@")[0];                   // "@8:30" start-time suffix
  s = s.replace(/\([^)]*\)/g, "");       // "(Line!!)" style notes
  s = s.trim();
  if (!s) return "";
  if (/^split duties$/i.test(s)) return "";
  // A cell that survived stripping but has no letters is furniture, not a name.
  if (!/[a-z]/i.test(s)) return "";
  return s.replace(/\s+/g, " ");
}

/* ── Which rows are the leader rows ──────────────────────────────────────
 * Identified STRUCTURALLY, from the station templates, not by guessing at
 * words. FOH stations are a flat list; BOH stations sit under sections.
 *
 * ⚠️ ASSISTANT DIRECTOR ROWS ARE DELIBERATELY EXCLUDED from opener/closer.
 * The AD is not the leader running the daypart, and on the real board the AD
 * row is DUPLICATED many times over (Friday FOH carries eighteen of them, most
 * blank). Counting them would both name the wrong person and swamp the answer.
 */
const DT_ROW = /^(LEADER DT|Kitchen Lead\s*\/\s*DT)\b/i;
const FC_ROW = /^(LEADER FC|Kitchen Manager\s*\/\s*FC)\b/i;

function stationsOf(day) {
  if (!day || typeof day !== "object") return [];
  if (Array.isArray(day.stations)) return day.stations;          // FOH shape
  if (Array.isArray(day.sections)) {                              // BOH shape
    const out = [];
    day.sections.forEach((sec) => {
      (sec && Array.isArray(sec.stations) ? sec.stations : []).forEach((s) => out.push(s));
    });
    return out;
  }
  return [];
}

/* ── Who is on, and where, for one daypart ─────────────────────────────────
 * Matt, Aug 7 2026: "add the message your team before the start of the shift so
 * they know where to go instead of where am i going."
 *
 * One house, one day, one daypart → [{ name, station, start }], one row per
 * person per station. `start` is the "@8:30" suffix when the cell carries one
 * and "" otherwise.
 *
 * ⚠️ IT REUSES cellName RATHER THAN RE-READING A CELL. Everything above this
 * line already knows how to get a person out of "✔️Daisy" or "Samuel @8:30",
 * and a second copy of those rules is a copy that drifts — which for a function
 * deciding who gets told where to stand means telling the wrong person.
 *
 * ⚠️ A HANDOFF NAMES BOTH PEOPLE HERE, WHICH IS THE ONE PLACE THIS DIFFERS
 * FROM cellName. "Camila G →Saray 6" means Camila works it and Saray takes it
 * at 6, so BOTH are on that station that daypart. cellName deliberately keeps
 * only the first, because it answers "who OWNS this daypart" for the opener and
 * closer rows. This answers "who is working", and dropping Saray would mean the
 * one person on the board most likely to be unsure where she is going is the
 * one person nobody tells. So the cell is split on the arrow FIRST and cellName
 * runs on each half.
 *
 * ⚠️ A BARE ✔️ RESOLVES TO NOBODY AND MUST STAY THAT WAY. It means the leader
 * covers it, not that somebody is assigned. cellName already returns "" there.
 */
const HANDOFF = /→|->/;
const START_AT = /@\s*(\d{1,2}(?::\d{2})?)/;
/* ⚠️ THE SECOND HALF OF A HANDOFF CARRIES A BARE CLOCK, NOT AN "@" ONE.
   "Camila G →Saray 6" means Saray takes it at 6, and cellName strips "@8:30"
   but has no reason to strip a trailing bare number — so without this the
   person's NAME came out as "Saray 6" and every name match downstream failed
   silently, which is a push that resolves to nobody with nothing in the log.
   Caught by the leaf's own test before this ever ran against a real board.
   DailySetup.jsx already reads this exact shape the same way. */
const BARE_CLOCK = /\s(\d{1,2}(?::\d{2})?)\s*$/;

export function daypartAssignments(day, daypart) {
  const dp = String(daypart || "");
  if (!DAYPARTS.includes(dp)) return [];
  const out = [];
  stationsOf(day).forEach((st) => {
    if (!st || typeof st !== "object") return;
    const station = String(st.role || "").trim();
    const raw = String(st[dp] == null ? "" : st[dp]);
    if (!raw.trim()) return;
    raw.split(HANDOFF).forEach((part) => {
      const at = part.match(START_AT);
      /* Take the bare clock off BEFORE cellName so the name is a name. Only
         when there is no "@" time, so a cell can never yield two answers. */
      const bare = at ? null : part.match(BARE_CLOCK);
      const name = cellName(bare ? part.replace(BARE_CLOCK, "") : part);
      if (!name) return;
      out.push({ name, station, start: at ? at[1] : bare ? bare[1] : "" });
    });
  });
  return out;
}

/* Both houses, one daypart → [{ name, stations:[...], start }], one row PER
 * PERSON. Somebody on two stations gets one message naming both rather than two
 * messages, because two phone alerts thirty seconds apart read as a bug.
 *
 * ⚠️ GROUPED ON THE NORMALISED NAME, SHOWN AS THE BOARD SPELLS IT. "Camila G"
 * and "camila g" are one person to nameMatch and two keys to a plain object.
 * The displayed name is the first spelling seen, so the message reads the way
 * the board reads.
 * ⚠️ THE EARLIEST START WINS when a person holds two cells with different
 * times. Telling somebody 11:15 when one of their stations wants them at 8:30
 * is worse than telling them nothing.
 */
/* ⚠️⚠️ A STATION CELL SAYS "Ashley". THE DAY'S ROSTER SAYS WHICH ASHLEY.
   (Hannah, Aug 12 2026: "multiple people, including me, are receiving
   notifications that we are scheduled in certain positions but we are not.")

   Cells are written short — "Ashley", "Jose", "Monica @6" — and pushToPerson
   matches a subscriber on first name plus the INITIAL of the second token. A
   cell carrying only a first name therefore reaches EVERY person who answers to
   it. On the week of Aug 10 that was three real sends to the wrong phone:

     Monday night   "Ashley"  → only Ashley Valadez works Monday
     Monday night   "Jose"    → only Jose Arias Cortez works Monday
     Wednesday night "Jose"   → only Jose Mendez Olayo works Wednesday

   ★ THE BOARD ALREADY KNOWS. Each day carries a `roster` of the people
   scheduled that day, by FULL name: "Ashley Rangel-avila 11-2". So the cell
   does not have to be guessed at and does not have to be rewritten — it is
   resolved against the day it was written for.

   ⚠️ RESOLVED ONLY WHEN THE ANSWER IS SINGULAR. Two matches on the same day is
   a cell nobody can read, so the name is left exactly as the board spells it
   and the row is marked `ambiguous`. The caller sends to NOBODY and names them
   instead — a phone buzzing the wrong person is worse than a phone staying
   quiet, and it is how a store learns to switch alerts off.
   ⚠️ ZERO MATCHES ALSO LEAVES IT ALONE. A cell naming somebody who is not on
   that day's roster is a board mistake, not a licence to pick somebody.

   ⚠️ NOT A REWRITE OF THE BOARD. Nothing here writes. The stored cell keeps the
   words the leader typed; only what the ALERT resolves to changes. */
const SCHEDULE_TAIL = /\s+\d{1,2}(?::\d{2})?\s*-.*$/;

/* "Ashley Rangel-avila 11-2" → "Ashley Rangel-avila". The hours are cut before
   the first "<digits>-", so a hyphenated surname ("Garcia-parra", "Rangel-avila")
   is never mistaken for a time range — it has no space-and-digit in front of it. */
export function rosterPersonNames(day) {
  const list = (day && Array.isArray(day.roster)) ? day.roster : [];
  const out = [];
  for (const entry of list) {
    const name = String(entry == null ? "" : entry).replace(SCHEDULE_TAIL, "").trim();
    if (name && !out.some((n) => normName(n) === normName(name))) out.push(name);
  }
  return out;
}

/* One cell name → the one person on today's roster it can mean, or the cell
   name unchanged. Returns `{ name, ambiguous }` so the caller can tell the
   difference between "resolved" and "could not be resolved". */
export function resolveAgainstDay(cellName, people) {
  const hits = (people || []).filter((p) => isOwner(p, { names: [cellName] }));
  if (hits.length === 1) return { name: hits[0], ambiguous: false };
  return { name: cellName, ambiguous: hits.length > 1 };
}

export function daypartRoster(boards, date = new Date(), daypart = "breakfast") {
  const dayName = dayNameOf(date);
  const fohDay = ((boards && boards.foh) || {})[dayName];
  const bohDay = ((boards && boards.boh) || {})[dayName];
  /* Both houses pooled: a BOH cell can name somebody the FOH roster lists, and
     the question "who is scheduled today" has one answer per store, not two. */
  const people = [...rosterPersonNames(fohDay), ...rosterPersonNames(bohDay)]
    .filter((n, i, a) => a.findIndex((m) => normName(m) === normName(n)) === i);
  const rows = [
    ...daypartAssignments(fohDay, daypart),
    ...daypartAssignments(bohDay, daypart),
  ].map((r) => {
    const hit = resolveAgainstDay(r.name, people);
    return { ...r, name: hit.name, ambiguous: hit.ambiguous };
  });
  const byPerson = new Map();
  rows.forEach((r) => {
    const key = normName(r.name);
    if (!key) return;
    const hit = byPerson.get(key);
    if (!hit) {
      byPerson.set(key, { name: r.name, stations: r.station ? [r.station] : [], start: r.start, ambiguous: !!r.ambiguous });
      return;
    }
    /* Sticky: if ANY cell for this person could not be resolved, the row stays
       unresolved. Half-certain is not certain, and the alert is the thing that
       reaches a phone. */
    if (r.ambiguous) hit.ambiguous = true;
    if (r.station && !hit.stations.includes(r.station)) hit.stations.push(r.station);
    /* String compare is wrong for clock times ("9:00" sorts after "11:15"), so
       compare minutes. A cell with no time never overwrites one that has one. */
    if (r.start && (!hit.start || minsOf(r.start) < minsOf(hit.start))) hit.start = r.start;
  });
  return [...byPerson.values()];
}

function minsOf(t) {
  const m = String(t || "").match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return Infinity;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

export const DAYPART_LABEL = {
  breakfast: "Breakfast", lunch: "Lunch", mid: "Afternoon", night: "Dinner",
};

/* What one person's alert says. Kept next to the function that produces its
 * input so the two cannot disagree about the shape, and exported so it can be
 * read back in a test rather than proof-read inside a push payload.
 *
 * ⚠️ IT NEVER GUESSES A STATION. A row with no role produces "You are on the
 * board" and nothing more, because a phone alert naming the WRONG station is
 * worse than the question it was written to answer.
 * ⚠️ NO NAME IN THE TEXT. It arrives on that person's own phone, so "Samuel,
 * you are on..." is a word they scroll past, and it is the one word that would
 * be humiliating to get wrong on a shared iPad's lock screen.
 */
export function shiftWhereText(person, daypart) {
  /* Falls back to a bare "Today", not to "Today today". The caller already
     validates the daypart against the four keys, so this can only fire if
     somebody adds a fifth — and a plain title is a better thing to ship on a
     lock screen than a stutter. */
  const label = DAYPART_LABEL[daypart] || "";
  const list = (person && Array.isArray(person.stations) ? person.stations : []).filter(Boolean);
  const where = list.length === 0 ? ""
    : list.length === 1 ? list[0]
    : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  const start = person && person.start ? ` Starts ${person.start}.` : "";
  return {
    title: label ? `${label} today` : "Today",
    body: where ? `You are on ${where}.${start}` : `You are on the board.${start}`,
  };
}

/* One house, one day → { breakfast:{dt,fc}, lunch:{...}, mid, night }.
 * Missing board, missing day, unstaffed cell: every one of them yields "",
 * never a marker and never a guess. */
export function houseLeads(day) {
  const out = {};
  DAYPARTS.forEach((p) => { out[p] = { dt: "", fc: "" }; });
  const rows = stationsOf(day);
  rows.forEach((st) => {
    const role = String((st && st.role) || "");
    const slot = DT_ROW.test(role) ? "dt" : FC_ROW.test(role) ? "fc" : null;
    if (!slot) return;
    DAYPARTS.forEach((p) => {
      const n = cellName(st[p]);
      if (n && !out[p][slot]) out[p][slot] = n;   // first row wins; never overwrite a name with a blank
    });
  });
  return out;
}

/* ── The day's answer ────────────────────────────────────────────────────
 * OPENER = the breakfast leads. CLOSER = the night leads. That is Matt's
 * "open and closing leaders" mapped onto rows that already exist, not a new
 * concept the store has to learn.
 */
/* ── WHICH DAYPART IS IT RIGHT NOW ───────────────────────────────────────
 * Matt, Aug 13 2026, part 3 of messaging: an escalation "routes automatically
 * to whoever the board says owns that shift right now. The team member does
 * not choose a recipient and does not need to know who is on."
 *
 * ⚠️⚠️ NOTHING IN THIS REPO KNEW WHAT TIME A DAYPART STARTS. The four-a-day
 * jobs are TOLD which daypart they are, by `&dp=` on the cron URL — the clock
 * never came into it. So "right now" had no answer and this is it.
 *
 * ★ THE BOUNDARIES ARE THE STORE'S OWN CRON TIMES, NOT NUMBERS I CHOSE.
 * `labor-daypart` fires "just before the daypart starts" at 5:40am, 10:10am,
 * 1:40pm and 4:40pm (CRON-JOBS.md). Those four times ARE the store saying when
 * its dayparts begin, so reading them off the schedule beats inventing hours
 * that would disagree with the alerts people already get.
 *
 * ⚠️ BEFORE THE FIRST BOUNDARY IS BREAKFAST, not "nothing". Somebody running
 * late at 5:00am is the most important escalation of the day, and answering
 * "no daypart" would route it nowhere.
 *
 * ⚠️ OVERRIDABLE, BECAUSE ANOTHER STORE OPENS AT A DIFFERENT TIME. Design rule
 * 18: this is a fact about THIS store's day. The parameter is the seam a Store
 * Settings field plugs into without touching a single caller. Until a second
 * store needs different hours, the default is the honest one — it is what Gate
 * City's own schedule already says.
 */
export const DAYPART_STARTS = { breakfast: 340, lunch: 610, mid: 820, night: 1000 };

export function daypartAt(date = new Date(), starts = DAYPART_STARTS) {
  const d = new Date(date);
  if (isNaN(d)) return "breakfast";
  const mins = d.getHours() * 60 + d.getMinutes();
  const s = starts && typeof starts === "object" ? starts : DAYPART_STARTS;
  /* Walked latest-first so the last boundary crossed wins, and breakfast is the
     floor rather than a fifth case. */
  if (mins >= (s.night ?? DAYPART_STARTS.night)) return "night";
  if (mins >= (s.mid ?? DAYPART_STARTS.mid)) return "mid";
  if (mins >= (s.lunch ?? DAYPART_STARTS.lunch)) return "lunch";
  return "breakfast";
}

/* ── WHO IS RUNNING THE SHIFT RIGHT NOW ──────────────────────────────────
 * The leaders on the DT and FC rows of both houses for the current daypart.
 * That is the same set `boardShift` already calls opener/closer, asked for the
 * daypart happening now instead of the ends of the day.
 *
 * ⚠️ RETURNS NAMES, POSSIBLY NONE, AND NEVER GUESSES. An empty list is a real
 * answer — no board imported yet, a closed Sunday, a daypart with no leader
 * row filled in. The caller decides what to do with nobody; inventing a
 * fallback person here is how an escalation reaches somebody who is not there.
 */
export function leadersOnDutyAt(boards, date = new Date(), starts = DAYPART_STARTS) {
  const daypart = daypartAt(date, starts);
  const dayName = dayNameOf(date);
  const foh = houseLeads(((boards && boards.foh) || {})[dayName]);
  const boh = houseLeads(((boards && boards.boh) || {})[dayName]);
  const seen = new Set(); const names = [];
  [foh[daypart], boh[daypart]].filter(Boolean).forEach((slot) => {
    [slot.dt, slot.fc].filter(Boolean).forEach((n) => {
      const k = normName(n);
      if (k && !seen.has(k)) { seen.add(k); names.push(n); }
    });
  });
  return { daypart, dayName, names };
}

export function boardShift(boards, date = new Date()) {
  const dayName = dayNameOf(date);
  const foh = houseLeads(((boards && boards.foh) || {})[dayName]);
  const boh = houseLeads(((boards && boards.boh) || {})[dayName]);
  const uniq = (list) => {
    const seen = new Set(); const out = [];
    list.filter(Boolean).forEach((n) => {
      const k = normName(n);
      if (k && !seen.has(k)) { seen.add(k); out.push(n); }
    });
    return out;
  };
  return {
    dayName,
    foh,
    boh,
    opener: uniq([foh.breakfast.dt, foh.breakfast.fc, boh.breakfast.dt, boh.breakfast.fc]),
    closer: uniq([foh.night.dt, foh.night.fc, boh.night.dt, boh.night.fc]),
    money:  uniq([foh.breakfast.fc, foh.night.fc]),   // LEADER FC's duty is literally "MONEY"
    fohAll: uniq(DAYPARTS.flatMap((p) => [foh[p].dt, foh[p].fc])),
    bohAll: uniq(DAYPARTS.flatMap((p) => [boh[p].dt, boh[p].fc])),
    all:    uniq(DAYPARTS.flatMap((p) => [foh[p].dt, foh[p].fc, boh[p].dt, boh[p].fc])),
  };
}

/* ── Which names own which input ─────────────────────────────────────────
 * Only inputs Matt actually named are routed. Anything absent from this map
 * returns null, which the register reads as "still unresolved" and leaves with
 * the overseer — the same conservative default as before.
 *
 * ⚠️ `foodsafety` and `trainer` are NOT here on purpose. Food safety already
 * has its own rota (a rotation, not a board lookup) and trainer tasks come off
 * trainerTaskRoster.js. Routing them here as well would give two systems an
 * opinion about the same person and they would drift.
 */
/* ── THE SELF-CHECK ──────────────────────────────────────────────────────
 * Every coupling in this file fails the SAME way: resolution quietly returns
 * nobody, the row falls back to the overseer, and nothing anywhere says why.
 * That is the failure mode the input register exists to kill, one layer down —
 * so the fix is not "remember to check this file", it is to make the code
 * detect its own drift and report it as a row.
 *
 * The rule that keeps it trustworthy: only report states that CANNOT happen on
 * a healthy day. No board at 6am, a BOH FC with no morning name, a closed
 * Sunday — all normal, none of them speak. A board that exists with stations in
 * it but NO row matching a leader station name cannot be anything but drift.
 */
export const HEALTH = {
  SHAPE:   "shape",     // a day object exists but no stations could be read
  LEADERS: "leaders",   // stations exist but none matched a leader row  ← the station-rename detector
  NAMES:   "names",     // leader rows exist but every cell resolved empty across the whole day
  BUCKETS: "buckets",   // the cleaning list is signing off a bucket this file doesn't know about
};

export function boardHealth(boards, date = new Date(), cleaningBuckets = null) {
  const dayName = dayNameOf(date);
  const issues = [];
  const seen = { foh: false, boh: false };

  ["foh", "boh"].forEach((house) => {
    const day = ((boards && boards[house]) || {})[dayName];
    if (!day || typeof day !== "object") return;          // no board yet ≠ drift
    seen[house] = true;
    const rows = stationsOf(day);
    if (!rows.length) {
      issues.push({ code: HEALTH.SHAPE, house,
        detail: `The ${house.toUpperCase()} board for ${dayName} has no readable stations — the board's shape has changed.` });
      return;
    }
    const leaderRows = rows.filter((st) => {
      const r = String((st && st.role) || "");
      return DT_ROW.test(r) || FC_ROW.test(r);
    });
    if (!leaderRows.length) {
      issues.push({ code: HEALTH.LEADERS, house,
        detail: `No leader station found on the ${house.toUpperCase()} board for ${dayName} — a leader row has been renamed in stationTemplates.js.` });
      return;
    }
    const anyName = leaderRows.some((st) => DAYPARTS.some((p) => cellName(st[p])));
    if (!anyName) {
      issues.push({ code: HEALTH.NAMES, house,
        detail: `The ${house.toUpperCase()} leader rows for ${dayName} are filled but no name could be read from them — a new cell marker is being used.` });
    }
  });

  /* Cleaning buckets: the tile writes its sign-offs under `${shift}#b${i}`, so
     the shift prefixes it actually used are ground truth. A prefix this file
     has never heard of means CLEAN_BUCKETS has fallen behind FOH_DATA. */
  if (Array.isArray(cleaningBuckets) && cleaningBuckets.length) {
    const known = CLEAN_BUCKETS[dayName] || [];
    const extra = cleaningBuckets.filter((b) => b && !known.includes(b));
    if (extra.length) {
      issues.push({ code: HEALTH.BUCKETS,
        detail: `The cleaning list is signing off ${extra.join(", ")} on ${dayName}, which this router doesn't route — CLEAN_BUCKETS is behind DailyCleaning.jsx.` });
    }
  }

  return { ok: issues.length === 0, checked: seen.foh || seen.boh, dayName, issues };
}


/* ── Cleaning is bucketed BY DAYPART, so its owner is too ────────────────
 * DailyCleaning.jsx splits each FOH day into AM / MID / PM (the shift is
 * literally in the task key: `${shift}#b${i}`), and the buckets a day HAS vary —
 * Friday is PM only, Wednesday has no AM, Saturday has no MID. BOH is a flat
 * list with no shifts at all.
 *
 * So "the cleaning owner" is not one person and not every leader: it is the
 * leads of the dayparts that day actually cleans. Friday resolves to the night
 * leads alone; Saturday to breakfast + night.
 *
 * ⚠️ MUST STAY IN STEP WITH FOH_DATA IN DailyCleaning.jsx. Only which
 * buckets EXIST is mirrored here, never the task text — if a day gains or loses
 * an AM/MID/PM bucket there, add or remove it here or that shift's leads stop
 * being told. Same class of coupling as weekKeyOf ↔ getWeekKey, and the same
 * rule: one changes, the other changes with it.
 */
const CLEAN_BUCKETS = {
  Monday:    ["AM", "MID", "PM"],
  Tuesday:   ["AM", "MID", "PM"],
  Wednesday: ["MID", "PM"],
  Thursday:  ["AM", "MID", "PM"],
  Friday:    ["PM"],
  Saturday:  ["AM", "PM"],
};
/* AM/MID/PM (three cleaning buckets) onto the board's four dayparts. MID spans
 * both middle dayparts because the board splits the afternoon and the cleaning
 * list does not. */
const BUCKET_DAYPARTS = { AM: ["breakfast"], MID: ["lunch", "mid"], PM: ["night"] };

function cleaningOwners(s) {
  const buckets = CLEAN_BUCKETS[s.dayName] || [];
  const parts = [...new Set(buckets.flatMap((b) => BUCKET_DAYPARTS[b] || []))];
  const names = [];
  parts.forEach((p) => {
    [s.foh[p].dt, s.foh[p].fc, s.boh[p].dt, s.boh[p].fc].forEach((n) => { if (n) names.push(n); });
  });
  const seen = new Set();
  return names.filter((n) => { const k = normName(n); if (seen.has(k)) return false; seen.add(k); return true; });
}

export const SHIFT_INPUTS = {
  /* Matt: "Audit is by open and closing leaders." The FOH LEADER FC row's duty
     on the board is literally MONEY, so the money leads ARE the open/close pair
     for cash. If that row is unstaffed we widen to the general open/close leads
     rather than routing to nobody. */
  /* ★ `pool` IS "WHO COULD HAVE OWNED THIS ROW", NOT "WHO DID". It is the set a
     bare first name has to be unique within, and it is deliberately the WIDER
     set — every slot `pick` is allowed to read. If this row could belong to
     either side's leader, then a cell reading "Lizbeth" on a day both Lizbeths
     are on the board really is ambiguous FOR THIS ROW, even though each of them
     is unambiguous on their own side. Defaults to the whole day's board. */
  cashcounts: { pick: (s) => (s.money.length ? s.money : s.opener.concat(s.closer)),
                pool: (s) => s.money.concat(s.opener, s.closer),
                label: "Opening + closing leader" },

  /* The leads of the dayparts this day actually cleans — see above. */
  cleaning:   { pick: cleaningOwners, label: "Leaders on the cleaning dayparts" },

  /* Ops checklists are shift-TAGGED (Opener / Midday / Closing), so here the
     whole day's leadership genuinely is the audience. Wired ahead of the row —
     OpsChecklists has no register entry yet, so nothing reads this today. */
  checklists: { pick: (s) => s.all, label: "Leaders on the board today" },
};

export function ownersForInput(inputId, shift) {
  const rule = SHIFT_INPUTS[inputId];
  if (!rule || !shift) return null;
  const names = rule.pick(shift) || [];
  if (!names.length) return null;
  /* ★ THE ANSWER CARRIES ITS OWN AMBIGUITY SET, so nothing downstream has to be
     told about rosters. isOwner reads it off this object and no call signature
     between here and the push job changes.
     ⚠️ COUNTED ON THE DAY'S BOARD, NOT ON THE ROSTER. That distinction is the
     whole fix: FOHAutoAssign only appends a last initial when a first name
     repeats among the people scheduled THAT DAY, so a bare "Ashley" on a day
     only one Ashley works is a deliberate, correct, unambiguous cell. Counting
     across all ~106 people would refuse it and the Ashley who is actually on
     shift would stop being told her cash count is late — trading a wrong-phone
     bug for a silence bug, which is worse. DailySetup.jsx says the same thing
     in its own words: "Ambiguity is PER SIDE, which is what makes most of it
     disappear."
     ⚠️ A Set, and these rows are built per run and never serialised — checked,
     nothing JSON-stringifies a row. */
  const pool = (rule.pool ? rule.pool(shift) : shift.all) || [];
  return { names, label: rule.label, sharedFirst: sharedFirstNames(pool) };
}

/* Which first names does more than one person on the roster answer to?
 *
 * ⚠️ ONLY THE ROSTER CAN ANSWER THIS, which is the whole reason isOwner needs
 * it handed in. Nothing on the board knows how many Ashleys work here, and
 * nothing in Slack does either — Slack holding one Ashley just means the other
 * never joined. Same rule DailySetup and TeamDirectory already apply to photos.
 *
 * Takes plain names or roster objects. Returns a Set of normalised first names.
 * Compute it ONCE per job or per render and pass the Set down; it is not free
 * and isOwner is called per person per row.
 */
/* ⚠️⚠️ THERE IS A SECOND, STRICTER RULE OF THIS NAME IN `boardSwap.js`, AND
   THAT IS DELIBERATE. Do not merge them. They answer different questions with
   OPPOSITE safe directions:
     · this one decides who gets a NOTIFICATION, where the failure is SILENCE,
       so it is permissive and absorbs a bare form into an initialled one;
     · boardSwap's decides whether to REWRITE A NAME IN A BOX ON A PRINTED
       BOARD, where the failure is the WRONG NAME, so it refuses the same case.
   The two inputs are indistinguishable from the strings alone. This roster
   carries BOTH shapes at once: a first name that also appears with an initial
   and is ONE person, and a first name that also appears with a full surname and
   is TWO people. Nothing reading only those strings can separate them, so no
   single rule can serve both callers.
   ⇒ `sharedFirstNames.test.mjs` runs BOTH and guards the RELATIONSHIP: the
   board rewriter must never be more permissive than this one. A sweep reported
   the pair as drift and recommended merging; that file records why not. */
export function sharedFirstNames(roster) {
  /* ⚠️ COUNTS PEOPLE, NOT ENTRIES, AND THAT IS NOT THE SAME THING. One leader
     fills several slots — the money pool alone is money + opener + closer, and
     the FC on breakfast is usually in two of them. Counting raw entries made a
     single Ashley look like two Ashleys and refused her own cell, which is the
     silence bug this whole fix exists to avoid. Found by writing the test.
     ⚠️ AND "Ashley" AND "Ashley R" ARE ONE PERSON WRITTEN TWO WAYS, not two
     people. A bare form is only a SEPARATE person when there is no initialled
     form to absorb it, so the count is: how many distinct last initials appear,
     or one if only bare forms do.
       ["Ashley"]                        -> 1   her own cell still matches
       ["Ashley", "Ashley"]              -> 1   same person, two slots
       ["Ashley", "Ashley R"]            -> 1   same person, two spellings
       ["Ashley R", "Ashley V"]          -> 2   genuinely two people
       ["Ashley", "Ashley R", "Ashley V"]-> 2   the bare one is one of them */
  const initials = new Map();   // first -> Set of last initials
  const bare = new Set();       // firsts seen with no initial at all
  (roster || []).forEach((r) => {
    const nm = typeof r === "string" ? r : ((r && r.name) || "");
    const p = nameParts(nm);
    const k = normName(p[0] || "");
    if (!k) return;
    const i = p[1] ? normName(String(p[1]).charAt(0)) : "";
    if (i) {
      if (!initials.has(k)) initials.set(k, new Set());
      initials.get(k).add(i);
    } else bare.add(k);
  });
  const out = new Set();
  new Set([...initials.keys(), ...bare]).forEach((k) => {
    const distinct = Math.max((initials.get(k) || new Set()).size, bare.has(k) ? 1 : 0);
    if (distinct > 1) out.add(k);
  });
  return out;
}

/* Is this person one of the resolved owners?
 *
 * ⚠️ AMBIGUITY RESOLVES TO NO, NEVER TO A GUESS — but only when this function
 * is TOLD who shares a first name. `sharedFirst` is the Set from
 * sharedFirstNames above, and it is optional.
 *
 * 🐛 THE PARAGRAPH THAT USED TO SIT HERE CLAIMED THIS ALREADY HAPPENED. It said
 * a bare first name "matches only a person whose own record is first-name-only
 * or whose first name is unique to them". The second half was never true and
 * could not be: this module has no roster, so the last line of the loop was a
 * flat `return true` and a board cell reading "Ashley" matched BOTH Ashleys.
 * Seven first names on this roster are shared — camila by three, adriana,
 * ashley, benjamin, jose, lizbeth and monica by two — and bare cells are
 * NORMAL, not sloppy: FOHAutoAssign only appends a last initial when the first
 * name repeats among the people scheduled THAT day, so when one Ashley works
 * and the other does not, the cell is written bare. An assertion of safety that
 * nobody re-checked is how this survived; it is now stated as a parameter.
 *
 * ⚠️ WITHOUT `sharedFirst` THIS BEHAVES EXACTLY AS IT ALWAYS HAS, on purpose.
 * Every caller keeps today's answers until it is wired deliberately, and a
 * caller that cannot read the roster keeps matching loosely rather than
 * refusing. Over-routing buzzes an extra phone; under-routing means the person
 * who IS on shift never hears that their cash count is late. Of the two, the
 * silent one is worse, and that is why this finding is a medium and not a high.
 *
 * A first + last-initial cell ("Camila G", "Ashley R") matches only the person
 * with that initial, unchanged.
 */
export function isOwner(personName, owners, sharedFirst) {
  if (!personName || !owners || !owners.names) return false;
  const p = nameParts(personName);
  if (!p.length) return false;
  const pf = normName(p[0]);
  const pi = p[1] ? normName(p[1].charAt(0)) : null;
  return owners.names.some((n) => {
    const b = nameParts(n);
    if (!b.length) return false;
    if (normName(b[0]) !== pf) return false;
    const bi = b[1] ? normName(b[1].charAt(0)) : null;
    if (bi && pi) return bi === pi;   // both carry an initial — it must match
    /* One side is first-name-only. That is a real answer when exactly one
       person answers to the name, and a guess when two do. */
    if (sharedFirst && sharedFirst.has(pf)) return false;
    return true;
  });
}
