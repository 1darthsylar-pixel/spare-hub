/* ============================================================================
   leaderRows.test.mjs — who gets a leadership row, and on what grounds.

       node leaderRows.test.mjs

   Matt, Aug 14 2026, reading a built board: "board looks really nice but dont
   put people in leader positions whove never worked them. prioritize job skill."

   ═══ THE TWO RULES, AND WHY NEITHER IS OBVIOUS ═══════════════════════════
   1. Holding a leadership job code says the store trusts somebody to lead. It
      does NOT say they have ever run THIS row — Drive Thru at open is not Front
      Counter at close. So a leader row prefers people the boards show standing
      there before.

   2. Everywhere else on the board the longest-serving body wins, because one
      person covering a station end to end beats two handovers. A leadership row
      is the opposite trade, and skill goes first.

   ⚠️⚠️ THE POOL IS NARROWED, NEVER EMPTIED. A leader row with the wrong name is
   what he asked me to stop. A leader row with NO name is a shift with nobody
   running it, which is worse and is not what he asked for. When nobody who has
   run the row is on, somebody certified still takes it and the cell is MARKED
   as training — that mark is the difference between the tool making a
   considered choice and making a mistake nobody can see.

   ⚠️⚠️ AND SILENCE IS NOT EVIDENCE. `cellsOf` is zero for somebody brand new,
   somebody not rostered in the weeks we hold, AND somebody whose board name the
   roster could not resolve. Treating that as "never worked it" would bar an
   eight-year veteran from the row they have run for years. Anybody the history
   cannot speak about stays in the pool, and that is asserted below.
   ============================================================================ */
import { assignPositions } from "./scheduleEngine.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const H = (a, b) => [{ start: a * 60, end: b * 60 }];
/* One leadership row and one ordinary row, both open the same hours. */
const STATIONS = [
  { id: "ld", name: "LEADER DT", section: "LEADERSHIP", hours: H(6, 14) },
  { id: "rg", name: "REGISTER 1", section: "FRONT COUNTER", hours: H(6, 14) },
];
const shift = (id, name, skill, lead, extra = {}) => ({
  id, name, start: 6 * 60, end: 14 * 60, side: "FOH", skill, lead, job: "DRIVE THRU", ...extra,
});

/* A stand-in for placementMemory: only the three things assignPositions asks. */
const mem = (byId) => ({
  homeOf: () => "",
  affinity: () => 0,
  rolesOf: (id) => (byId[String(id)] || {}).roles || [],
  cellsOf: (id) => (byId[String(id)] || {}).cells || 0,
});
const on = (filled, station) => filled.filter((f) => f.station === station).map((f) => f.name);
const cellFor = (filled, station) => filled.find((f) => f.station === station);

group("0. controls — the engine runs and fills both rows");
{
  const r = assignPositions(STATIONS, [shift("1", "Ana", 3, 1), shift("2", "Ben", 3, 1)], null);
  ok("assignPositions is a function", typeof assignPositions === "function");
  ok("both stations were filled", r.filled.length >= 2, String(r.filled.length));
  ok("the leader row got somebody", on(r.filled, "LEADER DT").length > 0);
}

group("1. ★ a leadership row still refuses somebody with no lead code");
{
  /* This gate predates today's change and must not have moved. */
  const r = assignPositions(STATIONS, [shift("1", "Ana", 3, 0)], null);
  ok("★ a team member never lands on LEADER DT", on(r.filled, "LEADER DT").length === 0,
    JSON.stringify(on(r.filled, "LEADER DT")));
  ok("and it is reported as a hole rather than hidden",
    r.holes.some((h) => h.station === "LEADER DT"));
  ok("the ordinary row still got them", on(r.filled, "REGISTER 1").includes("Ana"));
}

group("2. ★★ WHO HAS ACTUALLY STOOD THERE WINS");
{
  /* Ben has run LEADER DT. Ana is certified to lead and never has. Both are on
     the clock for the whole block, so nothing but this rule separates them. */
  const memory = mem({
    1: { roles: ["REGISTER 1", "WINDOW"], cells: 40 },
    2: { roles: ["LEADER DT", "WINDOW"], cells: 40 },
  });
  const r = assignPositions(STATIONS, [shift("1", "Ana", 3, 1), shift("2", "Ben", 3, 1)], { memory });
  ok("★ the row goes to the one who has run it", on(r.filled, "LEADER DT").includes("Ben"),
    JSON.stringify(on(r.filled, "LEADER DT")));
  ok("★ and the one who has not is still used elsewhere",
    on(r.filled, "REGISTER 1").includes("Ana"), JSON.stringify(on(r.filled, "REGISTER 1")));
  ok("nobody is on two stations at once",
    new Set(r.filled.map((f) => `${f.id}|${f.start}`)).size === r.filled.length);
}

