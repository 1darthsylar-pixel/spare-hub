/* ══════════════════════════════════════════════════════════════════════════
   scheduleWarnings.js — WHAT IS WRONG WITH THIS WEEK. Nothing else.

   ★ NEAR-LEAF. Imports availability.js and timeOff.js, both of which bottom out
   in modules that import nothing. No React, no storage, no UI. Pure in, pure
   out, so every rule below can be checked without a screen.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ A HUMAN BUILDS, THE MACHINE WARNS. Matt, Aug 13 2026.
   ────────────────────────────────────────────────────────────────────────
   This file NEVER changes a shift and never refuses one. It returns a list and
   the screen shows it. The auto build is a first draft; the leader owns every
   final shift, and a warning they can overrule is the difference between a tool
   and a tool that resents them.

   TWO LEVELS, AND THE DIFFERENCE IS NOT SEVERITY:
     "block" — the Hub already knows this is wrong and will not schedule it
               itself: the person has left, or has approved time off. If one
               appears it is because a human typed it in anyway, so it is said
               plainly and still not undone.
     "warn"  — everything else. Real, worth seeing, and a leader may have a
               reason. Somebody covering a rush at 39.5 hours is a decision,
               not a defect.

   ⚠️⚠️ WHAT THIS FILE MUST NEVER CLAIM. There is no date of birth in the Hub,
   so it CANNOT check youth employment law. `minors` is a hand-typed list Daily
   Setup keeps for breaks, and all this can say is "this person is on the minors
   list and this shift is long or late". That wording is deliberate and must not
   be upgraded to sound legal. A screen that says "complies with NC law" when it
   has never seen a birthday is worse than one that says nothing — the first
   gets believed.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ TYPED LIMITS ARRIVED Aug 13 2026 AND CHANGED NOTHING ABOVE.
   ────────────────────────────────────────────────────────────────────────
   (This block used to end "Real limits need `dob` and the actual NC Department
   of Labor rules, which is its own task and is not this one." Half of that has
   happened, so the block is corrected rather than deleted — a stale warning is
   worse than no warning, because the next reader trusts it.)

   minorRules.js now holds limits A STORE TYPED, and schoolCalendar.js holds the
   days A STORE TAPPED. Neither is a legal source and neither came from one: the
   NC Department of Labor site, the General Assembly site and the district's own
   calendar PDF are all unreachable from this network, so nothing was verified
   and nothing is seeded. Matt's own build spec says "Verify the current rules
   against the NC Department of Labor before shipping. Do not hardcode
   remembered numbers."

   ⇒ So the messages below say "over the limit typed in Minor rules" and never
   name a state, a law, or compliance. The upgrade is that the number is the
   STORE'S number instead of a rough guess, not that anybody has checked it.

   ⚠️ NO TYPED LIMIT MEANS THE OLD ROUGH LOOK STILL RUNS. A store that has typed
   nothing gets exactly what it got before, rather than silence — silence would
   read as "checked and fine".
   ══════════════════════════════════════════════════════════════════════════ */

import { dayState, windowsFor, fmtMin, MIN_PER_DAY, prefWarnings } from "./availability.js";
import { offIdsOn } from "./timeOff.js";
import {
  bandForPerson, limitsForDay, checkMinorShift, checkMinorWeek,
  hasLimits, minorsWithoutBand,
} from "./minorRules.js";

export const LEVEL = Object.freeze({ BLOCK: "block", WARN: "warn" });

/* Long or late enough that somebody on the minors list is worth a second look.
   ⚠️ NOT A LEGAL THRESHOLD. See the warning in the header. */
export const MINOR_LOOK = Object.freeze({ maxMinutes: 300, latestEnd: 21 * 60 });

const mins = (s) => Math.max(0, Number(s.end) - Number(s.start));

/* Is this shift inside one of the person's availability windows, end to end?
   Two windows that abut do NOT cover a shift across the join: a split
   availability means they left and came back. */
function outsideAvailability(rec, day, shift) {
  const st = dayState(rec, day);
  if (st === "unset") return "no availability on file";
  if (st === "off") return "not available that day";
  const fits = windowsFor(rec, day).some((w) => w.start <= shift.start && w.end >= shift.end);
  if (fits) return null;
  const w = windowsFor(rec, day)
    .map((x) => `${fmtMin(x.start)}-${fmtMin(x.end)}`)
    .join(", ");
  return `outside their hours (${w || "none"})`;
}

