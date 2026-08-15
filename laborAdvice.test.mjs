/* Cut, add and move advice from the store's own daypart history.

   Matt, Aug 14 2026: "i want built in the abilty to suggest what to cut or add
   and where as well as when", then "based on daypart from the previous month
   report", then "Your rec" to move-before-cut.

   ⚠️ THE NUMBERS BELOW ARE HIS REAL JULY 2026 FIGURES, read out of
   `gcfcr-daypart-labor-v1` in production. They are here because a fixture I
   invented would have proved my arithmetic against my own assumptions, and the
   whole point of this module is that his stored report is already the input.
   They are also the reason the shape assertions matter: if the record ever
   stops carrying `sales` and `hours` per daypart per weekday, these fail. */
import {
  ADVICE_PARTS, ADVICE_DAYS,
  readMonths, latestMonth, monthById, partsIn,
  productivity, partAverage, goalsFromHistory, adviceForDay, adviceLine, plannedByPart,
} from "./laborAdvice.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };
const near = (a, b, t = 0.05) => a != null && Math.abs(a - b) <= t;

/* His real record, both months, Mon..Sat. */
const REAL = [
  { id: "2026-06", label: "June 2026",
    hours: { Breakfast: [85.9, 87.4, 85.7, 89.3, 88.9, 77.5], Lunch: [107.4, 105.7, 105.4, 106.9, 121.2, 105.5],
             Afternoon: [70.3, 68.7, 68.4, 70.5, 83.1, 71.5], Dinner: [115.3, 119.2, 115.5, 133, 140.1, 137.9] },
    sales: { Breakfast: [4501, 4595, 4816, 5983, 6417, 5081], Lunch: [9794, 9584, 9618, 10415, 11041, 10377],
             Afternoon: [6366, 6044, 6122, 6702, 7830, 7890], Dinner: [9301, 9707, 9863, 11259, 11788, 10905] } },
  { id: "2026-07", label: "July 2026",
    hours: { Breakfast: [86.9, 88.1, 86.2, 88.0, 89.4, 78.0], Lunch: [105.5, 110.6, 103.9, 106.9, 121.4, 103.2],
             Afternoon: [70.0, 68.0, 68.0, 70.0, 83.0, 71.0], Dinner: [114.3, 119.1, 118.8, 133.1, 136.2, 100.7] },
    sales: { Breakfast: [4275, 4229, 4595, 5034, 5820, 5382], Lunch: [9527, 9080, 9320, 9845, 10890, 8958],
             Afternoon: [6300, 5882, 6147, 6580, 7603, 6603], Dinner: [9144, 9182, 9920, 10222, 11005, 7341] } },
];

/* ── reading it ─────────────────────────────────────────────────────────── */
{
  ok("both months read", readMonths(REAL).length === 2);
  ok("★ the latest month is picked, not the first in the array",
    latestMonth(REAL).id === "2026-07", latestMonth(REAL) && latestMonth(REAL).id);
  ok("a named month can be asked for", monthById(REAL, "2026-06").label === "June 2026");
  ok("an unknown month is null, not the nearest", monthById(REAL, "2026-01") === null);
  ok("the `{months:[…]}` shape reads too", readMonths({ months: REAL }).length === 2);
  ok("★ nothing stored is empty, never a throw",
    readMonths(null).length === 0 && latestMonth(null) === null && latestMonth([]) === null);
  ok("junk rows are dropped rather than half-read",
    readMonths([null, {}, { id: "x" }, "nope"]).length === 1);
  ok("all four dayparts are present in his record",
    partsIn(latestMonth(REAL)).join("|") === "Breakfast|Lunch|Afternoon|Dinner",
    partsIn(latestMonth(REAL)).join("|"));
  ok("★ a daypart with sales but no hours is NOT offered — it would divide by nothing",
    partsIn({ sales: { Lunch: [1], Dinner: [1] }, hours: { Lunch: [1] } }).join("|") === "Lunch");
}

