/* assignPositions with a store's own history behind it.

   Matt, Aug 13 2026: "the positions are predetermined by schedule time and the
   current schedule applied doesn't match it. Use memory to predict who needs
   placed where."

   ⚠️ EVERY ASSERTION BELOW IS PAIRED. The same stations and the same people are
   run WITHOUT history and WITH it, because the claim being tested is not "this
   produces a board" — it is "this produces a DIFFERENT board, in the direction
   the store already works, and changes nothing else". */
import { assignPositions } from "./scheduleEngine.js";
import { stationLoad, placementMemory } from "./boardHistory.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };

const STATIONS = [
  { id: "core1", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 840 }] },
  { id: "prep", name: "Bulk Prep", section: "PREP", hours: [{ start: 360, end: 840 }] },
  { id: "peak1", name: "Hash/S Fry", section: "FRY STATION", hours: [{ start: 360, end: 840 }] },
  /* ⚠️ `hours: null` IS HOW THIS STORE SAYS "not a posted position". Matt,
     Aug 13 2026: "Trainers and training are only for manual edits." TRAINER,
     TRAINING, MOBILE BAGGER, the two leader rows and Hash/S Fry all carry it
     in the live config, and a leader still fills them by hand on the board. */
  { id: "duty", name: "Mobile Bagger", section: "FRONT", hours: null },
];

/* Two people, both free the whole window, both equally skilled, so nothing but
   history can separate them. Ana is the store's Bulk Prep anchor. */
const SHIFTS = [
  { id: "6", name: "Ana Turcios", start: 360, end: 840, skill: 2, lead: 1 },
  { id: "93", name: "Kimberley Garcia", start: 360, end: 840, skill: 2, lead: 1 },
];
const ROSTER = [{ id: "6", name: "Ana Turcios" }, { id: "93", name: "Kimberley Garcia" }];

/* A history in the real shape: Ana always on Bulk Prep, Primary Point always
   staffed, Hash/S Fry almost never, Mobile Bagger never a body. */
const day = (bulk, primary, hash, bag) => ({ Monday: { stations: [
  { role: "Bulk Prep (6AM-2PM)", breakfast: bulk, lunch: bulk, mid: bulk, night: bulk },
  { role: "Primary Point (6AM-2PM)", breakfast: primary, lunch: primary, mid: primary, night: primary },
  { role: "Hash/S Fry (6AM-2PM)", breakfast: hash, lunch: "", mid: "", night: "" },
  { role: "Mobile Bagger", breakfast: bag, lunch: bag, mid: bag, night: bag },
] } });
const BOARDS = [
  day("Ana", "Kimberley", "", "split duties"),
  day("Ana", "Kimberley", "", "split duties"),
  day("Ana", "Kimberley", "Kimberley", "split duties"),
];
const history = {
  load: stationLoad(BOARDS),
  memory: placementMemory(BOARDS, ROSTER, { minCells: 4 }),
};

/* ── the history itself reads the way the store runs ──────────────────────
   ⚠️ NOTE WHAT IS NOT ASSERTED HERE: that "never" causes a skip. It does not,
   and it must not. A leader who manually puts somebody on Trainer next week
   would flip that measurement, and a row a human fills by hand must never
   become a row the machine fills by habit. The skip comes from `hours: null`
   in the store's own station config and predates all of this. */
ok("Primary Point is core", history.load.tierOf("Primary Point") === "core");
ok("Bulk Prep is core", history.load.tierOf("Bulk Prep") === "core");
ok("Hash/S Fry is peak", history.load.tierOf("Hash/S Fry") === "peak", history.load.tierOf("Hash/S Fry"));
ok("history still REPORTS a row nobody stands on, it just does not act on it",
  history.load.tierOf("Mobile Bagger") === "never");
ok("Ana is anchored to Bulk Prep", history.memory.homeOf("6") === "Bulk Prep");

/* ── without history, nothing changed ───────────────────────────────────── */
const before = assignPositions(STATIONS, SHIFTS);
ok("two arguments still works", Array.isArray(before.filled) && before.filled.length > 0);
ok("without history every station is treated as needing a body",
  new Set(before.filled.map((f) => f.station)).size >= 2);
ok("a manual-only row is left alone WITH OR WITHOUT history, because the store\'s\n     own hours:null says so and always did",
  !before.filled.concat(before.holes, before.peakHoles).some((x) => x.station === "Mobile Bagger"),
  JSON.stringify(before.holes.map((h) => h.station)));
ok("peakHoles exists even with no history", Array.isArray(before.peakHoles));

/* ── with history ───────────────────────────────────────────────────────── */
const after = assignPositions(STATIONS, SHIFTS, history);
const whoOn = (res, station) => [...new Set(res.filled.filter((f) => f.station === station).map((f) => f.name))];

ok("★ the anchor goes home: Ana is on Bulk Prep",
  whoOn(after, "Bulk Prep").join() === "Ana Turcios", JSON.stringify(whoOn(after, "Bulk Prep")));
ok("and the floater takes the other core station",
  whoOn(after, "Primary Point").join() === "Kimberley Garcia", JSON.stringify(whoOn(after, "Primary Point")));
