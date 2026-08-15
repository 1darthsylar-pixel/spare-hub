/* ============================================================================
   BOHAutoAssign.js — Gate City Hub · Daily Setups "Auto Assignment" engine (BOH)

   THE SCHEDULE IS THE SOURCE OF TRUTH.
   HotSchedules assigns a JOB PER TIME BLOCK — one person's day can read
   "Fries 9-11a, Machines 11a-2p, Prep 2p-5p". The importer now preserves
   every block (p.blocks), so the engine no longer re-derives a person's
   whole day from a single job code. Placement order:

   0. Pass 0 — SCHEDULED JOB. For each period, each person is placed on a
      station in the section their SCHEDULED BLOCK maps to. This wins over
      skill and over rotation: the schedule writer already decided who is
      where and when. Blocks whose job is LEADERSHIP are skipped — that job
      code carries no station (see Pass 3).
   1. Pass 1 — section match (skill-based) for anyone Pass 0 didn't place
      (no block job, or their section's stations were full).
   2. Pass 2 — fallback fill: any station still open, filled by any
      available BOH person whose hours cover it.
   3. Pass 3 — LEADERSHIP, derived from who ended up on Machines. Runs LAST
      because a Machines slot can be staffed by Pass 0, 1, OR 2.
   4. AD SENIORITY DISPLAY — informational only, never consumes anyone.

   SEQUENTIAL BLOCKS WITHIN ONE PERIOD (fix, July 10 2026):
   A person CAN hold two stations in the same board period when their
   scheduled blocks don't overlap in time — Truck 5-8:30a then Machines
   8:30-11a both sit inside breakfast. The old "one station per person per
   period" lock blocked the second placement, leaving Machines empty at
   breakfast. Now:
   • Pass 0 checks TIME CONFLICT, not period occupancy: a scheduled block
     places as long as it doesn't overlap any interval already placed for
     that person in that period.
   • When someone has two scheduled blocks inside one period, the
     later-starting placement renders with its start time — Truck shows
     "Brandon", Machines shows "Brandon @8:30" — so the board reads like
     the sheet would.
   • Pass 1/Pass 2 fills are whole-period and unscheduled, so for them the
     strict one-per-period rule still applies (they claim the full period
     window).

   Other rules:
   • A station's posted hours (e.g. "8:30AM-2PM") describe when the station
     is STAFFED across the day, not a span one person must cover.
   • A station with no eligible person that period stays blank. That's
     correct: it surfaces a real staffing gap rather than hiding it.
   • Never overwrites an existing name, ✔️, or ❌ in a cell.
   • Midday rotation still applies, but only to Pass 1/Pass 2 fills — the
     schedule already rotates people who have block jobs.

   Pure function — no storage, no UI. DailySetup.jsx imports:
     autoAssignBOH(dayData, people) → { data, placed, unplaced, gaps }
   `people` rows come from parseImportText:
     { name, ranges, hours, job, skill, section, blocks:[{start,end,job,skill,section}] }
   Break assignment reuses autoAssignBreaks from FOHAutoAssign.js.
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

const SHIFT_KEYS = ["breakfast", "lunch", "mid", "night"];

/* ---- duplicated tiny helpers (kept local so this module stands alone) ---- */
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
/* 8.5 → "8:30" · 14 → "2" — for the @time suffix on sequential placements. */
function fmtClockShort(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  const disp = ((hh + 11) % 12) + 1;
  return mm ? `${disp}:${String(mm).padStart(2, "0")}` : `${disp}`;
}

/* ---- job code → BOH section (kept in sync with DailySetup.jsx's map) ---- */
const BOH_JOB_MAP = [
  { re: /bread/i, section: "BREADING" },
  { re: /load|filter|thaw/i, section: "BREADING" },
  { re: /fry|fries|hash/i, section: "FRY STATION" },
  { re: /machine/i, section: "MACHINES" },
  { re: /\bprep\b/i, section: "PREP" },
  { re: /truck|receiv/i, section: "TRUCK / RECEIVING" },
  { re: /dish|sanit/i, section: "DISH / SANITATION" },
  { re: /biscuit|egg|nugget|strip|soup|\bmac\b|secondary/i, section: "SECONDARY" },
  { re: /board|sandwich/i, section: "PRIMARY" },
  { re: /primary|point|special/i, section: "PRIMARY" },
  { re: /kitchen lead|kitchen manager|kitchen mgr/i, section: "LEADERSHIP" },
  { re: /\bcook\b|kitchen|\bboh\b|grill/i, section: "SECONDARY" },
];
function mapJobToSection(job) {
  if (!job) return null;
  const hit = BOH_JOB_MAP.find((j) => j.re.test(job));
  return hit ? hit.section : null;
}

/* job code → STATION match within a section. The section tells us which
   board a person belongs to; this tells us WHICH STATION on it. Without it a
   Breader-coded person overflows onto Loader/Filter/Thaw the moment the
   Breader station is taken — a different job entirely. */
