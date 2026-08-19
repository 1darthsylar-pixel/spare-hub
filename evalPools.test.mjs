/* ============================================================================
   evalPools.test.mjs — Team Leaders can be given an evaluation. They cannot
   hand one on.

       node evalPools.test.mjs

   ⛔ WHY. Bri, Aug 15 2026 and again Aug 19: "Can we allow Team Leaders to be
   on the assign list for evaluations BUT I don't want them to be 'recommended'
   as someone to complete as a replacement — that option needs to be limited to
   requesting ADs and Directors."

   ⚠️⚠️ TWO RULES THAT LOOKED LIKE ONE. Both lists were `rank >= 4`, built
   inline, in THREE places in HRConsole.jsx. Widening two and missing the third
   gives a store where a Team Leader can be handed an evaluation on one screen
   and not on another; widening the wrong one hands them the power Bri
   explicitly withheld. That is what this file is for.
   ============================================================================ */
import {
  EVAL_ASSIGN_MIN_RANK, EVAL_RECOMMEND_MIN_RANK,
  mayBeAssignedEval, mayBeRecommendedEval, evalAssignPool, evalRecommendPool,
} from "./evalPools.js";
import { HR_RANK_BY_TITLE } from "./hrRoster.js";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const rankOf = (m) => HR_RANK_BY_TITLE[m.role] || 0;
const TEAM = [
  { id: "1", name: "Zoe Team", role: "Team Member" },
  { id: "2", name: "Yuri Trainer", role: "Trainer" },
  { id: "3", name: "Xan Senior", role: "Senior Trainer" },
  { id: "4", name: "Wren Leader", role: "Team Leader" },
  { id: "5", name: "Vic Assistant", role: "Assistant Director" },
  { id: "6", name: "Uma Director", role: "Director" },
  { id: "7", name: "Tara Exec", role: "Executive Director" },
];

group("0. controls — the ladder this rests on has not moved");
{
  ok("★ Team Leader is 3", HR_RANK_BY_TITLE["Team Leader"] === 3);
  ok("★ Assistant Director is 4", HR_RANK_BY_TITLE["Assistant Director"] === 4);
  ok("★ Director is 5", HR_RANK_BY_TITLE.Director === 5);
  ok("Trainer is 2, below both lines", HR_RANK_BY_TITLE.Trainer === 2);
  ok("the fixture spans both sides of the line (control)",
    TEAM.some((m) => rankOf(m) < 3) && TEAM.some((m) => rankOf(m) === 3) && TEAM.some((m) => rankOf(m) >= 4));
}

group("1. the two lines are different, and that is the whole point");
{
  ok("★★★ ASSIGN STARTS AT TEAM LEADER", EVAL_ASSIGN_MIN_RANK === 3, EVAL_ASSIGN_MIN_RANK);
  ok("★★★ RECOMMEND STARTS AT ASSISTANT DIRECTOR", EVAL_RECOMMEND_MIN_RANK === 4, EVAL_RECOMMEND_MIN_RANK);
  ok("★★★ AND THEY ARE NOT THE SAME NUMBER — collapsing them is the bug",
    EVAL_ASSIGN_MIN_RANK !== EVAL_RECOMMEND_MIN_RANK);
  ok("★★ recommend is the stricter of the two", EVAL_RECOMMEND_MIN_RANK > EVAL_ASSIGN_MIN_RANK);
}

group("2. a Team Leader — the person this change is about");
{
  ok("★★★ MAY BE GIVEN AN EVALUATION", mayBeAssignedEval(3) === true);
  ok("★★★ MAY NOT BE RECOMMENDED TO TAKE ONE OVER", mayBeRecommendedEval(3) === false);
  ok("a Senior Trainer is rank 3 too, so the same both ways",
    mayBeAssignedEval(HR_RANK_BY_TITLE["Senior Trainer"]) === true
    && mayBeRecommendedEval(HR_RANK_BY_TITLE["Senior Trainer"]) === false);
}

group("3. everybody else");
{
  const table = [
    ["Team Member", false, false], ["Trainer", false, false],
    ["Team Leader", true, false], ["Senior Team Leader", true, false],
    ["Assistant Director", true, true], ["Manager", true, true],
    ["Director", true, true], ["Leadership Development Director", true, true],
    ["Executive Director", true, true], ["Owner", true, true],
  ];
  table.forEach(([title, assign, rec]) => {
    const r = HR_RANK_BY_TITLE[title];
    ok(`${title} — assign ${assign ? "yes" : "no"}, recommend ${rec ? "yes" : "no"}`,
      mayBeAssignedEval(r) === assign && mayBeRecommendedEval(r) === rec,
      { rank: r, assign: mayBeAssignedEval(r), rec: mayBeRecommendedEval(r) });
  });
}

