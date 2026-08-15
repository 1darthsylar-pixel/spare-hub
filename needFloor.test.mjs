/* ============================================================================
   needFloor.test.mjs — the store's own curve as a floor under the station count.

       node needFloor.test.mjs

   Matt, Aug 14 2026: "i want the auto scheduler to learn from the uploaded
   weekly rosters how to assign shifts without any gaps."

   ═══ WHAT IS BEING PROTECTED ═════════════════════════════════════════════
   The station count says how many positions are POSTED open. It cannot say
   that this store really runs three people at 5am and eleven at 5pm, which
   seven weeks of its own boards do say. `needWithHistory` raises the demand
   curve to whichever of the two is higher, per quarter hour.

   ⚠️⚠️ THE THREE WAYS THIS COULD GO WRONG, and each one has a section:
     1. it LOWERS demand somewhere — a posted station quietly stops being
        staffed, and the hole only shows up on a printed board
     2. it fires on a weekday the history barely knows, so one odd roster
        becomes the plan
     3. it runs away — a grand opening teaches the engine to staff every
        Tuesday like a grand opening

   ⚠️ AND THE FOURTH, WHICH IS THE QUIET ONE: no history at all must build
   EXACTLY as before, byte for byte. A learning feature that changes a store's
   schedule before it has learned anything is worse than one that never ships.
   ============================================================================ */
import { needWithHistory, needCurve, buildDay, DEFAULT_RULES } from "./scheduleEngine.js";
import { SLOTS } from "./rosterLearning.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra ? "  " + extra : ""}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const flat = (n) => new Array(SLOTS).fill(n);
const learned = (curve, weeks = 4) => ({ coverage: curve, weeks });

group("0. controls");
{
  ok("needWithHistory is a function", typeof needWithHistory === "function");
  ok("the grid is 96", SLOTS === 96);
  ok("needCurve really counts stations",
    needCurve([{ name: "A", hours: [{ start: 0, end: 1440 }] }])[0] === 1);
}

group("1. ⚠️⚠️ IT NEVER LOWERS DEMAND — a posted station is always staffed");
{
  /* The station list wants 8 everywhere; the store has only ever run 3. The
     stations must win. This is the assertion that stops the feature quietly
     unstaffing a station the store added last month. */
  const base = flat(8);
  const out = needWithHistory(base, learned(flat(3)));
  ok("★ history lower than the stations changes NOTHING", out.every((n) => n === 8),
    `min ${Math.min(...out)}`);
  ok("★ and not one slot dropped", out.every((n, i) => n >= base[i]));

  /* Mixed: history above in the evening only. */
  const mixed = flat(2).map((n, t) => (t >= 68 ? 5 : n));
  const out2 = needWithHistory(flat(3), learned(mixed));
  ok("morning keeps the station count", out2[0] === 3);
  ok("★ the evening is raised", out2[80] === 5, String(out2[80]));
  ok("★ and nothing anywhere is below the stations", out2.every((n) => n >= 3));
}

group("2. ⚠️ A THIN HISTORY DOES NOT MOVE A DAY");
{
  /* 22 of the saved day-boards were never imported and carry an empty roster.
     One real week is not a pattern. */
  const base = flat(3);
  ok("★ zero weeks changes nothing", needWithHistory(base, learned(flat(9), 0)).every((n) => n === 3));
  ok("★ one week changes nothing", needWithHistory(base, learned(flat(9), 1)).every((n) => n === 3));
  ok("two weeks does apply", needWithHistory(base, learned(flat(5), 2)).some((n) => n > 3));
  ok("the threshold is settable", needWithHistory(base, learned(flat(5), 2), { minWeeks: 3 }).every((n) => n === 3));
}

group("3. ⚠️ IT CANNOT RUN AWAY — the headroom cap");
{
  /* A grand opening staffed 30 people. Two extra is a nudge; thirty is a
     different schedule. */
  const out = needWithHistory(flat(3), learned(flat(30)));
  ok("★ capped at the stations plus 2", out.every((n) => n === 5), `saw ${out[0]}`);
  ok("the cap is settable", needWithHistory(flat(3), learned(flat(30)), { headroom: 4 })[0] === 7);
  ok("a small overshoot is taken in full, not capped",
    needWithHistory(flat(3), learned(flat(4)))[0] === 4);
}

