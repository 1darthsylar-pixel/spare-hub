/* ============================================================================
   attendance.test.mjs — who turned up, and the line this file must not cross.

       node attendance.test.mjs

   Matt, Aug 14 2026, on what the three big scheduling platforms have that the
   Hub does not: punches came first, because without them nothing can say
   whether the week that was built is the week that happened.

   ═══ WHAT IS BEING PROTECTED ════════════════════════════════════════════════
   Two things, and the second is more important than the first.

   1. The counting is right.
   2. ⚠️⚠️ THIS NEVER BECOMES A TIME CLOCK OR A DISCIPLINE SYSTEM. HR Console
      already holds this store's whole attendance ladder with Hannah's own point
      values. A mark here is a leader tapping a row during a rush. Section 5 is
      the boundary, and it is the section to read first if this file ever grows.
   ============================================================================ */
import {
  attendanceKey, STATUSES, STATUS_LABEL, CONCERNS, shiftKey, keyOfShift,
  readAttendance, markShift, statusOf, markOf, eachShift, countsFor,
  concernsIn, coverage, pruneToWeek, hrIdFor, HR_FOR_STATUS,
} from "./attendance.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const sh = (id, name, start, end) => ({ id, name, start, end });
const WEEK = {
  v: 1, monday: "2026-08-17",
  days: {
    Mon: { iso: "2026-08-17", sides: {
      FOH: { shifts: [sh("12", "Ashley R", 360, 840), sh("83", "Katia", 360, 780)] },
      BOH: { shifts: [sh("18", "Brandon", 300, 780)] },
    } },
    Tue: { iso: "2026-08-18", sides: {
      FOH: { shifts: [sh("12", "Ashley R", 660, 1020)] },
    } },
  },
};
const K = (day, side, id, start) => shiftKey(day, side, id, start);

group("0. controls");
{
  ok("the key is one row per week", attendanceKey("2026-08-17") === "gcfcr-attendance-v1-2026-08-17");
  ok("four shifts in the fixture", (() => { let n = 0; eachShift(WEEK, () => n++); return n; })() === 4);
  ok("every status has a label", STATUSES.every((s) => !!STATUS_LABEL[s]));
  ok("★ 'here' is not a concern", !CONCERNS.includes("here"));
  ok("the other four are", CONCERNS.length === 4);
}

group("1. ★★ A SHIFT IS NAMED BY WHERE IT SITS, because it has no id of its own");
{
  ok("★ day, side, person and start", K("Mon", "FOH", "12", 360) === "Mon|FOH|12|360");
  ok("the side is upper cased so foh and FOH are one shift", K("Mon", "foh", "12", 360) === K("Mon", "FOH", "12", 360));
  ok("a number id and a string id are the same shift", K("Mon", "FOH", 12, 360) === K("Mon", "FOH", "12", 360));
  ok("★ midnight is a real start time, not a missing one", K("Mon", "FOH", "12", 0) === "Mon|FOH|12|0");
  ok("★ a shift missing any part has NO key, so it can never be marked",
    K("", "FOH", "12", 360) === "" && K("Mon", "", "12", 360) === ""
    && K("Mon", "FOH", "", 360) === "" && K("Mon", "FOH", "12", null) === "");
  ok("keyOfShift agrees with shiftKey",
    keyOfShift({ day: "Mon", side: "FOH", id: "12", start: 360 }) === K("Mon", "FOH", "12", 360));
  ok("★ two people on one day and side are different shifts",
    K("Mon", "FOH", "12", 360) !== K("Mon", "FOH", "83", 360));
}

