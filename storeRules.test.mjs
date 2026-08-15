/* The two store rules the engine cannot break and a hand edit can.

   Matt, Aug 14 2026: **"no more than 12 hrs"** and **"and no cloepening"**.
   The first answers the open question that had sat in CLAUDE.md since Aug 13 —
   a hand-typed ten hour day raised nothing while a 48 hour week did.

   ⚠️ `maxShift` caps what the ENGINE builds at 8 hours, so neither of these can
   fire on a generated week. Every case below is a hand-typed shift, because
   that is the only way they happen. */
import { warningsForWeek, LEVEL } from "./scheduleWarnings.js";
import { DEFAULT_RULES } from "./scheduleEngine.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };

const H = (h) => Math.round(h * 60);
/* ⚠️ `job` IS SET ON EVERY FIXTURE. Leaving it off makes the certification
   warning fire on every case and look like a bug — the trap CLAUDE.md records
   costing a red run. */
const sh = (id, start, end, extra) => ({ id, name: `P${id}`, start, end, job: "DRIVE THRU", skill: 3, side: "FOH", ...extra });
const week = (days) => ({ v: 1, days });
const day = (iso, shifts) => ({ iso, sides: { FOH: { shifts, hours: 0, need: [], gaps: [], unusable: [] } } });
const run = (w, rules) => warningsForWeek({ week: w, avail: {}, skills: {}, minors: new Set(), timeOff: [], terminated: new Set(), rules });
const msgs = (list) => list.map((x) => x.message);
const has = (list, re) => list.some((x) => re.test(x.message));
const level = (list, re) => (list.find((x) => re.test(x.message)) || {}).level;

/* ── the numbers live in one place ──────────────────────────────────────── */
{
  ok("★ 12 hours is his number, and it lives with the other rules",
    DEFAULT_RULES.maxDayHours === 12, String(DEFAULT_RULES.maxDayHours));
  ok("★ the rest gap is a setting, so the line can move without a code change",
    typeof DEFAULT_RULES.minRestHours === "number" && DEFAULT_RULES.minRestHours > 0);
  ok("★★ the engine's own shift cap is BELOW the day cap, which is why neither fires on a built week",
    DEFAULT_RULES.maxShift / 60 < DEFAULT_RULES.maxDayHours);
}

/* ── no more than 12 hours ──────────────────────────────────────────────── */
{
  const over = run(week({ Mon: day("2026-08-17", [sh("1", H(6), H(19))]) }));   // 13h
  ok("★★ a hand-typed THIRTEEN hour day is caught", has(over, /in one day/), JSON.stringify(msgs(over)));
  ok("★★ and it is a BLOCK, because he stated it as an absolute",
    level(over, /in one day/) === LEVEL.BLOCK, level(over, /in one day/));
  ok("★ the message says the number and the cap",
    has(over, /13\.0 hours in one day, over 12/), JSON.stringify(msgs(over)));

  const at = run(week({ Mon: day("2026-08-17", [sh("1", H(6), H(18))]) }));      // exactly 12
  ok("★★ EXACTLY twelve is fine — the rule is 'no more than'",
    !has(at, /in one day/), JSON.stringify(msgs(at)));

  const under = run(week({ Mon: day("2026-08-17", [sh("1", H(6), H(14))]) }));   // 8h
  ok("a normal day says nothing", !has(under, /in one day/));

  /* ⚠️⚠️ THE CASE A PER-SHIFT CHECK MISSES ENTIRELY. */
  const split = run(week({ Mon: day("2026-08-17", [sh("1", H(5), H(12)), sh("1", H(15), H(22))]) })); // 7 + 7
  ok("★★ TWO seven-hour shifts on one day is a fourteen hour day and IS caught",
    has(split, /14\.0 hours in one day/), JSON.stringify(msgs(split)));

  const two = run(week({ Mon: day("2026-08-17", [sh("1", H(6), H(19)), sh("2", H(6), H(12))]) }));
  ok("★ only the person over it is flagged",
    two.filter((x) => /in one day/.test(x.message)).length === 1, JSON.stringify(msgs(two)));

  const custom = run(week({ Mon: day("2026-08-17", [sh("1", H(6), H(17))]) }), { ...DEFAULT_RULES, maxDayHours: 10 });
  ok("★ the cap is a rule a caller can change", has(custom, /over 10/), JSON.stringify(msgs(custom)));
}

