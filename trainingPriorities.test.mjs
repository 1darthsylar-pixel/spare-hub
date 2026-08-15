/* Training priorities, and the two auto-fill modes.

   Matt, Aug 14 2026: "can the schedule and setup auto fill the training
   positions for people when assigned to different ones? I also have a training
   priorities doc for front and back in my drive", then "Add both options".

   ⚠️ HALF OF WHAT IS BELOW EXISTS TO PROVE THE SAFE DIRECTION IS THE DEFAULT.
   `write` mode puts names on a board a leader prints. Anything unreadable,
   missing or misspelled has to land on `suggest`, and there is no input that
   turns `write` on by accident. */
import {
  TRAINING_KEY, TRAINING_SIDES, MODES, DEFAULT_MODE,
  readTraining, isWriteMode, setMode, setList, parseList,
  priorityRank, heldCodes, isTrainingPlacement, trainingGaps, nextToTrain,
} from "./trainingPriorities.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${SECTION}${n}${x ? "  — " + x : ""}`); };
/* This file's harness is quiet: it collects failures and prints one line. So a
   section is a PREFIX on a failure rather than a heading nobody reads. */
let SECTION = "";
const group = (n) => { SECTION = n + " · "; };

/* A store's list. ⚠️ DELIBERATELY NOT GATE CITY'S ORDER — this file must not
   become the place his list is written down, which is the whole reason the
   module has no seed. Real-shaped, invented content. */
const STORED = {
  v: 1,
  mode: "suggest",
  sides: {
    FOH: ["FRONT DRINKS", "DESSERT BAR", "HEADSET"],
    BOH: ["FRY STATION", "BREADER"],
  },
};

/* ── an empty store is a working store ──────────────────────────────────── */
{
  ok("the key is stable", TRAINING_KEY === "gcfcr-training-priorities-v1");
  ok("two sides", TRAINING_SIDES.join("|") === "FOH|BOH");

  const empty = readTraining(null);
  ok("nothing stored reads as a record, not a throw", !!empty && empty.v === 1);
  ok("★ and both sides are empty lists, never undefined",
    Array.isArray(empty.sides.FOH) && Array.isArray(empty.sides.BOH) &&
    empty.sides.FOH.length === 0 && empty.sides.BOH.length === 0);
  ok("junk reads the same way",
    readTraining("x").sides.FOH.length === 0 && readTraining(42).sides.BOH.length === 0);
  ok("★ nothing typed means nothing ranks",
    priorityRank(null, "FOH", "ANYTHING") === 0);
  ok("★ and nothing to train on, which is what keeps a new store quiet",
    trainingGaps([], "FOH", null).length === 0 &&
    nextToTrain([], "FOH", null) === "");
}

/* ── the default mode is the safe one ───────────────────────────────────── */
{
  ok("suggest is the default", DEFAULT_MODE === "suggest");
  ok("both modes exist", MODES.join("|") === "suggest|write");

  ok("★ nothing stored is suggest", readTraining(null).mode === "suggest");
  ok("★ an unreadable record is suggest", readTraining("garbage").mode === "suggest");
  ok("★ a misspelled mode is suggest, never honoured",
    readTraining({ mode: "Write" }).mode === "suggest" &&
    readTraining({ mode: "wrilte" }).mode === "suggest" &&
    readTraining({ mode: true }).mode === "suggest");
  ok("★ isWriteMode is false for every one of those",
    !isWriteMode(null) && !isWriteMode("garbage") &&
    !isWriteMode({ mode: "Write" }) && !isWriteMode({ mode: 1 }));

  ok("write can be chosen on purpose", setMode(STORED, "write").mode === "write");
  ok("and then it reads back as write", isWriteMode(setMode(STORED, "write")) === true);
  ok("★ an unknown mode is REFUSED, leaving what was there",
    setMode(setMode(STORED, "write"), "nonsense").mode === "write",
    setMode(setMode(STORED, "write"), "nonsense").mode);
  ok("switching back works", setMode(setMode(STORED, "write"), "suggest").mode === "suggest");
  ok("★ changing the mode does not touch either list",
    setMode(STORED, "write").sides.FOH.join("|") === "FRONT DRINKS|DESSERT BAR|HEADSET" &&
    setMode(STORED, "write").sides.BOH.join("|") === "FRY STATION|BREADER");
}