ok("★ a manual-only row is not rostered and not reported as missing",
  !after.filled.some((f) => f.station === "Mobile Bagger") &&
  !after.holes.concat(after.peakHoles).some((h) => h.station === "Mobile Bagger"),
  JSON.stringify(after.holes.concat(after.peakHoles)));
ok("★ a peak station left empty is NOT reported as a hole",
  !after.holes.some((h) => h.station === "Hash/S Fry"), JSON.stringify(after.holes));
ok("but it IS reported, in its own list — nothing is hidden",
  after.peakHoles.some((h) => h.station === "Hash/S Fry"), JSON.stringify(after.peakHoles));
ok("no core station was left empty", after.holes.length === 0, JSON.stringify(after.holes));

/* ── memory orders, it never overrides ──────────────────────────────────── */
{
  /* Ana is anchored to Bulk Prep, but on this day she is not on the clock when
     it opens. Memory must not hold the station for somebody who is not there. */
  const late = [
    { id: "6", name: "Ana Turcios", start: 700, end: 840, skill: 2, lead: 1 },
    { id: "93", name: "Kimberley Garcia", start: 360, end: 840, skill: 2, lead: 1 },
  ];
  const r = assignPositions(STATIONS, late, history);
  const bulk = r.filled.filter((f) => f.station === "Bulk Prep").sort((a, b) => a.start - b.start);
  /* 🐛 MY FIRST ASSERTION HERE WAS WRONG AND THE CODE WAS RIGHT, which is the
     failure this repo warns about in as many words. I expected Kimberley to
     cover Bulk Prep from open. She cannot: there are two core stations and two
     people, so she is already standing on Primary Point. The real property is
     that the station is not HELD for the anchor — the span before Ana arrives
     is reported as an open hole rather than quietly waiting for her. */
  ok("an anchor who is not on the clock does not hold their station empty",
    bulk.length === 1 && bulk[0].name === "Ana Turcios" && bulk[0].start === 700 &&
    r.holes.some((h) => h.station === "Bulk Prep" && h.start === 360),
    JSON.stringify({ bulk, holes: r.holes }));
}
{
  /* A leader row still needs somebody certified to lead, whatever history says.
     This is the assertion that would catch memory being consulted too early. */
  const leadStations = [{ id: "lead", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 360, end: 840 }] }];
  const noLeads = [{ id: "6", name: "Ana Turcios", start: 360, end: 840, skill: 3, lead: 0 }];
  const boards = [{ Monday: { stations: [{ role: "Kitchen Lead / DT", breakfast: "Ana", lunch: "Ana", mid: "Ana", night: "Ana" }] } }];
  const h2 = { load: stationLoad(boards), memory: placementMemory(boards, ROSTER, { minCells: 1 }) };
  ok("history says Ana lives on that leader row", h2.memory.homeOf("6") === "Kitchen Lead / DT");
  const r = assignPositions(leadStations, noLeads, h2);
  ok("★ but an uncertified person is STILL refused a leader row",
    r.filled.length === 0 && r.holes.length > 0, JSON.stringify(r.filled));
}
{
  /* Nobody may stand in two places at once, history or not. */
  const two = [
    { id: "core1", name: "Primary Point", hours: [{ start: 360, end: 840 }] },
    { id: "prep", name: "Bulk Prep", hours: [{ start: 360, end: 840 }] },
  ];
  const one = [{ id: "6", name: "Ana Turcios", start: 360, end: 840, skill: 2, lead: 1 }];
  const r = assignPositions(two, one, history);
  const spans = r.filled.filter((f) => f.id === "6").sort((a, b) => a.start - b.start);
  const overlap = spans.some((x, i) => i > 0 && x.start < spans[i - 1].end);
  ok("★ one person is never on two stations at the same minute", !overlap, JSON.stringify(spans));
}

/* ── core is filled before peak, even when peak opens first ─────────────── */
{
  const s = [
    { id: "peak1", name: "Hash/S Fry", hours: [{ start: 300, end: 840 }] },   // opens EARLIER
    { id: "core1", name: "Primary Point", hours: [{ start: 360, end: 840 }] },
  ];
  const one = [{ id: "93", name: "Kimberley Garcia", start: 360, end: 840, skill: 2, lead: 1 }];
  const r = assignPositions(s, one, history);
  ok("★ the one body goes to the core station, not to the one that opened first",
    r.filled.every((f) => f.station === "Primary Point"), JSON.stringify(r.filled));
  ok("and the peak station's empty span is reported quietly",
    r.holes.length === 0 && r.peakHoles.length > 0,
    JSON.stringify({ holes: r.holes, peak: r.peakHoles }));
}

/* ── an unknown station is treated as core, because not knowing is not a
      reason to leave somebody off the floor ─────────────────────────────── */
{
  const s = [{ id: "new", name: "Brand New Station", hours: [{ start: 360, end: 840 }] }];
  const r = assignPositions(s, [], history);
  ok("a station the history has never seen still reports a real hole",
    r.holes.length === 1 && r.peakHoles.length === 0, JSON.stringify(r));
}

if (fails.length) {
  console.log(`assignPositions: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`assignPositions: ${pass} passed`);
