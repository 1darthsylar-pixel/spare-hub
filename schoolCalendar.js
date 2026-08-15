/* ══════════════════════════════════════════════════════════════════════════
   schoolCalendar.js — WHICH DAYS SCHOOL IS IN.

   ★ NEAR-LEAF. Imports timeOff.js and nothing else, and timeOff.js imports
   nothing at all. The scheduling engine reads this while deciding a week, so
   no React, no store.js, no component may ever be added here.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ WHY THIS IS TYPED AND NOT LOOKED UP. Aug 13 2026.
   ────────────────────────────────────────────────────────────────────────
   Matt asked for the Guilford County 2026-27 calendar to be built in. The
   official PDF could not be opened from this network, so the only source
   available was a search summary. A school calendar wrong by one day puts a
   fifteen year old on a shift during first period, and it would look entirely
   correct on screen. UNEDITABLE-AND-WRONG IS WORSE THAN BLANK (rule 18).

   ⇒ The store taps its own days. Three more reasons that is the better answer
   anyway, not a consolation prize:
     · Districts move days every year. A tap is a second; a code constant is a
       deploy.
     · A clone in another county inherits nothing. Rule 18.
     · Teacher workdays and early releases are the days that actually matter to
       a schedule, and no summary lists them.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ FIVE STATES, AND "NOT SET" IS NOT "NO SCHOOL".
   ────────────────────────────────────────────────────────────────────────
       unset    nobody has typed a term. NEVER guess from this.
       before   earlier than the first day
       after    later than the last day
       weekend  Saturday or Sunday
       off      inside the term, tapped as a non-school day
       in       school is in

   A blank must never resolve to "no school", because "no school" is the LOOSER
   side of every minor limit. availability.js makes the same three-state
   argument about a missing availability record and for the same reason: the
   first version of that file normalised a blank to "any time" and would have
   scheduled somebody onto a 6am Saturday they never agreed to. Here the
   equivalent mistake hands a fifteen year old an eight hour Tuesday.

   ⚠️ THE MODEL IS "TAP THE DAYS OFF", copied from the HotSchedules screen Matt
   sent, which reads "Selected non school days". School is IN across the term
   unless a day is tapped OUT. Weekends are never school and are not stored, so
   nobody has to tap 80 Saturdays.

   ⚠️⚠️ NO `new Date("2026-08-24")` ANYWHERE IN THIS FILE, and none may be added.
   That string parses as UTC midnight, which in this timezone is the EVENING OF
   THE 23RD — so a Monday reads as a Sunday for half the year and every test run
   in the morning looks fine. timeOff.js states the same rule at length. Dates
   here are ISO strings compared as strings, and the weekday comes out of the
   digits arithmetically.
   ══════════════════════════════════════════════════════════════════════════ */

import { isIsoDate, nextIso } from "./timeOff.js";

/* ⚠️ THE KEY IS `SCHOOL_KEY` IN availability.js AND IS NOT REDEFINED HERE.
   That record already holds `title` and `ids` (who is on the calendar) for a
   live store, and the dates below are new fields ON THE SAME RECORD rather
   than a second key — school membership and school dates are one subject and
   splitting them would let the two drift apart. Import the key from
   availability.js; import the reading and writing from here. */

export const SCHOOL_STATE = Object.freeze({
  UNSET: "unset", BEFORE: "before", AFTER: "after",
  WEEKEND: "weekend", OFF: "off", IN: "in",
});

/* Day of week, 0 = Sunday, straight from the digits. Sakamoto's method.
   ⚠️ NOT A SECOND COPY OF `fromIso`. That helper builds a real Date for the
   labor engine's month maths; this answers one question without constructing
   anything, which is what keeps the no-Date rule above true. */
const DOW_SHIFT = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
export function dowOf(iso) {
  if (!isIsoDate(iso)) return -1;
  let [y, m, d] = String(iso).split("-").map(Number);
  if (m < 3) y -= 1;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + DOW_SHIFT[m - 1] + d) % 7;
}

export const isWeekend = (iso) => { const w = dowOf(iso); return w === 0 || w === 6; };

/* Guard the read. Rule 1.

   ⚠️⚠️ THIS RECORD IS ALREADY LIVE. It was written by the member-list import
   as `{ v, title, ids, updatedAt }` before any date existed, so every date
   field has to survive being absent. It does: an unset term answers "unset",
   which is the state the whole file is built around. */
export function readSchool(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const term = (k) => (isIsoDate(o[k]) ? String(o[k]) : "");
  const off = Array.isArray(o.offDates) ? o.offDates.filter(isIsoDate).map(String) : [];
  return {
    v: 1,
    title: String(o.title || ""),
    ids: Array.isArray(o.ids) ? o.ids.map(String) : [],
    termStart: term("termStart"),
    termEnd: term("termEnd"),
    /* Sorted and de-duplicated on the way in, so a tapped list written by two
       iPads in the same minute still reads as one tidy set. */
    offDates: [...new Set(off)].sort(),
    updatedAt: String(o.updatedAt || ""),
    updatedBy: String(o.updatedBy || ""),
  };
}

