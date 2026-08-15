/* ============================================================================
   FOHAutoAssign.js — Gate City Hub · Daily Setups "Auto Assignment" engine

   THE SCHEDULE IS THE SOURCE OF TRUTH, but coverage is TIME-AWARE.
   HotSchedules assigns a JOB PER TIME BLOCK. Each board period (breakfast /
   lunch / mid / night) is a wide window, but every STATION has its own posted
   open/close hours inside that window (Window opens 6, Drinks 8:30, Register 2
   9…). This engine matches those real station hours against each person's real
   clock-in/out instead of the old all-or-nothing "overlaps the period?" test.

   THREE NEW RULES (July 2026):
   1. OPENER — a station's opening slot goes to someone actually on the clock
      by its open time. Earliest-opening stations are filled FIRST, from the
      earliest clock-ins, so the scarce 6AM bodies land on the 6AM stations
      (Window / Register 1 / OT) instead of on Drinks (8:30) or Register 2 (9).
   2. HANDOFF CHAINING — when no single person covers a station's whole window,
      people whose shifts abut/overlap are CHAINED to tile it. A position run
      2–10 with A 2–6 and B 6–10 renders the night cell "A →B 6": A opens, B
      takes over at 6. This is BOH's @time machinery pointed the other way
      (BOH = one person / two stations; here = two people / one station).
   3. GAP FLAG — a cell is only a gap where the chain leaves a real hole. Gaps
      come back in the result's `gaps` array (station, period, opensAt, from).

   Order of operations, per period:
   0. Rhonda lock → Register only.
   1. LEADER DT / LEADER FC rows (leaders swap posts each daypart; highest
      skill starts on DT; job code "Leadership" maps to no station).
   2. SCHEDULED JOB — greedy time-cover of each station from the blocks whose
      job matches it, chaining handoffs. Earliest-opening station first.
   3. Trainer spread across OT captain → drinks → window → bagging.
   4. Denise → Cleanliness / Hospitality only.
   5. GENERAL FILL — greedy time-cover of anything still open, by job-skill
      match then anyone available, chaining handoffs. Earliest-opening first.
   6. AD SENIORITY DISPLAY — informational only, never consumes anyone.

   Locks: Rhonda → Register. Denise W / Denise S → dining. Marchelle →
   Register or dining. Bronson → Cleanliness only. Locked people never
   placed outside their lock.

   ROTATION (July 2026): the "don't put someone back on a station they already
   worked today" tiebreak runs on LUNCH + MID only. Breakfast openers and night
   closers are left un-rotated so they hold their spot; the middle of the day is
   where people shuffle. Rotation never costs coverage (it's a tiebreak below
   coverage + skill), and a real clock-out still renders a labeled handoff
   ("A →B 6") — only manufactured shuffles are suppressed at open/close.

   Pure functions — no storage, no UI. DailySetup.jsx imports:
     autoAssignFOH(dayData, people)  → { data, placed, unplaced, gaps }
     autoAssignBreaks(people, minors) → { [name]: ["12:30 PM", ...] }
   `people` rows come from parseImportText:
     { name, ranges, hours, job, skill, section, blocks:[{start,end,job,skill,section}] }
   ============================================================================ */

/* ⚠️ THIS ENGINE NOW IMPORTS TWO LEAVES, AND ONLY TWO. storeConfig.js imports
   nothing; nameMatch.js imports nothing. Both are already loaded by the Worker
   and by the browser, which is the pair this file has to keep working in.
   The engines must stay runnable outside React — nothing else may be added. */
import { boardIds, isGateCity, boardNamePatterns } from "./storeConfig.js";
import { bareId } from "./nameMatch.js";

/* ★ HOURS PARSING COMES FROM THE LEAF, not a private copy. This file had its
   own 16-line parseRanges that could not read the two-clock form; the board's
   two-pass version can. Verified before the swap: this engine only ever parses
   STATION POSTED HOURS ("PREP (5AM-2PM)"), and those parse identically under
   both versions, so this change moves no number. See shiftHours.js. */
import { parseClock, parseRanges } from "./shiftHours.js";

// Matt, July 17: "Maybe even make the 2-5 pass last." Breakfast openers, lunch
// 11:15-first, night closers all settle before mid gets its pick — mid people
// (many spanning into early night, e.g. Maria/Thanh 2-6, Julie/Lizbeth 2-5+5-cl)
// no longer compete with night for those bodies.
const SHIFT_KEYS = ["breakfast", "lunch", "night", "mid"];

/* ---- duplicated tiny helpers (kept local so this module stands alone) ---- */
const rangesHours = (ranges) => (ranges || []).reduce((t, r) => t + Math.max(0, r.end - r.start), 0);
export function fmtClock(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  const disp = ((hh + 11) % 12) + 1;
  return mm ? `${disp}:${String(mm).padStart(2, "0")}` : `${disp}`;
}
// Break times spell out AM/PM so they're never ambiguous on the board.
function fmtBreakTime(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  const disp = ((hh + 11) % 12) + 1;
  const mer = hh < 12 ? "AM" : "PM";
  return mm ? `${disp}:${String(mm).padStart(2, "0")} ${mer}` : `${disp} ${mer}`;
}
function periodsCovered(ranges) {
  const set = new Set();
  (ranges || []).forEach(({ start, end }) => {
    if (start < 11) set.add("breakfast");
    if (start < 14 && end > 11) set.add("lunch");
    if (start < 17 && end > 14) set.add("mid");
    if (end > 17) set.add("night");
  });
  return set;
}
function splitRoleHours(role) {
  const m = (role || "").match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), hours: m[2].trim() };
  return { name: (role || "").trim(), hours: null };
}
function requiredBreaks(hours, isMinor) {
  if (hours >= 12) return 2;
  if (hours >= 6) return 1;
  if (isMinor && hours >= 5) return 1;
  return 0;
}

/* ---- classification ---- */
const isTrainerJob = (job) => /train/i.test(job || "");
const isLeaderJob = (job) => /lead|director|manager|supervis|captain/i.test(job || "");
/* ═══ PER-PERSON RULES: ID FIRST, NAME SECOND ══════════════════════════════
   ⚠️⚠️ THESE USED TO BE FIRST-NAME MATCHES AND NOTHING ELSE, AND THAT WAS THE
   LAST PLACE A SECOND STORE'S BOARD WAS ACTIVELY WRONG rather than merely
   showing our people. A clone hiring anybody called Julie, Denise, Rhonda,
   Marchelle or Bronson had Gate City's station lock applied to their person,
   on a live shift, with nothing on any screen to say why.

   ★ THE SHAPE IS THE SAME ONE THAT WORKED FOR THE ADMIN GATES: id, then name.
     · id   — `boardIds()` off owners.board, which a clone can set and which
              starts empty for them.
     · name — the old regex, KEPT, but only for Gate City.
   So Gate City is untouched even for the two or three people whose HotSchedules
   name and HR name disagree and therefore resolve to no id. A clone matches on
   neither arm and gets the unrestricted engine, which is already how the other
   hundred people on any board are treated.

   ⚠️ `p` NOT `p.name`. Every one of these now takes the PERSON, because it
   needs the id that DailySetup attaches at import. Call sites changed with
   them; a stray `isJulie(p.name)` would pass a string, find no id, and quietly
   fall through to the name arm — right at Gate City, wrong everywhere else.
   ⚠️ READ AT CALL TIME. No module-level const may capture these: the store
   number arrives with saved settings, after this file is imported. */
