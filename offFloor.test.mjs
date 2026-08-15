/* ============================================================================
   offFloor.test.mjs — senior leadership is not on the schedule, and a store can
   still overrule that one person at a time.

       node offFloor.test.mjs

   Matt, Aug 14 2026: "remove everyone in sr leadership. just have the rest",
   then, naming them: "Nick, Hannah, Bri, Matt and Kyleeka dont need to be in
   the employees for scheduling".

   ⚠️ IT IMPORTS AND RUNS THE RULE, rather than reading the source for it.

   ═══ THE THREE STATES, AND THE MIDDLE ONE IS WHY THIS EXISTS ══════════════
     · noSchedule === true    somebody said off  → off, whatever the title
     · noSchedule === false   somebody said on   → ON, whatever the title
     · absent                 nobody has said    → the title decides
   A plain OR would collapse the middle case into the first and make a title a
   gate nobody could open. The seeding bug it guards is worse and quieter: the
   editor writes `!!draft.noSchedule` on every save, so a checkbox seeded from
   the raw field would put a senior leader back on the floor the first time
   anybody pressed Save on their record for any reason.

   ⚠️ NAMES AND TITLES LIVE IN THIS FILE, NOT IN THE MODULES. hrRoster carries
   the ladder; who holds which rung is this store's data.
   ============================================================================ */
import { isOffFloorTitle, OFF_FLOOR_MIN_TIER, hrTierOfTitle, hrRankOfTitle } from "./hrRoster.js";
import { isOffFloor, isNoSchedule } from "./availability.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`); }
};
const group = (n) => console.log(`\n── ${n}`);

/* The six, measured from the live roster Aug 14 2026 with gcfcr-hr-roles
   merged over it. Cindy's roster row still says Team Member; her title is an
   HR Console override, which is exactly the case an unmerged read misses. */
const SENIOR = [
  ["Nick Matthews", "Owner"],
  ["Matt Jackson", "Executive Director"],
  ["Kyleeka Gonzalez", "Executive Director"],
  ["Hannah Jackson", "Human Resources"],
  ["Cindy Dunning", "Accounts Payable"],
  ["Bri Moore", "Leadership Development Director"],
];
const FLOOR = [
  ["Brandon McDowell", "Director"],
  ["Julie Renshaw", "Assistant Director"],
  ["Thanh Nguyen", "Team Leader"],
  ["Chloe Jackson", "Senior Trainer"],
  ["Marchelle Moody", "Junior Trainer"],
  ["Silas Tuggy", "Team Member"],
  ["Jose Arias Cortez", "Trainer"],
];

group("0. controls — the modules really loaded and really run");
{
  ok("isOffFloor is a function", typeof isOffFloor === "function");
  ok("isOffFloorTitle is a function", typeof isOffFloorTitle === "function");
  ok(`OFF_FLOOR_MIN_TIER is 3 (${OFF_FLOOR_MIN_TIER})`, OFF_FLOOR_MIN_TIER === 3);
  ok("a known title still ranks (control)", hrRankOfTitle("Owner") === 8);
  ok("isNoSchedule is still exported for the raw question",
    typeof isNoSchedule === "function" && isNoSchedule({ noSchedule: true }) === true);
}

group("1. ★ every senior leadership title is off the floor by default");
{
  SENIOR.forEach(([who, title]) => {
    ok(`${who} — ${title}`, isOffFloorTitle(title) === true);
  });
  ok("all six, and that is the whole list", SENIOR.filter(([, t]) => isOffFloorTitle(t)).length === 6);
  ok("★ and it is the tier boundary, not a second copy of the number",
    SENIOR.every(([, t]) => hrTierOfTitle(t) >= OFF_FLOOR_MIN_TIER));
}

group("2. ★ and NOBODY else is. Director is the rung it stops at");
{
  FLOOR.forEach(([who, title]) => {
    ok(`${who} — ${title} stays on the floor`, isOffFloorTitle(title) === false);
  });
  /* ⚠️ THE ONE WORTH STATING OUT LOUD. Director is rank 5, one below the line.
     A Director runs shifts and belongs on a board; moving this boundary down a
     rung would silently take two people off the schedule. */
  ok("★ Director is ON the floor", isOffFloorTitle("Director") === false);
  ok("Manager normalises to Assistant Director and stays on",
    isOffFloorTitle("Manager") === false);
}

