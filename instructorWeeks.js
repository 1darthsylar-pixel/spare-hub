/**
 * instructorWeeks.js — which weeks of a class have instructors.
 *
 * ★ LEAF MODULE. Imports NOTHING, and that is the entire reason it exists as a
 * file. This rule used to live in l101Instructors.js beside `loadAssignments`,
 * which imports store.js, which reads `import.meta.env` — so the rule could not
 * be imported from Node and could not be tested. It decides whether an assigned
 * instructor sees the class at all, including the answer keys, which is far too
 * much to leave unprovable.
 *
 * ⚠️ l101Instructors.js RE-EXPORTS EVERYTHING BELOW, so every existing importer
 * is untouched and there is still ONE definition.
 */

export const INSTRUCTOR_WEEKS = new Set(["w2", "w3", "tpl-w2", "tpl-w3"]);

/* ★★ THE TEMPLATE CARRIES INSTRUCTOR NOTES ON EVERY WEEK (Bri, Aug 11 2026:
   "I need instructor notes and assignments to be available on all modules in
   the L101 template. I am making in person versions of the W1 and W4 classes
   and need to have these functions available on all modules — including copied
   weeks.")

   ⚠️⚠️ A SET COULD NEVER HAVE ANSWERED THIS. The set above is four fixed ids.
   A week Bri creates today gets a generated key (`wkmso0kydv6o9`), so it can
   never be in a list written yesterday — the feature was structurally unable to
   reach the weeks she was making. That is why this is a RULE and not another
   entry.

   ⚠️⚠️ AND THE WEEK ID ALONE CANNOT DECIDE IT. Both programs mint the same
   `wk…` shape from `addWeek`, so `wkmsku2vax772` (her live Week 5) and
   `wkmsnebnj6uq` (the template's) are indistinguishable by id. The NAMESPACE is
   the only thing that separates them, which is why callers pass it. Guessing
   from the id would have switched the system on across her live class, which
   she did not ask for — her original spec was "For my W2 and W3 classes".

   ⚠️ THE LIVE CLASS IS UNCHANGED: still exactly W2 and W3, still by the set.
   ⚠️ NO `ns` FALLS BACK TO THE SET, so any caller not yet passing one behaves
   exactly as it did before this function existed. */
export const isTemplateNs = (ns) => String(ns || "").split(":").pop() === "l101tpl";

/* Does anybody hold an instructor assignment on this week? */
export const weekHasAssignees = (map, weekId) =>
  Array.isArray(map && map[String(weekId || "")]) && map[String(weekId || "")].length > 0;

/* ⚠️⚠️ THE ASSIGNMENT IS THE SWITCH, AND UNTIL Aug 19 2026 IT WAS NOT.
   Bri: "still need to solve Brandon and Daisy (and any other assigned
   instructors) being able to gain automatic access to the instructor view until
   removed. They need to be able to view any answer keys as well for matching
   activities or quizzes if assigned as an instructor."

   ⛔ WHAT WAS ACTUALLY WRONG. In the live class this answered from
   `INSTRUCTOR_WEEKS` alone — four fixed ids, W2 and W3. So assigning somebody
   to Week 1, Week 4, or any week Bri has created since did NOT give them the
   instructor view, the notes, or the answer keys. The assignment saved, the
   screen showed them as an instructor, and the thing being assigned did not
   arrive. Nothing errored, which is why it looked done.

   ⭐ AND THE COMMENT ABOVE ALREADY SAID WHY: "A SET COULD NEVER HAVE ANSWERED
   THIS. The set above is four fixed ids. A week Bri creates today gets a
   generated key, so it can never be in a list written yesterday." That was
   written about the TEMPLATE and it was just as true of the live class.

   ⇒ A WEEK WITH SOMEBODY ASSIGNED TO IT HAS INSTRUCTORS. That reaches every
   week, including ones that do not exist yet, and it needs no guessing from an
   id — which the note above rules out for good reason, because both programs
   mint the same `wk…` shape.
   ⚠️ THE SET STAYS AS THE BASELINE, NOT AS THE WHOLE ANSWER. W2 and W3 keep
   instructor notes and the print views with nobody assigned at all, which is
   what they do today and what Bri's original spec asked for. This only ADDS.
   ⚠️ NO MAP FALLS BACK TO THE SET, so any caller not yet passing one behaves
   exactly as it did before — the same rule the `ns` argument already follows. */
export const weekHasInstructors = (weekId, ns, assignMap) =>
  isTemplateNs(ns) ? true
    : (INSTRUCTOR_WEEKS.has(String(weekId || "")) || weekHasAssignees(assignMap, weekId));