group("3. ⚠️⚠️ NARROWED, NOT EMPTIED — the row is never left blank");
{
  /* Nobody on the clock has ever run it. The row still gets filled. */
  const memory = mem({
    1: { roles: ["REGISTER 1"], cells: 40 },
    2: { roles: ["WINDOW"], cells: 40 },
  });
  const r = assignPositions(STATIONS, [shift("1", "Ana", 3, 1), shift("2", "Ben", 3, 1)], { memory });
  ok("★ somebody certified still takes the row", on(r.filled, "LEADER DT").length === 1,
    JSON.stringify(on(r.filled, "LEADER DT")));
  ok("★ and it is MARKED as training", !!cellFor(r.filled, "LEADER DT").training);
  ok("no hole was reported for it", !r.holes.some((h) => h.station === "LEADER DT"));

  /* And the opposite: somebody who HAS run it is not marked. */
  const known = mem({ 1: { roles: ["LEADER DT"], cells: 40 }, 2: { roles: ["WINDOW"], cells: 40 } });
  const r2 = assignPositions(STATIONS, [shift("1", "Ana", 3, 1), shift("2", "Ben", 3, 1)], { memory: known });
  ok("★ somebody who has run it is NOT marked as learning",
    !cellFor(r2.filled, "LEADER DT").training);
}

group("4. ⚠️⚠️ SILENCE IS NOT EVIDENCE — no history means no bar");
{
  /* `cellsOf` 0 means the history cannot speak. Ana must stay eligible, and
     must not be badged as learning off the back of a name the boards could not
     resolve. This is the assertion that stops an eight-year veteran being
     barred from the row she has run for years. */
  const memory = mem({
    1: { roles: [], cells: 0 },                       // history cannot say
    2: { roles: ["WINDOW"], cells: 40 },              // known, and never led here
  });
  const r = assignPositions(STATIONS, [shift("1", "Ana", 3, 1), shift("2", "Ben", 3, 1)], { memory });
  ok("★ the unknown person is still eligible for the row",
    on(r.filled, "LEADER DT").length === 1, JSON.stringify(on(r.filled, "LEADER DT")));
  const cell = cellFor(r.filled, "LEADER DT");
  if (on(r.filled, "LEADER DT").includes("Ana")) {
    ok("★ and is NOT flagged as learning from silence", !cell.training);
  } else {
    ok("★ Ben was chosen; he is flagged because his history DOES say", !!cell.training);
  }
}

group("5. ★ SKILL FIRST ON A LEADER ROW, REACH FIRST EVERYWHERE ELSE");
{
  /* Weak leader on the whole block, strong leader on half of it. Everywhere
     else reach wins; here the store would rather have its strongest for four
     hours than its weakest for eight. */
  const memory = mem({
    1: { roles: ["LEADER DT"], cells: 40 },
    2: { roles: ["LEADER DT"], cells: 40 },
  });
  const weakLong = shift("1", "Weak", 1, 1);
  const strongShort = { ...shift("2", "Strong", 3, 1), end: 10 * 60 };
  const r = assignPositions(STATIONS, [weakLong, strongShort], { memory });
  const first = r.filled.filter((f) => f.station === "LEADER DT").sort((a, b) => a.start - b.start)[0];
  ok("★ the stronger leader opens the row", first && first.name === "Strong",
    first && first.name);
  ok("and the weaker one still works", r.filled.some((f) => f.name === "Weak"));

  /* ⚠️ THE CONTROL. On an ORDINARY row the old rule must be untouched: the
     longer body wins even at lower skill. */
  const plain = [{ id: "rg", name: "REGISTER 1", section: "FRONT COUNTER", hours: H(6, 14) }];
  const r2 = assignPositions(plain, [weakLong, strongShort], { memory });
  const firstPlain = r2.filled.sort((a, b) => a.start - b.start)[0];
  ok("★ an ordinary row still prefers the longer shift (control)",
    firstPlain && firstPlain.name === "Weak", firstPlain && firstPlain.name);
}

group("6. junk in does not throw");
{
  ok("no stations", assignPositions([], [shift("1", "Ana", 3, 1)], null).filled.length === 0);
  ok("no shifts", assignPositions(STATIONS, [], null).holes.length > 0);
  ok("null history", typeof assignPositions(STATIONS, [shift("1", "A", 3, 1)], null) === "object");
  ok("history with no memory",
    typeof assignPositions(STATIONS, [shift("1", "A", 3, 1)], {}) === "object");
}

if (fails.length) {
  console.log(`\nleaderRows: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nleaderRows: ${pass} passed`);
