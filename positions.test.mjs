/* Every position on the board, as a job role.

   Matt, Aug 13 2026: "i want all positions as job roles as well." And, on why
   the generic list cannot simply be replaced: "I will want other stores to
   adopt this so they will probably need the generic positions and more
   flexibility on the hrs but my store is more specific."

   ⚠️ HALF OF WHAT IS BELOW EXISTS TO PROVE IT ADDS RATHER THAN REPLACES. The
   15 generic codes are what HotSchedules exports and what 313 existing ratings
   are keyed to; losing one silently would unrate a whole team. */
import {
  DEFAULT_CODES, readJobCodes, positionsFromStations, allCodes, sideOf, isLeaderCode, codeIndex,
} from "./jobCodes.js";

let pass = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(`${n}${x ? "  — " + x : ""}`); };

/* Real shapes off this store's config, including the two that catch people:
   a manual-only row (`hours: null`) and a leader row. */
const STATIONS = {
  FOH: {
    Mon: [
      { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }] },
      { id: "reg1", name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 660 }] },
      { id: "leaderDt", name: "LEADER DT", section: "LEADERSHIP", hours: [{ start: 315, end: 1380 }] },
      { id: "trainer", name: "TRAINER", section: "TRAINING", hours: null },
    ],
    Tue: [
      { id: "window", name: "WINDOW", section: "FRONT LINE", hours: [{ start: 360, end: 1380 }] },
      { id: "expo1", name: "EXPO 1", section: "FRONT LINE", hours: [{ start: 660, end: 1200 }] },
    ],
  },
  BOH: {
    Mon: [
      { id: "breader", name: "Breader", section: "BREADING", hours: [{ start: 345, end: 1380 }] },
      { id: "kitchenLead", name: "Kitchen Lead / DT", section: "LEADERSHIP", hours: [{ start: 300, end: 1380 }] },
    ],
  },
};

/* ── derived from the stations, never typed ─────────────────────────────── */
{
  const p = positionsFromStations(STATIONS);
  const codes = p.map((x) => x.code);
  /* 🐛 MY OWN COUNT WAS WRONG, NOT THE CODE. Seven distinct stations in the
     fixture: WINDOW, REGISTER 1, LEADER DT and TRAINER on FOH Mon, EXPO 1 on
     FOH Tue, Breader and Kitchen Lead / DT on BOH Mon. Thirteenth wrong
     assertion today and the code was right every time. */
  ok("every distinct station becomes a role",
    codes.length === 7, JSON.stringify(codes));
  ok("a station on two days appears once",
    codes.filter((c) => c === "WINDOW").length === 1);
  ok("★ names are normalised the same way typed codes are",
    codes.includes("BREADER") && codes.includes("KITCHEN LEAD / DT"), JSON.stringify(codes));
  ok("★ side comes from which list it is in, not from the name",
    p.find((x) => x.code === "BREADER").side === "BOH" &&
    p.find((x) => x.code === "WINDOW").side === "FOH");
  ok("★ a manual-only row is still a position, because people are certified on it",
    codes.includes("TRAINER"), JSON.stringify(codes));
  ok("★ a leader row is marked as one, off its section",
    p.find((x) => x.code === "LEADER DT").leader === true &&
    p.find((x) => x.code === "KITCHEN LEAD / DT").leader === true);
  ok("and an ordinary station is not",
    p.find((x) => x.code === "WINDOW").leader === false &&
    p.find((x) => x.code === "BREADER").leader === false);
  ok("each one says it came from the stations", p.every((x) => x.fromStations === true));
}

