/* Team member preferences — the six numbers off the HotSchedules Schedule
   Threshold block, and whether a built week honoured them.

   Matt, Aug 13 2026: "I forgot we need OT alerts and team member preferences."

   ⚠️ THE ASSERTIONS THAT MATTER MOST ARE THE `min` ONES. An engine written to
   cap hours ignores the promise half in silence, and somebody who asked for
   twenty hours and got eight has been let down just as much as somebody handed
   fifty. Half of what is below exists to prove that half is not silent. */
import {
  PREF_FIELDS, readPrefs, hasPrefs, prefProblems, setPrefs, prefWarnings, readStore,
} from "./availability.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayIndex = (d) => DAYS.indexOf(d);
const H = (n) => n * 60;

/* ── the shape ──────────────────────────────────────────────────────────── */
ok("six fields, the six on his screen", PREF_FIELDS.length === 6, String(PREF_FIELDS.length));
ok("every field says which kind of box to draw",
  PREF_FIELDS.every((f) => f.key && f.label && (f.kind === "days" || f.kind === "dur")));

/* ── the read guards ────────────────────────────────────────────────────── */
{
  const empty = readPrefs(null);
  ok("nothing asked for reads as six nulls",
    Object.values(empty).length === 6 && Object.values(empty).every((v) => v === null),
    JSON.stringify(empty));
  ok("a record written before any of this existed still reads",
    Object.values(readPrefs({ days: { Mon: [] } })).every((v) => v === null));
  ok("hasPrefs is false when nothing is typed", hasPrefs({ days: {} }) === false);
  ok("hasPrefs is true when one number is", hasPrefs({ prefs: { maxHoursWeek: H(25) } }) === true);
  /* ⚠️ ZERO IS A REAL ANSWER AND MUST SURVIVE. "no minimum" and "a minimum of
     nothing" are different, and payRates.js carries the scar of the opposite. */
  ok("a typed zero is kept, not read as blank", readPrefs({ prefs: { minHoursWeek: 0 } }).minHoursWeek === 0);
  ok("an empty string is blank, not zero", readPrefs({ prefs: { minHoursWeek: "" } }).minHoursWeek === null);
  ok("junk is blank", readPrefs({ prefs: { maxDaysWeek: "lots" } }).maxDaysWeek === null);
  ok("a negative is refused", readPrefs({ prefs: { maxDaysWeek: -2 } }).maxDaysWeek === null);
}

/* ── what will not be stored ────────────────────────────────────────────── */
ok("nothing wrong with nothing", prefProblems({}).length === 0);
ok("★ a minimum above its maximum is refused, or every week warns for ever",
  prefProblems({ minDaysWeek: 5, maxDaysWeek: 3 }).length === 1,
  JSON.stringify(prefProblems({ minDaysWeek: 5, maxDaysWeek: 3 })));
ok("the same for hours", prefProblems({ minHoursWeek: H(30), maxHoursWeek: H(20) }).length === 1);
ok("equal is fine", prefProblems({ minDaysWeek: 3, maxDaysWeek: 3 }).length === 0);
ok("a week has seven days", prefProblems({ maxDaysWeek: 9 }).length === 1);
ok("a day has twenty four hours", prefProblems({ maxHoursDay: H(30) }).length === 1);
ok("a max on its own is fine", prefProblems({ maxHoursWeek: H(25) }).length === 0);

/* ── writing ────────────────────────────────────────────────────────────── */
{
  const before = { v: 1, people: { 6: { days: { Mon: [{ start: 300, end: 780 }] } }, 17: { days: {} } } };
  const next = setPrefs(before, "6", { maxHoursWeek: H(25), minDaysWeek: 2 }, { at: "T", by: "Matt Jackson" });
  ok("it stores", readPrefs(next.people["6"]).maxHoursWeek === H(25) && readPrefs(next.people["6"]).minDaysWeek === 2);
  ok("★ their availability is untouched",
    JSON.stringify(next.people["6"].days) === JSON.stringify(before.people["6"].days),
    JSON.stringify(next.people["6"].days));
  ok("★ nobody else is touched",
    JSON.stringify(next.people["17"]) === JSON.stringify(before.people["17"]));
  ok("it stamps", next.people["6"].updatedBy === "Matt Jackson");
  const more = setPrefs(next, "6", { minHoursWeek: H(10) }, { at: "T2", by: "x" });
  ok("a second write merges rather than replaces",
    readPrefs(more.people["6"]).maxHoursWeek === H(25) && readPrefs(more.people["6"]).minHoursWeek === H(10));
  ok("★ an unsatisfiable pair is refused, not stored",
    setPrefs(next, "6", { minHoursWeek: H(40) }) === null);
  ok("clearing one back to blank works",
    readPrefs(setPrefs(more, "6", { minHoursWeek: "" }).people["6"]).minHoursWeek === null);
  ok("a blank id is refused", setPrefs(before, "", { maxDaysWeek: 3 }) === null);
  ok("somebody with no record yet gets one",
    readPrefs(setPrefs(before, "99", { maxDaysWeek: 3 }).people["99"]).maxDaysWeek === 3);
  ok("the store still reads through readStore afterwards",
    Object.keys(readStore(next).people).length === 2);
}

