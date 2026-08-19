/**
 * nameMatch.js — one place for "is this the same person".
 *
 * ★ WHY THIS FILE EXISTS, AND IT IS NOT TIDINESS.
 * These rules lived in ProfessionalGrowth.jsx, and HRConsole imported them from
 * there. That made HRConsole → ProfessionalGrowth. Leadership101 already imports
 * loadHRTeam from HRConsole, so the moment ProfessionalGrowth needed to open the
 * class — which is Bri's Step 3 ask — the graph closed:
 *
 *     ProfessionalGrowth → Leadership101 → HRConsole → ProfessionalGrowth
 *
 * A cycle like that doesn't fail loudly. It surfaces as "Cannot access 'X'
 * before initialization" and a blank white page, which cost most of a day on
 * Jul 25. Pulling the shared rules DOWN into a leaf module every feature can
 * import breaks it permanently: nothing here imports anything.
 *
 * ⚠️ KEEP THIS FILE DEPENDENCY-FREE. The moment it imports a feature file, the
 * cycle it exists to prevent comes straight back.
 *
 * ⚠️ MATCHING HERE IS DELIBERATELY STRICT. It decides who sees a confidential
 * recommendation. Showing one to the wrong person is far worse than showing
 * none, so ambiguity always resolves to NO MATCH, never to a guess.
 */

export const normName = (s) =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

export const nameParts = (s) =>
  String(s || "").trim().split(/\s+/).filter(Boolean);


/** One surname token against another, tolerating an initial on either side.
 *  "S" and "S." match "Smith". "Smith" does not match "Sanchez". */
const surnameTokenMatches = (a, b) => {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length === 1) return y.startsWith(x);
  if (y.length === 1) return x.startsWith(y);
  return false;
};

const initialOf = (part) => normName(String(part || "").charAt(0));

/**
 * Two names for the same person? THE PERMISSIVE RULE.
 * First names must match; if BOTH carry a last initial that must match too.
 * "Jose Arias" matches "Jose Arias Cortez", and "Lizy G" matches "Lizy
 * Gonzalez" — one person written two ways is the common case here.
 *
 * ⚠️ THIS RULE CANNOT SEPARATE THE TWO LIZBETHS, AND THAT IS NOW WRITTEN DOWN
 * RATHER THAN DENIED (Aug 9 2026 sweep, finding 7). The comment that used to
 * sit here claimed it kept "Lizbeth Gonzalez (Team Leader) separate from
 * Lizbeth (AD)". It never did: both second tokens are
 * "Gonzalez", so it returns TRUE in both directions. I ran it. An assertion of
 * safety is what stopped anyone looking.
 *
 * ⚠️ USE THIS ONLY WHERE A WRONG MATCH IS NOISE. Two callers depend on exactly
 * this looseness and are right to: the push-reachability job (worker.js), where
 * a false negative tells Bri to chase somebody who already subscribed, and the
 * DailySetup board reconciliation, where the board writes a first name plus an
 * initial and the roster holds the full legal name. Both handle the Lizbeth
 * collision a better way — by roster id, which nicknames cannot confuse.
 *
 * ⚠️ FOR ANYTHING THAT DECIDES WHO SEES WHAT, USE sameLeaderStrict BELOW.
 */
export function sameLeader(dirName, viewerName) {
  const d = nameParts(dirName), v = nameParts(viewerName);
  if (!d.length || !v.length) return false;
  if (normName(d[0]) !== normName(v[0])) return false;
  const di = d[1] ? initialOf(d[1]) : null;
  const vi = v[1] ? initialOf(v[1]) : null;
  if (di && vi) return di === vi;
  return true;
}

