/* ============================================================================
   positionFamily.test.mjs — one position appears once on a training list.

       node positionFamily.test.mjs

   Matt, Aug 14 2026, reading his own front list back: "for training don't
   repeat positions. For example you only need expo once or register once."

   ⚠️ IT IMPORTS AND RUNS THE RULE. The repo has shipped a script that was DEAD
   while every text-based test of it passed (`newstore.mjs`, Aug 13 2026).

   ═══ THE TWO HALVES, AND THE SECOND IS THE ONE THAT BITES ═════════════════
   1. the LIST collapses, so a leader does not read "learn register" three times
   2. MATCHING follows it, so somebody certified on one numbered spot is not
      badged as training when they stand at the next one along. Getting 1 right
      and 2 wrong would put an L on most of the front board every day.

   ⚠️ STATION NAMES LIVE IN THIS FILE, NEVER IN THE MODULE. `trainingPriorities`
   has its own guard asserting no station name appears in its source, because a
   name in there travels into the next store's repo. A test is allowed to know
   what a register is called; the code is not.
   ============================================================================ */
import {
  positionFamily, collapseFamilies, readTraining, parseList,
  priorityRank, isTrainingPlacement, trainingGaps, setList,
} from "./trainingPriorities.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`); }
};
const group = (n) => console.log(`\n── ${n}`);

group("0. controls — the module really loaded");
{
  ok("positionFamily is a function", typeof positionFamily === "function");
  ok("collapseFamilies is a function", typeof collapseFamilies === "function");
  ok("it really strips (control)", positionFamily("REGISTER 1") === "REGISTER");
}

group("1. a trailing standalone number is a place to stand, not a thing to learn");
{
  ok("REGISTER 1 → REGISTER", positionFamily("REGISTER 1") === "REGISTER");
  ok("REGISTER 3 → REGISTER", positionFamily("REGISTER 3") === "REGISTER");
  ok("EXPO 2 → EXPO", positionFamily("EXPO 2") === "EXPO");
  ok("OT 1 → OT", positionFamily("OT 1") === "OT");
  ok("DISH 1 → DISH", positionFamily("DISH 1") === "DISH");
  ok("it normalises case and spacing first", positionFamily("  register  2 ") === "REGISTER");
}

group("2. ⚠️ AND NOTHING ELSE. A digit that means something keeps its meaning");
{
  ok("OT CAPTAIN is not an OT", positionFamily("OT CAPTAIN") === "OT CAPTAIN");
  ok("a digit mid-name is untouched", positionFamily("BOARDS 1 SANDWICHES") === "BOARDS 1 SANDWICHES");
  ok("a digit list with a suffix is untouched",
    positionFamily("MACHINES 1,2,3 — DT LEAD") === "MACHINES 1,2,3 — DT LEAD");
  ok("and its sibling stays a separate position",
    positionFamily("MACHINES 4,5 / GRILLS — FOH LEAD") !== positionFamily("MACHINES 1,2,3 — DT LEAD"));
  ok("a slashed name is untouched", positionFamily("HASH / P FRY") === "HASH / P FRY");
  ok("two fry stations stay two", positionFamily("HASH / P FRY") !== positionFamily("HASH/S FRY"));
}

group("3. junk in does not collapse everything onto one family");
{
  /* A name that is ONLY a number must keep it. Stripping it to "" would fold
     every numeric station onto one empty family and silently merge them. */
  ok("a name that is only a number keeps it", positionFamily("1") === "1");
  ok("empty stays empty", positionFamily("") === "");
  ok("undefined stays empty", positionFamily(undefined) === "");
  ok("null stays empty", positionFamily(null) === "");
  ok("collapseFamilies of junk is []", JSON.stringify(collapseFamilies(null)) === "[]");
  ok("a blank entry is dropped, not kept as an empty row",
    JSON.stringify(collapseFamilies(["", "  ", "WINDOW"])) === JSON.stringify(["WINDOW"]));
}