/* ── the number, checked against the live figures ───────────────────────── */
{
  const jul = latestMonth(REAL);
  /* Measured in production: Tue breakfast $48.0, Tue lunch $82.1, Sat dinner $72.9 */
  ok("★★ Tuesday breakfast is his real $48.0/hr",
    near(productivity(jul, "Breakfast", 1), 48.0, 0.1), String(productivity(jul, "Breakfast", 1)));
  ok("★★ Tuesday lunch is his real $82.1/hr",
    near(productivity(jul, "Lunch", 1), 82.1, 0.1), String(productivity(jul, "Lunch", 1)));
  ok("★★ Saturday dinner is his real $72.9/hr",
    near(productivity(jul, "Dinner", 5), 72.9, 0.1), String(productivity(jul, "Dinner", 5)));
  ok("★ Monday is index 0 and Saturday is 5, six days, no Sunday",
    ADVICE_DAYS.length === 6 && ADVICE_DAYS[0] === "Mon" && ADVICE_DAYS[5] === "Sat");
  ok("★★ a seventh day answers null rather than reading past the array",
    productivity(jul, "Lunch", 6) === null && productivity(jul, "Lunch", -1) === null);
  ok("★★ zero hours answers null, NEVER Infinity or 0",
    productivity({ sales: { L: [100] }, hours: { L: [0] } }, "L", 0) === null);
  ok("★ a missing daypart answers null", productivity(jul, "Nope", 0) === null);
  ok("★ and no month answers null", productivity(null, "Lunch", 0) === null);
}

/* ── the goal off his own history ───────────────────────────────────────── */
{
  const g = goalsFromHistory(REAL);
  ok("★ a goal comes back for every daypart he fills in",
    ADVICE_PARTS.every((p) => typeof g[p] === "number"), JSON.stringify(Object.keys(g)));
  ok("★★ breakfast really is his weakest daypart and the goal reflects it",
    g.Breakfast < g.Dinner && g.Dinner < g.Lunch,
    `B${Math.round(g.Breakfast)} D${Math.round(g.Dinner)} L${Math.round(g.Lunch)}`);
  /* ⚠️⚠️ WEIGHTED BY HOURS, AND PROVEN ON A CASE WHERE IT MATTERS.
     🐛 MY FIRST VERSION ASSERTED THIS ON HIS REAL LUNCH AND FAILED BY A CENT —
     88.44 weighted against 88.45 mean — because his lunch hours barely vary
     from day to day, so the two agree. The code was right; the fixture could
     not tell the two apart. A deliberate case can: one huge cheap day against
     five tiny rich ones. A plain mean says $90/hr, which is the number a busy
     Saturday would never recognise. */
  const lopsided = { sales: { P: [1000, 10, 10, 10, 10, 10] }, hours: { P: [100, 0.1, 0.1, 0.1, 0.1, 0.1] } };
  const plainMean = ADVICE_DAYS.reduce((a, _, i) => a + productivity(lopsided, "P", i), 0) / 6;
  ok("★★ the goal is hours-weighted, not a mean of the daily rates",
    near(partAverage(lopsided, "P"), 1050 / 100.5, 0.01) && Math.abs(partAverage(lopsided, "P") - plainMean) > 10,
    `weighted ${partAverage(lopsided, "P").toFixed(2)} vs mean ${plainMean.toFixed(2)}`);
  ok("★ and on his real data the two are close, which is why the case above is synthetic",
    Math.abs(partAverage(latestMonth(REAL), "Lunch") - 88.44) < 0.1,
    String(partAverage(latestMonth(REAL), "Lunch")));
  ok("no history, no goals, and no throw", Object.keys(goalsFromHistory(null)).length === 0);
}

