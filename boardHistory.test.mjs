/* boardHistory — reading a store's own boards back as numbers.

   ⚠️ THE FIXTURE IS THE REAL SHAPES, NOT TIDY ONES. Every odd cell value below
   was copied from this store's live boards on Aug 13 2026, because the two
   bugs this file exists to avoid were both about what is IN a cell:
   "(Line!!)" parsed as a team member who worked Register 1 twenty-four times,
   and "✔️ Thanh" parsed as nobody at all. A fixture of clean names would have
   passed with both bugs present. */
import { personInCell, roleName, cellsOfBoard, stationLoad, placementMemory } from "./boardHistory.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };

/* ── what is actually in a cell ─────────────────────────────────────────── */
ok("a plain name is a person", personInCell("Thanh") === "Thanh");
ok("the board's tick comes off", personInCell("✔️ Thanh") === "Thanh", personInCell("✔️ Thanh"));
ok("the come-on time comes off", personInCell("Ashley R @6") === "Ashley R", personInCell("Ashley R @6"));
ok("a tick AND a time both come off", personInCell("✔️ Maria @11:15") === "Maria");
ok("a last initial survives", personInCell("Benjamin S") === "Benjamin S");
ok("split duties is not a person", personInCell("split duties") === "");
ok("(Line!!) is not a person", personInCell("(Line!!)") === "", personInCell("(Line!!)"));
ok("a tick alone is not a person", personInCell("✔️") === "");
ok("a cross is not a person", personInCell("×") === "" && personInCell("✕") === "");
ok("empty is not a person", personInCell("") === "" && personInCell(null) === "" && personInCell(undefined) === "");
ok("a number is not a person", personInCell("6am") === "", personInCell("6am"));

ok("hours come off a role", roleName("WINDOW (6AM-11PM)") === "WINDOW");
ok("a role with no hours is unchanged", roleName("Primary Point") === "Primary Point");

/* ── both board shapes, one reader ──────────────────────────────────────── */
const FOH_WEEK = {
  Monday: { stations: [
    { role: "WINDOW (6AM-11PM)", breakfast: "Ashley R @6", lunch: "Jocelyn", mid: "Julie R", night: "Anna" },
    { role: "REGISTER 1 (6AM-11AM)", breakfast: "Rhonda @6", lunch: "(Line!!)", mid: "(Line!!)", night: "(Line!!)" },
    { role: "MOBILE BAGGER", breakfast: "split duties", lunch: "split duties", mid: "split duties", night: "split duties" },
    { role: "DRINKS (8:30AM-10PM)", breakfast: "Pablo", lunch: "Pablo", mid: "Pablo", night: "" },
  ] },
  Tuesday: { stations: [
    { role: "WINDOW (6AM-11PM)", breakfast: "Ashley R", lunch: "Jocelyn", mid: "Julie R", night: "Anna" },
    { role: "REGISTER 1 (6AM-11AM)", breakfast: "Rhonda", lunch: "(Line!!)", mid: "(Line!!)", night: "(Line!!)" },
    { role: "MOBILE BAGGER", breakfast: "split duties", lunch: "split duties", mid: "split duties", night: "split duties" },
    { role: "DRINKS (8:30AM-10PM)", breakfast: "Pablo", lunch: "", mid: "", night: "" },
  ] },
};
const BOH_WEEK = {
  Monday: { sections: [
    { name: "PRIMARY", stations: [{ role: "Primary Point (6AM-10PM)", breakfast: "Yasmin", lunch: "Jessica", mid: "Kimberley", night: "Monica" }] },
    { name: "BREADING", stations: [{ role: "Breader (5:45AM-11PM)", breakfast: "Hernan", lunch: "Hernan", mid: "Juana", night: "Juana" }] },
    { name: "PREP", stations: [{ role: "Bulk Prep (5AM-1PM)", breakfast: "Ana", lunch: "Ana", mid: "", night: "" }] },
  ] },
  Tuesday: { sections: [
    { name: "PRIMARY", stations: [{ role: "Primary Point (6AM-10PM)", breakfast: "Yasmin", lunch: "Jessica", mid: "Kimberley", night: "Monica" }] },
    { name: "BREADING", stations: [{ role: "Breader (5:45AM-11PM)", breakfast: "Hernan", lunch: "Hernan", mid: "Juana", night: "Juana" }] },
    { name: "PREP", stations: [{ role: "Bulk Prep (5AM-1PM)", breakfast: "Ana", lunch: "Ana", mid: "", night: "" }] },
  ] },
};

{
  const c = cellsOfBoard(FOH_WEEK);
  ok("FOH: 2 days x 4 stations x 4 dayparts", c.length === 32, String(c.length));
  const b = cellsOfBoard(BOH_WEEK);
  ok("BOH sections are read by the same function", b.length === 24, String(b.length));
  ok("nothing is read from junk", cellsOfBoard(null).length === 0 && cellsOfBoard("x").length === 0);
}

