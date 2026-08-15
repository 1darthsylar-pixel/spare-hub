/* ============================================================================
   boardSwap.test.mjs — putting the new person where the old one stood.

       node boardSwap.test.mjs

   Matt, Aug 14 2026: "i want the hub to auto approve shift swaps with rules and
   i want it to auto upadate the setup."

   ═══ THE FIXTURE IS THE REAL BOARD ══════════════════════════════════════════
   Every cell below is copied out of `gcfcr-dailysetup-foh-v2-2026-08-10-auto`,
   Friday, as the store really typed it: "Ashley R @6", "Camila G @11:15",
   "Thanh @11:15", "Liz- Abril", bare "✔️", bare "❌". A fixture somebody invents
   tests the code against their own idea of a board, which is the one thing this
   file exists to stop.

   ⚠️⚠️ AND THE ROSTER REALLY HOLDS TWO ASHLEYS AND TWO CAMILAS. That is not a
   contrived edge case added to be thorough; it is what Friday looked like.
   "Ashley Rangel-avila" and "Ashley Valadez" are both on, and the board tells
   them apart with one letter. A rename that gets this wrong puts a person who
   is not coming in onto a printed board — the WRITE version of the bug Hannah
   reported on Aug 12, where the same ambiguity sent shift alerts to the wrong
   phones.
   ============================================================================ */
import { swapCell, swapRosterLine, swapOnDay, applyBoardSwap, swapSummary } from "./boardSwap.js";
import { cellName } from "./boardOwner.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

/* ── the real Friday, trimmed to the rows that matter ────────────────────── */
const ROSTER = [
  "Jose Arias Cortez 2-5",
  "Daisy Hernandez Espitia 5:15-11, 11-2, 2-5",
  "Monica Garcia-parra 5:45-11, 11-2",
  "Ashley Rangel-avila 6-11, 11-2, 2-5",
  "Ashley Valadez 5-9",
  "Katia Bostic 6-11, 11-2, 2-5",
  "Kimberley Garcia 6-11, 11-2, 2-5",
  "Thania Garcia 8:30-11, 11-2",
  "Kevin Hernandez 9-11, 11-2",
  "Camila Garcia Mares 11:15-2, 2-5",
  "Camila Lugo Arreola 5-9",
];

const fohDay = () => ({
  roster: ROSTER.slice(),
  trainers: [],
  stations: [
    { role: "WINDOW (6AM-11PM)", breakfast: "Ashley R @6", lunch: "Thania", mid: "", night: "Valerie S" },
    { role: "EXPO 1 (11AM-9PM)", breakfast: "❌", lunch: "Valerie H", mid: "", night: "Paola" },
    { role: "EXPO 2 (11:15AM-9PM)", breakfast: "❌", lunch: "Thanh @11:15", mid: "", night: "Ashley V" },
    { role: "DESSERTS (11:15AM-11PM)", breakfast: "❌", lunch: "Camila G @11:15", mid: "", night: "Liz- Abril" },
    { role: "DT TRADITIONAL (11AM-11PM)", breakfast: "✔️", lunch: "Kimberley", mid: "", night: "Fatima" },
    { role: "DT MOBILES (8:30AM-11AM)", breakfast: "Thania @8:30", lunch: "✔️", mid: "", night: "✔️" },
    { role: "MOBILE DRINKS/DESSERTS (9AM-11AM)", breakfast: "Kevin @9", lunch: "✔️", mid: "", night: "✔️" },
    { role: "REGISTER 1 (6AM-9PM)", breakfast: "Kimberley @6", lunch: "Katia", mid: "", night: "Camila L" },
  ],
});

const cellsOf = (day) => day.stations.flatMap((s) => [s.breakfast, s.lunch, s.mid, s.night]);
const has = (day, text) => cellsOf(day).some((c) => c === text);

group("0. controls — the fixture is what we think it is");
{
  const d = fohDay();
  ok("the real cell shapes are present", has(d, "Ashley R @6") && has(d, "✔️") && has(d, "❌"));
  ok("★ two Ashleys really are on this roster",
    ROSTER.filter((r) => /^Ashley /.test(r)).length === 2);
  ok("★ two Camilas too", ROSTER.filter((r) => /^Camila /.test(r)).length === 2);
  ok("cellName still reads a marker cell as nobody", cellName("✔️") === "" && cellName("❌") === "");
}

