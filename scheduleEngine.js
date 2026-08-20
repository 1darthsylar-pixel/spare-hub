/* ══════════════════════════════════════════════════════════════════════════
   scheduleEngine.js — BUILDS A WEEK. Step 2 of the scheduling platform.

   ★ NEAR-LEAF. Pure functions, no storage, no UI, no React — exactly the shape
   FOHAutoAssign.js already holds, and for the same reason: this has to be
   runnable from the Worker as well as the browser.

   ⚠️ IT IMPORTS THREE THINGS, AND THE LIST IS KEPT CURRENT HERE ON PURPOSE.
   (This block has been wrong twice: it once said "availability.js and NOTHING
   ELSE" with two more imports underneath, and it later listed FOHAutoAssign
   after that import had become dead. Corrected both times rather than deleted —
   a header that misstates a file's dependencies is exactly what somebody trusts
   when they decide an import is safe to add.)
       availability.js  the stored shapes and the three-state day reader
       timeOff.js       approved days off, a strict leaf importing nothing
       jobCodes.js      which side a job is, and which codes mean leading
   ⚠️ `isBohJob` IS NO LONGER IMPORTED HERE. jobCodes.js owns that fallback now,
   so this file asks `sideOf` and never the regex directly. One definition of
   "is this kitchen work" still, one step further away.
   Every one of those bottoms out in modules that import nothing or import only
   storeConfig/nameMatch/shiftHours, so the graph stays a DAG and cyclecheck
   proves it on every run. Nothing React and nothing from store.js, ever.

   ────────────────────────────────────────────────────────────────────────
   WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
   ────────────────────────────────────────────────────────────────────────
   IT DOES: decide WHO WORKS WHAT HOURS on a given day. A shift, per person.
   IT DOES NOT: decide who stands where. That is FOHAutoAssign/BOHAutoAssign,
   it already works, it runs on the day, and this must not duplicate it.

   That split is the whole design and it matches how the store already runs:
   HotSchedules made shifts, the board placed people. This replaces the first
   half only, so the half that works keeps working (rule 16).

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ MINUTES FROM MIDNIGHT EVERYWHERE. Same units as availability.js and as
   `storeCfg("stations.*")[day][n].hours`, so no conversion happens in here at
   all. See the units warning at the top of availability.js.
   ────────────────────────────────────────────────────────────────────────

   HOW THE NEED IS WORKED OUT — and this is the part worth arguing with.

   A station's posted hours ARE the demand. If WINDOW is open 6:00am to 11:00pm
   then somebody has to be on it for those seventeen hours, and the board will
   show a blank cell if nobody is. So the need curve is simply: at each moment,
   how many stations are open. Measured against the real config, Gate City's
   Monday peaks at 16 concurrent FOH stations at 11:15am and 12 BOH at 11:00am.

   ⚠️ STATIONS WITH `hours: null` ARE NOT COUNTED. They are positions that open
   on demand rather than on a posted window — MOBILE BAGGER, INSIDE EXPO, MOBILE
   DRINKS/DESSERTS, the secondary fry — filled from whoever is already on the
   clock, not extra bodies to hire for the day.

   ⚠️ THIS NOTE USED TO SAY "seven on FOH and six on BOH — TRAINER, TRAINING,
   the DIRECTOR and ASSISTANT DIRECTOR rows" AND THOSE ARE GONE (Aug 14 2026).
   Matt: "Remove the assistant director and director boxes... Get rid of
   training and trainer boxes and notate on the setup and schedule." Sixty rows
   across the week that were never places to stand — they said something about a
   PERSON and were printed as if they were a station. Who is directing is now a
   badge on whatever box that person is standing in. Corrected rather than
   deleted, because a stale count in a header is what the next reader trusts:
   three on FOH and one on BOH carry `hours: null` now.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ IT REMOVES SLACK TO REACH THE BUDGET. IT NEVER CUTS INTO COVERAGE.
   ────────────────────────────────────────────────────────────────────────
   (This block said "IT DOES NOT QUIETLY TRIM TO FIT" until Aug 13 2026 and is
   corrected rather than deleted, because a stale warning is what the next
   reader trusts. The reasoning below is unchanged; what changed is that there
   turned out to be a third option nobody had separated out.)

   The labor budget comes from laborEngine (`dayBudget`). When the stations need
   more hours than the budget allows there is still no arithmetic that resolves
   it — somebody has to decide whether to run a station short or spend the
   hours, and cutting the tail off the day would produce a schedule that looks
   complete and leaves the close uncovered.

   ⇒ BUT NOT EVERY HOUR OVER BUDGET IS A COVERED HOUR. A day can carry SLACK:
   quarter hours where more bodies are on than there are stations open, mostly
   from stretching a short placement up to `minShift` and from hand-kept shifts.
   Those hours were never asked for by anything. `trimToBudget` removes them,
   and only them: it re-reads `staffed[t] > need[t]` before every single cut, so
   opening a gap is not a risk it manages — it is arithmetically impossible.

   ⇒ WHEN THE SLACK RUNS OUT AND THE DAY IS STILL OVER, IT STOPS. Matt chose
   that (Aug 13 2026) over cutting into coverage. `hours`, `budget` and
   `overBudget` all still come back, `trimmedHours` says what was taken, and
   `outOfSlack` says the rest is a decision for a human. Design rule 1 — fail
   loudly rather than store something wrong.

   ⚠️ AND AN UNCOVERED SLOT IS RETURNED, NEVER HIDDEN. `gaps` is the list of
   [start,end) spans where the need was not met and nobody was left who could
   work it. FOHAutoAssign already earns its keep this way and the board renders
   its gaps in red. A blank the leader can see is a staffing hole; a blank
   nobody mentions is a bug.
   ══════════════════════════════════════════════════════════════════════════ */

import { dayState, windowsFor, isOffFloor, MIN_PER_DAY } from "./availability.js";
/* Strict leaf, imports nothing. Approved time off has to be read while the week
   is decided, not filtered out afterwards: a person removed after the fact
   leaves the shift they would have taken uncovered and unmentioned. */
import { offIdsByDate } from "./timeOff.js";
/* ⚠️ A STORE'S OWN JOB CODES BEAT THE REGEX. `sideOf` and `isLeaderCode` answer
   from what the store typed and fall back to `isBohJob` / the word "lead" only
   for a code nobody has classified, so nothing that worked before changes. */
import { codeIndex, sideOf, isLeaderCode } from "./jobCodes.js";
import { isTrainingPlacement, priorityRank, readTraining } from "./trainingPriorities.js";
/* ⚠️ ONE FUNCTION ONLY, and it returns plain numbers. The rules record, the
   school calendar and every "is school in" question stay on the other side of
   it, so this engine can still be run against a hand-written map of limits. */
import { dayLimitsByPerson } from "./minorRules.js";

/* Fifteen minutes. Every posted station hour in the config lands on a quarter
   hour (checked: 315, 345, 360, 510, 660, 675, 840, 1020, 1200, 1320, 1380), so
   a finer grid buys nothing and a coarser one would round a 6:15 open to 6:00
   and put somebody on the clock fifteen minutes early, every day, for ever. */
/* ⚠️ ONE DEFINITION, IN THE LEAF, because THREE files now need it: the tile
   that writes a week, the board that reads one, and anything later that
   publishes. Keyed to the Monday exactly like the board's own week keys
   (`gcfcr-dailysetup-{side}-v2-{MondayISO}-auto`), so the two line up on sight.
   A second copy of this string is a schedule saved where nothing looks. */
export const scheduleKey = (mondayIso) => `gcfcr-schedule-v1-${mondayIso}`;

/* The Monday of whatever week a date falls in, and that week's schedule key.
   ⚠️ ONE DEFINITION. ScheduleBuilder needs the Date (for its week picker) and
   the Availability tile needs only the key, so both live here rather than one
   being copied into the other — a second `mondayOf` that disagreed by a day
   would have one screen reading a week the other never wrote.
   ⚠️ LOCAL GETTERS, NEVER `toISOString()`. That returns UTC, which after 8pm
   here is already tomorrow, so "this week" would flip a day early every
   evening. Same trap timeOff.js avoids by never building a Date at all. */
export function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();                      // 0 = Sunday
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}
export const localIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const weekKeyFor = (date) => scheduleKey(localIso(mondayOf(date)));

export const SIDE_ORDER = ["BOH", "FOH"];
export const SLOT = 15;
const slotOf = (min) => Math.floor(min / SLOT);
const SLOTS = MIN_PER_DAY / SLOT;

