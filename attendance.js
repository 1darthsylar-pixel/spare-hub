/* ══════════════════════════════════════════════════════════════════════════
   attendance.js — WHO ACTUALLY TURNED UP FOR THE SHIFT THEY WERE GIVEN.

   Matt, Aug 14 2026, on the gap against 7shifts, Deputy and HotSchedules:
   "Continue." The gap named first was punches, because without them nothing
   can say whether the week that was built is the week that happened.

   ★ LEAF. Imports NOTHING. No React, no storage, no store config — the caller
   hands over a record and gets a new one back, so this runs in a test, in the
   Worker, or in the browser.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THIS IS NOT A TIME CLOCK AND MUST NEVER BE SOLD AS ONE.
   ────────────────────────────────────────────────────────────────────────
   It records a LEADER'S MARK against a scheduled shift: they were here, they
   were late, they did not come. It does not record a minute somebody worked
   and it is not a payroll record. The store's real clock is the POS, and a
   second set of numbers that looked like hours would eventually be used as if
   it were pay data by somebody who did not know better.

   ⇒ So there is no clock-in time here, no worked-minutes total, and nothing
   that adds up to a wage. Deliberately. If this ever needs real punches, they
   come from the POS and they go in their own record, not this one.

   ⚠️⚠️ AND IT FIRES NO CONSEQUENCE. HR Console already holds this store's whole
   attendance ladder — No Call/No Show, 30+ minutes late, under 30, and five
   kinds of call out, each with Hannah's own point value, effective 1 Jul 2026.
   That system is the record. This one only knows what a leader tapped beside a
   shift, and its whole job is to make filing the real thing quick and correct
   rather than remembered.

   The demerits module says the same thing about its own ladder and it is worth
   repeating here: "NOTHING HERE FIRES A CONSEQUENCE BY ITSELF. It reports a
   stage; a human files the documentation. A count must never terminate
   anyone." A mark in this file is not an infraction. Somebody files that, by
   name, in HR Console, and can decline to.

   ⚠️ ONE ROW PER WEEK, keyed to the Monday, the same shape the board and the
   schedule already use — `gcfcr-attendance-v1-{MondayISO}`. A leader looking at
   a week reads one record.
   ══════════════════════════════════════════════════════════════════════════ */

export const attendanceKey = (monday) => `gcfcr-attendance-v1-${String(monday || "")}`;

/* ── what a leader can say about a shift ──────────────────────────────────
   ⚠️ THESE ARE OBSERVATIONS, NOT VERDICTS, and the wording matters because a
   leader taps one of them in about a second. "Called out" says somebody rang;
   "No show" says nobody heard from them. HR's ladder treats those very
   differently — one is a point, the other is processed as a resignation — so a
   single "absent" would throw away the only thing that separates them.

   ⚠️ AN UNMARKED SHIFT IS NOT AN ABSENCE. `""` means nobody looked yet, which
   is the state every shift starts in and most will stay in. Counting unmarked
   as anything is how a busy Saturday turns into six accusations. */
export const STATUSES = Object.freeze(["here", "late", "left", "calledout", "noshow"]);

export const STATUS_LABEL = Object.freeze({
  here: "Here",
  late: "Late",
  left: "Left early",
  calledout: "Called out",
  noshow: "No show",
});

/* Which marks are worth a leader's attention afterwards. ⚠️ `here` IS NOT ONE,
   and neither is unmarked — a list of everything that happened is a list
   nobody reads. */
export const CONCERNS = Object.freeze(["late", "left", "calledout", "noshow"]);

/* ══════════════════════════════════════════════════════════════════════════
   ⚠️⚠️ ONE DEFINITION OF "WHICH SHIFT IS THIS", AND EVERYTHING KEYS ON IT.

   A shift has no id of its own. The engine rebuilds the week from scratch
   every time somebody presses Build, so any id this file minted would be gone
   by the next press — the same reason `offerMatchesShift` in shiftMarket.js
   names a shift by where it sits rather than by an id.

   day + side + person + start is unique because one person cannot hold two
   shifts on one side of one day at the same minute; the engine's `takenToday`
   set guarantees it.

   ⚠️ A REBUILD CAN STILL MOVE A SHIFT, and then its mark no longer matches.
   That is correct rather than unfortunate: the mark described a shift that no
   longer exists. `pruneToWeek` below drops those on request so a record cannot
   quietly accumulate marks for shifts nobody works.
   ══════════════════════════════════════════════════════════════════════════ */
