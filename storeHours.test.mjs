/* storeHours — the days the store does not keep its normal hours.

   Matt, Aug 13 2026: "for holidays we only open 10:30-4 so log that. I make
   special cuts for those days." Then: "I have a sept schedule with the actual
   holiday as well that will be coming soon."

   ⚠️ THE FIXTURE STATIONS ARE REAL ONES WITH THEIR REAL POSTED HOURS, because
   the failure this file exists to prevent is specific: on a 10:30-4 day, Bulk
   Prep opens 5am and Leader DT opens 5:15am, and a week built without this
   rosters both of them before the doors are unlocked. */
import {
  STORE_HOURS_KEY, readStoreHours, hasExceptions, hoursForDate,
  stationsForDate, earlyStations, setDate, removeDate, setDefaultWindow, upcoming,
  setStationCut, cutsOn,
} from "./storeHours.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };

const OPEN = 630, CLOSE = 960;          // 10:30am and 4pm, in minutes
const STATIONS = [
  { id: "bulk", name: "Bulk Prep", hours: [{ start: 300, end: 1380 }] },        // 5am-11pm
  { id: "biscuits", name: "Biscuits / Eggs", hours: [{ start: 315, end: 660 }] }, // 5:15am-11am
  { id: "dish", name: "Dish 1", hours: [{ start: 1020, end: 1380 }] },          // 5pm-11pm
  { id: "expo2", name: "EXPO 2", hours: [{ start: 675, end: 840 }, { start: 1020, end: 1200 }] },
  { id: "trainer", name: "TRAINER", hours: null },                              // manual-only row
];

/* ── the read guards ────────────────────────────────────────────────────── */
ok("the key name is stable", STORE_HOURS_KEY === "gcfcr-store-hours-v1");
ok("null reads as no exceptions", Object.keys(readStoreHours(null).dates).length === 0);
ok("an array reads as no exceptions", Object.keys(readStoreHours([1, 2]).dates).length === 0);
ok("nothing typed is a working state", hasExceptions(null) === false);
{
  const bare = readStoreHours({ "2026-09-07": { open: OPEN, close: CLOSE } });
  ok("a bare map written before v:1 still reads", bare.dates["2026-09-07"].open === OPEN,
    JSON.stringify(bare.dates));
  const junk = readStoreHours({ v: 1, dates: { "not-a-date": { open: 1 }, "2026-09-07": "x" } });
  ok("a bad date key and a bad row are both dropped", Object.keys(junk.dates).length === 0,
    JSON.stringify(junk.dates));
  const both = readStoreHours({ v: 1, dates: { "2026-12-25": { closed: true, open: 300, close: 1380 } } });
  ok("closed beats hours on the same row",
    both.dates["2026-12-25"].closed === true && both.dates["2026-12-25"].open === null);
}

/* ── one date ───────────────────────────────────────────────────────────── */
const CFG = readStoreHours({
  v: 1,
  defaultOpen: OPEN,
  defaultClose: CLOSE,
  dates: {
    "2026-09-07": { note: "Labor Day" },                          // uses the default
    "2026-11-26": { open: 660, close: 900, note: "Thanksgiving" }, // its own hours
    "2026-12-25": { closed: true, note: "Christmas" },
  },
});

ok("an ordinary date answers null, and that is the common case",
  hoursForDate(CFG, "2026-09-08") === null);
ok("★ Labor Day falls back to the store's own default window",
  JSON.stringify([hoursForDate(CFG, "2026-09-07").open, hoursForDate(CFG, "2026-09-07").close]) === `[${OPEN},${CLOSE}]`,
  JSON.stringify(hoursForDate(CFG, "2026-09-07")));
ok("a date with its own hours keeps them",
  hoursForDate(CFG, "2026-11-26").open === 660 && hoursForDate(CFG, "2026-11-26").close === 900);
