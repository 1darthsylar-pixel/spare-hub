/* ══════════════════════════════════════════════════════════════════════════
   adminRoles.js — WHICH JOB TITLES MAY ADMINISTER WHICH FAMILY OF TOOLS.

   ★ LEAF. Imports nothing, and must stay that way.

   ═══ WHY THIS EXISTS ══════════════════════════════════════════════════════
   Matt, Aug 7 2026, after adding "director" to four tiles by hand: "if we add
   another director someday i want the long term fix."

   ⚠️ THE THING HE WAS WORRIED ABOUT ALREADY WORKED. Promoting somebody to
   Director needs NO code change — every gate reads their HR title, so a new
   Director is admitted the moment HR says they are one. What needed fixing was
   the LIST, not the person.

   The audit found twelve gates spelling out a role list by hand, in five
   different combinations. Four of those combinations were one list copied
   verbatim into four files. Adding a role meant finding all of them, and
   missing one is silent — the tile simply refuses somebody who should be in,
   and nothing anywhere says why.

   That drift is not hypothetical. It happened the same afternoon: "director"
   was added to four tiles, and Team Directory + Professional Growth — which had
   held a byte-identical list that morning — were left behind by the scope of
   the request. Two lists that meant the same thing at breakfast meant different
   things by dinner.

   ═══ WHAT IS SHARED AND WHAT IS DELIBERATELY NOT ══════════════════════════
   Only the lists that were ALREADY identical are shared. Nothing here merges
   two gates that disagreed, because a gate that disagrees usually disagrees for
   a reason somebody had and nobody wrote down.

   Three gates keep their own list ON PURPOSE and say so where they live:
     ProfessionalGrowth  narrower — Matt, Aug 7: "not PG". It holds people's
                         promotion applications, so a plain Director is out.
     LeadershipDevTile   wider — carries `director` AND `leadership director`.
     UniformOrder        four roles only.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠️ THESE ARE PLAIN LOWERCASED ARRAYS, NOT Sets AND NOT MATCHER FUNCTIONS.
   Each tile builds its own `new Set(...)` from one of these and keeps the
   normaliser it already had — `norm`, `normRole` and `effectiveRole` are NOT
   the same function in every file, and one of them maps titles rather than just
   lowercasing. Exporting a matcher would have quietly replaced those, so every
   call site here stays byte-for-byte what it was and only the declaration
   moved. A shared Set would also be one mutable object sitting behind nine
   permission gates. */

/* ★ THE TEAM TOOLS: Member Vote, Team Goals, Goal Submissions, Team Resources,
   Team Directory. "Can this person administer the things the team sees?"
   `director` was added Aug 7 2026 on Matt's direct answer — "should a plain
   Director be able to administer those four yes" — and Team Directory joined
   the same day so the two lists could not drift apart again.
   ⚠️ "assistant director" IS NOT HERE and was never part of that question. */
export const TEAM_TOOL_ADMIN_ROLES = Object.freeze([
  "owner",
  "owner/operator",
  "executive director",
  "executive director | hr",
  "human resources",
  "leadership development director",
  "director",
]);

/* ★ THE TRAINING AND LEADERSHIP TOOLS: L101 Editor, Leadership Dev,
   Leadership 101, Training Site.
   ⚠️ THIS IS NOT THE SAME LIST AS THE ONE ABOVE, and the difference is real:
   it carries `leadership director` and NOT plain `director`. Nobody asked for
   `director` here, so nobody added it. Do not "align" these two lists without
   a decision — they are different questions about different tools. */
export const TRAINING_ADMIN_ROLES = Object.freeze([
  "owner",
  "owner/operator",
  "executive director",
  "executive director | hr",
  "human resources",
  "leadership development director",
  "leadership director",
]);