export const hasTerm = (cal) => !!(cal && cal.termStart && cal.termEnd && cal.termStart <= cal.termEnd);

/* The whole question, in one place. */
export function schoolDayState(cal, iso) {
  const c = readSchool(cal);
  if (!isIsoDate(iso)) return SCHOOL_STATE.UNSET;
  if (!hasTerm(c)) return SCHOOL_STATE.UNSET;
  if (iso < c.termStart) return SCHOOL_STATE.BEFORE;
  if (iso > c.termEnd) return SCHOOL_STATE.AFTER;
  if (isWeekend(iso)) return SCHOOL_STATE.WEEKEND;
  if (c.offDates.includes(iso)) return SCHOOL_STATE.OFF;
  return SCHOOL_STATE.IN;
}

/* true / false / null, and NULL IS NOT FALSE.
   ⚠️ Every caller has to handle the null. A caller that treats "we do not know"
   as "no school" silently applies the looser limit to a minor, which is the one
   failure this file exists to prevent. */
export function isSchoolDay(cal, iso) {
  const st = schoolDayState(cal, iso);
  if (st === SCHOOL_STATE.UNSET) return null;
  return st === SCHOOL_STATE.IN;
}

/* Is the night AFTER this date a school night — i.e. does a school day follow?
   ⚠️ THIS IS A DIFFERENT QUESTION FROM `isSchoolDay` AND THE TWO GET CONFUSED.
   A Sunday is not a school day, but Sunday night is a school night. The limit
   on how LATE somebody may work belongs to the night; the limit on how MANY
   hours belongs to the day. Getting these the same way round is why they are
   two named functions rather than one flag. */
export const isSchoolNight = (cal, iso) => isSchoolDay(cal, nextIso(iso));

/* Does this week contain a school day at all? Used for the weekly limit, which
   is a property of the WEEK rather than of any one shift.
   ⚠️ Returns null when the term is unset, same rule as above. */
export function weekHasSchool(cal, isoList) {
  const list = (Array.isArray(isoList) ? isoList : []).filter(isIsoDate);
  if (!list.length) return null;
  let known = false;
  for (const iso of list) {
    const d = isSchoolDay(cal, iso);
    if (d === true) return true;
    if (d !== null) known = true;
  }
  return known ? false : null;
}

/* ── writing ─────────────────────────────────────────────────────────────
   Every writer returns a whole guarded record, so a caller cannot save a shape
   this file would not read back. */

export function setTerm(cal, from, to) {
  const c = readSchool(cal);
  const a = isIsoDate(from) ? String(from) : "";
  const b = isIsoDate(to) ? String(to) : "";
  /* ⚠️ TAPPED DAYS OUTSIDE THE NEW TERM ARE KEPT, NOT DROPPED. Somebody fixing
     a typo in the end date must not silently lose a term's worth of tapping,
     and `schoolDayState` already ignores anything outside the term, so keeping
     them costs nothing and un-typing the mistake restores them. */
  return { ...c, termStart: a, termEnd: b };
}

export function toggleOffDate(cal, iso) {
  const c = readSchool(cal);
  if (!isIsoDate(iso)) return c;
  const has = c.offDates.includes(iso);
  return {
    ...c,
    offDates: has ? c.offDates.filter((d) => d !== iso) : [...c.offDates, String(iso)].sort(),
  };
}

/* A run of days at once, for a week-long break somebody would otherwise tap
   five times. `on` true marks them non-school, false clears them. */
export function setRange(cal, from, to, on) {
  const c = readSchool(cal);
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return c;
  const set = new Set(c.offDates);
  let cur = String(from), n = 0;
  while (cur <= to && n < 400) {
    if (!isWeekend(cur)) { if (on) set.add(cur); else set.delete(cur); }
    cur = nextIso(cur); n++;
  }
  return { ...c, offDates: [...set].sort() };
}

/* ── the month grid a screen draws ───────────────────────────────────────
   Six rows of seven, Sunday first, with null in the leading and trailing pad
   cells. Pure, so the panel does no date maths of its own. */
export function monthMatrix(year, month) {
  const y = Number(year), m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const pad = dowOf(first);
  const cells = new Array(pad).fill(null);
  for (let d = 1; d <= len; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/* How many school days the term actually holds, so the screen can say
   "176 school days" and somebody can compare it against the district's own
   number instead of trusting the tapping. */
export function schoolDayCount(cal) {
  const c = readSchool(cal);
  if (!hasTerm(c)) return 0;
  let cur = c.termStart, n = 0, guard = 0;
  while (cur <= c.termEnd && guard < 800) {
    if (schoolDayState(c, cur) === SCHOOL_STATE.IN) n++;
    cur = nextIso(cur); guard++;
  }
  return n;
}