const BOH_STATION_PAIRS = [
  [/breader/i, /bread/i],
  // Matt (July 15): "Breader coded people should always go to breader or
  // loader." The job side carries `bread` so a Breader-coded person can hold
  // Loader / Filter / Thaw as well as Breader. Station hardness fills Breader
  // first, so this only spills someone onto Loader once Breader is covered.
  [/loader|filter|thaw/i, /load|filter|thaw|bread/i],
  [/machine/i, /machine/i],
  [/hash|fry/i, /fry|fries|hash/i],
  [/prep/i, /\bprep\b/i],
  [/truck|receiv/i, /truck|receiv/i],
  [/dish/i, /dish|sanit/i],
  [/biscuit|egg/i, /biscuit|egg/i],
  [/nugget|strip|soup|mac/i, /nugget|strip|soup|\bmac\b|boards\s*2/i],
  [/point|specials|buns|grilled/i, /boards\s*1|sandwich|primary|point|special/i],
];
function stationMatchesJobBOH(role, job) {
  if (!job) return false;
  return BOH_STATION_PAIRS.some(([rr, jr]) => rr.test(role || "") && jr.test(job));
}

/* A scheduled job of "Leadership" (or Kitchen Lead/Manager) carries no
   station — those people are derived onto the leader rows in Pass 3, and
   Pass 0 must leave them alone. */
const isLeadershipJob = (job) =>
  /^\s*leadership\s*$|kitchen\s*lead|kitchen\s*manager|kitchen\s*mgr|\bdirector\b/i.test(job || "");

/* ---- Director seniority (BOH) ----
   Matt, Jul 31 2026: "for the future i want daisy and brandon to auto fill
   like the AD's do. its not a position but just to show seniority." Same
   contract as the AD display: informational, never consumes a placement.
   M-initial required — the other Brandons on the roster must not match. */
/* Director seniority names now live in owners.board.bohDirectorNames. */
/* ⚠️ ID FIRST, NAME SECOND — the same shape as FOH, and the same reason. The
   name arm is Gate City's only, so a second store's Brandon does not inherit a
   director rank. ORDER IS THE RANK in both arms; nothing here sorts. */
const rankIn = (which, p, res) => {
  const id = bareId((p && (p.id != null ? p.id : p.hrId)) || "");
  const byId = id ? boardIds(which).indexOf(id) : -1;
  if (byId >= 0) return byId;
  return isGateCity() ? res.findIndex((re) => re.test((p && p.name) || "")) : -1;
};
const dirRankOf = (p) => rankIn("bohDirectorOrder", p, boardNamePatterns("bohDirectorNames").map((x) => new RegExp(x, "i")));

/* ---- Assistant Director seniority (BOH) ----
   Order = tie-break rank, top is most senior. Matched against the imported
   full name; Adriana needs the C-initial so the other Adriana doesn't match.
   ⚠️ Brandon M MOVED to DIRECTOR_BOH (Jul 31) — one person in both the
   Director row and the AD rows is the same seniority stated twice, and his
   name here would hide the actual senior AD on shift. Do not re-add him. */
/* AD seniority names now live in owners.board.bohAdNames. */
const adRankOf = (p) => rankIn("bohAdOrder", p, boardNamePatterns("bohAdNames").map((x) => new RegExp(x, "i")));

/* ---- PERSON LOCK (BOH) ----
   Juana is the Breader every day she works. She only ever lands on the
   Breader station — never Loader/Filter/Thaw or anything else — and she
   takes it AHEAD of the schedule, so a Breader-coded person slides to the
   rest of the BREADING section. Same shape as the FOH Bronson/Julie locks.
   NOTE: matches first name "Juana"; there is exactly one Juana on the roster
   (Juana Romero). If a second Juana is ever hired, both would lock to
   Breader — revisit then. */
/* ⚠️⚠️ THE NOTE BELOW SAID "if a second Juana is ever hired, both would lock to
   Breader — revisit then." That is now answered for good at Gate City AND it
   was the smaller half of the problem: a SECOND STORE hiring any Juana locked
   their person to the Breader on a live shift. Id first, and the name arm is
   Gate City's only. */
const isJuana = (p) => {
  const id = bareId((p && (p.id != null ? p.id : p.hrId)) || "");
  if (id && boardIds("lockBreader").includes(id)) return true;
  /* ⚠️ THE PATTERN MOVED TO ownerSeed.js. `ownPeopleList` inside
     `boardNamePatterns` is the gate now, so the explicit isGateCity() here
     would be a second gate saying the same thing. */
  const n = String((p && p.name) || "");
  return boardNamePatterns("lockBreaderNames").some((src) => new RegExp(src, "i").test(n));
};
const isBreaderStation = (st) => /breader/i.test((st && st.role) || "");
/* Gate every candidate filter: a locked person is only allowed on their
   locked station; everyone else is unrestricted. */
const lockAllows = (p, st) => (isJuana(p) ? isBreaderStation(st) : true);