/* ── no clopening ───────────────────────────────────────────────────────── */
{
  /* Close 3pm-11pm Monday, open 5am-1pm Tuesday. Six hours off. */
  const clop = run(week({
    Mon: day("2026-08-17", [sh("1", H(15), H(23))]),
    Tue: day("2026-08-18", [sh("1", H(5), H(13))]),
  }));
  ok("★★ closing then opening the next morning is caught", has(clop, /closed then opened/), JSON.stringify(msgs(clop)));
  ok("★★ and it is a BLOCK", level(clop, /closed then opened/) === LEVEL.BLOCK);
  /* ⚠️⚠️ THE MIDNIGHT CROSSING. Compared on start times this gap reads as
     NEGATIVE ten and passes silently. It is SIX. */
  ok("★★ the gap is measured ACROSS MIDNIGHT and reads six hours, not a negative",
    has(clop, /only 6\.0 hours off/), JSON.stringify(msgs(clop)));

  const rested = run(week({
    Mon: day("2026-08-17", [sh("1", H(9), H(17))]),
    Tue: day("2026-08-18", [sh("1", H(9), H(17))]),
  }));
  ok("★★ two ordinary back-to-back days are NOT a clopening (16 hours off)",
    !has(rested, /closed then opened/), JSON.stringify(msgs(rested)));

  const gapDay = run(week({
    Mon: day("2026-08-17", [sh("1", H(15), H(23))]),
    Tue: day("2026-08-18", []),
    Wed: day("2026-08-19", [sh("1", H(5), H(13))]),
  }));
  ok("★★ a DAY OFF in between is not a clopening, however early the return",
    !has(gapDay, /closed then opened/), JSON.stringify(msgs(gapDay)));

  const sameDay = run(week({ Mon: day("2026-08-17", [sh("1", H(5), H(9)), sh("1", H(17), H(21))]) }));
  ok("★ a split shift inside ONE day is a different question and is not flagged here",
    !has(sameDay, /closed then opened/), JSON.stringify(msgs(sameDay)));

  const other = run(week({
    Mon: day("2026-08-17", [sh("1", H(15), H(23))]),
    Tue: day("2026-08-18", [sh("2", H(5), H(13))]),
  }));
  ok("★★ two DIFFERENT people are never a clopening",
    !has(other, /closed then opened/), JSON.stringify(msgs(other)));

  const once = run(week({
    Mon: day("2026-08-17", [sh("1", H(15), H(23))]),
    Tue: day("2026-08-18", [sh("1", H(5), H(13))]),
    Wed: day("2026-08-19", [sh("1", H(5), H(13))]),
  }));
  ok("★ one clopening note per person, not one per night",
    once.filter((x) => /closed then opened/.test(x.message)).length === 1, JSON.stringify(msgs(once)));

  const loose = run(week({
    Mon: day("2026-08-17", [sh("1", H(15), H(23))]),
    Tue: day("2026-08-18", [sh("1", H(5), H(13))]),
  }), { ...DEFAULT_RULES, minRestHours: 4 });
  ok("★ the rest gap is a rule a caller can change", !has(loose, /closed then opened/));
}

/* ── an empty or odd week still answers ─────────────────────────────────── */
{
  ok("an empty week says nothing and does not throw", run(week({})).length === 0);
  ok("a day with no shifts is fine", run(week({ Mon: day("2026-08-17", []) })).length === 0);
  ok("no week at all does not throw", Array.isArray(run({})));
}

if (fails.length) {
  console.log(`storeRules: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`storeRules: ${pass} passed`);
