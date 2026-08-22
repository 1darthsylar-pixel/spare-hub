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
  moveInList, collapseFamilies, mergeCodes,
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


/* ══════════════════════════════════════════════════════════════════════════
   ADDED Aug 18 2026 — THE STORE'S MERGES REACH THE TRAINING BADGE.

   ⚠️⚠️ THEY DID NOT, AND THAT WAS THE WHOLE POINT OF TYPING THEM. `readMerges`
   exists because the trailing-number guess gets some boards wrong, and its own
   header says so. But `isTrainingPlacement` — the one function that decides
   whether standing somewhere counts as learning it — asked the guess anyway.

   ⇒ A store declares two rows are one position, and somebody already rated on
   one of them still badged as IN TRAINING on the other, on a printed board,
   every day, for ever. Nothing on any screen said the setting was doing half
   a job.

   ⚠️ THE GROUPS ARE OPTIONAL AND ABSENT IS THE OLD ANSWER, which is what makes
   this safe for every existing caller (rule 1). Asserted below, not promised.

   ⚠️ Generic names on purpose. A test that types this store's stations into a
   shared file is the rule-18 failure the check above already guards. */
{
  const { isTrainingPlacement: itp, mergeCodes: mc, readTraining: rt } =
    await import("./trainingPriorities.js");

  const base = rt({ v: 1, sides: { FOH: ["ALPHA ONE", "BETA"], BOH: [] } });
  const declared = mc(base, "FOH", ["ALPHA ONE", "BETA"]).merges.FOH;

  ok("★★ WITHOUT THE GROUPS, HOLDING ONE STILL READS AS TRAINING ON THE OTHER",
    itp(["ALPHA ONE"], "BETA") === true);
  ok("★★ WITH THE STORE'S GROUP, IT DOES NOT",
    itp(["ALPHA ONE"], "BETA", declared) === false,
    JSON.stringify(declared));
  ok("★ and it reads both ways round",
    itp(["BETA"], "ALPHA ONE", declared) === false);

  ok("★ somebody who holds neither is still learning it",
    itp(["GAMMA"], "BETA", declared) === true);
  ok("★ a row in no group is unaffected by somebody else's group",
    itp(["ALPHA ONE"], "GAMMA", declared) === true);

  /* Rule 1: the two-argument call every existing caller makes is untouched. */
  ok("★★ NO GROUPS IS BYTE-FOR-BYTE THE OLD ANSWER",
    itp(["ALPHA ONE"], "BETA") === itp(["ALPHA ONE"], "BETA", [])
      && itp(["ALPHA ONE"], "BETA", undefined) === true);
  ok("★ the trailing-number rule still works with no groups at all",
    itp(["ALPHA 1"], "ALPHA 2") === false);
  ok("★ nobody rated at all is learning everything", itp([], "BETA", declared) === true);
}

/* ══════════════════════════════════════════════════════════════════════════
   🐛 THE SAME MERGE BUG, ONE FUNCTION DOWN — `trainingGaps`. Aug 18 2026.

   It collapsed the store's LIST through the declared groups and then compared
   what somebody holds against the trailing-number guess. So a store that has
   said "these two rows are one position" still had the tool telling a person
   rated on one of them to go and learn the other — the exact thing declaring
   the merge was supposed to stop.

   ⚠️ THIS BLOCK IS ABOVE THE SUMMARY ON PURPOSE. Three test files in this repo
   have now had assertions appended BELOW their own summary line, where they
   run and cannot fail the build.
   ══════════════════════════════════════════════════════════════════════════ */
{
  group("trainingGaps honours the store's merges");
  const { trainingGaps: tg, nextToTrain: nt, mergeCodes: mc } =
    await import("./trainingPriorities.js");

  const base = { v: 1, mode: "suggest", sides: { FOH: ["ALPHA ONE", "BETA", "GAMMA"], BOH: [] } };
  const declared = mc(base, "FOH", ["ALPHA ONE", "BETA"]);

  ok("★ with no merge declared, holding one leaves the other on the list",
    tg(["ALPHA ONE"], "FOH", base).join("|") === "BETA|GAMMA",
    tg(["ALPHA ONE"], "FOH", base).join("|"));

  /* The merge collapses the LIST to two positions, and holding either member
     must clear that position rather than leaving its twin behind. */
  ok("★★ THE MERGED POSITION IS GONE FROM THE GAPS WHEN EITHER HALF IS HELD",
    tg(["ALPHA ONE"], "FOH", declared).join("|") === "GAMMA",
    tg(["ALPHA ONE"], "FOH", declared).join("|"));
  ok("★★ AND IT READS BOTH WAYS ROUND",
    tg(["BETA"], "FOH", declared).join("|") === "GAMMA",
    tg(["BETA"], "FOH", declared).join("|"));

  ok("★ somebody who holds neither still has the merged position to learn",
    tg(["GAMMA"], "FOH", declared).join("|") === "ALPHA ONE",
    tg(["GAMMA"], "FOH", declared).join("|"));
  ok("★ and the next-one convenience agrees with the list it reads",
    nt(["GAMMA"], "FOH", declared) === "ALPHA ONE"
      && nt(["ALPHA ONE"], "FOH", declared) === "GAMMA");
  ok("★ holding one of each clears the board",
    tg(["BETA", "GAMMA"], "FOH", declared).length === 0);

  /* Rule 1: a record with no merges answers exactly as it did before. */
  ok("★★ A RECORD WITH NO MERGES IS UNCHANGED, BYTE FOR BYTE",
    tg(["ALPHA ONE"], "FOH", base).join("|") === "BETA|GAMMA"
      && tg([], "FOH", base).join("|") === "ALPHA ONE|BETA|GAMMA");
  /* ⚠️ "ALPHA ONE" IS NOT A NUMBERED ROW — the word is not a digit — so the
     trailing-number rule needs a genuinely numbered pair to be graded. Written
     the other way first and it failed correctly: the assertion was wrong, not
     the code. */
  const numbered = { v: 1, mode: "suggest", sides: { FOH: ["DELTA 1", "BETA"], BOH: [] } };
  ok("★ the trailing-number rule still stands on its own, with no merge declared",
    tg(["DELTA 2"], "FOH", numbered).join("|") === "BETA",
    tg(["DELTA 2"], "FOH", numbered).join("|"));
  ok("★ an empty list is still a working state", tg([], "BOH", declared).length === 0);
}

