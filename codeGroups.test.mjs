/* ============================================================================
   codeGroups.test.mjs — setting one skill across a whole section.

       node codeGroups.test.mjs

   Matt, Aug 14 2026: "for job skill i want an option to apply the same skill to
   all jobs", then "by section", then the example that settled the design:
   "brandon should be advanced for all boh jobs. hes the director."

   ═══ WHAT IS BEING PROTECTED ════════════════════════════════════════════════
   The groups are derived from the codes themselves — side, zone, leader — and
   never stored. That is what stops a second list drifting from the first, and
   it means a store that types a new code gets it in the right group with
   nothing extra to do.

   ⚠️⚠️ THE RULE WITH TEETH: A LEADERSHIP CODE IS NEVER INSIDE A SIDE GROUP.
   "Advanced at every kitchen job" must not also say "advanced at LEADING the
   kitchen". Those are two different sentences about a person, and one of them
   is a promotion. Section 3 is that rule.
   ============================================================================ */
import { codeGroups, codeIndex, readJobCodes, DEFAULT_CODES } from "./jobCodes.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const build = (codes) => {
  const store = readJobCodes({ v: 1, codes });
  return { groups: codeGroups(store.codes, codeIndex(store)), store };
};
const byId = (groups, id) => groups.find((g) => g.id === id);

/* The store's real seed, which is what a leader opening this screen sees. */
const SEED = DEFAULT_CODES.map((c) => ({ ...c }));

group("0. controls");
{
  const { groups } = build(SEED);
  ok("something came back", groups.length > 1, groups.map((g) => g.id));
  ok("★ 'Every job' is first, because it is the one people reach for", groups[0].id === "all");
  ok("nothing at all is an empty list, not a crash", codeGroups([], codeIndex(readJobCodes(null))).length === 0);
  ok("junk in is an empty list", codeGroups(null, null).length === 0);
}

group("1. ★★ THE CASE MATT NAMED — advanced for all BOH jobs");
{
  const { groups } = build(SEED);
  const kitchen = byId(groups, "BOH");
  ok("★ there is a Kitchen group", !!kitchen);
  ok("★ it holds the nine kitchen codes", kitchen.codes.length === 9, kitchen.codes);
  ok("BOARDS 1 is in it", kitchen.codes.includes("BOARDS 1 SANDWICHES"));
  ok("BREADER is in it", kitchen.codes.includes("BREADER"));
  ok("TRUCK is in it", kitchen.codes.includes("TRUCK"));
  ok("★★ DRIVE THRU is NOT in it", !kitchen.codes.includes("DRIVE THRU"));
  ok("the label is a word, not a side code", kitchen.label === "Kitchen", kitchen.label);
}

group("2. ★ THE FRONT");
{
  const { groups } = build(SEED);
  const front = byId(groups, "FOH");
  ok("there is a Front group", !!front);
  ok("DRIVE THRU is in it", front.codes.includes("DRIVE THRU"));
  ok("★ no kitchen code leaked in", !front.codes.some((c) => /BREADER|FRIES|TRUCK/.test(c)), front.codes);
  ok("★ every code lands in exactly one side group",
    byId(groups, "BOH").codes.every((c) => !front.codes.includes(c)));
}

group("3. ⚠️⚠️ LEADERSHIP IS ITS OWN GROUP AND IS IN NO OTHER");
{
  const { groups } = build(SEED);
  const lead = byId(groups, "leader"), kitchen = byId(groups, "BOH"), front = byId(groups, "FOH");
  ok("★ there is a Leadership group", !!lead);
  ok("it holds all three leader codes", lead.codes.length === 3, lead.codes);
  ok("★★ LEADERSHIP is not in Front", !front.codes.includes("LEADERSHIP"), front.codes);
  ok("★★ DT LEADER is not in Front", !front.codes.includes("DT LEADER"));
  ok("★★ no leader code is in Kitchen either", !kitchen.codes.some((c) => lead.codes.includes(c)));

  /* A kitchen leadership code proves the rule is about `leader`, not about
     which side the code sits on. */
  const { groups: g2 } = build([...SEED, { code: "KITCHEN LEAD", side: "BOH", leader: true }]);
  ok("★★ A KITCHEN LEADER CODE STILL SITS OUTSIDE THE KITCHEN GROUP",
    !byId(g2, "BOH").codes.includes("KITCHEN LEAD") && byId(g2, "leader").codes.includes("KITCHEN LEAD"),
    byId(g2, "BOH").codes);
  ok("and Kitchen is otherwise unchanged", byId(g2, "BOH").codes.length === 9);
}