export const DEFAULT_RULES = {
  minShift: 180,       // 3 hours. Nobody comes in for less.
  maxShift: 480,       // 8 hours.
  maxWeekHours: 40,    // over this and it is overtime, which is a decision.
  minorMaxShift: 300,  // 5 hours. See the note on `minor` below.

  /* ★ TWO STORE RULES THE ENGINE NEVER BREAKS BUT A HAND EDIT CAN.
     `maxShift` above already caps what this engine BUILDS at 8 hours, so
     neither of these can fire on a generated week. They exist because a leader
     can type over the top of it, and until now nothing said so.

     maxDayHours  Matt, Aug 14 2026: "no more than 12 hrs", answering the
                  open question that had sat in CLAUDE.md since Aug 13 (a
                  hand-typed ten hour day raised nothing while a 48 hour week
                  did). His number, not a guess.

     minRestHours Matt, Aug 14 2026: "and no cloepening" — closing one night
                  and opening the next morning.
                  ⚠️ 10 IS MINE, NOT HIS, AND IT IS A SETTING FOR THAT REASON.
                  He named the pattern, not a number. Measured against his own
                  posted hours, a real clopening here is about six and a quarter
                  hours off — FOH runs to 11pm and the earliest leader row opens
                  at 5:15am — so anything under ten hours is unambiguously the
                  thing he means, and a straight eight would let a 3pm-11pm into
                  a 7am start through. Change this one number to move the line. */
  maxDayHours: 12,
  minRestHours: 10,
};

/* How many bodies are on in each quarter hour, counted from the shifts
   themselves. ★ MODULE LEVEL, rule 7. */
export function curveOf(shifts, first, last) {
  const staffed = new Array(SLOTS).fill(0);
  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    const a = Math.max(first == null ? 0 : first, slotOf(Math.max(0, Number(s.start) || 0)));
    const b = Math.min((last == null ? SLOTS - 1 : last) + 1, Math.ceil(Math.min(MIN_PER_DAY, Number(s.end) || 0) / SLOT));
    for (let t = a; t < b; t++) staffed[t]++;
  });
  return staffed;
}

/* ══════════════════════════════════════════════════════════════════════════
   TRIM THE SLACK TOWARD THE PLANNER'S BUDGET.

   Matt, Aug 13 2026: "I want this smart" and "adjust based on goals in the
   planner".

   ⚠️⚠️ THIS DOES NOT CUT TO HIT A NUMBER, AND THAT DISTINCTION IS THE WHOLE
   DESIGN. The header of this file already says it: over budget is SHOWN, never
   silently trimmed, because cutting hours to reach a target produces a schedule
   that looks finished and leaves the close uncovered.

   So this only ever removes a quarter hour where MORE BODIES ARE ON THAN THE
   STATIONS ASK FOR. `staffed[t] > need[t]` is checked before every single cut,
   which means opening a gap is not a risk to be careful about — it is
   arithmetically impossible. Slack is hours nobody ordered.

   ⇒ WHEN THE SLACK RUNS OUT BEFORE THE BUDGET IS MET, IT STOPS AND SAYS SO.
   Matt chose that over cutting into coverage. `outOfSlack` is how the screen
   knows to show the remaining gap as a decision for a human rather than as a
   failure of the build.

   Three things it will not touch:
     · a MANUAL shift — a leader typed that, and a rebuild already promises to
       keep hand edits. Trimming one would break the same promise more quietly.
     · a shift already at `minShift` — cutting below the minimum turns a real
       shift into a trip nobody would make, which is the rule the fill pass
       applies at the other end.
     · either edge whose slot is genuinely needed.

   ⚠️ IT TRIMS FROM THE ENDS ONLY, never the middle. A cut in the middle would
   split one shift into two and hand somebody a broken day to save fifteen
   minutes. A shift stays one contiguous block.

   ⚠️ IT TAKES FROM WHOEVER HAS THE MOST HOURS THIS WEEK. The alternative is
   taking from whoever happens to be first in the list, which over a week quietly
   concentrates cuts on the same few people. This also walks the week's biggest
   totals down first, which is the direction that keeps anybody off overtime.
   ══════════════════════════════════════════════════════════════════════════ */
export function trimToBudget({ shifts, need, budgetHours, rules, weekMin, first, last }) {
  const R = { ...DEFAULT_RULES, ...(rules || {}) };
  const out = (Array.isArray(shifts) ? shifts : []).map((s) => ({ ...s }));
  const budget = Number(budgetHours) || 0;
  const totalH = () => out.reduce((a, s) => a + (Number(s.end) - Number(s.start)), 0) / 60;
  const wk = weekMin || {};
  if (budget <= 0 || totalH() <= budget) {
    return { shifts: out, trimmedMin: 0, outOfSlack: false };
  }

  let trimmedMin = 0;
  /* Bounded so a bug cannot spin. One pass removes 15 minutes; a whole day of
     shifts is nowhere near this many quarter hours. */
  for (let guard = 0; guard < 4000 && totalH() > budget; guard++) {
    const staffed = curveOf(out, first, last);
    let best = null;
    out.forEach((s, i) => {
      if (s.manual) return;
      if (Number(s.end) - Number(s.start) <= R.minShift) return;
      const startSlot = slotOf(Number(s.start));
      const endSlot = Math.ceil(Number(s.end) / SLOT) - 1;
      [["end", endSlot], ["start", startSlot]].forEach((pair) => {
        const slot = pair[1];
        if (slot < 0 || slot >= SLOTS) return;
        if (staffed[slot] <= (need[slot] || 0)) return;   // needed; not slack
        const mins = wk[s.id] || 0;
        if (!best || mins > best.mins) best = { i, edge: pair[0], mins };
      });
    });
    if (!best) return { shifts: out, trimmedMin, outOfSlack: true };
    const s = out[best.i];
    if (best.edge === "end") s.end -= SLOT; else s.start += SLOT;
    s.trimmed = true;
    trimmedMin += SLOT;
    wk[s.id] = Math.max(0, (wk[s.id] || 0) - SLOT);
  }
  return { shifts: out, trimmedMin, outOfSlack: false };
}

/* Trim availability windows to an earliest start and a latest end.
   ★ MODULE LEVEL, outside every component and every other function, per rule 7.
   ⚠️ A NULL BOUND IS "NOT TYPED" AND CLAMPS NOTHING. Treating it as 0 or as
   1440 would either delete somebody's whole morning or silently do nothing,
   and only one of those is visible. Windows that survive with no time left in
   them are dropped, so the caller can see an empty list and say so. */