group("1. ⚠️⚠️ A BARE FIRST NAME ON A TWO-ASHLEY DAY MATCHES NOBODY");
{
  /* The board never wrote a bare "Ashley" on this Friday, because the leaders
     know there are two. If one ever does, the safe answer is to change nothing.
     A wrong name on a printed board is not recoverable by the person reading it. */
  const d = fohDay();
  d.stations[0].breakfast = "Ashley";
  const r = swapOnDay(d, "Ashley Rangel-avila", "Marco Diaz");
  ok("★ the bare cell is untouched", r.day.stations[0].breakfast === "Ashley", r.day.stations[0].breakfast);
  ok("★ and it is not counted as a rewrite", r.cells === 0, r.cells);

  /* The same board with only ONE Ashley must resolve it, or the guard is just
     a switch that turns the feature off. */
  const solo = fohDay();
  solo.roster = ROSTER.filter((n) => !/^Ashley Valadez/.test(n));
  solo.stations[0].breakfast = "Ashley";
  const r2 = swapOnDay(solo, "Ashley Rangel-avila", "Marco Diaz");
  ok("★ one Ashley on the day and the bare cell DOES resolve",
    r2.day.stations[0].breakfast === "Marco Diaz", r2.day.stations[0].breakfast);
}

group("2. ★★ THE INITIAL IS THE WHOLE ANSWER — Ashley R moves, Ashley V does not");
{
  const r = swapOnDay(fohDay(), "Ashley Rangel-avila", "Marco Diaz");
  ok("★ 'Ashley R @6' became 'Marco Diaz @6'",
    r.day.stations[0].breakfast === "Marco Diaz @6", r.day.stations[0].breakfast);
  ok("★★ 'Ashley V' was NOT touched",
    r.day.stations[2].night === "Ashley V", r.day.stations[2].night);
  ok("the roster line was rewritten and kept its hours",
    r.day.roster.includes("Marco Diaz 6-11, 11-2, 2-5"), r.day.roster.filter((x) => /Marco|Ashley/.test(x)));
  ok("★ the OTHER Ashley's roster line survived",
    r.day.roster.includes("Ashley Valadez 5-9"));
  ok("one cell, one roster line", r.cells === 1 && r.rosterLines === 1, [r.cells, r.rosterLines]);
}

group("3. ★ THE MARKERS AND THE CLOCK SURVIVE");
{
  ok("a ✔️ prefix is kept",
    swapCell("✔️Daisy", (n) => n === "Daisy", "Marco") === "✔️Marco",
    swapCell("✔️Daisy", (n) => n === "Daisy", "Marco"));
  ok("★ an @ time is kept", swapCell("Samuel @8:30", () => true, "Marco") === "Marco @8:30",
    swapCell("Samuel @8:30", () => true, "Marco"));
  ok("an 11:15 start is kept", swapCell("Thanh @11:15", () => true, "Marco") === "Marco @11:15");
  ok("★ a bare ✔️ is nobody and stays nobody", swapCell("✔️", () => true, "Marco") === null);
  ok("a ❌ is a closed station and stays closed", swapCell("❌", () => true, "Marco") === null);
  ok("'split duties' is not a person", swapCell("split duties", () => true, "Marco") === null);
  ok("an empty cell is left alone", swapCell("", () => true, "Marco") === null);
  ok("a hyphenated first name reads whole",
    swapCell("Liz- Abril", (n) => n === "Liz- Abril", "Marco") === "Marco",
    swapCell("Liz- Abril", (n) => n === "Liz- Abril", "Marco"));
}

group("4. ⚠️ A HANDOFF IS TWO PEOPLE AND ONLY ONE IS SWAPPING");
{
  const only = (who) => (n) => n === who;
  ok("★ the first half swaps, the second stands",
    swapCell("Camila G →Saray 6", only("Camila G"), "Marco") === "Marco →Saray 6",
    swapCell("Camila G →Saray 6", only("Camila G"), "Marco"));
  ok("★★ the second half swaps and Camila stands",
    swapCell("Camila G →Saray 6", only("Saray"), "Marco") === "Camila G →Marco 6",
    swapCell("Camila G →Saray 6", only("Saray"), "Marco"));
  ok("the arrow itself survives", /→/.test(swapCell("Camila G →Saray 6", only("Saray"), "Marco")));
  ok("an ascii arrow works the same",
    swapCell("Camila G ->Saray 6", only("Saray"), "Marco") === "Camila G ->Marco 6",
    swapCell("Camila G ->Saray 6", only("Saray"), "Marco"));
  ok("nobody in the cell means no rewrite", swapCell("Camila G →Saray 6", only("Nobody"), "Marco") === null);
}