/* Which clock hours each board period spans (store opens 5AM, closes ~11PM). */
const PERIOD_HOURS = {
  breakfast: { start: 5, end: 11 },
  lunch: { start: 11, end: 14 },
  mid: { start: 14, end: 17 },
  night: { start: 17, end: 24 },
};
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd - 0.001 && aEnd > bStart + 0.001;
}
function overlapAmount(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

/* ---- SCHEDULED BLOCKS ----
   Each block is one HotSchedules row: a time range plus the job assigned to
   that range. Older imports have no blocks — fall back to treating the whole
   shift as one block carrying the person's primary job. */
function blocksOf(p) {
  if (p && p.blocks && p.blocks.length) return p.blocks;
  return (p.ranges || []).map((r) => ({
    start: r.start, end: r.end, job: p.job, skill: p.skill, section: p.section,
  }));
}
/* The block a person is actually working during period k — the one with the
   most overlap, when a period straddles two blocks. */
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

/* The job and skill a person carries DURING period k. HotSchedules records
   both per block — Brandon can be Beginner on Machines and a different level
   on Truck — so ranking and section-matching must read the block, not the
   person's first row of the day. */
function jobForPeriod(p, k) {
  const b = blockForPeriod(p, k);
  return (b && b.job) || p.job || "";
}
function skillForPeriod(p, k) {
  const b = blockForPeriod(p, k);
  return (b && b.skill) || p.skill || "";
}

/* Is the station open during period k? Stations with no posted hours are
   treated as open every period. */
function stationOpenAt(station, k) {
  const { hours } = splitRoleHours(station.role);
  if (!hours) return true;
  const req = parseRanges(hours);
  if (!req.length) return true;
  const per = PERIOD_HOURS[k];
  return req.some((r) => overlaps(r.start, r.end, per.start, per.end));
}

/* The station's real staffed window inside period k — its posted hours
   clamped to the period. null → not open this period. No posted hours → the
   whole period. Mirrors FOHAutoAssign's helper of the same name; Pass 0's
   chain cover tiles across this. */
function stationWindow(station, k) {
  const per = PERIOD_HOURS[k];
  const { hours } = splitRoleHours(station.role);
  if (!hours) return { start: per.start, end: per.end };
  const req = parseRanges(hours);
  if (!req.length) return { start: per.start, end: per.end };
  const over = req.filter((r) => overlaps(r.start, r.end, per.start, per.end));
  if (!over.length) return null;
  return {
    start: Math.max(per.start, Math.min(...over.map((r) => r.start))),
    end: Math.min(per.end, Math.max(...over.map((r) => r.end))),
  };
}

/* A person can hold a station in period k when their shift overlaps the
   period AND the station is open then. */
function personCoversStation(p, station, k) {
  if (!periodsCovered(p.ranges).has(k)) return false;
  const per = PERIOD_HOURS[k];
  const personHere = (p.ranges || []).some((r) => overlaps(r.start, r.end, per.start, per.end));
  if (!personHere) return false;
  return stationOpenAt(station, k);
}

/* ============ MAIN: BOH auto-assignment ============ */
export function autoAssignBOH(dayData, people) {
  const next = JSON.parse(JSON.stringify(dayData));
  const sections = next.sections || [];

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

  /* PLACEMENT INTERVALS — "name|period" → [{start,end}, …].
     Pass 0 places a scheduled block if it doesn't time-overlap anything
     already placed for that person in the period (sequential blocks like
     Truck 5-8:30 + Machines 8:30-11 both land). Pass 1/2 fills are
     whole-period, so they claim the entire period window — which also makes
     isBusy() true for the strict one-per-period rule those passes keep. */
  const placedIntervals = {};
  const pKey = (p, k) => p.name.toLowerCase() + "|" + k;
  const intervalsOf = (p, k) => placedIntervals[pKey(p, k)] || [];
  const isBusy = (p, k) => intervalsOf(p, k).length > 0;
  const conflictsWith = (p, k, b) =>
    intervalsOf(p, k).some((iv) => overlaps(iv.start, iv.end, b.start, b.end));

  // Track which station each person has worked today (base name, ignoring
  // posted hours), so during midday (11–5) the FALLBACK passes rotate people
  // instead of parking them. People with scheduled block jobs are already
  // rotated by the schedule itself.
  const stationsWorked = {};
  const baseName = (role) => splitRoleHours(role).name.toLowerCase();
  const hasWorkedStation = (p, st) =>
    (stationsWorked[p.name.toLowerCase()] || new Set()).has(baseName(st.role));

  /* place() — interval defaults to the full period window (Pass 1/2).
     Pass 0 passes the block's own time range, plus a "@start" display
     suffix when this is the person's later block inside the period. */
  const place = (st, k, p, interval, suffix) => {
    st[k] = lbl(p) + (suffix || "");
    const key = pKey(p, k);
    const per = PERIOD_HOURS[k];
    (placedIntervals[key] = placedIntervals[key] || []).push(
      interval ? { start: interval.start, end: interval.end } : { start: per.start, end: per.end }
    );
    const nk = p.name.toLowerCase();
    (stationsWorked[nk] = stationsWorked[nk] || new Set()).add(baseName(st.role));
  };

  const isMidday = (k) => k === "lunch" || k === "mid";

  const placedSet = new Set();
  const track = (p) => placedSet.add(p.name);

  const sectionOf = (name) => sections.find((s) => s.name === name);
  const allStations = sections.flatMap((s) => s.stations || []);

  /* PROTECTED ROWS — never touched by the fill passes.
     • LEADERSHIP sections: written only by Pass 3.
     • ASSISTANT DIRECTOR: filled only by the seniority display pass.
     • TRAINING / TRAINER: EDIT-ONLY, same rule FOH has always run under
       (Matt: "Training and trainer are edit only"). These rows arrived on
       the BOH template Jul 24 2026 with every cell OPEN, and nothing in
       Pass 0/1 can reach them (no job code maps to the TRAINING section) —
       but the Pass 2 FALLBACK fills anything still open in ANY section, so
       without this guard it would seat a body on TRAINING every period. */
  const isLeadershipSection = (sec) => /leader/i.test(sec.name || "");
  const isADRow = (role) => /assistant\s+director/i.test(role || "");
  const isTrainingRow = (role) => /^\s*(training|trainer)\s*$/i.test(role || "");
  const protectedStations = new Set(
    sections.filter(isLeadershipSection).flatMap((s) => s.stations || [])
  );
  const isProtected = (st) =>
    protectedStations.has(st) || isADRow(st.role) || isTrainingRow(st.role);

  // Skill rank — higher is stronger. Unknown skill sorts lowest.
  const SKILL_RANK = { advanced: 3, expert: 3, intermediate: 2, beginner: 1, novice: 1 };
  const skillOf = (p) => SKILL_RANK[(p.skill || "").toLowerCase()] || 0;
  // Period-aware skill: the level recorded on the block they're working now.
  const skillAt = (p, k) => SKILL_RANK[skillForPeriod(p, k).toLowerCase()] || 0;

  // Station "hardness" within a section — higher gets the stronger person
  // when the schedule leaves the choice open.
  function stationHardness(role) {
    const r = (role || "").toLowerCase();
    if (/special.*point/.test(r)) return 100;      // Specials / Point — hardest
    if (/primary\s*point/.test(r)) return 90;       // Primary Point
    if (/special.*grill|grill.*bun/.test(r)) return 80; // Specials / Grilled / Buns
    if (/dt lead|dt\b/.test(r)) return 70;          // DT-lead machines
    if (/foh lead/.test(r)) return 60;
    if (/bulk prep/.test(r)) return 55;
    if (/breader/.test(r)) return 50;
    return 0;
  }

  /* Every job-carrying, non-leadership block a person has inside period k.
     Used to detect the sequential-blocks case and pick which placement gets
     the "@start" suffix (every block after the person's earliest one). */
  const jobBlocksInPeriod = (p, k) => {
    const per = PERIOD_HOURS[k];
    return blocksOf(p).filter(
      (b) => b.job && !isLeadershipJob(b.job) && overlapAmount(b.start, b.end, per.start, per.end) > 0.001
    );
  };

  SHIFT_KEYS.forEach((k) => {
    /* ---- Pass -1 — PERSON LOCK (Juana → Breader), ahead of the schedule.
       Every period she's on the clock and Breader is open, she owns it. A
       Breader-coded person then falls to the rest of the BREADING section
       via the normal passes. lockAllows() (below) keeps her OFF every other
       station, so if Breader is ever taken/closed she stays unplaced that
       period rather than drifting to Loader/Filter/Thaw. */
    {
      const breader = allStations.find((s) => isBreaderStation(s) && !isProtected(s));
      if (breader && openCell(breader, k) && stationOpenAt(breader, k)) {
        const juana = people.find(
          (p) => isJuana(p) && !isBusy(p, k) && personCoversStation(p, breader, k)
        );
        if (juana) { place(breader, k, juana); track(juana); }
      }
    }

    /* ---- Pass 0 — SCHEDULED JOB (the HotSchedules block for this period).
       The schedule already decided who is where. Group everyone by the
       section their block maps to, then fill that section's open stations
       hardest-first with the strongest scheduled person available. Anyone
       whose block job is LEADERSHIP is skipped (Pass 3 handles them). */
    {
      const per = PERIOD_HOURS[k];
      const blockUsed = new Set(); // "personIdx|blockIdx" — within this period only
      const bySection = {};

      // EVERY block overlapping this period is a placement opportunity — a
      // person can legitimately hold two stations in one period when their
      // blocks don't overlap in time (e.g. Truck 5-8:30a then Machines
      // 8:30-11a both sit inside breakfast).
      people.forEach((p, pi) => {
        blocksOf(p).forEach((b, bi) => {
          if (!b.job) return;
          if (overlapAmount(b.start, b.end, per.start, per.end) <= 0.001) return;
          if (isLeadershipJob(b.job)) return;
          const secName = b.section || mapJobToSection(b.job);
          if (!secName) return;
          (bySection[secName] = bySection[secName] || []).push({ p, pi, bi, b });
        });
      });

      Object.keys(bySection).forEach((secName) => {
        const sec = sectionOf(secName);
        if (!sec || isLeadershipSection(sec)) return;
        const cands = bySection[secName].sort((a, b) => skillAt(b.p, k) - skillAt(a.p, k));
        const openStations = (sec.stations || [])
          .filter((s) => !isProtected(s))
          .sort((a, b) => stationHardness(b.role) - stationHardness(a.role));

        // Free = this block not already placed, AND no TIME overlap with
        // anything else placed for this person this period. Sequential
        // blocks pass; genuinely simultaneous double-placement doesn't.
        const free = (c) => !blockUsed.has(c.pi + "|" + c.bi) && !conflictsWith(c.p, k, c.b);

        /* TWO PHASES. Phase A fills EMPTY stations; only Phase B doubles a
           person onto an already-occupied cell.
           Matt (July 15): "The logic to have 2 people in one cell and one
           empty makes no sense" — and "there is no loader job class in
           HotSchedules, it's differentiated on the setup", so a Breader-coded
           body IS the Loader code. Tyler (Truck 5-8:30 → Breader 8:30-11) must
           land on the OPEN Loader/Filter/Thaw (8:30-2) rather than pile onto
           Breader beside Juana, who already holds it 5:45-11.
           Station hardness put Breader (50) ahead of Loader (0), so the
           co-occupant append consumed Tyler's block before Loader was ever
           offered a candidate. Splitting the passes fixes the order without
           touching hardness, the chain, or any lock. */
        [false, true].forEach((allowExtras) => {
        openStations.forEach((st) => {
          if (!stationOpenAt(st, k)) return;
          if (!allowExtras && !openCell(st, k)) return; // Phase A: empty cells only
          // A cell already written (e.g. Juana by the Pass -1 Breader lock) is
          // NOT skipped any more — it still runs the co-occupant path below so
          // a sequential later block (Tyler: Truck 5-8:30 → Breader 8:30-11)
          // can join it. Only the CHAIN is skipped for a taken cell.
          const cellTaken = !openCell(st, k);

          // STRICT: only people whose block job names THIS station. A
          // Boards-2 person must not spill onto Biscuits/Eggs just because
          // both live in SECONDARY. Anyone left over is picked up by the
          // section pass (Pass 1) or the fallback (Pass 2).
          // lockAllows keeps a locked person (Juana) off non-locked stations.
          const pool = cands.filter(
            (c) => free(c) && lockAllows(c.p, st) && stationMatchesJobBOH(st.role, c.b.job)
          );
          if (!pool.length) return;

          /* ---- CHAIN COVER (ported from FOHAutoAssign's greedyCover) ----
             This used to take ONE winner per station and silently drop every
             other block that named it. Real case: Juana is Breader 5:45-11 and
             Tyler is Truck 5-8:30 then Breader 8:30-11. Juana won the Breader
             breakfast cell, Tyler's second block evaporated — and because he
             was already "placed" on Truck, `unplaced` stayed empty and no gap
             fired. Invisible.

             Now the cell is TILED. Walk a cursor across the station's window;
             at each step take the candidate who is on the clock at the cursor
             and reaches FURTHEST (fewest handoffs, longest opener). First
             person renders plain, each takeover renders "→Name 8:30" — the
             same shape FOH already uses ("Maria →Hanna 6").

             Everything above is untouched: `pool` is still strict job-match +
             lockAllows + free(), so nobody lands on a station they aren't
             coded for and Juana still can't drift off Breader. Rotation still
             picks who STARTS the cell at midday. When one person covers the
             whole window this produces exactly the old single-name result. */
          const W = stationWindow(st, k);
          if (!W) return;

          // Midday (11-5): among people who all match this station, rotate —
          // prefer someone who hasn't worked it yet today. The schedule picks
          // the job; rotation picks which of that job's stations. Applied as
          // the opener preference, below coverage.
          const rotate = isMidday(k);

          const chosen = [];
          const used = new Set();
          // A cell already written keeps its occupant; we only append below.
          let cursor = cellTaken ? W.end : W.start;
          while (cursor < W.end - 0.001) {
            const here = pool.filter((c) => {
              if (used.has(c.pi)) return false;
              const s = Math.max(c.b.start, W.start);
              const e = Math.min(c.b.end, W.end);
              if (!(s <= cursor + 0.001 && e > cursor + 0.001)) return false;
              return !conflictsWith(c.p, k, { start: cursor, end: e });
            });
            if (!here.length) {
              // Nobody on the clock at the cursor — skip to the next block that
              // starts later, leaving the hole unstaffed rather than blanking
              // the whole cell (matches FOH's behaviour).
              const later = pool
                .filter((c) => !used.has(c.pi) && Math.max(c.b.start, W.start) > cursor + 0.001)
                .map((c) => Math.max(c.b.start, W.start));
              if (!later.length) break;
              cursor = Math.min(Math.min(...later), W.end);
              continue;
            }
            /* ★★ IN-TIMES FIRST — same rule as the FOH engine, same reason.
               Matt, Aug 4 2026: "Priority is in times and closing times etc..
               leaders then fill the other spots by job skill". Somebody whose
               shift starts at this cursor is the right body for this slot: they
               are not needed anywhere earlier, and taking them leaves the people
               who clocked in before them free for the stations that opened
               before this one.
               ⚠️ A 6-MINUTE window. 15 was the first attempt and it is exactly
               the gap between 11:00 and 11:15, so an 11:00 body counted as
               starting now at an 11:15 station and the rule did nothing. Caught
               by the test, not by reading it.
               ⚠️ Costs no coverage. Everyone in `here` already covers the cursor,
               so this only picks WHICH valid body. Reach-furthest ranks straight
               after, so closing coverage and fewest-handoffs are untouched. */
            const startsNow = (c) => Math.abs(c.b.start - cursor) < 0.1;
            here.sort(
              (a, b) =>
                ((startsNow(b) ? 1 : 0) - (startsNow(a) ? 1 : 0)) ||
                (Math.min(b.b.end, W.end) - Math.min(a.b.end, W.end)) ||
                (skillAt(b.p, k) - skillAt(a.p, k)) ||
                (rotate && !chosen.length
                  ? (hasWorkedStation(a.p, st) ? 1 : 0) - (hasWorkedStation(b.p, st) ? 1 : 0)
                  : 0)
            );
            const pick = here[0];
            const segEnd = Math.min(pick.b.end, W.end);
            chosen.push({ c: pick, start: cursor, end: segEnd });
            used.add(pick.pi);
            cursor = segEnd;
          }
          if (!chosen.length && !cellTaken) return;

          /* ---- CO-OCCUPANTS ----
             The chain above tiles the window with ONE person at a time. But a
             station can legitimately carry a second scheduled body: Juana is
             Breader 5:45-11 (locked) and Tyler is Truck 5-8:30 then Breader
             8:30-11. Tyler isn't taking over from Juana — his Truck shift ends
             at 8:30 and his Breader shift starts at 8:30, so he JOINS her.
             Matt: "Tyler truck and in the breader box @8:30."
             Anyone still holding an unused, job-matched, time-free block for
             this station is appended as "/ Name @8:30". They claim only their
             own slice, so a later block of theirs elsewhere still lands. */
          const extras = !allowExtras ? [] : pool.filter(
            (c) => {
              const sibs = jobBlocksInPeriod(c.p, k);
              if (sibs.length < 2) return false;               // not a mover
              if (c.b.start <= Math.min(...sibs.map((b) => b.start)) + 0.001) return false;
              return (
              !used.has(c.pi) &&
              !blockUsed.has(c.pi + "|" + c.bi) &&
              Math.min(c.b.end, W.end) > Math.max(c.b.start, W.start) + 0.001 &&
              !conflictsWith(c.p, k, {
                start: Math.max(c.b.start, W.start),
                end: Math.min(c.b.end, W.end),
              }));
            }
          );

          // Write the chain. The FIRST person keeps the existing "@8:30"
          // suffix rule (their own later-block-of-a-sequential-pair marker);
          // every takeover after them renders "→Name <time>".
          let text = cellTaken ? (st[k] || "").trim() : "";
          chosen.forEach((seg, i) => {
            const c = seg.c;
            if (i === 0) {
              const sibs = jobBlocksInPeriod(c.p, k);
              const earliest = Math.min(...sibs.map((b) => b.start));
              const suffix =
                sibs.length >= 2 && c.b.start > earliest + 0.001
                  ? " @" + fmtClockShort(c.b.start)
                  : "";
              text = lbl(c.p) + suffix;
            } else {
              text += " →" + lbl(c.p) + " " + fmtClockShort(seg.start);
            }
            // Claim only the slice this person actually holds, so a later
            // block of theirs elsewhere in the period still passes free().
            place(st, k, c.p, { start: seg.start, end: seg.end });
            track(c.p);
            blockUsed.add(c.pi + "|" + c.bi);
          });
          extras.forEach((c) => {
            const s = Math.max(c.b.start, W.start);
            const e = Math.min(c.b.end, W.end);
            text += " / " + lbl(c.p) + " @" + fmtClockShort(s);
            place(st, k, c.p, { start: s, end: e });
            track(c.p);
            blockUsed.add(c.pi + "|" + c.bi);
          });
          st[k] = text;
        });
        });
      });
    }

    /* ---- Pass 1 — section match for whoever Pass 0 didn't place (people
       with no block job, or whose section was already full). Skill-based:
       strongest person onto the hardest open station. LEADERSHIP sections
       are skipped — those rows belong to Pass 3. */
    sections.forEach((sec) => {
      if (isLeadershipSection(sec)) return;

      const candidates = people
        .filter((p) => {
          // Was `isBusy(p, k)` — "has ANY interval placed this period" — which
          // locked out anyone whose earlier block already landed, even when
          // their later block is at a completely different time. Tyler runs
          // Truck 5-8:30 then Breader 8:30-11: Truck placed him, isBusy went
          // true, and his Breader block could never reach the open
          // Loader/Filter/Thaw (8:30-2) sitting blank beside it. He still
          // counted as `placed` (he's on Truck), so nothing flagged it.
          // Now gate on TIME: only skip when this period's remaining block
          // actually overlaps something already placed for them. Someone with
          // no distinct later block behaves exactly as before, because their
          // presence window IS what got claimed.
          const b = blockForPeriod(p, k);
          const per = PERIOD_HOURS[k];
          const iv = b
            ? { start: Math.max(b.start, per.start), end: Math.min(b.end, per.end) }
            : { start: per.start, end: per.end };
          if (iv.end <= iv.start + 0.001) return false;
          if (conflictsWith(p, k, iv)) return false;
          if (!periodsCovered(p.ranges).has(k)) return false;
          // Section for THIS period's block, falling back to the primary job.
          const targetName =
            mapJobToSection(jobForPeriod(p, k)) || p.section || mapJobToSection(p.job);
          return targetName === sec.name;
        })
        .sort((a, b) => skillAt(b, k) - skillAt(a, k));

      const openStations = (sec.stations || [])
        .filter((s) => openCell(s, k) && !isProtected(s))
        .sort((a, b) => stationHardness(b.role) - stationHardness(a.role));

      const used = new Set();
      openStations.forEach((st) => {
        const eligible = candidates.filter(
          (x) => !used.has(x.name) && !isBusy(x, k) && lockAllows(x, st) && personCoversStation(x, st, k)
        );
        // Midday: rotation over skill for these unscheduled fills.
        const p =
          (isMidday(k) ? eligible.find((x) => !hasWorkedStation(x, st)) : null) ||
          eligible[0];
        if (p) { place(st, k, p); track(p); used.add(p.name); }
      });
    });

    /* ---- Pass 2 — fallback fill: anything still open in ANY section,
       filled by any available BOH person whose hours cover that station.
       PROTECTED rows are skipped. */
    allStations
      .slice()
      .sort((a, b) => stationHardness(b.role) - stationHardness(a.role))
      .forEach((st) => {
        if (isProtected(st)) return;
        if (!openCell(st, k)) return;
        const p = people
          .filter(
            (x) =>
              !isBusy(x, k) &&
              lockAllows(x, st) &&
              !isLeadershipJob(jobForPeriod(x, k)) && // leaders derive onto the leader rows only
              (mapJobToSection(jobForPeriod(x, k)) || x.section || mapJobToSection(x.job)) &&
              personCoversStation(x, st, k)
          )
          .sort((a, b) => skillAt(b, k) - skillAt(a, k))[0];
        if (p) { place(st, k, p); track(p); }
      });

    /* ---- Pass 3 — BOH LEADERSHIP, derived from who is on MACHINES.
       Runs LAST in the period, after every fill pass, because a Machines
       slot can be staffed by Pass 0, Pass 1, or the Pass 2 fallback —
       deriving earlier reads an empty cell and leaves a bare ✔️.
       One person on Machines → Kitchen Lead / DT. Two → higher skill takes
       DT, the other takes FC. Leader rows carry a ✔️ in the template, so a
       lone ✔️ counts as fillable and becomes "✔️ Name".
       Cell values may carry an "@8:30" suffix (sequential blocks) — strip
       it before matching the name back to a person. */
    {
      const machinesSec = sections.find((s) => /machine/i.test(s.name));
      const leadRows = allStations.filter((s) => /kitchen lead|\/ dt\b/i.test(s.role) && !isADRow(s.role));
      const mgrRows = allStations.filter((s) => /kitchen manager|\/ fc\b/i.test(s.role) && !isADRow(s.role));
      const leaderOpen = (st) => {
        const v = (st[k] || "").trim();
        return v === "" || v === "✔️" || v === "✔";
      };
      const writeLeader = (st, p) => { st[k] = "✔️" + lbl(p); };

      if (machinesSec) {
        const onMachines = [];
        const seenOnMachines = new Set();
        (machinesSec.stations || []).forEach((st) => {
          const v = (st[k] || "").trim();
          if (!v || v === "❌" || v === "✔️" || v === "✔") return;
          /* ⚠️ A MACHINES CELL CAN HOLD MORE THAN ONE NAME, AND THIS ONLY READ
             THE SIMPLE FORM. It stripped an "@8:30" suffix and nothing else, so
             the two shapes this very engine WRITES both failed to match anybody:
               "Maria →Hanna 6"      a handoff  (see the chain-cover pass)
               "Juana / Tyler @8:30" a co-occupant
             Those cells resolved to no person at all, so a Machines row that
             was genuinely staffed contributed nobody, and the Kitchen Lead and
             Kitchen Manager rows were left blank on exactly the busy days when
             a station gets handed over. Split on the separators first, then
             strip the time off each part — "Hanna 6" and "Tyler @8:30" are both
             a name plus a clock. */
          v.split(/[→/]/).forEach((part) => {
            const nameOnly = part
              .replace(/✔️|✔/g, "")
              .replace(/\s*@.*$/, "")            // "@8:30"
              .replace(/\s+\d{1,2}(:\d{2})?\s*$/, "")  // trailing takeover time
              .trim();
            if (!nameOnly) return;
            const person = people.find((x) => lbl(x) === nameOnly);
            /* ⚠️ De-duplicated. The same person can legitimately appear on two
               Machines stations in one period, and without this they filled
               BOTH leadership rows — the board then showed one human as Kitchen
               Lead and Kitchen Manager at the same time. */
            if (person && !seenOnMachines.has(person.name)) {
              seenOnMachines.add(person.name);
              onMachines.push(person);
            }
          });
        });
        onMachines.sort((a, b) => skillAt(b, k) - skillAt(a, k));

        if (onMachines.length >= 1) {
          leadRows.forEach((st) => { if (leaderOpen(st)) writeLeader(st, onMachines[0]); });
        }
        if (onMachines.length >= 2) {
          mgrRows.forEach((st) => { if (leaderOpen(st)) writeLeader(st, onMachines[1]); });
        }
      }
    }
    /* ---- Pass 4 — SECONDARY FRY COVERAGE. "Pls have Secondary Fry open
       @11!!!" — when Hash/S Fry is open this period but no fry-coded person
       was left to staff it (one fry person per day covers Hash/P Fry), the
       FOH LEAD — the Machines 4,5 / Grills person, the Kitchen Manager side —
       covers it. Written as "✔️Name" like the other coverage rows; it never
       consumes the person, who keeps their Machines station. Weekday
       templates lock this cell ("split duties"), so by construction this
       only fires where the template leaves it open: Fri/Sat lunch. */
    {
      const sFry = allStations.find(
        (s) => /hash\s*\/\s*s\s*fry|hash\/s\s*fry/i.test(s.role) && !/cookie/i.test(s.role)
      );
      if (sFry && stationOpenAt(sFry, k) && openCell(sFry, k)) {
        const m45 = allStations.find((s) => /machines\s*4\s*,\s*5|foh\s*lead/i.test(s.role));
        const v = m45 ? (m45[k] || "").trim() : "";
        if (v && v !== "❌" && !v.includes("✔")) {
          const nameOnly = v.replace(/\s*@.*$/, ""); // strip "@8:30" suffix
          const person = people.find((x) => lbl(x) === nameOnly);
          // Reads like the weekday sheet convention: covering it is a split
          // duty alongside their Machines station.
          if (person) sFry[k] = "✔️" + lbl(person) + " · split duties";
        }
      }
    }
  });

  /* AD SENIORITY DISPLAY — informational only. For each period, of the
     AD-eligible people on the clock, show ONE name:
       • one on shift → them
       • more than one → higher job skill wins
       • skill tie → seniority: Lizbeth → Lupe → Adriana C
     The person shown KEEPS their regular station — this never consumes them
     and never counts as a placement. Manual entries always win. */
  {
    const adRows = allStations.filter((s) => isADRow(s.role));
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
           is only 1").
           This wrote `top` — the single best match — into EVERY row. With two
           rows and one leader on the clock, the board showed that leader
           standing in two places at once, which is not a schedule, it is a
           duplicate. A leader reading it either believes there are two of them
           or stops trusting the board.
           ⇒ Nth person to the Nth row, in the order they were already ranked, so
           the strongest still lands on the first row. Run out of people and the
           remaining rows stay EMPTY, which is the honest answer: nobody is on
           it. Empty is a gap somebody can fill; a duplicate hides one. */
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
     only, never consumes anyone, manual entries always win. Anchored to the
     bare "Director" row, so "Assistant Director" can never match. Blank when
     no Director is on the clock, which is honest. */
  {
    const dirRows = allStations.filter((s) => /^\s*director\s*$/i.test(s.role || ""));
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

  /* ---- GAP SWEEP (once, after every pass) ------------------------------
     An uncovered BOH station used to be a blank cell with no explanation:
     "Breader lunch is empty" instead of "Breader lunch: nobody was scheduled
     and free". FOH has said so since July; this is the BOH half.

     ⚠️ RUN ONCE, AT THE END, AGAINST THE FINAL BOARD. `sections` is
     `next.sections` and every pass mutates it in place, so reading it here
     reads the finished day. That placement is the whole correctness argument:
     Pass 0's chain-cover knows where its own holes are, and collecting them
     THERE looks tempting and is wrong — it runs twice per cell (the
     `[false, true]` allowExtras phases) and Passes 1 through 4 go on to fill
     cells afterwards, so it would report holes that were filled seconds later
     and cry wolf on a board that is actually staffed.

     ⚠️ WHAT THIS DETECTS: a cell that is open per the template and ended the
     run with NOBODY on it. It does NOT detect partial cover — a station
     staffed 11-1 of a 11-2 window reads as covered here, where FOH would flag
     the missing hour. FOH can be finer because it tracks covered intervals as
     it commits them (`coverage` / `subtractCovered`); BOH has no such
     subsystem and does not need one to answer the question actually being
     asked. Deliberately the smaller true thing: every gap reported here is
     real, which is what makes the banner worth trusting. Partial cover is a
     later layer, and it needs interval tracking added to every write site.

     ⚠️ "EMPTY" MEANS EMPTY, NOT "NO NAME". A BOH cell holds four different
     things and only one of them is a hole. `openCell` gets this right because
     it tests the raw string, so this is a note for whoever edits it next:
       • a name        → staffed, obviously not a gap
       • `❌`          → deliberately NOT staffed. Flagging it would put a red
                         banner on a board that is exactly as intended, which
                         is the fastest way to teach leaders to ignore it.
       • a bare `✔️`   → renders a fallback name on screen, so the leader is
                         not looking at nothing. Treated as covered here.
       • `""`          → the actual reported complaint: a blank cell with no
                         explanation. This, and only this, is a gap.
     Verified against the real stored board (2026-08-03 Monday), which carries
     all four states. */
  const gaps = [];
  sections.forEach((sec) =>
    (sec.stations || []).forEach((st) =>
      SHIFT_KEYS.forEach((k) => {
        /* ⚠️ ONLY SWEEP ROWS THE ENGINE ACTUALLY TRIES TO FILL.
           🐛 First real import, Aug 2 2026: this reported "14 uncovered" on a
           Monday board where all 25 BOH people placed and every real station
           was staffed. All 14 were PROTECTED rows — Director, the two
           Assistant Director rows, TRAINING and TRAINER. Those are display
           and edit-only rows that no fill pass is allowed to touch (see
           PROTECTED ROWS above), so empty is their NORMAL state, every day.
           14 of 14 were noise, and a banner that is wrong every time is worse
           than no banner: it trains leaders to scroll past the one day it is
           right. The rule is the engine's own: if no pass may fill it, an
           empty cell is not a staffing hole. */
        /* ⚠️ Uses `isProtected`, the SAME predicate the fill passes gate on
           (:675 and the pass filters above). This started life as the three
           separate tests spelled out inline, which is two definitions of one
           rule and the exact way they drift apart. Changing that one helper
           now changes the passes and this sweep together. */
        if (isProtected(st)) return;
        const W = stationWindow(st, k);
        if (!W) return;                 // station is closed this period
        if (!openCell(st, k)) return;   // somebody is on it
        gaps.push({
          role: st.role,
          period: k,
          opensAt: fmtClockShort(W.start),
          from: fmtClockShort(W.start),
          to: fmtClockShort(W.end),
        });
      })
    )
  );

  const placed = [...placedSet];
  const unplaced = people.filter((p) => !placedSet.has(p.name)).map((p) => p.name);
  return { data: next, placed, unplaced, gaps };
}
