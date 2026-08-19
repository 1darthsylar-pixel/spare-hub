/* ============================================================================
   setupRows.test.mjs — the Hub schedule reaches the setup board.

       node setupRows.test.mjs

   ═══ WHY THIS FILE EXISTS ═══════════════════════════════════════════════════
   After the HotSchedules cutover there are no lines left to paste. On go-live
   the ONLY way a built week reaches the Daily Setup board is `scheduleRowsFor`,
   and until Aug 19 2026 it lived in DailySetup.jsx — a `.jsx`, which no Node
   test can import and nothing in checks/ can execute. So the one path go-live
   depends on had never run against a real saved week.

   It did not work. Section 1 is that bug. Everything else is the ways this
   function could quietly stop being true.

   ⚠️ THE FIXTURES ARE SHAPED EXACTLY AS `buildWeek` WRITES A WEEK and `kvSet`
   stores it: days keyed "Mon"…"Sat" (`out[d.day] = { iso, sides }`), sides
   FOH/BOH, and `start`/`end` in MINUTES from midnight. If this file and the
   engine ever disagree about that shape, this file is the one that is wrong.
   ============================================================================ */
import { scheduleRowsFor, dayKeyIn, mapJobToSection, BOH_JOB_MAP } from "./setupRows.js";
import { buildWeek, scheduleKey } from "./scheduleEngine.js";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const sh = (id, name, start, end, over) => ({ id, name, start, end, job: "DRIVE THRU", skillWord: "", ...over });

/* A week shaped exactly as buildWeek writes it. Minutes from midnight. */
const WEEK = {
  v: 1, monday: "2026-08-31",
  days: {
    Mon: { iso: "2026-08-31", sides: {
      FOH: { shifts: [
        sh("12", "Ashley Rangel-avila", 360, 840, { job: "DRIVE THRU", skillWord: "advanced" }),
        sh("83", "Katia Bostic", 660, 1020, { job: "FRONT COUNTER" }),
      ] },
      BOH: { shifts: [
        sh("18", "Brandon Watlington", 300, 780, { job: "Breading", skillWord: "advanced" }),
        sh("41", "Hernan Cruz", 330, 690, { job: "Primary Point" }),
      ] },
    } },
    Sat: { iso: "2026-09-05", sides: {
      FOH: { shifts: [sh("12", "Ashley Rangel-avila", 300, 660)] },
      BOH: { shifts: [] },
    } },
    Thu: { iso: "2026-09-03", sides: { FOH: { shifts: [] }, BOH: { shifts: [] } } },
  },
};

group("0. controls — the fixture is a real week, not an empty one");
{
  const everyone = Object.values(WEEK.days)
    .flatMap((d) => Object.values(d.sides).flatMap((s) => s.shifts));
  ok("five shifts across the fixture", everyone.length === 5, everyone.length);
  ok("the week is keyed by SHORT day names", Object.keys(WEEK.days).join(",") === "Mon,Sat,Thu");
  ok("no day in the fixture is spelled in full",
    !Object.keys(WEEK.days).some((k) => k.length > 3));
  /* ⚠️ CONTROL THAT MUST BE FOUND. If the engine ever starts writing full day
     names this assertion goes red and the fixture above is what to fix. */
  const src = readFileSync(new URL("./scheduleEngine.js", import.meta.url), "utf8");
  ok("the engine still writes out[d.day]", src.includes("out[d.day] = { iso: d.iso, sides }"));
  /* ⚠️ SHAPE, NOT PREFIX. Every store keys its own week, and pinning one
     store's prefix here makes this seed file fail the moment a clone renames
     it. What must stay true is that the date is the key. */
  ok("scheduleKey is one key per week", scheduleKey("2026-08-31").endsWith("2026-08-31")
    && scheduleKey("2026-08-31") !== scheduleKey("2026-09-07"));
  ok("buildWeek is importable from here", typeof buildWeek === "function");
}

/* ══════════════════════════════════════════════════════════════════════════
   1. THE BUG. Daily Setup names its days IN FULL — DAYS = ['Monday', …] — and
   handed that straight to a week keyed "Mon". Every lookup missed, so a fully
   built week reported "nobody on Monday" and a leader went back to pasting
   lines that no longer exist.
   ══════════════════════════════════════════════════════════════════════════ */