group("4. ★ 'Every job' REALLY MEANS EVERY JOB, LEADERSHIP INCLUDED");
{
  const { groups } = build(SEED);
  const all = byId(groups, "all");
  ok("★ it is the full list", all.codes.length === SEED.length, all.codes.length);
  ok("★ leadership IS in it — chosen on purpose is a different thing from swept in",
    all.codes.includes("LEADERSHIP") && all.codes.includes("DT LEADER"));
  ok("every side-group code appears in it",
    byId(groups, "BOH").codes.every((c) => all.codes.includes(c)));
}

group("5. ⚠️ AN EMPTY OR REDUNDANT GROUP IS DROPPED, NOT SHOWN GREY");
{
  /* No zones typed anywhere: the two front-zone pickers would change exactly
     what the Front picker changes. */
  const { groups } = build(SEED);
  ok("★ no zone pickers when nothing has a zone", !byId(groups, "DT") && !byId(groups, "FC"));

  /* One front code zoned DT, the rest not: now DT is a real subset. */
  const zoned = SEED.map((c) => (c.code === "DRIVE THRU" ? { ...c, zone: "DT" } : c));
  const { groups: g2 } = build(zoned);
  ok("★ a real subset DOES get its own picker", !!byId(g2, "DT"), g2.map((g) => g.id));
  ok("it holds only the zoned code", byId(g2, "DT").codes.length === 1);
  ok("the label names the planner's own bucket", /Drive Thru/.test(byId(g2, "DT").label), byId(g2, "DT").label);
  ok("★ FC is still absent, because nothing is FC", !byId(g2, "FC"));

  /* EVERY front code zoned DT: the DT picker is the Front picker renamed. */
  const allDt = SEED.map((c) => (c.side === "FOH" && !c.leader ? { ...c, zone: "DT" } : c));
  const { groups: g3 } = build(allDt);
  ok("★★ A ZONE HOLDING THE WHOLE SIDE IS NOT OFFERED TWICE", !byId(g3, "DT"), g3.map((g) => g.id));
  ok("but Front is still there", !!byId(g3, "FOH"));

  /* Kitchen only. */
  const { groups: g4 } = build([{ code: "BREADER", side: "BOH", leader: false }]);
  ok("★ a store with only kitchen codes gets no Front picker", !byId(g4, "FOH"));
  ok("and no Leadership picker", !byId(g4, "leader"));
}

group("6. ⚠️ CODES ARE NORMALISED AND DEDUPED, so one job is never set twice");
{
  const { groups } = build([
    { code: "breader", side: "BOH", leader: false },
    { code: "  Breader  ", side: "BOH", leader: false },
    { code: "BOARDS  1   SANDWICHES", side: "BOH", leader: false },
  ]);
  const kitchen = byId(groups, "BOH");
  ok("★ the same job twice is one entry", kitchen.codes.length === 2, kitchen.codes);
  ok("it is stored upper case", kitchen.codes.includes("BREADER"));
  ok("★ runs of spaces collapse, matching normCode everywhere else",
    kitchen.codes.includes("BOARDS 1 SANDWICHES"), kitchen.codes);
}

group("7. ★ A CODE NOBODY HAS CLASSIFIED STILL LANDS SOMEWHERE");
{
  /* With no typed entry, `sideOf` falls back to the kitchen-word regex, which
     is the behaviour the Hub had before job codes were editable. The point of
     this section is that such a code is never silently dropped from every
     group — that would make "Every job" a lie. */
  const { groups } = build([]);
  const loose = codeGroups(["FRIES", "DRIVE THRU", "SOMETHING NEW"], codeIndex(readJobCodes(null)));
  ok("★ every loose code is in 'Every job'", byId(loose, "all").codes.length === 3, byId(loose, "all").codes);
  ok("the kitchen word still reads as kitchen", byId(loose, "BOH").codes.includes("FRIES"));
  ok("★ an unclassified code is not lost",
    byId(loose, "BOH").codes.concat(byId(loose, "FOH").codes).includes("SOMETHING NEW"));
  ok("an empty store on its own is an empty answer", groups.length === 0);
}

