/* ============================================================================
   usHolidays.js — WHEN the holidays fall. Not what this store does about them.

   ★ LEAF. Imports nothing.

   ═══ THE LINE THIS FILE DRAWS ══════════════════════════════════════════════
   Matt, Aug 21 2026: "build this into the lineup systam so it doesnt need
   entered anymore but leave the option to edit."

   storeHours.js says, correctly and at length, that NO holiday may be named
   and NO date seeded in it, because another store opens on days this one shuts
   and a seeded list arrives in their repo looking deliberate.

   ⇒ Both are right, because they are about different things:

     THE CALENDAR IS NOT AN OPINION. Thanksgiving is the fourth Thursday of
     November in every restaurant in the country. Christmas Day is the 25th.
     Computing those is arithmetic, it is identical at every store, and it is
     safe to ship. That is this file.

     WHAT THE STORE DOES IS ENTIRELY AN OPINION. Whether it opens, at what
     time, and whether it shuts early. That stays store data with a screen, and
     it is NOT in this file. See `holidays` in storeConfig.js.

   ⚠️ SO NOTHING HERE CARRIES AN HOUR. Not 10:30, not 4pm, not open, not
   closed. Only names and dates. If an hour ever appears below, the line has
   been crossed and the next clone will roster somebody on Gate City's opinion.

   ═══ THE LIST ══════════════════════════════════════════════════════════════
   These are the eight ControlPoint publishes holiday hours for, which is the
   list an operator is actually reconciling against. Not the federal list:
   Chick-fil-A trades through most federal holidays and shuts on two that are
   not federal at all.

   ⚠️ EVERY DATE IS BUILT FROM LOCAL PARTS, NEVER FROM toISOString(). That
   returns UTC, which after 8pm Eastern is already tomorrow, so a holiday would
   move a day every evening. Same trap scheduleEngine.js documents.
   ============================================================================ */

const iso = (y, m, d) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/* The nth given weekday of a month. `dow` is 0=Sunday, matching Date.getDay(). */
export function nthDow(year, month, dow, n) {
  const first = new Date(year, month - 1, 1).getDay();
  const offset = (dow - first + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/* ⚠️ KEYS ARE STABLE AND NAMES ARE NOT. A store may rename what it calls a day
   on its own screen; the key is what its hours are stored against, so renaming
   must never orphan a setting. */
export const HOLIDAY_KEYS = Object.freeze([
  "newYearsDay", "independenceDay", "laborDay", "thanksgiving",
  "blackFriday", "christmasEve", "christmasDay", "newYearsEve",
]);

export const HOLIDAY_NAMES = Object.freeze({
  newYearsDay: "New Year's Day",
  independenceDay: "Independence Day",
  laborDay: "Labor Day",
  thanksgiving: "Thanksgiving Day",
  blackFriday: "Black Friday",
  christmasEve: "Christmas Eve",
  christmasDay: "Christmas Day",
  newYearsEve: "New Year's Eve",
});

/* Every holiday falling in one calendar year, oldest first. */
export function holidaysForYear(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return [];

  const thanksgivingDay = nthDow(y, 11, 4, 4);          // 4th Thursday of November
  const out = [
    { key: "newYearsDay",      iso: iso(y, 1, 1) },
    { key: "independenceDay",  iso: iso(y, 7, 4) },
    { key: "laborDay",         iso: iso(y, 9, nthDow(y, 9, 1, 1)) },   // 1st Monday of September
    { key: "thanksgiving",     iso: iso(y, 11, thanksgivingDay) },
    /* ⚠️ THE DAY AFTER THANKSGIVING, DERIVED. November has 30 days and the 4th
       Thursday is at most the 28th, so this never leaves the month. */
    { key: "blackFriday",      iso: iso(y, 11, thanksgivingDay + 1) },
    { key: "christmasEve",     iso: iso(y, 12, 24) },
    { key: "christmasDay",     iso: iso(y, 12, 25) },
    { key: "newYearsEve",      iso: iso(y, 12, 31) },
  ];
  return out.map((h) => ({ ...h, name: HOLIDAY_NAMES[h.key] }));
}

/* The holidays from `fromIso` forward, across as many years as it takes.
   ⚠️ SPANS THE YEAR END, which is the whole reason it is not just
   holidaysForYear(thisYear). Standing a store up in December and seeing its
   next holiday listed as "New Year's Day, eleven months ago" is the bug. */
export function holidaysFrom(fromIso, limit = 12) {
  const s = String(fromIso || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return [];
  const y = Number(s.slice(0, 4));
  const all = [...holidaysForYear(y), ...holidaysForYear(y + 1), ...holidaysForYear(y + 2)];
  return all.filter((h) => h.iso >= s).sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, Math.max(0, limit));
}

/* Which holiday a date is, or "" — so a screen can label a day it already has
   hours for without the operator having told it what the day means. */
export function holidayKeyFor(dateIso) {
  const s = String(dateIso || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const hit = holidaysForYear(Number(s.slice(0, 4))).find((h) => h.iso === s);
  return hit ? hit.key : "";
}