group("1. a full day name finds the day (the go-live bug)");
{
  ok("'Monday' finds four people", scheduleRowsFor(WEEK, "Monday").length === 4,
    scheduleRowsFor(WEEK, "Monday").length);
  ok("'Saturday' finds one", scheduleRowsFor(WEEK, "Saturday").length === 1);
  ok("'Mon' still works — the short name was never broken",
    scheduleRowsFor(WEEK, "Mon").length === 4);
  ok("both spellings give the same people",
    JSON.stringify(scheduleRowsFor(WEEK, "Monday")) === JSON.stringify(scheduleRowsFor(WEEK, "Mon")));

  /* ⚠️ SAT AND SUN SHARE A FIRST LETTER, AND THAT IS THE ONE PAIR A SLOPPY
     PREFIX MATCH GETS WRONG. Three letters is the shortest that separates
     every English day, which is why the fix uses three and refuses fewer. */
  ok("'Sunday' does NOT match Saturday", scheduleRowsFor(WEEK, "Sunday").length === 0);
  ok("'S' matches nothing", dayKeyIn(WEEK, "S") === null);
  ok("'Sa' matches nothing", dayKeyIn(WEEK, "Sa") === null);
  ok("'Sat' matches Sat", dayKeyIn(WEEK, "Sat") === "Sat");
  ok("'Saturday' matches Sat", dayKeyIn(WEEK, "Saturday") === "Sat");
  ok("'Thursday' matches Thu, not Tue", dayKeyIn(WEEK, "Thursday") === "Thu");
  ok("'Tuesday' is not in this week at all", dayKeyIn(WEEK, "Tuesday") === null);
}

group("2. dayKeyIn answers the week, not a guess");
{
  /* ★ A STORE CAN RENAME ITS DAY KEYS (rule 18) — boardDays reads them from
     stations.FOH. So the exact key must win before any three-letter compare. */
  const longWeek = { days: { Monday: { iso: "2026-08-31", sides: { FOH: { shifts: [sh("1", "A", 360, 720)] } } } } };
  ok("a week keyed 'Monday' answers 'Monday'", dayKeyIn(longWeek, "Monday") === "Monday");
  ok("a week keyed 'Monday' also answers 'Mon'", dayKeyIn(longWeek, "Mon") === "Monday");
  ok("and it actually returns the row", scheduleRowsFor(longWeek, "Monday").length === 1);

  ok("no week is null", dayKeyIn(null, "Monday") === null);
  ok("no days is null", dayKeyIn({}, "Monday") === null);
  ok("days not an object is null", dayKeyIn({ days: "Mon" }, "Monday") === null);
  ok("empty day name is null", dayKeyIn(WEEK, "") === null);
  ok("null day name is null", dayKeyIn(WEEK, null) === null);
  ok("undefined day name is null", dayKeyIn(WEEK, undefined) === null);
  ok("whitespace is trimmed", dayKeyIn(WEEK, "  Monday  ") === "Mon");
  ok("case does not matter on the fallback", dayKeyIn(WEEK, "monday") === "Mon");
  /* ⚠️ INHERITED KEYS ARE NOT DAYS. hasOwnProperty, not `in`. */
  ok("'constructor' is not a day", dayKeyIn(WEEK, "constructor") === null);
  ok("'toString' is not a day", dayKeyIn(WEEK, "toString") === null);
}

group("3. minutes become decimal hours, exactly once");
{
  const rows = scheduleRowsFor(WEEK, "Monday");
  /* ⚠️ GUARD, NOT AN ASSUMPTION. When section 1 is red these rows are empty,
     and an unguarded .ranges throws instead of reporting — which loses every
     assertion below it and reads as a broken test rather than a caught bug. */
  const EMPTY = { ranges: [{ start: null, end: null }], hours: null };
  const at = (id) => rows.find((r) => r.id === id) || EMPTY;
  const ash = at("12");
  ok("360 minutes reads as 6.0", ash.ranges[0].start === 6, ash.ranges[0].start);
  ok("840 minutes reads as 14.0", ash.ranges[0].end === 14, ash.ranges[0].end);
  ok("hours are the span", ash.hours === 8, ash.hours);
  const bran = at("18");
  ok("300 minutes reads as 5.0 — not 5pm", bran.ranges[0].start === 5, bran.ranges[0].start);
  ok("a half hour survives", (scheduleRowsFor(WEEK, "Sat")[0] || {}).hours === 6);
  const hern = at("41");
  ok("330 minutes reads as 5.5", hern.ranges[0].start === 5.5, hern.ranges[0].start);
  ok("690 minutes reads as 11.5", hern.ranges[0].end === 11.5, hern.ranges[0].end);
}

