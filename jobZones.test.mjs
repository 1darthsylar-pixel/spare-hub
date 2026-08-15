/* ============================================================================
   jobZones.test.mjs — which half of the front a job code counts against.

       node jobZones.test.mjs

   Matt, Aug 14 2026: "for job codes have DT and foh you know where to cut
   exactly", then "its important because the planners says to cut from dt and
   from foh."

   ═══ WHY IT IS A ZONE AND NOT A THIRD SIDE ═══════════════════════════════
   `side` decides which BOARD somebody can be scheduled onto. scheduleEngine
   tests `sideOf(job) !== side` with side being exactly "FOH" or "BOH". Adding
   "DT" to SIDES would make every drive-thru code match neither board, and the
   people holding them would silently stop being schedulable at all — no error,
   no warning, just a thinner week. The assertions in section 1 are the guard on
   that, and they are the most important ones in this file.

   ═══ AND WHY THE TWO WORDS ARE "DT" AND "FC" ═════════════════════════════
   `splitFohHours` already returns `{ dt, fc }`, split on real sales. The
   planner says "you are two hours over on DT"; this field is what lets the job
   code list answer "and here are the codes that are DT". Two vocabularies for
   one split would make the advice unactionable in the moment somebody is
   trying to act on it.
   ============================================================================ */
import { SIDES, ZONES, ZONE_LABEL, readJobCodes, upsertCode, removeCode, codeIndex, zoneOf, sideOf } from "./jobCodes.js";
import { splitFohHours } from "./dayparts.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`); }
};
const group = (n) => console.log(`\n── ${n}`);

group("0. controls");
{
  ok("zoneOf is a function", typeof zoneOf === "function");
  ok(`two zones (${ZONES.join(", ")})`, ZONES.length === 2);
  ok("both are labelled", ZONES.every((z) => !!ZONE_LABEL[z]));
}

group("1. ★★ SIDE IS UNTOUCHED — the engine still sees exactly two boards");
{
  /* If this ever goes red, drive-thru people have stopped being schedulable. */
  ok("★ SIDES is still exactly FOH and BOH", JSON.stringify(SIDES) === '["FOH","BOH"]', JSON.stringify(SIDES));
  ok("★ no zone leaked into SIDES", !SIDES.includes("DT") && !SIDES.includes("FC"));

  const s = upsertCode(null, { code: "DT TRADITIONAL", side: "FOH", zone: "DT" });
  const idx = codeIndex(s);
  ok("★ a DT-zoned code still answers FOH to the engine", sideOf("DT TRADITIONAL", idx) === "FOH");
  ok("and carries its zone alongside", zoneOf("DT TRADITIONAL", idx) === "DT");
}

group("2. ★ THE PLANNER'S OWN TWO BUCKETS, not a second vocabulary");
{
  const split = splitFohHours(100, 0.6);
  ok("splitFohHours really returns dt and fc (control)",
    split && typeof split.dt === "number" && typeof split.fc === "number", JSON.stringify(split));
  ok("★ every zone is a key the planner already produces",
    ZONES.every((z) => Object.prototype.hasOwnProperty.call(split, z.toLowerCase())),
    ZONES.join(",") + " vs " + Object.keys(split).join(","));
}

group("3. ⚠️ DESIGN RULE 1 — every job code stored before today still reads");
{
  const OLD = { v: 1, codes: [
    { code: "DRIVE THRU", side: "FOH", leader: false },
    { code: "BREADER", side: "BOH", leader: false },
    { code: "SHIFT LEAD", side: "FOH", leader: true },
  ] };
  const r = readJobCodes(OLD);
  ok("all three rows survive", r.codes.length === 3, String(r.codes.length));
  ok("★ their zone reads as null, not as a guess", r.codes.every((c) => c.zone === null));
  ok("side survived", r.codes.find((c) => c.code === "BREADER").side === "BOH");
  ok("leader survived", r.codes.find((c) => c.code === "SHIFT LEAD").leader === true);
  ok("★ and the stored object was not mutated", OLD.codes[0].zone === undefined);
}

group("4. ⚠️ NULL IS 'BOTH', AND IT IS A REAL ANSWER");
{
  /* The window and the expo serve both halves. Forcing them into one would have
     a cut suggestion take somebody off a position the other half relies on. */
  const s = upsertCode(upsertCode(null, { code: "WINDOW", side: "FOH" }),
    { code: "EXPO 1", side: "FOH", zone: "" });
  const idx = codeIndex(s);
  ok("★ no zone given → null", zoneOf("WINDOW", idx) === null);
  ok("★ an empty string is not a zone", zoneOf("EXPO 1", idx) === null);
  ok("junk is not a zone", zoneOf("WINDOW", codeIndex(upsertCode(null, { code: "WINDOW", side: "FOH", zone: "MIDDLE" }))) === null);
  ok("★ and an unclassified code is never guessed from its name",
    zoneOf("DT MOBILES", codeIndex({ v: 1, codes: [] })) === null);
}

group("5. ⚠️ A KITCHEN CODE CANNOT HOLD A ZONE");
{
  /* Stored, it would come back out of zoneOf and a cut suggestion would start
     naming a drive thru in the kitchen. */
  const s = upsertCode(null, { code: "BREADER", side: "BOH", zone: "DT" });
  ok("★ the zone is dropped, not stored and ignored", readJobCodes(s).codes[0].zone === null);
  ok("and zoneOf agrees", zoneOf("BREADER", codeIndex(s)) === null);
  ok("the side is intact", sideOf("BREADER", codeIndex(s)) === "BOH");
}

group("6. editing a code keeps or clears its zone deliberately");
{
  let s = upsertCode(null, { code: "REGISTER 1", side: "FOH", zone: "FC" });
  ok("set", zoneOf("REGISTER 1", codeIndex(s)) === "FC");

  /* Moving a front code to the kitchen must take its zone with it. */
  s = upsertCode(s, { code: "REGISTER 1", side: "BOH", zone: "FC" });
  ok("★ moving it to the kitchen clears the zone", zoneOf("REGISTER 1", codeIndex(s)) === null);

  s = upsertCode(s, { code: "REGISTER 1", side: "FOH", zone: "DT" });
  ok("and it can be re-zoned on the way back", zoneOf("REGISTER 1", codeIndex(s)) === "DT");
  s = upsertCode(s, { code: "REGISTER 1", side: "FOH", zone: null });
  ok("★ it can be cleared back to both", zoneOf("REGISTER 1", codeIndex(s)) === null);

  s = removeCode(s, "REGISTER 1");
  ok("removing still works", readJobCodes(s).codes.length === 0);
}

group("7. junk in does not throw");
{
  ok("null store", readJobCodes(null).codes.length === 0);
  ok("no index", zoneOf("ANYTHING", null) === null);
  ok("empty index", zoneOf("ANYTHING", new Map()) === null);
  ok("no code", zoneOf("", codeIndex(null)) === null);
  ok("upsert with no code is a no-op", readJobCodes(upsertCode(null, { side: "FOH", zone: "DT" })).codes.length === 0);
}

if (fails.length) {
  console.log(`\njobZones: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\njobZones: ${pass} passed`);