export function shiftKey(day, side, personId, start) {
  const d = String(day || "").trim();
  const s = String(side || "").trim().toUpperCase();
  const p = String(personId == null ? "" : personId).trim();
  /* ⚠️⚠️ `Number(null)` AND `Number("")` ARE BOTH 0, WHICH IS FINITE. A shift
     with no start time would therefore get a key claiming it starts at
     midnight, and a mark could attach to a shift that does not exist. Caught by
     this file's own test, and it is the SECOND time this exact coercion has bit
     in one day — `autoDecision` in shiftMarket.js had it with a timestamp.
     ⇒ Check the type, then the value. Midnight is a real start time and must
     still produce a key; nothing-at-all must not. */
  const t = typeof start === "number" ? start : (typeof start === "string" && start.trim() ? Number(start) : NaN);
  if (!d || !s || !p || !Number.isFinite(t)) return "";
  return `${d}|${s}|${p}|${t}`;
}

export const keyOfShift = (sh) => (sh ? shiftKey(sh.day, sh.side, sh.id, sh.start) : "");

/* Guard the read. Rule 1: a record written by any earlier version still has to
   open, and an unreadable one is an empty week rather than a crash. */
export function readAttendance(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const marks = {};
  const bag = src.marks && typeof src.marks === "object" ? src.marks : {};
  Object.keys(bag).forEach((k) => {
    const m = bag[k];
    if (!m || typeof m !== "object") return;
    if (!STATUSES.includes(m.status)) return;   /* an unknown status is not a mark */
    marks[k] = {
      status: m.status,
      at: typeof m.at === "string" ? m.at : "",
      by: typeof m.by === "string" ? m.by : "",
      note: typeof m.note === "string" ? m.note : "",
    };
  });
  return { v: 1, monday: typeof src.monday === "string" ? src.monday : "", marks };
}

/* ── marking one shift ────────────────────────────────────────────────────
   Returns a WHOLE new record, like every other setter in this repo, so a
   caller cannot half-save.

   ⚠️ AN EMPTY STATUS CLEARS THE MARK rather than storing a blank one. A leader
   who taps the wrong row needs to be able to take it back, and a mark that
   says nothing is worse than no mark: it looks like somebody looked.
   ⚠️ `by` IS REQUIRED IN PRACTICE AND NOT ENFORCED HERE. Storing who said it is
   the difference between a record and a rumour, but refusing the save would
   lose a real observation over a missing name. The caller passes it; this
   keeps whatever arrives. */
export function markShift(record, key, status, by, note) {
  const rec = readAttendance(record);
  const k = String(key || "");
  if (!k) return rec;
  const marks = { ...rec.marks };
  if (!status) delete marks[k];
  else if (STATUSES.includes(status)) {
    marks[k] = {
      status,
      at: typeof note === "object" && note && note.at ? String(note.at) : new Date().toISOString(),
      by: String(by || ""),
      note: typeof note === "string" ? note : "",
    };
  } else return rec;                            /* unknown status changes nothing */
  return { ...rec, marks };
}

export const statusOf = (record, key) => {
  const m = readAttendance(record).marks[String(key || "")];
  return m ? m.status : "";
};

export const markOf = (record, key) => readAttendance(record).marks[String(key || "")] || null;

/* ── reading a week ───────────────────────────────────────────────────────
   `week` is a built schedule, `{ days: { Mon: { sides: { FOH: { shifts } } } } }`
   — the shape ScheduleBuilder saves. Walking it here rather than in the screen
   keeps one definition of "every shift in a week" (rule 8). */
export function eachShift(week, fn) {
  const days = (week && week.days) || {};
  Object.keys(days).forEach((day) => {
    const rec = days[day] || {};
    const sides = rec.sides || {};
    Object.keys(sides).forEach((side) => {
      const list = (sides[side] || {}).shifts;
      (Array.isArray(list) ? list : []).forEach((sh) => {
        if (sh && sh.id != null) fn({ ...sh, day, side, iso: rec.iso });
      });
    });
  });
}

