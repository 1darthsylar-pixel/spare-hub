/* ============================================================================
   myShifts.test.mjs — a team member sees their own shifts and nobody else's.

       node myShifts.test.mjs

   Matt, Aug 14 2026: "how does the team see it and they need to only see their
   own. hannah, nick, bri and myself can see and edit the full schedule."

   ═══ WHY THIS IS THE TEST THAT MATTERS ══════════════════════════════════════
   "Lineup · My Shifts" went from tier 4 behind a four-name list to TIER 1 on
   the same day this was written. That means ~106 people can now open a screen
   whose memory holds the WHOLE built week for two weeks at once — every
   person, every shift, both sides.

   `shiftsForPerson` is the only thing between them and it. Nothing on that
   screen renders a shift this function did not hand back.

   ⚠️⚠️ SO A BUG HERE IS NOT A DISPLAY BUG. It is the schedule of 106 people on
   a team member's phone. Section 1 is the whole point of the file; everything
   else is the ways it could quietly stop being true.
   ============================================================================ */
import { shiftsForPerson } from "./availability.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const sh = (id, name, start, end, over) => ({ id, name, start, end, job: "DRIVE THRU", ...over });

/* A week shaped exactly as buildWeek writes it and kvSet stores it. */
const WEEK_A = {
  v: 1, monday: "2026-08-10",
  days: {
    Mon: { iso: "2026-08-10", sides: {
      FOH: { shifts: [sh("12", "Ashley Rangel-avila", 360, 840), sh("83", "Katia Bostic", 360, 780)] },
      BOH: { shifts: [sh("18", "Brandon Watlington", 300, 780)] },
    } },
    Wed: { iso: "2026-08-12", sides: {
      FOH: { shifts: [sh("12", "Ashley Rangel-avila", 660, 1020)] },
      BOH: { shifts: [] },
    } },
  },
};
const WEEK_B = {
  v: 1, monday: "2026-08-17",
  days: {
    Tue: { iso: "2026-08-18", sides: {
      FOH: { shifts: [sh("12", "Ashley Rangel-avila", 300, 660), sh("13", "Ashley Valadez", 1020, 1320)] },
    } },
  },
};

group("0. controls — the fixture really holds other people");
{
  const everyone = [WEEK_A, WEEK_B].flatMap((w) =>
    Object.values(w.days).flatMap((d) => Object.values(d.sides).flatMap((s) => s.shifts)));
  ok("six shifts across two weeks", everyone.length === 6, everyone.length);
  ok("four different people are in there", new Set(everyone.map((s) => s.id)).size === 4);
  /* ⚠️ TWO PEOPLE, THREE SHIFTS. Counting the shifts here and calling it people
     is the mistake this fixture exists to catch downstream, so it must not be
     the mistake in the control. */
  ok("★ and two of the PEOPLE are called Ashley",
    new Set(everyone.filter((s) => /^Ashley/.test(s.name)).map((s) => s.id)).size === 2);
}

group("1. ★★ OWN ONLY. THIS IS THE PERMISSION.");
{
  const mine = shiftsForPerson([WEEK_A, WEEK_B], "12");
  ok("★ three shifts came back", mine.length === 3, mine.length);
  ok("★★ EVERY ONE OF THEM IS MINE", mine.every((s) => s.id === "12"), mine.map((s) => s.id));
  ok("★★ Katia's shift is not in there", !mine.some((s) => s.name === "Katia Bostic"));
  ok("★★ Brandon's kitchen shift is not in there", !mine.some((s) => s.name === "Brandon Watlington"));
  ok("★★ THE OTHER ASHLEY'S SHIFT IS NOT IN THERE — the ids differ and only the id is read",
    !mine.some((s) => s.name === "Ashley Valadez"), mine.map((s) => s.name));

  const hers = shiftsForPerson([WEEK_A, WEEK_B], "13");
  ok("★ and she gets hers, not mine", hers.length === 1 && hers[0].name === "Ashley Valadez");
}

