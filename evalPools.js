/**
 * evalPools.js — who may be given an evaluation, and who may be suggested to
 * take one over.
 *
 * Bri, Aug 15 2026 and again Aug 19: "Can we allow Team Leaders to be on the
 * assign list for evaluations BUT I don't want them to be 'recommended' as
 * someone to complete as a replacement — that option needs to be limited to
 * requesting ADs and Directors. So I want to assign to any TL or AD, but the
 * only recommendations for replacements can be ADs or Directors on that list.
 * Ex. If I assign to Thanh and she wants to recommend someone else, she'll only
 * see ADs and Directors listed."
 *
 * ★ LEAF MODULE. Imports nothing.
 *
 * ⚠️⚠️ TWO RULES THAT LOOK LIKE ONE, AND THAT IS EXACTLY WHY THEY ARE HERE.
 * Both lists were `rank >= 4` and both were built inline, in three different
 * places in HRConsole.jsx. Widening "who can be assigned" by editing two of
 * them and missing the third gives a store where a Team Leader can be given an
 * evaluation from one screen and not from another. Widening the wrong one hands
 * a Team Leader the power to recommend, which is the half Bri explicitly does
 * not want.
 *
 * ⚠️ NOT THE SAME QUESTION AS `canAssignEvals`. That one asks who may DO the
 * assigning — Bri and Hannah. These ask who may BE assigned, and who may be put
 * forward instead. Three questions, and the two below are the ones that share a
 * shape.
 */

/* Ranks come from HR_RANK_BY_TITLE in hrRoster.js:
     Team Member 1 · Trainer 2 · Team Leader 3 · Assistant Director 4
     Director 5 · Leadership Development Director 6 · Executive 7 · Owner 8 */

/* ★ WIDENED FROM 4 TO 3 ON Aug 19 2026. A Team Leader may now be handed an
   evaluation to write. */
export const EVAL_ASSIGN_MIN_RANK = 3;

/* ⛔ DELIBERATELY LEFT AT 4. A leader who has been asked to write an evaluation
   may suggest somebody else do it, and that suggestion may only name an
   Assistant Director or above. Raising the line above to match this one, or
   lowering this one to match that, is the mistake this file exists to prevent —
   they are two different rules that happened to share a number. */
export const EVAL_RECOMMEND_MIN_RANK = 4;

const rank = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ⚠️ AN UNREADABLE RANK IS ZERO, never "let them through". An unrecognised
   title already scores 0 through hrRankOfTitle, and that is the safe direction:
   somebody missing from a list gets asked about, somebody wrongly on it does
   not. */
export const mayBeAssignedEval = (r) => rank(r) >= EVAL_ASSIGN_MIN_RANK;
export const mayBeRecommendedEval = (r) => rank(r) >= EVAL_RECOMMEND_MIN_RANK;

/* The lists themselves. `rankOf` is passed in because it lives in HRConsole and
   this file imports nothing; `keep` filters terminated people at the call site,
   because that is not a rank question.
   ⚠️ SORTED BY NAME. Three screens offering the same people in three different
   orders is how somebody picks the wrong row on a list of forty. */
const pool = (people, rankOf, min) =>
  (Array.isArray(people) ? people : [])
    .filter((m) => m && rank(rankOf ? rankOf(m) : m.rank) >= min)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

export const evalAssignPool = (people, rankOf) => pool(people, rankOf, EVAL_ASSIGN_MIN_RANK);
export const evalRecommendPool = (people, rankOf) => pool(people, rankOf, EVAL_RECOMMEND_MIN_RANK);