ok("a closed date says closed", hoursForDate(CFG, "2026-12-25").closed === true);
ok("the note comes through", hoursForDate(CFG, "2026-09-07").note === "Labor Day");
{
  /* ⚠️ THE ONE THAT MATTERS MOST: a date ticked with no hours and no default
     tells us NOTHING, and must not be guessed at. */
  const noDefault = readStoreHours({ v: 1, dates: { "2026-09-07": { note: "Labor Day" } } });
  ok("★ a ticked date with no hours anywhere is an ordinary day, never a guess",
    hoursForDate(noDefault, "2026-09-07") === null, JSON.stringify(hoursForDate(noDefault, "2026-09-07")));
}

/* ── the stations, as they really are ───────────────────────────────────── */
ok("an ordinary date returns the station list untouched, by identity",
  stationsForDate(STATIONS, CFG, "2026-09-08") === STATIONS);

{
  const s = stationsForDate(STATIONS, CFG, "2026-09-07");
  const by = Object.fromEntries(s.map((x) => [x.name, x]));
  ok("★ Bulk Prep no longer opens at 5am on a 10:30 day",
    by["Bulk Prep"].hours[0].start === OPEN && by["Bulk Prep"].hours[0].end === CLOSE,
    JSON.stringify(by["Bulk Prep"].hours));
  ok("★ Biscuits, which shuts at 11am, keeps only the thirty minutes it really has",
    by["Biscuits / Eggs"].hours[0].start === 630 && by["Biscuits / Eggs"].hours[0].end === 660,
    JSON.stringify(by["Biscuits / Eggs"].hours));
  ok("★ Dish 1, which opens at 5pm, is GONE for the day rather than a hole",
    !by["Dish 1"], JSON.stringify(s.map((x) => x.name)));
  ok("a two-window station keeps only the window that survives",
    by["EXPO 2"].hours.length === 1 && by["EXPO 2"].hours[0].end === 840,
    JSON.stringify(by["EXPO 2"].hours));
  ok("★ a manual-only row survives with hours still null, not an empty array",
    by["TRAINER"] && by["TRAINER"].hours === null, JSON.stringify(by["TRAINER"]));
  ok("★ THE ORIGINAL LIST WAS NOT MUTATED — the same Thursday later in the week\n     must still open at 5am",
    STATIONS[0].hours[0].start === 300 && STATIONS[1].hours[0].end === 660,
    JSON.stringify(STATIONS.slice(0, 2)));
}
ok("a closed date has no stations at all", stationsForDate(STATIONS, CFG, "2026-12-25").length === 0);

/* ── the back of house opens the building ────────────────────────────────
   🐛🐛 THE FIRST VERSION CUT EVERY STATION TO THE OPENING TIME, AND HIS OWN
   LABOR DAY ROSTER DISPROVED IT WITHIN THE HOUR. The real Sep 7 report has
   **Ana Turcios on Prep from 8:00 AM** on a day the store opens at 10:30.
   Clamping her to 10:30 deletes two and a half hours of prep from a holiday
   and nobody sees it until the morning. */
{
  const boh = stationsForDate(STATIONS, CFG, "2026-09-07", { clampStart: false });
  const by = Object.fromEntries(boh.map((x) => [x.name, x]));
  ok("★ back of house keeps its own start on a late-opening day",
    by["Bulk Prep"].hours[0].start === 300, JSON.stringify(by["Bulk Prep"].hours));
  ok("★ but its close still moves, because the store really is shut",
    by["Bulk Prep"].hours[0].end === CLOSE, JSON.stringify(by["Bulk Prep"].hours));
  ok("★ Biscuits keeps its whole morning instead of thirty minutes",
    by["Biscuits / Eggs"].hours[0].start === 315 && by["Biscuits / Eggs"].hours[0].end === 660,
    JSON.stringify(by["Biscuits / Eggs"].hours));
  ok("a station that starts after close is still gone",
    !by["Dish 1"], JSON.stringify(boh.map((x) => x.name)));
  ok("the front of house is unchanged by the option being absent",
    stationsForDate(STATIONS, CFG, "2026-09-07")[0].hours[0].start === OPEN);
  ok("clampStart:true is the same as saying nothing",
    JSON.stringify(stationsForDate(STATIONS, CFG, "2026-09-07", { clampStart: true }))
      === JSON.stringify(stationsForDate(STATIONS, CFG, "2026-09-07")));
  ok("★ the original list is STILL not mutated by either path",
    STATIONS[0].hours[0].start === 300 && STATIONS[1].hours[0].end === 660);
}