const idIn = (which, p) => {
  const id = bareId((p && (p.id != null ? p.id : p.hrId)) || "");
  return !!id && boardIds(which).includes(id);
};
/* ★ THE NAME PATTERNS LIVE IN ownerSeed.js NOW, under owners.board.
   ⚠️ SAME BEHAVIOUR, BUILT INSTEAD OF TYPED: `new RegExp(src, "i")` reproduces
   each `/.../i` literal exactly. They were already behind `isGateCity()` and so
   could never fire at another store; they shipped anyway, which is what moving
   them fixes. A gate stops a thing being used, never being sent.
   ⚠️ READ AT CALL TIME, so a store's own list takes effect without a deploy and
   an empty list is simply no rule. */
const nameRes = (which) => boardNamePatterns(which).map((src) => new RegExp(src, "i"));
const nameIs = (which, p) => {
  const n = String((p && p.name) || "").trim();
  return nameRes(which).some((re) => re.test(n));
};

const isDenise = (p) => idIn("lockDining", p) || nameIs("lockDiningNames", p);
const isRhonda = (p) => idIn("lockRegister", p) || nameIs("lockRegisterNames", p);
const isMarchelle = (p) => idIn("lockRegDining", p) || nameIs("lockRegDiningNames", p);
const isJulie = (p) => idIn("lockRegDiningWindow", p) || nameIs("lockRegDiningWindowNames", p);
// Bronson → Cleanliness station only.
const isBronson = (p) => idIn("lockCleanliness", p) || nameIs("lockCleanlinessNames", p);

const SKILL_RANK = { advanced: 3, expert: 3, intermediate: 2, beginner: 1, novice: 1 };

/* ---- Director seniority (FOH) ----
   Matt, Jul 31 2026: "for the future i want daisy and brandon to auto fill
   like the AD's do. its not a position but just to show seniority." Same
   contract as the AD display: informational, never consumes a placement. */
/* Director seniority names now live in owners.board.fohDirectorNames. */
/* ⚠️ RANK COMES FROM THE ID LIST WHEN THERE IS ONE, and its ORDER is the rank.
   The name array below is the Gate City fallback and keeps its own order. A
   store with no list gets -1 for everybody, which is exactly what an unranked
   person already gets and what the sort below already handles. */
const rankIn = (which, p, res) => {
  const id = bareId((p && (p.id != null ? p.id : p.hrId)) || "");
  const byId = id ? boardIds(which).indexOf(id) : -1;
  if (byId >= 0) return byId;
  return isGateCity() ? res.findIndex((re) => re.test((p && p.name) || "")) : -1;
};
const dirRankOf = (p) => rankIn("fohDirectorOrder", p, nameRes("fohDirectorNames"));

/* ---- Assistant Director seniority (FOH) ----
   ⚠️ Daisy MOVED to DIRECTOR_FOH (Jul 31) — one person in both the Director
   row and the AD rows is the same seniority stated twice, and her name here
   would hide the actual senior AD on shift. Do not re-add her. */
/* AD seniority names now live in owners.board.fohAdNames. */
const adRankOf = (p) => rankIn("fohAdOrder", p, nameRes("fohAdNames"));

const isRegisterStation = (role) => /^REGISTER/i.test(role || "");
const isDiningStation = (role) => /^(HOSPITALITY|CLEANLINESS)/i.test(role || "");
const isCleanlinessStation = (role) => /^CLEANLINESS/i.test(role || "");
const isOutsideStation = (role) => /^(OT\b|EXPO)/i.test(role || "");
/* ⚠️ `DIRECTOR$` ADDED Jul 31 2026 — CAUGHT ON THE FIRST REAL IMPORT of the
   new Director row. The row shipped in the template without joining this
   list, so the ordinary fill treated it as a station: the "anyone available"
   fallback seated a Drive Thru Beginner in the Director cell at mid (and
   starved CLEANLINESS of that body), then the gap sweep reported the other
   three periods as uncovered — 3 of Saturday's "4 uncovered" were this row.
   BOH never had the bug because its Director row sits in a LEADERSHIP
   section, which its engine protects wholesale. Director is a display row
   exactly like ASSISTANT DIRECTOR: blank unless a leader writes it.
   Anchored `DIRECTOR$` so only the bare row matches; the AD alternative
   still handles its own rows. */
const isSpecialRow = (role) => /^(LEADER\s|TRAINING$|TRAINER$|DIRECTOR$|ASSISTANT DIRECTOR)/i.test(role || "");

function trainerNameOf(entry) {
  const tokens = (entry || "").trim().split(/\s+/);
  const out = [];
  for (const t of tokens) {
    if (/\d/.test(t)) break;
    out.push(t.replace(/[-:,]+$/, ""));
  }
  return out.join(" ").trim().toLowerCase();
}
function buildTrainerSet(trainersList) {
  const set = new Set();
  (trainersList || []).forEach((t) => {
    const n = trainerNameOf(t);
    if (!n) return;
    set.add(n);
    set.add(n.split(" ")[0]);
  });
  return set;
}

const DT_TRAINER_PRIORITY = [/^OT\b/i, /^DT\s+DRINKS/i, /^DT\s+WINDOW/i, /^DT.*BAG/i];

/* job code → station match. */
const SKILL_PAIRS = [
  [/drink/i, /drink|bever/i],
  [/window/i, /window|drive|\bdt\b/i],
  [/bag/i, /bag/i],
  [/register/i, /register|cashier|front counter|\bfc\b/i],
  [/expo/i, /expo|runner/i],
  [/dessert/i, /dessert|treat|shake/i],
  [/hospitality/i, /host|hospitality|dining/i],
  [/cleanliness/i, /clean|dining/i],
  [/^dt\b/i, /drive|\bdt\b/i],
];
function stationMatchesJob(role, job) {
  if (!job) return false;
  return SKILL_PAIRS.some(([rr, jr]) => rr.test(role) && jr.test(job));
}

/* Which clock hours each board period spans. */
const PERIOD_HOURS = {
  breakfast: { start: 5, end: 11 },
  lunch: { start: 11, end: 14 },
  mid: { start: 14, end: 17 },
  night: { start: 17, end: 24 },
};
/* ★ AN ODD START IS WRITTEN ON THE CELL (Matt, Aug 3 2026: "show the chain
   for all of the odd times that arent 11, 2 or 5").

   A handoff already renders its time — "Maria →Hanna 6" — because a second
   body forces one. A SINGLE body never did, so someone who walks in at 8:30
   onto a station that opened at 5 read as a bare name, identical to someone
   who had been standing there for three hours. On a board scanned at a glance
   that is not a small difference: it is the difference between a station
   covered and a station with a three-hour hole in front of it.

   The standard start is the PERIOD's own, which is exactly the set Matt named
   — lunch 11, mid 2, night 5, and breakfast's own 5am. Anything else is odd
   and gets the clock. Matching starts stay bare, so the board only gains ink
   where something is genuinely different.

   ⚠️ ENGINE OUTPUT, SO IT ONLY APPEARS ON RE-IMPORT. Cells are written at
   assignment time and stored on the day. An existing board does not change
   and must not be re-imported mid-shift to get this, because re-importing
   rebuilds the day and discards every manual edit a leader has made. */
