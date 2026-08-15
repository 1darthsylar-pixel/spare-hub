/* ============================================================================
   rosterLearning.test.mjs — can the Hub read its own rosters?

       node rosterLearning.test.mjs

   Matt, Aug 14 2026: "i want the auto scheduler to learn from the uploaded
   weekly rosters how to assign shifts without any gaps", and "i want the
   scheduler to be smart and learn every week".

   ═══ THE FINDING THIS FILE EXISTS FOR ════════════════════════════════════
   Before any learning could be built, the reading had to be right, and it was
   not. `parseRanges` judges each time range on its own, which is correct for a
   station's posted hours and wrong for a roster line, where the ranges are
   contiguous segments of ONE shift running forward through the day.

   Measured on the real kitchen roster for Friday Aug 14 2026, 25 people:

        hour     old reading    真 reading
        5:00am        14             3
        9:00am        20            10
        1:00pm        16            13
        5:00pm         0            11
        9:00pm         0            10

   The old reading says the kitchen is EMPTY from 3pm onward, every day. Seven
   of those twenty-five people are closers whose line is a single evening
   segment, and every one of them was counted as morning staff.

   ⇒ A scheduler trained on that would have learned to staff a store that shuts
   after lunch. This test is the proof that it no longer does, and the numbers
   above are asserted rather than described.

   ⚠️ THE FIXTURES ARE REAL. Pulled from the live boards, Aug 14 2026.
   ============================================================================ */
import { parseRanges, parseShiftSegments, shiftSpan } from "./shiftHours.js";
import {
  readRoster, coverageOf, learnFrom, shortfall, nearestShape, SLOTS, SLOT_MIN,
} from "./rosterLearning.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`); }
};
const group = (n) => console.log(`\n── ${n}`);

/* The real kitchen board, week of Aug 10 2026. */
const BOH_FRI = ["Ana Turcios 5-11, 11-2", "Guadalupe Escamilla Villanueva 5-11, 11-2",
  "Jose Arias Cortez 5-8:30, 8:30-11, 11-2", "Lizbeth Gonzalez Ramos 5:15-11, 11-2",
  "Juana Romero 5:45-11, 11-2", "Chloe Jackson 6-11", "Samuel Jackson 6-11, 11-2",
  "Benjamin Underwood 7-11, 11-2", "Adriana Carrera Reyes 8:30-11, 11-2, 2-5",
  "Brandon Mcdowell 8:30-11, 11-2, 2-5", "Evelyn Lugo 11-2, 2-5",
  "Ivanna Vasquez Javier 11-2, 2-5", "Monica Cerros 11-2",
  "Yasmin Robles Torres 11-2, 2-5, 5-11", "Brooke Southern 2-5, 5-11",
  "Fatima Castellanos-olivares 2-5", "Hernan Mesa 2-5, 5-11", "Karis Tuggy 2-5, 5-11",
  "Benjamin Smith 5-11", "Fabian Luna 5-11", "Ismail Abuzaid 5-10",
  "Jaida Daugherty 5-10", "Jessica Acuna 5-8", "Josue Dominguez 5-11",
  "Odilma Medina 5-11"];
const BOH_MON = ["Ana Turcios 5-11, 11-2", "Guadalupe Escamilla Villanueva 5-11, 11-2",
  "Ryan Mcdowell 5-8:30, 8:30-11", "Lizbeth Gonzalez Ramos 5:15-11, 11-2",
  "Juana Romero 5:45-11, 11-2", "Chloe Jackson 6-11, 11-2", "Samuel Jackson 6-11, 11-2",
  "Ivanna Vasquez Javier 7-11", "Brandon Mcdowell 8:30-11, 11-2", "Benjamin Underwood 11-2",
  "Evelyn Lugo 11-2", "Jose Arias Cortez 11-2, 2-5", "Kimberley Garcia 2-5",
  "Phillip Velasquez-espinoza 11-2, 2-5", "Benjamin Smith 2-5, 5-11",
  "Fabian Luna 2-5, 5-8", "Hernan Mesa 2-5, 5-11", "Karis Tuggy 2-5, 5-11",
  "Deyfilia Gonzalez 5-11", "Jaida Daugherty 5-11", "Josue Dominguez 5-11",
  "Monica Cerros 5-11", "Odilma Medina 5-11"];

const at = (curve, hour) => curve[Math.round(hour * 60 / SLOT_MIN)];

group("0. controls — the modules loaded and really run");
{
  ok("readRoster is a function", typeof readRoster === "function");
  ok("learnFrom is a function", typeof learnFrom === "function");
  ok(`the grid is 96 quarter hours (${SLOTS})`, SLOTS === 96);
  ok("parseShiftSegments really runs", parseShiftSegments("5-11, 11-2").length === 2);
}