/* ══════════════════════════════════════════════════════════════════════════
   MOVING A PRIORITY — and the one way it could quietly lose somebody's list.

   Matt, Aug 21 2026: "these training priorities regressed. i had them arranged
   yesterday." Nothing had regressed. Read from the store's own record, no save
   had happened since Aug 14 — because there was no way to reorder at all.

   ⛔ THE FAILURE THIS SECTION EXISTS FOR is not a wrong order, it is a SHORTER
   LIST. `sides` is the collapsed view; rebuilding the raw list from it drops
   every folded code, which is the destructive collapse `readTraining` already
   records ("un-merging OT left the list at nine"). So the assertion that
   matters most below is a set comparison, not an order comparison.
   ══════════════════════════════════════════════════════════════════════════ */
group("moveInList");
{
  /* Invented, real-shaped: ten rows with a three-code family in the middle. */
  const base = readTraining({
    v: 1, mode: "suggest",
    rawSides: { FOH: ["ALPHA", "BRAVO", "CHARLIE 1", "CHARLIE 2", "CHARLIE 3", "DELTA", "ECHO"], BOH: [] },
    merges: { FOH: [], BOH: [] },
  });
  const shown = (r) => collapseFamilies(r.rawSides.FOH, r.merges.FOH);
  const bag = (a) => [...a].sort().join("|");

  ok("control: the fixture collapses the numbered family to one row",
    shown(base).length === 5, shown(base).join("|"));
  ok("control: and the raw list still holds all seven",
    base.rawSides.FOH.length === 7);

  const up = moveInList(base, "FOH", "DELTA", "up");
  ok("★★ a row moves up one place", shown(up)[2] === "DELTA", shown(up).join("|"));
  ok("★ and the row it passed moved down", shown(up)[3] === "CHARLIE 1", shown(up).join("|"));
  ok("★★ NO RAW CODE IS LOST — the whole bug this could have",
    bag(up.rawSides.FOH) === bag(base.rawSides.FOH),
    `${up.rawSides.FOH.length} of ${base.rawSides.FOH.length}`);

  const dn = moveInList(base, "FOH", "BRAVO", "down");
  ok("★★ a row moves down one place", shown(dn)[1] === "CHARLIE 1", shown(dn).join("|"));
  ok("★ raw preserved moving down", bag(dn.rawSides.FOH) === bag(base.rawSides.FOH));

  /* ⚠️ THE FAMILY IS A BLOCK. Moving it must not interleave its members with
     the row it passes, which is what a naive index swap on the raw list does. */
  const famUp = moveInList(base, "FOH", "CHARLIE 1", "up");
  const rw = famUp.rawSides.FOH;
  ok("★★ a folded family moves as ONE block",
    rw.indexOf("CHARLIE 3") - rw.indexOf("CHARLIE 1") === 2, rw.join("|"));
  ok("★ and nothing landed between its members",
    rw.slice(rw.indexOf("CHARLIE 1"), rw.indexOf("CHARLIE 3") + 1).join("|") === "CHARLIE 1|CHARLIE 2|CHARLIE 3");
  ok("★ raw preserved moving a family", bag(rw) === bag(base.rawSides.FOH));

  /* ⚠️ A DECLARED MERGE BEHAVES THE SAME AS A NUMBERED ONE. */
  const merged = mergeCodes(base, "FOH", ["ALPHA", "ECHO"]);
  const mUp = moveInList(merged, "FOH", "ECHO", "down");
  ok("★ a member of a declared merge moves its whole family",
    bag(mUp.rawSides.FOH) === bag(merged.rawSides.FOH), mUp.rawSides.FOH.join("|"));

  /* ⚠️ THE ENDS DO NOT WRAP. */
  ok("★★ the top row cannot go up", shown(moveInList(base, "FOH", "ALPHA", "up")).join("|") === shown(base).join("|"));
  ok("★★ the bottom row cannot go down", shown(moveInList(base, "FOH", "ECHO", "down")).join("|") === shown(base).join("|"));

  /* ⚠️ JUNK NEVER THROWS AND NEVER EMPTIES A LIST. */
  for (const [side, code, dir] of [["FOH", "NOPE", "up"], ["NOSUCH", "ALPHA", "up"], ["FOH", "ALPHA", "sideways"], ["FOH", "", "up"]]) {
    const r = moveInList(base, side, code, dir);
    ok(`★ junk is a no-op, not a wipe (${side}/${code}/${dir})`,
      bag(r.rawSides.FOH || []) === bag(base.rawSides.FOH));
  }
  ok("★ a null record does not throw", (() => { try { moveInList(null, "FOH", "ALPHA", "up"); return true; } catch { return false; } })());
}

if (fails.length) {
  console.log(`trainingPriorities: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}

console.log(`trainingPriorities: ${pass} passed`);