group("4. ⚠️⚠️ NO HISTORY BUILDS EXACTLY AS BEFORE");
{
  const base = flat(4);
  ok("★ null learned", needWithHistory(base, null) === base);
  ok("★ undefined learned", needWithHistory(base, undefined) === base);
  ok("no coverage key", needWithHistory(base, { weeks: 9 }) === base);
  ok("a coverage of the wrong length is refused, not resampled",
    needWithHistory(base, { coverage: [1, 2, 3], weeks: 9 }) === base);
  ok("junk numbers in the curve do not become NaN demand",
    needWithHistory(flat(2), learned(flat(2).map(() => "x"))).every((n) => n === 2));
  ok("a junk base is handed back as an array", Array.isArray(needWithHistory(null, learned(flat(5)))));
}

group("5. ★★ END TO END — the same day, built with and without the lesson");
{
  /* One station open 6am to 2pm. The store's history says it really runs THREE
     people across that window, not one. Six people are available. */
  const stations = [{ name: "REGISTER 1", section: "FRONT COUNTER", hours: [{ start: 360, end: 840 }] }];
  /* ⚠️ `maxShift` IS NOT OPTIONAL ON A HAND-MADE CANDIDATE. `candidatesFor`
     always sets it, so nothing in the engine guards it, and leaving it off makes
     `hardEnd` NaN — every shift then ends at NaN and `hours` reports NaN rather
     than throwing. Cost a red run here. */
  const cands = [1, 2, 3, 4, 5, 6].map((i) => ({
    id: String(i), name: `P${i}`, side: "FOH", skill: 3, lead: 0, job: "DRIVE THRU",
    windows: [{ start: 300, end: 900 }], maxShift: DEFAULT_RULES.maxShift,
  }));

  const plain = buildDay({ stations, candidates: cands, rules: DEFAULT_RULES, state: { weekMin: {} }, used: new Set() });
  ok("a plain build produces shifts", plain.shifts.length > 0, String(plain.shifts.length));

  /* History: three bodies across the same window. */
  const curve = flat(0).map((n, t) => (t >= 24 && t < 56 ? 3 : n));
  const withIt = buildDay({
    stations, candidates: cands, rules: DEFAULT_RULES, state: { weekMin: {} }, used: new Set(),
    learned: learned(curve),
  });
  console.log(`        plain ${plain.hours.toFixed(1)}h · with history ${withIt.hours.toFixed(1)}h`);
  ok("★ the learned day staffs MORE hours", withIt.hours > plain.hours,
    `${plain.hours} vs ${withIt.hours}`);
  ok("★ and the need curve really was raised", Math.max(...withIt.need) > Math.max(...plain.need),
    `${Math.max(...plain.need)} vs ${Math.max(...withIt.need)}`);
  ok("★ nobody is double booked", (() => {
    const byId = new Map();
    withIt.shifts.forEach((s) => {
      const list = byId.get(s.id) || [];
      list.push(s); byId.set(s.id, list);
    });
    return [...byId.values()].every((list) => list
      .sort((a, b) => a.start - b.start)
      .every((s, i, a) => i === 0 || s.start >= a[i - 1].end));
  })());
  ok("no shift runs outside anybody's availability",
    withIt.shifts.every((s) => s.start >= 300 && s.end <= 900));

  /* ⚠️ AND THE SAME DAY WITH A THIN HISTORY MUST MATCH THE PLAIN BUILD EXACTLY.
     This is the guard on "it changes nothing until it has learned something". */
  const thin = buildDay({
    stations, candidates: cands, rules: DEFAULT_RULES, state: { weekMin: {} }, used: new Set(),
    learned: learned(curve, 1),
  });
  ok("★ one week of history builds the identical day",
    thin.hours === plain.hours && thin.shifts.length === plain.shifts.length,
    `${thin.hours}/${thin.shifts.length} vs ${plain.hours}/${plain.shifts.length}`);
}

if (fails.length) {
  console.log(`\nneedFloor: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nneedFloor: ${pass} passed`);