group("1. ★★ ONE LINE, READ IN DAY ORDER");
{
  ok("a morning line is unchanged", JSON.stringify(shiftSpan("Ana Turcios 5-11, 11-2")) === '{"start":5,"end":14}');
  ok("★ a line ending in the evening no longer runs backwards",
    JSON.stringify(shiftSpan("Yasmin Robles Torres 11-2, 2-5, 5-11")) === '{"start":11,"end":23}');
  ok("★ an afternoon start is not read as a morning one",
    JSON.stringify(shiftSpan("Brooke Southern 2-5, 5-11")) === '{"start":14,"end":23}');
  ok("a half-hour boundary survives",
    JSON.stringify(shiftSpan("Jose Arias Cortez 5-8:30, 8:30-11, 11-2")) === '{"start":5,"end":14}');
  ok("segments stay contiguous rather than overlapping",
    parseShiftSegments("Adriana Carrera Reyes 8:30-11, 11-2, 2-5")
      .every((s, i, a) => i === 0 || s.start >= a[i - 1].end - 0.001));

  /* ⚠️ THE CONTROL THAT NAMES THE BUG. Without this the assertions above could
     be describing behaviour that was always there. */
  const oldWay = (l) => { const r = parseRanges(l); return { start: Math.min(...r.map((x) => x.start)), end: Math.max(...r.map((x) => x.end)) }; };
  ok("★ the old reading really did run backwards (control)",
    oldWay("Yasmin Robles Torres 11-2, 2-5, 5-11").start === 5);
  ok("★ and really did lose the evening (control)",
    oldWay("Brooke Southern 2-5, 5-11").end === 17);

  ok("an unreadable line is null, never a zero-length shift at midnight",
    shiftSpan("Somebody with no hours") === null);
  ok("empty is null too", shiftSpan("") === null && shiftSpan(null) === null);
}

group("2. ★★ A WHOLE ROSTER — the closers whose line cannot say");
{
  const r = readRoster(BOH_FRI);
  ok("every one of the 25 lines read", r.shifts.length === 25, String(r.shifts.length));
  ok("none unreadable", r.unreadable === 0, String(r.unreadable));
  ok("★ the list was recognised as sorted", r.sorted === true);
  ok("★ seven closers were lifted to the evening", r.lifted === 7, String(r.lifted));

  /* ⚠️ AND IT IS REPORTED. A parser that quietly rewrites its input is the bug
     this file was written about, one level up. */
  ok("the lift is counted, not silent", typeof r.lifted === "number");
}

group("3. ★★ THE NUMBERS THAT MATTER — a kitchen that is open in the evening");
{
  const c = coverageOf(readRoster(BOH_FRI).shifts);
  console.log(`        5am ${at(c, 5)} · 9am ${at(c, 9)} · 1pm ${at(c, 13)} · 5pm ${at(c, 17)} · 9pm ${at(c, 21)}`);
  ok("3 people open at 5am", at(c, 5) === 3, String(at(c, 5)));
  ok("10 on at 9am", at(c, 9) === 10, String(at(c, 9)));
  ok("13 on at 1pm", at(c, 13) === 13, String(at(c, 13)));
  ok("★ 11 on at 5pm, not zero", at(c, 17) === 11, String(at(c, 17)));
  ok("★ 10 on at 9pm, not zero", at(c, 21) === 10, String(at(c, 21)));
  ok("the peak is at lunch, not at breakfast", c.indexOf(Math.max(...c)) === 11 * 4);

  /* The control, spelled out, because this is the whole finding. */
  const old = BOH_FRI.map((l) => { const p = parseRanges(l); return { start: Math.min(...p.map((x) => x.start)), end: Math.max(...p.map((x) => x.end)) }; });
  const co = coverageOf(old);
  ok("★ the old reading really did say NOBODY at 5pm (control)", at(co, 17) === 0, String(at(co, 17)));
  ok("★ and really did say 14 at 5am (control)", at(co, 5) === 14, String(at(co, 5)));
  ok("★ so the old peak was breakfast, which is the wrong shape entirely (control)",
    co.indexOf(Math.max(...co)) < 10 * 4);
}

group("4. ⚠️ A LIST THAT IS NOT SORTED IS LEFT ALONE");
{
  /* A confident correction to a hand-edited list would invent shifts. */
  const scrambled = ["Somebody 5-11", "Another 5-11, 11-2", "Third 11-2, 2-5", "Fourth 6-11, 11-2"];
  const r = readRoster(scrambled);
  ok("the firm lines do not ascend, so it is not treated as sorted", r.sorted === false);
  ok("★ and nothing was lifted", r.lifted === 0, String(r.lifted));
  ok("every line still read", r.shifts.length === 4);
}