/* Every shift in a week, flattened, with the day and side attached.
   `week.days[day].sides[side].shifts` is the shape buildWeek returns. */
export function allShifts(week) {
  const out = [];
  const days = (week && week.days) || {};
  Object.keys(days).forEach((day) => {
    const sides = (days[day] || {}).sides || {};
    Object.keys(sides).forEach((side) => {
      ((sides[side] || {}).shifts || []).forEach((s) => {
        if (s && Number(s.end) > Number(s.start)) out.push({ ...s, day, side, iso: days[day].iso });
      });
    });
  });
  return out;
}

/* ── the rules ───────────────────────────────────────────────────────────
   Each returns rows of { level, day, id, name, message }. */

export function warningsForWeek({ week, avail, skills, minors, timeOff, terminated, rules, minorRules, school }) {
  const maxWeek = (rules && rules.maxWeekHours) || 40;
  /* ⚠️ SAME FALLBACK PATTERN AS maxWeek ABOVE, and the same numbers as
     DEFAULT_RULES in scheduleEngine.js. That file is where they are explained
     and where they are changed; these are the fallbacks for a caller that
     passes no rules at all. */
  const maxDay = (rules && rules.maxDayHours) || 12;
  const minRest = (rules && rules.minRestHours) || 10;
  const A = (avail && avail.people) || avail || {};
  const S = (skills && skills.people) || skills || {};
  const gone = terminated instanceof Set ? terminated : new Set();
  const minorSet = minors instanceof Set ? minors : new Set();
  const shifts = allShifts(week);
  const out = [];
  const add = (level, s, message) =>
    out.push({ level, day: s.day, iso: s.iso, id: s.id, name: s.name, side: s.side, message });

  /* per shift */
  shifts.forEach((s) => {
    const id = String(s.id);

    if (gone.has(id)) add(LEVEL.BLOCK, s, "has left the team");

    if (s.iso && offIdsOn(timeOff, s.iso).has(id)) {
      add(LEVEL.BLOCK, s, "has approved time off that day");
    }

    const why = outsideAvailability(A[id], s.day, s);
    if (why) add(LEVEL.WARN, s, why);

    /* Not certified on the side they are standing on. The Hub holds job codes,
       not per-station ratings, so this is as fine-grained as it can honestly be. */
    if (!s.job) add(LEVEL.WARN, s, `no ${s.side} certification on file`);

    /* ⚠️⚠️ TYPED LIMITS WIN, AND THE ROUGH LOOK IS THE FALLBACK, NEVER BOTH.
       Running both would say the same thing twice in two different voices —
       one of them precise and one of them vague — and a leader would rightly
       stop reading either. What decides it is whether ANY limit is typed for
       THIS person's group on THIS day; that is the same question
       `checkMinorShift` answers with silence, so it is asked once, here. */
    if (minorSet.has(id)) {
      const bandId = bandForPerson(minorRules, id);
      const L = bandId ? limitsForDay(minorRules, school, s.iso, bandId) : null;
      const checked = !!L && (L.maxShift !== null || L.earliest !== null || L.latest !== null);
      if (checked) {
        checkMinorShift({ rules: minorRules, cal: school, iso: s.iso, bandId, start: s.start, end: s.end })
          .forEach((why) => add(LEVEL.WARN, s, why));
      } else {
        if (mins(s) > MINOR_LOOK.maxMinutes) {
          add(LEVEL.WARN, s, `on the minors list and this shift is ${(mins(s) / 60).toFixed(1)} hours`);
        }
        if (Number(s.end) > MINOR_LOOK.latestEnd) {
          add(LEVEL.WARN, s, `on the minors list and this shift ends at ${fmtMin(Math.min(s.end, MIN_PER_DAY))}`);
        }
      }
    }
  });

  /* two shifts, one person, one day, overlapping clock */
  const byPersonDay = new Map();
  shifts.forEach((s) => {
    const k = `${s.id}|${s.day}`;
    byPersonDay.set(k, [...(byPersonDay.get(k) || []), s]);
  });
  byPersonDay.forEach((list) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        add(LEVEL.WARN, sorted[i],
          `double booked with ${fmtMin(sorted[i - 1].start)}-${fmtMin(sorted[i - 1].end)} on ${sorted[i - 1].side}`);
      }
    }
  });

  /* over the week cap */
  const weekMin = {};
  shifts.forEach((s) => { weekMin[String(s.id)] = (weekMin[String(s.id)] || 0) + mins(s); });
  Object.keys(weekMin).forEach((id) => {
    const h = weekMin[id] / 60;
    if (h > maxWeek) {
      const any = shifts.find((s) => String(s.id) === id);
      if (any) add(LEVEL.WARN, any, `${h.toFixed(1)} hours this week, over ${maxWeek}`);
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     TWO STORE RULES THE ENGINE CANNOT BREAK AND A HAND EDIT CAN.

     `maxShift` caps what the engine BUILDS at 8 hours, so neither of these can
     fire on a generated week. They exist because a leader types over the top of
     it, and until now nothing said so — that gap sat in CLAUDE.md as an open
     question from Aug 13 ("a hand-typed TEN HOUR DAY raises no warning; 48
     hours across a WEEK does").

     ⚠️ BLOCK, NOT WARN, AND THE DIFFERENCE IS KIND NOT SEVERITY. Matt stated
     both as absolutes — "no more than 12 hrs", "no cloepening" — which puts
     them with "has left the team" and "has approved time off", things the store
     does not do. A preference ("I would rather not work past 25 hours") is the
     other kind and stays a WARN. ⚠️ BLOCK does not stop a save; it colours the
     cell red. Nobody is trapped, they are told.
     ══════════════════════════════════════════════════════════════════════ */

  /* ── over the day cap ─────────────────────────────────────────────────
     ⚠️ THE WHOLE DAY, NOT ONE SHIFT. Two hand-typed shifts of seven hours each
     is a fourteen hour day and neither one alone breaks anything. Summing per
     person per day is the only version that catches it. */
  const dayMin = {};
  shifts.forEach((s) => {
    const k = `${s.day} ${String(s.id)}`;
    dayMin[k] = (dayMin[k] || 0) + mins(s);
  });
  Object.keys(dayMin).forEach((k) => {
    const h = dayMin[k] / 60;
    if (h <= maxDay) return;
    const [day, id] = k.split(" ");
    const any = shifts.find((s) => s.day === day && String(s.id) === id);
    if (any) add(LEVEL.BLOCK, any, `${h.toFixed(1)} hours in one day, over ${maxDay}`);
  });

  /* ── closed then opened ───────────────────────────────────────────────
     ⚠️⚠️ THE GAP CROSSES MIDNIGHT AND THAT IS THE PART THAT GETS WRITTEN WRONG.
     A close at 11pm Monday and an open at 5am Tuesday is a SIX hour gap.
     Compared naively on start times it is NEGATIVE eighteen and passes silently.
     The gap is (midnight - end) + next start, and only between shifts on
     CONSECUTIVE days.

     ⚠️ DAY ORDER COMES FROM THE WEEK ITSELF, never from `new Date(iso)`. A bare
     ISO string parses as UTC and lands on the previous day west of Greenwich,
     which is the exact trap `dowOf` exists to avoid elsewhere in this repo.
     The week's own key order is Mon..Sat, so an index into it is the truth.

     ⚠️ IT COMPARES A PERSON'S LAST SHIFT TO THEIR FIRST, not every pair. A
     split shift inside one day is a different question and already has its own
     rules; this one is only about going home and coming back. */
  const dayIndex = {};
  Object.keys((week && week.days) || {}).forEach((d, i) => { dayIndex[d] = i; });
  const byPerson = {};
  shifts.forEach((s) => {
    const id = String(s.id);
    (byPerson[id] = byPerson[id] || []).push(s);
  });
  Object.keys(byPerson).forEach((id) => {
    const rows = byPerson[id].slice().sort((a, b) =>
      (dayIndex[a.day] - dayIndex[b.day]) || (Number(a.start) - Number(b.start)));
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1], next = rows[i];
      const step = dayIndex[next.day] - dayIndex[prev.day];
      if (step !== 1) continue;                       // same day, or a day off between
      /* The LAST end on the earlier day against the FIRST start on the later. */
      const lastEnd = Math.max(...rows.filter((r) => r.day === prev.day).map((r) => Number(r.end)));
      const firstStart = Math.min(...rows.filter((r) => r.day === next.day).map((r) => Number(r.start)));
      const gapH = ((24 * 60 - lastEnd) + firstStart) / 60;
      if (gapH < minRest) {
        add(LEVEL.BLOCK, next,
          `closed then opened — only ${gapH.toFixed(1)} hours off after ${prev.day}`);
        break;                                        // one per person is the point
      }
    }
  });

  /* ── what each person asked for ────────────────────────────────────────
     Matt, Aug 13 2026: "we need OT alerts and team member preferences."

     ⚠️⚠️ ALWAYS `WARN`, NEVER `BLOCK`, AND THE WORDING CARRIES IT. A minor's
     hour cap is something the store must do; "I would rather not work more
     than 25 hours" is somebody's ask, and this file's own header says the
     difference between the two levels "is not severity". Every sentence
     prefWarnings produces ends in "they asked for", so a leader reading the
     panel can tell a rule from a request without being told which is which.

     ⚠️ THE PROMISE HALF IS CHECKED TOO. Too FEW hours warns as loudly as too
     many. Somebody who asked for twenty and got eight has been let down by
     this schedule, and an engine that only caps would say nothing at all.

     ⚠️ HUNG OFF THEIR FIRST SHIFT, like the weekly cap above, because it is a
     property of the WEEK and a warning with no row to sit on is invisible.
     ⚠️ `dayIndex` COMES FROM THE WEEK ITSELF, not from a calendar: "time
     between shifts" runs through the night, and the only thing that makes a
     close-then-open a six hour gap rather than a negative eighteen is knowing
     which day came first. */
  {
    const order = new Map();
    Object.keys((week && week.days) || {}).forEach((d, i) => order.set(d, i));
    const dayIndex = (d) => (order.has(d) ? order.get(d) : NaN);
    const byPerson = new Map();
    shifts.forEach((s) => {
      const k = String(s.id);
      byPerson.set(k, [...(byPerson.get(k) || []), s]);
    });
    byPerson.forEach((list, id) => {
      const rec = (avail || {})[id];
      if (!rec) return;
      const first = list[0];
      prefWarnings(rec, list, dayIndex).forEach((why) => add(LEVEL.WARN, first, why));
    });
  }

  /* ── the minors' own weekly cap ────────────────────────────────────────
     A separate number from the store's 40, and usually much smaller. It is a
     property of the WEEK, so it is checked once per person rather than once
     per shift, and hung off their first shift so it lands on a real row. */
  const weekIsos = Object.keys((week && week.days) || {})
    .map((d) => week.days[d] && week.days[d].iso).filter(Boolean);

  Object.keys(weekMin).forEach((id) => {
    if (!minorSet.has(id)) return;
    const bandId = bandForPerson(minorRules, id);
    if (!bandId) return;
    checkMinorWeek({ rules: minorRules, cal: school, isoList: weekIsos, bandId, minutes: weekMin[id] })
      .forEach((why) => {
        const any = shifts.find((s) => String(s.id) === id);
        if (any) add(LEVEL.WARN, any, why);
      });
  });

  /* ⚠️ SOMEBODY MISSING FROM A CHECK LOOKS EXACTLY LIKE SOMEBODY WHO PASSED IT.
     Once a store has typed limits, a minor with no group set is checked against
     nothing at all, and the only thing worse than that is not saying so. Said
     ONCE per person, not once per shift, and only for people actually working
     this week — a warning about somebody who is not on the schedule is noise. */
  if (hasLimits(minorRules)) {
    const working = new Set(Object.keys(weekMin).filter((id) => minorSet.has(id)));
    minorsWithoutBand(minorRules, working).forEach((id) => {
      const any = shifts.find((s) => String(s.id) === id);
      if (any) add(LEVEL.WARN, any, "on the minors list with no age group set, so no limit is being checked");
    });
  }

  return out;
}

/* Coverage shortfalls, which are a property of the DAY rather than of a person,
   so they are returned separately instead of being hung off somebody's shift. */
export function coverageWarnings(week) {
  const out = [];
  const days = (week && week.days) || {};
  Object.keys(days).forEach((day) => {
    const sides = (days[day] || {}).sides || {};
    Object.keys(sides).forEach((side) => {
      ((sides[side] || {}).gaps || []).forEach((g) => {
        out.push({
          level: LEVEL.WARN, day, side,
          message: `${side} short ${g.short} from ${fmtMin(g.start)} to ${fmtMin(g.end)}`,
        });
      });
    });
  });
  return out;
}

/* Warnings for one person on one day, for a grid cell. */
export function forCell(warnings, id, day) {
  return (warnings || []).filter((w) => String(w.id) === String(id) && w.day === day);
}

export const worstLevel = (list) =>
  (list || []).some((w) => w.level === LEVEL.BLOCK) ? LEVEL.BLOCK
    : (list || []).length ? LEVEL.WARN : null;
