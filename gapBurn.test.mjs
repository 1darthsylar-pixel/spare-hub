/* ══════════════════════════════════════════════════════════════════════════
   gapBurn.test.mjs — AN UNFILLABLE TAIL MUST NOT EAT THE ROSTER. Aug 17 2026.

       node gapBurn.test.mjs

   Matt, testing a built week: **"there should never be any gaps and rn there
   are."** This is why there were.

   ⚠️⚠️ THE BUG, IN ONE LINE. When the greedy fill picked somebody who could not
   reach `minShift` from this slot, it did:

       if (end - t < minSlots) { takenToday.add(best.id); continue; }

   That reads as "stop offering this person" and MEANS "this person does not
   work today, on either side" — `takenToday` is shared across FOH and BOH on
   purpose, to stop the same body appearing on two boards at once.

   ⇒ Every day ends with a stretch of demand shorter than a legal shift. The
   `while` loop hit it, picked a candidate, burned them, picked the next, burned
   them, and walked the ENTIRE remaining roster into the ground. Then the side
   that built second got an empty pool and produced nothing at all.

   ★ MEASURED on this store's own Monday BOH, 480 fully-available people:
   **25 shifts built and 455 people marked used with no shift.** Across the
   week, FOH built ZERO shifts every single day, and the whole-week uncovered
   figure did not move whether the roster held 60 people or 480 — which is the
   tell, and the reason "hire more people" was never going to fix it.

   ⇒ `triedHere` is a per-SLOT set. It stops the loop asking the same person
   twice at the same start, which is all the original line was ever for. They
   are offered the next slot, and the other side of the building still sees
   them.

   ⚠️ THE SHARED `takenToday` IS NOT LOOSENED, and that is the line this fix
   must not cross. It still holds everybody who actually got a shift, so the
   double-booking guarantee is untouched — asserted below rather than promised.

   ⚠️ FAKE PEOPLE ONLY. */

import { buildDay, buildWeek, candidatesFor } from "./scheduleEngine.js";

let pass = 0;
const fails = [];
const ok = (what, cond, extra) => { if (cond) pass++; else fails.push(what + (extra ? ` — ${extra}` : "")); };

/* ── a day whose demand runs past what any legal shift can reach ────────
   One station open 6am to 11pm. `maxShift` is 8h and `minShift` is 3h, so
   however the day is filled there is a tail no single hire can legally take.
   That tail is what used to burn the roster. */
const LONG = { id: "reg", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 1380 }] };

const bigRoster = (n) => {
  const roster = [], avail = {}, skills = {};
  for (let i = 1; i <= n; i++) {
    const id = String(i);
    roster.push({ id, name: `Fake ${i}` });
    avail[id] = { days: { Mon: [{ start: 300, end: 1380 }] } };
    skills[id] = { jobs: { "DRIVE THRU": "advanced", FRIES: "advanced" } };
  }
  return { roster, avail, skills };
};