/**
 * Two names for the same person? THE STRICT RULE, for identity.
 *
 * Same as above for the first name, and if either side is first-name-only that
 * still suffices — dropping that would orphan every older first-name record.
 * Otherwise EVERY surname token must match position by position AND the counts
 * must be equal, so "Lizbeth Gonzalez" and "Lizbeth" are two
 * people. A lone initial still matches the word it abbreviates, so "Hannah S"
 * finds "Hannah Smith".
 *
 * ⚠️ WHY THIS EXISTS AS A SECOND FUNCTION RATHER THAN A FIX TO THE FIRST.
 * The permissive rule has callers that genuinely want it, and tightening it
 * under them turned a security fix into a board regression — caught by reading
 * worker.js:4632, which documents "Jose Arias" matching "Jose Arias Cortez" as
 * the behaviour it needs. The two callers want opposite things because their
 * failure modes are opposite: there, a wrong match is a nuisance report; here,
 * a wrong match hands a confidential recommendation to the wrong leader.
 *
 * ⚠️ THE COUNT TEST CANNOT BE FREE IN PRINCIPLE, SO IT WAS MEASURED.
 * "Tashiana" versus "Tashiana" is one person written two
 * ways and is the SAME SHAPE as the two Lizbeths; no string rule gets both
 * right. Across all 106 roster names there is EXACTLY ONE pair where one name
 * is a prefix of another, and it is the two Lizbeths. Tashiana and Jose are
 * board- and Slack-versus-HR spellings, and neither reaches this function.
 * If a future hire creates a second pair, this file's standing policy decides
 * it: ambiguity resolves to NO MATCH, never to a guess.
 */
export function sameLeaderStrict(dirName, viewerName) {
  const d = nameParts(dirName), v = nameParts(viewerName);
  if (!d.length || !v.length) return false;
  if (normName(d[0]) !== normName(v[0])) return false;
  const ds = d.slice(1), vs = v.slice(1);
  if (!ds.length || !vs.length) return true;      // one side is first-name-only
  if (ds.length !== vs.length) return false;      // "Gonzalez" vs "Gonzalez Ramos"
  return ds.every((t, i) => surnameTokenMatches(t, vs[i]));
}

/**
 * The one person on the roster who answers to this name, or null.
 *
 * ★ TWO TIERS, STRICT FIRST. Matt, Aug 9 2026: "We have alot of Hispanic
 * workers and this is very common." Spanish names carry two surnames — a
 * paternal then a maternal — so "Lizbeth" written as "Lizbeth
 * Gonzalez" is the ORDINARY case here, not an edge case. A rule that refuses
 * every short form would quietly hide real recommendation requests from a
 * large part of this store, and nobody would report it for weeks.
 *
 * ⚠️ ONLY THE ROSTER KNOWS WHICH IT IS. "Jose Arias" is one person written
 * short. "Lizbeth Gonzalez" is a different person from "Lizbeth Gonzalez
 * Ramos". The two strings are the same shape, so no string rule can tell them
 * apart — which is why this takes the roster and counts, instead of guessing.
 * Exact-shape match first; only if that finds nobody do we allow the short
 * form; and either way, two candidates mean NO answer.
 */
function uniqueLeader(name, leaders) {
  if (!name || !Array.isArray(leaders)) return null;
  const strict = leaders.filter((l) => l && sameLeaderStrict(l.name, name));
  if (strict.length === 1) return strict[0];
  if (strict.length > 1) return null;
  const loose = leaders.filter((l) => l && sameLeader(l.name, name));
  return loose.length === 1 ? loose[0] : null;
}

/* ═══ ONE PERSON, TWO ID SHAPES ═════════════════════════════════════════════
   🐛🐛 THE THIRD LAYER OF THE SAME FAILURE IN ONE DAY (Aug 10 2026).

   The HR roster calls somebody `tm27`. Team Directory carries their `hrId` as
   `27`, because that is what enrichWithHR writes. A recommendation request
   freezes the DIRECTORY id, and the browser session stores the ROSTER id. So
   every `String(rec.leaderId) === String(viewer.id)` below compared "27" with
   "tm27" and answered false — for every request written since ids were
   introduced on Jul 24.

   What that cost, measured against the live data rather than guessed: a leader
   asked for a recommendation saw nothing in their inbox, nothing on the alert
   badge, and nothing in HR Console. The morning's fix made the Slack message
   send; it did not make the task findable once they opened the app. Two
   separate bugs, one symptom, and the first one hid the second.

   ⚠️ THE WORKER ALREADY KNEW. worker.js has carried `bareId` since the
   directory join was written, with a comment naming this exact mismatch. Four
   copies of the same prefix-stripper exist across the repo. This is the fifth
   place that needs it and the LAST one that should define it — anything in the
   browser that compares two ids imports this.

   ⚠️ NORMALISED AT THE COMPARISON, NOT AT THE SOURCE. Making sign-in store the
   short id would be one change instead of several, and would break every other
   place that compares against a full roster id — a set I could not enumerate
   with confidence. Normalising here can only ever make a broken match work; it
   cannot break a working one.

   ⚠️ CHECKED FOR COLLISIONS BEFORE TRUSTING IT: every id in the live roster and
   the added-people list was run through this and no two people collapse onto
   the same value. Added people carry `n_<stamp>_<n>` ids, which have no prefix
   to strip and are unaffected.

   ⚠️ STILL FAILS CLOSED. A blank or missing id on either side matches nobody,
   exactly as before. */