/* ── the cut a human still has to make ──────────────────────────────────── */
{
  const early = earlyStations(STATIONS, CFG, "2026-09-07").map((x) => x.name).sort();
  ok("★ the stations already running before the doors are named, not guessed at",
    early.join("|") === "Biscuits / Eggs|Bulk Prep", early.join("|"));
  ok("nothing to name on an ordinary date",
    earlyStations(STATIONS, CFG, "2026-09-08").length === 0);
  ok("nothing to name on a closed date",
    earlyStations(STATIONS, CFG, "2026-12-25").length === 0);
  ok("a manual-only row is never named", !earlyStations(STATIONS, CFG, "2026-09-07").some((x) => x.name === "TRAINER"));
}
{
  const backwards = readStoreHours({ v: 1, dates: { "2026-09-07": { open: 900, close: 600 } } });
  ok("a close before the open closes the day rather than inverting it",
    stationsForDate(STATIONS, backwards, "2026-09-07").length === 0);
}

/* ── the writers refuse half a record ───────────────────────────────────── */
ok("a bad date is refused", setDate(CFG, "nope", { open: OPEN, close: CLOSE }) === null);
ok("★ an open with no close and no default is refused, not stored",
  setDate(readStoreHours(null), "2026-09-07", { open: OPEN }) === null);
ok("a close before the open is refused",
  setDate(CFG, "2026-09-07", { open: 900, close: 600 }) === null);
ok("closing a day needs no times", setDate(CFG, "2027-01-01", { closed: true }) !== null);
{
  const next = setDate(CFG, "2027-01-01", { open: 720, close: 1080, note: "New Year" }, { at: "T", by: "Matt Jackson" });
  ok("a good row is stored and stamped",
    hoursForDate(next, "2027-01-01").open === 720 && next.updatedBy === "Matt Jackson");
  ok("adding one does not disturb the others", Object.keys(next.dates).length === 4);
  const gone = removeDate(next, "2027-01-01", { at: "T2", by: "x" });
  ok("removing takes one out", Object.keys(gone.dates).length === 3);
  ok("removing something absent answers null", removeDate(CFG, "2030-01-01") === null);
}
ok("a default window with no close is refused", setDefaultWindow(CFG, OPEN, null) === null);
ok("a default window is stored", setDefaultWindow(CFG, 600, 1000).defaultOpen === 600);

/* ── the screen's list ──────────────────────────────────────────────────── */
{
  const list = upcoming(CFG, "2026-10-01");
  ok("only what is still to come", list.length === 2 && list[0].iso === "2026-11-26",
    JSON.stringify(list.map((x) => x.iso)));
  ok("and it carries the resolved hours, not just the raw row",
    list[0].resolved.open === 660);
  ok("no from-date lists everything", upcoming(CFG, "").length === 3);
}