export function clampWindows(windows, earliest, latest) {
  const lo = earliest === null || earliest === undefined ? 0 : Number(earliest);
  const hi = latest === null || latest === undefined ? MIN_PER_DAY : Number(latest);
  return (Array.isArray(windows) ? windows : [])
    .map((w) => ({ start: Math.max(Number(w.start) || 0, lo), end: Math.min(Number(w.end) || 0, hi) }))
    .filter((w) => w.end > w.start);
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE STORE'S OWN CURVE AS A FLOOR UNDER THE STATION COUNT.

   Matt, Aug 14 2026: "i want the auto scheduler to learn from the uploaded
   weekly rosters how to assign shifts without any gaps", and "i want the
   scheduler to be smart and learn every week".

   The station count is a good demand signal and it is not the only one. It says
   how many positions are POSTED open; it cannot say that this store really runs
   three people at 5am and eleven at 5pm, which seven weeks of its own boards do
   say. Where the two disagree, the store has been right for years and the
   station list is a wish.

   ⚠️⚠️ A FLOOR, NEVER A REPLACEMENT, AND NEVER A CEILING. `Math.max` per slot:
     · the stations want more than history → the stations win, because a posted
       station with nobody on it is a visible hole on a printed board
     · history staffed more than the stations ask → history wins, because those
       bodies were really there and the gaps are where they are not
   Taking the learned curve alone would quietly stop staffing a station the
   store added last month, which nothing in the history knows about yet.

   ⚠️ IT ONLY APPLIES WHEN THE HISTORY CAN SPEAK. `learned.weeks` is how many
   REAL rosters an answer came from — 22 of the saved day-boards were never
   imported and carry an empty roster. One thin week is not a pattern, so
   `minWeeks` refuses below two and the engine builds exactly as it did before.

   ⚠️ AND IT IS CAPPED AT +`headroom` PER SLOT. A single catastrophic week — a
   grand opening, a fundraiser — should not teach the engine to staff every
   Tuesday like it. Two extra bodies is a nudge; unbounded is a different
   schedule. The cap is stated rather than tuned: raise it deliberately.

   ★ MODULE LEVEL AND PURE (rule 7), and it takes the LEARNED CURVE rather than
   the boards, so this file never learns to read a board. rosterLearning.js owns
   that and this owns what to do with the answer. */
export function needWithHistory(need, learned, { minWeeks = 2, headroom = 2 } = {}) {
  const base = Array.isArray(need) ? need : [];
  const curve = learned && Array.isArray(learned.coverage) ? learned.coverage : null;
  const weeks = Number(learned && learned.weeks) || 0;
  if (!curve || curve.length !== base.length || weeks < minWeeks) return base;
  return base.map((n, t) => {
    const want = Number(curve[t]) || 0;
    const have = Number(n) || 0;
    return want > have ? Math.min(want, have + headroom) : have;
  });
}

/* ── the need curve ──────────────────────────────────────────────────────
   stations → how many bodies are wanted in each quarter hour. */
export function needCurve(stations) {
  const need = new Array(SLOTS).fill(0);
  (Array.isArray(stations) ? stations : []).forEach((st) => {
    /* hours:null is a leader or training row — see the header. */
    if (!st || !Array.isArray(st.hours)) return;
    st.hours.forEach((h) => {
      const a = slotOf(Math.max(0, Number(h.start) || 0));
      const b = Math.ceil(Math.min(MIN_PER_DAY, Number(h.end) || 0) / SLOT);
      for (let t = a; t < b; t++) need[t]++;
    });
  });
  return need;
}

/* ⚠️ GUARDED, BECAUSE A MISSING `need` USED TO TAKE THE WHOLE TILE DOWN.
   `buildWeek` always writes one, so every week this build saves has it — but
   this reads a STORED record, and a stored record is whatever the build that
   wrote it produced. An unguarded `.reduce` on a key an older shape did not
   carry is a blank day view, not a missing number. Design rule 1: guard the
   read. Found Aug 14 2026 by driving the board in a browser with a hand-made
   week; no saved week in this store lacks it today. */
export const curveHours = (curve) =>
  (Array.isArray(curve) ? curve : []).reduce((a, b) => a + (Number(b) || 0), 0) * (SLOT / 60);

/* First and last slot the store needs anybody at all. */
export function curveBounds(need) {
  let first = -1, last = -1;
  for (let t = 0; t < SLOTS; t++) if (need[t] > 0) { if (first < 0) first = t; last = t; }
  return { first, last };
}

/* ── people ──────────────────────────────────────────────────────────────
   A candidate is one person's availability for ONE day, already resolved.
   Built by `candidatesFor` so the caller never hand-rolls this shape. */

export const rankOf = (v) =>
  v === "advanced" || v === "expert" || v === "trainer" ? 3
    : v === "intermediate" ? 2
      : v ? 1 : 0;

/* The skill somebody holds on ONE NAMED job code, 0 if they do not hold it. */
/* The best skill somebody holds on ANY code the store treats as leadership. */
export function leadRank(skills, index) {
  const rec = skills && typeof skills === "object" ? skills : null;
  const jobs = rec && rec.jobs && typeof rec.jobs === "object" ? rec.jobs : rec;
  if (!jobs) return 0;
  let best = 0;
  Object.keys(jobs).forEach((j) => {
    if (!isLeaderCode(j, index)) return;
    const r = rankOf(jobs[j]);
    if (r > best) best = r;
  });
  return best;
}

export function jobSkill(skills, jobName) {
  const rec = skills && typeof skills === "object" ? skills : null;
  const jobs = rec && rec.jobs && typeof rec.jobs === "object" ? rec.jobs : rec;
  if (!jobs) return 0;
  const want = String(jobName || "").toUpperCase();
  let best = 0;
  Object.keys(jobs).forEach((j) => {
    if (String(j).toUpperCase() !== want) return;
    const r = rankOf(jobs[j]);
    if (r > best) best = r;
  });
  return best;
}

/* The best skill this person holds ON ONE SIDE, and 0 if they hold none there.

   🐛 THE FIRST VERSION OF THIS COMPARED A PERSON'S JOB CODES AGAINST THE
   STATION NAMES and scheduled nobody at all — 70 of 100 people rejected on
   every day, zero shifts, the whole week a gap. STATION NAMES AND JOB CODES ARE
   TWO DIFFERENT VOCABULARIES and it is not obvious from either end. The board
   says WINDOW, DT TRADITIONAL, REGISTER 1, EXPO 2. HotSchedules certifies
   people on DRIVE THRU, BOARDS 1 SANDWICHES, BREADER. They overlap on maybe
   four words (BREADER, FRIES, PREP, MACHINES), which is just enough to look
   like it nearly works.
   ⇒ Which SIDE somebody can work is the only question this file needs, and
   `isBohJob` already answers it for the whole app.

   ⚠️ AN EMPTY SKILL MAP IS "UNKNOWN", NEVER "CAN DO ANYTHING". Somebody with
   no certifications imported is not auto-scheduled, because the other reading
   puts an untrained person on the Breader at 6am and finds out on the day.
   They come back in `unusable` so the screen can name them. */
export function bestSideJob(skills, side, index) {
  const rec = skills && typeof skills === "object" ? skills : null;
  const jobs = rec && rec.jobs && typeof rec.jobs === "object" ? rec.jobs : rec;
  if (!jobs) return { job: "", skill: "", rank: 0 };
  let out = { job: "", skill: "", rank: 0 };
  Object.keys(jobs).forEach((j) => {
    if (sideOf(j, index) !== side) return;
    const r = rankOf(jobs[j]);
    if (r > out.rank) out = { job: j, skill: String(jobs[j] || ""), rank: r };
  });
  return out;
}

export function sideSkill(skills, side, index) {
  return bestSideJob(skills, side, index).rank;
}

/* Turn the three stored maps into the day's candidate list.
     roster   [{id, name}]
     avail    the availability store's `people` map
     skills   the skills store's `people` map
     day      "Mon"
   Returns { candidates, unusable } and never guesses at a blank. */
export function candidatesFor({ roster, avail, skills, day, side, minors, rules, offIds, terminated, jobCodes, minorLimits }) {
  const R = { ...DEFAULT_RULES, ...(rules || {}) };
  const index = codeIndex(jobCodes);
  const off = offIds instanceof Set ? offIds : new Set();
  /* ⚠️ IDS ONLY. This engine deliberately knows nothing about HR: the caller
     resolves who has left and hands over a plain Set, so the maths stays
     testable and the HR read stays in one place. */
  const gone = terminated instanceof Set ? terminated : new Set();
  const candidates = [], unusable = [];

  (Array.isArray(roster) ? roster : []).forEach((m) => {
    if (!m || m.id == null || !m.name) return;
    const id = String(m.id);

    /* ⚠️⚠️ HAS THIS PERSON LEFT? CHECKED BEFORE ANYTHING ELSE.
       🐛 THE FIRST VERSION OF THIS ENGINE NEVER ASKED. It read the roster and
       the roster carries everybody, terminated included, so a person who no
       longer worked here could be scheduled onto next week and printed on a
       board. Nothing else in the chain would have caught it: they have real
       availability and real certifications on file, so they look exactly like
       somebody who still works here.
       ⚠️ SILENT IS NOT ACCEPTABLE EITHER — it is reported, so a leader can see
       WHY somebody they expected is missing, rather than assuming a bug. The
       board makes the same choice for a day already built (`setupHeadcount`
       reports departed names rather than deleting them); this is the same
       principle one step upstream, where the right answer is not to schedule
       them in the first place. */
    if (gone.has(id)) { unusable.push({ id, name: m.name, why: "no longer on the team" }); return; }

    /* ⚠️⚠️ APPROVED TIME OFF IS CHECKED NEXT, ABOVE AVAILABILITY, AND IT IS
       REPORTED RATHER THAN JUST SKIPPED. A day off has to beat a normal
       availability window — that is the entire point of asking for one — and a
       leader looking at a thin day has to be able to see WHY it is thin.
       Somebody quietly missing from a schedule is indistinguishable from a bug.
       ⚠️ ONLY APPROVED. A pending request does not remove anybody; see the
       header of timeOff.js for why, and `pendingInDates` for what the screen
       shows instead. */
    if (off.has(id)) { unusable.push({ id, name: m.name, why: "time off approved" }); return; }

    const rec = (avail || {})[id];

    /* ⚠️ NOT FLOOR STAFF. Checked here rather than by leaving their
       availability blank, because blank means "nobody has said" and this means
       "this person is never scheduled". Reported, so a director looking for
       somebody can see the answer instead of assuming the tool lost them.

       ⚠️⚠️ THE TITLE IS PART OF THE ANSWER NOW. Matt, Aug 14 2026: "remove
       everyone in sr leadership. just have the rest." Senior leadership is off
       the floor by default, and a tick on the person's own record still beats
       it in both directions. All of that precedence lives in `isOffFloor`; do
       not re-test a rank here.
       ⚠️ `m.role` MUST BE THE EFFECTIVE TITLE. `loadHRTeam` does not merge
       gcfcr-hr-roles, so the CALLER merges it before building. ScheduleBuilder
       does; anything else calling buildWeek has to as well or it will schedule
       somebody whose title was changed in HR Console. */
    if (isOffFloor(rec, m.role)) { unusable.push({ id, name: m.name, why: "not scheduled on the floor" }); return; }

    const st = dayState(rec, day);

    if (st === "unset") { unusable.push({ id, name: m.name, why: "no availability set" }); return; }
    if (st === "off") return;                       // a real answer; not a problem

    /* ⚠️ THE JOB CODE IS CARRIED, NOT JUST THE RANK. The board is fed job
       codes — its engines match a person to a station through them — so a
       schedule that stored only "skill 2" could not be published without
       looking the certification up a second time somewhere else. Keeping it
       here makes the saved week self-contained. */
    const bestJob = bestSideJob((skills || {})[id], side, index);
    const skill = bestJob.rank;
    if (!skill) { unusable.push({ id, name: m.name, why: "no skills for this side" }); return; }

    const raw = windowsFor(rec, day)
      .map((w) => ({ start: Number(w.start) || 0, end: Number(w.end) || 0 }))
      .filter((w) => w.end > w.start);
    if (!raw.length) return;

    /* ⚠️ A MINOR CAP IS APPLIED, NOT A LEGAL RULE. The Hub knows who is on the
       minors list because Daily Setup already keeps one for breaks. It does NOT
       know anybody's age, and the limits it applies are the ones a store TYPED
       on the Minor rules screen — nobody has verified them against any state.
       See the header of minorRules.js. Do not grow this into a compliance
       claim; the wording on every screen depends on it not being one. */
    const minor = !!(minors && minors.has && minors.has(id));

    /* ⚠️⚠️ AN ABSENT ENTRY MEANS "NOTHING TYPED", NOT "NO LIMIT". The caller
       leaves out anybody with no group and any group with nothing typed, so
       falling back to `minorMaxShift` here is the same behaviour this engine
       had before typed limits existed. */
    const lim = (minor && minorLimits && minorLimits[id]) || null;

    /* ⚠️ THE WINDOW IS NARROWED BEFORE THE GREEDY PASS RUNS, not trimmed after.
       A minor who may not work past 7pm should never be OFFERED the 8pm slot in
       the first place — trimming afterwards leaves the store short with nobody
       told why, which is the same failure the coverage gaps exist to surface. */
    const windows = lim ? clampWindows(raw, lim.earliest, lim.latest) : raw;
    if (!windows.length) {
      /* ⚠️ REPORTED, NEVER SILENT. Somebody who vanishes because their hours
         were clamped to nothing is indistinguishable from a bug. */
      unusable.push({ id, name: m.name, why: "their hours fall outside the minor limits typed for them" });
      return;
    }
    candidates.push({
      /* ⚠️ CARRIED FROM HERE SO POSITIONS CAN REFUSE TO FAKE A LEADER. See
         assignPositions — a leadership row filled by whoever happened to be
         free is the "plausible and wrong" failure this repo keeps writing
         rules about, and it reads perfectly normally on a printed board. */
      /* ⚠️ ANY code the store calls a leader code, not the single word
         "LEADERSHIP". Matt asked for FOH and DT leaders, and a store that has
         been tagging people with the older word must not lose them the day a
         finer code appears. */
      lead: leadRank((skills || {})[id], index),
      job: bestJob.job, skillWord: bestJob.skill, side,
      id, name: m.name, skill, windows, minor,
      maxShift: minor
        ? Math.min(R.maxShift, lim && lim.maxShift !== null ? lim.maxShift : R.minorMaxShift)
        : R.maxShift,
    });
  });

  return { candidates, unusable };
}

/* ── hours by daypart ────────────────────────────────────────────────────
   Splitting a day's shifts across breakfast / lunch / mid / night, so the money
   strip can say WHERE the labour is rather than only how much of it there is.

   ⚠️⚠️ THE DAYPARTS ARE IN DECIMAL HOURS AND EVERY SHIFT HERE IS IN MINUTES.
   `storeCfg("stations.dayparts")` reads `{ start: 10.5, end: 14 }`; a shift
   reads `{ start: 630, end: 840 }`. They are the same two instants written two
   ways, and this is the single most likely place in the subsystem to put 10.5
   next to 630 and get a number that looks plausible. Converted once, on entry.

   ⚠️ `night.end` IS null ON PURPOSE and must not be "completed". dayparts.js is
   explicit: the store's closing time is not the same every day and is not
   written down anywhere that file can trust, so anything measuring night takes
   its end from the real data. Here that is the latest shift end of the day. */
export function daypartHours(shifts, dayparts) {
  const list = Array.isArray(shifts) ? shifts : [];
  const parts = Array.isArray(dayparts) ? dayparts : [];
  const latest = list.reduce((m, s) => Math.max(m, Number(s.end) || 0), 0);
  const earliest = list.reduce((m, s) => Math.min(m, Number(s.start) || 0), 24 * 60);
  const out = {};
  parts.forEach((p, i) => {
    /* 🐛🐛 THE FIRST DAYPART ABSORBS ANYTHING EARLIER, AND WITHOUT THIS THE
       COLUMNS WERE SIX HOURS SHORT EVERY DAY. Breakfast starts at 6:00 in the
       config and the kitchen clocks in at 5:00, so every pre-6am hour fell
       outside all four windows and vanished from the strip — measured on the
       real week: 346.5 counted against 352.5 actually scheduled, on all six
       days. A labour strip whose columns do not add up to its own total is
       worse than no columns, because somebody will read the columns.
       ★ IT IS THE SAME RULE THE LAST DAYPART ALREADY HAD, pointed the other
       way. dayparts.js leaves `night.end` null and says to take the end from
       real data rather than guess a closing time; the start of the day is the
       same kind of fact, and 6:00 is a posted convention, not the moment work
       begins. Neither end is invented — both come from the shifts themselves. */
    const first = i === 0;
    const a = first
      ? Math.min(Math.round(Number(p.start) * 60), earliest)
      : Math.round(Number(p.start) * 60);
    const b = p.end == null ? Math.max(latest, a) : Math.round(Number(p.end) * 60);
    let mins = 0;
    list.forEach((s) => {
      const lo = Math.max(a, Number(s.start) || 0);
      const hi = Math.min(b, Number(s.end) || 0);
      if (hi > lo) mins += hi - lo;
    });
    out[p.key] = mins / 60;
  });
  return out;
}

/* Every shift a person holds on one day, as { id, hours }, which is the shape
   payRates.costOf takes. Kept here so no screen has to flatten a week by hand. */
export function personHours(shifts) {
  const by = new Map();
  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    if (!s || s.id == null) return;
    const id = String(s.id);
    by.set(id, (by.get(id) || 0) + Math.max(0, (Number(s.end) - Number(s.start)) / 60));
  });
  return [...by.entries()].map(([id, hours]) => ({ id, hours }));
}