group("4. an unknown title is nobody, never everybody");
{
  ok("★★ an unrecognised title is out of both lists",
    mayBeAssignedEval(HR_RANK_BY_TITLE["Shift Wizard"]) === false
    && mayBeRecommendedEval(HR_RANK_BY_TITLE["Shift Wizard"]) === false);
  ok("undefined is out", !mayBeAssignedEval(undefined) && !mayBeRecommendedEval(undefined));
  ok("null is out", !mayBeAssignedEval(null) && !mayBeRecommendedEval(null));
  ok("a string is out", !mayBeAssignedEval("Director") && !mayBeRecommendedEval("Director"));
  ok("NaN is out", !mayBeAssignedEval(NaN));
  /* ⚠️ THE SAFE DIRECTION. Somebody missing from a list gets asked about;
     somebody wrongly on it does not. */
  ok("★ a numeric string still reads", mayBeAssignedEval("3") === true);
}

group("5. the lists themselves");
{
  const assign = evalAssignPool(TEAM, rankOf).map((m) => m.name);
  const rec = evalRecommendPool(TEAM, rankOf).map((m) => m.name);
  ok("★★★ the assign list holds the Team Leader", assign.includes("Wren Leader"), assign);
  ok("★★★ the recommend list does NOT", !rec.includes("Wren Leader"), rec);
  ok("★★ both hold the Assistant Director and above",
    ["Vic Assistant", "Uma Director", "Tara Exec"].every((n) => assign.includes(n) && rec.includes(n)));
  ok("★★ neither holds a Team Member or a Trainer",
    !assign.includes("Zoe Team") && !assign.includes("Yuri Trainer")
    && !rec.includes("Zoe Team") && !rec.includes("Yuri Trainer"));
  ok("★ recommend is a strict subset of assign",
    rec.every((n) => assign.includes(n)) && rec.length < assign.length, { assign: assign.length, rec: rec.length });
  /* ⚠️ SORTED. Three screens offering the same people in three different orders
     is how somebody picks the wrong row on a list of forty. */
  ok("★★ sorted by name", assign.join("|") === [...assign].sort().join("|"), assign);
  ok("a null person is skipped, not crashed", evalAssignPool([null, ...TEAM], rankOf).length === assign.length);
  ok("no list is an empty list", evalAssignPool(null, rankOf).length === 0 && evalRecommendPool(undefined, rankOf).length === 0);
  ok("not an array is an empty list", evalAssignPool("everyone", rankOf).length === 0);
  ok("★ it can read a rank off the row when no rankOf is given",
    evalAssignPool([{ id: "9", name: "Ann", rank: 5 }]).length === 1);
}

group("6. HR Console really uses both, in all three places");
{
  const H = readFileSync(new URL("./HRConsole.jsx", import.meta.url), "utf8");
  ok("HRConsole.jsx was read (control)", H.length > 200000, String(H.length));
  ok("★★ it imports both pools", /import \{ evalAssignPool, evalRecommendPool \} from "\.\/evalPools\.js"/.test(H));
  /* ⚠️⚠️ THE COUNT IS THE ASSERTION. Two assign sites and one recommend site —
     the third inline copy is exactly what would be missed by hand. */
  ok("★★★ the assign list is used at BOTH assigning screens",
    (H.match(/evalAssignPool\(team, rankOf\)/g) || []).length === 2,
    (H.match(/evalAssignPool\(/g) || []).length);
  ok("★★★ the recommend list is used at the recommendation screen",
    (H.match(/evalRecommendPool\(/g) || []).length === 1);
  ok("★★★ AND NO INLINE `rank >= 4` SURVIVES to disagree with either of them",
    !/rankOf\(m\) >= 4/.test(H) && !/rankOf\(x\) >= 4/.test(H));
  /* Not the same question, and it must not be swept up by the rule above. */
  ok("★ `canAssignEvals` is untouched — who may DO the assigning is a third question",
    /const canAssignEvals = \(u\) => rankOf\(u\) >= EVAL_ASSIGN_MIN;/.test(H));
}

console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  · " + f)); process.exit(1); }
