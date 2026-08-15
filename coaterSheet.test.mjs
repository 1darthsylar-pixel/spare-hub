/* Assertions for coaterSheet.js — the coater allocation sheet's rules.

   ⚠️ THESE GRADE THE LEAF, NOT THE SCREEN. Everything about what a blank means,
   who writes which column and how a variance comes out lives in coaterSheet.js
   precisely so it can be graded here without a browser.

   The numbers in the "his real Tuesday" case are read straight off the photo of
   Matthew's laminated sheet: 5/6, 12/13, 8/9, 10/12. Over on all four. */

import assert from "node:assert/strict";

const src = new URL("./coaterSheet.js", import.meta.url).href;
const M = await import(src);

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass += 1; }
  catch (e) { fail += 1; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

/* ── num: a blank is not a zero ──────────────────────────────────────── */
t("blank, null and undefined are all null, never 0", () => {
  assert.equal(M.num(""), null);
  assert.equal(M.num("   "), null);
  assert.equal(M.num(null), null);
  assert.equal(M.num(undefined), null);
});

t("zero is a real answer and survives", () => {
  assert.equal(M.num(0), 0);
  assert.equal(M.num("0"), 0);
});

t("half bags are kept, thirds are rounded to a tenth", () => {
  assert.equal(M.num("5.5"), 5.5);
  assert.equal(M.num("5.55"), 5.6);
});

t("rubbish and negatives are null, not NaN and not a negative bag count", () => {
  assert.equal(M.num("abc"), null);
  assert.equal(M.num(-3), null);
  assert.equal(M.num(Infinity), null);
});

/* ── readDay: old and malformed records still read ───────────────────── */
t("a record that has never been written reads as four blanks, not a crash", () => {
  const d = M.readDay(undefined);
  for (const k of M.COATER_DAYPARTS) {
    assert.equal(d.allotted[k], null);
    assert.equal(d.used[k], null);
  }
  assert.equal(d.catering, "");
});

t("a half-written record keeps what is there and blanks what is not", () => {
  const d = M.readDay({ allotted: { lunch: 12 } });
  assert.equal(d.allotted.lunch, 12);
  assert.equal(d.allotted.breakfast, null);
  assert.equal(d.used.lunch, null);
});

t("junk in the stored shape does not throw", () => {
  assert.equal(M.readDay([]).catering, "");
  assert.equal(M.readDay("nope").allotted.lunch, null);
  assert.equal(M.readDay({ allotted: "nope" }).allotted.lunch, null);
  assert.equal(M.readSheet([]).days.anything, undefined);
  assert.equal(M.readSheet(null).v, 1);
});

/* ── variance: the number the whole sheet exists for ─────────────────── */
const TUESDAY = {
  allotted: { breakfast: 5, lunch: 12, mid: 8, night: 10 },
  used: { breakfast: 6, lunch: 13, mid: 9, night: 12 },
};

t("his real Tuesday is over on all four dayparts", () => {
  assert.equal(M.varianceOf(TUESDAY, "breakfast"), 1);
  assert.equal(M.varianceOf(TUESDAY, "lunch"), 1);
  assert.equal(M.varianceOf(TUESDAY, "mid"), 1);
  assert.equal(M.varianceOf(TUESDAY, "night"), 2);
  for (const k of M.COATER_DAYPARTS) assert.equal(M.stateOf(TUESDAY, k), "over");
});

t("under and level are told apart from over", () => {
  const d = { allotted: { lunch: 12 }, used: { lunch: 9 } };
  assert.equal(M.varianceOf(d, "lunch"), -3);
  assert.equal(M.stateOf(d, "lunch"), "under");
  const level = { allotted: { lunch: 12 }, used: { lunch: 12 } };
  assert.equal(M.varianceOf(level, "lunch"), 0);
  assert.equal(M.stateOf(level, "lunch"), "level");
});

t("⚠️ a missing side is blank, NEVER a variance against zero", () => {
  const allottedOnly = { allotted: { night: 10 } };
  assert.equal(M.varianceOf(allottedOnly, "night"), null, "10 allotted and nobody counted is not -10 used");
  assert.equal(M.stateOf(allottedOnly, "night"), "blank");
  const usedOnly = { used: { night: 10 } };
  assert.equal(M.varianceOf(usedOnly, "night"), null);
  assert.equal(M.stateOf(usedOnly, "night"), "blank");
});

t("used zero against an allotment is a real under, not a blank", () => {
  const d = { allotted: { breakfast: 5 }, used: { breakfast: 0 } };
  assert.equal(M.varianceOf(d, "breakfast"), -5);
  assert.equal(M.stateOf(d, "breakfast"), "under");
});

/* ── totals ──────────────────────────────────────────────────────────── */
t("the whole day adds up", () => {
  const t2 = M.totalsOf(TUESDAY);
  assert.equal(t2.allotted, 35);
  assert.equal(t2.used, 40);
  assert.equal(t2.variance, 5);
  assert.equal(t2.parts, 4);
});

t("⚠️ one daypart filled in does not read as a whole day on plan", () => {
  const one = { allotted: { breakfast: 5 }, used: { breakfast: 5 } };
  const t2 = M.totalsOf(one);
  assert.equal(t2.variance, 0);
  assert.equal(t2.parts, 1, "the screen needs to know only one of four is in");
});

t("a day nobody has touched has a null variance, not a zero", () => {
  const t2 = M.totalsOf({});
  assert.equal(t2.allotted, 0);
  assert.equal(t2.used, 0);
  assert.equal(t2.variance, null);
  assert.equal(t2.parts, 0);
});

/* ── who may write which column ──────────────────────────────────────── */
t("allotted is Director and up, used is leader and up", () => {
  assert.equal(M.canSetAllotted(3), true);
  assert.equal(M.canSetAllotted(2), false);
  assert.equal(M.canSetUsed(2), true);
  assert.equal(M.canSetUsed(1), false);
  assert.equal(M.canSetAllotted(undefined), false, "an unknown tier writes nothing");
  assert.equal(M.canSetUsed(null), false);
});

/* ── withCell: the concurrent-writer rule ────────────────────────────── */
t("writes one cell and hands back a new object", () => {
  const a = M.readSheet(null);
  const b = M.withCell(a, "2026-08-14", "used", "lunch", "13", "Bri");
  assert.notEqual(a, b, "never mutates its argument");
  assert.equal(M.dayOf(b, "2026-08-14").used.lunch, 13);
  assert.equal(M.dayOf(a, "2026-08-14").used.lunch, null, "the original is untouched");
});

t("⚠️⚠️ filling dinner NEVER wipes the breakfast somebody else typed", () => {
  let s = M.readSheet(null);
  s = M.withCell(s, "2026-08-14", "allotted", "breakfast", 5, "Matt");
  s = M.withCell(s, "2026-08-14", "used", "breakfast", 6, "Nick");
  s = M.withCell(s, "2026-08-14", "used", "night", 12, "Hanna");
  const d = M.dayOf(s, "2026-08-14");
  assert.equal(d.allotted.breakfast, 5);
  assert.equal(d.used.breakfast, 6);
  assert.equal(d.used.night, 12);
});

t("⚠️ writing one day never touches another day", () => {
  let s = M.readSheet(null);
  s = M.withCell(s, "2026-08-13", "used", "lunch", 9, "Bri");
  s = M.withCell(s, "2026-08-14", "used", "lunch", 13, "Bri");
  assert.equal(M.dayOf(s, "2026-08-13").used.lunch, 9);
  assert.equal(M.dayOf(s, "2026-08-14").used.lunch, 13);
});

t("clearing a cell puts it back to blank, not to zero", () => {
  let s = M.withCell(M.readSheet(null), "2026-08-14", "used", "lunch", 13, "Bri");
  s = M.withCell(s, "2026-08-14", "used", "lunch", "", "Bri");
  assert.equal(M.dayOf(s, "2026-08-14").used.lunch, null);
  assert.equal(M.varianceOf(M.dayOf(s, "2026-08-14"), "lunch"), null);
});

t("a bad day, column or daypart is refused rather than written somewhere odd", () => {
  const s = M.readSheet(null);
  assert.deepEqual(M.withCell(s, "", "used", "lunch", 5).days, {});
  assert.deepEqual(M.withCell(s, "2026-08-14", "sideways", "lunch", 5).days, {});
  assert.deepEqual(M.withCell(s, "2026-08-14", "used", "elevenses", 5).days, {});
});

t("who typed it is recorded per cell, per column", () => {
  let s = M.withCell(M.readSheet(null), "2026-08-14", "allotted", "lunch", 12, "Matt");
  s = M.withCell(s, "2026-08-14", "used", "lunch", 13, "Nick");
  const by = M.dayOf(s, "2026-08-14").by;
  assert.equal(by["allotted:lunch"], "Matt");
  assert.equal(by["used:lunch"], "Nick");
});

/* ── catering is a note and nothing else ─────────────────────────────── */
t("the catering note is free text and changes no number", () => {
  let s = M.withCell(M.readSheet(null), "2026-08-14", "allotted", "lunch", 12, "Matt");
  s = M.withCatering(s, "2026-08-14", "3 trays at 11");
  const d = M.dayOf(s, "2026-08-14");
  assert.equal(d.catering, "3 trays at 11");
  assert.equal(d.allotted.lunch, 12, "⚠️ NO FORMULA. Catering must not move the allotment.");
});

/* ── the day key ─────────────────────────────────────────────────────── */
t("⚠️ the day key is the DEVICE's day, never a UTC slice", () => {
  /* 8:30pm Eastern on Aug 14 is already Aug 15 in UTC. The evening shift must
     still be writing on the 14th. */
  const evening = new Date(2026, 7, 14, 20, 30, 0);
  assert.equal(M.dayKey(evening), "2026-08-14");
  assert.equal(M.dayKey(new Date(2026, 7, 14, 5, 15, 0)), "2026-08-14");
  assert.equal(M.dayKey("nonsense"), "");
});

t("⚠️ the arrows move one real day, across a month and a year end", () => {
  assert.equal(M.shiftDay("2026-08-14", -1), "2026-08-13");
  assert.equal(M.shiftDay("2026-08-14", 1), "2026-08-15");
  assert.equal(M.shiftDay("2026-08-31", 1), "2026-09-01");
  assert.equal(M.shiftDay("2026-09-01", -1), "2026-08-31");
  assert.equal(M.shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(M.shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(M.shiftDay("", 1), "");
  assert.equal(M.shiftDay("not a date", 1), "");
});

t("a week of arrows lands exactly seven days back", () => {
  let d = "2026-08-14";
  for (let i = 0; i < 7; i += 1) d = M.shiftDay(d, -1);
  assert.equal(d, "2026-08-07");
});

/* ── recentDays ──────────────────────────────────────────────────────── */
t("recent days are newest first and days nobody touched are not rows", () => {
  let s = M.readSheet(null);
  s = M.withCell(s, "2026-08-10", "used", "lunch", 9, "Bri");
  s = M.withCell(s, "2026-08-12", "allotted", "lunch", 12, "Matt");
  s = M.withCell(s, "2026-08-14", "used", "night", 12, "Nick");
  /* Touched then cleared — no numbers left, so it is not a row. */
  s = M.withCell(s, "2026-08-11", "used", "mid", 4, "Bri");
  s = M.withCell(s, "2026-08-11", "used", "mid", "", "Bri");
  assert.deepEqual(M.recentDays(s, 7), ["2026-08-14", "2026-08-12", "2026-08-10"]);
});

t("a day with only a catering note still shows", () => {
  const s = M.withCatering(M.readSheet(null), "2026-08-14", "2 trays");
  assert.deepEqual(M.recentDays(s, 7), ["2026-08-14"]);
});

t("recentDays honours the count and never throws on nothing", () => {
  let s = M.readSheet(null);
  for (let d = 1; d <= 10; d += 1) {
    s = M.withCell(s, `2026-08-${String(d).padStart(2, "0")}`, "used", "lunch", d, "Bri");
  }
  assert.equal(M.recentDays(s, 7).length, 7);
  assert.equal(M.recentDays(s, 7)[0], "2026-08-10");
  assert.equal(M.recentDays(M.readSheet(null), 7).length, 0);
  assert.equal(M.recentDays(s, 0).length, 0);
});

/* ── the shape itself ────────────────────────────────────────────────── */
t("the four daypart keys are the Hub's, and they are frozen", () => {
  assert.deepEqual([...M.COATER_DAYPARTS], ["breakfast", "lunch", "mid", "night"]);
  assert.ok(Object.isFrozen(M.COATER_DAYPARTS));
});

t("a sheet survives a round trip through JSON, which is how it is stored", () => {
  let s = M.withCell(M.readSheet(null), "2026-08-14", "used", "lunch", 13, "Bri");
  s = M.withCatering(s, "2026-08-14", "3 trays");
  const back = M.readSheet(JSON.parse(JSON.stringify(s)));
  assert.equal(M.dayOf(back, "2026-08-14").used.lunch, 13);
  assert.equal(M.dayOf(back, "2026-08-14").catering, "3 trays");
});

console.log(`coaterSheet.test.mjs  ${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