group("4. one row per person, blocks merged and time-ordered");
{
  const split = { days: { Mon: { iso: "2026-08-31", sides: {
    /* Written in FILL order, not clock order, and the closing block first —
       which is exactly how a real day comes back from the engine. */
    FOH: { shifts: [
      sh("7", "Denise Cole", 840, 1080, { job: "Machines" }),
      sh("7", "Denise Cole", 360, 720, { job: "Fries" }),
    ] },
    BOH: { shifts: [] },
  } } } };
  const rows = scheduleRowsFor(split, "Monday");
  ok("two shifts, one row", rows.length === 1, rows.length);
  ok("both blocks kept", rows.length === 1 && rows[0].blocks.length === 2);
  ok("blocks are in clock order", rows.length === 1 && rows[0].blocks[0].start === 6 && rows[0].blocks[1].start === 14);
  ok("ranges are in clock order", rows.length === 1 && rows[0].ranges[0].start === 6);
  ok("hours add up across both", rows.length === 1 && rows[0].hours === 10);
  /* 🐛 THE PRIMARY JOB IS THE EARLIEST, NOT THE FIRST IN THE ARRAY. `section`
     decides which BOH board somebody lands on, so getting this from the
     afternoon block puts an opener on the wrong board. */
  ok("primary job is the morning one", rows.length === 1 && rows[0].job === "Fries");
  ok("primary section follows it", rows.length === 1 && rows[0].section === "FRY STATION");

  /* Same person on both sides of one day — the engine forbids it, this merges
     anyway rather than trusting it, because two rows would place them twice. */
  const bothSides = { days: { Mon: { sides: {
    FOH: { shifts: [sh("9", "Kim Lee", 360, 720, { job: "Front Counter" })] },
    BOH: { shifts: [sh("9", "Kim Lee", 720, 900, { job: "Prep" })] },
  } } } };
  const merged = scheduleRowsFor(bothSides, "Monday");
  ok("one row across both sides", merged.length === 1, merged.length);
  ok("and it holds both blocks", merged.length === 1 && merged[0].blocks.length === 2);
}

group("5. what must never reach the board");
{
  const junk = { days: { Mon: { sides: {
    FOH: { shifts: [
      sh("1", "", 360, 720),                      // no name
      null,                                        // no shift
      sh("2", "Zero Span", 600, 600),              // zero length
      sh("3", "Backwards", 900, 600),              // end before start
      sh("4", "Real Person", 360, 720),
    ] },
    BOH: { shifts: [] },
  } } } };
  const rows = scheduleRowsFor(junk, "Monday");
  ok("only the real person survives", rows.length === 1, rows.map((r) => r.name));
  ok("and it is the right one", rows.length === 1 && rows[0].name === "Real Person");

  ok("a day with nobody on it is an empty list", scheduleRowsFor(WEEK, "Thursday").length === 0);
  ok("a day the week does not have is an empty list", scheduleRowsFor(WEEK, "Tuesday").length === 0);
  ok("no sides is an empty list", scheduleRowsFor({ days: { Mon: {} } }, "Monday").length === 0);
  ok("no shifts key is an empty list", scheduleRowsFor({ days: { Mon: { sides: { FOH: {} } } } }, "Monday").length === 0);
  ok("no week at all is an empty list", scheduleRowsFor(null, "Monday").length === 0);
  ok("no days is an empty list", scheduleRowsFor({}, "Monday").length === 0);
}

