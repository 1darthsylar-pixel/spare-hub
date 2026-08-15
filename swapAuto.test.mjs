/* ============================================================================
   swapAuto.test.mjs — when the Hub may move a person without asking anybody.

       node swapAuto.test.mjs

   Matt, Aug 14 2026: "i want the hub to auto approve shift swaps with rules",
   "also pay attention to the shift swaps for flight risks", and "We will be
   testing shift swaps next week before launching the schedule."

   ═══ WHAT IS BEING PROTECTED ════════════════════════════════════════════════
   Approving a swap is the one tap in this whole product where a leader takes
   somebody off a shift and puts somebody else on it. `checkClaim` already
   refuses to let that happen blind. Auto approval removes the leader entirely,
   so every rule that holds it back has to be tested as a rule that HOLDS, not
   as a rule that exists.

   ⚠️⚠️ THE DEFAULT ANSWER IS NO. `on: false`, and every section below is a
   different way of saying no. Only section 6 says yes, and it says yes to
   exactly one claim.
   ============================================================================ */
import {
  DEFAULT_SWAP_POLICY, readSwapPolicy, autoDecision, dropCount, dropHistory, dropFlag, OFFER,
} from "./shiftMarket.js";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const HOUR = 3600000;
const NOW = 1755180000000;              /* a fixed instant; the clock is an argument here */
const ON = { on: true };

const offer = (over) => ({
  id: "sm_1", weekOf: "2026-08-17", day: "Thursday", iso: "2026-08-20", side: "FOH",
  start: 660, end: 1140, fromPersonId: "7", fromPersonName: "Katia Bostic",
  status: OFFER.OPEN, claims: [{ personId: "9", personName: "Marco Diaz" }], ...over,
});

const clean = (over) => ({
  claimerId: "9", claimerName: "Marco Diaz", ok: true, blockers: [], notes: [],
  rated: 3, hoursBefore: 18, hoursAfter: 26, overtime: false, score: 1, ...over,
});

const market = (offers) => ({ v: 1, offers });

group("0. controls");
{
  ok("★ it ships OFF", DEFAULT_SWAP_POLICY.on === false);
  ok("the notice rule has a number", DEFAULT_SWAP_POLICY.minNoticeHours > 0);
  ok("the drop cap has a number", DEFAULT_SWAP_POLICY.maxDropsPerWeek > 0);
  ok("readSwapPolicy defaults a junk record rather than throwing",
    readSwapPolicy(null).minNoticeHours === DEFAULT_SWAP_POLICY.minNoticeHours);
  ok("★ 'on' must be the literal true, not truthy",
    readSwapPolicy({ on: 1 }).on === false && readSwapPolicy({ on: "yes" }).on === false);
  ok("a negative number is refused, not stored",
    readSwapPolicy({ minNoticeHours: -5 }).minNoticeHours === DEFAULT_SWAP_POLICY.minNoticeHours);
  ok("zero IS allowed, because a store may mean it",
    readSwapPolicy({ minNoticeHours: 0 }).minNoticeHours === 0);
}

group("1. ⚠️⚠️ OFF MEANS OFF");
{
  const d = autoDecision({
    offer: offer(), ranked: [clean()], policy: {}, market: market([offer()]),
    nowMs: NOW, startsAtMs: NOW + 100 * HOUR,
  });
  ok("★ a perfect claim is still not approved when the switch is off", d.approve === null);
  ok("and it says why in words", /off/i.test(d.why), d.why);
  ok("★ no policy at all is the same as off",
    autoDecision({ offer: offer(), ranked: [clean()], nowMs: NOW, startsAtMs: NOW + 100 * HOUR }).approve === null);
}

group("2. ⚠️ NOTHING TO DECIDE");
{
  const base = { policy: ON, market: market([]), nowMs: NOW, startsAtMs: NOW + 100 * HOUR };
  ok("no claims, no approval",
    autoDecision({ ...base, offer: offer({ claims: [] }), ranked: [] }).approve === null);
  ok("★ an already approved offer is not approved again",
    autoDecision({ ...base, offer: offer({ status: OFFER.APPROVED }), ranked: [clean()] }).approve === null);
  ok("a withdrawn offer is left alone",
    autoDecision({ ...base, offer: offer({ status: OFFER.WITHDRAWN }), ranked: [clean()] }).approve === null);
  ok("a missing offer is not a crash",
    autoDecision({ ...base, offer: null, ranked: [clean()] }).approve === null);
}

group("3. ⚠️⚠️ NOT ENOUGH NOTICE — the shift a leader should see");
{
  const base = { offer: offer(), ranked: [clean()], policy: ON, market: market([offer()]), nowMs: NOW };
  ok("★ four hours out is a leader's call",
    autoDecision({ ...base, startsAtMs: NOW + 4 * HOUR }).approve === null);
  ok("the reason names the rule",
    /12 hour rule/.test(autoDecision({ ...base, startsAtMs: NOW + 4 * HOUR }).why),
    autoDecision({ ...base, startsAtMs: NOW + 4 * HOUR }).why);
  ok("★★ a shift that already started is never auto approved",
    autoDecision({ ...base, startsAtMs: NOW - HOUR }).approve === null);
  ok("and it says so rather than quoting hours",
    /already started/.test(autoDecision({ ...base, startsAtMs: NOW - HOUR }).why));
  ok("★ AN UNKNOWN START TIME IS A REASON FOR A HUMAN, NOT A REASON TO SKIP THE RULE",
    autoDecision({ ...base, startsAtMs: undefined }).approve === null);
  ok("a junk clock is refused too",
    autoDecision({ ...base, startsAtMs: NaN }).approve === null &&
    autoDecision({ ...base, startsAtMs: NOW + 100 * HOUR, nowMs: null }).approve === null);
  ok("thirteen hours out clears it",
    autoDecision({ ...base, startsAtMs: NOW + 13 * HOUR }).approve !== null);
  ok("★ the store can set its own number",
    autoDecision({ ...base, policy: { on: true, minNoticeHours: 2 }, startsAtMs: NOW + 4 * HOUR }).approve !== null);
}