group("5. ⚠️ NOTHING IS MUTATED, AND NOTHING CHANGED MEANS NOTHING WRITTEN");
{
  const d = fohDay();
  const before = JSON.stringify(d);
  const r = swapOnDay(d, "Ashley Rangel-avila", "Marco Diaz");
  ok("★ the board handed in is byte identical afterwards", JSON.stringify(d) === before);
  ok("the answer is a different object", r.day !== d);

  const miss = swapOnDay(fohDay(), "Nobody Here", "Marco Diaz");
  ok("★ a name nobody knows changes nothing", miss.cells === 0 && miss.rosterLines === 0);

  const board = { Friday: fohDay(), Thursday: fohDay() };
  const one = applyBoardSwap(board, "Friday", "Ashley Rangel-avila", "Marco Diaz");
  ok("★★ ONLY THE NAMED DAY MOVES", one.board.Thursday === board.Thursday);
  ok("the named day did move", one.board.Friday !== board.Friday && one.changed === true);
  ok("★ an unchanged board comes back as the SAME object, so the caller can skip the write",
    applyBoardSwap(board, "Friday", "Nobody Here", "Marco").board === board);
  ok("a day the board does not have is not an error",
    applyBoardSwap(board, "Sunday", "Ashley Rangel-avila", "Marco").changed === false);
  ok("a junk board is not an error", applyBoardSwap(null, "Friday", "A B", "C D").changed === false);
  ok("a blank name never rewrites anything", swapOnDay(fohDay(), "", "Marco").cells === 0);
  ok("a blank NEW name never rewrites anything", swapOnDay(fohDay(), "Ashley Rangel-avila", "").cells === 0);
}

group("6. ★ THE KITCHEN SHAPE — sections, not a flat list");
{
  const bohDay = {
    roster: ["Brandon Smith 5-1", "Ashley Valadez 5-9"],
    sections: [
      { name: "PRIMARY", stations: [{ role: "BREADER", breakfast: "Brandon", lunch: "✔️", mid: "", night: "" }] },
      { name: "SECONDARY", stations: [{ role: "FRIES", breakfast: "", lunch: "Brandon", mid: "", night: "Ashley V" }] },
    ],
  };
  const r = swapOnDay(bohDay, "Brandon Smith", "Marco Diaz");
  ok("★ both sections were walked", r.cells === 2, r.cells);
  ok("the first section moved", r.day.sections[0].stations[0].breakfast === "Marco Diaz");
  ok("the second section moved", r.day.sections[1].stations[0].lunch === "Marco Diaz");
  ok("★ Ashley V in the kitchen was left alone", r.day.sections[1].stations[0].night === "Ashley V");
  ok("the kitchen roster line moved", r.day.roster[0] === "Marco Diaz 5-1");
  ok("★ a section with no swap in it is the SAME object",
    swapOnDay(bohDay, "Ashley Valadez", "Marco Diaz").day.sections[0] === bohDay.sections[0]);
}

group("7. ★ WHAT A LEADER IS TOLD");
{
  ok("a real swap says what moved",
    /station box/.test(swapSummary(swapOnDay(fohDay(), "Ashley Rangel-avila", "Marco Diaz"))));
  ok("★ nothing found says so plainly, it does not claim success",
    /Nothing on the setup/.test(swapSummary(swapOnDay(fohDay(), "Nobody Here", "Marco Diaz"))));
  ok("★ an ambiguous day says why nothing happened",
    /answer to that name/.test(swapSummary({ ambiguous: true })));
  ok("skipped boxes are reported, not swallowed",
    /needs a look/.test(swapSummary({ cells: 1, rosterLines: 0, skipped: 1 })));
}

group("8. ★★ THE ROSTER LINE — hours belong to the shift, not the person");
{
  ok("hours survive",
    swapRosterLine("Ashley Rangel-avila 6-11, 11-2, 2-5", () => true, "Marco Diaz")
      === "Marco Diaz 6-11, 11-2, 2-5");
  ok("a 5:15 start survives",
    swapRosterLine("Daisy Hernandez Espitia 5:15-11, 11-2, 2-5", () => true, "Marco")
      === "Marco 5:15-11, 11-2, 2-5");
  ok("★ a hyphenated surname is not read as a time range",
    swapRosterLine("Monica Garcia-parra 5:45-11, 11-2", () => true, "Marco") === "Marco 5:45-11, 11-2",
    swapRosterLine("Monica Garcia-parra 5:45-11, 11-2", () => true, "Marco"));
  ok("a three-part name is taken whole",
    swapRosterLine("Camila Garcia Mares 11:15-2, 2-5", () => true, "Marco") === "Marco 11:15-2, 2-5");
  ok("somebody else's line is left alone",
    swapRosterLine("Katia Bostic 6-11", (n) => n === "Nobody", "Marco") === null);
  ok("a blank line is not a person", swapRosterLine("   ", () => true, "Marco") === null);
}