/* ── core, peak and never ───────────────────────────────────────────────── */
{
  const load = stationLoad([FOH_WEEK, BOH_WEEK]);
  ok("a station staffed in every cell is core", load.tierOf("WINDOW") === "core", load.tierOf("WINDOW"));
  ok("the hours on the role do not change its identity",
    load.tierOf("WINDOW (6AM-11PM)") === "core");
  ok("a duty row nobody ever stands on is never, not peak",
    load.tierOf("MOBILE BAGGER") === "never", load.tierOf("MOBILE BAGGER"));
  ok("a marker-only row is never too, because (Line!!) is not a body",
    load.tierOf("REGISTER 1") === "peak", load.tierOf("REGISTER 1"));   // 2 of 8 cells staffed
  ok("a part-time station is peak", load.tierOf("DRINKS") === "peak", load.tierOf("DRINKS"));
  ok("Bulk Prep is peak here: it is only open half the day",
    load.tierOf("Bulk Prep") === "peak", String(load.rateOf("Bulk Prep")));
  ok("a station this history has never seen answers \"\", never a default",
    load.tierOf("SOME STATION NOBODY HAS") === "", load.tierOf("SOME STATION NOBODY HAS"));
  ok("no boards at all is a working state", stationLoad([]).tierOf("WINDOW") === "");
  const reg = load.rows.find((r) => r.role === "REGISTER 1");
  ok("(Line!!) did NOT count as staffed", reg && reg.staffed === 2, JSON.stringify(reg));
}

/* ── anchors and floaters ───────────────────────────────────────────────── */
const ROSTER = [
  { id: "6", name: "Ana Turcios" },
  { id: "73", name: "Hernan Mesa" },
  { id: "103", name: "Juana Romero" },
  { id: "41", name: "Pablo Martinez" },
  { id: "93", name: "Kimberley Garcia" },
  /* The two this roster genuinely cannot separate. */
  { id: "26", name: "Lizbeth Gonzalez" },
  { id: "27", name: "Lizbeth Gonzalez Ramos" },
];

{
  const mem = placementMemory([BOH_WEEK, FOH_WEEK], ROSTER, { minCells: 4 });
  ok("Ana is an anchor on Bulk Prep", mem.isAnchor("6") && mem.homeOf("6") === "Bulk Prep",
    JSON.stringify(mem.people.find((p) => p.id === "6")));
  ok("Hernan is an anchor on Breader", mem.homeOf("73") === "Breader");
  ok("Juana is an anchor on Breader too — two people, one station, both real",
    mem.homeOf("103") === "Breader");
  ok("affinity is the share of their time, not a count",
    Math.abs(mem.affinity("6", "Bulk Prep") - 1) < 1e-9, String(mem.affinity("6", "Bulk Prep")));
  ok("affinity for a station they have never worked is 0",
    mem.affinity("6", "WINDOW") === 0);
  ok("somebody with no history has no home and is not an anchor",
    mem.homeOf("999") === "" && mem.isAnchor("999") === false);
  ok("a below-threshold history is NOT an anchor, however lopsided",
    !mem.isAnchor("93"), JSON.stringify(mem.people.find((p) => p.id === "93")));
}

{
  /* ⚠️ THE ASSERTION THAT MATTERS MOST. A cell reading "Lizbeth" cannot say
     which of the two it is, so it must teach the engine NOTHING about either.
     A wrong match here puts one person's history onto the other's shift. */
  const board = { Monday: { stations: [
    { role: "LEADER DT (6AM-2PM)", breakfast: "Lizbeth", lunch: "Lizbeth", mid: "Lizbeth", night: "Lizbeth" },
  ] } };
  const mem = placementMemory([board], ROSTER, { minCells: 1 });
  ok("an ambiguous board name matches NEITHER person",
    mem.homeOf("26") === "" && mem.homeOf("27") === "" && mem.people.length === 0,
    JSON.stringify(mem.people));
}

{
  /* Recent weeks count more, so somebody who moved station reads as having
     moved rather than as split between the two. */
  const older = { Monday: { stations: [{ role: "DRINKS", breakfast: "Pablo", lunch: "Pablo", mid: "Pablo", night: "Pablo" }] } };
  const newer = { Monday: { stations: [{ role: "WINDOW", breakfast: "Pablo", lunch: "Pablo", mid: "Pablo", night: "Pablo" }] } };
  const flat = placementMemory([older, newer], ROSTER, { minCells: 4 });
  ok("unweighted, a move looks like a tie and neither is a home",
    !flat.isAnchor("41"), JSON.stringify(flat.people.find((p) => p.id === "41")));
  const decayed = placementMemory([older, newer], ROSTER, {
    minCells: 4, weightOf: (b) => (b === newer ? 3 : 1),
  });
  ok("weighted toward the recent board, the new station wins",
    decayed.homeOf("41") === "WINDOW", JSON.stringify(decayed.people.find((p) => p.id === "41")));
  ok("a zero weight drops a board entirely",
    placementMemory([older, newer], ROSTER, { minCells: 4, weightOf: (b) => (b === newer ? 0 : 1) }).homeOf("41") === "DRINKS");
}

