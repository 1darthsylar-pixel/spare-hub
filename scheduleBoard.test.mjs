/* boardDay — turning a built day sideways, from a list of people into the
   station board every leader in the building already reads.

   ⚠️ THE UNITS ARE THE WHOLE RISK HERE. The schedule is MINUTES from midnight
   and DAYPARTS is DECIMAL HOURS. Nearly every assertion below is really an
   assertion about that conversion, so if one of them starts failing, check the
   `* 60` before you change the test. */
import { boardDay } from "./scheduleEngine.js";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? "  — " + extra : ""}`);
};

const DPS = [
  { key: "breakfast", label: "Breakfast", start: 6, end: 10.5 },
  { key: "lunch", label: "Lunch", start: 10.5, end: 14 },
  { key: "mid", label: "Mid", start: 14, end: 17 },
  { key: "night", label: "Night", start: 17, end: null },
];

const STATIONS = [
  { id: "primaryPoint", name: "Primary Point", section: "PRIMARY", hours: [{ start: 360, end: 1200 }], duty: "STOCK SAUCES" },
  { id: "biscuits", name: "Biscuits / Eggs", section: "SECONDARY", hours: [{ start: 315, end: 660 }], duty: "CLEAN BISCUIT STATION" },
  { id: "grills", name: "Machines 4,5 / Grills", section: "MACHINES", hours: [{ start: 1020, end: 1380 }], duty: "" },
];

/* ── the window maths ───────────────────────────────────────────────────── */
{
  const b = boardDay({ stations: STATIONS, filled: [], dayparts: DPS });
  const w = Object.fromEntries(b.windows.map((x) => [x.key, x]));
  ok("decimal hours become minutes", w.breakfast.start === 360 && w.breakfast.end === 630,
    JSON.stringify(w.breakfast));
  ok("a half hour survives the conversion", w.lunch.start === 630, String(w.lunch.start));
  ok("night runs to the latest close in the day, not to midnight",
    w.night.start === 1020 && w.night.end === 1380, JSON.stringify(w.night));
}

/* ── sections keep the station file's own order ─────────────────────────── */
{
  const b = boardDay({ stations: STATIONS, filled: [], dayparts: DPS });
  ok("one section per group, in order",
    b.sections.map((s) => s.name).join("|") === "PRIMARY|SECONDARY|MACHINES",
    b.sections.map((s) => s.name).join("|"));
  ok("every station lands in its section",
    b.sections.reduce((n, s) => n + s.stations.length, 0) === 3);
  ok("the duty line comes along", b.sections[0].stations[0].duty === "STOCK SAUCES");
}

/* ── closed, gap and on are three DIFFERENT answers ─────────────────────── */
{
  const b = boardDay({ stations: STATIONS, filled: [], dayparts: DPS });
  const biscuits = b.sections[1].stations[0];
  ok("a station shut in that window is closed, not a gap",
    biscuits.cells.mid.state === "closed" && biscuits.cells.night.state === "closed",
    JSON.stringify({ mid: biscuits.cells.mid.state, night: biscuits.cells.night.state }));
  ok("a station OPEN in that window with nobody on it is a gap",
    biscuits.cells.breakfast.state === "gap", biscuits.cells.breakfast.state);
  const grills = b.sections[2].stations[0];
  ok("an evening-only station is closed all morning",
    grills.cells.breakfast.state === "closed" && grills.cells.lunch.state === "closed");
  ok("and open at night", grills.cells.night.state === "gap", grills.cells.night.state);
}

/* ── people land in every window they actually cover ────────────────────── */
{
  const filled = [
    { station: "Primary Point", section: "PRIMARY", id: "1", name: "Yasmin", start: 360, end: 780 },
    { station: "Primary Point", section: "PRIMARY", id: "2", name: "Jessica", start: 780, end: 1200 },
  ];
  const b = boardDay({ stations: STATIONS, filled, dayparts: DPS });
  const pp = b.sections[0].stations[0];
  ok("the opener is on breakfast", pp.cells.breakfast.people.map((p) => p.name).join() === "Yasmin");
  ok("a 6am-1pm shift also shows at lunch, because they are standing there",
    pp.cells.lunch.people.some((p) => p.name === "Yasmin"));
  ok("a handoff inside one window shows BOTH people, in time order",
    pp.cells.lunch.people.map((p) => p.name).join(">") === "Yasmin>Jessica",
    pp.cells.lunch.people.map((p) => p.name).join(">"));
  ok("the closer is alone on mid", pp.cells.mid.people.map((p) => p.name).join() === "Jessica");
  ok("nobody is on a window they left before", !pp.cells.mid.people.some((p) => p.name === "Yasmin"));
}

/* ── partial is the "@6" the setup board already writes ─────────────────── */
{
  const filled = [
    /* Covers breakfast end to end, and only the first slice of lunch. */
    { station: "Primary Point", section: "PRIMARY", id: "1", name: "Yasmin", start: 360, end: 700 },
  ];
  const b = boardDay({ stations: STATIONS, filled, dayparts: DPS });
  const pp = b.sections[0].stations[0];
  ok("somebody covering the whole window is NOT marked partial",
    pp.cells.breakfast.people[0].partial === false, JSON.stringify(pp.cells.breakfast.people[0]));
  ok("somebody who leaves mid-window IS marked partial",
    pp.cells.lunch.people[0].partial === true, JSON.stringify(pp.cells.lunch.people[0]));
  ok("and the window they never reach is a gap, not a quiet blank",
    pp.cells.mid.state === "gap", pp.cells.mid.state);
}

/* ── a span touching a boundary must not bleed into the next window ─────── */
{
  const filled = [{ station: "Primary Point", section: "PRIMARY", id: "1", name: "Edge", start: 360, end: 630 }];
  const b = boardDay({ stations: STATIONS, filled, dayparts: DPS });
  const pp = b.sections[0].stations[0];
  ok("a shift ending exactly at 10:30 is on breakfast", pp.cells.breakfast.people.length === 1);
  ok("and is NOT on lunch", pp.cells.lunch.people.length === 0 && pp.cells.lunch.state === "gap",
    JSON.stringify(pp.cells.lunch));
}

/* ── it makes no scheduling decisions ───────────────────────────────────── */
{
  /* Somebody standing on a station that is not on the board today is simply
     not drawn. Inventing a card for them would be this function deciding
     something, which is the one thing it may never do. */
  const filled = [{ station: "Not A Station Today", section: "PRIMARY", id: "9", name: "Ghost", start: 360, end: 780 }];
  const b = boardDay({ stations: STATIONS, filled, dayparts: DPS });
  const names = JSON.stringify(b.sections);
  ok("a span with no station on today's board draws nothing", !names.includes("Ghost"));
  ok("and does not invent a card", b.sections.reduce((n, s) => n + s.stations.length, 0) === 3);
}

/* ── the guards ─────────────────────────────────────────────────────────── */
{
  const empty = boardDay({});
  ok("no arguments answers an empty board rather than throwing",
    Array.isArray(empty.sections) && empty.sections.length === 0);
  const noSec = boardDay({ stations: [{ name: "Loose", hours: [{ start: 360, end: 1200 }] }], filled: [], dayparts: DPS });
  ok("a station with no section still appears", noSec.sections[0].name === "OTHER" &&
    noSec.sections[0].stations[0].name === "Loose", JSON.stringify(noSec.sections));
}

if (fails.length) {
  console.log(`scheduleBoard: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`scheduleBoard: ${pass} passed`);