/* ── the lists ──────────────────────────────────────────────────────────── */
{
  ok("order is kept exactly as typed",
    readTraining(STORED).sides.FOH.join("|") === "FRONT DRINKS|DESSERT BAR|HEADSET");
  ok("rank is 1-based, because a human reads it",
    priorityRank(STORED, "FOH", "FRONT DRINKS") === 1 &&
    priorityRank(STORED, "FOH", "HEADSET") === 3);
  ok("★ not on the list is 0, which is NOT last",
    priorityRank(STORED, "FOH", "WINDOW") === 0);
  ok("★ a side only answers about its own list",
    priorityRank(STORED, "FOH", "BREADER") === 0 &&
    priorityRank(STORED, "BOH", "BREADER") === 2);
  ok("codes are normalised on the way in, so a paste with odd spacing still matches",
    priorityRank({ sides: { FOH: ["  front   drinks "] } }, "FOH", "Front Drinks") === 1);
  ok("★ the same code twice is one entry, not two priorities",
    readTraining({ sides: { FOH: ["A", "a", " A "] } }).sides.FOH.length === 1);
  ok("blanks are dropped rather than ranked",
    readTraining({ sides: { FOH: ["A", "", "   ", null, "B"] } }).sides.FOH.join("|") === "A|B");

  const set = setList(STORED, "BOH", ["Grill", "Grill", "Prep"]);
  ok("setList replaces one side", set.sides.BOH.join("|") === "GRILL|PREP");
  ok("★ and leaves the other side alone",
    set.sides.FOH.join("|") === "FRONT DRINKS|DESSERT BAR|HEADSET");
  ok("★ and keeps the mode", setList(setMode(STORED, "write"), "BOH", ["X"]).mode === "write");
  ok("an unknown side changes nothing",
    setList(STORED, "MIDDLE", ["X"]).sides.FOH.join("|") === "FRONT DRINKS|DESSERT BAR|HEADSET" &&
    !setList(STORED, "MIDDLE", ["X"]).sides.MIDDLE);
  ok("clearing a side is allowed, and is not a throw",
    setList(STORED, "FOH", []).sides.FOH.length === 0);
}

/* ── pasting the list out of the spreadsheet it lives in today ──────────── */
{
  /* The four shapes a copy out of Sheets or a doc actually produces. */
  const csv = parseList("1,Drinks\n2,Desserts\n3,Inside expo");
  ok("★ a CSV row, which is what Sheets copies",
    csv.codes.join("|") === "DRINKS|DESSERTS|INSIDE EXPO", JSON.stringify(csv.codes));
  ok("a numbered list",
    parseList("1. Drinks\n2. Desserts").codes.join("|") === "DRINKS|DESSERTS");
  ok("a tab, which is what a browser copy produces",
    parseList("1\tDrinks\n2\tDesserts").codes.join("|") === "DRINKS|DESSERTS");
  ok("just the names, in order",
    parseList("Drinks\nDesserts").codes.join("|") === "DRINKS|DESSERTS");
  ok("and a closing bracket style",
    parseList("1) Drinks\n2) Desserts").codes.join("|") === "DRINKS|DESSERTS");

  ok("blank lines are skipped silently, they are not a problem to report",
    parseList("Drinks\n\n\nDesserts").codes.length === 2 &&
    parseList("Drinks\n\n\nDesserts").problems.length === 0);
  ok("★ a hand-numbered list with a hole still comes out contiguous",
    parseList("1,A\n2,B\n4,C\n5,D").codes.join("|") === "A|B|C|D",
    JSON.stringify(parseList("1,A\n2,B\n4,C\n5,D").codes));
  ok("★ a duplicate is REPORTED rather than silently dropped",
    parseList("Drinks\nDesserts\nDrinks").codes.length === 2 &&
    parseList("Drinks\nDesserts\nDrinks").problems.length === 1);
  ok("a line that is only a number reports rather than storing nothing",
    parseList("Drinks\n7").problems.length === 1 &&
    parseList("Drinks\n7").codes.join("|") === "DRINKS");
  ok("nothing pasted is empty, not a throw",
    parseList("").codes.length === 0 && parseList(null).codes.length === 0);
  /* ⚠️⚠️ THE AMBIGUOUS CASE, AND THE REASON NUMBERING IS DECIDED FOR THE WHOLE
     PASTE. "1 Drinks" and "2 Sided Prep" are the same shape. Stripping line by
     line turns a real station into "SIDED PREP" and the whole list then points
     at a station nobody has. */
  ok("a number and a space, when the whole paste ascends, IS a numbered list",
    parseList("1 Drinks\n2 Desserts\n3 Inside expo").codes.join("|") === "DRINKS|DESSERTS|INSIDE EXPO",
    JSON.stringify(parseList("1 Drinks\n2 Desserts\n3 Inside expo").codes));
  ok("★★ a station whose NAME starts with a digit keeps it",
    parseList("2 Sided Prep").codes.join("|") === "2 SIDED PREP",
    JSON.stringify(parseList("2 Sided Prep").codes));
  ok("★ and keeps it in a list of names that do not ascend",
    parseList("2 Sided Prep\n3 Bay Fryer\nBreader").codes.join("|") === "2 SIDED PREP|3 BAY FRYER|BREADER",
    JSON.stringify(parseList("2 Sided Prep\n3 Bay Fryer\nBreader").codes));
  ok("★ numbers that do not ascend are names, not markers",
    parseList("3 Bay Fryer\n2 Sided Prep").codes.join("|") === "3 BAY FRYER|2 SIDED PREP",
    JSON.stringify(parseList("3 Bay Fryer\n2 Sided Prep").codes));
  ok("★ but real punctuation is always a marker, even for one line",
    parseList("2. Sided Prep").codes.join("|") === "SIDED PREP" &&
    parseList("2,Sided Prep").codes.join("|") === "SIDED PREP");

  const round = setList(STORED, "FOH", parseList("1,Drinks\n2,Desserts").codes);
  ok("★ a paste round-trips into a stored list",
    round.sides.FOH.join("|") === "DRINKS|DESSERTS");
}