group("9. ★★ THE TWO LISTS BESIDE THE ROSTER, both measured on the live Friday board");
{
  /* A real day carries `trainers` (name + hours, like the roster) and `people`
     ([{id,name}], the structured twin). Neither existed in this test until the
     production record was read, which is the whole argument for reading it. */
  const day = {
    ...fohDay(),
    trainers: [
      "Daisy Hernandez Espitia 5:15-11, 11-2, 2-5",
      "Ashley Rangel-avila 6-11, 11-2, 2-5",
      "Ashley Valadez 5-9",
      "Katia Bostic 6-11, 11-2, 2-5",
    ],
    people: [
      { id: "20", name: "Daisy Hernandez Espitia" },
      { id: "12", name: "Ashley Rangel-avila" },
      { id: "13", name: "Ashley Valadez" },
    ],
  };

  const r = swapOnDay(day, "Ashley Rangel-avila", "Marco Diaz", "999");
  ok("★★ THE LEAVER COMES OFF THE TRAINER LIST", r.day.trainers.length === 3
    && !r.day.trainers.some((t) => /Ashley Rangel/.test(t)), r.day.trainers);
  ok("★★ AND THE NEW PERSON IS **NOT** PUT ON IT — whether somebody trains is not this file's to decide",
    !r.day.trainers.some((t) => /Marco/.test(t)), r.day.trainers);
  ok("★ the OTHER Ashley keeps her trainer row",
    r.day.trainers.some((t) => /Ashley Valadez/.test(t)));
  ok("it is reported rather than silent", r.droppedTrainer === true);
  ok("★ and the leader is told the slot is open",
    /trainer today/.test(swapSummary(r)), swapSummary(r));

  ok("★ the people row carries the NEW id, not just the new name",
    r.day.people.some((p) => p.id === "999" && p.name === "Marco Diaz"), r.day.people);
  ok("★★ the other Ashley's id is untouched",
    r.day.people.find((p) => p.name === "Ashley Valadez").id === "13");

  /* ⚠️ NO ID MEANS THE PEOPLE LIST IS LEFT ALONE. A row carrying the new
     person's NAME with the old person's ID is worse than a stale row, because
     everything downstream trusts the id. */
  const noId = swapOnDay(day, "Ashley Rangel-avila", "Marco Diaz");
  ok("★★ WITHOUT AN ID THE PEOPLE LIST IS NOT TOUCHED",
    noId.day.people === day.people, noId.day.people);
  ok("but the cells and roster still move", noId.cells === 1 && noId.rosterLines === 1);

  /* Dropping only the trainer row is still a change worth writing. */
  const trainerOnly = { roster: [], stations: [], trainers: ["Ashley Rangel-avila 6-11"] };
  const t = applyBoardSwap({ Friday: trainerOnly }, "Friday", "Ashley Rangel-avila", "Marco Diaz");
  ok("★ a trainer-row-only change still counts as changed", t.changed === true);
}

group("10. ★★ ONE PERSON, THREE BOXES — measured on the live board");
{
  /* Ashley R really stood at three stations that Friday: WINDOW at breakfast,
     OT CAPTAIN at lunch, REGISTER 2 in the afternoon. Her roster line is one
     block, 6-11 / 11-2 / 2-5, so a swap of that shift moves all three. A
     version of this that only moved the first box would look right in a demo
     and leave two boxes naming somebody who is not in the building. */
  const day = fohDay();
  day.stations[7] = { role: "OT CAPTAIN (6AM-10PM)", breakfast: "Katia @6", lunch: "Ashley R", mid: "Jose A", night: "Chelsea" };
  day.stations[6] = { role: "REGISTER 2 (8:30AM-9PM)", breakfast: "Sandra @8:30", lunch: "Kevin", mid: "Ashley R", night: "Daniellys" };
  const r = swapOnDay(day, "Ashley Rangel-avila", "Marco Diaz");
  ok("★★ all three boxes moved", r.cells === 3, r.cells);
  ok("the @6 box kept its time", r.day.stations[0].breakfast === "Marco Diaz @6");
  ok("the lunch box moved", r.day.stations[7].lunch === "Marco Diaz");
  ok("the afternoon box moved", r.day.stations[6].mid === "Marco Diaz");
  ok("★ and Ashley V's night box is still hers", r.day.stations[2].night === "Ashley V");
}

if (fails.length) {
  console.log(`\nboardSwap: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nboardSwap: ${pass} passed`);