/* ── it names no store ──────────────────────────────────────────────────── */
{
  ok("no stations, no positions", positionsFromStations({}).length === 0);
  ok("junk answers empty rather than throwing",
    positionsFromStations(null).length === 0 && positionsFromStations("x").length === 0);
  const other = positionsFromStations({ FOH: { Mon: [{ id: "t1", name: "Till 1", section: "COUNTER", hours: [] }] } });
  ok("★ another store's stations describe that store",
    other.length === 1 && other[0].code === "TILL 1" && other[0].side === "FOH",
    JSON.stringify(other));
  const src = String(positionsFromStations);
  ["WINDOW", "Breader", "Gate City", "04010"].forEach((w) =>
    ok(`no "${w}" in the code`, !src.includes(w)));
}

/* ── ADDS, NEVER REPLACES ───────────────────────────────────────────────── */
{
  const typed = { v: 1, codes: [...DEFAULT_CODES] };
  const all = allCodes(typed, STATIONS);
  const codes = all.codes.map((c) => c.code);

  ok("★ every generic code survives, all fifteen",
    DEFAULT_CODES.every((d) => codes.includes(d.code)),
    DEFAULT_CODES.filter((d) => !codes.includes(d.code)).map((d) => d.code).join(", "));
  ok("★ and they keep their place at the front, so a list does not reshuffle",
    codes.slice(0, DEFAULT_CODES.length).join("|") === DEFAULT_CODES.map((d) => d.code).join("|"));
  ok("the positions are added after", codes.includes("WINDOW") && codes.includes("REGISTER 1"));

  /* ⚠️ THE COLLISION CASE. BREADER is both a generic code and a station here. */
  ok("★ a position that collides with a typed code appears ONCE",
    codes.filter((c) => c === "BREADER").length === 1, String(codes.filter((c) => c === "BREADER").length));
  /* ⚠️ THE FLAG IS NOW `false` RATHER THAN ABSENT, and the assertion had to
     change with it. `readJobCodes` carries `fromStations` through since Aug 14
     2026 so `codeGroups` can tell a STATION that leads (Machines 1,2,3 — DT
     Lead) from a RANK (DT Leader). A typed row is not from the board, so it
     reads false — which is the same fact the absent version carried, stated
     rather than implied. */
  ok("★ and the TYPED row wins, so a human's answer is never overridden",
    all.codes.find((c) => c.code === "BREADER").fromStations === false,
    JSON.stringify(all.codes.find((c) => c.code === "BREADER")));
  ok("★ while a row that really came from the board says so",
    all.codes.find((c) => c.code === "WINDOW").fromStations === true,
    JSON.stringify(all.codes.find((c) => c.code === "WINDOW")));
  ok("TRAINER collides too and is not duplicated",
    codes.filter((c) => c === "TRAINER").length === 1);

  ok("a store with no stations gets exactly its typed list",
    allCodes(typed, {}).codes.length === DEFAULT_CODES.length);
  ok("★ a store with nothing typed still gets its positions, which is the point",
    allCodes(null, STATIONS).codes.length === 7, String(allCodes(null, STATIONS).codes.length));
  ok("nothing at all is an empty list, not a throw", allCodes(null, null).codes.length === 0);
}

/* ── the rest of the file still answers about a derived code ────────────── */
{
  const all = allCodes({ v: 1, codes: [...DEFAULT_CODES] }, STATIONS);
  const ix = codeIndex(all);
  ok("★ sideOf answers for a position, not just a typed code",
    sideOf("WINDOW", ix) === "FOH" && sideOf("KITCHEN LEAD / DT", ix) === "BOH",
    JSON.stringify([sideOf("WINDOW", ix), sideOf("KITCHEN LEAD / DT", ix)]));
  ok("★ isLeaderCode answers for a position",
    isLeaderCode("LEADER DT", ix) === true && isLeaderCode("WINDOW", ix) === false);
  ok("a typed code still answers as it did",
    sideOf("DRIVE THRU", ix) === "FOH" && isLeaderCode("LEADERSHIP", ix) === true);
  ok("readJobCodes still reads the combined list without complaint",
    readJobCodes(all).codes.length === all.codes.length);
}

if (fails.length) {
  console.log(`positions: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`positions: ${pass} passed`);
