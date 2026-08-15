/**
 * accessOverrides.js — access that follows the PERSON, not their HR title.
 *
 * ★ WHY THIS EXISTS. Hannah and Bri asked for the same thing five minutes apart
 * on Jul 28 2026:
 *   Hannah — "we only want Kyleeka to see what a team member would see in the
 *             Hub if she ever decides to sign in"
 *   Bri    — "remove Kyleeka from any current permissions as an Ex Director
 *             related to the Leadership Development, the 101 class, Peak
 *             Reachers, and applications… her role will not be changed in HR,
 *             but these permissions should be specific to her."
 *
 * ⚠️ RANK CANNOT EXPRESS THIS, WHICH IS THE WHOLE POINT. Kyleeka is an Executive
 * Director. Every threshold she would have to fall below is one Matt and Hannah
 * also sit above, so no gate number removes her without removing them. And her
 * HR record must not change — she is still an Executive Director until the end
 * of August, and rewriting her title to fix permissions would be a lie in the
 * personnel file to solve an access problem.
 *
 * ★ SO THE OVERRIDE CHANGES WHAT A GATE *SEES*, NOT WHAT HR *STORES*. One
 * function, `effectiveRole(user)`, returns the role the app should judge
 * somebody by. HR Console keeps saying Executive Director; every access check
 * reads Team Member.
 *
 * ⚠️ KEEP THIS FILE DEPENDENCY-FREE. It is imported by feature files that
 * already import each other; anything imported back in here would close a cycle
 * and produce the blank white page that cost a day on Jul 25. Same rule as
 * nameMatch.js, and for the same reason.
 *
 * ⚠️ THIS IS A DENY MECHANISM ONLY. It can lower what someone sees, never raise
 * it — `effectiveRole` returns either the override or the person's real role,
 * and the override values are deliberately restricted to ordinary ones. A file
 * that could grant access by name would be a second, invisible permission system.
 */

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/* name (lowercased) → the role every access check should use instead.
   ⚠️ ADD A PERSON ONLY ON A DIRECTOR'S EXPLICIT INSTRUCTION, and record who
   asked and when. This list silently reduces what a real person can see, so it
   must never be edited casually or to "tidy up". */
/* ── HISTORY, KEPT ON PURPOSE ──────────────────────────────────────────────
   Jul 28 2026 — Kyleeka Gonzalez was added here at Hannah's and Bri's request,
   judged as a Team Member everywhere while her HR record stayed Executive
   Director.
   Jul 29 2026 — REMOVED. Kyleeka asked for it back; Hannah, Bri and Matt agreed
   together and Matt confirmed. She is judged by her real title again.

   ⚠️ THIS IS LEFT WRITTEN DOWN RATHER THAN DELETED because an empty list tells
   the next reader nothing, and the question "was Kyleeka ever restricted, and
   who lifted it?" is exactly the one that gets asked six months later with
   nobody able to answer. A silent permission system is the thing this file was
   built to avoid. */
const OVERRIDES = {
  // Empty. Nobody is currently judged as anything other than their HR title.
  // ⚠️ Adding a name here silently reduces what a real person can see. Do it
  // only on a director's explicit instruction, and record who asked and when,
  // the way the two lines above do.
};

/** The role the app should judge this person by. Never raises access. */
export function effectiveRole(user) {
  if (!user) return null;
  const hit = OVERRIDES[norm(user.name)];
  return hit || user.role || null;
}

/** True when this person is being judged as something other than their title. */
export function hasAccessOverride(user) {
  return !!user && Object.prototype.hasOwnProperty.call(OVERRIDES, norm(user.name));
}

/* A copy of the user with the effective role in place, for the many call sites
   that pass a whole user object into a gate rather than a role string.
   ⚠️ RETURNS A COPY — mutating the stored session would persist the override
   into localStorage, where it would outlive this file and be impossible to
   trace back to a decision. */
export function asEffective(user) {
  if (!user) return user;
  const role = effectiveRole(user);
  return role === user.role ? user : { ...user, role };
}

export default effectiveRole;