/* ── what somebody holds, and what that makes a placement ───────────────── */
{
  const rec = { jobs: { "FRONT DRINKS": "advanced", "HEADSET": "beginner" } };
  /* ★ THE SET IS WHAT THE QUESTIONS TAKE NOW. Either source builds one:
     certifications through heldCodes, the boards through rolesOf(id). */
  const held = heldCodes(rec);

  ok("held codes come off the jobs map", heldCodes(rec).sort().join("|") === "FRONT DRINKS|HEADSET");
  ok("★ nobody rated yet answers empty rather than throwing",
    heldCodes(null).length === 0 && heldCodes({}).length === 0 && heldCodes({ jobs: null }).length === 0);

  ok("★ a station they hold nothing on is training",
    isTrainingPlacement(held, "DESSERT BAR") === true);
  ok("★★ a station they hold at BEGINNER is NOT training, and that is the whole rule",
    isTrainingPlacement(held, "HEADSET") === false);
  ok("nor is one they are advanced on", isTrainingPlacement(held, "FRONT DRINKS") === false);
  ok("somebody with no record at all is training everywhere",
    isTrainingPlacement(null, "HEADSET") === true);
  ok("a blank code is never a training placement",
    isTrainingPlacement(held, "") === false && isTrainingPlacement(held, null) === false);
  ok("spacing does not create a phantom gap",
    isTrainingPlacement(held, " front drinks ") === false);

  ok("★ the gap list is the store's order, not the record's",
    trainingGaps(held, "FOH", STORED).join("|") === "DESSERT BAR",
    JSON.stringify(trainingGaps(held, "FOH", STORED)));
  ok("next to train is the first gap", nextToTrain(held, "FOH", STORED) === "DESSERT BAR");
  ok("★ somebody holding everything on the list has nothing to train on",
    nextToTrain(["FRONT DRINKS","DESSERT BAR","HEADSET"], "FOH", STORED) === "");
  ok("★ somebody holding nothing gets the store's order, top first",
    trainingGaps([], "FOH", STORED).join("|") === "FRONT DRINKS|DESSERT BAR|HEADSET");
  ok("★ a station they lack that the store never RANKED is not offered",
    !trainingGaps([], "FOH", STORED).includes("WINDOW"));
  ok("the other side is answered separately",
    trainingGaps(held, "BOH", STORED).join("|") === "FRY STATION|BREADER");
}

/* ── it names no store ──────────────────────────────────────────────────── */
{
  const src = [readTraining, parseList, trainingGaps, isTrainingPlacement].map(String).join("\n");
  ["DRINK", "DESSERT", "EXPO", "BAGGING", "IPOS", "DINING", "REGISTER",
   "Gate City", "04010", "BREADER", "WINDOW"].forEach((w) =>
    ok(`no "${w}" in the code`, !src.toUpperCase().includes(w.toUpperCase())));
}