group("6. a person with no id still merges, by name");
{
  const noIds = { days: { Mon: { sides: {
    FOH: { shifts: [
      { name: "Pat Nolan", start: 360, end: 720, job: "Fries" },
      { name: "pat nolan", start: 780, end: 900, job: "Machines" },
      { name: "Other Person", start: 360, end: 720, job: "Fries" },
    ] },
    BOH: { shifts: [] },
  } } } };
  const rows = scheduleRowsFor(noIds, "Monday");
  ok("case-different spellings of one name merge", rows.length === 2, rows.length);
  const pat = rows.find((r) => /pat/i.test(r.name)) || { blocks: [], id: "-", name: "-" };
  ok("both of their blocks are kept", pat.blocks.length === 2);
  ok("id is null, not the string 'undefined'", pat.id === null, pat.id);
  ok("the displayed name is the first spelling seen", pat.name === "Pat Nolan");
}

group("7. job codes map to BOH sections, unmatched stays roster-only");
{
  ok("Breading", mapJobToSection("Breading") === "BREADING");
  ok("Load/Filter is breading too", mapJobToSection("Load Filter") === "BREADING");
  ok("Fries", mapJobToSection("Fries") === "FRY STATION");
  ok("Machines", mapJobToSection("Machines") === "MACHINES");
  ok("Prep", mapJobToSection("Bulk Prep") === "PREP");
  ok("Truck", mapJobToSection("Truck") === "TRUCK / RECEIVING");
  ok("Dish", mapJobToSection("Dish") === "DISH / SANITATION");
  ok("Nuggets are secondary", mapJobToSection("Nuggets") === "SECONDARY");
  ok("Primary Point", mapJobToSection("Primary Point") === "PRIMARY");
  ok("Kitchen Leader is leadership", mapJobToSection("Kitchen Leader") === "LEADERSHIP");
  /* ⚠️ ORDER MATTERS: specific before general. "Kitchen Leader" must not fall
     through to the /kitchen/ rule and land on SECONDARY. */
  ok("and does NOT fall through to the kitchen rule", mapJobToSection("Kitchen Leader") !== "SECONDARY");
  ok("Drive Thru is not a BOH section", mapJobToSection("DRIVE THRU") === null);
  ok("no job is no section", mapJobToSection("") === null);
  ok("the map is a real list", Array.isArray(BOH_JOB_MAP) && BOH_JOB_MAP.length === 12, BOH_JOB_MAP.length);
  const fromWeek = scheduleRowsFor(WEEK, "Monday");
  ok("a BOH shift carries its section through", (fromWeek.find((r) => r.id === "18") || {}).section === "BREADING");
  const foh12 = fromWeek.find((r) => r.id === "12");
  ok("an FOH shift carries none", !!foh12 && foh12.section === null);
  ok("skillWord becomes skill", !!foh12 && foh12.skill === "advanced");
}

group("8. the rows are shaped like a paste — the promise of the function");
{
  const r = scheduleRowsFor(WEEK, "Monday")[0] || { blocks: [{}] };
  ["name", "ranges", "blocks", "job", "skill", "section", "hours"].forEach((k) => {
    ok(`row has ${k}`, Object.prototype.hasOwnProperty.call(r, k));
  });
  ok("a block has start/end/job/skill/section",
    ["start", "end", "job", "skill", "section"].every((k) => Object.prototype.hasOwnProperty.call(r.blocks[0], k)));
  /* ⚠️ DailySetup.jsx must actually be using this module, or every assertion
     above tests a file nothing imports. Control string that MUST be found. */
  const setup = readFileSync(new URL("./DailySetup.jsx", import.meta.url), "utf8");
  ok("DailySetup imports scheduleRowsFor from here",
    /import \{[^}]*scheduleRowsFor[^}]*\} from "\.\/setupRows\.js"/.test(setup));
  ok("DailySetup no longer defines its own", !/function scheduleRowsFor/.test(setup));
  ok("DailySetup no longer defines its own BOH_JOB_MAP", !/const BOH_JOB_MAP/.test(setup));
  ok("and it still calls it with the day from DAYS",
    /scheduleRowsFor\(sched, day\)/.test(setup));
  ok("DAYS is still the full-name list this bug came from",
    /const DAYS = \['Monday'/.test(setup));
}

console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  · " + f)); process.exit(1); }