/* ── it describes a store, it does not carry one ────────────────────────── */
{
  const src = "" + stationLoad + placementMemory + personInCell + cellsOfBoard;
  ["WINDOW", "Breader", "Bulk Prep", "Primary Point", "Gate City", "04010"].forEach((s) => {
    ok(`no "${s}" hardcoded in the logic`, !src.includes(s));
  });
  ok("another store's boards describe that store",
    stationLoad([{ Monday: { stations: [{ role: "TILL 1", breakfast: "Sam", lunch: "Sam", mid: "Sam", night: "Sam" }] } }])
      .tierOf("TILL 1") === "core");
}



/* ── A DOUBLE SPACE MADE ONE STATION INTO TWO, ON REAL BOARDS ─────────────
   Found Aug 14 2026 ranking every station off seven weeks of this store's own
   saved boards: `DT TRADITIONAL` and `DT  TRADITIONAL` both exist, and every
   measurement here counted them separately. The double-spaced one showed 16
   cells and 0 staffed, so it ranked as the least-worked station in the
   building — and the cut advice names a station off exactly that ranking. */
{
  ok("★★ an internal double space is collapsed, so it is ONE station",
    roleName("DT  TRADITIONAL (11AM-11PM)") === roleName("DT TRADITIONAL (11AM-11PM)"),
    `${roleName("DT  TRADITIONAL (11AM-11PM)")} vs ${roleName("DT TRADITIONAL (11AM-11PM)")}`);
  ok("★ and the collapsed name is the clean one, matching storeCfg's spelling",
    roleName("DT  TRADITIONAL (11AM-11PM)") === "DT TRADITIONAL");
  ok("tabs and newlines collapse too", roleName("DT\t TRADITIONAL") === "DT TRADITIONAL");
  ok("a normal name is untouched", roleName("WINDOW (6AM-11PM)") === "WINDOW");
  ok("a name with no hours still works", roleName("TRAINER") === "TRAINER");
  ok("junk answers empty, not a throw", roleName(null) === "" && roleName(undefined) === "");

  /* The two spellings must now tally as one station, not two. */
  const boards = [{
    Mon: { stations: [{ role: "DT  TRADITIONAL (11AM-11PM)", breakfast: "Ana", lunch: "", mid: "", night: "" }] },
    Tue: { stations: [{ role: "DT TRADITIONAL (11AM-11PM)", breakfast: "Ana", lunch: "", mid: "", night: "" }] },
  }];
  const L = stationLoad(boards);
  ok("★★ both spellings tally into ONE row, not two",
    L.rows.filter((r) => r.role.includes("TRADITIONAL")).length === 1,
    JSON.stringify(L.rows.map((r) => r.role)));
  ok("★ and the merged row counts both days' cells",
    L.rows.find((r) => r.role === "DT TRADITIONAL").cells === 8,
    String((L.rows.find((r) => r.role === "DT TRADITIONAL") || {}).cells));

  /* ⚠️ THE TIER THE CUT ADVICE FILTERS ON. A station nobody ever staffs is
     `never`, and the panel must not offer it as the thing to cut. */
  const mixed = stationLoad([{ Mon: { stations: [
    { role: "WINDOW (6AM-11PM)", breakfast: "A", lunch: "A", mid: "A", night: "A" },
    { role: "REGISTER 3 (11AM-2PM)", breakfast: "", lunch: "B", mid: "", night: "" },
    { role: "OT 3 (6AM-10PM)", breakfast: "", lunch: "", mid: "", night: "" },
  ] } }]);
  ok("★★ a never-staffed station is `never`, NOT the cheapest `peak`",
    mixed.tierOf("OT 3") === "never" && mixed.tierOf("REGISTER 3") === "peak",
    `${mixed.tierOf("OT 3")} / ${mixed.tierOf("REGISTER 3")}`);
  ok("★ so filtering out `never` leaves REGISTER 3 as the real least-worked",
    mixed.rows.filter((r) => r.tier !== "never").sort((a, b) => a.rate - b.rate)[0].role === "REGISTER 3");
  ok("★ a station the history never saw answers \"\", not `peak`",
    mixed.tierOf("NEVER HEARD OF IT") === "");
}

if (fails.length) {
  console.log(`boardHistory: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`boardHistory: ${pass} passed`);