group("8. ★ PLAIN STRINGS AND CODE OBJECTS BOTH WORK");
{
  const store = readJobCodes({ v: 1, codes: SEED });
  const idx = codeIndex(store);
  const fromObjects = codeGroups(store.codes, idx);
  const fromStrings = codeGroups(store.codes.map((c) => c.code), idx);
  ok("★ the two agree exactly", JSON.stringify(fromObjects) === JSON.stringify(fromStrings));
}

group("9. ⚠️⚠️ A STATION THAT LEADS IS STILL A STATION — Matt's own screen, Aug 14 2026");
{
  /* He pressed Kitchen → advanced and three BOH rows stayed "not trained".
     All three are real stations in his kitchen; all three were skipped because
     `isLeaderCode` matches the word "lead". His words: "Machines is BOH."
     ⇒ The test is not the word in the name. It is whether the code came from
     the BOARD, which `positionsFromStations` stamps as `fromStations`. */
  const REAL_BOARD_ROWS = [
    { code: "MACHINES 1,2,3 — DT LEAD", side: "BOH", leader: true, fromStations: true },
    { code: "MACHINES 4,5 / GRILLS — FOH LEAD", side: "BOH", leader: true, fromStations: true },
    { code: "KITCHEN LEAD / DT", side: "BOH", leader: true, fromStations: true },
    { code: "BREADER", side: "BOH", leader: false, fromStations: true },
  ];
  const { groups } = build([...SEED, ...REAL_BOARD_ROWS]);
  const kitchen = byId(groups, "BOH"), lead = byId(groups, "leader");

  ok("★★ MACHINES 1,2,3 IS IN THE KITCHEN GROUP",
    kitchen.codes.includes("MACHINES 1,2,3 — DT LEAD"), kitchen.codes);
  ok("★★ AND SO IS MACHINES 4,5, whose NAME says FOH LEAD and whose SIDE is BOH",
    kitchen.codes.includes("MACHINES 4,5 / GRILLS — FOH LEAD"));
  ok("★★ AND KITCHEN LEAD / DT", kitchen.codes.includes("KITCHEN LEAD / DT"));
  ok("★ none of them is in Leadership — they are places to stand, not ranks",
    !lead.codes.some((c) => /MACHINES|KITCHEN LEAD/.test(c)), lead.codes);

  ok("★★ AND THE TYPED RANK CODES ARE STILL HELD OUT of both side groups",
    lead.codes.includes("DT LEADER") && !kitchen.codes.includes("DT LEADER")
      && !byId(groups, "FOH").codes.includes("DT LEADER"));
  ok("Leadership is still exactly the three typed ones", lead.codes.length === 3, lead.codes);

  /* ⚠️ A TYPED CODE THAT LEADS STAYS A RANK even if a station shares its name.
     The store typing "DT LEADER" means the rank; the board deriving
     "MACHINES 1,2,3 — DT LEAD" means the row. */
  const typedOnly = build([{ code: "GRILL LEAD", side: "BOH", leader: true }]);
  ok("★ a typed leader code with no board row is a rank",
    byId(typedOnly.groups, "leader").codes.includes("GRILL LEAD")
      && !byId(typedOnly.groups, "BOH"), byId(typedOnly.groups, "leader").codes);

  const boardOnly = build([{ code: "GRILL LEAD", side: "BOH", leader: true, fromStations: true }]);
  ok("★★ the SAME NAME off the board is a station",
    byId(boardOnly.groups, "BOH").codes.includes("GRILL LEAD")
      && !byId(boardOnly.groups, "leader"), boardOnly.groups.map((g) => g.id));
}

if (fails.length) {
  console.log(`\ncodeGroups: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\ncodeGroups: ${pass} passed`);