function oddStart(k, start) {
  const std = PERIOD_HOURS[k] && PERIOD_HOURS[k].start;
  if (typeof std !== "number" || typeof start !== "number") return "";
  return Math.abs(start - std) < 0.001 ? "" : ` @${fmtClock(start)}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd - 0.001 && aEnd > bStart + 0.001;
}
function overlapAmount(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}
function clampIv(aStart, aEnd, bStart, bEnd) {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return e > s + 0.001 ? { start: s, end: e } : null;
}

/* ---- SCHEDULED BLOCKS ---- */
function blocksOf(p) {
  if (p && p.blocks && p.blocks.length) return p.blocks;
  return (p.ranges || []).map((r) => ({
    start: r.start, end: r.end, job: p.job, skill: p.skill, section: p.section,
  }));
}
function blockForPeriod(p, k) {
  const per = PERIOD_HOURS[k];
  let best = null;
  let bestOv = 0.001;
  blocksOf(p).forEach((b) => {
    const ov = overlapAmount(b.start, b.end, per.start, per.end);
    if (ov > bestOv) { bestOv = ov; best = b; }
  });
  return best;
}
function jobForPeriod(p, k) {
  const b = blockForPeriod(p, k);
  return (b && b.job) || p.job || "";
}
function skillForPeriod(p, k) {
  const b = blockForPeriod(p, k);
  return (b && b.skill) || p.skill || "";
}

/* Station posted-hours as parsed ranges (from the "(6AM-11PM)" role label). */
function stationHoursRanges(role) {
  const { hours } = splitRoleHours(role);
  if (!hours) return null; // no posted hours → open all day
  const r = parseRanges(hours);
  return r.length ? r : null;
}
/* The station's real staffed window inside period k: the posted hours clamped
   to the period. null → station not open this period. No posted hours → the
   whole period window. */
function stationWindow(station, k) {
  const per = PERIOD_HOURS[k];
  const hrs = stationHoursRanges(station.role);
  if (!hrs) return { start: per.start, end: per.end };
  const over = hrs.filter((b) => overlaps(b.start, b.end, per.start, per.end));
  if (!over.length) return null;
  return {
    start: Math.max(per.start, Math.min(...over.map((b) => b.start))),
    end: Math.min(per.end, Math.max(...over.map((b) => b.end))),
  };
}
function stationOpenAt(station, k) {
  return stationWindow(station, k) != null;
}

/* Person's presence inside period k as a single bounding interval. */
function presenceInPeriod(p, k) {
  const per = PERIOD_HOURS[k];
  const over = (p.ranges || []).filter((r) => overlaps(r.start, r.end, per.start, per.end));
  if (!over.length) return null;
  return {
    start: Math.max(per.start, Math.min(...over.map((r) => r.start))),
    end: Math.min(per.end, Math.max(...over.map((r) => r.end))),
  };
}
function personCoversStation(p, station, k) {
  if (!periodsCovered(p.ranges).has(k)) return false;
  const W = stationWindow(station, k);
  const pres = presenceInPeriod(p, k);
  if (!W || !pres) return false;
  return overlaps(pres.start, pres.end, W.start, W.end);
}

/* Kitchen job codes never land on an FOH station.
   ★ EXPORTED Aug 13 2026 for scheduleEngine.js, which has to know which SIDE a
   person's certifications put them on before it can decide their hours.
   ⚠️ AN EXPORT ONLY, AND THAT IS PROVEN RATHER THAN ASSERTED. Strip the
   comments from this file before and after, collapse whitespace, and the ONLY
   difference across all ~25,000 characters is the word `export` in front of
   this const. Not the regex, not a caller, not a line of placement logic. A
   token diff is worth more here than running a board and eyeballing it, because
   it covers every input rather than the one that got tried.
   ⚠️ The alternative was a second copy of this list in the new engine, which is
   exactly the drift rule 8 exists to stop: the two would disagree about who is
   kitchen staff, and only for people hired into whichever job code got added to
   one list and not the other. */
export const isBohJob = (job) =>
  /bread|load|filter|thaw|fry|fries|hash|machine|\bprep\b|truck|receiv|dish|sanit|biscuit|egg|nugget|strip|soup|\bmac\b|board|sandwich|kitchen|\bboh\b|grill|point|special|primary|secondary/i.test(job || "");

/* ============ MAIN: FOH auto-assignment ============ */
export function autoAssignFOH(dayData, people) {
  const next = JSON.parse(JSON.stringify(dayData));
  const stations = next.stations || [];
  const trainerSet = buildTrainerSet(next.trainers);
  const isTrainerSkill = (p) =>
    /train/i.test(p.skill || "") ||
    (p.blocks || []).some((b) => /train/i.test(b.skill || ""));
  const isTrainer = (p) =>
    trainerSet.has(p.name.toLowerCase()) ||
    trainerSet.has(p.name.split(" ")[0].toLowerCase()) ||
    isTrainerJob(p.job) ||
    isTrainerSkill(p);

  const firstCounts = {};
  people.forEach((p) => {
    const f = p.name.split(" ")[0].toLowerCase();
    firstCounts[f] = (firstCounts[f] || 0) + 1;
  });
  const lbl = (p) => {
    const parts = p.name.split(" ");
    return firstCounts[parts[0].toLowerCase()] > 1 && parts[1] ? `${parts[0]} ${parts[1][0]}` : parts[0];
  };

  const openCell = (st, k) => !(st[k] || "").trim();

  /* ---- INTERVAL BUSY MODEL ----
     placedIntervals[nameLower] = [{start,end}] in absolute clock hours.
     A person is free for [s,e] when no placed interval overlaps it. This
     replaces the old one-station-per-period lock: whole-period placements
     claim their presence-in-period interval (so they still can't double up
     within a period), while handoff chains claim only their sub-slice — so a
     6-9 person and a 9-11 person can share one cell. */
  const placedIntervals = {};
  const nk = (p) => p.name.toLowerCase();
  const intervalsOf = (p) => placedIntervals[nk(p)] || [];
  const isFree = (p, s, e) => !intervalsOf(p).some((iv) => overlaps(iv.start, iv.end, s, e));
  const claim = (p, s, e) => { (placedIntervals[nk(p)] = placedIntervals[nk(p)] || []).push({ start: s, end: e }); };
  const isBusyPeriod = (p, k) => {
    const pres = presenceInPeriod(p, k);
    return pres ? !isFree(p, pres.start, pres.end) : false;
  };

  const skillAt = (p, k) => SKILL_RANK[skillForPeriod(p, k).toLowerCase()] || 0;

  const outsideToday = new Set();
  const wasOutside = (p) => outsideToday.has(nk(p));

  const stationsWorked = {};
  const baseName = (role) => splitRoleHours(role).name.toLowerCase();
  const hasWorkedStation = (p, st) =>
    (stationsWorked[nk(p)] || new Set()).has(baseName(st.role));

  const markWorked = (p, st) => {
    (stationsWorked[nk(p)] = stationsWorked[nk(p)] || new Set()).add(baseName(st.role));
    if (isOutsideStation(st.role)) outsideToday.add(nk(p));
  };

  /* Rule 4 — nobody in two positions in the same daypart. periodStation keyed
     `${nameLower}|${period}` = the base station name they hold that daypart;
     fill candidate builds skip a person already on a DIFFERENT station this
     period (even at a disjoint time), so one person = one cell per column. */
  const periodStation = {};
  const psKey = (p, k) => nk(p) + "|" + k;
  const markPeriodStation = (p, st, k) => { periodStation[psKey(p, k)] = baseName(st.role); };
  const heldElsewhere = (p, st, k) => {
    const held = periodStation[psKey(p, k)];
    return held != null && held !== baseName(st.role);
  };

  /* Whole-period placement (Passes 0/1/3/4): claims the person's presence in
     the period so they can't double up that daypart. */
  const place = (st, k, p) => {
    /* Presence is resolved FIRST so the cell can carry an odd start. It was
       computed one line below purely for the claim; the reorder changes
       nothing else, and every use of `pres` still follows it. */
    const pres = presenceInPeriod(p, k) || PERIOD_HOURS[k];
    st[k] = lbl(p) + oddStart(k, pres.start);
    claim(p, pres.start, pres.end);
    markWorked(p, st);
    markPeriodStation(p, st, k);
    const W = stationWindow(st, k);
    if (W) { const iv = clampIv(pres.start, pres.end, W.start, W.end); if (iv) recordCov(st, k, iv.start, iv.end); }
  };

  const isMidday = (k) => k === "lunch" || k === "mid";

  const rows = (re) => stations.filter((s) => re.test(s.role));
  const leaderDT = rows(/^LEADER\s+DT/i);
  const leaderFC = rows(/^LEADER\s+FC/i);
  const diningRows = rows(/^(HOSPITALITY|CLEANLINESS)/i);
  const registerRows = rows(/^REGISTER/i);
  const fillRows = stations.filter((s) => !isSpecialRow(s.role));
  // July 26 2026 — leader rows now get swept for gaps too. They are placed by
  // Pass 1, never by the fill passes, so they stay OUT of fillRows; but an
  // uncovered stretch on LEADER DT/FC is a real hole and used to be invisible.
  const sweepRows = () => [...fillRows, ...leaderDT, ...leaderFC];
  const otRows = rows(/^OT\b/i);

  const placedSet = new Set();
  const track = (p) => placedSet.add(p.name);
  const gaps = [];

  /* coverage[stationIndex|period] = [{start,end}] actually staffed — filled
     by BOTH place() (whole-period) and commitCover (handoff slices), then
     swept once at the end to flag only real holes. */
  const coverage = {};
  const covKey = (st, k) => stations.indexOf(st) + "|" + k;
  const recordCov = (st, k, s, e) => {
    const key = covKey(st, k);
    (coverage[key] = coverage[key] || []).push({ start: s, end: e });
  };
  const subtractCovered = (W, segs) => {
    const cov = (segs || [])
      .map((s) => ({ start: Math.max(s.start, W.start), end: Math.min(s.end, W.end) }))
      .filter((s) => s.end > s.start + 0.001)
      .sort((a, b) => a.start - b.start);
    const holes = [];
    let cur = W.start;
    cov.forEach((s) => {
      if (s.start > cur + 0.001) holes.push({ from: cur, to: s.start });
      cur = Math.max(cur, s.end);
    });
    if (cur < W.end - 0.001) holes.push({ from: cur, to: W.end });
    return holes;
  };

  const lockAllows = (p, st) => {
    const dining = isDiningStation(st.role);
    const reg = isRegisterStation(st.role);
    if (isDenise(p)) return dining;
    if (isRhonda(p)) return reg;
    if (isMarchelle(p)) return reg || dining;
    // Julie: Register or Dining — PLUS Window (Matt, July 16: "Let her do
    // window 5-11"). This RELAXES the July-14 lock, which came from Daisy's QA
    // ("Julie still landing on WINDOW — she should be REGISTER or DINING ROOM
    // only"). Matt overrode it deliberately: Julie is one of only two 5-11
    // bodies on Friday night and the other (Camila) can't cover three
    // 11-closing stations alone, so locking Julie off Window left Desserts
    // unfillable. She is still barred from everything else.
    if (isJulie(p)) return reg || dining || /^WINDOW/i.test(st.role || "");
    if (isBronson(p)) return isCleanlinessStation(st.role);
    return true;
  };

  const clockIn = (p) => (p.ranges && p.ranges.length ? Math.min(...p.ranges.map((r) => r.start)) : 99);

  /* ---- GREEDY HANDOFF COVER ----
     Tile a station's window W with a chain of candidate intervals, each
     {p, start, end}. Walk a cursor from W.start: among people on the clock at
     the cursor (start ≤ cursor) and globally free for the slice, take the one
     reaching FURTHEST (max end) — fewest handoffs, longest opener. Record each
     slice; the first is the primary (plain name), the rest render "→Name T"
     where T is when they take over. Anything past the last cursor is a gap.
     Returns the chosen slices + gapFrom (null if fully covered). Selection is
     tie-broken by higher period-skill, then earlier clock-in. */
  const greedyCover = (st, k, cands, W, rotate) => {
    const chosen = [];
    const holes = [];
    const used = new Set();
    let cursor = W.start;
    while (cursor < W.end - 0.001) {
      const here = cands.filter(
        (c) =>
          !used.has(nk(c.p)) &&
          c.start <= cursor + 0.001 &&
          c.end > cursor + 0.001 &&
          isFree(c.p, cursor, Math.min(c.end, W.end))
      );
      if (here.length) {
        // Coverage first (reach furthest = fewest handoffs). Job-skill match
        // wins next — trainer/OT reservation already ran in Pass 2, and skill
        // is a placement rule, so both outrank rotation. Rotation only breaks
        // ties among EQUAL coverage AND skill: prefer someone who hasn't already
        // worked this station today so the same person isn't back-to-back on one
        // spot (the team's complaint). It can never override coverage or skill.
        // Callers enable rotation for LUNCH + MID only — breakfast openers and
        // night closers run with rotate=false so they hold their spot, while
        // the middle of the day is where people shuffle.
        // #4 — EARLIEST-TO-EARLIEST via JUST-IN-TIME. A station that opens
        // AFTER its period begins (e.g. DT Mobiles 8:30 inside a 5–11
        // breakfast) should take the LATEST-arriving body that still covers
        // it, so the scarce early clock-ins stay free for the stations that
        // open at the period start (Window / Register 1 / OT at 6AM).
        // Applies before skill for late-opening stations only; true openers
        // keep skill-first. Never costs coverage (max-end still wins first),
        // and when clock-ins tie it falls through to skill as before.
        const perStart = PERIOD_HOURS[k].start;
        const lateOpen = W.start > perStart + 0.001;
        /* ★★ IN-TIMES FIRST (Matt, Aug 4 2026: "Priority is in times and closing
           times etc.. leaders then fill the other spots by job skill", and
           "the 11:15 people should be placed in the 11:15 spots").
           Someone whose shift STARTS at this cursor is the right body for this
           slot — they are not needed anywhere earlier, and using them keeps the
           people who clocked in before them free for the stations that opened
           before this one. It was already half-handled by the lateOpen rule
           below, but that sat UNDER reach-furthest, so an 11:00 person staying
           until 2 still beat an 11:15 person and got pulled off an 11:00
           station to do it.
           ⚠️ THE WINDOW IS 6 MINUTES, AND THAT NUMBER IS LOAD-BEARING. The
           first version allowed 15, which is exactly the gap between 11:00 and
           11:15 — so an 11:00 body counted as "starting now" at an 11:15
           station and the rule did nothing at all. Caught by the test, not by
           reading it. Tight enough to separate adjacent quarter-hours, loose
           enough to absorb a clock-in written as 11:14.
           ⚠️ It does NOT cost coverage. Anyone in `here` already covers the
           cursor, so every candidate this reorders is a valid cover — it only
           decides WHICH valid body, which is the whole ask. Reach-furthest still
           ranks immediately after, so closing coverage and fewest-handoffs
           survive intact. */
        const startsNow = (c) => Math.abs(c.start - cursor) < 0.1;
        here.sort(
          (a, b) =>
            ((startsNow(b) ? 1 : 0) - (startsNow(a) ? 1 : 0)) ||
            (b.end - a.end) ||
            (lateOpen ? clockIn(b.p) - clockIn(a.p) : 0) ||
            (skillAt(b.p, k) - skillAt(a.p, k)) ||
            (rotate ? (hasWorkedStation(a.p, st) ? 1 : 0) - (hasWorkedStation(b.p, st) ? 1 : 0) : 0) ||
            (clockIn(a.p) - clockIn(b.p))
        );
        const pick = here[0];
        const segEnd = Math.min(pick.end, W.end);
        chosen.push({ p: pick.p, start: cursor, end: segEnd });
        used.add(nk(pick.p));
        cursor = segEnd;
      } else {
        // Nobody on the clock at the cursor. Skip the hole to the next
        // candidate that starts later, record it, and keep covering — so a
        // missing opener still leaves the later part staffed, with the hole
        // flagged, instead of blanking the whole cell.
        const laterStarts = cands
          .filter((c) => !used.has(nk(c.p)) && c.start > cursor + 0.001 && c.end > c.start && isFree(c.p, c.start, Math.min(c.end, W.end)))
          .map((c) => c.start);
        if (!laterStarts.length) { holes.push({ from: cursor, to: W.end }); break; }
        const nextStart = Math.min(Math.min(...laterStarts), W.end);
        holes.push({ from: cursor, to: nextStart });
        cursor = nextStart;
      }
    }
    // Total uncovered length — used to pick the fuller of two candidate cover
    // attempts (job-match vs anyone) in the general pass.
    const holeLen = holes.reduce((t, h) => t + (h.to - h.from), 0);
    return { chosen, holes, holeLen };
  };

  /* Commit a chain: write the cell ("A →B 6"), claim each slice, and record
     what it staffed. Gaps are swept once at the end, not here. */
  const commitCover = (st, k, W, result) => {
    if (!result.chosen.length) return;
    let text = "";
    result.chosen.forEach((seg, i) => {
      if (i === 0) text = lbl(seg.p) + oddStart(k, seg.start);
      else text += ` →${lbl(seg.p)} ${fmtClock(seg.start)}`;
      claim(seg.p, seg.start, seg.end);
      markWorked(seg.p, st);
      markPeriodStation(seg.p, st, k);
      track(seg.p);
      recordCov(st, k, seg.start, seg.end);
    });
    st[k] = text;
  };

  // Which fill cells were open (fillable) at the START — the set the final
  // gap sweep checks. Snapshotted before any placement writes to cells.
  const wasOpen = {};
  sweepRows().forEach((st) => SHIFT_KEYS.forEach((k) => { wasOpen[covKey(st, k)] = openCell(st, k) && stationOpenAt(st, k); }));

  // Who held DT Leader in the previous period — used to swap DT/FC each daypart.
  let lastDTLeader = null;

  SHIFT_KEYS.forEach((k) => {
    const availPeriod = (filter) =>
      people.filter((p) => periodsCovered(p.ranges).has(k) && !isBusyPeriod(p, k) && (!filter || filter(p)));

    /* 0 · Rhonda LOCKED to Register — CHAINED at the front.
       July 27 2026. place() writes the WHOLE cell, and personCoversStation only
       tests OVERLAP, so an 8:30 Rhonda took REGISTER 1 (opens 6AM) outright and
       the 6–8:30 slice became an uncovered gap. Second-order damage: she was
       the only 8:30 body left for DT MOBILES (opens 8:30), so greedyCover's JIT
       rule had to spend a 6AM body there instead — a straight swap, 7 bodies
       for 7 cells, one hole. Reproduced on Tue Jul 28; Mon Jul 27 is the same
       roster shape WITHOUT Rhonda and comes out clean.

       She cannot be moved: her lock is Register-only and Reg 2 / Reg 3 both
       open at 11, so Register 1 is her ONE legal breakfast station. So cover
       the pre-arrival slice with an earlier body and render the handoff the way
       every other station already does — "Ella →Rhonda 8:30".

       Not Rhonda-specific: this fires for any locked body whose clock-in is
       later than their station's open. */
    registerRows.forEach((st) => {
      if (!openCell(st, k) || !stationOpenAt(st, k)) return;
      const p = availPeriod((x) => isRhonda(x)).find((x) => personCoversStation(x, st, k));
      if (!p) return;
      const W = stationWindow(st, k);
      const pres = presenceInPeriod(p, k);
      const iv = W && pres ? clampIv(pres.start, pres.end, W.start, W.end) : null;
      // On the clock at open (or no usable window) → unchanged whole-cell path.
      if (!W || !iv || iv.start <= W.start + 0.001) { place(st, k, p); track(p); return; }

      const frontW = { start: W.start, end: iv.start };
      const frontCands = people
        .filter((x) => {
          if (nk(x) === nk(p)) return false;
          if (!lockAllows(x, st)) return false;
          if (isBusyPeriod(x, k) || heldElsewhere(x, st, k)) return false;
          const j = jobForPeriod(x, k);
          return !isBohJob(j) && !isLeaderJob(j);
        })
        .map((x) => {
          const pr = presenceInPeriod(x, k);
          const c = pr && clampIv(pr.start, pr.end, frontW.start, frontW.end);
          return c ? { p: x, start: c.start, end: c.end } : null;
        })
        .filter(Boolean);
      const front = greedyCover(st, k, frontCands, frontW, false);
      const chosen = [...front.chosen, { p, start: iv.start, end: iv.end }];

      // Local commit — commitCover's twin, with ONE difference. Rule 4's
      // periodStation lock is only stamped on someone whose presence ENDS in
      // this cell. The front body hands off mid-period and their remaining
      // hours are exactly what the late-opening station needs; stamping them
      // here would make heldElsewhere() bar them from it and re-open the hole
      // one station over. Their claim is still only the slice they worked, so
      // they can never be double-booked.
      let text = "";
      chosen.forEach((seg, i) => {
        if (i === 0) text = lbl(seg.p) + oddStart(k, seg.start);
        else text += ` →${lbl(seg.p)} ${fmtClock(seg.start)}`;
        claim(seg.p, seg.start, seg.end);
        markWorked(seg.p, st);
        const pr = presenceInPeriod(seg.p, k);
        if (!pr || seg.end >= pr.end - 0.001) markPeriodStation(seg.p, st, k);
        track(seg.p);
        recordCov(st, k, seg.start, seg.end);
      });
      st[k] = text;
    });

    /* 1 · Leadership — DT/FC alternate across dayparts. */
    {
      const leaderOpen = (st, kk) => {
        const v = (st[kk] || "").trim();
        return v === "" || v === "✔️" || v === "✔";
      };
      // Job-code "Leadership" maps to no station; the person locks never apply.
      const leaders = availPeriod((x) =>
        isLeaderJob(jobForPeriod(x, k)) && !isDenise(x) && !isRhonda(x) && !isMarchelle(x) && !isBronson(x)
      );

      // July 26 2026 — LEADER HANDOFF CHAINING (Matt: "chain the handoff").
      // Leader rows used to write ONE name for the whole daypart, so a row only
      // part-covered by its best leader showed a single name and HID the hole —
      // while every other station already renders "Thanh \u2192Tashiana 1". Leaders
      // now run through the same greedyCover/commitCover machinery, with the
      // \u2714\ufe0f prefix preserved.
      //
      // This also removes the silent double-book: DT commits first and claim()
      // marks that leader busy, so FC can no longer be handed the same person
      // by a `|| cands[0]` fallback. If nobody else is free, FC stays blank and
      // the gap sweep now reports it instead of showing a duplicate name.
      const leaderCands = (pool, kk, W) =>
        pool
          .map((p) => {
            const pr = presenceInPeriod(p, kk);
            const iv = pr && clampIv(pr.start, pr.end, W.start, W.end);
            return iv ? { p, start: iv.start, end: iv.end } : null;
          })
          .filter(Boolean);
      const commitLeader = (st, kk, W, res) => {
        if (!res || !res.chosen.length) return false;
        commitCover(st, kk, W, res);
        st[kk] = "\u2714\ufe0f" + st[kk];
        return true;
      };
      const coverWith = (st, kk, pool) => {
        const W = stationWindow(st, kk);
        if (!W) return null;
        return { W, res: greedyCover(st, kk, leaderCands(pool, kk, W), W, false) };
      };
      // Post-swapping stays a TIEBREAK: take it only when the alternative
      // covers exactly as much, in as few handoffs, at the same skill.
      const sameQuality = (a, b) =>
        Math.abs(a.holeLen - b.holeLen) < 0.001 &&
        a.chosen.length === b.chosen.length &&
        skillAt(a.chosen[0].p, k) === skillAt(b.chosen[0].p, k);

      let thisDTLeader = null;
      const runDT = () => {
        leaderDT.forEach((st) => {
          if (!leaderOpen(st, k)) return;
          const pool = leaders.filter((x) => !isBusyPeriod(x, k));
          const full = coverWith(st, k, pool);
          if (!full || !full.res.chosen.length) return;
          let use = full.res;
          if (lastDTLeader) {
            const rot = coverWith(st, k, pool.filter((x) => x.name.toLowerCase() !== lastDTLeader));
            if (rot && rot.res.chosen.length && sameQuality(rot.res, full.res)) use = rot.res;
          }
          if (commitLeader(st, k, full.W, use)) thisDTLeader = use.chosen[0].p.name.toLowerCase();
        });
      };
      const runFC = () => {
        leaderFC.forEach((st) => {
          if (!leaderOpen(st, k)) return;
          const pool = leaders.filter((x) => !isBusyPeriod(x, k));
          const out = coverWith(st, k, pool);
          if (out) commitLeader(st, k, out.W, out.res);
        });
      };

      // July 28 2026 — JOINT DT/FC ALLOCATION. DT used to run first and take
      // the body reaching FURTHEST, which is exactly the body FC's shorter
      // window needs end-to-end. Wed Jul 29 night: DT (5–11) took Jamar 5–10
      // and chained Lulani 10–11, leaving FC (5–10) only Lizbeth 5–6 and a
      // 6–10 hole — while FC=Jamar 5–10, DT=Lizbeth 5–6 →Lulani 6–11 covers
      // BOTH rows with the same three leaders. Same class as Pass 2b's
      // opener/closer lock: a per-station greedy can't see the row after it.
      // Both orders are simulated with the pure greedyCover (no commits, no
      // claims) and the one leaving less total uncovered leader time wins.
      // DT keeps first pick on a tie, so the swap/skill order is unchanged
      // on every day where both orders cover equally.
      {
        const dtSt = leaderDT.find((s) => leaderOpen(s, k));
        const fcSt = leaderFC.find((s) => leaderOpen(s, k));
        let fcFirst = false;
        if (dtSt && fcSt) {
          const poolNow = leaders.filter((x) => !isBusyPeriod(x, k));
          const totalHole = (first, second) => {
            const a = coverWith(first, k, poolNow);
            if (!a) return 0;
            const usedA = new Set(a.res.chosen.map((c) => nk(c.p)));
            const b = coverWith(second, k, poolNow.filter((x) => !usedA.has(nk(x))));
            return a.res.holeLen + (b ? b.res.holeLen : 0);
          };
          fcFirst = totalHole(fcSt, dtSt) < totalHole(dtSt, fcSt) - 0.001;
        }
        if (fcFirst) { runFC(); runDT(); } else { runDT(); runFC(); }
      }
      if (thisDTLeader) lastDTLeader = thisDTLeader;
    }

    /* 2 · (REMOVED July 16) TRAINER-ON-OT RESERVATION.
       Matt: "Let's erase the trainer rule and assign by job skill and lock the
       in and out times. The same rules for Rhonda, Marchelle, Denise and
       Bronson still apply. Leaders as well. This should help uncomplicate
       things."

       It reserved OT rows for a trainer BEFORE the scheduled pass, using
       place() — a whole-period write that filled the cell and closed it. Two
       problems, both real:
       • FALSE TRAINERS. buildTrainerSet added BARE FIRST NAMES, so Ashley
         VALADEZ inherited Ashley RANGEL-AVILA's trainer status and Jose MENDEZ
         OLAYO inherited Jose ARIAS CORTEZ's. Both are 5-8 bodies. Pass 2 handed
         them OT Captain and OT 1 — stations that close at 10 — producing the
         8-10 gaps. (The same collision was fixed in DailySetup's display on
         July 14; the engine's copy never was.)
       • Even with a real trainer, place() couldn't chain, so a trainer who left
         before the station closed left an unfillable tail.
       Gone entirely. OT rows now fill from the scheduled pass and general fill
       like every other station: job-skill match, and greedyCover's max-end rule
       means whoever actually covers to close wins the cell. Locks (Rhonda,
       Denise, Marchelle, Julie, Bronson) and the leader rows are untouched. */

    /* 2b · OPENER / CLOSER LOCK — fill the constrained slots FIRST.
       Matt, July 16: "match people at open to the set times and the people at
       close to the set times and rotate 11-5" ... "So fill openers and closers
       then fill in?" — yes, and that ordering is the whole fix.

       WHY greedy alone can't do it: greedyCover fills ONE STATION AT A TIME and
       takes the best body for THAT station, in template order. It never checks
       whether the body it's taking is the only one that fits a station further
       down the list. Friday night, the schedule is written as an almost exact
       match — bodies leaving 21: 4, stations closing 21: 4; leaving 22: 5,
       closing 22: 5 — and greedy threw it away, consuming the 21s and 22s on
       earlier stations until OT 1 (closes 10) was left with Jose M, who leaves
       at 8. That 8-10 hole was unfillable because everyone else was already
       placed. Four tiebreak/ordering attempts couldn't fix it: no rule INSIDE a
       per-station sort can see the other stations.

       This pass matches whole-window bodies to stations before any greedy runs:
       a person on the clock BY the station's open AND leaving AT its close is
       locked to it. MOST-CONSTRAINED STATION FIRST (fewest exact candidates) —
       the standard heuristic, and it recovers the exact match when the schedule
       provides one, which is what "it was perfect last weekend" means.
       Everything else is untouched: locks (Rhonda/Denise/Marchelle/Julie/
       Bronson) gate every candidate, leaders already ran in Pass 1, BOH job
       codes are excluded, and anything this pass can't match falls through to
       the scheduled + general-fill passes exactly as before. */
    {
      const cellsOf = () =>
        fillRows
          .filter((st) => openCell(st, k) && stationOpenAt(st, k))
          .map((st) => ({ st, W: stationWindow(st, k) }))
          .filter((x) => x.W);
      const exactFor = (st, W) =>
        people.filter((p) => {
          if (!lockAllows(p, st)) return false;
          if (heldElsewhere(p, st, k)) return false;
          const j = jobForPeriod(p, k);
          if (isBohJob(j) || isLeaderJob(j)) return false;
          const pres = presenceInPeriod(p, k);
          if (!pres) return false;
          if (pres.start > W.start + 0.001) return false;      // on the clock at open
          if (Math.abs(pres.end - W.end) > 0.001) return false; // leaves at close
          return isFree(p, W.start, W.end);
        });
      for (;;) {
        const scored = cellsOf()
          .map((x) => ({ ...x, cands: exactFor(x.st, x.W) }))
          .filter((x) => x.cands.length);
        if (!scored.length) break;
        // Fewest candidates first; ties → the station closing earliest, since
        // its bodies are the scarcest.
        scored.sort((a, b) => (a.cands.length - b.cands.length) || (a.W.end - b.W.end));
        const pick = scored[0];
        // ROTATION (Matt, July 16): "People complain if they have to do the same
        // station back to back. Especially outside." Among people who ALL match
        // this station's open+close exactly, prefer someone who hasn't already
        // worked it today, and — for OT/EXPO — someone who hasn't been outside
        // today at all. Both are pure tiebreaks BELOW the exact-time match, so
        // they can never cost coverage or re-open a gap; they only decide which
        // of several equally-valid bodies gets the cell.
        // wasOutside/outsideToday were left orphaned when the trainer pass was
        // removed — this is what they're for now.
        const wantOutsideSpread = isOutsideStation(pick.st.role);
        // MOST-CONSTRAINED PERSON FIRST, above rotation and skill. Denise is
        // dining-ONLY and Cleanliness is shut at mid, so Hospitality mid is her
        // ONE station all day; David (Drive Thru-coded) can go anywhere. Both
        // hit 2-5 exactly, both Beginner — the tie fell to roster order, David
        // took the cell, and Denise landed in "Additional — not on a station"
        // (this pass runs BEFORE the dining-lock pass that used to protect
        // her, so nothing downstream recovered it). One-place-to-go beats
        // many-places-to-go, every time. Matt, July 16: "the 2-5 Denise should
        // be hospitality or cleanliness."
        const lockBreadth = (x) => {
          if (isDenise(x) || isRhonda(x) || isBronson(x)) return 1;
          if (isMarchelle(x)) return 2;
          if (isJulie(x)) return 3;
          return 99;
        };
        // JUST-IN-TIME AT OPEN (Matt, July 17: "There are 4 11:15 people so
        // they need locked into those positions"). exactFor admits anyone on
        // the clock BY open, so an 11:00 body tied an 11:15 body for Expo 2
        // (opens 11:15) and roster order let the 11:00 body win — burning a
        // slot the 11:15 body needed and stranding Salvador in "Additional".
        // Prefer the LATEST arrival that still makes open — the mirror of
        // greedyCover's lateOpen rule (#4), pointed at this pass. An exact
        // 11:15-for-11:15 match beats 11:00-for-11:15; 11:00 bodies stay free
        // for the 11:00 stations. Sits below lockBreadth (Bronson still takes
        // Cleanliness first), above rotation/skill — time-match is a placement
        // rule, same rank as the close match this pass is built on.
        const jitStart = (x) => { const pr = presenceInPeriod(x, k); return pr ? pr.start : 0; };
        const p = pick.cands.sort(
          (a, b) =>
            (lockBreadth(a) - lockBreadth(b)) ||
            (jitStart(b) - jitStart(a)) ||
            (hasWorkedStation(a, pick.st) ? 1 : 0) - (hasWorkedStation(b, pick.st) ? 1 : 0) ||
            (wantOutsideSpread ? (wasOutside(a) ? 1 : 0) - (wasOutside(b) ? 1 : 0) : 0) ||
            (skillAt(b, k) - skillAt(a, k))
        )[0];
        place(pick.st, k, p);
        track(p);
      }
    }

    /* 3 · SCHEDULED JOB — greedy time-cover per station, earliest-opening
       first, chaining handoffs. Candidate intervals come from the blocks
       whose job matches the station (clamped to the station window). */
    fillRows
      .filter((st) => openCell(st, k) && stationOpenAt(st, k))
      .map((st) => ({ st, W: stationWindow(st, k) }))
      .sort((a, b) => a.W.start - b.W.start)
      .forEach(({ st, W }) => {
        if (!openCell(st, k)) return;
        const cands = [];
        people.forEach((p) => {
          if (!lockAllows(p, st)) return;
          if (heldElsewhere(p, st, k)) return; // rule 4: one position per daypart
          blocksOf(p).forEach((b) => {
            if (!b.job || isLeaderJob(b.job) || isBohJob(b.job)) return;
            if (!stationMatchesJob(st.role, b.job)) return;
            const iv = clampIv(b.start, b.end, W.start, W.end);
            if (iv) cands.push({ p, start: iv.start, end: iv.end });
          });
        });
        if (!cands.length) return;
        // Rotation runs midday only — openers/closers hold, mids shuffle.
        commitCover(st, k, W, greedyCover(st, k, cands, W, isMidday(k)));
      });

    /* 4 · Dining locks — Bronson → Cleanliness, Denise → Cleanliness /
       Hospitality. On a Cleanliness row Bronson takes priority so Denise
       stays free for Hospitality. */
    diningRows.forEach((st) => {
      if (!openCell(st, k) || !stationOpenAt(st, k)) return;
      const clean = isCleanlinessStation(st.role);
      const p = availPeriod((x) => (clean && isBronson(x)) || isDenise(x))
        .filter((x) => lockAllows(x, st) && personCoversStation(x, st, k))
        .sort((a, b) => (clean && isBronson(b) ? 1 : 0) - (clean && isBronson(a) ? 1 : 0))[0];
      if (p) { place(st, k, p); track(p); }
    });

    /* 5 · GENERAL FILL — greedy time-cover of anything still open, earliest-
       opening first. Candidates: any non-leader / non-BOH person the lock
       allows; prefer a job-skill match, then anyone. Handoffs chain the same
       way as the scheduled pass. */
    fillRows
      .filter((st) => openCell(st, k) && stationOpenAt(st, k))
      .map((st) => ({ st, W: stationWindow(st, k) }))
      .sort((a, b) => a.W.start - b.W.start)
      .forEach(({ st, W }) => {
        if (!openCell(st, k)) return;
        const build = (matchOnly) => {
          const cands = [];
          people.forEach((p) => {
            if (!lockAllows(p, st)) return;
            if (heldElsewhere(p, st, k)) return; // rule 4: one position per daypart
            if (isBohJob(jobForPeriod(p, k)) || isLeaderJob(jobForPeriod(p, k))) return;
            if (matchOnly && !stationMatchesJob(st.role, jobForPeriod(p, k))) return;
            const pres = presenceInPeriod(p, k);
            const iv = pres && clampIv(pres.start, pres.end, W.start, W.end);
            if (iv) cands.push({ p, start: iv.start, end: iv.end });
          });
          return cands;
        };
        // Cover with job-skill matches first; if that leaves any hole, try
        // anyone available and keep whichever cover is fuller (least uncovered).
        // Rotation runs on LUNCH + MID only — it spreads people off a station
        // they already worked (the back-to-back complaint) so the middle of the
        // day shuffles, while breakfast openers and night closers hold their
        // spot. It only ever breaks ties AFTER coverage and skill, so it can't
        // cost coverage; real clock-outs still chain as "A →B time".
        const rot = isMidday(k);
        let res = greedyCover(st, k, build(true), W, rot);
        if (res.holeLen > 0.001) {
          const resAny = greedyCover(st, k, build(false), W, rot);
          if (resAny.holeLen < res.holeLen - 0.001) res = resAny;
        }
        commitCover(st, k, W, res);
      });
  });

  /* ---- GAP SWEEP (once) — for every cell that was open at the start, flag
     the sub-intervals of its staffed window that nobody ended up covering. */
  sweepRows().forEach((st) =>
    SHIFT_KEYS.forEach((k) => {
      if (!wasOpen[covKey(st, k)]) return;
      const W = stationWindow(st, k);
      if (!W) return;
      subtractCovered(W, coverage[covKey(st, k)]).forEach((h) =>
        gaps.push({ role: st.role, period: k, opensAt: fmtClock(W.start), from: fmtClock(h.from), to: fmtClock(h.to) })
      );
    })
  );

  /* AD SENIORITY DISPLAY — informational only. */
  {
    const adRows = stations.filter((s) => /^ASSISTANT DIRECTOR/i.test(s.role));
    if (adRows.length) {
      SHIFT_KEYS.forEach((k) => {
        const per = PERIOD_HOURS[k];
        const onShift = people
          .filter(
            (p) =>
              adRankOf(p) >= 0 &&
              (p.ranges || []).some((r) => overlaps(r.start, r.end, per.start, per.end))
          )
          .sort((a, b) => (skillAt(b, k) - skillAt(a, k)) || (adRankOf(a) - adRankOf(b)));
        /* 🐛 ONE PERSON WAS FILLING EVERY ROW (Matt, Aug 4 2026: "for the
           setup dont have 1 ad fill the second card. just leave empty if there
           is only 1"). Same defect as the BOH engine, same fix — Nth person to
           the Nth row, and rows past the end of the list stay EMPTY. A duplicate
           hides a gap; an empty cell is a gap somebody can fill. */
        if (!onShift.length) return;
        adRows.forEach((st, i) => {
          const who = onShift[i];
          if (!who) return;
          if (!(st[k] || "").trim()) st[k] = lbl(who);
        });
      });
    }
  }

  /* DIRECTOR DISPLAY — same contract as the AD block above: informational
     only, never consumes anyone, manual entries always win. Bare DIRECTOR
     row only; isSpecialRow keeps the ordinary fill off it, this is the one
     writer. Blank when no Director is on the clock, which is honest. */
  {
    const dirRows = stations.filter((s) => /^DIRECTOR$/i.test((s.role || "").trim()));
    if (dirRows.length) {
      SHIFT_KEYS.forEach((k) => {
        const per = PERIOD_HOURS[k];
        const onShift = people
          .filter(
            (p) =>
              dirRankOf(p) >= 0 &&
              (p.ranges || []).some((r) => overlaps(r.start, r.end, per.start, per.end))
          )
          .sort((a, b) => (skillAt(b, k) - skillAt(a, k)) || (dirRankOf(a) - dirRankOf(b)));
        /* Same rule as the AD rows above — one person never fills two. */
        if (!onShift.length) return;
        dirRows.forEach((st, i) => {
          const who = onShift[i];
          if (!who) return;
          if (!(st[k] || "").trim()) st[k] = lbl(who);
        });
      });
    }
  }

  const placed = [...placedSet];
  const unplaced = people.filter((p) => !placedSet.has(p.name)).map((p) => p.name);
  return { data: next, placed, unplaced, gaps };
}

/* ============ Break auto-assignment (unchanged) ============ */
const BREAK_WINDOWS = [
  { start: 7, end: 10.5 },
  { start: 13.5, end: 21.5 },
];
function windowsForRanges(ranges) {
  const out = [];
  BREAK_WINDOWS.forEach((w) => {
    (ranges || []).forEach((r) => {
      const s = Math.max(w.start, r.start);
      const e = Math.min(w.end, r.end);
      if (e > s) out.push({ start: s, end: e });
    });
  });
  return out.sort((a, b) => a.start - b.start);
}
function snapToWindows(t, windows) {
  if (!windows.length) return t;
  for (const w of windows) {
    if (t >= w.start && t <= w.end) return t;
  }
  let best = windows[0].start;
  let bestDist = Math.abs(t - best);
  windows.forEach((w) => {
    [w.start, w.end].forEach((edge) => {
      const d = Math.abs(t - edge);
      if (d < bestDist) { bestDist = d; best = edge; }
    });
  });
  return best;
}
export function autoAssignBreaks(people, minors) {
  const minorSet = new Set((minors || []).map((m) => (m || "").trim().toLowerCase()).filter(Boolean));
  const slots = {};
  const out = {};
  const clockIn = (p) => (p.ranges && p.ranges.length ? Math.min(...p.ranges.map((r) => r.start)) : 99);
  const sorted = [...people].sort((a, b) => clockIn(a) - clockIn(b));
  sorted.forEach((p) => {
    const hours = rangesHours(p.ranges);
    const isMinor =
      minorSet.has(p.name.toLowerCase()) || minorSet.has(p.name.split(" ")[0].toLowerCase());
    const need = requiredBreaks(hours, isMinor);
    if (!need || !p.ranges.length) return;
    const windows = windowsForRanges(p.ranges);
    const span = p.ranges[p.ranges.length - 1].end - p.ranges[0].start;
    const base = p.ranges[0].start;
    for (let b = 0; b < need; b++) {
      let ideal = base + (span * (b + 1)) / (need + 1);
      ideal = Math.round(ideal * 2) / 2;
      ideal = snapToWindows(ideal, windows);
      const key = (h) => Math.round(h * 2);
      const allSlots = [];
      windows.forEach((w) => {
        const startK = Math.ceil(w.start * 2);
        const endK = Math.floor(w.end * 2);
        for (let kk = startK; kk <= endK; kk++) allSlots.push(kk / 2);
      });
      let chosen = null;
      if (allSlots.length) {
        const open = allSlots.filter((s) => !(slots[key(s)] >= 1));
        if (open.length) {
          /* ⚠️ FIRST IN, FIRST BREAK. Matt and Chloe, Jul 30 2026.
             This used to take the open slot NEAREST that one person's own
             midpoint, which is not an order at all. `sorted` above already walks
             people in clock-in order, so taking the EARLIEST open slot each time
             hands the earliest arrival the earliest break, and everyone behind
             them falls into line automatically.

             What it replaced, measured on Friday's real shifts: someone on the
             floor since 5:00 broke at 9:30 while someone who walked in at 6:00
             broke at 9:00. Two people with identical 6:00 to 5:00 shifts got
             breaks ninety minutes apart, decided by nothing but which one the
             search reached first.

             ⚠️ `windows` is already this person's own working time intersected
             with the break windows, so "earliest" can never land before they
             clock in or after they leave. Do not widen it to allSlots. */
          chosen = open.reduce((best, s) => (s < best ? s : best), open[0]);
        } else {
          chosen = allSlots.reduce((best, s) => {
            const os = slots[key(s)] || 0;
            const ob = slots[key(best)] || 0;
            if (os < ob) return s;
            if (os === ob && Math.abs(s - ideal) < Math.abs(best - ideal)) return s;
            return best;
          }, allSlots[0]);
        }
      }
      const t = chosen != null ? chosen : ideal;
      slots[key(t)] = (slots[key(t)] || 0) + 1;
      (out[p.name] = out[p.name] || []).push(fmtBreakTime(t));
    }
  });
  return out;
}