group("2. ★ MARKING, AND TAKING IT BACK");
{
  let rec = markShift(null, K("Mon", "FOH", "12", 360), "late", "Daisy");
  ok("★ the mark is there", statusOf(rec, K("Mon", "FOH", "12", 360)) === "late");
  ok("★ who said it is stored — the difference between a record and a rumour",
    markOf(rec, K("Mon", "FOH", "12", 360)).by === "Daisy");
  ok("and when", !!markOf(rec, K("Mon", "FOH", "12", 360)).at);
  ok("nobody else was touched", statusOf(rec, K("Mon", "FOH", "83", 360)) === "");

  rec = markShift(rec, K("Mon", "FOH", "12", 360), "here", "Daisy");
  ok("★ a second mark replaces the first", statusOf(rec, K("Mon", "FOH", "12", 360)) === "here");

  rec = markShift(rec, K("Mon", "FOH", "12", 360), "", "Daisy");
  ok("★★ AN EMPTY STATUS CLEARS IT — a leader who taps the wrong row can take it back",
    statusOf(rec, K("Mon", "FOH", "12", 360)) === "");
  ok("and it is gone, not stored blank", markOf(rec, K("Mon", "FOH", "12", 360)) === null);

  ok("★ an unknown status changes nothing",
    statusOf(markShift(rec, K("Mon", "FOH", "12", 360), "fired", "Daisy"), K("Mon", "FOH", "12", 360)) === "");
  ok("a shift with no key cannot be marked",
    Object.keys(markShift(rec, "", "noshow", "Daisy").marks).length === 0);
  ok("★ the record handed in is not mutated", (() => {
    const before = markShift(null, K("Mon", "FOH", "12", 360), "late", "D");
    const snapshot = JSON.stringify(before);
    markShift(before, K("Tue", "FOH", "12", 660), "noshow", "D");
    return JSON.stringify(before) === snapshot;
  })());
}

group("3. ⚠️⚠️ AN UNMARKED SHIFT IS NOT AN ABSENCE");
{
  /* Most shifts in most weeks will never be marked. Counting those as anything
     is how a busy Saturday becomes six accusations. */
  const empty = readAttendance(null);
  const c = countsFor(empty, WEEK, "12");
  ok("★★ two shifts, both UNMARKED, and zero of everything else",
    c.shifts === 2 && c.unmarked === 2 && c.noshow === 0 && c.here === 0, c);

  let rec = markShift(null, K("Mon", "FOH", "12", 360), "noshow", "Daisy");
  const c2 = countsFor(rec, WEEK, "12");
  ok("★ one marked, one still unmarked", c2.noshow === 1 && c2.unmarked === 1, c2);
  ok("★★ COVERAGE IS REPORTED, because three no-shows out of three marked and three out of twenty-two are different facts",
    coverage(rec, WEEK).marked === 1 && coverage(rec, WEEK).unmarked === 3, coverage(rec, WEEK));
  ok("and as a percent a leader can read", coverage(rec, WEEK).pct === 25, coverage(rec, WEEK).pct);
  ok("an empty week is 0%, not a divide by zero", coverage(rec, { days: {} }).pct === 0);

  ok("somebody with no shifts counts nothing", countsFor(rec, WEEK, "999").shifts === 0);
  ok("★ no person id counts nothing rather than everybody", countsFor(rec, WEEK, "").shifts === 0);
}

group("4. ★ WHAT A LEADER LOOKS AT AFTERWARDS");
{
  let rec = markShift(null, K("Mon", "FOH", "12", 360), "here", "Daisy");
  rec = markShift(rec, K("Mon", "FOH", "83", 360), "noshow", "Daisy");
  rec = markShift(rec, K("Mon", "BOH", "18", 300), "late", "Benjamin");
  rec = markShift(rec, K("Tue", "FOH", "12", 660), "calledout", "Daisy");

  const list = concernsIn(rec, WEEK);
  ok("★ three concerns, not four", list.length === 3, list.map((r) => `${r.name}:${r.status}`));
  ok("★★ 'here' IS NOT IN THE LIST — a list of everything that happened is a list nobody reads",
    !list.some((r) => r.status === "here"));
  ok("the person and the day come with it", list[0].name === "Katia" && list[0].day === "Mon");
  ok("★ and who marked it", list.find((r) => r.status === "late").by === "Benjamin");
  ok("both sides are walked", list.some((r) => r.side === "BOH"));
  ok("an unmarked week has no concerns", concernsIn(null, WEEK).length === 0);
}