/* ── did the week honour it ─────────────────────────────────────────────── */
const shift = (day, start, end) => ({ day, start, end });

ok("nothing asked for says nothing", prefWarnings({}, [shift("Mon", 300, 1200)], dayIndex).length === 0);
ok("no shifts says nothing", prefWarnings({ prefs: { maxHoursWeek: 60 } }, [], dayIndex).length === 0);

{
  const rec = { prefs: { maxDaysWeek: 3 } };
  const four = ["Mon", "Tue", "Wed", "Thu"].map((d) => shift(d, 600, 900));
  ok("over their day count is named", prefWarnings(rec, four, dayIndex).length === 1,
    JSON.stringify(prefWarnings(rec, four, dayIndex)));
  ok("on their day count is silent", prefWarnings(rec, four.slice(0, 3), dayIndex).length === 0);
  ok("two shifts on one day is still one day",
    prefWarnings(rec, [...four.slice(0, 3), shift("Mon", 1000, 1200)], dayIndex).length === 0);
}
{
  /* ★★ THE PROMISE HALF. */
  const rec = { prefs: { minHoursWeek: H(20), minDaysWeek: 4 } };
  const thin = [shift("Mon", 600, 1080)];                       // one day, 8 hours
  const w = prefWarnings(rec, thin, dayIndex);
  ok("★ too FEW hours is a warning, not a silence",
    w.some((x) => /only 8\.0 hours this week/.test(x)), JSON.stringify(w));
  ok("★ too FEW days is a warning too",
    w.some((x) => /only 1 days this week/.test(x)), JSON.stringify(w));
  ok("and both are reported, not just the first", w.length === 2, JSON.stringify(w));
}
{
  const rec = { prefs: { maxHoursDay: H(6) } };
  const long = [shift("Fri", 600, 1140)];                        // 9 hours
  ok("a long day is named with the day",
    prefWarnings(rec, long, dayIndex).some((x) => x.includes("on Fri")),
    JSON.stringify(prefWarnings(rec, long, dayIndex)));
  ok("★ two short shifts on one day ADD UP against a daily max",
    prefWarnings(rec, [shift("Fri", 600, 840), shift("Fri", 900, 1140)], dayIndex).length === 1,
    JSON.stringify(prefWarnings(rec, [shift("Fri", 600, 840), shift("Fri", 900, 1140)], dayIndex)));
}

/* ── the one that crosses midnight ──────────────────────────────────────── */
{
  const rec = { prefs: { minHoursBetween: H(10) } };
  /* Close at 11pm Monday, open at 5am Tuesday. Six hours off. Written naively
     against a start-time comparison this is NEGATIVE eighteen hours and passes. */
  const closeOpen = [shift("Mon", 900, 1380), shift("Tue", 300, 780)];
  const w = prefWarnings(rec, closeOpen, dayIndex);
  ok("★ a close then an open is measured ACROSS the night", w.length === 1, JSON.stringify(w));
  ok("and the gap is right", w[0].includes("6.0 hours off"), w[0]);
  ok("a proper rest is silent",
    prefWarnings(rec, [shift("Mon", 300, 780), shift("Tue", 600, 1080)], dayIndex).length === 0);
  ok("★ with no day index it does not guess, it stays quiet",
    prefWarnings(rec, closeOpen).length === 0, JSON.stringify(prefWarnings(rec, closeOpen)));
  ok("a day the index does not know is skipped, not counted as day zero",
    prefWarnings(rec, [shift("Mon", 900, 1380), shift("Notaday", 300, 780)], dayIndex).length === 0);
}

/* ── nothing here is ever a block ───────────────────────────────────────── */
{
  const rec = { prefs: { maxHoursWeek: H(10) } };
  const w = prefWarnings(rec, [shift("Mon", 300, 1380), shift("Tue", 300, 1380)], dayIndex);
  ok("a badly overshot preference still only produces sentences", Array.isArray(w) && w.length >= 1);
  ok("★ and every one says it is THEIR ask, never a rule",
    w.every((x) => x.includes("they asked for")), JSON.stringify(w));
}

if (fails.length) {
  console.log(`prefs: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`prefs: ${pass} passed`);