/* ══════════════════════════════════════════════════════════════════════════
   THE BURN ITSELF — people marked used who never got a shift.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const { roster, avail, skills } = bigRoster(120);
  const { candidates } = candidatesFor({
    roster, avail, skills, day: "Mon", side: "FOH",
    minors: new Set(), offIds: new Set(), terminated: new Set(), jobCodes: null,
  });
  ok("the pool is genuinely large", candidates.length === 120);

  const used = new Set();
  const day = buildDay({ stations: [LONG], candidates, state: { weekMin: {} }, used });
  const gotAShift = new Set(day.shifts.map((s) => String(s.id)));
  const burned = [...used].filter((id) => !gotAShift.has(String(id)));

  ok("★★ NOBODY IS MARKED USED WITHOUT A SHIFT", burned.length === 0,
    `${burned.length} burned of ${used.size} used, ${day.shifts.length} shifts`);
  ok("★★ AND THE REST OF THE ROSTER IS STILL FREE for the other side",
    day.unplaced.length >= 100, `${day.unplaced.length} unplaced`);
  ok("the day still built real shifts", day.shifts.length > 0);
  ok("every id in the used set really has a shift",
    [...used].every((id) => gotAShift.has(String(id))));
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CONSEQUENCE — the side that builds second used to get nothing.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const { roster, avail, skills } = bigRoster(120);
  const days = [{
    day: "Mon", iso: "2026-08-24",
    sides: {
      FOH: [LONG],
      BOH: [{ id: "fry", name: "FRIES", section: "KITCHEN", hours: [{ start: 360, end: 1380 }] }],
    },
  }];
  const wk = buildWeek({
    roster, avail, skills, minors: new Set(), days,
    timeOff: null, terminated: new Set(), jobCodes: null,
  });
  const foh = wk.days.Mon.sides.FOH.shifts;
  const boh = wk.days.Mon.sides.BOH.shifts;
  ok("★★ BOTH SIDES BUILD — neither is starved by the other",
    foh.length > 0 && boh.length > 0, `FOH ${foh.length}, BOH ${boh.length}`);

  /* ⚠️ THE GUARANTEE THE SHARED SET EXISTS FOR. One person, one clock. */
  const byId = {};
  [...foh, ...boh].forEach((s) => { (byId[s.id] = byId[s.id] || []).push(s); });
  let overlaps = 0;
  Object.values(byId).forEach((list) => {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) if (list[i].start < list[i - 1].end) overlaps++;
  });
  ok("★★ AND NOBODY IS ON BOTH BOARDS AT ONCE — the shared set still holds",
    overlaps === 0, `${overlaps} overlaps`);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE TELL — before the fix, MORE PEOPLE CHANGED NOTHING.

   ⚠️ This is the assertion that would have caught it. A scheduler whose output
   is byte-identical at 40 people and at 200 is not reading the roster.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const runWith = (n) => {
    const { roster, avail, skills } = bigRoster(n);
    const days = [{
      day: "Mon", iso: "2026-08-24",
      sides: {
        FOH: [LONG, { id: "win", name: "WINDOW", section: "DRIVE THRU", hours: [{ start: 360, end: 1380 }] }],
        BOH: [{ id: "fry", name: "FRIES", section: "KITCHEN", hours: [{ start: 360, end: 1380 }] }],
      },
    }];
    const wk = buildWeek({
      roster, avail, skills, minors: new Set(), days,
      timeOff: null, terminated: new Set(), jobCodes: null,
    });
    let shifts = 0, gapMin = 0;
    Object.values(wk.days.Mon.sides).forEach((s) => {
      shifts += s.shifts.length;
      (s.gaps || []).forEach((g) => { gapMin += g.end - g.start; });
    });
    return { shifts, gapMin };
  };

  const few = runWith(4);
  const many = runWith(200);
  ok("★★ A BIGGER ROSTER PRODUCES A BETTER WEEK",
    many.shifts > few.shifts || many.gapMin < few.gapMin,
    `4 people: ${few.shifts} shifts / ${few.gapMin}min short · 200: ${many.shifts} / ${many.gapMin}min`);
  ok("★ and a well-staffed day leaves only the tail no legal shift could take",
    many.gapMin <= 3 * 60, `${many.gapMin} minutes short`);
}

/* ══════════════════════════════════════════════════════════════════════════
   NOTHING THE ENGINE ALREADY PROMISED IS TRADED FOR THIS.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const { roster, avail, skills } = bigRoster(60);
  const days = [{
    day: "Mon", iso: "2026-08-24",
    sides: { FOH: [LONG], BOH: [{ id: "fry", name: "FRIES", section: "KITCHEN", hours: [{ start: 360, end: 1380 }] }] },
  }];
  const wk = buildWeek({
    roster, avail, skills, minors: new Set(), days,
    timeOff: null, terminated: new Set(), jobCodes: null,
  });
  const all = Object.values(wk.days.Mon.sides).flatMap((s) => s.shifts);
  ok("no shift is under the minimum", all.every((s) => s.end - s.start >= 180));
  ok("no shift is over the maximum", all.every((s) => s.end - s.start <= 480));
  ok("no shift falls outside availability", all.every((s) => s.start >= 300 && s.end <= 1380));
  ok("every shift names a real person", all.every((s) => s.id && s.name));
}

/* An empty roster still builds nothing rather than throwing, and the loop
   still terminates when NOBODY can take the slot. */
{
  const day = buildDay({ stations: [LONG], candidates: [], state: { weekMin: {} } });
  ok("an empty pool builds nothing and does not hang", day.shifts.length === 0);
  ok("and reports the whole row as a gap", (day.gaps || []).length > 0);
}

if (fails.length) {
  console.log(`\ngapBurn: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log(`  FAILED  ${f}`));
  process.exit(1);
}
console.log(`\ngapBurn: ${pass} passed`);