/* ── the fill ────────────────────────────────────────────────────────────
   Greedy, earliest-need-first, longest-useful-shift. Same shape of algorithm
   the board's auto-assign already uses, deliberately: it is understandable at
   6am by somebody who did not write it, and every decision it makes can be
   pointed at on the screen. */

const canWorkAt = (c, slot) => {
  const m = slot * SLOT;
  return c.windows.some((w) => w.start <= m && w.end > m);
};
/* How far past `slot` this person can stay in one unbroken window. */
function runEnd(c, slot) {
  const m = slot * SLOT;
  const w = c.windows.find((x) => x.start <= m && x.end > m);
  return w ? slotOf(w.end) : slot;
}

/* Score a candidate for a slot that needs covering. Higher wins.
   ⚠️ COVERAGE BEATS EVERYTHING, THEN SKILL, THEN SPREADING THE HOURS. Anybody
   who can stay longer covers more of the shortfall with one body, which is what
   keeps the day from turning into a pile of three-hour shifts. */
function score(c, slot, state, R) {
  const reach = runEnd(c, slot) - slot;
  const worked = state.weekMin[c.id] || 0;
  return reach * 4 + c.skill * 3 - (worked / 60);
}

/* One day, one side. */
export function buildDay({ stations, candidates, budgetHours, rules, state, used, preplaced, learned }) {
  const R = { ...DEFAULT_RULES, ...(rules || {}) };
  const S = state || { weekMin: {} };
  /* ⚠️ THE FLOOR IS APPLIED ONCE, HERE, AND EVERYTHING DOWNSTREAM READS THE
     RESULT. `trimToBudget` re-reads `staffed[t] > need[t]` before every cut, so
     a curve raised after the trim would let the trim take back the very bodies
     history says are needed. */
  const need = needWithHistory(needCurve(stations), learned);
  const { first, last } = curveBounds(need);
  /* ⚠️ `let`, because the trim pass below returns a NEW array rather than
     mutating in place, and `staffed` is recounted from it. */
  let shifts = [];
  const gaps = [];

  if (first < 0) {
    return { shifts, gaps, need, staffed: need.slice(), hours: 0,
      budget: Number(budgetHours) || 0, overBudget: -(Number(budgetHours) || 0), unplaced: [] };
  }

  let staffed = new Array(SLOTS).fill(0);
  /* 🐛 SHARED ACROSS BOTH SIDES OF ONE DAY, AND IT HAS TO BE. When FOH and BOH
     each kept their own set, the first real run put Brandon on FOH 5:45am-1:45pm
     AND on BOH 5am-1pm on the same Monday. Both boards looked correctly staffed
     and one of them was a lie. The caller passes ONE set per day. */
  const takenToday = used instanceof Set ? used : new Set();

  /* ⚠️⚠️ SHIFTS A HUMAN TOUCHED ARE LAID DOWN FIRST AND THE MACHINE FILLS
     AROUND THEM. This is the whole reason "Build it again" is safe to press.

     The board next door has exactly this scar: an import "rebuilds the day and
     wipes leaders' manual board edits", which is why the deploy rules say never
     to ship an engine change mid-shift. A schedule that discarded a leader's
     own decisions every time somebody pressed Build would earn the same
     warning, and deserve it.

     ⇒ A kept shift does three things before the fill starts: it counts toward
     coverage, it takes that person off the market for the day, and its hours
     count toward their week. So the greedy pass sees the day as it really is
     and only fills what is genuinely still open. */
  const kept = (Array.isArray(preplaced) ? preplaced : []).filter(
    (p) => p && p.id != null && Number(p.end) > Number(p.start),
  );
  kept.forEach((p) => {
    const a = Math.max(first, slotOf(Number(p.start)));
    const b = Math.min(last + 1, Math.ceil(Number(p.end) / SLOT));
    for (let t = a; t < b; t++) staffed[t]++;
    takenToday.add(String(p.id));
    S.weekMin[String(p.id)] = (S.weekMin[String(p.id)] || 0) + (Number(p.end) - Number(p.start));
    shifts.push({ ...p, id: String(p.id), manual: true });
  });

  for (let t = first; t <= last; t++) {
    /* 🐛🐛 THE GAP MACHINE, FIXED. Ported from the origin store, Aug 20 2026.

       One line below used to say `takenToday.add(best.id)`, which READS as
       "stop offering this person" and MEANS "this person does not work today,
       on either side of the building". Every day ends with a stretch of demand
       shorter than a legal shift, so every day walked the entire remaining
       roster and burned it there.

       ⇒ Measured at the origin on its own Monday: 480 people in, 25 shifts
       out, 455 marked used with no shift at all, and the side that built
       second got an empty pool and produced NOTHING.

       ⇒ `triedHere` is PER START SLOT. Somebody refused for this start is
       offered the next one, and the other side still sees them. */
    const triedHere = new Set();
    while (staffed[t] < need[t]) {
      /* Everybody who could start here and is not already on. */
      const pool = candidates.filter(
        (c) => !takenToday.has(c.id) && !triedHere.has(c.id) && canWorkAt(c, t) &&
          ((S.weekMin[c.id] || 0) / 60) < R.maxWeekHours,
      );
      if (!pool.length) break;

      let best = pool[0], bestScore = score(pool[0], t, S, R);
      for (let i = 1; i < pool.length; i++) {
        const sc = score(pool[i], t, S, R);
        if (sc > bestScore) { best = pool[i]; bestScore = sc; }
      }

      /* Stay while the store still needs a body and they can still be here.
         🐛 THE WEEKLY CAP IS CLAMPED HERE, NOT ONLY TESTED IN THE POOL FILTER.
         The filter asks "are they under 40 hours yet", so somebody sitting on 38
         could still be handed a full 8 and finish the week on 46. Measured 41.5
         on FOH and 45.0 on BOH before this line existed. Overtime is a decision
         somebody makes on purpose, never a rounding error in a greedy loop. */
      const remainSlots = Math.max(0, (R.maxWeekHours * 60 - (S.weekMin[best.id] || 0)) / SLOT);
      const hardEnd = Math.min(runEnd(best, t), t + best.maxShift / SLOT, t + remainSlots, last + 1);
      let end = t;
      while (end < hardEnd && staffed[end] < need[end]) end++;

      /* ⚠️ TOO SHORT IS NOT WORTH A TRIP. Stretch to the minimum if their
         availability allows it — an extra hand early is harmless. If it still
         cannot reach the minimum, DO NOT schedule them: leave the slot short so
         it shows up as a gap somebody can look at. */
      const minSlots = R.minShift / SLOT;
      if (end - t < minSlots) end = Math.min(hardEnd, t + minSlots);
      if (end - t < minSlots) { triedHere.add(best.id); continue; }

      for (let x = t; x < end; x++) staffed[x]++;
      takenToday.add(best.id);
      S.weekMin[best.id] = (S.weekMin[best.id] || 0) + (end - t) * SLOT;
      shifts.push({
        id: best.id, name: best.name, skill: best.skill, minor: best.minor,
        job: best.job || "", skillWord: best.skillWord || "", side: best.side || "",
        lead: best.lead || 0, start: t * SLOT, end: end * SLOT,
      });
    }
  }

  /* ── trim the slack toward the planner's budget ────────────────────────
     Matt, Aug 13 2026: "I want this smart" and "adjust based on goals in the
     planner".
     ⚠️ ONLY SLACK. See trimToBudget — it will not touch a quarter hour the
     stations are asking for, so it cannot open a gap. When the slack runs out
     before the budget is met it STOPS and reports the difference, which is the
     answer Matt chose over cutting into coverage. */
  const trim = trimToBudget({
    shifts, need, budgetHours, rules: R, weekMin: S.weekMin, first, last,
  });
  shifts = trim.shifts;
  /* ⚠️ RECOUNT FROM THE TRIMMED SHIFTS. The gaps below are read off `staffed`,
     so reusing the pre-trim curve would report coverage the week no longer has
     — the exact "looks finished" failure this engine keeps warning about. */
  staffed = curveOf(shifts, first, last);

  /* Everywhere still short, merged into readable spans. */
  let open = -1;
  for (let t = first; t <= last + 1; t++) {
    const short = t <= last && staffed[t] < need[t];
    if (short && open < 0) open = t;
    if (!short && open >= 0) {
      gaps.push({ start: open * SLOT, end: t * SLOT, short: need[open] - staffed[open] });
      open = -1;
    }
  }

  const hours = shifts.reduce((a, s) => a + (s.end - s.start), 0) / 60;
  const budget = Number(budgetHours) || 0;
  shifts.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));

  return {
    shifts, gaps, need, staffed, hours, budget,
    overBudget: budget > 0 ? hours - budget : 0,
    /* What the trim did, so the screen can say it rather than a number simply
       being smaller than the leader expected. */
    trimmedHours: trim.trimmedMin / 60,
    outOfSlack: trim.outOfSlack,
    unplaced: candidates.filter((c) => !takenToday.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
  };
}

