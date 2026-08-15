/* The engine marking a placement as training, off the store's own boards.

   Matt, Aug 14 2026: "can the schedule and setup auto fill the training
   positions for people when assigned to different ones?" Then, choosing the
   board history over a certification list: "your rec".

   ⚠️⚠️ MOST OF THIS FILE EXISTS TO PROVE THE MARK IS SILENT WHEN IT SHOULD BE.
   The flag ends up on a board a leader prints. A missing mark costs a hint; a
   wrong one puts "in training" beside a veteran's name on the wall. Every
   "do not mark" case below is a real way that could happen. */
import { assignPositions } from "./scheduleEngine.js";
import { placementMemory } from "./boardHistory.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };

const H = (start, end) => [{ start, end }];

/* Two stations, both open all day, both on the store's priority list. */
const STATIONS = [
  { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: H(600, 900) },
  { id: "window", name: "WINDOW", section: "FRONT LINE", hours: H(600, 900) },
  { id: "cleanliness", name: "CLEANLINESS", section: "FRONT LINE", hours: H(600, 900) },
];

const PRIORITIES = { v: 1, mode: "suggest", sides: { FOH: ["DRINKS", "WINDOW"], BOH: [] } };

const ROSTER = [{ id: "1", name: "Dana Reyes" }, { id: "2", name: "Sam Okafor" }];

/* A board where Dana has only ever stood on WINDOW and Sam only on DRINKS.
   Eight cells each, which clears the six-cell "do we know this person" bar. */
const board = (role, person, n) => {
  const days = {};
  for (let i = 0; i < n; i++) {
    days[`Day${i}`] = { stations: [{ role: `${role} (6AM-11PM)`, breakfast: person, lunch: "", mid: "", night: "" }] };
  }
  return days;
};
const BOARDS = [board("WINDOW", "Dana", 8), board("DRINKS", "Sam", 8)];
const MEMORY = placementMemory(BOARDS, ROSTER);

const shift = (id, name) => ({ id, name, start: 600, end: 900, job: "DRIVE THRU", skill: 3, side: "FOH" });

/* ── the history reads back the way the mark depends on ─────────────────── */
{
  ok("★ Dana's history is WINDOW and only WINDOW",
    MEMORY.rolesOf("1").join("|") === "WINDOW", JSON.stringify(MEMORY.rolesOf("1")));
  ok("★ Sam's is DRINKS and only DRINKS",
    MEMORY.rolesOf("2").join("|") === "DRINKS", JSON.stringify(MEMORY.rolesOf("2")));
  ok("we hold eight cells for each", MEMORY.cellsOf("1") === 8 && MEMORY.cellsOf("2") === 8);
  ok("★ somebody the boards never named has no history and no cells",
    MEMORY.rolesOf("99").length === 0 && MEMORY.cellsOf("99") === 0);
}

/* ── the mark itself ──────────────────────────────────────────────────────
   🐛 MY FIRST FIXTURE PROVED THE OPPOSITE AND THE CODE WAS RIGHT. It opened
   all three stations for both people, and the engine correctly sent each
   anchor HOME — Dana to WINDOW, Sam to DRINKS — so nobody was on a station
   they had never worked and nothing was marked. That is the memory rule doing
   its job, not a bug. To test a training placement you have to FORCE one, so
   each scenario below opens exactly the station it is asking about. */
const only = (st) => STATIONS.filter((s) => s.name === st);
const run = (station, who, opts) =>
  assignPositions(only(station), [shift(who, who === "1" ? "Dana Reyes" : "Sam Okafor")],
    { memory: MEMORY, training: PRIORITIES, ...(opts || {}) });

{
  const drinks = run("DRINKS", "1").filled[0];
  ok("★★ Dana on DRINKS, which she has never worked, is marked training",
    !!drinks && drinks.training === true, JSON.stringify(drinks));
  ok("★ and it carries the store's own priority number",
    !!drinks && drinks.priority === 1, drinks && String(drinks.priority));

  const win = run("WINDOW", "2").filled[0];
  ok("★★ Sam on WINDOW, which he has never worked, is marked too, at priority 2",
    !!win && win.training === true && win.priority === 2, JSON.stringify(win));

  const home = run("WINDOW", "1").filled[0];
  ok("★★ NOBODY IS MARKED ON A STATION THEY ALREADY WORK",
    !!home && home.training === undefined, JSON.stringify(home));

  const clean = run("CLEANLINESS", "1").filled[0];
  ok("★★ AND NOTHING IS MARKED ON A STATION THE STORE NEVER RANKED",
    !!clean && clean.training === undefined, JSON.stringify(clean));

  /* ⚠️ RULE 1. An ordinary row must be the object every existing reader
     already handles, with no new keys at all — not `training: false`. */
  ok("★★ an ordinary row grows NO new keys, not even a false one",
    clean && Object.keys(clean).sort().join(",") === "end,id,name,section,start,station",
    clean && Object.keys(clean).sort().join(","));
}