export const bareId = (v) => String(v == null ? "" : v).trim().toLowerCase().replace(/^tm/, "");
export const sameId = (a, b) => {
  const x = bareId(a), y = bareId(b);
  return x !== "" && x === y;
};

/**
 * Does this recommendation request belong to this viewer?
 * ID first — a request written since Jul 24 carries `leaderId`, so a rename can
 * never orphan it.
 *
 * ★ PASS `leaders` WHEREVER YOU HAVE IT. With the roster in hand this refuses
 * only on a REAL collision — two people who both answer to the frozen name —
 * instead of refusing every two-surname short form. Without it the old
 * permissive rule still applies, so no caller breaks by not passing it, but
 * anything that decides who OPENS a recommendation should pass it.
 *
 * 🐛 WHAT THIS CLOSES (Aug 9 2026 sweep, finding 7): both Lizbeths index under
 * the same HR keys, so enrichWithHR resolves NEITHER and every spelling yields
 * a null id — meaning the name rule was the only rule in play. An applicant
 * asked one Lizbeth for a letter and BOTH saw it, and ProfessionalGrowth marks
 * every matching rec completed with whoever opened it. The wrong leader wrote
 * and closed a confidential recommendation and the intended one never saw it.
 */
export function recMatches(rec, viewer, leaders) {
  if (!rec || !viewer) return false;
  if (rec.leaderId != null && String(rec.leaderId) !== "" && viewer.id != null) {
    return sameId(rec.leaderId, viewer.id);
  }
  if (Array.isArray(leaders) && leaders.length) {
    const who = uniqueLeader(rec.leaderName, leaders);
    if (!who) return false;                       // nobody, or two — never a guess
    if (who.hrId != null && String(who.hrId) !== "" && viewer.id != null) {
      return sameId(who.hrId, viewer.id);
    }
    return sameLeader(who.name, viewer.name);
  }
  return sameLeader(rec.leaderName, viewer.name);
}

/**
 * Slack user id for a roster name.
 * `idByName` is keyed on Slack's version of a name; the roster has its own —
 * Slack says "Tashiana", HR says "Tashiana". Exact first,
 * then the looser first+initial forms, and NULL rather than a guess when two
 * people could answer to the same key.
 */
export function slackIdForLeader(dirName, idByName) {
  if (!idByName) return null;
  const parts = nameParts(dirName);
  const first = parts.length ? normName(parts[0]) : "";
  if (!first) return null;
  if (idByName[first]) return idByName[first];
  const init = parts[1] ? normName(String(parts[1]).charAt(0)) : null;
  const hits = Object.keys(idByName).filter((k) => {
    if (!k.startsWith(first)) return false;
    const rest = k.slice(first.length);
    if (!rest) return true;
    return init ? rest.charAt(0) === init : true;
  });
  return hits.length === 1 ? idByName[hits[0]] : null;
}

/**
 * The retroactive half of the id fix: stamp an id onto records that carry only
 * a frozen name. Deliberately conservative — an existing id is never touched,
 * and a name is stamped ONLY when it resolves to exactly one directory leader
 * who has an hrId. Ambiguous or unresolved stays on the name rule.
 */
export function resolveLeaderId(frozenName, leaders) {
  if (!frozenName || !Array.isArray(leaders)) return null;
  const withIds = leaders.filter((l) => l && l.hrId != null && String(l.hrId) !== "");
  const hit = uniqueLeader(frozenName, withIds);
  return hit ? String(hit.hrId) : null;
}

/** Pure: a new array plus how many were stamped. Never mutates its input. */
export function stampRecIds(recs, leaders) {
  if (!Array.isArray(recs)) return { recs: [], changed: 0 };
  let changed = 0;
  const out = recs.map((r) => {
    if (!r || (r.leaderId != null && String(r.leaderId) !== "")) return r;
    const id = resolveLeaderId(r.leaderName, leaders);
    if (!id) return r;
    changed += 1;
    return { ...r, leaderId: id };
  });
  return { recs: out, changed };
}