group("2. ⚠️⚠️ NO ID MEANS NO SHIFTS, NEVER EVERYBODY'S");
{
  /* `myId` is resolved by matching the signed-in name against the roster. It
     comes back "" for somebody the roster does not hold — a new hire not yet
     imported, or a name spelled differently. Failing OPEN there would put the
     whole store's schedule on that person's phone. */
  ok("★★ empty id → nothing", shiftsForPerson([WEEK_A, WEEK_B], "").length === 0);
  ok("★★ null id → nothing", shiftsForPerson([WEEK_A], null).length === 0);
  ok("★★ undefined id → nothing", shiftsForPerson([WEEK_A], undefined).length === 0);
  ok("a number id still works, ids are strings everywhere else",
    shiftsForPerson([WEEK_A], 12).length === 2, shiftsForPerson([WEEK_A], 12).length);
}

group("3. ★★ TWO WEEKS, BECAUSE A SCHEDULE IS BUILT AHEAD");
{
  /* The week of the 17th is built on the 14th. A screen reading only
     `weekKeyFor(new Date())` told every team member "You are not on the
     schedule this week" on the one day they most wanted to look. */
  const mine = shiftsForPerson([WEEK_A, WEEK_B], "12");
  ok("★ this week is in there", mine.some((s) => s.weekOf === "2026-08-10"));
  ok("★★ AND NEXT WEEK IS TOO", mine.some((s) => s.weekOf === "2026-08-17"), mine.map((s) => s.weekOf));
  ok("★★ EVERY ROW CARRIES ITS OWN WEEK — dropping a shift and approving a swap both key off it",
    mine.every((s) => !!s.weekOf));
  ok("the week is the one it actually came from",
    mine.find((s) => s.iso === "2026-08-18").weekOf === "2026-08-17");
  ok("only this week loaded is a working state", shiftsForPerson([WEEK_A, null], "12").length === 2);
  ok("★ nothing built yet is a working state, not a crash",
    shiftsForPerson([null, null], "12").length === 0);
}

group("4. ★ SOONEST FIRST");
{
  const mine = shiftsForPerson([WEEK_B, WEEK_A], "12");   /* deliberately out of order */
  ok("★ the list is by date whichever order the weeks arrive",
    mine.map((s) => s.iso).join(",") === "2026-08-10,2026-08-12,2026-08-18",
    mine.map((s) => s.iso));

  const twoOnADay = {
    v: 1, monday: "2026-08-10",
    days: { Mon: { iso: "2026-08-10", sides: {
      FOH: { shifts: [sh("12", "A", 900, 1200)] },
      BOH: { shifts: [sh("12", "A", 300, 600)] },
    } } },
  };
  ok("two shifts on one day sort by start time",
    shiftsForPerson([twoOnADay], "12").map((s) => s.start).join(",") === "300,900");
}

group("5. ★ THE DAY AND SIDE COME WITH IT, because the screen prints them");
{
  const mine = shiftsForPerson([WEEK_A], "18");
  ok("the side is on the row", mine[0].side === "BOH", mine[0].side);
  ok("the day name is on the row", mine[0].day === "Mon");
  ok("the date is on the row", mine[0].iso === "2026-08-10");
  ok("★ the original fields survive", mine[0].start === 300 && mine[0].job === "DRIVE THRU");
}

group("6. ⚠️ A HALF-WRITTEN WEEK IS READ, NOT THROWN ON");
{
  /* Rule 1: records written by older versions still have to read. Every one of
     these has been a real shape at some point in this key's life. */
  const junk = [
    { v: 1, monday: "x" },                                        /* no days at all */
    { v: 1, monday: "x", days: null },
    { v: 1, monday: "x", days: { Mon: null } },
    { v: 1, monday: "x", days: { Mon: { iso: "i" } } },           /* no sides */
    { v: 1, monday: "x", days: { Mon: { iso: "i", sides: { FOH: {} } } } },   /* no shifts */
    { v: 1, monday: "x", days: { Mon: { iso: "i", sides: { FOH: { shifts: null } } } } },
    { v: 1, monday: "x", days: { Mon: { iso: "i", sides: { FOH: { shifts: [null, 7] } } } } },
  ];
  let threw = "";
  junk.forEach((w, i) => { try { shiftsForPerson([w], "12"); } catch (e) { threw += `${i} `; } });
  ok("★ not one shape throws", threw === "", threw);
  ok("and none of them invents a shift", junk.every((w) => shiftsForPerson([w], "12").length === 0));
  ok("a junk weeks argument is not a crash",
    shiftsForPerson(null, "12").length === 0 && shiftsForPerson("nope", "12").length === 0);
}

if (fails.length) {
  console.log(`\nmyShifts: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nmyShifts: ${pass} passed`);