group("5. ⚠️ AN EMPTY ROSTER IS NO DATA, NOT NO STAFF");
{
  /* 22 of the saved day-boards were never imported. Averaging them in would
     teach the engine that a whole weekday needs half its staff. */
  const boards = { BOH: {
    "2026-08-03": { Friday: { roster: BOH_FRI }, Saturday: { roster: [] } },
    "2026-08-10": { Friday: { roster: BOH_FRI }, Saturday: { roster: [] } },
  } };
  const L = learnFrom(boards);
  ok("Friday learned from 2 weeks", L.BOH.Fri.weeks === 2, String(L.BOH.Fri.weeks));
  ok("★ Saturday learned from ZERO, not from two empty ones", L.BOH.Sat.weeks === 0, String(L.BOH.Sat.weeks));
  ok("★ and Saturday's curve is flat zero rather than a low number",
    L.BOH.Sat.coverage.every((n) => n === 0));
  ok("a day nobody imported has no headcount to quote", L.BOH.Sat.headcount === 0);
  ok("Friday does have one", L.BOH.Fri.headcount === 25, String(L.BOH.Fri.headcount));
  ok("and a day with no weeks has no shapes", L.BOH.Sat.shapes.length === 0);
}

group("6. what it learned about Friday");
{
  const L = learnFrom({ BOH: { w1: { Friday: { roster: BOH_FRI } }, w2: { Monday: { roster: BOH_MON } } } });
  const fri = L.BOH.Fri;
  ok("peak is 13", fri.peak === 13, String(fri.peak));
  ok("peak lands at 11am", fri.peakAt === 11 * 60, String(fri.peakAt));
  ok("★ the shapes are real shifts the store uses", fri.shapes.length > 0);
  console.log("        top shapes: " + fri.shapes.slice(0, 4).map((s) => `${s.start}-${s.end}×${s.count}`).join(", "));
  ok("the most-used shape is used more than once", fri.shapes[0].count > 1);
  ok("★ every shape ends after it starts", fri.shapes.every((s) => s.end > s.start));
  ok("★ and none of them runs past midnight", fri.shapes.every((s) => s.end <= 24));
  ok("Monday learned separately", L.BOH.Mon.weeks === 1 && L.BOH.Mon.headcount === 23,
    `${L.BOH.Mon.weeks}/${L.BOH.Mon.headcount}`);
  ok("a weekday with no board at all is empty, not missing", L.BOH.Tue.weeks === 0);
}

group("7. shortfall — where a proposed week is under what the store really runs");
{
  const want = coverageOf(readRoster(BOH_FRI).shifts);
  ok("a week matching the store exactly is short nowhere", shortfall(want, want).length === 0);

  /* Half the evening staff. */
  const thin = want.map((n, t) => (t >= 17 * 4 ? Math.max(0, n - 4) : n));
  const gaps = shortfall(thin, want);
  ok("★ the thin evening is found", gaps.length === 1, JSON.stringify(gaps));
  ok("★ and it says WHEN", gaps[0].startMin === 17 * 60, String(gaps[0].startMin));
  ok("★ and by HOW MANY", gaps[0].short === 4, String(gaps[0].short));
  ok("consecutive slots are merged into one span, not 24 rows", gaps.length === 1);

  /* ⚠️ TOLERANCE IS PEOPLE, NOT A PERCENTAGE. */
  ok("one short is forgiven at tolerance 1",
    shortfall(want.map((n) => Math.max(0, n - 1)), want, 1).length === 0);
  ok("two short is not", shortfall(want.map((n) => Math.max(0, n - 2)), want, 1).length > 0);
  ok("an empty proposal is short everywhere the store staffs",
    shortfall(new Array(SLOTS).fill(0), want).length > 0);
}

group("8. nearestShape — a generated shift should look like a real one");
{
  const shapes = learnFrom({ BOH: { w1: { Friday: { roster: BOH_FRI } } } }).BOH.Fri.shapes;
  const near = nearestShape(shapes, 5, 14);
  ok("★ an opening span finds a real opening shift", near && near.start === 5 && near.end === 14,
    JSON.stringify(near));
  /* ⚠️ NULL RATHER THAN NEAREST-AT-ANY-DISTANCE. A four-hour hole answered with
     a nine-hour opening shift is worse than the arithmetic it replaced. */
  ok("★ nothing close enough returns null, not the least-bad", nearestShape(shapes, 1, 3) === null);
  ok("junk in does not throw", nearestShape(null, 5, 14) === null);
  ok("an empty shape list is null", nearestShape([], 5, 14) === null);
}

if (fails.length) {
  console.log(`\nrosterLearning: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nrosterLearning: ${pass} passed`);