/* ── a whole week ────────────────────────────────────────────────────────
   `days` is [{ day: "Mon", iso: "2026-08-17", stations, budgetHours }].
   ⚠️ ONE `state` THREADS THROUGH ALL OF THEM, which is what makes the weekly
   hours cap and the hours-spreading tiebreak mean anything. Building each day
   in isolation would hand the same six people every shift. */
/* The board writes "Mon", rosterLearning keys on "Mon", and a caller handing
   over a full day name should still find its lesson rather than silently get
   none. One map, so the two spellings can never drift apart here. */
const SHORT_OF = Object.freeze({
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
  Thursday: "Thu", Friday: "Fri", Saturday: "Sat",
});

export function buildWeek({ days, roster, avail, skills, minors, rules, timeOff, terminated, keep, jobCodes, minorRules, school, learned }) {
  const state = { weekMin: {} };
  const out = {};
  /* One pass over the requests for the whole week rather than one per day. */
  const offByDate = offIdsByDate(timeOff, (Array.isArray(days) ? days : []).map((d) => d && d.iso));
  (Array.isArray(days) ? days : []).forEach((d) => {
    /* ⚠️ ONE SET PER DAY, SHARED BY BOTH SIDES. See the note in buildDay. */
    const takenToday = new Set();
    const sides = {};
    /* ⚠️ WORKED OUT PER DAY, BECAUSE THE ANSWER CHANGES PER DAY. A Tuesday in
       term and a Tuesday in July are different limits for the same person, and
       a Friday is a school DAY whose night is not a school night. All of that
       is decided in minorRules.js and arrives here as plain numbers. */
    const minorLimits = dayLimitsByPerson(minorRules, school, d.iso, minors);
    /* ⚠️ BOH IS BUILT FIRST AND THE ORDER IS NOT COSMETIC. Whichever side runs
       first gets first pick of anybody certified on both. Measured on the real
       roster: 56 to 61 people can work BOH and 76 to 78 can work FOH, so BOH is
       the scarcer pool and giving FOH first refusal leaves the kitchen short.
       Front of house also has more stations that anybody can be taught quickly. */
    SIDE_ORDER.forEach((side) => {
      const stations = d.sides && d.sides[side];
      if (!stations) return;
      const { candidates, unusable } = candidatesFor({
        roster, avail, skills, day: d.day, side, minors, rules, terminated, jobCodes,
        offIds: offByDate[d.iso], minorLimits,
      });
      sides[side] = {
        ...buildDay({
          stations, candidates, rules, state, used: takenToday,
          budgetHours: (d.budget || {})[side],
          /* `keep` is { Mon: { FOH: [shift], BOH: [shift] } } — whatever a
             leader edited by hand, per day and side. */
          preplaced: ((keep || {})[d.day] || {})[side],
          /* ★ WHAT THIS STORE REALLY STAFFS ON THIS WEEKDAY, from its own saved
             boards. `learned` is rosterLearning's answer, shaped
             { FOH: { Mon: {...} }, BOH: { ... } }. Absent, or thin, and buildDay
             builds exactly as it did before — see needWithHistory. */
          learned: ((learned || {})[side] || {})[SHORT_OF[d.day] || d.day],
        }),
        unusable,
      };
    });
    out[d.day] = { iso: d.iso, sides };
  });
  return { days: out, weekMinutes: { ...state.weekMin } };
}