group("4. ⚠️⚠️ THE FLIGHT RISK RULE — somebody handing off a third shift meets a human");
{
  const mine = (n) => market(new Array(n).fill(0).map((_, i) => offer({ id: `sm_${i}` })));
  ok("counting is per person", dropCount(mine(3), "7") === 3 && dropCount(mine(3), "99") === 0);
  ok("★ and per week", dropCount(mine(3), "7", "2026-08-17") === 3 && dropCount(mine(3), "7", "2026-08-24") === 0);
  ok("★ a WITHDRAWN offer still counts — they still did not want the shift",
    dropCount(market([offer({ status: OFFER.WITHDRAWN })]), "7") === 1);

  const base = { offer: offer(), ranked: [clean()], policy: ON, nowMs: NOW, startsAtMs: NOW + 100 * HOUR };
  ok("two drops is inside the cap", autoDecision({ ...base, market: mine(2) }).approve !== null);
  ok("★★ three drops in a week stops the machine", autoDecision({ ...base, market: mine(3) }).approve === null);
  ok("and the reason names the person and the count",
    /Katia Bostic has given up 3/.test(autoDecision({ ...base, market: mine(3) }).why),
    autoDecision({ ...base, market: mine(3) }).why);
  ok("★ the store can set its own cap",
    autoDecision({ ...base, market: mine(3), policy: { on: true, maxDropsPerWeek: 5 } }).approve !== null);
}

group("5. ⚠️ A NOTE IS A DECISION SOMEBODY SHOULD MAKE");
{
  const base = { offer: offer(), policy: ON, market: market([offer()]), nowMs: NOW, startsAtMs: NOW + 100 * HOUR };
  ok("★ a blocker is never auto approved",
    autoDecision({ ...base, ranked: [clean({ ok: false, blockers: ["Not trained on FOH"] })] }).approve === null);
  ok("★★ OVERTIME IS A NOTE AND IT STOPS THE MACHINE",
    autoDecision({ ...base, ranked: [clean({ notes: ["Takes them to 43.0 hours, over 40"] })] }).approve === null);
  ok("the leader is told which note",
    /43.0 hours/.test(autoDecision({ ...base, ranked: [clean({ notes: ["Takes them to 43.0 hours, over 40"] })] }).why));
  ok("★ the minors list stops it",
    autoDecision({ ...base, ranked: [clean({ notes: ["On the minors list"] })] }).approve === null);
  ok("★★ A CLEAN CLAIM SITTING BEHIND A BLOCKED ONE IS NOT PROMOTED — the rank is the answer",
    autoDecision({ ...base, ranked: [clean({ ok: false, blockers: ["x"] }), clean({ claimerId: "12" })] }).approve === null);
}

group("6. ★★ THE ONE CASE THAT SAYS YES");
{
  const d = autoDecision({
    offer: offer(), ranked: [clean()], policy: ON, market: market([offer()]),
    nowMs: NOW, startsAtMs: NOW + 100 * HOUR,
  });
  ok("★ approved", d.approve !== null);
  ok("★ and it is the ranked winner, not a re-decision", d.approve.claimerId === "9");
  ok("the line a leader reads names them", /Marco Diaz takes it/.test(d.why), d.why);

  const two = autoDecision({
    offer: offer(), ranked: [clean(), clean({ claimerId: "12", claimerName: "Ella Valles" })],
    policy: ON, market: market([offer()]), nowMs: NOW, startsAtMs: NOW + 100 * HOUR,
  });
  ok("★ two clean claims still resolves to the top of the rank", two.approve.claimerId === "9");
  ok("and it says somebody else wanted it", /ahead of 1 other/.test(two.why), two.why);
}

group("7. ★ WHAT A LEADER SEES ABOUT SOMEBODY WHO KEEPS DROPPING");
{
  const spread = market([
    offer({ id: "a", weekOf: "2026-08-17" }), offer({ id: "b", weekOf: "2026-08-17" }),
    offer({ id: "c", weekOf: "2026-08-17" }), offer({ id: "d", weekOf: "2026-08-10" }),
    offer({ id: "e", weekOf: "2026-08-03" }),
  ]);
  const h = dropHistory(spread, "7");
  ok("the total is every week", h.total === 5, h.total);
  ok("★ most recent week first", h.weeks[0].weekOf === "2026-08-17" && h.weeks[0].count === 3, h.weeks);
  ok("★★ weeks with none are ABSENT — three in three weeks must not read like three in twelve",
    h.weeks.length === 3, h.weeks.length);

  ok("★★ TWO IS NOT A PATTERN AND RAISES NOTHING",
    dropFlag(market([offer({ id: "a" }), offer({ id: "b" })]), "7", "2026-08-17", ON) === "");
  const flag = dropFlag(spread, "7", "2026-08-17", ON);
  ok("★ past the cap it says the week and the spread", /3 shifts given up this week/.test(flag), flag);
  ok("and the longer pattern is in the same line", /5 across 3 weeks/.test(flag), flag);
  ok("★ somebody with no drops at all raises nothing", dropFlag(spread, "99", "2026-08-17", ON) === "");
  ok("★ the flag does NOT need auto approve switched on — a leader still wants to know",
    dropFlag(spread, "7", "2026-08-17", {}) !== "");
}

if (fails.length) {
  console.log(`\nswapAuto: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`\nswapAuto: ${pass} passed`);