group("3. ⚠️ AN UNKNOWN TITLE IS ON THE FLOOR, never off");
{
  /* An unknown title scores 0. Failing that OPEN is deliberate: a typo in a
     title should leave somebody schedulable and visible, not quietly delete
     them from the roster the builder can see. */
  ok("a typo", isOffFloorTitle("Excutive Director") === false);
  ok("empty", isOffFloorTitle("") === false);
  ok("undefined", isOffFloorTitle(undefined) === false);
  ok("null", isOffFloorTitle(null) === false);
  ok("a number", isOffFloorTitle(7) === false);
}

group("4. ★★ THE PRECEDENCE. An explicit answer wins in BOTH directions");
{
  const senior = "Owner", floor = "Team Member";

  ok("★ no record at all → the title decides, off", isOffFloor(undefined, senior) === true);
  ok("★ no record at all → the title decides, on", isOffFloor(undefined, floor) === false);
  ok("a record with no such field → the title decides",
    isOffFloor({ days: {} }, senior) === true);
  ok("and for floor staff too", isOffFloor({ days: {} }, floor) === false);

  ok("★ ticked ON the floor beats a senior title",
    isOffFloor({ noSchedule: false }, senior) === false);
  ok("★ ticked OFF the floor beats a floor title",
    isOffFloor({ noSchedule: true }, floor) === true);
  ok("ticked off agrees with a senior title", isOffFloor({ noSchedule: true }, senior) === true);
  ok("ticked on agrees with a floor title", isOffFloor({ noSchedule: false }, floor) === false);
}

group("5. ⚠️ `false` AND ABSENT MUST NOT BE THE SAME THING");
{
  /* The bug a truthiness test would reintroduce: `!rec.noSchedule` is true for
     both, so a senior leader whose record has never carried the field would
     read the same as one somebody had deliberately put back on the floor. */
  const naive = (rec, title) => (rec && rec.noSchedule) || isOffFloorTitle(title);
  ok("★ the two cases really do differ",
    isOffFloor({ noSchedule: false }, "Owner") !== isOffFloor({}, "Owner"));
  ok("★ and a plain OR would have got one of them wrong (control)",
    naive({ noSchedule: false }, "Owner") === true
    && isOffFloor({ noSchedule: false }, "Owner") === false);

  /* A junk value is not an answer, so the title still decides. */
  ok('the string "false" is not an answer', isOffFloor({ noSchedule: "false" }, "Owner") === true);
  ok("a 0 is not an answer either", isOffFloor({ noSchedule: 0 }, "Owner") === true);
  ok("and junk does not turn a floor person off", isOffFloor({ noSchedule: "yes" }, "Team Member") === false);
}

group("6. ★ THE EDITOR ROUND TRIP — the seeding bug, end to end");
{
  /* The editor seeds its checkbox, the leader changes nothing, the save writes
     `!!draft.noSchedule`. Whatever comes out must mean the same as what went
     in, for all four starting points. */
  const roundTrip = (rec, title) => {
    const seeded = isOffFloor(rec, title);            // what the box shows
    const saved = { ...(rec || {}), noSchedule: !!seeded };  // what Save writes
    return isOffFloor(saved, title);                  // what it means afterwards
  };
  ok("★ a senior leader with no record survives an untouched save",
    roundTrip(undefined, "Owner") === true);
  ok("★ a senior leader ticked back ON survives it",
    roundTrip({ noSchedule: false }, "Owner") === false);
  ok("floor staff with no record survives it",
    roundTrip(undefined, "Team Member") === false);
  ok("floor staff ticked OFF survives it",
    roundTrip({ noSchedule: true }, "Team Member") === true);

  /* ⚠️ AND THE OLD SEEDING REALLY DID BREAK IT (control). Seeding from the raw
     field turns a senior leader schedulable on the first save. */
  const oldSeed = (rec, title) => isOffFloor({ ...(rec || {}), noSchedule: !!(rec && rec.noSchedule) }, title);
  ok("★ the old seeding flipped a senior leader back on (control)",
    oldSeed(undefined, "Owner") === false);
}

group("7. the store's real six, through the whole rule");
{
  const off = SENIOR.filter(([, t]) => isOffFloor(undefined, t));
  console.log("        off the floor: " + off.map(([n]) => n.split(" ")[0]).join(", "));
  ok("★ all six come off the schedule", off.length === 6);
  ok("★ and the other hundred stay on",
    FLOOR.every(([, t]) => isOffFloor(undefined, t) === false));
  ok("★ any one of them can be put back with one tick",
    SENIOR.every(([, t]) => isOffFloor({ noSchedule: false }, t) === false));
}

if (fails.length) {
  console.log(`\noffFloor: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\noffFloor: ${pass} passed`);