/* ── the special cuts ────────────────────────────────────────────────────
   Matt: "I make special cuts for those days." Shorter store hours are half a
   holiday; the other half is that some stations do not run and some run their
   own hours. His real Sep 7 roster has prep on from 8:00 AM. */
{
  ok("an ordinary date has no cuts", cutsOn(CFG, "2026-09-08").length === 0);
  ok("a date with none typed has none", cutsOn(CFG, "2026-09-07").length === 0);
  ok("a cut on a date the store never flagged is refused",
    setStationCut(CFG, "2030-01-01", "bulk", { off: true }) === null);
  ok("a blank station is refused", setStationCut(CFG, "2026-09-07", "", { off: true }) === null);
  ok("half a window is refused", setStationCut(CFG, "2026-09-07", "bulk", { start: 480 }) === null);
  ok("a backwards window is refused", setStationCut(CFG, "2026-09-07", "bulk", { start: 900, end: 600 }) === null);

  const off = setStationCut(CFG, "2026-09-07", "dish", { off: true }, { at: "T", by: "Matt Jackson" });
  ok("cutting a station stores", cutsOn(off, "2026-09-07").length === 1 && cutsOn(off, "2026-09-07")[0].off === true);
  ok("★ a station cut for the day is not on the board at all",
    !stationsForDate(STATIONS, off, "2026-09-07").some((x) => x.id === "dish"));
  ok("the store's own hours are untouched by a cut",
    hoursForDate(off, "2026-09-07").open === OPEN);
  ok("other dates are untouched", cutsOn(off, "2026-11-26").length === 0);

  /* ★★ THE ONE HIS ROSTER ASKED FOR: prep on at 8, on a 10:30 day. */
  const prep = setStationCut(off, "2026-09-07", "bulk", { start: 480, end: 840 }, { at: "T", by: "x" });
  const s2 = stationsForDate(STATIONS, prep, "2026-09-07");
  const bulk = s2.find((x) => x.id === "bulk");
  ok("★ a typed window puts prep on at 8 and off at 2",
    bulk && bulk.hours.length === 1 && bulk.hours[0].start === 480 && bulk.hours[0].end === 840,
    JSON.stringify(bulk && bulk.hours));
  ok("★ and it beats the front/back default, not the other way round",
    stationsForDate(STATIONS, prep, "2026-09-07", { clampStart: false })
      .find((x) => x.id === "bulk").hours[0].start === 480);
  ok("a station with no cut still follows the store clamp",
    s2.find((x) => x.id === "biscuits").hours[0].start === OPEN,
    JSON.stringify(s2.find((x) => x.id === "biscuits")));
  ok("both cuts are listed", cutsOn(prep, "2026-09-07").length === 2);

  const back = setStationCut(prep, "2026-09-07", "bulk", null, { at: "T", by: "x" });
  ok("clearing a cut puts the station back to ordinary hours",
    cutsOn(back, "2026-09-07").length === 1 &&
    stationsForDate(STATIONS, back, "2026-09-07").find((x) => x.id === "bulk").hours[0].start === OPEN);
  ok("clearing something that is not there is refused", setStationCut(CFG, "2026-09-07", "bulk", null) === null);
  ok("★ a manual-only row can still be cut, and is not resurrected with hours",
    !stationsForDate(STATIONS, setStationCut(CFG, "2026-09-07", "trainer", { off: true }), "2026-09-07")
      .some((x) => x.id === "trainer"));
  ok("★ the caller's station list is STILL not mutated",
    STATIONS[0].hours[0].start === 300);
  ok("a junk cut row is dropped on the read, not thrown",
    Object.keys(readStoreHours({ v: 1, dates: { "2026-09-07": { open: OPEN, close: CLOSE, stations: { a: 5, b: { start: 9 } } } } })
      .dates["2026-09-07"].stations).length === 0);
}

/* ── it names no holiday and no store ───────────────────────────────────── */
{
  /* ⚠️ COMMENTS ARE STRIPPED FIRST, AND THAT IS THE CORRECT TEST RATHER THAN A
     WEAKENED ONE. My first version grepped the raw function source and failed
     on the word "Labor" inside a comment citing his real Labor Day roster —
     which is provenance, and provenance stays. This repo already learnt the
     same lesson counting live strings in the Worker bundle: grep the code, not
     the comments, or a dozen explanations read as live values. */
  const strip = (fn) => String(fn)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const src = [readStoreHours, hoursForDate, stationsForDate, earlyStations, setDate, upcoming, setStationCut, cutsOn]
    .map(strip).join("\n");
  ["Thanksgiving", "Christmas", "Labor", "630", "960", "10:30", "Gate City", "Prep", "FOH", "BOH"]
    .forEach((word) => ok(`no "${word}" in the live code`, !src.includes(word), word));
  /* And prove the strip did not simply blank everything, which would make the
     whole block pass for the wrong reason. */
  ok("the strip left real code behind", src.includes("clampStart") && src.includes("jsonb" ) === false && src.length > 800,
    String(src.length));
}

if (fails.length) {
  console.log(`storeHours: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`storeHours: ${pass} passed`);