/* ── positions ───────────────────────────────────────────────────────────
   WHO STANDS WHERE, once the shifts exist. Matt, Aug 13 2026: "i want to build
   in the positions like on the setup".

   ⚠️⚠️ A SECOND PASS OVER THE SHIFTS, NOT A REWRITE OF HOW THEY ARE DECIDED.
   The shift logic above is measured — 0 double bookings, nobody over 40 hours,
   77 people used across a real week — and folding stations into that loop would
   put both answers back in one place where neither could be checked on its own.
   So this takes the day's shifts as given and lays stations over them.

   ⚠️ THIS IS A PREVIEW, AND THE BOARD IS STILL THE BOARD. On the day,
   FOHAutoAssign and BOHAutoAssign do the real placement, with the store's own
   locks, leader rules, trainer spread and rotation. Those live in the engines
   and are not repeated here; duplicating them would give two answers to one
   question and the schedule would quietly disagree with the board. What this
   answers is the question you ask a WEEK out: is there a body on every station,
   or did I write a schedule with a hole in it.

   Same greedy time-cover shape the board engines use: earliest-opening station
   first, so the scarce early bodies land on the early stations. */
/* ⚠️ THIRD ARGUMENT, OPTIONAL, AND THE OLD BEHAVIOUR IS WHAT YOU GET WITHOUT
   IT. `history` is { load, memory } from boardHistory.js — how hard this store
   really works each station, and where each person really stands. A screen
   that has not loaded the saved boards passes nothing and gets exactly the
   fill this function has always done. Rule 1 applies to arguments too.

   ⇒ WHAT IT CHANGES, AND WHY EACH ONE IS A REAL FINDING RATHER THAN A TASTE:

   1. CORE STATIONS ARE FILLED FIRST. Measured on this store's own boards, 8
      front and 8 back stations are staffed in every daypart of every day and
      the rest run between 4% and 67%. Filling in open-time order alone meant a
      body could land on Hash/S Fry — staffed once in two weeks — while Primary
      Point went empty at the same minute.

   2. A HOLE ON A PEAK STATION IS NOT A HOLE. That is where "22 uncovered
      spans" came from on a week the store itself considered covered. Peak gaps
      still come back, in their own list, so nothing is hidden.

   3. ⚠️ MANUAL-ONLY ROWS ARE THE STORE'S OWN DECLARATION, NOT A STATISTIC, and
      this function ALREADY honoured it before any of this was written. Matt,
      Aug 13 2026: "Trainers and training are only for manual edits."
      `hours: null` on a station row is how this store says "not a posted
      position": TRAINER, TRAINING, MOBILE BAGGER, MOBILE DRINKS/DESSERTS,
      DIRECTOR, ASSISTANT DIRECTOR and Hash/S Fry all carry it, and the
      `Array.isArray(st.hours)` guard below has always dropped them.
      ⇒ So history does NOT get a vote on this. An earlier version of this
      block skipped a station measured at zero bodies, which was the same
      answer reached a second way — and two mechanisms for one fact drift.
      Worse, it would drift in the wrong direction: the moment a leader
      manually put somebody on Trainer, the measurement would flip and the
      engine would start rostering it. A row a human fills by hand must never
      become a row the machine fills by habit.

   4. AN ANCHOR GOES HOME. Ana stood on Bulk Prep in 22 of 22 cells; Hernan and
      Juana on Breader, 21 of 21. Placing them anywhere else is what made the
      built week not look like the store. Floaters are unaffected and are still
      chosen by reach and skill, which is right for them.

   ⚠️ MEMORY BREAKS TIES; IT NEVER OVERRIDES BEING FREE OR BEING ABLE. The pool
   is filtered exactly as before — on the clock, not already standing somewhere
   else, certified to lead where leading is needed — and only THEN is it
   ordered. A preference that could put an uncertified person on a leader row
   would be a much worse bug than a schedule that reads oddly. */