/* ── every way it must stay silent ──────────────────────────────────────── */
{
  const shifts = [shift("1", "Dana Reyes"), shift("2", "Sam Okafor")];

  const noList = assignPositions(STATIONS, shifts, { memory: MEMORY });
  ok("★★ NO PRIORITY LIST, NO MARKS ANYWHERE — the engine behaves as before",
    noList.filled.every((f) => f.training === undefined),
    JSON.stringify(noList.filled.filter((f) => f.training)));

  const noHistory = assignPositions(STATIONS, shifts, { training: PRIORITIES });
  ok("★★ NO HISTORY, NO MARKS. Never having measured is not evidence of never having done it",
    noHistory.filled.every((f) => f.training === undefined));

  const noArgs = assignPositions(STATIONS, shifts);
  ok("and no history argument at all still works and marks nothing",
    noArgs.filled.length > 0 && noArgs.filled.every((f) => f.training === undefined));

  /* ⚠️⚠️ THE ONE THAT WOULD PUT A WRONG WORD ON A PRINTED BOARD. Two cells is
     not "they have never worked drinks", it is "we barely know them" — and the
     commonest cause of that is a board name this roster could not tell between
     two people who share a first name. */
  const thin = placementMemory([board("WINDOW", "Dana", 2)], ROSTER);
  const thinOut = assignPositions(only("DRINKS"), [shift("1", "Dana Reyes")],
    { memory: thin, training: PRIORITIES });
  ok("★★ SOMEBODY WE BARELY KNOW IS NEVER MARKED",
    thinOut.filled.every((f) => f.training === undefined),
    JSON.stringify(thinOut.filled));
  ok("and the bar can be moved by the caller, not by editing this engine",
    assignPositions(only("DRINKS"), [shift("1", "Dana Reyes")],
      { memory: thin, training: PRIORITIES, minCells: 1 })
      .filled.some((f) => f.training === true));

  /* A person the boards never named at all. Brand new, or unresolvable. */
  const unknown = assignPositions(only("DRINKS"), [{ ...shift("1", "Dana Reyes"), id: "99", name: "New Person" }],
    { memory: MEMORY, training: PRIORITIES });
  ok("★★ AND SOMEBODY THE BOARDS NEVER NAMED IS NEVER MARKED",
    unknown.filled.every((f) => f.training === undefined),
    JSON.stringify(unknown.filled));

  const bohSide = assignPositions(only("DRINKS"),
    [{ ...shift("1", "Dana Reyes"), side: "BOH" }], { memory: MEMORY, training: PRIORITIES });
  ok("★ a shift on the other side reads that side's list, which is empty here",
    bohSide.filled.every((f) => f.training === undefined), JSON.stringify(bohSide.filled));

  const noSide = assignPositions(only("DRINKS"),
    [{ ...shift("1", "Dana Reyes"), side: undefined }], { memory: MEMORY, training: PRIORITIES });
  ok("★ a shift with no side is never marked rather than guessed at",
    noSide.filled.every((f) => f.training === undefined), JSON.stringify(noSide.filled));
}

/* ── it does not change WHO is chosen ───────────────────────────────────── */
{
  /* ⚠️⚠️ THE MARK MUST BE INERT. If wanting to train somebody could reach the
     choice, the least experienced person lands on the station that needs one
     most, at peak. Same input, with and without the list: identical placements
     down to the person on every station. */
  const shifts = [shift("1", "Dana Reyes"), shift("2", "Sam Okafor")];
  const withList = assignPositions(STATIONS, shifts, { memory: MEMORY, training: PRIORITIES });
  const without = assignPositions(STATIONS, shifts, { memory: MEMORY });
  const shape = (r) => r.filled.map((f) => `${f.station}:${f.id}:${f.start}-${f.end}`).join(" | ");
  ok("★★ THE SAME PEOPLE LAND ON THE SAME STATIONS, WITH AND WITHOUT THE LIST",
    shape(withList) === shape(without), `${shape(withList)}   VS   ${shape(without)}`);
  ok("and the same number of holes", withList.holes.length === without.holes.length);
}

/* ── the per-person block shape the board reads ─────────────────────────── */
{
  /* 🐛 AND ONE MORE OF MINE. Opening both stations for the SAME hours gives one
     person one block, not two — she can only stand in one place. The stations
     have to run BACK TO BACK for her to cover her own station and then one she
     has never worked, which is the shape a real day produces. */
  const out = assignPositions(
    [
      { id: "drinks", name: "DRINKS", section: "FRONT LINE", hours: H(600, 750) },
      { id: "window", name: "WINDOW", section: "FRONT LINE", hours: H(750, 900) },
    ],
    [shift("1", "Dana Reyes")],
    { memory: MEMORY, training: PRIORITIES });
  const dana = out.rows.find((r) => r.id === "1");
  const trainBlock = dana && dana.blocks.find((b) => b.job === "DRINKS");
  const homeBlock = dana && dana.blocks.find((b) => b.job === "WINDOW");
  ok("★ the training flag reaches the per-person blocks the board reads",
    !!trainBlock && trainBlock.training === true && trainBlock.priority === 1,
    JSON.stringify(trainBlock));
  ok("★★ and an ordinary block still has exactly the four fields it always had",
    !!homeBlock && Object.keys(homeBlock).sort().join(",") === "end,job,section,start",
    homeBlock && Object.keys(homeBlock).sort().join(","));
}