/* One person's week: how many shifts, and what was marked against them.
   ⚠️ `unmarked` IS REPORTED, and it is the number a leader should read first.
   Three no-shows out of three marked shifts sounds like a crisis; three out of
   twenty-two, with nineteen never looked at, is a leader who marks the bad
   ones and skips the rest. Those are different facts about a person. */
export function countsFor(record, week, personId) {
  const rec = readAttendance(record);
  const me = String(personId == null ? "" : personId);
  const out = { shifts: 0, unmarked: 0, here: 0, late: 0, left: 0, calledout: 0, noshow: 0 };
  if (!me) return out;
  eachShift(week, (sh) => {
    if (String(sh.id) !== me) return;
    out.shifts += 1;
    const st = rec.marks[keyOfShift(sh)];
    if (!st) { out.unmarked += 1; return; }
    out[st.status] += 1;
  });
  return out;
}

/* Everything a leader would want to look at after a day or a week: only the
   shifts carrying a concern, newest information first is NOT used here because
   a week reads better in day order — which is the order `eachShift` walks. */
export function concernsIn(record, week) {
  const rec = readAttendance(record);
  const out = [];
  eachShift(week, (sh) => {
    const m = rec.marks[keyOfShift(sh)];
    if (m && CONCERNS.includes(m.status)) out.push({ ...sh, status: m.status, by: m.by, at: m.at, note: m.note });
  });
  return out;
}

/* How much of the week has actually been looked at. ⚠️ A LEADER NEEDS THIS
   BEFORE ANY OF THE COUNTS MEAN ANYTHING. A week marked 4% through is not a
   week with no problems. */
export function coverage(record, week) {
  const rec = readAttendance(record);
  let shifts = 0, marked = 0;
  eachShift(week, (sh) => { shifts += 1; if (rec.marks[keyOfShift(sh)]) marked += 1; });
  return { shifts, marked, unmarked: shifts - marked, pct: shifts ? Math.round((marked / shifts) * 100) : 0 };
}

/* ⚠️ DROP MARKS FOR SHIFTS THAT NO LONGER EXIST. A rebuild can move a shift,
   and its mark would then sit in the record forever, counting toward nothing
   and readable by nobody. Called on save, never on read — a read that quietly
   deleted data would be the worst kind of tidy.
   ⚠️ IT IS NOT CALLED AUTOMATICALLY ANYWHERE YET, on purpose: a leader who
   rebuilds a week they have already marked should be asked, not surprised. */
export function pruneToWeek(record, week) {
  const rec = readAttendance(record);
  const live = new Set();
  eachShift(week, (sh) => live.add(keyOfShift(sh)));
  const marks = {};
  let dropped = 0;
  Object.keys(rec.marks).forEach((k) => {
    if (live.has(k)) marks[k] = rec.marks[k];
    else dropped += 1;
  });
  return { record: { ...rec, marks }, dropped };
}

/* ══════════════════════════════════════════════════════════════════════════
   ★ WHICH HR INFRACTION A MARK CORRESPONDS TO, IF ANY.

   HR Console already holds this store's whole ladder — the ids below are its
   own, and Hannah's point values sit beside them there. This is a lookup, not
   a second ladder, so nothing here carries a point value and nothing here
   decides anything.

   ⚠️⚠️ IT SUGGESTS. IT DOES NOT FILE. A mark on a schedule is a leader noting
   what happened during a rush; an infraction is a document in somebody's
   personnel file with a point value attached. Turning the first into the second
   without a person deciding is exactly the automatic accusation the demerits
   module refuses to make, and the Guadalupe QIV case is the reason it refuses.

   ⇒ The intended use is: the screen offers "File this in HR", pre-filled with
   the person, the date and the scheduled times the schedule already knows, and
   a human presses it or does not.

   ⚠️ `late` CANNOT CHOOSE BETWEEN late5 AND late30 and must not guess. HR's two
   lateness lines split at thirty minutes and this file has no clock — see the
   warning at the top about why. It returns the under-30 line, which is the
   lighter of the two, and the screen must let a leader change it. Guessing
   upward would put a heavier point value on somebody because a leader tapped
   quickly.
   ══════════════════════════════════════════════════════════════════════════ */
export const HR_FOR_STATUS = Object.freeze({
  noshow: "ncns",
  late: "late5",
  calledout: "callout-notice",
  left: "",
  here: "",
});

export const hrIdFor = (status) => HR_FOR_STATUS[String(status || "")] || "";