export function assignPositions(stations, shifts, history) {
  const onClock = (shifts || []).map((s) => ({ ...s, busy: [] }));
  const free = (p, a, b) =>
    p.start <= a && p.end >= b && !p.busy.some((x) => a < x.end && b > x.start);

  /* Every station block that needs a body, earliest open first. A station with
     hours:null is a leader or training row and is filled from whoever is on. */
  const load = (history && history.load) || null;
  const memory = (history && history.memory) || null;
  const tierOf = (name) => (load ? load.tierOf(name) : "");

  /* ── IS THIS PLACEMENT SOMEBODY LEARNING? ─────────────────────────────────
     Matt, Aug 14 2026: "can the schedule and setup auto fill the training
     positions for people when assigned to different ones?" And his own setup
     rule, from the sheet the priority list lives in: "Put people in positions
     they aren't as strong in to help them learn and get better."

     ⚠️⚠️ IT ONLY EVER MARKS. It changes nothing about who is chosen, and the
     `training` flag is added AFTER the pool has been filtered and the best
     candidate picked. Letting a training preference reach the choice would put
     the least experienced person on the station that needs one most, at peak,
     which is the opposite of the rule above.

     ⚠️ SILENT UNLESS THE STORE HAS TYPED A LIST. `priorityRank` answers 0 for
     anything unranked, so with no list nothing is ever marked and the engine
     behaves exactly as it did before this existed.

     ⚠️⚠️ AND SILENT WHEN WE DO NOT KNOW THE PERSON. `cellsOf` is checked before
     an empty history is read as "they have never done this". Zero cells means
     brand new, OR not rostered in the weeks handed in, OR — the one that bites
     — a board name the roster could not resolve between two people with the
     same first name. boardHistory refuses to guess there, and a training flag
     built on that silence would announce on a printed board that a veteran has
     never worked a register. A missing mark costs a hint; a wrong one is on the
     wall. `minCells` is the same idea, and the same default, as the anchor test
     in placementMemory. */
  const training = readTraining(history && history.training);
  const minCells = Number(history && history.minCells) || 6;
  const trainingFor = (id, station, side) => {
    if (!memory || !side) return null;
    const rank = priorityRank(training, side, station);
    if (!rank) return null;                       // the store never ranked it
    if (memory.cellsOf(id) < minCells) return null; // we do not know them yet
    if (!isTrainingPlacement(memory.rolesOf(id), station)) return null;
    return { training: true, priority: rank };
  };

  /* ★★ A LEADER STANDING SOMEWHERE THEY HAVE NEVER STOOD IS LEARNING IT, and
     the board has to say so. This is the other half of the leader-row rule
     above: when nobody who has run the row is on the clock, somebody certified
     still takes it — and the L on that cell is the difference between the tool
     making a considered choice and the tool making a mistake nobody can see.

     ⚠️ IT DOES NOT GO THROUGH `trainingFor`, deliberately. That one answers
     "is this on the store's TRAINING PRIORITY LIST", and leader rows are not on
     it — the list is stations to develop people onto, not the leadership rota.
     Routing this through it would have returned null every time and the flag
     would silently never appear.

     ⚠️ SAME `cellsOf` GUARD. Zero means the history cannot speak, not that they
     are new, so nothing is flagged from silence. */
  const leadLearning = (id, station) => {
    if (!memory) return null;
    if (memory.cellsOf(id) < minCells) return null;
    if (memory.rolesOf(id).includes(station)) return null;
    return { training: true };
  };

  const blocks = [];
  (Array.isArray(stations) ? stations : []).forEach((st) => {
    if (!st || !Array.isArray(st.hours)) return;
    const tier = tierOf(st.name);
    st.hours.forEach((h) => blocks.push({
      st, tier, start: Number(h.start) || 0, end: Number(h.end) || 0,
    }));
  });
  /* Core first, then peak, each in open-time order. Two passes rather than one
     weighted sort, so "a peak station never takes somebody a core station
     still needs" is a property of the order, not of a tuned number. */
  const rankOfTier = (t) => (t === "peak" ? 1 : 0);
  blocks.sort((a, b) =>
    rankOfTier(a.tier) - rankOfTier(b.tier) ||
    a.start - b.start ||
    (a.end - a.start) - (b.end - b.start));

  const filled = [], holes = [];
  blocks.forEach((b) => {
    let cursor = b.start;
    while (cursor < b.end) {
      /* Anybody on the clock now, not already standing somewhere else.
         Prefer the one who can hold it longest, then the strongest. */
      /* ⚠️ A LEADERSHIP ROW NEEDS SOMEBODY CERTIFIED TO LEAD. The store's
         LEADER DT, LEADER FC, DIRECTOR and ASSISTANT DIRECTOR rows carry real
         posted hours, so without this they were being handed to whichever team
         member happened to be free — a board that says a 16 year old is running
         Drive Thru at open, printed and believed. If nobody certified is on the
         clock it is reported as a hole, which is the true answer. */
      const needsLead = /leader|director/i.test(String(b.st.section || "")) ||
        /^leader|^director|^assistant director/i.test(String(b.st.name || ""));
      let pool = onClock.filter((p) =>
        free(p, cursor, Math.min(cursor + SLOT, b.end)) && (!needsLead || (p.lead || 0) > 0));

      /* ★★ AND ON A LEADER ROW, SOMEBODY WHO HAS ACTUALLY STOOD THERE.
         Matt, Aug 14 2026, reading a built board: "dont put people in leader
         positions whove never worked them. prioritize job skill."

         Holding a leadership job code says the store trusts them to lead. It
         does not say they have ever run THIS row — Drive Thru at open is not
         Front Counter at close — and the certification gate above cannot tell
         the two apart.

         ⚠️⚠️ IT NARROWS THE POOL, IT DOES NOT EMPTY IT. If nobody who has
         worked the row is on the clock, the row is filled anyway and MARKED as
         training rather than left blank. A leader row with the wrong name is
         what he asked me to stop; a leader row with NO name is a shift with
         nobody running it, which is worse and is not what he asked for.

         ⚠️ AND ONLY WHEN THE HISTORY CAN ANSWER. `cellsOf` is zero for somebody
         brand new, somebody not rostered in the weeks we hold, AND somebody
         whose board name this roster could not resolve — see the warning at
         `cellsOf`. Treating that silence as "never worked it" would bar an
         eight-year veteran from the row they have run for years, so anybody the
         history cannot speak about stays in the pool. */
      if (needsLead && memory && pool.length > 1) {
        const worked = pool.filter((p) => {
          if (memory.cellsOf(p.id) === 0) return true;      // history cannot say
          return memory.rolesOf(p.id).includes(b.st.name);
        });
        if (worked.length) pool = worked;
      }
      if (!pool.length) {
        /* Nobody. Walk forward to the next moment somebody clocks in, so a hole
           is reported as the real span rather than as one slot at a time. */
        const next = onClock
          .map((p) => p.start)
          .filter((s) => s > cursor && s < b.end)
          .sort((x, y) => x - y)[0];
        holes.push({ station: b.st.name, tier: b.tier || "core", start: cursor, end: next == null ? b.end : next });
        if (next == null) break;
        cursor = next;
        continue;
      }
      /* ★ WHERE MEMORY ACTS, AND IT IS ONLY HERE: ordering a pool that has
         already passed every hard test. See the note above the function. */
      const homeHere = (p) => (memory && memory.homeOf(p.id) === b.st.name ? 1 : 0);
      const affinity = (p) => (memory ? memory.affinity(p.id, b.st.name) : 0);
      let best = pool[0];
      pool.forEach((p) => {
        const reach = Math.min(p.end, b.end) - cursor;
        const bestReach = Math.min(best.end, b.end) - cursor;
        /* An anchor standing on their own station outranks reach and skill;
           below that, how much of their time they have spent here; and only
           then the original rule, unchanged. */
        const h = homeHere(p) - homeHere(best);
        if (h > 0) { best = p; return; }
        if (h < 0) return;
        const a = affinity(p) - affinity(best);
        if (a > 1e-9) { best = p; return; }
        if (a < -1e-9) return;
        /* ⚠️ ON A LEADER ROW, SKILL OUTRANKS REACH. Matt: "prioritize job
           skill". Everywhere else the longest-serving body wins, because a
           station covered end to end by one person beats two handovers. A
           leadership row is the opposite trade: the store would rather have its
           strongest leader for four hours and a handover than its weakest for
           eight. Ordinary rows are untouched. */
        if (needsLead && p.skill !== best.skill) { if (p.skill > best.skill) best = p; return; }
        if (reach > bestReach || (reach === bestReach && p.skill > best.skill)) best = p;
      });
      /* 🐛 CLAMPED TO THEIR NEXT COMMITMENT, AND THIS IS WHERE IT FIRST WENT
         WRONG. `free` tests ONE slot, so a person clear at 5:00pm was then
         booked all the way to close — straight through a station they had
         already been given at 6:00pm. The first real run produced "Anna
         Escobar: DT TRADITIONAL 5p-11p | WINDOW 6p-11p | LEADER DT 7p-11p",
         one person on three stations at the same time, and every one of those
         rows looked perfectly ordinary on its own. */
      const nextBusy = best.busy
        .map((x) => x.start)
        .filter((s) => s > cursor)
        .sort((x, y) => x - y)[0];
      const end = Math.min(best.end, b.end, nextBusy == null ? Infinity : nextBusy);
      if (end <= cursor) { cursor += SLOT; continue; }
      best.busy.push({ start: cursor, end });
      /* ⚠️ SPREAD, SO A NON-TRAINING PLACEMENT IS BYTE-IDENTICAL TO WHAT THIS
         ALWAYS PRODUCED. No `training: false` key appears on ordinary rows —
         every existing reader of `filled` sees exactly the object it saw
         before, and only a row that IS training grows two fields. Rule 1. */
      filled.push({
        station: b.st.name, section: b.st.section || "",
        id: best.id, name: best.name, start: cursor, end,
        /* ⚠️ THE LEADER CASE IS ITS OWN CALL and only fires on a leader row, so
           an ordinary station keeps exactly the flag it produced before. */
        ...((needsLead ? leadLearning(best.id, b.st.name) : null)
          || trainingFor(best.id, b.st.name, best.side) || {}),
      });
      cursor = end;
    }
  });

  /* Merge each person's stations into the block shape the board already reads:
     one row per person, blocks in time order. Same field names DailySetup's
     `parseImportText` produces, so this can feed the board without a translator
     when the publish step is built. */
  const byPerson = new Map();
  filled.forEach((f) => {
    const row = byPerson.get(f.id) || { id: f.id, name: f.name, blocks: [] };
    /* Same spread rule as `filled` above: an ordinary block keeps exactly the
       four fields the board already reads, and only a training block grows. */
    row.blocks.push({
      start: f.start, end: f.end, job: f.station, section: f.section,
      ...(f.training ? { training: true, priority: f.priority } : {}),
    });
    byPerson.set(f.id, row);
  });
  byPerson.forEach((r) => r.blocks.sort((a, b) => a.start - b.start));

  /* Merge touching holes on the same station into one readable span. */
  holes.sort((a, b) => String(a.station).localeCompare(String(b.station)) || a.start - b.start);
  const merged = [];
  holes.forEach((h) => {
    const last = merged[merged.length - 1];
    if (last && last.station === h.station && last.end >= h.start) last.end = Math.max(last.end, h.end);
    else merged.push({ ...h });
  });

  /* ⚠️ SPLIT, NOT FILTERED. A peak gap is still returned and still counted —
     hiding it would be the opposite mistake to alarming about it. The screen
     decides how loudly to say each one. */
  const core = merged.filter((h) => h.tier !== "peak");
  const peak = merged.filter((h) => h.tier === "peak");
  return { filled, holes: core, peakHoles: peak, rows: [...byPerson.values()] };
}