/* ── the flag reaches the screen, and who stands with them ────────────────
   ⚠️ THE PIVOT USED TO DROP IT, which is the quiet way an engine flag never
   arrives at the component meant to draw it. Asserted at the cell, because
   that is the object BoardCell actually reads. */
{
  const { boardDay, suggestTrainer, trainingPlan } = await import("./scheduleEngine.js");
  const DP = [{ key: "lunch", label: "Lunch", start: 10, end: 15 }];

  const out = run("DRINKS", "1");
  const board = boardDay({ stations: only("DRINKS"), filled: out.filled, dayparts: DP });
  const cell = board.sections[0].stations[0].cells.lunch;
  ok("★★ the training flag survives the pivot into the board cell",
    cell.people[0] && cell.people[0].training === true && cell.people[0].priority === 1,
    JSON.stringify(cell.people[0]));

  const plain = boardDay({ stations: only("CLEANLINESS"), filled: run("CLEANLINESS", "1").filled, dayparts: DP });
  const plainPerson = plain.sections[0].stations[0].cells.lunch.people[0];
  ok("★★ and an ordinary cell person grows NO new keys",
    plainPerson && Object.keys(plainPerson).sort().join(",") === "end,id,name,partial,start",
    plainPerson && Object.keys(plainPerson).sort().join(","));
}

/* ── the trainer suggestion ──────────────────────────────────────────────── */
{
  const { suggestTrainer, trainingPlan } = await import("./scheduleEngine.js");
  /* Dana is learning DRINKS. Sam has DRINKS history. */
  const place = { id: "1", name: "Dana Reyes", station: "DRINKS", start: 600, end: 900 };

  ok("★ the person who has actually worked it is suggested",
    suggestTrainer(place, [shift("1", "Dana Reyes"), shift("2", "Sam Okafor")], MEMORY) === "Sam Okafor");
  ok("★★ somebody who has NEVER worked it is never suggested",
    suggestTrainer({ ...place, station: "WINDOW", id: "2" },
      [shift("2", "Sam Okafor"), shift("1", "Dana Reyes")], MEMORY) === "Dana Reyes",
    suggestTrainer({ ...place, station: "WINDOW", id: "2" }, [shift("2", "Sam Okafor"), shift("1", "Dana Reyes")], MEMORY));
  ok("★★ NOBODY ON WHO KNOWS IT ANSWERS BLANK, never a nearby name",
    suggestTrainer({ ...place, station: "CLEANLINESS" },
      [shift("1", "Dana Reyes"), shift("2", "Sam Okafor")], MEMORY) === "");
  ok("★★ a trainer who has already gone home is not suggested",
    suggestTrainer(place,
      [shift("1", "Dana Reyes"), { ...shift("2", "Sam Okafor"), start: 300, end: 560 }], MEMORY) === "",
    suggestTrainer(place, [shift("1", "Dana Reyes"), { ...shift("2", "Sam Okafor"), start: 300, end: 560 }], MEMORY));
  ok("★ nobody is ever suggested as their own trainer",
    suggestTrainer({ ...place, id: "2", name: "Sam Okafor", station: "DRINKS" },
      [shift("2", "Sam Okafor")], MEMORY) === "");
  ok("no memory, no suggestion, and no throw",
    suggestTrainer(place, [shift("2", "Sam Okafor")], null) === "");

  const plan = trainingPlan(run("DRINKS", "1").filled,
    [shift("1", "Dana Reyes"), shift("2", "Sam Okafor")], MEMORY);
  ok("★ the plan names the trainee, the station and the trainer",
    plan.length === 1 && plan[0].name === "Dana Reyes" &&
    plan[0].station === "DRINKS" && plan[0].trainer === "Sam Okafor" && plan[0].priority === 1,
    JSON.stringify(plan));
  ok("★ a day with nothing being learned makes an empty plan, not a card",
    trainingPlan(run("CLEANLINESS", "1").filled, [shift("1", "Dana Reyes")], MEMORY).length === 0);
  ok("junk in makes an empty plan rather than a throw",
    trainingPlan(null, null, null).length === 0 && trainingPlan([], [], MEMORY).length === 0);
}

if (fails.length) {
  console.log(`trainingEngine: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`trainingEngine: ${pass} passed`);