group("4. ★ THE STORE'S REAL FRONT LIST, as saved before the rule existed");
{
  /* Read from production Aug 14 2026. Fifteen rows, three of them registers and
     two of them outside spots. */
  const REAL = ["DRINKS", "DESSERTS", "INSIDE EXPO", "WINDOW", "DT TRADITIONAL",
    "DT MOBILES", "TRADITIONAL BAGGER", "MOBILE BAGGER", "REGISTER 1", "REGISTER 2",
    "REGISTER 3", "HOSPITALITY", "OT CAPTAIN", "OT 1", "OT 2"];
  const out = collapseFamilies(REAL);
  console.log("        " + out.join(" · "));
  ok(`fifteen rows become twelve (${out.length})`, out.length === 12);
  ok("★ register appears once", out.filter((c) => c.startsWith("REGISTER")).length === 1);
  ok("★ and it is the first one typed, a station that really exists",
    out.includes("REGISTER 1"));
  ok("★ the outside spots collapse to one", out.filter((c) => /^OT \d/.test(c)).length === 1);
  ok("★ but the captain survives as its own position", out.includes("OT CAPTAIN"));
  ok("the store's order is kept", out[0] === "DRINKS" && out[1] === "DESSERTS");
  ok("nothing else was dropped",
    ["DRINKS", "DESSERTS", "INSIDE EXPO", "WINDOW", "DT TRADITIONAL", "DT MOBILES",
      "TRADITIONAL BAGGER", "MOBILE BAGGER", "HOSPITALITY"].every((c) => out.includes(c)));
}

group("5. ⚠️ IT COLLAPSES ON READ, so a list saved yesterday is fixed today");
{
  /* The bug this guards: fixing only the paste path leaves every already-saved
     list showing its repeats until somebody happens to re-paste it. */
  const SAVED = { v: 1, mode: "suggest", sides: { FOH: ["REGISTER 1", "REGISTER 2", "REGISTER 3", "WINDOW"], BOH: [] } };
  const read = readTraining(SAVED);
  ok("★ a stored list with three registers reads as one", read.sides.FOH.length === 2,
    JSON.stringify(read.sides.FOH));
  ok("and window survived", read.sides.FOH.includes("WINDOW"));
  /* Three registers plus WINDOW is FOUR stored rows. The reader must leave all
     four sitting in the record it was handed. */
  ok("⚠️ the stored record itself is NOT rewritten (design rule 1)",
    SAVED.sides.FOH.length === 4, String(SAVED.sides.FOH.length));
  ok("the mode is untouched by any of it", read.mode === "suggest");
}

group("6. a paste collapses too, and does not call it a mistake");
{
  const { codes, problems } = parseList("1. Register 1\n2. Register 2\n3. Register 3\n4. Window");
  ok("★ four pasted lines store two positions", codes.length === 2, JSON.stringify(codes));
  ok("★ and NOTHING is reported as unreadable", problems.length === 0, JSON.stringify(problems));
  ok("the numbering was still stripped", codes[0] === "REGISTER 1");
}

group("7. ★★ MATCHING FOLLOWS THE LIST, which is the half that bites");
{
  const stored = setList({ v: 1, mode: "suggest", sides: { FOH: [], BOH: [] } },
    "FOH", ["REGISTER 1", "REGISTER 2", "WINDOW", "DRINKS"]);

  ok("the list itself collapsed", (stored.sides.FOH || []).length === 3,
    JSON.stringify(stored.sides.FOH));

  /* Certified on REGISTER 1 only. */
  const held = ["REGISTER 1"];
  ok("★ standing at REGISTER 2 is NOT training", isTrainingPlacement(held, "REGISTER 2") === false);
  ok("★ standing at REGISTER 1 is NOT training", isTrainingPlacement(held, "REGISTER 1") === false);
  ok("★ standing at WINDOW still IS training", isTrainingPlacement(held, "WINDOW") === true);
  ok("holding nothing means everything is training", isTrainingPlacement([], "REGISTER 2") === true);

  ok("★ register is not offered as a gap to somebody who does one",
    !trainingGaps(held, "FOH", stored).some((c) => c.startsWith("REGISTER")),
    JSON.stringify(trainingGaps(held, "FOH", stored)));
  ok("the real gaps are offered, in the store's order",
    trainingGaps(held, "FOH", stored).join("|") === "WINDOW|DRINKS");

  /* ⚠️ THE RANK LOOKUP MUST FAMILY TOO. The list keeps one member per position,
     so an exact match answers "not on the list" for every register but the one
     that happened to be typed first — a placement with no priority at all. */
  ok("★ REGISTER 1 ranks 1", priorityRank(stored, "FOH", "REGISTER 1") === 1);
  ok("★ REGISTER 2 ranks 1 as well, not 0", priorityRank(stored, "FOH", "REGISTER 2") === 1,
    String(priorityRank(stored, "FOH", "REGISTER 2")));
  ok("★ REGISTER 9, a spot nobody typed, still ranks 1",
    priorityRank(stored, "FOH", "REGISTER 9") === 1);
  ok("WINDOW ranks 2", priorityRank(stored, "FOH", "WINDOW") === 2);
  ok("a station nobody ranked is still 0", priorityRank(stored, "FOH", "TRUCK") === 0);
}

if (fails.length) {
  console.log(`\npositionFamily: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\npositionFamily: ${pass} passed`);