/* ══════════════════════════════════════════════════════════════════════════
   ADDED Aug 14 2026 — "training list priorities arent correct either".

   The trailing-number rule collapses REGISTER 1/2/3 and nothing else. On this
   store's own front list that left TWELVE rows where Matt's own document has
   NINE positions: two baggers, two drive-thru rows and an OT captain beside
   OT 1 and OT 2, every pair really one position.

   Widening the guess was the alternative and every widening breaks something
   real here — first-word splits INSIDE EXPO from EXPO, before-a-slash does
   nothing for TRADITIONAL BAGGER vs MOBILE BAGGER. Which stations are one
   training position is a fact about a BUILDING, so the store says it.

   ⚠️⚠️ SECTION M4 IS THE ONE THAT FOUND A REAL BUG WHILE THIS WAS BEING
   BUILT. Collapsing used to be destructive — the reader collapsed, the screen
   saved what the reader returned, and the folded rows were gone from storage.
   Un-merging then left the list SHORTER than it started, because the rows no
   longer existed to come back. `rawSides` is why that no longer happens.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const { readTraining: rt, mergeCodes: mc, unmergeCode: uc, setList: sl, familyOf: fo, readMerges: rm } =
    await import("./trainingPriorities.js");

  /* The store's real front list, as stored. */
  const REAL = ["DRINKS", "DESSERTS", "INSIDE EXPO", "WINDOW", "DT TRADITIONAL", "DT MOBILES",
    "TRADITIONAL BAGGER", "MOBILE BAGGER", "REGISTER 1", "REGISTER 2", "REGISTER 3",
    "HOSPITALITY", "OT CAPTAIN", "OT 1", "OT 2"];
  const base = { v: 1, mode: "suggest", sides: { FOH: REAL, BOH: [] } };
  const foh = (r) => r.sides.FOH;

  group("M0. controls — the real list, and what the old rule alone does");
  {
    ok("the stored list really is 15 rows", REAL.length === 15);
    ok("★ the number rule alone leaves 12", foh(rt(base)).length === 12, foh(rt(base)).length);
    ok("★ REGISTER 2 and 3 were already folded", !foh(rt(base)).includes("REGISTER 2"));
    ok("★★ AND THE TWO BAGGERS WERE NOT — this is the complaint",
      foh(rt(base)).includes("TRADITIONAL BAGGER") && foh(rt(base)).includes("MOBILE BAGGER"));
    ok("a record with no merges reads exactly as it did before", rt(base).merges.FOH.length === 0);
  }

  group("M1. ★★ THE STORE'S OWN GROUPS GET IT TO NINE");
  {
    let r = base;
    r = mc(r, "FOH", ["TRADITIONAL BAGGER", "MOBILE BAGGER"]);
    r = mc(r, "FOH", ["DT TRADITIONAL", "DT MOBILES"]);
    r = mc(r, "FOH", ["OT CAPTAIN", "OT 1", "OT 2"]);
    ok("★★ NINE POSITIONS, which is what his document has", foh(r).length === 9, foh(r));
    ok("★ the row kept is a real station, not an invented family name",
      foh(r).includes("TRADITIONAL BAGGER") && !foh(r).includes("BAGGER"));
    ok("★ the folded one is gone from the list", !foh(r).includes("MOBILE BAGGER"));
    ok("the order the store typed survives", foh(r)[0] === "DRINKS" && foh(r)[3] === "WINDOW");
    ok("★ and it survives a round trip through storage",
      foh(rt(JSON.parse(JSON.stringify(r)))).length === 9);
  }

  group("M2. ⚠️ A MERGE IS THE STORE'S ANSWER AND BEATS THE GUESS");
  {
    const r = mc(base, "FOH", ["REGISTER 1", "HOSPITALITY"]);
    ok("★ an odd-looking merge is honoured, because the store means it",
      fo("HOSPITALITY", r.merges.FOH) === "REGISTER 1", fo("HOSPITALITY", r.merges.FOH));
    ok("★★ REGISTER 2 JOINS THE DECLARED GROUP rather than splitting off into its own",
      fo("REGISTER 2", r.merges.FOH) === "REGISTER 1", fo("REGISTER 2", r.merges.FOH));
    ok("★ so it is still off the list, not a new second position", !foh(r).includes("REGISTER 2"));
    ok("a code with no group anywhere near it still uses the number rule",
      fo("EXPO 2", r.merges.FOH) === "EXPO");
    ok("an unknown code answers its own family", fo("BREADER", r.merges.FOH) === "BREADER");
    ok("nothing at all is an empty answer", fo("", []) === "" && fo(null, null) === "");
  }

  group("M3. ⚠️ A GROUP OF ONE IS NOT A MERGE, and a code lives in one group");
  {
    ok("★ one code is refused rather than stored doing nothing",
      mc(base, "FOH", ["DRINKS"]).merges.FOH.length === 0);
    ok("an empty pick is refused", mc(base, "FOH", []).merges.FOH.length === 0);
    ok("a side that does not exist changes nothing", mc(base, "SIDE", ["A", "B"]).merges.FOH.length === 0);
    ok("the same code twice in one pick is one member",
      mc(base, "FOH", ["DRINKS", "DRINKS", "DESSERTS"]).merges.FOH[0].length === 2);

    /* ⚠️ MOVING A CODE MUST TAKE IT OUT OF ITS OLD GROUP. Left in both,
       `familyOf` scans top to bottom and the answer would depend on the order
       groups happen to sit in. */
    let r = mc(base, "FOH", ["OT CAPTAIN", "OT 1", "OT 2"]);
    r = mc(r, "FOH", ["OT 2", "HOSPITALITY"]);
    ok("★★ OT 2 IS IN EXACTLY ONE GROUP",
      r.merges.FOH.filter((g) => g.includes("OT 2")).length === 1,
      r.merges.FOH);
    ok("and the group it left is still a real group",
      r.merges.FOH.some((g) => g.includes("OT CAPTAIN") && g.includes("OT 1")));
    ok("a group left with one member is dropped",
      rm({ FOH: [["A", "B"], ["A"]] }).FOH.length === 1);
  }

  group("M4. ⚠️⚠️ UNDOING A MERGE REALLY BRINGS THE ROWS BACK");
  {
    let r = mc(base, "FOH", ["OT CAPTAIN", "OT 1", "OT 2"]);
    const merged = foh(r).length;
    r = uc(r, "FOH", "OT 1");
    ok("★★ THE LIST GETS LONGER AGAIN, which it could not do before rawSides",
      foh(r).length > merged, `${merged} -> ${foh(r).length}`);
    ok("★ OT 1 is back on the list", foh(r).includes("OT 1"), foh(r));
    ok("undoing by ANY member works, not just the first", foh(uc(mc(base, "FOH", ["OT CAPTAIN", "OT 1"]), "FOH", "OT CAPTAIN")).includes("OT 1"));
    ok("★ the list as typed is kept whole", r.rawSides.FOH.length === 15, r.rawSides.FOH.length);
    ok("undoing a code in no group changes nothing",
      foh(uc(base, "FOH", "DRINKS")).length === 12);
    ok("★ merging again after undoing works", foh(mc(r, "FOH", ["OT CAPTAIN", "OT 1", "OT 2"])).length === merged);
  }

  group("M5. ⚠️ PASTING A NEW LIST KEEPS THE GROUPS AND STAYS COLLAPSED");
  {
    let r = mc(base, "FOH", ["TRADITIONAL BAGGER", "MOBILE BAGGER"]);
    r = sl(r, "FOH", ["DRINKS", "TRADITIONAL BAGGER", "MOBILE BAGGER", "WINDOW"]);
    ok("★ the new list is collapsed on arrival", foh(r).length === 3, foh(r));
    ok("★★ the group was not thrown away by the paste",
      r.merges.FOH.some((g) => g.includes("MOBILE BAGGER")), r.merges.FOH);
    ok("the new list is what was stored, not the old one", foh(r)[0] === "DRINKS" && foh(r).includes("WINDOW"));
    ok("★ and the raw list is the NEW paste, not the old fifteen", r.rawSides.FOH.length === 4);
  }

  group("M6. ⚠️ A RECORD WRITTEN BEFORE TODAY STILL READS");
  {
    ok("★ no merges key at all", rt({ sides: { FOH: ["DRINKS"] } }).sides.FOH.length === 1);
    ok("a junk merges key is empty groups", rt({ merges: "no", sides: { FOH: ["A"] } }).merges.FOH.length === 0);
    ok("junk inside a group is dropped", rm({ FOH: [[null, "", "A", "B"]] }).FOH[0].length === 2);
    ok("a group that is not an array is dropped", rm({ FOH: ["nope", ["A", "B"]] }).FOH.length === 1);
    ok("★ no rawSides falls back to sides, which is all that record can offer",
      rt({ sides: { FOH: ["DRINKS", "WINDOW"] } }).rawSides.FOH.length === 2);
    ok("★ both sides always answer", TRAINING_SIDES.every((sd) => Array.isArray(rt(null).merges[sd])));
  }
}

if (fails.length) {
  console.log(`trainingPriorities: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`trainingPriorities: ${pass} passed`);