/* ── MOVE BEFORE CUT, which is the whole opinion ────────────────────────── */
{
  const jul = latestMonth(REAL);
  /* One daypart well under goal, one well over, same day. */
  const goals = { Breakfast: 60, Lunch: 80, Afternoon: 90, Dinner: 80 };
  const planned = { Breakfast: 88, Lunch: 106, Afternoon: 68, Dinner: 119 };
  const out = adviceForDay({ month: jul, goals, dayIndex: 1, plannedHours: planned });

  const kinds = out.map((a) => a.kind);
  ok("★ it says something about a day this far off goal", out.length > 0, JSON.stringify(kinds));
  ok("★★ breakfast is flagged — $48 against a $60 goal is OVERSTAFFED, not under",
    out.some((a) => a.from === "Breakfast"), JSON.stringify(out.map((a) => `${a.kind}:${a.from}->${a.to}`)));
  ok("★★ A MOVE IS OFFERED BEFORE ANY CUT",
    kinds.indexOf("move") === -1 || kinds.indexOf("cut") === -1 || kinds.indexOf("move") < kinds.indexOf("cut"),
    JSON.stringify(kinds));
  ok("★★ and the move goes INTO a daypart that is short, never into thin air",
    out.filter((a) => a.kind === "move").every((a) => a.to && a.to !== a.from),
    JSON.stringify(out.filter((a) => a.kind === "move")));

  /* Nothing short on the day → the surplus becomes a real cut. */
  const only = adviceForDay({
    month: jul, goals: { Breakfast: 60 }, dayIndex: 1, plannedHours: { Breakfast: 88 } });
  ok("★★ with nothing to move it into, it IS a cut",
    only.length === 1 && only[0].kind === "cut" && only[0].from === "Breakfast",
    JSON.stringify(only));
  ok("★ and a cut is capped at a third of the daypart, so it stays actionable",
    only[0].hours <= 88 / 3 + 0.001, String(only[0].hours));
}

/* ── silence is the default ─────────────────────────────────────────────── */
{
  const jul = latestMonth(REAL);
  const g = goalsFromHistory(REAL);
  /* Goals taken from the same month it is judging: nothing should be far off. */
  const planned = { Breakfast: 88, Lunch: 106, Afternoon: 68, Dinner: 119 };
  const quiet = adviceForDay({ month: jul, goals: g, dayIndex: 2, plannedHours: planned });
  ok("★★ judged against its own average, a normal day is QUIET",
    quiet.length === 0, JSON.stringify(quiet.map((a) => `${a.kind} ${a.from}`)));

  ok("no month, no advice", adviceForDay({ month: null, goals: g, dayIndex: 1, plannedHours: planned }).length === 0);
  ok("no planned hours, no advice", adviceForDay({ month: jul, goals: g, dayIndex: 1 }).length === 0);
  ok("no goals, no advice", adviceForDay({ month: jul, dayIndex: 1, plannedHours: planned }).length === 0);
  ok("★ a daypart with no planned hours is skipped rather than divided by zero",
    adviceForDay({ month: jul, goals: { Breakfast: 60 }, dayIndex: 1, plannedHours: { Breakfast: 0 } }).length === 0);
  ok("★ Sunday says nothing", adviceForDay({ month: jul, goals: g, dayIndex: -1, plannedHours: planned }).length === 0);
  ok("★★ a wider tolerance makes it quieter, never louder",
    adviceForDay({ month: jul, goals: { Breakfast: 60 }, dayIndex: 1, plannedHours: { Breakfast: 88 }, tolerance: 0.9 }).length === 0);
  ok("junk in, empty out, no throw", adviceForDay({}).length === 0 && adviceForDay().length === 0);
}