group("5. ⚠️⚠️ THE BOUNDARY. READ THIS SECTION FIRST IF THIS FILE EVER GROWS.");
{
  /* HR Console already holds the ladder, with Hannah's point values, effective
     1 Jul 2026. This file suggests which line a mark corresponds to. It does
     not file it, it does not score it, and it does not know a minute worked. */
  const api = Object.keys(await import("./attendance.js"));
  ok("★★ NOTHING HERE CARRIES A POINT VALUE",
    !api.some((k) => /point|score|penalt|discipl/i.test(k)), api.filter((k) => /point|score/i.test(k)));
  ok("★★ NOTHING HERE COUNTS MINUTES WORKED — this is not a time clock",
    !api.some((k) => /minutes|worked|payroll|wage|clockIn|punch/i.test(k)), api);
  ok("★ a mark stores no clock time of its own",
    Object.keys(markOf(markShift(null, K("Mon", "FOH", "12", 360), "late", "D"), K("Mon", "FOH", "12", 360)))
      .every((k) => ["status", "at", "by", "note"].includes(k)));

  ok("★ a no show points at HR's own line", hrIdFor("noshow") === "ncns");
  ok("★★ AND 'late' RETURNS THE LIGHTER LINE, never the heavier one — the split is at thirty minutes and this file has no clock",
    hrIdFor("late") === "late5");
  ok("a call out points at the notice line", hrIdFor("calledout") === "callout-notice");
  ok("★ being here is not an infraction", hrIdFor("here") === "");
  ok("★ leaving early has no HR line, and is not given one", hrIdFor("left") === "");
  ok("an unknown status suggests nothing", hrIdFor("banana") === "" && hrIdFor("") === "");
  ok("★ every suggestion is an id, never a body of text or a number",
    Object.values(HR_FOR_STATUS).every((v) => typeof v === "string"));
}

group("6. ⚠️ A REBUILD MOVES SHIFTS, AND STALE MARKS ARE DROPPED ON PURPOSE");
{
  let rec = markShift(null, K("Mon", "FOH", "12", 360), "here", "D");
  rec = markShift(rec, K("Mon", "FOH", "12", 999), "noshow", "D");   /* a shift that no longer exists */
  const { record, dropped } = pruneToWeek(rec, WEEK);
  ok("★ the stale mark is dropped", dropped === 1, dropped);
  ok("★ the live one is kept", statusOf(record, K("Mon", "FOH", "12", 360)) === "here");
  ok("★★ PRUNING IS NOT PART OF READING — a read that quietly deleted data would be the worst kind of tidy",
    Object.keys(readAttendance(rec).marks).length === 2);
}

group("7. ⚠️ RULE 1 — every earlier shape still opens");
{
  const junk = [null, undefined, "text", 42, [], { marks: null }, { marks: "no" },
    { marks: { "a|b|c|1": null } }, { marks: { "a|b|c|1": { status: "invented" } } },
    { marks: { "a|b|c|1": { status: "here", by: 7, at: {} } } }];
  let threw = "";
  junk.forEach((r, i) => { try { readAttendance(r); } catch { threw += `${i} `; } });
  ok("★ not one shape throws", threw === "", threw);
  ok("★ an unknown status is not kept as a mark",
    Object.keys(readAttendance({ marks: { "a|b|c|1": { status: "invented" } } }).marks).length === 0);
  ok("★ a bad `by` becomes a string, never a number in a record",
    readAttendance({ marks: { "a|b|c|1": { status: "here", by: 7 } } }).marks["a|b|c|1"].by === "");
  ok("a junk week is not a crash",
    countsFor(null, null, "12").shifts === 0 && concernsIn(null, "nope").length === 0);
  ok("★ a week with half-written days is read, not thrown on", (() => {
    let n = 0;
    eachShift({ days: { Mon: null, Tue: { sides: { FOH: { shifts: [null, { id: "1", start: 0 }] } } } } }, () => n++);
    return n === 1;
  })());
}

if (fails.length) {
  console.log(`\nattendance: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nattendance: ${pass} passed`);