/* ── THE DAY AS A BOARD, NOT AS A LIST OF PEOPLE ──────────────────────────
   Matt, Aug 13 2026, sending photos of Daily Setups: "now we need to change
   the look. These are the boards for the setup", and then "Corp is coming next
   month. This has to impress them."

   ★ THE SHIFTS ARE ALREADY RIGHT. `assignPositions` works out who stands where
   and when; this only turns that answer sideways. One person per row becomes
   one STATION per card with a column per daypart, which is how every leader in
   the building already reads a board. No scheduling decision is made here and
   none may be added — if this file ever starts choosing who is on a station,
   there are two engines and they will disagree.

   ⚠️⚠️ TWO UNITS MEET IN THIS FUNCTION AND THEY ARE NOT THE SAME.
   Everything from the schedule is MINUTES from midnight. `DAYPARTS` from
   dayparts.js is DECIMAL HOURS (6, 10.5, 14, 17). Multiplying by 60 is the
   whole conversion and it happens once, here, at the top. The units warning at
   the head of availability.js exists because this exact mix has cost real time.

   ⚠️ NIGHT HAS NO END, on purpose. dayparts.js leaves it null because a store
   closes at a different hour on different days, so the window runs to whatever
   the station's own last close is.

   Every cell answers one of three things, and they are three different facts:
     closed  the station is not open in this window at all — hatch it
     gap     it IS open and somebody should be there and nobody is — this is
             the same fact the red "stations with nobody on them" list carried,
             put back where a leader would look for it
     on      one or more people, in time order

   ⚠️ `partial` MARKS SOMEBODY WHO DOES NOT COVER THE WHOLE WINDOW, which the
   setup board already writes as "@6". A cell that just says a name when that
   person leaves halfway through the daypart is the kind of plausible-and-wrong
   a leader acts on without checking. */
/* ══════════════════════════════════════════════════════════════════════════
   WHO SHOULD STAND WITH THEM — the trainer half of a training placement.

   Matt's own setup rules, off the sheet the priority list lives in:
   "1 trainer/leader outside", and "New blue highlighted areas on the set up are
   for a leader/trainer when possible."

   ⚠️⚠️ IT RETURNS A SUGGESTION AND NOTHING ELSE. It never moves anybody, never
   books anybody, and never changes a placement. The person it names is already
   standing somewhere on this day; this only says who is nearby and knows the
   station. Booking a trainer OUT of a station to stand next to a trainee would
   take a body off the line at peak, which is how a good idea becomes a bad
   board.

   ⚠️ THE ONLY REAL QUALIFICATION IS HAVING DONE IT. `affinity` is the share of
   this person's own history spent on that station, so somebody who has actually
   worked it beats a leader who never has. A rank is not a qualification to teach
   a station — that is exactly the assumption that would put a Director who has
   never touched the breader in charge of teaching it.

   ⚠️ OVERLAP IS REQUIRED AND CHECKED IN MINUTES. A trainer who leaves at 2 is
   not a trainer for a 5pm placement, and a suggestion that ignores the clock is
   worse than none — it reads as confirmed cover.

   Returns "" when nobody on the clock has ever worked it, which is a real and
   common answer, and an honest blank beats naming somebody who cannot help. */
export function suggestTrainer(place, shifts, memory) {
  if (!place || !memory) return "";
  const others = (Array.isArray(shifts) ? shifts : []).filter((s) =>
    s && String(s.id) !== String(place.id) &&
    Number(s.start) < Number(place.end) && Number(s.end) > Number(place.start));

  let best = null, bestScore = 0;
  others.forEach((s) => {
    const share = memory.affinity(s.id, place.station);
    if (share <= 0) return;                              // never worked it
    /* Their home station counts for more than a passing familiarity, but both
       beat somebody who has never stood there. */
    const score = share + (memory.homeOf(s.id) === place.station ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = s; }
  });
  return best ? best.name : "";
}

/* Every training placement on a day, with a trainer named where one is on.
   ⚠️ READS `filled`, so it can only ever describe placements the engine already
   made. It cannot invent a training slot, which keeps one source of truth for
   "is this training" — the engine — rather than a second opinion here. */
export function trainingPlan(filled, shifts, memory) {
  return (Array.isArray(filled) ? filled : [])
    .filter((f) => f && f.training)
    .map((f) => ({
      id: f.id, name: f.name, station: f.station, section: f.section || "",
      start: f.start, end: f.end, priority: f.priority || 0,
      trainer: suggestTrainer(f, shifts, memory),
    }))
    .sort((a, b) => (a.priority || 99) - (b.priority || 99) || a.start - b.start);
}

export function boardDay({ stations, filled, dayparts }) {
  const list = Array.isArray(stations) ? stations : [];
  const spans = Array.isArray(filled) ? filled : [];
  const dps = Array.isArray(dayparts) ? dayparts : [];

  /* The latest minute anything is open today, so "5pm to close" has an end. */
  const lastClose = list.reduce((max, st) => (Array.isArray(st.hours) ? st.hours : [])
    .reduce((m, h) => Math.max(m, Number(h.end) || 0), max), 0) || MIN_PER_DAY;

  const windows = dps.map((d) => ({
    key: d.key,
    label: d.label,
    start: Math.round((Number(d.start) || 0) * 60),
    end: d.end == null ? lastClose : Math.round(Number(d.end) * 60),
  }));

  const order = [];
  const bySection = new Map();
  list.forEach((st) => {
    if (!st || !st.name) return;
    const hours = Array.isArray(st.hours) ? st.hours : [];
    const mine = spans.filter((f) => f.station === st.name);

    const cells = {};
    windows.forEach((w) => {
      const open = hours.some((h) => Number(h.start) < w.end && Number(h.end) > w.start);
      if (!open) { cells[w.key] = { state: "closed", people: [] }; return; }
      const people = mine
        .filter((f) => f.start < w.end && f.end > w.start)
        .sort((a, b) => a.start - b.start)
        .map((f) => ({
          id: f.id,
          name: f.name,
          start: f.start,
          end: f.end,
          /* Late on or early off against THIS window, not against the day. */
          partial: f.start > w.start || f.end < w.end,
          /* ⚠️ SPREAD, so a cell for an ordinary placement is byte-identical to
             what this always produced. Only a training placement grows keys.
             The pivot used to DROP these, which is the quiet way a flag the
             engine sets never reaches the screen that is supposed to draw it. */
          ...(f.training ? { training: true, priority: f.priority } : {}),
        }));
      cells[w.key] = { state: people.length ? "on" : "gap", people };
    });

    const sec = String(st.section || "").trim() || "OTHER";
    if (!bySection.has(sec)) { bySection.set(sec, []); order.push(sec); }
    bySection.get(sec).push({
      id: st.id || st.name,
      name: st.name,
      hours,
      duty: st.duty || "",
      cells,
    });
  });

  return {
    windows,
    sections: order.map((name) => ({ name, stations: bySection.get(name) })),
  };
}