/* ── the sentence a leader reads ────────────────────────────────────────── */
{
  ok("★ a move reads plainly",
    adviceLine({ kind: "move", from: "Breakfast", to: "Lunch", hours: 12.34 }, "Tue")
      === "Tue move 12.3h from Breakfast to Lunch.",
    adviceLine({ kind: "move", from: "Breakfast", to: "Lunch", hours: 12.34 }, "Tue"));
  ok("★ a cut carries the number it was judged on",
    adviceLine({ kind: "cut", from: "Breakfast", hours: 15, ran: 48, goal: 60 }, "Tue")
      === "Tue cut 15h from Breakfast. It ran $48/hr against $60.",
    adviceLine({ kind: "cut", from: "Breakfast", hours: 15, ran: 48, goal: 60 }, "Tue"));
  ok("an add reads plainly",
    adviceLine({ kind: "add", to: "Lunch", hours: 6, ran: 120, goal: 100 }).startsWith("add 6h to Lunch."));
  ok("nothing in, empty string out", adviceLine(null) === "");
}

/* ── the join between the schedule's dayparts and the report's ──────────── */
{
  const jul = latestMonth(REAL);
  /* ⚠️⚠️ THE REAL KEYS FROM BOTH SIDES, read off the live config Aug 14 2026.
     NOT ONE OF THEM MATCHES the report's, which is the whole reason this
     function exists — a naive join finds zero dayparts and the panel is empty
     on every day for ever, green and silent and wrong. */
  const SCHED = [
    { key: "breakfast", label: "Breakfast" }, { key: "lunch", label: "Lunch" },
    { key: "mid", label: "Mid" }, { key: "night", label: "Night" },
  ];
  const hours = { breakfast: 88, lunch: 106, mid: 68, night: 119 };

  ok("★★ not one schedule key equals a report key, which is the trap",
    SCHED.every((d) => !ADVICE_PARTS.includes(d.key)));

  const mapped = plannedByPart(hours, SCHED, jul);
  ok("★★ mapped BY POSITION onto the report's names",
    mapped && mapped.Breakfast === 88 && mapped.Lunch === 106 &&
    mapped.Afternoon === 68 && mapped.Dinner === 119, JSON.stringify(mapped));
  ok("★ mid becomes Afternoon and night becomes Dinner, which name matching could never do",
    mapped.Afternoon === 68 && mapped.Dinner === 119);

  /* A store that renames its third part still works, because nothing here
     reads the word. */
  const renamed = [{ key: "b" }, { key: "l" }, { key: "snack" }, { key: "d" }];
  ok("★ another store's daypart words do not break it",
    JSON.stringify(plannedByPart({ b: 1, l: 2, snack: 3, d: 4 }, renamed, jul))
      === JSON.stringify({ Breakfast: 1, Lunch: 2, Afternoon: 3, Dinner: 4 }));

  ok("★★ MISMATCHED COUNTS REFUSE rather than pairing the first four",
    plannedByPart(hours, SCHED.slice(0, 3), jul) === null &&
    plannedByPart(hours, [...SCHED, { key: "late" }], jul) === null);
  ok("★ a daypart with no planned hours is left out, not zeroed",
    !("Dinner" in (plannedByPart({ breakfast: 88, lunch: 1, mid: 1, night: 0 }, SCHED, jul) || {})));
  ok("nothing in, null out, no throw",
    plannedByPart(null, null, null) === null && plannedByPart({}, SCHED, null) === null);

  /* End to end: the mapped hours really do drive advice. */
  const out = adviceForDay({ month: jul, goals: { Breakfast: 60 }, dayIndex: 1, plannedHours: mapped });
  ok("★★ and the mapped hours feed the advice for real",
    out.length === 1 && out[0].from === "Breakfast", JSON.stringify(out));
}

/* ── it names no store ──────────────────────────────────────────────────── */
{
  const src = [productivity, adviceForDay, goalsFromHistory, adviceLine].map(String).join("\n");
  ["Gate City", "04010", "WINDOW", "REGISTER", "Matt", "48", "82.1"].forEach((w) =>
    ok(`no "${w}" in the code`, !src.includes(w)));
}

if (fails.length) {
  console.log(`laborAdvice: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`laborAdvice: ${pass} passed`);
